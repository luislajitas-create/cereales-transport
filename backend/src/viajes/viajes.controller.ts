import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateViajeDto } from "./dto/create-viaje.dto";
import { UpdateViajeDto } from "./dto/update-viaje.dto";
import { CambiarEstadoDto } from "./dto/cambiar-estado.dto";
import { CancelarViajeDto } from "./dto/cancelar-viaje.dto";

const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

const includeViaje = {
  cereal: true, cliente: true, productor: true, transportista: true, chofer: true,
  camion: true, acoplado: true, origen: true, destino: true,
};

const VIAJE_NO_ENCONTRADO = "Viaje no encontrado";

// Bloque 4.1: reglas de edición de Viaje según estado de facturación/liquidación.
// "observaciones" y "productorId" quedan siempre editables (no participan de ningún
// snapshot ni export de Factura/Liquidación) y por eso no aparecen en estas listas.
const CAMPOS_SIEMPRE_EDITABLES = ["observaciones", "productorId"];
const CAMPOS_BLOQUEADOS_FACTURACION = [
  "fecha", "cartaPorte", "ctg", "clienteId", "cerealId", "origenId", "destinoId",
  "transportistaId", "toneladas", "tarifaTonelada",
];
const CAMPOS_BLOQUEADOS_LIQUIDACION = [
  "fecha", "toneladas", "tarifaTonelada", "transportistaId", "choferId", "camionId",
  "acopladoId", "cerealId", "origenId", "destinoId",
];
const CAMPOS_COMPARABLES = [
  "fecha", "cartaPorte", "ctg", "cerealId", "clienteId", "productorId", "transportistaId",
  "choferId", "camionId", "acopladoId", "origenId", "destinoId", "toneladas", "tarifaTonelada",
  "observaciones",
];

function valorDistinto(campo: string, nuevo: any, actual: any): boolean {
  if (nuevo === undefined) return false;
  if (campo === "fecha") return new Date(nuevo).getTime() !== new Date(actual.fecha).getTime();
  if (campo === "toneladas" || campo === "tarifaTonelada") return Number(nuevo) !== actual[campo];
  return (nuevo || null) !== (actual[campo] || null);
}

function camposModificados(body: Record<string, any>, actual: any): string[] {
  return CAMPOS_COMPARABLES.filter((campo) => valorDistinto(campo, body[campo], actual));
}

// Condiciones repetidas entre update() (bloqueo de edición) y assertCancelacionPermitida()
// (bloqueo de cancelación) — centralizadas para no duplicar la comparación contra el enum.
function estaFacturado(viaje: any): boolean {
  return viaje.estadoFacturacion !== "PENDIENTE_DE_FACTURAR";
}

function estaLiquidado(viaje: any): boolean {
  return viaje.estadoLiquidacion !== "PENDIENTE";
}

// Filtra "modificados" contra "camposBloqueados" y agrega un mensaje a "mensajes" solo si
// alguno de los campos efectivamente cambiados está bloqueado — evita repetir en update()
// el mismo patrón "filtrar + ¿hay algo? + construir mensaje" para cada motivo de bloqueo.
function agregarBloqueoSiCorresponde(
  mensajes: string[],
  modificados: string[],
  camposBloqueados: string[],
  prefijo: string,
): void {
  const bloqueados = modificados.filter((campo) => camposBloqueados.includes(campo));
  if (bloqueados.length > 0) {
    mensajes.push(`${prefijo} ${bloqueados.join(", ")}.`);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("viajes")
export class ViajesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("estado") estado?: string,
    @Query("cerealId") cerealId?: string,
  ) {
    const where: any = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    if (clienteId) where.clienteId = clienteId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (estado) where.estado = estado;
    if (cerealId) where.cerealId = cerealId;

    return this.prisma.viaje.findMany({ where, include: includeViaje, orderBy: { fecha: "desc" } });
  }

  @Get("pendientes-facturar")
  async pendientesFacturar(@Query("clienteId") clienteId?: string) {
    return this.prisma.viaje.findMany({
      where: {
        estado: "DESCARGADO",
        estadoFacturacion: "PENDIENTE_DE_FACTURAR",
        ...(clienteId ? { clienteId } : {}),
      },
      include: includeViaje,
      orderBy: { fecha: "asc" },
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const viaje = await this.prisma.viaje.findUnique({
      where: { id },
      include: {
        ...includeViaje,
        historial: { orderBy: { fecha: "asc" }, include: { usuario: true } },
        anticipos: { include: { tipoGasto: true } },
        liquidacionesViaje: { include: { liquidacion: true } },
        facturaViaje: { include: { factura: true } },
      },
    });
    if (!viaje) throw new NotFoundException(VIAJE_NO_ENCONTRADO);
    return viaje;
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateViajeDto, @CurrentUser() user: any) {
    const importeTotal = Number(body.toneladas) * Number(body.tarifaTonelada);
    const viaje = await this.prisma.viaje.create({
      data: {
        fecha: new Date(body.fecha),
        cartaPorte: body.cartaPorte,
        ctg: body.ctg,
        cerealId: body.cerealId,
        clienteId: body.clienteId,
        productorId: body.productorId || null,
        transportistaId: body.transportistaId,
        choferId: body.choferId,
        camionId: body.camionId,
        acopladoId: body.acopladoId || null,
        origenId: body.origenId,
        destinoId: body.destinoId,
        toneladas: Number(body.toneladas),
        tarifaTonelada: Number(body.tarifaTonelada),
        importeTotal,
        observaciones: body.observaciones || null,
        creadoPorId: user?.id || null,
      },
      include: includeViaje,
    });
    await this.prisma.historialEstadoViaje.create({
      data: { viajeId: viaje.id, estadoAnterior: null, estadoNuevo: "PENDIENTE", usuarioId: user?.id || null },
    });
    return viaje;
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateViajeDto) {
    const actual = await this.prisma.viaje.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException(VIAJE_NO_ENCONTRADO);

    const modificados = camposModificados(body as Record<string, any>, actual);

    if (actual.estado === "CANCELADO") {
      const rechazados = modificados.filter((c) => !CAMPOS_SIEMPRE_EDITABLES.includes(c));
      if (rechazados.length > 0) {
        throw new BadRequestException(
          `No se puede editar el viaje: está cancelado. Solo se puede modificar "observaciones" y "productorId". Campos rechazados: ${rechazados.join(", ")}.`,
        );
      }
    }

    const mensajes: string[] = [];
    if (estaFacturado(actual)) {
      agregarBloqueoSiCorresponde(
        mensajes, modificados, CAMPOS_BLOQUEADOS_FACTURACION,
        `No se puede editar el viaje: ya está facturado (estado de facturación: ${actual.estadoFacturacion}). Anule la factura asociada para poder editar:`,
      );
    }
    if (estaLiquidado(actual)) {
      agregarBloqueoSiCorresponde(
        mensajes, modificados, CAMPOS_BLOQUEADOS_LIQUIDACION,
        `No se puede editar el viaje: ya está liquidado (estado de liquidación: ${actual.estadoLiquidacion}). Anule la liquidación asociada para poder editar:`,
      );
    }
    if (mensajes.length > 0) {
      throw new BadRequestException(mensajes.join(" "));
    }

    const data: any = { ...body };
    delete data.estado;
    if (data.toneladas || data.tarifaTonelada) {
      const toneladas = Number(data.toneladas ?? actual.toneladas);
      const tarifa = Number(data.tarifaTonelada ?? actual.tarifaTonelada);
      data.toneladas = toneladas;
      data.tarifaTonelada = tarifa;
      data.importeTotal = toneladas * tarifa;
    }
    if (data.fecha) data.fecha = new Date(data.fecha);
    return this.prisma.viaje.update({ where: { id }, data, include: includeViaje });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post(":id/estado")
  async cambiarEstado(@Param("id") id: string, @Body() body: CambiarEstadoDto, @CurrentUser() user: any) {
    const viaje = await this.prisma.viaje.findUnique({ where: { id } });
    if (!viaje) throw new NotFoundException(VIAJE_NO_ENCONTRADO);
    if (viaje.estado === "CANCELADO") throw new BadRequestException("El viaje está cancelado");

    const nuevo = body.estado;
    if (nuevo === "CANCELADO") {
      ViajesController.assertCancelacionPermitida(viaje);
      return this.aplicarCambioEstado(viaje, "CANCELADO", user);
    }
    const idxActual = ORDEN_ESTADOS.indexOf(viaje.estado);
    const idxNuevo = ORDEN_ESTADOS.indexOf(nuevo);
    if (idxNuevo === -1) throw new BadRequestException("Estado inválido");
    if (idxNuevo !== idxActual + 1) {
      throw new BadRequestException(
        `No se puede pasar de ${viaje.estado} a ${nuevo} directamente. El siguiente estado válido es ${ORDEN_ESTADOS[idxActual + 1] || "ninguno"}.`,
      );
    }
    return this.aplicarCambioEstado(viaje, nuevo, user);
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post(":id/cancelar")
  async cancelar(@Param("id") id: string, @Body() body: CancelarViajeDto, @CurrentUser() user: any) {
    const viaje = await this.prisma.viaje.findUnique({ where: { id } });
    if (!viaje) throw new NotFoundException(VIAJE_NO_ENCONTRADO);
    ViajesController.assertCancelacionPermitida(viaje);
    return this.aplicarCambioEstado(viaje, "CANCELADO", user, body.motivo);
  }

  // No usa `this` (no depende de estado de instancia): static por legibilidad, para que
  // quede claro en la firma que es una validación pura sobre el `viaje` recibido.
  private static assertCancelacionPermitida(viaje: any) {
    if (viaje.estado === "CANCELADO") {
      throw new BadRequestException("El viaje ya está cancelado.");
    }
    const mensajes: string[] = [];
    if (estaFacturado(viaje)) {
      mensajes.push(
        `No se puede cancelar el viaje: está facturado (estado de facturación: ${viaje.estadoFacturacion}). Anule la factura asociada primero.`,
      );
    }
    if (estaLiquidado(viaje)) {
      mensajes.push(
        `No se puede cancelar el viaje: está liquidado (estado de liquidación: ${viaje.estadoLiquidacion}). Anule la liquidación asociada primero.`,
      );
    }
    if (mensajes.length > 0) {
      throw new BadRequestException(mensajes.join(" "));
    }
  }

  private async aplicarCambioEstado(viaje: any, nuevo: string, user: any, motivo?: string) {
    const actualizado = await this.prisma.viaje.update({
      where: { id: viaje.id },
      data: { estado: nuevo as any },
      include: includeViaje,
    });
    await this.prisma.historialEstadoViaje.create({
      data: {
        viajeId: viaje.id,
        estadoAnterior: viaje.estado,
        estadoNuevo: nuevo + (motivo ? ` (motivo: ${motivo})` : ""),
        usuarioId: user?.id || null,
      },
    });
    return actualizado;
  }
}

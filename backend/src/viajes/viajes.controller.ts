import {
  Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateViajeDto } from "./dto/create-viaje.dto";
import { UpdateViajeDto } from "./dto/update-viaje.dto";
import { CambiarEstadoDto } from "./dto/cambiar-estado.dto";
import { CancelarViajeDto } from "./dto/cancelar-viaje.dto";

const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

const includeViaje = {
  cereal: true, cliente: true, productor: true, transportista: true, chofer: true,
  camion: true, acoplado: true, origen: true, destino: true,
};

// Listado Operativo, Bloque L1 (AUDITORIA_VIAJES2.0_LISTADO.md, hallazgo H-1): findAll() usaba
// el mismo includeViaje que create()/update()/findOne() — 9 relaciones completas, cuando
// Viajes.tsx solo lee estos campos puntuales (ver la tabla de la sección 1 de esa auditoría).
// Las demás rutas (pendientes-facturar, findOne, create, update, cambiarEstado, cancelar) siguen
// usando includeViaje sin cambios — quedan fuera de este bloque.
const selectViajeListado = {
  id: true,
  numeroViaje: true,
  fecha: true,
  ctg: true,
  toneladas: true,
  importeTotal: true,
  estado: true,
  cereal: { select: { nombre: true } },
  cliente: { select: { razonSocial: true } },
  transportista: { select: { razonSocial: true } },
  origen: { select: { nombre: true } },
  destino: { select: { nombre: true } },
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
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  async findAll(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("estado") estado?: string,
    @Query("cerealId") cerealId?: string,
    @Query("q") q?: string,
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
    // Listado Operativo, Bloque L2 (AUDITORIA_DISENO_VIAJES2.0_L2_BUSQUEDA.md, Paso 1, ajustado
    // tras validación): "q" se combina con AND respecto a los filtros de arriba (es una clave
    // más del mismo "where"). Si "q" es puramente numérico, un texto corto (1-3 dígitos) casi
    // siempre corresponde a un N° de Viaje que el usuario ya conoce — buscarlo además como
    // substring de CTG/Carta de Porte generaba ruido (p. ej. "3" matcheaba cualquier CTG que
    // tuviera un "3" en cualquier posición). Por eso, con q numérico de menos de 4 caracteres se
    // busca únicamente por igualdad exacta de numeroViaje; con 4 o más, se agrega también el
    // contains de CTG/Carta de Porte (ya no hay ambigüedad real con un número tan específico).
    if (q && q.trim()) {
      const texto = q.trim();
      const esNumerico = /^\d+$/.test(texto);
      if (esNumerico) {
        where.OR = [
          { numeroViaje: Number(texto) },
          ...(texto.length >= 4
            ? [
                { ctg: { contains: texto, mode: "insensitive" } },
                { cartaPorte: { contains: texto, mode: "insensitive" } },
              ]
            : []),
        ];
      } else {
        where.OR = [
          { ctg: { contains: texto, mode: "insensitive" } },
          { cartaPorte: { contains: texto, mode: "insensitive" } },
        ];
      }
    }

    return this.prisma.viaje.findMany({ where, select: selectViajeListado, orderBy: { fecha: "desc" } });
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
        facturasViaje: { include: { factura: true } },
      },
    });
    if (!viaje) throw new NotFoundException(VIAJE_NO_ENCONTRADO);
    return viaje;
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateViajeDto, @CurrentUser() user: any) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: body.clienteId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado.");
    if (!cliente.activo) {
      throw new BadRequestException("El cliente seleccionado está dado de baja. Reactívelo antes de crear el viaje.");
    }

    const transportista = await this.prisma.transportista.findUnique({ where: { id: body.transportistaId } });
    if (!transportista) throw new NotFoundException("Transportista no encontrado.");
    if (!transportista.activo) {
      throw new BadRequestException("El transportista seleccionado está dado de baja. Reactívelo antes de crear el viaje.");
    }

    const chofer = await this.prisma.chofer.findUnique({ where: { id: body.choferId } });
    if (!chofer) throw new NotFoundException("Chofer no encontrado.");
    if (!chofer.activo) {
      throw new BadRequestException("El chofer seleccionado está dado de baja. Reactívelo antes de crear el viaje.");
    }

    const camion = await this.prisma.vehiculo.findUnique({ where: { id: body.camionId } });
    if (!camion) throw new NotFoundException("Vehículo (camión) no encontrado.");
    if (!camion.activo) {
      throw new BadRequestException("El camión seleccionado está dado de baja. Reactívelo antes de crear el viaje.");
    }

    if (body.acopladoId) {
      const acoplado = await this.prisma.vehiculo.findUnique({ where: { id: body.acopladoId } });
      if (!acoplado) throw new NotFoundException("Vehículo (acoplado) no encontrado.");
      if (!acoplado.activo) {
        throw new BadRequestException("El acoplado seleccionado está dado de baja. Reactívelo antes de crear el viaje.");
      }
    }

    const importeTotal = Number(body.toneladas) * Number(body.tarifaTonelada);
    // Hardening (First Trip): antes eran dos escrituras secuenciales sin transacción — un
    // fallo entre ambas podía dejar un Viaje real sin su primer HistorialEstadoViaje. Mismo
    // patrón $transaction ya usado en el resto del proyecto (liquidaciones.controller.ts,
    // facturas.controller.ts, grupo-economico/*) — la extensión de aislamiento por
    // organización se propaga dentro de "tx" (ver organizacion-prisma.client.ts).
    const viaje = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.viaje.create({
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
      await tx.historialEstadoViaje.create({
        data: { viajeId: creado.id, estadoAnterior: null, estadoNuevo: "PENDIENTE", usuarioId: user?.id || null },
      });
      return creado;
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
    // Núcleo Viajes 2.0, Tarea 2: create() ya normaliza acopladoId/productorId ("" -> null)
    // antes de escribir (ver create() más arriba); update() no lo hacía. Sin esto, el formulario
    // de edición enviando "" para "Sin acoplado"/"Sin productor" rompía la FK contra Vehiculo/
    // Productor en vez de guardar null. No cambia ninguna regla de negocio: mismo criterio que
    // ya existía en create(), aplicado acá para que el mismo formulario sirva para editar.
    if (data.acopladoId !== undefined) data.acopladoId = data.acopladoId || null;
    if (data.productorId !== undefined) data.productorId = data.productorId || null;
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
    // Núcleo Viajes 2.0, Tarea 1: mismo criterio que create() (ver comentario de Hardening más
    // arriba) — antes eran dos escrituras sin transacción; un fallo entre ambas podía dejar el
    // Viaje en su nuevo estado sin la fila de HistorialEstadoViaje que lo explica.
    //
    // RC1.2 (AUDITORIA_VIAJES2.0_RC1.md, H-2): `viaje.estado` llega desde una lectura hecha
    // *antes* de esta transacción (en cambiarEstado()/cancelar()), no protegida por ningún lock.
    // Si dos requests concurrentes leen el mismo estado y ambas pasan la validación del método
    // que llama a este, el `tx.viaje.update({ where: { id } })` original no condicionaba el
    // `where` al estado esperado — ambas escrituras podían aplicarse, dejando dos filas de
    // historial para una sola transición lógica. Se reemplaza por el mismo patrón `updateMany` +
    // `count === 0` que ya usan facturas.controller.ts/liquidaciones.controller.ts: si el estado
    // real ya no coincide con el que esta llamada esperaba (porque otra request ganó la carrera),
    // `count` da 0, se aborta con un mensaje explícito y la transacción completa se revierte —
    // no queda ninguna fila de historial huérfana.
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.viaje.updateMany({
        where: { id: viaje.id, estado: viaje.estado },
        data: { estado: nuevo as any },
      });
      if (count === 0) {
        throw new BadRequestException(
          "El viaje fue modificado por otra operación en curso. Actualice la página e intente nuevamente.",
        );
      }
      await tx.historialEstadoViaje.create({
        data: {
          viajeId: viaje.id,
          estadoAnterior: viaje.estado,
          estadoNuevo: nuevo + (motivo ? ` (motivo: ${motivo})` : ""),
          usuarioId: user?.id || null,
        },
      });
      // H-7 (AUDITORIA_VIAJES2.0_RC1.md, §17): antes devolvía el Viaje completo (includeViaje,
      // 9 relaciones). Único caller real de este resultado es la respuesta HTTP de
      // cambiarEstado()/cancelar() — auditado: ningún consumidor (Viajes.tsx, ViajeDetalle.tsx,
      // ni ningún test backend) lee más que "estado" de esta respuesta; ViajeDetalle.tsx ni
      // siquiera la lee, siempre vuelve a pedir el Viaje completo vía GET /viajes/:id después.
      return tx.viaje.findUnique({ where: { id: viaje.id }, select: { id: true, estado: true } });
    });
  }
}

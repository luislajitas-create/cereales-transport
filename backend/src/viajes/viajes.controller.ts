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
        liquidacionViaje: { include: { liquidacion: true } },
        facturaViaje: { include: { factura: true } },
      },
    });
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
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
    const data: any = { ...body };
    delete data.estado;
    if (data.toneladas || data.tarifaTonelada) {
      const actual = await this.prisma.viaje.findUnique({ where: { id } });
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
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
    if (viaje.estado === "CANCELADO") throw new BadRequestException("El viaje está cancelado");

    const nuevo = body.estado;
    if (nuevo === "CANCELADO") {
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
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
    return this.aplicarCambioEstado(viaje, "CANCELADO", user, body.motivo);
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

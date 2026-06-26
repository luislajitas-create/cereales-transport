import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

const includeAnticipo = {
  chofer: true,
  transportista: true,
  tipoGasto: true,
  viaje: { select: { id: true, numeroViaje: true, ctg: true, fecha: true } },
  usuario: { select: { id: true, nombre: true } },
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("anticipos")
export class AnticiposController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("choferId") choferId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("liquidado") liquidado?: string,
    @Query("anulado") anulado?: string,
  ) {
    const where: any = {};
    if (choferId) where.choferId = choferId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (liquidado !== undefined) where.liquidado = liquidado === "true";
    if (anulado !== undefined) where.anulado = anulado === "true";
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    return this.prisma.anticipoGasto.findMany({
      where,
      include: includeAnticipo,
      orderBy: { fecha: "desc" },
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const anticipo = await this.prisma.anticipoGasto.findUnique({
      where: { id },
      include: includeAnticipo,
    });
    if (!anticipo) throw new NotFoundException("Anticipo/gasto no encontrado");
    return anticipo;
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (!body.choferId || !body.transportistaId || !body.tipoGastoId) {
      throw new BadRequestException("choferId, transportistaId y tipoGastoId son obligatorios");
    }
    return this.prisma.anticipoGasto.create({
      data: {
        viajeId: body.viajeId || null,
        choferId: body.choferId,
        transportistaId: body.transportistaId,
        tipoGastoId: body.tipoGastoId,
        fecha: new Date(body.fecha),
        importe: Number(body.importe),
        observaciones: body.observaciones || null,
        comprobanteUrl: body.comprobanteUrl || null,
        usuarioId: user?.id || null,
      },
      include: includeAnticipo,
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const actual = await this.prisma.anticipoGasto.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Anticipo/gasto no encontrado");
    if (actual.liquidado) {
      throw new BadRequestException("No se puede modificar un anticipo/gasto ya liquidado");
    }
    const data: any = { ...body };
    delete data.liquidado;
    delete data.anulado;
    delete data.anuladoMotivo;
    if (data.fecha) data.fecha = new Date(data.fecha);
    if (data.importe !== undefined) data.importe = Number(data.importe);
    return this.prisma.anticipoGasto.update({ where: { id }, data, include: includeAnticipo });
  }

  @Roles("LIQUIDACIONES", "OPERACIONES", "ADMINISTRADOR")
  @Post(":id/anular")
  async anular(@Param("id") id: string, @Body() body: { motivo: string }) {
    const actual = await this.prisma.anticipoGasto.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Anticipo/gasto no encontrado");
    if (actual.liquidado) {
      throw new BadRequestException("No se puede anular un anticipo/gasto ya liquidado");
    }
    if (!body?.motivo) throw new BadRequestException("Debe indicar un motivo de anulación");
    return this.prisma.anticipoGasto.update({
      where: { id },
      data: { anulado: true, anuladoMotivo: body.motivo },
      include: includeAnticipo,
    });
  }
}

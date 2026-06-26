import {
  Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";

const includeFactura = {
  cliente: true,
  viajes: { include: { viaje: { include: { cereal: true, origen: true, destino: true, transportista: true } } } },
  cobranzas: { orderBy: { fecha: "asc" as const } },
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("facturas")
export class FacturasController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("clienteId") clienteId?: string,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const where: any = {};
    if (clienteId) where.clienteId = clienteId;
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    return this.prisma.factura.findMany({ where, include: includeFactura, orderBy: { fecha: "desc" } });
  }

  // Conciliación: compara, por cliente y período, los viajes DESCARGADOS (realizados)
  // contra los viajes efectivamente facturados, para detectar viajes pendientes de facturar.
  @Get("conciliacion")
  async conciliacion(
    @Query("clienteId") clienteId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const whereViaje: any = { estado: "DESCARGADO" };
    if (clienteId) whereViaje.clienteId = clienteId;
    if (desde || hasta) {
      whereViaje.fecha = {};
      if (desde) whereViaje.fecha.gte = new Date(desde);
      if (hasta) whereViaje.fecha.lte = new Date(hasta);
    }

    const viajes = await this.prisma.viaje.findMany({
      where: whereViaje,
      include: { cliente: true, cereal: true, origen: true, destino: true, facturaViaje: true },
      orderBy: { fecha: "asc" },
    });

    const porCliente = new Map<string, any>();
    for (const v of viajes) {
      const key = v.clienteId;
      if (!porCliente.has(key)) {
        porCliente.set(key, {
          clienteId: v.clienteId,
          cliente: v.cliente.razonSocial,
          toneladasRealizadas: 0,
          importeRealizado: 0,
          toneladasFacturadas: 0,
          importeFacturado: 0,
          viajesPendientes: [] as any[],
        });
      }
      const acc = porCliente.get(key);
      acc.toneladasRealizadas += v.toneladas;
      acc.importeRealizado += v.importeTotal;
      if (v.facturaViaje) {
        acc.toneladasFacturadas += v.toneladas;
        acc.importeFacturado += v.importeTotal;
      } else {
        acc.viajesPendientes.push({
          id: v.id,
          numeroViaje: v.numeroViaje,
          fecha: v.fecha,
          ctg: v.ctg,
          cereal: v.cereal.nombre,
          origen: v.origen.nombre,
          destino: v.destino.nombre,
          toneladas: v.toneladas,
          importeTotal: v.importeTotal,
        });
      }
    }

    return Array.from(porCliente.values()).map((r) => ({
      ...r,
      diferenciaToneladas: r.toneladasRealizadas - r.toneladasFacturadas,
      diferenciaImporte: r.importeRealizado - r.importeFacturado,
    }));
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const factura = await this.prisma.factura.findUnique({ where: { id }, include: includeFactura });
    if (!factura) throw new NotFoundException("Factura no encontrada");
    return factura;
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: any) {
    const { clienteId, numero, fecha, vencimiento, viajeIds } = body;
    if (!clienteId || !numero || !fecha || !vencimiento) {
      throw new BadRequestException("clienteId, numero, fecha y vencimiento son obligatorios");
    }
    if (!Array.isArray(viajeIds) || viajeIds.length === 0) {
      throw new BadRequestException("Debe incluir al menos un viaje");
    }

    const viajes = await this.prisma.viaje.findMany({
      where: {
        id: { in: viajeIds },
        clienteId,
        estado: "DESCARGADO",
        estadoFacturacion: "PENDIENTE_DE_FACTURAR",
      },
    });
    if (viajes.length !== viajeIds.length) {
      throw new BadRequestException(
        "Alguno de los viajes seleccionados no existe, no está DESCARGADO, ya fue facturado o no corresponde al cliente indicado",
      );
    }

    const importe = viajes.reduce((acc, v) => acc + v.importeTotal, 0);

    return this.prisma.$transaction(async (tx) => {
      const factura = await tx.factura.create({
        data: {
          clienteId,
          numero,
          fecha: new Date(fecha),
          vencimiento: new Date(vencimiento),
          importe,
        },
      });
      for (const v of viajes) {
        await tx.facturaViaje.create({
          data: { facturaId: factura.id, viajeId: v.id, importeViaje: v.importeTotal },
        });
        await tx.viaje.update({ where: { id: v.id }, data: { estadoFacturacion: "FACTURADO" } });
      }
      return tx.factura.findUnique({ where: { id: factura.id }, include: includeFactura });
    });
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post(":id/anular")
  async anular(@Param("id") id: string) {
    const factura = await this.prisma.factura.findUnique({ where: { id }, include: { viajes: true, cobranzas: true } });
    if (!factura) throw new NotFoundException("Factura no encontrada");
    if (factura.cobranzas.length > 0) {
      throw new BadRequestException("No se puede anular una factura con cobranzas registradas");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.factura.update({ where: { id }, data: { estado: "ANULADO" } });
      for (const fv of factura.viajes) {
        await tx.viaje.update({ where: { id: fv.viajeId }, data: { estadoFacturacion: "PENDIENTE_DE_FACTURAR" } });
      }
      return tx.factura.findUnique({ where: { id }, include: includeFactura });
    });
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post(":id/cobranzas")
  async registrarCobranza(@Param("id") id: string, @Body() body: any) {
    const factura = await this.prisma.factura.findUnique({ where: { id }, include: { cobranzas: true } });
    if (!factura) throw new NotFoundException("Factura no encontrada");
    if (factura.estado === "ANULADO") throw new BadRequestException("La factura está anulada");
    if (!body.fecha || body.importe === undefined) {
      throw new BadRequestException("fecha e importe son obligatorios");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.cobranza.create({
        data: {
          facturaId: id,
          fecha: new Date(body.fecha),
          importe: Number(body.importe),
          medioPago: body.medioPago || null,
          observacion: body.observacion || null,
        },
      });
      const cobranzas = await tx.cobranza.findMany({ where: { facturaId: id } });
      const totalCobrado = cobranzas.reduce((acc, c) => acc + c.importe, 0);
      const nuevoEstado = totalCobrado >= factura.importe ? "COBRADO_TOTAL" : totalCobrado > 0 ? "COBRADO_PARCIAL" : "FACTURADO";
      await tx.factura.update({ where: { id }, data: { estado: nuevoEstado as any } });
      return tx.factura.findUnique({ where: { id }, include: includeFactura });
    });
  }
}

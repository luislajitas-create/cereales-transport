import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { calcularRentabilidad, ViajeEntrada } from "./reportes/rentabilidad.calc";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia")
export class InteligenciaController {
  constructor(private prisma: PrismaService) {}

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("rentabilidad")
  async rentabilidad(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
  ) {
    if (!desde || !hasta) {
      throw new BadRequestException("desde y hasta son obligatorios");
    }
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);

    const where: any = {
      estado: "DESCARGADO",
      fecha: { gte: fechaDesde, lte: fechaHasta },
    };
    if (clienteId) where.clienteId = clienteId;
    if (transportistaId) where.transportistaId = transportistaId;

    // Filtro de vigencia obligatorio (BLOQUE7.3.1_DISENO_RENTABILIDAD.md, sección 4):
    // solo se traen filas de FacturaViaje/LiquidacionViaje cuyo documento padre no esté
    // anulado — un viaje con Factura o Liquidación anulada y no reemitida no debe
    // aparecer con datos, sino en viajesIncompletos (calculado por reportes/rentabilidad.calc.ts).
    const viajes = await this.prisma.viaje.findMany({
      where,
      select: {
        id: true,
        numeroViaje: true,
        fecha: true,
        clienteId: true,
        cliente: { select: { razonSocial: true } },
        transportistaId: true,
        transportista: { select: { razonSocial: true } },
        facturasViaje: {
          where: { factura: { estado: { not: "ANULADO" } } },
          select: { importeViaje: true, factura: { select: { fecha: true } } },
        },
        liquidacionesViaje: {
          where: { liquidacion: { estado: { not: "ANULADA" } } },
          select: { totalViaje: true, liquidacion: { select: { createdAt: true } } },
        },
      },
      orderBy: { fecha: "asc" },
    });

    const entrada: ViajeEntrada[] = viajes.map((v) => ({
      id: v.id,
      numeroViaje: v.numeroViaje,
      fecha: v.fecha,
      clienteId: v.clienteId,
      cliente: v.cliente.razonSocial,
      transportistaId: v.transportistaId,
      transportista: v.transportista.razonSocial,
      facturasVigentes: v.facturasViaje.map((fv) => ({ importeViaje: fv.importeViaje, fecha: fv.factura.fecha })),
      liquidacionesVigentes: v.liquidacionesViaje.map((lv) => ({ totalViaje: lv.totalViaje, fecha: lv.liquidacion.createdAt })),
    }));

    const resultado = calcularRentabilidad(entrada);
    return { periodo: { desde, hasta }, ...resultado };
  }
}

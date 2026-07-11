import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { calcularRentabilidad, ViajeEntrada, ResultadoRentabilidad } from "./reportes/rentabilidad.calc";

// Extraído de InteligenciaController (Bloque 7.3.4) para que Dashboard Ejecutivo pueda
// reutilizar el mismo resultado sin consultar Prisma por su cuenta — mismo comportamiento,
// misma consulta, que antes vivía inline en el controller.
@Injectable()
export class RentabilidadService {
  constructor(private prisma: PrismaService) {}

  async calcular(fechaDesde: Date, fechaHasta: Date, clienteId?: string, transportistaId?: string): Promise<ResultadoRentabilidad> {
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

    return calcularRentabilidad(entrada);
  }
}

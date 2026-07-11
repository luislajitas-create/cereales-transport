import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { calcularAging, FacturaEntrada, ResultadoAging } from "./reportes/aging.calc";

// Extraído de AgingController (Bloque 7.3.4) — mismo comportamiento, misma consulta, que
// antes vivía inline en el controller. Dashboard Ejecutivo lo reutiliza sin tocar Prisma.
@Injectable()
export class AgingService {
  constructor(private prisma: PrismaService) {}

  async calcular(clienteId: string | undefined, periodoDesde: Date, periodoHasta: Date, hoy: Date): Promise<ResultadoAging> {
    // Filtro de vigencia obligatorio (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, sección 4):
    // la cartera de aging nunca se filtra por período, solo por vigencia y, opcionalmente,
    // por cliente — el período se usa exclusivamente para los dos indicadores de DSO.
    const where: any = { estado: { not: "ANULADO" } };
    if (clienteId) where.clienteId = clienteId;

    const facturas = await this.prisma.factura.findMany({
      where,
      select: {
        id: true,
        numero: true,
        fecha: true,
        vencimiento: true,
        importe: true,
        estado: true,
        clienteId: true,
        cliente: { select: { razonSocial: true } },
        cobranzas: {
          where: { anulada: false },
          select: { importe: true, fecha: true },
        },
      },
      orderBy: { vencimiento: "asc" },
    });

    const entrada: FacturaEntrada[] = facturas.map((f) => ({
      id: f.id,
      numero: f.numero,
      fecha: f.fecha,
      vencimiento: f.vencimiento,
      importe: f.importe,
      estado: f.estado,
      clienteId: f.clienteId,
      cliente: f.cliente.razonSocial,
      cobranzasVigentes: f.cobranzas.map((c) => ({ importe: c.importe, fecha: c.fecha })),
    }));

    return calcularAging(entrada, periodoDesde, periodoHasta, hoy);
  }
}

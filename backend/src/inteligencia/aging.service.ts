import { Inject, Injectable } from "@nestjs/common";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { calcularAging, FacturaEntrada, ResultadoAging } from "./reportes/aging.calc";

// Extraído de AgingController (Bloque 7.3.4) — mismo comportamiento, misma consulta, que
// antes vivía inline en el controller. Dashboard Ejecutivo lo reutiliza sin tocar Prisma.

// Bloque 7.3.4.1 — fetch + mapeo de Factura→FacturaEntrada, reutilizado también por
// AlertasService (regla 8, BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md). `orderBy` es opcional a
// propósito: AgingService lo necesita, AlertasService no y no debe heredarlo.
export async function obtenerFacturasEntrada(prisma: OrganizacionPrismaClient, where: any, orderBy?: any): Promise<FacturaEntrada[]> {
  const facturas = await prisma.factura.findMany({
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
    ...(orderBy ? { orderBy } : {}),
  });

  return facturas.map((f) => ({
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
}

@Injectable()
export class AgingService {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  async calcular(clienteId: string | undefined, periodoDesde: Date, periodoHasta: Date, hoy: Date): Promise<ResultadoAging> {
    // Filtro de vigencia obligatorio (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, sección 4):
    // la cartera de aging nunca se filtra por período, solo por vigencia y, opcionalmente,
    // por cliente — el período se usa exclusivamente para los dos indicadores de DSO.
    const where: any = { estado: { not: "ANULADO" } };
    if (clienteId) where.clienteId = clienteId;

    const entrada = await obtenerFacturasEntrada(this.prisma, where, { vencimiento: "asc" });

    return calcularAging(entrada, periodoDesde, periodoHasta, hoy);
  }
}

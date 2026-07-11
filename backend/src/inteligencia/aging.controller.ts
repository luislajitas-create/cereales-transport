import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { calcularAging, FacturaEntrada } from "./reportes/aging.calc";
import { hoyNormalizado } from "./shared/fecha";

function primerDiaDelMes(referencia: Date): Date {
  const d = new Date(referencia);
  d.setDate(1);
  return d;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia/cobranzas")
export class AgingController {
  constructor(private prisma: PrismaService) {}

  @Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION")
  @Get("aging")
  async aging(
    @Query("clienteId") clienteId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const hoy = hoyNormalizado();
    const periodoDesde = desde ? new Date(desde) : primerDiaDelMes(hoy);
    const periodoHasta = hasta ? new Date(hasta) : hoy;

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

    const resultado = calcularAging(entrada, periodoDesde, periodoHasta, hoy);

    return {
      fechaCorte: hoy.toISOString().slice(0, 10),
      periodo: { desde: periodoDesde.toISOString().slice(0, 10), hasta: periodoHasta.toISOString().slice(0, 10) },
      ...resultado,
    };
  }
}

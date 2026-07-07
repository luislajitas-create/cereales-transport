import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get("resumen")
  async resumen() {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const hoy = new Date();

    const [
      viajesEnCurso,
      viajesMes,
      pendientesFacturar,
      facturasVencidas,
      liquidacionesPendientesPago,
      anticiposNoLiquidados,
    ] = await Promise.all([
      this.prisma.viaje.count({ where: { estado: { in: ["ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO"] } } }),
      this.prisma.viaje.findMany({ where: { fecha: { gte: inicioMes } }, select: { toneladas: true, importeTotal: true } }),
      this.prisma.viaje.aggregate({
        where: { estado: "DESCARGADO", estadoFacturacion: "PENDIENTE_DE_FACTURAR" },
        _count: { _all: true },
        _sum: { importeTotal: true },
      }),
      this.prisma.factura.findMany({
        where: { vencimiento: { lt: hoy }, estado: { in: ["FACTURADO", "COBRADO_PARCIAL"] } },
        include: { cliente: true, cobranzas: { where: { anulada: false } } },
      }),
      this.prisma.liquidacion.aggregate({
        where: { estado: "CONFIRMADA" },
        _count: { _all: true },
        _sum: { netoPagar: true },
      }),
      this.prisma.anticipoGasto.aggregate({
        where: { liquidado: false, anulado: false },
        _count: { _all: true },
        _sum: { importe: true },
      }),
    ]);

    const toneladasMes = viajesMes.reduce((acc, v) => acc + v.toneladas, 0);
    const importeMes = viajesMes.reduce((acc, v) => acc + v.importeTotal, 0);

    const facturasVencidasDetalle = facturasVencidas
      .map((f) => {
        const cobrado = f.cobranzas.reduce((acc, c) => acc + c.importe, 0);
        return {
          id: f.id,
          numero: f.numero,
          cliente: f.cliente.razonSocial,
          vencimiento: f.vencimiento,
          importe: f.importe,
          saldoPendiente: f.importe - cobrado,
        };
      })
      .filter((f) => f.saldoPendiente > 0);

    return {
      viajesEnCurso,
      viajesMes: { cantidad: viajesMes.length, toneladas: toneladasMes, importe: importeMes },
      pendientesFacturar: {
        cantidad: pendientesFacturar._count._all,
        importe: pendientesFacturar._sum.importeTotal || 0,
      },
      facturasVencidas: {
        cantidad: facturasVencidasDetalle.length,
        saldoPendiente: facturasVencidasDetalle.reduce((acc, f) => acc + f.saldoPendiente, 0),
        detalle: facturasVencidasDetalle,
      },
      liquidacionesPendientesPago: {
        cantidad: liquidacionesPendientesPago._count._all,
        importe: liquidacionesPendientesPago._sum.netoPagar || 0,
      },
      anticiposNoLiquidados: {
        cantidad: anticiposNoLiquidados._count._all,
        importe: anticiposNoLiquidados._sum.importe || 0,
      },
    };
  }
}

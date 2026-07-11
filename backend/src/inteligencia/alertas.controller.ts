import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { calcularAging, FacturaEntrada } from "./reportes/aging.calc";
import { calcularRentabilidad, ViajeEntrada } from "./reportes/rentabilidad.calc";
import { calcularAlertas, TipoAlerta, AnticipoEntrada, ViajeEstadoEntrada } from "./reportes/alertas.calc";
import { hoyNormalizado } from "./shared/fecha";

// Filtrado por rol (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 9) — siempre en backend, nunca
// según lo que el cliente HTTP pida. ADMINISTRADOR y GERENCIA ven las nueve categorías.
const TODOS_LOS_TIPOS: TipoAlerta[] = [
  "factura_vencida", "factura_proxima_vencer", "cliente_deuda_vencida", "concentracion_cliente",
  "anticipo_sin_liquidar", "chofer_anticipos_altos",
  "viaje_sin_facturar", "viaje_sin_liquidar", "viaje_estancado",
];

const TIPOS_POR_ROL: Record<string, TipoAlerta[]> = {
  ADMINISTRADOR: TODOS_LOS_TIPOS,
  GERENCIA: TODOS_LOS_TIPOS,
  FACTURACION: ["factura_vencida", "factura_proxima_vencer", "cliente_deuda_vencida", "concentracion_cliente", "viaje_sin_facturar"],
  LIQUIDACIONES: ["anticipo_sin_liquidar", "chofer_anticipos_altos", "viaje_sin_liquidar"],
  OPERACIONES: ["viaje_estancado"],
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia")
export class AlertasController {
  constructor(private prisma: PrismaService) {}

  @Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION", "LIQUIDACIONES", "OPERACIONES")
  @Get("alertas")
  async alertas(@CurrentUser() user: any) {
    const hoy = hoyNormalizado();

    const [facturas, viajesDescargados, anticipos, viajesEnCurso] = await Promise.all([
      // Mismo filtro de vigencia que AgingController (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 6).
      this.prisma.factura.findMany({
        where: { estado: { not: "ANULADO" } },
        select: {
          id: true, numero: true, fecha: true, vencimiento: true, importe: true, estado: true,
          clienteId: true, cliente: { select: { razonSocial: true } },
          cobranzas: { where: { anulada: false }, select: { importe: true, fecha: true } },
        },
      }),
      // Mismo filtro que InteligenciaController.rentabilidad(), sin acotar por período:
      // las alertas necesitan ver un viaje incompleto sin importar hace cuánto se descargó.
      this.prisma.viaje.findMany({
        where: { estado: "DESCARGADO" },
        select: {
          id: true, numeroViaje: true, fecha: true, clienteId: true, cliente: { select: { razonSocial: true } },
          transportistaId: true, transportista: { select: { razonSocial: true } },
          facturasViaje: {
            where: { factura: { estado: { not: "ANULADO" } } },
            select: { importeViaje: true, factura: { select: { fecha: true } } },
          },
          liquidacionesViaje: {
            where: { liquidacion: { estado: { not: "ANULADA" } } },
            select: { totalViaje: true, liquidacion: { select: { createdAt: true } } },
          },
        },
      }),
      // Primera lectura de AnticipoGasto desde el Motor (sección 6) — duplica, por ahora,
      // el mismo filtro que ya usa DashboardController (dashboard.controller.ts:41-45).
      this.prisma.anticipoGasto.findMany({
        where: { liquidado: false, anulado: false },
        select: { id: true, importe: true, fecha: true, choferId: true, chofer: { select: { nombre: true } } },
      }),
      // Primera lectura de HistorialEstadoViaje desde el Motor.
      this.prisma.viaje.findMany({
        where: { estado: { notIn: ["DESCARGADO", "CANCELADO"] } },
        select: {
          id: true, numeroViaje: true, estado: true,
          historial: { orderBy: { fecha: "desc" }, take: 1, select: { fecha: true } },
        },
      }),
    ]);

    const entradaFacturas: FacturaEntrada[] = facturas.map((f) => ({
      id: f.id, numero: f.numero, fecha: f.fecha, vencimiento: f.vencimiento, importe: f.importe, estado: f.estado,
      clienteId: f.clienteId, cliente: f.cliente.razonSocial,
      cobranzasVigentes: f.cobranzas.map((c) => ({ importe: c.importe, fecha: c.fecha })),
    }));
    // Aging se llama sin período real (alertas no lo necesitan, sección 5) — se pasa `hoy`
    // en ambos extremos porque DSO no se usa ni se expone acá.
    const aging = calcularAging(entradaFacturas, hoy, hoy, hoy);

    const entradaViajes: ViajeEntrada[] = viajesDescargados.map((v) => ({
      id: v.id, numeroViaje: v.numeroViaje, fecha: v.fecha, clienteId: v.clienteId, cliente: v.cliente.razonSocial,
      transportistaId: v.transportistaId, transportista: v.transportista.razonSocial,
      facturasVigentes: v.facturasViaje.map((fv) => ({ importeViaje: fv.importeViaje, fecha: fv.factura.fecha })),
      liquidacionesVigentes: v.liquidacionesViaje.map((lv) => ({ totalViaje: lv.totalViaje, fecha: lv.liquidacion.createdAt })),
    }));
    const rentabilidad = calcularRentabilidad(entradaViajes);

    const entradaAnticipos: AnticipoEntrada[] = anticipos.map((a) => ({
      id: a.id, importe: a.importe, fecha: a.fecha, choferId: a.choferId, chofer: a.chofer.nombre,
    }));

    const entradaViajesEnCurso: ViajeEstadoEntrada[] = viajesEnCurso
      .filter((v) => v.historial.length > 0)
      .map((v) => ({ id: v.id, numeroViaje: v.numeroViaje, estado: v.estado, fechaUltimoCambio: v.historial[0].fecha }));

    const resultado = calcularAlertas(aging, rentabilidad, entradaAnticipos, entradaViajesEnCurso, hoy);

    const tiposPermitidos = TIPOS_POR_ROL[user?.rol] || [];
    const alertasFiltradas = resultado.alertas.filter((a) => tiposPermitidos.includes(a.tipo));

    return {
      fechaCorte: hoy.toISOString().slice(0, 10),
      resumen: {
        total: alertasFiltradas.length,
        criticas: alertasFiltradas.filter((a) => a.severidad === "critica").length,
        preventivas: alertasFiltradas.filter((a) => a.severidad === "preventiva").length,
        informativas: alertasFiltradas.filter((a) => a.severidad === "informativa").length,
      },
      alertas: alertasFiltradas,
      viajesRentabilidadIncompleta: resultado.viajesRentabilidadIncompleta,
    };
  }
}

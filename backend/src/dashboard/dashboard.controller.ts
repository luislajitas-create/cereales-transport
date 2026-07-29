import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// Asistente de Puesta en Marcha — orden de prioridad para "siguientePaso", no alfabético ni
// arbitrario: Chofer y Vehiculo tienen transportistaId obligatorio (FK no nula, schema.prisma),
// así que ninguno de los dos puede cargarse antes que exista al menos un Transportista. El resto
// (clientes/cereales/ubicaciones) son independientes entre sí, se ordenan igual que en
// "requisitos" solo por previsibilidad.
const ORDEN_PRIORIDAD_ESTADO_OPERATIVO = [
  "transportistas",
  "choferes",
  "vehiculosCamion",
  "clientes",
  "cereales",
  "ubicaciones",
] as const;

type ClaveRequisitoOperativo = (typeof ORDEN_PRIORIDAD_ESTADO_OPERATIVO)[number];

@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  // Estado operativo calculado a partir de los datos reales, nunca persistido (decisión de
  // diseño explícita: un flag guardado puede desactualizarse en cualquier dirección — ej. si se
  // desactiva el único Chofer activo — sin que nada lo invalide). Reglas de conteo ya aprobadas:
  // Cliente/Transportista/Chofer/Vehiculo filtran por activo:true (un registro dado de baja no
  // sirve para crear un Viaje, viajes.controller.ts ya lo rechaza explícitamente); Vehiculo
  // exige además tipo:"CAMION" (camionId es el campo obligatorio del Viaje, acopladoId es
  // opcional); Cereal/Ubicacion no tienen campo activo en el schema, se cuentan sin filtro.
  @Get("estado-operativo")
  async estadoOperativo() {
    const [clientes, transportistas, choferes, vehiculosCamion, cereales, ubicaciones] = await Promise.all([
      this.prisma.cliente.count({ where: { activo: true } }),
      this.prisma.transportista.count({ where: { activo: true } }),
      this.prisma.chofer.count({ where: { activo: true } }),
      this.prisma.vehiculo.count({ where: { activo: true, tipo: "CAMION" } }),
      this.prisma.cereal.count(),
      this.prisma.ubicacion.count(),
    ]);

    const requisitos: Record<ClaveRequisitoOperativo, { cumplido: boolean; actual: number }> = {
      clientes: { cumplido: clientes >= 1, actual: clientes },
      transportistas: { cumplido: transportistas >= 1, actual: transportistas },
      choferes: { cumplido: choferes >= 1, actual: choferes },
      vehiculosCamion: { cumplido: vehiculosCamion >= 1, actual: vehiculosCamion },
      cereales: { cumplido: cereales >= 1, actual: cereales },
      ubicaciones: { cumplido: ubicaciones >= 2, actual: ubicaciones },
    };

    const claves = Object.keys(requisitos) as ClaveRequisitoOperativo[];
    const cantidadCumplidos = claves.filter((clave) => requisitos[clave].cumplido).length;
    const operativa = cantidadCumplidos === claves.length;
    const porcentaje = Math.round((cantidadCumplidos / claves.length) * 100);

    // "faltantes" en el mismo orden que ORDEN_PRIORIDAD_ESTADO_OPERATIVO — el primero de la
    // lista es, por construcción, "siguientePaso". Objetos con "codigo" (no strings sueltos) a
    // propósito: deja lugar para agregar campos (ej. un mensaje) sin romper el contrato.
    const faltantes = ORDEN_PRIORIDAD_ESTADO_OPERATIVO.filter((clave) => !requisitos[clave].cumplido).map(
      (codigo) => ({ codigo }),
    );
    const siguientePaso = faltantes[0]?.codigo ?? null;

    return { operativa, porcentaje, siguientePaso, requisitos, faltantes };
  }

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

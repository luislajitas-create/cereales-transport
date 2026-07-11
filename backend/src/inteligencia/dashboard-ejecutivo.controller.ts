import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { RentabilidadService } from "./rentabilidad.service";
import { AgingService } from "./aging.service";
import { AlertasService } from "./alertas.service";
import { hoyNormalizado, primerDiaDelMes } from "./shared/fecha";

const TOP_N = 5;
const ORDEN_SEVERIDAD: Record<string, number> = { critica: 0, preventiva: 1, informativa: 2 };

// Bloque 7.3.4 — el Dashboard Ejecutivo es un consumidor puro del Motor de Inteligencia:
// no consulta Prisma (usa RentabilidadService/AgingService/AlertasService, extraídos de
// 7.3.1/7.3.2/7.3.3.a), no redefine ninguna fórmula, no recalcula severidades. Solo
// orquesta y compone tres resultados ya calculados en una única respuesta.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia")
export class DashboardEjecutivoController {
  constructor(
    private rentabilidadService: RentabilidadService,
    private agingService: AgingService,
    private alertasService: AlertasService,
  ) {}

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("dashboard-ejecutivo")
  async dashboardEjecutivo(@Query("desde") desde?: string, @Query("hasta") hasta?: string) {
    const hoy = hoyNormalizado();
    const periodoDesde = desde ? new Date(desde) : primerDiaDelMes(hoy);
    const periodoHasta = hasta ? new Date(hasta) : hoy;

    // Rentabilidad y el DSO de Aging usan el período seleccionado; la cartera de Aging y
    // las Alertas siempre representan el estado actual (mismo principio ya establecido en
    // BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, sección 4, y BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 6).
    const [rentabilidad, aging, alertas] = await Promise.all([
      this.rentabilidadService.calcular(periodoDesde, periodoHasta),
      this.agingService.calcular(undefined, periodoDesde, periodoHasta, hoy),
      this.alertasService.calcular(),
    ]);

    // Ordenar por severidad y recortar a un top N es composición de presentación, no un
    // recálculo: no se toca ningún campo `severidad` ya asignado por alertas.calc.ts.
    const principalesAlertas = [...alertas.alertas]
      .sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad])
      .slice(0, TOP_N);

    return {
      fechaCorte: hoy.toISOString().slice(0, 10),
      periodo: { desde: periodoDesde.toISOString().slice(0, 10), hasta: periodoHasta.toISOString().slice(0, 10) },
      resumenFinanciero: {
        ingreso: rentabilidad.totales.ingreso,
        costo: rentabilidad.totales.costo,
        margen: rentabilidad.totales.margen,
        margenPct: rentabilidad.totales.margenPct,
        totalPendiente: aging.totales.totalPendiente,
        deudaVencida: aging.totales.totalVencido,
        deudaPorVencer: aging.totales.totalPorVencer,
      },
      kpisCartera: {
        facturasVencidas: aging.totales.facturasVencidas,
        clientesConDeudaVencida: aging.porCliente.filter((c) => c.totalVencido > 0).length,
        dso: aging.dso,
      },
      alertas: {
        resumen: alertas.resumen,
        principales: principalesAlertas,
      },
      // Ya vienen ordenados desc por margen/deuda vencida desde rentabilidad.calc.ts y
      // aging.calc.ts — acá solo se recorta a los primeros N, no se reordena.
      rankings: {
        principalesClientesPorMargen: rentabilidad.porCliente.slice(0, TOP_N),
        principalesTransportistasPorMargen: rentabilidad.porTransportista.slice(0, TOP_N),
        principalesClientesPorDeudaVencida: aging.porCliente.slice(0, TOP_N),
      },
    };
  }
}

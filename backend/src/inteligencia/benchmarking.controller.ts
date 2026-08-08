import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { BenchmarkingService } from "./benchmarking.service";
import { diferenciaEnDias, hoyNormalizado, primerDiaDelMes } from "./shared/fecha";
import { finDeFechaUtc } from "../common/rango-fechas";

const fmt = (d: Date) => d.toISOString().slice(0, 10);

// Bloque 7.3.5 — mismo precedente de roles que Rentabilidad/Dashboard Ejecutivo
// (BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md, Parte 5): datos financieros
// comparativos entre períodos, restringidos a ADMINISTRADOR/GERENCIA.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia/benchmarking")
export class BenchmarkingController {
  constructor(private benchmarkingService: BenchmarkingService) {}

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("comparacion")
  async comparacion(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("desdeAnterior") desdeAnteriorQ?: string,
    @Query("hastaAnterior") hastaAnteriorQ?: string,
  ) {
    if (!desde || !hasta) {
      throw new BadRequestException("desde y hasta son obligatorios");
    }
    const desdeActual = new Date(desde);
    const hastaActual = finDeFechaUtc(hasta);

    let desdeAnterior: Date;
    let hastaAnterior: Date;
    if (desdeAnteriorQ && hastaAnteriorQ) {
      desdeAnterior = new Date(desdeAnteriorQ);
      hastaAnterior = finDeFechaUtc(hastaAnteriorQ);
    } else {
      // Sin período anterior explícito: se usa el período inmediatamente anterior, de
      // la misma duración, para que la comparación sea entre rangos equivalentes.
      //
      // UX-FIN-1 (corrección): la duración se calcula contra la medianoche UTC cruda de "hasta"
      // (hastaActualMedianoche), no contra hastaActual (que ahora es fin de día, 23:59:59.999).
      // diferenciaEnDias() normaliza sus operandos con .setHours() (hora LOCAL del proceso, ver
      // shared/fecha.ts) — si esa TZ local no es UTC, un valor "medianoche" y un valor "fin de
      // día" del mismo día pueden normalizar a días de calendario local distintos entre sí,
      // introduciendo un off-by-one en la duración. Usando siempre medianoche cruda para ambos
      // operandos (como antes de este bloque) esa asimetría no existe, sin importar la TZ del
      // proceso — reproduce exactamente la aritmética previa a UX-FIN-1.
      const hastaActualMedianoche = new Date(hasta);
      const duracionDias = diferenciaEnDias(desdeActual, hastaActualMedianoche) + 1;
      hastaAnterior = new Date(desdeActual);
      hastaAnterior.setDate(hastaAnterior.getDate() - 1);
      desdeAnterior = new Date(hastaAnterior);
      desdeAnterior.setDate(desdeAnterior.getDate() - (duracionDias - 1));
    }

    const resultado = await this.benchmarkingService.comparar(desdeActual, hastaActual, desdeAnterior, hastaAnterior);

    return {
      periodoActual: { desde: fmt(desdeActual), hasta: fmt(hastaActual) },
      periodoAnterior: { desde: fmt(desdeAnterior), hasta: fmt(hastaAnterior) },
      ...resultado,
    };
  }

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("evolucion")
  async evolucion(@Query("meses") mesesQ?: string, @Query("hasta") hastaQ?: string) {
    const meses = mesesQ ? Number(mesesQ) : 6;
    const hasta = hastaQ ? finDeFechaUtc(hastaQ) : hoyNormalizado();

    const resultado = await this.benchmarkingService.evolucionMensual(meses, hasta);

    return {
      ...resultado,
      serie: resultado.serie.map((p) => ({ ...p, periodo: { desde: fmt(p.periodo.desde), hasta: fmt(p.periodo.hasta) } })),
    };
  }

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("rankings")
  async rankings(@Query("desde") desde?: string, @Query("hasta") hasta?: string, @Query("topN") topNQ?: string) {
    const hoy = hoyNormalizado();
    const periodoDesde = desde ? new Date(desde) : primerDiaDelMes(hoy);
    const periodoHasta = hasta ? finDeFechaUtc(hasta) : hoy;
    const topN = topNQ ? Number(topNQ) : 5;

    const resultado = await this.benchmarkingService.rankings(periodoDesde, periodoHasta, topN);

    return {
      periodo: { desde: fmt(periodoDesde), hasta: fmt(periodoHasta) },
      ...resultado,
    };
  }
}

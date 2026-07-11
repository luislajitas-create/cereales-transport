// Bloque 7.3.5 — cálculo puro de Benchmarking y Tendencias. No accede a Prisma ni a HTTP:
// recibe resultados ya calculados por rentabilidad.calc.ts (nunca los recalcula) — compara
// entre períodos, arma series temporales y recorta top/bottom sobre datos ya agregados.

import { ResultadoRentabilidad, AgregadoDimension } from "../reportes/rentabilidad.calc";

export type TendenciaDimension = "mejoro" | "empeoro" | "sin_cambio" | "nuevo" | "desaparecido";

export interface ComparacionDimension {
  id: string;
  nombre: string;
  margenActual: number;
  margenAnterior: number;
  variacionAbsoluta: number;
  // null cuando margenAnterior es 0 y margenActual no: la variación porcentual no está
  // definida (no hay base sobre la que calcular un %) — nunca se aproxima con Infinity.
  variacionPct: number | null;
  tendencia: TendenciaDimension;
}

export interface ResultadoComparacion {
  clientes: ComparacionDimension[];
  transportistas: ComparacionDimension[];
}

export interface PeriodoRentabilidad {
  periodo: { desde: Date; hasta: Date };
  resultado: ResultadoRentabilidad;
}

export interface PuntoEvolucion {
  periodo: { desde: Date; hasta: Date };
  ingreso: number;
  costo: number;
  margen: number;
  margenPct: number;
}

export type TendenciaEvolucion = "creciente" | "decreciente" | "estable";

export interface ResultadoEvolucion {
  serie: PuntoEvolucion[];
  variacionTotalPct: number | null;
  tendenciaMargen: TendenciaEvolucion;
}

export interface ResultadoTopBottom {
  top: AgregadoDimension[];
  bottom: AgregadoDimension[];
}

// Valor de calibración inicial, no definición permanente (mismo criterio que
// shared/umbrales.ts): una variación de margen dentro de +/-2% se considera "sin cambio",
// no una mejora ni un empeoramiento real.
const VARIACION_ESTABLE_PCT = 0.02;

function variacionPctDe(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return (actual - anterior) / Math.abs(anterior);
}

function tendenciaDimensionDe(margenActual: number, margenAnterior: number, presenteActual: boolean, presenteAnterior: boolean): TendenciaDimension {
  if (!presenteActual && presenteAnterior) return "desaparecido";
  if (presenteActual && !presenteAnterior) return "nuevo";
  const variacionPct = variacionPctDe(margenActual, margenAnterior);
  if (variacionPct === null) return margenActual > 0 ? "mejoro" : margenActual < 0 ? "empeoro" : "sin_cambio";
  if (variacionPct > VARIACION_ESTABLE_PCT) return "mejoro";
  if (variacionPct < -VARIACION_ESTABLE_PCT) return "empeoro";
  return "sin_cambio";
}

function compararDimension(actual: AgregadoDimension[], anterior: AgregadoDimension[]): ComparacionDimension[] {
  const acumulado = new Map<string, { nombre: string; margenActual: number; margenAnterior: number; presenteActual: boolean; presenteAnterior: boolean }>();
  for (const a of actual) {
    acumulado.set(a.id, { nombre: a.nombre, margenActual: a.margen, margenAnterior: 0, presenteActual: true, presenteAnterior: false });
  }
  for (const a of anterior) {
    const existente = acumulado.get(a.id);
    if (existente) {
      existente.margenAnterior = a.margen;
      existente.presenteAnterior = true;
    } else {
      acumulado.set(a.id, { nombre: a.nombre, margenActual: 0, margenAnterior: a.margen, presenteActual: false, presenteAnterior: true });
    }
  }

  const filas: ComparacionDimension[] = Array.from(acumulado.entries()).map(([id, v]) => ({
    id,
    nombre: v.nombre,
    margenActual: v.margenActual,
    margenAnterior: v.margenAnterior,
    variacionAbsoluta: v.margenActual - v.margenAnterior,
    variacionPct: variacionPctDe(v.margenActual, v.margenAnterior),
    tendencia: tendenciaDimensionDe(v.margenActual, v.margenAnterior, v.presenteActual, v.presenteAnterior),
  }));

  return filas.sort((a, b) => b.variacionAbsoluta - a.variacionAbsoluta);
}

/**
 * Compara el margen por cliente y por transportista entre dos períodos ya calculados por
 * RentabilidadService — no vuelve a leer ni a sumar nada, solo empareja por id y calcula
 * la diferencia. Responde "¿qué cliente/transportista mejoró o empeoró?".
 */
export function compararPeriodos(actual: ResultadoRentabilidad, anterior: ResultadoRentabilidad): ResultadoComparacion {
  return {
    clientes: compararDimension(actual.porCliente, anterior.porCliente),
    transportistas: compararDimension(actual.porTransportista, anterior.porTransportista),
  };
}

function tendenciaEvolucionDe(variacionTotalPct: number | null): TendenciaEvolucion {
  if (variacionTotalPct === null) return "estable";
  if (variacionTotalPct > VARIACION_ESTABLE_PCT) return "creciente";
  if (variacionTotalPct < -VARIACION_ESTABLE_PCT) return "decreciente";
  return "estable";
}

/**
 * Arma la serie temporal (ingreso/costo/margen) a partir de N resultados de
 * RentabilidadService ya calculados, uno por período (mes) — no recalcula ningún total,
 * solo los reordena en una serie y compara el primero contra el último.
 */
export function calcularEvolucion(serie: PeriodoRentabilidad[]): ResultadoEvolucion {
  const puntos: PuntoEvolucion[] = serie.map((p) => ({
    periodo: p.periodo,
    ingreso: p.resultado.totales.ingreso,
    costo: p.resultado.totales.costo,
    margen: p.resultado.totales.margen,
    margenPct: p.resultado.totales.margenPct,
  }));

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const variacionTotalPct = primero && ultimo && primero !== ultimo ? variacionPctDe(ultimo.margen, primero.margen) : null;

  return {
    serie: puntos,
    variacionTotalPct,
    tendenciaMargen: tendenciaEvolucionDe(variacionTotalPct),
  };
}

/**
 * Recorta el top N y el bottom N de una dimensión ya agregada y ordenada desc. por margen
 * (agregarPorDimension, en rentabilidad.calc.ts, ya garantiza ese orden) — es composición
 * de presentación, no un recálculo: no se toca ningún campo ya calculado.
 */
export function topBottom(dimension: AgregadoDimension[], n: number): ResultadoTopBottom {
  return {
    top: dimension.slice(0, n),
    bottom: [...dimension].slice(-n).reverse(),
  };
}

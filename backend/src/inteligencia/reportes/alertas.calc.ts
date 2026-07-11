// Bloque 7.3.3.a — cálculo puro del catálogo de alertas operativas y financieras.
// Ver BLOQUE7.3.3a_DISENO_ALERTAS.md para la definición aprobada. No accede a Prisma ni a
// HTTP: recibe los resultados ya calculados por aging.calc.ts/rentabilidad.calc.ts (nunca
// los recalcula) más los datos crudos que todavía no tienen dueño en el Motor
// (AnticipoGasto, HistorialEstadoViaje) ya leídos por AlertasController.

import { ResultadoAging } from "./aging.calc";
import { ResultadoRentabilidad } from "./rentabilidad.calc";
import { severidadPorUmbral, severidadPorUmbralDescendente, Severidad } from "../shared/severidad";
import { diferenciaEnDias } from "../shared/fecha";
import * as U from "../shared/umbrales";

export type TipoAlerta =
  | "factura_vencida"
  | "factura_proxima_vencer"
  | "cliente_deuda_vencida"
  | "anticipo_sin_liquidar"
  | "chofer_anticipos_altos"
  | "viaje_sin_facturar"
  | "viaje_sin_liquidar"
  | "viaje_estancado"
  | "concentracion_cliente";

export interface Alerta {
  tipo: TipoAlerta;
  severidad: Severidad;
  entidadId: string;
  entidadNombre: string;
  mensaje: string;
  valor: number;
  detalle: Record<string, unknown>;
}

export interface AnticipoEntrada {
  id: string;
  importe: number;
  fecha: Date;
  choferId: string;
  chofer: string;
}

export interface ViajeEstadoEntrada {
  id: string;
  numeroViaje: number;
  estado: string;
  fechaUltimoCambio: Date;
}

export interface ResumenViajesIncompletos {
  total: number;
  sinFacturar: number;
  sinLiquidar: number;
  ambos: number;
}

export interface ResumenAlertas {
  total: number;
  criticas: number;
  preventivas: number;
  informativas: number;
}

export interface ResultadoAlertas {
  resumen: ResumenAlertas;
  alertas: Alerta[];
  viajesRentabilidadIncompleta: ResumenViajesIncompletos;
}

// 1. Factura vencida — lee aging.calc.ts, no recalcula vigencia ni mora.
function alertasFacturaVencida(aging: ResultadoAging): Alerta[] {
  return aging.detalleFacturas
    .filter((f) => f.vencida)
    .map((f) => ({
      tipo: "factura_vencida",
      severidad: U.FACTURA_VENCIDA_SEVERIDAD_POR_BUCKET[f.bucket as "0-30" | "31-60" | "61-90" | "+90"],
      entidadId: f.facturaId,
      entidadNombre: f.numero,
      mensaje: `Factura ${f.numero} de ${f.cliente} vencida hace ${f.diasMora} día(s)`,
      valor: f.diasMora,
      detalle: { cliente: f.cliente, saldoPendiente: f.saldoPendiente, vencimiento: f.vencimiento, bucket: f.bucket },
    }));
}

// 2. Factura próxima a vencer — mismo dato base, severidad descendente (menos días = peor).
function alertasFacturaProximaVencer(aging: ResultadoAging, hoy: Date): Alerta[] {
  return aging.detalleFacturas
    .filter((f) => !f.vencida)
    .map((f) => ({ f, diasParaVencer: diferenciaEnDias(hoy, f.vencimiento) }))
    .filter(({ diasParaVencer }) => diasParaVencer >= 0 && diasParaVencer <= U.FACTURA_PROXIMA_VENCER_DIAS_PREVENTIVA)
    .map(({ f, diasParaVencer }) => ({
      tipo: "factura_proxima_vencer",
      severidad: severidadPorUmbralDescendente(diasParaVencer, U.FACTURA_PROXIMA_VENCER_DIAS_PREVENTIVA, U.FACTURA_PROXIMA_VENCER_DIAS_CRITICA),
      entidadId: f.facturaId,
      entidadNombre: f.numero,
      mensaje: `Factura ${f.numero} de ${f.cliente} vence en ${diasParaVencer} día(s)`,
      valor: diasParaVencer,
      detalle: { cliente: f.cliente, saldoPendiente: f.saldoPendiente, vencimiento: f.vencimiento },
    }));
}

// 3. Cliente con deuda vencida elevada (umbral absoluto) — lee porCliente de aging.
function alertasClienteDeudaVencida(aging: ResultadoAging): Alerta[] {
  return aging.porCliente
    .filter((c) => c.totalVencido >= U.CLIENTE_DEUDA_VENCIDA_MONTO_PREVENTIVA)
    .map((c) => ({
      tipo: "cliente_deuda_vencida",
      severidad: severidadPorUmbral(c.totalVencido, U.CLIENTE_DEUDA_VENCIDA_MONTO_PREVENTIVA, U.CLIENTE_DEUDA_VENCIDA_MONTO_CRITICA),
      entidadId: c.clienteId,
      entidadNombre: c.cliente,
      mensaje: `${c.cliente} acumula ${fmtMoney(c.totalVencido)} de deuda vencida`,
      valor: c.totalVencido,
      detalle: { totalPendiente: c.totalPendiente, totalPorVencer: c.totalPorVencer, facturas: c.facturas },
    }));
}

// 9. Concentración de deuda en un cliente (umbral relativo) — mismo dato, otra pregunta.
function alertasConcentracionCliente(aging: ResultadoAging): Alerta[] {
  const totalVencido = aging.totales.totalVencido;
  if (totalVencido <= 0) return [];
  return aging.porCliente
    .map((c) => ({ c, pct: c.totalVencido / totalVencido }))
    .filter(({ pct }) => pct >= U.CONCENTRACION_CLIENTE_PCT_PREVENTIVA)
    .map(({ c, pct }) => ({
      tipo: "concentracion_cliente",
      severidad: severidadPorUmbral(pct, U.CONCENTRACION_CLIENTE_PCT_PREVENTIVA, U.CONCENTRACION_CLIENTE_PCT_CRITICA),
      entidadId: c.clienteId,
      entidadNombre: c.cliente,
      mensaje: `${c.cliente} concentra ${(pct * 100).toFixed(0)}% de la deuda vencida total`,
      valor: pct,
      detalle: { totalVencidoCliente: c.totalVencido, totalVencidoCartera: totalVencido },
    }));
}

// 4. Anticipo sin liquidar — primera lectura de AnticipoGasto desde el Motor.
function alertasAnticipoSinLiquidar(anticipos: AnticipoEntrada[], hoy: Date): Alerta[] {
  return anticipos
    .map((a) => ({ a, dias: diferenciaEnDias(a.fecha, hoy) }))
    .filter(({ dias }) => dias >= U.ANTICIPO_SIN_LIQUIDAR_DIAS_INFORMATIVA)
    .map(({ a, dias }) => ({
      tipo: "anticipo_sin_liquidar",
      severidad: severidadPorUmbral(dias, U.ANTICIPO_SIN_LIQUIDAR_DIAS_PREVENTIVA, U.ANTICIPO_SIN_LIQUIDAR_DIAS_CRITICA),
      entidadId: a.id,
      entidadNombre: a.chofer,
      mensaje: `Anticipo de ${fmtMoney(a.importe)} a ${a.chofer} sin liquidar hace ${dias} día(s)`,
      valor: dias,
      detalle: { importe: a.importe, fecha: a.fecha },
    }));
}

// 5. Chofer con anticipos acumulados altos — agregación por chofer del mismo dato de #4.
function alertasChoferAnticiposAltos(anticipos: AnticipoEntrada[]): Alerta[] {
  const acumulado = new Map<string, { chofer: string; total: number; cantidad: number }>();
  for (const a of anticipos) {
    const actual = acumulado.get(a.choferId) || { chofer: a.chofer, total: 0, cantidad: 0 };
    actual.total += a.importe;
    actual.cantidad += 1;
    acumulado.set(a.choferId, actual);
  }
  return Array.from(acumulado.entries())
    .filter(([, v]) => v.total >= U.CHOFER_ANTICIPOS_MONTO_PREVENTIVA)
    .map(([choferId, v]) => ({
      tipo: "chofer_anticipos_altos",
      severidad: severidadPorUmbral(v.total, U.CHOFER_ANTICIPOS_MONTO_PREVENTIVA, U.CHOFER_ANTICIPOS_MONTO_CRITICA),
      entidadId: choferId,
      entidadNombre: v.chofer,
      mensaje: `${v.chofer} acumula ${fmtMoney(v.total)} en ${v.cantidad} anticipo(s) sin liquidar`,
      valor: v.total,
      detalle: { cantidad: v.cantidad },
    }));
}

// 6 y 7. Viaje sin facturar / sin liquidar — leen viajesIncompletos de rentabilidad.calc.ts.
// Un viaje "sin facturar y sin liquidar" aparece en las dos listas: son dos preguntas de
// negocio distintas sobre el mismo viaje, no un duplicado (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 3).
function alertasViajeSinFacturarOLiquidar(
  rentabilidad: ResultadoRentabilidad,
  hoy: Date,
  tipo: "viaje_sin_facturar" | "viaje_sin_liquidar",
  motivos: string[],
  diasInformativa: number,
  diasPreventiva: number,
  diasCritica: number,
): Alerta[] {
  return rentabilidad.viajesIncompletos
    .filter((v) => motivos.includes(v.motivo))
    .map((v) => ({ v, dias: diferenciaEnDias(v.fecha, hoy) }))
    .filter(({ dias }) => dias >= diasInformativa)
    .map(({ v, dias }) => ({
      tipo,
      severidad: severidadPorUmbral(dias, diasPreventiva, diasCritica),
      entidadId: v.viajeId,
      entidadNombre: `Viaje N° ${v.numeroViaje}`,
      mensaje: `Viaje N° ${v.numeroViaje} descargado hace ${dias} día(s), ${tipo === "viaje_sin_facturar" ? "sin facturar" : "sin liquidar"}`,
      valor: dias,
      detalle: { motivo: v.motivo, fecha: v.fecha },
    }));
}

// 8. Viaje estancado — primera lectura de HistorialEstadoViaje desde el Motor.
function alertasViajeEstancado(viajes: ViajeEstadoEntrada[], hoy: Date): Alerta[] {
  return viajes
    .map((v) => ({ v, dias: diferenciaEnDias(v.fechaUltimoCambio, hoy) }))
    .filter(({ dias }) => dias >= U.VIAJE_ESTANCADO_DIAS_INFORMATIVA)
    .map(({ v, dias }) => ({
      tipo: "viaje_estancado",
      severidad: severidadPorUmbral(dias, U.VIAJE_ESTANCADO_DIAS_PREVENTIVA, U.VIAJE_ESTANCADO_DIAS_CRITICA),
      entidadId: v.id,
      entidadNombre: `Viaje N° ${v.numeroViaje}`,
      mensaje: `Viaje N° ${v.numeroViaje} lleva ${dias} día(s) en estado ${v.estado}`,
      valor: dias,
      detalle: { estado: v.estado },
    }));
}

function resumenViajesIncompletos(rentabilidad: ResultadoRentabilidad): ResumenViajesIncompletos {
  const lista = rentabilidad.viajesIncompletos;
  return {
    total: lista.length,
    sinFacturar: lista.filter((v) => v.motivo === "sin facturar" || v.motivo === "sin facturar y sin liquidar").length,
    sinLiquidar: lista.filter((v) => v.motivo === "sin liquidar" || v.motivo === "sin facturar y sin liquidar").length,
    ambos: lista.filter((v) => v.motivo === "sin facturar y sin liquidar").length,
  };
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

/**
 * Arma el catálogo completo de alertas a partir de los resultados ya calculados de
 * Aging/Rentabilidad y de los datos crudos que todavía no tienen dueño en el Motor.
 * AlertasController es responsable de leer todo esto y de filtrar por rol después.
 */
export function calcularAlertas(
  aging: ResultadoAging,
  rentabilidad: ResultadoRentabilidad,
  anticipos: AnticipoEntrada[],
  viajesEnCurso: ViajeEstadoEntrada[],
  hoy: Date,
): ResultadoAlertas {
  const alertas: Alerta[] = [
    ...alertasFacturaVencida(aging),
    ...alertasFacturaProximaVencer(aging, hoy),
    ...alertasClienteDeudaVencida(aging),
    ...alertasConcentracionCliente(aging),
    ...alertasAnticipoSinLiquidar(anticipos, hoy),
    ...alertasChoferAnticiposAltos(anticipos),
    ...alertasViajeSinFacturarOLiquidar(
      rentabilidad, hoy, "viaje_sin_facturar", ["sin facturar", "sin facturar y sin liquidar"],
      U.VIAJE_SIN_FACTURAR_DIAS_INFORMATIVA, U.VIAJE_SIN_FACTURAR_DIAS_PREVENTIVA, U.VIAJE_SIN_FACTURAR_DIAS_CRITICA,
    ),
    ...alertasViajeSinFacturarOLiquidar(
      rentabilidad, hoy, "viaje_sin_liquidar", ["sin liquidar", "sin facturar y sin liquidar"],
      U.VIAJE_SIN_LIQUIDAR_DIAS_INFORMATIVA, U.VIAJE_SIN_LIQUIDAR_DIAS_PREVENTIVA, U.VIAJE_SIN_LIQUIDAR_DIAS_CRITICA,
    ),
    ...alertasViajeEstancado(viajesEnCurso, hoy),
  ];

  return {
    resumen: {
      total: alertas.length,
      criticas: alertas.filter((a) => a.severidad === "critica").length,
      preventivas: alertas.filter((a) => a.severidad === "preventiva").length,
      informativas: alertas.filter((a) => a.severidad === "informativa").length,
    },
    alertas,
    viajesRentabilidadIncompleta: resumenViajesIncompletos(rentabilidad),
  };
}

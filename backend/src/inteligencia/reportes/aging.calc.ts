// Bloque 7.3.2 — cálculo puro de aging de cobranzas (saldo, vencida, mora, buckets, DSO).
// Ver BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, secciones 3 y 6, para la definición aprobada,
// y BLOQUE7.3_SEMANTICA_COMPARTIDA.md para el resumen de referencia. No accede a Prisma ni
// a HTTP: recibe datos ya leídos (facturas vigentes, con sus cobranzas vigentes) por quien
// llama — AgingController es responsable de ese filtro de vigencia inicial (estado !== "ANULADO").

import { esVencida } from "../shared/vigencia";
import { diferenciaEnDias, normalizarFecha } from "../shared/fecha";
import { esCero, TOLERANCIA_REDONDEO } from "../shared/dinero";

export interface CobranzaEntrada {
  importe: number;
  fecha: Date;
}

export interface FacturaEntrada {
  id: string;
  numero: string;
  fecha: Date;
  vencimiento: Date;
  importe: number;
  estado: string;
  clienteId: string;
  cliente: string;
  // Ya filtradas por vigencia (anulada: false) por quien arma esta entrada.
  cobranzasVigentes: CobranzaEntrada[];
}

export type BucketAging = "0-30" | "31-60" | "61-90" | "+90";
export type BucketFactura = BucketAging | "por vencer";

export interface FacturaCalculada {
  facturaId: string;
  numero: string;
  cliente: string;
  fecha: Date;
  vencimiento: Date;
  importe: number;
  saldoPendiente: number;
  diasMora: number;
  vencida: boolean;
  bucket: BucketFactura;
}

export interface AgregadoBucket {
  monto: number;
  facturas: number;
}

export interface AgregadoCliente {
  clienteId: string;
  cliente: string;
  totalPendiente: number;
  totalVencido: number;
  totalPorVencer: number;
  diasMoraPromedio: number;
  facturas: number;
}

export interface ResultadoDsoHistorico {
  dias: number;
  facturasConsideradas: number;
}

export interface ResultadoDsoSnapshot {
  dias: number;
  ventasPeriodo: number;
  carteraActual: number;
}

export interface ResultadoAging {
  totales: {
    totalPendiente: number;
    totalVencido: number;
    totalPorVencer: number;
    facturasPendientes: number;
    facturasVencidas: number;
  };
  aging: Record<BucketAging, AgregadoBucket>;
  porCliente: AgregadoCliente[];
  detalleFacturas: FacturaCalculada[];
  dso: {
    historico: ResultadoDsoHistorico | null;
    snapshotClasico: ResultadoDsoSnapshot;
  };
}

function saldoPendienteDe(factura: FacturaEntrada): number {
  const cobrado = factura.cobranzasVigentes.reduce((acc, c) => acc + c.importe, 0);
  return factura.importe - cobrado;
}

function bucketDe(vencida: boolean, diasMora: number): BucketFactura {
  if (!vencida) return "por vencer";
  if (diasMora <= 30) return "0-30";
  if (diasMora <= 60) return "31-60";
  if (diasMora <= 90) return "61-90";
  return "+90";
}

function calcularFactura(factura: FacturaEntrada, hoy: Date): FacturaCalculada {
  const saldoPendiente = saldoPendienteDe(factura);
  const vencida = esVencida(factura.estado, factura.vencimiento, hoy);
  const diasMora = vencida ? diferenciaEnDias(factura.vencimiento, hoy) : 0;
  return {
    facturaId: factura.id,
    numero: factura.numero,
    cliente: factura.cliente,
    fecha: factura.fecha,
    vencimiento: factura.vencimiento,
    importe: factura.importe,
    saldoPendiente,
    diasMora,
    vencida,
    bucket: bucketDe(vencida, diasMora),
  };
}

function dentroDePeriodo(fecha: Date, desde: Date, hasta: Date): boolean {
  const f = normalizarFecha(fecha);
  return f >= normalizarFecha(desde) && f <= normalizarFecha(hasta);
}

// La cobranza que efectivamente completó el pago de una factura ya COBRADO_TOTAL —
// la primera, en orden cronológico, cuyo acumulado alcanza el importe de la factura.
function fechaCompletoPago(factura: FacturaEntrada): Date | null {
  if (factura.estado !== "COBRADO_TOTAL") return null;
  const ordenadas = [...factura.cobranzasVigentes].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  let acumulado = 0;
  for (const c of ordenadas) {
    acumulado += c.importe;
    if (acumulado >= factura.importe - TOLERANCIA_REDONDEO) return c.fecha;
  }
  return null; // defensivo: no debería ocurrir si estado ya es COBRADO_TOTAL
}

// DSO histórico (oficial, BLOQUE7.3_SEMANTICA_COMPARTIDA.md): promedio de días entre la
// fecha de la factura y la fecha de la cobranza que la completó, solo sobre facturas
// COBRADO_TOTAL cuya fecha cae en el período. null si no hay ninguna — nunca 0.
function calcularDsoHistorico(facturas: FacturaEntrada[], desde: Date, hasta: Date): ResultadoDsoHistorico | null {
  const dias: number[] = [];
  for (const f of facturas) {
    if (f.estado !== "COBRADO_TOTAL" || !dentroDePeriodo(f.fecha, desde, hasta)) continue;
    const fechaCompleto = fechaCompletoPago(f);
    if (fechaCompleto) dias.push(diferenciaEnDias(f.fecha, fechaCompleto));
  }
  if (dias.length === 0) return null;
  const promedio = dias.reduce((a, b) => a + b, 0) / dias.length;
  return { dias: Math.round(promedio), facturasConsideradas: dias.length };
}

// DSO snapshot/clásico (complementario, aproximación de industria): cartera actual sobre
// ventas del período, expresado en días de ese período.
function calcularDsoSnapshot(
  facturas: FacturaEntrada[],
  desde: Date,
  hasta: Date,
  carteraActual: number,
): ResultadoDsoSnapshot {
  const ventasPeriodo = facturas
    .filter((f) => dentroDePeriodo(f.fecha, desde, hasta))
    .reduce((acc, f) => acc + f.importe, 0);
  const diasPeriodo = Math.max(1, diferenciaEnDias(desde, hasta) + 1);
  const dias = ventasPeriodo > 0 ? (carteraActual / ventasPeriodo) * diasPeriodo : 0;
  return { dias: Math.round(dias), ventasPeriodo, carteraActual };
}

function agregarPorCliente(conSaldo: FacturaCalculada[], original: FacturaEntrada[]): AgregadoCliente[] {
  const clientePorFactura = new Map(original.map((f) => [f.id, { clienteId: f.clienteId, cliente: f.cliente }]));
  const acumulado = new Map<
    string,
    { cliente: string; totalPendiente: number; totalVencido: number; totalPorVencer: number; sumaMoraPonderada: number; facturas: number }
  >();
  for (const f of conSaldo) {
    const info = clientePorFactura.get(f.facturaId)!;
    const actual = acumulado.get(info.clienteId) || {
      cliente: info.cliente,
      totalPendiente: 0,
      totalVencido: 0,
      totalPorVencer: 0,
      sumaMoraPonderada: 0,
      facturas: 0,
    };
    actual.totalPendiente += f.saldoPendiente;
    if (f.vencida) {
      actual.totalVencido += f.saldoPendiente;
      actual.sumaMoraPonderada += f.diasMora * f.saldoPendiente;
    } else {
      actual.totalPorVencer += f.saldoPendiente;
    }
    actual.facturas += 1;
    acumulado.set(info.clienteId, actual);
  }
  const filas: AgregadoCliente[] = Array.from(acumulado.entries()).map(([clienteId, a]) => ({
    clienteId,
    cliente: a.cliente,
    totalPendiente: a.totalPendiente,
    totalVencido: a.totalVencido,
    totalPorVencer: a.totalPorVencer,
    // Ponderado por saldo pendiente, no promedio simple (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, 1.7):
    // una deuda chica no debe pesar igual que una material.
    diasMoraPromedio: a.totalVencido > 0 ? a.sumaMoraPonderada / a.totalVencido : 0,
    facturas: a.facturas,
  }));
  return filas.sort((a, b) => b.totalVencido - a.totalVencido);
}

/**
 * Calcula la cartera de aging (a la fecha de hoy, sin filtrar por período — sección 1.3
 * del diseño) y los dos indicadores de DSO (acotados por período). `facturas` debe venir
 * ya filtrado por vigencia (estado !== "ANULADO") por quien llama.
 */
export function calcularAging(
  facturas: FacturaEntrada[],
  periodoDesde: Date,
  periodoHasta: Date,
  hoy: Date,
): ResultadoAging {
  const calculadas = facturas.map((f) => calcularFactura(f, hoy));
  // Una factura ya COBRADO_TOTAL (saldo 0) no es deuda de ningún tipo — no participa de
  // la cartera, pero sigue participando de calcularDsoHistorico (usa `facturas`, no esto).
  const conSaldo = calculadas.filter((f) => f.saldoPendiente > 0 && !esCero(f.saldoPendiente));

  const totalVencido = conSaldo.filter((f) => f.vencida).reduce((acc, f) => acc + f.saldoPendiente, 0);
  const totalPorVencer = conSaldo.filter((f) => !f.vencida).reduce((acc, f) => acc + f.saldoPendiente, 0);
  const totalPendiente = totalVencido + totalPorVencer;

  const aging: Record<BucketAging, AgregadoBucket> = {
    "0-30": { monto: 0, facturas: 0 },
    "31-60": { monto: 0, facturas: 0 },
    "61-90": { monto: 0, facturas: 0 },
    "+90": { monto: 0, facturas: 0 },
  };
  for (const f of conSaldo) {
    if (f.bucket === "por vencer") continue;
    aging[f.bucket].monto += f.saldoPendiente;
    aging[f.bucket].facturas += 1;
  }

  return {
    totales: {
      totalPendiente,
      totalVencido,
      totalPorVencer,
      facturasPendientes: conSaldo.length,
      facturasVencidas: conSaldo.filter((f) => f.vencida).length,
    },
    aging,
    porCliente: agregarPorCliente(conSaldo, facturas),
    detalleFacturas: conSaldo,
    dso: {
      historico: calcularDsoHistorico(facturas, periodoDesde, periodoHasta),
      snapshotClasico: calcularDsoSnapshot(facturas, periodoDesde, periodoHasta, totalPendiente),
    },
  };
}

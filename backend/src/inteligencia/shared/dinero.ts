// Semántica compartida — tolerancia monetaria (BLOQUE7.3_SEMANTICA_COMPARTIDA.md).
// Mismo margen ya usado en el registro de cobranzas (facturas.controller.ts:16),
// formalizado acá para que cualquier cálculo analítico lo reutilice.
export const TOLERANCIA_REDONDEO = 0.01;

export function esCero(monto: number): boolean {
  return Math.abs(monto) < TOLERANCIA_REDONDEO;
}

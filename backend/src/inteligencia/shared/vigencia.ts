// Semántica compartida — vigencia de documentos (BLOQUE7.3_SEMANTICA_COMPARTIDA.md).
// Un mismo criterio de "¿este registro sigue siendo válido?", reutilizable para
// cualquier cálculo del Motor (BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md, regla 8).
import { hoyNormalizado, normalizarFecha } from "./fecha";

export function esFacturaVigente(estado: string): boolean {
  return estado !== "ANULADO";
}

export function esCobranzaVigente(anulada: boolean): boolean {
  return !anulada;
}

// Factura vencida: vigente, no cobrada del todo, y vencida desde el día siguiente a su
// vencimiento — nunca el mismo día (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, sección 1.2).
export function esVencida(estado: string, vencimiento: Date, hoy: Date = hoyNormalizado()): boolean {
  if (estado === "ANULADO" || estado === "COBRADO_TOTAL") return false;
  return normalizarFecha(vencimiento) < hoy;
}

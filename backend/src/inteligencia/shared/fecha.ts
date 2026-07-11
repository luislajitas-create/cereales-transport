// Semántica compartida — fecha de negocio (BLOQUE7.3_SEMANTICA_COMPARTIDA.md).
// El "hoy" de cualquier cálculo analítico se normaliza a medianoche, sin componente
// horario, para que comparar contra un vencimiento (persistido a medianoche) no dependa
// de a qué hora del día se ejecuta la consulta (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, 1.2).

export function hoyNormalizado(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

export function normalizarFecha(fecha: Date): Date {
  const normalizada = new Date(fecha);
  normalizada.setHours(0, 0, 0, 0);
  return normalizada;
}

export function diferenciaEnDias(desde: Date, hasta: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((normalizarFecha(hasta).getTime() - normalizarFecha(desde).getTime()) / MS_POR_DIA);
}

export function primerDiaDelMes(referencia: Date): Date {
  const d = new Date(referencia);
  d.setDate(1);
  return d;
}

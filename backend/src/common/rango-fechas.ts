// UX-FIN-1 (corrección post-cierre): existen dos dominios de fecha distintos en el sistema y no
// pueden compartir un único helper de "fin de rango".
//
// Dominio A — fecha de negocio pura (Viaje.fecha, AnticipoGasto.fecha, Factura.fecha/vencimiento,
// Liquidacion.periodoDesde/periodoHasta): siempre se escribe desde un <input type="date"> como
// medianoche UTC del día elegido, sin componente horario significativo. Para estos campos, el
// límite superior correcto de un filtro "Hasta" es el último milisegundo de ese mismo día
// calendario UTC — usar `finDeFechaUtc`.
//
// Dominio B — timestamp real (AuditLog.fecha, o cualquier campo con @default(now())/`new Date()`
// al momento de escribir): tiene una hora real dentro de un instante UTC absoluto, que debe
// interpretarse contra el día calendario LOCAL del usuario/organización, no el día calendario UTC.
// Aplicarle `finDeFechaUtc` excluye incorrectamente eventos tardíos del día local cuya hora UTC ya
// cruzó a la medianoche del día siguiente (ej. 22:30 en Argentina/Salta = 01:30Z del día
// siguiente) — usar `rangoDiaEnZona`.
export function finDeFechaUtc(fechaTexto: string): Date {
  const inicio = new Date(fechaTexto);
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Fallback estable para este producto argentino cuando Organizacion.zonaHoraria es nula o
// inválida. Argentina no observa horario de verano desde 2009 (offset fijo UTC-3 todo el año).
// Nunca se depende de la TZ del proceso (Railway no la garantiza): la zona siempre se pasa
// explícitamente a Intl.DateTimeFormat.
export const ZONA_ARGENTINA_DEFECTO = "America/Argentina/Salta";

// Valida que `zona` sea un nombre de zona IANA reconocido por el motor ICU embebido en Node
// (disponible completo desde Node 13+, confirmado en este entorno). Organizacion.zonaHoraria es
// texto libre sin validación de formato en el schema, así que cualquier valor guardado debe
// tratarse como no confiable hasta pasar por acá.
export function zonaHorariaValida(zona: string | null | undefined): string | null {
  if (!zona) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return zona;
  } catch {
    return null;
  }
}

function offsetEnMs(instanteUtcMs: number, zona: string): number {
  // formatToParts no expone milisegundos: se trabaja siempre en resolución de segundos y los ms
  // se reintegran aparte en instanteParaWallClockEnZona, para no perderlos en el redondeo.
  const instanteSinMs = Math.floor(instanteUtcMs / 1000) * 1000;
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instanteSinMs));

  const valores: Record<string, string> = {};
  for (const parte of partes) {
    if (parte.type !== "literal") valores[parte.type] = parte.value;
  }
  // Algunos locales devuelven "24" en vez de "00" para la medianoche con hour12: false.
  const hora = valores.hour === "24" ? "00" : valores.hour;
  const comoUtc = Date.UTC(
    Number(valores.year),
    Number(valores.month) - 1,
    Number(valores.day),
    Number(hora),
    Number(valores.minute),
    Number(valores.second),
  );
  return comoUtc - instanteSinMs;
}

// Encuentra el instante UTC que, mostrado en `zona`, corresponde exactamente al reloj de pared
// (y-m-d hh:mm:ss.ms) pedido. Itera dos veces sobre el offset de la zona para converger incluso
// en los dos instantes que le pide rangoDiaEnZona() (00:00:00.000 y 23:59:59.999 locales) cuando
// caen en un día de transición de horario de verano.
//
// Verificado explícitamente (rango-fechas.spec.ts): America/Argentina/Salta (sin DST, fallback
// real del producto) y America/New_York en días normales y en sus transiciones DST 2026 (día de
// inicio: 23 horas de rango; día de fin: 25 horas de rango), con los límites exactos de
// 00:00:00.000 y 23:59:59.999 locales en todos los casos. Estos tests NO garantizan el
// comportamiento de cualquier otra zona IANA, ni de transiciones históricas o regulatorias
// extraordinarias (cambios de ley de un país, zonas que hayan movido su transición a otra hora en
// el pasado) — en particular si la medianoche local resultara inexistente o ambigua ese día, el
// resultado sería el que dé el offset con el que convergió la iteración, no necesariamente un
// instante con significado local unívoco. La zona siempre se procesa explícitamente vía el
// parámetro `timeZone` de Intl.DateTimeFormat, nunca depende de la TZ del proceso.
function instanteParaWallClockEnZona(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  ms: number,
  zona: string,
): Date {
  const objetivoMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  let offset = offsetEnMs(objetivoMs, zona);
  let instante = objetivoMs - offset;
  offset = offsetEnMs(instante, zona);
  instante = objetivoMs - offset;
  return new Date(instante + ms);
}

function parsearFechaTexto(fechaTexto: string): { y: number; m: number; d: number } {
  const [y, m, d] = fechaTexto.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

// Para timestamps reales (Dominio B): devuelve el rango UTC [desde, hasta] que corresponde al día
// calendario `fechaTexto` (YYYY-MM-DD) tal como lo vive un usuario en `zona` — 00:00:00.000 local
// hasta 23:59:59.999 local, ambos convertidos a su instante UTC real. A diferencia de
// `finDeFechaUtc`, corrige tanto el límite inferior como el superior: en cualquier zona que no sea
// UTC, la medianoche local tampoco coincide con la medianoche UTC.
export function rangoDiaEnZona(fechaTexto: string, zonaHoraria: string): { desde: Date; hasta: Date } {
  const { y, m, d } = parsearFechaTexto(fechaTexto);
  return {
    desde: instanteParaWallClockEnZona(y, m, d, 0, 0, 0, 0, zonaHoraria),
    hasta: instanteParaWallClockEnZona(y, m, d, 23, 59, 59, 999, zonaHoraria),
  };
}

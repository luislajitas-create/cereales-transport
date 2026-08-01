// Bloque RC1.1 (AUDITORIA_VIAJES2.0_RC1.md, §5): Viaje.fecha se persiste como DateTime en
// UTC-medianoche, pero es semánticamente una fecha calendario (el día en que ocurrió el viaje),
// no un instante. Formatearla con `new Date(iso).toLocaleDateString()` convierte primero al
// huso horario del navegador — para cualquier huso detrás de UTC (ej. Argentina, UTC-3), la
// medianoche UTC cae en el día anterior en hora local, mostrando una fecha equivocada. Esta
// función toma el día calendario directamente del string ISO, sin ninguna conversión de huso —
// mismo criterio que ya usaba (correctamente, sin saberlo) ViajeForm.tsx al precargar la fecha
// en modo edición con `.slice(0, 10)`.
export function fmtFechaCalendario(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

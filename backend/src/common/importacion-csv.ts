// CAT-5: utilidad mínima compartida entre importaciones CSV que detectan duplicados por una sola
// clave ya normalizada dentro del propio archivo (Cliente.cuit, Transportista.cuit). No reemplaza
// el patrón de Choferes/Vehículos (CAT-2): ahí la clave depende de una relación resuelta por fila
// (transportistaCuit) y hay dos claves simultáneas (CUIL+DNI) — esa lógica ya está probada y no
// se toca. Esta utilidad cubre el caso más simple (una sola clave, una sola entidad) sin forzar
// una abstracción común a las cuatro importaciones.
//
// Efecto de borde: una clave vacía ("") nunca se marca como duplicada — dejar que el @IsNotEmpty
// del DTO la rechace por "vacía", no por "duplicada" (mensaje más preciso para quien sube el CSV).
export function esDuplicadoEnArchivo(clave: string, vistasEnArchivo: Set<string>): boolean {
  if (!clave) return false;
  if (vistasEnArchivo.has(clave)) return true;
  vistasEnArchivo.add(clave);
  return false;
}

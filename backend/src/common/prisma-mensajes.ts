// Traducción de restricciones únicas de Prisma (P2002) a mensajes legibles para el usuario final
// — nunca se expone el mensaje crudo de Prisma/PostgreSQL, que puede incluir detalles internos de
// la consulta. Único punto de esta traducción: la usa tanto PrismaExceptionFilter (errores no
// capturados en el resto de la API) como los controllers de importación masiva CSV (CAT-1/CAT-2,
// ver importacion-errores.ts), que atrapan el error por fila y nunca dejan que llegue al filtro
// global.

// CAT-3: organizacionId es el campo técnico de aislamiento multiempresa (Bloque 8.1.d) — aparece
// en prácticamente todas las restricciones únicas reales del sistema (@@unique([organizacionId,
// campo])) porque la unicidad es siempre POR organización, nunca global. No es algo que la
// persona usuaria reconozca ni pueda "corregir" para resolver el duplicado, así que nunca debe
// aparecer en el mensaje visible — se excluye centralmente acá, no en cada llamador. "id" se
// excluye por el mismo motivo (identificador interno, nunca un dato comercial). Los campos
// comerciales reales (CUIT, CUIL, DNI, patente, etc.) NO se ocultan — solo estos dos técnicos.
const CAMPOS_TECNICOS = new Set(["organizacionId", "id"]);

// Frase completa (con el artículo gramaticalmente correcto, "este"/"esta") por campo comercial
// conocido — nunca se arma el artículo "a mano" en cada controller ni se infiere de una lista de
// nombres sueltos: "patente" es femenino ("esta patente"), todo lo demás en este dominio es
// masculino. Un único punto de mapeo evita que cada llamador tenga que decidir el género.
const CAMPO_A_FRASE: Record<string, string> = {
  cuit: "este CUIT",
  cuil: "este CUIL",
  dni: "este DNI",
  patente: "esta patente",
  ctg: "este CTG",
  numero: "este número de factura",
  email: "este email",
  nombre: "este nombre",
};

export function mensajeUnico(target: unknown): string {
  const campos = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  const camposComerciales = campos.filter((c): c is string => typeof c === "string" && !CAMPOS_TECNICOS.has(c));
  // Fallback seguro y genérico cuando: no queda ningún campo comercial (target vacío, o
  // compuesto únicamente por campos técnicos como organizacionId); hay más de uno (ninguna
  // restricción real del sistema combina dos campos comerciales — no hay un artículo único
  // correcto para "armar" en ese caso); o el campo no está en el mapeo de arriba (evita adivinar
  // género para un nombre de columna desconocido, o exponerlo tal cual).
  if (camposComerciales.length !== 1) return "Ya existe un registro con estos datos";
  const frase = CAMPO_A_FRASE[camposComerciales[0]];
  return frase ? `Ya existe un registro con ${frase}` : "Ya existe un registro con estos datos";
}

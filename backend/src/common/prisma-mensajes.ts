// Traducción de restricciones únicas de Prisma (P2002) a mensajes legibles para el usuario final
// — nunca se expone el mensaje crudo de Prisma/PostgreSQL, que puede incluir detalles internos de
// la consulta. Único punto de esta traducción: la usa tanto PrismaExceptionFilter (errores no
// capturados en el resto de la API) como los controllers de importación masiva CSV (CAT-1/CAT-2,
// ver importacion-errores.ts), que atrapan el error por fila y nunca dejan que llegue al filtro
// global.
const CAMPO_LEGIBLE: Record<string, string> = {
  cuit: "CUIT",
  cuil: "CUIL",
  dni: "DNI",
  patente: "patente",
  ctg: "CTG",
  numero: "número de factura",
  email: "email",
  nombre: "nombre",
};

export function mensajeUnico(target: unknown): string {
  const campos = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  const legibles = campos.map((c) => CAMPO_LEGIBLE[c] || c);
  if (legibles.length === 0) return "Ya existe un registro con estos datos";
  return `Ya existe un registro con este ${legibles.join(", ")}`;
}

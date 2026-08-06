// CAT-6: lógica pura de construcción del payload de "Mi Organización" (Organizacion.tsx),
// extraída a un archivo sin JSX para poder revisarla/probarla aislada del componente — el
// proyecto no tiene infraestructura de tests de componentes hoy (ver AUDITORIA_CATALOGOS.md,
// sección CAT-6), así que se cubre por revisión de función + typecheck/build + validación manual
// (más una prueba puntual con el runner nativo de Node, sin instalar ningún framework nuevo, ver
// organizacion-payload.test.mjs).
//
// Bug real corregido acá (encontrado por CAT-6, preexistente): el código anterior armaba
// `payload[campo] = form[campo] || ""` para TODOS los campos salvo CUIT — así que un campo
// opcional vacío (típicamente "email", que nunca se cargó) se enviaba como `""` en CADA guardado,
// aunque la persona usuaria no lo hubiera tocado. `UpdateOrganizacionDto.email` tiene `@IsEmail()`
// además de `@IsOptional()` — y `@IsOptional()` de class-validator solo deja pasar `undefined`/
// `null`, nunca `""` — así que cualquier guardado (editar solo el domicilio, por ejemplo) fallaba
// con "email must be an email" apenas la organización no tuviera un email cargado. La causa raíz
// era la misma conversión indiscriminada "vacío -> ''" que ya se había corregido para CUIT, pero
// nunca se generalizó al resto de los campos.

// Único campo obligatorio (no nullable) entre los editables de Organización — ver
// backend/prisma/schema.prisma (`Organizacion.nombre: String`, sin `?`). El resto
// (razonSocial/cuit/domicilio/telefono/email/zonaHoraria/moneda) son `String?`.
const CAMPOS_REQUERIDOS = new Set(["nombre"]);

// Decide qué mandar para UN campo del formulario de "Mi Organización" en el PATCH, comparando
// contra el valor YA CARGADO (el que devolvió el último GET/PATCH exitoso, no un estado
// intermedio del formulario):
//   - sin cambios respecto de lo cargado -> undefined, así el payload OMITE esa clave por
//     completo (nunca se revalida ni se reenvía un campo que la persona usuaria no tocó — esto es
//     lo que evita, por ejemplo, que editar el domicilio dispare la validación de un email vacío
//     que nunca se cargó, o la validación matemática de un CUIT histórico sin tocar).
//   - vacío o solo espacios, habiendo un cambio real (ej. se borró un valor previo):
//       -> null si el campo es nullable en el schema (dejar que Prisma limpie la columna);
//       -> el texto vacío tal cual si el campo es obligatorio (nombre) — nunca se envía `null`
//          para una columna que no lo admite; se deja que el backend lo rechace con su propio
//          mensaje funcional (@IsNotEmpty()), en vez de intentar adivinar una alternativa acá.
//   - cualquier otro valor -> tal cual lo escribió la persona usuaria, sin recortar ni
//     reformatear — la normalización/validación real es responsabilidad exclusiva del backend.
// Nunca convierte un campo sin tocar en "" — esa conversión indiscriminada fue la causa raíz del
// bug de arriba.
export function construirValorCampo(nombreCampo: string, valorCargado: unknown, valorFormulario: unknown): string | null | undefined {
  const cargado = (typeof valorCargado === "string" ? valorCargado : "").trim();
  const actual = typeof valorFormulario === "string" ? valorFormulario : "";
  if (actual.trim() === cargado) return undefined;
  if (actual.trim() === "") return CAMPOS_REQUERIDOS.has(nombreCampo) ? actual : null;
  return actual;
}

// Arma el payload completo del PATCH a partir de la lista de nombres de campo del formulario, la
// organización cargada y el estado actual del formulario — cada campo se decide de forma
// independiente con construirValorCampo(); las claves cuyo valor da `undefined` quedan afuera del
// objeto resultante (nunca se asignan), así que ni siquiera viajan como `campo: undefined` en el
// JSON.
export function construirPayloadOrganizacion(
  nombresDeCampo: string[],
  organizacionCargada: Record<string, unknown>,
  formulario: Record<string, unknown>,
): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  for (const nombreCampo of nombresDeCampo) {
    const valor = construirValorCampo(nombreCampo, organizacionCargada[nombreCampo], formulario[nombreCampo]);
    if (valor !== undefined) payload[nombreCampo] = valor;
  }
  return payload;
}

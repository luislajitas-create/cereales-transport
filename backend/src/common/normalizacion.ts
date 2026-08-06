// CAT-3: normalización transversal de identificadores (CUIT/CUIL de Clientes/Transportistas/
// Choferes, DNI de Choferes, patente de Vehículos) — punto único de esta política en todo el
// backend. El objetivo es impedir duplicados semánticos causados por guiones, puntos, espacios o
// mayúsculas/minúsculas distintas, sin fusionar registros ni perder datos.
//
// Decisiones deliberadas de alcance (no ampliar sin nueva instrucción explícita):
//   - No se calcula ni corrige el dígito verificador de CUIT/CUIL. `esCuitValido()` (./cuit.ts) ya
//     existe y sigue sin aplicarse a Cliente/Transportista/Chofer — auditado en CAT-2 y CAT-3, no
//     es una regla vigente para estos catálogos, solo para el alta de Organizacion. Introducirla
//     acá sería inventar una política fiscal nueva no pedida.
//   - No se valida el formato Mercosur de patente ni se rechazan formatos históricos (ej. tres
//     letras + tres números sin guion, patentes viejas de una sola letra de provincia, etc.): la
//     única transformación es mayúsculas + remoción de espacios/puntos/guiones.
//   - Solo se normalizan estos cuatro campos. Nombre, razón social, teléfono, licencia y
//     cualquier otro campo quedan exactamente como el usuario los escribió.

export function normalizarCuit(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

// CUIL comparte formato con CUIT (11 dígitos, mismos separadores admitidos) — mismo normalizador.
export const normalizarCuil = normalizarCuit;

// DNI es opcional en Chofer (dni String? en el schema). Si el valor normalizado queda vacío
// (ausente, o compuesto solo por separadores), se devuelve undefined — nunca "" — para que el
// resto del flujo (DTO @IsOptional, `dto.dni || null` al persistir) lo trate como "sin DNI",
// exactamente el contrato vigente.
export function normalizarDni(valor: string): string | undefined {
  const digitos = (valor || "").replace(/\D/g, "");
  return digitos === "" ? undefined : digitos;
}

export function normalizarPatente(valor: string): string {
  return (valor || "").trim().toUpperCase().replace(/[\s.-]/g, "");
}

// Envuelve un normalizador para usarlo como callback de @Transform() de class-transformer en los
// DTO: si el valor no llegó (undefined/null — típico de un PATCH parcial que no toca este campo)
// lo deja pasar intacto, para no inyectar un valor donde el cliente no envió ninguno (eso
// pisaría silenciosamente el valor ya guardado en una edición parcial). Si llegó pero no es un
// string, también lo deja pasar intacto — que lo reporte el @IsString() real del DTO, no esta
// función.
export function siPresente<T>(normalizar: (valor: string) => T) {
  return ({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null) return value;
    if (typeof value !== "string") return value;
    return normalizar(value);
  };
}

// CAT-3: variante de siPresente(normalizarDni) específica para UpdateChoferDto. Mismo criterio
// para "el campo no vino en el PATCH" (value === undefined/null -> se deja intacto, Prisma no lo
// toca). La diferencia es qué hacer cuando el campo SÍ vino pero normaliza a vacío (dni: "" o
// solo separadores, ej. " . - "): eso es una intención explícita de "quitar el DNI", así que acá
// se traduce a `null` (Prisma SÍ lo persiste, limpiando el campo) — no a `undefined`, que Prisma
// interpreta como "no tocar" y habría dejado el DNI anterior sin cambios mientras el endpoint
// responde 200 como si hubiera aplicado el cambio pedido. El alta (CreateChoferDto) no necesita
// esta distinción: ahí no existe un valor previo que preservar, y el controller ya mapea
// `dto.dni || null` antes de crear.
export function normalizarDniEdicion({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  const normalizado = normalizarDni(value);
  return normalizado === undefined ? null : normalizado;
}

// CAT-6: normalización de un CUIT OPCIONAL (Organizacion.cuit en edición; Productor.cuit en alta
// y edición) — semántica deliberadamente distinta de normalizarDniEdicion de arriba. Ahí, un
// valor compuesto solo por separadores (" . - ") se trata como intención de BORRAR el campo
// (-> null). Acá, en cambio, un valor NO VACÍO que normaliza a cadena vacía (ej. "---", solo
// separadores sin ningún dígito) debe RECHAZARSE, no convertirse en null en silencio — evita que
// alguien que quiso escribir un CUIT real y lo tipeó mal termine con el campo "limpio" sin
// darse cuenta. Por eso esta función NO colapsa a null cuando normalizarCuit() devuelve "" a
// partir de un input no vacío: deja pasar esa cadena vacía tal cual para que @IsNotEmpty() la
// rechace con un mensaje claro en el DTO que use este transform. Solo el valor verdaderamente
// vacío ("", o compuesto solo por espacios) es la intención inequívoca de borrar -> null.
export function normalizarCuitOpcional({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  if (value.trim() === "") return null;
  return normalizarCuit(value);
}

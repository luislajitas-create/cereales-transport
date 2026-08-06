import type { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-4: tipo del `tx` que Prisma construye para $transaction((tx) => ...). No se puede importar
// directamente (organizacion-prisma.client.ts no lo exporta — ver comentario ahí sobre por qué
// tx se redeclara de forma independiente al cliente de nivel superior), así que se deriva acá con
// utilidades de TypeScript en vez de tocar esa capa de aislamiento por un detalle de tipado.
type ClienteTransaccion = Parameters<OrganizacionPrismaClient["$transaction"]>[0] extends (tx: infer T) => any
  ? T
  : never;

// CAT-4, sección 4: marcador de origen para eventos generados por importación CSV. Se guarda
// como clave reservada dentro de datosNuevos — ningún campo real de Cliente/Transportista/
// Chofer/Vehiculo se llama "_origen", así que nunca se confunde con un dato de negocio genuino.
export const ORIGEN_IMPORTACION_CSV = "importacion_csv";
const CLAVE_ORIGEN = "_origen";

export function marcarOrigenImportacionCsv<T extends Record<string, unknown>>(snapshot: T): T & { _origen: string } {
  return { ...snapshot, [CLAVE_ORIGEN]: ORIGEN_IMPORTACION_CSV };
}

// CAT-4, sección 5: identificadores personales que se enmascaran (como máximo los últimos 4
// caracteres visibles) antes de persistirse en AuditLog. CUIT y patente quedan afuera a
// propósito — son identificadores comerciales, no personales (decisión confirmada explícitamente
// para este bloque). Comparación por nombre de clave, sin distinguir mayúsculas/minúsculas.
const CAMPOS_A_ENMASCARAR = new Set(["dni", "cuil", "telefono", "licencianumero"]);

// Segunda salvaguarda server-side (la primera es la allowlist de cada controller): si alguna vez
// aparece un campo cuyo nombre matchee esto, nunca se persiste en texto — mismo patrón que ya usa
// el frontend en AuditoriaAdministrativa.tsx (PATRON_CLAVE_SENSIBLE), replicado acá porque la
// sanitización previa al almacenamiento tiene que existir antes de que el dato llegue al
// frontend, no solo al mostrarlo.
const PATRON_CLAVE_SECRETA = /password|contrase|hash|token|secret|clave|authorization|cookie|api[_-]?key/i;

function enmascararConservandoUltimos4(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  const texto = String(valor);
  if (texto.length === 0) return texto;
  return `****${texto.slice(-4)}`;
}

// CAT-4, sección 1/5: única función central de sanitización antes de persistir un evento de
// AuditLog. Recursiva porque datosAnteriores/datosNuevos son Json arbitrario. La clave reservada
// CLAVE_ORIGEN nunca se enmascara ni se trata como dato personal — es metadata de este helper.
export function sanitizarParaAuditoria<T>(valor: T): T {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) {
    return valor.map((v) => sanitizarParaAuditoria(v)) as unknown as T;
  }
  if (typeof valor === "object") {
    if (valor instanceof Date) return valor as T;
    const resultado: Record<string, unknown> = {};
    for (const [clave, val] of Object.entries(valor as Record<string, unknown>)) {
      if (clave === CLAVE_ORIGEN) {
        resultado[clave] = val;
      } else if (PATRON_CLAVE_SECRETA.test(clave)) {
        resultado[clave] = "[oculto]";
      } else if (CAMPOS_A_ENMASCARAR.has(clave.toLowerCase())) {
        resultado[clave] = enmascararConservandoUltimos4(val);
      } else if (val && typeof val === "object") {
        resultado[clave] = sanitizarParaAuditoria(val);
      } else {
        resultado[clave] = val;
      }
    }
    return resultado as unknown as T;
  }
  return valor;
}

function normalizarParaComparar(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

// CAT-4, sección 3: compara dos snapshots YA construidos por la allowlist de cada entidad (nunca
// el objeto Prisma completo) y devuelve las claves cuyo valor realmente cambió. Compara sobre los
// valores CRUDOS (antes de enmascarar) — dos DNIs distintos que enmascararían igual no deben
// confundirse con "sin cambios". Evita generar eventos por PATCH idempotentes.
export function calcularCamposCambiados(antes: Record<string, unknown>, despues: Record<string, unknown>): string[] {
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const cambiadas: string[] = [];
  for (const clave of claves) {
    if (normalizarParaComparar(antes[clave]) !== normalizarParaComparar(despues[clave])) {
      cambiadas.push(clave);
    }
  }
  return cambiadas;
}

export function subconjunto<T extends Record<string, unknown>>(objeto: T, claves: string[]): Partial<T> {
  const resultado: Partial<T> = {};
  for (const clave of claves) {
    if (clave in objeto) (resultado as Record<string, unknown>)[clave] = objeto[clave];
  }
  return resultado;
}

interface DatosAuditoria {
  usuarioId: string;
  entidad: string;
  entidadId: string;
  accion: string;
  datosAnteriores?: Record<string, unknown> | null;
  datosNuevos?: Record<string, unknown> | null;
}

// CAT-4, sección 7: único punto que escribe AuditLog para Cliente/Transportista/Chofer/Vehiculo —
// evita repetir el mismo bloque tx.auditLog.create() en cada controller y garantiza que la
// sanitización se aplique siempre, sin depender de que cada call site se acuerde de invocarla.
// Recibe el `tx` de una transacción en curso: la atomicidad (mutación de negocio + este evento en
// el mismo $transaction) es responsabilidad de quien llama.
export async function registrarAuditoria(tx: ClienteTransaccion, datos: DatosAuditoria): Promise<void> {
  await tx.auditLog.create({
    data: {
      usuarioId: datos.usuarioId,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      accion: datos.accion,
      datosAnteriores: datos.datosAnteriores ? sanitizarParaAuditoria(datos.datosAnteriores) : undefined,
      datosNuevos: datos.datosNuevos ? sanitizarParaAuditoria(datos.datosNuevos) : undefined,
    },
  });
}

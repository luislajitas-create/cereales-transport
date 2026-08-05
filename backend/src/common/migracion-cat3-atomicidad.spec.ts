import * as fs from "fs";
import * as path from "path";

// CAT-3: Prisma Migrate NO envuelve automáticamente cada migration.sql en una transacción para
// PostgreSQL (es opt-in agregando BEGIN/COMMIT explícitos — confirmado por Prisma:
// https://www.prisma.io/blog/prisma-migrate-dx-primitives). Esta suite lee el ARCHIVO REAL de la
// migración (no una copia ni una reconstrucción) para verificar, de forma estática y sin
// necesitar una base de datos, que la migración es realmente atómica: BEGIN al inicio, COMMIT al
// final, todo entre medio, sin COMMIT intermedio, y cada chequeo de colisión antes de su UPDATE.
const RUTA_MIGRACION = path.join(
  __dirname,
  "../../prisma/migrations/20260804061709_normalizacion_transversal_identificadores_cat3/migration.sql",
);

// Filtra a las líneas de código real (sin comentarios de línea completa ni líneas vacías) para
// que un comentario en prosa que mencione "BEGIN" o "COMMIT" (como los que documentan esta misma
// migración) no dispare un falso positivo o negativo.
function lineasDeCodigo(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"));
}

describe("CAT-3 — migración de normalización: atomicidad real (BEGIN/COMMIT explícitos)", () => {
  const contenido = fs.readFileSync(RUTA_MIGRACION, "utf-8");
  const lineas = lineasDeCodigo(contenido);

  it("el archivo existe y tiene contenido", () => {
    expect(contenido.length).toBeGreaterThan(0);
  });

  it("BEGIN; (control de transacción) es la primera sentencia ejecutable del archivo", () => {
    expect(lineas[0]).toBe("BEGIN;");
  });

  it("COMMIT; es la última sentencia ejecutable del archivo", () => {
    expect(lineas[lineas.length - 1]).toBe("COMMIT;");
  });

  it("hay exactamente un BEGIN; y un COMMIT; de control de transacción en todo el archivo (sin COMMIT intermedio)", () => {
    // Los "BEGIN" dentro de los bloques DO $$ DECLARE ... BEGIN ... END $$; son PL/pgSQL, no
    // control de transacción — nunca aparecen como línea exacta "BEGIN;" (van sin punto y coma
    // en esa misma línea), así que la comparación exacta no los confunde con el BEGIN; real.
    const begins = lineas.filter((l) => l === "BEGIN;").length;
    const commits = lineas.filter((l) => l === "COMMIT;").length;
    expect(begins).toBe(1);
    expect(commits).toBe(1);
  });

  it("los cinco bloques DO $$ ... $$ y los cinco UPDATE están contenidos entre BEGIN; y COMMIT;", () => {
    const indiceBegin = lineas.indexOf("BEGIN;");
    const indiceCommit = lineas.indexOf("COMMIT;");
    const indicesDo = lineas.reduce<number[]>((acc, l, i) => (l === "DO $$" ? [...acc, i] : acc), []);
    const indicesUpdate = lineas.reduce<number[]>((acc, l, i) => (l.startsWith("UPDATE ") ? [...acc, i] : acc), []);

    expect(indicesDo).toHaveLength(5);
    expect(indicesUpdate).toHaveLength(5);
    [...indicesDo, ...indicesUpdate].forEach((i) => {
      expect(i).toBeGreaterThan(indiceBegin);
      expect(i).toBeLessThan(indiceCommit);
    });
  });

  it("ninguna sentencia de CÓDIGO del archivo es incompatible con ejecutarse dentro de una transacción explícita", () => {
    // Comandos que Postgres rechaza dentro de un bloque de transacción — ninguno debe aparecer
    // como código real. Se escanea solo `lineas` (sin comentarios) porque el comentario
    // explicativo de más arriba, a propósito, NOMBRA estos mismos comandos como ejemplos de lo
    // que NO hay en el archivo — buscar en el texto crudo se detectaría a sí mismo.
    const codigo = lineas.join("\n");
    const prohibidos = [
      /CREATE\s+INDEX\s+CONCURRENTLY/i,
      /REINDEX\s+CONCURRENTLY/i,
      /ALTER\s+TYPE\s+.+\s+ADD\s+VALUE/i,
      /\bVACUUM\b/i,
      /CREATE\s+DATABASE/i,
      /DROP\s+DATABASE/i,
      /ALTER\s+SYSTEM/i,
    ];
    prohibidos.forEach((patron) => expect(codigo).not.toMatch(patron));
  });

  describe("cada campo mantiene el chequeo de colisión (RAISE EXCEPTION) antes de su propio UPDATE", () => {
    // Anclas exactas de cada sección real del archivo (no solo "-- Campo": el comentario de
    // cabecera del archivo, más arriba, menciona los cinco campos en prosa — "Cliente.cuit,
    // Transportista.cuit,\nChofer.cuil, Chofer.dni y Vehiculo.patente" — y esa línea de prosa
    // también empieza con "-- Chofer.cuil"/"-- Chofer.dni", lo que da un falso positivo si se
    // busca solo ese texto. Cada ancla de acá incluye lo que sigue inmediatamente después en la
    // sección real (nunca presente en la prosa de la cabecera) para que el match sea inequívoco.
    const anclas = [
      "-- Cliente.cuit\nDO $$",
      "-- Transportista.cuit\nDO $$",
      "-- Chofer.cuil\nDO $$",
      "-- Chofer.dni (opcional:",
      "-- Vehiculo.patente\nDO $$",
    ];

    function inicioDeAncla(ancla: string): number {
      const idx = contenido.indexOf(ancla);
      expect(idx).toBeGreaterThanOrEqual(0);
      return idx;
    }

    it("las cinco anclas son inequívocas: cada una aparece una única vez en todo el archivo", () => {
      anclas.forEach((ancla) => {
        const primera = contenido.indexOf(ancla);
        const segunda = contenido.indexOf(ancla, primera + 1);
        expect(primera).toBeGreaterThanOrEqual(0);
        expect(segunda).toBe(-1);
      });
    });

    it.each([
      ["Cliente.cuit", 0],
      ["Transportista.cuit", 1],
      ["Chofer.cuil", 2],
      ["Chofer.dni", 3],
      ["Vehiculo.patente", 4],
    ])("%s: RAISE EXCEPTION antes de UPDATE dentro de su propia sección", (_nombre, idx) => {
      const i = idx as number;
      const inicio = inicioDeAncla(anclas[i]);
      const fin = i + 1 < anclas.length ? inicioDeAncla(anclas[i + 1]) : contenido.length;
      expect(fin).toBeGreaterThan(inicio);
      const bloque = contenido.slice(inicio, fin);

      const indiceRaise = bloque.indexOf("RAISE EXCEPTION");
      const indiceUpdate = bloque.indexOf("UPDATE ");
      expect(indiceRaise).toBeGreaterThanOrEqual(0);
      expect(indiceUpdate).toBeGreaterThan(indiceRaise);
    });
  });
});

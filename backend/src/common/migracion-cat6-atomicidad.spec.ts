import * as fs from "fs";
import * as path from "path";

// CAT-6: misma prueba estática que migracion-cat3-atomicidad.spec.ts, aplicada a la migración de
// normalización de CUIT en Organizacion/Productor. Lee el ARCHIVO REAL de la migración (no una
// copia) para confirmar, sin necesitar una base de datos, que es realmente atómica: BEGIN al
// inicio, COMMIT al final, sin COMMIT intermedio, y cada chequeo de colisión antes de su UPDATE.
const RUTA_MIGRACION = path.join(
  __dirname,
  "../../prisma/migrations/20260806185149_normalizacion_cuit_organizacion_productor_cat6/migration.sql",
);

function lineasDeCodigo(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"));
}

describe("CAT-6 — migración de normalización de CUIT (Organizacion/Productor): atomicidad real (BEGIN/COMMIT explícitos)", () => {
  const contenido = fs.readFileSync(RUTA_MIGRACION, "utf-8");
  const lineas = lineasDeCodigo(contenido);

  it("el archivo existe y tiene contenido", () => {
    expect(contenido.length).toBeGreaterThan(0);
  });

  it("BEGIN; es la primera sentencia ejecutable del archivo", () => {
    expect(lineas[0]).toBe("BEGIN;");
  });

  it("COMMIT; es la última sentencia ejecutable del archivo", () => {
    expect(lineas[lineas.length - 1]).toBe("COMMIT;");
  });

  it("hay exactamente un BEGIN; y un COMMIT; de control de transacción en todo el archivo (sin COMMIT intermedio)", () => {
    const begins = lineas.filter((l) => l === "BEGIN;").length;
    const commits = lineas.filter((l) => l === "COMMIT;").length;
    expect(begins).toBe(1);
    expect(commits).toBe(1);
  });

  it("los dos bloques DO $$ ... $$ y los cuatro UPDATE están contenidos entre BEGIN; y COMMIT;", () => {
    const indiceBegin = lineas.indexOf("BEGIN;");
    const indiceCommit = lineas.indexOf("COMMIT;");
    const indicesDo = lineas.reduce<number[]>((acc, l, i) => (l === "DO $$" ? [...acc, i] : acc), []);
    const indicesUpdate = lineas.reduce<number[]>((acc, l, i) => (l.startsWith("UPDATE ") ? [...acc, i] : acc), []);

    expect(indicesDo).toHaveLength(2);
    expect(indicesUpdate).toHaveLength(4); // Organizacion: ''->NULL + normalizar; Productor: ídem
    [...indicesDo, ...indicesUpdate].forEach((i) => {
      expect(i).toBeGreaterThan(indiceBegin);
      expect(i).toBeLessThan(indiceCommit);
    });
  });

  it("ninguna sentencia de CÓDIGO del archivo es incompatible con ejecutarse dentro de una transacción explícita", () => {
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

  describe("cada campo mantiene el chequeo de colisión (RAISE EXCEPTION) antes de sus propios UPDATE", () => {
    const anclas = ["-- Organizacion.cuit (restricción @unique GLOBAL", "-- Productor.cuit (restricción @@unique"];

    function inicioDeAncla(ancla: string): number {
      const idx = contenido.indexOf(ancla);
      expect(idx).toBeGreaterThanOrEqual(0);
      return idx;
    }

    it("las dos anclas son inequívocas: cada una aparece una única vez en todo el archivo", () => {
      anclas.forEach((ancla) => {
        const primera = contenido.indexOf(ancla);
        const segunda = contenido.indexOf(ancla, primera + 1);
        expect(primera).toBeGreaterThanOrEqual(0);
        expect(segunda).toBe(-1);
      });
    });

    it.each([
      ["Organizacion.cuit", 0],
      ["Productor.cuit", 1],
    ])("%s: dos RAISE EXCEPTION (colisión + valor inseguro) antes de sus UPDATE, dentro de su propia sección", (_nombre, idx) => {
      const i = idx as number;
      const inicio = inicioDeAncla(anclas[i]);
      const fin = i + 1 < anclas.length ? inicioDeAncla(anclas[i + 1]) : contenido.length;
      expect(fin).toBeGreaterThan(inicio);
      const bloque = contenido.slice(inicio, fin);

      const indicesRaise = [...bloque.matchAll(/RAISE EXCEPTION/g)].map((m) => m.index as number);
      const indicesUpdate = [...bloque.matchAll(/\nUPDATE /g)].map((m) => m.index as number);
      expect(indicesRaise).toHaveLength(2);
      expect(indicesUpdate).toHaveLength(2);
      // Ambos RAISE EXCEPTION (colisión, valor inseguro) ocurren antes que ambos UPDATE (''->NULL,
      // normalización general) de su misma sección.
      const ultimoRaise = Math.max(...indicesRaise);
      const primerUpdate = Math.min(...indicesUpdate);
      expect(primerUpdate).toBeGreaterThan(ultimoRaise);
    });
  });
});

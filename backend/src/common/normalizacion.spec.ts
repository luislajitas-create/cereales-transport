import { normalizarCuit, normalizarCuil, normalizarDni, normalizarPatente, siPresente, normalizarCuitOpcional } from "./normalizacion";

describe("normalizarCuit / normalizarCuil", () => {
  it("elimina guiones", () => {
    expect(normalizarCuit("30-12345678-9")).toBe("30123456789");
  });

  it("elimina puntos", () => {
    expect(normalizarCuit("30.12345678.9")).toBe("30123456789");
  });

  it("elimina espacios", () => {
    expect(normalizarCuit(" 30 12345678 9 ")).toBe("30123456789");
  });

  it("elimina combinaciones de guiones, puntos y espacios", () => {
    expect(normalizarCuit(" 30-1234.5678 - 9")).toBe("30123456789");
  });

  it("un valor ya normalizado queda igual (idempotencia)", () => {
    expect(normalizarCuit("30123456789")).toBe("30123456789");
  });

  it("aplicar el normalizador dos veces produce el mismo resultado", () => {
    const una = normalizarCuit("30-12345678-9");
    const dos = normalizarCuit(una);
    expect(dos).toBe(una);
  });

  it("cadena vacía se mantiene vacía", () => {
    expect(normalizarCuit("")).toBe("");
  });

  it("normalizarCuil es el mismo normalizador que CUIT (mismo formato)", () => {
    expect(normalizarCuil("20-30123456-4")).toBe(normalizarCuit("20-30123456-4"));
  });
});

describe("normalizarDni", () => {
  it("elimina puntos y espacios", () => {
    expect(normalizarDni("30.123.456")).toBe("30123456");
    expect(normalizarDni(" 30 123 456 ")).toBe("30123456");
  });

  it("vacío (opcional) devuelve undefined, nunca cadena vacía", () => {
    expect(normalizarDni("")).toBeUndefined();
  });

  it("compuesto solo por separadores devuelve undefined", () => {
    expect(normalizarDni(" . - ")).toBeUndefined();
  });

  it("un valor ya normalizado queda igual (idempotencia)", () => {
    expect(normalizarDni("30123456")).toBe("30123456");
  });

  it("aplicar el normalizador dos veces produce el mismo resultado", () => {
    const una = normalizarDni("30.123.456");
    const dos = normalizarDni(una as string);
    expect(dos).toBe(una);
  });
});

describe("normalizarPatente", () => {
  it("convierte a mayúsculas", () => {
    expect(normalizarPatente("ab123cd")).toBe("AB123CD");
  });

  it("elimina espacios", () => {
    expect(normalizarPatente("AB 123 CD")).toBe("AB123CD");
  });

  it("elimina guiones", () => {
    expect(normalizarPatente("AB-123-CD")).toBe("AB123CD");
  });

  it("elimina puntos", () => {
    expect(normalizarPatente("A.B.1.2.3.C.D")).toBe("AB123CD");
  });

  it("aplica trim a espacios exteriores", () => {
    expect(normalizarPatente("  AB123CD  ")).toBe("AB123CD");
  });

  it("preserva formatos históricos (ej. patente vieja de 3+3, sin exigir formato Mercosur)", () => {
    expect(normalizarPatente("abc123")).toBe("ABC123");
  });

  it("un valor ya normalizado queda igual (idempotencia)", () => {
    expect(normalizarPatente("AB123CD")).toBe("AB123CD");
  });

  it("aplicar el normalizador dos veces produce el mismo resultado", () => {
    const una = normalizarPatente("ab-123-cd");
    const dos = normalizarPatente(una);
    expect(dos).toBe(una);
  });
});

describe("siPresente", () => {
  it("normaliza cuando el valor es un string presente", () => {
    const transform = siPresente(normalizarCuit);
    expect(transform({ value: "30-12345678-9" })).toBe("30123456789");
  });

  it("deja pasar undefined intacto (no inyecta un valor en un PATCH parcial que no toca el campo)", () => {
    const transform = siPresente(normalizarCuit);
    expect(transform({ value: undefined })).toBeUndefined();
  });

  it("deja pasar null intacto", () => {
    const transform = siPresente(normalizarCuit);
    expect(transform({ value: null })).toBeNull();
  });

  it("deja pasar un valor no-string intacto (para que @IsString() reporte el error real)", () => {
    const transform = siPresente(normalizarCuit);
    expect(transform({ value: 12345 })).toBe(12345);
  });
});

// CAT-6: transform para CUIT opcional (Organizacion.cuit en edición, Productor.cuit en alta y
// edición) — semántica deliberadamente distinta de normalizarDniEdicion (ver el comentario en
// normalizacion.ts): "" borra (-> null), pero un valor no vacío que normaliza a vacío se rechaza,
// nunca se limpia en silencio.
describe("normalizarCuitOpcional", () => {
  it("normaliza un CUIT con guiones/puntos/espacios", () => {
    expect(normalizarCuitOpcional({ value: "30-12345678-9" })).toBe("30123456789");
  });

  it("deja pasar undefined intacto (PATCH que no toca el campo)", () => {
    expect(normalizarCuitOpcional({ value: undefined })).toBeUndefined();
  });

  it("deja pasar null intacto", () => {
    expect(normalizarCuitOpcional({ value: null })).toBeNull();
  });

  it('"" (cadena vacía) es una intención explícita de borrar -> null', () => {
    expect(normalizarCuitOpcional({ value: "" })).toBeNull();
  });

  it("solo espacios también es intención de borrar -> null", () => {
    expect(normalizarCuitOpcional({ value: "   " })).toBeNull();
  });

  it("un valor NO vacío que normaliza a cadena vacía (solo separadores) NO se convierte en null — se deja pasar tal cual para que @IsNotEmpty() lo rechace", () => {
    expect(normalizarCuitOpcional({ value: " . - " })).toBe("");
  });

  it("deja pasar un valor no-string intacto", () => {
    expect(normalizarCuitOpcional({ value: 12345 })).toBe(12345);
  });

  it("un valor ya canónico queda igual (idempotencia)", () => {
    expect(normalizarCuitOpcional({ value: "30123456789" })).toBe("30123456789");
  });
});

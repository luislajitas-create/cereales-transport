import { mensajeUnico } from "./prisma-mensajes";

// CAT-3: mensajeUnico() traduce el `meta.target` de un P2002 real a un mensaje legible. Como el
// sistema entero usa restricciones compuestas @@unique([organizacionId, campo]) (unicidad por
// organización, nunca global — Bloque 8.1.d), Prisma siempre informa "organizacionId" junto al
// campo comercial real en `target`. Esta suite prueba que "organizacionId" (y "id") se excluyen
// del mensaje visible, sin ocultar el campo comercial que realmente identifica la colisión, y que
// el artículo ("este"/"esta") es gramaticalmente correcto para cada campo — nunca se arma a mano
// en cada llamador, todo sale de un único mapeo centralizado.
describe("mensajeUnico", () => {
  it("[organizacionId, cuit] -> Cliente/Transportista: 'Ya existe un registro con este CUIT'", () => {
    expect(mensajeUnico(["organizacionId", "cuit"])).toBe("Ya existe un registro con este CUIT");
  });

  it("[organizacionId, cuil] -> Chofer: 'Ya existe un registro con este CUIL'", () => {
    expect(mensajeUnico(["organizacionId", "cuil"])).toBe("Ya existe un registro con este CUIL");
  });

  it("[organizacionId, dni] -> Chofer: 'Ya existe un registro con este DNI'", () => {
    expect(mensajeUnico(["organizacionId", "dni"])).toBe("Ya existe un registro con este DNI");
  });

  it("[organizacionId, patente] -> Vehículo: 'Ya existe un registro con esta patente' (patente es femenino)", () => {
    expect(mensajeUnico(["organizacionId", "patente"])).toBe("Ya existe un registro con esta patente");
  });

  it("el orden de los campos en target no importa: organizacionId primero o segundo da el mismo resultado", () => {
    expect(mensajeUnico(["cuit", "organizacionId"])).toBe("Ya existe un registro con este CUIT");
    expect(mensajeUnico(["patente", "organizacionId"])).toBe("Ya existe un registro con esta patente");
  });

  it("target como string único (no array) también excluye organizacionId", () => {
    expect(mensajeUnico("organizacionId")).toBe("Ya existe un registro con estos datos");
    expect(mensajeUnico("cuit")).toBe("Ya existe un registro con este CUIT");
  });

  it("fallback desconocido: un campo comercial no mapeado no se expone tal cual -> mensaje genérico seguro", () => {
    expect(mensajeUnico(["organizacionId", "razonSocial"])).toBe("Ya existe un registro con estos datos");
  });

  it("fallback seguro: target vacío -> mensaje genérico, nunca 'este ' sin nada después", () => {
    expect(mensajeUnico([])).toBe("Ya existe un registro con estos datos");
    expect(mensajeUnico(undefined)).toBe("Ya existe un registro con estos datos");
  });

  it("fallback seguro: target compuesto ÚNICAMENTE por campos técnicos -> mensaje genérico", () => {
    expect(mensajeUnico(["organizacionId"])).toBe("Ya existe un registro con estos datos");
    expect(mensajeUnico(["organizacionId", "id"])).toBe("Ya existe un registro con estos datos");
  });

  it("fallback seguro: más de un campo comercial reconocido -> ninguna restricción real del sistema combina dos, se evita adivinar el artículo", () => {
    expect(mensajeUnico(["cuit", "email"])).toBe("Ya existe un registro con estos datos");
  });
});

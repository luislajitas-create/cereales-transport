import { parsearCsv, filasComoObjetos } from "./csv";

describe("parsearCsv (CAT-1)", () => {
  it("parsea filas simples separadas por coma", () => {
    const resultado = parsearCsv("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");
    expect(resultado).toEqual([
      ["razonSocial", "cuit"],
      ["Cliente Uno", "30-11111111-1"],
      ["Cliente Dos", "30-22222222-2"],
    ]);
  });

  it("respeta campos entre comillas que contienen comas", () => {
    const resultado = parsearCsv('razonSocial,cuit\n"Cereales, S.A.",30-11111111-1');
    expect(resultado).toEqual([
      ["razonSocial", "cuit"],
      ["Cereales, S.A.", "30-11111111-1"],
    ]);
  });

  it("respeta comillas dobles escapadas dentro de un campo entre comillas", () => {
    const resultado = parsearCsv('razonSocial,cuit\n"El ""Mejor"" Cliente",30-11111111-1');
    expect(resultado[1][0]).toBe('El "Mejor" Cliente');
  });

  it("descarta líneas completamente vacías", () => {
    const resultado = parsearCsv("razonSocial,cuit\nCliente Uno,30-11111111-1\n\n\n");
    expect(resultado).toHaveLength(2);
  });

  it("maneja saltos de línea CRLF (exports típicos de Windows/Excel)", () => {
    const resultado = parsearCsv("razonSocial,cuit\r\nCliente Uno,30-11111111-1\r\n");
    expect(resultado).toEqual([
      ["razonSocial", "cuit"],
      ["Cliente Uno", "30-11111111-1"],
    ]);
  });
});

describe("filasComoObjetos (CAT-1)", () => {
  it("mapea filas por nombre de encabezado, no por posición", () => {
    const filas = parsearCsv("cuit,razonSocial\n30-11111111-1,Cliente Uno");
    expect(filasComoObjetos(filas)).toEqual([{ cuit: "30-11111111-1", razonSocial: "Cliente Uno" }]);
  });

  it("devuelve string vacío para columnas faltantes en una fila", () => {
    const filas = [
      ["razonSocial", "cuit", "domicilio"],
      ["Cliente Uno", "30-11111111-1"],
    ];
    expect(filasComoObjetos(filas)).toEqual([{ razonSocial: "Cliente Uno", cuit: "30-11111111-1", domicilio: "" }]);
  });

  it("devuelve array vacío si no hay filas", () => {
    expect(filasComoObjetos([])).toEqual([]);
  });
});

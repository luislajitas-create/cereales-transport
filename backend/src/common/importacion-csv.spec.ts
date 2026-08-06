import { esDuplicadoEnArchivo } from "./importacion-csv";

describe("esDuplicadoEnArchivo", () => {
  it("la primera aparición de una clave no es duplicado, y queda registrada", () => {
    const vistas = new Set<string>();
    expect(esDuplicadoEnArchivo("30111111111", vistas)).toBe(false);
    expect(vistas.has("30111111111")).toBe(true);
  });

  it("la segunda aparición de la misma clave sí es duplicado", () => {
    const vistas = new Set<string>();
    esDuplicadoEnArchivo("30111111111", vistas);
    expect(esDuplicadoEnArchivo("30111111111", vistas)).toBe(true);
  });

  it("una clave vacía nunca se marca como duplicada, ni siquiera consigo misma", () => {
    const vistas = new Set<string>();
    expect(esDuplicadoEnArchivo("", vistas)).toBe(false);
    expect(esDuplicadoEnArchivo("", vistas)).toBe(false);
    expect(vistas.has("")).toBe(false);
  });

  it("claves distintas no interfieren entre sí", () => {
    const vistas = new Set<string>();
    expect(esDuplicadoEnArchivo("30111111111", vistas)).toBe(false);
    expect(esDuplicadoEnArchivo("30222222222", vistas)).toBe(false);
    expect(esDuplicadoEnArchivo("30111111111", vistas)).toBe(true);
    expect(esDuplicadoEnArchivo("30222222222", vistas)).toBe(true);
  });
});

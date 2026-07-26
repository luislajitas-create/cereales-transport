import { NotFoundException } from "@nestjs/common";
import { encontrarOFallar } from "./encontrar-o-fallar";

describe("encontrarOFallar", () => {
  it("devuelve el valor si no es null ni undefined", () => {
    expect(encontrarOFallar({ id: "1" }, "no encontrado")).toEqual({ id: "1" });
  });

  it("preserva valores falsy legítimos (0, cadena vacía)", () => {
    expect(encontrarOFallar(0, "no encontrado")).toBe(0);
    expect(encontrarOFallar("", "no encontrado")).toBe("");
  });

  it("lanza NotFoundException con el mensaje exacto si el valor es null", () => {
    expect(() => encontrarOFallar(null, "Cliente no encontrado.")).toThrow(NotFoundException);
    expect(() => encontrarOFallar(null, "Cliente no encontrado.")).toThrow("Cliente no encontrado.");
  });

  it("lanza NotFoundException con el mensaje exacto si el valor es undefined", () => {
    expect(() => encontrarOFallar(undefined, "Transportista no encontrado.")).toThrow(NotFoundException);
    expect(() => encontrarOFallar(undefined, "Transportista no encontrado.")).toThrow("Transportista no encontrado.");
  });
});

import { esCuitValido } from "./cuit";

describe("esCuitValido", () => {
  it("acepta un CUIT con dígito verificador correcto", () => {
    expect(esCuitValido("20123456786")).toBe(true);
  });

  it.each(["20123456780", "20123456781", "27304567891", "30500000010"])(
    "rechaza %s por dígito verificador incorrecto",
    (cuit) => {
      expect(esCuitValido(cuit)).toBe(false);
    },
  );

  it("rechaza longitudes distintas de 11", () => {
    expect(esCuitValido("2012345678")).toBe(false);
    expect(esCuitValido("201234567860")).toBe(false);
  });

  it("rechaza valores con caracteres no numéricos", () => {
    expect(esCuitValido("20-12345678-6")).toBe(false);
    expect(esCuitValido("2012345678a")).toBe(false);
  });

  it("rechaza vacío", () => {
    expect(esCuitValido("")).toBe(false);
  });
});

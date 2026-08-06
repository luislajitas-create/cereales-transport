import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateOrganizacionDto } from "./update-organizacion.dto";

// CAT-6 (corrección tras revisión): la edición de Organización sigue el mismo pipeline que el
// alta (alta-organizacion.dto.spec.ts) — normalizar -> exigir 11 dígitos -> dígito verificador —
// pero OPCIONAL: omitido/null/vacío no fuerzan la validación de formato, solo un valor realmente
// presente la dispara. "20123456786" es el mismo CUIT válido reutilizado en el resto de la
// suite (dígito verificador correcto, confirmado en common/cuit.spec.ts).
describe("UpdateOrganizacionDto — CUIT (CAT-6)", () => {
  it("CUIT humano (con guiones) válido -> normaliza a canónico y pasa validación", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "20-12345678-6" });
    expect(dto.cuit).toBe("20123456786");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("CUIT ya canónico y válido pasa sin cambios", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "20123456786" });
    expect(dto.cuit).toBe("20123456786");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("CUIT con longitud incorrecta (10 dígitos) se rechaza", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "2012345678" });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === "cuit")).toBeDefined();
  });

  it("CUIT con longitud incorrecta (12 dígitos) se rechaza", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "201234567860" });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === "cuit")).toBeDefined();
  });

  it("CUIT de 11 dígitos con dígito verificador incorrecto se rechaza", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "20123456780" });
    const errores = await validate(dto);
    const errorCuit = errores.find((e) => e.property === "cuit");
    expect(errorCuit).toBeDefined();
    expect(errorCuit?.constraints).toHaveProperty("esCuitValido");
  });

  it("cuit: null está permitido -> limpia el campo, sin error de validación", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: null });
    expect(dto.cuit).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it('cuit: "" (vacío) transforma a null -> limpia, sin error', async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "" });
    expect(dto.cuit).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("cuit compuesto solo por espacios también transforma a null -> limpia, sin error", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: "   " });
    expect(dto.cuit).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("cuit omitido queda undefined -> Prisma no lo toca, sin error de validación", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { nombre: "Nuevo nombre" });
    expect(dto.cuit).toBeUndefined();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("cuit compuesto solo por separadores (sin ningún dígito) se rechaza — nunca se limpia en silencio", async () => {
    const dto = plainToInstance(UpdateOrganizacionDto, { cuit: " . - " });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === "cuit")).toBeDefined();
    // No debe haberse convertido en null: si lo hiciera, no habría error de validación.
    expect(dto.cuit).not.toBeNull();
  });
});

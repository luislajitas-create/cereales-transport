import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductorDto } from "./create-productor.dto";
import { UpdateProductorDto } from "./update-productor.dto";

// CAT-6: normalización de CUIT en Productor (alta y edición) — mismo criterio que
// UpdateOrganizacionDto (ver ese spec y normalizarCuitOpcional() en common/normalizacion.ts).
describe("CreateProductorDto — CUIT (CAT-6)", () => {
  it("normaliza un CUIT con guiones/puntos/espacios a solo dígitos", async () => {
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "30-12345678-9" });
    expect(dto.cuit).toBe("30123456789");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("cuit omitido queda undefined — alta sin CUIT es válida (campo opcional)", async () => {
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X" });
    expect(dto.cuit).toBeUndefined();
    expect(await validate(dto)).toHaveLength(0);
  });

  it('cuit: "" normaliza a null (equivalente a no informarlo)', async () => {
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "" });
    expect(dto.cuit).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("un valor no vacío que normaliza a cadena vacía se rechaza", async () => {
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "---" });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === "cuit")).toBeDefined();
  });
});

describe("UpdateProductorDto — CUIT (CAT-6)", () => {
  it("normaliza un CUIT con guiones a solo dígitos", async () => {
    const dto = plainToInstance(UpdateProductorDto, { cuit: "30.111.111.11-1" });
    expect(dto.cuit).toBe("30111111111");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("cuit no enviado queda undefined (Prisma no lo toca)", () => {
    const dto = plainToInstance(UpdateProductorDto, { nombre: "Nuevo nombre" });
    expect(dto.cuit).toBeUndefined();
  });

  it('cuit: "" normaliza a null (borra el CUIT)', async () => {
    const dto = plainToInstance(UpdateProductorDto, { cuit: "" });
    expect(dto.cuit).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("un valor no vacío que normaliza a cadena vacía se rechaza", async () => {
    const dto = plainToInstance(UpdateProductorDto, { cuit: " . - " });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === "cuit")).toBeDefined();
  });
});

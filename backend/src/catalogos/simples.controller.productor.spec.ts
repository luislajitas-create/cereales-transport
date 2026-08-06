import { Prisma } from "@prisma/client";
import { ProductoresController } from "./simples.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateProductorDto } from "./dto/create-productor.dto";
import { UpdateProductorDto } from "./dto/update-productor.dto";
import { plainToInstance } from "class-transformer";

// CAT-6: ProductoresController no tiene AuditLog (nunca lo tuvo — fuera de alcance de este
// bloque, ver AUDITORIA_CATALOGOS.md sección CAT-6) ni detección proactiva de duplicados (nunca
// la tuvo, a diferencia de las importaciones CSV de CAT-2/CAT-5) — estas pruebas cubren
// exclusivamente que el CUIT llega canónico a Prisma (la normalización real vive en el DTO, ver
// productor.dto.spec.ts) y que un P2002 real se propaga sin modificar hacia el filtro global
// (mensajeUnico(), ya probado genéricamente en prisma-mensajes.spec.ts).
function crearPrismaMock(overrides: Partial<{ create: jest.Mock; update: jest.Mock }> = {}) {
  const create = overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-1", ...data }));
  const update = overrides.update ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-1", ...data }));
  const prisma = { productor: { create, update } } as unknown as OrganizacionPrismaClient;
  return { prisma, create, update };
}

describe("ProductoresController — CUIT canónico (CAT-6)", () => {
  it("create() persiste el CUIT ya normalizado (la normalización ocurre en el DTO, antes del controller)", async () => {
    const { prisma, create } = crearPrismaMock();
    const controller = new ProductoresController(prisma);
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "30-11111111-1" });

    await controller.create(dto);

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ nombre: "Productor X", cuit: "30111111111" }) });
  });

  it("update() persiste el CUIT ya normalizado", async () => {
    const { prisma, update } = crearPrismaMock();
    const controller = new ProductoresController(prisma);
    const dto = plainToInstance(UpdateProductorDto, { cuit: "30.222.222.222" });

    await controller.update("prod-1", dto);

    expect(update).toHaveBeenCalledWith({ where: { id: "prod-1" }, data: expect.objectContaining({ cuit: "30222222222" }) });
  });

  it("un P2002 real (CUIT duplicado en la organización) se propaga sin modificar hacia el filtro global", async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`organizacionId`,`cuit`)", {
        code: "P2002",
        clientVersion: "5.0.0",
        meta: { target: ["organizacionId", "cuit"] },
      }),
    );
    const { prisma } = crearPrismaMock({ create });
    const controller = new ProductoresController(prisma);
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "30-11111111-1" });

    await expect(controller.create(dto)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  // CAT-6: la unicidad real de Productor.cuit es @@unique([organizacionId, cuit]) — por
  // organización, no global — y su cumplimiento vive en la restricción de la base + la extensión
  // de aislamiento (ya probada en organizacion-prisma.client.spec.ts), no en este controller (que
  // nunca construye ni filtra por organizacionId a mano). Esta prueba demuestra, a nivel de
  // código, que el controller no agrega ninguna comparación manual entre organizaciones que
  // pudiera bloquear el mismo CUIT en dos organizaciones distintas: dos instancias del
  // controller, cada una con su propio mock de creación (simulando dos organizaciones separadas),
  // crean exitosamente un Productor con el mismo CUIT normalizado.
  it("el mismo CUIT normalizado no es rechazado por el controller en dos organizaciones distintas (aislamiento real vive en la extensión/DB, no acá)", async () => {
    const mockOrgA = crearPrismaMock();
    const mockOrgB = crearPrismaMock();
    const controllerOrgA = new ProductoresController(mockOrgA.prisma);
    const controllerOrgB = new ProductoresController(mockOrgB.prisma);
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor Compartido", cuit: "30-11111111-1" });

    await expect(controllerOrgA.create(dto)).resolves.toBeDefined();
    await expect(controllerOrgB.create(dto)).resolves.toBeDefined();
    expect(mockOrgA.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cuit: "30111111111" }) });
    expect(mockOrgB.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cuit: "30111111111" }) });
  });
});

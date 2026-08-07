import { Prisma } from "@prisma/client";
import { ProductoresController } from "./simples.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateProductorDto } from "./dto/create-productor.dto";
import { UpdateProductorDto } from "./dto/update-productor.dto";
import { plainToInstance } from "class-transformer";

// CAT-6 + CAT-7: estas pruebas cubren exclusivamente que el CUIT llega canónico a Prisma (la
// normalización real vive en el DTO, ver productor.dto.spec.ts) y que un P2002 real se propaga
// sin modificar hacia el filtro global (mensajeUnico(), ya probado genéricamente en
// prisma-mensajes.spec.ts). Desde CAT-7, create()/update() corren dentro de un $transaction (ver
// simples.controller.auditoria.spec.ts para la cobertura de AuditLog) — el mock de acá simula ese
// tx mínimamente, solo lo necesario para que estas pruebas sigan siendo honestas.
const ACTOR = { id: "user-1" };

function crearPrismaMock(overrides: Partial<{ create: jest.Mock; update: jest.Mock; findUnique: jest.Mock }> = {}) {
  const create = overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-1", ...data }));
  const update = overrides.update ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-1", nombre: "Productor X", cuit: null, localidad: null, ...data }));
  const findUnique = overrides.findUnique ?? jest.fn().mockResolvedValue({ id: "prod-1", nombre: "Productor X", cuit: null, localidad: null });
  const tx = {
    productor: { create, update, findUnique },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
  return { prisma, create, update, findUnique, tx };
}

describe("ProductoresController — CUIT canónico (CAT-6/CAT-7)", () => {
  it("create() persiste el CUIT ya normalizado (la normalización ocurre en el DTO, antes del controller)", async () => {
    const { prisma, create } = crearPrismaMock();
    const controller = new ProductoresController(prisma);
    const dto = plainToInstance(CreateProductorDto, { nombre: "Productor X", cuit: "30-11111111-1" });

    await controller.create(dto, ACTOR);

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ nombre: "Productor X", cuit: "30111111111" }) });
  });

  it("update() persiste el CUIT ya normalizado", async () => {
    const { prisma, update } = crearPrismaMock();
    const controller = new ProductoresController(prisma);
    const dto = plainToInstance(UpdateProductorDto, { cuit: "30.222.222.222" });

    await controller.update("prod-1", dto, ACTOR);

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

    await expect(controller.create(dto, ACTOR)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
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

    await expect(controllerOrgA.create(dto, ACTOR)).resolves.toBeDefined();
    await expect(controllerOrgB.create(dto, ACTOR)).resolves.toBeDefined();
    expect(mockOrgA.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cuit: "30111111111" }) });
    expect(mockOrgB.create).toHaveBeenCalledWith({ data: expect.objectContaining({ cuit: "30111111111" }) });
  });
});

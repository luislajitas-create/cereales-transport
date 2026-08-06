import { Prisma } from "@prisma/client";
import { OrganizacionController } from "./organizacion.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-6: confirma que actualizar() persiste y audita el CUIT ya canónico (la normalización real
// ocurre en UpdateOrganizacionDto, antes de que este método reciba `body` — ver
// update-organizacion.dto.spec.ts) y que un P2002 real (duplicado de CUIT) se propaga sin
// modificar hacia el filtro global, sin generar AuditLog. Mismo criterio de mock que
// organizacion.controller.auditoria-opciones.spec.ts (FAC-4) — sin DB real.
const ACTOR = { id: "user-1", organizacionId: "org-1" };

function crearPrismaMock(overrides: Partial<{ update: jest.Mock }> = {}) {
  const anterior = { id: "org-1", nombre: "Acme", razonSocial: null, cuit: "30111111111", domicilio: null, telefono: null, email: null, zonaHoraria: null, moneda: null, createdAt: new Date() };
  const findUnique = jest.fn().mockResolvedValue(anterior);
  const update = overrides.update ?? jest.fn().mockResolvedValue({ ...anterior, cuit: "30222222222" });
  const auditLog = { create: jest.fn().mockResolvedValue({}) };
  const prisma = {
    organizacion: { findUnique, update },
    auditLog,
  } as unknown as OrganizacionPrismaClient;
  return { prisma, findUnique, update, auditLog, anterior };
}

describe("OrganizacionController.actualizar — CUIT canónico en AuditLog (CAT-6)", () => {
  it("el AuditLog registra el CUIT ya normalizado, tanto en datosAnteriores como en datosNuevos", async () => {
    const { prisma, auditLog } = crearPrismaMock();
    const controller = new OrganizacionController(prisma);

    // El body ya llega normalizado por UpdateOrganizacionDto — el controller no normaliza nada
    // por su cuenta, solo persiste y audita lo que recibe.
    await controller.actualizar({ cuit: "30222222222" } as any, ACTOR);

    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const evento = (auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(evento.entidad).toBe("Organizacion");
    expect(evento.accion).toBe("organizacion_editada");
    expect(evento.datosAnteriores.cuit).toBe("30111111111");
    expect(evento.datosNuevos.cuit).toBe("30222222222");
  });

  it("un P2002 real (CUIT duplicado) durante update() se propaga sin modificar, sin generar AuditLog", async () => {
    const update = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`cuit`)", {
        code: "P2002",
        clientVersion: "5.0.0",
        meta: { target: ["cuit"] },
      }),
    );
    const { prisma, auditLog } = crearPrismaMock({ update });
    const controller = new OrganizacionController(prisma);

    await expect(controller.actualizar({ cuit: "30222222222" } as any, ACTOR)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(auditLog.create).not.toHaveBeenCalled();
  });
});

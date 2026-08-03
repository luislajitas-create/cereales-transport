import { OrganizacionController } from "./organizacion.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// FAC-4: mismo criterio de mock que facturas.controller.pagination.spec.ts — sin DB real. El
// aislamiento por organización de groupBy() está probado con datos reales de dos organizaciones
// distintas en organizacion-prisma.client.spec.ts (sección G) — acá solo se cubre la forma de
// los datos que arma el controller (orden, deduplicación, delegación sin filtro manual).
function crearPrismaMock(entidades: { entidad: string }[], acciones: { accion: string }[]) {
  return {
    auditLog: {
      groupBy: jest.fn().mockResolvedValueOnce(entidades).mockResolvedValueOnce(acciones),
    },
  } as unknown as OrganizacionPrismaClient;
}

describe("OrganizacionController.auditoriaOpciones (FAC-4)", () => {
  it("devuelve entidades y acciones reales, ordenadas alfabéticamente", async () => {
    const prisma = crearPrismaMock(
      [{ entidad: "Usuario" }, { entidad: "Cobranza" }, { entidad: "GrupoEconomico" }],
      [{ accion: "usuario_creado" }, { accion: "anular" }, { accion: "crear" }],
    );
    const controller = new OrganizacionController(prisma);

    const resultado = await controller.auditoriaOpciones();

    expect(resultado).toEqual({
      entidades: ["Cobranza", "GrupoEconomico", "Usuario"],
      acciones: ["anular", "crear", "usuario_creado"],
    });
  });

  it("no aplica ningún filtro manual de organizacionId — delega por completo en la extensión de aislamiento (Bloque 8.1.d)", async () => {
    const prisma = crearPrismaMock([], []);
    const controller = new OrganizacionController(prisma);

    await controller.auditoriaOpciones();

    expect(prisma.auditLog.groupBy).toHaveBeenNthCalledWith(1, { by: ["entidad"] });
    expect(prisma.auditLog.groupBy).toHaveBeenNthCalledWith(2, { by: ["accion"] });
  });

  it("no genera duplicados: cada valor de agrupación aparece una sola vez", async () => {
    const prisma = crearPrismaMock([{ entidad: "Cobranza" }, { entidad: "Usuario" }], [{ accion: "crear" }]);
    const controller = new OrganizacionController(prisma);

    const resultado = await controller.auditoriaOpciones();

    expect(new Set(resultado.entidades).size).toBe(resultado.entidades.length);
    expect(new Set(resultado.acciones).size).toBe(resultado.acciones.length);
  });

  it("responde listas vacías cuando la organización todavía no tiene eventos de auditoría", async () => {
    const prisma = crearPrismaMock([], []);
    const controller = new OrganizacionController(prisma);

    const resultado = await controller.auditoriaOpciones();

    expect(resultado).toEqual({ entidades: [], acciones: [] });
  });
});

import { OrganizacionController } from "./organizacion.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { ZONA_ARGENTINA_DEFECTO } from "../common/rango-fechas";

// UX-FIN-1 (corrección): AuditLog.fecha es un timestamp real (@default(now())), a diferencia de
// Viaje.fecha — el rango fechaDesde/fechaHasta debe representar el día calendario LOCAL de la
// organización (zonaHoraria si es válida, si no America/Argentina/Salta), no el día calendario
// UTC. Estos tests cubren directamente el caso reportado: un evento tardío del día local (ej.
// 22:30 en Argentina/Salta = 01:30Z del día siguiente) debe quedar incluido.
function crearPrisma(zonaHoraria: string | null = null) {
  const count = jest.fn().mockResolvedValue(0);
  const findMany = jest.fn().mockResolvedValue([]);
  const findUnique = jest.fn().mockResolvedValue({ zonaHoraria });
  const prisma = { auditLog: { count, findMany }, organizacion: { findUnique } };
  return { prisma: prisma as unknown as OrganizacionPrismaClient, count, findMany, findUnique };
}

const ACTOR = { id: "usr-1", organizacionId: "org-1" };

describe("OrganizacionController.auditoria() — rango de fechas en zona local (UX-FIN-1)", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it("sin zonaHoraria configurada, usa el fallback America/Argentina/Salta", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);

    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, "2026-08-01", "2026-08-07");

    const limite: Date = findMany.mock.calls[0][0].where.fecha.lte;
    expect(limite.toISOString()).toBe("2026-08-08T02:59:59.999Z"); // 23:59:59.999 Salta
  });

  it("con zonaHoraria inválida en el registro, usa el fallback en vez de romper", async () => {
    const { prisma, findMany } = crearPrisma("Zona/Invalida");
    const controller = new OrganizacionController(prisma);

    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, "2026-08-07");

    const limite: Date = findMany.mock.calls[0][0].where.fecha.lte;
    expect(limite.toISOString()).toBe("2026-08-08T02:59:59.999Z");
  });

  it("con zonaHoraria válida configurada, la respeta en vez del fallback", async () => {
    const { prisma, findMany } = crearPrisma("UTC");
    const controller = new OrganizacionController(prisma);

    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, "2026-08-07");

    const limite: Date = findMany.mock.calls[0][0].where.fecha.lte;
    expect(limite.toISOString()).toBe("2026-08-07T23:59:59.999Z"); // 23:59:59.999 UTC, no Salta
  });

  it("evento 00:00:00.000 local incluido (fechaDesde)", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, "2026-08-07", undefined);

    const desde: Date = findMany.mock.calls[0][0].where.fecha.gte;
    const evento = new Date("2026-08-07T03:00:00.000Z"); // 00:00:00.000 Salta
    expect(evento.getTime() >= desde.getTime()).toBe(true);
  });

  it("evento 23:59:59.999 local incluido (fechaHasta)", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, "2026-08-07");

    const hasta: Date = findMany.mock.calls[0][0].where.fecha.lte;
    const evento = new Date("2026-08-08T02:59:59.999Z"); // 23:59:59.999 Salta
    expect(evento.getTime() <= hasta.getTime()).toBe(true);
  });

  it("evento del día local anterior queda excluido del límite 'desde'", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, "2026-08-07", undefined);

    const desde: Date = findMany.mock.calls[0][0].where.fecha.gte;
    const eventoDiaAnterior = new Date("2026-08-07T02:59:59.999Z"); // 23:59:59.999 Salta del 06/08
    expect(eventoDiaAnterior.getTime() >= desde.getTime()).toBe(false);
  });

  it("evento del día local siguiente queda excluido del límite 'hasta'", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, "2026-08-07");

    const hasta: Date = findMany.mock.calls[0][0].where.fecha.lte;
    const eventoDiaSiguiente = new Date("2026-08-08T03:00:00.000Z"); // 00:00:00.000 Salta del 08/08
    expect(eventoDiaSiguiente.getTime() <= hasta.getTime()).toBe(false);
  });

  it("caso reportado: evento 22:30 Argentina/Salta (01:30Z del día siguiente) queda incluido en 'hasta 07/08'", async () => {
    const { prisma, findMany } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, "2026-08-07");

    const hasta: Date = findMany.mock.calls[0][0].where.fecha.lte;
    const evento = new Date("2026-08-08T01:30:00.000Z");
    expect(evento.getTime() <= hasta.getTime()).toBe(true);
  });

  it("el resultado es independiente de process.env.TZ", async () => {
    const resultados: string[] = [];
    for (const tz of ["UTC", "America/Argentina/Buenos_Aires", ""]) {
      process.env.TZ = tz;
      const { prisma, findMany } = crearPrisma(null);
      const controller = new OrganizacionController(prisma);
      await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, "2026-08-01", "2026-08-07");
      resultados.push(
        `${findMany.mock.calls[0][0].where.fecha.gte.toISOString()}|${findMany.mock.calls[0][0].where.fecha.lte.toISOString()}`,
      );
    }
    expect(new Set(resultados).size).toBe(1);
  });

  it("consulta la organización del actor (no confía en un id ajeno) para resolver la zona", async () => {
    const { prisma, findUnique } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, "2026-08-01", "2026-08-07");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: ACTOR.organizacionId }, select: { zonaHoraria: true } });
  });

  it("sin fechaDesde ni fechaHasta: no aplica ningún límite ni consulta la organización", async () => {
    const { prisma, findMany, findUnique } = crearPrisma(null);
    const controller = new OrganizacionController(prisma);
    await controller.auditoria(ACTOR, undefined, undefined, undefined, undefined, undefined, undefined);

    expect(findMany.mock.calls[0][0].where.fecha).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("constante de fallback documentada es America/Argentina/Salta", () => {
    expect(ZONA_ARGENTINA_DEFECTO).toBe("America/Argentina/Salta");
  });
});

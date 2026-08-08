import { LiquidacionesController } from "./liquidaciones.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { finDeFechaUtc } from "../common/rango-fechas";

// UX-FIN-1: candidatos() es el endpoint que originó la corrección — "hasta" debe incluir todo el
// día calendario UTC elegido, no solo su primer instante, para que un Viaje/AnticipoGasto con
// hora real ese mismo día siga apareciendo como candidato.
function crearPrisma() {
  const viajeFindMany = jest.fn().mockResolvedValue([]);
  const anticipoFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    viaje: { findMany: viajeFindMany },
    anticipoGasto: { findMany: anticipoFindMany },
  };
  return { prisma: prisma as unknown as OrganizacionPrismaClient, viajeFindMany, anticipoFindMany };
}

describe("LiquidacionesController.candidatos() — filtro 'hasta' inclusivo (UX-FIN-1)", () => {
  it("usa finDeFechaUtc(hasta) como límite superior para viajes Y anticipos, nunca medianoche cruda", async () => {
    const { prisma, viajeFindMany, anticipoFindMany } = crearPrisma();
    const controller = new LiquidacionesController(prisma);

    await controller.candidatos("TRANSPORTISTA", "tra-1", undefined, "2026-03-01", "2026-08-07");

    const esperado = finDeFechaUtc("2026-08-07");
    expect(viajeFindMany.mock.calls[0][0].where.fecha.lte).toEqual(esperado);
    expect(anticipoFindMany.mock.calls[0][0].where.fecha.lte).toEqual(esperado);
    // Confirma explícitamente que NO es la medianoche cruda del comportamiento anterior.
    expect(viajeFindMany.mock.calls[0][0].where.fecha.lte).not.toEqual(new Date("2026-08-07"));
  });

  it("'desde' no cambia — sigue siendo la medianoche UTC exacta del día elegido", async () => {
    const { prisma, viajeFindMany } = crearPrisma();
    const controller = new LiquidacionesController(prisma);

    await controller.candidatos("TRANSPORTISTA", "tra-1", undefined, "2026-03-01", "2026-08-07");

    expect(viajeFindMany.mock.calls[0][0].where.fecha.gte).toEqual(new Date("2026-03-01"));
  });

  it("sin 'hasta': no aplica ningún límite superior", async () => {
    const { prisma, viajeFindMany } = crearPrisma();
    const controller = new LiquidacionesController(prisma);

    await controller.candidatos("TRANSPORTISTA", "tra-1", undefined, "2026-03-01", undefined);

    expect(viajeFindMany.mock.calls[0][0].where.fecha).toEqual({ gte: new Date("2026-03-01") });
    expect(viajeFindMany.mock.calls[0][0].where.fecha.lte).toBeUndefined();
  });
});

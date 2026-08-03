import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FacturasController } from "./facturas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// FAC-3 (ajuste post-revisión): Facturas.tsx ya no muestra "Anular factura" solo cuando
// `cobranzas.length === 0`, sino cuando no quedan cobranzas VIGENTES (`cobranzas.every(c =>
// c.anulada)`) — condición que coincide exactamente con la regla real del backend
// (`factura.cobranzas.some(c => !c.anulada)` bloquea). Este archivo cubre esa regla, que no
// tenía prueba dedicada hasta ahora.
function cobranza(overrides: Partial<any> = {}) {
  return { id: "cob-1", importe: 100, anulada: false, ...overrides };
}

function crearPrismaMock(facturaResultado: any) {
  const tx = {
    factura: {
      update: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn().mockResolvedValue({ id: facturaResultado?.id, estado: "ANULADO" }),
    },
    viaje: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    factura: { findUnique: jest.fn().mockResolvedValue(facturaResultado) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
}

describe("FacturasController.anular (factura) — regla de cobranzas vigentes (FAC-3)", () => {
  it("permite anular la factura cuando no quedan cobranzas vigentes (todas anuladas)", async () => {
    const factura = {
      id: "fact-1",
      viajes: [],
      cobranzas: [cobranza({ id: "cob-1", anulada: true }), cobranza({ id: "cob-2", anulada: true })],
    };
    const { prisma, tx } = crearPrismaMock(factura);
    const controller = new FacturasController(prisma);

    await controller.anular("fact-1");

    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "ANULADO" } });
  });

  it("permite anular una factura sin cobranzas registradas", async () => {
    const factura = { id: "fact-1", viajes: [], cobranzas: [] };
    const { prisma, tx } = crearPrismaMock(factura);
    const controller = new FacturasController(prisma);

    await controller.anular("fact-1");

    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "ANULADO" } });
  });

  it("rechaza anular la factura cuando queda al menos una cobranza vigente", async () => {
    const factura = {
      id: "fact-1",
      viajes: [],
      cobranzas: [cobranza({ id: "cob-1", anulada: true }), cobranza({ id: "cob-2", anulada: false })],
    };
    const { prisma, tx } = crearPrismaMock(factura);
    const controller = new FacturasController(prisma);

    await expect(controller.anular("fact-1")).rejects.toThrow(BadRequestException);
    expect(tx.factura.update).not.toHaveBeenCalled();
  });

  it("rechaza cuando la factura no existe", async () => {
    const { prisma } = crearPrismaMock(null);
    const controller = new FacturasController(prisma);

    await expect(controller.anular("fact-x")).rejects.toThrow(NotFoundException);
  });
});

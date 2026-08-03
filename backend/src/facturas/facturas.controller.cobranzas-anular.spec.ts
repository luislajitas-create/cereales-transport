import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FacturasController } from "./facturas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// FAC-3: mismo criterio de mock que facturas.controller.pagination.spec.ts — sin DB real, se
// mockea únicamente lo que anularCobranza() efectivamente usa. anularCobranza corre dentro de
// $transaction(async (tx) => {...}); acá se simula ese callback invocándolo con un `tx` de
// mocks propio, incluyendo $queryRaw (el FOR UPDATE de bloqueo de fila).
//
// El aislamiento por organización (Bloque 8.1.d, organizacion-prisma.client.ts) es transparente
// para el controller: tx.factura.findUnique ya devuelve null cuando la fila pertenece a otra
// organización. Por eso el caso "factura/cobranza de otra organización" se simula devolviendo
// null desde findUnique, exactamente como lo haría la extensión real.
function crearTx(facturaFindUniqueResultados: any[]) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    factura: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    cobranza: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  facturaFindUniqueResultados.forEach((resultado, i) => {
    (tx.factura.findUnique as jest.Mock).mockResolvedValueOnce(resultado);
  });
  return tx;
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return {
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
}

function cobranza(overrides: Partial<any> = {}) {
  return {
    id: "cob-1",
    facturaId: "fact-1",
    fecha: new Date("2026-07-01"),
    importe: 600,
    medioPago: "TRANSFERENCIA",
    observacion: null,
    anulada: false,
    anuladaMotivo: null,
    anuladaFecha: null,
    ...overrides,
  };
}

const USER = { id: "user-1", rol: "FACTURACION" };

describe("FacturasController.anularCobranza (FAC-3)", () => {
  it("anulación exitosa: revierte COBRADO_PARCIAL a FACTURADO cuando queda sin cobranzas vigentes", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranza({ id: "cob-1", importe: 600 })],
    };
    const tx = crearTx([factura, { id: "fact-1", estado: "FACTURADO" }]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    const resultado = await controller.anularCobranza("fact-1", "cob-1", { motivo: "Cargada por error" }, USER);

    expect(tx.cobranza.update).toHaveBeenCalledWith({
      where: { id: "cob-1" },
      data: { anulada: true, anuladaMotivo: "Cargada por error", anuladaFecha: expect.any(Date) },
    });
    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "FACTURADO" } });
    expect(resultado).toEqual({ id: "fact-1", estado: "FACTURADO" });
  });

  it("reversión de COBRADO_TOTAL a COBRADO_PARCIAL cuando queda saldo pendiente", async () => {
    const factura = {
      id: "fact-1",
      importe: 1000,
      estado: "COBRADO_TOTAL",
      cobranzas: [cobranza({ id: "cob-1", importe: 600 }), cobranza({ id: "cob-2", importe: 400 })],
    };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.anularCobranza("fact-1", "cob-2", { motivo: "Duplicada" }, USER);

    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "COBRADO_PARCIAL" } });
  });

  it("registra auditoría con usuario, factura, cobranza, importe y motivo", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranza({ id: "cob-1", importe: 600, fecha: new Date("2026-05-10"), medioPago: "EFECTIVO" })],
    };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.anularCobranza("fact-1", "cob-1", { motivo: "Error de carga" }, USER);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        usuarioId: "user-1",
        entidad: "Cobranza",
        entidadId: "cob-1",
        accion: "anular",
        datosAnteriores: { importe: 600, fecha: new Date("2026-05-10"), medioPago: "EFECTIVO" },
        datosNuevos: { anulada: true, motivo: "Error de carga" },
      },
    });
  });

  it("rechaza motivo ausente", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranza({ id: "cob-1" })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-1", {} as any, USER)).rejects.toThrow(BadRequestException);
    expect(tx.cobranza.update).not.toHaveBeenCalled();
  });

  it("rechaza motivo vacío", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranza({ id: "cob-1" })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-1", { motivo: "" }, USER)).rejects.toThrow(BadRequestException);
  });

  it("rechaza cuando la factura no existe", async () => {
    const tx = crearTx([null]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-x", "cob-1", { motivo: "x" }, USER)).rejects.toThrow(NotFoundException);
  });

  it("rechaza factura/cobranza de otra organización (findUnique ya filtrado por el aislamiento de 8.1.d devuelve null)", async () => {
    const tx = crearTx([null]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-otra-org", "cob-1", { motivo: "x" }, USER)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.cobranza.update).not.toHaveBeenCalled();
  });

  it("rechaza cobranza inexistente para la factura indicada", async () => {
    const factura = { id: "fact-1", importe: 600, estado: "COBRADO_PARCIAL", cobranzas: [] };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-inexistente", { motivo: "x" }, USER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rechaza una cobranza que pertenece a otra factura (no aparece en factura.cobranzas)", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranza({ id: "cob-de-otra-factura-no-deberia-estar-aca" })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-que-no-es-de-esta-factura", { motivo: "x" }, USER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rechaza una cobranza ya anulada (evita doble anulación / doble-click)", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "FACTURADO",
      cobranzas: [cobranza({ id: "cob-1", anulada: true, anuladaMotivo: "Previo" })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-1", { motivo: "x" }, USER)).rejects.toThrow(BadRequestException);
    expect(tx.cobranza.update).not.toHaveBeenCalled();
  });

  it("rechaza operar sobre una factura ANULADA (todas sus cobranzas ya están anuladas por invariante de negocio)", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "ANULADO",
      cobranzas: [cobranza({ id: "cob-1", anulada: true, anuladaMotivo: "Factura anulada" })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-1", { motivo: "x" }, USER)).rejects.toThrow(
      "La factura está anulada; no se pueden modificar sus cobranzas",
    );
    expect(tx.cobranza.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.factura.update).not.toHaveBeenCalled();
  });

  it("rechaza por estado de la factura aunque la cobranza figure como vigente (dato inconsistente) — el corte es explícito por factura.estado, no depende del flag de la cobranza", async () => {
    const factura = {
      id: "fact-1",
      importe: 600,
      estado: "ANULADO",
      cobranzas: [cobranza({ id: "cob-1", anulada: false })],
    };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.anularCobranza("fact-1", "cob-1", { motivo: "x" }, USER)).rejects.toThrow(
      "La factura está anulada; no se pueden modificar sus cobranzas",
    );
    expect(tx.cobranza.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.factura.update).not.toHaveBeenCalled();
  });
});

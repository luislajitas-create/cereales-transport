import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LiquidacionesController } from "./liquidaciones.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// AUD-1: mismo criterio de mock que clientes.controller.auditoria.spec.ts (CAT-4). Sin DB real:
// estas pruebas no demuestran un rollback físico en PostgreSQL, prueban que el fallo de
// auditLog.create se propaga como excepción del callback de $transaction.
const ACTOR = { id: "user-1" };

const LIQUIDACION_BASE = {
  id: "liq-1",
  numero: 42,
  tipo: "TRANSPORTISTA",
  transportistaId: "tra-1",
  choferId: null,
  periodoDesde: new Date("2026-08-01"),
  periodoHasta: new Date("2026-08-31"),
  comisionPct: 10,
  estado: "BORRADOR",
  fechaPago: null,
  viajes: [],
  movimientos: [],
};

describe("LiquidacionesController — auditoría (AUD-1)", () => {
  describe("create()", () => {
    // create() hace varias lecturas fuera de la transacción (transportista/chofer/viajes/
    // anticipos) antes de abrir $transaction — se mockean directo sobre `prisma`, no sobre `tx`.
    function crearPrisma(overrides: Partial<{ createTx: jest.Mock }> = {}) {
      const tx = {
        liquidacion: { create: overrides.createTx ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...LIQUIDACION_BASE, id: "liq-nuevo", ...data })) },
        viaje: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        liquidacionViaje: { create: jest.fn().mockResolvedValue(undefined) },
        liquidacionMovimiento: { create: jest.fn().mockResolvedValue(undefined) },
        anticipoGasto: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        transportista: { findUnique: jest.fn().mockResolvedValue({ id: "tra-1", activo: true }) },
        chofer: { findUnique: jest.fn().mockResolvedValue({ id: "cho-1", activo: true, comisionPct: 10 }) },
        viaje: { findMany: jest.fn().mockResolvedValue([{ id: "via-1", importeTotal: 1000 }]) },
        anticipoGasto: { findMany: jest.fn().mockResolvedValue([]) },
        // recomputeTotales()/findOne() corren DESPUÉS del $transaction, directo sobre
        // `this.prisma` (no sobre `tx`) — mismo comportamiento real, ver liquidaciones.
        // controller.ts. viajes/movimientos vacíos alcanza para que ambos no exploten.
        liquidacion: {
          findUnique: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, viajes: [], movimientos: [] }),
          update: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE }),
        },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
    }

    const dto = {
      tipo: "TRANSPORTISTA",
      transportistaId: "tra-1",
      periodoDesde: "2026-08-01",
      periodoHasta: "2026-08-31",
      viajeIds: ["via-1"],
    } as any;

    it("crea la liquidación y genera 'liquidacion_creada' con snapshot por allowlist (sin totales, todavía no calculados en este punto)", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new LiquidacionesController(prisma);

      await controller.create(dto, ACTOR);

      const eventos = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data);
      const creada = eventos.find((e) => e.accion === "liquidacion_creada");
      expect(creada).toBeDefined();
      expect(creada.entidad).toBe("Liquidacion");
      expect(creada.usuarioId).toBe(ACTOR.id);
      expect(creada.datosAnteriores).toBeUndefined();
      expect(creada.datosNuevos).toEqual({
        tipo: "TRANSPORTISTA",
        transportistaId: "tra-1",
        choferId: null,
        periodoDesde: new Date("2026-08-01"),
        periodoHasta: new Date("2026-08-31"),
        comisionPct: 0,
        cantidadViajes: 1,
        cantidadAnticipos: 0,
      });
      expect(creada.datosNuevos).not.toHaveProperty("totalBruto");
      expect(creada.datosNuevos).not.toHaveProperty("netoPagar");
    });

    it("convive con el evento existente 'comisionPct_override' cuando corresponde, sin modificarlo", async () => {
      const dtoChofer = { tipo: "CHOFER", choferId: "cho-1", periodoDesde: "2026-08-01", periodoHasta: "2026-08-31", viajeIds: ["via-1"], comisionPct: 15 } as any;
      const { prisma, tx } = crearPrisma();
      const controller = new LiquidacionesController(prisma);

      await controller.create(dtoChofer, ACTOR);

      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["liquidacion_creada", "comisionPct_override"]);
      const override = (tx.auditLog.create as jest.Mock).mock.calls[1][0].data;
      expect(override.datosAnteriores).toEqual({ comisionPctChofer: 10 });
      expect(override.datosNuevos).toEqual({ comisionPctUsado: 15 });
    });

    it("sin override de comisión, solo genera 'liquidacion_creada' (comisionPct_override no aparece)", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new LiquidacionesController(prisma);

      await controller.create(dto, ACTOR);

      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["liquidacion_creada"]);
    });

    it("si algún auditLog.create falla, create() se rechaza completo", async () => {
      const { prisma, tx } = crearPrisma();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new LiquidacionesController(prisma);

      await expect(controller.create(dto, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("confirmar()", () => {
    function crearTx(overrides: Partial<{ findUnique: jest.Mock; update: jest.Mock }> = {}) {
      return {
        liquidacion: {
          findUnique: overrides.findUnique ?? jest.fn(),
          update: overrides.update ?? jest.fn(),
        },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
    }
    function crearPrisma(tx: ReturnType<typeof crearTx>) {
      return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
    }

    it("confirma la liquidación y genera 'liquidacion_confirmada' con estado antes/después", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "BORRADOR" });
      const update = jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "CONFIRMADA" });
      const tx = crearTx({ findUnique, update });
      const controller = new LiquidacionesController(crearPrisma(tx));

      await controller.confirmar("liq-1", ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("liquidacion_confirmada");
      expect(evento.datosAnteriores).toEqual({ numero: 42, estado: "BORRADOR" });
      expect(evento.datosNuevos).toEqual({ numero: 42, estado: "CONFIRMADA" });
    });

    it("liquidación que no está en BORRADOR: rechaza con BadRequestException, sin update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "CONFIRMADA" });
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new LiquidacionesController(crearPrisma(tx));

      await expect(controller.confirmar("liq-1", ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("liquidación inexistente: rechaza con NotFoundException", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = crearTx({ findUnique });
      const controller = new LiquidacionesController(crearPrisma(tx));

      await expect(controller.confirmar("liq-x", ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, confirmar() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "BORRADOR" });
      const update = jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "CONFIRMADA" });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new LiquidacionesController(crearPrisma(tx));

      await expect(controller.confirmar("liq-1", ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("pagar()", () => {
    function crearPrisma(overrides: Partial<{ findUnique: jest.Mock }> = {}) {
      const tx = {
        liquidacion: { update: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "PAGADA", fechaPago: new Date("2026-09-01") }) },
        viaje: { update: jest.fn().mockResolvedValue(undefined) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        liquidacion: { findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "CONFIRMADA", viajes: [] }) },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
    }

    it("paga la liquidación y genera 'liquidacion_pagada' con estado antes/después + fechaPago", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new LiquidacionesController(prisma);

      await controller.pagar("liq-1", {} as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("liquidacion_pagada");
      expect(evento.datosAnteriores).toEqual({ numero: 42, estado: "CONFIRMADA" });
      expect(evento.datosNuevos).toEqual({ numero: 42, estado: "PAGADA", fechaPago: new Date("2026-09-01") });
    });

    it("liquidación que no está CONFIRMADA: rechaza con BadRequestException, sin AuditLog", async () => {
      const { prisma, tx } = crearPrisma({ findUnique: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "BORRADOR", viajes: [] }) });
      const controller = new LiquidacionesController(prisma);

      await expect(controller.pagar("liq-1", {} as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("liquidación inexistente: rechaza con NotFoundException", async () => {
      const { prisma, tx } = crearPrisma({ findUnique: jest.fn().mockResolvedValue(null) });
      const controller = new LiquidacionesController(prisma);

      await expect(controller.pagar("liq-x", {} as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, pagar() se rechaza completo", async () => {
      const { prisma, tx } = crearPrisma();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new LiquidacionesController(prisma);

      await expect(controller.pagar("liq-1", {} as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("anular()", () => {
    function crearPrisma(overrides: Partial<{ findUnique: jest.Mock }> = {}) {
      const tx = {
        liquidacion: { update: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "ANULADA" }) },
        viaje: { update: jest.fn().mockResolvedValue(undefined) },
        anticipoGasto: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        liquidacion: {
          findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "CONFIRMADA", viajes: [], movimientos: [] }),
        },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
    }

    it("anula la liquidación y genera 'liquidacion_anulada' con estado antes/después", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new LiquidacionesController(prisma);

      await controller.anular("liq-1", ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("liquidacion_anulada");
      expect(evento.datosAnteriores).toEqual({ numero: 42, estado: "CONFIRMADA" });
      expect(evento.datosNuevos).toEqual({ numero: 42, estado: "ANULADA" });
    });

    // AUD-1 (corrección post-revisión): solo PAGADA está bloqueada por una excepción propia — una
    // liquidación ya ANULADA puede volver a pasar por anular() sin rechazo, así que el evento
    // fantasma se evita comparando el estado real antes/después, no con una regla nueva.
    it("liquidación ya ANULADA: no rechaza, pero no genera un evento fantasma (estado sin cambio real)", async () => {
      const { prisma, tx } = crearPrisma({
        findUnique: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "ANULADA", viajes: [], movimientos: [] }),
      });
      const controller = new LiquidacionesController(prisma);

      await controller.anular("liq-1", ACTOR);

      expect(tx.liquidacion.update).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("liquidación ya PAGADA: rechaza con BadRequestException, sin AuditLog", async () => {
      const { prisma, tx } = crearPrisma({
        findUnique: jest.fn().mockResolvedValue({ ...LIQUIDACION_BASE, estado: "PAGADA", viajes: [], movimientos: [] }),
      });
      const controller = new LiquidacionesController(prisma);

      await expect(controller.anular("liq-1", ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("liquidación inexistente: rechaza con NotFoundException", async () => {
      const { prisma, tx } = crearPrisma({ findUnique: jest.fn().mockResolvedValue(null) });
      const controller = new LiquidacionesController(prisma);

      await expect(controller.anular("liq-x", ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, anular() se rechaza completo", async () => {
      const { prisma, tx } = crearPrisma();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new LiquidacionesController(prisma);

      await expect(controller.anular("liq-1", ACTOR)).rejects.toThrow("fallo simulado");
    });
  });
});

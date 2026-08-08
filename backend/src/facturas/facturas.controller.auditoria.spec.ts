import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FacturasController } from "./facturas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// AUD-1: mismo criterio de mock que clientes.controller.auditoria.spec.ts (CAT-4). Sin DB real:
// estas pruebas no demuestran un rollback físico en PostgreSQL, prueban que el fallo de
// auditLog.create se propaga como excepción del callback de $transaction. No toca
// registrarCobranza()/anularCobranza() — ver facturas.controller.registrar-cobranza.spec.ts y
// facturas.controller.cobranzas-anular.spec.ts, sin cambios en este bloque.
const ACTOR = { id: "user-1" };

const FACTURA_BASE = {
  id: "fact-1",
  clienteId: "cli-1",
  numero: "A-0001",
  fecha: new Date("2026-08-01"),
  vencimiento: new Date("2026-09-01"),
  importe: 1000,
  estado: "FACTURADO",
};

describe("FacturasController — auditoría (AUD-1)", () => {
  describe("create()", () => {
    function crearPrisma(overrides: Partial<{ createTx: jest.Mock }> = {}) {
      const tx = {
        factura: {
          create: overrides.createTx ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...FACTURA_BASE, id: "fact-nuevo", ...data })),
          findUnique: jest.fn().mockResolvedValue({ ...FACTURA_BASE }),
        },
        viaje: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        facturaViaje: { create: jest.fn().mockResolvedValue(undefined) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        cliente: { findUnique: jest.fn().mockResolvedValue({ id: "cli-1", activo: true }) },
        viaje: { findMany: jest.fn().mockResolvedValue([{ id: "via-1", importeTotal: 1000 }]) },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
    }

    const dto = { clienteId: "cli-1", numero: "A-0001", fecha: "2026-08-01", vencimiento: "2026-09-01", viajeIds: ["via-1"] } as any;

    it("crea la factura y exactamente un AuditLog 'factura_creada', datosNuevos = snapshot por allowlist", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new FacturasController(prisma);

      await controller.create(dto, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.usuarioId).toBe(ACTOR.id);
      expect(evento.entidad).toBe("Factura");
      expect(evento.accion).toBe("factura_creada");
      expect(evento.datosAnteriores).toBeUndefined();
      expect(evento.datosNuevos).toEqual({
        clienteId: "cli-1",
        numero: "A-0001",
        fecha: new Date("2026-08-01"),
        vencimiento: new Date("2026-09-01"),
        importe: 1000,
      });
      expect(evento.datosNuevos).not.toHaveProperty("organizacionId");
      expect(evento.datosNuevos).not.toHaveProperty("id");
    });

    it("sin actor identificable: rechaza con UnauthorizedException antes de tocar la transacción", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new FacturasController(prisma);

      await expect(controller.create(dto, { id: undefined })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, create() se rechaza completo", async () => {
      const { prisma, tx } = crearPrisma();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new FacturasController(prisma);

      await expect(controller.create(dto, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("anular()", () => {
    function crearPrisma(overrides: Partial<{ findUnique: jest.Mock }> = {}) {
      const tx = {
        factura: {
          update: jest.fn().mockResolvedValue({ ...FACTURA_BASE, estado: "ANULADO" }),
          findUnique: jest.fn().mockResolvedValue({ ...FACTURA_BASE, estado: "ANULADO" }),
        },
        viaje: { update: jest.fn().mockResolvedValue(undefined) },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        factura: {
          findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ ...FACTURA_BASE, viajes: [], cobranzas: [] }),
        },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      return { prisma: prisma as unknown as OrganizacionPrismaClient, tx };
    }

    it("anula la factura y genera 'factura_anulada' con estado antes/después", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new FacturasController(prisma);

      await controller.anular("fact-1", ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("factura_anulada");
      expect(evento.datosAnteriores).toEqual({ numero: "A-0001", estado: "FACTURADO" });
      expect(evento.datosNuevos).toEqual({ numero: "A-0001", estado: "ANULADO" });
    });

    it("con cobranzas vigentes: rechaza con BadRequestException, sin update ni AuditLog", async () => {
      const { prisma, tx } = crearPrisma({
        findUnique: jest.fn().mockResolvedValue({ ...FACTURA_BASE, viajes: [], cobranzas: [{ id: "cob-1", anulada: false }] }),
      });
      const controller = new FacturasController(prisma);

      await expect(controller.anular("fact-1", ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.factura.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("factura inexistente: rechaza con NotFoundException", async () => {
      const { prisma, tx } = crearPrisma({ findUnique: jest.fn().mockResolvedValue(null) });
      const controller = new FacturasController(prisma);

      await expect(controller.anular("fact-x", ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("sin actor identificable: rechaza con UnauthorizedException antes de tocar Prisma", async () => {
      const { prisma, tx } = crearPrisma();
      const controller = new FacturasController(prisma);

      await expect(controller.anular("fact-1", { id: undefined })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, anular() se rechaza completo", async () => {
      const { prisma, tx } = crearPrisma();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new FacturasController(prisma);

      await expect(controller.anular("fact-1", ACTOR)).rejects.toThrow("fallo simulado");
    });
  });
});

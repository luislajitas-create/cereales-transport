import { NotFoundException } from "@nestjs/common";
import { TransportistasController } from "./transportistas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-4: mismo criterio de mock que clientes.controller.auditoria.spec.ts.
const ACTOR = { id: "user-1" };

function crearTx(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
  return {
    transportista: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "transp-nuevo", activo: true, ...data })),
      update: overrides.update ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
}

const TRANSPORTISTA_BASE = { id: "transp-1", razonSocial: "Transp X", cuit: "30111111111", domicilio: "Calle 123", activo: true };

describe("TransportistasController — auditoría (CAT-4)", () => {
  describe("create()", () => {
    it("crea el transportista y exactamente un AuditLog 'transportista_creado', con datosAnteriores vacío", async () => {
      const tx = crearTx();
      const controller = new TransportistasController(crearPrismaMock(tx));

      const creado = await controller.create({ razonSocial: "Transp X", cuit: "30111111111" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.entidad).toBe("Transportista");
      expect(evento.entidadId).toBe(creado.id);
      expect(evento.accion).toBe("transportista_creado");
      expect(evento.datosAnteriores).toBeUndefined();
      expect(evento.datosNuevos.razonSocial).toBe("Transp X");
    });

    it("si auditLog.create falla, create() se rechaza completo", async () => {
      const tx = crearTx();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new TransportistasController(crearPrismaMock(tx));

      await expect(controller.create({ razonSocial: "X", cuit: "30111111111" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("update()", () => {
    it("edita solo domicilio: un único evento 'transportista_editado' con antes/después reales", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, domicilio: "Calle 456" });
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await controller.update("transp-1", { domicilio: "Calle 456" } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("transportista_editado");
      expect(evento.datosAnteriores).toEqual({ razonSocial: "Transp X", domicilio: "Calle 123" });
      expect(evento.datosNuevos).toEqual({ razonSocial: "Transp X", domicilio: "Calle 456" });
    });

    it("PATCH idempotente (mismos valores) no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE });
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await controller.update("transp-1", { domicilio: "Calle 123" } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("cambiar 'activo' y 'domicilio' en la misma petición genera dos eventos separados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: false, domicilio: "Calle 456" });
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await controller.update("transp-1", { activo: false, domicilio: "Calle 456" } as any, ACTOR);

      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["transportista_desactivado", "transportista_editado"]);
    });

    it("transportista inexistente: NotFoundException, sin llamar a update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await expect(controller.update("inexistente", { domicilio: "X" } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, domicilio: "Calle 456" });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new TransportistasController(crearPrismaMock(tx));

      await expect(controller.update("transp-1", { domicilio: "Calle 456" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("remove()", () => {
    it("desactiva de forma lógica y genera 'transportista_desactivado' — nunca delete físico", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await controller.remove("transp-1", ACTOR);

      expect(update).toHaveBeenCalledWith({ where: { id: "transp-1" }, data: { activo: false } });
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("transportista_desactivado");
    });

    it("DELETE sobre un transportista ya inactivo no genera evento fantasma", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: false });
      const update = jest.fn().mockResolvedValue({ ...TRANSPORTISTA_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new TransportistasController(crearPrismaMock(tx));

      await controller.remove("transp-1", ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("importar() — atomicidad por fila", () => {
    it("cada fila creada genera su propio AuditLog marcado con origen 'importacion_csv'", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "transp-csv-1", activo: true, ...data }));
      const tx = { transportista: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
      const controller = new TransportistasController(prisma);
      const archivo = { buffer: Buffer.from("razonSocial,cuit\nTransp CSV,30-11111111-1", "utf-8") } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("transportista_creado");
      expect(evento.datosNuevos).toMatchObject({ razonSocial: "Transp CSV", _origen: "importacion_csv" });
    });

    it("fila inválida: no crea entidad ni AuditLog, no bloquea las filas válidas restantes", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "transp-csv", activo: true, ...data }));
      const tx = { transportista: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
      const controller = new TransportistasController(prisma);
      const archivo = { buffer: Buffer.from("razonSocial,cuit\n,30-11111111-1\nTransp Dos,30-22222222-2", "utf-8") } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });
});

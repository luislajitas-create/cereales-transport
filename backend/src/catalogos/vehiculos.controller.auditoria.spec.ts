import { NotFoundException } from "@nestjs/common";
import { VehiculosController } from "./vehiculos.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-4: mismo criterio de mock que clientes.controller.auditoria.spec.ts. Vehiculo no tiene
// ningún campo personal — esta suite confirma que la patente queda legible (identificador
// comercial) y cubre el patrón común de atomicidad/rollback/split de eventos.
const ACTOR = { id: "user-1" };

function crearTx(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
  return {
    vehiculo: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "veh-nuevo", activo: true, ...data })),
      update: overrides.update ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
}

const VEHICULO_BASE = {
  id: "veh-1",
  transportistaId: "transp-1",
  patente: "AB123CD",
  marca: "Mercedes-Benz",
  modelo: "Actros",
  tipo: "CAMION",
  capacidadKg: 28000,
  vencimientoRto: null,
  vencimientoSeguro: null,
  activo: true,
};

describe("VehiculosController — auditoría (CAT-4)", () => {
  describe("create()", () => {
    it("crea el vehículo y un AuditLog 'vehiculo_creado' con la patente legible", async () => {
      const tx = crearTx();
      const controller = new VehiculosController(crearPrismaMock(tx));

      const creado = await controller.create({ transportistaId: "transp-1", patente: "AB123CD", tipo: "CAMION" } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.entidad).toBe("Vehiculo");
      expect(evento.entidadId).toBe(creado.id);
      expect(evento.accion).toBe("vehiculo_creado");
      expect(evento.datosAnteriores).toBeUndefined();
      expect(evento.datosNuevos.patente).toBe("AB123CD");
    });

    it("si auditLog.create falla, create() se rechaza completo", async () => {
      const tx = crearTx();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new VehiculosController(crearPrismaMock(tx));

      await expect(
        controller.create({ transportistaId: "transp-1", patente: "AB123CD", tipo: "CAMION" } as any, ACTOR),
      ).rejects.toThrow("fallo simulado");
    });
  });

  describe("update()", () => {
    it("edita solo la capacidad: un único evento 'vehiculo_editado'", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, capacidadKg: 30000 });
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await controller.update("veh-1", { capacidadKg: 30000 } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("vehiculo_editado");
      expect(evento.datosAnteriores).toEqual({ patente: "AB123CD", capacidadKg: 28000 });
      expect(evento.datosNuevos).toEqual({ patente: "AB123CD", capacidadKg: 30000 });
    });

    it("PATCH idempotente no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE });
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await controller.update("veh-1", { capacidadKg: 28000 } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("cambiar 'activo' y 'marca' en la misma petición genera dos eventos separados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: false, marca: "Scania" });
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await controller.update("veh-1", { activo: false, marca: "Scania" } as any, ACTOR);

      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["vehiculo_desactivado", "vehiculo_editado"]);
    });

    it("vehículo inexistente: NotFoundException, sin llamar a update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await expect(controller.update("inexistente", { marca: "X" } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, marca: "Scania" });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new VehiculosController(crearPrismaMock(tx));

      await expect(controller.update("veh-1", { marca: "Scania" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("remove()", () => {
    it("desactiva de forma lógica y genera 'vehiculo_desactivado' — nunca delete físico", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await controller.remove("veh-1", ACTOR);

      expect(update).toHaveBeenCalledWith({ where: { id: "veh-1" }, data: { activo: false } });
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("vehiculo_desactivado");
    });

    it("DELETE sobre un vehículo ya inactivo no genera evento fantasma", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: false });
      const update = jest.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new VehiculosController(crearPrismaMock(tx));

      await controller.remove("veh-1", ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("importar() — atomicidad por fila", () => {
    it("cada fila creada genera su propio AuditLog marcado con origen 'importacion_csv'", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "veh-csv-1", activo: true, ...data }));
      const tx = { vehiculo: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        transportista: { findMany: jest.fn().mockResolvedValue([{ id: "transp-1", cuit: "30111111111" }]) },
        vehiculo: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as OrganizacionPrismaClient;
      const controller = new VehiculosController(prisma);
      const archivo = {
        buffer: Buffer.from("transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,CAMION", "utf-8"),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("vehiculo_creado");
      expect(evento.datosNuevos).toMatchObject({ patente: "AB123CD", _origen: "importacion_csv" });
    });

    it("fila con patente duplicada en base: no crea entidad ni AuditLog", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "veh-csv", activo: true, ...data }));
      const tx = { vehiculo: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        transportista: { findMany: jest.fn().mockResolvedValue([{ id: "transp-1", cuit: "30111111111" }]) },
        vehiculo: { findMany: jest.fn().mockResolvedValue([{ patente: "AB123CD" }]) },
      } as unknown as OrganizacionPrismaClient;
      const controller = new VehiculosController(prisma);
      const archivo = {
        buffer: Buffer.from("transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,CAMION", "utf-8"),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.rechazados).toBe(1);
      expect(crear).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

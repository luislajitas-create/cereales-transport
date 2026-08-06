import { NotFoundException } from "@nestjs/common";
import { ChoferesController } from "./choferes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-4: mismo criterio de mock que clientes.controller.auditoria.spec.ts. Chofer es la única de
// las 4 entidades con identificadores personales reales (dni/cuil/telefono/licenciaNumero) — esta
// suite cubre, además del patrón común, que esos campos SIEMPRE llegan enmascarados a AuditLog.
const ACTOR = { id: "user-1" };

function crearTx(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
  return {
    chofer: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "chofer-nuevo", activo: true, ...data })),
      update: overrides.update ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
}

const CHOFER_BASE = {
  id: "chofer-1",
  transportistaId: "transp-1",
  nombre: "Juan Perez",
  dni: "30123456",
  cuil: "20301234564",
  comisionPct: 5,
  licenciaNumero: "B1234567",
  licenciaVencimiento: null,
  telefono: "+5491112345678",
  activo: true,
};

describe("ChoferesController — auditoría (CAT-4)", () => {
  describe("create()", () => {
    it("crea el chofer y un AuditLog 'chofer_creado' con dni/cuil/telefono/licenciaNumero enmascarados", async () => {
      const tx = crearTx();
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.create(
        { transportistaId: "transp-1", nombre: "Juan Perez", dni: "30123456", cuil: "20301234564", licenciaNumero: "B1234567", telefono: "+5491112345678" } as any,
        ACTOR,
      );

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("chofer_creado");
      expect(evento.datosNuevos.dni).toBe("****3456");
      expect(evento.datosNuevos.cuil).toBe("****4564");
      expect(evento.datosNuevos.telefono).toBe("****5678");
      expect(evento.datosNuevos.licenciaNumero).toBe("****4567");
      // El nombre y el transportistaId sí quedan legibles — no son identificadores personales.
      expect(evento.datosNuevos.nombre).toBe("Juan Perez");
      expect(evento.datosNuevos.transportistaId).toBe("transp-1");
    });

    it("si auditLog.create falla, create() se rechaza completo", async () => {
      const tx = crearTx();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new ChoferesController(crearPrismaMock(tx));

      await expect(
        controller.create({ transportistaId: "transp-1", nombre: "Juan", cuil: "20301234564" } as any, ACTOR),
      ).rejects.toThrow("fallo simulado");
    });
  });

  describe("update()", () => {
    it("edita el DNI: el evento 'chofer_editado' guarda el DNI enmascarado, nunca en texto completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE, dni: "40987654" });
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.update("chofer-1", { dni: "40987654" } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("chofer_editado");
      expect(evento.datosAnteriores.dni).toBe("****3456");
      expect(evento.datosNuevos.dni).toBe("****7654");
      // Ninguno de los dos valores completos aparece en texto en el evento persistido.
      expect(JSON.stringify(evento)).not.toContain("30123456");
      expect(JSON.stringify(evento)).not.toContain("40987654");
    });

    it("cambiar 'activo' y 'comisionPct' en la misma petición genera dos eventos separados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: false, comisionPct: 8 });
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.update("chofer-1", { activo: false, comisionPct: 8 } as any, ACTOR);

      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["chofer_desactivado", "chofer_editado"]);
    });

    it("PATCH idempotente no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE });
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.update("chofer-1", { comisionPct: 5 } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("chofer inexistente: NotFoundException, sin llamar a update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await expect(controller.update("inexistente", { comisionPct: 8 } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE, comisionPct: 8 });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new ChoferesController(crearPrismaMock(tx));

      await expect(controller.update("chofer-1", { comisionPct: 8 } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("remove()", () => {
    it("desactiva de forma lógica y genera 'chofer_desactivado' — nunca delete físico", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.remove("chofer-1", ACTOR);

      expect(update).toHaveBeenCalledWith({ where: { id: "chofer-1" }, data: { activo: false } });
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("chofer_desactivado");
    });

    it("DELETE sobre un chofer ya inactivo no genera evento fantasma", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: false });
      const update = jest.fn().mockResolvedValue({ ...CHOFER_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new ChoferesController(crearPrismaMock(tx));

      await controller.remove("chofer-1", ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("importar() — atomicidad por fila y minimización de datos personales", () => {
    it("fila creada por CSV: AuditLog con DNI/CUIL enmascarados y origen 'importacion_csv'", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "chofer-csv-1", activo: true, ...data }));
      const tx = { chofer: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        transportista: { findMany: jest.fn().mockResolvedValue([{ id: "transp-1", cuit: "30111111111" }]) },
        chofer: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as OrganizacionPrismaClient;
      const controller = new ChoferesController(prisma);
      const archivo = {
        buffer: Buffer.from(
          "transportistaCuit,nombre,dni,cuil\n30-11111111-1,Juan Perez,30123456,20-30123456-4",
          "utf-8",
        ),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("chofer_creado");
      expect(evento.datosNuevos.dni).toBe("****3456");
      expect(evento.datosNuevos.cuil).toBe("****4564");
      expect(evento.datosNuevos._origen).toBe("importacion_csv");
    });

    it("fila con CUIL duplicado en base: no crea entidad ni AuditLog", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "chofer-csv", activo: true, ...data }));
      const tx = { chofer: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      const prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        transportista: { findMany: jest.fn().mockResolvedValue([{ id: "transp-1", cuit: "30111111111" }]) },
        chofer: { findMany: jest.fn().mockResolvedValue([{ cuil: "20301234564" }]) },
      } as unknown as OrganizacionPrismaClient;
      const controller = new ChoferesController(prisma);
      const archivo = {
        buffer: Buffer.from("transportistaCuit,nombre,cuil\n30-11111111-1,Juan Perez,20-30123456-4", "utf-8"),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.rechazados).toBe(1);
      expect(crear).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

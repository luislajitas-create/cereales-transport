import { NotFoundException } from "@nestjs/common";
import { ClientesController } from "./clientes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-4: mismo criterio de mock que facturas.controller.registrar-cobranza.spec.ts (FAC-4) — un
// `tx` propio (findUnique/create/update/auditLog.create) y un $transaction que invoca el callback
// con ese `tx`. Sin DB real: estos tests no demuestran un rollback físico en PostgreSQL, prueban
// que el fallo de auditLog.create se propaga como excepción del callback (mismo alcance honesto
// que documenta esa suite).
const ACTOR = { id: "user-1" };

function crearTx(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
  return {
    cliente: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cli-nuevo", activo: true, ...data })),
      update: overrides.update ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
}

const CLIENTE_BASE = { id: "cli-1", razonSocial: "Cliente X", cuit: "30111111111", condicionesComerciales: "Contado", activo: true };

describe("ClientesController — auditoría (CAT-4)", () => {
  describe("create()", () => {
    it("crea el cliente y exactamente un AuditLog 'cliente_creado', con datosAnteriores vacío y datosNuevos = snapshot funcional", async () => {
      const tx = crearTx();
      const controller = new ClientesController(crearPrismaMock(tx));

      const creado = await controller.create({ razonSocial: "Cliente X", cuit: "30111111111" } as any, ACTOR);

      expect(tx.cliente.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.usuarioId).toBe(ACTOR.id);
      expect(evento.entidad).toBe("Cliente");
      expect(evento.entidadId).toBe(creado.id);
      expect(evento.accion).toBe("cliente_creado");
      expect(evento.datosAnteriores).toBeUndefined();
      expect(evento.datosNuevos).toEqual({
        razonSocial: "Cliente X",
        cuit: "30111111111",
        condicionesComerciales: undefined,
        activo: true,
      });
    });

    it("si auditLog.create falla, la operación completa se rechaza (create() nunca se considera exitoso)", async () => {
      const tx = crearTx();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado de auditoría"));
      const controller = new ClientesController(crearPrismaMock(tx));

      await expect(controller.create({ razonSocial: "X", cuit: "30111111111" } as any, ACTOR)).rejects.toThrow(
        "fallo simulado de auditoría",
      );
    });
  });

  describe("update()", () => {
    it("edición pura (sin tocar activo): genera un único evento 'cliente_editado' con antes/después reales de los campos cambiados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, razonSocial: "Cliente Y" });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { razonSocial: "Cliente Y" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("cliente_editado");
      expect(evento.datosAnteriores).toEqual({ razonSocial: "Cliente X" });
      expect(evento.datosNuevos).toEqual({ razonSocial: "Cliente Y" });
    });

    it("PATCH que reenvía exactamente los mismos valores (idempotente) no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { razonSocial: "Cliente X" } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("PATCH que solo cambia 'activo' a false genera un único evento 'cliente_desactivado' (no 'cliente_editado')", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { activo: false } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("cliente_desactivado");
      expect(evento.datosAnteriores).toEqual({ razonSocial: "Cliente X", activo: true });
      expect(evento.datosNuevos).toEqual({ razonSocial: "Cliente X", activo: false });
    });

    it("PATCH que solo cambia 'activo' a true genera un único evento 'cliente_reactivado'", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: true });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { activo: true } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("cliente_reactivado");
    });

    // CAT-4, sección 3 (ajuste obligatorio del usuario): un PATCH que cambia "activo" Y otro
    // campo en la misma petición genera DOS eventos separados (estado + edición), ambos dentro
    // de la misma transacción — nunca se clasifica todo como un solo evento de baja/reactivación.
    it("PATCH que cambia 'activo' Y otro campo en la misma petición genera DOS eventos separados, atómicos con el UPDATE", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false, condicionesComerciales: "Contado 60 días" });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { activo: false, condicionesComerciales: "Contado 60 días" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      const acciones = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data.accion);
      expect(acciones).toEqual(["cliente_desactivado", "cliente_editado"]);
      const eventoEditado = (tx.auditLog.create as jest.Mock).mock.calls[1][0].data;
      expect(eventoEditado.datosNuevos).toEqual({ razonSocial: "Cliente X", condicionesComerciales: "Contado 60 días" });
      // El evento de edición no repite el cambio de "activo" — ya quedó cubierto por el primero.
      expect(eventoEditado.datosNuevos).not.toHaveProperty("activo");
    });

    it("cliente inexistente: rechaza con NotFoundException antes de tocar Prisma.update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await expect(controller.update("cli-inexistente", { razonSocial: "X" } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo (ninguno de los eventos se considera aplicado)", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, razonSocial: "Cliente Y" });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new ClientesController(crearPrismaMock(tx));

      await expect(controller.update("cli-1", { razonSocial: "Cliente Y" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });

    // findUnique corre dentro del mismo tx (aislado por organización por la extensión, como
    // cualquier otra lectura) — nunca se construye el "antes" leyendo otra organización.
    it("el 'antes' se obtiene del mismo tx aislado por organización — nunca de una lectura manual sin scope", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, razonSocial: "Cliente Y" });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.update("cli-1", { razonSocial: "Cliente Y" } as any, ACTOR);

      expect(findUnique).toHaveBeenCalledWith({ where: { id: "cli-1" } });
    });
  });

  describe("remove()", () => {
    it("desactiva de forma lógica (activo:false) y genera un evento 'cliente_desactivado' — nunca un delete físico", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: true });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.remove("cli-1", ACTOR);

      expect(update).toHaveBeenCalledWith({ where: { id: "cli-1" }, data: { activo: false } });
      expect((tx.cliente as any).delete).toBeUndefined();
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("cliente_desactivado");
    });

    it("DELETE sobre un cliente ya inactivo (operación idempotente) no genera un evento fantasma", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false });
      const update = jest.fn().mockResolvedValue({ ...CLIENTE_BASE, activo: false });
      const tx = crearTx({ findUnique, update });
      const controller = new ClientesController(crearPrismaMock(tx));

      await controller.remove("cli-1", ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("cliente inexistente: rechaza con NotFoundException", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = crearTx({ findUnique });
      const controller = new ClientesController(crearPrismaMock(tx));

      await expect(controller.remove("cli-inexistente", ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("importar() — atomicidad por fila", () => {
    function crearPrismaImportar(crear: jest.Mock) {
      const tx = { cliente: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
      // CAT-5: importar() ahora hace un cliente.findMany batch (CUIT existentes) antes del loop —
      // acá siempre vacío, no es el foco de estas pruebas de AuditLog.
      const prisma = {
        cliente: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((fn: any) => fn(tx)),
      } as unknown as OrganizacionPrismaClient;
      return { prisma, tx };
    }

    it("cada fila creada genera su propio AuditLog marcado con origen 'importacion_csv', separado del snapshot real", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cli-csv-1", activo: true, ...data }));
      const { prisma, tx } = crearPrismaImportar(crear);
      const controller = new ClientesController(prisma);
      const archivo = { buffer: Buffer.from("razonSocial,cuit\nCliente CSV,30-11111111-1", "utf-8") } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("cliente_creado");
      expect(evento.datosNuevos).toMatchObject({ razonSocial: "Cliente CSV", _origen: "importacion_csv" });
    });

    it("una fila que falla la validación no crea entidad ni AuditLog, y no bloquea las filas válidas siguientes", async () => {
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cli-csv", activo: true, ...data }));
      const { prisma, tx } = crearPrismaImportar(crear);
      const controller = new ClientesController(prisma);
      const archivo = {
        buffer: Buffer.from("razonSocial,cuit\nSin CUIT,\nCliente Válido,30-22222222-2", "utf-8"),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(1);
      expect(crear).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it("si el AuditLog de una fila falla, esa fila se reporta rechazada y NO deja el Cliente creado, pero las filas anteriores ya exitosas se preservan", async () => {
      let contador = 0;
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cli-${++contador}`, activo: true, ...data }));
      const auditLog = {
        create: jest
          .fn()
          .mockResolvedValueOnce(undefined) // fila 1: éxito
          .mockRejectedValueOnce(new Error("fallo simulado de auditoría")), // fila 2: falla
      };
      const tx = { cliente: { create: crear }, auditLog };
      const prisma = {
        cliente: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((fn: any) => fn(tx)),
      } as unknown as OrganizacionPrismaClient;
      const controller = new ClientesController(prisma);
      const archivo = {
        buffer: Buffer.from("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2", "utf-8"),
      } as Express.Multer.File;

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(1);
      expect(resultado.detalle[0].ok).toBe(true);
      expect(resultado.detalle[1].ok).toBe(false);
      // Nunca se filtra el error crudo de la fila 2 hacia el detalle de la respuesta.
      expect(resultado.detalle[1].mensaje).not.toContain("fallo simulado de auditoría");
    });
  });
});

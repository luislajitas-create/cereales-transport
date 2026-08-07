import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CerealesController, UbicacionesController, TiposGastoController, ProductoresController } from "./simples.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// CAT-7: Cereal/Ubicacion/TipoGasto/Productor, a diferencia de Cliente/Transportista/Chofer/
// Vehiculo (CAT-4), no tienen columna "activo" ni endpoint de baja/reactivación — la auditoría
// previa a este bloque (AUDITORIA_CATALOGOS.md, sección CAT-7) confirmó que hoy solo existen
// realmente alta (los cuatro) y edición (solo Productor). Estas pruebas cubren exactamente esa
// superficie real, sin inventar casos de "activo" que no aplican acá.
//
// Mismo criterio de mock que clientes.controller.auditoria.spec.ts (CAT-4): un `tx` propio
// (create/update/findUnique + auditLog.create) y un $transaction que invoca el callback con ese
// `tx`. Sin DB real: estas pruebas no demuestran un rollback físico en PostgreSQL, prueban que el
// fallo de auditLog.create se propaga como excepción del callback — mismo alcance honesto que
// documenta esa suite.
const ACTOR = { id: "user-1" };

function crearPrismaMock(modelo: string, metodos: Record<string, jest.Mock>) {
  const tx: any = { [modelo]: metodos, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
  return { prisma, tx };
}

describe("CerealesController — auditoría (CAT-7)", () => {
  it("create() crea el cereal y exactamente un AuditLog 'cereal_creado', datosNuevos = snapshot por allowlist", async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cer-1", ...data }));
    const { prisma, tx } = crearPrismaMock("cereal", { create });
    const controller = new CerealesController(prisma);

    const creado = await controller.create({ nombre: "Soja" } as any, ACTOR);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(evento.usuarioId).toBe(ACTOR.id);
    expect(evento.entidad).toBe("Cereal");
    expect(evento.entidadId).toBe(creado.id);
    expect(evento.accion).toBe("cereal_creado");
    expect(evento.datosAnteriores).toBeUndefined();
    expect(evento.datosNuevos).toEqual({ nombre: "Soja" });
  });

  it("create() nunca envía organizacionId manualmente — el body del DTO no lo tiene, la extensión lo inyecta", async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cer-1", ...data }));
    const { prisma } = crearPrismaMock("cereal", { create });
    const controller = new CerealesController(prisma);

    await controller.create({ nombre: "Soja" } as any, ACTOR);

    expect(create).toHaveBeenCalledWith({ data: { nombre: "Soja" } });
  });

  it("si auditLog.create falla, create() se rechaza completo (el cereal nunca se considera creado)", async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cer-1", ...data }));
    const { prisma, tx } = crearPrismaMock("cereal", { create });
    (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado de auditoría"));
    const controller = new CerealesController(prisma);

    await expect(controller.create({ nombre: "Soja" } as any, ACTOR)).rejects.toThrow("fallo simulado de auditoría");
  });

  it("un P2002 real (nombre duplicado en la organización) se propaga sin generar ningún AuditLog", async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`organizacionId`,`nombre`)", {
        code: "P2002",
        clientVersion: "5.0.0",
        meta: { target: ["organizacionId", "nombre"] },
      }),
    );
    const { prisma, tx } = crearPrismaMock("cereal", { create });
    const controller = new CerealesController(prisma);

    await expect(controller.create({ nombre: "Soja" } as any, ACTOR)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("UbicacionesController — auditoría (CAT-7)", () => {
  it("create() crea la ubicación y exactamente un AuditLog 'ubicacion_creada', datosNuevos = snapshot por allowlist (incluye tipo/localidad, nunca id/organizacionId)", async () => {
    const create = jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: "ubi-1", localidad: null, ...data }));
    const { prisma, tx } = crearPrismaMock("ubicacion", { create });
    const controller = new UbicacionesController(prisma);

    const creada = await controller.create({ nombre: "Acopio Norte", tipo: "ACOPIO" } as any, ACTOR);

    const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(evento.entidad).toBe("Ubicacion");
    expect(evento.entidadId).toBe(creada.id);
    expect(evento.accion).toBe("ubicacion_creada");
    expect(evento.datosNuevos).toEqual({ nombre: "Acopio Norte", tipo: "ACOPIO", localidad: null });
    expect(evento.datosNuevos).not.toHaveProperty("id");
    expect(evento.datosNuevos).not.toHaveProperty("organizacionId");
  });

  it("si auditLog.create falla, create() se rechaza completo", async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ubi-1", localidad: null, ...data }));
    const { prisma, tx } = crearPrismaMock("ubicacion", { create });
    (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
    const controller = new UbicacionesController(prisma);

    await expect(controller.create({ nombre: "Acopio Norte", tipo: "ACOPIO" } as any, ACTOR)).rejects.toThrow("fallo simulado");
  });
});

describe("TiposGastoController — auditoría (CAT-7)", () => {
  it("create() crea el tipo de gasto y exactamente un AuditLog 'tipo_gasto_creado', datosNuevos incluye afectaLiquidacion", async () => {
    const create = jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: "tg-1", afectaLiquidacion: true, ...data }));
    const { prisma, tx } = crearPrismaMock("tipoGasto", { create });
    const controller = new TiposGastoController(prisma);

    const creado = await controller.create({ nombre: "Combustible" } as any, ACTOR);

    const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(evento.entidad).toBe("TipoGasto");
    expect(evento.entidadId).toBe(creado.id);
    expect(evento.accion).toBe("tipo_gasto_creado");
    expect(evento.datosNuevos).toEqual({ nombre: "Combustible", afectaLiquidacion: true });
  });

  it("un P2002 real (nombre duplicado) se propaga sin generar ningún AuditLog", async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`organizacionId`,`nombre`)", {
        code: "P2002",
        clientVersion: "5.0.0",
        meta: { target: ["organizacionId", "nombre"] },
      }),
    );
    const { prisma, tx } = crearPrismaMock("tipoGasto", { create });
    const controller = new TiposGastoController(prisma);

    await expect(controller.create({ nombre: "Combustible" } as any, ACTOR)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("ProductoresController — auditoría (CAT-7)", () => {
  const PRODUCTOR_BASE = { id: "prod-1", nombre: "Productor X", cuit: "30111111111", localidad: "Rosario" };

  function crearTxProductor(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
    return {
      productor: {
        create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-nuevo", ...data })),
        update: overrides.update ?? jest.fn(),
        findUnique: overrides.findUnique ?? jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
  }
  function crearPrisma(tx: ReturnType<typeof crearTxProductor>) {
    return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
  }

  describe("create()", () => {
    it("crea el productor y exactamente un AuditLog 'productor_creado', CUIT canónico en el snapshot", async () => {
      const tx = crearTxProductor();
      const controller = new ProductoresController(crearPrisma(tx));

      const creado = await controller.create({ nombre: "Productor X", cuit: "30111111111", localidad: null } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.entidad).toBe("Productor");
      expect(evento.entidadId).toBe(creado.id);
      expect(evento.accion).toBe("productor_creado");
      expect(evento.datosNuevos).toEqual({ nombre: "Productor X", cuit: "30111111111", localidad: null });
    });

    it("CUIT ausente se audita como null, nunca como cadena vacía u omitido en silencio", async () => {
      const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "prod-2", localidad: null, cuit: null, ...data }));
      const tx = crearTxProductor({ create });
      const controller = new ProductoresController(crearPrisma(tx));

      await controller.create({ nombre: "Productor sin CUIT" } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.datosNuevos.cuit).toBeNull();
    });

    it("si auditLog.create falla, create() se rechaza completo", async () => {
      const tx = crearTxProductor();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new ProductoresController(crearPrisma(tx));

      await expect(controller.create({ nombre: "Productor X" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });

  describe("update()", () => {
    it("edición real genera un único evento 'productor_editado' con antes/después de los campos cambiados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE, localidad: "Santa Fe" });
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await controller.update("prod-1", { localidad: "Santa Fe" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("productor_editado");
      // El identificador estable (nombre) viaja siempre, aunque no haya cambiado.
      expect(evento.datosAnteriores).toEqual({ nombre: "Productor X", localidad: "Rosario" });
      expect(evento.datosNuevos).toEqual({ nombre: "Productor X", localidad: "Santa Fe" });
    });

    it("PATCH que reenvía exactamente los mismos valores (idempotente) no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await controller.update("prod-1", { nombre: "Productor X" } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("CUIT editado se audita canónico; CUIT vaciado se audita como null", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE, cuit: null });
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await controller.update("prod-1", { cuit: null } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.datosAnteriores.cuit).toBe("30111111111");
      expect(evento.datosNuevos.cuit).toBeNull();
    });

    it("productor inexistente: rechaza con NotFoundException antes de tocar update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await expect(controller.update("prod-inexistente", { nombre: "X" } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo (ningún evento se considera aplicado)", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE, localidad: "Santa Fe" });
      const tx = crearTxProductor({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new ProductoresController(crearPrisma(tx));

      await expect(controller.update("prod-1", { localidad: "Santa Fe" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });

    it("el 'antes' se obtiene del mismo tx aislado por organización — nunca de una lectura manual sin scope", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE, localidad: "Santa Fe" });
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await controller.update("prod-1", { localidad: "Santa Fe" } as any, ACTOR);

      expect(findUnique).toHaveBeenCalledWith({ where: { id: "prod-1" } });
    });

    it("un P2002 real (CUIT duplicado en la organización) se propaga sin generar ningún AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...PRODUCTOR_BASE });
      const update = jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`organizacionId`,`cuit`)", {
          code: "P2002",
          clientVersion: "5.0.0",
          meta: { target: ["organizacionId", "cuit"] },
        }),
      );
      const tx = crearTxProductor({ findUnique, update });
      const controller = new ProductoresController(crearPrisma(tx));

      await expect(controller.update("prod-1", { cuit: "30222222222" } as any, ACTOR)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

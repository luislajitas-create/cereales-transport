import { Prisma } from "@prisma/client";
import { TransportistasController } from "./transportistas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

const ACTOR = { id: "user-1" };

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

// CAT-5: mismo criterio de mock que clientes.controller.importar.spec.ts — ver ahí el comentario
// largo sobre el batch findMany previo al loop de creación.
function crearPrismaMock(opciones: { existentes?: { cuit: string }[]; crear?: jest.Mock } = {}) {
  const findMany = jest.fn().mockResolvedValue(opciones.existentes ?? []);
  const crear = opciones.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data }));
  const tx = { transportista: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  const prisma = {
    transportista: { findMany },
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
  return { prisma, findMany, crear, tx };
}

describe("TransportistasController.importar (CAT-1/CAT-5)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    await expect(controller.importar(undefined, ACTOR)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("archivo completamente vacío (ni encabezado) rechaza con BadRequestException, antes de cualquier consulta", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    await expect(controller.importar(crearArchivo(""), ACTOR)).rejects.toThrow("El archivo está vacío.");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("encabezado obligatorio ausente (falta 'cuit'): rechaza el archivo completo, sin consultar ni crear nada", async () => {
    const { prisma, findMany, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial\nTransportista Uno");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("Faltan encabezados obligatorios");
    expect(findMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it("encabezado duplicado ('cuit' repetido): rechaza el archivo completo, sin procesar ninguna fila", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit,cuit\nTransportista Uno,30-11111111-1,30-11111111-1");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("encabezados duplicados");
    expect(crear).not.toHaveBeenCalled();
  });

  it("archivo sin filas de datos (solo encabezado) rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    await expect(controller.importar(crearArchivo("razonSocial,cuit"), ACTOR)).rejects.toThrow("no tiene filas de datos");
  });

  it("crea todas las filas válidas, con el CUIT normalizado, y devuelve el resumen correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit,domicilio\nTransportista Uno,30-11111111-1,Calle Falsa 123\nTransportista Dos,30.222.222.222,");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenNthCalledWith(1, {
      data: { razonSocial: "Transportista Uno", cuit: "30111111111", domicilio: "Calle Falsa 123" },
    });
    expect(crear).toHaveBeenNthCalledWith(2, {
      data: { razonSocial: "Transportista Dos", cuit: "30222222222", domicilio: null },
    });
  });

  it("una fila inválida se reporta sin bloquear las filas válidas del mismo archivo", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\n,30-11111111-1\nTransportista Dos,30-22222222-2");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
  });

  it("CUIT duplicado EXACTO dentro del archivo: la segunda fila se rechaza sin llamar a create", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nTransportista Uno,30111111111\nTransportista Uno Duplicado,30111111111");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toBe("CUIT '30111111111' duplicado dentro del archivo.");
  });

  it("CUIT duplicado dentro del archivo con formatos DISTINTOS: también se detecta, sin llamar a create para la segunda", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Uno Duplicado,30.111.111.111",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[1].mensaje).toContain("duplicado dentro del archivo");
  });

  it("primera fila inválida y segunda fila válida con el MISMO CUIT: la fila inválida no reserva el CUIT, la válida se crea", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\n,30-11111111-1\nTransportista Válido,30111111111");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[1]).toEqual({ fila: 3, ok: true, mensaje: "Creado correctamente." });
    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it("CUIT ya existente en la misma organización: la fila se rechaza sin llamar a create, con mensaje funcional", async () => {
    const { prisma, crear } = crearPrismaMock({ existentes: [{ cuit: "30111111111" }] });
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nTransportista Nuevo,30-11111111-1");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toBe("Ya existe un transportista con CUIT '30111111111' en esta organización.");
    expect(crear).not.toHaveBeenCalled();
  });

  it("aislamiento: un CUIT de OTRA organización no aparece entre los existentes, así que la fila se crea igual", async () => {
    const { prisma, crear, findMany } = crearPrismaMock({ existentes: [] });
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nTransportista Nuevo,30-11111111-1");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { cuit: { in: ["30111111111"] } }, select: { cuit: true } });
  });

  it("la consulta de existentes se hace UNA sola vez para todo el archivo, sin importar la cantidad de filas", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Dos,30-22222222-2\nTransportista Tres,30-33333333-3",
    );

    await controller.importar(archivo, ACTOR);

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("si todas las filas son inválidas, no se consulta la base en absoluto (no hay candidatas)", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nSin CUIT Uno,\nSin CUIT Dos,");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(2);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("mezcla de filas válidas, ya existentes, repetidas dentro del archivo e inválidas: orden y conteos exactos", async () => {
    const { prisma, crear } = crearPrismaMock({ existentes: [{ cuit: "30444444444" }] });
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\n" +
        "Transportista Válido,30-11111111-1\n" +
        ",30-22222222-2\n" +
        "Transportista Existente,30-44444444-4\n" +
        "Transportista Repetido,30-11111111-1\n" +
        "Transportista Otro Válido,30-55555555-5",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(5);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(3);
    expect(resultado.detalle.map((d) => d.fila)).toEqual([2, 3, 4, 5, 6]);
    expect(resultado.detalle[0]).toEqual({ fila: 2, ok: true, mensaje: "Creado correctamente." });
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[2].mensaje).toContain("Ya existe un transportista con CUIT");
    expect(resultado.detalle[3].mensaje).toContain("duplicado dentro del archivo");
    expect(resultado.detalle[4]).toEqual({ fila: 6, ok: true, mensaje: "Creado correctamente." });
  });

  it("P2002 durante el create (condición de carrera real, no detectada por la consulta previa) se traduce a mensaje funcional — nunca el mensaje crudo de Prisma", async () => {
    const crear = jest
      .fn()
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }))
      .mockImplementationOnce(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`cuit`)", {
            code: "P2002",
            clientVersion: "5.0.0",
            meta: { target: ["organizacionId", "cuit"] },
          }),
        ),
      );
    const { prisma } = crearPrismaMock({ crear });
    const controller = new TransportistasController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Dos,30-22222222-2");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[1].mensaje).toBe("Ya existe un registro con este CUIT");
    expect(resultado.detalle[1].mensaje).not.toContain("Unique constraint failed");
    expect(resultado.detalle[1].mensaje).not.toContain("organizacionId");
  });

  describe("AuditLog (CAT-4) dentro de la importación", () => {
    it("cada fila creada genera exactamente un AuditLog 'transportista_creado' con origen 'importacion_csv'", async () => {
      const { prisma, tx } = crearPrismaMock();
      const controller = new TransportistasController(prisma);
      const archivo = crearArchivo("razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Dos,30-22222222-2");

      await controller.importar(archivo, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      const [primero, segundo] = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data);
      expect(primero.accion).toBe("transportista_creado");
      expect(primero.datosNuevos._origen).toBe("importacion_csv");
      expect(segundo.accion).toBe("transportista_creado");
      expect(segundo.datosNuevos._origen).toBe("importacion_csv");
    });

    it("una fila rechazada (duplicada, existente o inválida) nunca genera AuditLog", async () => {
      const { prisma, tx } = crearPrismaMock({ existentes: [{ cuit: "30222222222" }] });
      const controller = new TransportistasController(prisma);
      const archivo = crearArchivo(
        "razonSocial,cuit\n,30-99999999-9\nTransportista Existente,30-22222222-2\nTransportista Uno,30-11111111-1\nTransportista Uno,30-11111111-1",
      );

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(3);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it("si auditLog.create falla para una fila, esa fila se rechaza y NO deja el Transportista creado, pero las filas anteriores exitosas se preservan", async () => {
      let contador = 0;
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `transp-${++contador}`, ...data }));
      const findMany = jest.fn().mockResolvedValue([]);
      const auditLog = {
        create: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("fallo simulado de auditoría")),
      };
      const tx = { transportista: { create: crear }, auditLog };
      const prisma = { transportista: { findMany }, $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
      const controller = new TransportistasController(prisma);
      const archivo = crearArchivo("razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Dos,30-22222222-2");

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(1);
      expect(resultado.detalle[0]).toEqual({ fila: 2, ok: true, mensaje: "Creado correctamente." });
      expect(resultado.detalle[1].ok).toBe(false);
      expect(resultado.detalle[1].mensaje).not.toContain("fallo simulado de auditoría");
    });
  });
});

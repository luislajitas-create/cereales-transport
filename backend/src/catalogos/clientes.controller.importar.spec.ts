import { Prisma } from "@prisma/client";
import { ClientesController } from "./clientes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

const ACTOR = { id: "user-1" };

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

// CAT-5: importar() ahora hace UNA consulta batch (cliente.findMany) antes del loop de creación,
// además del $transaction por fila de CAT-4. `findMany` ya viene acotado a la organización activa
// por la extensión de aislamiento en la app real (Bloque 8.1.d) — acá se simula devolviendo o no
// un CUIT en el resultado, igual que choferes.controller.importar.spec.ts simula transportista/
// chofer existentes.
function crearPrismaMock(opciones: { existentes?: { cuit: string }[]; crear?: jest.Mock } = {}) {
  const findMany = jest.fn().mockResolvedValue(opciones.existentes ?? []);
  const crear = opciones.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data }));
  const tx = { cliente: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  const prisma = {
    cliente: { findMany },
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
  return { prisma, findMany, crear, tx };
}

describe("ClientesController.importar (CAT-1/CAT-5)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    await expect(controller.importar(undefined, ACTOR)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("archivo completamente vacío (ni encabezado) rechaza con BadRequestException, antes de cualquier consulta", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    await expect(controller.importar(crearArchivo(""), ACTOR)).rejects.toThrow("El archivo está vacío.");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("encabezado obligatorio ausente (falta 'cuit'): rechaza el archivo completo, sin consultar ni crear nada", async () => {
    const { prisma, findMany, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial\nCliente Uno");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("Faltan encabezados obligatorios");
    expect(findMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it("encabezado duplicado ('cuit' repetido): rechaza el archivo completo, sin procesar ninguna fila", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit,cuit\nCliente Uno,30-11111111-1,30-11111111-1");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("encabezados duplicados");
    expect(crear).not.toHaveBeenCalled();
  });

  it("archivo sin filas de datos (solo encabezado) rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    await expect(controller.importar(crearArchivo("razonSocial,cuit"), ACTOR)).rejects.toThrow(
      "no tiene filas de datos",
    );
  });

  it("crea todas las filas válidas, con el CUIT normalizado, y devuelve el resumen correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit,condicionesComerciales\nCliente Uno,30-11111111-1,Contado\nCliente Dos,30.222.222.222,",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear).toHaveBeenNthCalledWith(1, {
      data: { razonSocial: "Cliente Uno", cuit: "30111111111", condicionesComerciales: "Contado" },
    });
    expect(crear).toHaveBeenNthCalledWith(2, {
      data: { razonSocial: "Cliente Dos", cuit: "30222222222", condicionesComerciales: null },
    });
    expect(resultado.detalle).toEqual([
      { fila: 2, ok: true, mensaje: "Creado correctamente." },
      { fila: 3, ok: true, mensaje: "Creado correctamente." },
    ]);
  });

  it("una fila inválida se reporta sin bloquear las filas válidas del mismo archivo", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    // Fila 2: cuit vacío (inválida) — Fila 3: válida.
    const archivo = crearArchivo("razonSocial,cuit,condicionesComerciales\nCliente Sin CUIT,,\nCliente Dos,30-22222222-2,");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].fila).toBe(2);
    expect(resultado.detalle[1]).toEqual({ fila: 3, ok: true, mensaje: "Creado correctamente." });
  });

  // CAT-5: a diferencia del comportamiento previo (dependía de que la base rechazara la segunda
  // fila con P2002 tras confirmar la primera), ahora la detección es proactiva y en memoria — el
  // duplicado se detecta ANTES de intentar crear, `crear` se llama una sola vez.
  it("CUIT duplicado EXACTO dentro del archivo: la segunda fila se rechaza sin llamar a create", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30111111111\nCliente Uno Duplicado,30111111111");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toBe("CUIT '30111111111' duplicado dentro del archivo.");
  });

  it("CUIT duplicado dentro del archivo con formatos DISTINTOS (guiones/puntos vs. sin separadores): también se detecta, sin llamar a create para la segunda", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Uno Duplicado,30.111.111.111",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toContain("duplicado dentro del archivo");
  });

  it("primera fila inválida y segunda fila válida con el MISMO CUIT: la fila inválida no reserva el CUIT, la válida se crea", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    // Fila 2: razonSocial vacía (inválida) pero con cuit 30111111111 — Fila 3: razonSocial válida, mismo cuit.
    const archivo = crearArchivo("razonSocial,cuit\n,30-11111111-1\nCliente Válido,30111111111");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[1]).toEqual({ fila: 3, ok: true, mensaje: "Creado correctamente." });
    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it("CUIT ya existente en la misma organización: la fila se rechaza sin llamar a create, con mensaje funcional", async () => {
    const { prisma, crear } = crearPrismaMock({ existentes: [{ cuit: "30111111111" }] });
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nCliente Nuevo,30-11111111-1");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toBe("Ya existe un cliente con CUIT '30111111111' en esta organización.");
    expect(crear).not.toHaveBeenCalled();
  });

  // Aislamiento multi-tenant: un CUIT que existe en OTRA organización nunca aparece en el
  // resultado de `findMany` (la extensión de aislamiento real ya lo excluye) — acá se simula
  // devolviendo una lista vacía de existentes aunque el CUIT "exista" en abstracto, y se confirma
  // que la fila SÍ se crea (no hay ninguna comparación manual contra otra organización).
  it("aislamiento: un CUIT de OTRA organización no aparece entre los existentes, así que la fila se crea igual", async () => {
    const { prisma, crear, findMany } = crearPrismaMock({ existentes: [] });
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nCliente Nuevo,30-11111111-1");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    // La consulta nunca filtra manualmente por organizacionId — eso es responsabilidad exclusiva
    // de la extensión de aislamiento (Bloque 8.1.d), que ya está probada en
    // organizacion-prisma.client.spec.ts. Acá solo se confirma que el controller no agrega ningún
    // filtro propio que pudiera romper o duplicar ese aislamiento.
    expect(findMany).toHaveBeenCalledWith({ where: { cuit: { in: ["30111111111"] } }, select: { cuit: true } });
  });

  it("la consulta de existentes se hace UNA sola vez para todo el archivo, sin importar la cantidad de filas", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2\nCliente Tres,30-33333333-3",
    );

    await controller.importar(archivo, ACTOR);

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("si todas las filas son inválidas, no se consulta la base en absoluto (no hay candidatas)", async () => {
    const { prisma, findMany } = crearPrismaMock();
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nSin CUIT Uno,\nSin CUIT Dos,");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(2);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("mezcla de filas válidas, ya existentes, repetidas dentro del archivo e inválidas: orden y conteos exactos", async () => {
    const { prisma, crear } = crearPrismaMock({ existentes: [{ cuit: "30444444444" }] });
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo(
      "razonSocial,cuit\n" +
        "Cliente Válido,30-11111111-1\n" + // fila 2: válida, se crea
        ",30-22222222-2\n" + // fila 3: inválida (sin razonSocial)
        "Cliente Existente,30-44444444-4\n" + // fila 4: ya existe en la organización
        "Cliente Repetido,30-11111111-1\n" + // fila 5: duplicado en archivo de la fila 2
        "Cliente Otro Válido,30-55555555-5", // fila 6: válida, se crea
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(5);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(3);
    expect(resultado.detalle.map((d) => d.fila)).toEqual([2, 3, 4, 5, 6]);
    expect(resultado.detalle[0]).toEqual({ fila: 2, ok: true, mensaje: "Creado correctamente." });
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[2].mensaje).toContain("Ya existe un cliente con CUIT");
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
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toBe("Ya existe un registro con este CUIT");
    expect(resultado.detalle[1].mensaje).not.toContain("Unique constraint failed");
    expect(resultado.detalle[1].mensaje).not.toContain("organizacionId");
  });

  it("si prisma.create falla para una fila con un error inesperado, se reporta rechazada con un mensaje genérico (nunca el error.message crudo)", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly at db.internal:5432"))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const { prisma } = crearPrismaMock({ crear });
    const controller = new ClientesController(prisma);
    const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("No se pudo crear el registro por un error inesperado.");
    expect(resultado.detalle[0].mensaje).not.toContain("db.internal");
  });

  describe("AuditLog (CAT-4) dentro de la importación", () => {
    it("cada fila creada genera exactamente un AuditLog 'cliente_creado' con origen 'importacion_csv'", async () => {
      const { prisma, tx } = crearPrismaMock();
      const controller = new ClientesController(prisma);
      const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");

      await controller.importar(archivo, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      const [primero, segundo] = (tx.auditLog.create as jest.Mock).mock.calls.map((c) => c[0].data);
      expect(primero.accion).toBe("cliente_creado");
      expect(primero.datosNuevos._origen).toBe("importacion_csv");
      expect(segundo.accion).toBe("cliente_creado");
      expect(segundo.datosNuevos._origen).toBe("importacion_csv");
    });

    it("una fila rechazada (duplicada, existente o inválida) nunca genera AuditLog", async () => {
      const { prisma, tx } = crearPrismaMock({ existentes: [{ cuit: "30222222222" }] });
      const controller = new ClientesController(prisma);
      const archivo = crearArchivo(
        "razonSocial,cuit\n,30-99999999-9\nCliente Existente,30-22222222-2\nCliente Uno,30-11111111-1\nCliente Uno,30-11111111-1",
      );

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(3);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it("si auditLog.create falla para una fila, esa fila se rechaza y NO deja el Cliente creado, pero las filas anteriores exitosas se preservan", async () => {
      let contador = 0;
      const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cli-${++contador}`, ...data }));
      const findMany = jest.fn().mockResolvedValue([]);
      const auditLog = {
        create: jest
          .fn()
          .mockResolvedValueOnce(undefined) // fila 2: éxito
          .mockRejectedValueOnce(new Error("fallo simulado de auditoría")), // fila 3: falla
      };
      const tx = { cliente: { create: crear }, auditLog };
      const prisma = { cliente: { findMany }, $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
      const controller = new ClientesController(prisma);
      const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");

      const resultado = await controller.importar(archivo, ACTOR);

      expect(resultado.creados).toBe(1);
      expect(resultado.rechazados).toBe(1);
      expect(resultado.detalle[0]).toEqual({ fila: 2, ok: true, mensaje: "Creado correctamente." });
      expect(resultado.detalle[1].ok).toBe(false);
      expect(resultado.detalle[1].mensaje).not.toContain("fallo simulado de auditoría");
    });
  });
});

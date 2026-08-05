import { Prisma } from "@prisma/client";
import { ClientesController } from "./clientes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

function crearPrismaMock(overrides: Partial<{ crear: jest.Mock }> = {}) {
  return {
    cliente: {
      create: overrides.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data })),
    },
  } as unknown as OrganizacionPrismaClient;
}

describe("ClientesController.importar (CAT-1)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const controller = new ClientesController(crearPrismaMock());
    await expect(controller.importar(undefined)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("crea todas las filas válidas, con el CUIT normalizado, y devuelve el resumen correcto", async () => {
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new ClientesController(crearPrismaMock({ crear }));
    const archivo = crearArchivo(
      "razonSocial,cuit,condicionesComerciales\nCliente Uno,30-11111111-1,Contado\nCliente Dos,30.222.222.222,",
    );

    const resultado = await controller.importar(archivo);

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

  // CAT-3: Clientes/Transportistas (CAT-1) no tienen la arquitectura de detección proactiva en
  // lote que sí tiene Choferes/Vehículos (CAT-2) — decisión documentada en AUDITORIA_CATALOGOS.md.
  // El duplicado dentro del mismo archivo igual se detecta correctamente porque el procesamiento
  // es secuencial: la primera fila crea el registro con el CUIT ya normalizado, la segunda choca
  // contra la restricción real de la base (P2002) aunque haya usado un formato distinto — nunca
  // se devuelve el mensaje crudo de Prisma, ver mensajeErrorImportacion.
  it("detecta un CUIT duplicado DENTRO DEL ARCHIVO aunque las dos filas usen formatos distintos (vía la restricción real de la base)", async () => {
    const crear = jest
      .fn()
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }))
      .mockImplementationOnce(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`cuit`)", {
            code: "P2002",
            clientVersion: "5.0.0",
            meta: { target: ["cuit"] },
          }),
        ),
      );
    const controller = new ClientesController(crearPrismaMock({ crear }));
    const archivo = crearArchivo(
      "razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Uno Duplicado,30111111111",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toBe("Ya existe un registro con este CUIT");
  });

  it("una fila inválida se reporta sin bloquear las filas válidas del mismo archivo", async () => {
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new ClientesController(crearPrismaMock({ crear }));
    // Fila 2: cuit vacío (inválida) — Fila 3: válida.
    const archivo = crearArchivo("razonSocial,cuit,condicionesComerciales\nCliente Sin CUIT,,\nCliente Dos,30-22222222-2,");

    const resultado = await controller.importar(archivo);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].fila).toBe(2);
    expect(resultado.detalle[1]).toEqual({ fila: 3, ok: true, mensaje: "Creado correctamente." });
  });

  it("si prisma.create falla para una fila con un error inesperado, se reporta rechazada con un mensaje genérico (nunca el error.message crudo)", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly at db.internal:5432"))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new ClientesController(crearPrismaMock({ crear }));
    const archivo = crearArchivo("razonSocial,cuit\nCliente Uno,30-11111111-1\nCliente Dos,30-22222222-2");

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("No se pudo crear el registro por un error inesperado.");
    expect(resultado.detalle[0].mensaje).not.toContain("db.internal");
  });

  it("archivo sin filas de datos (solo encabezado) rechaza con BadRequestException", async () => {
    const controller = new ClientesController(crearPrismaMock());
    await expect(controller.importar(crearArchivo("razonSocial,cuit"))).rejects.toThrow(
      "no tiene filas de datos",
    );
  });
});

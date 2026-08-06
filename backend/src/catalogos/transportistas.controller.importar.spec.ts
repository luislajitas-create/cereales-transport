import { Prisma } from "@prisma/client";
import { TransportistasController } from "./transportistas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

const ACTOR = { id: "user-1" };

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

// CAT-4: importar() ahora crea cada fila dentro de $transaction(async (tx) => {...}) — ver
// clientes.controller.importar.spec.ts.
function crearPrismaMock(overrides: Partial<{ crear: jest.Mock }> = {}) {
  const crear = overrides.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data }));
  const tx = { transportista: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  return {
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
}

describe("TransportistasController.importar (CAT-1)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const controller = new TransportistasController(crearPrismaMock());
    await expect(controller.importar(undefined, ACTOR)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("crea todas las filas válidas, con el CUIT normalizado, y devuelve el resumen correcto", async () => {
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new TransportistasController(crearPrismaMock({ crear }));
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
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new TransportistasController(crearPrismaMock({ crear }));
    const archivo = crearArchivo("razonSocial,cuit\n,30-11111111-1\nTransportista Dos,30-22222222-2");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
  });

  // CAT-3: mismo criterio que ClientesController — ver el comentario largo en
  // clientes.controller.importar.spec.ts. Sin detección proactiva en lote, el duplicado dentro
  // del archivo se sigue detectando vía la restricción real de la base (P2002), procesamiento
  // secuencial, aunque las dos filas usen formatos distintos.
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
    const controller = new TransportistasController(crearPrismaMock({ crear }));
    const archivo = crearArchivo(
      "razonSocial,cuit\nTransportista Uno,30-11111111-1\nTransportista Uno Duplicado,30111111111",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toBe("Ya existe un registro con este CUIT");
  });
});

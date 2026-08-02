import { TransportistasController } from "./transportistas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

function crearPrismaMock(overrides: Partial<{ crear: jest.Mock }> = {}) {
  return {
    transportista: {
      create: overrides.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data })),
    },
  } as unknown as OrganizacionPrismaClient;
}

describe("TransportistasController.importar (CAT-1)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const controller = new TransportistasController(crearPrismaMock());
    await expect(controller.importar(undefined)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("crea todas las filas válidas y devuelve el resumen correcto", async () => {
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new TransportistasController(crearPrismaMock({ crear }));
    const archivo = crearArchivo("razonSocial,cuit,domicilio\nTransportista Uno,30-11111111-1,Calle Falsa 123\nTransportista Dos,30-22222222-2,");

    const resultado = await controller.importar(archivo);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenNthCalledWith(1, {
      data: { razonSocial: "Transportista Uno", cuit: "30-11111111-1", domicilio: "Calle Falsa 123" },
    });
  });

  it("una fila inválida se reporta sin bloquear las filas válidas del mismo archivo", async () => {
    const crear = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", ...data }));
    const controller = new TransportistasController(crearPrismaMock({ crear }));
    const archivo = crearArchivo("razonSocial,cuit\n,30-11111111-1\nTransportista Dos,30-22222222-2");

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
  });
});

import { Prisma } from "@prisma/client";
import { VehiculosController } from "./vehiculos.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { LIMITE_FILAS_IMPORTACION_CSV } from "../common/csv";

// CAT-2/CAT-3: mismo criterio que choferes.controller.importar.spec.ts — sin DB real,
// transportista y duplicados (acá solo por patente: es la única restricción @@unique real de
// Vehiculo fuera de id/organizacionId, confirmado en el schema) se resuelven con una consulta en
// lote cada uno. Los datos "ya existentes" del mock están en formato CANÓNICO (mayúsculas, solo
// dígitos donde aplica) — lo que una base real ya normalizada devolvería; las filas de los CSV de
// cada test usan a propósito formatos "humanos" (guiones, minúsculas, espacios) para probar la
// normalización de extremo a extremo.
const ACTOR = { id: "user-1" };

function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

// CAT-4: transportista.findMany/vehiculo.findMany (resolución en lote) siguen corriendo fuera de
// cualquier transacción — solo el create() por fila pasa a correr dentro de
// $transaction(async (tx) => {...}) (entidad + AuditLog atómicos por fila). `crear` es la misma
// referencia de jest.fn() sin importar si se invoca vía tx.vehiculo.create o prisma.vehiculo.create.
function crearPrismaMock(
  opciones: {
    transportistas?: { id: string; cuit: string }[];
    vehiculosExistentes?: { patente: string }[];
    crear?: jest.Mock;
  } = {},
) {
  const transportistaFindMany = jest.fn().mockResolvedValue(opciones.transportistas ?? [{ id: "transp-1", cuit: "30111111111" }]);
  const vehiculoFindMany = jest.fn().mockResolvedValue(opciones.vehiculosExistentes ?? []);
  const crear = opciones.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data }));
  const tx = { vehiculo: { create: crear }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  const prisma = {
    transportista: { findMany: transportistaFindMany },
    vehiculo: { findMany: vehiculoFindMany },
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
  return { prisma, transportistaFindMany, vehiculoFindMany, crear };
}

describe("VehiculosController.importar (CAT-2/CAT-3)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    await expect(controller.importar(undefined, ACTOR)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("archivo completamente vacío (ni encabezado) rechaza con BadRequestException, antes de cualquier consulta", async () => {
    const { prisma, transportistaFindMany, vehiculoFindMany } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    await expect(controller.importar(crearArchivo(""), ACTOR)).rejects.toThrow("El archivo está vacío.");
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(vehiculoFindMany).not.toHaveBeenCalled();
  });

  it("archivo sin filas de datos (solo encabezado) rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,marca,modelo,tipo,capacidadKg,vencimientoRto,vencimientoSeguro");
    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("no tiene filas de datos");
  });

  it("encabezado obligatorio ausente (falta 'tipo'): rechaza el archivo completo, sin consultar ni crear nada", async () => {
    const { prisma, transportistaFindMany, vehiculoFindMany, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente\n30-11111111-1,AB123CD");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("Faltan encabezados obligatorios");
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(vehiculoFindMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it("encabezado duplicado ('patente' repetida): rechaza el archivo completo, sin procesar ninguna fila", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,patente,tipo\n30-11111111-1,AB123CD,XY987ZZ,CAMION");

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow("encabezados duplicados");
    expect(crear).not.toHaveBeenCalled();
  });

  it("archivo válido: crea todas las filas, con la patente normalizada, y devuelve el resumen correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,marca,modelo,tipo,capacidadKg,vencimientoRto,vencimientoSeguro\n" +
        "30-11111111-1,ab-123-cd,Mercedes-Benz,Actros,CAMION,28000,2027-03-01,2027-01-15\n" +
        "30-11111111-1,XY987ZZ,,,ACOPLADO,,,",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear).toHaveBeenNthCalledWith(1, {
      data: {
        transportistaId: "transp-1",
        patente: "AB123CD",
        marca: "Mercedes-Benz",
        modelo: "Actros",
        tipo: "CAMION",
        capacidadKg: 28000,
        vencimientoRto: new Date("2027-03-01"),
        vencimientoSeguro: new Date("2027-01-15"),
      },
    });
    expect(resultado.detalle).toEqual([
      { fila: 2, ok: true, mensaje: "Creado correctamente." },
      { fila: 3, ok: true, mensaje: "Creado correctamente." },
    ]);
  });

  it("mezcla de filas válidas e inválidas: una fila inválida no bloquea las válidas del mismo archivo", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    // Fila 2: tipo vacío (inválida, no matchea el enum) — Fila 3: válida.
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,\n30-11111111-1,XY987ZZ,CAMION",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].fila).toBe(2);
    expect(resultado.detalle[1]).toEqual({ fila: 3, ok: true, mensaje: "Creado correctamente." });
  });

  it("transportista inexistente: la fila se rechaza con un mensaje claro (CUIT normalizado), sin llamar a create", async () => {
    const { prisma, crear } = crearPrismaMock({ transportistas: [] });
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-99999999-9,AB123CD,CAMION");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(0);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("No existe un transportista con CUIT '30999999999'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("transportista de otra organización: se rechaza igual que uno inexistente (la extensión de aislamiento ya lo excluyó del resultado)", async () => {
    const { prisma, crear } = crearPrismaMock({ transportistas: [] });
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-77777777-7,AB123CD,CAMION");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("No existe un transportista con CUIT '30777777777'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("CUIT del transportista resuelve igual con o sin guiones (mismo transportista, dos formatos)", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n30-11111111-1,AA111AA,CAMION\n30111111111,BB222BB,CAMION",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
  });

  it("patente duplicada en base aunque el CSV use otro formato que el guardado (minúsculas y guiones): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock({ vehiculosExistentes: [{ patente: "AB123CD" }] });
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-11111111-1,ab-123-cd,CAMION");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("Ya existe un vehículo con patente 'AB123CD'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("patente duplicada dentro del archivo aunque las dos filas tengan formatos distintos: solo la primera ocurrencia se crea", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,CAMION\n30-11111111-1,ab 123 cd,ACOPLADO",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toContain("duplicada dentro del archivo");
  });

  it("tipo inválido (fuera del enum TipoVehiculo): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,PICKUP");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(crear).not.toHaveBeenCalled();
  });

  it("tipo válido (CAMION/ACOPLADO): la fila se acepta", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-11111111-1,AB123CD,ACOPLADO");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: "ACOPLADO" }) }));
  });

  it("capacidad inválida (no numérica): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo,capacidadKg\n30-11111111-1,AB123CD,CAMION,no-es-un-numero");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(crear).not.toHaveBeenCalled();
  });

  it("capacidad válida: la fila se acepta con el valor numérico correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo,capacidadKg\n30-11111111-1,AB123CD,CAMION,30000");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ capacidadKg: 30000 }) }));
  });

  it("campos obligatorios ausentes (patente y tipo vacíos): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n30-11111111-1,,");

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.rechazados).toBe(1);
    expect(crear).not.toHaveBeenCalled();
  });

  it("rendimiento: resuelve transportistas y patentes duplicadas con una sola consulta cada uno, sin importar la cantidad de filas", async () => {
    const { prisma, transportistaFindMany, vehiculoFindMany } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n" +
        "30-11111111-1,AA111AA,CAMION\n" +
        "30-11111111-1,BB222BB,CAMION\n" +
        "30-11111111-1,CC333CC,ACOPLADO",
    );

    await controller.importar(archivo, ACTOR);

    expect(transportistaFindMany).toHaveBeenCalledTimes(1);
    expect(vehiculoFindMany).toHaveBeenCalledTimes(1);
  });

  it("límite de filas: permite exactamente el límite configurado", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const filas = Array.from({ length: LIMITE_FILAS_IMPORTACION_CSV }, (_, i) => `30-11111111-1,PAT${i},CAMION`);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n" + filas.join("\n"));

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.total).toBe(LIMITE_FILAS_IMPORTACION_CSV);
    expect(resultado.creados).toBe(LIMITE_FILAS_IMPORTACION_CSV);
    expect(crear).toHaveBeenCalledTimes(LIMITE_FILAS_IMPORTACION_CSV);
  }, 30000);

  it("límite de filas: rechaza el archivo completo si lo supera en una sola fila, sin crear nada", async () => {
    const { prisma, crear, transportistaFindMany } = crearPrismaMock();
    const controller = new VehiculosController(prisma);
    const filas = Array.from({ length: LIMITE_FILAS_IMPORTACION_CSV + 1 }, (_, i) => `30-11111111-1,PAT${i},CAMION`);
    const archivo = crearArchivo("transportistaCuit,patente,tipo\n" + filas.join("\n"));

    await expect(controller.importar(archivo, ACTOR)).rejects.toThrow(`supera el límite de ${LIMITE_FILAS_IMPORTACION_CSV} filas`);
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  }, 30000);

  it("si prisma.vehiculo.create falla con P2002 (condición de carrera), se traduce a un mensaje funcional — nunca el mensaje crudo de Prisma", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`patente`)", {
          code: "P2002",
          clientVersion: "5.0.0",
          meta: { target: ["patente"] },
        }),
      )
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const { prisma } = crearPrismaMock({ crear });
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n30-11111111-1,AA111AA,CAMION\n30-11111111-1,BB222BB,CAMION",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("Ya existe un registro con esta patente");
    expect(resultado.detalle[0].mensaje).not.toContain("Unique constraint failed");
    expect(resultado.detalle[1].ok).toBe(true);
  });

  it("si prisma.vehiculo.create falla con un error inesperado, se reporta rechazada con un mensaje genérico — nunca error.message crudo — sin abortar el resto", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly at db.internal:5432"))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const { prisma } = crearPrismaMock({ crear });
    const controller = new VehiculosController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,patente,tipo\n30-11111111-1,AA111AA,CAMION\n30-11111111-1,BB222BB,CAMION",
    );

    const resultado = await controller.importar(archivo, ACTOR);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("No se pudo crear el registro por un error inesperado.");
    expect(resultado.detalle[0].mensaje).not.toContain("db.internal");
    expect(resultado.detalle[1].ok).toBe(true);
  });
});

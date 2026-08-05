import { Prisma } from "@prisma/client";
import { ChoferesController } from "./choferes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { LIMITE_FILAS_IMPORTACION_CSV } from "../common/csv";

// CAT-2/CAT-3: mismo criterio de mock que clientes.controller.importar.spec.ts / transportistas.
// controller.importar.spec.ts — sin DB real. La resolución de transportista por CUIT y la
// detección de duplicados por CUIL/DNI se mockean como las dos únicas consultas en lote que hace
// el controller (transportista.findMany/chofer.findMany), nunca una por fila. El aislamiento por
// organización (Bloque 8.1.d) es transparente acá: en producción, transportista.findMany ya viene
// acotado a la organización activa — por eso "transportista de otra organización" se simula
// exactamente igual que "transportista inexistente" (el mock simplemente no lo incluye en el
// resultado), tal como lo haría la extensión real.
//
// CAT-3: los datos "ya existentes" del mock (transportistas, choferesExistentes) se declaran en
// formato CANÓNICO (solo dígitos) — es lo que una base real ya normalizada devolvería, porque
// Transportista/Chofer solo se crean o editan a través de los DTO, que normalizan antes de
// persistir. Las filas de los CSV de cada test, en cambio, usan a propósito formatos "humanos"
// (con guiones) para probar que la normalización de extremo a extremo funciona.
function crearArchivo(contenido: string): Express.Multer.File {
  return { buffer: Buffer.from(contenido, "utf-8") } as Express.Multer.File;
}

function crearPrismaMock(
  opciones: {
    transportistas?: { id: string; cuit: string }[];
    choferesExistentes?: { cuil?: string; dni?: string }[];
    crear?: jest.Mock;
  } = {},
) {
  const transportistaFindMany = jest.fn().mockResolvedValue(opciones.transportistas ?? [{ id: "transp-1", cuit: "30111111111" }]);
  const choferFindMany = jest.fn().mockResolvedValue(opciones.choferesExistentes ?? []);
  const crear = opciones.crear ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nuevo", ...data }));
  const prisma = {
    transportista: { findMany: transportistaFindMany },
    chofer: { findMany: choferFindMany, create: crear },
  } as unknown as OrganizacionPrismaClient;
  return { prisma, transportistaFindMany, choferFindMany, crear };
}

describe("ChoferesController.importar (CAT-2/CAT-3)", () => {
  it("sin archivo adjunto, rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    await expect(controller.importar(undefined)).rejects.toThrow("Debe adjuntar un archivo CSV");
  });

  it("archivo completamente vacío (ni encabezado) rechaza con BadRequestException, antes de cualquier consulta", async () => {
    const { prisma, transportistaFindMany, choferFindMany } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    await expect(controller.importar(crearArchivo(""))).rejects.toThrow("El archivo está vacío.");
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(choferFindMany).not.toHaveBeenCalled();
  });

  it("archivo sin filas de datos (solo encabezado) rechaza con BadRequestException", async () => {
    const { prisma } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono");
    await expect(controller.importar(archivo)).rejects.toThrow("no tiene filas de datos");
  });

  it("encabezado obligatorio ausente (falta 'cuil'): rechaza el archivo completo, sin consultar ni crear nada", async () => {
    const { prisma, transportistaFindMany, choferFindMany, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre\n30-11111111-1,Juan Perez");

    await expect(controller.importar(archivo)).rejects.toThrow("Faltan encabezados obligatorios");
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(choferFindMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it("encabezado duplicado ('cuil' repetido): rechaza el archivo completo, sin procesar ninguna fila", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil,cuil\n30-11111111-1,Juan Perez,20-10000000-1,20-10000000-2");

    await expect(controller.importar(archivo)).rejects.toThrow("encabezados duplicados");
    expect(crear).not.toHaveBeenCalled();
  });

  it("archivo válido: crea todas las filas, con CUIT/CUIL/DNI normalizados, y devuelve el resumen correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono\n" +
        "30-11111111-1,Juan Perez,30.123.456,20-30123456-4,5,B123,,\n" +
        "30-11111111-1,Ana Lopez,,27-98765432-1,,,,",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.total).toBe(2);
    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear).toHaveBeenNthCalledWith(1, {
      data: {
        transportistaId: "transp-1",
        nombre: "Juan Perez",
        dni: "30123456",
        cuil: "20301234564",
        comisionPct: 5,
        licenciaNumero: "B123",
        licenciaVencimiento: null,
        telefono: null,
      },
    });
    expect(resultado.detalle).toEqual([
      { fila: 2, ok: true, mensaje: "Creado correctamente." },
      { fila: 3, ok: true, mensaje: "Creado correctamente." },
    ]);
  });

  it("mezcla de filas válidas e inválidas: una fila inválida no bloquea las válidas del mismo archivo", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    // Fila 2: nombre vacío (inválida) — Fila 3: válida.
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n30-11111111-1,,20-30123456-4\n30-11111111-1,Ana Lopez,27-98765432-1",
    );

    const resultado = await controller.importar(archivo);

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
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil\n30-99999999-9,Juan Perez,20-30123456-4");

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(0);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("No existe un transportista con CUIT '30999999999'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("transportista de otra organización: se rechaza igual que uno inexistente (la extensión de aislamiento ya lo excluyó del resultado)", async () => {
    // El mock representa exactamente lo que hace la extensión real: un CUIT que existe pero
    // pertenece a OTRA organización nunca aparece en transportista.findMany() acá — es
    // indistinguible de "no existe", que es la respuesta correcta (no debe revelar que ese CUIT
    // sí existe en otra organización).
    const { prisma, crear } = crearPrismaMock({ transportistas: [] });
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil\n30-77777777-7,Juan Perez,20-30123456-4");

    const resultado = await controller.importar(archivo);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("No existe un transportista con CUIT '30777777777'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("CUIT del transportista resuelve igual con o sin guiones (mismo transportista, dos formatos)", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n" +
        "30-11111111-1,Con Guiones,20-10000000-1\n" +
        "30111111111,Sin Guiones,20-10000000-2",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(2);
    expect(resultado.rechazados).toBe(0);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ transportistaId: "transp-1" }) }));
    expect(crear).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ transportistaId: "transp-1" }) }));
  });

  it("CUIL duplicado en base (aunque el CSV use otro formato que el guardado): la fila se rechaza y no se llama a create", async () => {
    const { prisma, crear } = crearPrismaMock({ choferesExistentes: [{ cuil: "20301234564" }] });
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil\n30-11111111-1,Juan Perez,20-30123456-4");

    const resultado = await controller.importar(archivo);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("Ya existe un chofer con CUIL '20301234564'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("CUIL duplicado dentro del archivo aunque las dos filas tengan formatos distintos: solo la primera ocurrencia se crea", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n30-11111111-1,Juan Perez,20-30123456-4\n30-11111111-1,Juan Perez Duplicado,20301234564",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toContain("duplicado dentro del archivo");
  });

  it("DNI duplicado en base: la fila se rechaza y no se llama a create (DNI también es @@unique([organizacionId, dni]))", async () => {
    const { prisma, crear } = crearPrismaMock({ choferesExistentes: [{ dni: "30111222" }] });
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,dni,cuil\n30-11111111-1,Juan Perez,30.111.222,20-99999999-9");

    const resultado = await controller.importar(archivo);

    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].mensaje).toContain("Ya existe un chofer con DNI '30111222'");
    expect(crear).not.toHaveBeenCalled();
  });

  it("DNI duplicado dentro del archivo aunque las dos filas tengan formatos distintos: solo la primera ocurrencia se crea", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil\n" +
        "30-11111111-1,Juan Perez,30.111.222,20-10000000-1\n" +
        "30-11111111-1,Otro Chofer,30111222,20-10000000-2",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resultado.detalle[0].ok).toBe(true);
    expect(resultado.detalle[1].ok).toBe(false);
    expect(resultado.detalle[1].mensaje).toContain("DNI '30111222' duplicado dentro del archivo");
  });

  it("DNI opcional vacío en varias filas no genera falsos duplicados entre sí", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil\n30-11111111-1,Uno,,20-10000000-1\n30-11111111-1,Dos,,20-10000000-2",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(2);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ dni: null }) }));
    expect(crear).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ dni: null }) }));
  });

  it("patente/cuil en minúsculas o espaciada también se detecta como duplicado dentro del archivo", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n30-11111111-1,Uno, 20 30123456 4 \n30-11111111-1,Dos,20-30123456-4",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[1].mensaje).toContain("duplicado dentro del archivo");
  });

  it("comisión inválida (no numérica): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil,comisionPct\n30-11111111-1,Juan Perez,20-30123456-4,no-es-un-numero");

    const resultado = await controller.importar(archivo);

    expect(resultado.rechazados).toBe(1);
    expect(crear).not.toHaveBeenCalled();
  });

  it("comisión válida: la fila se acepta con el valor numérico correcto", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil,comisionPct\n30-11111111-1,Juan Perez,20-30123456-4,7.5");

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ comisionPct: 7.5 }) }));
  });

  it("campos obligatorios ausentes (nombre y cuil vacíos): la fila se rechaza", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo("transportistaCuit,nombre,cuil\n30-11111111-1,,");

    const resultado = await controller.importar(archivo);

    expect(resultado.rechazados).toBe(1);
    expect(crear).not.toHaveBeenCalled();
  });

  it("rendimiento: resuelve transportistas y duplicados (CUIL/DNI) con una sola consulta cada uno, sin importar la cantidad de filas", async () => {
    const { prisma, transportistaFindMany, choferFindMany } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil\n" +
        "30-11111111-1,Uno,30100001,20-10000000-1\n" +
        "30-11111111-1,Dos,30100002,20-10000000-2\n" +
        "30-11111111-1,Tres,30100003,20-10000000-3",
    );

    await controller.importar(archivo);

    expect(transportistaFindMany).toHaveBeenCalledTimes(1);
    expect(choferFindMany).toHaveBeenCalledTimes(1);
  });

  it("límite de filas: permite exactamente el límite configurado", async () => {
    const { prisma, crear } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const filas = Array.from({ length: LIMITE_FILAS_IMPORTACION_CSV }, (_, i) => `30-11111111-1,Chofer ${i},,20-9${String(i).padStart(6, "0")}-1,,,,`);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono\n" + filas.join("\n"),
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.total).toBe(LIMITE_FILAS_IMPORTACION_CSV);
    expect(resultado.creados).toBe(LIMITE_FILAS_IMPORTACION_CSV);
    expect(crear).toHaveBeenCalledTimes(LIMITE_FILAS_IMPORTACION_CSV);
  }, 30000);

  it("límite de filas: rechaza el archivo completo si lo supera en una sola fila, sin crear nada", async () => {
    const { prisma, crear, transportistaFindMany } = crearPrismaMock();
    const controller = new ChoferesController(prisma);
    const filas = Array.from({ length: LIMITE_FILAS_IMPORTACION_CSV + 1 }, (_, i) => `30-11111111-1,Chofer ${i},,20-9${String(i).padStart(6, "0")}-1,,,,`);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono\n" + filas.join("\n"),
    );

    await expect(controller.importar(archivo)).rejects.toThrow(`supera el límite de ${LIMITE_FILAS_IMPORTACION_CSV} filas`);
    expect(transportistaFindMany).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  }, 30000);

  it("si prisma.chofer.create falla con P2002 (condición de carrera), se traduce a un mensaje funcional — nunca el mensaje crudo de Prisma", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`cuil`)", {
          code: "P2002",
          clientVersion: "5.0.0",
          meta: { target: ["cuil"] },
        }),
      )
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const { prisma } = crearPrismaMock({ crear });
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n30-11111111-1,Uno,20-10000000-1\n30-11111111-1,Dos,20-10000000-2",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("Ya existe un registro con este CUIL");
    expect(resultado.detalle[0].mensaje).not.toContain("Unique constraint failed");
    expect(resultado.detalle[1].ok).toBe(true);
  });

  it("si prisma.chofer.create falla con un error inesperado, se reporta rechazada con un mensaje genérico — nunca error.message crudo — sin abortar el resto", async () => {
    const crear = jest
      .fn()
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly at db.internal:5432"))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: "x", ...data }));
    const { prisma } = crearPrismaMock({ crear });
    const controller = new ChoferesController(prisma);
    const archivo = crearArchivo(
      "transportistaCuit,nombre,cuil\n30-11111111-1,Uno,20-10000000-1\n30-11111111-1,Dos,20-10000000-2",
    );

    const resultado = await controller.importar(archivo);

    expect(resultado.creados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.detalle[0].ok).toBe(false);
    expect(resultado.detalle[0].mensaje).toBe("No se pudo crear el registro por un error inesperado.");
    expect(resultado.detalle[0].mensaje).not.toContain("db.internal");
    expect(resultado.detalle[1].ok).toBe(true);
  });
});

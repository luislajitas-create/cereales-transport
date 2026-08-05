import { Controller, Get, INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { registrarFiltrosGlobales } from "./registrar-filtros-globales";

// CAT-3 — prueba de REGRESIÓN del bug real encontrado en validación manual: Nest invierte
// internamente el array de useGlobalFilters(...) antes de resolverlos (ver el comentario
// extendido en registrar-filtros-globales.ts), así que un simple useGlobalFilters(A, B) puede
// terminar dándole precedencia a B sobre A sin que nada en el código lo sugiera. Una prueba
// unitaria que instancie los filtros a mano y llame a `.catch()` directamente NO detecta esto —
// necesita pasar por el mecanismo REAL de selección de filtros de Nest
// (ExceptionsHandler.invokeCustomFilters / selectExceptionFilterMetadata), que solo se ejecuta
// durante el ciclo de vida real de una request HTTP. Por eso esta suite levanta una aplicación
// Nest mínima de verdad (Test.createTestingModule + app.listen(0)) con dos rutas que lanzan
// exactamente los dos tipos de error en juego, registra los filtros con la MISMA función que usa
// main.ts (registrarFiltrosGlobales) y hace peticiones HTTP reales con fetch — nada mockeado ni
// reproducido a mano. Si alguien revierte el orden dentro de registrar-filtros-globales.ts, el
// primer test de este archivo falla (esperaría 409 y recibiría 500).
@Controller("test-filtros-globales")
class ControladorDePruebaFiltros {
  @Get("prisma-p2002")
  lanzarP2002(): never {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`organizacionId`,`cuit`)", {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target: ["organizacionId", "cuit"] },
    });
  }

  @Get("error-comun")
  lanzarErrorComun(): never {
    throw new Error("detalle interno que nunca debe llegar al cliente HTTP");
  }
}

@Module({ controllers: [ControladorDePruebaFiltros] })
class ModuloDePruebaFiltros {}

describe("Precedencia real de filtros globales (CAT-3 — regresión del bug de useGlobalFilters)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ModuloDePruebaFiltros] }).compile();
    app = moduleRef.createNestApplication();
    registrarFiltrosGlobales(app);
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("un P2002 real de Prisma lo captura PrismaExceptionFilter: HTTP 409, mensaje funcional, nunca el mensaje interno de Prisma", async () => {
    const respuesta = await fetch(`${baseUrl}/test-filtros-globales/prisma-p2002`);
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(409);
    expect(cuerpo.message).toBe("Ya existe un registro con este CUIT");
    expect(cuerpo.message).not.toContain("Unique constraint failed");
    expect(cuerpo.message).not.toContain("organizacionId");
  });

  it("un error común (no Prisma) lo sigue capturando AllExceptionsFilter: HTTP 500 genérico, sin exponer el detalle interno", async () => {
    const respuesta = await fetch(`${baseUrl}/test-filtros-globales/error-comun`);
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(500);
    expect(cuerpo.message).toBe("Error interno del servidor");
    expect(cuerpo.message).not.toContain("detalle interno que nunca debe llegar");
  });
});

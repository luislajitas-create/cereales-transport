import { INestApplication } from "@nestjs/common";
import { PrismaExceptionFilter } from "./prisma-exception.filter";
import { AllExceptionsFilter } from "./all-exceptions.filter";

// CAT-3: extraído de main.ts para que la prueba de regresión de filtros
// (filtros-globales.e2e.spec.ts) ejercite EXACTAMENTE el mismo registro que usa producción — si
// alguien revierte el orden acá, el test lo detecta ahí también, sin depender de que main.ts sea
// invocable en un test (bootstrap() hace app.listen() y lee env real, no es testeable directo).
//
// Orden importa, y es CONTRAINTUITIVO: Nest invierte internamente el array de
// useGlobalFilters(...) antes de resolverlos (node_modules/@nestjs/core/router/
// router-exception-filters.js, método create(): `exceptionHandler.setCustomFilters(filters.
// reverse())`) — el filtro que se evalúa PRIMERO es el ÚLTIMO que se pasa acá, no el primero.
// Por eso AllExceptionsFilter (catch-all, A-04) va primero en esta llamada y
// PrismaExceptionFilter (específico) va último: así PrismaExceptionFilter gana la selección para
// sus errores y AllExceptionsFilter sigue cubriendo todo lo demás. Bug real encontrado en
// validación manual de CAT-3: con el orden invertido, AllExceptionsFilter capturaba TODO,
// incluidos los P2002 de Prisma, y el usuario recibía 500 genérico en vez de 409 con mensaje
// funcional, en cualquier alta/edición individual de cualquier entidad del sistema.
export function registrarFiltrosGlobales(app: INestApplication): void {
  app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter());
}

import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { mensajeUnico } from "./prisma-mensajes";

const logger = new Logger("ImportacionCsv");

// CAT-2: la base de datos queda como última defensa ante condiciones de carrera — dos filas del
// mismo archivo o dos importaciones concurrentes apuntando al mismo valor único pueden llegar a
// create() a pesar de la detección en lote + en memoria que ya hace cada controller. Esta función
// es el único punto donde un error de create() se traduce a un mensaje por fila:
//   - nunca se devuelve error.message crudo de Prisma/PostgreSQL al usuario (puede filtrar
//     detalles de la consulta o del esquema);
//   - P2002 (restricción única) se traduce con el mismo criterio que PrismaExceptionFilter
//     (mensajeUnico, común a ambos);
//   - para lo verdaderamente inesperado se devuelve un mensaje genérico y solo se registra en el
//     log del servidor el tipo de error — nunca el mensaje completo ni los datos de la fila, que
//     podrían contener información personal (nombre, DNI, teléfono, etc.).
export function mensajeErrorImportacion(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return mensajeUnico(error.meta?.target);
      case "P2003":
        return "Uno de los datos referenciados no existe.";
      case "P2025":
        return "El registro relacionado no existe o ya fue eliminado.";
      default:
        logger.warn(`Error Prisma no mapeado durante importación (code=${error.code}).`);
        return "No se pudo crear el registro por un error de la base de datos.";
    }
  }
  logger.error(`Error inesperado durante importación (${error instanceof Error ? error.constructor.name : typeof error}).`);
  return "No se pudo crear el registro por un error inesperado.";
}

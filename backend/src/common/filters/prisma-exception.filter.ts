import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";

const CAMPO_LEGIBLE: Record<string, string> = {
  cuit: "CUIT",
  cuil: "CUIL",
  patente: "patente",
  ctg: "CTG",
  numero: "número de factura",
  email: "email",
  nombre: "nombre",
};

function mensajeUnico(target: unknown): string {
  const campos = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  const legibles = campos.map((c) => CAMPO_LEGIBLE[c] || c);
  if (legibles.length === 0) return "Ya existe un registro con estos datos";
  return `Ya existe un registro con este ${legibles.join(", ")}`;
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let message = "Error interno del servidor";

    switch (exception.code) {
      case "P2002":
        status = 409;
        message = mensajeUnico(exception.meta?.target);
        break;
      case "P2025":
        status = 404;
        message = "El registro solicitado no existe o ya fue eliminado";
        break;
      case "P2003":
        status = 400;
        message = "Uno de los datos referenciados no existe";
        break;
    }

    response.status(status).json({ statusCode: status, message, path: request.url });
  }
}

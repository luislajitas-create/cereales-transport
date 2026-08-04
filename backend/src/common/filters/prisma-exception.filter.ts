import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { mensajeUnico } from "../prisma-mensajes";

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

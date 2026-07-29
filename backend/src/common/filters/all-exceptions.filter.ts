import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Request, Response } from "express";

// A-04 (observabilidad mínima): red de logging para cualquier excepción que no haya sido
// atendida por un filtro más específico. Nest evalúa los filtros globales en el orden en que
// se registran en main.ts y usa el primero cuyo @Catch() matchee — PrismaExceptionFilter
// (más específico) sigue resolviendo los errores de Prisma antes de que lleguen acá.
//
// Preserva el status y el body de cualquier HttpException ya lanzada intencionalmente en la
// app (ValidationPipe, NotFoundException, ThrottlerException, ServiceUnavailableException del
// healthcheck, etc.) — el comportamiento HTTP visible para el cliente no cambia. Lo nuevo es
// que todo queda logueado. En particular, los bloqueos de aislamiento multi-tenant de
// organizacion-prisma.client.ts (Bloque 11 H-02/H-04) lanzan Error genérico, no HttpException
// — caen acá con status 500 igual que cualquier error no anticipado, pero su mensaje ya trae
// el prefijo "[aislamiento]" (ver ese archivo), así que el log queda igual de buscable sin
// tocar código de seguridad ya revisado adversarialmente.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const esHttpException = exception instanceof HttpException;
    const status = esHttpException ? exception.getStatus() : 500;
    const mensaje = exception instanceof Error ? exception.message : String(exception);

    this.logger.error(
      `${request.method} ${request.url} -> ${status}: ${mensaje}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (esHttpException) {
      const body = exception.getResponse();
      response.status(status).json(typeof body === "string" ? { statusCode: status, message: body, path: request.url } : body);
      return;
    }

    response.status(500).json({ statusCode: 500, message: "Error interno del servidor", path: request.url });
  }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { organizacionContextStorage } from "./organizacion-context";

// Único responsable de sembrar el contexto organizacional. No agrega lógica funcional ni
// reglas de negocio — solo lee request.user.organizacionId (ya resuelto por JwtStrategy,
// garantizado por Nest a correr antes que cualquier Interceptor) y ejecuta el resto del
// pipeline dentro de ese contexto. Global: corre también en rutas públicas (/health,
// /auth/login), donde organizacionId queda undefined y sencillamente no se usa.
@Injectable()
export class OrganizacionContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const organizacionId = request?.user?.organizacionId;
    return organizacionContextStorage.run({ organizacionId }, () => next.handle());
  }
}

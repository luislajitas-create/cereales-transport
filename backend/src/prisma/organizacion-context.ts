import { UnauthorizedException } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

// Única fuente de verdad del contexto organizacional (reemplaza el Provider request-scoped +
// Proxy de resolución perezosa de la primera versión de 8.1.d). Sembrado exclusivamente por
// OrganizacionContextInterceptor, leído exclusivamente por crearClienteOrganizacional en el
// momento en que se ejecuta cada query — nunca antes, nunca por fuera de este archivo.
export interface OrganizacionContexto {
  organizacionId: string | undefined;
}

export const organizacionContextStorage = new AsyncLocalStorage<OrganizacionContexto>();

export function obtenerOrganizacionIdActual(): string {
  const contexto = organizacionContextStorage.getStore();
  const organizacionId = contexto?.organizacionId;
  if (typeof organizacionId !== "string" || organizacionId.length === 0) {
    throw new UnauthorizedException("Sin contexto de organización");
  }
  return organizacionId;
}

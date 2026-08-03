import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { OrganizacionController } from "./organizacion.controller";

// FAC-4: mismo criterio que facturas.roles.spec.ts — lee los decoradores @Roles() reales de
// OrganizacionController vía Reflector, el mismo mecanismo que usa RolesGuard en producción.
// Cobertura acotada al endpoint nuevo (auditoriaOpciones); auditoria()/obtener()/actualizar()
// no tenían test dedicado antes de FAC-4 y agregarlo ahora sería ampliar el alcance de este
// bloque sin que se haya pedido.
function contextoPara(handler: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => OrganizacionController,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — OrganizacionController.auditoriaOpciones (FAC-4)", () => {
  const guard = new RolesGuard(new Reflector());
  const handler = OrganizacionController.prototype.auditoriaOpciones;

  it("rechaza a un usuario LECTURA", () => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(false);
  });

  it("rechaza sin usuario autenticado", () => {
    expect(guard.canActivate(contextoPara(handler, undefined))).toBe(false);
  });

  it("rechaza a roles sin alcance sobre Auditoría (GERENCIA/OPERACIONES/LIQUIDACIONES/FACTURACION)", () => {
    for (const rol of ["GERENCIA", "OPERACIONES", "LIQUIDACIONES", "FACTURACION"]) {
      expect(guard.canActivate(contextoPara(handler, rol))).toBe(false);
    }
  });

  it("permite a ADMINISTRADOR", () => {
    expect(guard.canActivate(contextoPara(handler, "ADMINISTRADOR"))).toBe(true);
  });
});

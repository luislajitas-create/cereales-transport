import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { AnticiposController } from "./anticipos.controller";

// SEC-UI-1: mismo criterio que transportistas.roles.spec.ts/clientes.roles.spec.ts — lee los
// decoradores @Roles() reales de AnticiposController vía Reflector, el mismo mecanismo que usa
// RolesGuard en producción.
function contextoPara(handler: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AnticiposController,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — endpoints reales de Anticipos (SEC-UI-1)", () => {
  const guard = new RolesGuard(new Reflector());

  const ESCRITURA: [string, Function][] = [
    ["create", AnticiposController.prototype.create],
    ["update", AnticiposController.prototype.update],
    ["anular", AnticiposController.prototype.anular],
  ];

  it.each(ESCRITURA)("Anticipo.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA)("Anticipo.%s rechaza sin usuario autenticado", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, undefined))).toBe(false);
  });

  it.each(ESCRITURA)("Anticipo.%s rechaza a FACTURACION (rol sin alcance sobre Anticipos)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "FACTURACION"))).toBe(false);
  });

  it.each(ESCRITURA)("Anticipo.%s permite a LIQUIDACIONES", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LIQUIDACIONES"))).toBe(true);
  });

  it.each(ESCRITURA)("Anticipo.%s permite a OPERACIONES", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "OPERACIONES"))).toBe(true);
  });

  it.each(ESCRITURA)("Anticipo.%s permite a ADMINISTRADOR (override universal)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "ADMINISTRADOR"))).toBe(true);
  });

  const CONSULTA: [string, Function][] = [
    ["findAll", AnticiposController.prototype.findAll],
    ["findOne", AnticiposController.prototype.findOne],
  ];

  it.each(CONSULTA)("Anticipo.%s no exige rol especifico — LECTURA puede consultar", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(true);
  });
});

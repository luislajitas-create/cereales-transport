import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { ClientesController } from "./clientes.controller";

// Mismo criterio que transportistas.roles.spec.ts (CRM-2): no mockea metadata artificial — lee
// los decoradores @Roles() reales de ClientesController vía Reflector, el mismo mecanismo que
// usa RolesGuard en producción. Prueba exactamente lo que un usuario LECTURA puede o no puede
// ejecutar en la pantalla Clientes, incluida la importación CSV (CAT-1).
function contextoPara(handler: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ClientesController,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — endpoints reales de Clientes (verificación de autorización)", () => {
  const guard = new RolesGuard(new Reflector());

  const ESCRITURA: [string, Function][] = [
    ["create", ClientesController.prototype.create],
    ["update", ClientesController.prototype.update],
    ["remove (baja logica)", ClientesController.prototype.remove],
    ["importar (CSV, CAT-1)", ClientesController.prototype.importar],
  ];

  it.each(ESCRITURA)("Cliente.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA)("Cliente.%s rechaza sin usuario autenticado", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, undefined))).toBe(false);
  });

  it.each(ESCRITURA)("Cliente.%s permite a FACTURACION", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "FACTURACION"))).toBe(true);
  });

  it.each(ESCRITURA)("Cliente.%s permite a OPERACIONES", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "OPERACIONES"))).toBe(true);
  });

  it.each(ESCRITURA)("Cliente.%s permite a ADMINISTRADOR (override universal)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "ADMINISTRADOR"))).toBe(true);
  });

  it.each(ESCRITURA)("Cliente.%s rechaza a LIQUIDACIONES (rol sin alcance sobre Clientes)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LIQUIDACIONES"))).toBe(false);
  });

  const CONSULTA: [string, Function][] = [
    ["findAll (incluida inactivos)", ClientesController.prototype.findAll],
    ["findOne", ClientesController.prototype.findOne],
    ["cuentaCorriente", ClientesController.prototype.cuentaCorriente],
  ];

  it.each(CONSULTA)("Cliente.%s no exige rol especifico — LECTURA puede consultar", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(true);
  });
});

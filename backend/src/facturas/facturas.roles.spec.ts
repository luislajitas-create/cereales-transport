import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { FacturasController } from "./facturas.controller";

// SEC-UI-1: mismo criterio que transportistas.roles.spec.ts/clientes.roles.spec.ts — lee los
// decoradores @Roles() reales de FacturasController vía Reflector, el mismo mecanismo que usa
// RolesGuard en producción.
function contextoPara(handler: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FacturasController,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — endpoints reales de Facturas (SEC-UI-1)", () => {
  const guard = new RolesGuard(new Reflector());

  const ESCRITURA: [string, Function][] = [
    ["create", FacturasController.prototype.create],
    ["anular", FacturasController.prototype.anular],
    ["registrarCobranza", FacturasController.prototype.registrarCobranza],
    ["anularCobranza", FacturasController.prototype.anularCobranza],
  ];

  it.each(ESCRITURA)("Factura.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA)("Factura.%s rechaza sin usuario autenticado", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, undefined))).toBe(false);
  });

  it.each(ESCRITURA)("Factura.%s rechaza a OPERACIONES/LIQUIDACIONES (roles sin alcance sobre Facturas)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "OPERACIONES"))).toBe(false);
    expect(guard.canActivate(contextoPara(handler, "LIQUIDACIONES"))).toBe(false);
  });

  it.each(ESCRITURA)("Factura.%s permite a FACTURACION", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "FACTURACION"))).toBe(true);
  });

  it.each(ESCRITURA)("Factura.%s permite a ADMINISTRADOR (override universal)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "ADMINISTRADOR"))).toBe(true);
  });

  const CONSULTA: [string, Function][] = [
    ["findAll", FacturasController.prototype.findAll],
    ["findOne", FacturasController.prototype.findOne],
    ["conciliacion", FacturasController.prototype.conciliacion],
  ];

  it.each(CONSULTA)("Factura.%s no exige rol especifico — LECTURA puede consultar", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, "LECTURA"))).toBe(true);
  });
});

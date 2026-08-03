import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { CerealesController, UbicacionesController, TiposGastoController, ProductoresController } from "./simples.controller";

// SEC-UI-1 (Catalogos.tsx): mismo criterio que el resto de los *.roles.spec.ts de este bloque —
// lee los decoradores @Roles() reales de cada controller vía Reflector. Cubre la asimetría real
// entre Tipos de gasto (admite LIQUIDACIONES) y Cereales/Ubicaciones/Productores (no la admiten),
// que Catalogos.tsx debe reflejar sin unificar ambos flags en uno solo.
function contextoPara(handler: Function, clase: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — endpoints reales de Catálogos simples (SEC-UI-1)", () => {
  const guard = new RolesGuard(new Reflector());

  const ESCRITURA_SIN_LIQUIDACIONES: [string, Function, Function][] = [
    ["Cereal.create", CerealesController.prototype.create, CerealesController],
    ["Ubicacion.create", UbicacionesController.prototype.create, UbicacionesController],
    ["Productor.create", ProductoresController.prototype.create, ProductoresController],
    ["Productor.update", ProductoresController.prototype.update, ProductoresController],
  ];

  it.each(ESCRITURA_SIN_LIQUIDACIONES)("%s rechaza a un usuario LECTURA", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA_SIN_LIQUIDACIONES)("%s rechaza sin usuario autenticado", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, undefined))).toBe(false);
  });

  it.each(ESCRITURA_SIN_LIQUIDACIONES)("%s rechaza a LIQUIDACIONES (a diferencia de Tipos de gasto, aqui no alcanza)", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, "LIQUIDACIONES"))).toBe(false);
  });

  it.each(ESCRITURA_SIN_LIQUIDACIONES)("%s permite a OPERACIONES", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, "OPERACIONES"))).toBe(true);
  });

  it.each(ESCRITURA_SIN_LIQUIDACIONES)("%s permite a ADMINISTRADOR (override universal)", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, "ADMINISTRADOR"))).toBe(true);
  });

  it("TipoGasto.create rechaza a un usuario LECTURA", () => {
    expect(guard.canActivate(contextoPara(TiposGastoController.prototype.create, TiposGastoController, "LECTURA"))).toBe(false);
  });

  it("TipoGasto.create rechaza sin usuario autenticado", () => {
    expect(guard.canActivate(contextoPara(TiposGastoController.prototype.create, TiposGastoController, undefined))).toBe(false);
  });

  it("TipoGasto.create permite a LIQUIDACIONES (asimetria real respecto de Cereales/Ubicaciones/Productores)", () => {
    expect(guard.canActivate(contextoPara(TiposGastoController.prototype.create, TiposGastoController, "LIQUIDACIONES"))).toBe(true);
  });

  it("TipoGasto.create permite a OPERACIONES", () => {
    expect(guard.canActivate(contextoPara(TiposGastoController.prototype.create, TiposGastoController, "OPERACIONES"))).toBe(true);
  });

  const CONSULTA: [string, Function, Function][] = [
    ["Cereal.findAll", CerealesController.prototype.findAll, CerealesController],
    ["Ubicacion.findAll", UbicacionesController.prototype.findAll, UbicacionesController],
    ["TipoGasto.findAll", TiposGastoController.prototype.findAll, TiposGastoController],
    ["Productor.findAll", ProductoresController.prototype.findAll, ProductoresController],
  ];

  it.each(CONSULTA)("%s no exige rol especifico — LECTURA puede consultar", (_nombre, handler, clase) => {
    expect(guard.canActivate(contextoPara(handler, clase, "LECTURA"))).toBe(true);
  });
});

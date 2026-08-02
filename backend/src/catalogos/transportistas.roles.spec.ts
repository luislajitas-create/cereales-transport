import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { TransportistasController } from "./transportistas.controller";
import { ChoferesController } from "./choferes.controller";
import { VehiculosController } from "./vehiculos.controller";

// CRM-2: RolesGuard no tenía ningún test en todo el backend. Estos tests no mockean metadata
// artificial — leen los decoradores @Roles() reales de los controllers vía Reflector, igual que
// hace RolesGuard en producción, para probar exactamente lo que un usuario LECTURA puede o no
// puede ejecutar en Transportistas/Choferes/Vehiculos (pantalla Transportistas).
function contextoPara(handler: Function, clase: Function, rol?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({
      getRequest: () => (rol ? { user: { rol } } : { user: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — endpoints reales de Transportistas/Choferes/Vehiculos (CRM-2)", () => {
  const guard = new RolesGuard(new Reflector());

  const ESCRITURA_TRANSPORTISTA: [string, Function][] = [
    ["create", TransportistasController.prototype.create],
    ["update", TransportistasController.prototype.update],
    ["remove (baja logica)", TransportistasController.prototype.remove],
    ["importar (CSV, CAT-1)", TransportistasController.prototype.importar],
  ];

  it.each(ESCRITURA_TRANSPORTISTA)("Transportista.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, TransportistasController, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA_TRANSPORTISTA)("Transportista.%s rechaza sin usuario autenticado", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, TransportistasController, undefined))).toBe(false);
  });

  it.each(ESCRITURA_TRANSPORTISTA)("Transportista.%s permite a OPERACIONES", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, TransportistasController, "OPERACIONES"))).toBe(true);
  });

  it.each(ESCRITURA_TRANSPORTISTA)("Transportista.%s permite a ADMINISTRADOR (override universal)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, TransportistasController, "ADMINISTRADOR"))).toBe(true);
  });

  it("Transportista.findAll (consulta) no exige rol especifico — LECTURA puede listar (incluida inactivos)", () => {
    expect(guard.canActivate(contextoPara(TransportistasController.prototype.findAll, TransportistasController, "LECTURA"))).toBe(true);
  });

  it("Transportista.findOne (consulta) no exige rol especifico — LECTURA puede ver el detalle", () => {
    expect(guard.canActivate(contextoPara(TransportistasController.prototype.findOne, TransportistasController, "LECTURA"))).toBe(true);
  });

  const ESCRITURA_CHOFER: [string, Function][] = [
    ["create", ChoferesController.prototype.create],
    ["update (incluye edicion de comision)", ChoferesController.prototype.update],
    ["remove (baja logica)", ChoferesController.prototype.remove],
  ];

  it.each(ESCRITURA_CHOFER)("Chofer.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, ChoferesController, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA_CHOFER)("Chofer.%s permite a LIQUIDACIONES", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, ChoferesController, "LIQUIDACIONES"))).toBe(true);
  });

  it("Chofer.findAll (consulta) no exige rol especifico — LECTURA puede listar", () => {
    expect(guard.canActivate(contextoPara(ChoferesController.prototype.findAll, ChoferesController, "LECTURA"))).toBe(true);
  });

  const ESCRITURA_VEHICULO: [string, Function][] = [
    ["create", VehiculosController.prototype.create],
    ["update", VehiculosController.prototype.update],
    ["remove (baja logica)", VehiculosController.prototype.remove],
  ];

  it.each(ESCRITURA_VEHICULO)("Vehiculo.%s rechaza a un usuario LECTURA", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, VehiculosController, "LECTURA"))).toBe(false);
  });

  it.each(ESCRITURA_VEHICULO)("Vehiculo.%s rechaza a LIQUIDACIONES (a diferencia de Choferes, aqui no alcanza)", (_nombre, handler) => {
    expect(guard.canActivate(contextoPara(handler, VehiculosController, "LIQUIDACIONES"))).toBe(false);
  });

  it("Vehiculo.findAll (consulta) no exige rol especifico — LECTURA puede listar", () => {
    expect(guard.canActivate(contextoPara(VehiculosController.prototype.findAll, VehiculosController, "LECTURA"))).toBe(true);
  });
});

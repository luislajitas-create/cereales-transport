// Necesario para que @Type() (class-transformer) resuelva metadata de decoradores al importar
// el DTO en aislamiento — en la app real lo carga main.ts como primera línea, antes que
// cualquier otra cosa; un test que importa el DTO directo, sin pasar por main.ts, no lo tiene.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AltaOrganizacionDto } from "./alta-organizacion.dto";

// Reproduce exactamente lo que hace ValidationPipe (ya configurado globalmente en main.ts) —
// detectado por prueba funcional real: sin @IsDefined() en los campos anidados, un body vacío
// pasaba la validación y explotaba como 500 no controlado dentro del servicio.
async function validarBody(body: unknown) {
  const instancia = plainToInstance(AltaOrganizacionDto, body);
  return validate(instancia);
}

describe("AltaOrganizacionDto", () => {
  it("rechaza un body vacío — organizacion y administrador son obligatorios", async () => {
    const errores = await validarBody({});
    const propiedades = errores.map((e) => e.property);
    expect(propiedades).toEqual(expect.arrayContaining(["organizacion", "administrador"]));
  });

  it("acepta un body completo y válido sin errores", async () => {
    const errores = await validarBody({
      organizacion: { nombre: "Acme SA", cuit: "20123456786" },
      administrador: { nombre: "Admin", email: "admin@acme.test", password: "Password123!" },
    });
    expect(errores).toHaveLength(0);
  });

  it("rechaza un CUIT con dígito verificador incorrecto", async () => {
    const errores = await validarBody({
      organizacion: { nombre: "Acme SA", cuit: "20123456780" },
      administrador: { nombre: "Admin", email: "admin@acme.test", password: "Password123!" },
    });
    const errorOrganizacion = errores.find((e) => e.property === "organizacion");
    expect(errorOrganizacion).toBeDefined();
  });
});

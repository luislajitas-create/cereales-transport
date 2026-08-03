// FAC-3: mismo patrón que alta-organizacion.dto.spec.ts — reproduce el ValidationPipe global
// (whitelist: true, transform: true) fuera del contexto de la app real.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AnularCobranzaDto } from "./anular-cobranza.dto";

async function validarBody(body: unknown) {
  const instancia = plainToInstance(AnularCobranzaDto, body);
  return validate(instancia);
}

describe("AnularCobranzaDto (FAC-3)", () => {
  it("rechaza un body sin motivo", async () => {
    const errores = await validarBody({});
    expect(errores.map((e) => e.property)).toEqual(["motivo"]);
  });

  it("rechaza motivo vacío", async () => {
    const errores = await validarBody({ motivo: "" });
    expect(errores.map((e) => e.property)).toEqual(["motivo"]);
  });

  it("acepta un motivo no vacío", async () => {
    const errores = await validarBody({ motivo: "Cobranza cargada por error" });
    expect(errores).toHaveLength(0);
  });
});

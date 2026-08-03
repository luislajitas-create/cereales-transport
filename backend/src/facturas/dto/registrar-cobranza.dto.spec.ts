// FAC-4: mismo patrón que anular-cobranza.dto.spec.ts / alta-organizacion.dto.spec.ts —
// reproduce el ValidationPipe global (whitelist: true, transform: true) fuera del contexto de
// la app real. Reescrito tras el ajuste post-revisión: medioPago pasó de "lista cerrada
// (@IsIn)" a "texto libre obligatorio, normalizado (trim) y con límite de longitud" — ya no
// existe una lista de valores válidos que probar, el dominio es cualquier descripción real no
// vacía de hasta 60 caracteres.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegistrarCobranzaDto } from "./registrar-cobranza.dto";

async function validarBody(body: unknown) {
  const instancia = plainToInstance(RegistrarCobranzaDto, body);
  return validate(instancia);
}

describe("RegistrarCobranzaDto (FAC-4)", () => {
  it("acepta un body completo y válido sin errores", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA", observacion: "ok" });
    expect(errores).toHaveLength(0);
  });

  it("rechaza importe cero", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 0, medioPago: "EFECTIVO" });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["importe"]));
  });

  it("rechaza importe negativo", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: -100, medioPago: "EFECTIVO" });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["importe"]));
  });

  it("rechaza una fecha inválida", async () => {
    const errores = await validarBody({ fecha: "no-es-una-fecha", importe: 400, medioPago: "EFECTIVO" });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["fecha"]));
  });

  it("rechaza un body sin fecha, importe ni medioPago", async () => {
    const errores = await validarBody({});
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["fecha", "importe", "medioPago"]));
  });

  it("acepta medioPago = TRANSFERENCIA (atajo rápido del frontend)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA" });
    expect(errores).toHaveLength(0);
  });

  it("acepta medioPago = EFECTIVO (atajo rápido del frontend)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "EFECTIVO" });
    expect(errores).toHaveLength(0);
  });

  it("rechaza medioPago ausente", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400 });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["medioPago"]));
  });

  it("rechaza medioPago vacío", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "" });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["medioPago"]));
  });

  it("rechaza medioPago compuesto solo de espacios (normalización por trim antes de validar)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "   " });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["medioPago"]));
  });

  it("acepta un medio de pago personalizado (descripción real, opción 'Otro' del frontend)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "Cheque diferido a 60 días" });
    expect(errores).toHaveLength(0);
  });

  it("recorta espacios al inicio/fin de un medio personalizado sin rechazarlo", async () => {
    const instancia = plainToInstance(RegistrarCobranzaDto, { fecha: "2026-08-01", importe: 400, medioPago: "  Mercado Pago  " });
    const errores = await validate(instancia);
    expect(errores).toHaveLength(0);
    expect(instancia.medioPago).toBe("Mercado Pago");
  });

  it("rechaza un medioPago que excede la longitud máxima (60 caracteres)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "x".repeat(61) });
    expect(errores.map((e) => e.property)).toEqual(expect.arrayContaining(["medioPago"]));
  });

  it("acepta un medioPago justo en el límite de longitud (60 caracteres)", async () => {
    const errores = await validarBody({ fecha: "2026-08-01", importe: 400, medioPago: "x".repeat(60) });
    expect(errores).toHaveLength(0);
  });
});

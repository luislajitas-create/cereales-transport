// GAP-GE-1: prueba puntual con el runner nativo de Node (mismo criterio que
// organizacion-payload.test.mjs, CAT-6) — se ejecuta con
// `node --experimental-strip-types alta-organizacion-payload.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirPayloadAltaOrganizacion, validarConfirmacionPassword } from "./alta-organizacion-payload.ts";

function formValido(overrides = {}) {
  return {
    nombre: "Acme SA",
    razonSocial: "",
    cuit: "20123456786",
    domicilio: "",
    telefono: "",
    administradorNombre: "Admin Dos",
    administradorEmail: "admin2@acme.test",
    password: "Password123!",
    confirmarPassword: "Password123!",
    ...overrides,
  };
}

test("payload: campos obligatorios se recortan", () => {
  const payload = construirPayloadAltaOrganizacion(formValido({ nombre: "  Acme SA  ", cuit: " 20123456786 " }));
  assert.equal(payload.organizacion.nombre, "Acme SA");
  assert.equal(payload.organizacion.cuit, "20123456786");
});

test("payload: CUIT nunca se reformatea en el cliente (guiones intactos, es tarea del backend)", () => {
  const payload = construirPayloadAltaOrganizacion(formValido({ cuit: "20-12345678-6" }));
  assert.equal(payload.organizacion.cuit, "20-12345678-6");
});

test("payload: campos opcionales vacíos quedan undefined, nunca ''", () => {
  const payload = construirPayloadAltaOrganizacion(formValido({ razonSocial: "", domicilio: "   ", telefono: "" }));
  assert.equal(payload.organizacion.razonSocial, undefined);
  assert.equal(payload.organizacion.domicilio, undefined);
  assert.equal(payload.organizacion.telefono, undefined);
});

test("payload: campos opcionales con valor real se recortan y se incluyen", () => {
  const payload = construirPayloadAltaOrganizacion(formValido({ razonSocial: "  Acme Sociedad Anónima  " }));
  assert.equal(payload.organizacion.razonSocial, "Acme Sociedad Anónima");
});

test("payload: administrador.password nunca se recorta (no reformatear la contraseña)", () => {
  const payload = construirPayloadAltaOrganizacion(formValido({ password: "  espacios reales  ", confirmarPassword: "  espacios reales  " }));
  assert.equal(payload.administrador.password, "  espacios reales  ");
});

test("payload: confirmarPassword nunca viaja en el objeto enviado", () => {
  const payload = construirPayloadAltaOrganizacion(formValido());
  assert.equal("confirmarPassword" in payload.administrador, false);
  assert.equal("confirmarPassword" in payload, false);
});

test("payload: estructura exacta esperada por AltaOrganizacionDto", () => {
  const payload = construirPayloadAltaOrganizacion(formValido());
  assert.deepEqual(Object.keys(payload).sort(), ["administrador", "organizacion"]);
  assert.deepEqual(Object.keys(payload.administrador).sort(), ["email", "nombre", "password"]);
});

test("confirmación de password: contraseña corta -> error", () => {
  assert.equal(validarConfirmacionPassword("1234567", "1234567"), "La contraseña debe tener al menos 8 caracteres.");
});

test("confirmación de password: no coinciden -> error", () => {
  assert.equal(validarConfirmacionPassword("Password123!", "Password124!"), "Las contraseñas no coinciden.");
});

test("confirmación de password: válida -> null", () => {
  assert.equal(validarConfirmacionPassword("Password123!", "Password123!"), null);
});

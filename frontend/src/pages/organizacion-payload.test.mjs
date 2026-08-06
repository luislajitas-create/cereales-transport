// CAT-6: prueba puntual con el runner NATIVO de Node (node:test + node:assert, disponible desde
// Node 18, sin instalar nada) sobre la lógica pura de construcción del payload de "Mi
// Organización" — el proyecto no tiene ningún framework de tests de componentes (Vitest/Jest) y
// por instrucción explícita no se instaló uno nuevo solo para esto. Se ejecuta con
// `node --experimental-strip-types organizacion-payload.test.mjs` (Node 24 borra los tipos de
// organizacion-payload.ts al vuelo, sin transpilar JSX — este archivo fuente no tiene JSX, así
// que el import funciona sin ningún loader adicional). No forma parte de ningún script de
// npm/CI — es una verificación puntual, documentada en AUDITORIA_CATALOGOS.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirValorCampo, construirPayloadOrganizacion } from "./organizacion-payload.ts";

test("campo sin cambios -> undefined (queda omitido del payload)", () => {
  assert.equal(construirValorCampo("domicilio", "Calle Falsa 123", "Calle Falsa 123"), undefined);
});

test("campo opcional vacío que YA estaba vacío (nunca cargado) -> undefined, nunca ''", () => {
  // Este es el caso exacto del bug real: email nunca cargado (null) y el input renderiza "" —
  // antes se enviaba `email: ""` en CADA guardado; ahora se detecta como "sin cambios".
  assert.equal(construirValorCampo("email", null, ""), undefined);
  assert.equal(construirValorCampo("email", "", ""), undefined);
});

test("campo nullable previamente informado que se vacía -> null", () => {
  assert.equal(construirValorCampo("email", "admin@acme.test", ""), null);
  assert.equal(construirValorCampo("email", "admin@acme.test", "   "), null);
});

test("campo nullable modificado (no vacío) -> el texto tal cual, sin recortar", () => {
  assert.equal(construirValorCampo("email", "viejo@acme.test", " nuevo@acme.test "), " nuevo@acme.test ");
});

test("email inválido no vacío -> se envía tal cual (la validación real es responsabilidad del backend)", () => {
  assert.equal(construirValorCampo("email", null, "no-es-un-email"), "no-es-un-email");
});

test("CUIT histórico sin cambios -> undefined (nunca se revalida un CUIT que no se tocó)", () => {
  assert.equal(construirValorCampo("cuit", "30100000001", "30100000001"), undefined);
});

test("CUIT vacío (antes tenía valor) -> null", () => {
  assert.equal(construirValorCampo("cuit", "30100000001", ""), null);
});

test("CUIT modificado -> el texto tal cual, sin normalizar en el cliente", () => {
  assert.equal(construirValorCampo("cuit", "30100000001", "20-12345678-6"), "20-12345678-6");
});

test("campo obligatorio (nombre) que se vacía -> se envía vacío tal cual, NUNCA null (deja que el backend lo rechace)", () => {
  assert.equal(construirValorCampo("nombre", "Acme SA", ""), "");
  assert.notEqual(construirValorCampo("nombre", "Acme SA", ""), null);
});

test("nombre sin cambios -> undefined", () => {
  assert.equal(construirValorCampo("nombre", "Acme SA", "Acme SA"), undefined);
});

test("construirPayloadOrganizacion: cambiar solo domicilio -> el payload contiene ÚNICAMENTE domicilio", () => {
  const organizacionCargada = {
    nombre: "Acme SA",
    razonSocial: null,
    cuit: "30100000001",
    domicilio: "",
    telefono: null,
    email: null,
    zonaHoraria: null,
    moneda: null,
  };
  const formulario = { ...organizacionCargada, domicilio: "VALIDACION CAT6 TEMP" };
  const campos = ["nombre", "razonSocial", "cuit", "domicilio", "telefono", "email", "zonaHoraria", "moneda"];

  const payload = construirPayloadOrganizacion(campos, organizacionCargada, formulario);

  assert.deepEqual(payload, { domicilio: "VALIDACION CAT6 TEMP" });
  assert.equal("email" in payload, false);
  assert.equal("cuit" in payload, false);
});

test("construirPayloadOrganizacion: ningún campo opcional sin cambios se convierte en ''", () => {
  const organizacionCargada = {
    nombre: "Acme SA",
    razonSocial: null,
    cuit: null,
    domicilio: null,
    telefono: null,
    email: null,
    zonaHoraria: null,
    moneda: null,
  };
  // El formulario, tal como lo renderiza React (value={form[c.name] || ""}), llega con "" en
  // todos los campos que la organización tiene en null — exactamente el escenario del bug real.
  const formulario = {
    nombre: "Acme SA",
    razonSocial: "",
    cuit: "",
    domicilio: "",
    telefono: "",
    email: "",
    zonaHoraria: "",
    moneda: "",
  };
  const campos = ["nombre", "razonSocial", "cuit", "domicilio", "telefono", "email", "zonaHoraria", "moneda"];

  const payload = construirPayloadOrganizacion(campos, organizacionCargada, formulario);

  assert.deepEqual(payload, {});
});

test("construirPayloadOrganizacion: payload nunca contiene la cadena vacía '' para ningún campo", () => {
  const organizacionCargada = { nombre: "Acme SA", email: "viejo@acme.test", domicilio: "Calle 1" };
  const formulario = { nombre: "Acme SA", email: "", domicilio: "" };
  const payload = construirPayloadOrganizacion(["nombre", "email", "domicilio"], organizacionCargada, formulario);

  for (const valor of Object.values(payload)) {
    assert.notEqual(valor, "");
  }
  assert.deepEqual(payload, { email: null, domicilio: null });
});

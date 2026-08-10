import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarCodigoGrupo,
  esFormatoCodigoGrupoValido,
  validarNombreGrupo,
} from "./grupo-economico-payload.ts";

test("normalizarCodigoGrupo: recorta espacios alrededor", () => {
  assert.equal(normalizarCodigoGrupo("  a1b2c3d4-e5f6-7890-abcd-ef1234567890  "), "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
});

test("esFormatoCodigoGrupoValido: uuid v4-like válido -> true", () => {
  assert.equal(esFormatoCodigoGrupoValido("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), true);
});

test("esFormatoCodigoGrupoValido: acepta mayúsculas (uuid no es case-sensitive)", () => {
  assert.equal(esFormatoCodigoGrupoValido("A1B2C3D4-E5F6-7890-ABCD-EF1234567890"), true);
});

test("esFormatoCodigoGrupoValido: con espacios alrededor -> true (se normaliza antes de chequear)", () => {
  assert.equal(esFormatoCodigoGrupoValido("  a1b2c3d4-e5f6-7890-abcd-ef1234567890  "), true);
});

test("esFormatoCodigoGrupoValido: vacío -> false", () => {
  assert.equal(esFormatoCodigoGrupoValido(""), false);
  assert.equal(esFormatoCodigoGrupoValido("   "), false);
});

test("esFormatoCodigoGrupoValido: texto arbitrario -> false", () => {
  assert.equal(esFormatoCodigoGrupoValido("no-es-un-codigo"), false);
});

test("esFormatoCodigoGrupoValido: uuid con longitud incorrecta -> false", () => {
  assert.equal(esFormatoCodigoGrupoValido("a1b2c3d4-e5f6-7890-abcd-ef123456789"), false);
});

test("validarNombreGrupo: vacío -> error", () => {
  assert.equal(validarNombreGrupo(""), "Ingresá un nombre para el grupo económico.");
  assert.equal(validarNombreGrupo("   "), "Ingresá un nombre para el grupo económico.");
});

test("validarNombreGrupo: supera 200 caracteres -> error", () => {
  const nombreLargo = "a".repeat(201);
  assert.equal(validarNombreGrupo(nombreLargo), "El nombre no puede superar los 200 caracteres.");
});

test("validarNombreGrupo: exactamente 200 caracteres -> válido", () => {
  const nombreLimite = "a".repeat(200);
  assert.equal(validarNombreGrupo(nombreLimite), null);
});

test("validarNombreGrupo: nombre real -> null (válido)", () => {
  assert.equal(validarNombreGrupo("Grupo Los Ñaños"), null);
});

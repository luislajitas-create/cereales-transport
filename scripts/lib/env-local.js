/* eslint-disable no-console */
// DEV-1 — parser mínimo de ".env", de solo lectura, sin dependencias externas. Se usa desde
// scripts/preflight.js y scripts/estado.js (ambos corren desde la raíz del repo, donde no hay
// node_modules propio) únicamente para INSPECCIONAR qué hay en backend/.env — nunca para
// mutar process.env de otro proceso ni para reemplazar la carga real que hace
// backend/src/main.ts (import "dotenv/config").
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");
const RUTA_ENV_BACKEND = path.join(RAIZ, "backend", ".env");

function parsearEnv(rutaArchivo) {
  if (!fs.existsSync(rutaArchivo)) return null;
  const contenido = fs.readFileSync(rutaArchivo, "utf8");
  const variables = {};
  for (const lineaCruda of contenido.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith("#")) continue;
    const idx = linea.indexOf("=");
    if (idx === -1) continue;
    const clave = linea.slice(0, idx).trim();
    let valor = linea.slice(idx + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    variables[clave] = valor;
  }
  return variables;
}

function extraerHost(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

function esHostLocal(host) {
  return host === "localhost" || host === "127.0.0.1";
}

module.exports = { RAIZ, RUTA_ENV_BACKEND, parsearEnv, extraerHost, esHostLocal };

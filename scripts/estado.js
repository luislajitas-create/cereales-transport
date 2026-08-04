#!/usr/bin/env node
/* eslint-disable no-console */
// DEV-1 — estado actual del entorno local, de solo lectura: nunca modifica nada, nunca arranca
// ni detiene procesos, nunca imprime secretos. Complementario a `npm run preflight` (que se usa
// ANTES de levantar el entorno y trata un puerto ocupado como error): esto reporta qué hay
// corriendo ahora mismo, en cualquier momento, incluso con todo ya levantado.
const net = require("net");
const http = require("http");
const { RUTA_ENV_BACKEND, parsearEnv, extraerHost, esHostLocal } = require("./lib/env-local");

// Host "localhost" (no "127.0.0.1" fijo) — Vite puede quedar escuchando solo en "::1" (IPv6)
// sin `server.host` explícito; ver la misma nota en scripts/preflight.js.
function verificarPuertoAbierto(puerto) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: puerto, host: "localhost" });
    const finalizar = (abierto) => {
      socket.destroy();
      resolve(abierto);
    };
    socket.once("connect", () => finalizar(true));
    socket.once("error", () => finalizar(false));
    socket.setTimeout(1000, () => finalizar(false));
  });
}

function consultarHealth() {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000/api/v1/health", (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", (err) => resolve({ status: null, error: err.code || err.message }));
    req.setTimeout(2000, () => req.destroy());
  });
}

async function main() {
  console.log("=== Estado del entorno local (DEV-1) ===\n");

  const backendEscuchando = await verificarPuertoAbierto(3000);
  console.log(`Backend  (puerto 3000): ${backendEscuchando ? "escuchando" : "no responde"}`);
  if (backendEscuchando) {
    const health = await consultarHealth();
    console.log(
      health.status === 200
        ? `  Health check: OK — ${health.body}`
        : `  Health check: sin respuesta 200 (${health.status ?? health.error})`,
    );
  }

  const frontendEscuchando = await verificarPuertoAbierto(5173);
  console.log(`Frontend (puerto 5173): ${frontendEscuchando ? "escuchando" : "no responde"}`);

  const variablesEnv = parsearEnv(RUTA_ENV_BACKEND);
  if (variablesEnv?.DATABASE_URL) {
    const host = extraerHost(variablesEnv.DATABASE_URL);
    const local = esHostLocal(host);
    console.log(`DATABASE_URL configurada apunta a: ${host ?? "desconocido"}${local ? " (local)" : " (¡NO es local!)"}`);
  } else {
    console.log("DATABASE_URL: no se pudo leer desde backend/.env");
  }
}

main();

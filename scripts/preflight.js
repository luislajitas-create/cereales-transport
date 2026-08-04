#!/usr/bin/env node
/* eslint-disable no-console */
// DEV-1 — preflight de entorno local. De solo lectura: no modifica nada, no imprime valores
// sensibles (nunca DATABASE_URL completo, nunca JWT_SECRET — solo si están presentes o no, y
// el host de DATABASE_URL, que no es secreto). Se usa antes de levantar backend/frontend
// localmente (scripts/dev.js lo corre primero) y también standalone (`npm run preflight`)
// para diagnosticar sin arrancar nada.
const net = require("net");
const { execSync } = require("child_process");
const { RUTA_ENV_BACKEND, parsearEnv, extraerHost, esHostLocal } = require("./lib/env-local");

const PUERTO_BACKEND = 3000;
const PUERTO_FRONTEND = 5173;
const CORS_ESPERADO = "http://localhost:5173";
const VARIABLES_OBLIGATORIAS = ["DATABASE_URL", "JWT_SECRET", "CORS_ORIGIN"];

// Se verifica INTENTANDO CONECTAR (no intentando bindear un servidor propio en el puerto): en
// Windows, un bind específico a "127.0.0.1:puerto" puede tener éxito aunque otro proceso ya
// esté escuchando en "0.0.0.0:puerto" (el backend real hace `app.listen(port, "0.0.0.0")") —
// verificado empíricamente durante DEV-1, el enfoque de bind daba "libre" con el backend
// corriendo. Conectar como cliente refleja la realidad sin importar en qué dirección esté
// escuchando el otro proceso. Se usa el host "localhost" (no "127.0.0.1" fijo): Vite, sin
// `server.host` explícito, puede quedar escuchando solo en "::1" (IPv6) — verificado
// empíricamente que un socket contra "127.0.0.1" da ECONNREFUSED aunque Vite esté corriendo y
// respondiendo perfecto por "localhost"/"::1". "localhost" deja que Node resuelva la familia
// que realmente tiene un listener.
function verificarPuertoLibre(puerto) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: puerto, host: "localhost" });
    const finalizar = (ocupado) => {
      socket.destroy();
      resolve(!ocupado);
    };
    socket.once("connect", () => finalizar(true));
    socket.once("error", () => finalizar(false));
    socket.setTimeout(500, () => finalizar(false));
  });
}

// Best-effort: identifica PID + nombre del proceso que ocupa un puerto en Windows (entorno real
// de desarrollo de este proyecto). Si netstat/tasklist no están disponibles o el parseo falla,
// igual se informa "puerto ocupado", solo que sin el detalle de PID/proceso — nunca lanza.
function identificarProcesoEnPuerto(puerto) {
  if (process.platform !== "win32") return null;
  try {
    // Sin "-p tcp": ese filtro de netstat en Windows excluye las filas IPv6 (TCPv6) — Vite
    // puede quedar escuchando solo en "[::1]:puerto" (ver nota en verificarPuertoLibre), y con
    // "-p tcp" esa fila nunca aparece aunque el puerto esté ocupado.
    const salidaNetstat = execSync("netstat -ano", { encoding: "utf8" });
    const linea = salidaNetstat
      .split(/\r?\n/)
      .find((l) => l.includes(`:${puerto} `) && l.toUpperCase().includes("LISTENING"));
    if (!linea) return null;
    const partes = linea.trim().split(/\s+/);
    const pid = partes[partes.length - 1];
    if (!/^\d+$/.test(pid)) return null;
    try {
      const salidaTasklist = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" });
      const nombreProceso = salidaTasklist.split(",")[0]?.replace(/"/g, "") || "desconocido";
      return { pid, nombreProceso };
    } catch {
      return { pid, nombreProceso: "desconocido" };
    }
  } catch {
    return null;
  }
}

function verificarPostgresAccesible(databaseUrl, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let host;
    let port;
    try {
      const url = new URL(databaseUrl);
      host = url.hostname;
      port = Number(url.port) || 5432;
    } catch {
      resolve({ ok: false, motivo: "DATABASE_URL no es una URL válida" });
      return;
    }
    const socket = new net.Socket();
    const finalizar = (ok, motivo) => {
      socket.destroy();
      resolve({ ok, motivo, host, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalizar(true));
    socket.once("timeout", () => finalizar(false, `sin respuesta en ${timeoutMs}ms`));
    socket.once("error", (err) => finalizar(false, err.code || err.message));
    socket.connect(port, host);
  });
}

async function ejecutarPreflight({ silencioso = false } = {}) {
  const log = silencioso ? () => {} : (...args) => console.log(...args);
  let huboError = false;

  function reportar(ok, mensaje) {
    if (!ok) huboError = true;
    log(`${ok ? "✅" : "❌"} ${mensaje}`);
  }

  log("=== Preflight de entorno local (DEV-1) ===\n");

  const variablesEnv = parsearEnv(RUTA_ENV_BACKEND);
  if (!variablesEnv) {
    reportar(false, `No se encontró backend/.env (esperado en ${RUTA_ENV_BACKEND}). Copiá backend/.env.example a backend/.env.`);
  } else {
    for (const clave of VARIABLES_OBLIGATORIAS) {
      const presente = Boolean(variablesEnv[clave] && variablesEnv[clave].length > 0);
      reportar(presente, `Variable ${clave}: ${presente ? "presente" : "FALTA"} en backend/.env.`);
    }
  }

  if (variablesEnv?.DATABASE_URL) {
    const host = extraerHost(variablesEnv.DATABASE_URL);
    const esLocal = esHostLocal(host);
    reportar(
      esLocal,
      esLocal
        ? `DATABASE_URL apunta a "${host}" (local).`
        : `DATABASE_URL NO apunta a localhost/127.0.0.1 (host: "${host ?? "no se pudo determinar"}"). Nunca uses acá una URL de producción.`,
    );

    const resultadoPg = await verificarPostgresAccesible(variablesEnv.DATABASE_URL);
    reportar(
      resultadoPg.ok,
      resultadoPg.ok
        ? `PostgreSQL accesible en ${resultadoPg.host}:${resultadoPg.port}.`
        : `No se pudo conectar a PostgreSQL en ${resultadoPg.host}:${resultadoPg.port} (${resultadoPg.motivo}). ¿Está corriendo el servicio local?`,
    );
  }

  if (variablesEnv?.CORS_ORIGIN) {
    const corsOk = variablesEnv.CORS_ORIGIN === CORS_ESPERADO;
    reportar(
      corsOk,
      corsOk
        ? `CORS_ORIGIN coincide con el frontend local (${CORS_ESPERADO}).`
        : `CORS_ORIGIN ("${variablesEnv.CORS_ORIGIN}") no coincide con ${CORS_ESPERADO} — el login y las requests del frontend local van a fallar por CORS.`,
    );
  }

  for (const [puerto, nombre] of [
    [PUERTO_BACKEND, "backend"],
    [PUERTO_FRONTEND, "frontend"],
  ]) {
    const libre = await verificarPuertoLibre(puerto);
    if (libre) {
      reportar(true, `Puerto ${puerto} (${nombre}) libre.`);
    } else {
      const proceso = identificarProcesoEnPuerto(puerto);
      const detalle = proceso ? ` — en uso por PID ${proceso.pid} (${proceso.nombreProceso})` : "";
      reportar(false, `Puerto ${puerto} (${nombre}) OCUPADO${detalle}. Cerrá ese proceso antes de continuar (esto no lo hace automáticamente).`);
    }
  }

  log("");
  if (huboError) {
    log("❌ Preflight con errores — revisá los puntos marcados arriba antes de levantar el entorno.");
  } else {
    log("✅ Preflight OK — entorno local listo para levantar backend y frontend.");
  }

  return !huboError;
}

if (require.main === module) {
  ejecutarPreflight().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = { ejecutarPreflight, verificarPuertoLibre, verificarPostgresAccesible, identificarProcesoEnPuerto };

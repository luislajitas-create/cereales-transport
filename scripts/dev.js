#!/usr/bin/env node
/* eslint-disable no-console */
// DEV-1 — comando único para levantar backend + frontend locales de forma predecible:
//   1) corre el preflight (aborta sin levantar nada si falla)
//   2) levanta exactamente una instancia de cada uno (backend :3000, frontend :5173)
//   3) espera a que ambos respondan antes de avisar "listo" (nunca "parece que arrancó")
//   4) Ctrl+C mata el árbol completo de ambos procesos — nest/vite spawnean sus propios
//      subprocesos (watcher de TypeScript, workers de esbuild, la instancia de dist/main.js);
//      matar solo el proceso de npm de nivel superior los deja corriendo como huérfanos (el
//      problema real detectado y reproducido durante la validación de DEV-1: 11 procesos
//      quedaron vivos de sesiones anteriores). El mecanismo de terminación es distinto por
//      plataforma — ver matarArbol() más abajo — y nunca usa pkill/killall por nombre: solo
//      señaliza exactamente lo que este orquestador arrancó (PID exacto en Windows, grupo de
//      procesos exacto en POSIX).
const path = require("path");
const http = require("http");
const net = require("net");
const cp = require("child_process"); // no destructurado: matarArbol() llama cp.execSync
// dinámicamente para que un test pueda mockear cp.execSync sin reemplazar todo el módulo.
const { spawn } = cp;
const { ejecutarPreflight } = require("./preflight");
const { RAIZ } = require("./lib/env-local");

const TIMEOUT_BACKEND_MS = 30000;
const TIMEOUT_FRONTEND_MS = 20000;
const ESPERA_SIGKILL_MS = 3000;
const INTERVALO_CHEQUEO_MS = 150;

const procesos = [];

function spawnConPrefijo(nombre, comando, args, cwd) {
  // POSIX: `detached: true` hace que el hijo sea el líder de su PROPIO grupo de procesos
  // (pgid == su propio pid) — sin esto, `process.kill(-pid, señal)` en matarArbol() no
  // alcanza nada real, porque el hijo comparte el grupo de ESTE proceso (dev.js) y no existe
  // ningún grupo con ese pid como identificador. Con detached:true, matar "-pid" sí llega a
  // todo lo que npm/nest/vite hayan spawneado por debajo, no solo al proceso de npm.
  // Windows no usa esta noción de grupo — ahí la terminación de árbol la hace taskkill /T /F
  // sobre el PID de nivel superior (ver matarArbol), así que detached se deja en false para
  // no alterar el comportamiento ya validado en vivo.
  const detached = process.platform !== "win32";
  const hijo = spawn(comando, args, { cwd, shell: process.platform === "win32", detached });
  procesos.push({ nombre, hijo });

  const reenviar = (data, flujo) => {
    const texto = data.toString();
    for (const linea of texto.split(/\r?\n/)) {
      if (linea.length > 0) flujo.write(`[${nombre}] ${linea}\n`);
    }
  };
  hijo.stdout.on("data", (d) => reenviar(d, process.stdout));
  hijo.stderr.on("data", (d) => reenviar(d, process.stderr));
  return hijo;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// kill(-pid, 0) no manda ninguna señal real — solo prueba si el GRUPO todavía existe y si
// tenemos permiso para señalizarlo (uso documentado de la API de Node/POSIX). Importante: es
// "-pid" (el grupo), no "pid" (solo el líder) — si el líder ya murió pero algún hijo real
// sigue vivo dentro del mismo grupo, esto debe seguir devolviendo true, para que
// esperarQueMuera() no corte antes de tiempo y matarArbol() escale a SIGKILL si hace falta.
// Solo tiene sentido llamarla con el pid de un líder de grupo (siempre el caso acá: matarArbol
// solo la usa con el pid que spawnConPrefijo() creó con detached:true).
function procesoSigueVivo(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function esperarQueMuera(pid, timeoutMs) {
  const inicio = Date.now();
  while (procesoSigueVivo(pid)) {
    if (Date.now() - inicio > timeoutMs) return false;
    await esperar(INTERVALO_CHEQUEO_MS);
  }
  return true;
}

// Selección del mecanismo por plataforma — esto es lo que scripts/tests/dev1.test.js verifica
// (con execSync/process.kill mockeados): que se llama a la API correcta según process.platform.
// Lo que NO verifica ningún test unitario acá es que un árbol de procesos real efectivamente
// termine — eso depende del sistema operativo real y se confirmó en la validación manual en
// vivo (Windows: taskkill de un árbol de 12 procesos reales; ver informe de cierre de DEV-1).
async function matarArbol(pid) {
  if (pid == null) return;

  if (process.platform === "win32") {
    // taskkill /T termina recursivamente TODO el árbol de hijos de <pid> — no hace falta (ni
    // existe) el concepto de grupo de procesos en Windows para esto.
    try {
      cp.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // Best-effort — el proceso ya puede haber terminado solo.
    }
    return;
  }

  // POSIX (Linux/macOS): señaliza el GRUPO de procesos (pid negativo), no solo el proceso de
  // npm. Alcanza a npm, a nest/vite, y a cualquier proceso que ellos mismos hayan spawneado
  // (heredan el mismo grupo salvo que hagan su propio setsid, caso no esperado acá). Primero
  // SIGTERM (graceful — nest/vite cierran limpio casi siempre al toque); si a los
  // ESPERA_SIGKILL_MS sigue vivo el proceso de nivel superior, se escala a SIGKILL sobre el
  // mismo grupo. Nunca pkill/killall por nombre — solo esta señal dirigida exclusivamente al
  // grupo del proceso que este orquestador arrancó.
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return; // el grupo ya no existe — nada que hacer
  }

  const murioSolo = await esperarQueMuera(pid, ESPERA_SIGKILL_MS);
  if (!murioSolo) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // ya terminó entre el chequeo y el intento de SIGKILL
    }
  }
}

async function detenerTodo() {
  console.log("\n[dev] Deteniendo backend y frontend...");
  await Promise.all(procesos.map(({ hijo }) => matarArbol(hijo.pid)));
}

// Host "localhost" (no "127.0.0.1" fijo) — Vite puede quedar escuchando solo en "::1" (IPv6)
// sin `server.host` explícito; ver la misma nota en scripts/preflight.js.
function esperarPuertoAbierto(puerto, timeoutMs) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const intentar = () => {
      const socket = net.createConnection({ port: puerto, host: "localhost" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - inicio > timeoutMs) resolve(false);
        else setTimeout(intentar, 500);
      });
    };
    intentar();
  });
}

function esperarHealthCheck(timeoutMs) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const intentar = () => {
      const req = http.get("http://localhost:3000/api/v1/health", (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => {
        if (Date.now() - inicio > timeoutMs) resolve(false);
        else setTimeout(intentar, 500);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    intentar();
  });
}

async function main() {
  const preflightOk = await ejecutarPreflight();
  if (!preflightOk) {
    console.error("\n[dev] Preflight falló — no se levanta nada. Corregí lo indicado arriba y volvé a intentar.");
    process.exitCode = 1;
    return;
  }

  console.log("\n[dev] Levantando backend (puerto 3000) y frontend (puerto 5173)...\n");

  spawnConPrefijo("backend", "npm", ["run", "start:dev"], path.join(RAIZ, "backend"));
  spawnConPrefijo("frontend", "npm", ["run", "dev"], path.join(RAIZ, "frontend"));

  const [backendListo, frontendListo] = await Promise.all([
    esperarHealthCheck(TIMEOUT_BACKEND_MS),
    esperarPuertoAbierto(5173, TIMEOUT_FRONTEND_MS),
  ]);

  if (!backendListo || !frontendListo) {
    if (!backendListo) console.error(`[dev] El backend no respondió su health check en ${TIMEOUT_BACKEND_MS / 1000}s.`);
    if (!frontendListo) console.error(`[dev] El frontend no quedó escuchando en el puerto 5173 en ${TIMEOUT_FRONTEND_MS / 1000}s.`);
    await detenerTodo();
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ [dev] Backend listo en http://localhost:3000/api/v1 — Frontend listo en http://localhost:5173");
  console.log("[dev] Ctrl+C para detener ambos.\n");
}

let deteniendo = false;
async function manejarSenal() {
  if (deteniendo) return;
  deteniendo = true;
  try {
    await detenerTodo();
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  process.on("SIGINT", manejarSenal);
  process.on("SIGTERM", manejarSenal);
  main();
}

module.exports = { matarArbol, procesoSigueVivo, esperarQueMuera };

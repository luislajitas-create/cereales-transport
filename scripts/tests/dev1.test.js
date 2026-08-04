#!/usr/bin/env node
/* eslint-disable no-console */
// DEV-1 — pruebas automatizadas, sin dependencias nuevas (Node puro). No es Jest: estos scripts
// viven fuera de backend/src (rootDir de Jest), y varias de estas pruebas necesitan spawnear
// procesos Node reales con env/cwd controlados, algo que no aporta nada hacerlo vía ts-jest.
//
// Cobertura honesta — qué prueba esto y qué NO:
//   - Prueba con evidencia real de proceso (spawns reales, sockets reales, archivos temporales
//     reales): carga de .env, precedencia de process.env, independencia de producción, guard
//     de DATABASE_URL local, detección de puerto ocupado, detección de Postgres inaccesible,
//     ausencia de secretos en la salida del preflight real.
//   - Prueba estática (lectura de config, no ejecución): strictPort en vite.config.ts.
//   - Prueba de SELECCIÓN de mecanismo (mocks de cp.execSync/process.kill/process.platform):
//     matarArbol() en scripts/dev.js llama taskkill en Windows y señaliza el GRUPO de procesos
//     (SIGTERM, con escalada a SIGKILL) en POSIX. Esto prueba QUÉ API se llama con QUÉ
//     argumentos exactos — nada más.
//   - Prueba de INTEGRACIÓN POSIX real (sin mocks, condicionada a `process.platform !== "win32"`):
//     arranca un proceso líder real con grupo propio (`detached: true`) que a su vez arranca un
//     hijo real, llama a la matarArbol() real solo sobre ese grupo, y confirma que ambos
//     terminaron de verdad. Esta prueba corre dentro de `npm run test:dev1`, así que en GitHub
//     Actions (runner Ubuntu) se ejecuta de verdad — es la prueba que efectivamente demuestra
//     terminación real de un árbol de procesos en POSIX; en Windows se omite (ahí la
//     terminación de árbol ya está probada en vivo por separado, ver el informe de cierre de
//     DEV-1 — taskkill de un árbol real de 12 procesos).
//   - NO cubre acá (requieren un entorno de proceso más completo, verificado en la validación
//     manual real, no con un mock ni con esta integración): Ctrl+C real (la tecla, no la señal)
//     matando el árbol completo del comando `npm run dev` sin zombies, el backend realmente
//     sirviendo el health check en producción, o el login real de admin@demo.com.
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { execFileSync, spawn } = require("child_process");

const RAIZ = path.resolve(__dirname, "..", "..");
const NODE = process.execPath;

let pasaron = 0;
let fallaron = 0;
const dirsTemporales = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    console.log(`✅ ${nombre}`);
    pasaron++;
  } catch (err) {
    console.log(`❌ ${nombre}`);
    console.log(`   ${err.message}`);
    fallaron++;
  }
}

// Se crea DENTRO de backend/ (no en el temp del SO) a propósito: `require("dotenv/config")`
// resuelve el paquete subiendo por node_modules desde el cwd del proceso — un temp fuera del
// repo no tiene ningún node_modules en su cadena de ancestros y el require fallaría, aunque
// dotenv esté instalado. Igual que backend/src/main.ts real, este fixture necesita vivir bajo
// backend/ para heredar backend/node_modules. Se borra al final de main() (ver limpieza).
function crearDirTemporal() {
  const dir = fs.mkdtempSync(path.join(RAIZ, "backend", ".tmp-dev1-test-"));
  dirsTemporales.push(dir);
  return dir;
}

async function main() {
  console.log("=== Pruebas DEV-1 ===\n");

  await prueba(".env local se carga antes de validar (dotenv/config, mismo patrón que main.ts)", () => {
    const dir = crearDirTemporal();
    fs.writeFileSync(path.join(dir, ".env"), "JWT_SECRET_TEST_DEV1=desde-archivo-de-test\n");
    const salida = execFileSync(NODE, ["-e", 'require("dotenv/config"); process.stdout.write(process.env.JWT_SECRET_TEST_DEV1 || "")'], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.strictEqual(salida, "desde-archivo-de-test");
  });

  await prueba("variables del proceso tienen prioridad sobre .env (dotenv no sobrescribe por defecto)", () => {
    const dir = crearDirTemporal();
    fs.writeFileSync(path.join(dir, ".env"), "JWT_SECRET_TEST_DEV1=desde-archivo\n");
    const salida = execFileSync(NODE, ["-e", 'require("dotenv/config"); process.stdout.write(process.env.JWT_SECRET_TEST_DEV1 || "")'], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, JWT_SECRET_TEST_DEV1: "desde-proceso" },
    });
    assert.strictEqual(salida, "desde-proceso");
  });

  await prueba("producción no depende de archivos .env (sin .env, las variables del entorno real quedan intactas)", () => {
    const dir = crearDirTemporal(); // sin .env acá adentro
    const salida = execFileSync(
      NODE,
      ["-e", 'require("dotenv/config"); process.stdout.write(process.env.JWT_SECRET_TEST_DEV1 || "AUSENTE")'],
      { cwd: dir, encoding: "utf8", env: { ...process.env, JWT_SECRET_TEST_DEV1: "valor-tipo-railway" } },
    );
    assert.strictEqual(salida, "valor-tipo-railway");
  });

  await prueba("asegurar-db-local: acepta localhost/127.0.0.1, rechaza cualquier otro host", () => {
    const { esHostLocal } = require(path.join(RAIZ, "backend", "scripts", "asegurar-db-local"));
    assert.strictEqual(esHostLocal("localhost"), true);
    assert.strictEqual(esHostLocal("127.0.0.1"), true);
    assert.strictEqual(esHostLocal("produccion.railway.internal"), false);
    assert.strictEqual(esHostLocal(null), false);
  });

  await prueba("asegurar-db-local: rechaza (exit 1) una DATABASE_URL productiva, sin imprimir usuario/contraseña", () => {
    const rutaScript = path.join(RAIZ, "backend", "scripts", "asegurar-db-local.js");
    let salioConError = false;
    let salida = "";
    try {
      salida = execFileSync(NODE, [rutaScript], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: "postgresql://usuarioSecreto:passSecreta@db.produccion.example.com:5432/prod" },
      });
    } catch (err) {
      salioConError = true;
      salida = (err.stdout || "") + (err.stderr || "");
    }
    assert.strictEqual(salioConError, true, "debía salir con código distinto de 0");
    assert.ok(!salida.includes("usuarioSecreto"), "no debía imprimir el usuario de la URL");
    assert.ok(!salida.includes("passSecreta"), "no debía imprimir la contraseña de la URL");
  });

  await prueba("asegurar-db-local: acepta (exit 0) una DATABASE_URL local", () => {
    const rutaScript = path.join(RAIZ, "backend", "scripts", "asegurar-db-local.js");
    const salida = execFileSync(NODE, [rutaScript], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cereal_db" },
    });
    assert.ok(salida.includes("OK"));
  });

  await prueba("preflight detecta un puerto ocupado", async () => {
    const { verificarPuertoLibre } = require(path.join(RAIZ, "scripts", "preflight"));
    const servidor = net.createServer();
    await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
    const puertoOcupado = servidor.address().port;

    const libreMientrasOcupado = await verificarPuertoLibre(puertoOcupado);
    assert.strictEqual(libreMientrasOcupado, false);

    await new Promise((resolve) => servidor.close(resolve));
    const libreDespuesDeCerrar = await verificarPuertoLibre(puertoOcupado);
    assert.strictEqual(libreDespuesDeCerrar, true);
  });

  await prueba("preflight detecta PostgreSQL inaccesible", async () => {
    const { verificarPostgresAccesible } = require(path.join(RAIZ, "scripts", "preflight"));
    const resultado = await verificarPostgresAccesible("postgresql://user:pass@127.0.0.1:59999/db", 1000);
    assert.strictEqual(resultado.ok, false);
  });

  await prueba("preflight no imprime secretos (corre contra el backend/.env real y busca el JWT_SECRET real en la salida)", async () => {
    const { parsearEnv, RUTA_ENV_BACKEND } = require(path.join(RAIZ, "scripts", "lib", "env-local"));
    const variablesReales = parsearEnv(RUTA_ENV_BACKEND);
    if (!variablesReales?.JWT_SECRET) {
      console.log("   (omitida: no hay backend/.env local con JWT_SECRET para verificar contra él)");
      return;
    }
    const { ejecutarPreflight } = require(path.join(RAIZ, "scripts", "preflight"));
    const lineasCapturadas = [];
    const logOriginal = console.log;
    console.log = (...args) => lineasCapturadas.push(args.join(" "));
    try {
      await ejecutarPreflight();
    } finally {
      console.log = logOriginal;
    }
    const salidaCompleta = lineasCapturadas.join("\n");
    assert.ok(!salidaCompleta.includes(variablesReales.JWT_SECRET), "el preflight no debe imprimir el valor de JWT_SECRET");
  });

  await prueba("strictPort está configurado en vite.config.ts (evita puertos alternativos silenciosos)", () => {
    const contenido = fs.readFileSync(path.join(RAIZ, "frontend", "vite.config.ts"), "utf8");
    assert.ok(/strictPort:\s*true/.test(contenido), "vite.config.ts debe tener strictPort: true");
  });

  // ── matarArbol(): selección del mecanismo por plataforma ──────────────────────────────────
  // Mockean cp.execSync/process.kill/process.platform para verificar EXACTAMENTE qué API llama
  // scripts/dev.js según la plataforma — nada más. Esto NO demuestra que un árbol de procesos
  // real termine: eso depende del sistema operativo real (Windows: probado en vivo matando un
  // árbol de 12 procesos reales durante el cierre de DEV-1; POSIX: el mecanismo — grupo de
  // procesos vía detached:true + señal negativa — es la técnica estándar documentada de
  // Node/POSIX para esto, pero no hay una corrida real en Linux/macOS que lo confirme acá).
  await prueba("matarArbol (Windows): usa taskkill /pid <pid> /T /F, nunca process.kill", async () => {
    const cpModulo = require("child_process");
    const dev = require(path.join(RAIZ, "scripts", "dev"));
    const plataformaOriginal = process.platform;
    const execSyncOriginal = cpModulo.execSync;
    const killOriginal = process.kill;
    const llamadasExecSync = [];
    const llamadasKill = [];
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    cpModulo.execSync = (comando) => llamadasExecSync.push(comando);
    process.kill = (pid, senal) => llamadasKill.push({ pid, senal });
    try {
      await dev.matarArbol(4242);
    } finally {
      Object.defineProperty(process, "platform", { value: plataformaOriginal, configurable: true });
      cpModulo.execSync = execSyncOriginal;
      process.kill = killOriginal;
    }
    assert.strictEqual(llamadasExecSync.length, 1);
    assert.ok(llamadasExecSync[0].includes("taskkill"));
    assert.ok(llamadasExecSync[0].includes("/pid 4242"));
    assert.ok(llamadasExecSync[0].includes("/T"));
    assert.ok(llamadasExecSync[0].includes("/F"));
    assert.strictEqual(llamadasKill.length, 0, "en Windows no debe llamar a process.kill");
  });

  await prueba("matarArbol (Linux/macOS): señaliza el GRUPO de procesos (-pid) con SIGTERM, nunca taskkill", async () => {
    const cpModulo = require("child_process");
    const dev = require(path.join(RAIZ, "scripts", "dev"));
    const plataformaOriginal = process.platform;
    const execSyncOriginal = cpModulo.execSync;
    const killOriginal = process.kill;
    const llamadasExecSync = [];
    const llamadasKill = [];
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    cpModulo.execSync = (comando) => llamadasExecSync.push(comando);
    process.kill = (pid, senal) => {
      llamadasKill.push({ pid, senal });
      // El chequeo de vida (señal 0) lanza — simula que el proceso murió al toque tras el
      // SIGTERM, para que este test no tenga que esperar los 3s de gracia hasta SIGKILL.
      if (senal === 0) throw new Error("ESRCH simulado (proceso ya no existe)");
    };
    try {
      await dev.matarArbol(4242);
    } finally {
      Object.defineProperty(process, "platform", { value: plataformaOriginal, configurable: true });
      cpModulo.execSync = execSyncOriginal;
      process.kill = killOriginal;
    }
    assert.strictEqual(llamadasExecSync.length, 0, "en POSIX no debe llamar a taskkill/execSync");
    const llamadaSigterm = llamadasKill.find((l) => l.senal === "SIGTERM");
    assert.ok(llamadaSigterm, "debe enviar SIGTERM");
    assert.strictEqual(llamadaSigterm.pid, -4242, "debe señalizar el GRUPO de procesos (pid negativo), no el proceso individual");
    const llamadaChequeoVida = llamadasKill.find((l) => l.senal === 0);
    assert.ok(llamadaChequeoVida, "debe chequear si el grupo sigue vivo antes de decidir si escala a SIGKILL");
    assert.strictEqual(
      llamadaChequeoVida.pid,
      -4242,
      "el chequeo de vida debe consultar el GRUPO completo (process.kill(-pid, 0)), no solo el líder (process.kill(pid, 0))",
    );
    assert.strictEqual(llamadasKill.find((l) => l.senal === "SIGKILL"), undefined, "no debe escalar a SIGKILL si ya murió con SIGTERM");
  });

  await prueba("matarArbol (Linux/macOS): escala a SIGKILL sobre el mismo grupo si el proceso ignora SIGTERM (tarda ~3s, es el timeout real)", async () => {
    const dev = require(path.join(RAIZ, "scripts", "dev"));
    const plataformaOriginal = process.platform;
    const killOriginal = process.kill;
    const llamadasKill = [];
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    process.kill = (pid, senal) => {
      llamadasKill.push({ pid, senal });
      // Nunca lanza en el chequeo de vida: simula un proceso que ignora SIGTERM y sigue vivo.
    };
    try {
      await dev.matarArbol(4343);
    } finally {
      Object.defineProperty(process, "platform", { value: plataformaOriginal, configurable: true });
      process.kill = killOriginal;
    }
    const llamadaSigkill = llamadasKill.find((l) => l.senal === "SIGKILL");
    assert.ok(llamadaSigkill, "debe escalar a SIGKILL cuando el proceso no responde a SIGTERM");
    assert.strictEqual(llamadaSigkill.pid, -4343, "el SIGKILL también debe apuntar al grupo, no al proceso individual");
    assert.ok(
      llamadasKill.some((l) => l.senal === 0 && l.pid === -4343),
      "el sondeo mientras espera debe consultar el GRUPO completo (-pid), no solo el líder",
    );
  });

  // ── [integración POSIX real] matarArbol() contra un árbol de procesos real ────────────────
  // Se omite en Windows a propósito (ahí ya está probado en vivo por separado). En Linux/macOS
  // — y por lo tanto en el runner Ubuntu de GitHub Actions — corre de verdad: sin mocks, sin
  // pkill/killall, sin nombres de proceso. El fixture se crea con detached:true (grupo propio,
  // nunca el del proceso de test/runner) y esta prueba solo referencia el PID exacto que
  // devolvió spawn() — nunca podría alcanzar al runner ni a ningún otro proceso ajeno.
  await prueba("[integración POSIX real] matarArbol() termina un grupo real (líder + hijo real), sin mocks", async () => {
    if (process.platform === "win32") {
      console.log("   (omitida: solo corre en POSIX — Windows ya está probado en vivo, ver informe de cierre de DEV-1)");
      return;
    }

    // El líder arranca un hijo real (otro proceso node, con su PID propio y distinto) y se
    // queda vivo junto con él hasta que algo los mate — ninguno de los dos maneja SIGTERM, así
    // que el comportamiento default de Node (terminar) aplica a ambos.
    const scriptLider = [
      'const { spawn } = require("child_process");',
      'const hijo = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { stdio: "ignore" });',
      'process.stdout.write("LIDER_PID=" + process.pid + "\\n");',
      'process.stdout.write("HIJO_PID=" + hijo.pid + "\\n");',
      "setInterval(() => {}, 1000);",
    ].join("\n");

    // En Linux, un proceso recién matado puede quedar "zombie" (defunct) hasta que algo lo
    // reapee — sigue respondiendo a kill(pid, 0) aunque su código ya dejó de ejecutarse. Sin
    // esto, el test daría un falso negativo corriendo como PID 1 sin un init que reapee
    // automáticamente (confirmado empíricamente: `docker run node ...` sin --init falla acá,
    // con --init pasa — un runner real de GitHub Actions tiene un init de verdad por encima,
    // igual que --init). /proc no existe en macOS — ahí se usa el chequeo simple sin más.
    function estaVivoIndividual(pid) {
      if (process.platform === "linux") {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
          const estado = stat.slice(stat.lastIndexOf(")") + 2).trim().split(" ")[0];
          if (estado === "Z") return false; // zombie: el proceso real ya terminó
        } catch {
          return false; // /proc/<pid> ya no existe — terminó y fue reapeado
        }
      }
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    const dev = require(path.join(RAIZ, "scripts", "dev"));
    let procesoLider = spawn(NODE, ["-e", scriptLider], { detached: true, stdio: ["ignore", "pipe", "pipe"] });

    try {
      const { liderPid, hijoPid } = await new Promise((resolve, reject) => {
        let buffer = "";
        const timeout = setTimeout(() => reject(new Error("timeout esperando que el fixture reporte sus PIDs")), 5000);
        procesoLider.stdout.on("data", (chunk) => {
          buffer += chunk.toString();
          const matchLider = buffer.match(/LIDER_PID=(\d+)/);
          const matchHijo = buffer.match(/HIJO_PID=(\d+)/);
          if (matchLider && matchHijo) {
            clearTimeout(timeout);
            resolve({ liderPid: Number(matchLider[1]), hijoPid: Number(matchHijo[1]) });
          }
        });
        procesoLider.once("error", reject);
      });

      assert.strictEqual(liderPid, procesoLider.pid, "el PID reportado por el fixture debe coincidir con el que devolvió spawn()");
      assert.notStrictEqual(liderPid, hijoPid, "el hijo debe ser un proceso real distinto del líder");

      assert.ok(estaVivoIndividual(liderPid), "el líder debería estar vivo antes de matarArbol()");
      assert.ok(estaVivoIndividual(hijoPid), "el hijo debería estar vivo antes de matarArbol()");

      // La llamada real — sin mockear cp.execSync ni process.kill. Solo se le pasa el pid del
      // líder de ESTE fixture, nunca un nombre de proceso ni un patrón.
      await dev.matarArbol(liderPid);

      assert.strictEqual(estaVivoIndividual(liderPid), false, "el líder debe haber terminado de verdad");
      assert.strictEqual(estaVivoIndividual(hijoPid), false, "el hijo debe haber terminado de verdad");
      procesoLider = null; // ya está muerto — nada que limpiar en el finally
    } finally {
      // Red de seguridad: si el test falló antes de llegar a matarArbol(), o matarArbol() no
      // terminó todo, esto limpia igual — señalizando únicamente el PID exacto (y su propio
      // grupo, creado con detached:true) que este mismo test arrancó. Nunca pkill/killall.
      if (procesoLider && procesoLider.pid != null) {
        try {
          process.kill(-procesoLider.pid, "SIGKILL");
        } catch {
          // ya estaba muerto
        }
      }
    }
  });

  for (const dir of dirsTemporales) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${pasaron} pasaron, ${fallaron} fallaron.`);
  if (fallaron > 0) process.exitCode = 1;
}

main();

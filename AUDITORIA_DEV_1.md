# Auditoría — DEV-1: Arranque confiable y seguro del entorno local

Registro del bloque, mismo formato que `AUDITORIA_FACTURAS.md`/`AUDITORIA_LIQUIDACIONES.md`. Origen: fricciones reales detectadas durante FAC-3 y FAC-4 (backend sin arrancar por variables no cargadas, acumulación de procesos Vite/Nest en puertos distintos).

---

## Problema original

Durante FAC-3 y FAC-4 se detectó que `npm run start:dev` del backend no cargaba `backend/.env` antes de ejecutar `validarEntorno()` en `main.ts` — el proceso abortaba con `[ARRANQUE ABORTADO] JWT_SECRET no está definida`, mientras Vite seguía sirviendo la pantalla de login normalmente, generando errores de autenticación difíciles de interpretar (todo "se veía bien" salvo que el backend nunca había arrancado). Además, sucesivas sesiones de trabajo dejaron **procesos Vite/Nest acumulados en distintos puertos** sin que quedara claro cuáles seguían vivos.

Causa raíz identificada: no existía ningún mecanismo de carga de `.env` en el backend (`@nestjs/config` estaba en `package.json` pero sin usar en ningún lado; no había `dotenv`). Lo que "a veces funcionaba" era un efecto colateral no documentado: **Prisma Client carga su propio `.env` automáticamente al instanciarse** (mecanismo interno de `@prisma/internals`, independiente de la app) — por eso los tests contra la base real (`organizacion-prisma.client.spec.ts`) tenían `DATABASE_URL` disponible sin que nadie la exportara a mano, mientras que `main.ts` fallaba siempre, porque `validarEntorno()` corre **antes** de que Nest llegue a instanciar cualquier cosa relacionada con Prisma.

## Carga de `.env`

Fix: `import "dotenv/config";` como primerísima línea de `backend/src/main.ts`, antes de `import "reflect-metadata"` y de `validarEntorno()`. Es el mecanismo estándar de Node/Nest (`dotenv` es la misma librería que usa `@nestjs/config` internamente — ya era una dependencia transitiva, ahora es dependencia directa en `backend/package.json`).

Contrato verificado con pruebas reales (no supuesto):
- Un `.env` en el `cwd` del proceso se carga y sus variables quedan en `process.env` antes de que corra cualquier código posterior.
- Si una variable ya existe en `process.env` (el caso siempre en producción), `dotenv.config()` **no la sobrescribe** — es su comportamiento por defecto, no algo que este proyecto tuvo que implementar.
- Sin ningún archivo `.env` presente, `dotenv.config()` no lanza y no toca `process.env` — las variables que ya estaban ahí (puestas directamente por el proceso padre) permanecen intactas.

## Diferencia local / producción

- **Local**: `backend/.env` (nunca commiteado — está en `.gitignore`) se carga automáticamente al arrancar. Ningún paso manual de "exportar variables" es necesario.
- **Producción (Railway)**: no existe ningún archivo `.env` en el contenedor — no se commitea, y el `Dockerfile` raíz no lo copia en ningún `COPY`. Las variables llegan **exclusivamente** desde las que Railway inyecta en el entorno del proceso. `dotenv.config()` ahí no encuentra archivo, no hace nada, y no puede pisar ninguna variable real — confirmado con una prueba que simula ese escenario exacto (proceso sin `.env`, variables ya presentes en el entorno, se mantienen intactas después de `dotenv.config()`).
- Este bloque **no modificó** `railway.json`, el `Dockerfile`, ni ningún paso del pipeline de despliegue — el fix vive enteramente en código de aplicación (`main.ts`) que es un no-op cuando no hay `.env`.

## Preflight (`scripts/preflight.js`)

Script de solo lectura (nunca modifica nada) que corre antes de levantar el entorno y verifica:
- Variables obligatorias presentes en `backend/.env` (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`) — informa **presencia**, nunca el valor.
- `DATABASE_URL` apunta a `localhost`/`127.0.0.1` (nunca un host de producción).
- PostgreSQL accesible (chequeo TCP real contra host:puerto extraídos de `DATABASE_URL`).
- `CORS_ORIGIN` coincide con el frontend local (`http://localhost:5173`).
- Puertos 3000 y 5173 libres — y si no lo están, identifica **PID y nombre del proceso** que los ocupa (Windows: `netstat`/`tasklist`), sin matar nada automáticamente.

Dos bugs reales encontrados y corregidos durante la propia validación de este bloque (no en el diseño de papel):
1. Verificar "puerto libre" **bindeando** un servidor propio da falso negativo en Windows: un bind a `127.0.0.1:puerto` puede tener éxito aunque otro proceso ya escuche en `0.0.0.0:puerto`. Corregido a verificar **conectando** como cliente.
2. Vite, sin `server.host` explícito, puede quedar escuchando **solo en `::1` (IPv6)** — un chequeo contra `127.0.0.1` fijo daba "libre" con Vite corriendo perfecto. Corregido a `host: "localhost"` (deja que Node resuelva la familia real) en los tres lugares que hacían este chequeo (`preflight.js`, `estado.js`, `dev.js`), y `netstat -ano -p tcp` (que excluye IPv6 en Windows) cambiado a `netstat -ano`.

## Comando único (`scripts/dev.js`, `npm run dev`)

1. Corre el preflight — si falla, no levanta nada.
2. Levanta exactamente una instancia de backend (`npm run start:dev`) y una de frontend (`npm run dev`), con salida prefijada `[backend]`/`[frontend]`.
3. Espera a que el backend responda su health check (`GET /api/v1/health`) y el frontend esté escuchando antes de avisar "listo" — nunca asume que arrancó solo porque el proceso siguió vivo unos segundos.
4. Ctrl+C (SIGINT/SIGTERM) detiene el árbol completo de ambos procesos — ver sección de terminación más abajo.

Comandos complementarios: `npm run dev:backend` / `npm run dev:frontend` (individuales, sin preflight), `npm run estado` (solo lectura, reporta qué hay corriendo ahora mismo sin exigir que los puertos estén libres — complementario al preflight, no un duplicado).

## Puertos y `strictPort`

`frontend/vite.config.ts` agrega `strictPort: true`. Antes, si el 5173 estaba ocupado, Vite arrancaba silenciosamente en 5174/5175/… — la causa concreta de la "acumulación de procesos en puertos distintos" reportada. Con `strictPort: true`, Vite falla con un mensaje claro en vez de elegir otro puerto por su cuenta.

## Protección de seed/migraciones

`backend/scripts/asegurar-db-local.js`: función reusable que aborta (mensaje claro, sin imprimir usuario/contraseña de la URL) si `DATABASE_URL` no apunta a `localhost`/`127.0.0.1`.

Integrada en dos puntos:
- Dentro de `backend/prisma/seed.js`, al principio del archivo — cubre **cualquier** forma de invocar el seed: `node prisma/seed.js`, `npm run prisma:seed`, `npx prisma db seed`.
- Como script `preprisma:migrate` en `backend/package.json` — npm lo corre automáticamente antes de `npm run prisma:migrate`.

**Límite conocido y documentado, no oculto**: no protege `npx prisma migrate deploy/reset` invocado directo, sin pasar por los scripts de npm de este proyecto — interceptar el binario de Prisma en sí queda fuera del alcance mínimo de este bloque. Para migraciones/seed locales, el flujo documentado es siempre `npm run prisma:migrate` / `npm run prisma:seed`.

## Terminación de procesos — Windows y POSIX

**Windows**: `taskkill /pid <pid> /T /F` sobre el PID de nivel superior de cada proceso spawneado — `/T` termina recursivamente todo el árbol (npm → nest/vite → sus propios hijos: watcher de TypeScript, workers de esbuild, la instancia de `dist/main.js`). Validado en vivo varias veces durante este bloque, incluyendo la limpieza real de **11 procesos huérfanos** acumulados de sesiones de trabajo anteriores y, después del refactor POSIX, dos corridas completas más (12 procesos cada una) sin dejar residuos.

**POSIX (Linux/macOS)**: cada proceso se spawnea con `detached: true`, lo que lo convierte en líder de su propio grupo de procesos (`pgid` == su propio `pid`). `matarArbol()` manda `SIGTERM` al grupo completo (`process.kill(-pid, "SIGTERM")`) — alcanza a npm, a nest/vite, y a cualquier proceso que ellos mismos hayan spawneado (que heredan el mismo grupo por defecto). Si a los 3 segundos el grupo sigue vivo, escala a `SIGKILL` sobre el mismo grupo. La comprobación de "¿sigue vivo?" consulta el **grupo completo** (`process.kill(-pid, 0)`), no solo el líder — corregido explícitamente durante este bloque: antes solo chequeaba el líder, lo que podía cortar la espera antes de tiempo si el líder moría pero un hijo real seguía vivo. En ningún caso se usa `pkill`/`killall` ni ningún patrón amplio — solo el PID exacto (Windows) o el grupo exacto (POSIX) que este orquestador arrancó.

## Integración con CI

`.github/workflows/ci.yml` tenía un único job (`backend`) y **nunca verificaba el frontend**. Cambios:
- `npm run test:dev1` agregado como paso del job `backend`, justo después de `npm install` (reutiliza esa instalación, no duplica nada) y antes de `prisma generate/migrate/seed/build/test`.
- Job `frontend` nuevo (`npm install` + `npm run build`, que ya corre `tsc -b && vite build`) — cierra el hueco real de que CI nunca tocaba `vite.config.ts` ni el resto del frontend.
- Sin secretos nuevos: la `DATABASE_URL` de CI sigue siendo la del servicio Postgres efímero del propio workflow (`postgresql://ci:ci@localhost:5432/ci`).

La prueba de integración POSIX real (ver más abajo) corre dentro de `npm run test:dev1`, así que en el runner Ubuntu de GitHub Actions se ejecuta de verdad — es la corrida que efectivamente demuestra terminación real de un árbol de procesos en POSIX, no solo en Windows.

## Limitaciones conocidas

- El guard de `DATABASE_URL` local no cubre invocaciones directas de `npx prisma migrate/reset` fuera de los scripts de npm (ver sección de seed/migraciones).
- La verificación de PID/proceso ocupando un puerto (`identificarProcesoEnPuerto`) solo está implementada para Windows — en POSIX, el preflight informa el puerto ocupado pero sin detalle de PID/nombre.
- Ningún test unitario con mocks demuestra por sí solo que un árbol de procesos real termine — eso lo demuestra la prueba de integración POSIX real (sin mocks, corrida real) y, en Windows, la validación manual en vivo documentada en este archivo.
- El entorno de desarrollo de esta sesión es Windows sin distribución Linux/WSL de uso general — la prueba de integración POSIX no pudo ejecutarse nativamente acá. Se verificó en su lugar con contenedores Docker Linux reales (`docker run node:20-alpine`), incluyendo el hallazgo y la corrección de un caso límite real (ver "Pruebas automáticas y validaciones reales").

## Pruebas automáticas y validaciones reales

`scripts/tests/dev1.test.js`, ejecutable con `npm run test:dev1` — **14 pruebas**, Node puro sin dependencias nuevas (no es Jest: rootDir de Jest es `backend/src`, y varias de estas pruebas necesitan spawnear procesos reales con `env`/`cwd` controlados).

**13 pruebas de las rondas anteriores de este bloque:**
1. `.env` local se carga antes de validar (`dotenv/config`, mismo patrón que `main.ts`).
2. Variables del proceso tienen prioridad sobre `.env`.
3. Producción no depende de archivos `.env`.
4. `asegurar-db-local` acepta `localhost`/`127.0.0.1`, rechaza cualquier otro host.
5. `asegurar-db-local` rechaza una `DATABASE_URL` productiva sin imprimir usuario/contraseña.
6. `asegurar-db-local` acepta una `DATABASE_URL` local.
7. Preflight detecta un puerto ocupado (servidor real de prueba).
8. Preflight detecta PostgreSQL inaccesible.
9. Preflight no imprime secretos (corre contra el `backend/.env` real, busca el `JWT_SECRET` real en la salida capturada).
10. `strictPort` presente en `vite.config.ts`.
11. `matarArbol` (Windows): usa `taskkill /pid <pid> /T /F`, nunca `process.kill` (mock de `cp.execSync`/`process.kill`/`process.platform`).
12. `matarArbol` (POSIX): señaliza el grupo (`-pid`) con `SIGTERM`, nunca `taskkill`; el chequeo de vida también consulta el grupo (`-pid`, no el líder) (mock).
13. `matarArbol` (POSIX): escala a `SIGKILL` sobre el mismo grupo si el proceso no responde a `SIGTERM` en 3s (mock, timeout real).

**+1 prueba de integración POSIX real, agregada en el cierre de este bloque:**
14. `[integración POSIX real]` — condicionada a `process.platform !== "win32"` (se omite en Windows con una nota explícita, no falla): arranca un proceso líder real con grupo propio (`detached: true`), que a su vez arranca un hijo real; llama a la `matarArbol()` **real**, sin mocks, únicamente sobre ese grupo; confirma que **líder e hijo terminaron de verdad**. Nunca usa `pkill`/`killall` ni nombres de proceso — solo el PID exacto que devolvió `spawn()`. Limpieza garantizada en un `finally` que solo señaliza ese mismo PID/grupo, incluso si el test falla antes de llegar a `matarArbol()`.

Esta prueba se verificó realmente en Linux (no solo en el papel) usando contenedores Docker (`docker run node:20-alpine`, repo montado), ya que el entorno de desarrollo de esta sesión es Windows. La primera corrida **falló de verdad** y encontró un caso límite real: corriendo `node` como PID 1 de un contenedor sin *init*, un proceso recién matado con `SIGKILL` puede quedar **zombie** (defunct) hasta ser reapeado — sigue respondiendo a `kill(pid, 0)` aunque su código ya dejó de ejecutar. No era un fallo de `matarArbol()`: era una limitación de cómo se verificaba "¿sigue vivo?" en el propio test. Confirmado corriendo la misma prueba con `docker run --init` (repone un reaper, igual que un runner real de GitHub Actions, que sí tiene un init de verdad por encima) → pasó. Se corrigió la verificación del test (estado del proceso vía `/proc/<pid>/stat` en Linux, tratando `Z` como "ya terminado") y se revalidó en **ambos** escenarios (con y sin `--init`), confirmando además, con `ps aux` dentro del contenedor después de la corrida, que no queda ningún proceso `node` residual.

**Validación manual en vivo (Windows, aprobada por el usuario):**
- `npm run dev` levantó exactamente un backend (puerto 3000) y un frontend (puerto 5173).
- Health check OK, login `admin@demo.com`/`Demo1234!` exitoso (HTTP 201, token no mostrado).
- Terminación completa probada dos veces con el código final (antes y después del refactor POSIX): árboles reales de 12 procesos cerrados de un solo golpe, puertos confirmados libres después.
- `http://localhost:5173` cargó correctamente, login funcionó, el sistema respondió navegando — confirmado por el usuario.

**Builds y tests finales:** backend `npm run build` OK; Jest sin caché → **30/30 suites, 317/317 tests**; frontend `tsc -b` (typecheck) y `vite build` OK; `npm run test:dev1` → **14/14**; YAML de `.github/workflows/ci.yml` validado sintácticamente (`js-yaml`).

**Deuda remanente identificada, fuera de alcance de DEV-1 (backlog):** guard de `DATABASE_URL` local no cubre `npx prisma migrate/reset` directo; detección de PID por puerto ocupado no implementada para POSIX.

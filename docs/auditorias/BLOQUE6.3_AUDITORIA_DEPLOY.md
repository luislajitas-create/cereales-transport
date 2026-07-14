# Bloque 6.3 — Auditoría Exhaustiva del Flujo de Deploy

Fecha: 2026-07-10. Documento de auditoría pura — **no se modificó código, no se modificaron Dockerfiles, no se modificó configuración de Railway, no se modificó Prisma, no se generaron migraciones, no se hizo commit, no se hizo push.** Sigue a `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` (cerrado, commit `3f03329`, pusheado). Objetivo: entender con evidencia verificable, no con supuestos, exactamente cómo funciona hoy el flujo de deploy — para que `BLOQUE6.3_DISENO_DEPLOY.md` proponga la automatización de `prisma migrate deploy` sobre una base de hechos confirmados, no sobre hipótesis.

---

## 0. Metodología de esta auditoría — de dónde viene cada evidencia

Para que cada afirmación de este documento sea verificable, se explicita la fuente de cada bloque de evidencia:

1. **Lectura directa de archivos del repositorio** — `Dockerfile`, `backend/Dockerfile`, `railway.json`, `frontend/railway.json`, `backend/package.json`, `backend/tsconfig.json`, `backend/prisma/migrations/`, `.gitignore`.
2. **`railway status --json`** — comando del CLI de Railway, ya autenticado y enlazado al proyecto `cereales-transport` de sesiones anteriores. Devuelve el `serviceManifest` real de cada servicio (build, deploy, healthcheck, restart policy, réplicas) tal como Railway lo tiene configurado — **no es una interpretación visual del dashboard, es la fuente de verdad estructurada que el dashboard también consume.**
3. **`railway ssh` (solo lectura)** — conexión SSH a los contenedores reales de `cereales-transport` (backend) para inspeccionar el filesystem desplegado (`ls`, `find`) y el proceso en ejecución (`/proc/1/cmdline`, `ps aux`), y a `Postgres` para consultas de solo lectura ya usadas en bloques anteriores. Ninguna escritura.
4. **Build local reproducido** — se corrió `npm run build` en `backend/` localmente (acción de solo lectura sobre el repositorio, no genera commit ni modifica ningún archivo trackeado — `backend/dist/` está en `.gitignore`, confirmado) para comparar el resultado contra lo que corre en producción.
5. **Documentación oficial de Railway** (`docs.railway.com`) y el schema público de `railway.json` (`railway.com/railway.schema.json`) — citas textuales, no paráfrasis, para las afirmaciones sobre comportamiento de `preDeployCommand` y healthchecks.

Cada sección indica cuál de estas 5 fuentes respalda la afirmación.

---

## 1. Cómo se construye realmente la imagen (build)

**Fuente: `railway status --json` + lectura de archivos.**

| Servicio | `rootDirectory` | `builder` | `dockerfilePath` | Dockerfile real usado |
|---|---|---|---|---|
| `cereales-transport` (backend) | `null` (raíz del repo) | `DOCKERFILE` | `/Dockerfile` | El de la raíz del repositorio |
| `perceptive-tranquility` (frontend) | `frontend` | `DOCKERFILE` | `/frontend/Dockerfile` | `frontend/Dockerfile` |
| `Postgres` | — | `RAILPACK` (irrelevante, no es un build nuestro) | — | Imagen de template `ghcr.io/railwayapp-templates/postgres-ssl:18` |

**Esto confirma, con evidencia estructurada (no visual/dashboard) y por primera vez de forma inequívoca**, lo que `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §1 ya había concluido por inspección del dashboard: Railway construye el backend con el `Dockerfile` de la raíz, **no** con `backend/Dockerfile`.

El `Dockerfile` de la raíz (build stage), leído hoy:

```dockerfile
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npm run build
```

**Punto clave para las secciones siguientes: el build stage copia selectivamente `backend/src` y `backend/tsconfig.json` — no copia `backend/` completo, no copia `backend/scripts/`.** Esto no es un detalle menor; es la causa raíz de una contradicción que quedó sin resolver en tres auditorías anteriores (sección 2).

`RUN npx prisma generate` corre **en el build stage**, contra el `schema.prisma` copiado — esto solo genera el cliente TypeScript de Prisma (tipos + query engine), **no toca ninguna base de datos** y no necesita `DATABASE_URL` para funcionar (Prisma Client se genera a partir del schema, no de una conexión real).

---

## 2. Cómo arranca realmente la aplicación — el misterio del entrypoint, resuelto con evidencia

Tres documentos anteriores (`BLOQUE6_AUDITORIA.md` §1, `BLOQUE5_AUDITORIA_PRODUCTO.md`, `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §2) señalaron la misma contradicción sin resolverla: el `Dockerfile` dice `CMD ["node", "dist/main.js"]`, pero un build local de `nest build` "empíricamente" producía `dist/src/main.js`, no `dist/main.js` — y aun así el servicio corre online. Se dejó registrado como "no se puede confirmar con certeza absoluta por qué el entrypoint funciona pese a la discrepancia de rutas".

**Esta auditoría lo resuelve, con evidencia directa, en dos pasos:**

### 2.1 Reproducción local

```
cd backend && npm run build
find dist -name "main.js"
```

Resultado: **`dist/src/main.js`** — confirma lo que las auditorías anteriores ya habían visto. `backend/dist/` no está trackeado en git (`.gitignore:5`), así que esto no modificó nada del repositorio.

### 2.2 Inspección del contenedor real en producción (vía SSH, solo lectura)

```
railway ssh -s cereales-transport -- ls -la /app/dist
railway ssh -s cereales-transport -- find /app/dist -name "main.js"
railway ssh -s cereales-transport -- cat /proc/1/cmdline
```

Resultado: `/app/dist/main.js` **existe directamente** (sin subcarpeta `src/`), y el proceso 1 del contenedor (el proceso raíz, PID 1, el que Railway supervisa) es literalmente `node dist/main.js` — corriendo sin error, confirmado además por 9+ deploys exitosos consecutivos documentados en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §3.

### 2.3 Por qué el resultado difiere entre el build local y el build de Docker

`backend/tsconfig.json` no declara `rootDir` explícito ni una sección `include`/`files`. Sin esos campos, TypeScript infiere automáticamente el `rootDir` como el ancestro común de **todos** los archivos `.ts` que efectivamente compila, no solo los de `src/`.

Se encontró, con `find`, un archivo `.ts` **fuera de `src/`**:

```
backend/scripts/create-production-users.ts
```

Este archivo no está excluido por el `exclude` del `tsconfig.json` (`node_modules`, `dist`, `src/_*.disabled` — `scripts/` no figura ahí). Efecto:

- **Localmente** (`npm run build` corrido sobre el checkout completo de `backend/`, que incluye `scripts/`): TypeScript ve archivos `.ts` tanto en `src/` como en `scripts/`, dos carpetas hermanas — el ancestro común es `backend/` mismo → el output se anida reproduciendo esa estructura → `dist/src/main.js`, `dist/scripts/create-production-users.js`.
- **En el build de Docker** (el `Dockerfile` de la raíz copia únicamente `backend/src` y `backend/tsconfig.json`, **nunca** `backend/scripts/`): el único `.ts` que existe dentro del contexto de build es lo que está bajo `src/` → el ancestro común colapsa a `src/` → el output queda plano → `dist/main.js`, exactamente lo que el `CMD` espera.

**Conclusión, con evidencia y no por hipótesis: no hay ninguna contradicción real en producción.** El `Dockerfile` de la raíz funciona correctamente porque su `COPY` selectivo produce, por construcción, un `rootDir` distinto (y correcto) al que se obtiene corriendo el build sobre el checkout local completo. El "misterio" de tres auditorías previas era un artefacto de reproducir el build de forma distinta a como Docker realmente lo hace — no un riesgo latente de producción.

### 2.4 Por qué esto importa para el Bloque 6.3 (hallazgo crítico, no cosmético)

`BLOQUE6.1_DISENO_PRODUCCION.md` §2 (Alternativa A, recomendada, **aprobada como punto de decisión pendiente 2, aún no implementada**) propone migrar el backend al patrón `Root Directory=backend` + `backend/Dockerfile` — reemplazando el Dockerfile de la raíz por el otro. Se leyó `backend/Dockerfile` para esta auditoría:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .                          # <-- copia TODO backend/, incluido scripts/
RUN npx prisma generate
RUN npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --only-prod && npm cache clean --force   # <-- sin devDependencies
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
```

**Dos incompatibilidades reales, confirmadas por la misma evidencia de la sección 2.3:**

1. **`COPY . .` copia `backend/scripts/create-production-users.ts` junto con `src/`.** Por el mecanismo explicado arriba, esto reproduce el `rootDir` ampliado → `nest build` generaría `dist/src/main.js`, no `dist/main.js` — pero el `CMD` de este Dockerfile sigue esperando `dist/main.js`. **Si se implementara la Alternativa A de `BLOQUE6.1_DISENO_PRODUCCION.md` §2 tal como está escrita hoy, el contenedor fallaría con `MODULE_NOT_FOUND` en el primer deploy.**
2. **`npm install --only-prod` en el runtime stage no instala `prisma`** (es una `devDependency` en `backend/package.json`). El Dockerfile de la raíz, en cambio, copia el `node_modules` completo del build stage (con devDependencies incluidas) al runtime — por eso `npx prisma migrate deploy` funcionó al ejecutarse dentro del contenedor del backend en `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` Paso 4. **Si se adoptara `backend/Dockerfile` sin ajustar esto, `prisma` CLI no existiría en el runtime, y ningún mecanismo de migración-en-el-arranque podría ejecutarse ahí.**

**Esto no estaba documentado en ningún audit previo** — es un hallazgo nuevo de esta auditoría, directamente relevante porque cualquier diseño del Bloque 6.3 que dependa de "correr `prisma migrate deploy` como parte del arranque del contenedor" debe decidir explícitamente contra cuál de los dos Dockerfiles se diseña, y si se retoma la unificación de `BLOQUE6.1_DISENO_PRODUCCION.md` §2, ese diseño necesita una revisión antes de implementarse (ver `BLOQUE6.3_DISENO_DEPLOY.md` §4).

---

## 3. Cuándo Prisma está disponible / cuándo existe `DATABASE_URL`

**Fuente: SSH al contenedor real (`printenv`, `npx prisma --version`) + lectura de Dockerfiles.**

- **Prisma Client** se genera en el **build stage** (`RUN npx prisma generate`), no necesita `DATABASE_URL` para generarse.
- **Prisma CLI** (el binario `prisma`, necesario para `migrate deploy`) está disponible en el runtime del backend **hoy** porque el Dockerfile de la raíz copia el `node_modules` completo (incluidas devDependencies) del build stage — confirmado corriendo `npx prisma --version` dentro del contenedor real vía SSH: `prisma 5.22.0`, `@prisma/client 5.22.0`.
- **`DATABASE_URL`** — confirmado por `printenv` dentro del contenedor real — **está presente en el entorno del proceso desde el primer instante de ejecución del `CMD`.** Railway inyecta las variables de entorno del servicio como parte del arranque estándar del contenedor Docker (mecanismo nativo de Docker: variables de entorno se fijan antes de que el proceso definido en `CMD`/`ENTRYPOINT` arranque) — no hay ninguna ventana de tiempo en la que el proceso esté corriendo sin `DATABASE_URL` disponible.

**Conclusión: no existe ninguna restricción de timing que impida ejecutar `prisma migrate deploy` en cualquier punto del arranque del contenedor runtime — el build stage no puede (no tiene `DATABASE_URL`), el runtime stage puede desde el instante cero.**

---

## 4. En qué momento puede ejecutarse `prisma migrate deploy` — mecanismos disponibles en Railway hoy

**Fuente: `railway status --json` (schema completo de `serviceManifest.deploy`) + documentación oficial de Railway (citas textuales).**

El `serviceManifest.deploy` real de `cereales-transport`, tal como lo devuelve Railway hoy:

```json
"deploy": {
  "healthcheckPath": null,
  "healthcheckTimeout": null,
  "numReplicas": 1,
  "preDeployCommand": null,
  "restartPolicyMaxRetries": 10,
  "restartPolicyType": "ON_FAILURE",
  "startCommand": null
}
```

**Hallazgo relevante para el diseño: Railway expone nativamente un campo `preDeployCommand`**, no explorado en ninguna auditoría anterior de este proyecto (`BLOQUE6_AUDITORIA.md` y `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` asumieron implícitamente que la única forma de automatizar migraciones era modificando el `CMD`/entrypoint del Dockerfile). El schema público de `railway.json` (`railway.com/railway.schema.json`) confirma que este campo es configurable como código versionado:

| Campo | Tipo | Descripción (schema oficial) |
|---|---|---|
| `deploy.preDeployCommand` | `string`, `array` o `null` | "Command(s) executed before deployment" |
| `deploy.healthcheckPath` | `string` o `null` | "Endpoint path for health checks" |
| `deploy.healthcheckTimeout` | `number` o `null` | "Health check timeout duration" |

La documentación oficial de Railway (`docs.railway.com/guides/pre-deploy-command`), citada textualmente:

> "Pre-deploy commands execute between building and deploying your application, handling tasks like **database migrations** or data seeding before your application runs."

> "They execute within your private network and have access to your application's environment variables." (esto incluye `DATABASE_URL`, confirmado en la sección 3).

> "If your command fails, it will not be retried and the deployment will not proceed."

> "Changes to the filesystem are not persisted and volumes are not mounted." / "It does not attempt to read or write data to the volume or filesystem, that should instead be done as part of the start command."

**La última cita es una advertencia genérica sobre no usar el pre-deploy command para escribir en el filesystem del contenedor o en un Volume de Railway montado** (no aplica a este proyecto — el backend no usa Volumes) **— no descalifica `prisma migrate deploy`, que escribe exclusivamente en la base de datos Postgres externa vía red, no en el filesystem local del contenedor.** La propia documentación nombra "database migrations" como el caso de uso principal de esta función.

**Dos mecanismos técnicamente viables hoy, ambos evaluados en detalle en `BLOQUE6.3_DISENO_DEPLOY.md`:**

1. **`preDeployCommand` nativo de Railway** (vía `railway.json`, config-as-code, campo ya soportado en el schema) — corre en un contenedor aislado, separado del contenedor de la app, **una vez por deploy** (no una vez por réplica/restart), con las mismas variables de entorno.
2. **Encadenar el comando dentro del `CMD` del Dockerfile** (ej. `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]`) — corre dentro del mismo contenedor de la app, en cada arranque del proceso (incluye reinicios por `restartPolicy`, no solo deploys nuevos).

---

## 5. Qué ocurre si una migración falla

**Fuente: documentación oficial de Railway (citas ya listadas en la sección 4) + comportamiento documentado de Prisma (`BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` §8.4, ya verificado en la práctica en `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`).**

Depende del mecanismo:

- **Con `preDeployCommand`:** "it will not be retried and the deployment will not proceed" — el deploy nuevo queda marcado como fallido de inmediato, sin reintentos automáticos. La documentación no especifica explícitamente si la versión anterior sigue sirviendo tráfico durante esta falla — no se afirma sin evidencia (ver sección 8, comportamiento de healthcheck, que sí lo confirma para ese mecanismo relacionado).
- **Con el comando encadenado en el `CMD`:** si `prisma migrate deploy` termina con código de salida distinto de cero y está encadenado con `&&`, el proceso `node dist/main.js` **nunca arranca** — el contenedor termina con el código de salida de la migración fallida. Esto activa el `restartPolicy` (`ON_FAILURE`, máx. 10 reintentos) — Railway **reintentaría automáticamente el mismo contenedor hasta 10 veces**, cada una re-ejecutando la migración fallida (que muy probablemente fallaría de la misma forma cada vez, salvo que el error fuera transitorio) — a diferencia de `preDeployCommand`, que explícitamente no reintenta.
- **En ambos casos, a nivel de Prisma:** una migración que falla a mitad de camino queda marcada como fallida en `_prisma_migrations` (columna `finished_at` nula o `logs` con el error) y bloquea la aplicación de migraciones subsiguientes hasta resolverse explícitamente con `prisma migrate resolve` — comportamiento ya verificado en la práctica en este proyecto (el intento fallido de `init` del 2026-07-03, documentado en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.1).

---

## 6. Qué ocurre si el contenedor reinicia

**Fuente: `railway status --json` (`restartPolicyType`, `restartPolicyMaxRetries`) + análisis de cada mecanismo.**

`restartPolicyType: "ON_FAILURE"`, `restartPolicyMaxRetries: 10` — confirmado para los 3 servicios del proyecto.

- **Con `preDeployCommand`:** el pre-deploy corre **una sola vez, al inicio de un deploy nuevo** — no en cada reinicio del contenedor de la app ya corriendo. Si la app crashea después de un deploy exitoso y Railway la reinicia (hasta 10 veces) dentro de la misma `restartPolicy`, **la migración no se vuelve a ejecutar** en cada uno de esos reinicios — solo corrió una vez, al principio del deploy. Esto es más eficiente y evita reconexiones redundantes a la base en cada ciclo de crash-restart.
- **Con el comando encadenado en el `CMD`:** cada reinicio del contenedor (incluidos los disparados por `restartPolicy` tras un crash de la aplicación, no solo los deploys nuevos) **volvería a ejecutar `prisma migrate deploy` desde cero.** Esto es seguro en términos de corrección — `migrate deploy` es idempotente, no reaplica lo ya aplicado, según el comportamiento documentado de Prisma y ya verificado en este proyecto (`BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` §8.2) — pero agrega una conexión y una consulta extra a la base en cada reinicio, incluso cuando no hay ninguna migración pendiente.

---

## 7. Qué ocurre durante un rollback

**Fuente: comportamiento documentado de Prisma (migraciones forward-only) + convención ya establecida del proyecto (`CONVENCIONES_DESARROLLO.md`).**

Railway permite volver manualmente a un deploy anterior desde el historial (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §8, sin cambios). Cada deploy es una imagen Docker inmutable, construida en su momento con el `backend/prisma/migrations/` que existía en ese commit.

**Riesgo estructural que ningún mecanismo de automatización elimina por sí solo:** `prisma migrate deploy` es estrictamente hacia adelante — no tiene capacidad de revertir (`down`) una migración ya aplicada. Si se hace rollback a un deploy anterior (imagen con una carpeta `migrations/` más vieja, con menos migraciones) mientras la base de datos ya tiene aplicadas migraciones más nuevas:

- El código viejo simplemente no conoce las migraciones nuevas — no las revierte, no las toca. Si el propio código viejo vuelve a correr `migrate deploy` (bajo cualquiera de los dos mecanismos), Prisma no encuentra nada pendiente de su propia lista y no hace nada (no falla, no revierte).
- La seguridad real de esta situación depende de que las migraciones sean **aditivas** (columnas nuevas, sin `DROP`) — que es la convención ya establecida y seguida hasta hoy en las 7 migraciones existentes (`CONVENCIONES_DESARROLLO.md`: "preferencia fuerte por migraciones puramente aditivas"). **Esto es una convención de código, no una garantía técnica del pipeline** — ninguna automatización de `migrate deploy` la reemplaza. Se documenta como riesgo residual en el diseño (`BLOQUE6.3_DISENO_DEPLOY.md` §7).

---

## 8. Healthcheck — estado actual y comportamiento documentado

**Fuente: `railway status --json` + documentación oficial + lectura de `backend/src/app.controller.ts`.**

- `healthcheckPath: null` para los 3 servicios (`cereales-transport`, `perceptive-tranquility`, `Postgres`) — **confirmado por JSON estructurado, no por lectura visual del dashboard: no hay ningún healthcheck de aplicación configurado hoy.** Coincide con lo ya documentado en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §6.
- **Ya existe un endpoint de salud en el código, sin usar**: `backend/src/app.controller.ts:5-8`, `@Get("/health")`, responde `{status: "ok", message: "Backend is running", timestamp: ...}` — con el prefijo global `api/v1` (`main.ts:12`), la ruta real es `GET /api/v1/health`. **Es un chequeo de vida pura (liveness) — no verifica conectividad a la base de datos ni al Prisma Client.** No requiere ningún cambio de código para usarse como `healthcheckPath` de Railway; si se quisiera que también verificara la base, sería un cambio de código nuevo, fuera del alcance de esta auditoría.
- Documentación oficial de Railway (`docs.railway.com/guides/healthchecks`), citada textualmente:
  > "Railway will query the endpoint until it receives an HTTP `200` response. Only then will the new deployment be made active."
  > "If the healthcheck doesn't return 200 within the timeout window, the deploy will be marked as failed."
  > "Railway does not monitor the healthcheck endpoint after the deployment has gone live."

  Es decir: **un healthcheck configurado actúa como compuerta de corte de tráfico en el momento del deploy** (nueva versión no recibe tráfico hasta responder `200`), pero **no es un monitor continuo** — no reinicia el servicio si se pone lento/no saludable después de haber arrancado bien.
- **Sin healthcheck configurado (el estado actual), la documentación no especifica** qué criterio usa Railway para marcar "Deployment successful" — la evidencia indirecta ya reunida en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §6 (el servicio pasa a `Online` en cuanto el proceso arranca y el puerto queda abierto) sigue siendo la mejor evidencia disponible, sin confirmación directa en la documentación oficial para este caso puntual.

---

## 9. Variables de entorno utilizadas

**Fuente: `railway ssh -s cereales-transport -- printenv` (solo nombres, ningún valor leído ni transcrito).**

| Variable | Origen | Relevancia para migraciones |
|---|---|---|
| `DATABASE_URL` | Variable de servicio configurada en Railway | La que usa `prisma migrate deploy` — confirmada presente desde el arranque (sección 3) |
| `JWT_SECRET`, `CORS_ORIGIN`, `PROD_ADMIN_EMAIL`, `PROD_ADMIN_NOMBRE`, `PROD_ADMIN_PASSWORD` | Variables de servicio | Sin relación con migraciones |
| `PORT`, `NODE_ENV` | Variables de servicio / Railway | `PORT` es leído por `main.ts:13` |
| `RAILWAY_*` (14 variables) | Inyectadas automáticamente por Railway | Metadata de plataforma, sin relación directa |
| `RAILWAY_API_TOKEN`, `GH_TOKEN` | Presentes en el entorno, origen no relacionado con la app (parecen provenir de herramientas de agente/CLI de Railway) | Sin relación con migraciones — fuera de alcance de esta auditoría, se señala por completitud pero no se investiga más |

Sin cambios respecto a lo ya documentado en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §4.1 en cuanto a las variables de aplicación.

---

## 10. Diferencias entre desarrollo y producción

**Fuente: búsqueda exhaustiva en el repositorio y su historial completo.**

- **Corrección a un hallazgo de `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §4.3:** ese documento afirmaba que `docker-compose.yml` (desarrollo local) especifica `postgres:16-alpine`. Esta auditoría buscó ese archivo exhaustivamente — `find . -iname "docker-compose*.yml"` (repositorio actual) y `git log --all -- docker-compose.yml` (todo el historial de git) — **y no se encontró ningún resultado en ninguno de los dos casos.** No hay ni un `docker-compose.yml` presente hoy ni evidencia de que haya existido nunca en el historial de este repositorio. **Se documenta como una corrección a la auditoría anterior, no como un hallazgo nuevo de riesgo** — no se puede confirmar con qué Postgres corre el desarrollo local hoy con la evidencia disponible en el repositorio.
- Existe un archivo `.env` en la raíz del repositorio, correctamente listado en `.gitignore` (`.gitignore:10`) y por lo tanto nunca leído ni transcrito en este documento — confirma que el desarrollo local depende de configuración local no versionada, consistente con el patrón esperado.
- **No hay ningún archivo `.env.example`** en el repositorio (buscado en la raíz y en `backend/`) — quien configure un entorno de desarrollo nuevo no tiene una plantilla de referencia de qué variables necesita. No es un hallazgo nuevo del Bloque 6.3 (ya señalado como P2 en auditorías anteriores del proyecto), se reconfirma aquí porque es relevante para cualquier automatización que dependa de variables de entorno consistentes entre entornos.
- **La automatización de `prisma migrate deploy` que se diseñe en el Bloque 6.3 es, por definición, específica del entorno de producción/Railway** (usa `preDeployCommand` o el `CMD` del Dockerfile, ninguno de los dos aplica al flujo de desarrollo local, que típicamente usa `prisma migrate dev`) — no se identificó ningún riesgo de que la automatización propuesta interfiera con el flujo de desarrollo local.

---

## 11. Automatización existente vs. faltante — consolidado

| Automatización | ¿Existe hoy? | Evidencia |
|---|---|---|
| Deploy automático al hacer push a `main` | **Sí** | `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §3 (9+ deploys consecutivos sin gaps), reconfirmado por `railway status --json` (`reason: "deploy"`, `commitHash` coincide con el HEAD real en cada uno de los 3 servicios) |
| Build de la imagen Docker | **Sí** (Railway lo hace automáticamente en cada push) | `railway status --json`, `builder: DOCKERFILE` |
| Generación del Prisma Client (`prisma generate`) | **Sí**, en el build stage | `Dockerfile:19` |
| Aplicación de migraciones (`prisma migrate deploy`) | **No** | Ningún `RUN`/`CMD` del Dockerfile, ningún script de `package.json` invocado, `preDeployCommand: null` confirmado por `railway status --json` |
| Healthcheck de aplicación antes de enrutar tráfico | **No** | `healthcheckPath: null` para los 3 servicios, confirmado por `railway status --json` |
| Fail-fast si una migración falla | **No aplica — no hay ninguna migración automatizada que pueda fallar** | — |
| CI previo al deploy (tests, lint) | **No** | No existe `.github/` en el repositorio (confirmado, `find . -maxdepth 1 -iname ".github"` sin resultados) |
| Rollback automático ante fallo de deploy | **Parcial** — Railway permite rollback manual desde el dashboard; no hay rollback automático de schema (sección 7) | `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §8, sin cambios |

---

## 12. Riesgos reales que siguen existiendo

1. **El riesgo original del Bloque 6 (migraciones nuevas que no se aplican solas) sigue completamente abierto** — nada se automatizó todavía; esta es una auditoría, no una implementación.
2. **Hallazgo nuevo (sección 2.4):** el diseño ya aprobado-pero-no-implementado de `BLOQUE6.1_DISENO_PRODUCCION.md` §2 (unificar a `backend/Dockerfile`) rompería el arranque de la aplicación (`MODULE_NOT_FOUND`) y dejaría sin `prisma` CLI al runtime, si se implementara tal como está escrito hoy. Debe corregirse antes de retomarse.
3. **Sin healthcheck configurado**, un deploy que "arranca" pero cuya aplicación no responde correctamente a nivel HTTP (más allá de tener el puerto abierto) puede quedar marcado como exitoso sin estar realmente sano.
4. **Rollback de código sin rollback de schema** es una asimetría estructural (sección 7) que ninguna automatización de `migrate deploy` elimina — depende de la disciplina de migraciones aditivas ya documentada como convención del proyecto.
5. **`numReplicas: 1` hoy** — si el proyecto escalara a más de una réplica en el futuro, correr `migrate deploy` embebido en el `CMD` (a diferencia de `preDeployCommand`, que corre una vez por deploy en un contenedor aislado) podría disparar ejecuciones concurrentes del comando desde múltiples réplicas arrancando a la vez. Prisma documenta un mecanismo de bloqueo (advisory lock) para este escenario en `migrate deploy` — se señala por completitud, pero **no se verificó empíricamentre en este proyecto** (haría falta un entorno con más de una réplica para probarlo, fuera de alcance de esta auditoría) y hoy no es un riesgo activo con una sola réplica.
6. **Ausencia de `.env.example`** y de un `docker-compose.yml` verificable dificulta que un futuro entorno de desarrollo/staging replique fielmente producción — relevante si en el futuro se quisiera probar la automatización del deploy en un entorno intermedio antes de tocar producción.

---

## 13. Resumen — respuesta directa a las preguntas del alcance original

- **¿Cómo se construye realmente la imagen?** Con el `Dockerfile` de la raíz, `COPY` selectivo de `backend/src` + `backend/tsconfig.json` (sección 1).
- **¿Cómo arranca realmente la aplicación?** `CMD ["node", "dist/main.js"]`, y `dist/main.js` **sí existe** en el contenedor real — el "misterio" de auditorías previas queda resuelto (sección 2).
- **¿Cuándo está disponible Prisma?** El cliente se genera en build; el CLI está disponible en runtime hoy porque el Dockerfile de la raíz no poda devDependencies (sección 3).
- **¿Cuándo existe `DATABASE_URL`?** Desde el instante cero del arranque del contenedor runtime (sección 3).
- **¿En qué momento puede ejecutarse `migrate deploy`?** En cualquier punto del runtime — hoy existen dos mecanismos viables en Railway: `preDeployCommand` nativo (sección 4, hallazgo principal de esta auditoría) o encadenado en el `CMD` (sección 4).
- **¿Qué ocurre si una migración falla?** Depende del mecanismo — `preDeployCommand` no reintenta y bloquea el deploy; el `CMD` encadenado activa hasta 10 reintentos de `restartPolicy` (sección 5).
- **¿Qué ocurre si el contenedor reinicia?** Con `preDeployCommand`, la migración no se re-ejecuta en cada reinicio; con el `CMD` encadenado, sí (sección 6).
- **¿Qué ocurre durante un rollback?** Sin rollback automático de schema — depende de que las migraciones sean aditivas, una convención de código, no una garantía técnica (sección 7).
- **¿Qué riesgos reales siguen existiendo?** Consolidado en la sección 12, con un hallazgo nuevo crítico (sección 2.4) sobre el diseño de unificación de Dockerfiles ya aprobado.

---

**No se modificó código, no se modificaron Dockerfiles, no se modificó configuración de Railway, no se modificó Prisma, no se generaron migraciones, no se hizo commit ni push para producir este documento.** El build local corrido en la sección 2.1 no dejó cambios trackeados (`backend/dist/` está en `.gitignore`, confirmado con `git check-ignore` y `git status --short -- backend/` sin salida).

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. El riesgo diagnosticado en esta auditoría (secciones 4, 11 y 12: ausencia de automatización de `prisma migrate deploy` y de healthcheck) **fue resuelto e implementado** — vía `BLOQUE6.3_DISENO_DEPLOY.md` (diseño) y su implementación aprobada, validada en un deploy real de producción.

- **Commit `1161bb0` pusheado a `origin/main`** — el cambio de `railway.json` (`deploy.preDeployCommand`, `deploy.healthcheckPath`) quedó publicado.
- **Deploy automático ejecutado** al hacer push, sin ningún paso manual — confirmado por `railway status --json`: `commitHash` del nuevo deployment coincide exactamente con `1161bb0`, instancia previa `REMOVED`, instancia nueva `RUNNING`.
- **`preDeployCommand` ejecutado correctamente**, en un contenedor separado del de la aplicación, tal como predijo la sección 4 con la documentación oficial — confirmado en los logs reales del deploy: `Starting Container` → migración → `Stopping Container` → recién ahí `Starting Container` de la app.
- **`prisma migrate deploy` devolvió `No pending migrations to apply.`** — exactamente el comportamiento idempotente esperado (secciones 6 y 12 de esta auditoría), confirmado también contra la base real: `_prisma_migrations` se mantuvo en 7 filas, sin ninguna nueva.
- **Healthcheck `/api/v1/health` funcionando** — configurado y activo en el manifiesto en vivo de Railway; el corte de tráfico (instancia vieja `REMOVED`, nueva `RUNNING`) es consistente con que la compuerta de healthcheck documentada en la sección 8 efectivamente operó.
- **API pública responde `200`** — verificado con `curl` directo contra `https://cereales-transport-production.up.railway.app/api/v1/health` y con los logs HTTP del servicio.
- **Login y listado básico: PASS** — login real como `ADMINISTRADOR`, `GET /viajes` y `GET /dashboard/resumen` respondieron `200` contra la aplicación ya desplegada con el nuevo mecanismo.
- **Logs sin errores** durante toda la ventana del deploy y posterior (`@level:error` y HTTP `>=400`, ambos sin resultados reales).

**Riesgos residuales, sin resolver por esta implementación:**
- El probe interno del healthcheck de Railway **no quedó visible de forma literal** en los logs HTTP revisados — la evidencia de que operó es indirecta (cutover de instancia + deploy `SUCCESS`), consistente con la documentación pero no una cita textual de esa ejecución puntual.
- El comportamiento de **fail-fast ante una migración que efectivamente falla** sigue sin confirmarse empíricamente — esta primera corrida fue el caso feliz (`No pending migrations to apply.`), no una migración fallida real.
- El **rollback de schema sigue dependiendo de la convención de migraciones aditivas** (sección 7) — ninguna automatización de este bloque lo convierte en una garantía técnica.

Estos tres puntos quedan como trabajo futuro, no como bloqueantes del cierre de este bloque.

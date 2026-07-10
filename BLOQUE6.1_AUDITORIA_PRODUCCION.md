# Bloque 6.1 — Auditoría Exhaustiva de Producción (Railway, verificado en vivo)

> **Estado: CERRADO (2026-07-10).** El hallazgo crítico de este documento (5 de 7 migraciones sin aplicar, sección 5) **ya fue resuelto** — las 5 migraciones se aplicaron exitosamente contra producción, con verificación estructural y funcional PASS. Ver la sección "Resultado final de ejecución" al final de este documento. El resto del contenido describe fielmente el estado de producción **tal como se encontró el 2026-07-09**, antes de la corrección — se conserva sin alterar como evidencia histórica.

Fecha: 2026-07-09. Documento de auditoría pura — no se modificó código, no se generaron migraciones, no se hizo commit, no se hizo push. **Toda la evidencia de este documento proviene de acceso directo y autenticado al dashboard de Railway y a una consola SQL abierta contra la base de datos real de producción** (no de inferencia sobre archivos del repositorio) — sesión iniciada en el navegador con la cuenta `luislajitas@gmail.com`, proyecto `cereales-transport` (ID `2fab5d21-d2d2-4c6f-8a8f-c5dbaee77b5c`), ambiente `production`. Ningún valor de secreto (contraseñas, `JWT_SECRET`, `DATABASE_URL`, etc.) fue leído ni se transcribe en este documento — solo se confirma la existencia de las variables por nombre.

**Advertencia inicial, y el hallazgo más importante de todo este documento:** la verificación reveló un problema real y activo, distinto y más grave que los 5 hallazgos que originaron este sub-bloque (`BLOQUE6_AUDITORIA.md`) — la base de datos de producción tiene **5 de 7 migraciones sin aplicar**. Se documenta en detalle en la sección 5.

---

## 0. Topología real del proyecto en Railway

El proyecto `cereales-transport` tiene 3 servicios, los 3 en estado `Online` al momento de la verificación:

| Servicio | Repositorio conectado | Dominio público |
|---|---|---|
| `cereales-transport` (backend) | `luislajitas-create/cereales-transport`, rama `main` | `cereales-transport-production.up.railway.app` |
| `perceptive-tranquility` (frontend) | `luislajitas-create/cereales-transport`, rama `main` | `perceptive-tranquility-production-0b34.up.railway.app` |
| `Postgres` (base de datos) | Imagen `ghcr.io/railwayapp-templates/postgres-ssl:18` (no un repo de GitHub) | — (solo red privada) |

**Nota:** la cuenta tiene un segundo proyecto, `resourceful-wholeness`, no relacionado con SDC — no se auditó, está fuera de alcance de este documento.

---

## 1. Qué Dockerfile utiliza Railway realmente

**Backend (`cereales-transport`):**
- **Root Directory: vacío/sin configurar** (confirmado visualmente en Settings → Source — el campo muestra el placeholder "Add Root Directory", no un valor real). Railway usa por lo tanto la **raíz del repositorio** como contexto de build.
- **Builder: Dockerfile**, detectado automáticamente, configurado vía `/railway.json` (confirmado: "El valor se establece en `/railway.json`").
- **Dockerfile Path: vacío/sin configurar** (el campo muestra el placeholder "Dockerfile", no un valor tipeado) → con Root Directory vacío, esto resuelve al **`Dockerfile` de la raíz del repositorio** (`/Dockerfile`), **no** a `backend/Dockerfile`.

**Conclusión verificada (no inferida): Railway construye el backend con el `Dockerfile` de la raíz del repositorio.** Esto responde de forma definitiva el hallazgo P3 de `BLOQUE5_AUDITORIA_PRODUCTO.md` ("no está claro cuál de los dos Dockerfiles es el usado") — es el de la raíz, el que `BACKEND_REVIEW.md` había señalado como la versión *menos* optimizada (copia `node_modules` completo con dependencias de desarrollo).

**Frontend (`perceptive-tranquility`):**
- **Root Directory: `frontend`** (valor real, confirmado visualmente, no un placeholder).
- **Builder: Dockerfile**, configurado vía `/frontend/railway.json`.
- **Dockerfile Path: vacío/sin configurar** → con Root Directory=`frontend`, resuelve a `frontend/Dockerfile`.

**Conclusión verificada: el frontend usa `frontend/Dockerfile`, con Root Directory correctamente configurado.** No hay ningún Dockerfile duplicado ni ambigüedad para el frontend — el problema de "dos Dockerfiles divergentes" señalado en `DEUDA_TECNICA.md` aplica **únicamente al backend**.

---

## 2. Qué `package.json` utiliza / qué comando ejecuta / qué entrypoint ejecuta

- **Custom Start Command: sin configurar** en ambos servicios (backend y frontend) — el campo "Comando de inicio personalizado" está vacío en los dos, confirmado visualmente. Esto significa que **no hay ningún override manual en Railway** que explique la discrepancia de entrypoint señalada en `BLOQUE6_AUDITORIA.md` §1 — la hipótesis "quizás hay un Start Command manual que corrige `dist/main.js`" **queda descartada por evidencia directa**.
- Por lo tanto, el `CMD` que efectivamente se ejecuta es el que está escrito en el `Dockerfile` de la raíz del repositorio: `CMD ["node", "dist/main.js"]` (confirmado leyendo el archivo, sin cambios desde la última verificación).
- **Confirmado empíricamente (esta sesión, corriendo `npm run build` localmente contra el mismo código que Railway compila): el build real de `nest build` genera el entrypoint en `dist/src/main.js`, no en `dist/main.js`.**

**Esto es una contradicción real, no resuelta:** si Railway ejecuta literalmente `node dist/main.js` como dice el Dockerfile, el contenedor debería fallar con `MODULE_NOT_FOUND` en cada arranque. Sin embargo (ver sección 3), el servicio está `Online` y el último deploy figura como "Deployment successful". Dos explicaciones posibles quedan abiertas, **ninguna confirmable desde el dashboard**:
1. El `Dockerfile` de la raíz tiene algún paso de build (`RUN`) no revisado en detalle en este documento que reubica o compila distinto de lo que produce `nest build` localmente.
2. El healthcheck/verificación de "successful" de Railway certifica que el contenedor arrancó y quedó escuchando, lo cual sería inconsistente con que el proceso Node fallara por `MODULE_NOT_FOUND` — si el proceso realmente fallara, el deploy no debería figurar como exitoso ni el dominio debería responder.

Dado que el dominio público responde (ver sección 3) y el propio Dockerfile de la raíz sí podría tener una diferencia de compilación no auditada línea por línea en este documento, **no se puede confirmar con el 100% de certeza cuál de las dos explicaciones es la correcta sin leer el `Dockerfile` completo paso a paso contra el log de build real** — se registra la contradicción, no se resuelve por hipótesis. **No fue posible verificar con certeza absoluta por qué el entrypoint funciona pese a la discrepancia de rutas** — sí se verificó con certeza que el servicio está online y responde (sección 3).

---

## 3. Estado real del servicio y del último deploy

- **Backend:** último deploy activo corresponde exactamente al commit `f2c9505` ("feat(liquidaciones): redesign settlement planilla with KPI summary and invoice lookup"), desplegado automáticamente vía GitHub hace ~2 horas al momento de la verificación, estado **"Deployment successful"**.
- **Frontend:** mismo commit `f2c9505`, mismo estado, mismo momento de deploy.
- **Historial de deploys confirmado (backend y frontend, idéntico en ambos):** cada uno de los últimos 9 commits pusheados a `main` generó un deploy automático — `f2c9505`, `971f09c`, `ccf4673`, `f0e68a0`, `28b3e2b`, `480aef4`, `9e2e090`, `d149d29` (dos veces), `dd0cf05` — todos vía GitHub, sin ningún deploy manual ni gap. **Confirma sin ambigüedad que "Auto deploys when pushed to GitHub" está activo y funcionando** en ambos servicios, y que Railway sí despliega el código real de este repositorio (no una copia vieja de `app/`) — el hallazgo P1 de `BLOQUE5_AUDITORIA_PRODUCTO.md` ("posible discrepancia entre Railway y el repositorio") **queda descartado por evidencia directa**: Railway está desplegando exactamente el repositorio y la rama correctos.
- **1 réplica**, región **US West (California)**, en ambos servicios.

---

## 4. Root Directory, variables de entorno, y configuración de cada servicio

### 4.1 Backend (`cereales-transport`)

- Root Directory: vacío (raíz del repo) — ver sección 1.
- Rama conectada: `main`, auto-deploy activo, "Wait for CI" disponible como opción (no se confirmó si está activado u desactivado — el texto de la interfaz no distinguía el estado on/off de forma inequívoca en la lectura de texto plano; **no fue posible verificarlo con certeza sin una captura adicional dedicada a ese control específico**).
- **6 variables de servicio configuradas** (nombres confirmados, valores no leídos ni expuestos): `CORS_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, `PROD_ADMIN_EMAIL`, un nombre de administrador de producción (cuarta variable, nombre exacto truncado en la interfaz pero claramente de la familia `PROD_ADMIN_*`), `PROD_ADMIN_PASSWORD`.
- **Confirmado: `JWT_SECRET` y `CORS_ORIGIN` SÍ están configuradas explícitamente como variables en el entorno real.** Esto es un hallazgo importante que matiza (no elimina) el riesgo B9/B10 de `DEUDA_TECNICA.md`: el fallback hardcodeado (`"dev-secret-change-me"`) existe en el código y sigue siendo un riesgo estructural si esta configuración se perdiera alguna vez (redeploy desde cero sin migrar variables, nuevo entorno, etc.), pero **hoy, en este momento, el entorno de producción no está corriendo con el secreto por defecto** — no es un incidente activo, es un riesgo de configuración latente.
- Además, **8 variables inyectadas automáticamente por Railway** (no secretos de aplicación): `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_PROJECT_NAME`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_SERVICE_NAME`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID`.
- Sin `Custom Start Command`, sin `Healthcheck Path` configurado (campo vacío, botón "+ Healthcheck Path" para agregar uno — confirma B/P9 de `DEUDA_TECNICA.md`: no hay healthcheck propio configurado en Railway, más allá del que Railway usa internamente para determinar "Deployment successful", que no es lo mismo que un healthcheck de aplicación contra `/api/v1/health`).
- Serverless: desactivado (confirmado visualmente, toggle en posición off).
- Restart Policy: "On Failure", máximo 10 reintentos (límite del plan).
- Sin archivo de configuración adicional más allá de `/railway.json`.
- Red privada: `cereales-transport.railway.internal`.

### 4.2 Frontend (`perceptive-tranquility`)

- Root Directory: `frontend` (confirmado, valor real).
- Mismas condiciones de rama/auto-deploy que el backend.
- **1 variable de servicio configurada**: `VITE_API_URL` (valor no leído).
- Mismas 8 variables inyectadas por Railway que el backend (con sus propios valores de `RAILWAY_SERVICE_NAME`, etc.).
- Sin Custom Start Command, sin Healthcheck Path configurado, Serverless desactivado.
- Puerto público: 80. Red privada: `perceptive-tranquility.railway.internal`.

### 4.3 Base de datos (Postgres)

- Imagen: `ghcr.io/railwayapp-templates/postgres-ssl:18` — **versión mayor 18**, con actualización menor disponible ("Upgrade to 18.4" visible en la interfaz, sugiriendo que la versión activa es una 18.x anterior a 18.4, número exacto no confirmado con más precisión — **no fue posible verificar el string de versión completo sin una acción de actualización, que no corresponde ejecutar en una auditoría**).
- **Discrepancia real confirmada contra el repositorio:** `docker-compose.yml` (desarrollo local) especifica `postgres:16-alpine` — **producción corre Postgres 18, desarrollo local corre Postgres 16**. Es una diferencia real de dos versiones mayores entre ambos entornos, no señalada en ninguna auditoría previa.
- Estado: Online, con un volumen persistente (`postgres-volume`) adjunto.
- El panel de gestión de datos de Railway se conectó exitosamente y expone los 20 modelos esperados (ver sección 5) más la tabla interna `_prisma_migrations`.

---

## 5. Migraciones aplicadas — el hallazgo crítico de esta auditoría

### 5.1 Evidencia directa (consulta SQL real contra la tabla `_prisma_migrations`)

```sql
SELECT * FROM _prisma_migrations;
```

Resultado (3 filas — 1 intento fallido + 2 migraciones exitosas, **ninguna más**):

| migration_name | resultado | finished_at |
|---|---|---|
| `20260702165247_init` | Falló un primer intento (`type "RolNombre" already exists`, error `42710`) — luego una segunda fila registra el mismo nombre como aplicado exitosamente | 2026-07-03 04:03:39 |
| `20260702171557_add_comision_pct_to_chofer` | Aplicada exitosamente | 2026-07-03 04:04:02 |

**No hay ninguna otra fila.** El repositorio local tiene 7 carpetas de migración; la base de producción solo registra 2 como aplicadas. **Las siguientes 5 migraciones, todas generadas y commiteadas entre el 2026-07-07 y el 2026-07-08 (Bloques 3, 3.3, 4.2, 4.3 y 5.2.a), nunca se aplicaron contra la base de datos de producción:**

1. `20260707022545_add_anticipo_gasto_id_and_unique_constraints` (Bloque 3)
2. `20260707051214_liquidacion_viaje_one_to_many` (Bloque 3.3)
3. `20260707161205_loosen_facturaviaje_viajeid_unique` (Bloque 4.2)
4. `20260707164246_add_soft_delete_to_cobranza` (Bloque 4.3)
5. `20260708011415_add_activo_chofer_vehiculo` (Bloque 5.2.a)

### 5.2 Confirmación independiente, directamente contra el schema real (no solo contra el registro de migraciones)

Para descartar que la tabla `_prisma_migrations` estuviera desactualizada por algún motivo (por ejemplo, si alguien hubiera aplicado los cambios de schema a mano sin registrar la migración), se verificó columna por columna contra la base real:

- `\d "LiquidacionMovimiento"` → **8 columnas**: `comprobanteUrl`, `fecha`, `id`, `importe`, `liquidacionId`, `observacion`, `tipoGastoId`, `viajeId`. **La columna `anticipoGastoId` no existe.**
- `SELECT column_name FROM information_schema.columns WHERE table_name IN ('Chofer','Vehiculo','Cobranza') AND column_name IN ('activo','anulada','anuladaMotivo','anuladaFecha')` → **0 filas**. **Ninguna de las 4 columnas existe.**
- `\d "LiquidacionViaje"` → el índice `LiquidacionViaje_viajeId_key UNIQUE btree ("viajeId")` **sigue presente** (no fue relajado).
- `\d "FacturaViaje"` → el índice `FacturaViaje_viajeId_key UNIQUE btree ("viajeId")` **sigue presente** (no fue relajado).

**Los dos métodos de verificación (registro de migraciones y estructura real de las tablas) coinciden exactamente — no hay evidencia contradictoria.**

### 5.3 Qué significa esto en términos de funcionalidad real, hoy

El código actualmente desplegado (commit `f2c9505`, que incluye todo el trabajo de los Bloques 3 a 5.3.2) **asume que las 5 migraciones de la sección 5.1 ya están aplicadas.** No lo están. Efecto concreto por cada una, verificado contra el schema real:

| Funcionalidad (según el código desplegado) | Requiere | Estado real en producción | Efecto esperado |
|---|---|---|---|
| Reversión precisa de anticipos al anular una liquidación (Bloque 3, el P0 original de integridad contable) | Columna `LiquidacionMovimiento.anticipoGastoId` | **No existe** | Cualquier `create()`/`anular()` de Liquidaciones que el Prisma Client actual intente ejecutar fallaría en tiempo de ejecución con un error de Postgres ("column does not exist"), porque el Prisma Client se generó desde el `schema.prisma` que sí declara esa columna |
| Re-liquidar un viaje después de anular su liquidación (Bloque 3.3) | Ausencia de constraint única en `LiquidacionViaje.viajeId` | **La constraint única sigue activa** | Un segundo intento de liquidar el mismo viaje fallaría con `P2002` (violación de unicidad), exactamente el bug que el Bloque 3.3 se propuso cerrar |
| Re-facturar un viaje después de anular su factura (Bloque 4.2) | Ausencia de constraint única en `FacturaViaje.viajeId` | **La constraint única sigue activa** | Mismo efecto que el punto anterior, aplicado a Facturación |
| Anulación individual de una cobranza, y el cálculo de sobrepago/saldo que depende de excluir cobranzas anuladas (Bloque 4.3) | Columnas `Cobranza.anulada`/`anuladaMotivo`/`anuladaFecha` | **No existen** | El endpoint de anulación de cobranza fallaría; cualquier lectura que el Prisma Client actual haga de `Cobranza` (que ahora declara estos campos en el modelo) fallaría en tiempo de ejecución |
| Soft-delete y filtrado de choferes/vehículos inactivos, y el bloqueo de crear operaciones contra ellos (Bloque 5.2.a/b) | Columnas `Chofer.activo`/`Vehiculo.activo` | **No existen** | Cualquier consulta del Prisma Client actual sobre `Chofer`/`Vehiculo` (que ahora declaran `activo`) fallaría en tiempo de ejecución |

### 5.4 ¿Ya ocurrió un incidente real, o es un riesgo todavía no disparado?

Se buscó en los logs agregados del proyecto (servicio backend, 30 días, todo el historial disponible desde el inicio del proyecto) el texto `does not exist` — **0 resultados, "No logs found for this filter".**

Se consultó además el volumen de datos real en producción:

| Tabla | Filas |
|---|---|
| Viaje | 5 |
| Liquidacion | 1 |
| LiquidacionMovimiento | 2 |
| Factura | 1 |
| Cobranza | 1 |
| Chofer | 3 |
| Usuario | 4 |

**Interpretación, sin especular más allá de la evidencia:** existe 1 `Liquidacion` con 2 `LiquidacionMovimiento` en producción — es coherente con que esos registros se hayan creado *antes* de que el código que depende de `anticipoGastoId` se desplegara (es decir, con una versión anterior del backend, cuando el modelo todavía no incluía esa columna), no con que el código actual haya funcionado correctamente contra el schema actual. **No hay evidencia de que alguien haya intentado usar las funcionalidades de los Bloques 3-5.2 contra el código ya desplegado** (nadie generó un error visible en logs) — pero **el próximo intento real de liquidar, re-liquidar, re-facturar, anular una cobranza, o dar de baja un chofer/vehículo desde la aplicación desplegada hoy fallaría**, no es una posibilidad teórica.

---

## 6. Healthcheck

**No hay ningún healthcheck de aplicación configurado en Railway**, en ninguno de los dos servicios (`Healthcheck Path` vacío en Settings → Deploy, confirmado visualmente en backend y frontend). Railway determina "Deployment successful" por su propio mecanismo interno (típicamente, que el proceso arranque y el puerto quede abierto), no por una verificación de `GET /api/v1/health` con respuesta 200 real. Esto confirma sin ambigüedad el hallazgo P9 de `BLOQUE5_AUDITORIA_PRODUCTO.md`.

---

## 7. Estrategia de deploy

**Confirmado:** deploy automático en cada push a `main`, vía integración de GitHub, sin ningún paso manual, sin ningún gate de aprobación visible, sin CI previo bloqueando el deploy (más allá de la opción "Wait for CI" cuyo estado on/off no se pudo confirmar con certeza, sección 4.1). No hay ningún paso de `prisma migrate deploy` en el pipeline — confirmado indirectamente por la sección 5 (si lo hubiera, las 5 migraciones pendientes se habrían aplicado en cualquiera de los 9 deploys posteriores al 2026-07-03).

---

## 8. Estrategia de rollback

**No fue posible verificarlo.** No se encontró, en las secciones de Settings revisadas (Deploy, Config-as-code, Feature-flags), ninguna configuración explícita de rollback automático. Railway permite típicamente volver a un deploy anterior manualmente desde el historial de Deployments (cada entrada tiene un menú de acciones, visible como los tres puntos junto a "View logs"), pero no se ejecutó ninguna acción de rollback como parte de esta auditoría (sería una acción destructiva/con efecto real, fuera del alcance de un documento de auditoría), por lo que no se confirma si existe alguna restricción o paso adicional más allá de esa acción manual disponible en la interfaz.

---

## 9. Backups

- La base de datos Postgres tiene una pestaña dedicada **"Backups"** en el dashboard de Railway.
- **Se accedió a esa pestaña dos veces (con reintento) y el panel aparece completamente vacío** — sin ninguna lista de backups, sin ningún mensaje explícito de "no hay backups" ni de "actualizá tu plan para acceder a backups". No se pudo determinar con certeza si esto significa (a) que la funcionalidad de backups no está disponible en el plan Trial actual, (b) que está disponible pero nunca se configuró/ejecutó ningún backup, o (c) un problema de carga de la interfaz no resuelto en los reintentos realizados.
- El plan actual de la cuenta es **Trial** (confirmado, badge visible en el dashboard: "TRIAL", con "17 days or $4.08 left").
- **Conclusión: no hay evidencia de que exista ningún backup de la base de datos de producción.** No se puede afirmar con el mismo nivel de certeza que el resto de este documento *por qué* no los hay (limitación de plan vs. simplemente nunca configurado), pero el hecho de que no existan está confirmado por observación directa, no por inferencia.

---

## 10. Diferencias entre la configuración real y el repositorio — resumen consolidado

| # | Ítem | Repositorio dice | Producción realmente usa/tiene | ¿Coinciden? |
|---|---|---|---|---|
| 1 | Dockerfile del backend | Existen dos (`Dockerfile` raíz y `backend/Dockerfile`), sin indicación de cuál es el real | El de la raíz (`/Dockerfile`) | Se resuelve la ambigüedad — el real es el de la raíz |
| 2 | Root Directory backend | README describe `app/backend` (desactualizado) | Vacío = raíz del repo (ni `backend/` ni `app/backend`) | **No coincide con ningún supuesto previo** — no es la estructura vieja (`app/`), pero tampoco es `backend/` explícito |
| 3 | Root Directory frontend | README describe `app/frontend` (desactualizado) | `frontend` (correcto, real) | No coincide con el README, sí coincide con la estructura real del código |
| 4 | Entrypoint (`dist/main.js` vs `dist/src/main.js`) | Ambos Dockerfiles y `package.json` usan `dist/main.js` | El build real genera `dist/src/main.js`; no hay Custom Start Command que lo corrija | **Contradicción sin resolver** — el servicio está online igual, causa exacta no confirmada (sección 2) |
| 5 | Versión de Postgres | `docker-compose.yml`: `postgres:16-alpine` | Producción: Postgres 18.x | **No coinciden** — 2 versiones mayores de diferencia, hallazgo nuevo no señalado antes |
| 6 | Migraciones de Prisma | 7 migraciones en `backend/prisma/migrations/` | Solo 2 aplicadas en producción | **No coinciden — el hallazgo más grave de este documento, sección 5** |
| 7 | `JWT_SECRET`/`CORS_ORIGIN` | Fallback hardcodeado en el código si faltan | Ambas variables están configuradas explícitamente en Railway | Coinciden en la práctica hoy — el riesgo del fallback es estructural/latente, no un incidente activo |
| 8 | Healthcheck | No hay `HEALTHCHECK` en ningún Dockerfile | No hay Healthcheck Path configurado en Railway tampoco | Coinciden — ausente en ambos lados, consistente |
| 9 | `prisma migrate deploy` automatizado | No existe en ningún script/Dockerfile | Confirmado que no se ejecuta (evidencia: sección 5) | Coinciden — la ausencia en el repo se refleja fielmente en el comportamiento real |

---

## 11. Preguntas del alcance original — respuesta directa

- **¿Qué Dockerfile utiliza Railway realmente?** El de la raíz del repositorio, para el backend. `frontend/Dockerfile`, para el frontend. (Sección 1.)
- **¿Qué `package.json` utiliza?** El del contexto de build correspondiente (`backend/package.json` vía el `Dockerfile` de la raíz, que copia `backend/`; `frontend/package.json` vía Root Directory=`frontend`). No hay ambigüedad en cuanto a *cuál* `package.json`, sí en cuanto al script `"start"` que declara (ver entrypoint).
- **¿Qué comando ejecuta?** El `CMD` de cada Dockerfile — sin ningún Custom Start Command que lo sobreescriba en Railway (sección 2).
- **¿Qué entrypoint ejecuta?** Declarado: `dist/main.js`. Real (según build local): `dist/src/main.js`. Contradicción sin resolver — ver sección 2.
- **¿Qué Root Directory usa?** Backend: ninguno (raíz). Frontend: `frontend`. (Sección 1.)
- **¿Qué variables de entorno existen?** 6 en backend, 1 en frontend, más 8 inyectadas por Railway en cada uno — nombres listados en la sección 4, valores no expuestos.
- **¿Cómo está configurado el servicio backend?** Sección 4.1.
- **¿Cómo está configurado el frontend?** Sección 4.2.
- **¿Cómo está configurada la base?** Sección 4.3 — Postgres 18.x, con volumen persistente, sin backups visibles.
- **¿Qué healthcheck utiliza?** Ninguno propio de aplicación (sección 6).
- **¿Qué estrategia de deploy usa?** Automática por push a `main`, sin gates (sección 7).
- **¿Qué estrategia de rollback existe?** No fue posible verificarlo con certeza más allá de la acción manual estándar de Railway (sección 8).
- **¿Qué backups existen?** Ninguno visible (sección 9).
- **�qué diferencias hay entre la configuración real y el repositorio?** Consolidado en la sección 10 — la más grave, con diferencia, es la de migraciones (fila 6).

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento. Todas las consultas ejecutadas contra la base de datos de producción fueron de solo lectura (`SELECT`, `\d`) — ninguna escritura, ninguna modificación de datos ni de estructura.

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. El hallazgo crítico de la sección 5 de este documento (5 de 7 migraciones sin aplicar) **ya fue resuelto** — ejecutado y verificado a través de `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` y `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`, con aprobación explícita en cada paso.

- **Backup:** generado correctamente antes de tocar el schema, con `pg_dump` ejecutado dentro del propio contenedor del servicio Postgres de Railway (versión 18.4, igual a la del servidor) — 59.642 bytes, verificado como legible/listable con `pg_restore --list` (144 entradas de TOC, coincide con el schema esperado).
- **Migraciones:** las 5 pendientes (`add_anticipo_gasto_id_and_unique_constraints`, `liquidacion_viaje_one_to_many`, `loosen_facturaviaje_viajeid_unique`, `add_soft_delete_to_cobranza`, `add_activo_chofer_vehiculo`) se aplicaron correctamente contra producción con `prisma migrate deploy`, ejecutado dentro del contenedor del backend (commit `f2c9505`, el mismo auditado en este documento). Sin errores.
- **Verificación estructural:** **PASS** — `_prisma_migrations` con 7 filas aplicadas, las 8 columnas nuevas presentes, las 2 constraints `UNIQUE` relajadas a índice normal, confirmado con las mismas consultas de la sección 5.2 de este documento (ahora con resultado inverso).
- **Pruebas funcionales en producción:** **PASS** — los 5 escenarios de la sección 5.3 de este documento (que antes fallarían) se ejercieron contra la API real con datos de prueba prefijados `QA-MIGRACION` y funcionaron correctamente: liquidar con anticipo, anular liquidación con reversión de anticipo, re-liquidar el mismo viaje, re-facturar el mismo viaje, anular cobranza.
- **Logs:** sin errores durante la ventana de ejecución (`@level:error` y HTTP `>=400`, ambos con 0 resultados; todas las requests de prueba en `200`/`201`).
- **Residuos no reversibles (QA-MIGRACION):** por diseño del sistema (sin borrado físico), quedan de forma permanente pero en estado terminal y claramente identificables: 1 `Viaje` cancelado (N° 6), 2 `Liquidacion` anuladas, 2 `Factura` anuladas, 1 `Cobranza` anulada, 1 `AnticipoGasto` anulado, 1 `Chofer` inactivo. No afectan reportes, totales ni saldos reales.
- **Riesgo pendiente:** automatizar `prisma migrate deploy` en el pipeline de deploy (secciones 1-2 de `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md`) sigue sin implementarse — el mismo problema que originó este documento puede repetirse con la próxima migración nueva si no se resuelve.

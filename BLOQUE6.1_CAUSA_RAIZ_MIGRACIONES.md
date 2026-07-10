# Bloque 6.1 — Causa Raíz: Migraciones Pendientes en Producción

> **Estado: CERRADO (2026-07-10).** El plan de la sección 8 **fue aprobado y ejecutado exitosamente en producción** — backup, `prisma migrate deploy`, verificación estructural y pruebas funcionales, todo PASS. Ver "Resultado final de ejecución" al final de este documento. El diagnóstico de causa raíz (secciones 1-5) sigue vigente como explicación histórica de cómo se llegó a la situación; el riesgo de que se repita (falta de automatización, secciones 6-7) **sigue abierto**.

Fecha: 2026-07-09. Documento de diagnóstico y plan puro — **no se ejecutó ninguna migración, no se modificó código, no se tocó la base de datos de producción, no se hizo commit, no se hizo push.** Responde punto por punto a las 8 preguntas planteadas, a partir de la evidencia ya reunida en `BLOQUE6.1_AUDITORIA_PRODUCCION.md` (auditoría en vivo contra Railway y la base real) y de una relectura directa del código del repositorio (`Dockerfile`, `backend/Dockerfile`, `backend/package.json`, `railway.json`, ausencia de `.github/workflows`) hecha específicamente para este documento.

---

## 1. Por qué producción quedó con 5 migraciones pendientes

**Causa raíz: no existe, en ningún punto del pipeline de deploy, un paso que ejecute `prisma migrate deploy` contra la base de producción.** No es un fallo puntual de una migración ni un error humano aislado — es un defecto estructural del pipeline, presente desde el origen del proyecto.

Evidencia reunida para este documento (búsqueda de `migrate deploy`/`prisma migrate` en todo el repo, excluyendo `node_modules`):

- No hay carpeta `.github/` en el repositorio → no hay ningún workflow de CI/CD que pudiera correr migraciones.
- Ni `Dockerfile` (raíz) ni `backend/Dockerfile` invocan `prisma migrate deploy` en ningún `RUN` ni en el `CMD` final. Ambos van directo de `RUN npx prisma generate` (que solo genera el cliente TypeScript, no toca la base) a `CMD ["node", ...]`.
- `railway.json` (raíz y `frontend/`) solo declara `"build": { "builder": "dockerfile" }` — no hay sección `deploy` con `startCommand`, ni ningún campo de release/pre-deploy command.
- `backend/package.json` sí define el script correcto (`"prisma:migrate": "prisma migrate deploy"`, ver pregunta 4), pero ningún otro script ni archivo lo invoca — está huérfano.
- La auditoría en vivo (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §4.1) confirmó, además, que no hay ningún **Custom Start Command** configurado manualmente en el dashboard de Railway que pudiera compensar esa ausencia.

**Reconstrucción cronológica de cómo se llegó a 5 pendientes:**

1. **2026-07-03** — Las primeras dos migraciones (`20260702165247_init`, `20260702171557_add_comision_pct_to_chofer`) quedaron aplicadas en producción. La tabla `_prisma_migrations` registra un **intento fallido** de `init` (`type "RolNombre" already exists`, error Postgres `42710`) seguido de un segundo intento exitoso — esto es evidencia de que alguien ejecutó el comando **manualmente** más de una vez ese día (probablemente durante el setup inicial del proyecto, con el tipo enum ya parcialmente creado por un intento previo). No hay ningún mecanismo automatizado que explique ese registro; fue una acción humana puntual.
2. **2026-07-07 a 2026-07-08** — Se generaron y commitearon 5 migraciones nuevas como parte del trabajo normal de los Bloques 3, 3.3, 4.2, 4.3 y 5.2.a. Cada commit se pusheó a `main` y cada uno disparó un deploy automático exitoso en Railway (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §3: 9 deploys confirmados, sin gaps, sin fallos). El build compiló, el contenedor arrancó, el servicio quedó `Online`.
3. **Ninguna de esas 5 migraciones se aplicó**, porque ninguno de esos 9 deploys ejecutó `prisma migrate deploy` — el paso manual que sí ocurrió el 07-03 no se repitió, y no había (ni hay) automatización que lo hiciera en su lugar.

En otras palabras: **el pipeline nunca tuvo la capacidad de aplicar migraciones automáticamente; lo que sostuvo las primeras dos fue una intervención manual única que no se volvió a repetir ni se formalizó como proceso.** Cada desarrollador que generó una migración nueva entre el 07-07 y el 07-08 asumió razonablemente que el flujo de deploy la aplicaría (es el comportamiento esperado en un setup típico de Prisma + Docker), pero esa asunción nunca fue cierta en este repositorio.

---

## 2. Si Railway ejecuta o no `prisma migrate deploy`

**No lo ejecuta.** Doble confirmación, independiente entre sí:

- **Evidencia en vivo** (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5, §7): la tabla `_prisma_migrations` real de producción solo tiene 2 filas aplicadas pese a 9 deploys posteriores a la migración más reciente aplicada — si Railway ejecutara `migrate deploy` en cada deploy, las 5 pendientes se habrían aplicado en cualquiera de esos 9 eventos.
- **Evidencia estática del repositorio** (esta sesión): no hay ningún archivo de configuración de Railway (`railway.json`, ni un `railway.toml` — no existe ninguno en el repo), ningún Custom Start Command, y ningún paso de "Pre-Deploy Command" visible ni configurado en el dashboard (confirmado visualmente en la auditoría §4.1, campo vacío).

Railway, tal como está configurado hoy, únicamente construye la imagen Docker y ejecuta el `CMD` declarado en el `Dockerfile` correspondiente. No tiene ninguna noción de "fase de release" separada activa en este proyecto.

---

## 3. Si el Dockerfile actual debería ejecutarlo

**Sí, debería — y hoy no lo hace en ninguna de sus dos versiones.**

```
Dockerfile (raíz), línea final:      CMD ["node", "dist/main.js"]
backend/Dockerfile, línea final:     CMD ["node", "--enable-source-maps", "dist/main.js"]
```

Ninguno de los dos ejecuta ni encadena `prisma migrate deploy` antes de levantar el proceso Node.

**Dónde correspondería agregarlo — y dónde no:**

- **No en un `RUN` durante el build (`FROM ... AS build`).** En esa etapa no hay acceso a `DATABASE_URL` de producción (las variables de entorno de servicio de Railway se inyectan en runtime, no en tiempo de build) — y aunque lo hubiera, acoplar el build de la imagen a una escritura contra la base de datos real sería una mala práctica (una imagen se construye una vez y se puede desplegar en cualquier entorno; no debería mutar datos al construirse).
- **Sí, como parte del `CMD`/entrypoint que corre en el contenedor runtime**, que es donde Railway sí inyecta las variables de entorno reales del servicio (`DATABASE_URL` incluida, confirmado en la auditoría §4.1). El patrón correcto es encadenar: primero `prisma migrate deploy`, y solo si termina exitosamente, arrancar `node dist/...`. Por ejemplo (**no aplicar ahora** — se cita solo para responder la pregunta, es una decisión de diseño de código fuera del alcance de este documento):
  ```
  CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
  ```

**Advertencia importante que no se puede separar de esta pregunta:** `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §2 dejó registrada una contradicción sin resolver — el build real de `nest build` genera el entrypoint en `dist/src/main.js`, no en `dist/main.js`, pero el servicio igual está `Online`. Cualquier cambio futuro que agregue `migrate deploy` al `CMD` **debe resolver ambas cosas a la vez** (la ruta correcta del entrypoint y el paso de migración); agregar solo el paso de migración sin verificar primero cuál es la ruta real que efectivamente arranca hoy correría el riesgo de "arreglar" algo que ya funciona por una razón no confirmada y romperlo. Esto es una decisión de diseño de código — no se resuelve en este documento de causa raíz.

---

## 4. Si `package.json` tiene script correcto para producción

**El comando existe y es correcto, pero está desconectado del flujo real de arranque — nadie lo invoca.**

```json
"scripts": {
  "build": "nest build",
  "start": "node dist/main.js",
  "start:dev": "nest start --watch",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate deploy",
  "prisma:seed": "node prisma/seed.js"
}
```

- `"prisma:migrate": "prisma migrate deploy"` es exactamente el comando correcto para producción (a diferencia de `prisma migrate dev`, que no debe usarse contra una base productiva).
- Pero **`"start"` no lo encadena** (`"start": "node dist/main.js"`, sin ningún `&&` previo), y **ningún Dockerfile invoca `npm run prisma:migrate`** en ningún punto de su build o su `CMD`.
- Conclusión: el script es correcto en cuanto a *qué* comando ejecutar, pero incompleto en cuanto a *cuándo* se ejecuta — depende enteramente de que alguien lo corra a mano, y eso es justamente lo que dejó de pasar después del 07-03 (pregunta 1).

---

## 5. Si alguna migración falló o simplemente nunca se ejecutó

Distinción confirmada directamente contra la tabla `_prisma_migrations` de producción (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.1):

| Migración | Estado real |
|---|---|
| `20260702165247_init` | **Tuvo un intento fallido** (`type "RolNombre" already exists`, `42710`), luego un segundo intento exitoso registrado — evidencia de ejecución manual repetida, no de un fallo del pipeline. |
| `20260702171557_add_comision_pct_to_chofer` | Aplicada exitosamente, sin incidentes. |
| Las otras 5 (`add_anticipo_gasto_id...`, `liquidacion_viaje_one_to_many`, `loosen_facturaviaje_viajeid_unique`, `add_soft_delete_to_cobranza`, `add_activo_chofer_vehiculo`) | **No tienen ninguna fila en `_prisma_migrations`** — ni exitosa ni fallida. |

**Esto es concluyente: las 5 pendientes nunca se intentaron ejecutar contra producción — no es que hayan fallado silenciosamente.** Si hubieran fallado, Prisma habría dejado un registro (como ocurrió con `init`). La ausencia total de fila es la firma característica de "el comando nunca corrió", consistente con la causa raíz de la pregunta 1.

---

## 6. Cómo evitar que vuelva a pasar

En orden de efectividad (nota: describir la solución no implica implementarla en este documento — queda para un diseño de código aparte, fuera del alcance de este diagnóstico):

1. **Automatizar `migrate deploy` como parte obligatoria del arranque del contenedor** (ver pregunta 3), con **fail-fast**: si la migración falla, el proceso Node no debe arrancar. Esto convierte un fallo de migración en un deploy visiblemente fallido en el dashboard de Railway, en vez de un contenedor que arranca "exitosamente" con un schema desincronizado del código (exactamente el escenario actual).
2. **Verificación post-deploy explícita**, hasta que exista un healthcheck de aplicación real (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §6 ya señaló que no existe ninguno hoy): confirmar contra `_prisma_migrations` que el número de filas aplicadas coincide con el número de carpetas en `backend/prisma/migrations/` del commit desplegado. Esto puede ser un paso manual documentado mientras no haya automatización, o un chequeo agregado a un futuro pipeline de CI.
3. **Reforzar el checklist ya existente.** `CHECKLIST_PRE_PUSH.md` punto 9 dice "Sin migraciones inesperadas — toda migración incluida ya estaba descrita en el documento de diseño aprobado" — ese punto cubre que la migración sea la *correcta*, pero no cubre que efectivamente se *aplique* después del push. Vale la pena, en una futura revisión de ese checklist (fuera de alcance de este documento), agregar un punto 11 específico: "si este commit incluye una migración nueva, confirmar contra producción que se aplicó, no asumir que el deploy la aplicó solo".
4. **Nunca depender de una ejecución manual no documentada** como la del 07-03 — quedó fuera de cualquier proceso escrito, nadie la repitió, y es exactamente el patrón que generó este incidente. Cualquier paso manual que se mantenga como mitigación temporal debe quedar escrito en un documento de proceso (como este) y no solo en la memoria de quien lo ejecutó una vez.

---

## 7. Proceso oficial recomendado de deploy desde ahora

Flujo propuesto (a implementar como parte de un diseño de código separado — aquí se describe como respuesta a la pregunta, no como algo ya vigente):

1. **Desarrollo:** el desarrollador genera la migración localmente (`prisma migrate dev`), la prueba contra la base local, y la commitea junto con el código que depende de ella — práctica que ya se sigue hoy (las 7 migraciones existentes siguen este patrón).
2. **Pre-push:** se corre el `CHECKLIST_PRE_PUSH.md` completo, incluido el punto 9 (migración ya descrita en el diseño aprobado).
3. **Push a `main`:** dispara el deploy automático de Railway (ya confirmado funcionando de forma consistente, `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §3).
4. **Build:** Railway construye la imagen con el Dockerfile correspondiente (hoy: el de la raíz para el backend — ver `BLOQUE6.1_DISENO_PRODUCCION.md` §2 para la propuesta de unificación, fuera de alcance acá).
5. **Arranque del contenedor (el paso que falta hoy):** el entrypoint ejecuta `prisma migrate deploy` contra el `DATABASE_URL` real de producción (inyectado por Railway) **antes** de levantar el servidor Node. Si falla, el contenedor no arranca el proceso de la aplicación y el deploy queda marcado como fallido en Railway — visible de inmediato, no silencioso.
6. **Post-deploy:** verificación manual (hasta que exista alerting automático) de que el dominio público responde y de que `_prisma_migrations` tiene la cantidad de filas esperada — mismo tipo de chequeo que documentó `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.2.

**Regla de fondo:** ningún commit que incluya una migración nueva debería considerarse "desplegado" hasta que se confirme —no se asuma— que esa migración está aplicada contra producción. Hoy esa confirmación no existe en ningún punto del proceso; a partir de la automatización de la pregunta 6 pasaría a ser parte del propio mecanismo de arranque.

---

## 8. Plan seguro para aplicar las migraciones pendientes

**No se ejecutó nada de lo siguiente al momento de escribir este documento — era el plan, a la espera de aprobación explícita.** Consolida y detalla el plan ya esbozado en `BLOQUE6.1_DISENO_PRODUCCION.md` §1.2, con los comandos exactos. **Actualización de cierre (2026-07-10): este plan ya fue aprobado y ejecutado exitosamente — ver "Resultado final de ejecución" al final del documento.**

### 8.1 Backup previo

Antes de tocar el schema, generar un `pg_dump` completo de la base de producción. Dos formas equivalentes, sin exponer el valor de `DATABASE_URL` en ningún log ni documento:

- **Vía Railway CLI (recomendada — evita pegar el secreto a mano):**
  ```
  railway link            # seleccionar el proyecto cereales-transport / servicio Postgres
  railway run --service Postgres pg_dump "$DATABASE_URL" -F c -f backup_prod_20260709.dump
  ```
- **Alternativa vía consola del dashboard de Railway** (pestaña del servicio Postgres → "Connect" → abrir una shell/consola y correr `pg_dump` desde ahí, guardando el archivo resultante fuera de Railway).

El volumen actual es mínimo (tabla más grande: 5 filas, según `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.4) — el dump es prácticamente instantáneo.

### 8.2 Comando exacto para aplicar las migraciones

Ejecutar desde una copia local limpia del commit **exactamente igual al desplegado en producción** (`f2c9505`, para evitar drift entre el `schema.prisma` local y el que generó las migraciones), parado en `backend/`:

```
railway link            # mismo proyecto, esta vez apuntando al servicio backend (cereales-transport)
railway run npx prisma migrate deploy
```

`railway run` inyecta automáticamente el `DATABASE_URL` real del servicio sin necesidad de copiarlo ni pegarlo en ningún lado. Prisma aplica las 5 migraciones pendientes en orden cronológico (garantizado por el nombre de carpeta, no requiere especificarlas una por una):

1. `20260707022545_add_anticipo_gasto_id_and_unique_constraints`
2. `20260707051214_liquidacion_viaje_one_to_many`
3. `20260707161205_loosen_facturaviaje_viajeid_unique`
4. `20260707164246_add_soft_delete_to_cobranza`
5. `20260708011415_add_activo_chofer_vehiculo`

### 8.3 Verificación posterior

Repetir exactamente las consultas de `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.2 contra producción:

- `SELECT * FROM _prisma_migrations;` → debe devolver **7 filas**, todas con `finished_at` poblado y `rolled_back_at` nulo (no 2, como hoy).
- `\d "LiquidacionMovimiento"` → debe incluir la columna `anticipoGastoId`.
- `SELECT column_name FROM information_schema.columns WHERE table_name IN ('Chofer','Vehiculo','Cobranza') AND column_name IN ('activo','anulada','anuladaMotivo','anuladaFecha')` → deben aparecer las 4 columnas.
- `\d "LiquidacionViaje"` y `\d "FacturaViaje"` → los índices `UNIQUE` sobre `viajeId` deben haber desaparecido en ambos.
- **Prueba funcional mínima contra producción real:** crear una liquidación de prueba desde la interfaz desplegada, confirmarla, anularla, y volver a liquidar el mismo viaje (el flujo que hoy fallaría). Limpiar el dato de prueba al finalizar.

### 8.4 Rollback posible

- `prisma migrate deploy` no tiene un "deshacer" automático de una migración ya aplicada exitosamente. Si una migración **falla a mitad de camino**, Prisma la marca como fallida en `_prisma_migrations` y bloquea la siguiente hasta resolverla explícitamente con `prisma migrate resolve --rolled-back <nombre>` (si se revirtió el cambio a mano) o `--applied <nombre>` (si se confirma que sí quedó aplicado pese al error reportado).
- **Las 5 migraciones son aditivas por diseño** — agregan columnas (con default o nullable) o relajan una constraint `UNIQUE`; ninguna hace `DROP COLUMN`, `DROP TABLE` ni borra datos existentes (confirmado leyendo el contenido de las 5 carpetas de migración). Esto simplifica mucho el rollback real: si después de aplicarlas apareciera un problema, la opción más simple no es "deshacer el schema" sino **revertir el commit de código** en Railway — el código viejo simplemente no referencia las columnas nuevas, y una constraint `UNIQUE` de menos no rompe nada retroactivamente.
- El backup del paso 8.1 cubre el escenario extremo (algo sale mal de un modo no prolijamente reversible por Prisma): restaurar desde el dump con `pg_restore`.

### 8.5 Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Alguna de las constraints `UNIQUE` que se relajan (`LiquidacionViaje.viajeId`, `FacturaViaje.viajeId`) esconde una duda de datos duplicados preexistente que rompa algo al aplicarse. | Baja | El volumen real es mínimo (máx. 5 filas en la tabla más grande, `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.4) — se verifica en segundos, no en horas; estas mismas migraciones ya corrieron sin incidentes múltiples veces en desarrollo. |
| 2 | Ejecutar el comando desde una copia local con `schema.prisma`/migraciones distintas a las que generó el commit desplegado (drift). | Baja-media | Verificar `git log -1` en el checkout local coincide con `f2c9505` antes de correr el comando. |
| 3 | Exponer `DATABASE_URL` de producción al correr el comando manualmente. | Baja | Usar `railway run` (pregunta 8.2), que inyecta la variable sin necesidad de copiarla a mano ni que quede en el historial de la shell. |
| 4 | No hay ambiente de staging idéntico a producción para ensayar el `migrate deploy` antes. | Baja-media (no eliminable, solo mitigable) | Compensado por el bajo volumen de datos y por el hecho de que las 5 migraciones ya se probaron exitosamente contra desarrollo en los Bloques 3-5. |
| 5 | El contenedor en ejecución hoy no ejecuta `migrate deploy` en su arranque (pregunta 2-3) — aplicar las migraciones manualmente no queda "fijado" para el próximo deploy. | Media (recurrencia) | Este plan resuelve el síntoma puntual, no la causa raíz — la automatización de la pregunta 6-7 sigue siendo necesaria aparte; si no se implementa, el mismo problema puede repetirse con la próxima migración nueva. |

---

## Resumen — respuesta directa a las 8 preguntas

1. **¿Por qué quedaron 5 pendientes?** Porque nunca existió automatización de `migrate deploy` en el pipeline; las 2 primeras se aplicaron a mano una vez (07-03) y esa acción manual nunca se repitió ni se formalizó.
2. **¿Railway ejecuta `migrate deploy`?** No — confirmado en vivo y por evidencia estática del repositorio.
3. **¿Debería ejecutarlo el Dockerfile?** Sí, como parte del arranque del contenedor runtime (no del build) — hoy ninguno de los dos Dockerfiles lo hace.
4. **¿`package.json` tiene el script correcto?** El comando (`prisma:migrate`) es correcto, pero está desconectado — nada lo invoca automáticamente.
5. **¿Falló o nunca se ejecutó?** Las 5 pendientes **nunca se ejecutaron** (sin registro en `_prisma_migrations`); la única que sí registra un fallo es `init`, y fue seguida de un reintento manual exitoso el mismo día.
6. **¿Cómo evitar que se repita?** Automatizar el paso con fail-fast en el arranque del contenedor, verificar post-deploy contra `_prisma_migrations`, reforzar el checklist pre-push.
7. **¿Proceso oficial de deploy?** Desarrollo → checklist pre-push → push → build → **migrate deploy en el arranque (paso faltante hoy)** → arranque de la app → verificación post-deploy.
8. **¿Plan seguro para aplicar lo pendiente?** Backup vía `railway run pg_dump` → `railway run npx prisma migrate deploy` desde el commit `f2c9505` → verificación contra `_prisma_migrations` y prueba funcional → rollback vía reversión de código (migraciones aditivas) o restauración del backup en el peor caso.

**No se aplicó ninguna migración, no se modificó código ni configuración, no se hizo commit ni push para producir este documento.** Al momento de escribirlo, quedaba a la espera de aprobación explícita antes de ejecutar cualquier paso de la sección 8. **Esa aprobación se dio y la sección 8 ya fue ejecutada exitosamente — ver "Resultado final de ejecución" a continuación.**

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. El plan de la sección 8 **fue aprobado y ejecutado en su totalidad**, en pasos separados y con aprobación explícita en cada uno, siguiendo el detalle operativo de `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`.

- **Backup generado correctamente:** `pg_dump` versión 18.4 (igual a la del servidor de producción), ejecutado dentro del propio contenedor del servicio Postgres de Railway — 59.642 bytes, verificado legible/listable con `pg_restore --list` (144 entradas de TOC).
- **Migraciones aplicadas correctamente:** las 5 pendientes, con `prisma migrate deploy` corrido dentro del contenedor del servicio backend, desde el commit `f2c9505` (el mismo confirmado como desplegado en la sección 1). Sin errores.
- **Verificación estructural:** **PASS** — `_prisma_migrations` con 7 filas aplicadas, columnas nuevas presentes, constraints `UNIQUE` relajadas a índice normal.
- **Pruebas funcionales en producción:** **PASS** — los 5 flujos de negocio identificados en la pregunta 1 como rotos (liquidar con anticipo, anular con reversión, re-liquidar, re-facturar, anular cobranza) se ejercieron contra la API real con datos `QA-MIGRACION`, todos exitosos.
- **Logs:** sin errores durante la ventana de ejecución.
- **Residuos QA-MIGRACION no reversibles:** por diseño (sin borrado físico en el sistema), quedan permanentes pero en estado terminal: 1 `Viaje` cancelado, 2 `Liquidacion` anuladas, 2 `Factura` anuladas, 1 `Cobranza` anulada, 1 `AnticipoGasto` anulado, 1 `Chofer` inactivo. Sin impacto en datos ni reportes reales.
- **Riesgo pendiente:** la causa raíz diagnosticada en este mismo documento (secciones 1-3: ausencia de automatización de `prisma migrate deploy` en el pipeline) **no se resolvió** — solo se aplicó el correctivo puntual sobre las 5 migraciones ya pendientes. Sin esa automatización, el mismo escenario puede repetirse con la próxima migración que se genere.

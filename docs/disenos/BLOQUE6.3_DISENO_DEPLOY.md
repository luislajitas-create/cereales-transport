# Bloque 6.3 — Diseño Técnico: Automatización del Deploy con Migraciones

Fecha: 2026-07-10. Documento de diseño puro — **no se modificó código, no se modificaron Dockerfiles, no se modificó configuración de Railway, no se modificó Prisma, no se generaron migraciones, no se hizo commit ni push.** Responde a `BLOQUE6.3_AUDITORIA_DEPLOY.md`. Un diseño técnico nunca se auto-aprueba (`METODOLOGIA_SDC.md` etapa 2) — termina con puntos de decisión explícitos, a la espera de aprobación antes de tocar un solo archivo.

---

## 0. Alcance

**En alcance:** diseñar cómo automatizar `prisma migrate deploy` dentro del flujo de deploy de Railway, de forma fail-fast, determinística y con el mínimo mantenimiento posible — el flujo objetivo planteado:

```
git push → Railway deploy → prisma migrate deploy → healthcheck → aplicación disponible
```

**Explícitamente fuera de alcance de este documento** (quedan señalados como puntos de decisión pendientes, no se diseñan en detalle acá):
- La unificación de Dockerfiles de `BLOQUE6.1_DISENO_PRODUCCION.md` §2 — que la auditoría de este mismo bloque (`BLOQUE6.3_AUDITORIA_DEPLOY.md` §2.4) encontró rota tal como está escrita. Se referencia, no se rediseña acá.
- CI/CD externo (GitHub Actions u otro) — no existe hoy en el repositorio y el flujo de Railway no lo requiere para lograr el objetivo planteado (ver sección 2.4, alternativa descartada).
- Cualquier cambio al endpoint `/health` existente para que verifique conectividad a la base de datos — mencionado como mejora posible, no diseñado en detalle.
- La renovación del plan Trial de Railway y los backups automatizados — ya señalados en `BLOQUE6_DISENO.md` §5.3 y `BLOQUE6.1_DISENO_PRODUCCION.md` §5, sin cambios.

---

## 1. Criterios de diseño (los mismos que pidió el alcance del bloque)

Todo lo evaluado en la sección 2 se juzga contra estos 8 criterios, en este orden de prioridad cuando entran en tensión entre sí:

1. **Simplicidad** — menos piezas nuevas, menos superficie de mantenimiento.
2. **Robustez** — que no dependa de que alguien recuerde un paso manual.
3. **Compatibilidad con Railway** — usar lo que la plataforma ya ofrece nativamente antes que reconstruirlo a mano.
4. **Compatibilidad con futuras migraciones** — que no haya que tocar la solución cada vez que se agregue una migración nueva.
5. **Mínimo mantenimiento** — configuración declarativa, versionada, no un script que alguien tiene que recordar actualizar.
6. **Comportamiento determinístico** — mismo resultado en cada deploy, sin condiciones de carrera.
7. **Fail-fast** — si la migración falla, la aplicación nueva no debe recibir tráfico.
8. **Posibilidad de rollback** — sin agravar el riesgo ya estructural documentado en la auditoría §7.

---

## 2. Alternativas evaluadas

### Alternativa A — Encadenar `prisma migrate deploy` dentro del `CMD` del Dockerfile

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

**Cómo funcionaría:** el propio contenedor de la aplicación, al arrancar, corre la migración antes de arrancar el servidor Node. Si la migración falla (`exit code != 0`), el `&&` corta la cadena y `node` nunca arranca — el contenedor termina con el código de salida de Prisma.

**Ventajas:**
- No depende de ninguna configuración fuera del repositorio — todo versionado en el `Dockerfile`.
- Funciona igual en cualquier plataforma que corra la imagen (no ata la solución a una función específica de Railway) — portabilidad, por si el proyecto migrara de proveedor en el futuro.

**Desventajas / riesgos (evidencia: `BLOQUE6.3_AUDITORIA_DEPLOY.md` §5-6):**
- Un fallo activa el `restartPolicy` de Railway (`ON_FAILURE`, hasta 10 reintentos) — reintenta el mismo contenedor hasta 10 veces, re-ejecutando la migración fallida cada vez (probablemente con el mismo resultado si el error es determinístico), antes de que Railway lo dé por perdido. Comportamiento menos limpio que un "no reintentar y marcar fallido" inmediato.
- La migración se re-ejecuta en **cada reinicio del contenedor**, no solo en deploys nuevos — incluye reinicios por crash de la propia aplicación ya desplegada. Es seguro (idempotente) pero agrega latencia y una conexión extra a la base en cada ciclo de restart, incluso cuando no hay nada pendiente.
- Requiere modificar el `Dockerfile` — más superficie tocada, y el `Dockerfile` de la raíz es compartido entre build y start; un error de sintaxis en el `CMD` rompe todo el arranque, no solo la parte de migración.
- No hay separación de logs entre "falló la migración" y "falló la aplicación" — ambos aparecen en el mismo log de deploy del mismo contenedor, dificultando el diagnóstico rápido.

### Alternativa B — `preDeployCommand` nativo de Railway (recomendada)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "dockerfile" },
  "deploy": {
    "preDeployCommand": "npx prisma migrate deploy"
  }
}
```

**Cómo funcionaría** (evidencia: `BLOQUE6.3_AUDITORIA_DEPLOY.md` §4, citas textuales de la documentación oficial de Railway): Railway ejecuta este comando **en un contenedor aislado**, separado del contenedor de la aplicación, **una sola vez por deploy**, entre el build y el arranque del `startCommand`. Tiene acceso a las mismas variables de entorno (`DATABASE_URL` incluida). Si falla, "no se reintenta y el deploy no continúa" — el `startCommand` (la app) directamente no llega a arrancar con esa versión nueva.

**Ventajas:**
- **Es exactamente el mecanismo que la propia documentación de Railway nombra explícitamente para "database migrations"** — no es una adaptación forzada de una función genérica, es el caso de uso previsto.
- **No requiere modificar ningún Dockerfile** — cambio de una línea en `railway.json`, ya versionado y ya usado por este proyecto para otras configuraciones (`build.builder`).
- **No se reintenta automáticamente** — comportamiento fail-fast más limpio que la Alternativa A (no hay 10 reintentos de una migración que probablemente va a fallar de la misma forma cada vez).
- **Corre una sola vez por deploy**, no en cada reinicio del contenedor de la app — evita conexiones redundantes a la base en cada crash-restart.
- **Separación de responsabilidad**: si el deploy falla, queda registrado como fallo del paso de pre-deploy, no mezclado con los logs de arranque de la aplicación — mejor diagnóstico.
- Coherente con el criterio de "compatibilidad con Railway" (criterio 3) — usa la plataforma como está pensada, en vez de recrear a mano algo que ya existe.

**Desventajas / riesgos:**
- Ata la solución a una función específica de Railway — si el proyecto migrara de proveedor de hosting en el futuro, este mecanismo no existiría ahí y habría que rediseñar (riesgo de portabilidad, mitigado por el hecho de que Railway ya es la plataforma elegida del proyecto, sin planes de migrarla documentados).
- La documentación no confirma explícitamente si la versión anterior de la app sigue sirviendo tráfico mientras el pre-deploy corre o falla — se infiere razonablemente que sí (es el patrón estándar de "no se reemplaza lo que sirve tráfico hasta que lo nuevo esté listo"), pero no está citado textualmente en la documentación revisada — se señala como punto a confirmar empíricamente antes de depender de esa garantía en un incidente real (ver sección 5, plan de pruebas).
- Requiere que `prisma` (CLI) siga disponible en el contexto donde Railway ejecuta el `preDeployCommand` — la documentación no detalla si usa la imagen ya construida (con `node_modules` completo, que hoy sí incluye `prisma` porque el Dockerfile de la raíz no poda devDependencies) o un entorno separado. Punto a confirmar en el plan de pruebas antes de aprobar la implementación final.

### Alternativa C — Script de entrypoint dedicado (`entrypoint.sh`)

```dockerfile
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
```
```sh
#!/bin/sh
set -e
echo "Aplicando migraciones..."
npx prisma migrate deploy
echo "Migraciones OK, iniciando aplicación..."
exec node dist/main.js
```

**Cómo funcionaría:** variante más explícita de la Alternativa A — un script separado en vez de una línea inline en el `CMD`, con manejo de errores más legible (`set -e` corta ante cualquier fallo) y mensajes de log propios para distinguir la fase de migración de la fase de arranque.

**Ventajas:**
- Mismo nivel de portabilidad que la Alternativa A (no depende de Railway específicamente).
- Más legible y mantenible que una línea `sh -c "... && ..."` — más fácil de extender en el futuro (por ejemplo, agregar una verificación adicional antes de arrancar).
- `exec node dist/main.js` (en vez de solo `node dist/main.js`) reemplaza el proceso del shell por el de Node, preservando el manejo correcto de señales (`SIGTERM`) que Railway envía al apagar el contenedor — detalle correcto que la Alternativa A, tal como está escrita con `sh -c "... && ..."`, no garantiza de forma tan directa.

**Desventajas / riesgos:**
- Comparte exactamente las mismas desventajas de fondo que la Alternativa A (reintentos de `restartPolicy`, re-ejecución en cada restart, logs mezclados) — es una mejora de forma, no de fondo, sobre la Alternativa A.
- Un archivo nuevo (`entrypoint.sh`) que mantener y mantener sincronizado con el Dockerfile — más piezas que la Alternativa B.

### Alternativa D — CI/CD externo con fase de release separada (ej. GitHub Actions) — descartada

**Por qué se evalúa y se descarta sin diseño en detalle:** un pipeline de CI/CD externo (GitHub Actions u otro) podría correr `prisma migrate deploy` como un paso separado antes de que Railway despliegue. **Pero:**
- No existe ningún workflow de CI/CD hoy en este repositorio (`BLOQUE6.3_AUDITORIA_DEPLOY.md` §11, confirmado: no hay `.github/`) — agregar uno sería una pieza de infraestructura enteramente nueva, no una extensión de algo existente.
- Railway ya resuelve el mismo problema de forma nativa (Alternativa B) sin necesitar un sistema externo — introducir CI/CD solo para este propósito viola el criterio de simplicidad (criterio 1) y agrega una dependencia y un punto de fallo adicional (¿qué pasa si el CI está caído pero Railway igual despliega?).
- Quedaría **fuera del alcance real del problema**: el objetivo es que Railway no despliegue una versión nueva sin que la migración correspondiente se haya aplicado — Railway ya tiene el mecanismo (`preDeployCommand`) para garantizar exactamente eso desde adentro de su propio pipeline, sin coordinar dos sistemas separados.

**Se descarta explícitamente, no se diseña en más detalle.**

---

## 3. Recomendación

**Alternativa B (`preDeployCommand` nativo de Railway) como mecanismo principal, sin descartar reforzarla con elementos de la Alternativa C más adelante si se detecta necesidad real.**

Justificación contra los 8 criterios de la sección 1:

| Criterio | A (CMD encadenado) | B (preDeployCommand) | C (entrypoint.sh) |
|---|---|---|---|
| 1. Simplicidad | Media (una línea, pero mezclada con el arranque) | **Alta** (una línea en `railway.json`, sin tocar Dockerfile) | Media (archivo nuevo) |
| 2. Robustez | Media (reintentos pueden enmascarar el diagnóstico) | **Alta** (no reintenta, falla visible de inmediato) | Media (igual que A) |
| 3. Compatibilidad con Railway | Baja (ignora una función nativa ya disponible) | **Alta** (es el mecanismo que Railway documenta para este caso exacto) | Baja (igual que A) |
| 4. Compatibilidad con futuras migraciones | Alta (no requiere tocar nada por migración nueva) | **Alta** (idéntico — Prisma ya resuelve el orden por nombre de carpeta) | Alta (igual que A/B) |
| 5. Mínimo mantenimiento | Media (vive en el Dockerfile, junto con lógica de arranque) | **Alta** (una línea declarativa, separada de la lógica de la app) | Media (un archivo más que sincronizar) |
| 6. Determinismo | Media (corre en cada restart, no solo en deploys) | **Alta** (corre exactamente una vez por deploy) | Media (igual que A) |
| 7. Fail-fast | Media (10 reintentos antes de darse por vencido) | **Alta** (falla inmediata, sin reintentos) | Media (igual que A) |
| 8. Rollback | Igual en las tres — ninguna resuelve el riesgo estructural de la sección 7 de la auditoría | Igual | Igual |

**La Alternativa B gana en 6 de los 8 criterios y empata en los 2 restantes — no hay ningún criterio en el que las Alternativas A o C sean superiores a B.** Es además la que menos archivos toca (un cambio de una línea en `railway.json`, ya usado hoy solo para `build.builder`), lo cual reduce el riesgo de introducir un error de sintaxis en un Dockerfile que hoy funciona correctamente.

---

## 4. Relación con el diseño previo de Bloque 6.1 (unificación de Dockerfiles)

`BLOQUE6.1_DISENO_PRODUCCION.md` §2 sigue como punto de decisión pendiente 2, sin implementar. `BLOQUE6.3_AUDITORIA_DEPLOY.md` §2.4 encontró que, tal como está escrito hoy, ese diseño rompería el arranque de la aplicación y dejaría sin `prisma` CLI al runtime.

**Esto no bloquea la Alternativa B recomendada acá** — el `preDeployCommand` no depende de cuál Dockerfile se use, siempre que el contenedor donde Railway lo ejecute tenga acceso a `prisma` (hoy garantizado por el Dockerfile de la raíz, que no poda devDependencies). **Pero si en algún momento se retoma la unificación de Dockerfiles de `BLOQUE6.1_DISENO_PRODUCCION.md` §2, ese diseño necesita, como mínimo, dos correcciones antes de implementarse:**

1. Excluir `backend/scripts/` de la compilación de TypeScript (agregando `scripts` al `exclude` de `tsconfig.json`, o ajustando `backend/Dockerfile` para no copiarlo) — para que `nest build` produzca `dist/main.js` y no `dist/src/main.js`.
2. Mantener `prisma` disponible en el runtime stage de `backend/Dockerfile` (hoy se pierde con `npm install --only-prod`) — necesario para que `preDeployCommand` (o cualquier mecanismo de migración) pueda ejecutar `npx prisma migrate deploy` contra esa imagen.

**No se diseñan estas dos correcciones en detalle acá** — quedan señaladas para si/cuando se retome ese punto de decisión pendiente, como su propio sub-alcance.

---

## 5. Plan de pruebas (antes de dar por aprobada la implementación)

No se ejecuta nada de esto en este documento — es el plan a validar si se aprueba avanzar:

1. **Confirmar en un deploy real** (no en teoría) que, con `preDeployCommand` configurado, una migración que falla efectivamente bloquea el deploy sin dejar la app nueva sirviendo tráfico — usando una migración de prueba deliberadamente inválida en un entorno que no sea producción, o documentando el primer uso real en producción con seguimiento cercano.
2. **Confirmar que la versión anterior de la app sigue respondiendo** mientras un `preDeployCommand` está corriendo o si falla — punto no confirmado explícitamente por la documentación oficial (sección 2, Alternativa B, desventajas).
3. **Configurar `healthcheckPath: /api/v1/health`** (el endpoint ya existente, sin cambios de código) junto con el `preDeployCommand`, y confirmar que Railway efectivamente espera el `200` antes de cortar tráfico hacia la versión nueva — comportamiento documentado (`BLOQUE6.3_AUDITORIA_DEPLOY.md` §8) pero nunca probado en este proyecto porque nunca hubo un healthcheck configurado.
4. **Validar contra un deploy real con al menos una migración pendiente** (puede ser una migración trivial nueva, generada y aprobada como cualquier otra según `CONVENCIONES_DESARROLLO.md`) que el flujo completo — push, build, `preDeployCommand` aplicando la migración, healthcheck, tráfico cortado a la versión nueva — funciona de punta a punta sin intervención manual.
5. Repetir el mismo plan de pruebas para `perceptive-tranquility` (frontend) **no aplica** — el frontend no tiene base de datos ni migraciones; este diseño es exclusivo del servicio backend.

---

## 6. Plan de rollback (de esta automatización, no de las migraciones en sí)

- **Revertir `railway.json`** (quitar `deploy.preDeployCommand`) es un cambio de una línea, instantáneo, sin pérdida de datos — si el mecanismo demostrara algún comportamiento no deseado, se puede desactivar sin tocar el Dockerfile ni la base de datos.
- El riesgo de rollback de **schema** (migraciones ya aplicadas al hacer rollback de código) es el mismo riesgo estructural ya documentado en `BLOQUE6.3_AUDITORIA_DEPLOY.md` §7 — esta automatización no lo agrava ni lo resuelve, solo garantiza que las migraciones se apliquen a tiempo, no que sean reversibles.

---

## 7. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | La documentación de Railway no confirma explícitamente si la versión anterior sigue sirviendo tráfico durante un `preDeployCommand` fallido. | Baja-media | Punto 2 del plan de pruebas (sección 5) — confirmar empíricamente antes de depender de esa garantía en un incidente real. |
| 2 | `preDeployCommand` ata la solución a Railway específicamente (menor portabilidad que un `CMD` encadenado). | Baja | Aceptado conscientemente — Railway es la plataforma elegida del proyecto, sin planes de migración documentados; se prioriza el resto de los criterios (sección 3). |
| 3 | Sin réplicas múltiples hoy, no se puede probar el comportamiento de `preDeployCommand` (ni de la Alternativa A) bajo concurrencia real. | Baja (no es un riesgo activo con `numReplicas: 1`) | Señalado para revisión si el proyecto escala a más de una réplica en el futuro. |
| 4 | El riesgo estructural de rollback de schema (migraciones forward-only, dependientes de la convención de aditividad) sigue sin resolverse — ninguna alternativa evaluada lo elimina. | Media (ya existía antes del Bloque 6.3, no lo crea este diseño) | Depende de mantener la convención ya establecida en `CONVENCIONES_DESARROLLO.md` — fuera del alcance de una automatización de pipeline. |
| 5 | Si en el futuro se retoma la unificación de Dockerfiles de `BLOQUE6.1_DISENO_PRODUCCION.md` §2 sin aplicar las 2 correcciones de la sección 4 de este documento, se rompería tanto el arranque de la app como la disponibilidad de `prisma` en runtime. | Media (no es un riesgo activo hoy, es una trampa para una implementación futura) | Señalado explícitamente en la sección 4 — cualquier retomada de ese punto de decisión debe leer esta sección primero. |

---

## 8. Puntos de decisión pendientes para tu aprobación

1. **¿Aprobás la Alternativa B (`preDeployCommand` nativo de Railway) como mecanismo de automatización de `prisma migrate deploy`?** Es la recomendación de este documento, con margen claro sobre las alternativas A y C en 6 de 8 criterios.
2. **¿Aprobás configurar `healthcheckPath: /api/v1/health`** (endpoint ya existente, sin cambios de código) **como parte del mismo cambio**, para completar el flujo objetivo (`... → Healthcheck → Aplicación disponible`)? Es un cambio de configuración adicional, no de código, y sin él el flujo objetivo queda incompleto (no hay compuerta de corte de tráfico).
3. **¿En qué momento se ejecuta el plan de pruebas de la sección 5?** Requiere, como mínimo, un deploy real con una migración de prueba — decisión sobre si se hace con una migración trivial dedicada o se espera a la próxima migración real del proyecto.
4. **¿Se retoma en este mismo ciclo la unificación de Dockerfiles de `BLOQUE6.1_DISENO_PRODUCCION.md` §2** (con las 2 correcciones de la sección 4 de este documento incorporadas), **o queda explícitamente para otro sub-bloque posterior?** No es necesaria para implementar la Alternativa B — son independientes.

**No se implementó nada de este diseño al momento de escribirlo — quedaba a la espera de aprobación explícita.**

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. Los puntos de decisión 1 y 2 de la sección 8 (Alternativa B recomendada + `healthcheckPath`) **fueron aprobados e implementados**, validados en un deploy real de producción siguiendo el plan de pruebas de la sección 5. Los puntos 3 y 4 (cuándo correr una migración de prueba dedicada, y si se retoma la unificación de Dockerfiles) quedan sin resolver, fuera del alcance de esta ejecución.

- **Commit `1161bb0` pusheado** — `railway.json` con `deploy.preDeployCommand: "npx prisma migrate deploy"` y `deploy.healthcheckPath: "/api/v1/health"`, exactamente la Alternativa B recomendada en la sección 3, sin tocar ningún Dockerfile.
- **Deploy automático ejecutado** sin ningún paso manual — confirmado contra el commit real.
- **`preDeployCommand` ejecutado correctamente**, en un contenedor separado, tal como describía la Alternativa B (sección 2): logs reales muestran `Starting Container` → migración → `Stopping Container` → arranque de la app.
- **`prisma migrate deploy` devolvió `No pending migrations to apply.`** — confirma en producción real el comportamiento idempotente en el que se apoya todo el diseño (ventaja "determinismo", sección 3) — sin filas nuevas en `_prisma_migrations` (se mantuvo en 7).
- **Healthcheck `/api/v1/health` funcionando** — el punto 2 del plan de pruebas (sección 5) quedó validado: se configuró junto con el `preDeployCommand` en el mismo cambio, y el corte de tráfico observado (instancia vieja `REMOVED`, nueva `RUNNING`) es consistente con que la compuerta de healthcheck operó antes de activar la versión nueva.
- **API pública responde `200`**, **login y listado básico: PASS** — validación funcional completa contra la aplicación real, no solo contra el healthcheck.
- **Logs sin errores** durante todo el deploy.

**Riesgos residuales — corresponden a puntos del plan de pruebas (sección 5) y de la tabla de riesgos (sección 7) que esta primera ejecución no pudo cerrar del todo:**
- **Riesgo 1 de la sección 7** (si la versión anterior sigue sirviendo tráfico durante un `preDeployCommand` fallido) **sigue sin confirmarse** — el probe interno del healthcheck no quedó visible de forma literal en los logs revisados, y esta corrida no ejercitó el camino de falla.
- **Punto 1 del plan de pruebas** (fail-fast ante una migración que efectivamente falla) **sigue pendiente** — esta ejecución fue el caso feliz (`No pending migrations to apply.`), no una migración fallida real.
- **Riesgo 4 de la sección 7** (rollback de schema dependiente de migraciones aditivas) **no cambia** — ninguna automatización de este diseño lo convierte en una garantía técnica, sigue siendo una convención de código.

Estos tres puntos quedan como trabajo futuro — se recomienda ejercitarlos con la próxima migración real del proyecto (punto de decisión 3 de la sección 8, nunca resuelto explícitamente), en vez de generar una migración de prueba dedicada solo para completarlos.

# Acta de Cierre de Incidente — Migraciones de Producción sin Aplicar (Bloque 6.1 / 6.2)

**Estado: CERRADO.** Fecha de apertura: 2026-07-09. Fecha de cierre: 2026-07-10.

Este documento resume, en un solo lugar, un incidente que se documentó en detalle a lo largo de 4 documentos separados (`BLOQUE6.1_AUDITORIA_PRODUCCION.md`, `BLOQUE6.1_DISENO_PRODUCCION.md`, `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md`, `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`). Sirve como acta de cierre formal del Bloque 6.1/6.2 — cada documento fuente tiene el detalle completo y la evidencia; acá solo se consolida qué pasó, por qué, cómo se resolvió y qué queda abierto.

---

## 1. Qué pasó (el incidente)

El 2026-07-09, una auditoría en vivo contra el dashboard de Railway y la base de datos real de producción (`BLOQUE6.1_AUDITORIA_PRODUCCION.md`) encontró que la base de datos de producción tenía **5 de 7 migraciones de Prisma sin aplicar**, pese a que el código ya desplegado (commit `f2c9505`) asumía que esas 5 migraciones ya estaban aplicadas. Confirmado por dos vías independientes: la tabla `_prisma_migrations` (solo 2 filas) y una verificación columna por columna del schema real (columnas y constraints faltantes exactamente donde se esperaba que faltaran).

**Efecto concreto:** cualquier intento real de liquidar con anticipo, anular y re-liquidar un viaje, anular y re-facturar, anular una cobranza, o dar de baja un chofer/vehículo desde la aplicación ya desplegada habría fallado en tiempo de ejecución. No era un riesgo teórico — era una función rota, a la espera del primer uso real.

---

## 2. Causa raíz

Documentada en detalle en `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md`. Resumen:

- **No existe, en ningún punto del pipeline de deploy, un paso que ejecute `prisma migrate deploy`** — ni en el `Dockerfile` (raíz ni `backend/Dockerfile`), ni en `railway.json`, ni en `package.json` (el script `prisma:migrate` existe pero está huérfano, nada lo invoca), ni hay CI/CD (`.github/` no existe en el repo).
- Las primeras 2 migraciones quedaron aplicadas el 2026-07-03 por una **ejecución manual puntual**, evidenciada por un intento fallido registrado en `_prisma_migrations` seguido de un reintento exitoso. Esa acción manual nunca se repitió ni se formalizó como proceso.
- Las 5 migraciones generadas entre el 2026-07-07 y el 2026-07-08 (Bloques 3, 3.3, 4.2, 4.3, 5.2.a) se commitearon y desplegaron automáticamente (9 deploys exitosos confirmados) pero **nunca se intentó aplicarlas** — no fallaron, simplemente nadie ejecutó el comando después del 07-03.

**Naturaleza del incidente: defecto estructural del pipeline de deploy, no un error humano puntual ni un fallo de una migración específica.**

---

## 3. Resolución

Ejecutada en producción el 2026-07-10, siguiendo el procedimiento aprobado paso a paso de `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`, con aprobación explícita en cada etapa (backup → aplicación → verificación estructural → pruebas funcionales):

| Paso | Resultado |
|---|---|
| Confirmación de commit desplegado | `f2c9505`, verificado sin diffs sobre `backend/` |
| Backup previo | `pg_dump` 18.4 (misma versión que el servidor, corrido dentro del propio contenedor de Postgres en Railway) — 59.642 bytes, verificado legible con `pg_restore --list` (144 entradas de TOC) |
| Aplicación de las 5 migraciones | `prisma migrate deploy` corrido dentro del contenedor del backend (con acceso a la red privada de Railway) — sin errores, las 5 aplicadas en orden |
| Verificación estructural | **PASS** — `_prisma_migrations` con 7 filas, las 8 columnas nuevas presentes, las 2 constraints `UNIQUE` relajadas a índice normal |
| Pruebas funcionales en producción | **PASS** — 7 casos / 17 aserciones contra la API real, con datos de prueba prefijados `QA-MIGRACION`: liquidar con anticipo, anular con reversión del anticipo, re-liquidar el mismo viaje, anular y re-facturar, registrar y anular cobranza, dar de baja/reactivar chofer de prueba |
| Logs | Sin errores durante toda la ventana de ejecución (`@level:error` y HTTP `>=400`, ambos en 0 resultados) |
| Limpieza | Todo lo reversible fue anulado/desactivado; ver residuo en la sección 4 |

Ninguna de las 5 migraciones requirió intervención manual adicional ni produjo un resultado inesperado — las 5 son aditivas por diseño (agregan columnas o relajan una constraint, ninguna borra datos).

---

## 4. Riesgo residual

**No se automatizó `prisma migrate deploy` en el pipeline de deploy.** Esta ejecución resolvió el síntoma puntual (las 5 migraciones que ya estaban pendientes) pero no la causa raíz. Sin esa automatización, **el mismo escenario puede repetirse** con la próxima migración que se genere — nada en el pipeline actual impide que un futuro commit con una migración nueva quede, otra vez, sin aplicar contra producción.

**Recomendación (ya diseñada en detalle en `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` §3, §6-7, pendiente de implementación):** ejecutar `prisma migrate deploy` como parte obligatoria del arranque del contenedor runtime, con fail-fast si falla, más una verificación post-deploy que confirme el número de filas en `_prisma_migrations`. Es la única forma de que esto deje de depender de que alguien se acuerde de correr el comando a mano.

Residuos de datos de prueba (`QA-MIGRACION`, sin impacto en datos reales, sin borrado físico posible por diseño del sistema — quedan en estado terminal anulado/cancelado/inactivo): 1 `Viaje` cancelado, 2 `Liquidacion` anuladas, 2 `Factura` anuladas, 1 `Cobranza` anulada, 1 `AnticipoGasto` anulado, 1 `Chofer` inactivo.

---

## 5. Documentos fuente (con el detalle completo)

- `BLOQUE6.1_AUDITORIA_PRODUCCION.md` — evidencia original del incidente (auditoría en vivo).
- `BLOQUE6.1_DISENO_PRODUCCION.md` — diseño de la corrección de emergencia y de infraestructura relacionada (parcialmente resuelto — ver su propio estado).
- `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` — diagnóstico de causa raíz (las 8 preguntas) y plan seguro de aplicación.
- `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` — checklist operativo de 10 pasos, ejecutado y verificado.

Los 4 documentos fueron actualizados el 2026-07-10 con una sección "Resultado final de ejecución" y un banner de estado al inicio, para que ninguno quede afirmando que la migración sigue pendiente.

---

**No se modificó código, no se generaron migraciones nuevas, no se hizo commit ni push para producir esta acta.**

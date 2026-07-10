# Bloque 6.1 — Diseño Técnico: Corrección de Producción

> **Estado: CERRADO (2026-07-10) en lo referido a la sección 1 (migraciones pendientes).** La acción de emergencia descrita abajo **fue aprobada y ejecutada exitosamente** — ver "Resultado final de ejecución" al final de este documento. Las secciones 2-5 (unificación de Dockerfiles, plan Trial, versión de Postgres, backups periódicos) **siguen como diseño pendiente**, sin cambios de estado.

Fecha: 2026-07-09. Documento de diseño puro — no se modificó código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Responde a `BLOQUE6.1_AUDITORIA_PRODUCCION.md`. **Reemplaza el alcance de verificación de `BLOQUE6_DISENO.md` §2 (6.1)** — aquella sección asumía que la verificación de Railway determinaría un ajuste menor de configuración; la auditoría real encontró algo más grave (migraciones faltantes) y algo más simple de lo temido (no hay ningún Start Command manual escondido). El resto de `BLOQUE6_DISENO.md` (§3-§5: seguridad de infraestructura, `cuentaCorriente()`, resto de infraestructura de despliegue) **sigue vigente sin cambios** y no se repite acá.

---

## 0. Alcance

**En alcance de este documento, en orden de urgencia:**
1. **Acción de emergencia — aplicar las 5 migraciones pendientes contra producción.** Es, con diferencia, el hallazgo más urgente de todo el Bloque 6 — más urgente que cualquier ítem del diseño original.
2. Unificación de Root Directory/Dockerfile del backend, y corrección definitiva del entrypoint.
3. Aviso de negocio: vencimiento del plan Trial de Railway.
4. Nota sobre la discrepancia de versión de Postgres (16 local vs. 18 producción).
5. Backups — mitigación mientras se resuelve si el plan de Railway los soporta.

**Fuera de alcance de este documento (sin cambios, ya cubierto en `BLOQUE6_DISENO.md`):** `JWT_SECRET`/`CORS_ORIGIN` fail-fast, rate-limiting en login, fix de `cuentaCorriente()`.

---

## 1. Acción de emergencia — migraciones pendientes

### 1.1 Por qué es más urgente que el resto del Bloque 6

El código ya desplegado en producción (`f2c9505`) fallaría hoy, en tiempo de ejecución, ante cualquier intento real de: crear o anular una liquidación (falta `LiquidacionMovimiento.anticipoGastoId`), re-liquidar un viaje tras anular su liquidación, re-facturar un viaje tras anular su factura, anular una cobranza individual, o crear/filtrar operaciones contra un chofer/vehículo dado de baja. No es un riesgo a futuro — es una función rota *hoy*, para cualquier usuario que la use desde la interfaz ya desplegada.

### 1.2 Plan de acción propuesto

**Paso 1 — Backup manual preventivo, dado que no existe ninguno.** Antes de tocar el schema, generar un `pg_dump` completo de la base de producción desde la consola SSH de Railway (acción de solo lectura sobre la base, sin riesgo — el resultado se descarga o se guarda fuera de Railway). Dado el volumen actual (5 viajes, 1 liquidación, 4 usuarios, etc.), el dump es instantáneo.

**Paso 2 — Aplicar las 5 migraciones pendientes con `prisma migrate deploy` contra `DATABASE_URL` de producción**, en el orden en que ya existen en el repositorio (el propio Prisma lo garantiza, aplica en orden cronológico por nombre de carpeta):
1. `20260707022545_add_anticipo_gasto_id_and_unique_constraints`
2. `20260707051214_liquidacion_viaje_one_to_many`
3. `20260707161205_loosen_facturaviaje_viajeid_unique`
4. `20260707164246_add_soft_delete_to_cobranza`
5. `20260708011415_add_activo_chofer_vehiculo`

**Paso 3 — Verificación posterior**, repitiendo exactamente las consultas de `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.2 contra producción: confirmar que las 8 columnas nuevas existen, que las 2 constraints únicas relajadas ya no bloquean, y volver a consultar `_prisma_migrations` para confirmar 7 filas aplicadas (no 2).

**Paso 4 — Prueba funcional mínima contra producción real** (no local): crear una liquidación de prueba desde la interfaz desplegada, confirmarla, anularla, y volver a liquidar el mismo viaje — el flujo exacto que hoy fallaría. Limpiar el dato de prueba al finalizar, documentado como parte del cierre.

### 1.3 Riesgo de esta acción

**Bajo**, por varias razones concretas y verificadas (no supuestas):
- Las 5 migraciones son aditivas por diseño (columnas nuevas con default, o relajación de una constraint — nunca `DROP` de datos existentes), consistente con la convención ya establecida en `CONVENCIONES_DESARROLLO.md`.
- El volumen de datos real es mínimo (tabla más grande: 5 filas) — cualquier problema de migración se detecta y revierte en segundos, no en horas.
- Estas mismas 5 migraciones ya se aplicaron exitosamente, más de una vez, contra la base de datos local de desarrollo durante los Bloques 3-5 sin ningún incidente.

**El único riesgo real es la ausencia de backup previo** (mitigado por el Paso 1) y la ausencia de un ambiente de staging idéntico a producción para probar el `migrate deploy` antes (mitigado por el bajo volumen y la naturaleza aditiva de los cambios).

### 1.4 Por qué no se ejecuta directamente en este documento

Aplicar una migración contra la base de datos de producción es una acción con efecto real e inmediato sobre un sistema compartido — excedía el alcance de "auditoría y diseño, sin tocar nada" que este sub-bloque tenía por mandato explícito en el momento de escribir este documento. Se documentó como plan listo para ejecutar apenas se aprobara, no como algo ya hecho. **Esa aprobación llegó después, en `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` y `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md`, y el plan ya fue ejecutado — ver "Resultado final de ejecución" al final de este documento.**

---

## 2. Unificación de Root Directory/Dockerfile del backend

### 2.1 Lo que la auditoría cambia respecto al diseño original

`BLOQUE6_DISENO.md` §5.1 proponía "conservar `backend/Dockerfile` (ya optimizado) y ajustar `railway.json`/el contexto de build" como Alternativa A, condicionada al resultado de la verificación. La verificación (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §1) confirma que Railway usa hoy el Dockerfile de la raíz, con Root Directory vacío — y que el patrón "Root Directory explícito + Dockerfile dentro de esa carpeta" **ya está funcionando correctamente para el frontend** (Root Directory=`frontend`, sin incidentes). Se recomienda replicar exactamente ese mismo patrón, ya validado en este mismo proyecto, en vez de mantener el backend como caso especial con Root Directory vacío.

### 2.2 Alternativas evaluadas

**Alternativa A — Configurar Root Directory=`backend` en el servicio backend de Railway, cambiar el Builder para que use `backend/Dockerfile`, y eliminar el `Dockerfile` de la raíz del repositorio (recomendada).** Ventajas: replica el patrón ya exitoso del frontend (consistencia entre los dos servicios); usa el Dockerfile ya optimizado (`npm install --only=prod`, copia selectiva de `node_modules/.prisma`, ya señalado como preferible en `BACKEND_REVIEW.md` §4); elimina la ambigüedad de tener dos Dockerfiles en el repo. Requiere corregir también el entrypoint dentro de `backend/Dockerfile` (`CMD ["node", "--enable-source-maps", "dist/main.js"]` → `dist/src/main.js`, mismo ajuste que ya se había diseñado en `BLOQUE6_DISENO.md` §2.3).

**Alternativa B — Mantener Root Directory vacío y el Dockerfile de la raíz, solo corrigiendo el entrypoint ahí.** Cambio más chico (una sola línea en un solo archivo), pero conserva la imagen menos optimizada (incluye dependencias de desarrollo en el runtime) y dos Dockerfiles en el repo sin ningún uso real del segundo — perpetúa la confusión que originó esta misma auditoría.

**Recomendación: Alternativa A.** El esfuerzo adicional (configurar Root Directory + actualizar `railway.json`/Builder en el dashboard) es bajo y ya está probado en este mismo proyecto contra el servicio hermano.

### 2.3 Plan de aplicación (orden importa)

1. Corregir el entrypoint en `backend/Dockerfile` (`dist/main.js` → `dist/src/main.js`) — cambio de código, en un commit propio.
2. Una vez mergeado y con el commit disponible en `main`, configurar en el dashboard de Railway: Root Directory=`backend`, Builder confirmado como Dockerfile con path relativo `Dockerfile` (dentro de `backend/`).
3. Verificar que el siguiente deploy automático (o forzado manualmente desde el dashboard) resulte exitoso y el dominio siga respondiendo.
4. Recién confirmado el paso 3, eliminar el `Dockerfile` de la raíz del repositorio (commit separado, de limpieza).

**No se hace en un único paso** — cambiar Root Directory y borrar el Dockerfile de la raíz al mismo tiempo, sin haber confirmado que el nuevo build funciona, dejaría al servicio sin ningún Dockerfile válido si algo saliera mal en el paso 2.

---

## 3. Aviso de negocio — plan Trial de Railway

**No es un hallazgo técnico, es una alerta operativa que corresponde señalar igual.** El dashboard muestra "Quedan 17 días o $4,08" bajo la etiqueta **TRIAL**. Si el plan no se actualiza a uno pago antes de que se agote ese plazo o ese saldo, los 3 servicios (backend, frontend, y la base de datos con todos sus datos) corren riesgo de suspenderse. Esto no depende de ningún código ni migración — es una acción de cuenta/facturación que solo el dueño de la cuenta de Railway puede resolver. Se señala acá porque ninguna auditoría previa de este proyecto lo había registrado, y es, en términos de urgencia de negocio, comparable a la falta de backups (sección 5).

---

## 4. Discrepancia de versión de Postgres (16 local vs. 18 producción)

### 4.1 Alternativas evaluadas

**Alternativa A — Alinear `docker-compose.yml` a `postgres:18-alpine`, replicando la versión real de producción (recomendada).** Cambio de una línea, sin riesgo — el desarrollo local pasaría a usar exactamente la misma versión mayor que producción, reduciendo la posibilidad de que una diferencia de comportamiento entre Postgres 16 y 18 se descubra primero en producción.

**Alternativa B — Dejar `docker-compose.yml` como está, documentar la diferencia como conocida.** Menor esfuerzo inmediato, pero mantiene la asimetría — cualquier característica específica de Postgres 18 (o cambio de comportamiento entre versiones) no se probaría nunca en desarrollo local antes de llegar a producción.

**Recomendación: Alternativa A**, por ser de esfuerzo mínimo y beneficio directo en paridad de entornos — puede incluirse en el mismo commit que la sección 2 (infraestructura), no necesita ser su propia entrega.

---

## 5. Backups — mitigación mientras se resuelve el plan

### 5.1 Lo que la auditoría no pudo determinar

`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §9 no pudo confirmar si la ausencia de backups visibles se debe a una limitación del plan Trial o a que simplemente nunca se configuró uno. Esa distinción importa para decidir la solución de fondo (upgrade de plan vs. configuración pendiente) pero no cambia la urgencia de la mitigación mientras tanto.

### 5.2 Mitigación propuesta, no condicionada a resolver esa duda

Independientemente de la causa, un backup manual periódico (`pg_dump` vía la consola SSH ya usada en la sección 1, guardado fuera de Railway) es una mitigación de esfuerzo mínimo que no depende de ningún cambio de plan. **Se recomienda como acción inmediata**, en paralelo al backup puntual del Paso 1 de la sección 1 — no reemplaza una solución de backups automatizados real (que sigue siendo parte de `BLOQUE6_DISENO.md` §5.3, sin cambios), pero cierra la ventana de riesgo mientras esa decisión de plan se toma.

---

## 6. Migraciones necesarias (de este documento en sí, no las ya pendientes)

**Ninguna migración nueva.** La sección 1 aplica migraciones que **ya existen** en el repositorio, generadas y aprobadas en rondas anteriores — no se diseña ninguna migración nueva en este documento. Las secciones 2-5 son configuración de infraestructura y un ajuste de una línea en `docker-compose.yml`, sin impacto de schema.

---

## 7. Impacto en frontend

**Ninguno directo.** Una vez aplicadas las migraciones (sección 1), las funcionalidades de los Bloques 3-5.2 empezarían a funcionar correctamente sin ningún cambio de código en el frontend — el frontend ya está preparado para ellas desde que se desplegó.

---

## 8. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Aplicar las 5 migraciones pendientes revela un problema no anticipado (ej. algún dato existente incompatible con una nueva constraint). | Baja (dado el volumen mínimo de datos verificado) | Backup previo (§1.2 Paso 1); las mismas migraciones ya se probaron exitosamente en desarrollo múltiples veces. |
| 2 | Cambiar Root Directory del backend en Railway (sección 2) causa una ventana de downtime si el nuevo build falla. | Baja-media | Plan de aplicación en 4 pasos secuenciales (§2.3), sin borrar el Dockerfile de la raíz hasta confirmar que el nuevo build funciona — permite revertir el Root Directory sin perder la configuración anterior. |
| 3 | El plan Trial de Railway vence antes de resolver esto. | Alta si no se atiende | Es una decisión de cuenta, ajena a este diseño — señalada con la urgencia que corresponde en la sección 3. |
| 4 | Backup manual vía `pg_dump` desde la consola queda en la máquina de quien lo ejecuta, sin ninguna política de retención. | Media | Mitigación temporal reconocida como tal (§5.2) — no reemplaza una solución de backups automatizados real. |

---

## 9. Plan de rollback

- **Migraciones (sección 1):** el propio Prisma soporta revertir vía `prisma migrate resolve` si una migración falla a mitad de camino; el backup del Paso 1 cubre cualquier escenario que ese mecanismo no resuelva. Ninguna de las 5 migraciones borra datos existentes.
- **Root Directory/Dockerfile (sección 2):** revertir el Root Directory a vacío en el dashboard de Railway es instantáneo y no destructivo, siempre que el Dockerfile de la raíz no se haya borrado todavía (por eso el orden de la sección 2.3).
- **`docker-compose.yml` (sección 4):** revertir a `postgres:16-alpine` es un cambio de una línea, sin pérdida de datos (afecta solo al entorno de desarrollo local).

---

## 10. Puntos de decisión pendientes para tu aprobación

1. **¿Autorizás aplicar las 5 migraciones pendientes contra producción (sección 1), con el backup manual previo como primer paso?** Es, con diferencia, la decisión más urgente de este documento — cada día que pasa sin resolverlo es un día en que las funcionalidades de los Bloques 3 a 5.2 pueden fallar en el primer uso real.
2. **¿Aprobás migrar el backend al patrón Root Directory=`backend` + `backend/Dockerfile` (Alternativa A de la sección 2), o preferís la corrección mínima (Alternativa B)?**
3. **¿Quién atiende la renovación del plan Trial de Railway (sección 3)?** No es una decisión técnica — solo señalo la urgencia.
4. **¿Alineamos `docker-compose.yml` a Postgres 18 (sección 4)?**
5. **¿Confirmás el backup manual periódico como mitigación temporal (sección 5) mientras se resuelve si el plan de Railway soporta backups automáticos?**

No se implementó nada de este diseño al momento de escribirlo — quedaba a la espera de revisión. **Actualización de cierre (2026-07-10): el punto 1 fue aprobado y ejecutado (ver "Resultado final de ejecución" abajo); los puntos 2-5 siguen sin resolver.**

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. El punto de decisión 1 de la sección 10 (aplicar las 5 migraciones pendientes) **fue aprobado y ejecutado** — vía `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` (diagnóstico de causa raíz) y `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` (procedimiento paso a paso), con aprobación explícita en cada etapa. Los puntos de decisión 2-5 (unificación de Dockerfiles, plan Trial, versión de Postgres, backups periódicos) **siguen sin resolver**, fuera del alcance de esta ejecución.

- **Backup:** generado correctamente antes de aplicar nada, tal como exigía el Paso 1 de la sección 1.2 — con `pg_dump` de versión 18.4 (igual a la del servidor, corrido dentro del propio contenedor de Postgres en Railway), 59.642 bytes, verificado legible/listable.
- **Migraciones aplicadas correctamente:** las 5 listadas en el Paso 2 de la sección 1.2, con `prisma migrate deploy` corrido contra producción desde el commit `f2c9505`. Sin errores.
- **Verificación estructural:** **PASS**, repitiendo las consultas del Paso 3 de la sección 1.2 (7 filas en `_prisma_migrations`, columnas y constraints como se esperaba).
- **Pruebas funcionales en producción:** **PASS** — el Paso 4 de la sección 1.2 (crear/confirmar/anular/re-liquidar) y su equivalente para facturación/cobranzas se ejecutaron con datos de prueba prefijados `QA-MIGRACION`, sin errores, con limpieza posterior.
- **Logs:** sin errores durante la ejecución.
- **Residuos no reversibles (QA-MIGRACION):** 1 `Viaje` cancelado, 2 `Liquidacion` anuladas, 2 `Factura` anuladas, 1 `Cobranza` anulada, 1 `AnticipoGasto` anulado, 1 `Chofer` inactivo — consecuencia esperada de que el sistema no tiene borrado físico, sin impacto en datos reales.
- **Riesgo pendiente:** el riesgo #5 de la tabla de la sección 8 de este mismo documento ("el contenedor no ejecuta `migrate deploy` en su arranque") **sigue sin mitigarse** — la sección 2 de este documento (unificación de Dockerfiles) seguía pendiente de aprobación y no se implementó como parte de esta ejecución. Automatizar `prisma migrate deploy` en el pipeline sigue siendo necesario para que esta situación no se repita con la próxima migración nueva.

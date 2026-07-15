# Acta de Cierre — Bloque 10.2: Identidad compartida de Chofer

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`). Fecha de apertura: 2026-07-15. Segundo sub-bloque de la implementación de Grupo Económico, siguiendo `docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` sobre la base ya cerrada de Bloque 10.1. **Esta versión del acta incorpora la corrección posterior a una auditoría técnica independiente** que encontró tres hallazgos antes de la primera aprobación — ninguno de los cuales había sido detectado por la validación original.

---

## 1. Revisión previa a la migración: ¿la identidad necesita guardar DNI/CUIL?

Sin cambios respecto de la primera versión de este documento: `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 10, especifica para `IdentidadChoferGrupo` únicamente "nombre de referencia" — no DNI/CUIL. No se agregó ese campo. El DNI/CUIL de cada persona ya existe, por organización, en cada `Chofer` vinculado.

## 2. Modelo

Sin cambios estructurales respecto de la primera versión: `IdentidadChoferGrupo` (`id`, `grupoEconomicoId`, `nombreReferencia`, `createdAt`, `creadoPorId`), `Chofer.identidadChoferGrupoId` opcional.

## 3. Backend

Mismos 6 endpoints que la primera versión (`GET/POST /grupo-economico/choferes/...`), mismos roles, mismo criterio de aislamiento manual. La lógica interna de tres de ellos (`crear`, `vincular`, `desvincular`) cambió — ver sección 5.

---

## 4. Auditoría técnica independiente — los tres hallazgos

Una revisión adversarial completa, encargada expresamente antes de aprobar el cierre, encontró:

### Hallazgo 1 (importante) — Condición de carrera en `crear()` y `vincular()`

El chequeo de "¿este chofer ya está vinculado?" se hacía con un `findFirst` **antes** de la transacción, y la escritura dentro de la transacción era un `update` incondicional. Dos solicitudes casi simultáneas para el mismo chofer podían pasar ambas el chequeo antes de que cualquiera escribiera — resultando en una `IdentidadChoferGrupo` huérfana (en `crear()`) o en un vínculo sobrescrito en silencio (en `vincular()`). Contradecía directamente la regla explícita "no crear identidades huérfanas".

### Hallazgo 2 (importante) — `creadoPorId` sin relación real a `Usuario`

A diferencia de todo otro campo "quién hizo esto" del schema, `IdentidadChoferGrupo.creadoPorId` era un `String?` suelto, sin integridad referencial a nivel de base de datos.

### Hallazgo 3 (menor) — `desvincular()` no validaba el grupo de la identidad

A diferencia de `detalle()` y `vincular()`, `desvincular()` no confirmaba que la identidad en la URL perteneciera al grupo del actor antes de operar — no era explotable, pero era una inconsistencia de patrón entre métodos del mismo controller.

También se marcó, sin clasificarla como problema, la desviación ya documentada del flujo unilateral respecto del texto original del diseño — ver sección 7.

---

## 5. Correcciones aplicadas

### Hallazgo 1 — corregido

En `crear()` y `vincular()`, la escritura ahora usa `updateMany({ where: { id: chofer.id, identidadChoferGrupoId: null }, data: {...} })` **dentro de la misma transacción**, verificando que `count === 1`. Si `count === 0` (otra operación concurrente ganó la carrera), se lanza una excepción dentro del callback de la transacción — Prisma revierte automáticamente todo lo demás ejecutado en ese mismo callback, incluida la creación de la identidad en `crear()`, así que nunca queda una identidad huérfana persistida ni un `AuditLog` parcial. Mismo patrón que ya usa `LiquidacionesController.create()` para viajes y anticipos. El chequeo previo a la transacción se conservó, pero pasó a ser puramente informativo (mejora el mensaje en el caso común) — la garantía real es exclusivamente el `updateMany` condicional.

Se extendió, por consistencia y sin ampliar el alcance funcional, el mismo patrón atómico a `desvincular()`.

### Hallazgo 2 — resuelto sin migración

Evaluadas explícitamente las dos alternativas:

- **(A) Relación real a `Usuario.id`**: habría sido el primer lugar del schema con una relación directa entre una entidad de grupo y un `Usuario` de cualquiera de las organizaciones del grupo, sin ningún control de acceso multiempresa (todavía inexistente) — riesgo de exposición si alguna vez se agrega un `include`.
- **(B) Mantenerlo como `String?` deliberado**: el dato de "quién" ya queda capturado con integridad completa y correctamente aislado por organización en `AuditLog.usuarioId` del evento `identidad_chofer_creada` — no hay vacío de trazabilidad real.

**Se eligió (B).** Documentado explícitamente en el schema (comentario extenso sobre el campo, explicando ambas alternativas y por qué se descartó la A) y acá: es una excepción deliberada, no una omisión. **No se generó ninguna migración** — el cambio es un comentario, confirmado con `prisma migrate dev --create-only`, que produjo una migración vacía (`-- This is an empty migration.`), descartada sin aplicar.

### Hallazgo 3 — corregido

`desvincular()` ahora empieza con el mismo `findFirst({ where: { id, grupoEconomicoId } })` que ya usan `detalle()` y `vincular()` — responde `404` sin revelar identidades de otros grupos, antes de llegar a comparar contra el chofer.

---

## 6. Prueba de concurrencia real

No bastaba con demostrarlo en teoría — se ejecutó contra el servidor real, en desarrollo:

**Sobre `crear()`:** 8 solicitudes disparadas verdaderamente en paralelo (`Promise.all` desde el mismo proceso Node, no procesos `curl` separados — para forzar el solapamiento real) contra el mismo chofer sin vincular. Resultado: **exactamente 1 de 8 exitosa**, las otras 7 fallidas. Crucialmente, 4 de las 7 fallidas mostraron el mensaje de la ruta atómica ("otra operación en curso — la creación no se aplicó"), confirmando que efectivamente entraron a la transacción, crearon su propia identidad, y fueron revertidas — no que la carrera nunca haya ocurrido. Verificado después: exactamente 1 `IdentidadChoferGrupo` creada (no 8), 0 identidades huérfanas en toda la base, `AuditLog` con exactamente 1 entrada de `identidad_chofer_creada` (no 8) y exactamente 1 `chofer_vinculado_a_identidad_grupo` nueva — cero eventos parciales de las solicitudes fallidas.

**Sobre `vincular()`:** 8 solicitudes en paralelo contra el mismo chofer sin vincular, apuntando a la misma identidad ya existente. Resultado: **exactamente 1 de 8 exitosa**; las 7 restantes, todas por la ruta atómica (mensaje "otra operación en curso"). El estado final fue determinístico — el chofer quedó vinculado exactamente una vez, sin ninguna sobrescritura silenciosa.

Todos los datos temporales de estas pruebas (choferes de prueba desvinculados, identidades temporales eliminadas) se limpiaron al finalizar — el estado final de desarrollo quedó acotado al caso real (Carlos Gómez, ambas organizaciones).

---

## 7. Aclaración sobre el flujo unilateral (desviación respecto del diseño original)

Se mantiene, sin cambios, el flujo ya implementado: cada Administrador vincula el chofer de su propia organización mediante una acción separada; la identidad compartida se completa con dos (o más) acciones independientes, nunca con una sola acción cruzada entre organizaciones. **Esto es una adaptación necesaria al orden aprobado de sub-bloques**, no una interpretación libre del diseño: `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 12, describía originalmente `POST .../choferes/vincular` como una única acción capaz de vincular choferes de dos organizaciones distintas en el mismo llamado — algo que exige que quien la ejecuta tenga acceso a ambas organizaciones a la vez, es decir, exige el acceso multiempresa de Bloque 10.3. Como este mismo bloque prohibió explícitamente implementar ese acceso, la única forma de entregar la capacidad de vincular sin violar esa restricción fue dividirla en acciones unilaterales, cada una ejecutada por el Administrador de su propia organización.

El flujo cruzado en una sola acción, si sigue siendo necesario una vez que exista acceso multiempresa, queda reservado para una etapa posterior — no se decide ni se descarta acá.

---

## 8. Reglas obligatorias — verificadas una por una (actualizado)

- **Una identidad pertenece a un único grupo económico**: estructural, sin cambios.
- **Un chofer pertenece, como máximo, a una identidad compartida**: estructural, y ahora además protegido atómicamente ante concurrencia real (sección 5/6) — antes solo estaba protegido en el caso no concurrente.
- **Todos los choferes vinculados pertenecen a organizaciones del mismo grupo**: sin cambios, verificado por construcción.
- **No puede vincularse un chofer de una organización sin grupo**: sin cambios.
- **No puede vincularse un chofer de otro grupo económico**: sin cambios, verificado en vivo con datos temporales.
- **No se infiere ni se crea el vínculo automáticamente por nombre**: sin cambios.
- **No se fusionan datos organizacionales**: sin cambios.
- **No se eliminan duplicados físicos de Chofer**: sin cambios.
- **La relación es reversible**: sin cambios, y ahora la propia desvinculación también está protegida atómicamente (Hallazgo 1, extendido a `desvincular()`).
- **No se crean identidades huérfanas**: **ahora verificado bajo concurrencia real, no solo en el caso secuencial** (sección 6) — la garantía original no cubría esto, es la corrección central de este cierre.

## 9. Validación (regresión completa tras la corrección)

Repetidos y confirmados, además de las pruebas de concurrencia de la sección 6: los 16 puntos originales de validación (crear, vincular ambas organizaciones, datos intactos, bloqueo de doble vinculación, bloqueo cross-grupo, desvincular/re-vincular, `AuditLog` aislado por organización, aislamiento normal intacto, listados existentes sin cambios, regresión de `/organizacion`/`/viajes`/`/liquidaciones`/`/choferes`/`/grupo-economico`, build backend y frontend limpios, `prisma validate`/`generate` limpios, logs sin secretos). Conteos finales sin cambio respecto de antes de la corrección: 4 choferes, 15 viajes, 13 usuarios, 2 organizaciones, 1 grupo económico, 1 identidad (0 huérfanas), 2 choferes vinculados.

## 10. Migración

**Ninguna migración nueva.** La corrección completa (los tres hallazgos) se resolvió íntegramente en código y en un comentario de schema — confirmado que no había ningún cambio de estructura pendiente (`prisma migrate dev --create-only` generó una migración vacía, descartada). Sigue vigente, sin cambios, `20260715202107_identidad_chofer_grupo` (la migración original de 10.2).

## 11. Producción

- Commit de corrección: **`133f8f7`** — "fix(group-economic): make driver identity linking atomic".
- Deploy automático, sin migraciones pendientes (`No pending migrations to apply`, confirmado en logs — coherente con que la corrección no tocó el schema estructuralmente).
- `GET /api/v1/health` → `200`.
- Rutas nuevas siguen exigiendo autenticación (`401` sin token), igual que las existentes.
- Sin errores en los logs del deploy.
- **No se creó ni se vinculó ninguna identidad de chofer real en producción.**

## 12. Rollback

Sin cambios respecto de la primera versión — ninguna migración nueva que revertir. El propio commit de corrección es reversible como cualquier otro (revertir el commit deja el código en el estado previamente auditado, con el problema conocido, no en un estado roto).

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Sin cambios: acceso multiempresa de usuarios; cambio de organización activa; selector de organización; pagos consolidados; cambios en `Liquidacion`; cambios en el JWT; cambios en `ORGANIZACION_PRISMA`; frontend; Transportistas o Vehículos compartidos.

---

**Commits de este sub-bloque:** `fa0a01f` (implementación original) y `133f8f7` (corrección post-auditoría). Este documento, una vez aprobado, se commitea por separado.

No se abre Bloque 10.3. Detenido a la espera de tu aprobación explícita de esta acta corregida.

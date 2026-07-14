# Diseño Técnico — Bloque 3: Integridad de Datos y Migraciones de Schema

Fecha: 2026-07-06. Documento de diseño puro — no se modificó `schema.prisma`, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Continúa el roadmap de `ROADMAP_SDC_V1.md` (Bloque 1 y Bloque 2 ya cerrados: control de acceso en Anticipos y capa de DTOs/ExceptionFilter respectivamente). Este documento cubre el Bloque 3 tal como está definido ahí: P0.1 (`anticipoGastoId`), P2.3 (constraints únicas pendientes) y P1.4 (`Chofer.comisionPct`).

Queda pendiente de aprobación explícita antes de escribir cualquier migración o tocar código.

---

## 0. Alcance y una advertencia encontrada durante el diseño

**En alcance** (pedido explícito):
1. `anticipoGastoId` en `LiquidacionMovimiento`.
2. Constraints únicas pendientes: `Productor.cuit`, `Chofer.dni`, `Ubicacion.nombre`.
3. Uso correcto de `Chofer.comisionPct` en el flujo de liquidación.
4. Estrategia de migración, backfill, riesgos, plan de pruebas, plan de rollback.

**Explícitamente fuera de alcance de este documento** (aunque P2.3 en el roadmap los menciona junto a las constraints únicas): unificación de `EstadoFacturaEnum`/`EstadoFacturacionEnum`, y reemplazo de la clasificación de anticipos por texto (`esAdelanto`/`categorizarAnticipo`) por un campo explícito en `TipoGasto`. Ninguno de los dos requiere tocar `LiquidacionMovimiento`, `Chofer` ni las 3 constraints pedidas, así que no los fuerzo a entrar acá — si querés incluirlos, son un documento de diseño aparte, más corto.

**Hallazgo nuevo, no documentado en `QA_FINDINGS.md`, que condiciona el diseño del punto 1:** al auditar `LiquidacionesController.anular()` para diseñar la corrección de `anticipoGastoId`, encontré que `anular()` nunca borra ni marca las filas de `LiquidacionViaje` de la liquidación anulada — solo cambia `Liquidacion.estado` y revierte `Viaje.estadoLiquidacion` a `PENDIENTE`. Como `LiquidacionViaje.viajeId` es `@unique` **a nivel de tabla completa**, si ese mismo viaje se vuelve a incluir en una liquidación nueva (algo que el propio sistema permite, porque `estadoLiquidacion` ya volvió a `PENDIENTE`), el `INSERT` de la nueva fila `LiquidacionViaje` choca con la fila vieja (todavía viva, apuntando a la liquidación anulada) y la transacción falla con `P2002`. **En la práctica: hoy, un viaje cuya liquidación fue anulada no se puede volver a liquidar nunca — cada intento tira un error.** Es la misma clase de bug que motiva agregar `anticipoGastoId` (una unique constraint "de por vida" sobre una entidad que en realidad debería poder reutilizarse después de una anulación), pero ya existe, sin corregir, del lado de `LiquidacionViaje`. Lo trato en la sección 5 (Riesgos) como punto de decisión explícito, porque si diseño `anticipoGastoId` con una unique constraint "ingenua" (sin scope), voy a introducir el mismo bug de nuevo del lado de Anticipos.

---

## 1. `anticipoGastoId` en `LiquidacionMovimiento`

### Estado actual

`LiquidacionMovimiento` guarda una copia desnormalizada de los campos de un `AnticipoGasto` (`viajeId`, `tipoGastoId`, `importe`, `fecha`, `observacion`, `comprobanteUrl`) en el momento de crear la liquidación (`create()`, líneas 396-409), pero **no guarda el `id` del `AnticipoGasto` de origen**. `anular()` (líneas 469-478) reconstruye qué anticipos revertir agrupando por `viajeId` — impreciso cuando un viaje tiene 2+ anticipos repartidos en liquidaciones distintas, y no revierte nunca los anticipos generales sin `viajeId` (gastos no asociados a un viaje puntual, que hoy quedan huérfanos en cualquier `anular()`).

### Decisión de diseño: dos opciones

**Opción A — FK simple, sin unique constraint.**
Agregar `anticipoGastoId String?` + relación a `AnticipoGasto`, con un `@@index([anticipoGastoId])` (no único). `anular()` revierte `liquidado: false` filtrando por `id: { in: movimientos.map(m => m.anticipoGastoId).filter(Boolean) } }` en vez de por `viajeId`. Esto **resuelve por completo el bug de contaminación cruzada** (causa raíz de P0.1 en su forma de "anular"), incluyendo el caso de anticipos generales sin `viajeId`, que hoy `anular()` ignora.
Para la concurrencia (dos liquidaciones creadas casi al mismo tiempo descontando el mismo anticipo), la protección no viene de una constraint sino de que el `update` de `AnticipoGasto.liquidado` dentro del `create()` se haga como una actualización condicionada (`where: { id, liquidado: false }`, verificando que afectó exactamente 1 fila) en vez de un `update` incondicional por `id`. Postgres serializa el acceso a esa fila dentro de la transacción: la segunda transacción concurrente queda bloqueada hasta que la primera confirma, y al reintentar su condición ya no matchea (`liquidado` ya es `true`), así que afecta 0 filas y la transacción aborta con un mensaje de negocio claro. No depende de ninguna constraint de esquema.

**Opción B — FK con unique constraint parcial (recomendada).**
Igual que A, más: agregar una columna `revertida Boolean @default(false)` en `LiquidacionMovimiento`, seteada a `true` dentro de la misma transacción de `anular()`. Sobre esa base, un índice único parcial en Postgres (`anticipoGastoId` único solo entre filas con `revertida = false`) impide a nivel de base — no solo de código de aplicación — que el mismo anticipo esté activo en dos liquidaciones simultáneamente, y evita el problema descrito en la sección 0 (una vez anulada, la fila deja de "ocupar" el `anticipoGastoId`, liberándolo para una liquidación futura). Esto es exactamente el patrón que **falta** hoy en `LiquidacionViaje.viajeId` y que causa el bug de la sección 0.

Prisma no expresa índices parciales en el DSL de `schema.prisma` (no hay sintaxis para `WHERE` en `@@unique`/`@@index`); se logra escribiendo el `CREATE UNIQUE INDEX ... WHERE ...` a mano en el archivo `migration.sql` generado (patrón estándar y documentado de Prisma para constraints no representables en el schema — no rompe `prisma migrate deploy`, solo hace que `prisma db pull`/`format` no lo regeneren solos si algún día se re-introspecciona la base).

**Recomendación:** Opción B. El motivo no es solo teórico: este sistema ya tuvo dos bugs reales de la misma familia (`anular()` de liquidaciones contaminando anticipos ajenos, ya corregido parcialmente el 2026-07-03; y el bug de `LiquidacionViaje` recién encontrado, sin corregir). Confiar de nuevo en que el código de aplicación sea siempre disciplinado sobre esta regla es la misma apuesta que ya falló dos veces. La constraint de base es más barata de mantener que otra ronda de auditoría.

**Punto de decisión para vos:** la Opción B, para ser consistente, sugiere aplicar el mismo patrón (`revertida`/índice parcial) también a `LiquidacionViaje.viajeId`, ya que es la misma clase de bug y esta ventana de migración (Bloque 3) es el momento natural para resolver ambos juntos sin abrir una segunda ventana. Esto **no estaba en tu lista de alcance** — lo dejo como pregunta abierta en vez de incluirlo por mi cuenta: ¿lo sumamos a este mismo bloque, o preferís tratarlo como un hallazgo aparte (P0 nuevo) para decidir por separado?

### Reescritura de lógica (sin código, a nivel de comportamiento)

- `create()`: al crear cada `LiquidacionMovimiento` desde un `AnticipoGasto`, persistir `anticipoGastoId: a.id`. El `update` de `anticipoGasto.liquidado = true` pasa a ser condicionado (`where: { id: a.id, liquidado: false }`) y se verifica que afectó 1 fila; si afectó 0, abortar la transacción completa con un mensaje "uno de los anticipos ya fue liquidado por otra operación" (409, no 500).
- `anular()`: revertir `AnticipoGasto.liquidado = false` filtrando por `id: { in: [...anticipoGastoId de los movimientos] }` en vez de por `viajeId`. Si se adopta la Opción B, además marcar `revertida = true` en esos `LiquidacionMovimiento`.
- Movimientos **históricos** (creados antes de esta migración) no tienen `anticipoGastoId` — ver backfill (sección 3). `anular()` necesita una rama de compatibilidad para esas filas viejas mientras existan (ver sección 3).
- Nota positiva: los `P2002` que puedan surgir de la constraint nueva (si se elige Opción B) ya caen en el `PrismaExceptionFilter` global agregado en el Bloque 2 (`backend/src/common/filters/prisma-exception.filter.ts`) — solo hace falta agregar una entrada legible para el campo en el mapa `CAMPO_LEGIBLE` (hoy no tiene `anticipoGastoId`, `dni`, ni una entrada específica para `nombre+localidad`). Es un cambio de una línea, lo señalo para no perderlo de vista en la implementación, no requiere diseño adicional.

---

## 2. Constraints únicas pendientes

Los 3 campos señalados en `QA_FINDINGS.md`/`QA_INFORME_FINAL.md` (P2.3):

| Campo | Tipo actual | Constraint propuesta | Complejidad |
|---|---|---|---|
| `Productor.cuit` | `String?` (sin unique) | `@unique` simple | Baja — Postgres ya excluye múltiples `NULL` de un unique index por diseño, así que productores sin CUIT cargado no chocan entre sí. |
| `Chofer.dni` | `String?` (sin unique) | `@unique` simple | Baja — mismo razonamiento que `cuit`: los `NULL` no colisionan. |
| `Ubicacion.nombre` | `String` (sin unique) | Única **compuesta o por expresión**, no simple | Media — ver detalle abajo. |

### Por qué `Ubicacion` es distinta

La recomendación original de QA era una constraint compuesta `(nombre, localidad)`. Pero `localidad` es `String?` — y en un unique compuesto, Postgres trata cada fila con `localidad IS NULL` como distinta de cualquier otra (igual razonamiento que arriba), lo que significa que dos ubicaciones "Puerto San Martín" con `localidad` vacío en ambas **no quedarían bloqueadas** — justamente el caso más probable de duplicado real (alguien carga el mismo lugar dos veces sin llenar el campo opcional).

Para cerrar ese hueco, la constraint debe ser sobre una expresión que normalice el `NULL` a un valor comparable (`COALESCE(localidad, '')`) en vez de sobre las columnas crudas. Igual que el índice parcial de la sección 1, esto se escribe a mano en el `migration.sql` (índice único por expresión, no representable en el DSL de `schema.prisma`).

Alternativa más simple si se prefiere evitar SQL a mano acá: hacer `localidad` obligatorio (`String` con un default, ej. `""` o `"Sin especificar"`) vía backfill, y entonces sí alcanza con un `@@unique([nombre, localidad])` declarado en el schema normalmente. Cambia la semántica del campo (deja de distinguir "no cargado" de "cargado como vacío"), pero simplifica la migración. Lo dejo como opción B más liviana si preferís no meter SQL manual en esta parte.

**Recomendación:** índice por expresión (`COALESCE`), sin tocar la nulabilidad de `localidad` — es más fiel al dato real y ya vamos a necesitar SQL manual para el punto 1 (Opción B), así que no es una técnica nueva que se introduce solo para esto.

---

## 3. Uso correcto de `Chofer.comisionPct`

**Esta parte no requiere ninguna migración de schema.** La columna ya existe (migración `20260702171557_add_comision_pct_to_chofer`) y ya se puebla desde `ChoferesController`. El defecto es puramente de lógica de aplicación en `LiquidacionesController.create()`, que hoy toma `comisionPct` del body sin mirar el dato maestro del chofer.

Diseño propuesto:
- En `create()`, cuando `tipo === "CHOFER"`, buscar el `Chofer` (hoy no se busca en absoluto — solo se usa `choferId` para filtrar viajes/anticipos). Usar `chofer.comisionPct` como valor por defecto si el body no manda `comisionPct` explícito.
- Si el body sí manda un `comisionPct` que difiere del valor maestro del chofer, **permitir el override** (hay casos de negocio legítimos para una comisión puntual distinta), pero dejar rastro: un registro en `AuditLog` (modelo ya existente, genérico — no requiere cambios de schema) con `entidad: "Liquidacion"`, `accion: "comisionPct_override"`, `datosAnteriores: { comisionPctChofer }`, `datosNuevos: { comisionPctUsado }`. Esto da trazabilidad sin bloquear al usuario ni inventar un campo nuevo.
- Para `tipo === "TRANSPORTISTA"` no hay campo maestro equivalente (`Transportista` no tiene `comisionPct`) — el comportamiento actual (tipear el valor a mano) queda igual. Es consistente con el hallazgo original de QA, que es específico de choferes; no lo extiendo por mi cuenta.

---

## 4. Estrategia de migración

1. **Una sola ventana de mantenimiento, varias migraciones secuenciales dentro de ella** (no un único archivo gigante): separar en 3 migraciones Prisma independientes — (a) `anticipoGastoId` + índice(s) relacionados, (b) constraints únicas de Catálogos, (c) si se decide incluir el fix de `LiquidacionViaje` (sección 0), una tercera. Migraciones separadas permiten que si una falla (por ejemplo, la de constraints únicas por datos duplicados existentes), las otras ya aplicadas no se pierdan ni haya que revertir todo el bloque.
2. **Orden de aplicación:** primero las que no dependen de auditoría de datos (`anticipoGastoId`, que es aditiva y no puede fallar por datos existentes ya que la columna nace `NULL`), después las que sí dependen de que no haya duplicados (constraints únicas de Catálogos) — para no bloquear lo fácil esperando la auditoría de lo difícil.
3. **Generación:** `prisma migrate dev --create-only` para cada una (nunca `migrate dev` directo, que auto-aplica) — permite editar el SQL generado a mano antes de aplicarlo (necesario para los índices parciales/por expresión de las secciones 1 y 2).
4. **Entornos:** aplicar primero contra una copia de la base de producción restaurada en local/staging (no contra un schema vacío de desarrollo — las constraints únicas son exactamente el tipo de migración que pasa en un schema limpio y falla en producción real por datos existentes). Confirmar `prisma migrate deploy` limpio ahí antes de tocar producción.
5. **Despliegue a producción:** dado que `ROADMAP_SDC_V1.md` ya señaló que hoy no hay `prisma migrate deploy` automatizado en el pipeline (hallazgo de infraestructura, Bloque de deploy, no de este Bloque 3), esta migración se aplicaría manualmente contra Railway como se vino haciendo hasta ahora — no es parte de este documento resolver la automatización del pipeline, pero si se resuelve antes, mejor.
6. **Ventana de corte:** aunque `anticipoGastoId` es aditiva y no requiere downtime, las constraints únicas si encuentran duplicados **fallan la migración completa** (Postgres no aplica un `CREATE UNIQUE INDEX` con violaciones existentes) — por eso el backfill/auditoría de la sección 5 debe completarse *antes* de correr esa migración específica, no durante.

---

## 5. Backfill de datos existentes

### `anticipoGastoId` (filas históricas de `LiquidacionMovimiento`)

No existe una forma 100% confiable de reconstruir el `anticipoGastoId` de una fila creada antes de esta migración: los campos copiados (`viajeId`, `tipoGastoId`, `importe`, `fecha`) no son necesariamente únicos — dos anticipos distintos podrían compartir esa combinación exacta. Inventar un `anticipoGastoId` con un match ambiguo sería peor que dejarlo vacío (corrompería silenciosamente el historial).

Backfill propuesto, conservador:
1. Para cada `LiquidacionMovimiento` sin `anticipoGastoId`, buscar `AnticipoGasto` candidatos que matcheen exactamente `(viajeId, tipoGastoId, importe, fecha)` **y** que ya estén `liquidado: true` (condición necesaria si de verdad fueron los que originaron ese movimiento).
2. Si hay **exactamente un** candidato → vincular automáticamente (`anticipoGastoId = candidato.id`). Es el caso esperado para la enorme mayoría de filas, dado el volumen bajo actual del sistema (recién reincorporado, sin piloto real iniciado según `QA_INFORME_FINAL.md`).
3. Si hay **cero o más de un** candidato → dejar `anticipoGastoId = NULL` y listar la fila en un reporte para revisión manual (no bloquea la migración, `anticipoGastoId` es nullable).
4. Antes de escribir este script, correr un conteo simple (`SELECT COUNT(*) FROM "LiquidacionMovimiento"`) para dimensionar el esfuerzo real — dado que los módulos se reincorporaron recientemente, es razonable esperar que sea un número chico o incluso cero.
5. **Transición en `anular()`:** mientras existan filas con `anticipoGastoId = NULL` (sea por el backfill ambiguo o porque quedaron sin resolver), `anular()` necesita una rama de compatibilidad: para esas filas puntuales, mantener el comportamiento viejo (revertir por `viajeId`) con un `console.warn`/log explícito de que se usó la ruta legacy, para poder auditar cuánto se usa y decidir cuándo eliminarla. Para las filas con `anticipoGastoId` ya seteado (todas las nuevas, y las del backfill inequívoco), usar siempre la ruta nueva y precisa.

### Constraints únicas de Catálogos

1. **Auditoría previa (solo lectura, antes de escribir la migración):** correr consultas de detección de duplicados agrupando por `cuit` (Productor), `dni` (Chofer), y `(nombre, COALESCE(localidad,''))` (Ubicacion), filtrando grupos con más de 1 fila y excluyendo valores vacíos/nulos.
2. **Triage manual de lo que aparezca:** son identificadores de personas/lugares reales — no corresponde resolver duplicados por una regla automática ciega (ej. "quedate con el primero, borrá el resto" podría borrar el registro correcto). Se revisa cada grupo encontrado y se decide: fusionar, corregir un typo, o dejar uno de los dos valores en `NULL` si de verdad son dos entidades distintas que cargaron mal el dato.
3. **Expectativa de volumen:** dado que estos catálogos (`Productor`, `Chofer`, `Ubicacion`) son de carga manual y el sistema tiene poco tiempo en producción real, es razonable esperar 0 o pocos duplicados — pero la migración no debe escribirse ni aplicarse sin haber corrido el paso 1 primero, sea cual sea la expectativa.
4. Si el paso 1 devuelve resultados, ese triage es un paso manual que **bloquea** la migración de constraints únicas hasta resolverse — no se automatiza en este diseño.

### `Chofer.comisionPct`

No aplica — la columna ya existe y ya está poblada (con `@default(0)` para choferes que no la tengan cargada explícitamente). El "backfill" acá es de comportamiento de aplicación (sección 3), no de datos.

---

## 6. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | **El bug de `LiquidacionViaje.viajeId` (sección 0) ya existe hoy en producción, sin relación con este Bloque 3** — cualquier intento real de anular+re-liquidar un viaje ya está fallando o va a fallar. | Alta (ya activo, no hipotético) | Requiere decisión explícita: incluirlo en este bloque o tratarlo aparte cuanto antes — ver pregunta abierta en sección 1. |
| 2 | Migración de constraints únicas falla en producción por duplicados no detectados en la auditoría de staging (datos de producción pueden diferir de la copia usada para probar). | Media | Correr la auditoría de la sección 5 directamente contra producción (solo lectura) antes de la ventana de corte, no solo contra staging. |
| 3 | Backfill ambiguo de `anticipoGastoId` deja más filas en `NULL` de lo esperado, prolongando la vigencia de la rama de compatibilidad en `anular()`. | Media | El diseño ya lo asume (rama legacy explícita, con logging) — no bloquea, pero hay que dar seguimiento a cuántas filas quedan sin resolver tras el backfill. |
| 4 | Cambiar el `update` de `anticipoGasto.liquidado` a condicionado (`where: {id, liquidado:false}`) puede exponer una condición de carrera hoy "silenciosa" como un error visible al usuario (409) en flujos donde antes pasaba sin avisar. | Baja | Es el comportamiento deseado (falla ruidosa en vez de corrupción silenciosa), pero conviene comunicarlo como cambio de comportamiento esperado, no como regresión, si algún usuario lo reporta. |
| 5 | Índices únicos parciales/por expresión escritos a mano en el `migration.sql` no se regeneran solos si en el futuro alguien corre `prisma db pull` o `prisma format` sobre una base ya introspeccionada — quedan como "drift" entre schema y base si no se documentan. | Baja | Dejar un comentario en `schema.prisma` (en el modelo afectado) señalando que existe una constraint adicional aplicada solo vía SQL manual, con referencia al nombre de la migración. |
| 6 | Ventana de mantenimiento: si se aplican las 3 migraciones en producción sin haber cerrado la auditoría de duplicados primero, la migración de constraints únicas puede fallar a mitad de la ventana, dejando `anticipoGastoId` ya aplicado pero el resto pendiente. | Baja/Media | Ya contemplado en el orden de la sección 4 (migraciones separadas, no atómicas entre sí) — un fallo parcial es recuperable sin rollback completo. |

---

## 7. Plan de pruebas

**Regresión funcional (manual o e2e, sobre el flujo completo de Liquidaciones):**
1. Crear una liquidación de chofer con 2+ anticipos, uno de ellos sin `viajeId` (gasto general) — confirmar que ambos quedan `liquidado: true` y con `anticipoGastoId` seteado en su `LiquidacionMovimiento`.
2. Anular esa liquidación — confirmar que **ambos** anticipos (con y sin `viajeId`) vuelven a `liquidado: false` (hoy el segundo caso no se revierte nunca — es el bug a cerrar).
3. Caso central de P0.1: un mismo viaje con 2 anticipos, cada uno incluido en una liquidación **distinta**. Anular la liquidación A — confirmar que el anticipo de la liquidación B (vigente o pagada) **no** se ve afectado (hoy sí se contamina — es el bug crítico documentado).
4. Concurrencia: disparar dos `POST /liquidaciones` casi simultáneos que compitan por el mismo anticipo — confirmar que uno tiene éxito y el otro recibe un 409 con mensaje de negocio, no un 500 ni una doble liquidación silenciosa.
5. Volver a liquidar un viaje cuya liquidación anterior fue anulada — hoy falla (bug de la sección 0); si se decide corregirlo en este bloque, confirmar que ahora funciona; si no, documentar explícitamente que sigue fallando y por qué (para no confundirlo con una regresión nueva).
6. `Chofer.comisionPct`: crear una liquidación de chofer sin mandar `comisionPct` — confirmar que se usa el valor del chofer. Mandar un valor distinto explícito — confirmar que se respeta el override y que aparece la entrada correspondiente en `AuditLog`.
7. Constraints únicas: intentar crear un `Productor`/`Chofer`/`Ubicacion` duplicado por API directa — confirmar 409 con mensaje legible (no 500 crudo), para los 3 campos nuevos.
8. Caso límite de `Ubicacion`: crear dos ubicaciones con el mismo `nombre` y `localidad` ambos en `NULL` — confirmar que la constraint por expresión las bloquea igual (validación específica del punto que motivó usar `COALESCE` en vez de una unique compuesta simple).

**Pruebas de migración (antes de tocar producción):**
9. Aplicar las 3 migraciones sobre una copia real de la base de producción (o el snapshot más reciente disponible) y confirmar que corren sin error.
10. Correr el script de backfill de `anticipoGastoId` sobre esa misma copia y revisar manualmente una muestra de los matches automáticos (no solo confiar en el conteo) antes de darlo por bueno.
11. Correr las consultas de auditoría de duplicados de la sección 5 contra la copia de producción y confirmar el resultado esperado (idealmente cero) antes de programar la ventana real.

---

## 8. Plan de rollback

**Por migración (no un rollback único de todo el bloque, dado que se aplican por separado):**

- **`anticipoGastoId` (aditiva):** revertir es seguro y barato — la migración de vuelta elimina la columna (y el índice/constraint si se optó por Opción B) sin pérdida de datos preexistentes, porque no se modificó ni se borró ninguna columna vieja. El único dato que se perdería al revertir es el propio `anticipoGastoId` recién poblado (backfill + nuevas filas creadas durante el tiempo que estuvo activo) — antes de revertir, exportar/loguear esos IDs si se quiere poder re-aplicar el backfill sin repetir el trabajo de matching.
- **Constraints únicas (`Productor.cuit`, `Chofer.dni`, `Ubicacion.nombre`):** revertir es trivial (`DROP INDEX`/quitar `@unique`) y no destructivo — no se alteran datos, solo se relaja una restricción. Riesgo real de rollback: si entre la aplicación y el rollback se llegó a insertar un duplicado legítimo bloqueado antes (poco probable, ya que si se llegó a aplicar es porque no había duplicados), no hay nada que reconciliar.
- **Cambios de código (`create()`/`anular()` reescritos, default de `comisionPct`):** al ser cambios de aplicación, el rollback es el mecanismo normal de deploy (revertir el commit/deploy anterior), independiente del rollback de schema — pero **el orden importa**: si se revierte el código antes que el schema, el código viejo (que no conoce `anticipoGastoId`) sigue funcionando igual sobre una tabla que ya tiene la columna nueva (es nullable y aditiva, no rompe nada). Si se revierte el schema antes que el código, el código nuevo fallaría al intentar escribir una columna que ya no existe — por eso, en caso de necesitar revertir ambos, primero el código, después el schema.
- **Ventana de decisión:** ningún rollback de este bloque implica pérdida de datos de negocio (viajes, anticipos, liquidaciones, facturas) — en el peor caso se pierde el vínculo nuevo (`anticipoGastoId`) sobre movimientos creados durante la ventana en que estuvo activo, recuperable re-corriendo el backfill si se decide reintentar más adelante.

---

## Resumen de lo que falta decidir antes de implementar

1. ¿Opción A o B para `anticipoGastoId` (sin o con unique constraint parcial)? — recomiendo B.
2. ¿Se incluye en este mismo bloque el fix del bug de `LiquidacionViaje.viajeId` encontrado en la sección 0, o se trata aparte? — es nuevo, no estaba pedido, pero es la misma clase de bug y esta es la ventana natural para resolverlo.
3. ¿`Ubicacion`: índice por expresión (`COALESCE`) manteniendo `localidad` opcional, o hacer `localidad` obligatorio con backfill y una unique compuesta simple? — recomiendo la primera.

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

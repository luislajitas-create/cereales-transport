# Diseño Técnico — Bloque 4.2: `FacturaViaje.viajeId` — mismo patrón que `LiquidacionViaje` (Bloque 3.3)

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Cierra el hallazgo colateral señalado en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` §0 ("Hallazgo colateral, fuera de alcance") y confirmado como P0 en `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` §1.3. El Bloque 4.1 (guardas de `ViajesController`, commit local `fa1a31f`, sin push) queda sin tocar — este documento es independiente y no depende de él.

---

## 0. Auditoría completa del estado actual

### `schema.prisma`

- `FacturaViaje.viajeId` (`schema.prisma:372`): `String @unique` — constraint de unicidad **de por vida**, idéntica a la que tenía `LiquidacionViaje.viajeId` antes de la Alternativa C de 3.3.
- `Viaje.facturaViaje` (`schema.prisma:235`): `FacturaViaje?` — relación singular, consecuencia directa del `@unique` de arriba.
- `Factura.estado` (`schema.prisma:358`): `EstadoFacturaEnum @default(FACTURADO)` — enum con 4 valores (`FACTURADO`, `COBRADO_PARCIAL`, `COBRADO_TOTAL`, `ANULADO`).
- `Viaje.estadoFacturacion` (`schema.prisma:214`): `EstadoFacturacionEnum @default(PENDIENTE_DE_FACTURAR)` — enum independiente con 5 valores (`PENDIENTE_DE_FACTURAR`, `FACTURADO`, `COBRADO_PARCIAL`, `COBRADO_TOTAL`, `ANULADO`). Es un campo mutable sin ninguna relación de schema con `FacturaViaje` — la sincronía depende 100% del código de aplicación, exactamente el mismo patrón de riesgo que ya señalaba `BACKEND_REVIEW.md` para los enums duplicados de facturación (`EstadoFacturacionEnum` vs `EstadoFacturaEnum`, fuera de alcance de este documento — ver sección "fuera de alcance" abajo).
- `FacturaViaje` no tiene ningún campo de estado propio (`vigente`, `activa`, `revertida`, `deletedAt`) — es una tabla puramente de detalle/snapshot, sin ciclo de vida propio. Idéntico a como era `LiquidacionViaje` antes de 3.3.
- No hay ninguna constraint de base de datos que relacione `Viaje.estadoFacturacion` con la existencia/vigencia de una fila en `FacturaViaje`. Dos fuentes de verdad independientes, sincronizadas a mano por el controller.

### `FacturasController.create()` (`facturas.controller.ts:246-290`)

- Filtra viajes elegibles con `estado: "DESCARGADO"`, `estadoFacturacion: "PENDIENTE_DE_FACTURAR"`, `clienteId` (líneas 256-263), en una consulta **fuera** de la transacción — es una lectura de validación, no una garantía atómica.
- Dentro de la transacción (`:272-289`), por cada viaje: `tx.facturaViaje.create({data:{facturaId, viajeId:v.id, importeViaje:v.importeTotal}})` (`:283-285`) e inmediatamente después `tx.viaje.update({where:{id:v.id}, data:{estadoFacturacion:"FACTURADO"}})` (`:286`) — **incondicional**, sin `where` que verifique que `estadoFacturacion` siga siendo `PENDIENTE_DE_FACTURAR` en ese instante. Es el mismo patrón de bug de concurrencia (TOCTOU) que existía para `AnticipoGasto.liquidado` antes del sub-bloque 3.1 y para `Viaje.estadoLiquidacion` antes de 3.3 — del lado de facturación, **nunca se corrigió**.
- Lo que hoy "protege" (por accidente) contra la doble-facturación concurrente del mismo viaje no es lógica de aplicación — es el `@unique` de `FacturaViaje.viajeId`: si dos transacciones concurrentes intentan `tx.facturaViaje.create()` para el mismo `viajeId`, la segunda falla con `P2002` (traducido a 409 por el `PrismaExceptionFilter` del Bloque 2). Dato central para el diseño: **la misma constraint que causa el bug de re-facturación (ver sección 2) es, hoy, la única barrera real contra la doble facturación concurrente.**

### `FacturasController.anular()` (`facturas.controller.ts:292-307`)

- Revierte `Factura.estado → "ANULADO"` (`:301`).
- Revierte `Viaje.estadoFacturacion → "PENDIENTE_DE_FACTURAR"` para cada viaje de la factura (`:302-304`), iterando `factura.viajes` (las filas de `FacturaViaje` de esa factura específica, vía `facturaId`).
- **Nunca toca la fila de `FacturaViaje` en sí** — no la borra, no la marca, no la desvincula. La fila queda viva para siempre, apuntando a una `Factura` ya `ANULADO`, ocupando el único cupo que el `@unique` permite para ese `viajeId`. Idéntico, línea por línea en su lógica, al bug que tenía `LiquidacionesController.anular()` antes de 3.3.
- Guard adicional preexistente: `if (factura.cobranzas.length > 0) throw ...` (`:297-299`) — no relacionado con este bug, pertenece al Bloque 4.3 (cobranzas), mencionado acá solo porque es la única otra condición que hoy limita cuándo se puede anular una factura.

### `FacturasController.conciliacion()` (`facturas.controller.ts:176-236`)

- Trae viajes `DESCARGADO` con `include: { ..., facturaViaje: true }` (`:190-194`, relación singular todavía).
- Para cada viaje, si `v.facturaViaje` existe (verdadero/falso, no un array), lo suma a `toneladasFacturadas`/`importeFacturado`; si no, lo agrega a `viajesPendientes` (`:213-228`).
- **No tiene ningún bug de integridad propio** — es un consumidor de lectura, no escribe nada. El único efecto de este bloque sobre `conciliacion()` es que, al pluralizar la relación (sección 3), el chequeo `if (v.facturaViaje)` deja de ser válido tal cual (pasaría a ser un array, siempre "truthy" aunque esté vacío) y debe ajustarse a `if (v.facturasViaje.length > 0)` — cambio mecánico, sin lógica nueva.

### Relación `Viaje` ↔ `FacturaViaje` y estados de facturación

- `Viaje.estadoFacturacion` es la única fuente de verdad operativa para decidir si un viaje "puede facturarse" (`create()` filtra por `PENDIENTE_DE_FACTURAR`). `FacturaViaje` es puramente el detalle histórico/snapshot (`importeViaje`) de cada episodio.
- Confirmé por `grep` en todo el repo que **el frontend no renderiza `facturaViaje` en ningún lugar** (cero coincidencias en `frontend/src`) — mismo hallazgo que ya se hizo para `liquidacionViaje` en 3.3. Esto reduce significativamente el riesgo de cambiar la cardinalidad de la relación: no hay ningún consumidor visual atado hoy a que sea singular.
- El único otro lugar del backend activo que referencia `facturaViaje` es `ViajesController.findOne()` (`viajes.controller.ts:127`, `facturaViaje: { include: { factura: true } }`) — mismo patrón que `liquidacionesViaje` en la línea inmediatamente anterior (126), ya pluralizada en 3.3.
- Encontré también una referencia a `facturaViaje` en `app/backend/src/viajes/viajes.controller.ts` — es el directorio duplicado y desactualizado (fechado 27/06) ya señalado como deuda de limpieza en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` §0, no referenciado por ningún build/config activo (confirmado en su momento por grep). No forma parte de este diseño ni de ningún despliegue real.

---

## 1. Causa raíz exacta

**Idéntica a la de `LiquidacionViaje` antes de 3.3: cardinalidad mal modelada.** El schema declara "un viaje tiene, como máximo, una factura en toda su vida" (`@unique` de por vida sobre `FacturaViaje.viajeId`), pero el propio código implementa un proceso de negocio que contradice esa declaración: `anular()` existe explícitamente para deshacer una facturación y permitir que el viaje vuelva a estar disponible (`estadoFacturacion: "PENDIENTE_DE_FACTURAR"`), es decir, el proceso de negocio real es "un viaje puede pasar por múltiples episodios de facturación a lo largo de su vida (facturado → anulado → facturado de nuevo, un número arbitrario de veces)". La constraint de base y el comportamiento de aplicación están en contradicción directa. `anular()` actualiza la mitad del estado (`Viaje.estadoFacturacion`, el texto) pero no la otra mitad (la fila `FacturaViaje`, que sigue ocupando el cupo único), dejando el sistema en un estado donde la UI y las consultas dicen "este viaje está pendiente de facturar" pero la base de datos se niega a aceptar una `FacturaViaje` nueva para él.

No es un error transitorio ni depende de una condición de carrera: cada vez que se anula una factura que incluye ese viaje, la fila vieja de `FacturaViaje` queda huérfana pero viva, y ningún camino del código la libera jamás. El bloqueo es permanente y se repite indefinidamente en cada ciclo facturar→anular de un mismo viaje.

---

## 2. ¿Un viaje con factura anulada puede volver a facturarse hoy?

**No.** Verificado tanto por lectura de código como por reproducción real contra la base de desarrollo durante las pruebas manuales del Bloque 4.1 (sesión anterior): facturé el viaje #7, luego anulé esa factura — la fila `FacturaViaje` original quedó viva, apuntando a la factura ya `ANULADO`. Un segundo intento de `POST /facturas` incluyendo el mismo viaje ejecutaría `tx.facturaViaje.create({data:{..., viajeId: v.id, ...}})` (`facturas.controller.ts:283-285`), que chocaría contra la fila existente (mismo `viajeId`, constraint `@unique`) y la transacción completa fallaría con `P2002` → `409 Conflict` (vía `PrismaExceptionFilter`), con un mensaje genérico de conflicto de base, no un mensaje de negocio claro. **En la práctica: hoy, un viaje cuya factura fue anulada no se puede volver a facturar nunca**, salvo intervención manual directa sobre la base de datos (fuera de la aplicación).

---

## 3. Mejor solución arquitectónica

Aplican, punto por punto, las mismas tres alternativas ya evaluadas y decididas en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` §1 para `LiquidacionViaje`, ahora del lado de `FacturaViaje`:

### Alternativa A — Purgar la fila al anular (rechazada)

Al anular, `tx.facturaViaje.deleteMany({ where: { facturaId: id } })`, liberando el cupo único de inmediato. Descarta el requisito de conservar historial completo: se pierde para siempre el snapshot (`importeViaje`) de qué se facturó exactamente en la factura anulada. La fila `Factura` (con `estado: ANULADO`) sobrevive, pero su desglose por viaje desaparece — un auditor no podría reconstruir qué viajes ni con qué importes formaban parte de una factura anulada. Único punto a favor: cero cambio de schema. No alcanza para justificar la pérdida de trazabilidad, sobre todo tratándose de documentos con valor fiscal. **Rechazada.**

### Alternativa B — Constraint única parcial + columna de estado local

Agregar `vigente Boolean @default(true)` a `FacturaViaje`, puesta en `false` dentro de la transacción de `anular()` (sin borrar la fila). Reemplazar el `@unique` de tabla completa por un índice único parcial (`CREATE UNIQUE INDEX ... ON "FacturaViaje"(viajeId) WHERE vigente = true`), escrito a mano en el `migration.sql` generado. Preserva 100% el historial y da la garantía de unicidad a nivel de base de datos, no solo de aplicación — pero requiere SQL manual (índice parcial, no representable en el DSL de Prisma), técnica que en 3.1 y 3.3 decidiste evitar mientras no resultara estrictamente necesaria.

### Alternativa C — Quitar el `@unique`, relación uno-a-muchos, mover la protección de concurrencia a `Viaje.estadoFacturacion` (recomendada)

- `FacturaViaje.viajeId` deja de ser `@unique` (pasa a índice normal, `@@index([viajeId])`, para no perder performance en el lookup inverso).
- `Viaje.facturaViaje FacturaViaje?` (singular) pasa a `Viaje.facturasViaje FacturaViaje[]` (plural) — un viaje puede acumular una fila de `FacturaViaje` por cada episodio de facturación que haya tenido, para siempre, sin excepción.
- La protección de concurrencia se mueve del `@unique` (que hoy la da "de casualidad", como efecto colateral del bug) a una actualización condicionada sobre `Viaje.estadoFacturacion`, exactamente el mismo mecanismo ya implementado y probado en 3.1 (`AnticipoGasto.liquidado`) y 3.3 (`Viaje.estadoLiquidacion`): dentro de la transacción, `tx.viaje.updateMany({ where: { id: v.id, estadoFacturacion: "PENDIENTE_DE_FACTURAR" }, data: { estadoFacturacion: "FACTURADO" } })`, verificando `count === 1` antes de crear el `FacturaViaje`; si `count === 0`, abortar con un mensaje de negocio claro (otra operación concurrente ya lo tomó).
- Nunca se borra ni se modifica una fila de `FacturaViaje` existente — historial completo, íntegro, para siempre.
- Migración 100% representable en el DSL de Prisma (quitar un atributo, agregar un índice normal, renombrar un campo de relación) — cero SQL manual, consistente con la preferencia ya marcada en 3.1/3.3.
- No introduce ninguna columna nueva ni concepto nuevo (`vigente`/`activa`) — la "vigencia" de un episodio de facturación ya se puede derivar sin ambigüedad de `Factura.estado` (¿es `ANULADO` o no?) de la factura a la que esa fila pertenece.

**Recomendación: Alternativa C**, por los mismos motivos que en 3.3: reutiliza una técnica ya implementada y validada dos veces en este mismo código (3.1 para anticipos, 3.3 para liquidaciones), no introduce SQL manual, preserva historial completo, y mantiene consistencia arquitectónica — la tercera aplicación del mismo patrón ya no es una decisión de diseño nueva, es aplicar una convención ya establecida.

---

## 4. Impacto en historial

Total y completo, por diseño — igual que se documentó para `LiquidacionViaje` en 3.3. Cada episodio de facturación de un viaje (incluidos los anulados) queda como una fila propia de `FacturaViaje`, con su propio `importeViaje` congelado en el momento de creación, vinculada a su propia `Factura` (con su propio `estado`, `numero`, `fecha`, `vencimiento`). Nunca se sobreescribe ni se recalcula un episodio anterior al crear uno nuevo. Un auditor puede reconstruir, para cualquier viaje, la secuencia completa: cuántas veces fue facturado, en qué facturas, con qué importe cada vez, cuáles de esas facturas terminaron anuladas y cuál (si alguna) es la vigente. Hoy esa reconstrucción es imposible más allá del primer episodio, porque el segundo episodio nunca llega a existir.

---

## 5. Impacto en conciliación

`conciliacion()` (`facturas.controller.ts:176-236`) necesita un único ajuste mecánico: el chequeo `if (v.facturaViaje)` (línea 213, hoy evalúa la presencia de un objeto único o `null`) pasa a `if (v.facturasViaje.length > 0)` una vez que la relación se pluraliza. Ningún otro cambio de lógica:

- La agregación de `toneladasFacturadas`/`importeFacturado` sigue sumando `v.toneladas`/`v.importeTotal` (campos live del `Viaje`, no del snapshot) — comportamiento sin cambios, ya independiente de la cardinalidad de `FacturaViaje`.
- Un viaje con dos episodios de facturación históricos (uno anulado, uno vigente) sigue contando **una sola vez** en `toneladasFacturadas`/`importeFacturado` (el chequeo es de presencia — "¿tiene al menos una fila?", no una suma sobre el array), consistente con que `conciliacion()` mide viajes facturados vs. pendientes, no episodios de facturación.
- `viajesPendientes` (líneas 216-228) sigue construyéndose solo para viajes sin ninguna fila en `facturasViaje` — comportamiento idéntico al actual para el caso común (viaje nunca facturado). El caso nuevo que esto habilita (viaje con una única `FacturaViaje` histórica pero anulada, y `estadoFacturacion` ya vuelto a `PENDIENTE_DE_FACTURAR`) hoy es imposible de alcanzar en la práctica porque el bug se lo impide — una vez corregido, ese viaje aparecería correctamente en `viajesPendientes` (tiene `facturasViaje.length > 0` pero todas anuladas) **solo si además se ajusta el chequeo para filtrar por vigencia**. Ver nota de diseño abajo.

**Nota de diseño, análoga a la que 3.3 dejó para `recomputeTotales()` en Liquidaciones:** el chequeo `v.facturasViaje.length > 0` (ingenuo, cuenta cualquier episodio histórico, incluidos los anulados) daría un falso "ya facturado" para un viaje cuya única factura fue anulada — lo marcaría como facturado cuando en realidad está `PENDIENTE_DE_FACTURAR` y debería aparecer en `viajesPendientes`. La forma correcta es cruzar contra `estadoFacturacion` del propio viaje (que ya es la fuente de verdad operativa, y `anular()` ya la revierte correctamente) en lugar de inferir el estado a partir de la existencia de `FacturaViaje`. Cambio mínimo propuesto: reemplazar `if (v.facturaViaje)` por `if (v.estadoFacturacion !== "PENDIENTE_DE_FACTURAR")` — no depende en absoluto de la cardinalidad de la relación, es más robusto, y usa un campo que la consulta ya trae (`v.estadoFacturacion` es parte del `Viaje` base, sin necesitar el `include`). Esto es preferible a `v.facturasViaje.length > 0` porque no requiere filtrar por vigencia dentro del array — el campo de estado ya resume esa información. Marco esto como parte del alcance de 4.2 (es el ajuste correcto y mínimo, no una funcionalidad nueva), a confirmar en la implementación.

---

## 6. Protección de concurrencia

Igual razonamiento que 3.3, sección 5 de ese documento, aplicado a facturación:

| # | Riesgo | Resuelto por |
|---|---|---|
| 1 | Dos `POST /facturas` concurrentes intentando incluir el mismo viaje (hoy "protegido" por casualidad gracias al `@unique` que causa el bug). | La actualización condicionada (`updateMany` con `where: {id, estadoFacturacion:"PENDIENTE_DE_FACTURAR"}` + verificación de `count`) reemplaza esa protección accidental por una intencional — Postgres serializa el acceso a la fila del viaje dentro de la transacción, igual que ya se probó empíricamente para anticipos (3.1) y liquidaciones (3.3). |
| 2 | Al quitar el `@unique`, ¿queda alguna ventana donde dos `FacturaViaje` activos coexistan para el mismo viaje? | No: la creación de `FacturaViaje` ocurre siempre **después** de que la actualización condicionada de `estadoFacturacion` tuvo éxito (`count === 1`) — si dos transacciones compiten, solo una logra la transición de estado; la otra aborta antes de llegar a crear su fila. |
| 3 | `anular()` corriendo en paralelo con un `create()` que incluye el mismo viaje. | Ambos operan sobre la misma fila de `Viaje` dentro de sus respectivas transacciones — Postgres serializa el acceso; no hay corrupción posible. No es un caso nuevo introducido por este cambio — ya se comporta así hoy. |
| 4 | Interacción con el Bloque 4.1 (guardas de `ViajesController`, ya commiteado localmente): un `PATCH /viajes/:id` corriendo en paralelo con este `create()`. | Sin cambios respecto del riesgo ya documentado en el Bloque 4.1 (TOCTOU teórico entre el `findUnique` de guarda y el `update` final) — este bloque no lo agrava ni lo resuelve, son cambios en módulos distintos sobre la misma fila de `Viaje`, con el mismo perfil de riesgo bajo ya aceptado. |

---

## 7. Migración necesaria

Misma estrategia que 3.3 (no se genera en este documento, solo se describe):

1. **Schema:** quitar `@unique` de `FacturaViaje.viajeId`, agregar `@@index([viajeId])`; renombrar `Viaje.facturaViaje` → `Viaje.facturasViaje` (cambio de cardinalidad `FacturaViaje?` → `FacturaViaje[]`).
2. **Naturaleza de la migración:** aditiva/relajante, no destructiva — `DROP INDEX` de la constraint única existente + `CREATE INDEX` normal. Sin `ALTER COLUMN`, sin `DROP COLUMN`, sin riesgo de pérdida de datos.
3. **Backfill:** ninguno — no hay transformación de datos existentes que hacer; las filas actuales de `FacturaViaje` quedan exactamente iguales, solo cambia la restricción que las gobierna hacia adelante.
4. **Generación:** `prisma migrate dev --create-only`, igual que en 3.1/3.2/3.3 — permite revisar el SQL generado antes de aplicarlo, aunque en este caso (100% expresable en el DSL) no debería requerir edición manual.
5. **Entornos:** aplicar primero contra la base local/staging, confirmar `prisma migrate deploy` limpio, recién después producción (Railway, manual, mismo procedimiento ya usado en Bloques anteriores — la automatización del pipeline sigue pendiente como ítem de infraestructura aparte, según `ROADMAP_SDC_V1.md`).

**Código a modificar (para cuando se apruebe la implementación, no ahora):**
- `FacturasController.create()`: agregar la actualización condicionada de `Viaje.estadoFacturacion` dentro de la transacción (mismo patrón que el `updateMany` de 3.1/3.3), antes de crear cada `FacturaViaje`.
- `FacturasController.anular()`: **sin cambios** — ya hace exactamente lo correcto (revertir `estadoFacturacion`, dejar `FacturaViaje` intacto). Es `create()` el que necesita el cambio, no `anular()` — mismo hallazgo que en 3.3.
- `FacturasController.conciliacion()`: ajuste mínimo descrito en la sección 5 (`v.facturaViaje` → `v.estadoFacturacion !== "PENDIENTE_DE_FACTURAR"`).
- `ViajesController.findOne()` (`viajes.controller.ts:127`): renombrar el `include` de `facturaViaje` a `facturasViaje`.

---

## 8. Plan de pruebas

1. Facturar un viaje → `FacturaViaje` creado, `Viaje.estadoFacturacion = FACTURADO`.
2. Anular esa factura → `estadoFacturacion` vuelve a `PENDIENTE_DE_FACTURAR`; el `FacturaViaje` original **sigue existiendo**, sin cambios, apuntando a la factura ya `ANULADO`.
3. **Caso central del P0:** volver a facturar el mismo viaje en una factura nueva → hoy falla (409 confuso por `P2002`, confirmado en sección 2); con el fix debe funcionar, creando un **segundo** `FacturaViaje` para el mismo `viajeId`, con `facturaId` distinto.
4. `GET /viajes/:id` → debe devolver ambas entradas en `facturasViaje` (el historial completo), cada una con su propio `importeViaje` y su propia `factura` asociada.
5. Repetir el ciclo facturar→anular→re-facturar una tercera vez sobre el mismo viaje → confirmar que no es un fix de una sola vez, sino indefinidamente repetible.
6. Concurrencia: dos `POST /facturas` simultáneos incluyendo el mismo viaje → exactamente uno tiene éxito, el otro recibe un error de negocio claro (400), nunca dos éxitos ni un 500/409 crudo.
7. `conciliacion()`: viaje nunca facturado → aparece en `viajesPendientes`. Viaje facturado (vigente) → cuenta en `toneladasFacturadas`/`importeFacturado`, no aparece en pendientes. Viaje con factura anulada y sin re-facturar → **debe volver a aparecer en `viajesPendientes`** (caso nuevo, solo alcanzable una vez corregido el bug) — verifica específicamente el ajuste de la sección 5.
8. Viaje con dos episodios de facturación (uno anulado, uno vigente) → cuenta **una sola vez** en `toneladasFacturadas`/`importeFacturado` de `conciliacion()`, no duplicado.
9. Regresión: `registrarCobranza()` y el guard de cobranzas en `anular()` (Bloque 4.3, todavía no implementado) siguen funcionando igual — sin relación con este cambio.
10. Regresión: interacción con Bloque 4.1 — cancelar un viaje ya facturado sigue bloqueado (`ViajesController.cancelar()`), y el camino de escape (anular factura → cancelar) sigue funcionando exactamente igual que el verificado en las pruebas de 4.1, ahora con la relación pluralizada.
11. Confirmar que ningún otro consumidor del backend/frontend se rompe por el cambio de cardinalidad (ya verificado por grep: solo `viajes.controller.ts:127` depende de la forma singular en el backend activo; el frontend no la renderiza en ningún lado).

**Pruebas de migración (antes de tocar producción):**
12. Aplicar la migración sobre una copia real de la base de producción (o el snapshot más reciente) y confirmar que corre sin error (aditiva, no debería poder fallar por datos existentes).
13. Confirmar que las filas de `FacturaViaje` preexistentes (creadas antes de la migración) siguen siendo accesibles y correctas vía `facturasViaje` después de aplicar el cambio.

---

## 9. Plan de rollback

Mismo perfil que el ya documentado para 3.3:

- **Schema:** revertir (`DROP INDEX` + re-agregar `@unique` a `FacturaViaje.viajeId`) es seguro **solo si**, para ese momento, ningún viaje fue re-facturado más de una vez desde que se desplegó el fix. Si ocurrió, Postgres rechaza directamente la creación del índice único (violación de duplicados) — el rollback de schema fallaría con un error explícito, no silenciosamente, y requeriría un triage manual de qué episodio "gana" el cupo único antes de poder revertir (mismo procedimiento ya documentado para las constraints de Catálogos en 3.1). Vale la pena dejarlo explícito: este rollback deja de ser trivial en cuanto la funcionalidad nueva se usa de verdad — es señal de que el fix está cumpliendo su propósito, no un defecto del diseño.
- **Código:** revertir el `updateMany` condicionado en `create()`, el ajuste de `conciliacion()`, y el rename del `include` en `ViajesController.findOne()` es inmediato y no destructivo — no hay datos que reconciliar del lado del código.
- **Orden recomendado si hay que revertir todo:** primero código, después schema — el código viejo (que no conoce la pluralización) seguiría funcionando igual sobre un schema con el índice ya relajado (es nullable/singular-compatible en la práctica mientras haya como máximo una fila por viaje), pero el código nuevo rompería si el schema se revierte primero.
- Ningún rollback de este bloque implica pérdida de datos de negocio (viajes, facturas, cobranzas) — en el peor caso se pierde la posibilidad de re-facturar un viaje después de anular (se vuelve a bloquear, que es el estado actual, no una regresión respecto de hoy).

---

## Fuera de alcance de este documento (adyacente, no pedido)

- Unificación de `EstadoFacturacionEnum` (`Viaje`) y `EstadoFacturaEnum` (`Factura`) — deuda ya señalada en `ROADMAP_SDC_V1.md` v1.1 ítem 5 y `BACKEND_REVIEW.md` §1. Ninguna corrección de este bloque la requiere.
- Bloque 4.3 (cobranzas: sobrepago, doble cobranza, reversión individual) — mencionado solo como contexto en la sección 0 (guard de `anular()`), sin cambios en este documento.
- Limpieza del directorio `app/backend`/`app/frontend` (código duplicado y desactualizado, ya señalado en 3.3) — no relacionado.

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

# Diseño Técnico — Bloque 3.3: `LiquidacionViaje.viajeId` — cierre del último P0 del Bloque 3

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Cierra el P0 independiente documentado en `BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` (sección 0) y confirmado en memoria de sesión, dejado deliberadamente fuera de los sub-bloques 3.1 (`anticipoGastoId`, commit `f8e2b91`) y 3.2 (`comisionPct`, commit `ca02fa2`).

---

## 0. Auditoría completa del flujo actual

### `schema.prisma`
- `LiquidacionViaje.viajeId` (`schema.prisma:318`): `String @unique`. Es una constraint de **unicidad de por vida** — un `Viaje` puede tener, en toda su existencia, como máximo una fila de `LiquidacionViaje` jamás creada.
- `Viaje.liquidacionViaje` (`schema.prisma:234`): `LiquidacionViaje?` — relación 1 a 1 (singular), consecuencia directa del `@unique` de arriba. No es `LiquidacionViaje[]`.
- `Viaje.estadoLiquidacion` (`schema.prisma:215`): `EstadoLiquidacionItemEnum @default(PENDIENTE)` — enum con 3 valores: `PENDIENTE`, `LIQUIDADO`, `PAGADO`. Es un campo mutable e independiente de `LiquidacionViaje` — no hay ninguna relación de schema entre ambos, la sincronía entre "estado textual" y "fila de detalle" depende 100% de que el código de aplicación los mantenga coherentes.
- `LiquidacionViaje` no tiene ningún campo de estado propio (`vigente`, `activa`, `revertida`, etc.) ni `deletedAt` — es una tabla puramente de detalle/snapshot, sin ciclo de vida propio.
- No hay ninguna constraint de base de datos que relacione `Viaje.estadoLiquidacion` con la existencia/vigencia de una fila en `LiquidacionViaje`. Son dos fuentes de verdad independientes, sincronizadas a mano por el controller — el mismo patrón de riesgo (dos fuentes de verdad sin garantía de sincronía a nivel de base) que ya señalaba `BACKEND_REVIEW.md` para los enums duplicados de facturación.

### `LiquidacionesController.create()` (líneas 341-441 actuales, ya con los cambios de 3.1/3.2 aplicados)
- Lee viajes elegibles con `estadoLiquidacion: "PENDIENTE"` (`:341-348`), en una consulta **fuera** de la transacción — es una lectura de validación, no una garantía atómica.
- Dentro de la transacción (`:373-441`), por cada viaje: `tx.liquidacionViaje.create({data:{viajeId: v.id, ...}})` (`:403-412`) e inmediatamente después `tx.viaje.update({where:{id:v.id}, data:{estadoLiquidacion:"LIQUIDADO"}})` (`:413`) — **incondicional**, sin `where` que verifique que `estadoLiquidacion` siga siendo `PENDIENTE` en ese instante.
- Esto es exactamente el mismo patrón de bug de concurrencia (TOCTOU: read-then-write no atómico) que existía para `AnticipoGasto.liquidado` antes del sub-bloque 3.1 — con una diferencia crítica: para anticipos, 3.1 ya lo cerró (`updateMany` condicionado por `liquidado:false` + verificación de `count`); **para viajes, ese mismo cierre nunca se hizo** — el `viaje.update` de la línea 413 sigue siendo incondicional hoy.
- Lo que hoy "protege" (accidentalmente) contra la doble liquidación concurrente del mismo viaje no es ninguna lógica de aplicación — es el `@unique` de `LiquidacionViaje.viajeId`: si dos transacciones concurrentes intentan `tx.liquidacionViaje.create()` para el mismo `viajeId`, la segunda falla con `P2002` (ahora traducido a 409 por el `PrismaExceptionFilter` del Bloque 2, antes era un 500 crudo). Este es un dato central para el diseño: **la misma constraint que causa el bug de re-liquidación es, hoy, la única barrera real contra la doble liquidación concurrente.**

### `LiquidacionesController.anular()` (líneas 484-528 actuales)
- Revierte `Liquidacion.estado → "ANULADA"` (`:494`).
- Revierte `Viaje.estadoLiquidacion → "PENDIENTE"` para cada viaje de la liquidación (`:495-497`), iterando `liquidacion.viajes` (las filas de `LiquidacionViaje` de esa liquidación específica, vía `liquidacionId`).
- **Nunca toca la fila de `LiquidacionViaje` en sí** — ni la borra, ni la marca, ni la desvincula. La fila queda viva para siempre, apuntando a una `Liquidacion` que ya está `ANULADA`, ocupando el único cupo que el `@unique` permite para ese `viajeId`.
- Confirmado con la auditoría de datos local (sesión de 3.1): existían 2 `Liquidacion` en estado `ANULADA` en la base de desarrollo, cada una con su(s) `LiquidacionViaje` intacto(s) — el bug es reproducible con datos reales del propio entorno de trabajo.

### Causa raíz exacta
**Cardinalidad mal modelada.** El schema declara "un viaje tiene, como máximo, una liquidación en toda su vida" (`@unique` de por vida), pero el proceso de negocio que el propio código implementa — `anular()` existe explícitamente para permitir deshacer una liquidación y que el viaje vuelva a estar disponible (`estadoLiquidacion: "PENDIENTE"`) — asume "un viaje puede pasar por múltiples episodios de liquidación a lo largo de su vida (liquidado → anulado → liquidado de nuevo, un número arbitrario de veces)". La constraint de base y el comportamiento de aplicación están en contradicción directa. `anular()` actualiza la mitad del estado (el texto en `Viaje.estadoLiquidacion`) pero no la otra mitad (la fila de detalle que ocupa el cupo único), dejando el sistema en un estado donde **la UI y las consultas dicen "este viaje está disponible para liquidar" pero la base de datos se niega a aceptar una nueva liquidación para él.**

### Por qué queda bloqueado "para siempre"
No es un error transitorio ni depende de una condición de carrera: cada vez que se anula una liquidación que incluye ese viaje, la fila vieja de `LiquidacionViaje` queda huérfana pero viva, y **ningún camino del código la libera jamás**. No hay ningún job de limpieza, ningún endpoint de purga, ninguna lógica condicional que la borre o la reemplace. El bloqueo es permanente desde la perspectiva de la aplicación — solo se podría destrabar manualmente borrando la fila directamente en la base (fuera de la aplicación), y volvería a bloquearse en la próxima anulación de ese mismo viaje. Es un bloqueo que se **repite indefinidamente**, no un incidente aislado.

### Todas las referencias a `estadoLiquidacion` (búsqueda exhaustiva)
Backend: solo dentro de `liquidaciones.controller.ts` (`candidatos()` línea 116, `create()` línea 345, y las 3 transiciones ya descritas). Frontend: un único lugar de solo lectura, `ViajeDetalle.tsx:85` (`<strong>Estado liquidación:</strong> {viaje.estadoLiquidacion}`), texto plano sin lógica. El Dashboard no depende de `estadoLiquidacion` en ningún KPI (confirmado, cero coincidencias).

### Todas las consultas que dependen de `LiquidacionViaje` (búsqueda exhaustiva)
- `liquidaciones.controller.ts:403` — creación (ya cubierta arriba).
- `backend/src/viajes/viajes.controller.ts:70` — `GET /viajes/:id` incluye `liquidacionViaje: { include: { liquidacion: true } }` (relación singular). **El frontend recibe este dato pero no lo renderiza en ningún lado** (`ViajeDetalle.tsx` solo muestra el texto `estadoLiquidacion`, nunca `viaje.liquidacionViaje`). Esto reduce significativamente el riesgo de cambiar la cardinalidad de la relación: no hay ningún consumidor visual atado hoy a que sea singular.
- `recomputeTotales()` (`:530-548`) agrega `liquidacion.viajes` (es decir, filtra siempre por `liquidacionId`, nunca por `viajeId` global) — **no se ve afectado** por relajar el `@unique` de `viajeId`, sea cual sea la cardinalidad de la relación con `Viaje`.
- Dashboard: cero referencias a `LiquidacionViaje` (confirmado).

### Hallazgo colateral (fuera de alcance, mencionado para que quede registrado)
`FacturaViaje.viajeId` (`schema.prisma:371`) tiene **exactamente el mismo patrón**: `@unique`, y `FacturasController.anular()` (`facturas.controller.ts:303`) revierte `Viaje.estadoFacturacion → "PENDIENTE_DE_FACTURAR"` sin tocar la fila de `FacturaViaje`. Es plausible que re-facturar un viaje después de anular su factura original choque con el mismo tipo de bloqueo. No lo audité en profundidad porque no fue pedido y no es parte de este Bloque 3 — lo señalo como un P-nuevo candidato a evaluar por separado, con la misma técnica de diagnóstico que usamos acá, si en algún momento se prioriza.

También encontré, sin buscarlo, un directorio `app/backend/` y `app/frontend/` en la raíz del repo con copias antiguas y desactualizadas (fechadas 27/06) de algunos controllers y páginas, no referenciadas por ningún build/config activo (confirmado por grep) — deuda de limpieza de repo, no relacionada con este diseño, ya en la misma categoría que los `schema*.prisma` sueltos señalados en 3.2.

---

## 1. Alternativas evaluadas

### Alternativa A — Purgar la fila al anular (rechazada)
Al anular, hacer `tx.liquidacionViaje.deleteMany({ where: { liquidacionId: id } })`, liberando el cupo único de inmediato.
- **Descarta el requisito explícito de conservar historial completo.** Se pierde para siempre el snapshot (`subtotal`, `comisionPct`, `comisionMonto`, `totalViaje`) de exactamente qué se calculó en la liquidación anulada. La fila `Liquidacion` (con `estado: ANULADA`) sobrevive, pero su desglose por viaje desaparece — un auditor no podría reconstruir qué viajes ni con qué números formaban parte de esa liquidación anulada.
- Único punto a favor: cero cambio de schema. No alcanza para justificar la pérdida de trazabilidad. **Rechazada.**

### Alternativa B — Constraint única parcial + columna de estado local
Agregar una columna local `vigente Boolean @default(true)` a `LiquidacionViaje`, puesta en `false` dentro de la transacción de `anular()` (sin borrar la fila). Reemplazar el `@unique` de tabla completa por un índice único parcial (`CREATE UNIQUE INDEX ... ON "LiquidacionViaje"(viajeId) WHERE vigente = true`), escrito a mano en el `migration.sql` generado (mismo patrón discutido y diferido para `anticipoGastoId` en 3.1 — "Opción B" de aquel diseño, que en aquel momento elegiste no implementar).
- Preserva 100% el historial (nunca se borra nada).
- Dala garantía de unicidad **a nivel de base de datos** para "como máximo un episodio activo por viaje" — la protección de concurrencia queda en la base, no solo en el código.
- Requiere SQL manual en la migración (índice parcial, no representable en el DSL de Prisma) y una columna nueva.
- Es consistente con el patrón que dejamos pendiente en 3.1, pero introduce ese SQL manual que en 3.1 decidiste evitar mientras no fuera "estrictamente necesario".

### Alternativa C — Quitar el `@unique`, rediseñar la relación a uno-a-muchos, mover la protección de concurrencia al propio `Viaje.estadoLiquidacion` (recomendada)
- `LiquidacionViaje.viajeId` deja de ser `@unique` (pasa a índice normal, `@@index([viajeId])`, para no perder performance en el lookup inverso).
- `Viaje.liquidacionViaje LiquidacionViaje?` (singular) pasa a `Viaje.liquidacionesViaje LiquidacionViaje[]` (plural) — un viaje puede acumular una fila de `LiquidacionViaje` por cada episodio de liquidación que haya tenido, para siempre, sin excepción.
- La protección de concurrencia se mueve del `@unique` (que hoy la da "de casualidad", como efecto colateral del bug) a una actualización condicionada sobre `Viaje.estadoLiquidacion`, exactamente el mismo mecanismo que 3.1 ya implementó y probó para `AnticipoGasto.liquidado`: dentro de la transacción, `tx.viaje.updateMany({ where: { id: v.id, estadoLiquidacion: "PENDIENTE" }, data: { estadoLiquidacion: "LIQUIDADO" } })`, verificando `count === 1` antes de crear el `LiquidacionViaje`; si `count === 0`, abortar con un mensaje de negocio claro (otra operación concurrente ya lo tomó).
- Nunca se borra ni se modifica una fila de `LiquidacionViaje` existente — el historial completo, íntegro, para siempre.
- Migración 100% representable en el DSL de Prisma (quitar un atributo, agregar un índice normal) — cero SQL manual, consistente con la preferencia que marcaste en 3.1 ("no escribir migraciones complejas con SQL manual salvo que resulten estrictamente necesarias").
- No introduce ninguna columna nueva ni concepto nuevo (`vigente`/`activa`) — la "vigencia" de un episodio de liquidación ya se puede derivar sin ambigüedad de `Liquidacion.estado` (¿es `ANULADA` o no?) de la liquidación a la que esa fila pertenece, sin necesitar duplicar esa información en `LiquidacionViaje`.

**Recomendación: Alternativa C.** Es arquitectónicamente la más consistente con la decisión ya tomada y validada en 3.1 (mover la protección de concurrencia a una actualización condicionada sobre el campo de estado de la entidad "dueña", no a una constraint sobre la tabla de detalle), reutiliza una técnica ya implementada y probada en este mismo código en vez de introducir una segunda técnica nueva (índice parcial), y cumple el requisito de "solución arquitectónicamente correcta, no un parche" sin necesitar SQL manual. La Alternativa B queda documentada como la opción de "cinturón y tirantes" si en algún momento se decide que la garantía debe vivir también en la base de datos, no solo en el código — igual que quedó pendiente para `anticipoGastoId`.

---

## 2. Alcance exacto de la Alternativa C

**Schema:**
- `LiquidacionViaje.viajeId`: quitar `@unique`, agregar `@@index([viajeId])`.
- `Viaje.liquidacionViaje LiquidacionViaje?` → `Viaje.liquidacionesViaje LiquidacionViaje[]` (rename + cambio de cardinalidad).

**Backend:**
- `LiquidacionesController.create()`: agregar la actualización condicionada de `Viaje.estadoLiquidacion` dentro de la transacción (mismo patrón que el `updateMany` de `AnticipoGasto.liquidado` en 3.1), antes de crear cada `LiquidacionViaje`.
- `ViajesController.findOne()` (`viajes.controller.ts:70`): renombrar el `include` de `liquidacionViaje` a `liquidacionesViaje` para reflejar la nueva cardinalidad.
- `LiquidacionesController.anular()`: **sin cambios** — ya hace exactamente lo correcto (revertir `estadoLiquidacion` a `PENDIENTE`, dejar la fila de `LiquidacionViaje` intacta). Es el `create()` el que necesita el cambio, no `anular()`.

**Frontend:**
- Ningún cambio estrictamente necesario (el dato `liquidacionViaje` no se renderiza hoy). Opcionalmente, se podría aprovechar `liquidacionesViaje` (ya en plural) para mostrar el historial de liquidaciones de un viaje en `ViajeDetalle.tsx` — lo dejo como mejora opcional, no parte del alcance mínimo, a decidir en la aprobación.

**Fuera de alcance:** `FacturaViaje.viajeId` (hallazgo colateral, sección 0), limpieza del directorio `app/` (aparte, no relacionado).

---

## 3. Impacto sobre historial, auditoría y reportes

- **Historial:** total y completo, por diseño — cada episodio de liquidación de un viaje (incluidos los anulados) queda como una fila propia de `LiquidacionViaje`, con su propio `subtotal`/`comisionPct`/`comisionMonto`/`totalViaje` congelados en el momento de creación, vinculada a su propia `Liquidacion` (con su propio `estado`, `numero`, fechas). Nunca se sobreescribe ni se recalcula un episodio anterior al crear uno nuevo.
- **Auditoría:** un auditor puede reconstruir, para cualquier viaje, la secuencia completa: cuántas veces fue liquidado, en qué liquidaciones, con qué comisión cada vez, cuáles de esas liquidaciones terminaron anuladas y cuál (si alguna) es la vigente. Hoy esa reconstrucción es imposible más allá del primer episodio, porque el segundo episodio nunca llega a existir.
- **Reportes:** `recomputeTotales()`, los exports Excel/PDF, y el detalle de una liquidación puntual (`GET /liquidaciones/:id`) siguen agregando exclusivamente por `liquidacionId` — no cambian en absoluto, porque nunca dependieron de que `viajeId` fuera único a nivel global.
- **Dashboard:** sin impacto (cero dependencia confirmada).

---

## 4. Compatibilidad con el sub-bloque 3.1 (`anticipoGastoId`)

No solo son compatibles — son la misma solución aplicada dos veces al mismo tipo de problema. 3.1 dejó sin cerrar, del lado de `Viaje`, exactamente el mismo tipo de brecha que cerró del lado de `AnticipoGasto`: una actualización de estado incondicional dentro de la transacción de `create()` (`tx.viaje.update` en la línea 413, sin `where` de guarda — el mismo patrón que tenía `tx.anticipoGasto.update` antes de 3.1). Este diseño completa esa simetría, usando la misma técnica ya aprobada y probada (actualización condicionada + verificación de `count`), en el mismo método (`create()`), en la misma transacción. No hay conflicto de columnas, tablas, ni de orden de migración — son cambios en modelos distintos (`LiquidacionViaje`/`Viaje` acá, `LiquidacionMovimiento`/`AnticipoGasto` en 3.1) y pueden convivir sin ninguna dependencia entre sí.

---

## 5. Riesgos de concurrencia

| # | Riesgo | Resuelto por |
|---|---|---|
| 1 | Dos `POST /liquidaciones` concurrentes intentando incluir el mismo viaje (hoy "protegido" por casualidad gracias al `@unique` que causa el bug). | La actualización condicionada (`updateMany` con `where: {id, estadoLiquidacion:"PENDIENTE"}` + verificación de `count`) reemplaza esa protección accidental por una intencional — Postgres serializa el acceso a la fila del viaje dentro de la transacción, igual que ya se probó empíricamente para anticipos en 3.1. |
| 2 | Al quitar el `@unique`, ¿queda alguna ventana donde dos `LiquidacionViaje` activos coexistan para el mismo viaje? | No: la creación del `LiquidacionViaje` ocurre siempre **después** de que la actualización condicionada de `estadoLiquidacion` tuvo éxito (`count === 1`) — si dos transacciones compiten, solo una logra la transición de estado; la otra aborta antes de llegar a crear su fila de `LiquidacionViaje`. |
| 3 | `anular()` corriendo en paralelo con un `create()` que incluye el mismo viaje. | Ambos operan sobre la misma fila de `Viaje` dentro de sus respectivas transacciones — Postgres serializa el acceso; no hay corrupción posible, en el peor caso una de las dos operaciones ve el estado ya cambiado por la otra y responde en consecuencia (ninguna de las dos deja datos a medio escribir). No es un caso nuevo introducido por este cambio — ya se comporta así hoy. |

---

## 6. Estrategia de migración

1. Cambios de schema: quitar `@unique` de `LiquidacionViaje.viajeId`, agregar `@@index([viajeId])`, renombrar el campo de relación en `Viaje`. Los tres cambios son 100% expresables en el DSL de `schema.prisma` — **sin SQL manual**, generado íntegramente por `prisma migrate diff`, igual que en 3.1.
2. Migración aditiva/relajante, no destructiva: `DROP INDEX` de la constraint única existente + `CREATE INDEX` normal. No hay `ALTER COLUMN`, no hay `DROP COLUMN`, no hay riesgo de pérdida de datos.
3. Sin backfill: no hay ninguna transformación de datos existentes que hacer — las filas actuales de `LiquidacionViaje` quedan exactamente igual, solo cambia la restricción que las gobierna hacia adelante.
4. Aplicar primero contra la base local (mismo procedimiento que 3.1 y 3.2: `prisma migrate diff` + `prisma migrate deploy` local, nunca contra producción sin aprobación separada).

---

## 7. Plan de rollback

- **Schema:** revertir es re-agregar `@unique` a `viajeId`. Esto es seguro **solo si, para ese momento, ningún viaje fue re-liquidado más de una vez** desde que se desplegó el fix (si hay 2+ filas de `LiquidacionViaje` para el mismo `viajeId`, Postgres rechaza directamente la creación del índice único — el rollback de schema fallaría con un error explícito, no silenciosamente). Si eso ocurre, no hay una resolución automática limpia: habría que decidir manualmente qué episodio "gana" el cupo único antes de poder revertir, igual que el triage manual de duplicados que ya usamos para las constraints de Catálogos en 3.1. Vale la pena dejarlo explícito: **este rollback deja de ser trivial en cuanto la funcionalidad nueva se usa de verdad** — es sano y esperado (significa que el fix está cumpliendo su propósito), pero hay que saberlo de antemano.
- **Código:** revertir el `updateMany` condicionado en `create()` y el rename del `include` en `ViajesController.findOne()` es inmediato y no destructivo — no hay datos que reconciliar del lado del código.
- Orden recomendado si hay que revertir todo: primero código, después schema (mismo criterio que en 3.1 — el código viejo funciona igual sobre un schema con el índice ya relajado, pero el código nuevo rompería si el schema se revierte primero).

---

## 8. Plan de pruebas

1. Liquidar un viaje → `LiquidacionViaje` creado, `Viaje.estadoLiquidacion = LIQUIDADO`.
2. Anular esa liquidación → `estadoLiquidacion` vuelve a `PENDIENTE`; el `LiquidacionViaje` original **sigue existiendo**, sin cambios, apuntando a la liquidación ya `ANULADA`.
3. **Caso central del P0:** volver a liquidar el mismo viaje en una liquidación nueva → hoy falla (409 confuso por `P2002`); con el fix debe funcionar, creando un **segundo** `LiquidacionViaje` para el mismo `viajeId`, con `liquidacionId` distinto.
4. `GET /viajes/:id` → debe devolver ambas entradas en `liquidacionesViaje` (el historial completo), cada una con su propio snapshot y su propia `liquidacion` asociada.
5. Repetir el ciclo liquidar→anular→re-liquidar una tercera vez sobre el mismo viaje → confirmar que no es un fix de una sola vez, sino indefinidamente repetible.
6. Concurrencia: dos `POST /liquidaciones` simultáneos incluyendo el mismo viaje → exactamente uno tiene éxito, el otro recibe un error de negocio claro (400), nunca dos éxitos ni un 500.
7. Regresión: `recomputeTotales()`, exports Excel/PDF y el flujo confirmar/pagar/anular siguen funcionando igual sobre liquidaciones con viajes que tienen múltiples episodios históricos — cada `Liquidacion` sigue totalizando solo sus propios `LiquidacionViaje` (por `liquidacionId`), sin mezclar episodios de otras liquidaciones del mismo viaje.
8. Confirmar que ningún otro consumidor del backend/frontend se rompe por el cambio de cardinalidad (ya verificado por grep: solo `viajes.controller.ts:70` depende de la forma singular, y el frontend no la renderiza).

---

## 9. Criterios de aceptación

1. Un viaje puede liquidarse, anularse y volver a liquidarse un número arbitrario de veces, sin ningún error de constraint.
2. Cada episodio de liquidación (anulado o vigente) queda registrado para siempre en `LiquidacionViaje`, con su propio snapshot congelado.
3. Ninguna liquidación histórica se modifica ni se recalcula al crear una nueva sobre el mismo viaje.
4. La protección contra doble liquidación concurrente del mismo viaje sigue vigente (sin regresión), ahora de forma intencional en vez de accidental.
5. Migración puramente aditiva/relajante, sin SQL manual, sin backfill, sin pérdida de datos.
6. Build y typecheck limpios; el plan de pruebas de la sección 8 pasa contra la base local.

---

No implementé nada de esto — queda a la espera de tu revisión y de tu decisión entre la Alternativa C (recomendada) y la Alternativa B (si preferís la garantía a nivel de base de datos) antes de tocar código.

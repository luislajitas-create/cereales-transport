# Diseño Técnico — Bloque 4: Reglas de negocio entre Viajes, Liquidaciones, Facturación y Cobranzas

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Continúa el roadmap de `ROADMAP_SDC_V1.md` después de cerrar el Bloque 3 (3.1 `anticipoGastoId` — commit `f8e2b91`; 3.2 `comisionPct` — commit `ca02fa2`; 3.3 `LiquidacionViaje.viajeId` — commit `28b3e2b`, sin push confirmado todavía).

---

## 0. Alcance

**Pedido explícito:**
1. Auditar `ViajesController` (`create`, `update`, `cambiarEstado`, `cancelar`).
2. Auditar `FacturasController` (`create`, `anular`, `registrarCobranza`, `conciliacion`).
3. Auditar `LiquidacionesController` (`create`, `anular`, `pagar`).
4. Auditar la relación entre `Viaje`, `LiquidacionViaje`, `FacturaViaje`, `Cobranza`.
5. Determinar: campos siempre editables de `Viaje`; campos a bloquear si facturado; campos a bloquear si liquidado; cuándo cancelar un viaje; cuándo anular una factura; si `FacturaViaje` repite el bug histórico de `LiquidacionViaje`; cómo evitar sobrepagos; cómo evitar doble cobranza; cómo permitir anular/revertir cobranzas sin romper historial.

**Explícitamente fuera de alcance** (adyacente, pero no pedido y no necesario para cerrar lo de arriba):
- Unificación de `EstadoFacturacionEnum` (en `Viaje`) y `EstadoFacturaEnum` (en `Factura`) — ya señalado como deuda en `ROADMAP_SDC_V1.md` v1.1 ítem 5 y `BACKEND_REVIEW.md` §1. No lo toco acá porque ninguna de las correcciones de este bloque lo requiere.
- Capa de servicio para eliminar la escritura cruzada entre controllers (`LiquidacionesController`/`FacturasController` escribiendo directamente sobre `Viaje`) — deuda arquitectónica ya listada en el roadmap v1.1 ítem 2, ortogonal a las reglas de negocio de este bloque.
- Paginación, tests automatizados, Swagger — sin relación con este bloque.

**Estado verificado del terreno antes de auditar** (para que las decisiones de abajo no reabran algo ya cerrado): `LiquidacionViaje.viajeId` **ya no** es `@unique` (`schema.prisma:318`, solo `@@index([viajeId])` en línea 328) y `Viaje.liquidacionesViaje` es plural (`schema.prisma:234`) — el fix de Bloque 3.3 (Alternativa C) ya está aplicado en el código actual. Este dato es relevante porque el hallazgo más importante de este Bloque 4 (sección 1.3) es que **el mismo bug existe hoy, sin corregir, del lado de `FacturaViaje`**.

---

## 1. Hallazgos

### 1.1 `ViajesController.update()` — cero bloqueo por estado de facturación/liquidación

`viajes.controller.ts:111-125`. `UpdateViajeDto` (`dto/update-viaje.dto.ts`) acepta y persiste sin ninguna restricción: `fecha`, `cartaPorte`, `ctg`, `cerealId`, `clienteId`, `productorId`, `transportistaId`, `choferId`, `camionId`, `acopladoId`, `origenId`, `destinoId`, `toneladas`, `tarifaTonelada`, `observaciones`. El único campo protegido es `estado` (`delete data.estado` en la línea 114 — no puede cambiarse por acá, tiene su propio endpoint).

El método no lee `viaje.estadoFacturacion` ni `viaje.estadoLiquidacion` en ningún momento — no hay `findUnique` con esos campos previo a autorizar el cambio (solo se los busca si `toneladas`/`tarifaTonelada` vienen en el body, y solo para recalcular `importeTotal`, no para bloquear).

**Consecuencia concreta:** `FacturaViaje.importeViaje` (`facturas.controller.ts:284`) y `LiquidacionViaje.subtotal`/`comisionMonto`/`totalViaje` (`liquidaciones.controller.ts:410-421`) son *snapshots congelados en el momento de crear* la Factura/Liquidación — nunca se resincronizan. Si después de facturar o liquidar un viaje alguien edita `toneladas` o `tarifaTonelada` vía `PATCH /viajes/:id`, `Viaje.importeTotal` cambia pero el snapshot ya emitido no, y a partir de ahí **Dashboard, conciliación y liquidaciones muestran dos números distintos y ninguno de los dos se corrige solo**. Este es el hallazgo P0.2 ya documentado en `QA_INFORME_FINAL.md`, confirmado línea por línea en esta auditoría.

**Dato adicional no documentado antes:** revisé el frontend (`ViajeForm.tsx`) y confirmé que hoy **no existe ningún formulario de edición conectado a `PATCH /viajes/:id`** — el único botón es "Crear viaje" (línea 183), sin ningún flujo de edición en la UI. Es decir, el riesgo hoy solo es explotable por API directa, no por el uso normal de la aplicación — pero eso no lo vuelve menos urgente de cerrar: es la clase de gap que se vuelve un incidente real el día que alguien conecte un formulario de edición (una necesidad de negocio obvia y esperable) sin saber que el backend no lo protege.

### 1.2 `ViajesController.cambiarEstado()` / `cancelar()` — cancelación sin bloqueo por facturación/liquidación

- `cambiarEstado()` (`viajes.controller.ts:128-147`): solo bloquea si `viaje.estado === "CANCELADO"` (línea 132). Las transiciones "hacia adelante" (`PENDIENTE → ... → DESCARGADO`) están correctamente validadas contra `ORDEN_ESTADOS` (líneas 138-145) y no permiten retroceder ni saltar pasos — no hay gap ahí. Pero la rama `nuevo === "CANCELADO"` (línea 135-137) delega a `aplicarCambioEstado` **sin ninguna verificación de `estadoFacturacion`/`estadoLiquidacion`**.
- `cancelar()` (`viajes.controller.ts:149-155`): mismo problema — llama a `aplicarCambioEstado(viaje, "CANCELADO", ...)` directamente, sin leer `estadoFacturacion` ni `estadoLiquidacion` en ningún punto del método.
- **Hay dos endpoints que cancelan un viaje** (`POST /viajes/:id/estado` con `{estado:"CANCELADO"}`, y `POST /viajes/:id/cancelar`), y ninguno de los dos tiene el guard.

**Consecuencia concreta:** hoy se puede cancelar un viaje `DESCARGADO` que ya tiene una `Factura`/`Liquidacion` activa asociada. El viaje queda con `estado: "CANCELADO"` mientras su `Factura.estado` sigue `FACTURADO`/`COBRADO_*` y su `Liquidacion.estado` sigue `CONFIRMADA`/`PAGADA` — una contradicción visible directamente en la UI (`ViajeDetalle.tsx` muestra `estadoLiquidacion` como texto plano) y en cualquier reporte que cruce viajes cancelados con facturación/liquidación. No hay ninguna reversión automática de `Factura.importe`/`Liquidacion.totalBruto`, y el viaje queda "atrapado": la Factura/Liquidación lo sigue contando como válido para siempre, sin mecanismo para destrabarlo salvo anular la Factura/Liquidación entera primero (lo cual sí libera `estadoFacturacion`/`estadoLiquidacion`, pero eso ya lo tiene que hacer el usuario a propósito, no como efecto colateral de cancelar).

### 1.3 `FacturaViaje` — mismo bug histórico que `LiquidacionViaje` (P0, confirmado, sin corregir)

Ya estaba anticipado como "hallazgo colateral" en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` §0 sin auditar en profundidad. Lo audité ahora:

- `schema.prisma:372`: `FacturaViaje.viajeId String @unique` — constraint de unicidad **de por vida**, igual que tenía `LiquidacionViaje.viajeId` antes de 3.3.
- `schema.prisma:235`: `Viaje.facturaViaje FacturaViaje?` — relación singular, consecuencia directa del `@unique`.
- `FacturasController.anular()` (`facturas.controller.ts:292-307`): revierte `Viaje.estadoFacturacion → "PENDIENTE_DE_FACTURAR"` (línea 303) pero **nunca borra ni marca la fila de `FacturaViaje`** — queda viva, apuntando a una `Factura` ya `ANULADO`, ocupando el único cupo permitido por el `@unique` para ese `viajeId`.
- **Confirmado por el mismo razonamiento que en 3.3:** si ese viaje se vuelve a incluir en una `Factura` nueva (el propio sistema lo permite, porque `estadoFacturacion` ya volvió a `PENDIENTE_DE_FACTURAR`), el `INSERT` de `FacturaViaje` en `create()` (`facturas.controller.ts:283`) choca con la fila vieja y la transacción falla con `P2002` (409, vía el `PrismaExceptionFilter` global). **En la práctica: hoy, un viaje cuya factura fue anulada no se puede volver a facturar nunca.**
- **Adicional, no presente en `LiquidacionesController` (ya corregido en 3.3) pero sí en `FacturasController`:** la transición `estadoFacturacion → "FACTURADO"` dentro de `create()` (línea 286) es un `update` **incondicional**, no un `updateMany` con `where: {estadoFacturacion: "PENDIENTE_DE_FACTURAR"}` verificando `count === 1`. Es el mismo patrón de bug de concurrencia (TOCTOU) que 3.1 cerró para `AnticipoGasto.liquidado` y que 3.3 cerró para `Viaje.estadoLiquidacion` — del lado de facturación, sigue abierto. Hoy la única protección accidental contra doble-facturación concurrente del mismo viaje es, otra vez, el `@unique` de `FacturaViaje.viajeId` — la misma constraint que causa el bug de re-facturación de arriba.

**Conclusión: sí, `FacturaViaje` tiene exactamente el mismo problema que tenía `LiquidacionViaje` antes de 3.3, con el mismo agravante de concurrencia que 3.3 ya corrigió del otro lado.** Es candidato directo a la misma técnica (Alternativa C de 3.3), ver sección 3.2.

### 1.4 `FacturasController.anular()` — sin guard de idempotencia ni de estado

Solo valida `factura.cobranzas.length > 0` (línea 297). No valida que `factura.estado !== "ANULADO"` — anular una factura ya anulada no falla, simplemente re-ejecuta la transacción (revierte de nuevo los mismos viajes a `PENDIENTE_DE_FACTURAR`, sin efecto destructivo adicional hoy, pero es un gap de claridad: el usuario no recibe ningún error informativo, y si en el futuro `anular()` gana más efectos secundarios, un doble-anular silencioso se vuelve peligroso).

### 1.5 `FacturasController.registrarCobranza()` — sin tope de sobrepago, sin guard de duplicado, sin reversión individual

- **Sobrepago:** `totalCobrado` se calcula (línea 330) pero nunca se compara contra `factura.importe` antes de persistir — se puede cobrar cualquier importe, incluso muy por encima del total facturado, y el único efecto es que `nuevoEstado` queda en `"COBRADO_TOTAL"` sin ninguna advertencia. Confirmado, coincide con P0.3 de `QA_INFORME_FINAL.md`.
- **Doble cobranza / duplicado accidental:** no hay ningún control de idempotencia — dos `POST /facturas/:id/cobranzas` con los mismos datos (típicamente un doble clic o un reintento de red) crean dos filas de `Cobranza` independientes, ambas cuentan para el total. Ya señalado en QA que el botón del frontend no se deshabilita mientras la request está en curso (gap de UI, complementario a este).
- **Reversión de una cobranza puntual:** `Cobranza` (`schema.prisma:381-392`) no tiene ningún campo de estado (`anulada`, `anuladaMotivo`, etc.) — es una tabla puramente aditiva. Combinado con el guard de `anular()` (que bloquea toda anulación de Factura si `cobranzas.length > 0`, sin importar si esas cobranzas son válidas o fueron un error de carga), **hoy no existe ningún camino para corregir una cobranza mal cargada** salvo edición directa en la base de datos — lo cual no queda auditado ni deja rastro. Es un callejón sin salida real: una vez que existe una sola cobranza (aunque sea un error de tipeo), esa Factura ya no se puede anular nunca por la vía normal.

### 1.6 `LiquidacionesController` — sin hallazgos nuevos más allá de lo ya cerrado en Bloque 3

- `create()` (`:312-454`), `pagar()` (`:471-489`), `anular()` (`:491-537`): ya incorporan las correcciones de 3.1/3.2/3.3 (actualización condicionada de `estadoLiquidacion` con verificación de `count`, resolución de `comisionPct` desde el chofer con auditoría de override, preservación histórica de `LiquidacionViaje`). No encontré una regresión ni un gap nuevo en estos tres métodos en sí mismos.
- El único hallazgo relevante para `LiquidacionesController` en este bloque es el mismo que para `FacturasController`: **no valida el estado del `Viaje` al momento de crear/pagar/anular más allá de lo que ya hace** (`estado: "DESCARGADO"`, `estadoLiquidacion: "PENDIENTE"` en `create()`) — el problema no está en este controller, está en que `ViajesController.update()`/`cancelar()` no respetan esas mismas garantías desde el otro lado (sección 1.1/1.2). Cerrar 4.1 (abajo) cierra este hallazgo también, sin tocar `LiquidacionesController`.

### 1.7 `FacturasController.conciliacion()` — sin hallazgos de integridad, un matiz de exactitud

`conciliacion()` (`:176-236`) agrega `toneladasFacturadas`/`importeFacturado` a partir de `v.facturaViaje` (relación live, singular todavía — ver 1.3) y `v.importeTotal`/`v.toneladas` (campos live del Viaje, no del snapshot `FacturaViaje.importeViaje`). Esto significa que si el hallazgo 1.1 se cierra (bloqueo de edición post-facturación), la conciliación queda automáticamente consistente con el snapshot, porque ambos (`Viaje.importeTotal` y `FacturaViaje.importeViaje`) dejan de poder divergir. No requiere un cambio propio en este método — es un beneficiario directo de cerrar 4.1, lo señalo para que quede explícito que no hace falta tocar `conciliacion()` aparte.

---

## 2. Decisiones de negocio propuestas

### 2.1 Campos de `Viaje`: siempre editables, bloqueados si facturado, bloqueados si liquidado

Principio rector, más amplio que "solo los campos de plata": **los exports/consultas de Factura y Liquidación (`includeFactura`, `includeLiquidacion`) no leen un snapshot completo del viaje — solo el importe está congelado (`FacturaViaje.importeViaje`, `LiquidacionViaje.subtotal/totalViaje`). Todo lo demás (`cereal`, `origen`, `destino`, `transportista`, `camion`, `acoplado`, `fecha`, `cartaPorte`, `ctg`) se lee en vivo desde `Viaje` cada vez que se reabre o reimprime un documento ya emitido.** Por eso el criterio de bloqueo no es solo "afecta el cálculo", es "aparece en un documento fiscal/contable ya emitido, reimprimible en cualquier momento".

| Campo | Siempre editable | Bloqueado si `estadoFacturacion ≠ PENDIENTE_DE_FACTURAR` | Bloqueado si `estadoLiquidacion ≠ PENDIENTE` | Motivo |
|---|---|---|---|---|
| `observaciones` | ✅ | | | No aparece en ningún documento fiscal ni cálculo; es la nota operativa libre. |
| `toneladas`, `tarifaTonelada` (⇒ `importeTotal`) | | ✅ | ✅ | Origen directo de los snapshots `FacturaViaje.importeViaje` y `LiquidacionViaje.subtotal/comisionMonto/totalViaje` — el hallazgo P0.2 central. |
| `cartaPorte`, `ctg` | | ✅ | | Identificadores legales/fiscales (Carta de Porte, CTG) que **`includeFactura` ya trae en vivo** (`facturas.controller.ts:20`, `exportarExcel`/`exportarPdf` los imprimen tal cual). Cambiarlos después de facturar altera silenciosamente lo que muestra un reimpreso. |
| `clienteId` | | ✅ | | La `Factura` está anclada a un `clienteId` propio (`Factura.clienteId`); si el `Viaje.clienteId` cambia después, el viaje queda "facturado a nombre de" un cliente distinto del que dice la propia Factura — contradicción directa. |
| `cerealId`, `origenId`, `destinoId` | | ✅ | ✅ | Ambos `include` (`facturas.controller.ts:20`, `liquidaciones.controller.ts:21`) ya los traen en vivo para exportar; en liquidaciones además aparecen impresos por viaje en el PDF/Excel (`origen`/`destino`, líneas 198-199 y 279 de `liquidaciones.controller.ts`). |
| `fecha` | | ✅ | ✅ | Se usa para elegibilidad por período en `candidatos()`/`conciliacion()` y se imprime por viaje en el export de Liquidación (`liquidaciones.controller.ts:195`, `279`); cambiarla después rompe la trazabilidad de "a qué período pertenece" un episodio ya cerrado. |
| `transportistaId` | | ✅ | ✅ | `includeFactura` ya lo trae en vivo (`facturas.controller.ts:20`); en Liquidaciones es además la clave de agrupación de la propia `Liquidacion.transportistaId` — mismo tipo de contradicción que `clienteId`. |
| `choferId` | | (no aplica directamente) | ✅ | No aparece en `includeFactura`; sí es la clave de `Liquidacion.choferId` y determina `chofer.comisionPct` usado en `create()` — cambiarlo después de liquidar desconecta el histórico de a quién se le pagó realmente. |
| `camionId`, `acopladoId` | | (no aplica directamente) | ✅ | Aparecen impresos en el encabezado del export de Liquidación tipo CHOFER (`datosChoferHeader`, `liquidaciones.controller.ts:61-70`, usa `primerViaje.camion`/`acoplado` en vivo). No aparecen en Facturas. |
| `productorId` | ⚠️ ver nota | | | No aparece en ningún `include`/export de Factura ni Liquidación (confirmado por lectura completa de ambos controllers) — hoy no hay ningún documento cuya integridad dependa de este campo. |

**Nota sobre `productorId`:** es el único campo "de negocio" (no `observaciones`) que hoy no alimenta ningún snapshot ni aparece en ningún export. Mi recomendación es dejarlo siempre editable (no hay ningún documento que se vuelva inconsistente), pero es un punto de decisión explícito para vos: si preferís tratarlo igual que el resto por consistencia de política ("una vez facturado/liquidado, todo se bloquea salvo observaciones"), es una fila más en la tabla, sin costo de diseño adicional.

**Regla operativa derivada:** si un campo está bloqueado por *cualquiera* de las dos columnas (facturado o liquidado), el bloqueo aplica — no son alternativos. Un viaje facturado y liquidado a la vez (el caso normal en el flujo maduro) tiene la unión de ambas restricciones.

**Cómo se implementaría (sin código en este documento, solo el comportamiento):** `update()` haría un único `findUnique` adicional trayendo `estadoFacturacion`/`estadoLiquidacion` (ya trae el viaje completo en la rama de `toneladas`/`tarifaTonelada`, se puede generalizar a todos los casos), calcularía el conjunto de campos bloqueados según la tabla de arriba, y si el body incluye alguno de esos campos con un valor distinto al actual, respondería `400` con un mensaje explícito ("No se puede editar `toneladas` de un viaje ya facturado/liquidado — anule la Factura/Liquidación primero"). Comparar "distinto al actual" (no solo "presente en el body") evita rechazar un `PATCH` que reenvía el mismo valor sin cambiarlo (idempotencia razonable para clientes que mandan el objeto completo).

### 2.2 Cuándo se puede cancelar un viaje

**Decisión propuesta:** un viaje solo puede cancelarse (por cualquiera de los dos endpoints, `POST /viajes/:id/estado` con `CANCELADO` o `POST /viajes/:id/cancelar`) si `estadoFacturacion === "PENDIENTE_DE_FACTURAR"` **y** `estadoLiquidacion === "PENDIENTE"`. Si cualquiera de los dos ya avanzó, la cancelación debe rechazarse con un `400` que indique cuál de las dos ataduras lo bloquea, dejando explícito el camino correcto: anular primero la Factura y/o Liquidación asociada (lo cual ya libera `estadoFacturacion`/`estadoLiquidacion` a su valor inicial, con el código ya existente), y recién entonces cancelar el viaje.

No propongo cascada automática (cancelar el viaje anulando automáticamente su Factura/Liquidación) — ver alternativas rechazadas en 3.1.

### 2.3 Cuándo se puede anular una factura

Regla actual (`cobranzas.length === 0`) se mantiene como base, con dos ajustes:
1. Agregar guard explícito de idempotencia: `if (factura.estado === "ANULADO") throw BadRequestException("La factura ya está anulada")` — mismo criterio que ya usa `LiquidacionesController.anular()` implícitamente al no tener un estado "ya anulada" reversible.
2. Una vez incorporado el Bloque 4.3 (cobranzas anulables individualmente, sección 2.5), el guard pasa de "cero cobranzas" a "cero cobranzas **vigentes** (`anulada: false`)" — una Factura con únicamente cobranzas ya anuladas (correcciones de errores de carga) debe poder anularse igual que si nunca hubiera tenido cobranzas.

### 2.4 Cómo evitar sobrepagos

Agregar validación en `registrarCobranza()`: antes de crear la `Cobranza`, calcular `totalCobradoVigente + Number(body.importe)` contra `factura.importe`; si excede, rechazar con `400` ("El importe supera el saldo pendiente de la factura: saldo actual $X, intentado $Y"). Sin tolerancia de redondeo especial salvo que en la práctica aparezcan diferencias de centavos por el uso de `Float` en el schema (ver riesgo 5.6) — si eso ocurre, tratarlo aparte como un problema de precisión numérica, no relajando la regla de negocio.

**Decisión abierta para vos:** ¿el sistema debe permitir *alguna* forma de sobrepago intencional (anticipo del cliente, nota de crédito a favor)? Si la respuesta es sí, es una funcionalidad nueva (registrar el excedente como saldo a favor del cliente, aplicable a una factura futura) — no un ajuste de este bloque, que asume que hoy esa necesidad no existe (no hay ningún concepto de "saldo a favor" en el schema actual).

### 2.5 Cómo evitar doble cobranza

Dos capas, complementarias:
1. **Backend, heurística barata:** rechazar (`409`) si ya existe una `Cobranza` vigente para esa `facturaId` con el mismo `(fecha, importe, medioPago)` — el patrón más probable de un doble clic o un reintento de red accidental. No bloquea pagos legítimos en cuotas del mismo importe en fechas distintas.
2. **Frontend (fuera del código de este backend, pero parte de la misma corrección de negocio ya señalada en QA):** deshabilitar el botón de "Registrar cobranza" mientras la request está en curso — cierra el caso más común (doble clic) antes de que llegue al backend.

La combinación de ambas es más robusta que cualquiera de las dos por separado — el frontend por sí solo no protege contra un reintento automático de red; el backend por sí solo no evita el efecto (aunque sí lo bloquea) de un usuario haciendo doble clic y viendo un error confuso.

**No recomiendo** una clave de idempotencia (`Idempotency-Key`) completa en este bloque — es la solución más robusta a nivel de industria, pero requiere cambios de contrato API (header nuevo) y de frontend coordinados; queda como mejora de Bloque 4.4 (sección 4) si se decide ir más allá del heurístico.

### 2.6 Cómo permitir anulación/reversión de cobranzas sin romper historial

Mismo patrón arquitectónico que el codebase ya usa dos veces (`AnticipoGasto.anulado`/`anuladoMotivo`, y el diseño ya aprobado de `LiquidacionViaje` que nunca borra filas): **agregar campos de estado, nunca borrar.**

- `Cobranza` gana `anulada Boolean @default(false)`, `anuladaMotivo String?`, `anuladaFecha DateTime?`.
- Nuevo endpoint `POST /facturas/:id/cobranzas/:cobranzaId/anular` (roles `FACTURACION`, `ADMINISTRADOR`, igual que el resto del controller): marca `anulada: true` con motivo, y recalcula `Factura.estado` usando exactamente la misma fórmula que ya usa `registrarCobranza()` (línea 331) pero sumando solo `cobranzas.filter(c => !c.anulada)`.
- El guard de `anular()` de Factura (sección 2.3) se ajusta para mirar solo cobranzas vigentes.
- Ninguna fila de `Cobranza` se borra jamás — un auditor puede reconstruir el historial completo de intentos de cobro, incluidos los corregidos.

---

## 3. Alternativas evaluadas

### 3.1 Cancelación de viaje ya facturado/liquidado

- **Alternativa A — Bloquear y exigir anular primero (recomendada, es 2.2).** Simple, reutiliza guards ya existentes (`anular()` de Factura/Liquidación ya libera el estado), no introduce acoplamiento nuevo entre controllers.
- **Alternativa B — Cascada automática:** `cancelar()` anula automáticamente la Factura/Liquidación asociada como efecto colateral, antes de cancelar el viaje. **Rechazada:** introduce escritura cruzada oculta entre `ViajesController` y los otros dos módulos (exactamente el patrón de acoplamiento que `BACKEND_REVIEW.md` §2 ya señala como riesgo alto y que el roadmap v1.1 ítem 2 quiere *reducir*, no aumentar). Además, anular una Factura/Liquidación es una decisión de negocio con reglas propias (guard de cobranzas, guard de `PAGADA`) que no debería dispararse implícitamente desde una acción sobre el viaje — el usuario de Facturación/Liquidaciones debe decidirlo explícitamente, no descubrirlo como efecto secundario.
- **Alternativa C — Permitir cancelar siempre, dejando la inconsistencia documentada:** statu quo. Rechazada, es exactamente el hallazgo 1.2.

### 3.2 `FacturaViaje.viajeId` — mismo tratamiento que `LiquidacionViaje`

Aplican, punto por punto, las mismas tres alternativas ya evaluadas y decididas en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` §1, ahora del lado de Facturas:

- **Alternativa A — Purgar la fila al anular:** rechazada, mismo motivo (pierde el snapshot histórico `importeViaje` de una factura anulada).
- **Alternativa B — Constraint única parcial + columna `vigente`:** requiere SQL manual (índice parcial), evitado deliberadamente en 3.3 a favor de C.
- **Alternativa C — Quitar `@unique`, relación uno-a-muchos, mover la protección de concurrencia a `Viaje.estadoFacturacion` (recomendada, consistente con 3.3):**
  - `FacturaViaje.viajeId`: quitar `@unique`, agregar `@@index([viajeId])`.
  - `Viaje.facturaViaje FacturaViaje?` → `Viaje.facturasViaje FacturaViaje[]` (rename + cambio de cardinalidad, mismo patrón exacto que ya se hizo para `liquidacionesViaje` en 3.3).
  - `FacturasController.create()`: la transición `estadoFacturacion → "FACTURADO"` (línea 286) pasa a `tx.viaje.updateMany({where:{id:v.id, estadoFacturacion:"PENDIENTE_DE_FACTURAR"}, data:{estadoFacturacion:"FACTURADO"}})`, verificando `count === 1` antes de crear el `FacturaViaje` — mismo mecanismo ya probado en 3.1/3.3.
  - `FacturasController.anular()`: **sin cambios** — ya hace lo correcto (revertir `estadoFacturacion`, dejar `FacturaViaje` intacto).
  - `ViajesController.findOne()` (`viajes.controller.ts:71`): renombrar el `include` de `facturaViaje` a `facturasViaje`.
  - Migración 100% expresable en el DSL de Prisma, sin SQL manual — consistente con la preferencia ya marcada por vos en Bloque 3 ("no escribir migraciones complejas con SQL manual salvo que resulten estrictamente necesarias").

**Recomendación: Alternativa C**, por exactamente los mismos motivos que en 3.3 (reutiliza una técnica ya implementada y validada en este mismo código, no introduce SQL manual, preserva historial completo).

### 3.3 Sobrepago: bloqueo estricto vs. tolerancia configurable

- **Bloqueo estricto (recomendada, es 2.4):** rechaza cualquier cobranza que exceda el saldo. Simple, sin ambigüedad, cero riesgo de sobre-cobro silencioso.
- **Tolerancia configurable (ej. permitir hasta 1% o $X de exceso por redondeo):** más flexible, pero introduce un parámetro de negocio nuevo sin que haya evidencia de que el problema real sea de redondeo y no de error de tipeo. Queda descartada salvo que la Alternativa recomendada, en la práctica de uso, genere fricción real por diferencias de centavos (ver riesgo 5.6) — en ese caso se evalúa aparte, con datos reales.

### 3.4 Doble cobranza: heurística de campos vs. idempotency-key

Ver sección 2.5 — heurística recomendada para este bloque, idempotency-key como mejora de Bloque 4.4.

---

## 4. Sub-bloques recomendados

| Sub-bloque | Contenido | Requiere schema/migración | Complejidad |
|---|---|---|---|
| **4.1** | Bloqueo de edición (`update()`) y cancelación (`cambiarEstado()`/`cancelar()`) de viajes ya facturados/liquidados, según la tabla de la sección 2.1 y la regla de 2.2. | No — 100% lógica de aplicación. | Baja/Media (la lógica en sí es simple; la superficie de campos a cubrir es la parte laboriosa). |
| **4.2** | `FacturaViaje.viajeId` — Alternativa C (idéntica técnica a 3.3), + cierre del guard de concurrencia en `FacturasController.create()`, + guard de idempotencia en `anular()` (sección 2.3, punto 1). | Sí — migración aditiva/relajante, sin SQL manual, sin backfill (mismo perfil de riesgo que 3.3). | Baja. |
| **4.3** | Cobranzas: tope de sobrepago (2.4), guard anti-duplicado (2.5), reversión individual de cobranza + ajuste del guard de `anular()` de Factura (2.6). | Sí — 3 columnas nuevas en `Cobranza` (`anulada`, `anuladaMotivo`, `anuladaFecha`), todas con default, aditivas. | Media (nuevo endpoint + recálculo de estado + ajuste de un guard existente). |
| **4.4** (opcional, menor prioridad) | Idempotency-key real para `registrarCobranza` (frontend + backend) y deshabilitar el botón de envío mientras está en curso (frontend puro, ya señalado en QA como gap de UI). | No. | Baja, pero cruza frontend/backend. |

**Orden de implementación recomendado:** 4.1 → 4.2 → 4.3 → 4.4.
- 4.1 primero: es el hallazgo de mayor alcance (afecta Dashboard, conciliación y liquidaciones a la vez), no requiere migración, y cierra el riesgo antes de que exista un formulario de edición de viajes en el frontend (que hoy no existe, pero es una necesidad de negocio obvia y esperable pronto).
- 4.2 segundo: reutiliza una técnica ya probada en 3.3, bajo riesgo, aditivo — conviene cerrarlo mientras el patrón está fresco.
- 4.3 tercero: es el que más lógica nueva introduce (nuevo endpoint, nuevo campo, recálculo) — se beneficia de hacerse después de estabilizar 4.1/4.2.
- 4.4 último: mejora incremental, no bloqueante para ningún otro sub-bloque.

---

## 5. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | El bug de `FacturaViaje.viajeId` (hallazgo 1.3) ya existe hoy en producción, sin relación con este diseño — cualquier intento real de anular+re-facturar un viaje ya está fallando o va a fallar. | Alta (ya activo, no hipotético) | Priorizar 4.2 cuanto antes; no depende de 4.1 ni 4.3. |
| 2 | Ampliar la superficie de campos bloqueados en `update()` (sección 2.1) puede romper un flujo operativo legítimo hoy no contemplado (ej. corregir un typo de `ctg` en un viaje ya facturado por un error de tipeo real, no un intento de fraude). | Media | El mensaje de error debe ser explícito sobre *qué* campo y *por qué* está bloqueado, y el camino de escape (anular Factura/Liquidación primero) debe quedar documentado en la UI cuando se implemente. Si aparece un caso de uso legítimo de corrección post-facturación, tratarlo como una excepción de negocio auditada (mismo patrón que el override de `comisionPct` en 3.2: permitir con `AuditLog`), no como una reversión del bloqueo. |
| 3 | Migración de `FacturaViaje` (4.2) — mismo riesgo que 3.3: revertir el schema (`DROP` + re-agregar `@unique`) deja de ser trivial en cuanto exista más de una fila `FacturaViaje` por `viajeId` en la práctica. | Baja (esperado, no es una regresión) | Documentar explícitamente que el rollback de schema requiere que, para ese momento, ningún viaje haya sido re-facturado más de una vez — igual que ya se documentó para 3.3. |
| 4 | El guard anti-doble-cobranza por `(fecha, importe, medioPago)` (2.5) puede bloquear un caso legítimo raro (dos cuotas iguales el mismo día, mismo medio de pago). | Baja | Agregar una vía de override explícito (ej. un flag `forzar: true` en el body) que un usuario de Facturación pueda usar a sabiendas, dejando rastro en `observacion` o `AuditLog` si se usa. |
| 5 | Cerrar 4.3 sin cerrar 4.1 primero deja una ventana donde se puede anular una cobranza individual de una Factura cuyo viaje subyacente ya fue editado por el gap de 1.1 (si 4.1 no está desplegado todavía) — inconsistencia compuesta. | Baja | Ya contemplado en el orden recomendado de la sección 4 (4.1 antes que 4.3); no bloquea si por alguna razón se decide un orden distinto, pero conviene saberlo. |
| 6 | Los importes en todo el schema (`Viaje.importeTotal`, `Factura.importe`, `Cobranza.importe`, etc.) son `Float`, no `Decimal` — el tope de sobrepago (2.4) y el guard de duplicado por importe exacto (2.5) pueden toparse con diferencias de precisión de punto flotante en sumas repetidas. | Media (preexistente, no introducida por este bloque) | No es parte de resolver en este diseño (cambiar `Float` a `Decimal` es una migración de tipo de columna, mucho más invasiva, afecta a todos los módulos financieros). Si en la práctica aparecen falsos positivos/negativos por redondeo, comparar con una tolerancia mínima (ej. `Math.abs(diferencia) < 0.01`) en vez de igualdad estricta — señalar como nota de implementación cuando se escriba el código, no rediseñar el schema por esto. |

---

## 6. Plan de pruebas

**4.1 — Bloqueo de edición/cancelación:**
1. Editar `observaciones` de un viaje `FACTURADO` y `LIQUIDADO` a la vez → éxito, sin restricciones.
2. Editar `toneladas` de un viaje `PENDIENTE_DE_FACTURAR`/`PENDIENTE` (ninguno de los dos aplicado) → éxito, `importeTotal` se recalcula igual que hoy.
3. Editar `toneladas` de un viaje ya `FACTURADO` (pero `estadoLiquidacion: PENDIENTE`) → `400`, mensaje explícito.
4. Editar `choferId` de un viaje ya `LIQUIDADO` (pero `estadoFacturacion: PENDIENTE_DE_FACTURAR`) → `400`.
5. Reenviar el mismo valor ya existente de un campo bloqueado (sin cambiarlo) sobre un viaje facturado → éxito (no debe rechazar un no-cambio).
6. Cancelar un viaje `PENDIENTE_DE_FACTURAR`/`PENDIENTE` → éxito, igual que hoy.
7. Cancelar un viaje `FACTURADO` → `400` con mensaje indicando que debe anularse la Factura primero. Repetir para `LIQUIDADO`.
8. Anular la Factura de un viaje `FACTURADO`, y confirmar que **después** de eso, cancelar el mismo viaje funciona (camino de escape completo).
9. Probar el caso anterior también vía `POST /viajes/:id/estado` con `{estado:"CANCELADO"}` (el segundo endpoint que cancela) — debe tener el mismo guard que `/cancelar`.

**4.2 — `FacturaViaje`:**
10. Facturar un viaje, anular esa Factura, volver a facturar el mismo viaje en una Factura nueva → hoy falla (bug 1.3); con el fix debe funcionar, creando un segundo `FacturaViaje` para el mismo `viajeId`.
11. `GET /viajes/:id` → debe devolver `facturasViaje` (plural) con ambos episodios históricos.
12. Concurrencia: dos `POST /facturas` casi simultáneos incluyendo el mismo viaje → exactamente uno tiene éxito, el otro recibe un error de negocio claro, nunca dos éxitos ni un 500.
13. Repetir el ciclo facturar→anular→re-facturar una tercera vez sobre el mismo viaje → confirmar que es indefinidamente repetible, no un fix de una sola vez.
14. Regresión: `conciliacion()` sigue agregando correctamente toneladas/importe facturado usando la relación ya renombrada.

**4.3 — Cobranzas:**
15. Registrar una cobranza por el importe exacto de la Factura → `estado = COBRADO_TOTAL`.
16. Intentar registrar una cobranza que exceda el saldo pendiente → `400`, sin persistir la fila.
17. Registrar dos cobranzas parciales que sumen exactamente el importe → `COBRADO_TOTAL`, sin rechazo (el tope se evalúa contra el saldo restante, no contra el importe total en cada llamada individual).
18. Registrar una cobranza, e inmediatamente repetir la misma request (mismo `fecha`/`importe`/`medioPago`) → `409` en el segundo intento.
19. Registrar dos cobranzas del mismo importe pero fechas distintas → ambas se aceptan (no debe ser un falso positivo del guard de duplicado).
20. Anular una cobranza individual → `Factura.estado` se recalcula correctamente considerando solo las vigentes (ej. de `COBRADO_TOTAL` vuelve a `COBRADO_PARCIAL` o `FACTURADO` según corresponda).
21. Con una Factura que tiene una única cobranza y esa cobranza se anula → `anular()` de la Factura ahora debe permitirse (antes estaba bloqueada).
22. Intentar anular una Factura con al menos una cobranza vigente (no anulada) → sigue bloqueado, igual que hoy.
23. Intentar anular una Factura ya `ANULADO` → `400` explícito (antes no fallaba, solo era redundante).

**Regresión transversal (todas las suites anteriores del Bloque 3, para confirmar que 4.1/4.2/4.3 no las rompen):**
24. Ciclo completo de liquidación (crear → confirmar → pagar) sobre un viaje no tocado por este bloque → sin cambios de comportamiento.
25. `comisionPct` override y su registro en `AuditLog` → sin cambios de comportamiento.
26. Re-liquidar un viaje después de anular su liquidación (fix de 3.3) → sigue funcionando, sin interferencia de los nuevos guards de 4.1.

---

## 7. Plan de rollback

**Por sub-bloque, no uno solo para todo el Bloque 4** (se implementan y despliegan por separado):

- **4.1 (sin schema):** revertir el commit/deploy deja `update()`/`cambiarEstado()`/`cancelar()` exactamente como están hoy (sin guards). No hay dato que reconciliar — es un rollback de código puro, inmediato.
- **4.2 (schema aditivo/relajante):** mismo perfil que el rollback ya documentado para 3.3 — revertir el schema (`DROP INDEX` + re-agregar `@unique` a `FacturaViaje.viajeId`) es seguro **solo si**, para ese momento, ningún viaje fue re-facturado más de una vez desde que se desplegó el fix; si ocurrió, el rollback de schema falla explícitamente (Postgres rechaza el `CREATE UNIQUE INDEX` con duplicados) y requiere resolución manual de cuál episodio "gana" el cupo — igual que en 3.3. Rollback de código (`create()`/`findOne()`) es inmediato y no destructivo. Orden si hay que revertir ambos: primero código, después schema.
- **4.3 (schema aditivo, columnas nuevas con default):** revertir el schema (quitar `anulada`/`anuladaMotivo`/`anuladaFecha` de `Cobranza`) es seguro solo si no importa perder el rastro de qué cobranzas fueron anuladas durante la ventana en que la funcionalidad estuvo activa (exportar/loguear esos registros antes de revertir, si se quiere conservar la información). Revertir el código deja `registrarCobranza()`/`anular()` de Factura sin el tope de sobrepago ni el guard de duplicado — comportamiento idéntico al actual, sin pérdida de las cobranzas ya registradas (son aditivas).
- **4.4:** rollback trivial, sin datos involucrados.

Ningún rollback de este bloque implica pérdida de datos de negocio (viajes, facturas, liquidaciones, cobranzas) — en el peor caso se pierde la información nueva agregada durante la ventana en que cada sub-bloque estuvo activo.

---

## 8. Criterios de aceptación

1. Un viaje ya facturado no puede editarse en `toneladas`, `tarifaTonelada`, `cartaPorte`, `ctg`, `clienteId`, `cerealId`, `origenId`, `destinoId`, `fecha` ni `transportistaId` — cualquier intento responde `400` explícito. `observaciones` (y, según se decida, `productorId`) siguen siempre editables.
2. Un viaje ya liquidado no puede editarse en los mismos campos financieros/de identidad más `choferId`, `camionId`, `acopladoId` — mismo criterio de error.
3. Un viaje solo puede cancelarse (por cualquiera de los dos endpoints) si no está ni facturado ni liquidado; el mensaje de error indica el camino correcto (anular Factura/Liquidación primero).
4. Un viaje puede facturarse, anularse esa factura, y volver a facturarse un número arbitrario de veces, sin ningún error de constraint — cada episodio queda registrado para siempre en `FacturaViaje`.
5. La protección contra doble-facturación concurrente del mismo viaje sigue vigente, ahora de forma intencional (guard de aplicación) en vez de accidental (constraint que además causaba el bug).
6. `registrarCobranza()` rechaza cualquier importe que exceda el saldo pendiente de la Factura, y rechaza un duplicado exacto reciente `(fecha, importe, medioPago)`.
7. Una cobranza individual puede anularse sin afectar las demás; `Factura.estado` se recalcula correctamente considerando solo cobranzas vigentes; una Factura cuyas cobranzas fueron todas anuladas puede anularse igual que si nunca hubiera tenido cobranzas.
8. Ninguna liquidación o factura histórica cambia de valor retroactivamente por los cambios de este bloque — todas las correcciones son hacia adelante (nuevas operaciones), nunca recalculan snapshots ya emitidos.
9. Build y typecheck limpios; el plan de pruebas de la sección 6 pasa contra la base local.
10. Cero cambios de lógica en `LiquidacionesController` (ya cerrado en Bloque 3) salvo los que resulten, sin tocarlo directamente, de que `ViajesController` ahora respete sus mismas garantías (hallazgo 1.6).

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

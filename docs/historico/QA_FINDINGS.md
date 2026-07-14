# Hallazgos de QA funcional — SDC v1.0

Documento vivo de backlog de QA. Se completa módulo por módulo durante la auditoría funcional post-deploy. Cada hallazgo sigue el formato: Módulo / Descripción / Severidad / Impacto / Causa probable / Recomendación.

Metodología: revisión de código (frontend + backend + `schema.prisma`), no ejecución en vivo contra la UI (Browser Tools no reflejaba la sesión autenticada de forma confiable — limitación documentada en la sesión). Ningún hallazgo implicó cambios de código; nada de lo listado acá fue corregido todavía.

---

## Módulo: Catálogos (Clientes, Productores, Transportistas, Choferes, Vehículos, Cereales, Ubicaciones)

Fecha de auditoría: 2026-07-05.

### Transversales (aplican a los 7 catálogos)

1. **Sin validación de backend (DTOs).** Todos los controllers reciben `@Body() body: any`; el `ValidationPipe({whitelist:true, transform:true})` global no tiene efecto sin una clase tipada. — **Crítica.** Impacto: no hay validación real de formato/tipos/requeridos en el servidor, solo el `required` de HTML en el frontend, evitable con cualquier cliente HTTP. Causa: controllers escritos con `any` en vez de DTOs. Recomendación: crear DTOs con `class-validator` por entidad.

2. **Sin paginación en ningún listado (`findMany` sin `take`/`skip`).** — **Alta** (performance a futuro). Impacto: cada pantalla trae y renderiza la tabla completa; degrada con el volumen. Recomendación: paginación server-side + client-side.

3. **Sin búsqueda, filtro ni ordenamiento configurable en ninguna de las 7 pantallas.** — **Media** (UX). Recomendación: buscador client-side como mínimo.

4. **Errores de constraint única devuelven 500 crudo ("Internal server error").** Ningún controller captura `P2002` de Prisma. — **Alta.** Impacto: mensaje técnico en vez de "ya existe un registro con ese CUIT/CUIL/patente". Recomendación: `ExceptionFilter` global para `PrismaClientKnownRequestError`.

### Por módulo

- **Clientes** — Edición y baja (soft-delete) existen en el backend (`PATCH`/`DELETE /clientes/:id`) pero no hay ningún botón en `Clientes.tsx`. **Media.** Recomendación: agregar UI de edición/baja.

- **Productores** — `cuit` es `String?` sin `@unique`; se pueden duplicar productores sin aviso. **Media.** Además, `PATCH /productores/:id` existe sin UI de edición en `Catalogos.tsx`. Recomendación: agregar `@unique` a `cuit` (cuando presente) y UI de edición.

- **Transportistas** — Igual patrón que Clientes: `PATCH`/`DELETE` existen sin UI. **Media.**

- **Choferes** — Solo `cuil` es `@unique`; `dni` no tiene constraint, permitiendo duplicar la misma persona física con distinto CUIL tipeado. **Media.** Además, no hay `DELETE` en el backend en absoluto (ni soft delete), y `PATCH` existe sin UI de edición. **Media.**

- **Vehículos** — En `Transportistas.tsx` (`agregarVehiculo`), `Number(capacidadKg) || null` convierte silenciosamente un valor no numérico a `null` sin avisar al usuario. **Alta** (data integrity/UX). No hay `DELETE` en el backend; `PATCH` existe sin UI de edición. **Media.**

- **Cereales** — Solo `GET`/`POST` en el backend, sin `PATCH` ni `DELETE`; un error de tipeo en el nombre queda permanente. **Baja.**

- **Ubicaciones** — `nombre` **no tiene `@unique`** (a diferencia de Cereal); se pueden crear ubicaciones exactamente duplicadas sin restricción. **Media/Alta.** Tampoco tiene `PATCH`/`DELETE`. Recomendación: constraint compuesta (`nombre` + `localidad`) y `PATCH` para corregir errores.

### Resumen de severidad — Catálogos

| Severidad | Cantidad |
|---|---|
| Crítica | 1 |
| Alta | 4 |
| Media | 7 |
| Baja | 2 |

---

## Módulo: Viajes

Fecha de auditoría: 2026-07-05.

### Alta de viaje (`POST /viajes`, `ViajeForm.tsx`)

1. **Sin validación numérica de `toneladas`/`tarifaTonelada`.** El backend hace `Number(body.toneladas) * Number(body.tarifaTonelada)` sin chequear `isNaN` ni rango. El input del frontend es `type="number"` sin `min`, por lo que además acepta valores negativos o cero sin bloqueo. — **Alta.** Impacto: un viaje con `toneladas`/`tarifaTonelada` negativos, cero o `NaN` (si se bypasea el frontend) genera un `importeTotal` incorrecto que se propaga a Dashboard, Liquidaciones y Facturación (todos suman `importeTotal`/`toneladas` directamente). Causa probable: falta de DTO/validación server-side (mismo patrón que Catálogos). Recomendación: validar `toneladas > 0` y `tarifaTonelada > 0` en el backend, y agregar `min="0.01"` en el input.

2. **`origenId` y `destinoId` pueden ser iguales.** Ni el frontend ni el backend impiden seleccionar la misma ubicación como origen y destino. — **Media.** Impacto: viajes sin sentido operativo (no hubo transporte real) quedan registrados sin ninguna alerta. Recomendación: validar `origenId !== destinoId` en el backend.

3. **Sin validación cruzada de `choferId`/`camionId`/`acopladoId` contra `transportistaId`.** El frontend filtra los combos por transportista seleccionado (`GET /choferes?transportistaId=...`), pero el backend (`ViajesController.create`) no revalida esa relación — un llamado directo a la API podría asignar un chofer de un transportista y un camión de otro. — **Media.** Impacto: inconsistencia de datos si se usa la API fuera del frontend (Postman, integraciones futuras). Recomendación: validar en el backend que chofer/camión/acoplado pertenezcan al `transportistaId` recibido.

4. **Sin validación de tipo de vehículo en `camionId`/`acopladoId`.** El backend no verifica que el vehículo asignado a `camionId` tenga `tipo: CAMION` ni que `acopladoId` tenga `tipo: ACOPLADO` — el frontend sí filtra por tipo en los `<select>`, pero de nuevo es una validación solo de UI. (Ya estaba anotado como pendiente en `ROADMAP_SDC_V1.md` §4 v1.1 ítem 7 — se confirma con esta auditoría). — **Media.**

5. **`ctg` es `@unique`** — un alta duplicada cae en el mismo patrón transversal de Catálogos: 500 crudo en vez de mensaje claro ("Ya existe un viaje con ese CTG"). — **Alta** (mismo hallazgo transversal, aplica también acá).

### Edición (`PATCH /viajes/:id`)

6. **No hay ninguna guarda que impida editar `toneladas`/`tarifaTonelada`/`cerealId`/`clienteId`/etc. de un viaje ya facturado o liquidado.** `LiquidacionViaje.totalViaje` y `FacturaViaje.importeViaje` son **snapshots propios** (columnas `Float` propias, no calculadas en vivo desde `Viaje`). Si se edita el viaje después de generada la liquidación/factura, el viaje queda con un importe distinto al que ya fue facturado/liquidado, sin ninguna reconciliación ni aviso. — **Crítica.** Impacto: divergencia contable silenciosa entre lo que dice el viaje y lo que ya se facturó/liquidó realmente; el Dashboard (que suma `importeTotal` en vivo desde `Viaje`, no desde `FacturaViaje`/`LiquidacionViaje`) mostraría el monto nuevo mientras la factura real quedó con el monto viejo. Nota: hoy no hay ningún formulario de edición en el frontend (`ViajeDetalle.tsx` no tiene UI de edición), así que el riesgo práctico depende de que se use la API directamente o se agregue esa UI en el futuro — pero el backend no tiene ninguna protección propia. Causa probable: el endpoint de edición se escribió sin considerar el ciclo de vida financiero del viaje. Recomendación: bloquear edición de campos financieros/de identidad cuando `estadoFacturacion != PENDIENTE_DE_FACTURAR` o `estadoLiquidacion != PENDIENTE`, o versionar el cambio con reconciliación explícita.

7. **Bug de falsy en el cálculo de `importeTotal` al editar.** `if (data.toneladas || data.tarifaTonelada)` no dispara si se edita `toneladas` a exactamente `0` (falsy en JS) sin tocar `tarifaTonelada` — el campo se actualiza a `0` pero `importeTotal` no se recalcula, quedando desincronizado. — **Media** (edge case, pero real). Recomendación: usar `data.toneladas !== undefined || data.tarifaTonelada !== undefined`.

### Cambio de estados (`POST /:id/estado`, `POST /:id/cancelar`)

8. **Se puede cancelar un viaje ya `DESCARGADO`, facturado y/o liquidado, sin ningún chequeo de `estadoFacturacion`/`estadoLiquidacion`.** Tanto `POST /:id/estado` con `{estado:"CANCELADO"}` (que además bypasea completamente la validación secuencial de `ORDEN_ESTADOS`) como `POST /:id/cancelar` solo verifican que el viaje no esté ya `CANCELADO` — no verifican si ya fue facturado o liquidado. — **Crítica.** Impacto: un viaje puede terminar en estado `CANCELADO` mientras su factura y/o liquidación siguen vigentes y activas, sin ninguna reversión automática ni alerta — inconsistencia de negocio directa entre "el viaje no se hizo" y "ya le cobramos al cliente por él". Este es el mismo patrón de bug de integridad cruzada entre módulos que ya causó el bug real de `LiquidacionesController.anular()` documentado en `PROJECT_STATUS.md` (corregido el 2026-07-03) — se repite acá sin corregir. Nota: la UI (`ViajeDetalle.tsx`) oculta el botón "Cancelar viaje" cuando `estado === "DESCARGADO"`, lo cual mitiga el caso más común en el uso normal, pero es una guarda **solo de frontend** — el endpoint sigue abierto. Recomendación: bloquear en el backend la cancelación (y cualquier cambio de estado) de viajes con `estadoFacturacion != PENDIENTE_DE_FACTURAR` o `estadoLiquidacion != PENDIENTE`, salvo un flujo explícito de reversión.

9. **Progresión de estados es estrictamente secuencial (no se puede saltar ni retroceder), lo cual es correcto**, pero el "salto" especial a `CANCELADO` (que bypasea `ORDEN_ESTADOS`) no está sujeto a los mismos chequeos que el resto — ver hallazgo 8.

### Anticipos relacionados

10. **`AnticipoGasto.viajeId` es opcional y no se valida contra el viaje al crear el anticipo.** `AnticiposController.create()` no verifica que, si se pasa `viajeId`, el `choferId`/`transportistaId` del anticipo coincidan con los del viaje referenciado. — **Media.** Impacto: un anticipo podría quedar vinculado a un viaje operado por un chofer/transportista distinto al que realmente recibió el anticipo, generando confusión en la trazabilidad "anticipos por viaje" que se muestra en `ViajeDetalle.tsx`. Recomendación: validar la coincidencia chofer/transportista al asociar `viajeId`.

### Impacto en Dashboard

11. **El Dashboard sostiene todos sus KPIs financieros en datos "en vivo" de `Viaje`/`Factura`/`Liquidacion`, sin ningún control de que esos valores permanezcan consistentes entre sí** una vez que un viaje ya fue facturado/liquidado y luego editado o cancelado (ver hallazgos 6 y 8). — **Alta** (consecuencia directa de 6 y 8, no un bug nuevo). Ya se documentó por separado que el Dashboard no distingue tipos de error (mensaje genérico "No se pudo cargar el resumen").

### Impacto en Liquidaciones

12. **`LiquidacionViaje.totalViaje` es un snapshot desacoplado del viaje** (ver hallazgo 6) — la liquidación no se recalcula ni se invalida si el viaje subyacente cambia después. Esto es correcto como diseño de snapshot contable, **siempre que** se bloquee la edición del viaje origen después de liquidado (hallazgo 6, no implementado hoy).

### Impacto en Facturación

13. **`FacturaViaje.importeViaje` es igualmente un snapshot** (ver hallazgo 6) con el mismo riesgo: sin bloqueo de edición/cancelación del viaje origen, la factura ya emitida puede divergir silenciosamente del estado actual del viaje que la originó.

### Resumen de severidad — Viajes

| Severidad | Cantidad |
|---|---|
| Crítica | 2 (edición sin guarda tras facturar/liquidar; cancelación sin guarda tras facturar/liquidar) |
| Alta | 3 (validación numérica ausente, CTG duplicado → 500 crudo, impacto agregado en Dashboard) |
| Media | 5 (origen=destino, validación cruzada chofer/vehículo/transportista, tipo de vehículo, bug falsy en recálculo, anticipo sin validar contra viaje) |
| Baja | 0 |

---

---

## Módulo: Anticipos

Fecha de auditoría: 2026-07-05. Prioridad explícita de esta pasada: riesgos de integridad contable/financiera.

### Integridad contable/financiera (prioridad máxima)

1. **`LiquidacionesController.anular()` revierte `AnticipoGasto.liquidado` por `viajeId`, no por el id del anticipo — riesgo de contaminar liquidaciones ajenas cuando un viaje tiene más de un anticipo.** `LiquidacionMovimiento` no guarda `anticipoGastoId` (solo `viajeId`, opcional). Al anular una liquidación, el código junta los `viajeId` de sus movimientos y hace `updateMany({ where: { liquidado: true, viajeId: { in: anticipoViajeIds } }, data: { liquidado: false } })`. Si un mismo viaje tiene 2+ anticipos repartidos en liquidaciones **distintas** (ej. uno ya `PAGADA` y otro en la que se está anulando), anular la liquidación A revierte a `liquidado: false` **también** el anticipo que pertenece a la liquidación B, aunque B siga vigente/pagada. — **Crítica.** Impacto: un anticipo que en realidad ya fue pagado en otra liquidación vuelve a aparecer como "pendiente de liquidar" en el Dashboard y en `Anticipos.tsx`, pudiendo ser incluido *de nuevo* en una liquidación futura → doble descuento del mismo anticipo. Este es exactamente el bug real ya documentado y parcialmente corregido el 2026-07-03 (`PROJECT_STATUS.md` punto 8, commit `acd156c`): ese fix solo cerró el caso de liquidaciones **sin movimientos** (`updateMany` sin ningún filtro); el caso general de viajes con múltiples anticipos en liquidaciones distintas **sigue sin resolver**, confirmado en el código actual. Recomendación: agregar `anticipoGastoId` a `LiquidacionMovimiento` y revertir por ese id exacto, no por `viajeId` (ya estaba planificado en `ROADMAP_SDC_V1.md` como deuda diferida — esta auditoría confirma que sigue activa y la eleva a crítica por el riesgo de doble descuento).

2. **`importe` de un anticipo no se valida en rango ni signo.** `AnticiposController.create()` hace `Number(body.importe)` sin chequear que sea `> 0`. — **Crítica.** Impacto: un anticipo cargado en cero o en negativo altera silenciosamente `totalAnticipos`/`netoPagar` en `recomputeTotales()` de la liquidación (un importe negativo funcionaría como un crédito oculto a favor del chofer/transportista, sin ningún rastro de que fue intencional). Recomendación: validar `importe > 0` en el backend.

3. **`TipoGasto.afectaLiquidacion` existe en el schema y se puebla en el seed, pero no se lee en ningún lugar del código** (`grep` sin resultados en `backend/src`). — **Alta.** Impacto: el modelo sugiere que ciertos tipos de gasto no deberían impactar en la liquidación, pero en la práctica **todo** anticipo/gasto seleccionado al crear una liquidación se descuenta del `netoPagar` sin excepción — la bandera es una regla de negocio muerta que puede llevar a interpretaciones incorrectas de cómo funciona el sistema. Recomendación: implementar el chequeo real o eliminar el campo si ya no aplica.

4. **Clasificación de anticipos como "adelanto" vs. "descuento" se basa en coincidencia de texto sobre el nombre del `TipoGasto`** (`esAdelanto()`: `nombre.includes("anticipo") || nombre.includes("adelanto")`; `categorizarAnticipo()`: busca "segur", "transf"/"banc", "efectivo", "combustible"/"gasoil"/"nafta"/"ypf", default "Otros"). — **Alta.** Impacto: el `netoPagar` final no se ve afectado (todo resta igual), pero el desglose "Total anticipos" vs. "Total descuentos" que se muestra en la liquidación (PDF/Excel) puede clasificar mal un tipo de gasto nuevo o renombrado que no calce con esas palabras clave — reporta números "correctos en el total, incorrectos en el desglose" sin ningún aviso. Recomendación: reemplazar el string-matching por un campo explícito en `TipoGasto` (ej. `categoria` o reutilizar `afectaLiquidacion` con semántica clara).

### Revisión funcional

5. **`AnticiposController.update()` bloquea la edición si `actual.liquidado`, pero no verifica `actual.anulado`.** — **Alta.** Impacto: un anticipo ya anulado (dado de baja, con motivo) se puede seguir editando —importe, fecha, tipo de gasto— a través de `PATCH /anticipos/:id`, lo cual no tiene sentido de negocio: un registro anulado debería quedar congelado, igual que uno liquidado. Recomendación: agregar `if (actual.anulado) throw new BadRequestException(...)` igual que para `liquidado`.

6. **Re-anular un anticipo ya anulado no está bloqueado.** `anular()` solo verifica `actual.liquidado`, no `actual.anulado`. Llamarlo dos veces sobrescribe silenciosamente `anuladoMotivo` con el motivo nuevo, perdiendo el original. — **Media.** Recomendación: bloquear si `actual.anulado` ya es `true`.

7. **Sin validación de formato de `fecha`.** `new Date(body.fecha)` con un string inválido produce un objeto `Invalid Date` que Prisma intentará persistir, cayendo en el mismo patrón transversal de error crudo ya visto en Catálogos/Viajes. — **Media.**

### Revisión técnica / validaciones backend

8. **Mismo patrón transversal que Catálogos y Viajes: `@Body() body: any` sin DTOs** en `create()`/`update()`. Las únicas validaciones son manuales y parciales (`choferId`/`transportistaId`/`tipoGastoId` obligatorios en `create()`), sin cobertura de tipos ni rangos. — **Alta** (consistente con el hallazgo transversal ya registrado).

### Seguridad

9. **`POST /anticipos` (crear) y `PATCH /anticipos/:id` (editar) no tienen ningún `@Roles(...)` — a diferencia de `anular()`, que sí está protegido con `@Roles("LIQUIDACIONES","OPERACIONES","ADMINISTRADOR")`.** Como `RolesGuard.canActivate()` devuelve `true` cuando no hay roles requeridos, **cualquier usuario autenticado, de cualquier rol** (incluyendo `LECTURA`, `GERENCIA` o `FACTURACION`, que ni siquiera ven el ítem "Anticipos y Gastos" en el menú) puede crear o editar anticipos llamando directamente a la API, aunque el menú lateral (`Layout.tsx`) los oculte para esos roles. — **Crítica** (control de acceso roto sobre movimientos financieros). Recomendación: agregar `@Roles("ADMINISTRADOR","LIQUIDACIONES","OPERACIONES")` a `create()` y `update()`, igual que en `ViajesController`.

### Consistencia con Viajes, Liquidaciones y Dashboard

- **Con Viajes:** ya registrado en la sección de Viajes (hallazgo 10) — un anticipo puede vincularse a un `viajeId` sin validar que `choferId`/`transportistaId` coincidan con los del viaje.
- **Con Liquidaciones:** ver hallazgo crítico #1 de esta sección — es la contraparte, del lado de Anticipos, del mismo problema estructural ya conocido en `LiquidacionesController.anular()`.
- **Con Dashboard:** el agregado `anticiposNoLiquidados` (`where: { liquidado: false, anulado: false }`) es consistente con los mismos dos flags usados en `AnticiposController` y `LiquidacionesController` — no se encontró discrepancia acá.

### Resumen de severidad — Anticipos

| Severidad | Cantidad |
|---|---|
| Crítica | 3 (revertir liquidado por viajeId en vez de por anticipo; importe sin validar signo/rango; sin control de rol en create/update) |
| Alta | 3 (`afectaLiquidacion` no usado; clasificación por string matching; falta de DTOs) |
| Media | 3 (edición de anticipo anulado; re-anulación no bloqueada; fecha sin validar) |
| Baja | 0 |

---

---

## Módulo: Liquidaciones

Fecha de auditoría: 2026-07-05. Foco explícito: integridad contable, reversión de operaciones, pagos, anulaciones, recálculo de importes, concurrencia, reglas de negocio, permisos y consistencia con Anticipos/Viajes/Dashboard.

### Integridad contable

1. **`Chofer.comisionPct` (columna dedicada en el schema, agregada por una migración específica el 2026-07-02) no se lee en ningún lado del backend ni se pre-completa en el frontend.** `LiquidacionesController.create()` toma `comisionPct` directo del body (`Number(comisionPct ?? 0)`), y `Liquidaciones.tsx` lo inicializa en un input libre con valor por defecto `"0"` sin consultar el chofer seleccionado. — **Alta.** Impacto: la comisión real de cada chofer, que el sistema ya modela y almacena, no protege contra un error humano al tipear el porcentaje en cada liquidación — se puede liquidar con 0% o cualquier valor arbitrario sin ningún control cruzado contra el dato maestro. Recomendación: pre-completar `comisionPct` desde `chofer.comisionPct` al elegir el chofer, y advertir si el valor tipeado difiere del guardado.

2. **`recomputeTotales()` solo se ejecuta una vez, inmediatamente después de crear la liquidación — nunca más.** Si el `importeTotal` de un viaje cambia *después* de estar incluido en una liquidación (posible hoy porque, como ya se documentó en la sección de Viajes, `PATCH /viajes/:id` no bloquea la edición de viajes ya liquidados), `LiquidacionViaje.subtotal`/`totalViaje` quedan con el valor congelado del momento de creación, y **no hay ningún mecanismo que detecte o recalcule** la divergencia. — **Crítica** (consecuencia directa del hallazgo 6 de Viajes, confirmada también desde este lado). Recomendación: bloquear la edición del viaje origen mientras `estadoLiquidacion != PENDIENTE` (ya recomendado en Viajes), y/o agregar un chequeo de integridad periódico.

### Reversión de operaciones / anulaciones (cross-referencia con Anticipos)

3. **`anular()` revierte correctamente `viaje.estadoLiquidacion` a `PENDIENTE`** iterando `liquidacion.viajes` (relación `LiquidacionViaje`, con `viajeId` `@unique` — sin riesgo de contaminar otra liquidación, ya que un viaje solo puede estar en una liquidación a la vez). Este lado de la reversión está bien resuelto.

4. **El lado de anticipos de la misma reversión no está bien resuelto** (ya detallado como hallazgo Crítico #1 de la sección Anticipos): `anular()` revierte `AnticipoGasto.liquidado` filtrando por `viajeId`, no por el id del anticipo (porque `LiquidacionMovimiento` no guarda `anticipoGastoId`). Un viaje con 2+ anticipos repartidos en liquidaciones distintas contamina la reversión de una liquidación ajena. Se repite acá la referencia porque es, a la vez, un hallazgo de Liquidaciones y de Anticipos — la causa raíz vive en `LiquidacionesController.anular()`, líneas 467-476. — **Crítica.**

5. **No se puede anular una liquidación `PAGADA`** (`if (liquidacion.estado === "PAGADA") throw ...`) — correcto y consistente entre backend y frontend (el botón "Anular" en `Liquidaciones.tsx:274` se oculta con la misma condición `detalle.estado !== "PAGADA"`).

### Pagos

6. **`pagar()` no usa ningún guard de concurrencia (optimistic locking) en el `update` — solo valida el estado en una lectura previa, no en la condición del `update` mismo.** El chequeo `if (liquidacion.estado !== "CONFIRMADA")` ocurre en un `findUnique` separado, antes del `$transaction`; el `update` posterior filtra únicamente por `id`, no por `estado`. — **Media** (ver sección Concurrencia).

7. **Al pagar, no se actualiza ningún estado en `AnticipoGasto`** — el campo `liquidado` es binario y ya se fijó en `true` en el momento de creación de la liquidación (etapa BORRADOR), no hay una etapa intermedia "liquidado pero no pagado". Es consistente con el diseño actual pero significa que el Dashboard (`anticiposNoLiquidados`) deja de contar un anticipo como pendiente **desde que se crea el borrador**, no desde que se confirma o paga. — **Baja/Media** (diseño, no bug, pero puede sorprender a Liquidaciones si esperan que "no liquidado" signifique "no incluido ni siquiera en un borrador").

### Recálculo de importes

8. Ver hallazgo 2 (Integridad contable). Adicionalmente: **no existe ningún endpoint para agregar o quitar viajes/anticipos de una liquidación ya creada** — la única forma de corregir una selección errónea es anular la liquidación completa y crear una nueva. Esto es una limitación funcional razonable (evita ediciones parciales inconsistentes) más que un bug, pero vale la pena que quede explícito como comportamiento esperado, no como omisión.

### Concurrencia

9. **Los viajes están protegidos contra doble-liquidación por la constraint `@unique` en `LiquidacionViaje.viajeId`** — si dos requests concurrentes intentan incluir el mismo viaje en dos liquidaciones distintas, la segunda transacción falla con `P2002` (no capturado explícitamente, cae en el patrón transversal de error crudo, pero al menos la integridad de datos se preserva a nivel de base). — **Media** (el dato queda protegido; el mensaje de error no).

10. **Los anticipos NO tienen esa misma protección.** No hay ninguna constraint única que impida que el mismo `AnticipoGasto` sea incluido en dos `LiquidacionMovimiento` de liquidaciones distintas creadas en paralelo (la validación `anticipos.length !== anticipoIds.length` ocurre en una lectura previa al `$transaction`, sujeta a condición de carrera). — **Crítica.** Impacto: dos liquidaciones creadas casi simultáneamente podrían descontar el mismo anticipo dos veces, cada una en su propio `netoPagar`, sin que la base lo impida. Es la misma causa raíz que los hallazgos 2 y 4: falta `anticipoGastoId` en `LiquidacionMovimiento` con una constraint única sobre él. Recomendación: la misma — agregar `anticipoGastoId @unique` (o único compuesto) en `LiquidacionMovimiento`.

### Reglas de negocio y permisos

11. **Los 4 endpoints que escriben (`create`, `confirmar`, `pagar`, `anular`) tienen exactamente el mismo `@Roles("LIQUIDACIONES","ADMINISTRADOR")`, de forma consistente entre sí** — a diferencia de lo encontrado en Anticipos (donde `create`/`update` no tenían ningún rol). Este módulo sí implementa el control de acceso de forma pareja. Punto positivo a destacar.

12. **Regla implementada solo en frontend, sin consecuencia de seguridad pero sí de UX:** `Liquidaciones.tsx` muestra los botones "Confirmar"/"Marcar como pagada"/"Anular" a **cualquier usuario que pueda ver la pantalla**, incluyendo el rol `GERENCIA` (que sí tiene acceso al menú "Liquidaciones" según `Layout.tsx`, roles `["ADMINISTRADOR","LIQUIDACIONES","GERENCIA"]`). Como el backend exige `LIQUIDACIONES`/`ADMINISTRADOR` para esas acciones, un usuario `GERENCIA` vería los botones habilitados pero recibiría un 403 al hacer clic — la restricción real está bien aplicada en el backend, pero el frontend no la anticipa ni oculta los botones según rol. — **Media** (UX, no seguridad — el backend sí protege correctamente). Recomendación: ocultar/deshabilitar los botones de acción según `usuario.rol` en el frontend, igual que ya se hace con los ítems del menú lateral.

13. **No se encontraron reglas críticas de negocio implementadas *solo* en el frontend sin respaldo en el backend** en este módulo — la selección de viajes/anticipos candidatos, la validación de que pertenezcan al transportista/chofer correcto, y las transiciones de estado, se revalidan todas en el servidor de forma independiente del payload recibido. Esto contrasta positivamente con Anticipos (control de rol ausente en create/update) y con Viajes (falta de guardas tras facturar/liquidar).

### Bug puntual de frontend

14. **`Liquidaciones.tsx:232` — typo `detalle.numerl` en vez de `detalle.numero`.** El título del panel de detalle (`<h1>Liquidación N° {detalle.numerl}</h1>`) siempre renderiza vacío después de "N°" porque `numerl` no existe en el objeto — el listado de arriba sí usa `l.numero` correctamente (línea 216), por lo que el dato existe y solo falta corregir el nombre del campo en esa línea. — **Baja** (cosmético, pero concreto y con línea exacta).

### Consistencia con Anticipos, Viajes y Dashboard

- **Con Anticipos:** hallazgos 4 y 10 son la misma causa raíz que el hallazgo crítico #1 de la sección Anticipos — falta de `anticipoGastoId` en `LiquidacionMovimiento`. Aparece tres veces en esta auditoría (reversión, concurrencia, integridad) porque es, estructuralmente, el defecto más transversal encontrado hasta ahora.
- **Con Viajes:** hallazgo 2 es la contraparte de "Viajes hallazgo 6" (edición de viaje ya liquidado) — mismo problema, visto desde el lado de Liquidaciones.
- **Con Dashboard:** `liquidacionesPendientesPago` (Dashboard) agrega `where: { estado: "CONFIRMADA" }` — coherente con el flujo `BORRADOR → CONFIRMADA → PAGADA` de este controller; no se encontró discrepancia. `anticiposNoLiquidados` ya fue contrastado en la sección de Anticipos.

### Resumen de severidad — Liquidaciones

| Severidad | Cantidad |
|---|---|
| Crítica | 3 (recompute nunca se repite tras editar viaje; reversión de anticipos por viajeId; anticipos sin protección de concurrencia) |
| Alta | 1 (comisionPct del chofer no se usa) |
| Media | 4 (pagar sin optimistic locking; viajes protegidos pero error crudo; botones de acción visibles para GERENCIA sin backend; diseño liquidado-antes-de-confirmar) |
| Baja | 2 (sin endpoint de edición parcial — comportamiento esperado, no bug; typo `numerl`) |

*Nota: los hallazgos críticos 4 y 10 comparten causa raíz con el hallazgo crítico #1 de Anticipos — no se deben contar como 3 problemas independientes a resolver, sino como 1 solución (agregar `anticipoGastoId`) que cierra los tres.*

---

---

## Módulo: Facturación

Fecha de auditoría: 2026-07-05. Foco explícito: emisión, estados, integridad contable, relación con Viajes/Liquidaciones/Cobranzas/Dashboard, validaciones, permisos, concurrencia, consistencia de importes, doble facturación, modificaciones posteriores, anulaciones, cálculos, y reglas que dependan solo del frontend.

### Regla crítica que hoy depende ÚNICAMENTE del frontend (pedido explícito)

1. **Registrar una cobranza sobre una factura ya `COBRADO_TOTAL` está bloqueado solo en `Facturas.tsx` (el formulario se oculta con `detalle.estado !== "COBRADO_TOTAL"`), pero el backend (`FacturasController.registrarCobranza`) solo verifica `factura.estado === "ANULADO"` — no verifica `COBRADO_TOTAL`.** Un llamado directo a `POST /facturas/:id/cobranzas` sobre una factura ya cobrada en su totalidad sería aceptado igual. — **Crítica** (marcada explícitamente como regla frontend-only, tal como se pidió). Impacto: se pueden seguir sumando cobranzas indefinidamente sobre una factura ya saldada, sin ningún tope. Recomendación: replicar el chequeo en el backend (`if (factura.estado === "COBRADO_TOTAL") throw ...`).

2. **Directamente relacionado: no hay ningún control de que `totalCobrado` (tras sumar la nueva cobranza) no supere `factura.importe`.** El cálculo `nuevoEstado = totalCobrado >= factura.importe ? "COBRADO_TOTAL" : ...` simplemente satura el estado en `COBRADO_TOTAL` sin registrar ni alertar sobre el excedente. — **Crítica.** Impacto: una factura de $100.000 podría terminar con $150.000 en cobranzas registradas, sin ningún indicio de sobrepago en el sistema — riesgo directo de integridad contable. Recomendación: validar `totalCobrado <= factura.importe` (o permitirlo conscientemente pero dejando registrado el excedente en vez de absorberlo en silencio).

### Prevención de doble facturación (positivo a destacar)

3. **A diferencia de los anticipos en Liquidaciones, acá SÍ hay protección real de doble facturación a nivel de base de datos:** `FacturaViaje.viajeId` es `@unique`. Si dos requests concurrentes intentaran facturar el mismo viaje en dos facturas distintas, la segunda transacción falla por violación de constraint única y se revierte — la integridad del dato está protegida (aunque el error resultante seguiría siendo un 500 crudo no capturado, mismo patrón transversal ya señalado). Este es el diseño correcto que debería replicarse para los anticipos en `LiquidacionMovimiento`.

### Modificaciones posteriores a la facturación (positivo a destacar)

4. **No existe ningún endpoint `PATCH /facturas/:id`.** Una vez creada, una factura es efectivamente inmutable — la única forma de "corregirla" es `anular()` (solo posible si no tiene cobranzas) y crear una nueva. Este es, de los cuatro módulos financieros auditados hasta ahora, el único que no permite editar libremente un documento ya emitido — postura correcta desde el punto de vista de integridad contable, en contraste directo con `PATCH /viajes/:id` (hallazgo crítico de Viajes).

### Consistencia de importes — nueva evidencia concreta del riesgo ya señalado en Viajes

5. **`FacturasController.conciliacion()` calcula `importeFacturado`/`toneladasFacturadas` leyendo `v.importeTotal`/`v.toneladas` en vivo desde `Viaje`, no desde el snapshot congelado `FacturaViaje.importeViaje`.** Si un viaje ya facturado se edita después (hallazgo crítico 6 de Viajes, hoy sin ninguna guarda que lo impida), el reporte de Conciliación mostraría el importe *nuevo* como "facturado", mientras la Factura real (`Factura.importe`, `FacturaViaje.importeViaje`) sigue frozen en el importe *viejo*. — **Crítica** (misma causa raíz que Viajes hallazgo 6, ahora con un tercer punto de divergencia confirmado: Dashboard, Liquidaciones y ahora también Conciliación de Facturación leen todos el valor en vivo del viaje en vez del snapshot congelado). Refuerza que la prioridad real es blindar la edición de viajes ya facturados/liquidados en `ViajesController`, no cada consumidor por separado.

### Emisión de facturas — validaciones backend

6. **Sin validar que `vencimiento >= fecha`.** Ni el backend ni el frontend impiden crear una factura con fecha de vencimiento anterior a la fecha de emisión. — **Media.** Recomendación: validar en el backend.

7. **`numero` es `@unique` — un alta duplicada cae en el mismo patrón transversal de error 500 crudo** ya señalado en Catálogos/Viajes/Anticipos. — **Alta** (mismo hallazgo transversal).

8. **Sin validación de formato/rango en `Number(body.importe)` de `registrarCobranza`** — se podría registrar una cobranza en $0 o negativa. — **Media** (mismo patrón que Anticipos hallazgo 2, menor severidad acá porque el impacto en `netoPagar`/`totalCobrado` es más acotado, pero sigue siendo una brecha real).

### Concurrencia

9. **`registrarCobranza` no usa ningún lock explícito (`SELECT FOR UPDATE`) sobre la factura al recalcular `totalCobrado`.** Bajo concurrencia alta (dos cobranzas registradas casi simultáneamente sobre la misma factura), cada transacción podría calcular `totalCobrado` sin ver la cobranza de la otra transacción todavía no confirmada, resultando en un `estado` desactualizado (ej. debería ser `COBRADO_TOTAL` pero una de las dos transacciones lo deja en `COBRADO_PARCIAL`). — **Media** (ventana de carrera estrecha, pero real; se autocorrige en la próxima cobranza o consulta, no hay pérdida de datos, solo un estado transitorio incorrecto).

### Permisos

10. **`create`, `anular` y `cobranzas` tienen `@Roles("FACTURACION","ADMINISTRADOR")` de forma consistente** — igual de bien resuelto que Liquidaciones, en contraste con la brecha ya señalada en Anticipos.

11. **Mismo patrón de UX ya visto en Liquidaciones: `Facturas.tsx` no oculta los botones "Registrar cobranza"/"Anular factura" según el rol del usuario.** El rol `GERENCIA` tiene acceso al menú "Facturación" (`Layout.tsx`: `["ADMINISTRADOR","FACTURACION","GERENCIA"]`) y vería esos botones habilitados, pero el backend los rechazaría con 403. — **Media** (UX, no seguridad — el backend protege correctamente).

### Relación con Viajes, Liquidaciones, Cobranzas y Dashboard

- **Con Viajes:** ver hallazgo 5 — nueva confirmación concreta del riesgo ya crítico de Viajes (edición post-facturación).
- **Con Liquidaciones:** sin acoplamiento directo en código (Facturas ↔ Cliente, Liquidaciones ↔ Transportista/Chofer) — correctamente desacoplados, ambos dependen de `Viaje` de forma independiente.
- **Con Cobranzas:** modeladas como parte del mismo controller/módulo (no hay un módulo separado) — `Cobranza` tiene `onDelete: Cascade` desde `Factura`, coherente (si una factura se anulara con `DELETE` físico se llevaría sus cobranzas, aunque en la práctica `anular()` solo hace soft-state, nunca `DELETE`, por lo que el cascade no se ejercita hoy).
- **Con Dashboard:** `facturasVencidas` (`where: { vencimiento: { lt: hoy }, estado: { in: ["FACTURADO","COBRADO_PARCIAL"] } }`) es coherente con `EstadoFacturaEnum`. No se detectó discrepancia — pero ver hallazgo 5 sobre `conciliacion()`.
- **Enums duplicados (`EstadoFacturaEnum` vs. `EstadoFacturacionEnum` en `Viaje`):** confirmado que hoy no hay divergencia activa de valores usados, pero el riesgo de mantenimiento ya estaba anotado en `ROADMAP_SDC_V1.md` (v1.1, ítem 5) — se confirma que sigue sin resolver. — **Media** (riesgo de mantenimiento, no bug activo).

### Resumen de severidad — Facturación

| Severidad | Cantidad |
|---|---|
| Crítica | 3 (cobranza sobre factura ya cobrada — regla solo frontend; sin tope de sobrepago; conciliación lee importes en vivo — tercera confirmación del riesgo de Viajes) |
| Alta | 1 (número de factura duplicado → error crudo) |
| Media | 6 (vencimiento < fecha; cobranza sin validar importe; concurrencia en recálculo de cobranzas; botones visibles para GERENCIA; enums duplicados) |
| Baja | 0 |

**Positivo a destacar en este módulo:** doble facturación de un mismo viaje SÍ está protegida a nivel de base de datos (`FacturaViaje.viajeId @unique`), y las facturas ya emitidas son efectivamente inmutables (sin `PATCH`) — ambos son el diseño correcto y deberían tomarse como modelo para corregir las brechas equivalentes en Anticipos/Liquidaciones y Viajes respectivamente.

---

---

## Módulo: Cobranzas

Fecha de auditoría: 2026-07-05. Nota estructural: **Cobranzas no es un módulo independiente** — no tiene controller, ruta de menú ni página propia; vive enteramente dentro de `FacturasController` (`POST /facturas/:id/cobranzas`) y de `Facturas.tsx` (sección "Cobranzas" dentro del detalle de una factura). Por eso varios hallazgos ya registrados en la sección de Facturación se retoman acá con el foco específico pedido (pagos duplicados, sobrepagos, anulaciones, conciliación bancaria).

### Pagos duplicados (hallazgo nuevo)

1. **El botón "Registrar cobranza" en `Facturas.tsx` no se deshabilita mientras la petición está en curso** (a diferencia de otros formularios del sistema, como `ViajeForm.tsx` que sí usa `disabled={saving}`). `registrarCobranza()` no setea ningún estado de "guardando" ni bloquea el botón. — **Crítica.** Impacto: un doble clic (o una respuesta lenta de red) puede disparar `POST /facturas/:id/cobranzas` dos veces con exactamente los mismos datos (misma fecha, mismo importe, mismo medio de pago) antes de que la primera respuesta vuelva. El backend no tiene ninguna verificación de duplicado (no hay idempotency key, no se compara contra cobranzas ya existentes con los mismos valores) — ambas requests se procesan como dos cobranzas independientes, duplicando el cobro registrado. Recomendación: deshabilitar el botón mientras la request está en curso (mismo patrón que `ViajeForm`) y, del lado del backend, agregar una verificación de duplicado exacto (misma factura + fecha + importe + medioPago en una ventana corta) o un idempotency key generado por el frontend.

### Sobrepagos (cross-referencia + agravante)

2. **Ya registrado como Crítico en la sección Facturación (hallazgo 2): no hay ningún tope que impida que la suma de cobranzas supere `factura.importe`.** Combinado con el hallazgo 1 de arriba (duplicado por doble clic), el riesgo de sobrepago es aún mayor de lo que parecía en la sección anterior: no solo un usuario podría cargar un importe mayor al debido, sino que el propio sistema podría *auto-duplicar* un pago legítimo por un problema de UI, empujando la factura a un sobrepago no intencional. — **Crítica** (severidad elevada por la combinación con el hallazgo 1).

3. **Efecto secundario en el Dashboard: una factura sobrepagada puede desaparecer silenciosamente de "Facturas vencidas".** `DashboardController.resumen()` calcula `saldoPendiente = f.importe - cobrado` y luego filtra `.filter((f) => f.saldoPendiente > 0)`. Si `cobrado > importe` (sobrepago), `saldoPendiente` da negativo y la factura queda excluida del todo de la lista de vencidas — en vez de alertar sobre un sobrepago, el sistema simplemente deja de mostrar esa factura como pendiente, ocultando el problema en lugar de señalarlo. — **Alta.**

### Anulaciones (hallazgo nuevo — el más importante de este módulo)

4. **No existe ningún endpoint para anular, corregir o eliminar una cobranza individual ya registrada.** No hay `DELETE`/`POST anular` para `Cobranza` en `FacturasController`, ni ningún botón de acción en la tabla de cobranzas de `Facturas.tsx` (la tabla solo lista fecha/importe/medio de pago, sin columna de acciones). La única forma de "deshacer" pasa por anular la **factura completa**, lo cual además está bloqueado si tiene cobranzas (`if (factura.cobranzas.length > 0) throw ...` en `FacturasController.anular()`) — es decir, **una vez registrada una cobranza, ni ella ni la factura que la contiene se pueden anular nunca más por la vía normal.** — **Crítica.** Impacto: un error de tipeo en el importe o la fecha de una cobranza (ej. un cero de más) queda registrado de forma permanente e irreversible por la aplicación, afectando el saldo de la cuenta corriente del cliente (`ClientesController.cuentaCorriente`) y el estado de la factura para siempre. Recomendación: agregar un endpoint de anulación de cobranza individual (`POST /facturas/:facturaId/cobranzas/:id/anular`) que revierta el estado de la factura (`FACTURADO`/`COBRADO_PARCIAL`/`COBRADO_TOTAL`) según corresponda tras la reversión, similar al patrón ya usado para anticipos y liquidaciones.

### Inconsistencias de estado

5. **El estado de la factura (`FACTURADO`/`COBRADO_PARCIAL`/`COBRADO_TOTAL`) se recalcula íntegramente en cada `registrarCobranza()` a partir de la suma de *todas* las cobranzas de la factura — no hay forma de que quede "desincronizado" en un uso normal**, ya que no existe edición ni eliminación de cobranzas individuales (ver hallazgo 4). Es una consecuencia (positiva, aunque no buscada) de la falta total de reversión: al no poder editarse ni borrarse una cobranza, el estado derivado siempre es consistente con los datos existentes. El precio de esa consistencia es la irreversibilidad del hallazgo 4.

6. **`ANULADO` y cualquier estado de cobro son mutuamente excluyentes por construcción** (`anular()` exige cero cobranzas) — no se encontró ningún camino para que una factura quede `ANULADO` con cobranzas asociadas. Punto positivo, confirmado.

### Conciliación bancaria (gap funcional, no bug)

7. **No existe ninguna función real de conciliación bancaria en el sistema.** El único campo relacionado es `Cobranza.medioPago`, un `String?` libre sin estructura (no hay referencia a extracto bancario, número de operación, CBU/CVU, ni ningún mecanismo de matching contra movimientos bancarios reales). La pantalla llamada "Conciliación" (`Conciliacion.tsx`, `GET /facturas/conciliacion`) concilia **viajes realizados vs. viajes facturados** — es una conciliación operativa, no una conciliación de cobranzas contra extractos bancarios. — **Media** (gap funcional, no un defecto de lo que existe; puede generar expectativas equivocadas dado el nombre de la pantalla). Recomendación: si el negocio necesita conciliación bancaria real, es una funcionalidad nueva a diseñar, no una corrección — dejarlo explícito para no confundirlo con lo que ya existe.

### Validaciones backend / Concurrencia / Permisos (cross-referencia a Facturación)

8. Ya registrados en la sección Facturación: sin validar `importe > 0` en la cobranza (hallazgo 8), ventana de carrera en el recálculo concurrente de `totalCobrado` (hallazgo 9), permisos de `@Roles("FACTURACION","ADMINISTRADOR")` correctamente aplicados en el backend pero sin ocultar botones por rol en el frontend (hallazgo 11). No se encontraron matices adicionales específicos de Cobranzas más allá de lo ya documentado.

### Consistencia con Facturación

- Cobranzas es, en la práctica, una sub-entidad de Facturación sin vida propia — todos los hallazgos de esta sección son refinamientos o agravantes de hallazgos ya registrados en el módulo Facturación, con la excepción de los hallazgos 1 (duplicado por doble clic) y 4 (irreversibilidad total), que son nuevos.

### Resumen de severidad — Cobranzas

| Severidad | Cantidad |
|---|---|
| Crítica | 3 (duplicado por doble clic; sobrepago agravado por el duplicado; irreversibilidad total de una cobranza mal cargada) |
| Alta | 1 (factura sobrepagada desaparece de "Facturas vencidas" en el Dashboard) |
| Media | 1 (no existe conciliación bancaria real, solo operativa) |
| Baja | 0 |

---

---

## Módulo: Dashboard (auditoría de cierre transversal)

Fecha de auditoría: 2026-07-05. Última pasada de la auditoría funcional — verifica que los indicadores coincidan con los estados reales de todos los módulos ya auditados, que ningún KPI quede desactualizado por los hallazgos ya encontrados, que no haya cálculos duplicados con criterios distintos, y que no haya consultas que degraden con el crecimiento de datos.

### Consistencia de cada KPI contra los módulos auditados

| KPI | Fuente | ¿Expuesto a algún hallazgo ya registrado? |
|---|---|---|
| `viajesEnCurso` | `Viaje.estado` en vivo | Sí — hallazgo Viajes #8 (cancelación sin guarda tras facturar/liquidar): un viaje cancelado indebidamente sale de este conteo aunque su factura/liquidación sigan vigentes. |
| `viajesMes` (cantidad/toneladas/importe) | `Viaje.toneladas`/`importeTotal` en vivo | Sí — hallazgo Viajes #1 (sin validar rango) y #6 (edición sin guarda tras facturar/liquidar): valores negativos, `NaN`, o ediciones posteriores se reflejan aquí sin filtro. |
| `pendientesFacturar` | `Viaje.importeTotal` en vivo, filtrado por `estadoFacturacion` | Correctamente "en vivo" — todavía no hay snapshot que congelar en este caso, no está expuesto a divergencia de snapshot (a diferencia de los otros). |
| `facturasVencidas` (cantidad/saldoPendiente/detalle) | `Factura.importe` (congelado) + `Cobranza.importe` (mutable) | Sí — hallazgo Cobranzas #1/#2 (duplicado por doble clic, sobrepago): una factura sobrepagada da `saldoPendiente` negativo y **desaparece de la lista** en vez de alertar (ya señalado como hallazgo Alto en Cobranzas, confirmado también desde este ángulo). |
| `liquidacionesPendientesPago` | `Liquidacion.netoPagar` (calculado una sola vez) | Sí — hallazgo Liquidaciones #2 (`recomputeTotales()` nunca se repite): si el viaje subyacente cambia después de liquidado, este KPI queda con el `netoPagar` viejo. |
| `anticiposNoLiquidados` | `AnticipoGasto.importe` + flags `liquidado`/`anulado` | Sí — hallazgo Anticipos/Liquidaciones crítico (reversión por `viajeId` en vez de por anticipo; concurrencia sin protección de doble liquidación): ambos escenarios alteran incorrectamente este conteo. |

**Conclusión: los 6 KPIs del Dashboard, salvo `pendientesFacturar`, están expuestos a quedar desactualizados o incorrectos por alguno de los hallazgos ya registrados en módulos anteriores.** Ninguno de estos es un bug nuevo del Dashboard en sí — el Dashboard simplemente refleja fielmente datos que ya pueden estar corrompidos aguas arriba. Confirma que la prioridad real está en las causas raíz (edición de viajes ya liquidados/facturados, reversión de anticipos por `viajeId`, sobrepago/duplicado de cobranzas), no en el Dashboard como tal.

### Cálculos duplicados con criterios distintos

1. **Inconsistencia de patrón de cálculo dentro del propio `resumen()`:** 4 de las 6 sub-consultas usan `.aggregate()` (cálculo hecho en la base de datos), pero `viajesMes` usa `.findMany()` trayendo `toneladas`+`importeTotal` de cada viaje del mes y sumando en JavaScript con `.reduce()`. — **Media** (inconsistencia de patrón + oportunidad de performance, ver más abajo).

2. **El cálculo de "importe cobrado" de una factura está duplicado en dos lugares con la misma lógica pero sin compartir código:** `DashboardController.resumen()` (`f.cobranzas.reduce((acc,c)=>acc+c.importe,0)`) y `FacturasController.registrarCobranza()` (`cobranzas.reduce((acc,c)=>acc+c.importe,0)`). — **Baja/Media** (no hay divergencia de resultado hoy porque la fórmula es idéntica, pero es una violación de DRY: si la regla de negocio cambia — por ejemplo, para excluir cobranzas anuladas si en el futuro se agrega esa funcionalidad — hay que recordar actualizarla en dos lugares). Recomendación: extraer a un método de servicio compartido (ej. `FacturaService.calcularSaldoPendiente()`).

3. **No se encontraron divergencias de criterio entre el Dashboard y los módulos que consulta** (`pendientesFacturar` coincide con `GET /viajes/pendientes-facturar`; `anticiposNoLiquidados` coincide con el filtro usado en `LiquidacionesController.candidatos()`; `liquidacionesPendientesPago` es coherente con el flujo de estados de Liquidaciones).

### Performance

4. **`facturasVencidas` trae, en cada carga del Dashboard, el objeto `cliente` completo y **todas** las cobranzas de **cada** factura vencida, sin límite ni paginación** (`this.prisma.factura.findMany({ where: {...}, include: { cliente: true, cobranzas: true } })`). — **Alta.** Impacto: el Dashboard es probablemente la pantalla más visitada del sistema (se carga en cada login), por lo que este es el punto de mayor exposición a degradación de performance con el crecimiento de datos, de todo lo auditado hasta ahora. Con cientos de facturas vencidas, cada carga del Dashboard se vuelve más pesada. Recomendación: limitar la cantidad de facturas traídas (ej. top 20 más antiguas) y/o mover el cálculo de saldo pendiente a una columna calculada o vista materializada si el volumen lo justifica.

5. **`viajesMes` trae todas las filas del mes en vez de agregar en la base de datos.** Ya señalado en el punto 1 — además de la inconsistencia de patrón, es la opción menos eficiente de las dos disponibles. — **Media** (hoy el volumen es bajo; escala mal). Recomendación: reemplazar por `viaje.aggregate({ where: {...}, _count: {_all:true}, _sum: {toneladas:true, importeTotal:true} })`, igual que las otras 4 sub-consultas.

6. **Ninguna de las 6 sub-consultas tiene un mecanismo de caché** — el Dashboard recalcula todo desde cero en cada carga de página, sin ningún TTL ni invalidación. — **Baja** (aceptable hoy dado el volumen; a reconsiderar si el Dashboard se vuelve el cuello de botella real).

### Resumen de severidad — Dashboard

| Severidad | Cantidad |
|---|---|
| Crítica | 0 (todo lo crítico ya estaba registrado en los módulos de origen; el Dashboard solo lo hereda) |
| Alta | 1 (`facturasVencidas` sin límite — mayor riesgo de performance de todo el sistema, por ser la pantalla de mayor tráfico) |
| Media | 3 (inconsistencia de patrón de cálculo; `viajesMes` sin agregar en DB; cálculo de saldo duplicado sin compartir código) |
| Baja | 1 (sin caché) |

---

*Con este módulo se completa la auditoría funcional por módulos de SDC v1.0. El informe final (resumen ejecutivo + backlog consolidado por causa raíz) se entrega por separado en `QA_INFORME_FINAL.md`. Ningún hallazgo de este documento fue corregido.*

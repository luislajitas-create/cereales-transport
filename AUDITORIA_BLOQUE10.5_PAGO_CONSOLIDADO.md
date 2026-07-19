# Auditoría — Bloque 10.5: Pago Consolidado (Backend)

Fecha: 2026-07-17. Etapa de Auditoría únicamente — `METODOLOGIA_SDC.md`, etapa 1. **No se propone solución, no se diseña, no se implementa, no se modifica ningún archivo, no se hace git.** Releídos frescos: `CONSTITUCION_SDC.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `docs/cierres/HITO_ESTABILIZACION_v1.1.md`, `docs/RELEASE_NOTES_v1.1.md`, `docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md`. Búsqueda exhaustiva de "Pago Consolidado" en todo el repositorio (código y documentos) — resultado en la sección 0. Inspeccionado fresco, contra el código real: `schema.prisma` (modelos `Liquidacion`, `LiquidacionViaje`, `LiquidacionMovimiento`, `AnticipoGasto`, `Chofer`, `IdentidadChoferGrupo`, `Factura`, `Cobranza`), `liquidaciones.controller.ts` completo, `facturas.controller.ts` (cobranzas), `clientes.controller.ts` (cuenta corriente), `organizacion-context.ts`, `organizacion-context.interceptor.ts`.

**Objetivo de este documento:** describir el sistema real, con evidencia verificable (`archivo:línea`), y señalar tensiones — no proponer ni decidir nada.

---

## 0. Qué existe hoy de "Pago Consolidado", exactamente

**Cero implementación.** `grep -rli "PagoConsolidado"` sobre `backend/src`, `frontend/src` y `schema.prisma` no devuelve ninguna coincidencia — ni modelo, ni controller, ni servicio, ni componente. Todo lo que existe es **documentación de diseño previa, nunca implementada**: `docs/disenos/GRUPO_ECONOMICO_DISENO_TECNICO.md` (secciones 4 a 17, el documento más detallado — propone modelos, endpoints, reglas y un plan de etapas E/F), `docs/estrategia/DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md` (5 decisiones de negocio ya aprobadas), `docs/auditorias/AUDITORIA_FUNCIONAL_GRUPO_ECONOMICO_RONDA2.md` (origen de esas decisiones), y `docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` (Bloques 10.5/10.6, sin subdividir en sub-bloques todavía). **Ninguno de estos documentos fue verificado contra código real hasta esta auditoría** — se cita su contenido abajo únicamente donde coincide con lo que el código real confirma, y se marca explícitamente donde no puede confirmarse.

## 1. Qué representa hoy un "pago" en SDC — dos direcciones que no deben confundirse

SDC tiene, hoy, **dos mecanismos financieros completamente separados**, sin ningún punto de contacto entre sí:

- **Dinero que la organización le debe a un tercero (chofer/transportista):** modelado como `Liquidacion` (`schema.prisma:552`) — esto es, en el sentido que usa toda la documentación de Grupo Económico, el "pago". Es lo único que Pago Consolidado, según el diseño previo, pretende consolidar.
- **Dinero que un cliente le debe a la organización:** modelado como `Factura` (`schema.prisma:628`) + `Cobranza` (`schema.prisma:668`). No hay ninguna mención, en ningún documento de Grupo Económico, de consolidar cobranzas entre organizaciones — confirmado también por el propio `GRUPO_ECONOMICO_DISENO_TECNICO.md`, Decisión 1: "se comparte únicamente la identidad de Choferes... Clientes... siguen exactamente como hoy."

**Conclusión de esta sección, verificada, no asumida:** "Pago Consolidado" en SDC significa exclusivamente consolidar `Liquidacion`es de tipo `CHOFER` de distintas organizaciones del mismo grupo — nunca facturas, cobranzas, ni nada del lado de clientes.

## 2. Modelo de datos actual

### `Liquidacion` (`schema.prisma:552-584`)

Campos relevantes: `organizacionId` (obligatorio — es un modelo organizacional), `tipo` (`TRANSPORTISTA` | `CHOFER`, enum `TipoLiquidacion`, línea 57), `transportistaId`/`choferId` (uno de los dos, según `tipo`), `periodoDesde`/`periodoHasta`, `estado` (`BORRADOR` | `CONFIRMADA` | `PAGADA` | `ANULADA`, enum `EstadoLiquidacionEnum`, línea 62), `comisionPct`, `totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar` (todos `Float`, sin campo de moneda), `fechaPago`, `creadoPorId`. Relaciones: `viajes: LiquidacionViaje[]`, `movimientos: LiquidacionMovimiento[]`. Restricción `@@unique([id, organizacionId])` — la clave compuesta que toda relación cruzada usa para anclarse a una organización específica.

### `LiquidacionViaje` (`schema.prisma:586-603`) y `LiquidacionMovimiento` (`schema.prisma:605-626`)

Ambas tablas puente, organizacionales, con clave compuesta hacia `Liquidacion` y hacia `Viaje`/`AnticipoGasto` respectivamente. `LiquidacionViaje` copia `subtotal`/`comisionPct`/`comisionMonto`/`totalViaje` en el momento de crear la liquidación — no recalcula desde el viaje después. Este es exactamente el patrón de integridad que el diseño previo (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 10) propone replicar para `PagoConsolidadoLiquidacion` (copiar el `netoPagar` al momento de incluir la liquidación en el pago).

### `AnticipoGasto` (`schema.prisma:520-550`)

Campo `liquidado: Boolean` — el mecanismo de bloqueo que ya existe hoy para impedir que un mismo anticipo se use en dos liquidaciones. Es el precedente directo y ya verificado de la restricción que `PagoConsolidadoLiquidacion` necesitaría para impedir que una misma liquidación entre en dos pagos consolidados activos (diseño previo, sección 5).

### `Chofer` (`schema.prisma:317-347`) e `IdentidadChoferGrupo` (`schema.prisma:356-378`)

**Ya construido y cerrado en Bloque 10.2**, verificado en esta sesión: `Chofer.identidadChoferGrupoId` (opcional, nulo por defecto) vincula, a mano, dos filas de `Chofer` de distintas organizaciones como la misma persona real. `IdentidadChoferGrupo` no es un modelo organizacional (fuera de `ORGANIZACIONAL_MODELS`), vive a nivel de `GrupoEconomico`. **Esto es exactamente el mecanismo de identidad que Pago Consolidado necesita para agrupar liquidaciones "del mismo beneficiario real"** — ya existe, ya está auditado, ya fue validado con datos reales durante el cierre de 10.2.

### `Factura`/`Cobranza` — mencionados solo para contraste

`Cobranza` (`schema.prisma:668-685`) está atada a **una sola** `Factura` (`facturaId` obligatorio, sin ninguna tabla puente que permita que una cobranza cubra más de una factura). No existe, en ningún lugar del sistema actual, un mecanismo de "un pago aplicado a varias deudas" — ni del lado de cobranzas ni del lado de liquidaciones. Pago Consolidado sería, verificado contra el código real, **la primera vez que este patrón se introduce en SDC**, y lo haría del lado de `Liquidacion`, no de `Cobranza`.

### `GrupoEconomico`, `AccesoGrupoEconomico` — ya construidos (10.1, 10.3.a)

Confirmados por el propio `HITO_ESTABILIZACION_v1.1.md`: `GrupoEconomico` (nivel de grupo, no organizacional), `Organizacion.grupoEconomicoId` (opcional), `AccesoGrupoEconomico` (usuario ↔ organización adicional autorizada). Sin ningún cambio necesario para Pago Consolidado — ya proveen exactamente "a qué organizaciones pertenece este grupo" y "qué usuario puede operar más de una".

## 3. Backend actual — ciclo de vida real de `Liquidacion` (`liquidaciones.controller.ts`, releído completo)

| Método | Línea | Transacción Prisma | Qué hace |
|---|---|---|---|
| `candidatos()` | 185-238 | No (dos `findMany` en paralelo) | Lista viajes `DESCARGADO`+`PENDIENTE` y anticipos `!anulado && !liquidado`, filtrados por transportista/chofer y rango de fechas. |
| `create()` | 517-670 | Sí (`$transaction`) | Crea la `Liquidacion` en `BORRADOR`; por cada viaje, `updateMany` **condicional** (`where: {estadoLiquidacion: "PENDIENTE"}`) para bloquear contra una carrera — si `count === 0`, aborta con `BadRequestException`; mismo patrón condicional para cada anticipo (`liquidado: false` → `true`). Al final, `recomputeTotales()` (fuera de la transacción, en un segundo paso). |
| `confirmar()` | 672-685 | **No** — un solo `update`, sin transacción, sin `updateMany` condicional. Verifica `estado === "BORRADOR"` antes, pero el chequeo y la escritura no son atómicos entre sí. | `BORRADOR` → `CONFIRMADA`. |
| `pagar()` | 687-705 | Sí (`$transaction`) | Verifica `estado === "CONFIRMADA"`; dentro de la transacción, marca la `Liquidacion` `PAGADA` y **cada `Viaje` incluido** pasa a `estadoLiquidacion: "PAGADO"`. |
| `anular()` | 707-753 | Sí (`$transaction`) | **Rechaza explícitamente si `estado === "PAGADA"`** (línea 715-717: `"No se puede anular una liquidación ya pagada"`). Si no está pagada, revierte: `Liquidacion` → `ANULADA`, cada `Viaje` → `estadoLiquidacion: "PENDIENTE"`, cada `AnticipoGasto` vinculado → `liquidado: false`. |
| `recomputeTotales()` | 755-773 | No | Recalcula `totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar` sumando `LiquidacionViaje.totalViaje` y clasificando cada `LiquidacionMovimiento` como anticipo o descuento por el nombre del `TipoGasto` (heurística de texto, `esAdelanto()`, línea 33-36 — no un campo booleano propio). |

**Guards/roles:** `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase (línea 161); `create()`/`confirmar()`/`pagar()`/`anular()` exigen `@Roles("LIQUIDACIONES", "ADMINISTRADOR")` (líneas 517, 672, 687, 707) — ningún otro rol puede operar liquidaciones. Toda la clase usa exclusivamente `ORGANIZACION_PRISMA` (línea 164) — sin acceso a `PrismaService` crudo en ningún método.

**Hallazgo objetivo, verificado, no asumido: `anular()` no admite revertir una liquidación `PAGADA`.** Esto es directamente relevante para Pago Consolidado — el diseño previo (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 5) asume que anular un Pago Consolidado "revierte cada liquidación agrupada" a su estado previo, pero si "confirmar" un Pago Consolidado marca cada liquidación agrupada como `PAGADA` (que es lo que el mismo documento propone en su sección 5), **no existe hoy ningún código que sepa revertir una liquidación de `PAGADA` a `CONFIRMADA`** — el único método existente (`anular()`) lo rechaza explícitamente. Esta no es una decisión de diseño ya tomada — es una pieza de lógica que no existe en absoluto hoy, en ninguna forma, ni siquiera como una función interna no expuesta.

## 4. Aislamiento multiempresa — el mecanismo real, y por qué el token activo no alcanza

### Cómo funciona hoy, verificado

`organizacion-context.ts` (releído completo): `organizacionContextStorage` es una instancia de `AsyncLocalStorage` exportada — **cualquier código del backend puede invocar `organizacionContextStorage.run({organizacionId}, callback)` directamente**, no es un mecanismo cerrado dentro del interceptor. `organizacion-context.interceptor.ts` (releído completo) es hoy el **único** invocador real: lee `request.user.organizacionId` (ya resuelto por `JwtStrategy` antes que cualquier interceptor corra) y siembra el contexto una vez por request. Todas las 21 tablas organizacionales (`Liquidacion`, `Viaje`, `Chofer`, etc.) se filtran automáticamente contra ese contexto vía `crearClienteOrganizacional` — sin excepción, sin bypass.

### La consecuencia real para Pago Consolidado

Como `Liquidacion` es un modelo organizacional, **una sola request HTTP, con un solo JWT, solo puede leer o escribir liquidaciones de UNA organización a la vez** — la que esté sembrada en `organizacionContextStorage` para esa request, que es siempre la `organizacionId` del token con el que se autenticó esa request. No existe, hoy, ninguna forma de que una única consulta de Prisma traiga liquidaciones de dos organizaciones distintas en el mismo `findMany` — el propio mecanismo de aislamiento, que es exactamente lo que garantiza que SDC v1.0/v1.1 nunca mezcle datos entre organizaciones, es el mismo mecanismo que hace que "traer candidatos de dos organizaciones" no pueda resolverse con una consulta.

**Esto confirma, con evidencia de código, la afirmación central de `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 8:** cualquier operación de Pago Consolidado que necesite datos de más de una organización tiene que ejecutarse como una **secuencia** de invocaciones explícitas a `organizacionContextStorage.run(...)`, una por organización, del lado del servidor — nunca como una sola consulta, y nunca dependiendo de qué organización tenga activa el usuario que hace el pedido. **El cambio de organización activa de v1.1 (10.3.b/10.4.b) es, verificado, un mecanismo completamente distinto y no relacionado**: sirve para que un usuario opere las pantallas normales (Viajes, Facturas, Liquidaciones) de una organización a la vez, cambiando cuál es esa organización — nunca para agregar datos de varias a la vez en una misma pantalla. Un endpoint de Pago Consolidado no necesitaría, en ningún momento, que el usuario tenga activa una organización en particular — se autorizaría por `AccesoGrupoEconomico` (igual que ya lo hacen `GET /grupo-economico`, `GET /grupo-economico/:id/accesos`, etc., verificado en 10.3.a/10.4.a/10.4.c), no por el `organizacionId` del token.

### La tensión real y no resuelta: no existe una transacción atómica cruzando organizaciones

Verificado, no asumido: como cada organización requiere su propio contexto de `AsyncLocalStorage`, y `$transaction` de Prisma opera dentro de un único cliente/conexión, **no es posible envolver en una sola `$transaction` de Prisma una escritura que involucre a la vez `Liquidacion` de la Organización A y `Liquidacion` de la Organización B** a través del cliente scopeado — cada organización necesita su propia invocación secuencial, con su propio `$transaction` local. `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 5, dice "todo o nada, igual que hoy" para confirmar un Pago Consolidado, pero **no explica el mecanismo para lograrlo** cuando "hoy" (`pagar()`, línea 687) logra el "todo o nada" precisamente porque opera sobre una sola organización dentro de una sola `$transaction` — algo que Pago Consolidado, por construcción, no puede replicar de la misma forma. Si confirmar un Pago Consolidado de dos organizaciones ejecuta primero la organización A (con éxito) y después la organización B (con un fallo), **el sistema queda en un estado intermedio real**: la liquidación de A ya quedó `PAGADA`, la de B no. Ningún documento existente resuelve qué debería pasar en ese caso — ni siquiera lo menciona como pregunta abierta.

## 5. Reglas contables y funcionales — qué existe y qué no, verificado, sin inventar

| Regla | ¿Existe hoy? | Evidencia |
|---|---|---|
| Un pago aplicado a varias deudas | **No, en ningún lado del sistema** | `Cobranza` es 1 a 1 con `Factura`; no existe ningún equivalente del lado de `Liquidacion`. |
| Varias aplicaciones dentro de una misma transacción de base de datos, cruzando organizaciones | **No es técnicamente posible con el mecanismo actual** | Sección 4 — `organizacionContextStorage` es por-invocación, no cruza organizaciones dentro de un mismo `$transaction`. |
| Pagos parciales | **Sí, pero solo del lado de `Cobranza`** (una factura puede tener varias cobranzas parciales, sumadas para derivar `COBRADO_PARCIAL`/`COBRADO_TOTAL`, `facturas.controller.ts`) — **no existe ningún equivalente para `Liquidacion`** (`pagar()` es todo-o-nada sobre el `netoPagar` completo). | `schema.prisma:668-685`; `liquidaciones.controller.ts:687-705`. |
| Saldo no aplicado / a favor | **No existe ningún campo ni mecanismo** — ni en `Liquidacion` ni en `Cobranza`. | Búsqueda exhaustiva en `schema.prisma`, sin resultado. |
| Anticipos | **Sí, existe y es maduro** (`AnticipoGasto`, con `liquidado`/`anulado`) — pero exclusivamente dentro de una organización; nunca se descuenta contra una liquidación de otra organización (confirmado también por el diseño previo, sección 6). | `schema.prisma:520-550`. |
| Reversión / anulación | **Sí para `Liquidacion` en general, pero explícitamente bloqueada una vez `PAGADA`** — ver hallazgo de la sección 3. | `liquidaciones.controller.ts:715-717`. |
| Distinta organización emisora y receptora | **No aplica al modelo actual** — cada `Liquidacion` tiene exactamente una `organizacionId`; el concepto de "una organización paga en nombre de otra" no existe en ningún campo. | `schema.prisma:552-584`. |
| Clientes compartidos o equivalencias entre clientes | **No existe, y está explícitamente descartado** por Decisión 1 del Product Owner (`DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`) — no es un faltante técnico, es un alcance ya decidido como fuera de esta versión. | — |
| Monedas diferentes | **No existe ningún campo de moneda en ningún modelo financiero** (`Liquidacion`, `Factura`, `Cobranza`, `AnticipoGasto` — todos `Float` simple). Coincide con la deuda técnica ya documentada en `RELEASE_SDC_v1.0.md`/`ROADMAP_PRODUCTO_SDC.md` ("ARS/es-AR hardcodeado"). | `schema.prisma`, búsqueda de campo `moneda`, sin resultado en ningún modelo financiero. |
| Redondeos | **No se encontró ninguna lógica de redondeo explícita** en `recomputeTotales()` ni en `construirPlanilla()` — las sumas son aritmética de punto flotante directa, sin ningún `Math.round`/`toFixed` aplicado al dato almacenado. | `liquidaciones.controller.ts:755-773`. |
| Concurrencia | **Dos patrones distintos, ninguno cruza organizaciones:** `updateMany` condicional (`create()`, línea 616-624, y ya usado en 10.2/10.3.a) y `SELECT ... FOR UPDATE` vía `$queryRaw` (`facturas.controller.ts`, comentario en `organizacion-prisma.client.ts` lo confirma como excepción ya documentada). Ninguno de los dos resuelve una carrera que involucre a dos organizaciones a la vez — ver sección 4. | `liquidaciones.controller.ts:616-624`; comentario en `organizacion-prisma.client.ts` líneas 215-220 (ya citado en sesiones anteriores). |
| Idempotencia | **No se encontró ningún mecanismo de idempotencia** (clave de idempotencia, deduplicación de requests) en ningún controller financiero existente — ni en `Liquidacion` ni en `Cobranza`. | Búsqueda en `liquidaciones.controller.ts`, `facturas.controller.ts`, sin resultado. |

**No se infiere ni se inventa ninguna regla no encontrada** — todo lo marcado "no existe" es una ausencia verificada por búsqueda directa contra el código real, no una suposición.

## 6. Objetivo de Bloque 10.5, según la documentación ya existente (sin inventar, sin decidir)

`docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` (sección "Bloque 10.5") y `GRUPO_ECONOMICO_DISENO_TECNICO.md` (sección 16, "Etapa E", la que corresponde a 10.5) coinciden en describir el mismo alcance: modelos `PagoConsolidado` y `PagoConsolidadoLiquidacion` (`schema.prisma`, migración aditiva); endpoints de candidatos (liquidaciones `CONFIRMADA`, del mismo beneficiario vía `IdentidadChoferGrupo`, de organizaciones del mismo grupo, no incluidas en otro pago activo), creación (borrador), confirmación (marca cada liquidación agrupada, en su propia organización), y anulación (revierte). **Ver sección 3 y 4 para las dos piezas que este alcance necesitaría y que hoy no existen en absoluto: una forma de revertir una `Liquidacion` `PAGADA`, y una estrategia explícita ante un fallo parcial entre organizaciones.**

**Esto es exclusivamente backend** — ningún documento describe pantallas ni componentes de frontend como parte de esta etapa; eso es, consistentemente en los tres documentos consultados, la etapa siguiente (Bloque 10.6).

## 7. Riesgos y deuda técnica

- **Fallo transaccional parcial entre organizaciones** (sección 4) — el riesgo más importante encontrado en esta auditoría, sin ninguna mitigación ya diseñada ni implementada.
- **Reversión de una liquidación `PAGADA`** (sección 3) — pieza de lógica completamente ausente hoy, necesaria si Pago Consolidado marca liquidaciones como `PAGADA` al confirmar y necesita poder anularlas después.
- **Doble imputación de una misma liquidación**: mitigable con el mismo patrón ya probado (`AnticipoGasto.liquidado`, restricción única en la tabla puente) — riesgo bajo, patrón ya conocido y validado en este mismo proyecto.
- **Concurrencia cruzando organizaciones**: ningún patrón existente (ni `updateMany` condicional ni `SELECT FOR UPDATE`) protege una operación que toca dos organizaciones a la vez — cada organización se protegería individualmente, pero la combinación de ambas no tiene, hoy, ningún mecanismo de coordinación.
- **`recomputeTotales()` con aritmética de punto flotante sin redondeo explícito** — deuda preexistente, no creada por Pago Consolidado, pero que se propagaría a cualquier suma de varias liquidaciones (`totalConsolidado`) si no se revisa.
- **Secuencias globales no aisladas por organización** (`Liquidacion.numero`, `Viaje.numeroViaje`, ambos `@default(autoincrement())` sin scope) — deuda ya documentada en `ROADMAP_PRODUCTO_SDC.md`, sección 3; no es un riesgo de seguridad (`organizacionId` sigue siendo la clave real de aislamiento), pero es deuda técnica preexistente que un Pago Consolidado con numeración propia debería tener presente para no repetir el mismo patrón.
- **Exposición entre organizaciones**: ningún hallazgo nuevo — el mecanismo de aislamiento (sección 4) es sólido y ya verificado extensamente en 10.1-10.4.c; el riesgo real no es de fuga de datos, es de **coordinación** entre operaciones legítimas sobre organizaciones distintas.
- **Auditoría**: `AuditLog` es organizacional (exige `organizacionId`) — una operación de grupo que toca dos organizaciones generaría, por construcción, una entrada de auditoría por organización (mismo patrón ya usado en 10.3.b para `organizacion_activa_cambiada`), no una entrada única de "grupo" — coherente con lo que el diseño previo ya proponía, y verificable como técnicamente correcto dado el mecanismo real de `AuditLog`.

---

## Resumen

Bloque 10.5 (backend de Pago Consolidado) no tiene ninguna línea de código escrita — es, hoy, exclusivamente un diseño previo, nunca implementado ni verificado contra el código real hasta esta auditoría. El soporte real que v1.1 sí dejó construido y reutilizable es sustancial: identidad compartida de chofer (`IdentidadChoferGrupo`), acceso multiempresa (`AccesoGrupoEconomico`), y el mecanismo de contexto organizacional (`organizacionContextStorage`), confirmado invocable explícitamente fuera del interceptor — exactamente lo que una orquestación cruzando organizaciones necesitaría. La tensión central, no resuelta por ningún documento existente, es qué hacer ante un fallo parcial al confirmar un pago que involucra a más de una organización, dado que no existe (ni puede existir, con el mecanismo actual) una transacción atómica real que cruce organizaciones — y que el único mecanismo de reversión hoy disponible (`anular()`) rechaza explícitamente revertir una liquidación ya pagada.

No se propuso solución, no se diseñó, no se implementó, no se modificó ningún archivo. Detenido al finalizar, a la espera de tu aprobación antes de iniciar la etapa de Diseño de Bloque 10.5.

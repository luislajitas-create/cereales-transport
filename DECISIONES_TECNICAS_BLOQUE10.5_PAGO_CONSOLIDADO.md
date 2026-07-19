# Decisiones Técnicas — Bloque 10.5: Pago Consolidado (Backend)

Fecha: 2026-07-18. Registra exclusivamente las cinco decisiones resueltas por el Product Owner sobre la base de `DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md` (aprobado como base técnica, sección "Decisiones que requieren aprobación del Product Owner"). **No repite el diseño completo, no escribe implementación, no define migraciones.** Con este documento queda cerrada formalmente la etapa Auditoría → Diseño → Decisiones de Bloque 10.5. La implementación queda pendiente de una instrucción explícita posterior.

---

## Decisión Técnica 1 — Estrategia ante fallos parciales

**Pregunta:** ante un fallo a mitad de la secuencia de aplicación por organización, ¿el sistema intenta compensación automática (estilo saga) o expone el estado real con reintento manual?

**Decisión:** revalidación exhaustiva antes de confirmar; persistencia explícita del progreso por organización; estado `PARCIAL` cuando al menos una organización fue aplicada y otra no; reintento manual e idempotente, únicamente sobre las aplicaciones pendientes o fallidas. **No se implementa compensación automática tipo saga en este bloque.**

**Motivo registrado:** no existe hoy ninguna reversión segura de una `Liquidacion` `PAGADA` (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 3) — simular una atomicidad global que la arquitectura actual no puede garantizar sería, en sí mismo, un riesgo mayor que exponer honestamente un estado parcial real.

**Consecuencia arquitectónica inmediata:** `PagoConsolidadoLiquidacion` necesita, además de los campos ya descritos en el diseño, un campo de progreso por fila — `estadoAplicacion`, con valores `PENDIENTE` | `APLICADA` | `FALLIDA` — porque el progreso "por organización" se traduce, en el modelo de datos, en progreso por fila (cada fila ya pertenece a una única organización). La secuencia de confirmación recorre las filas en orden determinístico (por `organizacionId`), aplica cada una dentro de su propio contexto y su propio `$transaction` local, y actualiza `estadoAplicacion` inmediatamente después de cada intento — nunca al final de toda la secuencia. Un reintento vuelve a ejecutar exclusivamente las filas con `estadoAplicacion` en `PENDIENTE` o `FALLIDA`; una fila ya `APLICADA` nunca se vuelve a tocar ni genera una segunda entrada de auditoría.

---

## Decisión Técnica 2 — Ciclo de vida en tres etapas

**Pregunta:** ¿cuántos pasos tiene el ciclo de vida de un Pago Consolidado, y qué hace exactamente cada uno?

**Decisión:** tres etapas — (a) crear `BORRADOR`; (b) preparar el pago y bloquear las liquidaciones seleccionadas; (c) confirmar y ejecutar las aplicaciones por organización. La consulta de candidatos no forma parte del estado persistente del pago. La etapa de preparación debe ser reversible mientras ninguna liquidación haya sido efectivamente pagada.

**Consecuencia arquitectónica inmediata:**

- **`BORRADOR`**: registra la selección de liquidaciones candidatas (una fila de `PagoConsolidadoLiquidacion` por cada una, con `estadoAplicacion: PENDIENTE` desde el inicio), pero **no adquiere ningún bloqueo todavía** — es editable, se puede agregar o quitar una liquidación sin ninguna consecuencia sobre `Liquidacion` en sí.
- **Preparar (`BORRADOR` → `PREPARADO`)**: revalida cada ítem desde cero (existencia, estado `CONFIRMADA`, mismo beneficiario, organización todavía perteneciente al grupo) y, recién ahí, adquiere el bloqueo (Decisión 3) en cada organización, una por una. **Esta etapa sí admite una forma de compensación automática, y no contradice la Decisión 1**: adquirir o liberar un bloqueo nunca es un evento financiero real (a diferencia de marcar una liquidación como pagada) — es completamente seguro revertirlo. Si preparar falla a mitad de camino (la organización `k` no pudo bloquear su liquidación), el sistema libera automáticamente los bloqueos ya adquiridos en las organizaciones `1..k-1` de ese mismo intento, y el pago permanece en `BORRADOR` — nunca queda en un `PREPARADO` a medias. Esto es, exactamente, lo que la instrucción "la etapa de preparación debe ser reversible" exige, y es posible precisamente porque bloquear no es aplicar.
  > **Nota de mecanismo (2026-07-19, `ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md`, Hallazgo 1):** la garantía descrita arriba se implementa mediante una única transacción física de Postgres que envuelve la adquisición de bloqueos, la transición a `PREPARADO` y la auditoría — la reversión ante un fallo a mitad de camino es la reversión nativa de esa transacción, no un bucle manual de compensación en el código de aplicación (que sí existió en una versión anterior y fue reemplazado por ser redundante, y potencialmente incorrecto, una vez que la transacción ya revierte todo por sí sola). El comportamiento exigido por esta decisión no cambia; solo el mecanismo que lo garantiza es ahora más simple y más confiable.
- **Confirmar (`PREPARADO`/`PARCIAL`/`FALLIDO` → `PROCESANDO` → `CONFIRMADO`/`PARCIAL`/`FALLIDO`)**: ejecuta, en secuencia, la aplicación real por organización (marcar la `Liquidacion` `PAGADA` y sus `Viaje` `PAGADO`, dentro de un `$transaction` local) — es la única etapa donde la Decisión 1 rige en su forma estricta (sin compensación automática).

---

## Decisión Técnica 3 — Bloqueo persistente en `Liquidacion`

**Pregunta:** ¿cómo se garantiza que una liquidación no participe en dos pagos consolidados a la vez, sin duplicar información con `PagoConsolidadoLiquidacion`?

**Decisión:** bloqueo persistente en `Liquidacion`, adquirido transaccionalmente dentro de cada organización, que impide la participación simultánea en otro Pago Consolidado, se libera al cancelar un pago todavía no ejecutado, se mantiene asociado al pago cuando la ejecución queda `PARCIAL`, y no depende únicamente de verificaciones en memoria.

**Campo y restricción concretos:** `Liquidacion.pagoConsolidadoLiquidacionId` — campo nuevo, opcional, nulo por defecto, con relación hacia `PagoConsolidadoLiquidacion.id` (mismo tratamiento estructural que ya usa `Chofer.identidadChoferGrupoId` hacia un modelo de nivel de grupo, Bloque 10.2 — un modelo organizacional referenciando, de forma opcional, una entidad de grupo). **Por ser un campo único y no una lista, una `Liquidacion` solo puede apuntar a un `PagoConsolidadoLiquidacion` a la vez — esa es, por construcción, la garantía de "no participa en dos pagos simultáneamente"**, sin necesitar ninguna restricción `@@unique` adicional ni ningún campo booleano redundante en `PagoConsolidadoLiquidacion` (que ya sabría, por la relación inversa, si está bloqueando algo o no — se evita así la duplicación que la instrucción pedía evitar).

**Adquisición y liberación, exactamente:**
- Adquirir: `updateMany` condicional — `where: { id: liquidacionId, organizacionId, pagoConsolidadoLiquidacionId: null }`, `data: { pagoConsolidadoLiquidacionId: <id de la fila nueva> }`. Si `count === 0`, la liquidación ya estaba bloqueada por otro pago — mismo patrón exacto ya usado dos veces en este proyecto (`AnticipoGasto.liquidado` en `LiquidacionesController.create()`; `Viaje.estadoLiquidacion` en el mismo método) — nunca depende de una lectura previa sin garantía atómica.
- Liberar: solo alcanzable desde `BORRADOR`→`CANCELADO` (donde nunca se llegó a adquirir) o `PREPARADO`→`CANCELADO` (Decisión 2) — pone `pagoConsolidadoLiquidacionId` de vuelta en `null` para cada fila involucrada.
- **Nunca se libera una vez que el pago entra en `PARCIAL` o `CONFIRMADO`** — coherente con la Decisión 5 ("no permitir `CANCELADO` después de que alguna liquidación haya sido pagada"): las filas todavía no aplicadas de un pago `PARCIAL` permanecen bloqueadas, a la espera de un reintento, no vuelven a estar disponibles para otro pago.

---

## Decisión Técnica 4 — Autorización estricta por organización involucrada

**Pregunta:** ¿alcanza con que las organizaciones pertenezcan al mismo Grupo Económico, o se exige acceso explícito del administrador a cada una?

**Decisión:** se exige acceso explícito y vigente del `ADMINISTRADOR` a **cada** organización involucrada — la mera pertenencia al mismo grupo no autoriza la operación. Antes de crear, preparar, confirmar o reintentar, se revalida: rol `ADMINISTRADOR`; acceso vigente (`AccesoGrupoEconomico`, o organización propia) a todas las organizaciones afectadas; pertenencia de todas ellas, en ese momento, al mismo Grupo Económico.

**Consecuencia arquitectónica inmediata:**
- `PagoConsolidadoController` usa `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("ADMINISTRADOR")` en cada endpoint que crea, modifica o ejecuta un pago — **corrige explícitamente** lo que `DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 3, había asumido por analogía con `OrganizacionesAccesiblesController` (sin `RolesGuard`); el patrón correcto a replicar es el de `AccesoGrupoController.otorgar()`/`.revocar()`, que ya exigen `ADMINISTRADOR` para operaciones administrativas de grupo — no el de un endpoint de lectura universal.
- La verificación "acceso vigente a cada organización" reutiliza exactamente la misma lógica ya validada en `AuthService.cambiarOrganizacion()` (organización propia, o `AccesoGrupoEconomico` vigente) — aplicada, en un bucle, a cada `organizacionId` distinto que aparezca en las liquidaciones del pago, nunca una sola vez para el grupo en general.
- Por consistencia (no como una quinta acción separada, sino como aplicación directa de la misma decisión), **el endpoint de candidatos y el de consulta también revalidan lo mismo** — un pago consolidado, incluso en modo lectura, ya expone qué liquidaciones existen y cuánto suman en organizaciones que no son la propia del actor; no tendría sentido exigir la verificación estricta para escribir y omitirla para leer el mismo dato.
- Esta verificación se repite **en cada llamada**, nunca se asume vigente desde un paso anterior — mismo criterio ya establecido para todo el resto de Grupo Económico desde 10.3.b ("revalidar en cada uso, nunca asumir").

---

## Decisión Técnica 5 — Estados exactos

**Pregunta:** ¿qué nombres y qué semántica exacta tienen los estados de `PagoConsolidado`?

**Decisión:** siete estados — `BORRADOR`, `PREPARADO`, `PROCESANDO`, `CONFIRMADO`, `PARCIAL`, `FALLIDO`, `CANCELADO` — con la semántica exacta ya detallada por el Product Owner. **No permitir `CANCELADO` después de que alguna liquidación haya sido pagada.**

### Tabla de transiciones válidas

| Desde | Hacia | Disparador | Condición |
|---|---|---|---|
| `BORRADOR` | `PREPARADO` | Preparar | Todas las liquidaciones revalidadas y bloqueadas con éxito (Decisión 2) |
| `BORRADOR` | `CANCELADO` | Cancelar | Siempre válido — ningún bloqueo existe todavía |
| `PREPARADO` | `CANCELADO` | Cancelar | Siempre válido — bloqueos adquiridos pero ninguna liquidación aplicada |
| `PREPARADO` | `PROCESANDO` | Confirmar | Transición atómica (`updateMany` condicional sobre `estado`), impide dos ejecuciones concurrentes del mismo pago |
| `PROCESANDO` | `CONFIRMADO` | Fin de la secuencia | Las `N` de `N` filas terminaron `APLICADA` |
| `PROCESANDO` | `PARCIAL` | Fin de la secuencia | Al menos 1 fila `APLICADA` y al menos 1 fila `PENDIENTE`/`FALLIDA` |
| `PROCESANDO` | `FALLIDO` | Fin de la secuencia | 0 filas `APLICADA` — nada se llegó a ejecutar con éxito |
| `FALLIDO` | `CANCELADO` | Cancelar | Válido — `FALLIDO` implica, por definición, que ninguna liquidación fue pagada; libera todos los bloqueos |
| `FALLIDO` | `PROCESANDO` | Reintentar | Reintenta únicamente las filas `PENDIENTE`/`FALLIDA` (Decisión 1) |
| `PARCIAL` | `PROCESANDO` | Reintentar | Reintenta únicamente las filas `PENDIENTE`/`FALLIDA` — **`PARCIAL` no tiene ninguna otra transición posible** |
| `CONFIRMADO` | — | — | Terminal |
| `CANCELADO` | — | — | Terminal |

**Distinción exacta entre `FALLIDO` y `PARCIAL`, ya que ambas involucran algún fracaso:** `FALLIDO` es reversible (`→ CANCELADO` válido) porque cero liquidaciones fueron pagadas; `PARCIAL` no lo es, bajo ninguna circunstancia, porque al menos una sí lo fue — es la aplicación directa y literal de la regla "no permitir `CANCELADO` después de que alguna liquidación haya sido pagada".

### Comportamiento de bloqueos por estado

| Estado | `Liquidacion.pagoConsolidadoLiquidacionId` |
|---|---|
| `BORRADOR` | `null` en todas las filas — sin bloqueo |
| `PREPARADO`, `PROCESANDO`, `PARCIAL`, `FALLIDO`, `CONFIRMADO` | Apuntando a la fila correspondiente, en todas las filas — incluidas las todavía `PENDIENTE`/`FALLIDA` de un pago `PARCIAL` |
| `CANCELADO` | `null` en todas las filas — liberado como parte de la transición |

### Reglas de reintento e idempotencia

- Un reintento es la misma operación de "confirmar", invocada de nuevo sobre un pago en `PARCIAL` o `FALLIDO`.
- Antes de ejecutar cualquier fila, se revalida la Decisión 4 completa (rol, acceso vigente, pertenencia al grupo) — nunca se asume que sigue vigente desde el intento anterior.
- Solo se procesan las filas con `estadoAplicacion` en `PENDIENTE` o `FALLIDA` — una fila `APLICADA` es, por definición, idempotente respecto de cualquier reintento posterior: no se vuelve a leer su `Liquidacion`, no se vuelve a escribir nada, no genera una segunda entrada de `AuditLog`.
- Dos reintentos concurrentes sobre el mismo pago no pueden ejecutarse a la vez — la transición `→ PROCESANDO` es, en sí misma, el mecanismo de exclusión (Decisión 5, transición `PREPARADO/PARCIAL/FALLIDO → PROCESANDO`, atómica).
- No existe un límite de reintentos definido en estas decisiones — queda como comportamiento operativo, no técnico, sin resolver acá.

### Garantías reales y límites de consistencia

- **Garantizado:** dentro de una organización, la aplicación de un pago (marcar `Liquidacion` `PAGADA` + `Viaje` `PAGADO`) es atómica — o se aplicó completa, o no se aplicó (mismo patrón que `LiquidacionesController.pagar()` ya usa hoy).
- **Garantizado:** una liquidación nunca puede estar bloqueada por dos pagos consolidados a la vez (Decisión 3).
- **Garantizado:** el estado persistido (`BORRADOR`/`PREPARADO`/`PROCESANDO`/`CONFIRMADO`/`PARCIAL`/`FALLIDO`/`CANCELADO`, más `estadoAplicacion` por fila) siempre refleja, con exactitud, qué se aplicó realmente y qué no — nunca hay una fila `APLICADA` que en realidad no se haya escrito, ni una `PENDIENTE` que en realidad ya se haya pagado.
- **No garantizado, deliberadamente:** que un pago que involucra varias organizaciones se aplique como una única operación indivisible — un `PARCIAL` es un resultado legítimo y esperado del sistema, no una falla del diseño (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4 — no existe, con la arquitectura actual, una transacción física que cruce organizaciones).
- **No garantizado, y fuera de alcance de estas decisiones:** ninguna resolución automática para un pago que queda indefinidamente en `PARCIAL` porque la causa del fallo en una organización puntual no es transitoria (por ejemplo, la liquidación fue anulada por otra vía mientras tanto) — el reintento seguiría fallando en esa misma fila, sin ningún mecanismo adicional de intervención manual/administrativa diseñado en este documento. Se deja registrado como límite conocido, no como un caso a resolver ahora.

---

## Impacto esperado si el Grupo Económico tuviera hasta 50 organizaciones

Ninguna de las cinco decisiones cambia de naturaleza con el tamaño del grupo — todas están diseñadas por-organización, no por-tamaño-de-grupo. Efectos reales esperables, sin proponer ninguna solución nueva:

- **Latencia de `preparar()`/`confirmar()`:** ambas ejecutan una secuencia de invocaciones, una por organización involucrada. Con 50 organizaciones en un mismo pago, son 50 aperturas de contexto y 50 transacciones locales en secuencia — el tiempo total crece linealmente con la cantidad de organizaciones. Estas decisiones no definen si esa secuencia debe ser estrictamente secuencial o si podría paralelizarse (`organizacionContextStorage`, al ser un `AsyncLocalStorage`, técnicamente admite invocaciones concurrentes aisladas entre sí) — es una decisión de implementación, no cubierta acá.
- **`PARCIAL` deja de ser un caso raro y pasa a ser esperable con frecuencia real:** con solo 2 organizaciones (el caso real actual), la probabilidad de que al menos una de las dos falle en un intento dado es baja. Con 50, incluso con una probabilidad de fallo pequeña por organización, la probabilidad de que **al menos una** de 50 falle en un intento dado crece sustancialmente (matemáticamente: `1 - (1-p)^50` versus `1 - (1-p)^2`). **Consecuencia directa para el futuro Bloque 10.6:** el flujo de reintento manual sobre un pago `PARCIAL` necesitaría ser, a esa escala, un flujo de uso habitual y bien resuelto en la interfaz — no una pantalla de error excepcional, mal cuidada.
- **Carga administrativa de la Decisión 4:** exigir acceso explícito y vigente a *cada* organización involucrada significa que, para operar un pago de 50 organizaciones, el `ADMINISTRADOR` necesitaría hasta 49 `AccesoGrupoEconomico` distintos ya otorgados (uno por cada organización ajena a la suya). Esto es una fricción operativa real y esperable a esa escala, no un problema de corrección — coherente con el mismo riesgo ya aceptado explícitamente en `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`, Decisión 3 ("mayor superficie de acceso... decisión tomada con conocimiento de ese costo").
- **`AuditLog`:** hasta 50 entradas nuevas por operación de grupo (una por organización involucrada, mismo patrón ya usado en 10.3.b) — sin ningún problema de escala nuevo; el sistema ya sostiene un volumen bajo-medio de entradas sin paginación forzosa (confirmado en la auditoría de 10.4.c).
- **Modelo de datos:** sin ningún cambio de diseño necesario entre 2 y 50 organizaciones — `PagoConsolidadoLiquidacion` sigue siendo una fila por (organización, liquidación), sin límite estructural; el bloqueo (Decisión 3) sigue siendo un campo simple en `Liquidacion`, sin ninguna estructura adicional requerida por el tamaño del grupo.
- **Combinación en memoria de candidatos (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4):** trivial computacionalmente incluso con 50 organizaciones — es una concatenación de listas ya pequeñas (liquidaciones `CONFIRMADA` de un solo chofer por organización), no un cálculo costoso.

**Ningún caso real de 50 organizaciones existe hoy** (el caso real de este proyecto tiene dos) — este análisis es exclusivamente de impacto potencial, tal como se pidió, no una justificación para diseñar nada adicional ahora.

---

## Resumen para la implementación

Las cinco decisiones quedan incorporadas como restricciones obligatorias de la implementación de Bloque 10.5:

- **Decisión 1:** sin saga; `estadoAplicacion` por fila; reintento manual idempotente sobre pendientes/fallidas únicamente.
- **Decisión 2:** tres etapas (`BORRADOR` sin bloqueo → preparar con bloqueo y compensación local segura → confirmar con aplicación real por organización, sin compensación).
- **Decisión 3:** `Liquidacion.pagoConsolidadoLiquidacionId`, adquirido/liberado con `updateMany` condicional, nunca liberado una vez `PARCIAL`/`CONFIRMADO`.
- **Decisión 4:** `RolesGuard` + `ADMINISTRADOR` en todo el controller (corrige la suposición del diseño); acceso vigente exigido a cada organización involucrada, revalidado en cada llamada, incluidas las de lectura.
- **Decisión 5:** siete estados, tabla de transiciones exacta de esta sección — ninguna transición fuera de esta tabla es válida.

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en Bloques 10.1 a 10.4.c. Con este documento queda **cerrada formalmente la etapa Auditoría → Diseño → Decisiones de Bloque 10.5**. La implementación queda pendiente de una instrucción explícita posterior.

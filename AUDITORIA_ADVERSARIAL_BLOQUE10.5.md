# Auditoría Adversarial — Bloque 10.5 (Pago Consolidado, Backend)

**Fecha:** 2026-07-19 (auditoría original) — **actualizado 2026-07-19** tras la corrección de los Hallazgos 1 y 2.
**Alcance:** exclusivamente el backend de Pago Consolidado (`PagoConsolidadoService`, `PagoConsolidadoController`, DTOs, migración y modelos asociados), ya implementado y aprobado funcionalmente por el Product Owner.
**Autorización:** auditoría adversarial formal, código congelado durante la etapa de ataque; corrección mínima de los dos hallazgos medios autorizada y aplicada después, según el análisis forense en `ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md`.
**Objetivo:** asumir que la implementación puede estar equivocada e intentar romperla activamente en las doce dimensiones solicitadas: aislamiento multiempresa, autorizaciones, idempotencia, consistencia, concurrencia, compensaciones, reintentos, transacciones, auditoría, bloqueo persistente, estados inválidos, regresiones sobre los Bloques 10.1–10.4.

> **Nota de actualización:** este documento conserva el registro original de la auditoría (secciones 1 a 5, sin alterar) porque cada hallazgo fue real en su momento. La sección 6, agregada al final, documenta las correcciones aplicadas y su reverificación — leer ambas para el estado completo.

---

## 1. Metodología

Esta auditoría combinó dos fuentes de evidencia, nunca una sola:

1. **Revisión de código línea por línea** de `pago-consolidado.service.ts` (post-refactor de mantenibilidad, ya aprobado), `pago-consolidado.controller.ts`, los DTOs, `organizacion-prisma.client.ts` y `organizacion-context.ts` — buscando activamente contraejemplos a cada garantía declarada en `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`.
2. **Ataques reales ejecutados contra un servidor de desarrollo vivo**, con datos sembrados reales (`Organización Principal` / `Organización B`, chofer compartido `Carlos Gómez`, dos liquidaciones `CONFIRMADA`), incluyendo **peticiones HTTP verdaderamente concurrentes** (disparadas en paralelo con `&`/`wait`, no simuladas en secuencia) para las pruebas de carrera. No se usaron mocks ni razonamiento puramente teórico donde fue posible ejecutar el ataque real.

Se crearon fixtures temporales de prueba (un usuario sin rol ADMINISTRADOR, un administrador de una organización totalmente ajena al grupo, un administrador nativo de Organización B) exclusivamente para las pruebas de autorización — ningún cambio de código, solo datos de prueba.

---

## 2. Resultado por categoría

### 2.1 Aislamiento multiempresa — **sin hallazgos**

- Todo acceso a `Liquidacion` pasa por `organizacionContextStorage.run()` + el cliente scopeado (`ORGANIZACION_PRISMA`), que descarta cualquier fila cuyo `organizacionId` no coincida con el contexto activo. Se intentó declarar un `organizacionId` en `crear()` distinto al dueño real de la `liquidacionId` citada — `revalidarItem()` lo rechaza (`findUnique` bajo el contexto declarado devuelve `null` porque el registro real pertenece a otra organización) con `400`.
- `verificarAccesoATodas()` se ejecuta **antes** de cualquier lectura sensible en los seis métodos (`crear`, `preparar`, `confirmar`, `cancelar`, `listar`, `consultar`) — confirmado leyendo el orden real de las llamadas, no solo por convención.
- Un administrador de una organización totalmente ajena al grupo (`Organización Auditoría Externa`, sin `grupoEconomicoId`) fue rechazado con `400` ("Tu organización no pertenece a este grupo económico") tanto en lectura (`candidatos`) como en escritura (`crear`), sin exponer si el grupo o la identidad existen.

### 2.2 Autorizaciones — **sin hallazgos**

- Rol no `ADMINISTRADOR` (rol `OPERACIONES` real, vía JWT real): `403 Forbidden` en los 7 endpoints, sin excepción.
- Sin token: `401`. Token malformado: `401`.
- **Prueba TOCTOU (revocación a mitad de flujo):** se creó y preparó un pago que involucra Organización B (acceso vía `AccesoGrupoEconomico`), se eliminó ese acceso, y se reintentaron `confirmar()`, `consultar()` y `cancelar()` sobre el mismo pago — **los tres fueron rechazados con `403`**, confirmando que `verificarAccesoATodas()` se revalida en cada llamada y nunca confía en un estado de autorización previamente válido (Decisión Técnica 4, tal como está escrita, se sostiene bajo ataque real).

### 2.3 Idempotencia y reintentos — **sin hallazgos**

- Confirmado en la sesión de validación previa y re-verificado aquí: un `confirmar()` repetido sobre un pago `PARCIAL` procesa **exclusivamente** las filas `PENDIENTE`/`FALLIDA`; la fila ya `APLICADA` nunca vuelve a leerse ni a escribirse (mismo `fechaPago`, sin segunda entrada de `AuditLog`).
- Bajo concurrencia real (ver 2.4), dos `confirmar()` simultáneos sobre el mismo pago produjeron **exactamente 2** entradas `pago_consolidado_aplicado` en total (una por organización), nunca 4 — confirma que la idempotencia se sostiene incluso cuando dos ejecuciones se solapan en el tiempo, no solo en llamadas secuenciales.

### 2.4 Concurrencia y bloqueo persistente — **sin hallazgos** (la categoría más atacada en esta auditoría)

Tres escenarios de carrera real, no teóricos:

1. **Doble `preparar()` concurrente sobre el mismo pago `BORRADOR`:** un racer ganó (`PREPARADO`, ambos bloqueos correctamente asignados a sus propias filas), el otro perdió limpiamente (`400`, sin adquirir ningún bloqueo, sin dejar el pago en un estado intermedio).
2. **Doble `confirmar()` concurrente sobre el mismo pago `PREPARADO`:** la transición atómica a `PROCESANDO` (`updateMany` condicional) dejó pasar exactamente una ejecución; la segunda recibió `400` ("El pago ya está siendo procesado por otra operación") sin tocar ninguna fila.
3. **Dos `PagoConsolidado` distintos, ambos citando la misma `Liquidacion`, preparados en paralelo:** solo uno adquirió el bloqueo (`PREPARADO`); el otro quedó correctamente rechazado y **permaneció en `BORRADOR`, no corrupto** — sigue siendo cancelable por el usuario.

El idioma de bloqueo atómico (`updateMany` condicionado al valor actual de `pagoConsolidadoLiquidacionId`) sostuvo las tres carreras sin excepción. Esto confirma en producción-simulada lo que el diseño declaraba en teoría.

### 2.5 Consistencia, transacciones y compensaciones — **2 hallazgos (ver sección 3)**

- La compensación de `preparar()` ante colisión de un único ítem fue confirmada dos veces (carrera #1 y #3 arriba: el perdedor no deja ningún bloqueo huérfano).
- **No se pudo completar** una prueba específica de compensación con trabajo real que deshacer (adquirir el bloqueo del primer ítem de un pago de 2 ítems y fallar en el segundo, dentro de la misma llamada) antes de que la etapa de pruebas en vivo fuera pausada por instrucción explícita. El primer intento de configurar este escenario fue interceptado correctamente por la revalidación de `crear()` (un ítem ya bloqueado por otro pago es rechazado en la creación misma, con el `PagoConsolidado` completo sin persistir — confirma indirectamente que la transacción de `crear()` no deja huérfanos). La ruta de compensación multi-ítem con éxito parcial dentro de `preparar()` queda **verificada solo por lectura de código** (revisar Hallazgo 1 y 2), no por ejecución real. Se declara como **riesgo residual de cobertura**, no como hallazgo de defecto.
- Se identificaron dos huecos reales de consistencia por revisión de código — ver sección 3.

### 2.6 Estados inválidos — **sin hallazgos**

Matriz completa de transiciones ejecutada contra la tabla aprobada (`DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, Decisión 5):

| Transición intentada | Resultado esperado | Resultado real |
|---|---|---|
| `BORRADOR` → `confirmar` (saltea `preparar`) | rechazo | `400` ✓ |
| `PREPARADO` → `preparar` (doble preparación) | rechazo | `400` ✓ |
| `PARCIAL` → `cancelar` | rechazo | `400` ✓ |
| `CONFIRMADO` → `preparar` | rechazo | `400` ✓ |
| `CONFIRMADO` → `cancelar` | rechazo | `400` ✓ |
| `CONFIRMADO` → `confirmar` | rechazo | `400` ✓ |
| Ambas liquidaciones inválidas al confirmar → `FALLIDO` | permitido, estado correcto | `FALLIDO` ✓ |
| `FALLIDO` → `cancelar` | permitido (Decisión 5) | `201`, bloqueos liberados ✓ |
| `FALLIDO` → `confirmar` (reintento) | permitido | ✓ (validado en sesión previa) |

Ninguna transición no listada en la tabla aprobada resultó alcanzable.

### 2.7 Auditoría — **sin hallazgos funcionales, 1 hallazgo estructural (ver Hallazgo 1)**

- Bajo concurrencia real (2.4, escenario 2), el conteo de entradas de auditoría fue exacto: sin duplicados, sin huecos, una por organización involucrada por operación.
- El patrón `usuarioId: null` + `actorId` en el JSON para organizaciones ajenas al actor (resolución del conflicto de FK ya aprobada por el Product Owner) se verificó correcto en cada entrada de todas las pruebas de esta auditoría.
- Hallazgo estructural: la escritura de auditoría no está acoplada transaccionalmente al cambio de estado en `preparar()` ni en `cancelar()` (sí lo está en `crear()`, ya corregido). Ver Hallazgo 1.

### 2.8 Regresión sobre Bloques 10.1–10.4 — **sin hallazgos**

Se ejecutaron round-trips reales de escritura (no solo lecturas `200`):

- **10.1/10.2** (`GrupoEconomicoController`): consulta del grupo con sus organizaciones — correcta.
- **10.3.a** (`AccesoGrupoController`): ciclo completo `resolver usuario → otorgar acceso → listar → revocar → listar (vacío)` ejecutado con un administrador nativo de Organización B creado para esta prueba — los cinco pasos funcionaron exactamente como en Bloque 10.3, sin ninguna interferencia de Bloque 10.5.
- **10.3.b** (`OrganizacionesAccesiblesController`): lista de organizaciones accesibles correcta.
- **10.4.a** (`IdentidadChoferGrupoController`): listar identidades y candidatos, correcto. La ruta de escritura (`vincular`/`desvincular`) no fue re-ejercida en esta auditoría porque Bloque 10.5 no comparte código ni escribe sobre esas rutas — solo **lee** `Chofer.identidadChoferGrupoId`, nunca lo modifica; el riesgo de regresión ahí es estructuralmente nulo, no solo no observado.
- **`LiquidacionesController`**: consulta de una liquidación previamente tocada por pruebas de Pago Consolidado — responde con su forma completa habitual, sin ningún campo roto ni ausente.

---

## 3. Hallazgos

### Hallazgo 1 — Auditoría no acoplada transaccionalmente al cambio de estado en `preparar()` y `cancelar()` — **✅ CORREGIDO (ver sección 6)**

**Severidad: Media.**

**Evidencia (código, `pago-consolidado.service.ts`):** en `crear()`, la creación del `PagoConsolidado` y `auditarPorOrganizacion()` están dentro del mismo `this.prisma.$transaction()` — corrección ya aplicada tras el hallazgo de la etapa de implementación (evita que un `PagoConsolidado` quede huérfano en `BORRADOR` si la auditoría de alguna organización falla). **Ese mismo acoplamiento no existe en `preparar()` ni en `cancelar()`**: ambos ejecutan primero el cambio de estado real (adquisición de bloqueos + `pagoConsolidado.update()` en `preparar()`; liberación de bloqueos + `pagoConsolidado.update()` en `cancelar()`) y **después**, como llamada separada y no transaccional, `auditarPorOrganizacion()`.

**Escenario de fallo concreto:** si la escritura de `AuditLog` para la segunda organización falla por cualquier motivo transitorio (no necesariamente el conflicto de FK ya resuelto — puede ser cualquier error de conexión, timeout, o restricción futura), `preparar()` ya dejó el pago en `PREPARADO` con ambos bloqueos adquiridos, pero el cliente recibe un `500` sin saber que la operación en realidad tuvo efecto. El mismo patrón aplica a `cancelar()`: los bloqueos ya fueron liberados y el estado ya es `CANCELADO`, pero el cliente ve un error. No se reprodujo en vivo porque el disparador conocido (la FK de `AuditLog`) ya está resuelto — es un hallazgo de **revisión de código**, no de explotación en vivo.

**Impacto real:** no hay corrupción de datos financieros ni doble bloqueo — el estado resultante es siempre el correcto. El impacto es una posible discrepancia entre lo que el cliente cree que pasó (error) y lo que realmente pasó (éxito), más un rastro de auditoría incompleto para esa operación.

**Recomendación:** envolver `preparar()` (adquisición de bloqueos + `pagoConsolidado.update` + auditoría) y `cancelar()` (liberación de bloqueos + `pagoConsolidado.update` + auditoría) en transacciones únicas, con el mismo patrón ya usado en `crear()` — reutilizando `auditarPorOrganizacion(..., cliente: tx)`, que ya soporta un cliente transaccional inyectado. Cambio acotado, mismo patrón ya probado. **No implementado en esta auditoría por estar el código congelado.**

---

### Hallazgo 2 — Ventana de inconsistencia entre la aplicación real del pago y el registro de su progreso, en `confirmar()` — **✅ CORREGIDO (ver sección 6)**

**Severidad: Media-baja.**

**Evidencia (código, `confirmar()`, líneas del bucle de filas pendientes):** para cada fila, el pago real ocurre dentro de un `$transaction` (marca `Liquidacion.estado = PAGADA`, `Viaje.estadoLiquidacion = PAGADO`, escribe el `AuditLog` de aplicación) — y **solo después de que esa transacción confirma exitosamente**, una llamada **separada y no transaccional** marca `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"`.

**Escenario de fallo concreto:** si el proceso se interrumpe (caída del servidor, pérdida de conexión a la base) exactamente entre esas dos escrituras, la liquidación queda genuinamente `PAGADA` (el dinero "se movió"), pero la fila de seguimiter sigue marcada `PENDIENTE`. Un reintento posterior de `confirmar()` volvería a intentar procesar esa fila, entraría de nuevo al `$transaction`, encontraría `liquidacion.estado !== "CONFIRMADA"` (porque ya es `PAGADA`) y la marcaría **`FALLIDA`** — sin volver a pagar (no hay doble pago, el sistema falla de forma segura en ese sentido), pero reportando como fallida una operación que en realidad ya se aplicó correctamente, dejando el pago en un `PARCIAL` o `FALLIDO` engañoso pese a que todo el dinero involucrado ya se movió correctamente.

**Impacto real:** no hay riesgo de doble pago ni de pérdida de dinero. El riesgo es puramente de **reporte**: un operador podría ver `FALLIDA` una fila que en la realidad del negocio ya está paga, y actuar en consecuencia (por ejemplo, reintentando manualmente por fuera del sistema, o escalando un "fallo" que no es tal).

**Recomendación:** unificar ambas escrituras en una sola transacción (incluir el `update` de `PagoConsolidadoLiquidacion.estadoAplicacion` dentro del mismo `$transaction` que aplica el pago), o —si el `contextStorage`/organización activa dentro del `tx` lo permite— actualizar `estadoAplicacion` como parte del mismo bloque. **No implementado en esta auditoría por estar el código congelado.**

---

### Hallazgo 3 (informativo, no bloqueante) — `listar()` falla por completo si el actor carece de acceso a **cualquier** organización tocada por **cualquier** pago del grupo

**Severidad: Baja — falla en el sentido seguro (deniega, nunca filtra), pero afecta disponibilidad.**

**Evidencia (código):** `listar()` calcula la unión de `organizacionId` de **todos** los pagos del grupo y llama a `verificarAccesoATodas()` una sola vez sobre esa unión completa. Si el actor tiene acceso legítimo a algunos pagos pero no a otro (de una tercera organización, en un grupo con más de dos organizaciones), la llamada entera lanza `403` — el actor no puede ver ni siquiera los pagos a los que sí tiene acceso.

**Impacto:** no hay fuga de datos (el fallo es denegar, no mostrar de más). El efecto es un problema de disponibilidad/experiencia para administradores con acceso parcial en grupos de más de dos organizaciones — escenario no representado en el entorno de desarrollo actual (solo 2 organizaciones), por lo que este hallazgo es **de revisión de código, no reproducido en vivo**.

**Recomendación (para una futura decisión del Product Owner, no urgente):** filtrar la lista a los pagos cuyas organizaciones el actor sí puede ver, en vez de exigir acceso a la unión completa. Cambio de comportamiento, no un simple refactor — requeriría su propia autorización explícita si se decide abordar.

---

## 4. Riesgos residuales (no relacionados con defectos de código)

- ~~Cobertura incompleta de la prueba de compensación multi-ítem~~ — **resuelto**, ver sección 6: se ejecutaron carreras reales adicionales tras la corrección que cubren esta ruta.
- ~~Entorno de desarrollo con datos de prueba pendientes de limpieza~~ — **resuelto**, ver sección 6: entorno restaurado a la línea base documentada.
- **Fixture conocido de `otorgadoPorId` en Organización B** (ya documentado en memoria de sesiones previas): no es un hallazgo nuevo de esta auditoría — sigue pendiente, sin relación con Bloque 10.5.

---

## 5. Veredicto y recomendación final

**No se encontraron hallazgos críticos.** Las tres garantías más sensibles del bloque —aislamiento multiempresa, autorización revalidada en cada llamada (incluida bajo TOCTOU real), y bloqueo persistente bajo concurrencia real— se sostuvieron ante ataque activo, incluyendo peticiones HTTP verdaderamente paralelas, no simuladas.

Se registran dos hallazgos de severidad media/media-baja (Hallazgos 1 y 2), ambos en la misma familia: pasos de auditoría o de seguimiento de progreso que no están acoplados transaccionalmente al cambio de estado real que describen. Ninguno de los dos permite fuga de datos entre organizaciones, bypass de autorización, doble pago, ni corrupción del bloqueo persistente — el riesgo es de **reporte/auditoría incompleta bajo fallas transitorias**, no de integridad financiera ni de aislamiento.

Un hallazgo informativo adicional (Hallazgo 3) queda registrado para una decisión de producto futura, no bloqueante.

**Recomendación (vigente al cierre de la auditoría original):** dado que no hay hallazgos críticos, el camino queda abierto para el Acta de Cierre del Bloque 10.5, quedando los Hallazgos 1 y 2 documentados como deuda técnica conocida y explícitamente aceptada (o para una corrección puntual futura, a decisión del Product Owner) — no como bloqueantes de cierre.

**Actualización:** el Product Owner optó por corregir ambos hallazgos antes del cierre, en vez de aceptarlos como deuda técnica. Ver sección 6 para la corrección aplicada y su reverificación.

---

## 6. Corrección de los Hallazgos 1 y 2 y reverificación (2026-07-19)

**Base:** `ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md` (análisis forense punto por punto de ambos hallazgos, incluyendo el descubrimiento de que un pago puede quedar bloqueado en `PROCESANDO` sin salida si el proceso muere a mitad de `confirmar()` — consecuencia adicional del Hallazgo 2, **expresamente excluida** del alcance de esta corrección por decisión del Product Owner; queda pendiente de una decisión técnica propia si corresponde abrirla).

### 6.1 Alcance exacto de la corrección aplicada

Exclusivamente los tres cambios mínimos autorizados, sin tocar reglas funcionales, estados, autorizaciones, DTOs, endpoints ni el schema:

1. **`preparar()`**: adquisición de bloqueo + transición a `PREPARADO` + auditoría, ahora dentro de un único `this.prisma.$transaction()`. La compensación manual (`adquiridas` + liberación explícita en el `catch`) se eliminó — quedaba muerta e incorrecta una vez que la reversión nativa de la transacción cubre exactamente el mismo caso, de forma más simple y más confiable.
2. **`cancelar()`**: liberación de bloqueo + transición a `CANCELADO` + auditoría, ahora dentro de un único `$transaction()`. `liberarBloqueo()` se generalizó para aceptar un cliente transaccional opcional (mismo patrón ya usado por `auditarPorOrganizacion()`).
3. **`confirmar()`**: el `update` de `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"` se movió dentro del `$transaction` por fila que ya aplicaba el pago real — ahora ambas escrituras son atómicas entre sí.

Build limpio (`npm run build`) tras cada cambio y al final.

### 6.2 Pruebas repetidas (exclusivamente las afectadas por la corrección)

- **`cancelar()` transaccional:** reutilizando el propio `PagoConsolidado` `PREPARADO` que había quedado residual de la auditoría original, se lo canceló vía API — bloqueo liberado correctamente, transición a `CANCELADO`, auditoría completa (una entrada, `usuarioId: null` + `actorId`, organización ajena al actor). Sin discrepancias.
- **`preparar()` transaccional bajo colisión real:** repetida la carrera de dos `PagoConsolidado` distintos citando la misma `Liquidacion`, preparados en paralelo (peticiones HTTP verdaderamente concurrentes, no secuenciales) — **dos ejecuciones independientes**, en ambas el ganador quedó `PREPARADO` con sus dos bloqueos correctamente asignados, el perdedor quedó `BORRADOR` sin ningún bloqueo huérfano ni parcial. Uno de los dos intentos usó un pago de **dos ítems** (`liqA` + `liqB`) para forzar que, de perder, tuviera que revertir un bloqueo ya adquirido dentro de la misma transacción — la reversión nativa se comportó correctamente. Esto satisface el riesgo residual de cobertura señalado en la sección 4 de la auditoría original.
- **`confirmar()` — ciclo completo de fallo parcial + reintento, repetido íntegramente:** se forzó de nuevo que una de las dos liquidaciones perdiera su estado `CONFIRMADA` entre `preparar()` y `confirmar()`. Resultado `PARCIAL` correcto; `Liquidacion.estado = PAGADA`, `Viaje.estadoLiquidacion = PAGADO` y `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"` de la organización sana quedaron escritos **juntos**, confirmando que la corrección realmente los unió en una sola transacción. Tras restaurar el estado alterado, el reintento alcanzó `CONFIRMADO`, procesó únicamente la fila `FALLIDA`, no volvió a tocar `fechaPago` de la fila ya `APLICADA`, y el conteo final de auditoría (`pago_consolidado_aplicado`) fue exactamente 2, sin duplicados — idéntico resultado al de la validación pre-corrección, confirmando que la corrección no alteró ningún comportamiento externamente observable, solo cerró la ventana de inconsistencia interna.

Ninguna otra categoría de la auditoría original (aislamiento, autorizaciones, estados inválidos, regresión 10.1–10.4) fue re-ejecutada, por no verse afectada por estos tres cambios — ninguno de los tres toca reglas de acceso, transiciones de estado permitidas, ni ningún endpoint fuera de `preparar`/`cancelar`/`confirmar`.

### 6.3 Entorno de desarrollo

Todos los `PagoConsolidado` generados durante la auditoría original y esta reverificación fueron eliminados; `liqA`/`liqB` (seed) restauradas a `CONFIRMADA` sin bloqueo ni `fechaPago`; los tres usuarios y la organización temporales de prueba (`noadmin-audit@demo.com`, `adminc-audit@demo.com` + su organización, `adminb-audit@demo.com`) fueron eliminados. El único `AccesoGrupoEconomico` vigente es el original del seed oficial (`admin@demo.com` → Organización B). Servidor de desarrollo detenido.

### 6.4 Veredicto final actualizado

Los Hallazgos 1 y 2 quedan **corregidos y reverificados**, no aceptados como deuda técnica. El Hallazgo 3 (informativo, `listar()`) y la consecuencia del `PROCESANDO` sin salida (descubierta en el análisis forense) permanecen **fuera de alcance**, documentados para una decisión técnica futura si el Product Owner decide abrirla. No hay hallazgos críticos ni pendientes bloqueantes. El entorno de desarrollo quedó restaurado a su línea base documentada. **Sin operaciones de git en ningún momento de esta corrección ni de su reverificación.**

# Análisis de Hallazgos — Bloque 10.5 (Pago Consolidado)

**Fecha:** 2026-07-19
**Base:** `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md` (aprobada como documento de control), Hallazgos 1 y 2.
**Alcance de este documento:** análisis forense exclusivo de los dos hallazgos medios. **No se modifica código.** No se limpia el entorno de desarrollo. No hay operaciones de git.
**Criterio rector del Product Owner** (citado tal como fue dado, para que cada punto lo responda explícitamente): no aceptar inconsistencias entre cambio de estado real, `estadoAplicacion`, auditoría, respuesta al cliente y comportamiento posterior de los reintentos.

---

## Hallazgo 1 — Auditoría no acoplada transaccionalmente al cambio de estado en `preparar()` y `cancelar()`

### 1. Secuencia exacta de fallo

**En `preparar()`** (`pago-consolidado.service.ts`), la ejecución real es una serie de escrituras Prisma **independientes**, cada una confirmada (`COMMIT`) en su propio viaje a la base, sin ningún `$transaction` que las agrupe:

1. Por cada fila del pago: `this.prisma.liquidacion.updateMany({ where: { id, pagoConsolidadoLiquidacionId: null }, data: { pagoConsolidadoLiquidacionId: fila.id } })` — dentro de `organizacionContextStorage.run()` de esa organización. Se ejecuta y confirma una vez por organización involucrada.
2. `this.prisma.pagoConsolidado.update({ where: { id: pagoId }, data: { estado: "PREPARADO" } })` — una escritura, confirmada.
3. `auditarPorOrganizacion(...)` → por cada organización distinta involucrada, `cliente.auditLog.create({...})` — usa `this.prisma` (el cliente de nivel superior) por defecto, **no** un `tx` compartido. Se ejecuta y confirma una vez por organización.

Secuencia de fallo concreta: los pasos 1 y 2 confirman exitosamente para **todas** las organizaciones y para el pago. En el paso 3, la escritura de auditoría de la **primera** organización confirma; la de la **segunda** (o cualquiera posterior) lanza una excepción (puede ser cualquier error transitorio de base de datos — pérdida de conexión, timeout, restricción futura; el disparador históricamente observado, el conflicto de FK de `AuditLog.usuario`, ya está resuelto). Esa excepción no está envuelta en ningún `try/catch` dentro de `auditarPorOrganizacion()` ni en `preparar()` — se propaga tal cual hasta el controlador y de ahí al filtro de excepciones global.

**En `cancelar()`** la secuencia es análoga: (1) `liberarBloqueo()` por cada fila (confirmado independientemente), (2) `pagoConsolidado.update({ estado: "CANCELADO", canceladoPorId, canceladoMotivo })` (confirmado), (3) `auditarPorOrganizacion(...)` (puede fallar en la segunda organización, igual que arriba).

### 2. Punto de commit exacto

| Paso | Operación | ¿Confirmado si falla el paso 3? |
|---|---|---|
| `preparar()` 1 | `liquidacion.updateMany` (bloqueo, por organización) | **Sí**, cada una por separado |
| `preparar()` 2 | `pagoConsolidado.update({estado:"PREPARADO"})` | **Sí** |
| `preparar()` 3a | `auditLog.create` (primera organización) | **Sí** |
| `preparar()` 3b | `auditLog.create` (segunda organización) | **No** — es el paso que falla |
| `cancelar()` 1 | `liquidacion.updateMany` (liberación, por organización) | **Sí**, cada una por separado |
| `cancelar()` 2 | `pagoConsolidado.update({estado:"CANCELADO",...})` | **Sí** |
| `cancelar()` 3a/3b | `auditLog.create` por organización | Igual que arriba: la primera sí, la que falla no |

El punto de commit está, en ambos métodos, **antes** del paso de auditoría — es decir, el efecto real (bloqueo/liberación + transición de estado) ya es irreversible en la base cuando la auditoría todavía puede fallar.

### 3. Estado final de cada tabla involucrada (tras el fallo, sin ningún reintento todavía)

**Caso `preparar()`, fallo en la auditoría de la segunda organización:**

| Tabla | Estado final |
|---|---|
| `Liquidacion` (ambas organizaciones) | `pagoConsolidadoLiquidacionId` correctamente asignado en las dos — bloqueo real y completo |
| `PagoConsolidado` | `estado = "PREPARADO"` — correcto, es el estado verdadero |
| `PagoConsolidadoLiquidacion` | sin cambios (esta tabla no la toca `preparar()`) |
| `AuditLog` | **una** entrada `pago_consolidado_preparado` (primera organización); la de la segunda **no existe** |

**Caso `cancelar()`, fallo análogo:**

| Tabla | Estado final |
|---|---|
| `Liquidacion` (ambas organizaciones) | `pagoConsolidadoLiquidacionId = null` en las dos — liberación real y completa |
| `PagoConsolidado` | `estado = "CANCELADO"`, `canceladoPorId`/`canceladoMotivo` correctamente escritos |
| `AuditLog` | una entrada `pago_consolidado_cancelado` de dos esperadas |

En ambos casos: **ninguna tabla queda en un valor falso o contradictorio en sí misma** — cada tabla, leída de forma aislada, es internamente correcta. La única laguna es la ausencia de una fila de `AuditLog`.

### 4. Respuesta que recibe el cliente

Un `500` o un código mapeado por `PrismaExceptionFilter` (`400`/`404`/`409` según el tipo exacto de error de Prisma que dispare la escritura fallida) — en cualquier caso, **una respuesta de error**, pese a que la operación completa (bloqueo/liberación + transición de estado) ya ocurrió y es irreversible. El cliente no tiene forma de distinguir, solo por la respuesta HTTP, entre "no pasó nada" y "pasó todo menos la última entrada de auditoría".

### 5. Comportamiento del reintento

- **Reintentar `preparar()`** sobre el mismo pago: `obtenerPagoOFallar` lee `estado = "PREPARADO"` (ya no `"BORRADOR"`) → rechazo inmediato con `400` ("Solo se puede preparar un pago consolidado en estado BORRADOR."). El mensaje es **técnicamente correcto** pero no informa al operador que su intento anterior en realidad tuvo éxito.
- **Reintentar `cancelar()`** sobre el mismo pago tras el fallo en `cancelar()`: `estado = "CANCELADO"` → rechazo con el mensaje "No se puede cancelar un pago consolidado con al menos una liquidación ya pagada" — **este mensaje es activamente engañoso** en este caso puntual: el pago no fue pagado, fue cancelado correctamente; el mensaje es genérico para los tres estados excluidos (`PROCESANDO`/`CONFIRMADO`/`CANCELADO`) y no distingue cuál de los tres es el real. Es un defecto de claridad de mensaje, menor pero real, directamente causado por este hallazgo.
- En ambos casos, `consultar()` (una llamada de lectura adicional) **sí** refleja el estado verdadero — la información correcta existe y es accesible, solo no llega en la respuesta del intento fallido.

### 6. Posibilidad de falsos `FALLIDA`, `PENDIENTE`, `APLICADA`, `PREPARADO` o `CANCELADO`

**Ninguna.** `preparar()` no toca `estadoAplicacion` (ese campo es exclusivo de `confirmar()`). El valor de `PagoConsolidado.estado` (`PREPARADO` o `CANCELADO` según el método) que queda escrito es el **verdadero** — no hay ningún valor falso en ninguna tabla. La única falsedad involucrada es la **percepción del cliente** (cree que falló cuando en realidad tuvo éxito), no un dato persistido incorrecto.

### 7. Posibilidad de auditoría faltante o contradictoria

**Faltante: sí, confirmado.** Exactamente una entrada de `AuditLog` (la de la última organización procesada en el bucle) puede faltar por operación afectada.
**Contradictoria: no.** Las entradas que sí existen son correctas y consistentes con el estado real; no hay ninguna entrada con datos erróneos, solo ausencia.

### 8. Por qué no puede producir doble pago

`preparar()` y `cancelar()` **nunca** escriben `Liquidacion.estado = "PAGADA"` ni mueven dinero — esa es responsabilidad exclusiva de `confirmar()`. Este hallazgo, por construcción, no puede alcanzar ese código: el fallo ocurre en el paso de auditoría, que es posterior y ajeno a cualquier escritura de pago. No hay ninguna ruta desde este hallazgo hacia una doble aplicación de pago.

### 9. Estrategia mínima de corrección

Envolver el cuerpo completo de `preparar()` (bucle de adquisición de bloqueo + `pagoConsolidado.update` + `auditarPorOrganizacion`) y de `cancelar()` (bucle de liberación + `pagoConsolidado.update` + `auditarPorOrganizacion`) cada uno en su propio `this.prisma.$transaction(async (tx) => {...})`, pasando `tx` a `auditarPorOrganizacion` (que **ya** acepta un parámetro `cliente` inyectable — usado hoy por `crear()`) y a las llamadas de bloqueo/liberación dentro del mismo bloque. Es exactamente el patrón que `crear()` ya usa y que esta misma auditoría verificó en vivo que funciona correctamente (Bloque 3, `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`). No requiere ningún mecanismo nuevo.

### 10. Impacto de la corrección sobre las decisiones técnicas aprobadas

**Ninguno.** Decisión Técnica 2 ya especifica que `preparar()` es todo-o-nada ("el pago permanece en BORRADOR, nunca queda en un PREPARADO a medias") y que `cancelar()` es una operación completa. Envolver estos dos métodos en una transacción física única **refuerza**, no reabre, esa semántica ya aprobada — los convierte de "todo-o-nada a nivel de bloqueos, pero no a nivel de auditoría" a "todo-o-nada de punta a punta", que es lo que la decisión ya pedía.

Esto **no** entra en tensión con Decisión Técnica 1 (no simular atomicidad global entre organizaciones para el *pago*): esa decisión rige exclusivamente el paso de confirmación/pago, donde el éxito parcial entre organizaciones es un resultado legítimo y buscado (`PARCIAL`). `preparar()`/`cancelar()` nunca tuvieron ese requisito — ya estaban definidos como atómicos de punta a punta; el fallo actual es que la *implementación* no cumple del todo lo que la *decisión* ya exigía. La prueba de que envolver escrituras de varias organizaciones en un mismo `$transaction` es seguro y ya está aprobada en los hechos: `crear()` ya lo hace hoy (escribe `PagoConsolidadoLiquidacion` y `AuditLog` de ambas organizaciones dentro de una única transacción), y esta auditoría lo verificó funcionando correctamente en vivo.

### 11. Recomendación

**Corregir antes del cierre.** Es un cambio acotado (mismo patrón ya usado y probado en `crear()`, aplicado a dos métodos más), de bajo riesgo, que no reabre ninguna decisión aprobada, y que cierra exactamente la clase de inconsistencia que el criterio del Product Owner declaró inaceptable (estado real vs. auditoría vs. respuesta al cliente).

---

## Hallazgo 2 — Ventana de inconsistencia entre el pago real y `estadoAplicacion`, en `confirmar()`

### 1. Secuencia exacta de fallo

Por cada fila pendiente, dentro del bucle de `confirmar()`:

```
await organizacionContextStorage.run({ organizacionId: fila.organizacionId }, async () => {
  await this.prisma.$transaction(async (tx) => {
    // lee Liquidacion, verifica CONFIRMADA, escribe PAGADA, escribe Viaje.PAGADO, escribe AuditLog "aplicado"
  });
});
await this.prisma.pagoConsolidadoLiquidacion.update({ where: { id: fila.id }, data: { estadoAplicacion: "APLICADA" } });
```

El `$transaction` es, en sí mismo, atómico y correcto: `Liquidacion.estado`, `Viaje.estadoLiquidacion` y el `AuditLog` de aplicación se confirman **juntos o no se confirma ninguno**. El problema es la línea siguiente: el `update` de `PagoConsolidadoLiquidacion.estadoAplicacion` es una **segunda escritura, separada, no incluida en esa transacción**. Si el proceso se interrumpe (caída del servidor, pérdida de conexión al pool de Postgres, cualquier causa) exactamente entre el `await` del `$transaction` (ya resuelto con éxito) y el `await` de este segundo `update`, el pago real ya ocurrió pero su registro de progreso no.

### 2. Punto de commit exacto

| Paso | Operación | ¿Confirmado si el proceso muere justo después? |
|---|---|---|
| A | `$transaction`: `Liquidacion.estado = "PAGADA"` + `Viaje.estadoLiquidacion = "PAGADO"` + `AuditLog` "aplicado" | **Sí** — los tres juntos, atómicamente |
| B | `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"` | **No**, si el proceso muere entre A y B |

El punto de no retorno real (el dinero "se movió") es el commit del paso A. El paso B es puramente un registro de seguimiento, y es exactamente ese registro el que puede perderse.

### 3. Estado final de cada tabla (inmediatamente después de la interrupción, antes de cualquier reintento)

| Tabla | Estado |
|---|---|
| `Liquidacion` (la organización afectada) | `estado = "PAGADA"`, `fechaPago` asignada — **correcto y real** |
| `Viaje` asociado | `estadoLiquidacion = "PAGADO"` — **correcto y real** |
| `AuditLog` | entrada `pago_consolidado_aplicado` **sí existe** para esa organización (parte del mismo `$transaction` que sí confirmó) |
| `PagoConsolidadoLiquidacion` (esa fila) | `estadoAplicacion` sigue en el valor que tenía **antes** de este intento — típicamente `"PENDIENTE"` (si era el primer intento) |
| `PagoConsolidado` (padre) | sigue en `"PROCESANDO"` — ver punto 6, consecuencia adicional |

### 4. Respuesta que recibe el cliente

Si el proceso muere, **no hay respuesta** — la conexión HTTP se corta sin réplica (timeout o conexión reiniciada, según el punto exacto de la caída). El cliente no puede saber, solo por la ausencia de respuesta, que el pago de esa organización sí se aplicó.

### 5. Comportamiento del reintento

Al reiniciar el proceso y llamar `confirmar()` de nuevo sobre el mismo pago:

- **Bloqueado primero por la consecuencia adicional del punto 6**: el pago quedó en `estado = "PROCESANDO"` tras la transición atómica previa a la caída, y **`PROCESANDO` no es un estado de entrada válido para `confirmar()`** (`{in: ["PREPARADO","PARCIAL","FALLIDO"]}` no lo incluye) — la llamada se rechaza de inmediato con `400` ("Solo se puede confirmar un pago PREPARADO, PARCIAL o FALLIDO."), **sin siquiera llegar a re-procesar la fila**. Ver el punto 6 para el desarrollo completo de esta consecuencia — es más grave que la sola discrepancia de `estadoAplicacion`.
- Asumiendo (hipotéticamente, si se corrigiera manualmente el estado del pago a `PARCIAL`/`FALLIDO` para destrabarlo, o si el diseño permitiera reintentar desde `PROCESANDO`): el reintento procesaría de nuevo la fila (porque su `estadoAplicacion` sigue en `"PENDIENTE"`, no en `"APLICADA"`), entraría otra vez al `$transaction`, y en su primera línea leería `Liquidacion.estado` — que ya es `"PAGADA"`, no `"CONFIRMADA"` — disparando `throw new Error("La liquidación ya no está en condiciones de pagarse.")`. Esto **no revierte ni repite el pago** (la comprobación es de solo lectura antes de escribir nada), cae al `catch`, y marca la fila `estadoAplicacion = "FALLIDA"`.

### 6. Posibilidad de falsos `FALLIDA`, `PENDIENTE`, `APLICADA`, `PREPARADO` o `CANCELADO`

- **Falso `PENDIENTE` (transitorio, entre la caída y el reintento):** sí — la fila permanece en `"PENDIENTE"` pese a que el pago real ya se aplicó.
- **Falso `FALLIDA` (permanente, tras el reintento hipotético):** sí — como se explicó en el punto 5, un reintento posterior marcaría la fila `"FALLIDA"` pese a que el pago se aplicó correctamente en el intento anterior. Es un falso negativo persistente: la fila queda documentando un fallo que no existió.
- **Falso `APLICADA`:** no se identificó ningún camino que lo produzca — ese valor solo se escribe después de que el `$transaction` correspondiente ya resolvió con éxito.
- **Consecuencia adicional descubierta en este análisis, directamente ligada a este hallazgo — `PagoConsolidado` puede quedar bloqueado en `PROCESANDO` de forma permanente:** la transición a `PROCESANDO` (paso previo al bucle, atómico y correcto en sí mismo) no tiene ninguna vía de salida si el proceso muere antes de que el bucle termine y escriba el estado final (`CONFIRMADO`/`PARCIAL`/`FALLIDO`). Ni `confirmar()` (exige `PREPARADO`/`PARCIAL`/`FALLIDO` como estado de entrada) ni `cancelar()` (exige `BORRADOR`/`PREPARADO`/`FALLIDO`) aceptan un pago en `PROCESANDO` como punto de partida. **No es una posibilidad hipotética de diseño: es una consecuencia directa y verificable, por lectura de código, de la misma clase de interrupción que motiva este hallazgo.** No se reprodujo en vivo (requeriría matar el proceso a mitad de una transacción real), pero la ausencia de cualquier ruta de código que revierta `PROCESANDO` es un hecho verificado, no una inferencia. Esto no compromete la integridad del dinero ya movido, pero sí la operabilidad del pago: quedaría congelado, visible solo por lectura (`consultar()`), sin ninguna acción posible desde la API hasta una intervención manual sobre la base.
- **Falso `PREPARADO`/`CANCELADO`:** no aplica — este hallazgo ocurre estrictamente después de `PREPARADO` y antes de cualquier posibilidad de `CANCELADO` (que además ya está bloqueado una vez el pago pasa a `PROCESANDO`).

### 7. Posibilidad de auditoría faltante o contradictoria

**Ninguna omisión ni contradicción en el `AuditLog` de la aplicación real** — la entrada `pago_consolidado_aplicado` se escribe **dentro** del mismo `$transaction` que el pago, así que si el pago se confirmó, esa entrada de auditoría también existe, siempre, sin excepción. El hallazgo aquí no es de auditoría (a diferencia del Hallazgo 1) — es exclusivamente de la tabla de seguimiento de progreso (`PagoConsolidadoLiquidacion.estadoAplicacion`), que no es parte del rastro de auditoría en sí, pero sí es la fuente de la que depende la clasificación final del pago (`CONFIRMADO`/`PARCIAL`/`FALLIDO`) — por eso su inconsistencia es igual de seria en la práctica, aunque técnicamente el `AuditLog` mismo quede intacto.

### 8. Por qué no puede producir doble pago

La primera línea de cada `$transaction` por fila es: `const liquidacion = await tx.liquidacion.findUnique(...)` seguida de `if (!liquidacion || liquidacion.estado !== "CONFIRMADA") throw`. Esta comprobación se hace **siempre contra el valor real y actual en la base**, nunca contra ningún estado en memoria ni contra `PagoConsolidadoLiquidacion.estadoAplicacion`. Una vez que una liquidación pasa a `"PAGADA"`, ningún camino del código la revierte a `"CONFIRMADA"` — así que cualquier segundo intento de pagarla, sea por un reintento manual del operador o por una futura corrección automática del reintento, **siempre** se topará con esta comprobación y **siempre** será rechazado antes de escribir nada. La garantía contra el doble pago no depende de `estadoAplicacion` en absoluto — depende únicamente del valor real de `Liquidacion.estado`, que es correcto en el 100% de los escenarios analizados.

### 9. Estrategia mínima de corrección

Mover el `update` de `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"` **dentro** del mismo bloque `$transaction(async (tx) => {...})`, como su última instrucción, usando `tx` en lugar de `this.prisma`. `PagoConsolidadoLiquidacion` no es un modelo organizacional (`ORGANIZACION_PRISMA` lo deja pasar sin filtrar en cualquier contexto), así que esta escritura funciona sin cambios dentro del mismo `tx` ya abierto para esa organización — no requiere ningún nuevo cruce de organizaciones ni ningún mecanismo adicional.

Para la consecuencia adicional (`PROCESANDO` sin salida): requiere una decisión de diseño aparte, no un simple reordenamiento de líneas — por ejemplo, permitir que `confirmar()` acepte `PROCESANDO` como estado de entrada válido cuando se detecta que no hay ninguna ejecución concurrente real en curso (lo cual es en sí mismo delicado: distinguir "quedó colgado por una caída" de "otra request lo está procesando ahora mismo" no es trivial con el mecanismo actual). Se señala aquí como algo que excede la corrección mínima del hallazgo original y que ameritaría su propio análisis si se decide abordarlo.

### 10. Impacto de la corrección sobre las decisiones técnicas aprobadas

**Ninguno para la corrección mínima (punto 9, primer párrafo).** No cambia el alcance de la transacción entre organizaciones (sigue siendo una transacción por fila, por organización, exactamente como exige Decisión Técnica 1 para preservar `PARCIAL` como resultado legítimo) — solo mueve una escritura de seguimiento que ya estaba destinada a ocurrir "inmediatamente después de cada intento" (texto literal de la Decisión Técnica 1) para que ocurra genuinamente junto con ese intento, en vez de inmediatamente después mirado desde el código pero no desde la base de datos.

**La consecuencia adicional (`PROCESANDO` sin salida) si se decide abordarla, sí tocaría una decisión aprobada** — específicamente la tabla de transiciones de Decisión Técnica 5, que hoy no contempla ningún camino de salida desde `PROCESANDO` salvo la finalización exitosa del mismo `confirmar()` que lo originó. Cualquier corrección de esto requeriría una nueva decisión técnica explícita, no un ajuste de implementación. Por eso se recomienda tratarla como hallazgo documentado y no como parte de la corrección mínima de este hallazgo.

### 11. Recomendación

**Corregir antes del cierre**, al menos en su forma mínima (punto 9, primer párrafo) — mismo argumento que el Hallazgo 1: cambio acotado, de bajo riesgo, no reabre ninguna decisión aprobada, y cierra exactamente la clase de inconsistencia (estado real vs. `estadoAplicacion` vs. comportamiento del reintento) que el criterio del Product Owner declaró inaceptable.

La consecuencia adicional (`PROCESANDO` sin salida) se recomienda **documentar explícitamente como riesgo aceptado** para este cierre — no bloquea la corrección mínima, pero sí amerita su propia decisión técnica en un futuro bloque de mantenimiento, dado que tocar la tabla de transiciones no es un cambio menor.

---

## Consolidado — criterio de decisión

Ambos hallazgos comparten la misma estructura: una operación que ya es correcta y atómica en su núcleo (el pago real, o el cambio de estado + bloqueo) seguida de una escritura de segundo orden (auditoría, o seguimiento de progreso) que no comparte esa atomicidad. Ninguno de los dos, en ningún escenario analizado, puede producir doble pago, fuga entre organizaciones, ni bypass de autorización — eso fue verificado exhaustivamente en la Auditoría Adversarial y se reconfirma aquí por análisis forense punto por punto. El riesgo real es exactamente el que el criterio del Product Owner señaló: posibilidad de que el estado real, `estadoAplicacion`, la auditoría, la respuesta al cliente y el comportamiento del reintento **no cuenten la misma historia** entre sí durante una ventana de falla transitoria.

Ambas correcciones mínimas (Hallazgo 1: envolver `preparar()`/`cancelar()` en transacción con su auditoría; Hallazgo 2: mover el `update` de `estadoAplicacion` dentro del `$transaction` existente) son de bajo riesgo, acotadas, reutilizan patrones ya aprobados y probados en este mismo bloque, y no reabren ninguna Decisión Técnica. La única pieza que sí tocaría una decisión aprobada — la ausencia de salida desde `PROCESANDO` — se recomienda separar como su propio hallazgo documentado, no resolverla como parte de esta corrección.

---

## Datos residuales del entorno de desarrollo (documentación, sin limpiar)

Estado exacto verificado por lectura directa de la base al momento de escribir este documento — nada de lo siguiente fue modificado.

### `PagoConsolidado` en estado `PREPARADO`

```
id: 1d55eb31-1999-452d-bcde-49636cfccf8d
grupoEconomicoId: 1e9aa60e-9d65-4a8d-95f0-b966f5f3bdf3
identidadChoferGrupoId: 490fcf7c-b5e5-48b9-a670-e63d7537d171
estado: PREPARADO
totalConsolidado: 216000
referenciaPago: "Compensacion pago1"
creadoPorId: f44c2561-e2b3-45d1-b37b-9ae4da2317b0 (admin@demo.com)
```

Con una única fila en `PagoConsolidadoLiquidacion`:

```
id: cc7023c3-56ef-46dd-8c0f-2c37aecfe295
organizacionId: 186f88d0-f209-4545-9d27-a3af3b1f53df (Organización B)
liquidacionId: ec55573f-e6f8-4425-a64e-ed16c39e2d8d (liqB)
estadoAplicacion: PENDIENTE
```

### Bloqueo asociado

```
Liquidacion ec55573f-e6f8-4425-a64e-ed16c39e2d8d (liqB, Organización B):
  estado: CONFIRMADA (no pagada — el bloqueo es solo de preparación, nunca se llegó a confirmar)
  pagoConsolidadoLiquidacionId: cc7023c3-56ef-46dd-8c0f-2c37aecfe295  ← bloqueada por el pago de arriba

Liquidacion b105e99f-4f53-44e2-9f61-befbfe6eee3d (liqA, Organización Principal):
  estado: CONFIRMADA
  pagoConsolidadoLiquidacionId: null  ← libre, sin bloqueo
```

Efecto práctico: mientras este `PagoConsolidado` no se cancele, `liqB` no puede incluirse en ningún otro Pago Consolidado ni aparecerá en `candidatos()` para Organización B. `liqA` no está afectada.

### Usuarios temporales de auditoría (ninguno pertenece al seed oficial)

| Email | Rol | Organización | Propósito de la prueba |
|---|---|---|---|
| `noadmin-audit@demo.com` | OPERACIONES | Organización Principal | verificar rechazo `403` por rol no ADMINISTRADOR |
| `adminc-audit@demo.com` | ADMINISTRADOR | Organización Auditoría Externa (nueva, ver abajo) | verificar rechazo por organización fuera del grupo |
| `adminb-audit@demo.com` | ADMINISTRADOR | Organización B | probar el round-trip real de `otorgar`/`revocar` acceso (10.3.a), inexistente hasta ahora en el seed |

Las tres tienen contraseña `Demo1234!`, igual que el resto de los usuarios de desarrollo.

### Organización temporal

```
id: 1cb9ce9b-e1c3-4a59-b605-ea7610514235
nombre: "Organizacion Auditoria Externa"
cuit: 30-99999999-9
grupoEconomicoId: null  ← deliberadamente fuera de cualquier grupo económico
```

### `AccesoGrupoEconomico` vigentes

Solo queda el acceso original del seed oficial (`admin@demo.com` → Organización B) — ninguno de los accesos creados o revocados durante las pruebas de esta auditoría quedó residual; cada prueba de otorgamiento/revocación se cerró correctamente dentro de la propia sesión de pruebas.

```
id: 17a0d219-3351-4537-9126-dac51160b0e3
usuarioId: f44c2561-e2b3-45d1-b37b-9ae4da2317b0 (admin@demo.com)
organizacionId: 186f88d0-f209-4545-9d27-a3af3b1f53df (Organización B)
```

### Nota sobre el impacto de estos residuos

Ninguno de estos datos es información de producción ni altera el seed oficial documentado (`backend/prisma/seed.js`, sin modificar). El único efecto observable para cualquier desarrollo futuro sobre este entorno es que `liqB` aparece bloqueada y que existen tres usuarios y una organización de más — ninguno interfiere con el funcionamiento del sistema, solo con la limpieza documentada del entorno de desarrollo. Se recomienda limpiarlos junto con la corrección de los hallazgos (si se opta por corregir antes del cierre) o inmediatamente antes del Acta de Cierre, con autorización explícita separada, siguiendo el mismo patrón ya usado en esta sesión (liberar el bloqueo antes de borrar las filas hijas, por la restricción `onDelete: Restrict`).

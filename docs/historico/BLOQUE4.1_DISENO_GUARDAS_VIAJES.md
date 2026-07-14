# Diseño Técnico — Bloque 4.1: Guardas de edición y cancelación de Viajes

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó `schema.prisma`, no se hizo commit. Desarrolla en detalle el sub-bloque 4.1 de `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` (diseño general ya aprobado), enfocado exclusivamente en `ViajesController` (`update`, `cambiarEstado`, `cancelar`). No toca `FacturaViaje`, no toca `Cobranza`, no toca schema.

---

## 0. Confirmación adicional del terreno (frontend)

Antes de fijar el diseño, verifiqué `ViajeDetalle.tsx:89`: el botón "Cancelar viaje" solo se muestra si `viaje.estado !== "CANCELADO" && viaje.estado !== "DESCARGADO"`. Es decir, **hoy la UI ya oculta la posibilidad de cancelar un viaje `DESCARGADO`** (que es la única condición bajo la cual `estadoFacturacion`/`estadoLiquidacion` pueden haber avanzado, ya que ambos flujos exigen `estado: "DESCARGADO"` como precondición). Esto confirma lo señalado en el documento general: el gap de `cancelar()`/`cambiarEstado()` no es explotable desde el uso normal de la aplicación hoy, solo por API directa — razón de más para cerrarlo en el backend (que es la fuente de verdad real) y no depender de que el frontend siga ocultando el botón para siempre. `ViajeDetalle.tsx:49` ya muestra `err?.response?.data?.message` tal cual venga del backend, así que los mensajes de error de este diseño llegan directo a pantalla sin transformación — importa que sean claros y accionables.

---

## 1. Campos de `Viaje`: política de edición para `update()`

### 1.1 Siempre editables (cualquier estado, incluido `CANCELADO`)

| Campo | Motivo |
|---|---|
| `observaciones` | No aparece en ningún export/snapshot de Factura ni Liquidación; es la nota operativa libre, incluso útil para documentar por qué se hizo algo después de cancelar/facturar/liquidar. |

### 1.2 Bloqueados si `estadoFacturacion !== "PENDIENTE_DE_FACTURAR"`

`fecha`, `cartaPorte`, `ctg`, `clienteId`, `cerealId`, `origenId`, `destinoId`, `transportistaId`, `toneladas`, `tarifaTonelada`.

(Idéntico a la tabla ya aprobada en `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` §2.1 — la repito acá completa para que este documento sea autocontenido y sirva de referencia directa al implementar.)

### 1.3 Bloqueados si `estadoLiquidacion !== "PENDIENTE"`

`fecha`, `toneladas`, `tarifaTonelada`, `transportistaId`, `choferId`, `camionId`, `acopladoId`, `cerealId`, `origenId`, `destinoId`.

### 1.4 `productorId` — punto de decisión pendiente

En el documento general quedó como pregunta abierta: no aparece en ningún `include`/export de Factura ni Liquidación, por lo que no hay ningún documento que se vuelva inconsistente si se edita después de facturar/liquidar. **Para este sub-bloque, mi recomendación concreta es: siempre editable** (no entra en las listas de 1.2/1.3). Si preferís tratarlo igual que el resto por consistencia de política, es agregarlo a ambas listas — avisame antes de que lo implemente, es la única variable abierta de esta sección.

### 1.5 Regla de combinación

Los bloqueos de 1.2 y 1.3 no son excluyentes — se acumulan. Un campo queda bloqueado si aparece en **cualquiera** de las dos listas y su condición correspondiente se cumple (ej. `toneladas` se bloquea tanto por facturación como por liquidación; si el viaje está facturado pero no liquidado, ya alcanza con la condición de facturación para bloquearlo).

### 1.6 Regla de "cambio real" (para no rechazar un `PATCH` que no cambia nada)

Un campo bloqueado solo dispara el rechazo si el valor **propuesto en el body difiere del valor actual** en la base. Comparación por campo:
- Campos `String`/`String?` (`cartaPorte`, `ctg`, `clienteId`, `cerealId`, `origenId`, `destinoId`, `transportistaId`, `choferId`, `camionId`, `acopladoId`): comparación directa de string (tratando `null`/`undefined`/`""` de forma consistente para los opcionales, ej. `acopladoId`).
- `fecha`: comparar `new Date(body.fecha).getTime() === actual.fecha.getTime()` (el body llega como string ISO, la base como `Date`).
- `toneladas`, `tarifaTonelada`: comparar como número (`Number(body.toneladas) === actual.toneladas`), no como string.

Esto evita que un cliente que reenvía el objeto completo (patrón común de formularios que mandan todos los campos, hayan cambiado o no) reciba un `400` por un campo que en los hechos no está intentando modificar.

### 1.7 Qué ocurre si el viaje está `CANCELADO`

**Nueva regla, no derivada de facturación/liquidación:** si `viaje.estado === "CANCELADO"`, **ningún campo puede editarse salvo `observaciones`** — independientemente de `estadoFacturacion`/`estadoLiquidacion` (que, por construcción, según la regla de cancelación de la sección 3, siempre van a estar en `PENDIENTE_DE_FACTURAR`/`PENDIENTE` en un viaje cancelado, ya que cancelar exige eso como precondición — ver sección 3). Un viaje cancelado es un registro cerrado: no tiene sentido de negocio recalcular `importeTotal`, reasignar transportista/chofer, ni cambiar fechas/ubicaciones de un viaje que oficialmente no se concretó. La única razón legítima para tocarlo después es dejar una nota (`observaciones`) — por ejemplo, documentar el motivo real si no quedó claro en la cancelación.

Esta regla se evalúa **antes** que las de 1.2/1.3 (si el viaje está cancelado, el mensaje de error debe decir eso, no "está facturado", aunque coincidan en la práctica).

---

## 2. `update()` — comportamiento completo, en orden

1. `findUnique({ where: { id } })` incondicional al inicio (hoy solo se hace si `toneladas`/`tarifaTonelada` vienen en el body) — si no existe, `NotFoundException("Viaje no encontrado")`. Esto es un cambio de comportamiento menor pero necesario: hoy un `PATCH` a un `id` inexistente sin `toneladas`/`tarifaTonelada` en el body llega hasta el `update` de Prisma y depende del `PrismaExceptionFilter` (P2025 → 404) para responder bien; con la guarda, se vuelve una validación explícita y más rápida, consistente con el estilo de `cambiarEstado`/`cancelar`.
2. Calcular el conjunto de campos presentes en el body cuyo valor difiere del actual (regla 1.6).
3. Si `viaje.estado === "CANCELADO"` y ese conjunto contiene algo más que `observaciones` → `400` (mensaje en sección 4.1).
4. Si `viaje.estadoFacturacion !== "PENDIENTE_DE_FACTURAR"` y la intersección con la lista de 1.2 no está vacía → `400` (mensaje en sección 4.2).
5. Si `viaje.estadoLiquidacion !== "PENDIENTE"` y la intersección con la lista de 1.3 no está vacía → `400` (mensaje en sección 4.3).
6. Si pasa todas las validaciones, continúa exactamente igual que hoy (recalcular `importeTotal` si corresponde, parsear `fecha`, `prisma.viaje.update(...)`).

Los pasos 3-5 pueden coexistir: si el viaje está facturado **y** liquidado y el body toca campos bloqueados por ambos motivos, la respuesta agrega ambos mensajes (ver 4.4) en un único `400`, para que quien esté integrando (hoy nadie, pero un futuro formulario de edición) vea todas las violaciones de una vez y no tenga que corregir y reintentar campo por campo.

---

## 3. `cambiarEstado()` / `cancelar()` — comportamiento completo

Ambos endpoints terminan llamando a `aplicarCambioEstado(viaje, "CANCELADO", ...)` para cancelar (`cambiarEstado` en la rama `nuevo === "CANCELADO"`, línea 135-137; `cancelar` siempre). Se centraliza la guarda en un único punto (un método privado nuevo, ej. `assertCancelacionPermitida(viaje)`), invocado desde ambos antes de llamar a `aplicarCambioEstado`, para no duplicar la lógica ni arriesgar que uno de los dos endpoints quede desactualizado si la regla cambia.

**Orden de validación (ambos endpoints):**
1. Si `viaje.estado === "CANCELADO"` → `400` ("El viaje ya está cancelado" — reutiliza el mismo texto que ya usa `cambiarEstado` en la línea 132 para transiciones hacia adelante, por consistencia).
2. Si `viaje.estadoFacturacion !== "PENDIENTE_DE_FACTURAR"` → `400` (mensaje 4.5).
3. Si `viaje.estadoLiquidacion !== "PENDIENTE"` → `400` (mensaje 4.6).
4. Si pasa ambas, procede igual que hoy (`aplicarCambioEstado`).

**Nota sobre `cambiarEstado()` con transiciones hacia adelante (no `CANCELADO`):** no requieren ningún cambio — ya están correctamente acotadas por `ORDEN_ESTADOS` (no permiten pasar de `DESCARGADO` a ningún otro estado no-`CANCELADO`, que es la única condición bajo la cual `estadoFacturacion`/`estadoLiquidacion` podrían haber avanzado). El único punto de intervención dentro de `cambiarEstado()` es la rama `nuevo === "CANCELADO"`.

---

## 4. Mensajes de error

Mismo estilo que el resto del código (`BadRequestException` con un string plano — no hay precedente de objetos de error estructurados en ningún controller de este proyecto, así que no lo introduzco acá). Los mensajes listan los campos concretos en conflicto para que sean accionables sin tener que leer el código.

**4.1 — Edición de un campo no permitido en viaje `CANCELADO`:**
> `No se puede editar el viaje: está cancelado. Solo se puede modificar "observaciones". Campos rechazados: {lista}.`

**4.2 — Edición bloqueada por facturación:**
> `No se puede editar el viaje: ya está facturado (estado de facturación: {estadoFacturacion}). Anule la factura asociada para poder editar: {lista de campos rechazados}.`

**4.3 — Edición bloqueada por liquidación:**
> `No se puede editar el viaje: ya está liquidado (estado de liquidación: {estadoLiquidacion}). Anule la liquidación asociada para poder editar: {lista de campos rechazados}.`

**4.4 — Ambos motivos a la vez (facturado y liquidado, cada uno bloqueando campos distintos o superpuestos):** se concatenan 4.2 y 4.3 en un mismo mensaje (separadas por un salto de línea o `" "`), nunca se descarta uno a favor del otro. (4.1 es excluyente de 4.2/4.3 — si aplica 4.1, no hace falta evaluar los otros dos porque ya cubre el superset de campos.)

**4.5 — Cancelación bloqueada por facturación:**
> `No se puede cancelar el viaje: está facturado (estado de facturación: {estadoFacturacion}). Anule la factura asociada primero.`

**4.6 — Cancelación bloqueada por liquidación:**
> `No se puede cancelar el viaje: está liquidado (estado de liquidación: {estadoLiquidacion}). Anule la liquidación asociada primero.`

**4.7 — Cancelación de un viaje ya cancelado:**
> `El viaje ya está cancelado.`

Si en 3. aplican tanto 4.5 como 4.6 (facturado y liquidado a la vez), igual que en 4.4, se concatenan ambos en la misma respuesta.

---

## 5. Endpoints modificados

| Endpoint | Método afectado | Cambio |
|---|---|---|
| `PATCH /viajes/:id` | `update()` | `findUnique` incondicional al inicio + guardas de 1.3/1.7/1.2 antes del `update`. |
| `POST /viajes/:id/estado` (solo rama `estado === "CANCELADO"`) | `cambiarEstado()` | Llama a la nueva guarda `assertCancelacionPermitida()` antes de `aplicarCambioEstado`. Las transiciones hacia adelante no cambian. |
| `POST /viajes/:id/cancelar` | `cancelar()` | Llama a la misma guarda `assertCancelacionPermitida()` antes de `aplicarCambioEstado`. |

**Sin cambios:** `create()`, `findAll()`, `findOne()`, `pendientesFacturar()`, `aplicarCambioEstado()` (el método privado en sí no cambia — la guarda se aplica *antes* de invocarlo, no dentro).

**Sin cambios en ningún otro módulo:** `FacturasController`, `LiquidacionesController`, `schema.prisma` — confirmando el alcance acordado (4.1 es 100% `ViajesController`, sin tocar `FacturaViaje` ni `Cobranza`).

---

## 6. Plan de pruebas

**`update()`:**
1. Editar `observaciones` de un viaje `FACTURADO` y `LIQUIDADO` a la vez → `200`, sin restricciones.
2. Editar `toneladas` de un viaje sin facturar ni liquidar → `200`, `importeTotal` se recalcula igual que hoy.
3. Editar `toneladas` de un viaje `FACTURADO` (liquidación `PENDIENTE`) → `400` con mensaje 4.2, listando `toneladas`.
4. Editar `choferId` de un viaje `LIQUIDADO` (facturación `PENDIENTE_DE_FACTURAR`) → `400` con mensaje 4.3, listando `choferId`.
5. Editar `toneladas` y `clienteId` de un viaje facturado **y** liquidado → `400` con mensaje combinado (4.4), listando los campos correspondientes a cada motivo.
6. Reenviar en el body el mismo valor ya existente de `toneladas` (sin cambiarlo) sobre un viaje facturado → `200` (no debe rechazar un no-cambio, regla 1.6).
7. Editar `fecha` con el mismo valor ISO que ya tiene el viaje (comparación por `getTime()`, no por string) sobre un viaje liquidado → `200`.
8. Editar cualquier campo que no sea `observaciones` en un viaje `CANCELADO` → `400` con mensaje 4.1.
9. Editar `observaciones` en un viaje `CANCELADO` → `200`.
10. `PATCH` a un `id` inexistente → `404` explícito ("Viaje no encontrado"), no un 500 ni un error de Prisma crudo.
11. Regresión: un viaje en `estado: PENDIENTE`/`ASIGNADO`/etc. (no facturado, no liquidado, no cancelado) sigue aceptando ediciones de todos los campos como hoy.

**`cambiarEstado()` / `cancelar()`:**
12. Cancelar (por cualquiera de los dos endpoints) un viaje sin facturar ni liquidar → `200`, igual que hoy.
13. Cancelar un viaje `FACTURADO` → `400` con mensaje 4.5, para ambos endpoints (`/estado` con `{estado:"CANCELADO"}` y `/cancelar`).
14. Cancelar un viaje `LIQUIDADO` → `400` con mensaje 4.6, para ambos endpoints.
15. Cancelar un viaje facturado **y** liquidado → `400` con mensaje combinado (4.5 + 4.6).
16. Cancelar un viaje ya `CANCELADO` → `400` con mensaje 4.7 ("El viaje ya está cancelado"), para ambos endpoints — hoy este caso no está cubierto explícitamente en `cancelar()` (`cambiarEstado()` sí lo bloquea para transiciones hacia adelante, pero no hay guard específico para re-cancelar).
17. Camino de escape completo: facturar un viaje → intentar cancelarlo (falla, 4.5) → anular la factura → cancelar el mismo viaje (ahora `200`).
18. Mismo camino de escape para liquidación (liquidar → falla cancelar → anular liquidación → cancelar OK).
19. Transiciones hacia adelante (`PENDIENTE → ASIGNADO → ... → DESCARGADO`) sin tocar `CANCELADO` → sin cambios de comportamiento, siguen funcionando como hoy.

**Regresión transversal:**
20. `create()` de un viaje nuevo → sin cambios de comportamiento.
21. Todo el ciclo de Liquidaciones (crear/confirmar/pagar/anular, ya cerrado en Bloque 3) sobre viajes no tocados por 4.1 → sin cambios.
22. Todo el ciclo de Facturas (crear/anular/cobranzas) sobre viajes no tocados por 4.1 → sin cambios (4.2/4.3 del bloque general siguen sin implementarse, este sub-bloque no los toca).

---

## 7. Plan de rollback

100% código, sin schema ni migraciones involucradas — el perfil de rollback más simple de todo el Bloque 4.

- Revertir el commit/deploy deja `update()`, `cambiarEstado()` y `cancelar()` exactamente como están hoy (sin las guardas nuevas, sin el `findUnique` incondicional agregado al inicio de `update()`).
- No hay datos que reconciliar: ninguna guarda escribe nada nuevo en la base (no se agregan columnas, no se crean registros de auditoría en este sub-bloque) — es puramente lógica de validación antes de una escritura que ya existía.
- Sin orden de dependencia con ningún otro sub-bloque: revertir 4.1 no afecta a 4.2/4.3/4.4 (todavía no implementados) ni a nada de Bloque 3 (ya cerrado, sin relación de código con estos tres métodos).

---

## 8. Criterios de aceptación

1. `observaciones` es editable en cualquier estado del viaje, incluido `CANCELADO`, `FACTURADO` y `LIQUIDADO`.
2. Ningún campo de la lista 1.2 puede modificarse (a un valor distinto del actual) si `estadoFacturacion !== "PENDIENTE_DE_FACTURAR"`; la respuesta es `400` con el mensaje 4.2, listando los campos concretos rechazados.
3. Ningún campo de la lista 1.3 puede modificarse si `estadoLiquidacion !== "PENDIENTE"`; la respuesta es `400` con el mensaje 4.3.
4. Si un viaje está `CANCELADO`, ningún campo salvo `observaciones` puede modificarse, con el mensaje 4.1, sin importar el estado de facturación/liquidación.
5. Un `PATCH` que reenvía valores idénticos a los actuales para campos bloqueados no se rechaza (no hay falso positivo por "no-cambio").
6. Un viaje solo puede cancelarse (por `/estado` o por `/cancelar`) si `estadoFacturacion === "PENDIENTE_DE_FACTURAR"` y `estadoLiquidacion === "PENDIENTE"` y `estado !== "CANCELADO"`; en cualquier otro caso, `400` con el mensaje correspondiente (4.5/4.6/4.7).
7. Anular la Factura o Liquidación asociada a un viaje habilita nuevamente su cancelación, sin ningún paso adicional (camino de escape verificado en el plan de pruebas, punto 17-18).
8. Ningún cambio de comportamiento en `create()`, `findAll()`, `findOne()`, `pendientesFacturar()`, ni en `FacturasController`/`LiquidacionesController`/`schema.prisma`.
9. Build y typecheck limpios; el plan de pruebas de la sección 6 pasa contra la base local.

---

## Punto de decisión pendiente para tu aprobación

Solo uno, ya señalado en la sección 1.4: **¿`productorId` queda siempre editable (mi recomendación) o se agrega a las listas de bloqueo de 1.2/1.3 por consistencia de política?** No implico nada hasta tu confirmación — el resto del diseño no tiene ambigüedad.

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

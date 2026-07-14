# Diseño Técnico — Bloque 3.2: Uso correcto de `Chofer.comisionPct`

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Continúa el Bloque 3 (`BLOQUE3_DISENO_INTEGRIDAD_DATOS.md`, sección 3), después de cerrar el sub-bloque 3.1 (`anticipoGastoId`, commit `f8e2b918`, sin push todavía).

---

## 0. Auditoría — estado actual verificado (con archivo:línea)

### `Chofer.comisionPct`
- Definido en `backend/prisma/schema.prisma:143` (`Float @default(0)`), agregado por la migración `20260702171557_add_comision_pct_to_chofer`.
- Se puede popular vía API: `create-chofer.dto.ts:24` / `update-chofer.dto.ts:24` lo aceptan como opcional; `ChoferesController.create()`/`.update()` lo persisten sin lógica adicional.
- **No existe ninguna forma de cargarlo desde la interfaz.** No hay un `ChoferForm` dedicado — el alta de chofer vive embebida en `Transportistas.tsx`, cuyo estado (`nuevoChofer = { nombre, dni, cuil, licenciaNumero }`) y el `POST` correspondiente **no incluyen `comisionPct`**, ni hay ningún input para el campo. Tampoco existe ningún `PATCH /choferes/:id` invocado desde el frontend — no hay edición de choferes en absoluto. Esto es un hallazgo adicional al que documentaba `QA_FINDINGS.md`: el problema no es solo que el backend "no lee" el dato maestro, es que **hoy es físicamente imposible cargar un valor distinto de `0` desde la UI**.
- Único consumo real hoy: exports de Choferes (Excel `choferes.controller.ts:60`, PDF `:102`) — se muestra, no se usa para calcular nada.

### `Liquidacion.comisionPct` / `LiquidacionViaje.comisionPct`
- Definidos en `schema.prisma:294` y `schema.prisma:320`.
- En `LiquidacionesController.create()`, el valor sale 100% del body (`liquidaciones.controller.ts:315,332`: `const pct = Number(comisionPct ?? 0)`) — **no hay ningún `prisma.chofer.findUnique` en todo el archivo**. Se persiste en `:374` (`Liquidacion.comisionPct`) y `:388` (`LiquidacionViaje.comisionPct`, usado para calcular `comisionMonto` en `:381`).
- Frontend `Liquidaciones.tsx`: input libre inicializado en `"0"` (`:17`), enviado tal cual en el POST (`:62`). El `useEffect` que trae la lista de choferes (`:30-34`) solo usa `id`/`nombre` para el `<select>` — nunca lee `comisionPct` del chofer seleccionado.

### Vínculo actual entre ambos
**Cero**, confirmado por lectura completa del archivo — ni siquiera un cruce débil. Coincide exactamente con el hallazgo P1.4 de `QA_INFORME_FINAL.md`.

### Vigencia tras el Bloque 3.1
**Sigue 100% vigente, sin cambios.** `git show f8e2b918 -- backend/src/liquidaciones/liquidaciones.controller.ts` confirma que el commit del sub-bloque 3.1 tocó únicamente el bloque de anticipos dentro de `create()` (agregado de `anticipoGastoId`, `updateMany` condicionado) y `anular()` (reversión por `anticipoGastoId`). Ninguna línea relacionada con `comisionPct`, `pct`, ni con `LiquidacionViaje` fue tocada.

### Otros datos relevantes para el diseño
- `Transportista` no tiene ningún campo equivalente a `comisionPct` — para liquidaciones tipo TRANSPORTISTA no hay ningún dato maestro de respaldo, ni parcialmente implementado.
- `AuditLog` (`schema.prisma:393-406`) es genérico (`entidad`, `entidadId`, `accion`, `datosAnteriores: Json?`, `datosNuevos: Json?`, `usuarioId`) — sirve tal cual, sin cambios de schema, para registrar overrides.
- `CreateLiquidacionDto.comisionPct` ya es `@IsOptional()` (`create-liquidacion.dto.ts:23-26`) — el contrato de entrada no necesita cambios.
- Hallazgo aparte, no accionable en este sub-bloque: hay copias sueltas de `schema.prisma` en la raíz del repo (`schema-corrected.prisma`, `schema-correcto.prisma`, etc.) que no son la fuente activa — deuda de limpieza de repo, ya señalada en el roadmap (v1.2, "limpieza de archivos sueltos de la raíz").

---

## 1. Respuestas explícitas a tus 4 preguntas

### ¿Debe `comisionPct` seguir existiendo en `Liquidacion` o solamente en `Chofer`?
**En ambos, con roles distintos.** `Chofer.comisionPct` es el dato maestro/configuración vigente — "lo que se espera cobrar por defecto hoy". `Liquidacion.comisionPct` y `LiquidacionViaje.comisionPct` son el snapshot histórico de lo que efectivamente se aplicó en esa liquidación puntual. Eliminar el campo de `Liquidacion` para depender solo del valor "vivo" del chofer sería un error de integridad contable (ver preguntas 2 y 3). La solución correcta no es elegir uno u otro, es que el maestro alimente el snapshot en el momento de creación, sin que el snapshot dependa de él después.

### Si una comisión cambia en el futuro, ¿cómo preservamos el valor histórico de las liquidaciones ya emitidas?
Ya está resuelto por el diseño existente, siempre que no se rompa: `Liquidacion.comisionPct`/`LiquidacionViaje.comisionPct` son columnas propias, pobladas una sola vez al crear (`create()`, líneas 374/388), nunca recalculadas después (`confirmar()`, `pagar()`, `anular()` no las tocan). Mientras el fix de este sub-bloque solo agregue *de dónde sale el default* al momento de crear — sin agregar ningún recálculo posterior que vuelva a leer `Chofer.comisionPct` para liquidaciones ya existentes — cambiar la comisión de un chofer mañana no altera ninguna liquidación pasada. Es el mismo patrón de snapshot que ya usa el sistema para `LiquidacionViaje.totalViaje` respecto de `Viaje.importeTotal` (documentado en `QA_FINDINGS.md`, hallazgo Viajes #6/#12).

### ¿Conviene copiar el porcentaje al crear la liquidación (snapshot) o leer siempre el valor actual del Chofer?
**Snapshot, sin ambigüedad.** Leer siempre el valor "vivo" rompería integridad retroactiva: si el chofer renegocia su comisión el mes que viene, cada liquidación vieja (ya entregada, ya pagada, potencialmente ya usada en un reclamo o una presentación impositiva) cambiaría de valor cada vez que alguien la vuelva a abrir, exportar o reimprimir. Es exactamente el antipatrón que QA ya marcó como riesgo crítico para `importeTotal` en Viajes. El propio schema ya sigue la filosofía de snapshot correctamente en `LiquidacionViaje` — lo único que falta es que el snapshot se llene con un valor confiable en vez de un número tipeado a mano sin respaldo.

### ¿Cómo impacta esto en futuras auditorías contables?
- **Con el fix:** cada liquidación queda con evidencia reconstruible de (a) cuál era el valor maestro del chofer en ese momento y (b) cuál fue el valor efectivamente aplicado. Cuando ambos coinciden, no hay rastro adicional (fue el caso normal). Cuando difieren, queda una entrada en `AuditLog` con el antes/después y quién la generó — un auditor puede distinguir "se usó la comisión de lista" de "hubo una excepción", sin ambigüedad.
- **Sin el fix (estado actual):** no hay forma de distinguir un error de tipeo de una excepción de negocio intencional — todo el rastro es "alguien escribió este número". Es el gap que QA calificó de Alto impacto (P1.4).
- Al ser `AuditLog` genérico, una auditoría futura puede consultar todos los overrides de comisión con una query simple (`entidad: "Liquidacion", accion: "comisionPct_override"`), sin necesitar un reporte a medida.

---

## 2. Alcance exacto

**Núcleo (backend, sin el cual el resto no tiene efecto real):**
- `LiquidacionesController.create()`: cuando `tipo === "CHOFER"`, buscar el `Chofer` (hoy no se busca en absoluto). Resolver el porcentaje efectivo como `Number(comisionPct ?? chofer.comisionPct ?? 0)` — es decir, si el body no manda el campo, se usa el del chofer; si lo manda, se respeta el valor enviado (sea igual o distinto al del chofer).
- Comparar el valor resuelto contra `chofer.comisionPct`: si difieren, registrar una entrada en `AuditLog` (`entidad: "Liquidacion"`, `entidadId: <id de la liquidación creada>`, `accion: "comisionPct_override"`, `datosAnteriores: {comisionPctChofer}`, `datosNuevos: {comisionPctUsado}`, `usuarioId: user?.id`). Si coinciden, no se escribe nada (no es una excepción, es el caso normal).

**Complementario, necesario para que el núcleo tenga efecto observable (decisión pendiente, ver sección 8):**
- `Liquidaciones.tsx`: al seleccionar un chofer en el `<select>`, pre-cargar el input de `comisionPct` con el valor del chofer (`c.comisionPct`, ya viene en la respuesta de `GET /choferes`, solo no se usa). Sigue siendo editable — es un default, no un campo bloqueado.
- `Transportistas.tsx`: agregar el input `comisionPct` al formulario de alta de chofer (`nuevoChofer`). Sin esto, el dato maestro nunca se puede cargar con un valor distinto de `0` desde la UI, y el fix del núcleo queda inerte en la práctica para cualquier chofer dado de alta desde la interfaz.

**Explícitamente fuera de alcance:**
- Cualquier campo equivalente en `Transportista` (liquidaciones tipo TRANSPORTISTA siguen sin dato maestro de respaldo — no fue parte del hallazgo original y es un cambio de schema mayor).
- Edición de choferes existentes vía UI (no existe ningún formulario de edición hoy — gap pre-existente, ya en el backlog de QA como P2.5, no relacionado específicamente con comisiones).
- Limpieza de los `schema*.prisma` sueltos en la raíz del repo (mencionado en la auditoría, pertenece a v1.2 del roadmap).

---

## 3. Archivos afectados

| Archivo | Cambio |
|---|---|
| `backend/src/liquidaciones/liquidaciones.controller.ts` | `create()`: fetch de `Chofer` cuando `tipo === "CHOFER"`, resolución del default, comparación y registro en `AuditLog`. |
| `frontend/src/pages/Liquidaciones.tsx` | Pre-cargar `form.comisionPct` con el valor del chofer seleccionado (sigue editable). |
| `frontend/src/pages/Transportistas.tsx` | *(si se aprueba, ver sección 8)* agregar input `comisionPct` al alta de chofer. |

Sin cambios en `schema.prisma`, sin nuevas migraciones, sin cambios en DTOs (ya son compatibles).

---

## 4. Estrategia de implementación

1. Backend primero: modificar `create()` para resolver el default y registrar el override. Es el cambio que cierra el hallazgo de integridad contable en sí.
2. Frontend, en el mismo despliegue que el punto 1 (no por separado — ver riesgo 1 en la sección 7): pre-cargar el input en `Liquidaciones.tsx`.
3. Si se aprueba el complemento: agregar el input en `Transportistas.tsx`, sin tocar el backend (el DTO y el controller de Choferes ya aceptan el campo).
4. No hay orden de dependencia estricto entre 2 y 3 — pueden implementarse en cualquier orden relativo entre sí, ambos dependen de 1 para tener efecto real en Liquidaciones.

---

## 5. Impacto sobre el schema

Ninguno. Ambas columnas (`Chofer.comisionPct`, `Liquidacion.comisionPct`, `LiquidacionViaje.comisionPct`) ya existen desde migraciones previas. Este sub-bloque es 100% lógica de aplicación.

---

## 6. Impacto sobre Liquidaciones

- `create()` gana una lectura adicional (`prisma.chofer.findUnique`) solo para `tipo === "CHOFER"` — impacto de performance despreciable, incluso menor que el `findMany` de viajes que ya hace el mismo método.
- **Cambio de comportamiento esperado, no un bug:** una vez desplegado el frontend (punto 2) y cargados valores reales de `comisionPct` en choferes (vía el complemento del punto 3, o por API directa), las liquidaciones nuevas van a calcular un `netoPagar` distinto al que resultaría de dejar el campo en `"0"` por descuido. Hoy, según la auditoría, es muy probable que el valor maestro sea `0` para todos los choferes (nunca hubo forma de cargarlo desde la UI), así que el día del despliegue el efecto numérico inmediato es nulo — el efecto aparece recién cuando alguien carga comisiones reales. Vale la pena comunicarlo al equipo de Liquidaciones antes de habilitar el complemento del punto 3, no solo dejarlo en el código.
- `confirmar()`, `pagar()`, `anular()`, y los exports (Excel/PDF) no se tocan — siguen leyendo el snapshot ya persistido, sin cambios.
- `tipo === "TRANSPORTISTA"` no se modifica en absoluto (no hay dato maestro equivalente).

---

## 7. Compatibilidad hacia atrás

- Liquidaciones ya creadas: sin cambios, sin backfill, sin recálculo.
- `CreateLiquidacionDto.comisionPct` sigue opcional — cualquier cliente API existente que ya mande el campo (como el frontend actual) sigue funcionando idéntico, salvo por la escritura silenciosa en `AuditLog` cuando hay divergencia (no cambia la respuesta ni el código de estado de `POST /liquidaciones`).
- `tipo === "TRANSPORTISTA"` no cambia.

---

## 8. Plan de migración

No aplica — no hay cambios de schema ni de datos existentes que requieran migración o backfill en este sub-bloque.

---

## 9. Plan de pruebas

1. Crear liquidación CHOFER **sin** enviar `comisionPct` → se usa `chofer.comisionPct`; no se escribe `AuditLog` (no hay divergencia, por definición).
2. Crear liquidación CHOFER enviando `comisionPct` **igual** al del chofer → no se escribe `AuditLog` (coincide, aunque haya sido explícito).
3. Crear liquidación CHOFER enviando `comisionPct` **distinto** al del chofer → se persiste el valor enviado (no el del chofer); se crea la entrada correspondiente en `AuditLog` con antes/después y `usuarioId`.
4. Crear liquidación para un chofer con `comisionPct = 0` (caso hoy dominante) sin enviar el campo → sigue funcionando igual que hoy (0%), sin romper el caso más común actual.
5. Liquidación tipo TRANSPORTISTA → comportamiento idéntico al actual, sin fetch de `Chofer`, sin `AuditLog`.
6. Regresión: `anular()`, `confirmar()`, `pagar()`, exports Excel/PDF siguen mostrando el `comisionPct` ya snapshoteado, sin cambios de formato.
7. *(Si se incluye el complemento de Transportistas.tsx)* Alta de chofer con `comisionPct ≠ 0` desde la UI → se persiste y luego aparece pre-cargado correctamente en el formulario de Liquidaciones.
8. *(Si se incluye el complemento de Liquidaciones.tsx)* Seleccionar un chofer con `comisionPct ≠ 0` → el input se autocompleta con ese valor y sigue siendo editable.

---

## 10. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Desplegar solo el backend sin el pre-fill del frontend: el frontend seguiría enviando siempre `"0"` (su default hardcodeado hoy), generando un registro de "override" en `AuditLog` para **cualquier** chofer con `comisionPct ≠ 0`, aunque nadie haya tocado nada a propósito — ruido de auditoría, no un bug de integridad. | Desplegar backend + frontend (`Liquidaciones.tsx`) juntos, no por separado. |
| 2 | El dato maestro está vacío en la práctica hoy (nunca se pudo cargar desde la UI) — el fix del núcleo no tiene efecto observable hasta resolver cómo cargar valores reales. | Decisión explícita pendiente en la sección 8 de este documento (¿se incluye el input en `Transportistas.tsx` en este mismo sub-bloque?). |
| 3 | Cambio de comportamiento numérico en `netoPagar` para liquidaciones futuras de choferes con comisión real cargada. | Es el comportamiento deseado — comunicarlo al equipo de Liquidaciones antes de habilitar el complemento de carga de comisiones. |
| 4 | Necesita el usuario autenticado para `AuditLog.usuarioId`. | Ya disponible en `create()` vía `@CurrentUser() user` (ya usado en la línea 375 para `creadoPorId`) — sin riesgo. |

---

## 11. Rollback

- Backend: revertir el commit deja `create()` tomando `comisionPct` solo del body, sin fetch de `Chofer` ni `AuditLog` — comportamiento idéntico al actual. Las entradas de `AuditLog` ya escritas no generan ninguna inconsistencia si se revierte el código (son aditivas, de solo lectura para el resto del sistema).
- Frontend: revertir el pre-fill deja el input en `"0"` hardcodeado, sin romper nada retroactivamente.
- Sin schema ni migración involucrados — el rollback es exclusivamente de código.

---

## 12. Criterios de aceptación

1. Crear una liquidación CHOFER sin tocar el campo de comisión persiste exactamente `chofer.comisionPct`, sin overrides falsos en `AuditLog`.
2. Editar manualmente el campo antes de confirmar genera un registro auditable con el valor anterior (del chofer) y el valor usado.
3. Liquidaciones ya existentes no cambian ningún valor ni se recalculan.
4. Liquidación TRANSPORTISTA no sufre ningún cambio de comportamiento.
5. Build y typecheck limpios; el plan de pruebas de la sección 9 pasa contra la base local.
6. Cero cambios de schema, cero migraciones generadas.

---

## 13. Punto de decisión para tu aprobación

A diferencia del sub-bloque 3.1 (que no tenía ambigüedad de alcance), acá hay una decisión real: **el fix de backend por sí solo no tiene ningún efecto observable** porque hoy no existe manera de cargar `comisionPct` desde la UI. Tres opciones:

1. **Solo backend + pre-fill en Liquidaciones.tsx** (mínimo, cierra el hallazgo tal como está redactado en `QA_INFORME_FINAL.md`, pero el dato maestro sigue sin poder cargarse desde la interfaz salvo por API directa).
2. **Backend + ambos frontends** (Liquidaciones.tsx + Transportistas.tsx) — cierra el hallazgo de forma funcionalmente completa, es el que recomiendo, y sigue siendo un cambio chico (un input nuevo, sin lógica adicional).
3. Backend solamente, dejando el pre-fill de Liquidaciones.tsx y el input de Transportistas.tsx para un sub-bloque 3.3 aparte.

No implementé nada de esto — queda a la espera de tu decisión sobre el punto 13 y tu aprobación general antes de tocar código.

# VIAJES 2.0 — LISTADO OPERATIVO
## Bloque L4: Acciones rápidas — Auditoría y diseño

**Tipo:** Auditoría + propuesta técnica/UX. Sin implementación, sin commits, sin push.

**Base:** continúa `AUDITORIA_VIAJES2.0_LISTADO.md`, hallazgo H-3 ("Avanzar estado / Cancelar / Editar requieren salir del listado y entrar al Detalle — sin ninguna acción inline") y línea L6 de su roadmap.

**Alcance:** exclusivamente `Viajes.tsx`, `ViajeDetalle.tsx` (como referencia funcional de lo ya construido), los endpoints existentes de `viajes.controller.ts`, las reglas de transición de estado ya vigentes, permisos/roles ya visibles, y la UX del listado. No se analiza Liquidaciones/Facturas/Anticipos, acciones masivas, paginación, endpoints nuevos, ni un rediseño general de la tabla.

---

## 1. Auditoría de las acciones existentes del núcleo

Confirmado por lectura directa de `viajes.controller.ts`: las únicas operaciones de escritura sobre `Viaje` son `create` (ya tiene su propio botón "+ Nuevo viaje", no aplica a filas existentes), `update` (Editar), `cambiarEstado` (Avanzar), y `cancelar` (Cancelar). No existe ningún endpoint de borrado (`@Delete`) — no hay nada más que evaluar fuera de estas cuatro.

### Ver detalle
Ya es la interacción base de la tabla (link en el N° de Viaje, `Viajes.tsx:123-125`). No es una "acción rápida" a diseñar — ya cumple su función.
- **Estados:** todos. **Roles:** cualquier rol autenticado (`GET /viajes/:id` sin `@Roles`). **Riesgo de accidente:** ninguno (solo lectura). **Confirmación:** no. **Feedback:** ya existe. **Impacto visual:** ninguno adicional.

### Editar
- **¿Debe aparecer en el listado?** Es un formulario de 14 campos — no tiene sentido ejecutarlo "en línea" en una fila. La pregunta real es si conviene un **atajo de navegación** directo a `/viajes/:id/editar` desde la fila, evitando el paso intermedio por el Detalle. Es un ahorro de clics real pero menor: a diferencia de "Avanzar estado", Editar de todos modos requiere entrar a otra pantalla (el formulario) en cualquier escenario — el atajo solo ahorra la escala intermedia del Detalle, no la navegación completa.
- **Estados:** el backend permite editar en cualquier estado (incluso `CANCELADO`, facturado o liquidado — con campos restringidos vía `CAMPOS_SIEMPRE_EDITABLES`, `viajes.controller.ts:47`). El atajo, si se agrega, debería estar disponible siempre, igual que ya está en `ViajeDetalle.tsx` (sin condicionar por estado).
- **Roles:** backend exige `OPERACIONES`/`ADMINISTRADOR` (`@Roles` en `PATCH /viajes/:id`, `viajes.controller.ts:256-257`). El frontend hoy no oculta el link "Editar viaje" para otros roles (mismo hallazgo R-5 ya documentado en `AUDITORIA_VIAJES2.0_NUCLEO.md`) — un atajo nuevo en el listado heredaría el mismo gap salvo decisión explícita de corregirlo.
- **Riesgo de ejecución accidental:** bajo. Un clic accidental solo navega al formulario — no hay ninguna escritura hasta que el usuario complete y confirme "Guardar cambios" en otra pantalla.
- **Confirmación:** no necesaria para el atajo en sí (el propio formulario actúa como confirmación).
- **Feedback:** ya existe en `ViajeForm.tsx`.
- **Impacto visual:** un ícono/link más por fila.

### Avanzar estado
- **¿Debe aparecer en el listado?** **Sí — es la candidata más clara para una acción rápida real**, ejecutable con un clic sin salir del listado: (a) no requiere ningún dato adicional del usuario (el "siguiente estado" es determinístico, se calcula solo con `ORDEN_ESTADOS`), (b) es una única escritura atómica (`$transaction`, ya resuelto en el Bloque Núcleo). Es también la acción más repetitiva del ciclo operativo diario (hallazgo H-3 original).
- **Estados:** solo si existe un siguiente estado válido — `estado !== "CANCELADO"` y `estado !== "DESCARGADO"` (mismo cálculo que ya usa `ViajeDetalle.tsx:79-80`).
- **Roles:** `OPERACIONES`/`ADMINISTRADOR` (`@Roles` en `POST /viajes/:id/estado`).
- **Riesgo de ejecución accidental:** **medio-alto** si se implementa como botón de un solo clic sin ninguna fricción — a diferencia de Editar, esta acción **sí** ejecuta una escritura real de inmediato. En una tabla de varias filas, un clic mal apuntado avanza el estado de un Viaje distinto al que se quería tocar.
- **Confirmación:** hoy el Detalle NO pide confirmación para avanzar de estado (solo para cancelar) — es una transición hacia adelante, no destructiva, con historial completo. Mantener esa misma política en el listado (sin modal) es consistente, pero el riesgo de clic accidental (punto anterior) debe mitigarse por diseño visual, no por un modal (ver §2).
- **Feedback:** debe ser **por fila**, no un único `error`/`success` de página completa — si el operador avanza varias filas en sucesión, necesita saber cuál acción específica falló.
- **Impacto visual:** un botón/ícono condicional por fila (ausente en `DESCARGADO`/`CANCELADO`).

### Cancelar
- **¿Debe aparecer en el listado?** Es una acción operativamente sensible que ya exige motivo obligatorio vía `ConfirmDialog` (`requireMotivo: true`, `ViajeDetalle.tsx:55-60`). Un modal con textarea obligatorio no es viable como "un clic" en una fila — puede **iniciarse** desde el listado (un ícono/botón que abra el mismo diálogo), pero nunca debe convertirse en una ejecución directa de un solo clic. Es un atajo para abrir la confirmación existente, no un bypass de ella.
- **Estados:** backend permite cancelar si `estado !== "CANCELADO"` y no está facturado ni liquidado (`assertCancelacionPermitida`, `viajes.controller.ts:344-362`).
  **Hallazgo relevante para este bloque:** `ViajeDetalle.tsx` oculta hoy el botón "Cancelar" también cuando `estado === "DESCARGADO"` (`ViajeDetalle.tsx:122`), aunque el backend **no** bloquea la cancelación de un Viaje `DESCARGADO` por ese solo motivo — solo la bloquea si además está facturado o liquidado. Es una brecha ya existente (no introducida por este bloque) entre lo que el backend permitiría y lo que el frontend deja intentar. Si la acción rápida del listado reutiliza la misma condición del Detalle, se **replica** esta brecha sin agravarla; "corregirla" sería una ampliación de alcance no pedida — queda documentada como decisión pendiente, no resuelta acá.
- **Roles:** `OPERACIONES`/`ADMINISTRADOR`.
- **Riesgo de ejecución accidental:** sería alto sin el modal — queda mitigado por completo manteniendo el mismo `ConfirmDialog` con motivo obligatorio.
- **Confirmación:** sí, siempre — no negociable, es el comportamiento ya establecido y correcto.
- **Feedback:** por fila, igual que Avanzar estado.
- **Impacto visual:** el ícono de mayor "peso visual negativo" (color de peligro) — candidato más fuerte a vivir en un menú secundario, no como botón siempre visible, para no exponer una acción destructiva en cada fila de una tabla de uso diario.

---

## 2. Propuesta UX

Evaluación de las 5 alternativas pedidas:

| Alternativa | A favor | En contra |
|---|---|---|
| **Botones visibles siempre** (uno por acción y fila) | Máxima claridad, cero clics ocultos | Con 3-4 acciones posibles sobre una tabla ya de 10 columnas, satura visualmente — riesgo ya señalado en la auditoría original del listado |
| **Menú de tres puntos (⋮)** para todo | Espacio constante sin importar cuántas acciones haya, escalable | Oculta la acción más frecuente (Avanzar estado) detrás de un clic extra — contradice "pocos clics" para el caso de uso principal |
| **Una acción principal + menú secundario** | Balance: la acción más frecuente y de menor riesgo queda a un clic; el resto (destructivo o de navegación) queda un clic más adentro | Requiere diseñar dos superficies en vez de una — complejidad menor, asumible |
| **Solo al pasar el mouse (hover)** | Tabla visualmente limpia en reposo | Poco descubrible en uso táctil/teclado — riesgo real si hay operadores usando tablets en campo, no confirmado pero plausible para este tipo de sistema |
| **Mantener algunas acciones solo en el Detalle** | Aplica directamente a Editar (ver §1: el ahorro real de un atajo es menor que para Avanzar estado) | — |

**Recomendación:** combinación de "una acción principal + menú secundario", con Editar deliberadamente fuera de la v1:

- **Botón directo y visible, condicional:** "Avanzar a [ESTADO]" — mismo texto que ya usa el Detalle. Único botón que ejecuta una escritura con un solo clic.
- **Menú contextual (⋮)** con "Cancelar" (abre el mismo `ConfirmDialog` ya existente, sin atajos que reduzcan la fricción del motivo obligatorio). Sirve también como lugar consistente para futuras acciones sin agregar más botones a la fila.
- **Editar:** queda fuera de esta v1, disponible solo desde el Detalle como hoy — candidato a un bloque incremental posterior si se prioriza después de validar el resto.

Esto prioriza: claridad (una sola acción compite por atención visual en cada fila), pocos clics (la acción más repetitiva queda a un clic), no sobrecargar la tabla (el resto vive en un menú, no en botones adicionales) y seguridad operativa (Cancelar nunca queda a un clic de ejecutarse sin confirmación).

---

## 3. Matriz acción / estado / rol

`OPERACIONES`/`ADMINISTRADOR` = únicos roles que el backend permite ejecutar escrituras. El resto (`GERENCIA`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`) solo puede "Ver detalle" en cualquier caso (lectura sin `@Roles`).

| Estado | Avanzar estado | Cancelar | Editar (referencia) |
|---|---|---|---|
| `PENDIENTE` | Sí → `ASIGNADO` | Sí (con motivo) | Sí, todos los campos |
| `ASIGNADO` | Sí → `EN_CARGA` | Sí (con motivo) | Sí, todos los campos |
| `EN_CARGA` | Sí → `CARGADO` | Sí (con motivo) | Sí, todos los campos |
| `CARGADO` | Sí → `EN_TRANSITO` | Sí (con motivo) | Sí, todos los campos |
| `EN_TRANSITO` | Sí → `DESCARGADO` | Sí (con motivo) | Sí, todos los campos |
| `DESCARGADO` | No (estado terminal) | Backend: sí, si no facturado/liquidado. **Frontend hoy: oculto igual (brecha, §1)** | Sí, todos los campos (si no facturado/liquidado bloquea algunos) |
| `CANCELADO` | No | No (ya cancelado) | Solo `observaciones`/`productorId` |

Todas las celdas "Sí" aplican únicamente a `OPERACIONES`/`ADMINISTRADOR`; para el resto de los roles, la celda es siempre "No permitido por backend" independientemente del estado.

---

## 4. Backend: ¿alcanzan los endpoints existentes?

**Sí, sin necesidad de ningún endpoint nuevo.** `POST /viajes/:id/estado` y `POST /viajes/:id/cancelar` ya existen, ya son transaccionales (Bloque Núcleo, Tarea 1) y ya devuelven mensajes de error específicos. Ejecutar estas acciones desde una fila del listado es exactamente la misma llamada HTTP que ya hace `ViajeDetalle.tsx` — solo cambia desde dónde se dispara.

**Brecha documentada entre permisos backend y frontend:** además del hallazgo R-5 ya conocido (ningún rol se oculta en la UI de Viajes, `AUDITORIA_VIAJES2.0_NUCLEO.md`), este bloque identifica una segunda, más específica: la condición `estado !== "DESCARGADO"` que oculta "Cancelar" en el Detalle es más restrictiva que la regla real del backend (que solo exige no estar facturado/liquidado). Si la acción rápida reutiliza esa misma condición del frontend, la brecha se mantiene igual que hoy — no se agrava, pero tampoco se corrige. Queda como decisión explícita a tomar en el bloque de implementación.

---

## Casos límite

| Caso | Comportamiento esperado |
|---|---|
| **Viaje `CANCELADO`** | Sin botón "Avanzar" ni opción "Cancelar" en el menú — solo "Ver detalle" (y "Editar" limitado, fuera del alcance de esta v1). |
| **Viaje `DESCARGADO`** | Sin botón "Avanzar" (estado terminal). "Cancelar": según se decida replicar o no la brecha de §1/§4. |
| **Viaje facturado** | "Cancelar" rechazado por el backend con mensaje explicativo — debe mostrarse en el feedback de esa fila, no fallar en silencio. |
| **Viaje liquidado** | Mismo caso que facturado, mensaje explicativo distinto ya provisto por el backend. |
| **Acción en progreso** | El botón/menú de esa fila específica debe deshabilitarse mientras la request está en curso — un estado `busy` global de la tabla bloquearía innecesariamente el resto de las filas. |
| **Doble clic** | Mismo criterio que `useAsyncAction` ya usa en `ViajeForm.tsx` (guard por ref, no por estado) — aplicado por fila si se implementa, para que dos clics en el mismo tick sobre la misma fila no disparen dos requests. |
| **Error de red** | El mensaje de error debe mostrarse en el contexto de esa fila (mismo patrón `err?.response?.data?.message` que ya usa `ViajeDetalle.tsx`), sin afectar la interacción del resto de la tabla. |
| **Datos desactualizados en el listado** (otro usuario cambió el estado mientras la tabla estaba abierta) | El backend valida la transición contra el estado real en la base, no contra lo que el frontend cree — si ya cambió, devuelve `400` con el mensaje de transición inválida ya existente. El frontend debe mostrar ese error y refrescar al menos esa fila (o el listado completo) para reflejar el estado real; no es necesario ningún mecanismo adicional de sincronización en tiempo real, el backend ya es la fuente de verdad. |

---

## Riesgos

- **Clic accidental sobre "Avanzar estado" en la fila equivocada** — mitigado en parte por mantenerlo como único botón directo (sin competir visualmente con otros), pero el espaciado/tamaño final del botón en una tabla densa es una decisión de implementación a cuidar, no resuelta solo con este análisis.
- **"Cancelar" demasiado accesible** si se implementara como botón directo en vez de dentro del menú secundario — mitigado por la recomendación explícita de §2 (siempre detrás de un menú + modal).
- **Estado "busy" mal implementado** (compartido en vez de por fila) bloquearía toda la tabla mientras se procesa una sola acción — requisito de diseño explícito para la implementación (ver Casos límite).
- **Replicar sin decisión consciente** la brecha "Cancelar oculto en `DESCARGADO`" documentada en §1/§4 — a resolver explícitamente (replicar o corregir) antes de implementar, no por omisión.
- **Amplificación de la falta de rol-gating ya conocida (R-5):** agregar más puntos de entrada visibles a acciones que el backend igual rechazaría para ciertos roles no es un agujero de seguridad, pero multiplica los lugares donde un usuario sin permiso intenta y falla. Vale la pena evaluar, en el bloque de implementación, si conviene ocultar los controles de acción rápida para roles que el backend rechazaría de antemano — mejora incremental opcional, no bloqueante.

---

## Plan de implementación incremental

| Bloque | Contenido | Depende de |
|---|---|---|
| **L4.1** | Botón "Avanzar a [ESTADO]" por fila en `Viajes.tsx` (solo cuando aplica), reutilizando `POST /viajes/:id/estado`, con estado `busy`/error **por fila** (no global). Sin menú de tres puntos todavía. | Bloques L1-L3 (ya desplegados) |
| **L4.2** | Menú contextual (⋮) por fila con "Cancelar" (abre el mismo `ConfirmDialog` ya usado en el Detalle) — reutiliza el patrón de estado por fila establecido en L4.1. Incluye la decisión explícita sobre la brecha "Cancelar en `DESCARGADO`" (§1/§4). | L4.1 |
| **L4.3 (opcional, evaluar después)** | Atajo "Editar" dentro del mismo menú contextual, si se prioriza tras validar el uso real de L4.1/L4.2. | L4.2 |

Cada bloque es implementable y aprobable de forma independiente, siguiendo la misma disciplina de bloques pequeños ya usada en L1-L3.

---

**Fin del diseño del Bloque L4. Sin cambios de código. Sin commits. Sin push. Queda a la espera de aprobación antes de implementar cualquiera de los sub-bloques (L4.1, L4.2, L4.3).**

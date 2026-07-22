# Decisiones Técnicas — Bloque 10.6: Pago Consolidado (Frontend)

Fecha: 2026-07-20. Registra las decisiones técnicas resueltas sobre la base de `DISEÑO_BLOQUE10.6_PAGO_CONSOLIDADO.md` (aprobado), `AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md`, `ACTA_CIERRE_BLOQUE10.5.md`, los contratos reales del backend (`pago-consolidado.controller.ts`/`.service.ts`, `grupo-economico.controller.ts`, `identidad-chofer.controller.ts`) y los patrones reales ya implementados en el frontend (`GrupoEconomico.tsx`, `Liquidaciones.tsx`, `Viajes.tsx`/`ViajeForm.tsx`/`ViajeDetalle.tsx`, `useAsyncAction.ts`, `ConfirmDialog.tsx`, `api/client.ts`, `AuthContext.tsx`, `Layout.tsx`). **No se escribe código. No se modifica backend. No se agregan endpoints. No se resuelve `PROCESANDO` con ningún cambio funcional.** Con este documento queda cerrada la etapa de Decisiones Técnicas — la implementación queda pendiente de una instrucción explícita posterior.

---

## 1. Ubicación y ruta exacta de la pantalla

Tres rutas nuevas, bajo el mismo prefijo `/administracion/` ya usado por `Usuarios`, `Auditoría Administrativa` y `Grupo Económico` — Pago Consolidado es, igual que esos tres, una función administrativa de `ADMINISTRADOR`, no una operación del día a día como Viajes/Facturas:

- `/administracion/pago-consolidado` — listado (pantalla de entrada).
- `/administracion/pago-consolidado/nuevo` — flujo de creación.
- `/administracion/pago-consolidado/:id` — detalle de un pago puntual, con sus acciones de ciclo de vida.

**Precedente que justifica esta división en tres rutas, no en una sola pantalla con secciones:** `Viajes.tsx` (`/viajes`) / `ViajeForm.tsx` (`/viajes/nuevo`) / `ViajeDetalle.tsx` (`/viajes/:id`) — es el único caso ya existente en el proyecto de una función con listado, creación y detalle genuinamente distintos, y resuelve exactamente ese caso con tres rutas y tres archivos, no con una pantalla monolítica. `GrupoEconomico.tsx` (una sola pantalla) no es el precedente aplicable acá porque su alcance es más chico (un formulario y un listado simple) — Pago Consolidado tiene un flujo de creación con selección de candidatos y un detalle con una máquina de estados de siete valores, comparable en complejidad a Viajes, no a Grupo Económico.

---

## 2. Entrada de menú

- **Nombre visible:** "Pago Consolidado".
- **Sección del menú:** no existe un mecanismo de sub-secciones en `Layout.tsx` (`NAV_ITEMS` es una lista plana) — se agrega como una entrada más de esa lista, inmediatamente después de `"Grupo Económico"` (mismo agrupamiento visual por posición, ya que ambas son funciones de grupo económico, no de una sola organización).
- **Roles que pueden verla:** `["ADMINISTRADOR"]` — idéntico al de `"Grupo Económico"`, `"Usuarios"` y `"Auditoría Administrativa"`. Ningún otro rol puede operar Pago Consolidado (Decisión Técnica 4 de 10.5, sin excepción de lectura para otros roles).
- **Comportamiento cuando el usuario no tiene Grupo Económico:** la entrada de menú se muestra igual (el filtro de `Layout.tsx` es exclusivamente por rol, nunca por si existe o no un grupo — mismo criterio ya usado para `"Grupo Económico"`, que tampoco se oculta en ese caso). La verificación de "sin grupo" ocurre **dentro** de la pantalla de listado, después de cargar, no en el menú — ver sección 4.

---

## 3. Arquitectura de la pantalla

**Tres archivos nuevos, uno por ruta (página única por vista, no una pantalla con pestañas internas):**

- `frontend/src/pages/PagosConsolidados.tsx` — listado.
- `frontend/src/pages/PagoConsolidadoNuevo.tsx` — creación (selección de beneficiario y candidatos).
- `frontend/src/pages/PagoConsolidadoDetalle.tsx` — detalle y acciones de ciclo de vida.

**Dos archivos modificados:**
- `frontend/src/App.tsx` — tres rutas nuevas (sección 1), mismo patrón que las tres rutas de Viajes.
- `frontend/src/components/Layout.tsx` — una entrada nueva en `NAV_ITEMS` (sección 2).

**Ningún archivo nuevo de componente, hook o utilidad compartida.** Criterio explícito para evitar tanto una pantalla monolítica como una abstracción prematura:

1. **Split por vista, no por preocupación técnica** — la división en tres archivos ya resuelve el riesgo de monolito (cada archivo tiene una sola responsabilidad: listar, crear o mostrar-y-operar un pago), siguiendo el precedente de Viajes. No hace falta, además, extraer sub-componentes dentro de cada archivo — ninguno de los tres alcanzaría, por su alcance real, un tamaño comparable al de una pantalla que sí requeriría dividirse más (no existe hoy en el proyecto ningún archivo de página dividido internamente en sub-componentes propios).
2. **Sin hooks ni componentes nuevos compartidos entre los tres archivos** — mismo criterio ya aplicado explícitamente en el cierre de 10.4.c ("el archivo ya evita abstracciones prematuras... la ausencia de un estado... es una simplificación correcta, no una inconsistencia"). La lógica que los tres archivos necesitarían en común (resolver `organizacionId → nombre`, formatear moneda) es pequeña (unas pocas líneas cada una) y ya tiene precedente de **no** compartirse: los 12 archivos de página que hoy formatean moneda lo hacen cada uno con su propia función local `fmtMoney`, no una utilidad importada. Tres copias locales de una función de 5 líneas no son una duplicación que justifique una nueva capa compartida.
3. **Componentes existentes que se reutilizarán, sin ningún componente nuevo:** `useAsyncAction` (una instancia por acción independiente, mismo criterio que `GrupoEconomico.tsx`), `useConfirm`/`ConfirmDialog` (severidades `medium`/`high`, `requireMotivo`, `requireTypedValue`, todas ya existentes, ninguna variante nueva), `useUnsavedChangesGuard` (ya usado en `ViajeForm.tsx`, aplicable a `PagoConsolidadoNuevo.tsx` — ver sección 7), las clases CSS ya existentes (`page-header`, `card`, `section-title`, `error-banner`, `success-banner`, `muted`, `badge`, `actions-row`, `form-grid`, tabla estándar) — ninguna clase nueva.

---

## 4. Obtención del Grupo Económico

- **Momento de carga:** cada uno de los tres archivos consulta `GET /grupo-economico` **de forma independiente, al montarse** — no existe en el proyecto ningún contexto ni caché compartido de "grupo económico actual" (`GrupoEconomico.tsx` tampoco lo expone), así que no hay de dónde reutilizarlo entre rutas distintas. Se acepta la redundancia de hasta tres llamadas a este endpoint si el usuario navega entre las tres pantallas en una sesión — mismo costo ya aceptado hoy por `Layout.tsx` + `GrupoEconomico.tsx` llamando cada uno por su cuenta a endpoints relacionados de grupo, sin ningún mecanismo de caché en todo el frontend.
- **Tratamiento de la ausencia de grupo:** `GET /grupo-economico` responde `200` con cuerpo `null` cuando la organización activa del actor no pertenece a ningún grupo (`grupo-economico.controller.ts`, `miGrupo()`) — **nunca un `404`** para este caso. Las tres pantallas replican exactamente el tratamiento ya usado en `GrupoEconomico.tsx`: si el resultado es `null`, se muestra el mismo mensaje ya establecido ("Tu organización no pertenece a ningún grupo económico.") y ninguna de las pantallas intenta ninguna llamada de Pago Consolidado (todas dependen de `grupoId`, que no existiría).
- **Tratamiento de `403`:** solo alcanzable si el rol cambió a mitad de sesión (el filtro de menú y el propio guard de rol dentro de cada pantalla, ver sección 17, ya deberían haber impedido llegar acá en el uso normal) — se trata como cualquier otro error de carga, mismo `error-banner` genérico con el mensaje real.
- **La organización activa no condiciona el alcance transversal de la pantalla:** confirmado y mantenido — `GET /grupo-economico` resuelve el grupo a partir de la organización activa del actor únicamente para identificar **cuál** grupo consultar (un administrador pertenece a una sola organización propia, que pertenece a un solo grupo), no para filtrar ni limitar qué organizaciones del grupo son visibles después. Una vez obtenido `grupoId`, **ningún endpoint de Pago Consolidado usado a partir de ahí depende de la organización activa** — todos exigen `grupoId` explícito en la ruta y validan acceso por `AccesoGrupoEconomico`, exactamente como estableció la Auditoría de este bloque. Cambiar de organización activa en otra pestaña, mientras se opera Pago Consolidado, no afecta esta pantalla (no comparte contexto en memoria con `Layout.tsx`/`AuthContext.tsx` más allá del token).

---

## 5. Resolución de organizaciones

- **Contrato exacto utilizado:** `GET /grupo-economico` → `{ id, nombre, organizaciones: [{ id, nombre }] }`. Es la **única** fuente de nombres de organización para las tres pantallas.
- **Estructura del mapa `organizacionId → nombre`:** construido, en cada uno de los tres archivos, a partir del array `organizaciones` de la respuesta anterior — mismo dato, sin ninguna llamada adicional. No se define en este documento la estructura interna exacta (objeto plano vs. `Map`) — detalle de implementación.
- **Comportamiento si algún nombre no puede resolverse:** puede ocurrir si `organizacionId` de una fila de candidatos o de un pago ya no aparece en `grupo.organizaciones` (por ejemplo, la organización fue desasociada del grupo después de que la liquidación ya estuviera bloqueada — Decisión Técnica 3 de 10.5 no libera el bloqueo en ese caso). Se muestra un texto explícito de "no disponible" en lugar del nombre — mismo criterio exacto ya usado en `GrupoEconomico.tsx` para `"Usuario no disponible"` cuando un `usuarioId` no resuelve — **nunca** se oculta la fila ni se rompe el resto de la tabla.
- **Prohibido explícitamente:** inventar o adivinar un nombre de organización a partir del `organizacionId` (por ejemplo, mostrar el UUID recortado como si fuera un nombre); depender de `useOrganizacionesAccesibles` (el hook del selector de organización activa de `Layout.tsx`) para resolver nombres — es un contrato semánticamente distinto (organizaciones a las que el actor puede *cambiarse*, no todas las del grupo) y further, acoplaría Pago Consolidado al mecanismo de organización activa que la Auditoría de este bloque determinó explícitamente que **no** es el correcto acá (sección 3 de `AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md`).

---

## 6. Carga y sincronización de datos

**Consultas iniciales, por pantalla:**

- `PagosConsolidados.tsx`: `GET /grupo-economico` → (si hay grupo) `GET .../pagos-consolidados`. Secuencial, no en paralelo — la segunda depende del `grupoId` de la primera.
- `PagoConsolidadoNuevo.tsx`: `GET /grupo-economico` y `GET /grupo-economico/choferes/identidades` — **en paralelo**, ninguna depende de la otra (la segunda no exige `grupoId` en la ruta). `GET .../pagos-consolidados/candidatos` se dispara recién después de que el usuario elige un beneficiario — no es parte de la carga inicial.
- `PagoConsolidadoDetalle.tsx`: `GET /grupo-economico` y `GET .../pagos-consolidados/:pagoId` — **en paralelo**, mismo criterio (la segunda necesita `grupoId` en la ruta, que ya se conoce por venir codificado en la URL de esta pantalla como parte de la navegación previa — ver sección 11 — no hace falta esperar la respuesta de la primera para dispararla).

**Recargas posteriores a cada acción — siempre re-consultando el recurso, nunca mutando el estado local a mano:**

- **Crear:** tras `POST .../pagos-consolidados` exitoso, navegación inmediata a `/administracion/pago-consolidado/:id` con el `id` devuelto — mismo patrón exacto que `ViajeForm.tsx` (`navigate(/viajes/${data.id})` tras crear). La pantalla de detalle, al montar, hace su propia carga fresca — no se le pasa el objeto recién creado por estado de navegación.
- **Preparar / Confirmar (incluido reintento) / Cancelar:** todas ejecutadas desde `PagoConsolidadoDetalle.tsx`; tras cada una, se vuelve a pedir `GET .../pagos-consolidados/:pagoId` para ese mismo pago — nunca se asume, a partir de la respuesta de la acción, que el estado mostrado ya está actualizado, aunque las cuatro acciones también devuelven el pago actualizado en su respuesta (se usa esa respuesta para el mensaje inmediato — sección 9 — pero la re-consulta explícita es la que gobierna lo que la pantalla termina mostrando, para no depender de dos fuentes de verdad).

**Prevención de respuestas viejas o estados visuales desactualizados:** cada `useEffect` de carga usa una bandera de cancelación local (mismo patrón exacto ya usado en `GrupoEconomico.tsx` y `useOrganizacionesAccesibles.ts` — `let cancelado = false` capturada en el cleanup) para que una respuesta que llega después de que el componente se desmontó, o después de que el usuario ya navegó a otro beneficiario/pago, no pise el estado visible. Ninguna de las tres pantallas necesita recarga automática periódica (polling) — ver también sección 12.

---

## 7. Flujo de creación (`PagoConsolidadoNuevo.tsx`)

1. **Selección del beneficiario:** `select` sobre las identidades de chofer devueltas por `GET /grupo-economico/choferes/identidades` (`nombreReferencia` como texto visible). Sin beneficiario elegido, no hay ninguna otra sección visible.
2. **Consulta de candidatos:** al elegir un beneficiario, `GET .../pagos-consolidados/candidatos?identidadChoferGrupoId=...` — un solo disparo por selección (no se dispara de nuevo si el usuario reabre el mismo `select` sin cambiar el valor).
3. **Selección de liquidaciones:** un `Set<string>` de ids de candidatos marcados, con checkboxes sobre una tabla — mismo patrón exacto de `viajesSel`/`anticiposSel` en `Liquidaciones.tsx`. Cada fila muestra su organización (resuelta según sección 5), período y `netoPagar`.
4. **Validaciones previas al envío** (del lado del cliente, antes de llamar al backend — nunca en reemplazo de la validación real del backend, que se revalida igual):
   - Al menos un candidato seleccionado (el backend exige `ArrayMinSize(1)`) — el botón de crear permanece deshabilitado hasta entonces, mismo criterio que el botón "Crear liquidación (borrador)" de `Liquidaciones.tsx` (`disabled={viajesSel.size === 0 || busy}`).
   - No hace falta validar duplicados del lado del cliente — la selección es un `Set` sobre candidatos ya únicos devueltos por el backend, no puede producir duplicados por construcción.
5. **Cálculo y presentación de subtotales y total:** el total se **deriva** en cada render sumando `netoPagar` de los candidatos actualmente marcados — nunca se guarda como estado propio ni se recalcula con ninguna fórmula adicional (comisión, impuestos, etc.) del lado del cliente; mismo criterio exacto que `totalViajesSel`/`totalAnticiposSel` en `Liquidaciones.tsx`. Se muestra, además, un subtotal por organización (agrupando la selección actual por `organizacionId`) — información nueva que `Liquidaciones.tsx` no necesita (opera sobre una sola organización) pero que acá es central, dado que el propósito de la pantalla es mostrar cuánto corresponde a cada organización antes de confirmar.
6. **Envío:** `POST .../pagos-consolidados` con `identidadChoferGrupoId`, `items` (derivados de la selección, cada uno con su `organizacionId` y `liquidacionId` ya conocidos desde la respuesta de candidatos) y `referenciaPago` (campo de texto libre, opcional, sin validación adicional del lado del cliente más allá de lo que el propio `input` permita).
7. **Comportamiento al crear correctamente un `BORRADOR`:** navegación inmediata al detalle (sección 6) — la pantalla de creación no muestra su propio mensaje de éxito persistente, porque el detalle es quien pasa a mostrar el pago recién creado.
8. **Protección de cambios sin guardar:** `useUnsavedChangesGuard`, activado en cuanto la selección deja de estar vacía — mismo hook ya usado en `ViajeForm.tsx`, ninguna lógica nueva.

---

## 8. Máquina de estados visual

Los siete estados reales (`DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, Decisión 5) y, para cada uno, exactamente qué acciones se habilitan en `PagoConsolidadoDetalle.tsx` — reflejo directo de la tabla de transiciones real, sin ninguna transición adicional ni ausente:

| Estado | Acciones habilitadas | Acciones explícitamente ausentes |
|---|---|---|
| `BORRADOR` | Preparar, Cancelar | Confirmar |
| `PREPARADO` | Confirmar, Cancelar | Preparar (ya preparado) |
| `PROCESANDO` | Ninguna — ver sección 12 | Todas |
| `CONFIRMADO` | Ninguna (estado final) | Todas |
| `PARCIAL` | Confirmar (rotulado como "Reintentar" — ver sección 9) | Cancelar (nunca válido desde `PARCIAL`, Decisión 5) |
| `FALLIDO` | Confirmar (rotulado "Reintentar"), Cancelar | — |
| `CANCELADO` | Ninguna (estado final) | Todas |

**Criterio, igual que `Liquidaciones.tsx`:** qué botón se muestra depende exclusivamente del `estado` real devuelto por el backend en la última consulta — nunca de un estado de interfaz propio que lo replique o lo anticipe. Ningún botón deshabilitado se oculta silenciosamente sin explicación cuando tiene sentido mostrar por qué (por ejemplo, un pago `CONFIRMADO` muestra un texto de estado final, no simplemente la ausencia de botones sin contexto).

---

## 9. Confirmación (acción `confirmar`, incluido el reintento)

- **Distinción entre resultado HTTP y resultado de negocio:** un `201` de `POST .../confirmar` **no** implica éxito de negocio — el cuerpo de la respuesta trae el pago actualizado, y es su campo `estado` (`CONFIRMADO` / `PARCIAL` / `FALLIDO`) el que determina qué mensaje y qué tratamiento visual corresponde. Se decide usar la variante de `useAsyncAction` cuyo `successMessage` es una función del resultado (`(result) => ...`, ya soportada por el hook tal como existe hoy) — evalúa `result.estado` para elegir el texto, en vez de un `successMessage` fijo. Esta es la única acción de todo el frontend donde éxito de la petición y éxito del resultado de negocio no coinciden — se documenta acá porque ninguna pantalla existente necesitó antes esta distinción.
- **Tratamiento visual diferenciado:**
  - `CONFIRMADO` → mensaje de éxito (banner verde ya existente), sin ambigüedad.
  - `FALLIDO` → mensaje que indica explícitamente que nada se aplicó y que la operación es reintentable — **no** se muestra como el mismo tipo de error que un `400`/`403` (esos son rechazos de la operación en sí; `FALLIDO` es una respuesta `201` exitosa cuyo resultado de negocio fue negativo) — banner distinto, no el `error-banner` genérico de `useAsyncAction`.
  - `PARCIAL` → mismo criterio que `FALLIDO`: no es un error del sistema, es un resultado real y esperado (Decisión Técnica 1 de 10.5) — banner propio, con lenguaje que dice explícitamente que no es una falla.
- **Información por organización/liquidación:** el desglose de filas de la sección 8 (ya visible en el detalle) es la fuente de esta información — cada fila trae su propio `estadoAplicacion` (`PENDIENTE`/`APLICADA`/`FALLIDA`). No se agrega ningún resumen adicional calculado del lado del cliente más allá de lo que esas filas ya muestran (evita duplicar la regla de negocio de qué cuenta como aplicado — ver sección 15).
- **Habilitación del reintento:** el mismo botón "Confirmar" se relabelea "Reintentar" cuando el estado de entrada es `PARCIAL` o `FALLIDO` (es, literalmente, la misma llamada `POST .../confirmar` — no existe un endpoint separado de reintento, Decisión Técnica 5 de 10.5) — la confirmación previa (ver tabla de la sección de Diseño) exige el mismo nivel de fricción que la primera confirmación, sin ninguna reducción por ser un reintento.
- **Prevención de doble clic o confirmaciones concurrentes:** cubierta en dos niveles independientes — `useAsyncAction` ya bloquea un segundo disparo mientras el primero sigue en curso (guardia por `ref`, no por el estado `busy`, así que cubre incluso dos clics en el mismo tick antes del primer re-render); y el backend, independientemente, garantiza que solo una ejecución de `confirmar()` avanza sobre el mismo pago (transición atómica a `PROCESANDO`, Decisión Técnica 5) — si por cualquier motivo dos pestañas distintas disparan la acción casi a la vez, la segunda recibe el rechazo real del backend ("El pago ya está siendo procesado por otra operación."), mostrado como cualquier otro error de esta acción, sin ningún reintento automático.

---

## 10. Cancelación

- **Estados desde los que se permite:** `BORRADOR`, `PREPARADO`, `FALLIDO` — exactamente los tres de la tabla de transiciones real (sección 8). El botón "Cancelar" **no se muestra** en `PARCIAL`, `CONFIRMADO`, `PROCESANDO` ni `CANCELADO`.
- **Captura obligatoria del motivo:** `useConfirm({..., requireMotivo: true})` — mecanismo ya existente y ya usado para el mismo propósito en otras acciones destructivas del proyecto; el diálogo ya impide confirmar con el campo vacío (`motivoOk` en `ConfirmDialog.tsx`) y devuelve el motivo tipeado (`ConfirmResult.motivo`) listo para enviarse como cuerpo de `POST .../cancelar`. No hace falta ninguna validación adicional del lado de la pantalla.
- **Confirmación previa:** severidad `medium` (mismo criterio que "Cambiar de Organización" en `Layout.tsx` — una acción significativa pero completamente reversible en el sentido de que ningún dinero se movió todavía en ninguno de los tres estados de origen permitidos).
- **Tratamiento del rechazo cuando alguna liquidación ya fue aplicada:** ese rechazo (`400`, "No se puede cancelar un pago consolidado con al menos una liquidación ya pagada...") solo sería alcanzable si el estado cambió entre que la pantalla mostró el botón y que el usuario lo presionó (por ejemplo, otra pestaña confirmó el pago en el medio) — se trata como el resto de los errores de esta acción (banner con el mensaje real), y la re-consulta posterior (sección 6) deja la pantalla mostrando el estado real y correcto (probablemente `PARCIAL`), sin necesitar ningún tratamiento especial adicional.

---

## 11. Idempotencia visual

- **Botones deshabilitados durante operaciones:** el botón que disparó la acción en curso, deshabilitado mientras `busy` (mismo criterio que toda la aplicación) — no se deshabilitan los demás botones de la pantalla que no dependen de esa acción, salvo que el propio estado de carga los vuelva inconsistentes (por ejemplo, mientras se re-consulta el pago tras una acción, no se muestra ningún botón de acción hasta tener el estado fresco, para no operar sobre datos ya desactualizados).
- **Comportamiento ante timeout o pérdida de conexión:** `api/client.ts` no define ningún timeout propio (usa el default de `axios`/del navegador) y no hay ningún mecanismo de reintento automático en ninguna parte del frontend — un error de red (sin `error.response`, solo `error.request`/`error.message`) cae en el mismo `catch` de `useAsyncAction`, que ya usa como mensaje el `errorMessage` provisto o el genérico `"No se pudo completar la acción"` — mismo tratamiento, sin necesitar detectar "es de red" de forma especial.
- **Prohibido explícitamente asumir que un error (de red o de cualquier otro tipo) implica que la operación no ocurrió** — para `preparar`, `confirmar` y `cancelar`, la petición pudo haber llegado y aplicado su efecto en el backend aunque la respuesta nunca haya llegado al cliente (mismo riesgo, del lado del backend, que ya documentó `ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md` para las fallas transitorias — acá es la contraparte del lado de la red, no del backend). Antes de permitir que el usuario repita cualquiera de esas tres acciones tras un error, la pantalla **debe** re-consultar el pago (`GET .../pagos-consolidados/:pagoId`) y mostrar su estado real, en vez de dejar el mismo botón disponible para un segundo clic inmediato sobre el estado (potencialmente ya viejo) que la pantalla tenía antes del error.
- **Caso especial, `crear`:** a diferencia de las tres anteriores, `crear` no tiene ningún mecanismo de idempotencia del lado del backend (no existe una clave de idempotencia ni una revalidación que impida dos `BORRADOR` distintos con la misma selección — confirmado en `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`, sección 2.1, un `BORRADOR` no bloquea nada todavía). Si `crear` falla de forma ambigua (error de red sin respuesta clara), la pantalla **no** debe reintentar automáticamente ni sugerir un reintento inmediato con la misma selección sin antes indicarle al usuario que revise el listado (sección 3.1 del Diseño) para confirmar si el borrador ya se creó o no — comportamiento que la pantalla de creación deja como responsabilidad explícita del usuario (volver al listado), no como algo que la pantalla intente resolver por sí sola inventando una consulta de deduplicación que el backend no ofrece.

---

## 12. Manejo de `PROCESANDO`

- **Representación visual:** una etiqueta de estado distinta a las demás (ejemplo de tratamiento, no de implementación: mismo tipo de `badge` ya usado para el resto de los estados, con su propio texto — "Procesando"), sin ningún botón de acción disponible (sección 8) — solo un botón de actualizar/re-consultar manual (misma acción de recarga ya usada para refrescar cualquier otro dato de la pantalla, sin ningún significado especial adicional).
- **Comportamiento si el backend devuelve un pago en ese estado:** la pantalla lo muestra tal cual, sin ninguna acción disponible, y sin ningún temporizador ni actualización automática — el usuario puede volver a consultar manualmente cuando quiera.
- **No se inventa ninguna transición de recuperación:** confirmado, ningún botón nuevo, ninguna llamada nueva, ningún estado de interfaz que sugiera una forma de "destrabar" un pago en `PROCESANDO` — no existe esa operación en el backend (Decisión Técnica 5 de 10.5, `PROCESANDO` no tiene ninguna transición manual de salida) y no corresponde a este bloque inventarla.
- **La estrategia de recuperación pertenece a una futura decisión del backend, no a este documento:** ya identificado y explícitamente excluido en `ACTA_CIERRE_BLOQUE10.5.md`, sección 4 y 8 — la pantalla de Pago Consolidado se limita a reflejar honestamente ese estado si ocurre, sin comprometerse a resolverlo desde el frontend.

---

## 13. Tratamiento del problema conocido de `listar()`

- **Comportamiento si el listado completo devuelve `403`:** la pantalla `PagosConsolidados.tsx` muestra un estado de error específico para este caso (mismo componente visual que cualquier otro error de carga, `error-banner`, pero con el mensaje real ya devuelto por el backend — "No tenés acceso vigente a una de las organizaciones involucradas.", el mismo mensaje genérico que Decisión Técnica 4 usa para cualquier verificación de acceso fallida) — no se intenta distinguir, del lado del cliente, si el `403` es por el pago que interesa o por otro pago ajeno del mismo grupo (el backend no lo distingue tampoco, `verificarAccesoATodas()` es todo-o-nada para el listado completo).
- **Mensaje al usuario:** el mensaje real del backend, sin ningún agregado que sugiera una causa distinta a la real (no inventar "puede que tu conexión falló" ni nada que no sea lo que efectivamente ocurrió).
- **Posibilidad de continuar utilizando consultas individuales ya conocidas:** sí, y es una posibilidad real, no hipotética — `GET .../pagos-consolidados/:pagoId` valida acceso únicamente contra las organizaciones de **ese** pago puntual, no contra todo el grupo, así que puede seguir respondiendo `200` aunque el listado completo devuelva `403`. La pantalla de detalle (`PagoConsolidadoDetalle.tsx`) sigue siendo utilizable de forma independiente en ese escenario, por ejemplo llegando ahí justo después de crear un pago (sección 6) o por una navegación directa. **Se decide explícitamente no construir ningún mecanismo propio del lado del cliente para paliar el `403` del listado** (por ejemplo, recordar u cachear ids de pagos vistos para reconstruir una lista alternativa) — sería una solución del lado del cliente para una limitación del backend, y excede el alcance de este bloque ("no modificar backend dentro de 10.6" incluye no compensar sus limitaciones conocidas con lógica nueva del cliente).

---

## 14. Manejo de errores

Contratos reales confirmados contra el código (`pago-consolidado.service.ts`, `prisma-exception.filter.ts`, `api/client.ts`):

| Código | ¿Ocurre en estos contratos? | Tratamiento |
|---|---|---|
| `400` | Sí — el más frecuente: validación de la selección al crear, transición de estado inválida, colisión de bloqueo, "ya está siendo procesado", cancelación rechazada por liquidación ya pagada. | Mensaje real del backend (`err.response.data.message`), banner de la acción correspondiente. |
| `401` | Sí, pero **manejado globalmente** — el interceptor de respuesta de `api/client.ts` ya limpia la sesión y redirige a `/login` ante cualquier `401`, para cualquier pantalla. Ninguna de las tres pantallas nuevas necesita manejarlo por su cuenta. |
| `403` | Sí — rol insuficiente (no debería ocurrir en uso normal por el gate de rol, sección 17) o acceso insuficiente a alguna organización involucrada (Decisión Técnica 4, puede ocurrir en cualquier operación, incluidas las de lectura). | Mensaje real del backend, mismo `error-banner`. |
| `404` | Sí — identidad de chofer inexistente en el grupo, pago inexistente. | Mensaje real del backend (genérico a propósito, no distingue "no existe" de "no pertenece a este grupo" — mismo criterio de falla segura ya usado en el resto de Grupo Económico). |
| `409` | **No existe ningún caso conocido en el código real que lo dispare para estos siete endpoints** — `pago-consolidado.service.ts` solo lanza `BadRequestException`/`NotFoundException`/`ForbiddenException`. El filtro global de excepciones (`prisma-exception.filter.ts`) sí mapea un eventual error `P2002` de Prisma a `409`, pero ningún modelo de Pago Consolidado tiene hoy una restricción `@@unique` alcanzable por una escritura de usuario que pudiera dispararlo. Se documenta el tratamiento igual que `400` (mensaje real, mismo banner) por si ocurriera, sin construir ningún manejo especial distinto. |
| `500` | Posible ante cualquier error no mapeado por el filtro de Prisma (por ejemplo, un problema de conexión a la base). El mensaje en ese caso puede no ser uno de los mensajes en español ya conocidos. | Se usa el mismo *fallback* genérico que `useAsyncAction` ya aplica cuando `err.response.data.message` no existe o no es útil — `"No se pudo completar la acción"` (u otro texto genérico equivalente por acción) — sin intentar mostrar el cuerpo crudo del error. |
| Error de red (sin `error.response`) | Posible — timeout, sin conexión, backend caído. | Mismo *fallback* genérico que `500` — `err?.response?.data?.message` es `undefined` en este caso, así que ya cae naturalmente en el mismo camino, sin lógica adicional para distinguirlo. |

**Mensajes textuales frente a mensajes genéricos:** siempre el mensaje real del backend cuando existe (`err.response.data.message`), nunca un texto reescrito o resumido — mismo criterio ya aplicado sin excepción en todas las pantallas existentes del proyecto. Un texto genérico solo aparece cuando el backend no proveyó ninguno (500, red).

---

## 15. Estado local

**Tipos necesarios, descritos funcionalmente (no como código):**
- Grupo (id, nombre, lista de organizaciones con id y nombre).
- Mapa `organizacionId → nombre`, derivado del grupo (sección 5) — no se persiste por separado del grupo, se deriva en cada uso.
- Identidades de chofer del grupo (para el selector de beneficiario en la creación).
- Candidatos de un beneficiario elegido (lista agregada de liquidaciones, cada una con su `organizacionId`).
- Selección de candidatos (conjunto de ids marcados) — solo en la pantalla de creación.
- Un Pago Consolidado individual, con su desglose completo de filas (cada una con su `organizacionId`, `liquidacionId`, `subtotalNetoPagar`, `estadoAplicacion`) — en la pantalla de detalle.
- Listado de Pagos Consolidados del grupo — en la pantalla de listado, cada elemento con lo suficiente para la tabla (beneficiario, estado, total, fecha) sin necesitar su desglose completo de filas.

**Fuente de verdad:** siempre la última respuesta real del backend para cada recurso — nunca un valor "optimista" escrito antes de que la petición correspondiente resuelva.

**Qué se deriva y qué se almacena:**
- **Se almacena:** exactamente lo que cada endpoint devuelve, tal cual.
- **Se deriva, nunca se almacena por separado:** el mapa de nombres de organización (sección 5); los totales y subtotales de la selección en la pantalla de creación (sección 7); qué acciones mostrar según el estado (sección 8) — ninguno de estos tres es un dato que el backend deba re-enviar, todos se calculan en cada render a partir de datos ya almacenados.

**Prohibición explícita de duplicar reglas financieras o de negocio del backend:** el frontend nunca decide, por su cuenta, si una liquidación es válida, si un pago puede pasar de un estado a otro, ni qué monto corresponde pagar — esas reglas viven enteramente en `pago-consolidado.service.ts` (`revalidarItem()`, la tabla de transiciones, el cálculo de `totalConsolidado`). El frontend únicamente **refleja** el último estado conocido devuelto por el backend para decidir qué mostrar u ofrecer — la tabla de la sección 8 no es una regla de negocio nueva, es la representación visual de la misma tabla de transiciones ya aprobada, y cualquier intento del backend de rechazar una acción igual (por ejemplo, por una condición de carrera) sigue siendo la autoridad final, nunca sobreescrita por lo que la pantalla mostraba antes de la petición.

---

## 16. Formato

- **Moneda:** `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })` — exactamente la misma función `fmtMoney` ya usada en 12 archivos de página distintos, replicada localmente en cada uno de los tres archivos nuevos (sección 3, sin utilidad compartida nueva).
- **Fechas:** `new Date(valor).toLocaleDateString()` para fechas simples (período de una liquidación, fecha de creación de un pago) — mismo patrón ya usado en `Liquidaciones.tsx`/`GrupoEconomico.tsx`. Un rango de período (`periodoDesde`/`periodoHasta`) se muestra como `"{desde} → {hasta}"`, mismo formato ya usado en el detalle de `Liquidaciones.tsx`.
- **Estados:** el valor real del backend (`BORRADOR`, `PREPARADO`, etc.) como texto visible, con la misma clase `badge` ya usada para estados en el resto de la aplicación (`<span className="badge {estado}">`) — sin traducir a un texto distinto, mismo criterio que `Liquidaciones.tsx` ya aplica a sus propios estados (`BORRADOR`, `CONFIRMADA`, `PAGADA`, `ANULADA`).
- **Organizaciones:** nombre resuelto (sección 5), nunca el `organizacionId` crudo, salvo en el caso de "no disponible" ya cubierto.
- **Liquidaciones:** identificadas por su `numero` (ya usado como identificador visible en `Liquidaciones.tsx`), no por su UUID.
- **Subtotales y total consolidado:** mismo formato de moneda, mostrados con la organización correspondiente al lado en el caso de los subtotales (sección 7).

---

## 17. Accesibilidad y seguridad operativa

- **Confirmaciones destructivas o financieras:** ya cubiertas en las secciones 9 y 10 — severidad `high` con texto tipeado para confirmar/reintentar, severidad `medium` con motivo obligatorio para cancelar. Ninguna acción sensible se ejecuta sin pasar por `useConfirm` primero, mismo criterio sin excepción que el resto de la aplicación desde el bloque de confirmaciones y prevención de doble envío.
- **Foco y navegación por teclado:** ningún elemento nuevo fuera de controles nativos (`<button>`, `<input>`, `<select>`, `<input type="checkbox">`, `<textarea>` dentro del diálogo de confirmación ya existente) — todos nativamente accesibles por teclado sin ningún tratamiento adicional. El diálogo de confirmación ya aplica `autoFocus` a su primer campo relevante (motivo o valor tipeado) — sin cambios, comportamiento heredado.
- **Mensajes que no revelen datos de organizaciones sin acceso:** el backend ya garantiza esto en su propio diseño (Decisión Técnica 4 de 10.5 — el rechazo de acceso es genérico, "una de las organizaciones involucradas", nunca nombra cuál) — la pantalla se limita a mostrar ese mensaje real tal cual (sección 14), **sin intentar enriquecerlo** cruzando contra el mapa de nombres de organización para "adivinar" cuál organización fue la del rechazo — eso filtraría, del lado del cliente, información que el backend decidió deliberadamente no revelar.
- **Ocultar acciones no permitidas sin depender de eso como control de seguridad:** los botones de la sección 8 se muestran u ocultan según el estado, pero **la autorización real es exclusivamente la del backend** (`RolesGuard` + `verificarAccesoATodas()` en cada uno de los 7 endpoints, revalidada en cada llamada, sin excepción — Decisión Técnica 4 de 10.5) — ocultar un botón es una ayuda de navegación, igual que el gate de rol de toda la aplicación, nunca el mecanismo que impide la operación. Si un botón oculto se disparara igual (por ejemplo, manipulando el DOM), la petición correspondiente sería rechazada por el backend con el mismo `400`/`403` ya cubierto.

---

## 18. Estrategia de pruebas

Sin pruebas automatizadas — mismo criterio ya establecido para todo el frontend del proyecto (validación manual real contra el servidor de desarrollo, confirmado en `ACTA_CIERRE_BLOQUE10.4c.md`, sección 4). Escenarios mínimos a validar manualmente antes del cierre de la implementación:

1. **Caso real completo, de punta a punta:** mismo chofer, dos organizaciones, crear → preparar → confirmar → `CONFIRMADO`, sin cambiar de organización activa en ningún momento.
2. **Pago de una sola organización** — confirmar que no exige un mínimo de dos.
3. **Estado vacío:** beneficiario sin candidatos en ninguna organización.
4. **Candidato ya no disponible al crear** (bloqueado por otra operación en el medio) — verificar el mensaje real, no uno inventado.
5. **Ciclo completo de cancelación** desde `BORRADOR` y desde `PREPARADO`, con motivo obligatorio.
6. **Fallo parcial real:** forzar (del mismo modo que la Auditoría Adversarial de 10.5 ya lo hizo del lado del backend, alterando el estado de una liquidación entre preparar y confirmar) un resultado `PARCIAL`, verificar el tratamiento visual distinto de éxito/error y el desglose por fila.
7. **Reintento** sobre el pago `PARCIAL` anterior, tras restaurar la condición que causó el fallo, hasta `CONFIRMADO` — verificar que la fila ya `APLICADA` no vuelve a tocarse visualmente (mismo estado, mismo `fechaPago` si se expusiera).
8. **Fallo total:** forzar que ninguna organización se aplique, verificar `FALLIDO`, verificar que "Cancelar" sigue disponible ahí.
9. **`PROCESANDO` visible:** difícil de provocar solo desde la interfaz (la propia petición de confirmar es la que lo resuelve en el mismo ciclo) — validar al menos que, si se fuerza el estado directamente en la base (mismo recurso ya usado en las pruebas de backend de 10.5), la pantalla lo muestra sin ninguna acción disponible.
10. **Timeout / pérdida de conexión simulada** en `preparar`/`confirmar`/`cancelar` — verificar que la pantalla no asume fallo silencioso y que, al reintentar, primero refleja el estado real tras una nueva consulta.
11. **Acceso revocado a mitad de flujo** — mismo escenario TOCTOU ya probado del lado del backend en la Auditoría Adversarial (revocar el acceso entre preparar y confirmar) — verificar que la pantalla muestra el `403` real, sin quedar en un estado roto.
12. **`listar()` con `403` total** — verificar el mensaje específico de la sección 13 y que la navegación directa a un pago puntual conocido sigue funcionando igual.
13. **Regresión del selector de organización activa** (`Layout.tsx`) y de las pantallas de 10.4 (`Grupo Económico`, cambio de organización) — confirmar que entrar y operar Pago Consolidado no altera su comportamiento, y que cambiar de organización activa en otra pestaña mientras se opera Pago Consolidado no rompe la pantalla (mismo mecanismo de sincronización entre pestañas ya validado en 10.4.b, sin ningún cambio acá).
14. **Doble clic** sobre cada una de las cuatro acciones de escritura — verificar que solo se ejecuta una vez.

---

## 19. Criterios de aceptación técnicos

1. Las tres rutas de la sección 1 quedan registradas en `App.tsx`, dentro del mismo `<Route element={<Layout />}>` que el resto de las pantallas autenticadas.
2. La entrada de menú de la sección 2 aparece únicamente para `ADMINISTRADOR`, en la posición indicada.
3. Ningún archivo fuera de los cinco listados en la sección 3 es creado o modificado.
4. Ningún endpoint de backend es creado, modificado ni consumido más allá de los nueve contratos reales listados en `DISEÑO_BLOQUE10.6_PAGO_CONSOLIDADO.md`, sección 12.
5. `npm run build` (frontend) compila sin errores tras la implementación.
6. Las tres pantallas replican el mismo gate de rol interno ya usado en `GrupoEconomico.tsx` — inaccesibles en su contenido real para cualquier rol distinto de `ADMINISTRADOR`, incluso si se navega directamente a la URL.
7. Los 14 escenarios de la sección 18 se validan manualmente contra el servidor de desarrollo antes del cierre, con evidencia (misma disciplina ya aplicada en los cierres de 10.4.a/b/c y 10.5).
8. Ninguna transición de estado se ofrece desde la interfaz fuera de la tabla real de `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, Decisión 5.

---

## 20. Riesgos y mitigaciones

- **Riesgo:** un `BORRADOR` duplicado si `crear` falla de forma ambigua (sin mecanismo de idempotencia en el backend). **Mitigación:** ya decidida en la sección 11 — no reintentar automáticamente, dirigir al usuario a revisar el listado antes de un segundo intento. Riesgo residual aceptado: puede quedar más de un `BORRADOR` con la misma selección, ninguno de los dos puede avanzar más allá de uno solo llegando a `PREPARADO` (Decisión Técnica 3 de 10.5, el bloqueo real es atómico), así que no hay riesgo financiero, solo una fila adicional cancelable en el listado.
- **Riesgo:** `listar()` puede negar el listado completo por un problema de acceso ajeno al pago que realmente interesa (Hallazgo 3, `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`). **Mitigación:** mensaje específico (sección 13) y disponibilidad confirmada de la consulta individual como camino alternativo — sin construir ningún parche del lado del cliente. Riesgo residual aceptado, documentado como limitación conocida del backend, no de 10.6.
- **Riesgo:** un pago que queda indefinidamente en `PARCIAL` porque la causa del fallo en una organización no es transitoria (límite ya documentado en Decisión Técnica 5 de 10.5). **Mitigación:** la pantalla no fuerza ni sugiere un reintento en bucle, deja la decisión al administrador — riesgo residual aceptado explícitamente como comportamiento operativo, no técnico, fuera de alcance de este bloque.
- **Riesgo:** `PROCESANDO` sin ninguna vía de recuperación si el proceso del backend se interrumpe a mitad de una confirmación (hallazgo del análisis forense de 10.5, expresamente fuera de alcance). **Mitigación:** ninguna del lado de 10.6 — la pantalla refleja el estado honestamente (sección 12) y no intenta compensar una limitación que pertenece al backend. Riesgo residual aceptado, dependiente de una futura Decisión Técnica de backend, ya anotada como pendiente en la memoria del proyecto.
- **Riesgo:** que las tres pantallas nuevas, al no compartir ningún componente ni hook, terminen divergiendo sutilmente entre sí con el tiempo (por ejemplo, dos criterios distintos de formateo). **Mitigación:** este mismo documento fija los criterios exactos de formato (sección 16) como referencia única para las tres — el riesgo de divergencia se acepta como el costo conocido de evitar una abstracción prematura, coherente con el criterio ya aplicado en el resto del proyecto.

---

## 21. Persistencia del estado de creación

Alcance exclusivo de `PagoConsolidadoNuevo.tsx`. Decisión de base: **sin ningún mecanismo de persistencia entre recargas o navegación** — no existe hoy, en ningún archivo del frontend, un patrón de guardado de borrador en `localStorage`/`sessionStorage` (`ViajeForm.tsx`, la única otra pantalla de creación comparable, tampoco lo tiene — su única protección es `useUnsavedChangesGuard`, ya decidida para esta pantalla en la sección 7). No se introduce acá el primer caso del proyecto con esa capa.

- **Conservación de la selección:** vive exclusivamente en el estado de React del componente, mientras el componente siga montado. Se mantiene intacta ante cualquier interacción que no sea, explícitamente, cambiar de beneficiario (ver más abajo) — escribir o editar `referenciaPago`, por ejemplo, nunca toca la selección de candidatos ni la lista de candidatos ya cargada, mismo criterio ya usado en `GrupoEconomico.tsx` (`email` y `candidato` son estados independientes que no se pisan entre sí salvo por la regla explícita que los vincula).
- **Comportamiento ante errores de red (al crear):** la selección, el beneficiario elegido, la lista de candidatos y el texto de `referenciaPago` se mantienen exactamente como estaban — ningún error limpia el formulario. Coherente con la sección 11 (idempotencia visual): un error de red no implica que la operación no haya ocurrido, así que borrar la selección sería, además de mala experiencia, potencialmente engañoso (haría parecer que hay que volver a elegir todo cuando puede que el `BORRADOR` ya se haya creado del otro lado).
- **Comportamiento ante fallo de `crear()`** (rechazo real del backend — validación, candidato ya no disponible, etc., sección 14): mismo tratamiento que un error de red — se mantiene selección, beneficiario, candidatos y `referenciaPago`, se muestra el mensaje real del backend (`error-banner` de la acción de crear, mismo patrón que el resto de la aplicación). **No se vuelve a consultar `candidatos` automáticamente tras el fallo** — evita reemplazar silenciosamente, en medio de un estado de error, la lista que el usuario tiene a la vista; si el usuario quiere ver el estado más actual de los candidatos, la vía ya existente es volver a elegir (o re-confirmar) el beneficiario, que dispara una consulta fresca por la regla ya establecida en la sección 6.
- **Comportamiento tras reintento:** reintentar es, literalmente, presionar el mismo botón de crear de nuevo con el mismo cuerpo de petición (misma selección, mismo `referenciaPago`) — sin ningún estado especial de "segundo intento". Si el reintento tiene éxito, se sigue la regla ya decidida en la sección 7 (navegación inmediata al detalle del pago recién creado). Si vuelve a fallar, se repite exactamente el mismo tratamiento de arriba, sin importar si el motivo del segundo fallo es igual o distinto al primero.
- **Criterio para limpiar o mantener el formulario, resumido:**

  | Evento | Formulario |
  |---|---|
  | Crear falla (red o rechazo del backend) | Se mantiene íntegro — selección, candidatos, `referenciaPago`. |
  | Reintento de crear | Se mantiene íntegro hasta que haya una respuesta (éxito o nuevo fallo). |
  | Crear tiene éxito | Se abandona por navegación al detalle (sección 7) — el desmontaje del componente es lo que descarta el estado, no una limpieza explícita. |
  | Cambio de beneficiario | **Reinicio completo**: se descartan candidatos, selección y `referenciaPago`. Elegir un beneficiario distinto es, a todos los efectos, empezar un borrador nuevo — mantener `referenciaPago` de un beneficiario anterior arriesgaría dejar un texto de referencia que ya no corresponde a lo que se está armando. Mismo espíritu que `GrupoEconomico.tsx` limpiando `candidato` al editar el email, llevado a todos los campos dependientes en vez de a uno solo, porque acá todos dependen del beneficiario elegido. |
  | Navegación fuera de la pantalla sin crear (menú, atrás, cierre de pestaña) | Se pierde todo — sin persistencia entre navegaciones, ya declarado al inicio de esta sección. `useUnsavedChangesGuard` (sección 7) es la única protección, y solo avisa; no guarda nada. |
  | Recarga del navegador (F5) | Se pierde todo — mismo motivo, ninguna pantalla del proyecto persiste estado de formulario hoy. |

---

## Preguntas que requieren aprobación separada del Product Owner (no decididas en este documento)

1. **Integración fuera de las tres pantallas de este bloque** — por ejemplo, un indicador en el Dashboard u otra pantalla que señale pagos consolidados `PARCIAL`/`FALLIDO` pendientes de atención. El Diseño aprobado no contempla ningún cambio fuera de la sección de Pago Consolidado en sí — cualquier integración cruzada es una ampliación de alcance, no decidida acá.
2. **Límite operativo de reintentos** sobre un pago `PARCIAL`/`FALLIDO` — `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md` deja explícitamente sin definir un límite ("comportamiento operativo, no técnico"). Este documento no define ninguno tampoco del lado de la interfaz (por ejemplo, deshabilitar "Reintentar" tras N intentos) — de considerarse necesario, es una decisión de producto pendiente.

Ninguna otra decisión de este documento queda abierta — las 21 secciones pedidas están resueltas.

---

## 22. Adenda de cierre — hallazgos de la auditoría adversarial, corrección y reverificación (2026-07-22)

Registra, para que este documento quede consistente con lo efectivamente implementado, lo ocurrido entre la implementación original (sección 1-21) y el cierre del bloque — ver `AUDITORIA_ADVERSARIAL_BLOQUE10.6.md` para el detalle completo de cada hallazgo y `ACTA_CIERRE_BLOQUE10.6.md` para el cierre formal.

### 22.1 Endpoint real usado, no listado originalmente

`PagoConsolidadoDetalle.tsx` consume, además de los nueve contratos listados en `DISEÑO_BLOQUE10.6_PAGO_CONSOLIDADO.md`, sección 12, un décimo endpoint real y ya existente: `GET /grupo-economico/choferes/identidades/:id` (`identidad-chofer.controller.ts`, método `detalle()`), para resolver el nombre del beneficiario mostrado en el título y en el diálogo de confirmación. Esto no estaba explicitado ni en el Diseño ni en este documento (sección 6, que solo listaba dos llamadas en paralelo para esta pantalla) — corregido acá: el listado de nueve contratos de la sección 12 del Diseño y el criterio de aceptación técnico #4 de la sección 19 quedan actualizados a **diez** contratos reales, agregando este endpoint. No se creó ni se modificó ningún endpoint — es un contrato ya existente de Bloque 10.2, simplemente no había sido inventariado para 10.6.

### 22.2 Sexto archivo modificado, no previsto originalmente

`frontend/src/styles.css` fue modificado, agregando ocho clases CSS nuevas (`.badge.PREPARADO`, `.badge.PROCESANDO`, `.badge.CONFIRMADO`, `.badge.PARCIAL`, `.badge.FALLIDO`, `.badge.APLICADA`, `.badge.FALLIDA`, `.warning-banner`) — necesarias para que los siete estados nuevos del Pago Consolidado y el banner de resultado parcial/fallido tuvieran color diferenciado. Esto contradice literalmente la sección 3, punto 3 ("ninguna clase nueva") y el criterio de aceptación técnico #3 de la sección 19 ("ningún archivo fuera de los cinco listados") — corregido acá: `styles.css` queda reconocido como **sexto archivo modificado**, legítimamente, con la justificación de arriba. El cambio en sí era correcto y necesario; lo que faltaba era su registro en este documento.

### 22.3 Dos bugs encontrados durante la reverificación posterior a la corrección de la auditoría adversarial

Al corregir el Hallazgo 1 (endpoint de identidad sin manejo de error) y el Hallazgo 4 (supuesto código muerto) de `AUDITORIA_ADVERSARIAL_BLOQUE10.6.md`, la reverificación en navegador real detectó dos bugs reales que la sola lectura de código no había anticipado:

- **El Hallazgo 4 no era código muerto.** La rama `if (!pago) return ...;` de `PagoConsolidadoDetalle.tsx`, que la auditoría adversarial había calificado de inalcanzable y se había eliminado como parte de la corrección, **sí es alcanzable**: existe una condición de carrera real entre los dos primeros `useEffect` del componente — el primero hace `setGrupo()` + `setCargando(false)` en el mismo ciclo de resolución de promesa, produciendo un render intermedio con `cargando=false`, `grupo` ya presente y `pago` todavía `null`, antes de que el segundo `useEffect` (dependiente de `grupo`) alcance a volver a poner `cargando=true` para cargar el pago. Al quitar la guarda, ese render intermedio ejecutaba `pago.estado` sobre `null`, rompiendo la pantalla completa con un `TypeError` real, reproducido y capturado en consola del navegador. **Corrección:** se restauró la guarda (ahora con el texto "Cargando...", más preciso que el "Pago consolidado no encontrado." original, dado que se confirmó que el caso real es una carga transitoria, nunca un 404 genuino) y se reemplazó el comentario que declaraba la rama inalcanzable por uno que documenta la causa real de la carrera.
- **"Actualizar" no reintentaba la identidad.** La primera versión de la corrección del Hallazgo 1 dejaba la carga de la identidad exclusivamente en un `useEffect` con dependencia `[grupo, pago?.identidadChoferGrupoId]` — ese valor no cambia entre recargas del mismo pago, así que hacer clic en "Actualizar" tras un fallo de identidad refrescaba el pago pero **nunca** reintentaba la identidad, dejando el banner de error y el botón "Confirmar"/"Reintentar" deshabilitados indefinidamente pese a que la causa original ya se había resuelto. Reproducido en navegador real: tras destrabar el fallo simulado, un clic en "Actualizar" no cambiaba nada. **Corrección:** se extrajo `cargarIdentidad(pagoActual: Pago)` como función reutilizable (mismo patrón que `cargarGrupo()`/`cargarPago()` ya existentes), invocada tanto por el `useEffect` (al cambiar de pago) como explícitamente por `recargarPago()` (al hacer clic en "Actualizar"), cada una con su propio guard de solicitud fuera de orden (`identidadRequestIdRef`, mismo patrón que `pagoRequestIdRef`).

Ninguno de los dos bugs llegó a exponerse en producción ni fue observado por ningún usuario real — ambos se detectaron y corrigieron durante la propia reverificación de la corrección, antes de cualquier commit.

### 22.4 Reverificación final — satisfactoria

Repetidas, contra backend real (NestJS + Postgres local) y navegador real (sin mocks de aplicación — solo interceptación de red a nivel de test para forzar los escenarios de fallo/carrera), las seis pruebas afectadas por las correcciones: fallo del endpoint de identidad (banner + botón deshabilitado, verificado programáticamente), recuperación vía "Actualizar" tras ese fallo, cambio rápido de beneficiario con respuesta tardía descartada, múltiples clics rápidos en "Actualizar" (una sola solicitud real, botón deshabilitado, estado final correcto), banners de Preparar/Cancelar reales (el banner de una acción anterior desaparece por completo al mostrar el resultado de la siguiente) y diferenciación visual de CONFIRMADO/PARCIAL/FALLIDO (verificada por inspección de código, sin cambios en esa lógica). `npm run build` limpio en cada etapa. Sin errores nuevos en consola del navegador tras las correcciones finales.

### 22.5 Sin cambios de backend en ningún momento

Ni la implementación original de Bloque 10.6, ni la auditoría adversarial, ni la corrección mínima, ni la reverificación de esta adenda modificaron ningún archivo de `backend/` — confirmado por `git diff` antes de este cierre. Todos los endpoints consumidos (los nueve originales más el reconocido en 22.1) ya existían, sin cambios, desde Bloque 10.2/10.5.

---

**Etapa de Decisiones Técnicas cerrada, con la sección 21 incorporada, y con la adenda de cierre de la sección 22.** Autorizada la implementación de Bloque 10.6 sobre la base exacta de este documento.

# Decisiones Técnicas — Bloque 10.4.b: Frontend del Cambio de Organización

Fecha: 2026-07-17. Registra exclusivamente las 4 decisiones técnicas resueltas sobre la base de `DISENO_BLOQUE10.4b_FRONTEND.md` (aprobado como base técnica, sección 12 — "Preguntas que requieren decisión del Product Owner"). **No repite el diseño completo, no escribe implementación, no define migraciones.** Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.4.b (Auditoría → Diseño → Decisiones). La implementación queda pendiente de una instrucción explícita posterior.

---

## Decisión Técnica 1 — Comportamiento de la pestaña pasiva ante el evento `storage`

**Pregunta:** ante el evento `storage` disparado por un cambio de organización hecho en otra pestaña, ¿la pestaña pasiva recarga en el lugar (misma URL) o redirige forzosamente a `/`, como sí hace la pestaña activa que inició el cambio?

**Decisión:** la pestaña pasiva recarga en su **URL actual**, preservando el contexto de navegación — **no** redirige a `/`. Coincide con la lectura literal ya prevista en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 7 ("la acción del listener es recargar la página"), y con `DISENO_BLOQUE10.4b_FRONTEND.md`, sección 5, paso 4.

**Consecuencia arquitectónica inmediata:** el listener de `storage` (vive en `AuthProvider`, `DISENO_BLOQUE10.4b_FRONTEND.md` sección 2) ejecuta exactamente `window.location.reload()` — nunca `window.location.href = "/"` ni ningún otro destino. Es una asimetría deliberada frente a la pestaña activa (que sí navega a `/`, sección 3 del diseño): la pestaña activa fuerza `/` porque fue quien decidió el cambio y su ruta actual puede depender de la organización de origen; la pestaña pasiva no tomó ninguna decisión, así que se le preserva su propio contexto de navegación. **Riesgo aceptado, documentado en `DISENO_BLOQUE10.4b_FRONTEND.md` sección 9:** si la ruta actual de la pestaña pasiva referencia un recurso que no existe en la organización nueva (ej. el detalle de un Viaje ajeno), la recarga puede mostrar un error o un estado vacío — se acepta tal cual, sin mecanismo adicional, coherente con el mismo tipo de riesgo ya aceptado en otros puntos del proyecto (ej. `DISENO_BLOQUE10.4_FRONTEND.md`, sección 8, requests en vuelo).

---

## Decisión Técnica 2 — Definición precisa de "formulario modificado" en `ViajeForm.tsx`

**Pregunta:** ¿cómo determina `ViajeForm.tsx` si tiene cambios sin guardar — una bandera simple que se activa una vez, o una comparación continua contra el estado inicial?

**Decisión:** bandera simple `dirty`, con exactamente esta semántica:
- Pasa a `true` con la **primera** modificación de cualquier campo del formulario.
- Permanece `true` — **no se resetea** — hasta que el formulario se guarda con éxito o la pantalla se abandona (momento en el que `ViajeForm` se desmonta y el estado desaparece con él).
- **No hay comparación continua contra el estado inicial** — revertir manualmente todos los campos a sus valores originales no vuelve a poner `dirty` en `false`.

**Consecuencia arquitectónica inmediata:** `useUnsavedChangesGuard(dirty)` (`DISENO_BLOQUE10.4b_FRONTEND.md`, sección 2) recibe este booleano tal cual, sin ninguna lógica de comparación de objetos dentro del hook — el hook sigue siendo genérico, y toda la responsabilidad de calcular "hay cambios" queda exclusivamente en cada componente que lo adopte (hoy, únicamente `ViajeForm.tsx`). La bandera se implementa como un `useState(false)` (o `useRef`, detalle de implementación) que la función `update(field, value)` ya existente en `ViajeForm.tsx` pone en `true` en su primera invocación — sin tocar la forma ni el flujo actual de `update()` más allá de esa única línea. Es la opción más conservadora: nunca genera un falso negativo (un cambio real que no dispare el aviso), a costa de poder avisar en un caso donde el usuario ya deshizo manualmente todos sus cambios — aceptado explícitamente.

---

## Decisión Técnica 3 — Mensaje de error cuando `cambiarOrganizacion()` falla

**Pregunta:** si el `POST /auth/cambiar-organizacion` falla después de confirmado el cambio (ej. `403` porque el acceso fue revocado entre que se cargó el selector y que se confirmó), ¿se muestra el mensaje genérico que ya devuelve el backend, o un texto de UI propio para este flujo?

**Decisión:** se muestra el mensaje genérico devuelto por el backend, **tal cual** — no se crea ningún mensaje específico de frontend para este caso.

**Consecuencia arquitectónica inmediata:** el componente que envuelve la llamada a `authContext.cambiarOrganizacion()` maneja el error con el mismo patrón `useAsyncAction` ya usado en el resto del proyecto (`Perfil.tsx`, `Organizacion.tsx`), leyendo `err?.response?.data?.message` sin ninguna traducción ni enriquecimiento adicional. Coherente con `DISENO_BLOQUE10.4_FRONTEND.md`, sección 13 ("los errores `403`/`404` se muestran con el mensaje genérico que el propio backend ya devuelve, sin agregar detalle en el cliente"), ya vigente en todo el proyecto — esta decisión no crea una regla nueva, confirma que este flujo no es una excepción a ella.

---

## Decisión Técnica 4 — Riesgo residual de `beforeunload` cancelado en la pestaña activa

**Pregunta:** si el usuario cancela el diálogo nativo de `beforeunload` en la propia pestaña que inició el cambio de organización — después de que `localStorage` ya fue escrito con el token/usuario nuevos, pero antes de que la recarga se complete — ¿se acepta la inconsistencia temporal resultante, o se antepone alguna verificación adicional antes de escribir `localStorage`?

**Decisión:** se acepta el riesgo residual tal cual, identificado en `DISENO_BLOQUE10.4b_FRONTEND.md`, sección 9. **No se agrega ningún mecanismo adicional de sincronización o verificación previa.**

**Consecuencia arquitectónica inmediata:** `cambiarOrganizacion()` no consulta, ni necesita conocer, el estado de `dirty` de ningún formulario antes de escribir `localStorage` — la separación ya aprobada entre la confirmación de cambio (Decisión Técnica 4 de `DECISIONES_TECNICAS_BLOQUE10.4.md`) y la detección de datos sin guardar (Decisión Técnica 5 del mismo documento) permanece intacta, sin acoplarse. Si el usuario cancela la descarga, la pestaña queda con datos de React de la organización anterior pero un token ya vigente de la organización nueva; cualquier escritura posterior sigue validada y aislada correctamente por el backend (un id de otra organización se rechaza, nunca se acepta silenciosamente — mecanismo de aislamiento de Bloque 8.1.d, sin cambios). Es una inconsistencia visual temporal, nunca una pérdida de datos ni una fuga entre organizaciones — mismo criterio de riesgo aceptado ya usado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 8, para requests en vuelo durante un cambio de organización.

---

## Resumen para la implementación

Las cuatro decisiones quedan incorporadas como restricciones obligatorias de 10.4.b:

- **Decisión 1:** listener de `storage` → `window.location.reload()` (misma URL), nunca `window.location.href = "/"`.
- **Decisión 2:** `ViajeForm.tsx` usa una bandera `dirty` que se activa una vez y no se resetea; sin comparación de objetos.
- **Decisión 3:** errores de `cambiarOrganizacion()` se muestran con el mensaje del backend, sin texto de UI propio.
- **Decisión 4:** sin mecanismo adicional para el riesgo residual del `beforeunload` en la pestaña activa — se acepta tal cual.

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en Bloques 10.1, 10.2, 10.3.a, 10.3.b o 10.4.a. Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.4.b. La implementación queda pendiente de una instrucción explícita posterior.

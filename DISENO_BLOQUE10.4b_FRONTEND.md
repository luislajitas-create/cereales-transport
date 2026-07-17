# Diseño Técnico — Bloque 10.4.b: Frontend del Cambio de Organización

Fecha: 2026-07-17. Etapa de Diseño — `METODOLOGIA_SDC.md`, etapa 2. **No se escribió código, no se modificó ningún archivo, no se hizo git.** Se apoya en `AUDITORIA_BLOQUE10.4b_FRONTEND.md` (aprobada como base) y respeta, sin reabrirlas, las decisiones ya aprobadas de Bloques 10.1, 10.2, 10.3.a, 10.3.b y 10.4.a — en particular `DECISIONES_TECNICAS_BLOQUE10.4.md` (Decisiones 3 a 8, el alcance exacto de este sub-bloque). No se auto-aprueba — queda a la espera de aprobación explícita.

---

## 1. Alcance y exclusiones

**Forma parte de 10.4.b (Decisiones Técnicas 3 a 8):**
- Visualización permanente de la Organización activa en `Layout.tsx`.
- Selector visible únicamente cuando hay más de una organización accesible.
- Carga de `GET /grupo-economico/organizaciones-accesibles` (10.4.a, cerrado).
- Confirmación previa al cambio (`useConfirm()`, severidad `"medium"`).
- Llamada a `POST /auth/cambiar-organizacion` (10.3.b, cerrado).
- Actualización de `usuario` en `localStorage`, con `"usuario"` escrito primero y `"token"` al final.
- Recarga completa posterior, mediante un mecanismo propio (corrección 1, sección 3).
- Sincronización entre pestañas escuchando exclusivamente la clave `"token"`.
- Protección mediante `beforeunload`, únicamente en `ViajeForm.tsx`.
- Estados de carga, error y cambio en curso, en el selector y en el flujo de cambio.

**Queda expresamente fuera (corrección 7):**
- Administración visual de accesos (otorgar/listar/revocar) — 10.4.c.
- Resolución de usuarios (`GET /grupo-economico/:id/usuarios/resolver`) — 10.4.c.
- Topología del Grupo Económico (crear/asociar/desasociar, consulta del grupo) — 10.4.c.
- Identidad compartida de Chofer — fuera de 10.4 completo (`DECISIONES_TECNICAS_BLOQUE10.4.md`, Decisión 10).
- Cualquier cambio de backend — ambos contratos que este sub-bloque consume ya están cerrados y verificados en producción.
- Cualquier librería nueva de estado, caché, o mensajería entre pestañas (`BroadcastChannel` explícitamente excluido).
- Rediseño de `Layout.tsx` más allá de agregar el bloque del selector dentro de `.user-info`.

---

## 2. Arquitectura propuesta

**Principio rector (corrección 2): extender `AuthContext.tsx` de forma mínima — no crear un `SessionProvider` nuevo.** `AuthContext.tsx` ya cumple ese rol (identidad, token, `loading`, `login`/`logout`); la función `cambiarOrganizacion()` termina reescribiendo la sesión completa, igual que esas dos, así que vive en el mismo lugar.

### Piezas nuevas

| Pieza | Vive en | Responsabilidad |
|---|---|---|
| `Usuario.organizacionId` | `AuthContext.tsx` (interfaz existente, extendida) | Único campo nuevo (sección 3) — necesario para que el resto de la UI, hoy y a futuro, sepa la organización activa sin decodificar el JWT. |
| `cambiarOrganizacion(organizacionId): Promise<void>` | `AuthContext.tsx` (función nueva, junto a `login`/`logout`) | Llama al endpoint, escribe `localStorage` en el orden seguro, dispara la recarga dura. No maneja `busy`/`error` propio — los propaga por excepción, igual que hoy no lo hace `login()` (el propio `Login.tsx` maneja su error localmente). |
| Listener de `storage` | `AuthContext.tsx` (`useEffect` dentro de `AuthProvider`) | Se monta una sola vez, junto con el resto del ciclo de vida de la sesión — es, por naturaleza, un concern de sesión, no de una pantalla puntual. Limpieza determinística vía `return () => window.removeEventListener(...)` (corrección 5). |
| `useOrganizacionesAccesibles()` | `frontend/src/hooks/useOrganizacionesAccesibles.ts` (nuevo) | Hook chico y propio, usado solo por el selector — **no vive en `AuthContext`** (mismo criterio ya fijado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 3: mantiene el contexto acotado a identidad y sesión, no a datos de una pantalla puntual). Consulta `GET /grupo-economico/organizaciones-accesibles` (10.4.a) una vez por montaje de `Layout`, sin persistir el resultado. |
| Selector de Organización | `frontend/src/components/Layout.tsx`, dentro del bloque `.user-info` existente (líneas 43-48 actuales) | Markup + lógica de UI; no es un componente separado en un archivo propio — el bloque es chico y no se reutiliza en ningún otro lugar (evita una abstracción prematura para un único punto de uso). |
| `useUnsavedChangesGuard(hayCambiosSinGuardar: boolean)` | `frontend/src/hooks/useUnsavedChangesGuard.ts` (nuevo) | Hook mínimo y genérico, registra/limpia `beforeunload` según el booleano recibido. Sin registro global — cada componente que lo use (hoy, únicamente `ViajeForm.tsx`) le pasa su propio estado (corrección 6). |
| Bandera `dirty` | `frontend/src/pages/ViajeForm.tsx` (estado nuevo, local) | Ver sección 5 y sección 12 (pregunta 2) para la definición precisa. |

### Por qué el listener de `storage` vive en `AuthContext` y no en `Layout`

`Layout` se desmonta y remonta en cada logout/login (no es un singleton verdadero — vuelve a montarse tras cualquier recarga completa, incluida la que dispara este mismo sub-bloque). `AuthProvider`, en cambio, envuelve toda la aplicación desde `main.tsx` y solo se monta una vez por carga de página — es el único lugar donde "una vez por sesión de pestaña" es una garantía real, no una casualidad de qué rutas están montadas en un momento dado. Coherente con la corrección 2: es una extensión mínima del mismo componente, no una pieza nueva.

---

## 3. Corrección de la recarga completa (corrección 1)

**No se afirma que `Login.tsx` ya usa recarga completa** — verificado en la auditoría: usa `navigate("/")` de `react-router-dom`, una transición SPA. Funciona ahí porque `login()` ya actualiza el estado de React (`setUsuario`) antes de navegar; no hace falta recargar.

**El cambio de organización sí necesita una recarga dura, explícita y propia** — no reutiliza `navigate()`. Se implementa como:

```ts
window.location.href = "/";
```

Ubicada al final de `cambiarOrganizacion()` en `AuthContext.tsx`, después de que ambas escrituras de `localStorage` (sección 4) se completaron con éxito. Es el mismo mecanismo (`window.location.href`), aunque no el mismo destino, que ya usa el interceptor de `401` en `api/client.ts` (que navega a `/login`) — ese interceptor es el precedente real a citar, no `Login.tsx`.

**Por qué `/` y no la ruta actual:** mismo criterio ya fijado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 5, paso 7 — el contenido de la ruta actual (ej. el detalle de un Viaje) puede no tener sentido en la organización nueva. No se reabre esa decisión, solo se corrige el mecanismo que la ejecuta.

---

## 4. Flujo normal completo (una sola pestaña, sin formulario sin guardar)

1. `Layout` monta → `useOrganizacionesAccesibles()` consulta `GET /grupo-economico/organizaciones-accesibles` una vez.
2. Mientras resuelve: no se muestra ningún selector todavía (sección 7, estado de carga).
3. Si la lista tiene un solo elemento: se muestra el nombre de la organización (`esActual: true`), sin control interactivo.
4. Si tiene más de uno: se muestra el nombre de la organización actual + un control para elegir otra.
5. El usuario elige una organización destino.
6. `useConfirm()` — severidad `"medium"`, mensaje con el nombre de la organización destino (ej. `"¿Cambiar a Organización B - Prueba Fase F?"`). Si cancela, no pasa nada más — la lista y el estado quedan exactamente como estaban.
7. Si confirma: el trigger del selector se deshabilita (estado "cambio en curso", vía `useAsyncAction` en el componente que envuelve la llamada) y se invoca `authContext.cambiarOrganizacion(organizacionId)`.
8. `cambiarOrganizacion()`:
   a. `POST /auth/cambiar-organizacion` con `{ organizacionId }`.
   b. Si falla (ver sección 8): la excepción se propaga sin tocar `localStorage`; el componente que llamó la captura y muestra el error (sección 7).
   c. Si tiene éxito, recibe `{ accessToken, usuario }`.
   d. Captura los valores **actuales** de `"token"` y `"usuario"` de `localStorage` (para poder revertir).
   e. Escribe `localStorage.setItem("usuario", JSON.stringify(usuario))` — primero.
   f. Escribe `localStorage.setItem("token", accessToken)` — al final.
   g. Si (e) o (f) lanza una excepción (caso extremo, ej. `QuotaExceededError`): restaura de inmediato los valores originales capturados en el paso (d) en ambas claves, no recarga, y propaga el error al componente llamador.
   h. Si ambas escrituras tuvieron éxito: `window.location.href = "/"` (sección 3).
9. La aplicación arranca desde cero (`main.tsx`); `AuthProvider` relee `localStorage`; `Layout` vuelve a montar; `useOrganizacionesAccesibles()` vuelve a consultar el endpoint — la organización activa nueva aparece con `esActual: true`.

**No se actualiza el estado de React antes de recargar** (paso 8.h) — sería trabajo descartado, la recarga reconstruye todo desde cero.

---

## 5. Flujo entre pestañas

Dos pestañas, A (activa, la que inicia el cambio) y P (pasiva).

1. En A ocurre el flujo completo de la sección 4 hasta el paso 8.f (ambas claves ya escritas en el `localStorage` compartido).
2. El navegador dispara un evento `storage` en **todas las demás pestañas del mismo origen** — nunca en A (garantía nativa del navegador, no hace falta código para evitarlo ahí).
3. En P, el listener registrado en `AuthProvider` (sección 2) recibe el evento. Condición exacta para actuar: `event.key === "token" && event.newValue !== event.oldValue` — cualquier otro `key` (incluido `"usuario"`, que cambia en un evento `storage` separado) se ignora explícitamente.
4. P ejecuta `window.location.reload()` — recarga la página **en el lugar**, sin cambiar de ruta (ver pregunta abierta 1, sección 12, sobre si esto debe ser así o si P debería converger también a `/`).
5. Si dos pestañas cambian casi simultáneamente: no hace falta coordinación nueva — `localStorage` es un único almacén compartido, la última escritura de `"token"` gana, y todas las pestañas (la que originó cada cambio, y cualquier pasiva) terminan leyendo, en su propia recarga, el mismo valor final.
6. Limpieza: al recargar, P se destruye por completo junto con el listener — no hay ningún estado que sobreviva a la recarga que deba limpiarse manualmente.

**Sin `BroadcastChannel`, sin polling, sin temporizadores** (corrección 5) — el único mecanismo es el evento nativo `storage`, que el navegador ya dispara sin ningún código adicional.

---

## 6. Flujo con `ViajeForm.tsx` modificado

`useUnsavedChangesGuard(dirty)` (sección 2) se llama dentro de `ViajeForm.tsx`, con `dirty` definido según la sección 12, pregunta 2. Mientras `dirty === true`, el hook mantiene registrado un listener `beforeunload` (con `preventDefault()` + `event.returnValue = ""`, el patrón estándar que obliga al navegador a mostrar su propio diálogo nativo — sin mensaje personalizado, los navegadores no lo permiten).

**Caso 1 — cambio de organización iniciado en la misma pestaña donde está `ViajeForm` abierto y modificado:**
1. El usuario confirma el cambio (sección 4, paso 6).
2. `cambiarOrganizacion()` llega hasta el paso 8.h y ejecuta `window.location.href = "/"`.
3. Esa asignación dispara la descarga de la página → `beforeunload` se activa (porque `dirty === true`) → el navegador muestra su diálogo nativo.
4. Si el usuario confirma "salir": la navegación continúa normalmente, igual que el flujo de la sección 4.
5. Si el usuario cancela: la navegación se aborta. **Ver riesgo residual, sección 9.**

**Caso 2 — cambio de organización iniciado en otra pestaña, mientras esta pestaña tiene `ViajeForm` abierto y modificado:**
1. Esta pestaña recibe el evento `storage` (sección 5) y ejecuta `window.location.reload()`.
2. Esa recarga también dispara `beforeunload` — mismo evento nativo, sin código separado para este caso (es, estructuralmente, la misma situación que el Caso 1, solo que la recarga la origina el listener en vez de la propia acción del usuario).
3. Si el usuario cancela: esta pestaña sigue funcionando con los datos de React ya cargados, pero cualquier request nuevo que dispare (por ejemplo, al guardar el propio Viaje) ya usará el `"token"` nuevo, porque el interceptor de `api/client.ts` lo lee de `localStorage` en cada request, sin caché. El backend valida y aísla correctamente cualquier id cruzado de organización (mismo mecanismo de 8.1.d) — nunca hay una escritura silenciosa contra la organización equivocada, en el peor caso el request se rechaza con `400`/`404`. **Inconsistencia visual temporal aceptada, nunca pérdida de datos ni fuga entre organizaciones** — mismo criterio ya fijado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 7, para este caso exacto.

**No existe ningún registro global de formularios sucios** (corrección 6) — cada instancia de `ViajeForm` calcula su propio `dirty` de forma completamente local; si en el futuro otra pantalla necesita el mismo mecanismo, reutiliza el hook con su propio estado, sin coordinación entre pantallas.

---

## 7. Estados de UI

| Estado | Comportamiento |
|---|---|
| Cargando la lista de organizaciones accesibles | No se muestra ningún selector todavía — ni un spinner disruptivo (consulta rápida, de bajo costo). |
| Error al cargar la lista | Falla en silencio para el usuario — no se muestra el selector; el resto de `Layout` se renderiza con normalidad. Un fallo de esta consulta nunca bloquea la navegación. |
| Lista con un solo elemento | Se muestra el nombre de la organización activa, sin ningún control interactivo. |
| Lista con más de un elemento | Se muestra el nombre de la organización activa + el control para elegir otra. |
| Cambio en curso (entre la confirmación y la recarga) | El trigger del selector se deshabilita (patrón `busy`, `useAsyncAction`) — evita doble click / doble confirmación mientras el `POST` está en vuelo. |
| Error al confirmar el cambio (el `POST` falla) | Se muestra junto al selector, con el mismo patrón `useAsyncAction`/`error-banner` ya usado en `Perfil.tsx`/`Organizacion.tsx`. `localStorage` queda intacto (nunca se llegó a escribir, o se revirtió — sección 4, paso 8.g). El usuario permanece en la pantalla actual, puede reintentar. |
| Cambio exitoso | Ningún feedback adicional — la propia recarga completa, mostrando el nombre de la organización nueva ya actualizado en `Layout`, cumple ese rol (mismo razonamiento ya usado en el diseño general). |

---

## 8. Manejo de errores

- **`401` durante `POST /auth/cambiar-organizacion`** (token vencido a mitad de la operación): lo captura el interceptor global de `api/client.ts`, que ya limpia `localStorage` y redirige a `/login` — sin manejo especial adicional en `cambiarOrganizacion()`.
- **`403` genérico** (`"No tenés autorización para operar esa organización."` — acceso revocado, organización que dejó de pertenecer al grupo, etc., entre que se cargó la lista y se confirmó el cambio): se muestra tal cual lo devuelve el backend, sin agregar detalle en el cliente (mismo criterio ya fijado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 13). Ver pregunta abierta 3, sección 12.
- **Error de red / `5xx`**: mismo patrón genérico de `useAsyncAction` (`"No se pudo completar la acción"` o mensaje específico del componente).
- **`QuotaExceededError` u otra excepción al escribir `localStorage`**: revertido explícitamente (sección 4, paso 8.g) — caso extremo, sin precedente conocido en el proyecto, pero cubierto por diseño.
- **Error al cargar `GET /grupo-economico/organizaciones-accesibles`**: silencioso para el usuario (sección 7) — no es un error que el usuario deba resolver, es una degradación aceptable (sin selector visible).

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Confundir el precedente de recarga completa con el de `Login.tsx` (que en realidad no recarga) | Corregido explícitamente en la sección 3 — el mecanismo real a implementar es `window.location.href`, con el interceptor de `401` como precedente citable, no `Login.tsx`. |
| Orden de escritura de `localStorage` distinto entre `login()` (token primero) y `cambiarOrganizacion()` (usuario primero) | Documentado explícitamente en la sección 4 — son dos funciones con propósitos distintos; no se unifican, no se toca `login()`. |
| `React.StrictMode` duplicando el listener de `storage` en desarrollo | El `useEffect` que lo registra retorna una función de limpieza (`removeEventListener`) — el doble montaje de StrictMode termina en, como máximo, un listener activo a la vez (monta → limpia → monta), nunca dos simultáneos. |
| Pestaña activa: el usuario cancela el diálogo nativo de `beforeunload` **después** de que `localStorage` ya fue escrito con el token/usuario nuevos (sección 6, Caso 1, paso 5) | **Riesgo residual aceptado, no se construye ningún mecanismo adicional** — mismo criterio ya aceptado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 8, para requests en vuelo. La pestaña queda con datos de React de la organización anterior pero un token ya vigente de la nueva; cualquier escritura posterior sigue aislada correctamente por el backend (ids cruzados de otra organización se rechazan, nunca se aceptan silenciosamente). Inconsistencia visual temporal, nunca pérdida de datos ni fuga entre organizaciones. Ver pregunta abierta 4, sección 12, para que quede aceptado explícitamente. |
| `ViajeForm.tsx` sin ninguna fuente hoy de "hay cambios sin guardar" | Se define una bandera `dirty` local y explícita (sección 12, pregunta 2) — no se asume que un mecanismo genérico ya la calcula. |
| Selector ofrece una organización cuyo acceso fue revocado entre que se cargó la lista y que se hizo click | El backend revalida todo en cada llamada a `cambiarOrganizacion()` (ya así desde 10.3.b) — el peor caso es un `403` mostrado al usuario (sección 8), nunca un cambio inconsistente. |
| Doble click / doble confirmación sobre el selector mientras un cambio ya está en curso | Trigger deshabilitado durante el estado "cambio en curso" (sección 7), mismo patrón `busy` ya usado en todo el proyecto. |

---

## 10. Contratos consumidos

**Fuente válida (corrección 4): `ACTA_CIERRE_BLOQUE10.4a.md` y el código real desplegado — no la sección 9 de `DISENO_BLOQUE10.4_FRONTEND.md` (contrato de `usuarios/buscar`, desactualizado y fuera de alcance de 10.4.b de todos modos).**

### `GET /grupo-economico/organizaciones-accesibles`

- Guard: `JwtAuthGuard` únicamente — cualquier usuario autenticado, sin restricción de rol.
- Sin parámetros — resuelve todo desde el usuario autenticado.
- Respuesta: `{ id: string, nombre: string, esActual: boolean }[]`.
- Siempre incluye la organización de pertenencia real; organizaciones adicionales solo con acceso vigente en el mismo grupo; propia primero, resto alfabético.

### `POST /auth/cambiar-organizacion`

- Guard: `JwtAuthGuard` únicamente.
- Body: `{ organizacionId: string }` (UUID).
- Respuesta exitosa: `{ accessToken: string, usuario: { id: string, nombre: string, email: string, rol: string, organizacionId: string } }` — misma forma que `login()`, ahora con `organizacionId` incluido (confirmado en `ACTA_CIERRE_BLOQUE10.3b.md`).
- Fallo: `403` genérico, sin distinguir motivo.

---

## 11. Archivos previstos a modificar o crear

**Modificados:**
- `frontend/src/context/AuthContext.tsx` — interfaz `Usuario` (+ `organizacionId`, sección 12 pregunta 3), función `cambiarOrganizacion()`, listener de `storage`.
- `frontend/src/components/Layout.tsx` — selector dentro de `.user-info`, usando `useOrganizacionesAccesibles()` y `authContext.cambiarOrganizacion()`.
- `frontend/src/pages/ViajeForm.tsx` — bandera `dirty`, adopción de `useUnsavedChangesGuard()`.

**Nuevos:**
- `frontend/src/hooks/useOrganizacionesAccesibles.ts`.
- `frontend/src/hooks/useUnsavedChangesGuard.ts`.

**Sin cambios (confirmado explícitamente, no se tocan):**
- `frontend/src/api/client.ts` — el interceptor de request ya lee `token` sin caché en cada request; no necesita ningún ajuste.
- `frontend/src/App.tsx` — el selector no es una ruta nueva.
- Cualquier archivo de backend — ambos contratos consumidos ya están cerrados.
- Cualquier pantalla administrativa (`Usuarios.tsx`, `AuditoriaAdministrativa.tsx`) o pantalla nueva de administración de accesos — pertenecen a 10.4.c.
- `ConfirmDialog.tsx`, `useAsyncAction.ts` — ya cubren lo necesario, sin extenderse.

---

## 12. Preguntas que requieren decisión del Product Owner

1. **Pestaña pasiva ante el evento `storage` (sección 5, paso 4): ¿recarga en el lugar (`window.location.reload()`, misma URL) o redirección forzada a `/` (mismo criterio que la pestaña activa)?** El diseño general (`DISENO_BLOQUE10.4_FRONTEND.md`, sección 7) dice literalmente "recargar la página", sin especificar cuál de las dos. **Recomendación de este diseño: recarga en el lugar** (lectura literal del texto ya aprobado) — con el riesgo aceptado de que la ruta actual referencie un recurso que no existe en la organización nueva (ej. el detalle de un Viaje ajeno), mismo tipo de riesgo ya aceptado en otros puntos del proyecto para casos de recarga con contenido potencialmente inválido.

2. **Definición precisa de "formulario modificado" en `ViajeForm.tsx`** (sección 6): ¿una bandera `dirty` que se activa en la primera edición de cualquier campo y **nunca se resetea** mientras el componente esté montado (recomendado — más simple, más conservadora, nunca genera un falso negativo), o una comparación continua entre el estado actual y el estado inicial del formulario (se "limpiaría" si el usuario revierte manualmente todos los campos a sus valores originales, exponiendo la posibilidad, aunque rara, de perder el aviso justo antes de un cambio de organización)?

3. **Mensaje mostrado cuando `cambiarOrganizacion()` falla después de confirmado el cambio** (ej. `403` porque el acceso fue revocado entre que se cargó el selector y que se confirmó — sección 8): ¿el mensaje genérico tal cual lo devuelve el backend (recomendado — consistente con el resto del proyecto, `DISENO_BLOQUE10.4_FRONTEND.md` sección 13), o un texto de UI distinto, más específico para este flujo?

4. **Aceptación explícita del riesgo residual de la sección 9** (pestaña activa, `beforeunload` cancelado después de que `localStorage` ya fue escrito): ¿se acepta tal cual, sin construir ningún mecanismo adicional (recomendado), o se prefiere anteponer alguna verificación extra antes de escribir `localStorage` — con el costo de reabrir la separación ya aprobada entre la confirmación de cambio (Decisión 4) y la detección de datos sin guardar (Decisión 5), que hoy están deliberadamente desacopladas?

Ninguna de las cuatro reabre una decisión ya aprobada de Bloques 10.1 a 10.4.a — las cuatro son detalles de implementación que el diseño general dejó, de forma legítima, sin especificar a este nivel de precisión.

---

## Resumen

Diseño completo para `AuthContext.tsx` (extendido, no reemplazado), un selector dentro de `Layout.tsx`, dos hooks nuevos y chicos (`useOrganizacionesAccesibles`, `useUnsavedChangesGuard`), y la adopción de este último en `ViajeForm.tsx`. Ambos contratos de backend que este sub-bloque consume ya están cerrados y verificados en producción — cero cambios de backend. Se corrigieron dos hechos que el diseño general había asumido de forma imprecisa (el precedente real de recarga completa, y la fuente válida del contrato de 10.4.a) y se dejaron cuatro preguntas puntuales, todas de implementación, para tu decisión antes de avanzar a Implementación.

No se escribió código, no se modificó ningún archivo existente, no se hizo git add/commit/push. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier decisión técnica guiada o implementación.

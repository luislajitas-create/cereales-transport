# Diseño Técnico — Bloque 10.4.c: Administración Visual de Accesos de Grupo Económico

Fecha: 2026-07-17. Etapa de Diseño — `METODOLOGIA_SDC.md`, etapa 2. **No se escribió código, no se modificó ningún archivo, no se hizo git.** Se apoya en `AUDITORIA_BLOQUE10.4c.md` (aprobada como base) y respeta, sin reabrirlas, las decisiones ya aprobadas de Bloques 10.1, 10.2, 10.3.a, 10.3.b, 10.4.a y 10.4.b — en particular Decisión Técnica 9 de `DECISIONES_TECNICAS_BLOQUE10.4.md`. Fuentes de contrato: `ACTA_CIERRE_BLOQUE10.4a.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.4b.md`, y el código real de `backend/src/grupo-economico/`. **No se usa el contrato histórico `usuarios/buscar`** de `DISENO_BLOQUE10.4_FRONTEND.md` sección 9 — desactualizado, ya señalado en dos auditorías. No se auto-aprueba — queda a la espera de aprobación explícita.

---

## 1. Alcance

**Forma parte de 10.4.c:**
- Obtención del Grupo Económico necesario para operar (`GET /grupo-economico`), como paso técnico previo, no como sección visual propia (sección 3, resolución de la Tensión 1).
- Otorgamiento de accesos: resolución exacta de usuario (`GET /grupo-economico/:id/usuarios/resolver`) + confirmación + `POST /grupo-economico/:id/accesos`.
- Listado de accesos vigentes (`GET /grupo-economico/:id/accesos`), con el destinatario enriquecido (nombre/email/organización) y el otorgante representado según la resolución de la Tensión 2 (sección 4).
- Revocación de accesos (`DELETE /grupo-economico/:id/accesos/:accesoId`), con confirmación de severidad alta.
- Estados de carga, vacíos, error y operación en curso para cada uno de los cuatro puntos anteriores.
- Una ruta nueva (`/administracion/grupo-economico`) y un ítem de menú nuevo, ambos exclusivos de `ADMINISTRADOR`, siguiendo el patrón ya usado por `/administracion/usuarios` y `/administracion/auditoria`.

**Queda expresamente fuera (instrucción explícita):**
- Cualquier cambio de backend — los cinco contratos que este sub-bloque consume ya están cerrados y verificados en producción.
- Topología avanzada del Grupo Económico (`crear`/`asociar`/`desasociar` — ya excluida desde el diseño general de 10.4, sección 10, sigue excluida acá).
- Identidad compartida de Chofer (`IdentidadChoferGrupo`) — fuera de 10.4 completo, Decisión Técnica 10.
- Edición de organizaciones (`PATCH /organizacion` ya existe, sin relación con este sub-bloque).
- Nuevos permisos o nuevos roles — se sigue usando exclusivamente `ADMINISTRADOR`, ya establecido.
- Cualquier cambio en `AuditoriaAdministrativa.tsx` — ya es genérica, los cuatro eventos de Grupo Económico ya son visibles ahí sin ningún cambio (confirmado en la auditoría).
- Refactors generales de cualquier archivo no directamente relacionado con esta pantalla.

---

## 2. Arquitectura propuesta

**Un único archivo nuevo, monolítico:** `frontend/src/pages/GrupoEconomico.tsx` — mismo criterio que `Usuarios.tsx` (335 líneas, un solo componente, sin sub-componentes propios): es una pantalla de un solo uso, sin necesidad de reutilización externa, y el proyecto ya evita abstracciones prematuras para este tipo de caso. No se crea ningún hook nuevo — toda la lógica (bootstrap del grupo, listado, resolución, otorgamiento, revocación, enriquecimiento) vive dentro del componente, replicando exactamente los patrones ya usados en `Usuarios.tsx`:

| Necesidad | Patrón que replica |
|---|---|
| Cargar el grupo al montar (una sola vez, gateado por rol) | Mismo patrón que la carga inicial de `Usuarios.tsx`/`AuditoriaAdministrativa.tsx`: `useEffect` + `if (usuario?.rol === "ADMINISTRADOR")`, estado plano (`cargandoGrupo`, `errorGrupo`, `grupo`), no `useAsyncAction` (es una consulta automática, no una acción disparada por el usuario). |
| Cargar el listado de accesos (al resolver el grupo, y tras cada otorgamiento/revocación exitosos) | Misma forma que la función `cargar()` de `Usuarios.tsx`: estado plano (`cargandoAccesos`, `errorAccesos`, `accesos`), invocable por nombre. |
| Resolver un candidato por email | `useAsyncAction()` propio (`resolverAccion`) — acción disparada por el usuario. |
| Otorgar el acceso ya confirmado | `useAsyncAction()` propio (`otorgarAccion`). |
| Revocar un acceso | `useAsyncAction()` compartido entre filas (`filaAccion`) — mismo criterio que `Usuarios.tsx` (un solo estado de "operación en curso" para todas las filas, no uno por fila). |
| Enriquecer `usuarioId` de cada fila del listado con nombre/email/organización | Estado local nuevo, propio de esta pantalla: `enriquecidos: Record<string, Candidato \| null>`, poblado por un `useEffect` que dispara resoluciones en paralelo (`Promise.allSettled`) por cada `usuarioId` único del listado que todavía no esté en el mapa — ver sección 7. |
| Confirmaciones | `useConfirm()`, igual que el resto del proyecto. |

**Sin providers ni contextos nuevos** — `usuario` (con `organizacionId`, ya disponible desde 10.4.b) se lee de `useAuth()`, igual que en `Usuarios.tsx`/`Organizacion.tsx`.

---

## 3. Navegación y ubicación de la pantalla

- **Ruta nueva:** `/administracion/grupo-economico`, dentro de `<Route element={<Layout/>}>` en `App.tsx`, junto a `/administracion/usuarios` y `/administracion/auditoria`.
- **Ítem de menú nuevo** en `NAV_ITEMS` de `Layout.tsx`: `{ to: "/administracion/grupo-economico", label: "Grupo Económico", roles: ["ADMINISTRADOR"] }`, agregado inmediatamente después de `"Auditoría Administrativa"` (mantiene agrupado el cluster de pantallas exclusivamente administrativas, mismo criterio de orden ya usado).
- **Gate de rol redundante en la propia pantalla** (defensa en profundidad, mismo patrón que `Usuarios.tsx`/`AuditoriaAdministrativa.tsx`): si `usuario?.rol !== "ADMINISTRADOR"`, se renderiza únicamente el título y un `error-banner` ("No tenés permiso para ver esta sección."), sin ejecutar ninguna consulta.

### Resolución de la Tensión 1 — `GET /grupo-economico` como prerrequisito, no como sección

**Decisión de diseño:** la consulta a `GET /grupo-economico` se ejecuta siempre, al montar la pantalla, como paso técnico obligatorio para obtener el `:id` que las otras cuatro rutas necesitan en su URL — **pero no se le dedica ninguna sección, tarjeta, ni bloque visual propio.** Su único resultado visible es una línea de contexto, chica y no interactiva, junto al título de la página (ej. `<p className="muted">Grupo: {grupo.nombre}</p>`, mismo tratamiento tipográfico que ya usa `.muted` en el resto del proyecto para metadatos secundarios) — comparable a cómo `Organizacion.tsx` muestra "Creada: [fecha]" como dato incidental, no como su propia sección. La pantalla mantiene exactamente dos secciones funcionales, tal como fija la Decisión Técnica 9: **"Otorgar acceso"** y **"Accesos vigentes"**. Ninguna acción del usuario opera sobre el grupo en sí (no hay botón "editar grupo", no hay tabla de organizaciones miembro) — esos datos (`organizaciones: {id,nombre}[]`) llegan en la respuesta pero **no se muestran en esta versión** (quedarían disponibles para una futura pantalla de topología, hoy fuera de alcance).

Si la organización del actor no pertenece a ningún grupo (`GET /grupo-economico` → `null`, caso legítimo desde 10.1): la pantalla muestra únicamente un estado vacío (sección 8) — ni el formulario de otorgar ni la tabla de accesos se renderizan, porque ninguno de los dos tiene sentido sin un `:id` de grupo válido.

---

## 4. Resolución de la Tensión 2 — Campo `otorgadoPorId`

**Hecho confirmado en la auditoría, no se reabre:** `usuarios/resolver` rechaza explícitamente cualquier usuario de la propia organización del actor (`resolverEnGrupo()`, `usuario-grupo-lookup.service.ts`). `otorgadoPorId` es, por construcción de `otorgar()` (`acceso-grupo.controller.ts`), siempre alguien de la **propia** organización del actor — nunca resoluble con ese contrato. No se propone ningún endpoint nuevo.

**Decisión de diseño:** el frontend ya tiene, sin ninguna llamada adicional, el único dato que necesita para representar `otorgadoPorId` con veracidad: `usuario.id` del `ADMINISTRADOR` que está mirando la pantalla (`useAuth()`, ya disponible). Comparación local, sin red:

```
otorgadoPorId === usuario.id  →  "Vos"
otorgadoPorId !== usuario.id  →  "Otro administrador de tu organización"
```

Ninguna de las dos etiquetas requiere resolver un nombre real — ambas son verdaderas por construcción (el otorgante siempre pertenece a la organización del actor, confirmado en la auditoría), y ninguna expone un UUID crudo ni inventa un nombre que el backend no confirmó. **Limitación documentada, dependiente de una futura evolución del backend:** si en algún momento se necesita mostrar el nombre real de cualquier administrador que otorgó un acceso (no solo distinguir "vos" de "otro"), hace falta un contrato nuevo — hoy no existe, y esta pantalla no lo requiere para cumplir su objetivo.

---

## 5. Flujo completo de carga (bootstrap)

1. La pantalla monta. Si `usuario?.rol !== "ADMINISTRADOR"`: fin, se muestra el gate de la sección 3.
2. `GET /grupo-economico`.
   - Error de red/servidor → `errorGrupo` con el mensaje del backend; no se muestra nada más.
   - Éxito, `null` → `grupo = null`; se muestra el estado vacío (sección 8); fin del flujo de carga.
   - Éxito, objeto → `grupo = { id, nombre, organizaciones }`; se dispara el paso 3.
3. `GET /grupo-economico/:id/accesos` (con el `id` recién obtenido).
   - Error → `errorAccesos`, mostrado dentro de la tarjeta de "Accesos vigentes"; el formulario de "Otorgar acceso" igual se muestra (son secciones independientes — un fallo del listado no debe impedir otorgar un acceso nuevo).
   - Éxito → `accesos = [...]`; dispara el enriquecimiento (sección 7).
4. Recién con `grupo` resuelto (paso 2) se habilitan tanto el formulario de otorgar como los intentos de carga del listado — ninguna de las dos secciones intenta operar con un `:id` inexistente.

---

## 6. Flujo de otorgamiento

1. El `ADMINISTRADOR` escribe un email en el campo de búsqueda (único campo — sin alternativa de UUID en la interfaz, aunque el backend la admite; mantiene el formulario simple, coherente con la recomendación ya hecha en el diseño general de 10.4, sección 9).
2. Click en "Buscar" → `resolverAccion.run(() => api.get(".../usuarios/resolver", { params: { email } }))`.
   - `404` genérico → se muestra el mensaje del backend tal cual (`resolverAccion.error`), sin distinguir motivo — mismo criterio de seguridad ya establecido en 10.4.a.
   - Éxito → se guarda el candidato resuelto (`{id, nombre, email, organizacionId, nombreOrganizacion}`) en un estado local (`candidato`); se muestra una tarjeta de confirmación con esos datos y un botón "Otorgar acceso".
3. Click en "Otorgar acceso" → `useConfirm()`, severidad `"medium"`, mensaje con `candidato.nombre` y `candidato.nombreOrganizacion` (ej. `"¿Otorgar acceso a Juan Pérez (Organización B)?"`).
4. Si cancela: no pasa nada, el candidato resuelto sigue visible (permite reconsiderar sin tener que buscar de nuevo).
5. Si confirma: `otorgarAccion.run(() => api.post(".../accesos", { usuarioId: candidato.id }))`.
   - Error (ej. "ya tiene acceso otorgado", "usuario inactivo", "no pertenece a este grupo económico" — mensajes reales ya existentes en `otorgar()`) → mostrado tal cual, `candidato` se mantiene visible para que el `ADMINISTRADOR` entienda a quién se refiere el error.
   - Éxito → se limpia el campo de email y el `candidato` resuelto; se recarga el listado de accesos (paso 3 de la sección 5); mensaje de éxito breve (`useAsyncAction`'s `successMessage`).

---

## 7. Flujo de listado (con enriquecimiento)

1. Tras cargar `accesos` (sección 5, paso 3), un `useEffect` calcula los `usuarioId` únicos que todavía no están en `enriquecidos` y dispara, en paralelo, una resolución por cada uno: `GET .../usuarios/resolver?usuarioId=X`.
2. Cada resolución exitosa agrega `enriquecidos[usuarioId] = { nombre, email, nombreOrganizacion }`. Cada fallo agrega `enriquecidos[usuarioId] = null` (marca explícita de "no resoluble", distinta de "todavía no se intentó").
3. La tabla se renderiza con lo que haya en `enriquecidos` en cada momento — una fila cuyo `usuarioId` todavía no resolvió muestra un placeholder de carga (`"Resolviendo..."`); una fila con `enriquecidos[usuarioId] === null` muestra un placeholder neutral (`"Usuario no disponible"`) en vez de bloquear el resto de la tabla o mostrar el UUID crudo.
4. La columna "Otorgado por" no depende de este enriquecimiento — se resuelve de forma síncrona y local (sección 4).
5. Tras un otorgamiento o una revocación exitosos, se vuelve a pedir `GET .../accesos` completo — cualquier `usuarioId` ya presente en `enriquecidos` **no** se vuelve a resolver (el mapa persiste entre recargas del listado dentro de la misma sesión de pantalla), evitando resoluciones repetidas del mismo usuario.

**Revocación**, dentro de la misma tabla:
1. Botón "Revocar" por fila (deshabilitado mientras `filaAccion.busy`, igual que en `Usuarios.tsx`).
2. `useConfirm()`, severidad `"high"`, mensaje con el nombre ya enriquecido del destinatario si está disponible, o un texto genérico ("este acceso") si `enriquecidos[usuarioId]` es `null` o todavía no resolvió.
3. Si confirma: `filaAccion.run(() => api.delete(".../accesos/:accesoId"))` → éxito recarga el listado; error se muestra dentro de la tarjeta de "Accesos vigentes".

---

## 8. Estados de UI

| Estado | Comportamiento |
|---|---|
| Cargando el grupo (bootstrap) | `"Cargando..."`, sin ninguna otra sección visible todavía. |
| Error al cargar el grupo | `error-banner` con el mensaje del backend; ni formulario ni tabla se muestran. |
| Sin grupo económico (`grupo === null`) | Mensaje único, claro: `"Tu organización no pertenece a ningún grupo económico."` — sin formulario, sin tabla, sin ningún control interactivo. |
| Grupo resuelto | Título + línea de contexto (`Grupo: {nombre}`, sección 3) + las dos secciones funcionales. |
| Cargando el listado de accesos | `"Cargando..."` dentro de la tarjeta de "Accesos vigentes" (el formulario de otorgar ya está disponible en paralelo). |
| Listado vacío | `"No hay accesos otorgados todavía."` dentro de la tarjeta — mensaje distinto al de "sin grupo económico". |
| Error al cargar el listado | `error-banner` dentro de la tarjeta; el formulario de otorgar sigue funcional. |
| Buscando candidato | Botón "Buscar" deshabilitado mientras `resolverAccion.busy`. |
| Candidato no encontrado | Mensaje genérico del backend, mostrado junto al campo de búsqueda. |
| Candidato resuelto | Tarjeta de confirmación con nombre/email/organización + botón "Otorgar acceso". |
| Otorgando en curso | Botón "Otorgar acceso" deshabilitado mientras `otorgarAccion.busy`. |
| Fila resolviendo enriquecimiento | Placeholder `"Resolviendo..."` en las celdas de destinatario. |
| Fila sin poder enriquecer | Placeholder `"Usuario no disponible"`, sin bloquear el resto de la tabla. |
| Revocando en curso | Todos los botones "Revocar" deshabilitados mientras `filaAccion.busy` (mismo criterio que `Usuarios.tsx`). |

---

## 9. Confirmaciones

- **Otorgar acceso:** `useConfirm()`, `severity: "medium"`, mensaje con nombre y organización del candidato ya resuelto.
- **Revocar acceso:** `useConfirm()`, `severity: "high"`, mensaje con el nombre ya enriquecido del destinatario (o texto genérico si no se pudo enriquecer).
- Ninguna otra acción de esta pantalla requiere confirmación (buscar candidato es una consulta, no una escritura).

---

## 10. Manejo de errores

Mismo criterio ya vigente en todo el proyecto (`DISENO_BLOQUE10.4_FRONTEND.md`, sección 13, y `DECISIONES_TECNICAS_BLOQUE10.4b.md`, Decisión 3): **todos los mensajes de error se muestran tal cual los devuelve el backend, sin traducción ni texto de UI propio**, salvo los tres estados de frontend que no vienen de una respuesta del backend (placeholders de "Resolviendo...", "Usuario no disponible", "Tu organización no pertenece a ningún grupo económico" — este último sí es texto propio porque `grupo === null` no es un error, es una respuesta exitosa con cuerpo vacío, y merece una redacción propia distinta de un mensaje de error genérico).

---

## 11. Contratos consumidos (fuente: `ACTA_CIERRE_BLOQUE10.4a.md`, código real — no `usuarios/buscar`)

| Endpoint | Uso en esta pantalla |
|---|---|
| `GET /grupo-economico` | Bootstrap — obtiene `id` y `nombre` del grupo. |
| `GET /grupo-economico/:id/accesos` | Listado de accesos vigentes. |
| `POST /grupo-economico/:id/accesos` | Otorgamiento (`{ usuarioId }`). |
| `DELETE /grupo-economico/:id/accesos/:accesoId` | Revocación. |
| `GET /grupo-economico/:id/usuarios/resolver` | Resolución del candidato a otorgar (por `email`) y enriquecimiento de cada fila del listado (por `usuarioId`). |

---

## 12. Estructura de datos de frontend

```ts
type Grupo = { id: string; nombre: string; organizaciones: { id: string; nombre: string }[] } | null;
// undefined implícito (estado inicial de useState) = todavía no se resolvió el bootstrap

type Acceso = { id: string; usuarioId: string; otorgadoPorId: string; createdAt: string };

type Candidato = { id: string; nombre: string; email: string; organizacionId: string; nombreOrganizacion: string };

type Enriquecidos = Record<string, Candidato | null>; // null = no resoluble, clave ausente = todavía no se intentó
```

Ninguna de estas formas se persiste en `localStorage` — mismo criterio ya establecido en 10.4.b para `organizaciones-accesibles` (es una consulta, no un dato de sesión).

---

## 13. Archivos previstos a modificar o crear

**Nuevo:**
- `frontend/src/pages/GrupoEconomico.tsx`.

**Modificados:**
- `frontend/src/App.tsx` — nueva ruta `/administracion/grupo-economico`.
- `frontend/src/components/Layout.tsx` — nuevo ítem en `NAV_ITEMS`.

**Sin cambios (confirmado explícitamente, no se tocan):**
- Cualquier archivo de backend.
- `AuthContext.tsx`, `api/client.ts`, `ConfirmDialog.tsx`, `useAsyncAction.ts` — ya cubren lo necesario.
- `AuditoriaAdministrativa.tsx` — ya genérica, sin cambios.
- `Usuarios.tsx`, `Organizacion.tsx`, `ViajeForm.tsx` — sin relación con este sub-bloque.

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `N` llamadas paralelas de enriquecimiento (`usuarios/resolver` por cada `usuarioId` único del listado) | Volumen esperado bajo (accesos cross-organización dentro de un mismo grupo económico, ya señalado en la auditoría) — sin paginación en el backend tampoco, consistente con la misma expectativa de escala. Si el volumen creciera de forma relevante en el futuro, ameritaría su propio hallazgo, fuera de este alcance. |
| Un `usuarioId` deja de poder resolverse (ej. usuario desactivado después de otorgado el acceso) | Placeholder neutral (`"Usuario no disponible"`), sin bloquear el resto de la tabla ni mostrar el UUID crudo. |
| Candidato resuelto pero el otorgamiento falla después (ej. otro `ADMINISTRADOR` ya le otorgó acceso mientras tanto) | Se muestra el error real del backend; el candidato resuelto permanece visible para que quede claro a quién se refiere — mismo criterio ya usado en 10.4.b para errores de `cambiarOrganizacion()`. |
| Dos administradores operando el mismo grupo desde sesiones distintas, datos desactualizados momentáneamente | Riesgo aceptado, mismo criterio que el resto del proyecto — el backend revalida todo en cada operación real (`otorgar()`/`revocar()` ya lo hacían desde 10.3.a), el frontend nunca asume que un listado ya cargado sigue vigente. |
| Mostrar `"Grupo: {nombre}"` termina, en la práctica, funcionando como una tercera sección informal | Mitigado por tratamiento tipográfico deliberadamente secundario (`.muted`, sin tarjeta propia, sin datos adicionales como `organizaciones`) — ver también pregunta 2, sección 15, para confirmación explícita. |

---

## 15. Criterios de aceptación

- Un `ADMINISTRADOR` de una organización sin grupo económico ve únicamente el estado vacío — sin formulario, sin tabla.
- Un `ADMINISTRADOR` de una organización con grupo pero sin accesos otorgados ve el formulario de otorgar y la tabla con su mensaje de vacío correspondiente (distinto del de "sin grupo").
- Resolver un email válido de otra organización del mismo grupo muestra el candidato correcto; confirmar y otorgar agrega la fila nueva al listado (tras recarga) con el nombre correctamente enriquecido.
- Resolver un email inválido — inexistente, inactivo, de la propia organización, o de otro grupo — muestra el mismo mensaje genérico en los cuatro casos, sin distinción observable.
- Revocar un acceso, tras confirmar, lo quita del listado (tras recarga).
- Cancelar cualquier confirmación no ejecuta ninguna llamada de escritura.
- Un usuario no-`ADMINISTRADOR` no puede ver ninguna parte de la pantalla, ni por navegación directa a la URL.
- La columna "Otorgado por" muestra siempre "Vos" u "Otro administrador de tu organización" — nunca un UUID, nunca un nombre no confirmado por el backend.
- Ningún dato de otra organización ajena al grupo económico del actor aparece en ningún momento.
- Regresión: `Usuarios.tsx`, `AuditoriaAdministrativa.tsx`, `Organizacion.tsx`, el selector de organización de 10.4.b, y el resto del frontend siguen funcionando sin cambios observables.

---

## 16. Preguntas que requieren decisión del Product Owner

1. **Redacción exacta de la línea de contexto del grupo** (sección 3): `"Grupo: {nombre}"` es una propuesta de este diseño, no una decisión ya fijada en ningún documento previo — ¿se aprueba esa redacción/tratamiento visual, o se prefiere omitir por completo cualquier mención al grupo en pantalla (mostrando únicamente las dos secciones funcionales, sin ningún dato del grupo en sí)?
2. **Redacción exacta de las etiquetas de "Otorgado por"** (sección 4): `"Vos"` / `"Otro administrador de tu organización"` son una propuesta de este diseño para resolver la Tensión 2 sin ampliar el backend — ¿se aprueban esos textos, o se prefiere alguna otra redacción (ej. omitir la columna por completo en vez de mostrar una etiqueta genérica)?
3. **Placeholder ante un `usuarioId` no resoluble en el listado** (sección 7): `"Usuario no disponible"` — ¿se aprueba, o se prefiere otra redacción, o mostrar el UUID crudo como último recurso para que un `ADMINISTRADOR` pueda al menos identificar la fila manualmente?
4. **Único campo de búsqueda por email en el formulario de otorgar** (sección 6): el backend admite resolver también por `usuarioId` exacto, pero este diseño propone exponer únicamente el campo de email en la interfaz, por simplicidad — ¿se confirma, o se prefiere ofrecer también un campo alternativo de UUID para casos donde el `ADMINISTRADOR` ya conoce el id exacto?

Ninguna de las cuatro reabre una decisión ya aprobada de Bloques 10.1 a 10.4.b — las cuatro son detalles de redacción/UX derivados directamente de la resolución de las dos tensiones que esta auditoría identificó, sin alternativa arquitectónica de fondo.

---

## Resumen

Diseño completo de una pantalla nueva y única (`GrupoEconomico.tsx`), sin cambios de backend, que resuelve las dos tensiones detectadas por la auditoría: `GET /grupo-economico` queda como paso técnico de bootstrap (una línea de contexto, no una sección), y `otorgadoPorId` se representa con una comparación local contra la identidad del `ADMINISTRADOR` actual (`"Vos"` / `"Otro administrador de tu organización"`), sin necesitar ningún endpoint nuevo. El listado enriquece cada destinatario en paralelo contra `usuarios/resolver`, con degradación explícita (`"Usuario no disponible"`) si algún `usuarioId` deja de poder resolverse. Quedan cuatro preguntas de redacción/UX para tu decisión — ninguna reabre arquitectura ya aprobada.

No se escribió código, no se modificó ningún archivo existente, no se hizo git add/commit/push. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier decisión técnica guiada o implementación.

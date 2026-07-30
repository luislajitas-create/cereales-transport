# VIAJES 2.0 — LISTADO OPERATIVO
## Bloque L3: Persistencia del contexto del listado — Auditoría y diseño

**Tipo:** Auditoría + propuesta técnica. Sin implementación, sin commits, sin push.

**Base:** continúa `AUDITORIA_VIAJES2.0_LISTADO.md`, hallazgo H-11 ("Filtros no persisten al volver de un Detalle") y línea L9 de su roadmap. Este documento reemplaza/detalla esa línea con el análisis pedido explícitamente en este bloque.

**Alcance:** exclusivamente `Viajes.tsx`, `ViajeDetalle.tsx`, navegación con React Router (incluyendo, como contexto necesario para entender el problema real, el link fijo de la barra lateral en `Layout.tsx` — se documenta su comportamiento, no se propone modificarlo todavía), estado de filtros/búsqueda, historial del navegador y scroll. No se tocó ni se analizó backend, Liquidaciones, Facturas, Anticipos, filtros nuevos, acciones rápidas ni paginación.

---

## 1. Comportamiento actual

**Dónde vive el estado hoy:** únicamente en `useState` local de `Viajes.tsx:12` (`filtros = { desde, hasta, clienteId, estado, q }`), inicializado siempre a valores vacíos. No hay querystring, `sessionStorage`, ni estado global involucrado en ningún punto.

- **Filtros de fecha, Cliente, Estado, búsqueda `q`:** se aplican solo al hacer clic en "Filtrar" (`Viajes.tsx:76`, `onClick={cargar}`) y se pierden por completo en cualquier remontaje del componente — no importa si el remontaje ocurre por volver desde un Detalle, por refrescar la página, o por navegar a otra pantalla y regresar. `useEffect(() => { cargar(); ... }, [])` (`Viajes.tsx:26-29`) solo corre una vez por montaje, siempre con `filtros` en su estado inicial vacío.
- **Scroll:** sin ningún manejo explícito en ninguno de los dos archivos. React Router v6 con `<Routes>/<Route>` clásico (confirmado en `App.tsx` — este proyecto no usa `createBrowserRouter` ni `<ScrollRestoration>` de las Data APIs) no restaura posición de scroll entre navegaciones SPA. Un refresh completo del navegador sí puede restaurar scroll de forma nativa (comportamiento del navegador sobre la misma URL), pero eso es independiente de React.
- **Botón "Volver":** `ViajeDetalle.tsx` **no tiene ningún control explícito para volver al listado** — ni un link a `/viajes`, ni `navigate(-1)`. Las únicas formas de salir de la pantalla de Detalle son: (a) el botón "atrás" nativo del navegador, (b) el link "Viajes" de la barra lateral, o (c) navegar manualmente a otra URL.
- **El link de la barra lateral no preserva nada:** `Layout.tsx:9` — `{ to: "/viajes", label: "Viajes", roles: null }` — es una ruta fija, sin querystring ni `state`. Es la vía más probable por la que un operador "vuelve" al listado (más natural que el botón atrás del navegador), y **hoy siempre lleva a un listado sin filtros**, sea cual sea el mecanismo de persistencia que se elija: si el mecanismo fuera solo "la URL con querystring", este link seguiría sin llevarlos porque su `to` es un string fijo sin parámetros.
- **Navegación directa a `/viajes`** (escribir la URL, recargar, abrir en pestaña nueva) y **"volver" desde un Detalle** son, hoy, exactamente el mismo caso desde el punto de vista del componente: un montaje nuevo de `Viajes.tsx` con `filtros` vacío. No hay ninguna distinción posible en el código actual entre ambos escenarios.
- **Botón atrás del navegador:** no tiene ningún efecto distinto a una navegación directa hoy, porque no existe ningún dato de filtros en la URL ni en ningún almacenamiento — remonta `Viajes.tsx` igual que si fuera la primera visita.

---

## 2. Alternativas técnicas

### a) Query parameters en la URL (`useSearchParams`)

Ya hay precedente directo en este mismo proyecto: `Catalogos.tsx` usa `useSearchParams()` para leer `?tab=` al montar y preseleccionar una pestaña — mismo mecanismo, sin dependencias nuevas.

- **Ventajas:** la URL es la única fuente de verdad — compartible, "favoriteable", y es la **única alternativa que sobrevive a un refresh real** (F5 vuelve a pedir la misma URL con el mismo querystring). Funciona igual al abrir el link en una pestaña nueva (cada pestaña tiene su propia URL independiente).
- **Riesgos:** si cada cambio de filtro escribiera una entrada nueva al historial del navegador, el botón "atrás" quedaría "atascado" deshaciendo cambios de filtro uno por uno en vez de volver a la pantalla anterior real — mitigable usando `navigate(..., { replace: true })` al sincronizar la URL, de forma que solo quede una entrada de historial por "visita" al listado, no una por cada clic en "Filtrar".
- **Comportamiento con refresh:** correcto — es la única alternativa que preserva el estado.
- **Comportamiento en pestaña nueva:** correcto — reproduce exactamente el mismo contexto, sin interferencia entre pestañas.
- **Mantenibilidad:** alta — es texto declarativo en la URL, sin necesidad de limpiar nada al desmontar.
- **Limitación ya identificada en §1:** no cubre por sí sola el caso "volver por la barra lateral", porque ese link no lleva querystring.

### b) `location.state`

Ya usado en este mismo proyecto (`ViajeForm.tsx` → `ViajeDetalle.tsx`, mensaje "✅ Viaje creado correctamente.").

- **Ventajas:** cero cambios visibles en la URL; mecanismo ya conocido en el código.
- **Riesgos:** **se pierde en un refresh** — confirmado y ya documentado como comportamiento esperado para el caso "creado" (`ViajeDetalle.tsx:18-21`). Tampoco sobrevive a abrir en una pestaña nueva (no hay URL que llevarse). Hoy nadie navega "hacia" el listado con contexto — el flujo real es "el usuario simplemente vuelve", no "algo lo empuja de vuelta con datos".
- **Mantenibilidad:** buena para un dato puntual que se consume una sola vez (como ya se usa), frágil como mecanismo principal para el estado completo de una pantalla de listado que además debe sobrevivir a que el usuario visite varios Viajes en sucesión.

### c) `sessionStorage`

- **Ventajas:** sobrevive a un refresh (a diferencia de `location.state`) y sobrevive a la navegación por la barra lateral (a diferencia de la URL sola).
- **Riesgos:** **no es compartible ni bookmarkeable.** Se comparte entre todas las pestañas del mismo origen — si el usuario tiene el listado abierto en dos pestañas con filtros distintos, la que se abre/actualiza después podría "heredar" el contexto de la otra en vez de mantener el propio (ver Casos límite, "Múltiples pestañas"). Requiere lógica imperativa explícita de cuándo escribir y cuándo limpiar.
- **Mantenibilidad:** media — menos declarativo que la URL, hay que acordarse de sincronizar en los puntos correctos.

### d) Estado global (Context/Redux/similar)

Este proyecto no usa ninguna librería de estado global — solo `Context` puntual (`AuthContext`, `ConfirmDialog`).

- **Ventajas:** en teoría, ningún acoplamiento con la URL.
- **Riesgos:** se pierde en un refresh igual que `location.state` (vive en memoria de JS) — no aporta nada sobre `sessionStorage` en ese aspecto, y suma la complejidad de introducir un mecanismo nuevo en el proyecto solo para este caso.
- **Mantenibilidad:** la más baja de las cuatro para este problema puntual — no se justifica frente a las otras tres.

### e) Comparativa resumida

| Alternativa | Refresh | Pestaña nueva | Barra lateral | Botón atrás | Compartible/bookmarkeable |
|---|---|---|---|---|---|
| URL (query params) | ✅ | ✅ | ❌ (link fijo, sin querystring) | ✅ (con `replace` bien usado) | ✅ |
| `location.state` | ❌ | ❌ | ❌ | Parcial (depende de si hay `state` en esa entrada de historial) | ❌ |
| `sessionStorage` | ✅ | ⚠️ compartido entre pestañas | ✅ | ✅ | ❌ |
| Estado global | ❌ | ❌ | ✅ (mientras la pestaña siga viva) | ✅ | ❌ |

---

## 3. Diseño recomendado

**Combinación mínima: URL (query params) como fuente de verdad de los filtros + `location.state` puntual para el link "Volver" de `ViajeDetalle.tsx`.** Sin `sessionStorage`, sin estado global.

**Por qué esta combinación y no otra:**
- La URL es la única alternativa que cubre refresh, pestaña nueva y bookmarking a la vez, sin introducir ningún mecanismo nuevo en el proyecto (mismo patrón que `Catalogos.tsx`).
- El caso débil de la URL sola (el link fijo de la barra lateral, §1) no se resuelve agregando `sessionStorage` en paralelo — eso introduciría dos fuentes de verdad que podrían desincronizarse (¿cuál gana si la URL dice una cosa y el `sessionStorage` otra?). Se resuelve de forma más simple: dándole a `ViajeDetalle.tsx` un link explícito "← Volver al listado" que la propia navegación desde el listado le entrega vía `location.state` — sin que `ViajeDetalle.tsx` necesite conocer la estructura de los filtros, solo la URL completa como string.
- Es la combinación de menor esfuerzo y menor cantidad de mecanismos nuevos: reutiliza `useSearchParams` (ya usado en `Catalogos.tsx`) y `location.state` (ya usado en el propio `ViajeDetalle.tsx`).

**Diseño concreto (sin implementar en este bloque):**
1. `Viajes.tsx` inicializa `filtros` leyendo `useSearchParams()` en vez de un objeto vacío fijo.
2. Al hacer clic en "Filtrar" (mismo botón existente — sin auto-búsqueda ni debounce, fuera de alcance), además de `cargar()`, se sincroniza la URL con `setSearchParams(filtros, { replace: true })`. `replace: true` evita que cada clic en "Filtrar" ensucie el historial del navegador (mitiga el riesgo de la alternativa (a) en §2).
3. El `<Link>` de cada fila hacia el Detalle (`Viajes.tsx:97`) pasa la URL actual del listado (`location.pathname + location.search`) como `state`, para que `ViajeDetalle.tsx` sepa "a dónde volver" sin necesidad de conocer la forma de los filtros.
4. `ViajeDetalle.tsx` agrega un link "← Volver al listado": usa ese `state` si está presente, o cae a `/viajes` (sin filtros) si no lo está — cubre tanto el caso normal (vino del listado) como el caso "Detalle abierto desde otro lado" (ver §4).
5. **Scroll: no se propone ningún mecanismo nuevo en la v1.** React Router v6 con `<Routes>` clásico no tiene restauración de scroll incorporada; implementarla a mano requiere capturar la posición antes de navegar, guardarla en algún lado, y restaurarla después de que la tabla haya terminado de renderizar con los datos correctos (no antes) — complejidad no trivial para un beneficio secundario frente al problema principal (perder filtros/búsqueda). Se documenta como decisión consciente de alcance, no como omisión, y queda disponible como paso opcional futuro si se pide explícitamente después de validar el resto.

---

## 4. Casos límite

| Caso | Comportamiento con el diseño propuesto |
|---|---|
| **Acceso directo a `/viajes`** (sin querystring) | `useSearchParams()` devuelve todo vacío — idéntico al comportamiento actual, sin cambios ni regresiones. |
| **Detalle abierto desde otra pantalla** (sin pasar por el listado) | No hay `location.state` con la URL de origen — el link "Volver" cae al fallback `/viajes` sin filtros, exactamente el comportamiento actual generalizado, no una regresión. |
| **Recarga del navegador sobre el listado ya filtrado** | Con la URL como fuente de verdad, el F5 preserva los filtros — **mejora directa** sobre el comportamiento actual (hoy F5 siempre limpia todo). |
| **Recarga del navegador sobre el Detalle** | El link "Volver" depende de `location.state`, que se pierde en un F5 (mismo comportamiento ya aceptado hoy para el mensaje "creado"). Tras un F5 en el Detalle, "Volver" cae al fallback `/viajes` sin filtros — limitación conocida y aceptada de la v1, no se resuelve en este diseño (requeriría sumar `sessionStorage` para un caso de uso secundario). |
| **Filtros inválidos o antiguos en la URL** (p. ej. `clienteId` de un cliente dado de baja, o un valor de `estado` que ya no exista) | El backend ya maneja esto de forma segura hoy: un `clienteId` inexistente simplemente no matchea ningún Viaje (resultado vacío, no error). No es un caso nuevo introducido por este diseño — es el mismo comportamiento que ya existe con cualquier filtro manual mal formado. No se propone validación adicional (fuera de alcance: backend). |
| **Múltiples pestañas** | Cada pestaña tiene su propia URL independiente — sin interferencia entre pestañas. Es una ventaja de este diseño frente a la alternativa `sessionStorage` (§2c), que sí se comparte entre pestañas del mismo origen. |
| **Edición y regreso al Detalle/Listado** | `ViajeForm.tsx` en modo edición ya navega de vuelta a `/viajes/:id` (no al listado) tras guardar — sin cambios ni interacción con este diseño. Si desde ahí el usuario hace clic en "Volver al listado", usa el mismo `location.state` que ya traía el Detalle desde que se entró originalmente desde el listado (si fue así) — sin lógica adicional necesaria. |

---

## Riesgos

- **Historial de navegador "sucio"** si no se usa `replace: true` consistentemente al sincronizar filtros con la URL — mitigado explícitamente en el diseño (§3, punto 2).
- **Desincronización nula por diseño:** al no combinar URL con `sessionStorage`, no existe el riesgo de "dos fuentes de verdad en conflicto" que sí tendría esa alternativa.
- **Cobertura parcial e intencional:** el diseño no cubre "F5 sobre el Detalle preserva el 'Volver' filtrado" — es una limitación conocida, documentada, y aceptada por alcance/esfuerzo, no un descuido.
- **Dependencia de que el desarrollador recuerde propagar `state` en cada punto de navegación hacia el Detalle** que deba ofrecer "Volver" — hoy solo existe un punto (`Viajes.tsx:97`), así que el riesgo es bajo, pero si en el futuro se agregan más lugares que linkeen a `/viajes/:id` (fuera de alcance de este bloque), cada uno debería decidir conscientemente si participa de este mecanismo o no.

---

## Plan de implementación incremental (para el próximo bloque, sujeto a aprobación)

| Paso | Contenido | Resultado observable |
|---|---|---|
| **1** | `Viajes.tsx` lee `filtros` inicial desde `useSearchParams()` en vez de un objeto vacío fijo | Acceso directo a `/viajes?estado=PENDIENTE&...` ya preselecciona esos filtros (sin sincronizar la URL todavía al hacer clic en "Filtrar") |
| **2** | Al hacer clic en "Filtrar", sincronizar la URL con `setSearchParams(filtros, { replace: true })` | F5 sobre un listado ya filtrado preserva los filtros |
| **3** | El `<Link>` de cada fila pasa `location.pathname + location.search` como `state` al navegar al Detalle | Sin efecto visible todavía (el dato viaja, pero nadie lo usa hasta el paso 4) |
| **4** | `ViajeDetalle.tsx` agrega el link "← Volver al listado", usando el `state` recibido con fallback a `/viajes` | Volver desde el Detalle restaura exactamente los filtros/búsqueda con los que se entró |
| **5 (opcional, evaluar aparte)** | Restauración de posición de scroll | Solo si se pide explícitamente tras validar los pasos 1-4 en uso real |

Los pasos 1-4 son pequeños y están estrechamente relacionados — pueden implementarse y validarse como una sola unidad de trabajo o en sub-pasos, según se prefiera al aprobar.

---

**Fin del diseño del Bloque L3. Sin cambios de código. Sin commits. Sin push. Queda a la espera de aprobación antes de implementar.**

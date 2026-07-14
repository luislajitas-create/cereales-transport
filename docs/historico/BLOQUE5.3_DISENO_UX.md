# Bloque 5.3 — Diseño Técnico: UX y Consistencia Visual

Fecha: 2026-07-08. Documento de diseño puro — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se hizo commit. Responde a `BLOQUE5.3_AUDITORIA_UX.md`, con el mismo nivel de rigor que los diseños de los Bloques 3-5. Es puramente frontend: **ningún hallazgo de este bloque requiere cambios de schema, migración, ni endpoint nuevo** — todo el backend necesario (RBAC, soft-delete, anulación de cobranzas, etc.) ya existe desde los Bloques 4-5.2.

---

## 0. Puntos de decisión de negocio previos a estimar (no técnicos)

Dos hallazgos de la auditoría no se pueden diseñar en detalle sin una respuesta de negocio primero — se señalan acá, antes del resto del documento, para no forzar una estimación sobre una pregunta sin responder:

1. **¿Hay o va a haber uso real desde tablet/mobile de este sistema (UX-26)?** Si la respuesta es no, el hallazgo pasa a P3/no-hacer indefinidamente — el sidebar fijo y la ausencia de `@media` no son un problema para un uso 100% de escritorio. Si la respuesta es sí, es un rediseño de layout no trivial (toca `Layout.tsx`, `styles.css` completo) que conviene planificar como su propio sub-bloque, no como un quick-fix.
2. **¿Hay requisito normativo o de política interna de accesibilidad (UX-23/UX-25)?** Si no lo hay, se recomienda igual resolver `UX-24` (asociar `label`/`input`) porque es barato y mejora la usabilidad real incluso sin lector de pantalla (clic en la etiqueta enfoca el campo). El resto (`aria-live`, gestión de foco) es esfuerzo no trivial que solo se justifica con un requisito concreto.

El resto del documento asume que ambas preguntas están **pendientes** y diseña todo lo demás sin depender de sus respuestas.

---

## 1. Principios de diseño transversales

1. **Un componente/hook por problema recurrente, no N parches por pantalla.** Los tres hallazgos P0 y varios P1 son la misma causa raíz repetida 6-8 veces (falta de confirmación, falta de estado busy, falta de feedback de éxito). Se diseñan como piezas compartidas en vez de resolverse pantalla por pantalla.
2. **No introducir una librería externa.** El `package.json` actual no tiene ninguna dependencia de UI (sección 0 de la auditoría) — se mantiene esa decisión. Todo lo propuesto (diálogo de confirmación, banner de éxito, skeleton) es implementable con React + CSS plano, coherente con el resto de la aplicación.
3. **Reusar los patrones que ya funcionan (sección 2 de la auditoría) en vez de inventar nuevos.** El estado `busy` de `Conciliacion.tsx`/`descargar()` de Liquidaciones, el texto de ayuda de comisión precompletada, y las guardas condicionales de `Anticipos.tsx` son la plantilla, no un caso aparte.
4. **Backend ya listo, no se toca.** Cada hallazgo de "flujo incompleto" (UX-08, UX-09) es estrictamente frontend — el backend de Bloques 4-5.2 ya expone todo lo necesario.

---

## 2. Diseño por componente/decisión

### 2.1 `ConfirmDialog` — cierra UX-03

**Problema:** de 7 acciones destructivas/irreversibles, solo 2 tienen algún tipo de fricción (`window.prompt`), y ninguna distingue "irreversible" de "reversible pero costoso de deshacer".

**Alternativas evaluadas:**
- **A — Mantener `window.prompt` para todo.** Descartada: no permite mostrar contexto (número de liquidación, importe, a quién afecta), no se puede estilizar, y ya hoy solo 2 de 7 acciones lo usan — extenderlo a las 5 restantes solo perpetúa la inconsistencia visual con el resto de la app.
- **B — Un componente `ConfirmDialog` propio, con dos niveles de severidad (recomendada).**
  - **Nivel "medium"**: modal simple con título, mensaje de contexto (ej. "¿Anular la factura N° 0001-00012345 por $255.000? Esto revertirá 2 viajes a pendiente de facturar.") y dos botones (Cancelar / Confirmar). Para: Anular liquidación, Anular factura, Confirmar liquidación.
  - **Nivel "high"** (solo para "Marcar como pagada", la única acción genuinamente irreversible del sistema): mismo modal, más un campo de texto donde el usuario debe escribir una palabra de confirmación (ej. el número de liquidación) antes de habilitar el botón — mismo nivel de fricción deliberada que hoy tiene `window.prompt`, pero integrado visualmente y con contexto completo en pantalla.
  - Las dos acciones que ya usan `window.prompt` (Cancelar viaje, Anular anticipo) migran al mismo componente en su variante "medium" con un campo de texto **obligatorio** para el motivo (reemplaza el prompt nativo por un textarea dentro del modal, mismo requisito de negocio, mejor integración visual).

**API conceptual** (sin implementar): un hook `useConfirm()` que retorna una función `confirm({ title, message, severity, confirmLabel, requireMotivo, requireTypedValue }) => Promise<{ confirmed: boolean; motivo?: string }>`, más un `<ConfirmDialogHost />` montado una sola vez en `Layout.tsx` (o en `App.tsx`) que renderiza el modal activo. Cada página lo consume sin preocuparse por el markup del modal.

**Alcance de aplicación (7 sitios):** `ViajeDetalle.tsx` (cancelar), `Anticipos.tsx` (anular), `Liquidaciones.tsx` (confirmar, marcar como pagada [severity high], anular), `Facturas.tsx` (anular factura, anular cobranza una vez agregada por UX-09).

### 2.2 `useAsyncAction` — cierra UX-04

**Problema:** cada página reimplementa (o no implementa) `busy`/`disabled`/limpieza de error a mano, con resultados dispares.

**Diseño:** un hook `useAsyncAction()` que envuelve cualquier función async y expone `{ run, busy, error }`. `run` ejecuta la acción, fija `busy=true` durante el vuelo (bloqueando llamadas concurrentes — un segundo `run()` mientras `busy===true` se ignora, no se encola), limpia el `error` anterior al empezar, y lo vuelve a fijar solo si la promesa rechaza. Cada botón de escritura pasa a usar `disabled={busy}` y el texto condicional ya usado en `ViajeForm.tsx`/`Login.tsx` (`{busy ? "Guardando..." : "Guardar"}`).

**Alcance de aplicación:** todo botón identificado en UX-04 sin guard — "Registrar"/"Anular" en Anticipos; "Buscar candidatos"/"Crear liquidación"/"Confirmar"/"Marcar como pagada"/"Anular" en Liquidaciones; "Registrar cobranza"/"Anular factura" en Facturas; extensible a Clientes/Transportistas/Catalogos cuando se resuelva UX-08.

### 2.3 Banner de éxito — cierra UX-02

**Diseño:** la clase `.success-banner` ya existe en `styles.css:98` sin uso. Se propone un pequeño hook/componente `useFeedback()` (puede vivir junto a `useAsyncAction`, o combinarse en un único hook `useAsyncAction` que además acepte un `successMessage`) que, al completarse una acción con éxito, muestra el banner verde con un mensaje explícito ("Cliente creado", "Liquidación anulada") durante unos segundos y luego se auto-oculta. Reemplaza el patrón actual de "la tabla se refresca y ya" en las ~20 acciones de escritura de la aplicación.

**Nota de diseño:** no se propone un sistema de toasts flotantes (esquina de la pantalla, apilables) — es una complejidad mayor (posicionamiento, cola, animaciones) no justificada por el volumen de acciones concurrentes de esta aplicación interna. Un banner inline en la misma posición que hoy ocupa `.error-banner` es consistente con el patrón visual ya establecido y de complejidad baja.

### 2.4 RBAC-UX — cierra UX-16

**Diseño:** extender el patrón ya usado en `Layout.tsx:22` (`items.filter((item) => !item.roles || item.roles.includes(usuario.rol))`) a nivel de componente dentro de cada página, no solo del sidebar. Se propone una función/hook simple `puedeMutar(usuario.rol, listaDeRolesPermitidos)` reutilizada para condicionar:
- El formulario "Nuevo cliente"/"Nuevo transportista" completo (ocultar, no solo deshabilitar — un formulario visible pero deshabilitado sin explicación es tan confuso como uno que falla al enviar).
- El botón "Editar" de comisión en `Transportistas.tsx`.
- Los formularios de alta en `Catalogos.tsx` (ya parcialmente resuelto porque la ruta completa está protegida en el sidebar, pero conviene el mismo tratamiento explícito dentro de la página para consistencia).

La matriz de roles a usar es exactamente la ya definida y aprobada en `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md` sección 2.1 (Clientes: `OPERACIONES`/`FACTURACION`/`ADMINISTRADOR`; Transportistas: `OPERACIONES`/`ADMINISTRADOR`; Choferes/comisión: `OPERACIONES`/`LIQUIDACIONES`/`ADMINISTRADOR`) — no se re-decide acá, solo se refleja en el frontend lo que el backend ya exige.

**Alternativa evaluada:** ocultar el link del sidebar en vez de condicionar el formulario. Se descarta como solución única porque `/clientes` y `/transportistas` deben seguir siendo *visibles* (todos los roles pueden **ver** el listado, ver sección 2.1 de `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md`) — el problema no es el acceso a la página sino la exposición del formulario de alta a quien no puede usarlo.

### 2.5 Flujos incompletos: edición/baja de catálogos y anulación de cobranza — cierra UX-08, UX-09

**Diseño:** no es un componente nuevo, es aplicar el patrón ya validado en `Transportistas.tsx` (edición inline de comisión, líneas 109-141) a los campos editables de Cliente/Transportista, más un botón de "Dar de baja"/"Reactivar" condicionado a `activo`, con `ConfirmDialog` nivel "medium" antes de dar de baja (no hace falta confirmación para reactivar, es una acción de bajo riesgo).

Para Cobranzas (`Facturas.tsx`): agregar una columna "Estado" (mostrando `anulada`/vigente) y un botón "Anular" por fila, condicionado a `!c.anulada`, con `ConfirmDialog`. Esto depende de que el backend ya soporte el endpoint (lo hace, `f0e68a0`) — es una integración de UI pura, cero cambios de API.

**Nota de alcance:** no se diseña en este documento la UI de edición de datos personales de Chofer/Vehículo (licencia, patente, etc.) más allá de lo ya cubierto — coincide con el sub-bloque 5.6 del roadmap general (`ROADMAP_BLOQUE5.md`), que ya lo tenía identificado; este documento solo confirma el diseño de la interacción (inline + confirm) para cuando se aborde.

### 2.6 Badges por dominio — cierra UX-11

**Alternativas evaluadas:**
- **A — Una paleta más amplia de colores distintos para las ~17 combinaciones estado×dominio existentes.** Descartada: con 6 colores base en el token system (`--primary/--accent/--danger/--success/--warning` + gris neutro) no hay margen para 17 tonos distinguibles sin perder legibilidad ni coherencia con el resto de la paleta.
- **B — Espacio de nombres por dominio en CSS (recomendada).** En vez de `.badge.ASIGNADO` (namespace plano compartido por todos los dominios), usar `.badge.badge-viaje.ASIGNADO`, `.badge.badge-liquidacion.CONFIRMADA`, etc. — cada dominio define su propia paleta de 5-7 estados sin preocuparse por colisionar con otro dominio, porque nunca van a aparecer en la misma tabla. El componente que renderiza el badge simplemente agrega la clase de dominio correspondiente a la tabla que lo usa (ej. `Viajes.tsx` siempre usa `badge-viaje`, `Liquidaciones.tsx` siempre `badge-liquidacion`).

**Recomendación: alternativa B**, cero impacto en el HTML/JSX existente más allá de agregar una clase fija por página, y desbloquea usar cualquier color por dominio sin negociar con los demás.

### 2.7 Estado de carga / skeleton — cierra UX-01

**Diseño:** un componente `<TableLoadingRow colSpan />` (una fila con `colSpan` completo y un texto "Cargando..." o una barra de progreso simple) para el estado intermedio de las tablas, más el patrón ya usado en `Dashboard.tsx`/`Conciliacion.tsx` para pantallas no tabulares. Se propone un estado explícito de 3 vías por página: `cargando` (fetch inicial en curso) / `vacío` (fetch completo, cero resultados) / `con datos` — hoy la mayoría de las páginas solo distinguen 2 (implícitamente "sin datos" cubre ambos casos).

**No se propone un skeleton animado tipo shimmer** (esqueleto con forma de tabla) — es una complejidad visual mayor no justificada frente al beneficio marginal sobre un simple "Cargando..." consistente, dado el volumen de datos y la latencia esperada de esta aplicación.

### 2.8 Accesibilidad — cierra parcialmente UX-24 (fase inmediata), difiere UX-23/UX-25 (fase pendiente de decisión de negocio)

Independiente de la respuesta a la pregunta de la sección 0: se recomienda agregar `id`/`htmlFor` a los ~15 formularios de la aplicación de todas formas — es mecánico, de complejidad trivial, no tiene efecto visual (no requiere ningún rediseño) y mejora la usabilidad real (clic en la etiqueta enfoca el input) incluso sin ningún lector de pantalla de por medio. El resto (`aria-live`, roles ARIA, gestión de foco) se deja explícitamente pendiente de la decisión de negocio de la sección 0.

### 2.9 Responsive — diferido a decisión de negocio (sección 0)

No se diseña la solución completa en este documento. Si la respuesta de negocio es afirmativa, el diseño debería abordarse como su propio sub-bloque (fuera de este 5.3), dado que toca el layout global (`Layout.tsx`, sidebar) y no es una extensión incremental de los componentes ya propuestos acá.

### 2.10 Quick wins de consistencia visual (UX-05, UX-06, UX-13, UX-17, UX-18, UX-20, UX-21, UX-27)

Se agrupan porque son de complejidad trivial-baja e independientes entre sí — no requieren un componente nuevo, solo aplicar el patrón ya existente en otro punto de la misma aplicación:
- **UX-05**: replicar el `<tr><td colSpan={N} className="muted">Sin registros.</td></tr>` ya usado en `Viajes.tsx:101`/`Liquidaciones.tsx:190` en las tablas anidadas de `ViajeDetalle.tsx`/`Transportistas.tsx`.
- **UX-06**: un `ErrorBoundary` de React envolviendo `<Outlet />` en `Layout.tsx`, más `<Route path="*" element={<NotFound />}>` en `App.tsx`.
- **UX-13**: usar `fmtMoney()` en `ViajeForm.tsx:175` en vez de `toLocaleString`.
- **UX-17**: un `<Link to="/viajes">← Volver</Link>` en el `page-header` de `ViajeDetalle.tsx`.
- **UX-18**: mover "Cancelar viaje" a un `actions-row` separado o con menor prominencia visual (ej. como link de texto en vez de botón lleno), manteniendo el `ConfirmDialog` de la sección 2.1.
- **UX-20**: texto auxiliar bajo cada select deshabilitado por dependencia, replicando `Liquidaciones.tsx:164-168`.
- **UX-21**: agregar `<label>` visible a los mini-formularios de `Transportistas.tsx` (además de resolver la asociación `htmlFor`/`id` de UX-24 en el mismo cambio).
- **UX-27**: un badge/etiqueta condicional `{!entidad.activo && <span className="badge inactivo-tag">Inactivo</span>}` junto al nombre en `ViajeDetalle.tsx` cuando corresponda.

---

## 3. Sistema de componentes propuesto (resumen)

| Componente/hook | Resuelve | Nuevo o extiende algo existente |
|---|---|---|
| `useConfirm()` + `<ConfirmDialogHost />` | UX-03 | Nuevo — primer modal real de la aplicación |
| `useAsyncAction()` | UX-04, base de UX-02 | Nuevo — generaliza el patrón ya usado ad hoc en `ViajeForm`/`Login`/`Conciliacion` |
| Banner de éxito (extensión de `useAsyncAction` o hook propio) | UX-02 | Extiende `.success-banner` (CSS ya existe, sin uso) |
| `puedeMutar(rol, permitidos)` | UX-16 | Nuevo — generaliza el filtro ya usado en `Layout.tsx:22` |
| `<TableLoadingRow />` / estado de 3 vías | UX-01 | Nuevo — generaliza el patrón de `Conciliacion.tsx` |
| Namespacing CSS `.badge-<dominio>` | UX-11 | Extiende `styles.css`, no rompe el `.badge` base |
| `<ErrorBoundary />` + ruta 404 | UX-06 | Nuevo |

Ningún componente depende de una librería externa nueva.

---

## 4. Migraciones necesarias

**Ninguna.** Este bloque es exclusivamente frontend — no toca `schema.prisma`, no agrega ni modifica endpoints, no requiere ningún cambio de base de datos. Los dos hallazgos que "consumen" funcionalidad de backend (UX-08, UX-09) usan endpoints que ya existen desde los Bloques 4.3/5.1/5.2.

---

## 5. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Sin ningún test automatizado de frontend (confirmado en la auditoría, `package.json` sin test runner), cualquier regresión de estos cambios solo se detecta manualmente | Media | El plan de pruebas (sección 6) es manual y exhaustivo por diseño; considerar el sub-bloque 5.10 del roadmap general (tests) antes o en paralelo si el volumen de cambios de frontend crece |
| 2 | Introducir `ConfirmDialog`/`useAsyncAction` en 7-10 puntos a la vez aumenta la superficie de cambio de una sola entrega | Media | Ver propuesta de sub-bloques (sección 8) — se recomienda no implementar todo 5.3 de una vez |
| 3 | Cambiar `window.prompt` (que bloquea el hilo del navegador, comportamiento nativo bien entendido) por un modal propio introduce un componente nuevo que debe manejar correctamente foco/teclado (Escape para cancelar, Enter para confirmar cuando aplica) para no ser un retroceso de usabilidad | Baja-media | Diseño explícito de estos comportamientos al implementar `ConfirmDialogHost`, aunque no se especifica el detalle de teclado en este documento (es un detalle de implementación, no de diseño de producto) |
| 4 | Reflejar permisos en el frontend (UX-16) sin mantenerlo sincronizado con la matriz real del backend generaría el mismo problema al revés (ocultar algo que sí está permitido) | Baja | Usar exactamente la matriz ya aprobada en `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md` §2.1 como única fuente de verdad, no redefinir una nueva en el frontend |

---

## 6. Plan de pruebas (manual — no existe test runner de frontend)

Dado que no hay Jest/Vitest/Testing Library instalado (confirmado en la auditoría), todo el plan de pruebas de este bloque es manual, con los 5 roles demo (`ADMINISTRADOR`, `LECTURA`, `OPERACIONES`, `LIQUIDACIONES`, `FACTURACION`) más `GERENCIA`, sobre el build local:

**P0 (por sub-bloque 5.3.1):**
1. `Liquidaciones.tsx`: abrir el detalle de cualquier liquidación → el encabezado muestra el número correcto (no "undefined").
2. Intentar "Marcar como pagada" → aparece el modal de confirmación con campo de texto obligatorio; cancelar no ejecuta nada; confirmar con el valor correcto sí ejecuta.
3. Intentar "Anular" (liquidación, factura) → aparece el modal de confirmación con el contexto correcto (número, importe, efecto); cancelar no ejecuta nada.
4. Doble clic rápido en "Registrar" (Anticipos), "Crear liquidación", "Registrar cobranza" → solo se crea un registro, el botón queda `disabled` durante el primer envío.

**P1 (por sub-bloque 5.3.2/5.3.3):**
5. Cada acción de creación/anulación exitosa muestra el banner verde con el mensaje correcto y se autooculta.
6. Cada listado muestra un estado de carga distinguible de "sin resultados" durante el fetch inicial (throttlear la red en devtools para verificarlo con latencia real).
7. Con rol `LECTURA`: `/clientes` y `/transportistas` no muestran el formulario de alta. Con rol `OPERACIONES`: sí lo muestran y funciona.
8. `Facturas.tsx`: el formulario de cobranza muestra el saldo pendiente antes de enviar; intentar cobrar de más muestra el error ya existente del backend con el mismo contexto visible.

**P2/P3 (por sub-bloque 5.3.4-5.3.6):**
9. Navegar a una URL inexistente dentro del layout autenticado → página de error 404, no pantalla en blanco.
10. Provocar un error de render (desconectar backend a mitad de sesión) → no pantalla en blanco total, hay algún mensaje de recuperación.
11. `ViajeDetalle.tsx` de un viaje cuyo chofer fue dado de baja (Bloque 5.2) → se ve el badge "Inactivo" junto al nombre del chofer.
12. Tablas anidadas vacías (transportista sin choferes, viaje sin historial) muestran el mensaje de vacío, no una tabla en blanco con encabezado.
13. Regresión visual: los badges de Viajes/Liquidaciones/Facturas en pantallas separadas siguen siendo legibles y no cambiaron su significado.

---

## 7. Plan de rollback

- Todo el frontend se despliega como build estático (confirmado por `railway.json`) — revertir es redeploy del commit anterior, sin ningún efecto sobre datos ni sobre el backend.
- Ningún cambio de este bloque toca la base de datos ni ningún contrato de API — el backend sigue funcionando idéntico independientemente de qué versión del frontend esté desplegada.
- Si se implementa por sub-bloques (sección 8), cada uno es revertible de forma independiente sin afectar a los demás.

---

## 8. Criterios de aceptación

1. `Liquidaciones.tsx` muestra el número de liquidación correctamente en el detalle (cierra UX-10).
2. Ninguna acción irreversible o financieramente destructiva se ejecuta sin un paso de confirmación explícito con contexto visible (cierra UX-03).
3. Ningún botón de escritura financiera permite un doble-submit exitoso (cierra UX-04).
4. Toda acción de escritura exitosa muestra una confirmación visual explícita (cierra UX-02).
5. Todo listado principal distingue visualmente "cargando" de "sin resultados" (cierra UX-01).
6. Los formularios de alta/edición de Clientes/Transportistas/comisión de Chofer están condicionados por rol, consistente con la matriz ya aprobada del Bloque 5.1 (cierra UX-16).
7. Clientes, Transportistas y Cobranzas tienen edición/baja/anulación accesible desde la UI, sin cambios de API (cierra UX-08, UX-09).
8. Los badges de estado no comparten color entre dominios distintos dentro de la misma vista (cierra UX-11).
9. Build y typecheck (`tsc -b`) limpios; el plan de pruebas manual de la sección 6 pasa en el entorno local.
10. Ningún hallazgo P0/P1 de `BLOQUE5.3_AUDITORIA_UX.md` queda sin resolver o sin justificación explícita de diferimiento.

---

## 9. Propuesta de sub-bloques

Dado el volumen (28 hallazgos), se recomienda **no implementar todo 5.3 de una sola vez** — mismo criterio ya usado exitosamente para dividir 5.1/5.2 en entregas más chicas.

**5.3.1 — Crítico (P0): bug + confirmaciones + doble-submit**
Corregir `numerl`; construir `ConfirmDialog`/`useConfirm` y aplicarlo a las 7 acciones destructivas/irreversibles; construir `useAsyncAction` y aplicarlo a Anticipos/Liquidaciones/Facturas. Esfuerzo: medio (2-3 días), es la base para todo lo demás.

**5.3.2 — Feedback (P1): loading + éxito + saldo de cobranza**
Estado de carga generalizado en las 7 pantallas sin él; banner de éxito reusando `useAsyncAction`; mostrar saldo pendiente en el formulario de cobranza. Depende de 5.3.1 (mismo hook). Esfuerzo: bajo-medio (1-2 días).

**5.3.3 — RBAC-UX (P1)**
Condicionar formularios de Clientes/Transportistas/comisión por rol según la matriz de Bloque 5.1. Independiente de 5.3.1/5.3.2, puede ir en paralelo. Esfuerzo: bajo (1 día).

**5.3.4 — Flujos incompletos (P1)**
Edición/baja/reactivación de Clientes/Transportistas; anulación de cobranza + estado visible en UI. Depende de 5.3.1 (usa `ConfirmDialog`/`useAsyncAction`). Esfuerzo: medio (2-3 días, varios formularios).

**5.3.5 — Quick wins P2/P3 (consistencia visual y navegación)**
Badges por dominio, `ErrorBoundary` + ruta 404, empty states anidados, `fmtMoney` uniforme, botón "volver", separación de botones de riesgo opuesto, texto de ayuda en selects dependientes, marca visual de catálogo inactivo, `label`/`htmlFor`. Todos independientes entre sí, se pueden tomar de a uno según disponibilidad. Esfuerzo: bajo-medio en conjunto (2-3 días si se hacen todos).

**5.3.6 — Accesibilidad avanzada y responsive (bloqueados por decisión de negocio, sección 0)**
No estimar en detalle hasta tener respuesta a las 2 preguntas de la sección 0.

**Orden recomendado:** 5.3.1 → (5.3.2 y 5.3.3 en paralelo) → 5.3.4 → 5.3.5 → 5.3.6 (condicionado a decisión de negocio).

No se implementó nada de este diseño — queda a la espera de tu revisión antes de tocar código.

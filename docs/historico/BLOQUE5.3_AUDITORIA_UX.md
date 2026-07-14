# Bloque 5.3 — Auditoría de UX y Consistencia Visual

Fecha: 2026-07-08. Documento de auditoría pura — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se hizo commit. Cubre el frontend completo (`frontend/src`): 12 páginas, `Layout.tsx`, `App.tsx`, `AuthContext.tsx`, `client.ts`, `styles.css`, `index.html`, `package.json`. Escrito con la misma vara que un Product Designer Senior y un Staff Frontend Engineer revisando un producto financiero antes de su salida a producción con dinero real.

---

## 0. Alcance y metodología

**Cubierto exhaustivamente** (lectura completa de cada archivo, no muestreo):
- Las 12 pantallas: Login, Dashboard, Viajes, ViajeForm, ViajeDetalle, Clientes, Transportistas, Catalogos, Anticipos, Liquidaciones, Facturas, Conciliación.
- Navegación (`Layout.tsx`, `App.tsx`), autenticación (`AuthContext.tsx`), cliente HTTP (`client.ts`), hoja de estilos completa (`styles.css`, 104 líneas, única fuente de estilos de toda la app).
- Búsqueda exhaustiva (no muestreo) de: `@media`, `aria-*`, `role=`, `tabIndex`, `alt=`, `window.confirm`, `window.prompt`, `Modal`/`dialog` en todo `frontend/src`.
- `package.json`: sin librería de componentes, sin librería de modales/toasts, sin framework de formularios, **sin ningún test runner instalado** (ni Jest ni Vitest ni Testing Library) — no hay forma de regresionar automáticamente ningún cambio de UI que se decida a partir de este documento.

**Fuera de alcance de este documento** (ya cubierto por auditorías previas, se referencia pero no se repite en detalle):
- Backend, seguridad, RBAC de API — cubierto en `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md`. Este documento solo audita el *reflejo en la UI* de esas reglas (hallazgo UX-16).
- Paginación/filtros backend, exports faltantes — ya en `ROADMAP_BLOQUE5.md` sub-bloque 5.9/5.6, se referencian cuando son la causa raíz de un síntoma visual pero no se re-auditan desde cero.

**Convención de prioridad:** P0 = bloqueante antes de un piloto con dinero real. P1 = alto impacto, encarar pronto. P2 = medio, mejora real pero no urgente. P3 = bajo, pulido.

---

## 1. Inventario de pantallas y patrones

| Pantalla | Ruta | Patrón de alta | Patrón de detalle | Roles con acceso (sidebar) |
|---|---|---|---|---|
| Login | `/login` | N/A | N/A | Público |
| Dashboard | `/` | N/A | N/A | Todos |
| Viajes (listado) | `/viajes` | Ruta dedicada (`/viajes/nuevo`) | Ruta dedicada (`/viajes/:id`) | Todos |
| ViajeForm | `/viajes/nuevo` | — | — | Todos (sin guard de ruta) |
| ViajeDetalle | `/viajes/:id` | — | — | Todos (sin guard de ruta) |
| Clientes | `/clientes` | Formulario embebido arriba de la tabla | Panel embebido debajo de la tabla (cuenta corriente) | Todos |
| Transportistas | `/transportistas` | Formulario embebido + mini-formularios anidados (chofer/vehículo) | Expandir/colapsar tarjeta in situ | Todos |
| Catalogos | `/catalogos` | Formulario embebido, genérico por tab | — | ADMINISTRADOR, OPERACIONES |
| Anticipos | `/anticipos` | Formulario embebido | — | ADMINISTRADOR, LIQUIDACIONES, OPERACIONES |
| Liquidaciones | `/liquidaciones` | Formulario embebido (búsqueda de candidatos → selección → crear) | Card embebida al final de la página | ADMINISTRADOR, LIQUIDACIONES, GERENCIA |
| Facturas | `/facturas` | Formulario embebido (búsqueda de pendientes → selección → crear) | Card embebida al final de la página | ADMINISTRADOR, FACTURACION, GERENCIA |
| Conciliación | `/facturas/conciliacion` | N/A (reporte) | Fila expandible in situ | ADMINISTRADOR, FACTURACION, GERENCIA |

**Observación de conjunto:** de 8 flujos de "creación", 7 usan el patrón "formulario arriba de la tabla" y solo Viajes usa una ruta dedicada — sin ningún criterio documentado de cuándo corresponde cada uno (ver UX-14). Ninguna pantalla usa un modal real (no existe el concepto en la aplicación) — toda superposición de contenido es o bien "aparece una card más abajo en la misma página" o `window.prompt` nativo del navegador.

---

## 2. Patrones que funcionan bien (no tocar al rediseñar)

Antes de listar hallazgos, vale nombrar lo que ya está bien resuelto, para no perderlo en el rediseño:

- **`Conciliacion.tsx`** (`buscar()`, líneas 20-35) es el único flujo de la app con el patrón completo y correcto: `cargando` boolean, botón que cambia de texto (`"Buscando..."`), `disabled` mientras está en vuelo, y limpieza de error al reintentar. Es el patrón de referencia a generalizar (ver Diseño, sección 3).
- **`Liquidaciones.tsx` — descarga de Excel/PDF** (`descargar()`, líneas 90-109): mismo patrón de `busy` por acción individual (`descargando: string`), correctamente aislado por id+tipo para no bloquear otras descargas. Buen ejemplo de estado "busy" granular, a diferencia del resto de los botones de esa misma página (ver UX-04).
- **`Liquidaciones.tsx` — comisión precompletada** (líneas 164-168): al elegir un chofer, la comisión se autocompleta desde su valor por defecto (Bloque 3.2) *y* se explica con un texto auxiliar ("Precompletado desde el chofer — se puede modificar como excepción"). Es el único lugar de toda la app donde un campo autocompletado se explica en el momento — patrón a replicar (ver UX-20).
- **`Transportistas.tsx` — edición inline de comisión** (líneas 109-141): convertir una celda de tabla en un input editable con Guardar/Cancelar es una micro-interacción bien acotada y apropiada para el caso de uso (un solo campo, edición frecuente).
- **Guardas condicionales de UI ya alineadas con el backend**: `Anticipos.tsx:116` (botón "Anular" solo si `!a.liquidado && !a.anulado`), `Facturas.tsx:187` y `:196` (formulario de cobranza y botón de anulación condicionados al estado de la factura) — la UI no ofrece acciones que el backend fuera a rechazar, un patrón correcto que falta generalizar a Liquidaciones (ver UX-03).
- **Tokens de color base en `:root`** (`styles.css:1-11`): existe una paleta centralizada (`--primary`, `--accent`, `--danger`, `--success`, `--warning`) — la base para un sistema de diseño ya está, solo falta ampliarla (ver UX-11, UX-12).

---

## 3. Hallazgos

### Bloque A — Estados de carga, éxito, error y vacíos

**UX-01 — Falta de estado de carga en casi todos los listados iniciales.**
De 12 pantallas, solo `Dashboard.tsx:21` (`if (!data) return <div className="muted">Cargando...</div>`), `ViajeDetalle.tsx:56` y `Conciliacion.tsx` (botón "Buscando...") muestran algún indicador de carga. `Viajes.tsx`, `Clientes.tsx`, `Transportistas.tsx`, `Catalogos.tsx`, `Anticipos.tsx`, `Liquidaciones.tsx`, `Facturas.tsx` no tienen ningún estado de carga para su `useEffect`/`cargar()` inicial — la tabla pasa de "no renderizada" a "poblada" sin transición, y en el intervalo se ve idéntica a una tabla legítimamente vacía (mismo mensaje "No hay X que coincidan...").

**UX-02 — Cero feedback de éxito en toda la aplicación.**
`styles.css:98` define `.success-banner` — **nunca se usa en ninguna de las 12 pantallas** (confirmado por búsqueda exhaustiva). Cada creación/edición/anulación exitosa se comunica únicamente por el efecto secundario de que la tabla se refresca (`cargar()`). Para acciones cuyo resultado no es obvio a simple vista (anular una liquidación ya "PAGADA" es imposible pero anular una "CONFIRMADA" cambia un badge en una tabla que puede estar fuera de la vista tras hacer scroll) el usuario no tiene ninguna confirmación positiva de que su acción se ejecutó.

**UX-03 — Cero confirmación antes de acciones destructivas/irreversibles de alto impacto financiero.**
Inventario completo de acciones destructivas o irreversibles y su nivel de confirmación actual:

| Acción | Archivo:línea | Confirmación hoy | Reversible en backend |
|---|---|---|---|
| Cancelar viaje | `ViajeDetalle.tsx:41` | `window.prompt` (motivo obligatorio) | No (estado terminal) |
| Anular anticipo/gasto | `Anticipos.tsx:46` | `window.prompt` (motivo obligatorio) | No (estado terminal) |
| Anular liquidación | `Liquidaciones.tsx:287` (`accion(id,"anular")`) | **Ninguna** | Sí, pero revierte N viajes + N anticipos a la vez |
| Confirmar liquidación | `Liquidaciones.tsx:285` | **Ninguna** | Sí (vuelve a BORRADOR indirectamente vía anular) |
| **Marcar liquidación como pagada** | `Liquidaciones.tsx:286` | **Ninguna** | **No — es un estado terminal, el backend rechaza anular una liquidación `PAGADA`** |
| Anular factura | `Facturas.tsx:197` (`anularFactura`) | **Ninguna** | Sí, revierte N viajes |
| Registrar cobranza | `Facturas.tsx:192` | **Ninguna** (ni siquiera un resumen de importe) | Sí, vía anular cobranza (no expuesto en UI, ver UX-09) |

El caso más grave es **"Marcar como pagada"**: un clic accidental sobre `Liquidaciones.tsx:286` ejecuta una operación que el propio backend (`liquidaciones.controller.ts:502-505`, Bloque 4.x) diseñó deliberadamente como sin retorno, y la interfaz no ofrece ninguna fricción — ni un `window.prompt` como las dos únicas acciones que sí lo tienen, ni un segundo clic, ni un resumen de "vas a marcar como pagada la liquidación N° X por $Y".

**UX-04 — Ausencia sistemática de estado "busy"/guarda contra doble-submit.**
Ya señalado como hallazgo F1 en `BLOQUE5_AUDITORIA_PRODUCTO.md`, reconfirmado hoy sin corregir. Grep exhaustivo de `disabled=` en las páginas financieras:
- `Anticipos.tsx`: cero usos de `disabled` en cualquier botón (ni "Registrar" ni "Anular").
- `Liquidaciones.tsx`: `disabled` solo existe en "Crear liquidación (borrador)" (`viajesSel.size===0`, un guard de *contenido*, no de *concurrencia*) y en los botones de descarga (`descargando`). "Confirmar", "Marcar como pagada" y "Anular" no tienen ningún guard.
- `Facturas.tsx`: `disabled` solo en "Crear factura" (guard de contenido). "Registrar cobranza" y "Anular factura" no tienen ningún guard.
- `ViajeForm.tsx:183` y `Login.tsx:40` sí implementan correctamente `saving`/`loading` con texto cambiante — muestra que el patrón se conoce, simplemente no se aplicó de forma pareja.

Un doble clic (deliberado o por lag de red) en cualquiera de los botones sin guard puede generar registros financieros duplicados (dos anticipos, dos liquidaciones sobre los mismos viajes si el segundo clic llega antes que la UI refresque `estadoLiquidacion`, dos cobranzas).

**UX-05 — Tablas anidadas sin fila de "estado vacío".**
`ViajeDetalle.tsx:104-113` (historial de estados) y `Transportistas.tsx:100-145` (choferes/vehículos por transportista) no incluyen ningún `<tr>` de respaldo cuando la colección está vacía — el patrón sí existe y está bien resuelto en las tablas de nivel superior (`Viajes.tsx:100-102`, `Liquidaciones.tsx:190`, `Liquidaciones.tsx:207`, `Conciliacion.tsx:93`) pero no se replicó en las tablas anidadas. Un transportista recién creado sin choferes ni vehículos muestra dos tablas con encabezado y cero filas, sin ninguna indicación de que eso es lo esperado.

**UX-06 — Manejo de errores de nivel de aplicación ausente.**
No existe ningún Error Boundary de React en `main.tsx`/`App.tsx` — una excepción de render (ej. una respuesta de API con una forma inesperada) produce una pantalla en blanco sin ningún mensaje de recuperación. Tampoco existe una ruta catch-all (`<Route path="*">`) en `App.tsx:16-32` — navegar a una URL no definida dentro del layout autenticado renderiza el sidebar con el área de contenido completamente vacía, sin mensaje de "página no encontrada".

**UX-07 — Errores de un contexto pueden persistir visualmente al cambiar de contexto.**
`Catalogos.tsx:43` (`useEffect(() => { setNuevo({}); cargar(); }, [tab])`) resetea el formulario al cambiar de tab pero no el `error` — un error de validación en la tab "Cereales" permanece visible en pantalla tras cambiar a "Ubicaciones", atribuido visualmente al contexto equivocado.

### Bloque B — Flujos de trabajo incompletos (backend construido, UI ausente)

**UX-08 — Sin edición ni baja/reactivación desde la UI para Clientes, Transportistas y Productores.**
El backend soporta íntegramente `PATCH`/`DELETE /clientes/:id`, `PATCH`/`DELETE /transportistas/:id` y `PATCH /productores/:id` desde los Bloques 5.1/5.2 (soft-delete, reactivación). Ninguna de las 3 pantallas correspondientes ofrece un botón de editar o dar de baja: `Clientes.tsx:63` muestra la columna "Activo" como texto plano ("Sí"/"No") sin ninguna acción asociada; `Transportistas.tsx` no tiene ninguna fila de acción sobre el transportista en sí (solo sobre sus choferes/comisión); `Catalogos.tsx` no ofrece edición para Productores pese a que el backend la soporta. Coincide con el hallazgo F6 de `BLOQUE5_AUDITORIA_PRODUCTO.md`, aún abierto.

**UX-09 — Cobranzas sin acción de anulación individual ni indicador de estado anulado en la UI.**
El backend soporta `POST /facturas/:id/cobranzas/:cobranzaId/anular` desde el Bloque 4.3 (`f0e68a0`). `Facturas.tsx:178-185` lista las cobranzas de una factura sin ningún botón de anular y **sin mostrar el campo `anulada`/`anuladaMotivo`** — si una cobranza fuera anulada por otra vía (API directa, o una vez que se implemente esta función), la tabla la seguiría mostrando idéntica a una vigente, sumando visualmente un importe que ya no corresponde al saldo real. Coincide con el hallazgo F5 de `BLOQUE5_AUDITORIA_PRODUCTO.md`, aún abierto.

**UX-10 — Bug confirmado: `detalle.numerl` (typo).**
`Liquidaciones.tsx:245`: `<h1>Liquidación N° {detalle.numerl}</h1>`. El modelo `Liquidacion` no tiene ningún campo `numerl` (solo `numero`, ya usado correctamente en la tabla de listado, línea 229) — el encabezado del detalle de **toda** liquidación muestra "Liquidación N° undefined". Ya identificado como F14 en `BLOQUE5_AUDITORIA_PRODUCTO.md` y agendado en `ROADMAP_BLOQUE5.md` sub-bloque 5.4 punto 2 — **confirmado hoy que sigue sin corregirse**, es la única entrada de este documento que es un bug de datos, no una decisión de diseño.

### Bloque C — Consistencia visual y sistema de diseño

**UX-11 — Reutilización de color en badges de dominios distintos, sin relación semántica.**
`styles.css:80-95` define un color por cada valor de estado, pero varios badges de **dominios completamente distintos** comparten color, rompiendo la promesa de "el color me dice el estado de un vistazo":
- `--accent` (azul): `ASIGNADO` (estado de Viaje) y `EN_TRANSITO` (estado de Viaje, distinto) y `FACTURADO` (estado de facturación) y `CONFIRMADA` (estado de Liquidación) — cuatro conceptos, un solo color.
- `#b8860b` (ámbar): `EN_CARGA` (Viaje), `PENDIENTE_DE_FACTURAR` (facturación) y `COBRADO_PARCIAL` (factura) — tres conceptos.
- `#888` (gris): `PENDIENTE` (Viaje) y `BORRADOR` (Liquidación).
Ningún par de estos coincide *dentro de la misma tabla* hoy (mitigación parcial), pero un usuario que memoriza "el ámbar significa X" en una pantalla lo va a malinterpretar en otra.

**UX-12 — Ausencia de tokens de espaciado; estilos inline dispersos.**
Al menos 6 puntos usan `style={{...}}` inline en vez de una clase reutilizable: `Transportistas.tsx:89` (`marginBottom`), `ViajeForm.tsx:178` (`marginTop`), `Liquidaciones.tsx:165` y `:281-283` (`fontSize`), `Facturas.tsx:188` (`marginTop`), `Transportistas.tsx:114` (`width` de input). Ninguno es incorrecto individualmente, pero indican que `styles.css` no cubre todos los patrones de layout que la app realmente necesita, y cada ocurrencia es una decisión de espaciado tomada de forma aislada.

**UX-13 — Un mismo tipo de dato se formatea de dos formas distintas en el mismo formulario.**
`ViajeForm.tsx:175`: el campo "Importe estimado" usa `importeEstimado.toLocaleString("es-AR")` (sin símbolo de moneda) mientras que cada otro monto de la aplicación —incluida esta misma pantalla si tuviera uno— usa la función `fmtMoney()` compartida (`Intl.NumberFormat` con `style:"currency"`). Es el único monto de toda la app sin el símbolo "$".

**UX-14 — Arquitectura de información inconsistente para "crear un registro".**
Ver tabla de la sección 1: 7 de 8 flujos de alta usan "formulario embebido arriba de la tabla", uno (Viajes) usa ruta dedicada. No hay ningún criterio documentado (¿complejidad del formulario? ¿frecuencia de uso?) que explique la diferencia — parece una decisión de implementación más que de diseño.

**UX-15 — Patrones de expandir/ver-detalle inconsistentes entre páginas hermanas.**
Tres variantes del mismo concepto ("ver más sobre este registro sin cambiar de página") conviven sin justificación: `Transportistas.tsx:91` (expandir con botón "Cerrar" explícito), `Clientes.tsx:71-98` (la cuenta corriente aparece debajo sin ningún botón de "Cerrar", solo desaparece al seleccionar otro cliente), `Liquidaciones.tsx:242-290`/`Facturas.tsx:162-200` (el detalle se agrega como una card nueva al final de una página que ya tiene un formulario largo y una tabla completa arriba, sin scroll automático hacia la nueva card ni ruta propia).

### Bloque D — Navegación

**UX-16 — El sidebar y los formularios no reflejan los permisos reales de mutación por rol.**
`Layout.tsx:11-12`: `/clientes` y `/transportistas` tienen `roles: null` (visibles para **todos** los roles autenticados, incluido `LECTURA`), pese a que desde el Bloque 5.1 el backend restringe `POST/PATCH/DELETE` de ambos catálogos a roles específicos (`OPERACIONES`/`FACTURACION`/`ADMINISTRADOR` para Clientes; `OPERACIONES`/`ADMINISTRADOR` para Transportistas). Un usuario `LECTURA` o `GERENCIA` ve el formulario "Nuevo cliente" completo y funcional, lo completa, y solo al enviar descubre —mediante el `error-banner` genérico con el texto que devuelva el backend para un 403— que no tenía permiso. Mismo hallazgo #2 y #11 de `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md`, **reconfirmado hoy sin resolver del lado frontend** (el backend ya está protegido desde `258e8a4`; esto es exclusivamente una deuda de UX, no un agujero de seguridad).

**UX-17 — Sin navegación de "volver" desde vistas de detalle.**
`ViajeDetalle.tsx` no tiene ningún enlace o botón para volver a `/viajes` — el único camino es el sidebar (que lleva al listado sin filtros previos) o el botón "atrás" del navegador.

**UX-18 — Botones de riesgo opuesto sin separación visual/jerárquica.**
`ViajeDetalle.tsx:90-97`: "Avanzar a X" (`btn success`) y "Cancelar viaje" (`btn danger`) están en el mismo `actions-row`, con el mismo tamaño y la misma prominencia visual, separados solo por color. Ambos requieren una acción deliberada (el segundo pide motivo vía `window.prompt`), pero nada en el layout comunica que son opuestos en severidad.

### Bloque E — Formularios y validación

**UX-19 — Validación de formularios delegada casi enteramente al backend, sin feedback a nivel de campo.**
Ninguna de las 12 pantallas implementa validación a nivel de campo individual (ej. resaltar el input específico que falló) — cada error de backend se muestra como un único banner de texto libre en la parte superior de la página (`error-banner`), obligando al usuario a inferir cuál de los N campos del formulario fue el problema. `ViajeForm.tsx` (13 campos) es el caso más expuesto: sus únicos límites de validación son los atributos HTML nativos (`required`, `type="number"` sin `min`), por lo que un `0` o un negativo en "Toneladas"/"Tarifa por tonelada" solo se rechaza en el backend (`@IsPositive()`), con el mismo banner genérico como único feedback.

**UX-20 — Selects dependientes deshabilitados sin texto de ayuda.**
`ViajeForm.tsx:132,139,146` (Chofer/Camión/Acoplado deshabilitados hasta elegir Transportista) y `Anticipos.tsx:73` (Chofer deshabilitado hasta elegir Transportista) no explican por qué el campo está inactivo — un usuario nuevo puede interpretarlo como un error de carga en vez de una dependencia intencional. Contrasta con el buen ejemplo ya señalado en `Liquidaciones.tsx:164-168` (sección 2), que sí explica la dependencia.

**UX-21 — `placeholder` usado como único indicador de campo en mini-formularios de alta rápida.**
`Transportistas.tsx:148-153` (nuevo chofer) y `:166-173` (nuevo vehículo): cada `<input>` tiene `placeholder` pero ningún `<label>`, a diferencia de cada otro formulario de la aplicación que sí usa el patrón `.field > label + input`. Es tanto una inconsistencia visual como un antipatrón de accesibilidad reconocido (el placeholder desaparece al escribir, dejando al campo sin identidad persistente).

**UX-22 — Registro de cobranza sin mostrar el saldo pendiente antes de enviar.**
`Facturas.tsx:187-194`: el formulario de cobranza no muestra en ningún punto `detalle.importe` menos la suma de `detalle.cobranzas` — el backend valida el tope contra sobrepago (Bloque 4.3), pero la UI no ofrece ninguna referencia visual antes del envío, así que el usuario solo aprende el saldo real disponible después de un intento fallido.

### Bloque F — Accesibilidad

**UX-23 — Cero atributos de accesibilidad semántica en toda la aplicación.**
Búsqueda exhaustiva (`grep -r "aria-|role=|tabIndex|alt="`) sobre los 17 archivos de `frontend/src`: **cero coincidencias**. Ningún elemento interactivo no nativo tiene rol ARIA, ningún estado dinámico (carga, error) se anuncia a un lector de pantalla, no hay ninguna imagen con texto alternativo (tampoco hay imágenes, pero confirma que el patrón nunca se consideró).

**UX-24 — `<label>` nunca asociado a su `<input>` mediante `htmlFor`/`id`.**
Confirmado en las 12 pantallas: todo formulario envuelve `<label>Texto</label>` seguido de `<input>` dentro de un mismo `<div className="field">`, sin `htmlFor`/`id`. Funciona visualmente pero un lector de pantalla no anuncia la etiqueta al enfocar el campo, y hacer clic en el texto de la etiqueta no enfoca el input (pierde el atajo de accesibilidad estándar del navegador). Ya señalado como F12 en `BLOQUE5_AUDITORIA_PRODUCTO.md` y en el roadmap sub-bloque 5.13, aún sin resolver.

**UX-25 — Sin gestión de foco ni anuncios para transiciones de estado.**
Ninguna transición (carga completada, error mostrado, acción exitosa) mueve el foco del teclado ni usa una región `aria-live` — un usuario de lector de pantalla que envía un formulario no tiene ninguna señal de que algo cambió salvo releer la página entera.

### Bloque G — Responsive

**UX-26 — Cero `@media queries` en toda la hoja de estilos; la aplicación no es usable en tablet/mobile.**
`styles.css` (104 líneas, único archivo de estilos) no contiene ninguna consulta de medios. El layout depende de un `.sidebar` de ancho fijo (`230px`, `styles.css:40`) más un `.main-content` flexible con `overflow-x:auto` (línea 48, mitigación parcial solo para el contenido, no reordena el layout). `.form-grid` (línea 75) sí usa `repeat(auto-fit, minmax(220px,1fr))`, que se adapta razonablemente en ancho, pero el sidebar fijo consume ancho de pantalla real en cualquier viewport angosto, y ninguna tabla tiene su propio contenedor de scroll dedicado (dependen del `overflow-x` del `.main-content` completo, lo que hace que el sidebar se desplace junto con la tabla en vez de quedar fijo). El `viewport` meta tag existe (`index.html:5`) pero no hay ninguna adaptación real detrás de él.

### Bloque H — Consistencia de datos mostrados / integración con Bloque 5.2

**UX-27 — Catálogos inactivos (Bloque 5.2) no tienen ninguna marca visual distinta en vistas históricas.**
Desde el Bloque 5.2, `Chofer`/`Vehiculo`/`Cliente`/`Transportista` pueden estar `activo:false` sin perder su historial. `ViajeDetalle.tsx:71-86` muestra `viaje.chofer?.nombre`, `viaje.cliente?.razonSocial`, etc. de forma idéntica sin importar si esa entidad sigue activa hoy — un operador que revisa un viaje antiguo no tiene forma de saber, sin ir a buscar el catálogo aparte, que el chofer asignado ya no está disponible para viajes nuevos. Es una consecuencia directa y no resuelta del propio Bloque 5.2 de este mismo roadmap.

**UX-28 — Sin paginación ni ordenamiento por columna en ninguna de las 8 tablas principales.**
`GET /viajes`, `/clientes`, `/transportistas`, `/facturas`, `/liquidaciones`, `/anticipos` devuelven el dataset completo sin límite, y ninguna tabla del frontend permite reordenar haciendo clic en un encabezado. No es un problema hoy por el volumen de datos (confirmado en `BLOQUE5_AUDITORIA_PRODUCTO.md`, hallazgo B1/F8, riesgo creciente con el tiempo), pero se reconfirma desde la óptica de UX: no hay ningún indicio en la interfaz (ni un contador "mostrando 50 de 500") de que esto vaya a ocurrir.

---

## 4. Tabla de clasificación

| # | Hallazgo | Prioridad | Impacto | Riesgo | Beneficio | Complejidad | Propuesta concreta |
|---|---|---|---|---|---|---|---|
| UX-10 | Bug `detalle.numerl` | **P0** | Alto — encabezado roto en el 100% de las vistas de detalle de Liquidación | Bajo (visual, no financiero) | Muy alto / esfuerzo mínimo | Trivial (cambiar un nombre de propiedad) | Corregir `detalle.numerl` → `detalle.numero` en `Liquidaciones.tsx:245` |
| UX-03 | Cero confirmación en acciones destructivas/irreversibles (esp. "Marcar como pagada") | **P0** | Alto — riesgo financiero real, una acción es literalmente irreversible | Alto | Alto | Baja-media (un componente reutilizable) | `ConfirmDialog` estándar con severidad (ver Diseño §3), obligatorio en las 4 acciones sin ninguna confirmación hoy |
| UX-04 | Sin guarda de doble-submit en botones financieros | **P0** | Alto — duplicación de registros financieros por doble clic | Alto | Alto | Baja (hook reutilizable) | `useAsyncAction` estándar (busy + disabled + error) aplicado a Anticipos/Liquidaciones/Facturas |
| UX-16 | Sidebar/formularios no reflejan permisos reales por rol | **P1** | Medio-alto — confusión de usuario, no vulnerabilidad (backend ya protegido) | Medio | Alto | Baja (condicionar por `usuario.rol`, patrón ya usado en `Layout.tsx`) | Ocultar o deshabilitar formularios de alta/edición según rol, igual que ya se hace con ítems del sidebar |
| UX-08 | Sin edición/baja de Clientes/Transportistas/Productores en UI | **P1** | Medio-alto — funcionalidad de backend completamente inaccesible | Bajo | Alto | Media (varios formularios) | Botones de editar/dar de baja/reactivar reusando el patrón ya validado de comisión inline |
| UX-09 | Cobranzas sin anular ni mostrar estado anulado en UI | **P1** | Medio-alto — mismo patrón que UX-08, además con riesgo de mostrar totales incorrectos | Medio | Alto | Baja-media | Columna de estado + botón de anular condicionado, igual que Anticipos |
| UX-01 | Sin estado de carga en listados | **P1** | Medio-alto — percepción de bug, alto tráfico de uso | Bajo | Alto | Baja (un componente `Skeleton`/spinner reutilizable) | Aplicar patrón de `Conciliacion.tsx` (`cargando`) a las 7 pantallas que no lo tienen |
| UX-02 | Cero feedback de éxito | **P1** | Medio-alto — sistémico, afecta la confianza en cada acción de la app | Bajo | Alto | Baja (activar `.success-banner` ya definido + hook) | Banner/toast de éxito auto-dismiss reusando la clase CSS ya existente |
| UX-22 | Cobranza sin mostrar saldo pendiente antes de enviar | **P1** | Medio — previene un error de usuario en un flujo financiero | Medio | Medio-alto | Baja | Mostrar `importe - Σcobranzas` junto al formulario de cobranza |
| UX-06 | Sin Error Boundary ni ruta 404 | **P2** | Medio — pantalla en blanco sin recuperación ante error inesperado | Medio | Medio | Baja | `ErrorBoundary` de React + `<Route path="*">` |
| UX-18 | Botones de riesgo opuesto sin separar (Avanzar/Cancelar) | **P2** | Medio — riesgo de clic erróneo | Medio | Medio | Baja | Separación visual + agrupar "Cancelar" en zona de menor prominencia |
| UX-19 | Validación de formularios sin feedback a nivel de campo | **P2** | Medio — fricción, no bloquea el flujo | Bajo | Medio | Media (requiere mapear mensajes de backend a campos) | Errores inline por campo donde el backend los identifique; banner general como fallback |
| UX-05 | Tablas anidadas sin estado vacío | **P2** | Bajo-medio | Bajo | Medio | Trivial | Replicar el patrón `colSpan` + `muted` ya usado en tablas de nivel superior |
| UX-11 | Colores de badge reutilizados entre dominios distintos | **P2** | Medio — el color deja de ser confiable como señal | Bajo | Medio | Baja (namespacing CSS por dominio) | Prefijar clases de badge por dominio (`.badge-viaje.ASIGNADO` vs. `.badge-liquidacion.CONFIRMADA`) con paletas no solapadas |
| UX-27 | Catálogo inactivo sin marca visual en históricos | **P2** | Medio — confusión operativa, cross-referencia directa con Bloque 5.2 | Bajo | Medio | Baja (un badge/etiqueta condicional) | Badge "(inactivo)" junto al nombre cuando `activo:false` en vistas de detalle |
| UX-23 | Cero atributos de accesibilidad semántica | **P2** | Medio — depende de si hay requisito de accesibilidad del negocio | Bajo (hoy) | Medio | Media (transversal a toda la app) | Punto de decisión de negocio antes de estimar (ver Diseño §0) |
| UX-24 | `<label>` sin `htmlFor`/`id` | **P2** | Medio, mismo eje que UX-23 | Bajo | Medio | Baja (mecánico, alto volumen de archivos) | Agregar `id`/`htmlFor` en los ~15 formularios de la app |
| UX-25 | Sin gestión de foco/`aria-live` | **P2** | Medio, mismo eje que UX-23 | Bajo | Medio | Media | Depende de UX-23 (mismo punto de decisión) |
| UX-26 | Sin responsive/mobile | **P2** | Alto si hay uso mobile real, nulo si no | Bajo (hoy, uso 100% desktop asumido) | Alto si aplica | Alta (toca layout global) | Punto de decisión de negocio antes de estimar (¿hay uso mobile/tablet real hoy o previsto?) |
| UX-07 | Errores persisten al cambiar de contexto | **P3** | Bajo | Bajo | Bajo | Trivial | Limpiar `error` en el mismo lugar donde se limpia el resto del estado del formulario |
| UX-12 | Sin tokens de espaciado, `style` inline disperso | **P3** | Bajo | Bajo | Bajo-medio | Baja | Clases utilitarias (`.mt-1`, `.section-header`, etc.) para reemplazar los ~6 usos inline |
| UX-13 | Formato de moneda inconsistente en `ViajeForm` | **P3** | Bajo | Bajo | Bajo | Trivial | Usar `fmtMoney()` también en "Importe estimado" |
| UX-14 | Arquitectura de información inconsistente para "crear" | **P3** | Bajo-medio, es una decisión de fondo, no un bug | Bajo | Medio (a largo plazo, consistencia) | Alta si se decide unificar (toca 7 pantallas) | Definir criterio explícito (ver Diseño §2) antes de decidir si se unifica |
| UX-15 | Patrones de expandir/detalle inconsistentes | **P3** | Bajo-medio | Bajo | Medio | Media | Adoptar un único patrón de "panel de detalle" reutilizable |
| UX-17 | Sin navegación de "volver" en detalle | **P3** | Bajo | Bajo | Bajo-medio | Trivial | Link "← Volver a Viajes" en `ViajeDetalle` |
| UX-20 | Selects dependientes sin texto de ayuda | **P3** | Bajo | Bajo | Bajo-medio | Trivial | Texto auxiliar bajo el select, igual que el ya existente en Liquidaciones |
| UX-21 | `placeholder` sin `<label>` en mini-formularios | **P3** | Bajo (further reforzado por UX-24) | Bajo | Bajo-medio | Trivial | Agregar `<label>` visible o `aria-label`, consistente con el resto de la app |
| UX-28 | Sin paginación/orden en tablas | **P3** | Bajo hoy, creciente | Bajo hoy | Medio a futuro | Alta (backend + frontend coordinados) | Ya cubierto por roadmap 5.9 — no rediseñar acá, solo se reconfirma el síntoma |

---

## 5. Resumen ejecutivo

La aplicación tiene una base de estilos coherente y algunos patrones ya bien resueltos (Conciliación, descarga de liquidaciones, comisión inline, guardas condicionales de botones) que deberían generalizarse en lugar de reinventarse. El problema de fondo no es "falta de diseño" sino **inconsistencia de aplicación**: cada pantalla resolvió loading/error/éxito/confirmación por su cuenta, con resultados distintos entre pantallas que hacen exactamente el mismo tipo de operación (crear un registro, anular una operación financiera).

Los tres hallazgos P0 (`UX-10`, `UX-03`, `UX-04`) comparten una característica: son baratos de resolver individualmente pero, sin un componente/hook compartido, se van a volver a repetir la próxima vez que se agregue una pantalla. El diseño (`BLOQUE5.3_DISENO_UX.md`) prioriza resolverlos con **2-3 piezas reutilizables** (`ConfirmDialog`, `useAsyncAction`, banner de éxito) en vez de N parches puntuales.

Los hallazgos de accesibilidad (`UX-23`, `UX-24`, `UX-25`) y de responsive (`UX-26`) son los de mayor incertidumbre de alcance — dependen de una decisión de negocio (¿hay requisito de accesibilidad? ¿se usa o se va a usar desde tablet/mobile?) que no corresponde resolver en este documento técnico.

No se modificó ningún archivo para producir esta auditoría.

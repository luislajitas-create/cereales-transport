# Auditoría del Frontend — Capacidades Administrativas de Bloque 9

Fecha: 2026-07-14. Auditoría pura (`METODOLOGIA_SDC.md`, etapa 1): sin código, sin migraciones, sin cambios de ningún archivo. Responde una sola pregunta con evidencia verificable (`archivo:línea`) contra el código real del frontend — no contra suposiciones.

**Pregunta que responde este documento**: ¿qué necesita hoy el frontend de SDC para que todas las capacidades administrativas implementadas en Bloque 9 puedan utilizarse completamente desde la interfaz?

**Método**: lectura completa de los 22 archivos fuente de `frontend/src/` (todas las páginas, componentes, hooks, contexto, cliente HTTP, hoja de estilos) contra los 16 endpoints reales que `ACTA_CIERRE_BLOQUE9.md` confirma desplegados en producción.

---

## 1. Diagnóstico

### 1.1 — Inventario del frontend existente

`frontend/src/` tiene 22 archivos: `App.tsx` (rutas), `main.tsx` (bootstrap), `components/Layout.tsx` (shell + navegación + guard de sesión), `components/ConfirmDialog.tsx` (diálogo de confirmación reutilizable), `context/AuthContext.tsx` (sesión), `hooks/useAsyncAction.ts` (estado de acciones async), `api/client.ts` (cliente HTTP), `styles.css`, y 16 páginas: `Login`, `Dashboard`, `Viajes`, `ViajeForm`, `ViajeDetalle`, `Clientes`, `Transportistas`, `Catalogos`, `Anticipos`, `Liquidaciones`, `Facturas`, `Conciliacion`, `Rentabilidad`, `Aging`, `Alertas`, `DashboardEjecutivo`, `Benchmarking`.

Stack (`package.json:11-23`): React 18, `react-router-dom` 6, `axios`. **Sin ninguna librería de UI, de formularios, de tablas, ni de fetching/caché** (no MUI, no Ant Design, no Tailwind, no React Hook Form, no React Query/SWR). Todo el frontend está escrito a mano sobre HTML plano + una hoja de estilos única (`styles.css`, 121 líneas) con un vocabulario de clases consistente.

### 1.2 — Qué pantallas administrativas existen (pregunta 1)

**Ninguna.** Búsqueda exhaustiva (`grep -i "perfil|organizacion|usuarios|invitacion|restablecer|recuperar-contrasena"` sobre todo `frontend/src/`): **cero coincidencias** en cualquier archivo. Ni una sola de las 16 rutas de Bloque 9 tiene hoy ninguna representación en el frontend — ni una página, ni una llamada a la API, ni una entrada de menú, ni una ruta declarada en `App.tsx`.

### 1.3 — Qué pantallas faltan (pregunta 2)

Las 16 rutas del backend (`GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`, `POST /usuarios/invitaciones`, `GET /usuarios/invitaciones/:token`, `POST /usuarios/invitaciones/:token/aceptar`, `GET/PATCH /perfil`, `PATCH /perfil/contrasena`, `POST /auth/recuperar-contrasena`, `POST /auth/restablecer-contrasena`, `GET/PATCH /organizacion`, `GET /organizacion/auditoria`) se agrupan en exactamente **6 pantallas o flujos** necesarios — el análisis detallado de cada uno está en la sección 1.5.

### 1.4 — Sistema de permisos actual (pregunta 7)

Es puramente de navegación, no de rutas. `Layout.tsx:4-19` define `NAV_ITEMS`, un arreglo estático de `{ to, label, roles }` donde `roles` es `string[] | null` (`null` = visible para cualquier rol autenticado). `Layout.tsx:27` filtra ese arreglo contra `usuario.rol` antes de renderizar el menú. **No existe ningún guard a nivel de ruta**: el único control de acceso estructural es `Layout.tsx:25` (`if (!usuario) return <Navigate to="/login" />`), que solo verifica que haya sesión, no el rol. Si un usuario no `ADMINISTRADOR` navega manualmente a una URL administrativa que no aparece en su menú, el frontend no lo bloquea — la única autoridad real es el backend, que devuelve `403` en las mutaciones restringidas. Ninguna página hoy maneja explícitamente un `403` de forma distinta a un error genérico (ver 3.1).

### 1.5 — Cómo consume hoy los endpoints (pregunta 8)

Un único cliente HTTP compartido, `api/client.ts` (27 líneas): instancia de `axios` con `baseURL` desde `VITE_API_URL`, un interceptor de request que inyecta `Authorization: Bearer <token>` desde `localStorage` (`client.ts:7-13`), y un interceptor de response que, ante cualquier `401`, limpia la sesión y redirige a `/login` (`client.ts:15-27`). No hay librería de fetching: cada página hace su propio `useEffect` + `useState` + `api.get(...).then(...)` para cargar datos, y su propia función `cargar()` para refrescar tras una mutación. No hay caché, no hay deduplicación de requests, no hay revalidación automática. Las mutaciones más recientes (`Facturas.tsx`, `Liquidaciones.tsx`) usan `useAsyncAction` (sección 2.2); las más antiguas (`Clientes.tsx`, `Catalogos.tsx`, `ViajeForm.tsx`) usan `try/catch` manual con un `useState<string>` de error propio — dos convenciones conviven, no una sola.

### 1.6 — Navegación administrativa existente (pregunta 9)

Ninguna. El bloque `.user-info` del sidebar (`Layout.tsx:40-44`) hoy solo muestra nombre, rol, y un botón "Cerrar sesión" — es el único punto de la interfaz donde el usuario ve algo sobre su propia cuenta, y no enlaza a ningún lado.

### 1.7 — Qué menú debería ampliarse (pregunta 10)

`NAV_ITEMS` en `Layout.tsx:4-19` necesita nuevas entradas para "Usuarios" y "Auditoría" (ambas `roles: ["ADMINISTRADOR"]`, mismo patrón ya usado para "Catálogos"). "Mi Organización" tiene sentido como entrada de menú visible para cualquier rol (el `GET` no tiene restricción) aunque la edición quede restringida dentro de la propia pantalla. "Mi Perfil" no encaja como ítem de navegación principal — el lugar natural, dado el patrón ya existente, es ampliar el bloque `.user-info` (`Layout.tsx:40-44`) con un enlace, no agregar una fila más a `NAV_ITEMS`.

### 1.8 — Qué rutas deberían agregarse (pregunta 11)

Dentro de `<Route element={<Layout />}>` (`App.tsx:27-43`, protegidas): una ruta para perfil, una para organización, una para administración de usuarios, una para auditoría. Fuera de `Layout`, al mismo nivel que `<Route path="/login" ...>` (`App.tsx:26`, públicas, sin sesión): una ruta para aceptar invitación (con el token como parámetro o query string, replicando cómo el backend ya lo recibe — `GET /usuarios/invitaciones/:token`), y una o dos rutas para el flujo de recuperación de contraseña (solicitar / restablecer). Los nombres y paths exactos son una decisión de diseño, no de esta auditoría — pero la ubicación (dentro o fuera de `Layout`) está determinada por si el endpoint que consumen requiere sesión o no, sin ambigüedad.

### 1.9 — Análisis por pantalla necesaria (preguntas 12 a 20)

| Pantalla | Endpoints | CRUD (12) | Solo consulta (13) | Wizard (14) | Búsqueda (15) | Paginación (16) | Filtros (17) | Auditoría (18) | Acciones masivas (19) |
|---|---|---|---|---|---|---|---|---|---|
| **Mi Perfil** | `GET/PATCH /perfil`, `PATCH /perfil/contrasena` | No — edición de un único registro propio, no una colección | No, tiene edición | No | No aplica | No aplica | No aplica | No | No aplica |
| **Mi Organización** | `GET/PATCH /organizacion` | No — mismo caso, un único registro ya existente (sin alta/baja) | Sí para roles no `ADMINISTRADOR` | No | No aplica | No aplica | No aplica | No en esta pantalla (podría enlazar a Auditoría) | No aplica |
| **Administración de Usuarios** | `GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`, `POST /usuarios/invitaciones` | **Sí — la más completa de las seis**: alta (invitar), edición, activar/desactivar (no hay baja física, igual que el resto del sistema) | No | No — el alta es un formulario de 3 campos (nombre/email/rol), misma complejidad que `Catalogos.tsx` | Deseable, pero el backend (`usuarios.controller.ts`, `findAll()`) no acepta ningún parámetro de búsqueda hoy — solo posible client-side | El backend no pagina `GET /usuarios` (consistente con que ningún listado del frontend pagina hoy — no es una necesidad nueva) | Ninguno soportado por el backend hoy; posible client-side (por rol/activo) sin tocarlo | Opcional: enlazar a Auditoría filtrada por ese usuario — no imprescindible | El diseño no contempla ninguna mutación en lote; no es necesaria |
| **Auditoría Administrativa** | `GET /organizacion/auditoria` | No | **Sí, 100% consulta** | No | Cubierta por los filtros del propio endpoint | **Sí — la única pantalla que la necesita de verdad.** El backend ya devuelve `{ datos, pagina, limite, total }`; el frontend no tiene ningún control de paginación construido hoy (ver 3.1) | Sí, los 6 que el backend soporta (`usuarioId`, `entidad`, `entidadId`, `accion`, `fechaDesde`, `fechaHasta`) | Es la propia pantalla de auditoría | No aplica, solo lectura |
| **Aceptar Invitación** (pública) | `GET/POST /usuarios/invitaciones/:token[/aceptar]` | No — una sola acción | Parcial: `GET` valida el token antes de mostrar el formulario | No — es una validación + un formulario de un campo, no amerita un componente de pasos; alcanza con el patrón ya usado en `ViajeDetalle.tsx:66-67` (estado condicional cargando/válido/inválido) | No aplica | No aplica | No aplica | No aplica | No aplica |
| **Recuperar / Restablecer Contraseña** (públicas) | `POST /auth/recuperar-contrasena`, `POST /auth/restablecer-contrasena` | No | No | No — son dos páginas independientes en momentos distintos, no un flujo continuo de pasos | No aplica | No aplica | No aplica | No aplica | No aplica |

### 1.10 — Qué vistas deberían mantenerse fuera de alcance (pregunta 20)

- **Cualquier acción de "rechazar invitación"** — no existe ningún endpoint para eso; construirlo en el frontend no tiene backend que lo sostenga.
- **Cancelación de invitación pendiente** — `BLOQUE9_DISENO_ADMINISTRACION.md` no la contempla (confirmado en `ACTA_CIERRE_BLOQUE9.md`, sección 7); no hay endpoint.
- **Un botón de "reenviar invitación" como acción distinta** — el backend resuelve el reenvío reinvocando el mismo `POST /usuarios/invitaciones` (reemplaza el token anterior); en la interfaz alcanza con el mismo formulario de invitar, no una acción nueva separada.
- **Cualquier pantalla de alta de organización nueva** — no existe ningún endpoint (`PLATFORM_PROVISIONING_SECRET` nunca se implementó, riesgo remanente ya documentado en el acta de cierre); no hay nada que construir del lado del frontend todavía.
- **Cualquier pantalla de administración de roles/permisos dinámicos** — el diseño mantiene `RolNombre` como enum fijo, sin RBAC configurable.
- **Verificación de email** — no existe ningún mecanismo en el backend; es la razón por la que `PATCH /perfil` excluye el email, no algo que la interfaz deba intentar resolver por su cuenta.

---

## 2. Reutilización

### 2.1 — Componentes ya reutilizables (pregunta 3)

- **`Layout` (`components/Layout.tsx`)** — cualquier ruta nueva agregada dentro de `<Route element={<Layout />}>` hereda automáticamente el shell, la sesión y el guard de autenticación, sin cambios.
- **`ConfirmProvider`/`useConfirm` (`components/ConfirmDialog.tsx`)** — diálogo de confirmación con dos variantes ya construidas y usadas en producción: `requireMotivo` (textarea obligatorio, usado hoy en `ViajeDetalle.tsx:48` para cancelar un viaje) y `requireTypedValue` (tipear un valor exacto para habilitar el botón). Ambas aplican directamente a las confirmaciones más sensibles de Bloque 9: desactivar un usuario, cambiar el rol de un `ADMINISTRADOR`, o cualquier acción que el diseño quiera reforzar más allá de un `window.confirm`.
- **`useAsyncAction` (`hooks/useAsyncAction.ts`)** — estado de `busy`/`error`/`success` y guard anti-doble-submit por `ref`, ya extrae `err.response.data.message` del backend. Aplica sin cambios a las 8 mutaciones de Bloque 9 (invitar, editar perfil, cambiar contraseña, editar organización, activar/desactivar, restablecer acceso, aceptar invitación, recuperar/restablecer contraseña).
- **`api` (`api/client.ts`)** — funciona sin ningún cambio para los 16 endpoints nuevos; ya maneja el token y el `401` global.

### 2.2 — Layouts existentes (pregunta 4)

Uno solo: el shell de `Layout.tsx` (sidebar + contenido). Además existe un patrón de página pública — `.login-page`/`.login-card` (`styles.css:18-37`, usado hoy únicamente por `Login.tsx`) — que es la plantilla estructural correcta para las 3 pantallas públicas nuevas (aceptar invitación, recuperar/restablecer contraseña), pero **no está extraído como componente**: hoy vive como JSX repetible dentro de `Login.tsx`, habría que copiarlo o extraerlo a un componente compartido antes de la etapa de implementación (decisión de diseño, no de esta auditoría).

### 2.3 — Tablas ya reutilizables (pregunta 5)

No existe ningún componente `<Table>`. Existe, en cambio, una convención muy consistente repetida en las 9 páginas que muestran listados (`Clientes`, `Viajes`, `Transportistas`, `Catalogos`, `Facturas`, `Liquidaciones`, `Anticipos`, `Alertas`, `Conciliacion`): `<table><thead><tr><th>...</th></tr></thead><tbody>{items.map(...)}</tbody></table>` sobre las clases CSS `table`/`thead th`/`tbody td`/`tbody tr:hover` (`styles.css:67-71`). Es un patrón copiable, no un componente — cada pantalla nueva de Bloque 9 lo repite a mano, igual que las 9 anteriores.

### 2.4 — Formularios ya reutilizables (pregunta 6)

Mismo caso que las tablas: no hay un componente `<Form>`, pero sí una convención sólida (`.card > .form-grid > .field`, `styles.css:59,77-80`) usada en las 6 páginas con formularios de alta (`Clientes`, `Catalogos`, `ViajeForm`, `Facturas`, `Liquidaciones`, `Login`). **`Catalogos.tsx` es el precedente más cercano a lo que Bloque 9 necesita**: en vez de un formulario fijo, define los campos como configuración (`TABS[].fields`, `Catalogos.tsx:4-32`) y los renderiza genéricamente (`Catalogos.tsx:76-90`) — el mismo patrón (campos como datos, no como JSX fijo) sirve directamente para el formulario de alta/edición de `Administración de Usuarios` (nombre/email/rol) sin inventar nada nuevo.

---

## 3. Deuda técnica

- **Dos convenciones de manejo de error conviven** (sección 1.5): páginas antiguas con `useState` + `try/catch` manual, páginas nuevas con `useAsyncAction`. Ninguna pantalla de Bloque 9 debería sumarse a la convención antigua — usar `useAsyncAction` de forma consistente es una decisión de implementación, no de diseño, cubierta por convenciones ya escritas (`CONSTITUCION_SDC.md`, Artículo 3).
- **Ningún control de paginación existe en todo el frontend.** `Auditoría Administrativa` es la primera pantalla que lo necesita de verdad (backend ya pagina) — se construye desde cero, no hay nada que reutilizar más allá de los datos (`pagina`, `limite`, `total`) que el backend ya expone.
- **`AuthContext.tsx:4-9`** (interfaz `Usuario`) no declara `organizacionId`, aunque el backend sí lo devuelve en `POST /auth/login` (`auth.service.ts`) y queda igual guardado en `localStorage`. No es un bug hoy porque ninguna pantalla lo usa — pero si alguna pantalla nueva quisiera leerlo del contexto en vez de pedirlo de nuevo a `GET /organizacion`, la interfaz TypeScript lo bloquearía sin necesidad.
- **Ninguna página maneja el `403` de forma distinta a un error genérico** — un usuario no autorizado que llegue a una pantalla administrativa por URL directa vería el mismo `error-banner` genérico que cualquier otra falla, no un mensaje de "no tenés permiso para esto". No es un problema de seguridad (el backend ya protege el dato), pero si Bloque 9 quiere una UX prolija, conviene decidirlo antes de implementar las 4 pantallas restringidas a `ADMINISTRADOR`.

---

## 4. Riesgos

- **`NotificadorService` sin proveedor real de email** (riesgo ya documentado en `ACTA_CIERRE_BLOQUE9.md`, sección 6) determina directamente el alcance real de 2 de las 6 pantallas: aunque se construyan "Aceptar Invitación" y "Restablecer Contraseña", en producción hoy ningún destinatario recibe el enlace por ningún canal real — ambas pantallas quedarían funcionalmente completas pero inalcanzables para un usuario real hasta que se resuelva esa decisión pendiente (fuera del alcance de este bloque de frontend).
- **Ausencia de guard por rol a nivel de ruta** (sección 1.4): construir las 4 pantallas restringidas a `ADMINISTRADOR` sin decidir primero cómo manejar el acceso directo por URL de un rol no autorizado es el único punto donde este bloque podría introducir una experiencia inconsistente (nunca una fuga de datos, siempre cubierta por el backend).
- **El backend de `GET /usuarios` no pagina ni filtra** — si una organización crece a un número grande de usuarios, la pantalla de Administración de Usuarios tendría que resolver búsqueda/orden enteramente en el navegador. No es un riesgo inmediato (los volúmenes de prueba y reales hoy son bajos), pero es una dependencia cruzada con el backend de Bloque 9 que este documento no puede resolver por sí solo.

---

## 5. Dependencias

- Bloque 9 (backend) ya cerrado y desplegado — cumplido, es la base de todo este documento.
- Resolución del proveedor real de `NotificadorService` — no bloquea construir las pantallas, sí bloquea que dos de ellas sean usables por un cliente real en producción (ya señalado en la sección 4).
- Decisión de ubicación exacta de las nuevas rutas administrativas dentro de `App.tsx` (paths concretos) — no resuelta en esta auditoría, corresponde a la etapa de diseño.
- Decisión de dónde vive "Mi Perfil" en la navegación (`.user-info` vs. una entrada de `NAV_ITEMS`) — señalada en 1.7, pendiente de decisión de diseño.
- Decisión sobre cómo manejar el `403` en las pantallas restringidas a `ADMINISTRADOR` (sección 3) — pendiente de decisión de diseño, no bloquea el resto.

---

## 6. Orden recomendado de implementación

1. **Mi Perfil** — la pantalla más simple, sin dependencias cruzadas, usada por todos los roles; establece el patrón base de "formulario de edición de un único registro" que las siguientes dos reutilizan.
2. **Mi Organización** — mismo patrón que el paso 1, con la variante de visibilidad condicional por rol (`GET` abierto, `PATCH` restringido).
3. **Recuperar / Restablecer Contraseña** (públicas) — introduce el patrón de "página fuera de `Layout`, sin sesión", reutilizando la estructura de `Login.tsx`.
4. **Aceptar Invitación** (pública) — reutiliza directamente el patrón recién resuelto en el paso 3.
5. **Administración de Usuarios** (incluye invitar) — la pantalla más compleja de las seis; conviene resolverla después de tener ya validados los patrones de formulario simple (pasos 1-2) y de flujo público (pasos 3-4), porque el alta de un usuario solo se puede probar de punta a punta una vez que "Aceptar Invitación" ya existe.
6. **Auditoría Administrativa** — última: es la única que introduce un componente genuinamente nuevo (paginación) y tiene más sentido validarla cuando ya existen eventos reales generados por las cinco pantallas anteriores para mostrar y filtrar.

Este orden no es una propuesta de sub-bloques — es la secuencia de dependencias técnicas observada en el propio análisis; la decisión de cómo dividir el trabajo en sub-bloques, y cuándo abrir cada uno, queda fuera del alcance de esta auditoría.

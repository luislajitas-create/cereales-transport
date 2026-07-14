# Diseño Técnico — Frontend Administrativo de Bloque 9

Fecha: 2026-07-14. Diseño técnico (`METODOLOGIA_SDC.md`, etapa 2), sobre `BLOQUE9_FRONTEND_AUDITORIA.md` ya aprobada. No se implementó nada de este diseño — queda a la espera de aprobación explícita antes de escribir código (`METODOLOGIA_SDC.md`, etapa 3). No reabre ninguna decisión de backend: los 16 endpoints, sus contratos, roles y mensajes ya cerrados en Bloque 9 se toman tal cual están.

---

## 1. Arquitectura de navegación

Sin router alternativo, sin cambios a `react-router-dom`. Dos zonas, igual que hoy:

- **Dentro de `<Route element={<Layout />}>`** (`App.tsx:27-43`) — heredan sesión, sidebar y guard de autenticación sin cambios: `/perfil`, `/organizacion`, `/administracion/usuarios`, `/administracion/auditoria`.
- **Fuera de `Layout`, al mismo nivel que `/login`** (`App.tsx:26`) — sin sesión, sin sidebar: `/recuperar-contrasena`, `/restablecer-contrasena`, `/aceptar-invitacion`.

Los 7 paths propuestos en la instrucción se aceptan tal cual — no colisionan con ninguna ruta existente y el prefijo `administracion/` agrupa con claridad las dos pantallas restringidas a `ADMINISTRADOR`, sin mezclarse con `/usuarios` (que hoy no existe como ruta de catálogo, así que tampoco hay ambigüedad futura).

---

## 2. Matriz ruta / rol / endpoint

| Ruta | Zona | Roles con acceso a la pantalla | Endpoint(s) | Restricción real (backend) |
|---|---|---|---|---|
| `/perfil` | Autenticada | Cualquier rol | `GET/PATCH /perfil`, `PATCH /perfil/contrasena` | Ninguna — cada usuario opera sobre sí mismo (`@CurrentUser().id`) |
| `/organizacion` | Autenticada | Cualquier rol (edición solo `ADMINISTRADOR`) | `GET/PATCH /organizacion` | `PATCH` → `ADMINISTRADOR` únicamente |
| `/recuperar-contrasena` | Pública | Sin sesión | `POST /auth/recuperar-contrasena` | Ninguna (endpoint público) |
| `/restablecer-contrasena` | Pública | Sin sesión | `POST /auth/restablecer-contrasena` | Ninguna (endpoint público) |
| `/aceptar-invitacion` | Pública | Sin sesión | `GET/POST /usuarios/invitaciones/:token[/aceptar]` | Ninguna (endpoint público) |
| `/administracion/usuarios` | Autenticada | `ADMINISTRADOR` | `GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`, `POST /usuarios/invitaciones` | Todo salvo `GET` → `ADMINISTRADOR` únicamente |
| `/administracion/auditoria` | Autenticada | `ADMINISTRADOR` | `GET /organizacion/auditoria` | `ADMINISTRADOR` únicamente |

**Nota sobre `/perfil` y `/organizacion`**: aunque cualquier rol puede *ver* la pantalla, ninguna de las dos aparece hoy en `NAV_ITEMS` para todos como una excepción — `/organizacion` sí se agrega al menú para todos (sección 3), `/perfil` no se agrega como entrada de menú (sección 3, vive en `.user-info`). Solo `/administracion/usuarios` y `/administracion/auditoria` quedan completamente ocultas para roles no `ADMINISTRADOR`.

---

## 3. Menú y permisos

**Entradas nuevas en `NAV_ITEMS` (`Layout.tsx:4-19`)**, mismo formato `{ to, label, roles }` ya usado:

- `{ to: "/organizacion", label: "Mi Organización", roles: null }` — visible para cualquier rol (el `GET` no tiene restricción); el botón de edición dentro de la pantalla se muestra u oculta según `usuario.rol === "ADMINISTRADOR"`.
- `{ to: "/administracion/usuarios", label: "Usuarios", roles: ["ADMINISTRADOR"] }`
- `{ to: "/administracion/auditoria", label: "Auditoría", roles: ["ADMINISTRADOR"] }`

**"Mi Perfil" no se agrega a `NAV_ITEMS`** — se agrega un enlace dentro del bloque `.user-info` ya existente (`Layout.tsx:40-44`), junto al nombre/rol/botón de cerrar sesión, consistente con el hallazgo de la auditoría (sección 1.7).

**Rutas públicas fuera del `Layout`**: `/recuperar-contrasena`, `/restablecer-contrasena`, `/aceptar-invitacion` no aparecen en ningún menú — se llega a ellas por enlace directo (el que genera `NotificadorService`) o, en el caso de `/recuperar-contrasena`, por un enlace nuevo "¿Olvidaste tu contraseña?" agregado a `Login.tsx` (hoy no existe ninguno).

**Cómo se evita mostrar acciones que el backend rechazaría** (sin que el frontend reemplace ningún guard):
- El filtro de `NAV_ITEMS` ya oculta `/administracion/usuarios` y `/administracion/auditoria` completas para quien no es `ADMINISTRADOR` — replica exactamente lo que el backend exige, no agrega ninguna regla nueva.
- Dentro de `/organizacion`, el formulario de edición se **oculta** (no solo se deshabilita) si `usuario.rol !== "ADMINISTRADOR"` — evita que alguien vea campos editables que el backend igual rechazaría con `403`.
- Dentro de `/administracion/usuarios`, las acciones de edición/activación/invitación se muestran siempre que la pantalla sea alcanzable (ya está restringida por el punto anterior) — no hay un segundo nivel de permiso dentro de la pantalla.
- En ningún caso el frontend decide si una acción es válida — solo evita mostrar controles que el backend, de forma ya conocida y estable, siempre va a rechazar. La respuesta real del backend (`403`, `400`, etc.) sigue siendo la única autoridad, mostrada vía el patrón de error existente (sección 7).

---

## 4. Orden de implementación

Se mantiene el orden recomendado por la auditoría, sin cambios — ninguna dependencia real encontrada durante este diseño lo contradice:

1. Mi Perfil
2. Mi Organización
3. Recuperar / Restablecer contraseña
4. Aceptar invitación
5. Administración de Usuarios
6. Auditoría Administrativa

---

## 5. Diseño funcional por pantalla

### 5.1 — Mi Perfil (`/perfil`)

- **Endpoints**: `GET /perfil`, `PATCH /perfil`, `PATCH /perfil/contrasena`.
- **Datos mostrados**: `id`, `nombre`, `email`, `rol`, `activo` (los 5 campos que el endpoint devuelve). `email` se muestra pero nunca en un campo editable.
- **Formulario 1 — datos**: un único campo editable, `nombre`. `email`/`rol`/`activo` se muestran como texto, no como input.
- **Formulario 2 — contraseña**: `contrasenaActual`, `contrasenaNueva` (separado del formulario de datos, mismo patrón que Bloque 9 backend separa ambos endpoints).
- **Acciones**: guardar nombre; cambiar contraseña.
- **Permisos**: cualquier rol autenticado, siempre sobre uno mismo.
- **Estados**: `loading` en la carga inicial (`GET /perfil`); `busy`/`error`/`success` independientes para cada uno de los dos formularios (vía dos instancias de `useAsyncAction`, sección 6).
- **Confirmaciones**: ninguna — ni cambiar el nombre ni cambiar la contraseña son acciones destructivas.
- **Validaciones (cliente, complementan al backend, nunca lo reemplazan)**: `nombre` no vacío; `contrasenaNueva` con al menos 8 caracteres.
- **Componentes reutilizados**: `useAsyncAction`, clases `.card`/`.form-grid`/`.field`/`.error-banner`/`.success-banner`.
- **Criterios de aceptación**: el nombre se actualiza y se refleja sin recargar la página; un cambio de contraseña exitoso no cierra la sesión (arquitectura stateless ya validada en el backend); errores del backend (contraseña actual incorrecta, nueva igual a la anterior, muy corta) se muestran tal cual los devuelve la API.

### 5.2 — Mi Organización (`/organizacion`)

- **Endpoints**: `GET /organizacion`, `PATCH /organizacion`.
- **Datos mostrados**: los 8 campos que el endpoint devuelve (`nombre`, `razonSocial`, `cuit`, `domicilio`, `telefono`, `email`, `zonaHoraria`, `moneda`) más `createdAt` como dato informativo, no editable. **`logoUrl` no existe en el backend — no se muestra ni se diseña.**
- **Formulario**: los 8 campos editables (todos menos `createdAt`), visible únicamente si `usuario.rol === "ADMINISTRADOR"`; para el resto de los roles, la pantalla muestra los mismos datos en modo solo-lectura.
- **Acciones**: guardar cambios (un único `PATCH` con los campos modificados).
- **Permisos**: `GET` cualquier rol; `PATCH` solo `ADMINISTRADOR` (reforzado también ocultando el formulario, sección 3).
- **Estados**: `loading` en la carga inicial; `busy`/`error`/`success` en el guardado.
- **Confirmaciones**: ninguna — es edición de datos institucionales, no una acción destructiva.
- **Validaciones**: `email` con formato válido si se completa; el resto, longitud razonable (el backend ya impone máximos por campo — el cliente no necesita duplicarlos byte a byte, alcanza con no bloquear al usuario innecesariamente).
- **Componentes reutilizados**: `useAsyncAction`, mismas clases que 5.1.
- **Criterios de aceptación**: un usuario no `ADMINISTRADOR` nunca ve el formulario editable; un `409` por CUIT duplicado (unicidad global) se muestra con el mensaje real del backend.

### 5.3 — Recuperar / Restablecer contraseña (`/recuperar-contrasena`, `/restablecer-contrasena`)

Dos rutas públicas, un mismo flujo funcional, sin estado compartido entre ellas (son dos visitas independientes, típicamente en dos sesiones de navegador distintas).

**`/recuperar-contrasena`**
- **Endpoint**: `POST /auth/recuperar-contrasena` — body `{ email }`.
- **Formulario**: un campo, `email`.
- **Acción**: enviar solicitud.
- **Respuesta**: siempre el mismo mensaje genérico que devuelve el backend ("Si el email corresponde a una cuenta, vas a recibir un enlace para recuperar el acceso") — el frontend no interpreta ni distingue el resultado, solo lo muestra tal cual. **Nunca** se agrega ningún indicio adicional (ni un `console.log`, ni un estado distinto) que revele si el email existía.
- **Estados**: `busy`/`success` (no hay `error` real de negocio que mostrar distinto del genérico — solo errores de red/formato).
- **Validaciones**: formato de email antes de enviar (mejora de UX, no reemplaza al backend).

**`/restablecer-contrasena`**
- **Endpoint**: `POST /auth/restablecer-contrasena` — body `{ token, nuevaContrasena }`.
- **Lectura del token**: **query string** (`?token=...`) — coincide exactamente con el formato del enlace que genera `NotificadorService.enviarRecuperacionContrasena` (`auth.service.ts`). Se lee con el mecanismo estándar de `react-router-dom` (`useSearchParams`), sin URL manual.
- **Formulario**: un campo, `nuevaContrasena`.
- **Acción**: confirmar nueva contraseña.
- **Estados**: `busy`/`error`/`success`.
- **Mensajes claros para token inválido/vencido**: el backend responde con el mismo mensaje genérico ("El enlace no es válido o ya expiró") para token inexistente, usado, vencido, o usuario inactivo — el frontend lo muestra tal cual, sin intentar distinguir el motivo (mismo principio de no revelar información que ya aplica el backend).
- **Validaciones**: `nuevaContrasena` con al menos 8 caracteres.
- **Después de restablecer**: redirigir a `/login` con un mensaje de éxito breve (ej. vía un parámetro de navegación o un estado de `success` mostrado antes de redirigir) — no inicia sesión automáticamente, el usuario hace login normal con su nueva contraseña.
- **Componentes reutilizados (ambas rutas)**: `useAsyncAction`, patrón visual de `Login.tsx` (`.login-page`/`.login-card`, sección 6).
- **Criterios de aceptación**: ningún paso revela si un email existe; un token ya usado o vencido muestra el mismo mensaje que uno inexistente; el flujo completo (solicitar → recibir enlace → restablecer → login) funciona de punta a punta en desarrollo (en producción, sujeto a la dependencia de la sección 9).

### 5.4 — Aceptar invitación (`/aceptar-invitacion`)

- **Endpoints**: `GET /usuarios/invitaciones/:token` (validación + datos mínimos), `POST /usuarios/invitaciones/:token/aceptar` (body `{ contrasena }`).
- **Lectura del token**: la ruta del frontend lo recibe por **query string** (`?token=...`, mismo formato que genera `NotificadorService.enviarInvitacionUsuario`), pero **el backend lo espera como parámetro de path** (`/usuarios/invitaciones/:token`, no query string) en ambas llamadas. El frontend debe leer el token de `useSearchParams` y componer la URL del endpoint con ese valor como segmento de path — es la única traducción de formato necesaria en las 7 pantallas.
- **Secuencia**: al montar la pantalla, se llama primero a `GET /usuarios/invitaciones/:token`. Si responde `200`, se muestran sus datos mínimos (`organizacion`, `email`) junto al formulario de contraseña. Si responde `400` (enlace inválido o vencido), se muestra ese mensaje y no se renderiza ningún formulario.
- **Datos mostrados**: nombre de la organización y email de la invitación (de solo lectura, no editables — son los que el backend ya fijó).
- **Formulario**: un campo, `contrasena` (define la contraseña de la cuenta que se crea recién al aceptar).
- **Acción**: aceptar invitación.
- **Después de aceptar**: redirigir a `/login` (el `Usuario` recién creado inicia sesión normalmente, no hay sesión automática — mismo criterio que 5.3).
- **Nunca mostrar**: el token ni ningún hash — el token ya está en la URL por necesidad del enlace, pero no se re-expone en ningún mensaje, log de consola, ni se envía a ningún destino salvo el propio `path` de las dos llamadas al backend.
- **Estados**: `loading` durante la validación inicial; `busy`/`error`/`success` en la aceptación.
- **Validaciones**: `contrasena` con al menos 8 caracteres.
- **Componentes reutilizados**: `useAsyncAction`, patrón visual de `Login.tsx`, mismo patrón de estado condicional cargando/válido/inválido ya usado en `ViajeDetalle.tsx:66-67`.
- **Criterios de aceptación**: un token alterado o ya usado nunca llega a mostrar el formulario de contraseña; tras aceptar, un login inmediato con la nueva contraseña funciona.

### 5.5 — Administración de Usuarios (`/administracion/usuarios`)

- **Endpoints**: `GET /usuarios` (listado), `POST /usuarios` (alta directa, ya existente desde 9.1), `POST /usuarios/invitaciones` (invitación, 9.6), `PATCH /usuarios/:id` (editar nombre/email/rol), `PATCH /usuarios/:id/activo` (activar/desactivar), `POST /usuarios/:id/restablecer-acceso`.
- **Datos mostrados**: tabla con `nombre`, `email`, `rol`, `activo` de todos los usuarios de la organización (`GET /usuarios` ya trae exactamente estos 4 campos más `id`).
- **Dos mecanismos de alta, ambos visibles y distinguidos con claridad** (el backend expone los dos, con comportamiento distinto — el frontend no elige por el usuario):
  - **Alta directa** (`POST /usuarios`): formulario de `nombre`/`email`/`rol`; la respuesta incluye `tokenActivacion` en texto plano. **Debe mostrarse una sola vez**, en pantalla, con una acción de copiar — es la única vía hoy para que un `ADMINISTRADOR` entregue el acceso a alguien de forma manual mientras no exista un proveedor de email real (sección 9). No se guarda en ningún estado persistente del cliente más allá de esa vista puntual, y nunca se escribe en consola.
  - **Invitación** (`POST /usuarios/invitaciones`): mismo formulario (`nombre`/`email`/`rol`); la respuesta **no** incluye ningún token (diseño intencional del backend) — el mensaje debe dejar claro que la persona invitada recibirá un enlace "cuando el envío esté configurado", sin prometer una entrega inmediata (mismo criterio de la sección 9).
- **Edición**: formulario de `nombre`/`email`/`rol` sobre un usuario existente (`PATCH /usuarios/:id`).
- **Activar/Desactivar**: acción por fila (`PATCH /usuarios/:id/activo`).
- **Restablecer acceso**: acción por fila sobre un usuario existente (`POST /usuarios/:id/restablecer-acceso`) — misma pantalla de "mostrar una sola vez" que el alta directa, porque devuelve un `tokenActivacion` nuevo.
- **Protección visual del último administrador**: si, en los datos ya cargados en pantalla, hay exactamente un usuario con `rol === "ADMINISTRADOR"` y `activo === true`, la acción de desactivarlo o cambiarle el rol se muestra deshabilitada con una advertencia visible. **Esto es una ayuda de UX, no una validación real** — se calcula sobre el último listado cargado en el cliente, que puede estar desactualizado; el intento igual se envía al backend si se fuerza, y la respuesta real (`400`, con el mensaje ya definido en 9.1) es la que decide. Nunca se asume que el chequeo del cliente reemplaza al del backend.
- **Permisos**: toda la pantalla, `ADMINISTRADOR` únicamente.
- **Estados**: `loading` en la carga del listado; `busy`/`error`/`success` por cada acción (alta, invitar, editar, activar/desactivar, restablecer acceso) — instancias separadas de `useAsyncAction` o una compartida con cuidado de no cruzar mensajes entre acciones distintas.
- **Confirmaciones** (`useConfirm`, con `severity: "high"` donde aplique): desactivar un usuario; cambiar el rol de un `ADMINISTRADOR` a otro rol (usar `requireMotivo` si se quiere dejar rastro del porqué, opcional — no lo exige el backend).
- **Validaciones**: `email` con formato válido; `rol` restringido a los 6 valores del enum (un `<select>`, nunca texto libre — elimina la posibility de un rol inválido del lado del cliente, aunque el backend igual lo valida).
- **Componentes reutilizados**: patrón config-driven de `Catalogos.tsx:4-32,76-90` para el formulario de alta/edición (campos como datos: `nombre`, `email`, `rol`), `useConfirm`, `useAsyncAction`.
- **Criterios de aceptación**: alta directa e invitación conviven como dos acciones claramente distintas, nunca mezcladas en un solo formulario; ningún token queda visible después de salir de la pantalla o recargarla; la advertencia de último administrador nunca reemplaza el rechazo real del backend.

### 5.6 — Auditoría Administrativa (`/administracion/auditoria`)

- **Endpoint**: `GET /organizacion/auditoria` — query params `usuarioId`, `entidad`, `entidadId`, `accion`, `fechaDesde`, `fechaHasta`, `page`, `limit`.
- **Datos mostrados**: tabla con `fecha`, `accion`, `entidad`, `entidadId`, y `usuario.nombre`/`usuario.email` (el actor, cuando existe) — los mismos campos que el endpoint ya devuelve, sin agregar ninguno.
- **Filtros**: los 6 que el backend soporta, mismo patrón visual `.filters` ya usado en `Viajes.tsx:40-68` (inputs de fecha, selects/inputs de texto, botón "Filtrar").
- **Paginación real**: el único componente genuinamente nuevo de todo el diseño (sección 8) — controles de página anterior/siguiente y un indicador de página actual/total, construidos sobre `pagina`/`limite`/`total` que el backend ya devuelve.
- **Acciones**: ninguna — es 100% consulta. **Sin exportación, sin acciones masivas**, tal como fija la instrucción.
- **Permisos**: `ADMINISTRADOR` únicamente.
- **Estados**: `loading` en cada carga (inicial y por cambio de filtro/página); `error` si la consulta falla.
- **Confirmaciones**: ninguna.
- **Validaciones**: `fechaDesde` no posterior a `fechaHasta` (validación de UX; el backend no la exige explícitamente pero evita una consulta sin sentido).
- **Componentes reutilizados**: patrón `.filters` de `Viajes.tsx`, patrón de tabla estándar (sección 6), `useAsyncAction`.
- **Criterios de aceptación**: los 6 filtros combinan correctamente (AND, igual que el backend); cambiar de página no pierde los filtros activos; el total mostrado coincide con el que devuelve la API.

---

## 6. Componentes reutilizados (confirmación explícita)

Sin excepciones — los 7 diseños de la sección 5 usan exclusivamente: `Layout` (shell de las 4 rutas autenticadas), `ConfirmProvider`/`useConfirm` (5.5), `useAsyncAction` (las 7 pantallas), `api` (sin cambios, las 7 pantallas), el patrón visual de `Login.tsx` (las 3 rutas públicas), el patrón config-driven de `Catalogos.tsx` (5.5), y las clases CSS ya existentes en `styles.css` (`.card`, `.page-header`, `.section-title`, `.form-grid`/`.field`, `.filters`, `.btn`/variantes, `.error-banner`/`.success-banner`, `table`/`thead`/`tbody`, `.muted`). **No se introduce Material UI, Ant Design, React Hook Form, Redux, ni ninguna librería de tablas — no apareció ningún conflicto técnico real que lo justificara.**

---

## 7. Componentes compartidos mínimos que conviene extraer

Extracción liviana, sin dependencia nueva — factorizar JSX que hoy solo existe una vez (`Login.tsx`) o que no existe en absoluto:

1. **Envoltorio de página pública** (`.login-page`/`.login-card`) — extraerlo de `Login.tsx` a un componente pequeño y reutilizarlo en las 3 rutas públicas nuevas, en vez de copiar el mismo JSX 3 veces (principio ya escrito: "un hecho se registra una sola vez", `CONSTITUCION_SDC.md`, Artículo 7.3).
2. **Control de paginación** — genuinamente nuevo (sección 5.6), no hay ningún precedente que copiar. Componente chico: anterior/siguiente + "página X de Y" + total, recibiendo `pagina`/`limite`/`total` y un callback de cambio de página.
3. **Lista de opciones de rol** (`RolNombre`, los 6 valores) — hoy no existe en ningún lado del frontend porque ninguna pantalla usa roles todavía; se necesita en al menos 2 lugares de 5.5 (alta y edición) — conviene declararla una sola vez, no repetirla.
4. **Clases de `badge` nuevas** (no un componente, extensión de `styles.css:82-97`) — un color por `RolNombre` (6 valores) para la tabla de usuarios, y opcionalmente uno para el estado de una invitación pendiente si se decide mostrarlo en 5.5 (el backend hoy no expone un listado de invitaciones pendientes como tal — ver sección 9).

Ninguno de los cuatro es una librería ni un sistema de diseño nuevo — son extracciones locales dentro del mismo enfoque ya usado en todo el frontend.

---

## 8. Manejo de errores

Mismo patrón ya validado en producción (`useAsyncAction`, `err.response.data.message`) en las 7 pantallas, sin ninguna variante nueva, con una única adición: en `/administracion/usuarios` y `/administracion/auditoria`, si una llamada devuelve `403` (caso de acceso directo por URL de un rol no autorizado — el escenario que la auditoría señaló sin resolver, sección 3 del documento aprobado), se muestra un mensaje fijo y claro ("No tenés permiso para ver esta sección") en vez del mensaje crudo del backend ("Forbidden resource") — la única lógica de error nueva de todo este diseño, acotada a esos dos casos.

En las 3 rutas públicas, ningún error de negocio revela información sensible (existencia de cuenta, motivo exacto de un token inválido) — el frontend siempre muestra el mensaje genérico que el backend ya construyó para eso, nunca lo reinterpreta.

---

## 9. Validación

Antes de considerar cerrada la implementación de cada pantalla (`METODOLOGIA_SDC.md`, etapas 5-6), en el mismo espíritu ya aplicado a cada sub-bloque de Bloque 9:
- Build limpio de frontend (`tsc -b && vite build`) — nunca solo backend.
- Cada pantalla ejercitada en el navegador real, con las dos organizaciones de desarrollo ya existentes, no solo por `curl`.
- Regresión visual de las 16 páginas ya existentes (ninguna de las 7 pantallas nuevas toca `Layout.tsx`/`api/client.ts`/`AuthContext.tsx` de forma que pueda romper algo existente, pero se verifica igual, mismo criterio que toda mutación de un archivo compartido).
- Los 6 escenarios de seguridad que la auditoría exige verificar en pantalla, no solo por API: un rol no `ADMINISTRADOR` no ve las 2 pantallas restringidas ni sus entradas de menú; el formulario de `/organizacion` no aparece para quien no es `ADMINISTRADOR`; un token de invitación/recuperación alterado o vencido nunca llega a mostrar el formulario siguiente; ningún token queda visible en pantalla después de la acción que lo generó; el flujo completo de alta directa y de invitación quedan probados de punta a punta en desarrollo.

---

## 10. Riesgos

- **Proveedor real de email pendiente** (dependencia externa ya señalada en `ACTA_CIERRE_BLOQUE9.md` y en la auditoría de frontend): **Recuperar contraseña y Aceptar invitación pueden implementarse completamente en este frontend** — ambas pantallas quedan funcionales de punta a punta contra el backend real. Pero en producción, hasta que se configure un proveedor real, ningún destinatario recibe el enlace por ningún canal automático — la única vía hoy para que un `ADMINISTRADOR` entregue acceso en producción es el flujo de **alta directa** (5.5), que sí devuelve el token en la propia respuesta. Este diseño no resuelve el proveedor de email — es una decisión de negocio ya identificada, fuera de este documento.
- **Sin listado de invitaciones pendientes en el backend**: `GET /usuarios` solo devuelve `Usuario` reales — una invitación creada y no aceptada no aparece en ningún listado hoy (es coherente con la decisión de 9.6 de no crear el `Usuario` hasta aceptar). La pantalla de Administración de Usuarios no puede, por lo tanto, mostrar "invitaciones pendientes" como una lista — solo puede confirmar que una invitación se envió, en el momento de crearla. No es una falla de este diseño: es un límite real del backend, señalado acá para que no se asuma como pendiente de frontend.
- **`GET /usuarios` sin paginación ni búsqueda** (ya señalado en la auditoría): la tabla de 5.5 carga y renderiza el listado completo. Correcto para los volúmenes actuales; si crece de forma significativa, requeriría una decisión de backend fuera de este diseño.

---

## 11. Criterios de cierre del Frontend Administrativo

El bloque de frontend administrativo de Bloque 9 puede darse por cerrado cuando las 7 pantallas de la sección 5 cumplen, cada una, su propio criterio de aceptación, y además:
- Ningún endpoint de los 16 de Bloque 9 queda sin una forma de usarse desde la interfaz.
- Ningún rol ve, en el menú o por URL directa, una acción que el backend le rechazaría — verificado en pantalla, no asumido.
- Ningún secreto (token de activación, token de invitación, token de recuperación, hash de cualquier tipo) queda expuesto más allá del momento y la pantalla exactos en que el propio backend ya lo expone hoy.
- Build limpio de frontend y backend, sin regresión sobre las 16 pantallas ya existentes.
- El riesgo del proveedor de email (sección 10) queda documentado como conocido, no oculto — no es condición de cierre de este bloque, exactamente igual que no lo fue para el cierre de Bloque 9 en el backend.

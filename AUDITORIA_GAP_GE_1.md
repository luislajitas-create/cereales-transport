# GAP-GE-1 — Flujo visual de Grupo Económico

Estado: implementado, validado en entorno local (`npm run start:dev` / `npm run dev` sobre Postgres local) y con sus datos de prueba locales ya eliminados. Base: commit `1bfbf21` (HEAD de `main` al momento de iniciar el bloque). **Nunca hubo escritura alguna en producción.**

## 1. Causa raíz

El incidente reportado por Luis ("Tu organización no pertenece a ningún grupo económico", sin forma de cargar el segundo CUIT) **no era un bug de backend ni un problema de permisos**. La auditoría de producción (ver conversación previa) confirmó:

- Producción tiene una sola `Organizacion`, cero `GrupoEconomico`, cero `AccesoGrupoEconomico`.
- Los 4 usuarios existentes están en la misma organización; 3 de 4 (Luis, Franco, Admin Producción) son `ADMINISTRADOR` y podrían administrar un grupo si existiera uno.
- El backend soporta el flujo completo desde el Bloque 10.1 (`POST /organizaciones`, `POST /grupo-economico`, `POST /grupo-economico/:id/organizaciones`, `GET /grupo-economico/organizaciones-accesibles`) — nada de esto es nuevo.

**Causa real: `GrupoEconomico.tsx` nunca implementó los formularios de creación/unión**, y no existía ninguna pantalla de alta de organización en el frontend pese a que el endpoint público ya existía. El mensaje que veía Luis era el comportamiento correcto dado el estado real de la base — el defecto era la ausencia total de un camino de UI para cambiar ese estado.

## 2. Flujo anterior (incompleto)

```
Organizacion sin grupo
  -> GrupoEconomico.tsx: "Tu organización no pertenece a ningún grupo económico."
  -> (fin — sin ningún control, ADMINISTRADOR o no)
```

Crear un grupo o sumar una segunda organización solo era posible con una llamada API directa (Postman/curl), nunca desde la aplicación.

## 3. Solución implementada

Ningún endpoint de backend cambió. Todo el trabajo fue frontend, reutilizando el contrato existente:

| Endpoint (ya existente, sin cambios) | Consumido ahora desde |
|---|---|
| `POST /organizaciones` (público) | `AltaOrganizacion.tsx` (nuevo) |
| `POST /grupo-economico` | `GrupoEconomico.tsx` — "Crear Grupo Económico" |
| `POST /grupo-economico/:id/organizaciones` | `GrupoEconomico.tsx` — "Unirse a un Grupo Económico existente" |
| `GET /grupo-economico` | sin cambios (ya se usaba) |
| `POST /grupo-economico/:id/accesos` | sin cambios (ya se usaba, "Otorgar acceso") |
| `GET /grupo-economico/organizaciones-accesibles` | sin cambios (selector de `Layout.tsx`) |

### Circuito completo, ahora navegable sin herramientas técnicas

1. Admin de Org A crea el grupo (`GrupoEconomico.tsx`, sin grupo → "Crear Grupo Económico").
2. Copia el "Código del Grupo Económico" (el `id` real del grupo, relabeleado en la UI — nunca se lo llama "id"/"UUID"; nunca se modificó el schema).
3. Se registra la segunda organización en `/alta-organizacion` (pública, accesible desde Login con el link "Registrar una nueva organización"), con su propio CUIT y su propio administrador.
4. Ese administrador inicia sesión y en Grupo Económico usa "Unirse a un Grupo Económico existente", pegando el código.
5. Desde esa misma pantalla (ya con grupo), otorga acceso al usuario de la organización original — este paso reutiliza el formulario "Otorgar acceso" que ya existía sin cambios.
6. El admin original vuelve a entrar (o recarga) y el selector de organización de `Layout.tsx` (ya existente, sin cambios) muestra ambas.

Validado end-to-end en el punto 6 de este documento.

## 4. Archivos nuevos y modificados

**Nuevos:**
- `frontend/src/pages/alta-organizacion-payload.ts` — lógica pura: payload de `POST /organizaciones`, validación de confirmación de contraseña.
- `frontend/src/pages/alta-organizacion-payload.test.mjs` — 10 pruebas (`node:test`).
- `frontend/src/pages/AltaOrganizacion.tsx` — pantalla pública `/alta-organizacion`.
- `frontend/src/pages/grupo-economico-payload.ts` — lógica pura: validación de nombre de grupo, formato/normalización del código de grupo.
- `frontend/src/pages/grupo-economico-payload.test.mjs` — 11 pruebas (`node:test`).

**Modificados:**
- `frontend/src/pages/GrupoEconomico.tsx` — formularios "Crear Grupo Económico" / "Unirse a un Grupo Económico existente" (solo cuando `!grupo` y `usuario.rol === "ADMINISTRADOR"`, segunda barrera explícita además de `ProtectedRoute`); caja "Código del Grupo Económico" con botón "Copiar código" (visible solo para `ADMINISTRADOR`, nunca en `localStorage`, nunca en mensajes de error).
- `frontend/src/App.tsx` — ruta pública `/alta-organizacion`, fuera de `<Layout>`.
- `frontend/src/pages/Login.tsx` — link "Registrar una nueva organización".
- `frontend/src/styles.css` — `.login-card.wide` (formulario con más campos), `.codigo-grupo` (caja del código).

**Backend: sin cambios.** Se releyeron DTOs, controllers, guards (`RolesGuard`, `JwtAuthGuard`), `PrismaExceptionFilter`/`prisma-mensajes.ts` y el throttling de `POST /organizaciones` — todo ya cubría lo necesario.

## 5. Seguridad

- `POST /grupo-economico` y `POST /grupo-economico/:id/organizaciones` siguen exigiendo autenticación (`JwtAuthGuard`) y `ADMINISTRADOR` (`RolesGuard`) — no se tocó ningún guard.
- La pantalla `GrupoEconomico.tsx` completa ya estaba restringida a `ADMINISTRADOR` por `ProtectedRoute` (`App.tsx`); se agregó además un chequeo explícito de rol antes de renderizar los formularios nuevos (cinturón y tirantes, mismo criterio que ya usaba el archivo).
- **El código del grupo (`grupo.id`) es una credencial operativa permanente, no una invitación temporal ni revocable con el diseño actual.** Cualquiera que lo obtenga puede incorporar una organización al grupo mientras el grupo exista — no hay forma de rotarlo, expirarlo ni invalidarlo sin tocar el dato en base. La UI ahora lo dice explícitamente en pantalla. Nunca se persiste en `localStorage`/`sessionStorage`, nunca aparece en un mensaje de error ni se registra en consola/logs (confirmado por grep: cero `console.*`/`logger.*` en todo `backend/src/grupo-economico/`, y ningún interceptor de logging de requests en el backend). Solo se muestra en pantalla a un `ADMINISTRADOR` autenticado de una organización miembro del grupo.
- El botón "Copiar código" ahora distingue éxito ("Código copiado") de fallo real de `navigator.clipboard` (mensaje funcional pidiendo copiar manualmente, sin loguear el valor ni guardarlo en ningún storage como fallback).
- **Entropía del código**: es el `id` real de `GrupoEconomico`, generado por `@default(uuid())` de Prisma (UUID v4, ~122 bits de entropía) — no adivinable por fuerza bruta en un tiempo práctico.
- **Imposibilidad estructural de pertenecer a dos grupos a la vez**: `Organizacion.grupoEconomicoId` es un campo único nullable (no una relación many-to-many) — el propio schema, no solo la lógica del controller, hace imposible que una organización tenga dos grupos simultáneos.
- Doble submit: cubierto por `useAsyncAction` (mismo mecanismo — ref, no estado — que ya usa el resto de la app) en los tres formularios nuevos/reutilizados.
- **`POST /organizaciones` (alta self-service, público) — rate limiting verificado empíricamente, no solo leído en el código** (ver sección 8): `ThrottlerGuard` propio, límite real confirmado de 5 intentos / 15 minutos, devuelve `429` con `Retry-After` y mensaje funcional en español a partir del 6º intento en la ventana. Sigue teniendo, además, **honeypot** (`dto.sitioWeb` — un bot que autocompleta todos los campos del formulario cae en un campo invisible; la UI nueva nunca renderiza ese campo, así que ni siquiera aparece en el DOM para un usuario real) y **protección de duplicados a nivel de base de datos** (`Organizacion.cuit` y `Usuario.email` son `@unique`; el pre-chequeo explícito da un mensaje claro, y si dos altas concurrentes pasaran ese pre-chequeo a la vez, la restricción única de Postgres sigue evitando el duplicado, mapeada a 409 por el filtro global). No existe, deliberadamente, ningún control adicional (CAPTCHA, aprobación manual, límite de organizaciones por dominio de email) — es la misma superficie de protección que ya tenía el endpoint antes de este bloque; no se agregó ni se relajó nada.
- La normalización/validación real del CUIT (solo dígitos, dígito verificador módulo 11) sigue viviendo exclusivamente en el backend (`AltaOrganizacionDto`); el frontend nunca reformatea el CUIT, evitando duplicar esa regla.
- Política de contraseña sin cambios respecto del resto de la app: `@MinLength(8)`, sin requisitos de complejidad — mismo criterio que `AceptarInvitacion.tsx`/`RestablecerContrasena.tsx`.
- No se relajó ningún guard de backend. No se agregó ningún camino nuevo de escritura — todo pasa por endpoints ya auditados en Bloques 10.1–10.4.

## 6. Validación

### Automatizada
- `npm run test:dev1` (raíz del repo) — **14/14 OK.**
- `backend`: `npm run build` (nest build) — OK.
- `backend`: `npx jest --no-cache` (suite completa, sin caché) — **56 suites / 751 tests, 56/56 y 751/751 OK — coincide exactamente con el baseline informado (56 suites / 751 tests), cero diferencias, cero regresión.**
- `frontend/src/pages/alta-organizacion-payload.test.mjs` — 10/10 OK.
- `frontend/src/pages/grupo-economico-payload.test.mjs` — 11/11 OK.
- `frontend/src/pages/organizacion-payload.test.mjs` (preexistente, CAT-6) — 13/13 OK, sin regresión.
- `frontend`: `npm run build` (`tsc -b && vite build`) — OK, sin errores de tipos.
- `git diff --check` — sin errores de espacio en blanco (solo warning esperable de CRLF en Windows).
- Búsqueda de secretos/CUIT/email/UUID de prueba en el diff trackeado y en este documento — sin coincidencias (el único hallazgo, un fragmento de dominio de email de prueba en una versión anterior de este mismo documento, ya se corrigió).

### Manual, end-to-end, contra el entorno local real (Postgres local + `start:dev` + `vite dev`, nunca producción)
Circuito completo ejecutado en el navegador contra datos de desarrollo (usuario seed `admin@demo.com`, que ya pertenecía a "Grupo Económico Demo" preexistente en desarrollo):

1. **Código del Grupo Económico**: cargó correctamente para `admin@demo.com` (grupo preexistente en dev), botón "Copiar código" funcionó (feedback "Copiado" verificado).
2. **Alta de organización** (`/alta-organizacion`, datos de prueba, nunca reales): primer intento con un CUIT ya usado en la base de desarrollo devolvió correctamente *"Ya existe una organización registrada con ese CUIT."* (mensaje específico del backend, no genérico) — confirmado que el formulario **preserva todos los valores cargados** tras un error. Segundo intento con un CUIT de prueba distinto, con dígito verificador válido (nunca real, generado con el mismo algoritmo módulo 11 del backend) → alta exitosa, pantalla de éxito, sin auto-login (conforme a que el endpoint no devuelve token).
3. **Login** con el nuevo administrador → `GrupoEconomico.tsx` mostró correctamente el estado "sin grupo" con **ambos formularios nuevos** ("Crear Grupo Económico" / "Unirse a un Grupo Económico existente").
4. **Unirse a un grupo existente**: pegado el código copiado en el paso 1 → diálogo de confirmación con el texto esperado → confirmado → la organización quedó incorporada a "Grupo Económico Demo" (verificado por el cambio de pantalla al estado "con grupo").
5. **Otorgar acceso**: desde la organización recién unida, se buscó por email a `admin@demo.com` y se le otorgó acceso (diálogo de confirmación, banner "Acceso otorgado.", fila nueva en "Accesos vigentes").
6. **Selector de organización**: se volvió a iniciar sesión como `admin@demo.com` → el selector en el sidebar (antes texto fijo, con una sola organización) pasó a ser un `<select>` con **3 organizaciones** ("Organización Principal", "Org B GAP-GE-1 Test" recién creada, y una tercera preexistente del mismo grupo) — confirma que el mecanismo ya documentado de `Layout.tsx`/`useOrganizacionesAccesibles` funciona sin ningún cambio de código, una vez que el grupo y el acceso existen.

Ningún paso requirió Postman, curl ni ninguna herramienta fuera de la aplicación.

Los servidores locales (`start:dev`, `vite dev`) se detuvieron al terminar cada tanda de pruebas.

## 7. Por qué el selector mostró 3 organizaciones, no 2

El usuario `admin@demo.com` ya tenía, **antes de esta validación**, un `AccesoGrupoEconomico` preexistente (creado 2026-07-19, en una sesión de validación anterior, Bloque 10.3b/10.4) hacia una segunda organización del mismo grupo ("Organización B - Grupo Económico"). Es decir, el baseline real de desarrollo, antes de tocar nada en este bloque, ya tenía **2** organizaciones accesibles para ese usuario (la propia + esa preexistente) — no 1. Este bloque agregó una tercera (la organización de prueba creada en el paso 2, con acceso otorgado en el paso 5). El selector con 3 es la suma correcta de ambas cosas, no un error.

## 8. Limpieza de datos de prueba en localhost — narración completa

Todo lo que sigue ocurrió exclusivamente contra la base de desarrollo local (`DATABASE_URL` con host `localhost`/`127.0.0.1`, verificado explícitamente antes de cada escritura). En ningún momento de este proceso se tocó producción.

**A. Auditoría previa, de solo lectura.** Antes de escribir nada, se reconciliaron por nombre + CUIT + email + organización + horario todos los registros involucrados, contra la base de desarrollo local completa:

| Registro | Origen | Creado |
|---|---|---|
| `GrupoEconomico` "Grupo Económico Demo" | Histórico, preexistente | 2026-07-18 |
| `Organizacion` "Organización Principal" (home de `admin@demo.com`) | Histórico, preexistente | 2026-07-18 |
| `Organizacion` "Organización B - Grupo Económico" | Histórico, preexistente | 2026-07-18 |
| `AccesoGrupoEconomico` de `admin@demo.com` → "Organización B..." | Histórico, preexistente | 2026-07-19 |
| Organización de prueba | Generado por esta validación | 2026-08-10 |
| Usuario administrador de esa organización de prueba | Generado por esta validación | 2026-08-10 |
| Acceso de `admin@demo.com` → organización de prueba | Generado por esta validación | 2026-08-10 |
| 3 filas de `AuditLog` (`organizacion_creada_selfservice`, `grupo_economico_organizacion_asociada`, `acceso_grupo_otorgado`), las 3 con `organizacionId` = la organización de prueba y `usuarioId` = el usuario de prueba | Generadas por esta validación | 2026-08-10 |

Se confirmó además: cero `Viaje`/`AnticipoGasto`/`Liquidacion`/`Factura`/`Cobranza`/`Cliente`/`Transportista`/`Chofer`/`Vehiculo`/`LiquidacionMovimiento` dependientes de la organización de prueba; exactamente 1 usuario en ella; exactamente 1 acceso hacia ella. Ninguna otra organización/usuario "de aspecto temporal" ya existente en la base (hay varias, de sesiones de validación previas — CAT, Bloque 8/9/10, etc.) fue tocada ni considerada parte de este bloque.

**B. Primer intento de limpieza, sin tocar `AuditLog`.** Con esa reconciliación ya hecha, se intentó una limpieza transaccional que preservaba las filas de auditoría: borrar el acceso, el usuario y la organización de prueba, sin tocar `AuditLog`. El borrado del usuario abortó con `P2003` (violación de foreign key): `AuditLog.usuario` (relación compuesta `[usuarioId, organizacionId]`, sin `onDelete: Cascade`/`SetNull`) seguía referenciando a ese usuario a través de las 3 filas de auditoría generadas por sus propias acciones. Al correr dentro de una transacción Prisma, el rollback fue automático y completo — una consulta de solo lectura posterior confirmó que ni siquiera el acceso (borrado con éxito en un paso intermedio de esa misma transacción) había quedado eliminado: no quedó ningún estado parcial.

**C. Decisión.** Ante ese bloqueo, se reportó sin forzar nada. Luis autorizó entonces, de forma excepcional y puntual, eliminar también las 3 filas de `AuditLog` — exclusivamente esas 3, identificadas por su `id` real, generadas artificialmente por esta validación en localhost el 2026-08-10. **Esta autorización es local y puntual: no aplica a producción y no cambia la política general del proyecto de no borrar `AuditLog`.**

**D. Limpieza final, ya autorizada — una única transacción Prisma.** Con abort automático si cualquier verificación no coincidía exactamente con lo reconciliado en el paso A: `AuditLog.deleteMany` (las 3 filas por `id` exacto, con verificación de que el conteo borrado fuera exactamente 3) → `AccesoGrupoEconomico.delete` (el acceso de prueba) → `Usuario.delete` (el administrador de prueba) → `Organizacion.delete` (la organización de prueba). El `GrupoEconomico` preexistente no se tocó, no se desasoció y no se modificó en ningún momento.

**E. Verificación posterior, de solo lectura.** Todo confirmado:
- Organización, usuario y acceso de prueba: **0** (los 3 `findUnique` por id devuelven `null`).
- Las 3 filas de `AuditLog` de prueba: **0** (`findUnique` por cada id devuelve `null`); **0** filas de `AuditLog` restantes que referencien el id de la organización de prueba.
- `GrupoEconomico` "Grupo Económico Demo" y sus 2 miembros históricos ("Organización Principal", "Organización B - Grupo Económico"): intactos, mismo nombre, misma fecha, misma membresía.
- Acceso histórico de `admin@demo.com` hacia "Organización B - Grupo Económico" (2026-07-19): intacto.
- Selector de organizaciones de `admin@demo.com`: **2** — baseline restaurado exactamente al valor de antes de esta validación.
- Búsqueda de rastros del nombre/CUIT/email de prueba en toda la base local: **0** coincidencias.
- Producción: nunca modificada, en ningún paso de la A a la E.

Los 3 scripts usados (verificación previa, limpieza, verificación posterior) eran temporales y se eliminaron inmediatamente después de ejecutarse — ninguno llegó a formar parte del repositorio.

## 9. Deuda futura, no bloqueante

El diseño actual de "Código del Grupo Económico" (Bloque 10.1, sin cambios en este bloque) es una credencial permanente y no revocable — quien la tenga puede unir una organización al grupo sin que el grupo "receptor" apruebe nada del otro lado. Evaluar en un bloque futuro (no ahora, no implementado, solo registrado como pendiente):
- Invitaciones de un solo uso o con expiración, en vez de un código reutilizable indefinidamente.
- Aprobación explícita del lado receptor del grupo antes de que la organización nueva quede incorporada (hoy `asociar()` es unilateral: la organización que tiene el código se suma sin que nadie del grupo lo confirme).
- Posibilidad de rotar/invalidar el código sin borrar el grupo.

## 10. Procedimiento manual final (para producción, pendiente de autorización aparte)

Sin cambios respecto de lo ya propuesto en el diagnóstico original — el circuito de la sección 3 de este documento es, ahora, literalmente ejecutable desde la interfaz en producción una vez que Luis autorice usar el CUIT y los datos reales de la segunda organización. Nada de este bloque autoriza esa ejecución por sí solo.

## 11. Incidente productivo — errores invisibles en el alta de organización (GAP-GE-1-UX)

**El incidente.** Tras el deploy `b73f266`, Luis completó `/alta-organizacion` y pulsó "Registrar organización", pero la pantalla no mostró ninguna confirmación — ni éxito ni error — y permaneció en el mismo formulario.

**Confirmación de cero escrituras, antes de tocar nada.** Se auditó producción por `SELECT` de solo lectura: logs HTTP del backend sin ninguna coincidencia de `POST /api/v1/organizaciones` en una ventana de 12 horas (ni siquiera el `OPTIONS` de preflight) — la request nunca salió del navegador. La base de datos seguía con **exactamente 1** organización y **ningún** administrador nuevo. No hubo ninguna escritura, ni local ni en producción, asociada a este incidente.

**Causa raíz.** El formulario tiene 9 campos y es más alto que la pantalla en la mayoría de los tamaños de ventana; el botón "Registrar organización" queda al final, lejos del banner de error, que se renderizaba únicamente arriba de todo (justo debajo del título). Cuando la validación de confirmación de contraseña fallaba del lado del cliente (o, potencialmente, un error real de backend), el mensaje aparecía fuera de la vista de quien estaba parado junto al botón, sin ningún desplazamiento ni foco que lo hiciera notar. El componente nunca perdía los datos cargados ni fallaba silenciosamente — el problema era exclusivamente de visibilidad.

**Corrección.**
- `AltaOrganizacion.tsx`: los dos mensajes de error (`errorConfirmacion` del lado cliente y el `error` de `useAsyncAction` del lado backend) se unificaron en un único contenedor con `role="alert"`, `aria-live="assertive"` y `tabIndex={-1}`. Un `useEffect` dispara `scrollIntoView({ behavior: "smooth", block: "center" })` y mueve el foco a ese contenedor apenas aparece cualquiera de los dos mensajes. El error de confirmación de contraseña ahora se limpia únicamente cuando se modifica una de las dos contraseñas (antes se limpiaba con cualquier campo); un error de backend de un intento anterior se descarta si aparece un nuevo error de validación del cliente, para no mostrar dos mensajes a la vez. La validación nativa del navegador (`required`, `type="email"`, `minLength`) sigue intacta, sin tocar ningún atributo. El formulario nunca se vacía ante un error — eso ya funcionaba antes y se conserva. Doble submit sigue cubierto por el mismo mecanismo de `useAsyncAction` de siempre.
- `styles.css`: `.login-page` pasó de `height: 100vh` a `min-height: 100vh` más `padding: 2rem 1rem` — un `height` fijo dejaba parte de una tarjeta más alta que la pantalla arriba del borde superior visible. Es un cambio en una clase compartida con Login/RecuperarContrasena/RestablecerContrasena/AceptarInvitacion; en esas pantallas, cuyo contenido entra sobrado en el viewport, el cambio no altera nada visualmente — `min-height` sigue forzando el mismo alto mínimo y el centrado sigue idéntico.

**Validación local (sin crear ningún dato, ni siquiera local).** Contra `localhost`, formulario completado con datos ficticios, posicionado junto al botón antes de cada envío:
- **Caso A — contraseñas distintas:** cero requests de red hacia `/organizaciones` (confirmado leyendo la cola de red del navegador); la pantalla se desplazó suavemente hasta el mensaje; `document.activeElement` fue efectivamente el contenedor del error (confirmado por script); los valores cargados se conservaron intactos.
- **Caso B — contraseña de menos de 8 caracteres:** mismo resultado — cero requests, mismo desplazamiento y foco, mismo mensaje específico, formulario intacto.
- **Caso C — error de backend simulado:** se interceptó localmente, a nivel de `XMLHttpRequest` en el propio navegador, la request hacia `/organizaciones` para forzar un error de red sin que llegara jamás al backend real (confirmado también en los logs del backend local: ninguna entrada nueva). Mismo comportamiento: desplazamiento, foco y mensaje visibles, formulario conservado. No se creó ninguna organización real, ni en producción ni en desarrollo, en ningún momento de esta validación.

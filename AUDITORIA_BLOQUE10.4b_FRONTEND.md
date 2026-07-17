# Auditoría — Bloque 10.4.b: Frontend del Cambio de Organización

Fecha: 2026-07-17. Etapa de Auditoría únicamente — `METODOLOGIA_SDC.md`, etapa 1. **No se propone solución, no se diseña, no se implementa, no se abre ninguna decisión técnica, no se modifica ningún archivo, no se hace git.** Releídos frescos, en esta sesión: `CONSTITUCION_SDC.md`, `DISENO_BLOQUE10.4_FRONTEND.md`, `DECISIONES_TECNICAS_BLOQUE10.4.md`, `ACTA_CIERRE_BLOQUE10.4a.md`. Inspeccionado fresco, contra el código real: `AuthContext.tsx`, `Layout.tsx`, `App.tsx`, `main.tsx`, `api/client.ts`, `Login.tsx`, `ViajeForm.tsx`, `ConfirmDialog.tsx`, `useAsyncAction.ts`, `Organizacion.tsx`, `Perfil.tsx`, `styles.css` (bloque `.user-info`), `package.json` (versión de `react-router-dom`), y una búsqueda exhaustiva (`grep`) de `SessionProvider`, `beforeunload`, `storage`, `BroadcastChannel`, `localStorage` en todo `frontend/src`.

**Objetivo del bloque, tal como lo autorizaste:** selector de Organización, cambio de contexto, sincronización entre pestañas, comportamiento asociado del frontend — Decisiones Técnicas 3 a 8 de `DECISIONES_TECNICAS_BLOQUE10.4.md`.

---

## Respuestas a las 10 preguntas, con evidencia

### 1. Estado actual del frontend

- **Stack de routing:** `react-router-dom@6.28.0` (`package.json`), modo clásico (`<BrowserRouter>` + `<Routes>`/`<Route>` declarativos en `App.tsx`/`main.tsx`) — **no** el data router (`createBrowserRouter`, `loader`/`action`) de React Router 6.4+. No hay `loaders` ni `actions` en uso en ningún lado del proyecto.
- **Montaje:** `main.tsx` → `<BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>`, con `React.StrictMode` activo (implica doble montaje/desmontaje de efectos en desarrollo — relevante para cualquier `useEffect` con listener que se agregue en 10.4.b, sección Riesgos).
- **No existe ningún archivo ni componente llamado `SessionProvider`** — `AuthContext.tsx`/`AuthProvider` cumple exactamente ese rol (identidad, token, `loading`, `login`/`logout`), confirmado por `grep` (cero coincidencias de `SessionProvider` en todo `frontend/src`).
- **`AuthContext.tsx` (releído completo, 57 líneas):** `Usuario` = `{ id, nombre, email, rol }` — **todavía sin `organizacionId`**, exactamente el desajuste que `DISENO_BLOQUE10.4_FRONTEND.md` sección 3 ya señaló como pendiente de corregir ("corrige el desajuste ya señalado en tres auditorías"). Sigue sin corregirse — no es un hallazgo nuevo, es la confirmación de que sigue vigente.
- **Token:** vive únicamente en `localStorage["token"]`, nunca en estado de React — confirmado, sin cambios respecto de auditorías previas.
- **`usuario`:** vive en `localStorage["usuario"]` (JSON) y en el estado de React (`useState`) simultáneamente — la fuente de verdad al montar es `localStorage`; después de eso, el estado de React es lo que consumen los componentes.
- **`loading`:** exclusivamente el de la lectura inicial de `localStorage` al montar `AuthProvider` — no existe ningún estado de "cargando" asociado a ningún cambio de sesión posterior (ni login, ni logout, ni — hoy — cambio de organización, porque no existe todavía).
- **Sin `beforeunload`, sin listener de `storage`, sin `BroadcastChannel` en ningún lugar del código actual** — confirmado por `grep`, cero coincidencias. El bloque completo de sincronización entre pestañas (Decisiones 6 y 7) no tiene ningún punto de partida existente; se construye desde cero.
- **Persistencia:** exactamente dos claves de `localStorage` en todo el frontend — `"token"` y `"usuario"` — usadas en exactamente 9 líneas reales, todas en `AuthContext.tsx` (6) y `api/client.ts` (3); confirmado por `grep` sobre `localStorage` en todo `frontend/src` (la única otra coincidencia es un comentario en `Usuarios.tsx` que aclara explícitamente que ese panel *no* usa `localStorage`).

### 2. Punto exacto donde debe vivir el selector

Confirmado, sin cambios respecto de lo ya identificado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` y ratificado en `DISENO_BLOQUE10.4_FRONTEND.md` sección 4: el bloque `.user-info` de `Layout.tsx`, líneas 43-48 exactas del archivo actual:

```tsx
<div className="user-info">
  <div>{usuario.nombre}</div>
  <div className="muted">{usuario.rol}</div>
  <NavLink to="/perfil">Mi perfil</NavLink>
  <button onClick={logout}>Cerrar sesión</button>
</div>
```

Estilado por `.sidebar .user-info` en `styles.css` (líneas 45-48) — bloque angosto (`230px` de ancho total de sidebar), con texto pequeño (`0.8rem`) y separador superior. Cualquier selector nuevo hereda ese contexto visual sin necesitar CSS nuevo estructural, solo agregar reglas puntuales si hace falta.

### 3. Flujo actual de autenticación

`Login.tsx` → `useAuth().login(email, password)` → `AuthContext.login()`:
1. `POST /auth/login` (sin guard, público).
2. `localStorage.setItem("token", data.accessToken)` — **primero**.
3. `localStorage.setItem("usuario", JSON.stringify(data.usuario))` — **segundo**.
4. `setUsuario(data.usuario)` (estado de React, actualización inmediata).
5. `Login.tsx` ejecuta `navigate("/")` — **navegación de React Router (SPA), no una recarga completa de página.**

**Corrección de un hecho asumido en `DISENO_BLOQUE10.4_FRONTEND.md`:** el diseño (sección 5, paso 7, y sección 15) afirma que la recarga completa hacia `/` reutiliza "mismo destino que ya usa `Login.tsx` tras un login exitoso", dando a entender que `Login.tsx` ya ejecuta una recarga dura. **Verificado contra el código real: no es así.** `Login.tsx` usa `navigate("/")` de `react-router-dom` — una transición SPA sin recargar la página; funciona porque `AuthContext.login()` ya actualiza el estado de React (`setUsuario`) antes de navegar, así que no hace falta recarga. **El único precedente real de recarga completa (`window.location.href`) en todo el frontend hoy es el interceptor de `401` de `api/client.ts`**, no `Login.tsx`. Esto es relevante para 10.4.b porque el mecanismo de recarga a reutilizar debe basarse en ese precedente, no en el de `Login.tsx`.

**Protección de rutas:** no existe un componente `<ProtectedRoute>` separado — `Layout.tsx` cumple ese rol directamente: `if (!usuario) return <Navigate to="/login" replace />`, antes de renderizar el `<Outlet/>` con cualquier ruta anidada. Las rutas públicas (`/login`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/aceptar-invitacion`) están declaradas fuera del `<Route element={<Layout/>}>` en `App.tsx`, así que nunca pasan por ese guard.

**Axios (`api/client.ts`, releído completo, 27 líneas):** el interceptor de request lee `localStorage.getItem("token")` en **cada** request, sin caché — confirmado, sin cambios desde la auditoría de 10.4 general. El interceptor de response, ante `401`, borra ambas claves de `localStorage` y ejecuta `window.location.href = "/login"` **solo si `window.location.pathname !== "/login"`** (evita un bucle de redirección si el 401 ocurre ya estando en `/login`, por ejemplo al fallar el propio login).

### 4. Flujo actual de cambio de contexto

**No existe.** Cero código relacionado con cambio de organización activa en el frontend — ni una función `cambiarOrganizacion` en `AuthContext`, ni un selector, ni una llamada a `POST /auth/cambiar-organizacion`, ni ningún consumo de `GET /grupo-economico/organizaciones-accesibles`. Ambos endpoints de backend están cerrados y desplegados (10.3.b y 10.4.a respectivamente) pero sin ningún consumidor de frontend todavía. Esto es exactamente el punto de partida que motiva a 10.4.b — no un hallazgo nuevo, es la confirmación explícita de que no hay nada parcialmente construido que deba respetarse o migrarse.

### 5. Riesgos técnicos

- **Orden de escritura en `localStorage` distinto entre funciones:** `login()` ya existente escribe `"token"` primero y `"usuario"` después (ver punto 3); la función nueva `cambiarOrganizacion()` que propone `DECISIONES_TECNICAS_BLOQUE10.4.md` (Decisión 6) debe escribir en el orden **inverso** (`"usuario"` primero, `"token"` al final) porque el listener de `storage` (Decisión 7) reacciona específicamente a `"token"` como señal de "cambio completo". Riesgo concreto: copiar por error el orden de `login()` al implementar `cambiarOrganizacion()` rompería la premisa completa de la Decisión 7.
- **Precedente de recarga completa mal identificado en el diseño ya aprobado** (ver punto 3) — el patrón real a reutilizar es el de `api/client.ts` (interceptor `401`, `window.location.href`), no el de `Login.tsx` (`navigate()`, SPA). Si se implementa literalmente "igual que `Login.tsx`" sin corregir esta lectura, el cambio de organización terminaría siendo una navegación SPA sin recarga real — contradice explícitamente la Decisión 5 (protección de datos no guardados vía `beforeunload`, que solo se dispara ante una recarga/descarga real de página, nunca ante una navegación SPA).
- **`Usuario.organizacionId` sigue faltando en `AuthContext`** — el selector necesita saber cuál es la organización activa. El dato ya llega en runtime desde el backend en `login()` y en `cambiarOrganizacion()` (confirmado en `ACTA_CIERRE_BLOQUE10.3b.md`: `usuario` con exactamente `{ id, nombre, email, rol, organizacionId }`), pero la interfaz TypeScript de `AuthContext.tsx` no lo declara — hoy se pierde silenciosamente si algún código intentara leerlo. El frontend nunca decodifica el JWT en ningún lado (confirmado, sin librería de decodificación en `package.json` ni uso manual) — ese patrón no debería empezarse a usar ahora; la organización activa se obtiene del campo `esActual` que ya expone `GET /grupo-economico/organizaciones-accesibles` (10.4.a), no de decodificar el token.
- **`ViajeForm.tsx` no tiene ningún tracking de "cambios sin guardar" hoy** — es un objeto `form` plano (14 campos) actualizado con un único `update(field, value)` genérico, sin comparación contra un estado inicial ni bandera `dirty`. El hook `useUnsavedChangesGuard(hayCambiosSinGuardar: boolean)` que propone el diseño (sección 6) necesita que `ViajeForm` le entregue ese booleano — hoy no existe ninguna fuente para ese valor; calcularlo es trabajo real, no solo "conectar un hook existente".
- **`React.StrictMode` activo:** cualquier `useEffect` que registre un listener de `storage` debe limpiar correctamente (`return () => window.removeEventListener(...)`) — en desarrollo, React monta/desmonta/vuelve a montar efectos una vez extra; un listener sin cleanup correcto se duplicaría y dispararía recargas dobles solo en desarrollo (no en producción, pero rompería cualquier prueba manual si no se atiende).
- **Contrato desactualizado en el propio diseño aprobado** (no bloquea 10.4.b, pero se deja registrado por transparencia — ver punto 7 y `ACTA_CIERRE_BLOQUE10.4a.md`): `DISENO_BLOQUE10.4_FRONTEND.md` sección 9 describe `GET /grupo-economico/:id/usuarios/buscar` con respuesta `{id, nombre, email, organizacionId, activo}`; lo realmente cerrado en 10.4.a es `GET /grupo-economico/:id/usuarios/resolver` con respuesta `{id, nombre, email, organizacionId, nombreOrganizacion}` (sin `rol`, sin `activo`). Ese endpoint es para 10.4.c, no para 10.4.b — no afecta este sub-bloque, pero si el diseño de 10.4.c se redacta citando la sección 9 sin releer el acta real, replicaría un contrato que ya no existe.

### 6. Dependencias con 10.4.a

- **`GET /grupo-economico/organizaciones-accesibles`** — cerrado en 10.4.a, verificado en producción (`ACTA_CIERRE_BLOQUE10.4a.md`). Contrato real: `{ id: string, nombre: string, esActual: boolean }[]`, sin `RolesGuard`, revalida pertenencia al grupo en cada consulta. **Coincide exactamente** con lo que `DISENO_BLOQUE10.4_FRONTEND.md` sección 2 especificó — sin discrepancia, es la única dependencia directa de backend que 10.4.b necesita, y ya está disponible.
- **`POST /auth/cambiar-organizacion`** — cerrado en 10.3.b (no en 10.4.a), ya verificado estructuralmente en producción. Contrato: `{ organizacionId: string }` → `{ accessToken: string, usuario: { id, nombre, email, rol, organizacionId } }`. Confirma, con evidencia del acta real, que el backend **ya** devuelve `organizacionId` en `usuario` — la corrección de la interfaz `Usuario` en `AuthContext.tsx` (punto 5) es segura porque el dato ya existe en runtime, falta solo declararlo.
- **`GET /grupo-economico/:id/usuarios/resolver`** — cerrado en 10.4.a, pero es una dependencia de 10.4.c, no de 10.4.b. Se menciona acá únicamente por la discrepancia de contrato señalada en el punto 5.

### 7. Posibles conflictos

- **Ninguna colisión de archivos** entre lo que 10.4.b tocaría (`AuthContext.tsx`, `Layout.tsx`, un hook nuevo de consulta, un hook nuevo de `beforeunload`, `ViajeForm.tsx`) y lo que tocó 10.4.a (exclusivamente backend) o cualquier bloque anterior — confirmado, sin superposición de archivos.
- **Dos afirmaciones del diseño ya aprobado que no coinciden con el código real**, ambas ya detalladas arriba: (a) `Login.tsx` no hace una recarga completa, hace una navegación SPA — el precedente real de recarga es el interceptor `401`; (b) el contrato de `usuarios/buscar` de la sección 9 no coincide con el `usuarios/resolver` realmente cerrado. Ninguna de las dos bloquea 10.4.b por sí sola, pero la primera sí es directamente relevante para cómo se diseñe el paso de recarga (Decisión 5/7) — se señala para que la etapa de Diseño la tenga en cuenta explícitamente, no para resolverla ahora.
- **Sin conflicto con `ConfirmProvider`:** está montado en `App.tsx`, envolviendo todas las rutas (públicas y protegidas) — el selector, al vivir dentro de `Layout` (que está dentro de esas rutas), ya tiene `useConfirm()` disponible sin ningún cambio de estructura de providers.

### 8. Código reutilizable

- `useConfirm()` / `ConfirmDialog.tsx` — ya montado globalmente, soporta `severity: "medium"`, exactamente lo que la Decisión 4 pide para la confirmación de cambio.
- `useAsyncAction` — patrón `busy`/`error`/`success` ya probado en `Perfil.tsx`/`Organizacion.tsx`, aplicable al manejo de errores del componente que dispare `cambiarOrganizacion()`.
- El interceptor de request de `api/client.ts` — ya lee `token` sin caché en cada request; no necesita ningún cambio para que un token nuevo se use de inmediato.
- El patrón `window.location.href` + guard de `pathname` del interceptor de `401` — precedente real y correcto para la recarga completa (corrige la referencia equivocada a `Login.tsx` del diseño).
- Estilos existentes de `.sidebar .user-info` — el selector puede apoyarse en las reglas ya definidas sin rediseño de `Layout.tsx`.

### 9. Código que debería evitarse modificar

- Todo el backend — `AuthService.cambiarOrganizacion()`, `AuthController`, `JwtStrategy`, `RolesGuard`, `ORGANIZACION_PRISMA`, `OrganizacionesAccesiblesController`, `schema.prisma` — 10.4.b es exclusivamente frontend; ambos contratos que necesita ya están cerrados y verificados en producción (10.3.b, 10.4.a).
- `App.tsx` — no necesita ninguna ruta nueva para el selector (vive dentro de `Layout`, no es una pantalla); solo debe confirmarse que sigue igual, no modificarse.
- Cualquier pantalla administrativa (`Usuarios.tsx`, `AuditoriaAdministrativa.tsx`) y la futura pantalla de administración de accesos — pertenecen a 10.4.c, fuera de alcance de 10.4.b.
- `ConfirmDialog.tsx` y `useAsyncAction.ts` — ya cubren lo que 10.4.b necesita; no requieren extenderse.
- El interceptor de request de `api/client.ts` — ya se comporta correctamente (punto 8), no necesita cambios de lógica (el propio diseño ya lo señala en su sección 8).

### 10. Orden recomendado de implementación

**Aclaración: esto describe orden de dependencias reales observadas en el código, no una solución de diseño.** En base a qué depende de qué:

1. Corrección de la forma de `Usuario` en `AuthContext` (agregar `organizacionId`) — no depende de nada más, y varios pasos posteriores lo necesitan.
2. Función `cambiarOrganizacion()` en `AuthContext` — depende del backend (ya disponible), no depende del selector visual.
3. Hook de consulta de organizaciones accesibles — depende del endpoint de 10.4.a (ya disponible), independiente del resto.
4. Selector visual en `Layout.tsx` — depende de (1) y (3).
5. Mecanismo de recarga completa + orden seguro de escritura en `localStorage` — depende de (2), y debe resolver primero la corrección del punto 3 (evidencia) sobre cuál es el precedente real a reutilizar.
6. Listener de `storage` para sincronización entre pestañas — depende de (5) (la clave `"token"` como señal de cambio completo solo tiene sentido una vez que el orden de escritura de (5) está resuelto).
7. `beforeunload` en `ViajeForm.tsx` — depende de que `ViajeForm` primero tenga una forma de calcular "hay cambios sin guardar" (no existe hoy, riesgo señalado en el punto 5); es el paso con más trabajo oculto no evidente a primera vista.

Este orden coincide con el que ya propone `DISENO_BLOQUE10.4_FRONTEND.md` sección 15 para 10.4.b — esta auditoría no encuentra motivo técnico para alterarlo, solo lo confirma y agrega el detalle de las dos correcciones de evidencia (puntos 3 y 5) que la etapa de Diseño debería tener en cuenta explícitamente.

---

## Riesgos (resumen)

Ya detallados en el punto 5 — en orden de relevancia: (a) orden de escritura de `localStorage` distinto entre `login()` y la futura `cambiarOrganizacion()`; (b) precedente de recarga completa mal identificado en el diseño aprobado (es el interceptor `401`, no `Login.tsx`); (c) `Usuario.organizacionId` todavía sin declarar en `AuthContext`; (d) `ViajeForm.tsx` sin ningún tracking de "dirty" existente; (e) `React.StrictMode` y limpieza de listeners; (f) contrato de `usuarios/buscar`/`usuarios/resolver` desactualizado en la sección 9 del diseño (no afecta a 10.4.b directamente).

## Preguntas abiertas

Ninguna requiere resolverse en esta etapa de auditoría — las dos correcciones de evidencia (puntos 3 y 5) no son decisiones técnicas nuevas ni contradicen ninguna decisión ya aprobada: son hechos objetivos del código real que la etapa de Diseño de 10.4.b debería incorporar al redactar el flujo exacto de recarga y el orden de implementación. No se encontró ningún conflicto arquitectónico real que exija detenerse y preguntar antes de diseñar.

## Recomendaciones

No se encontró ningún conflicto arquitectónico real ni ninguna razón para no avanzar. Se recomienda pasar a la etapa de Diseño Técnico de Bloque 10.4.b, incorporando explícitamente las dos correcciones de evidencia señaladas (el precedente real de recarga completa es el interceptor `401` de `api/client.ts`, no `Login.tsx`; y el contrato de `usuarios/resolver` ya cerrado difiere del descrito en la sección 9 del diseño general, aunque eso no es dependencia de este sub-bloque).

---

No se propuso solución, no se diseñó, no se implementó, no se modificó ningún archivo, no se abrió ninguna decisión técnica, no se hizo git add/commit/push. Detenido al finalizar, a la espera de tu aprobación antes de iniciar la etapa de Diseño de Bloque 10.4.b.

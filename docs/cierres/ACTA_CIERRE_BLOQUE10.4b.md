# Acta de Cierre — Bloque 10.4.b: Frontend del Cambio de Organización

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`). Fecha: 2026-07-17. Segundo sub-bloque de Bloque 10.4, sobre la base ya cerrada de Bloques 10.1, 10.2, 10.3.a, 10.3.b y 10.4.a, siguiendo `AUDITORIA_BLOQUE10.4b_FRONTEND.md`, `DISENO_BLOQUE10.4b_FRONTEND.md` y `DECISIONES_TECNICAS_BLOQUE10.4b.md`. **Todavía sin commit** — este documento se genera para tu aprobación antes de cualquier `git add`/`commit`/`push`, según instrucción explícita.

---

## 1. Qué se implementó

Exclusivamente frontend — cero cambios de backend. Extiende `AuthContext.tsx` de forma mínima (Decisión Técnica 2 del diseño general de 10.4: "no diseñar un `SessionProvider` nuevo") con:
- `Usuario.organizacionId` (único campo agregado — dato que el backend ya devolvía en `login()`/`cambiar-organizacion()`, ahora declarado).
- `cambiarOrganizacion(organizacionId)`: `POST /auth/cambiar-organizacion` → escribe `"usuario"` primero, `"token"` al final → `window.location.href = "/"`. Ante fallo de cualquiera de las dos escrituras, revierte ambas claves a sus valores originales y no recarga.
- Listener de `storage`, montado una sola vez en `AuthProvider`: reacciona exclusivamente a `event.key === "token"` y ejecuta `window.location.reload()` (Decisión Técnica 1 de `DECISIONES_TECNICAS_BLOQUE10.4b.md` — recarga en la URL actual, nunca redirige a `/`).

Selector en `Layout.tsx`, dentro del bloque `.user-info` ya existente: nombre de la organización activa siempre visible una vez resuelta la consulta; `<select>` solo si hay más de una organización accesible; confirmación (`useConfirm()`, severidad `"medium"`) antes de invocar `cambiarOrganizacion()`; trigger deshabilitado mientras el cambio está en curso (`useAsyncAction`); error del backend mostrado tal cual (Decisión Técnica 3).

Dos hooks nuevos, chicos y genéricos: `useOrganizacionesAccesibles()` (consulta `GET /grupo-economico/organizaciones-accesibles` una vez por montaje, falla en silencio) y `useUnsavedChangesGuard(hayCambiosSinGuardar)` (registra/limpia `beforeunload` según el booleano recibido, sin registro global).

`ViajeForm.tsx`: bandera `dirty` (`useState(false)`), puesta en `true` dentro de la función `update()` ya existente (única vía de modificación real de campos), puesta en `false` tras un guardado exitoso, nunca reseteada por comparación de estado (Decisión Técnica 2).

## 2. Auditoría adversarial — respuestas a los 8 puntos pedidos, con evidencia

### 1. `AuthContext.tsx`

- **`login()` conserva exactamente el comportamiento previo:** confirmado por `git diff` — el cuerpo de la función no tiene ninguna línea modificada, solo se agregó código alrededor (nuevos `useEffect`/función nueva).
- **`logout()` no cambió:** mismo `git diff`, sin ninguna línea tocada.
- **`cambiarOrganizacion()` usa el contrato real del backend:** verificado contra el servidor real de desarrollo — `POST /auth/cambiar-organizacion` devuelve exactamente `{ accessToken, usuario: { id, nombre, email, rol, organizacionId } }`, la misma forma que consume la función.
- **Orden `usuario` → `token`:** confirmado, líneas del `try` — `setItem("usuario", ...)` antes que `setItem("token", ...)`.
- **Rollback ante error:** confirmado — `tokenOriginal`/`usuarioOriginal` se capturan con `getItem()` **antes** de cualquier escritura (después del `POST`, que ya tuvo éxito en ese punto); si `setItem("usuario", ...)` o `setItem("token", ...)` lanza, ambas claves se restauran a los valores capturados (o se eliminan si no existían) y el error se re-lanza — nunca llega a ejecutar `window.location.href = "/"`. Si el `POST` mismo falla, la excepción ocurre antes de tocar `localStorage`, que queda completamente intacto.
- **Listener de `storage` correctamente limpiado:** `useEffect(() => {... ; return () => window.removeEventListener("storage", handler);}, [])` — dependencias `[]`, se registra una sola vez por montaje real de `AuthProvider` y se limpia al desmontar.

### 2. `Layout.tsx`

- **Selector oculto con una sola organización:** confirmado — `organizaciones.length > 1 ? <select>... : <div className="muted">{nombre}</div>`.
- **Selector visible con más de una:** mismo condicional, rama `<select>`.
- **Cancelar confirmación mantiene la organización seleccionada:** verificado el mecanismo exacto — el `<select>` es un componente controlado (`value={organizacionActual.id}`); al cancelar, `elegirOrganizacion()` retorna sin tocar ningún estado propio de `Layout`. La corrección visual de la selección del navegador (que sí cambia nativamente al hacer click en una opción) ocurre porque `ConfirmProvider` (`App.tsx`) es ancestro de `Layout` en el árbol de React, y su propio cambio de estado (`setPending(...)` al abrir y cerrar el diálogo) dispara un re-render en cascada que alcanza a `Layout` — confirmado que no hay ningún `React.memo` en todo el frontend (`grep`, cero coincidencias) que pudiera cortar esa cascada. Es un mecanismo correcto hoy, aunque implícito — **dejado registrado como nota de mantenimiento**, no como defecto: si en el futuro se memoiza algún componente entre `ConfirmProvider` y `Layout`, este comportamiento dejaría de funcionar sin que ningún test lo detecte fácilmente.
- **Fallo del cambio mantiene el estado consistente:** confirmado — si `cambiarOrganizacion()` lanza (ya sea por el `POST` o por el rollback de `localStorage`), `useAsyncAction.run()` lo captura, pone `error`, vuelve `busy` a `false`; ni `organizaciones` ni `usuario` cambiaron, así que el `<select>` sigue mostrando la organización real activa, con el mensaje de error visible debajo.
- **Organización actual siempre visible:** visible siempre que la consulta ya resolvió con éxito — durante la carga inicial y ante un error de la consulta, el bloque no muestra nada (ni selector ni nombre), tal como lo fija explícitamente `DISENO_BLOQUE10.4b_FRONTEND.md`, sección 7 ("mientras se resuelve... no se muestra ningún selector todavía"; "error al cargar... falla en silencio"). No es una desviación — es la implementación exacta de una decisión ya aprobada.

### 3. `useOrganizacionesAccesibles()`

- **Sin llamadas duplicadas en producción:** dependencias `[]`, se ejecuta una sola vez por montaje real.
- **Bajo `React.StrictMode` (desarrollo):** el doble montaje/desmontaje/montaje de efectos de React 18 en desarrollo dispara la petición HTTP dos veces — comportamiento **esperado e inevitable** de StrictMode para cualquier efecto con `fetch`, no específico de este hook, sin equivalente en producción. La bandera `cancelado` (cerrada sobre cada instancia del efecto) impide que la respuesta de una instancia ya limpiada actualice el estado — cero escrituras de estado duplicadas o fuera de orden, aunque la red sí vea dos requests en desarrollo.
- **Sin loops:** ninguna dependencia del efecto cambia como resultado de su propia ejecución — no hay condición para que se re-dispare.
- **Manejo correcto de errores:** `.catch(() => {})` — silencioso, `.finally()` siempre pone `loading` en `false` sin importar éxito o fallo, coherente con la Decisión de diseño ya aprobada.

### 4. `useUnsavedChangesGuard()`

- **Cleanup correcto:** el `useEffect` retorna `() => window.removeEventListener("beforeunload", handler)` en la rama donde el listener se registró.
- **Sin listeners duplicados:** dependencia `[hayCambiosSinGuardar]` — el efecto solo se re-ejecuta cuando ese booleano cambia de valor, ejecutando primero la limpieza de la instancia anterior. Bajo `StrictMode`, el doble montaje inicial ocurre con `dirty=false` (sin registrar nada la primera vez que se monta `ViajeForm`), así que no hay ningún listener que duplicar en ese momento.
- **Solo activo cuando `dirty=true`:** `if (!hayCambiosSinGuardar) return;` al principio del efecto — con `false`, no se registra nada.

### 5. `ViajeForm.tsx`

- **`dirty` solo por acciones del usuario:** `setDirty(true)` vive exclusivamente dentro de `update()`, la única función que los campos del formulario invocan en sus `onChange`. Ninguno de los dos `useEffect` existentes (carga de catálogos, carga de choferes/vehículos por transportista) llama `update()` ni `setDirty` — confirmado releyendo el archivo completo.
- **`dirty=false` luego de guardar:** `setDirty(false)` se ejecuta inmediatamente después de que `POST /viajes` tiene éxito, antes de `navigate(...)`.
- **Sin efectos secundarios:** `setDirty(true)` es una actualización de estado local, síncrona, sin ninguna otra interacción.

### 6. `React.StrictMode`

Confirmado para ambos listeners nuevos (`storage` en `AuthContext`, `beforeunload` en `useUnsavedChangesGuard`): cada uno vive en un `useEffect` con una función de limpieza que remueve exactamente el mismo listener que registró. El doble montaje de `StrictMode` en desarrollo sigue el patrón montar → limpiar → montar — nunca monta dos veces sin limpiar entre medio — así que como máximo hay un listener activo de cada tipo en cualquier momento, en desarrollo o en producción.

### 7. Regresión en consumidores existentes de `useAuth()`

`grep` sobre `useAuth()` en todo `frontend/src`: `Organizacion.tsx`, `Login.tsx`, `Usuarios.tsx`, `AuditoriaAdministrativa.tsx` — los cuatro desestructuran únicamente `usuario` o `login`, ninguno usa `cambiarOrganizacion` ni depende de la forma exacta de `Usuario` más allá de los campos que ya tenía. Ambos cambios de tipo son aditivos (`organizacionId` nuevo, `cambiarOrganizacion` nueva) — el build de TypeScript, limpio, ya lo confirma estructuralmente (un campo faltante o un consumidor roto habría fallado la compilación).

### 8. Alcance exclusivamente 10.4.b

`git status` confirma exactamente 5 archivos de código: 3 modificados (`AuthContext.tsx`, `Layout.tsx`, `ViajeForm.tsx`) + 2 nuevos (`useOrganizacionesAccesibles.ts`, `useUnsavedChangesGuard.ts`) — ninguno de backend, ninguna ruta ni pantalla nueva de 10.4.c (administración de accesos, resolución de usuarios, topología del grupo), `App.tsx` sin cambios.

## 3. Validaciones ejecutadas

1. `npm run build` (frontend) limpio, 0 errores — verificado de nuevo al cierre de esta auditoría, después de terminar la revisión de código.
2. `npm run build` (backend) limpio, sin cambios (confirmado por `git status` sobre `backend/`).
3. Contratos reales verificados vía API contra el servidor de desarrollo (turno de implementación): `GET /grupo-economico/organizaciones-accesibles` (una organización, dos organizaciones, orden y `esActual`) y `POST /auth/cambiar-organizacion` (forma exacta de la respuesta).
4. Revisión de código línea por línea de los 5 archivos nuevos/modificados, contra los 8 puntos pedidos en esta auditoría — sin ningún problema objetivo encontrado.

**Limitación explícita, ya conocida y aceptada en el turno de implementación:** la extensión de Chrome no estuvo disponible en esta sesión, así que **no se ejecutó validación visual/interactiva en navegador real** (renderizado del selector, diálogo de confirmación en pantalla, recarga observada, sincronización real entre dos pestañas físicas, diálogo nativo de `beforeunload` con aceptar/cancelar). Lo verificado en esta auditoría es la corrección del código fuente y de los contratos reales — no una ejecución end-to-end en un navegador. Esta limitación ya fue comunicada y aceptada explícitamente antes de la implementación.

## 4. Archivos (sin commitear todavía)

- `frontend/src/context/AuthContext.tsx` (modificado).
- `frontend/src/components/Layout.tsx` (modificado).
- `frontend/src/pages/ViajeForm.tsx` (modificado).
- `frontend/src/hooks/useOrganizacionesAccesibles.ts` (nuevo).
- `frontend/src/hooks/useUnsavedChangesGuard.ts` (nuevo).
- **Sin cambios:** cualquier archivo de backend, `App.tsx`, `api/client.ts`, `ConfirmDialog.tsx`, `useAsyncAction.ts`, cualquier pantalla administrativa.

## 5. Rollback

Revertir los 5 archivos de la sección 4 — no hay commit todavía que revertir. Sin migración, sin cambio de backend.

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Administración visual de accesos (otorgar/listar/revocar); resolución de usuarios; topología del Grupo Económico; identidad compartida de Chofer — todo 10.4.c, sin tocar.

---

**Revisión adversarial ejecutada antes de este cierre** (misma sesión, contra los 8 puntos específicos pedidos): no encontró ningún problema objetivo. Una observación de mantenimiento fue documentada (sección 2, punto 2 — dependencia implícita del re-render en cascada para que "cancelar" preserve la selección visual), sin requerir corrección porque el comportamiento actual es correcto y no hay ningún `React.memo` en el proyecto que lo rompa.

**Pendiente de tu aprobación.** No se hizo `git add`, `commit` ni `push`. No se abre Bloque 10.4.c.

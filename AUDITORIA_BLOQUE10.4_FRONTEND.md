# Auditoría — Bloque 10.4: Frontend de Grupo Económico

Fecha: 2026-07-16. Auditoría técnica pura (`METODOLOGIA_SDC.md`, etapa 1) — **no se diseñó nada, no se propuso implementación, no se escribió código, no se modificó ningún archivo, no se hizo git add/commit/push.** El backend (Bloques 10.1, 10.2, 10.3.a, 10.3.b) está cerrado y desplegado — esta auditoría no reabre ninguna de sus decisiones.

**Documentos rectores releídos completos y frescos:** `CONSTITUCION_SDC.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `RELEASE_SDC_v1.0.md`, `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`, `docs/disenos/GRUPO_ECONOMICO_DISENO_TECNICO.md`, `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md`, `DECISIONES_TECNICAS_BLOQUE10.3.md`, `DECISIONES_TECNICAS_BLOQUE10.3b.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.3b.md`. Confirmado por `git log` que ningún archivo de `frontend/src/` cambió desde el 2026-07-14 (commit `0541e30`) — anterior a todo el Bloque 10, así que ningún documento ni decisión posterior pudo haberlo afectado todavía.

**Código de frontend releído fresco:** `AuthContext.tsx`, `Login.tsx`, `api/client.ts`, `Layout.tsx`, `App.tsx`, `main.tsx`, `Organizacion.tsx`, `Perfil.tsx`, `ConfirmDialog.tsx`, y el listado completo de páginas (`Glob`, 26 archivos `.tsx`). Confirmado por `Grep` en todo `frontend/src`: no existe hoy ningún listener del evento `storage`, ningún manejo de `beforeunload`, y el uso de `localStorage` está acotado exclusivamente a `api/client.ts` y `AuthContext.tsx` (7 líneas en total, ninguna otra).

---

## 1. ¿Cómo funciona actualmente `AuthContext`?

**Hecho confirmado** (`AuthContext.tsx:20-49`): Context + Provider de React. Estado: `usuario` (objeto o `null`) y `loading` (booleano). Al montar (`useEffect`, línea 24), lee `localStorage.getItem("usuario")`, lo parsea, y setea el estado; `loading` pasa a `false` al final, sin importar el resultado. `login()` hace `POST /auth/login`, escribe `token` y `usuario` en `localStorage`, y actualiza el estado. `logout()` borra ambas claves y limpia el estado. `useAuth()` lanza una excepción si se usa fuera del `Provider`.

## 2. ¿Cómo se almacena hoy el usuario autenticado?

**Hecho confirmado** (`AuthContext.tsx:39`, `4-9`): `localStorage.setItem("usuario", JSON.stringify(data.usuario))`, más el mismo objeto en el estado de React. La interfaz TypeScript `Usuario` es `{ id, nombre, email, rol }` — **sigue sin declarar `organizacionId`**, el mismo hallazgo ya señalado en las auditorías de 10.3 y 10.3.b, todavía sin resolver. El backend (`login()` y `cambiarOrganizacion()`, ambos verificados en Bloque 10.3.b) sí envía `organizacionId` dentro de `usuario` — el dato llega en tiempo de ejecución, el tipo simplemente no lo contempla.

## 3. ¿Cómo se almacena el `accessToken`?

**Hecho confirmado** (`AuthContext.tsx:38`): `localStorage.setItem("token", data.accessToken)` — string plano. Nunca vive en el estado de React; solo se lee desde `localStorage` en el momento de cada request, por el interceptor de Axios.

## 4. ¿Dónde vive actualmente `organizacionId`?

**Hecho confirmado:** en ningún lado explícito del frontend hoy. No está en el tipo `Usuario` (pregunta 2), no se lee ni se muestra en `Layout.tsx`, no aparece en ninguna de las páginas releídas. Existe únicamente dentro del payload del JWT (opaco para el frontend, nunca decodificado del lado del cliente) y dentro del objeto `usuario` crudo en `localStorage` (presente, pero no tipado ni usado).

## 5. ¿Cómo se realiza logout?

**Hecho confirmado** (`AuthContext.tsx:43-47`, disparado desde `Layout.tsx:47`): síncrono, sin llamada al backend (no hay sesión server-side que invalidar, coherente con el modelo stateless certificado en `RELEASE_SDC_v1.0.md`, sección 7). Borra ambas claves de `localStorage`, limpia el estado — `Layout` reacciona solo (`if (!usuario) return <Navigate to="/login" replace />`, línea 28), sin recarga completa de página.

## 6. ¿Cómo se realiza login?

**Hecho confirmado** (`Login.tsx`): formulario controlado, `await login(...)` seguido de `navigate("/")` (React Router, navegación de cliente — no recarga completa). Error capturado y mostrado inline.

## 7. ¿Cómo reaccionan hoy los interceptores Axios?

**Hecho confirmado** (`api/client.ts:7-27`): el interceptor de request lee `localStorage.getItem("token")` **en cada request**, nunca cacheado — cualquier cambio previo en `localStorage` se refleja automáticamente en la siguiente llamada, sin necesidad de avisarle a Axios. El interceptor de response, ante un `401`, borra ambas claves y hace `window.location.href = "/login"` (si no está ya en `/login`) — **esto sí es una recarga completa de página**, el único mecanismo de ese tipo que existe hoy en el frontend.

## 8. ¿Cómo se maneja actualmente `localStorage`?

**Hecho confirmado**, verificado por búsqueda exhaustiva: exactamente 7 líneas en todo `frontend/src` tocan `localStorage`, todas en `api/client.ts` (3) y `AuthContext.tsx` (4). Dos claves: `"token"` y `"usuario"`. Nada más en el proyecto lo usa.

## 9. ¿Qué componentes permanecen montados entre navegaciones?

**Hecho confirmado** (`main.tsx`, `App.tsx`): `AuthProvider` y `ConfirmProvider` se montan una sola vez, en la raíz, y nunca se desmontan mientras la aplicación esté viva (solo un reload completo los reinicia). `Layout` (`App.tsx:37-58`) envuelve un grupo de rutas anidadas vía `<Outlet />` — React Router mantiene `Layout` montado de forma continua mientras se navega entre esas rutas hijas; solo se desmonta al navegar a `/login`, `/recuperar-contrasena`, `/restablecer-contrasena` o `/aceptar-invitacion` (fuera del `Layout`), o en una recarga completa.

## 10. ¿Qué pantallas mantienen estado propio?

**Hecho confirmado**, patrón verificado en dos páginas completas (`Organizacion.tsx`, `Perfil.tsx`) y consistente con el resto: cada página usa `useState` local para sus propios datos, poblado por un `useEffect(() => { cargar() }, [])` al montar. Ese estado vive únicamente en la instancia del componente — se pierde y se vuelve a cargar cada vez que React lo desmonta y remonta (por ejemplo, al navegar a otra ruta y volver).

## 11. ¿Qué componentes podrían conservar datos de la organización anterior?

**Riesgo confirmado, ya señalado en el diseño previo y ahora verificado contra el código real:** cualquier página actualmente montada en el momento del cambio de organización. Como el estado de cada página (pregunta 10) solo se descarta cuando React la desmonta, y una navegación de cliente común (`navigate(...)`) **no** desmonta un componente que sigue mostrando la misma ruta, ningún mecanismo puramente de navegación garantiza limpiar ese estado. Esto confirma, contra el código real (no solo en teoría), por qué la Decisión Técnica 5 de `DECISIONES_TECNICAS_BLOQUE10.3.md` (recarga completa) es la única opción que garantiza cero residuo: una recarga destruye todo el árbol de React desde cero, sin excepción — ninguna página ni `Layout` puede sobrevivir eso.

## 12. ¿Qué ocurre hoy al refrescar el navegador?

**Hecho confirmado:** el árbol de React se reconstruye desde cero (`main.tsx` vuelve a ejecutarse). `AuthProvider` relee `localStorage.getItem("usuario")` y restaura el estado desde ahí — no desde ningún estado de React previo, porque no sobrevive nada a una recarga. Si `usuario` está presente, la persona sigue "logueada" sin repetir el login. Es exactamente el mecanismo que la recarga completa (Decisión Técnica 5) va a reutilizar.

## 13. ¿Cómo está construido actualmente `Layout`?

**Hecho confirmado** (`Layout.tsx`): `NAV_ITEMS`, un arreglo de 19 entradas con `roles: string[] | null`, filtrado según `usuario.rol`. La barra lateral muestra el nombre de la app, la navegación filtrada, y un bloque `.user-info` con `usuario.nombre`, `usuario.rol`, un link a "Mi perfil" y el botón de "Cerrar sesión". **Ningún nombre ni indicador de organización aparece hoy en ningún lugar de la interfaz** — ni en `Layout`, ni en `Organizacion.tsx` (que muestra los datos institucionales, pero solo cuando el usuario navega explícitamente a esa pantalla, no de forma persistente).

## 14. ¿Dónde debería vivir el selector de Organización?

**Hecho confirmado, no una recomendación nueva:** el único lugar ya identificado en un diseño ya aprobado es el bloque `.user-info` de `Layout.tsx` (líneas 43-48) — mismo lugar donde ya vive `usuario.nombre`/`usuario.rol` — tal como lo fijó `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 11. Verificado contra el código real: ese bloque existe, está montado de forma persistente mientras se navega (pregunta 9), y es estructuralmente el lugar natural — no hace falta ninguna reestructuración de `Layout` para agregarlo ahí.

## 15. ¿Cómo impactaría el evento `storage` entre múltiples pestañas?

**Hecho confirmado:** no existe hoy ningún listener del evento `storage` en todo el proyecto (búsqueda exhaustiva, sin resultados) — terreno completamente limpio, sin nada con lo que pueda entrar en conflicto. La Decisión Técnica 6 de `DECISIONES_TECNICAS_BLOQUE10.3b.md` ya ratificó este mecanismo; esta auditoría solo confirma que agregarlo no colisiona con ningún código existente.

## 16. ¿Algún componente hace peligrosa la decisión de "recarga completa"?

**Riesgo confirmado, real, no hipotético:** `ViajeForm.tsx` existe (confirmado por `Glob`) — un formulario de creación/edición de Viaje. Una recarga completa disparada mientras alguien tiene ese formulario a medio completar **perdería silenciosamente esos datos**, porque el estado de un formulario no persiste en `localStorage`. **Verificado por búsqueda exhaustiva: no existe hoy ningún manejo de `beforeunload` ni ningún mecanismo de aviso de "cambios sin guardar" en todo el frontend** — el mismo vacío que ya había señalado, sin resolver, `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 16, punto 4. Sigue exactamente igual de sin resolver hoy.

## 17. ¿Qué endpoints del backend ya existen y serán consumidos por 10.4?

**Hecho confirmado**, verificado contra el código real de Bloque 10 completo:
- `POST /auth/login` — ya consumido.
- `POST /auth/cambiar-organizacion` (10.3.b) — desplegado, todavía sin ningún consumidor en el frontend.
- `POST /grupo-economico/:id/accesos`, `GET /grupo-economico/:id/accesos`, `DELETE /grupo-economico/:id/accesos/:accesoId` (10.3.a) — desplegados, sin consumidor.
- `GET /grupo-economico` (10.1) — desplegado, sin consumidor.

**Hallazgo real, verificado, no asumido:** **no existe ningún endpoint que devuelva "a qué Organizaciones puede cambiar el usuario autenticado".** `GET /grupo-economico/organizaciones-accesibles` fue **deliberadamente excluido** tanto en 10.3.a (`ACTA_CIERRE_BLOQUE10.3a.md`, sección 4) como en 10.3.b (`DECISIONES_TECNICAS_BLOQUE10.3b.md`, Decisión 3: "cualquier dato adicional... se resuelve con endpoints separados y específicos"). Lo único que existe hoy es `GET /grupo-economico/:id/accesos`, que devuelve los accesos que **mi propia organización otorgó a otros** — el sentido inverso de lo que un selector necesita (qué organizaciones **me** aceptan a **mí**).

## 18. ¿Existe algún conflicto real entre el frontend actual y las decisiones técnicas ya aprobadas?

**No hay conflicto entre decisiones — pero sí una laguna real y significativa, verificada, que condiciona toda la etapa de Diseño.** No es una contradicción (ninguna decisión de 10.3/10.3.b afirma que ese endpoint existe), es una ausencia real: el backend, tal como quedó cerrado, no expone ningún dato con el cual construir un selector de Organizaciones sin, o bien (a) agregar una consulta nueva al backend — lo cual esta instrucción excluye explícitamente ("el backend ya está cerrado y no debe modificarse"), o (b) resolverlo con algún mecanismo exclusivamente de frontend que hoy no existe ninguna pista de cuál sería. Esto no detiene la auditoría (no es una contradicción con nada ya aprobado), pero es, con diferencia, la pregunta más importante para la etapa de Diseño — ver recomendaciones.

---

## Riesgos (resumen)

- Cualquier página montada en el momento del cambio de organización puede mostrar datos residuales de la organización anterior si el mecanismo de limpieza no es una recarga completa real (pregunta 11) — mitigado por la Decisión Técnica 5 ya aprobada, pero recién ahora confirmado contra el código real que es, efectivamente, necesaria.
- Pérdida silenciosa de datos de formularios sin guardar (`ViajeForm.tsx`, y potencialmente otros no revisados en detalle) ante una recarga forzada — sin ningún mecanismo de aviso existente hoy (pregunta 16).
- El tipo `Usuario` de `AuthContext.tsx` sigue sin declarar `organizacionId` — cualquier código nuevo que necesite leerlo desde el contexto tendrá que convivir con ese desajuste de tipos o corregirlo.

## Preguntas abiertas (para la etapa de Diseño)

- **La más importante:** ¿cómo obtiene el frontend la lista de Organizaciones a las que el usuario puede cambiar, si no existe ningún endpoint para eso y el backend no puede modificarse? (pregunta 17-18).
- ¿Se corrige el tipo `Usuario` de `AuthContext.tsx` como parte de 10.4, o se posterga?
- ¿Qué hacer, si algo, respecto de formularios sin guardar (`ViajeForm.tsx` y otros) ante una recarga forzada por cambio de organización — construir un aviso ahora, o aceptar el riesgo explícitamente como ya lo hizo el diseño de 10.3?
- ¿El selector debe ser visible siempre (aunque solo muestre la organización propia) o debe ocultarse por completo para usuarios sin ningún `AccesoGrupoEconomico`?

---

## Recomendación

**No se encontró ningún conflicto arquitectónico real** entre el frontend existente y las decisiones técnicas ya aprobadas de Bloque 10.3/10.3.b — todo lo que el diseño anterior asumió sobre el frontend (recarga completa como único mecanismo confiable, el lugar de `Layout.tsx` para el selector, el comportamiento de los interceptores de Axios) se verificó cierto contra el código real. La única cuestión que requiere una decisión explícita antes de diseñar el selector es la pregunta 18 — cómo resolver la ausencia de un endpoint de "organizaciones accesibles" sin tocar el backend ya cerrado.

Recomiendo pasar a la etapa de Diseño.

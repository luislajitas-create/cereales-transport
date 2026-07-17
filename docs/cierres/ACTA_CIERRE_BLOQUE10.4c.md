# Acta de Cierre — Bloque 10.4.c: Administración Visual de Accesos de Grupo Económico

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`). Fecha: 2026-07-17. Tercer y último sub-bloque de Bloque 10.4, sobre la base ya cerrada de Bloques 10.1, 10.2, 10.3.a, 10.3.b, 10.4.a y 10.4.b, siguiendo `AUDITORIA_BLOQUE10.4c.md`, `DISENO_BLOQUE10.4c.md` y `DECISIONES_TECNICAS_BLOQUE10.4c.md`. **Todavía sin commit** — este documento se genera para tu aprobación antes de cualquier `git add`/`commit`/`push`, según instrucción explícita.

---

## 1. Alcance implementado

Pantalla nueva, única y monolítica (`frontend/src/pages/GrupoEconomico.tsx`), siguiendo el patrón ya probado de `Usuarios.tsx` — sin cambios de backend, sin hooks nuevos en archivo propio.

- **Bootstrap del grupo:** `GET /grupo-economico` al montar (gateado por `usuario?.rol === "ADMINISTRADOR"`, mismo criterio que `Usuarios.tsx`/`AuditoriaAdministrativa.tsx`). Su único resultado visible es `"Grupo: {nombre}"`, tratamiento `.muted`, sin sección propia (Decisión Técnica 1, resolución de la Tensión 1 de la auditoría).
- **Otorgamiento:** campo único de email → `GET .../usuarios/resolver` → tarjeta de confirmación → `useConfirm()` severidad `medium` → `POST .../accesos`.
- **Listado:** `GET .../accesos`, enriquecido en paralelo contra `usuarios/resolver` por cada `usuarioId` único.
- **Revocación:** botón por fila → `useConfirm()` severidad `high` → `DELETE .../accesos/:accesoId`.
- **Representación de `otorgadoPorId`** (Decisión Técnica 2, resolución de la Tensión 2): comparación local contra `usuario.id`, sin red — `"Vos"` / `"Otro administrador de tu organización"`.
- **`"Usuario no disponible"`** (Decisión Técnica 3): placeholder cuando un `usuarioId` del listado no resuelve, sin bloquear el resto de la tabla, sin exponer UUID.
- **Búsqueda exclusivamente por email exacto** (Decisión Técnica 4): sin campo ni modo alternativo de UUID.
- Ruta nueva `/administracion/grupo-economico` (`App.tsx`) e ítem de menú nuevo (`Layout.tsx`), ambos `ADMINISTRADOR`-only.

**Sin cambios de backend, sin nuevos permisos, sin nuevos roles, sin tocar `AuditoriaAdministrativa.tsx`, topología del grupo, ni identidad de chofer** — confirmado por `git status`.

---

## 2. Auditoría adversarial — objetivo: demostrar que la implementación está mal

Releídos frescos antes de auditar: `AUDITORIA_BLOQUE10.4c.md`, `DISENO_BLOQUE10.4c.md`, `DECISIONES_TECNICAS_BLOQUE10.4c.md`, y el código real completo de `GrupoEconomico.tsx`, `App.tsx`, `Layout.tsx`.

### Hallazgos reales encontrados y corregidos

**Hallazgo 1 — memory leak / falta de protección de desmontaje en el enriquecimiento del listado.** El `useEffect` que dispara las resoluciones paralelas por `usuarioId` (sección 7 del diseño) no tenía ninguna bandera de cancelación — a diferencia de `useOrganizacionesAccesibles.ts` (10.4.b), que sí la usa para el mismo tipo de consulta. Si el componente se desmontaba con resoluciones en vuelo, cada una habría llamado `setEnriquecidos` sobre un componente ya desmontado (advertencia real de React en desarrollo, indicio de fuga de memoria). **Corregido:** se agregó la misma bandera `cancelado` ya usada en 10.4.b, con `return () => { cancelado = true; }` en el efecto. Se agregó además un comentario explicando por qué `enriquecidos` queda deliberadamente fuera de las dependencias del efecto (incluirlo dispararía una resolución duplicada por cada `usuarioId` todavía pendiente en cada actualización parcial).

**Hallazgo 2 — condición de carrera real en el formulario de otorgar.** El campo de email no limpiaba el `candidato` ya resuelto al editarse, y el botón "Buscar" solo se deshabilitaba por `resolverAccion.busy`, no por `otorgarAccion.busy`. Secuencia reproducible: resolver un candidato → confirmar el otorgamiento → mientras el `POST` todavía está en vuelo, editar el email y buscar un candidato distinto → el callback de éxito del primer otorgamiento (que llega después) ejecuta `setEmail("")`/`setCandidato(null)`, pisando la segunda búsqueda en curso. **Corregido:** el campo de email ahora limpia `candidato` en cada cambio y se deshabilita mientras `otorgarAccion.busy`; el botón "Buscar" se deshabilita por `resolverAccion.busy || otorgarAccion.busy`.

Ambos hallazgos fueron corregidos, recompilados (`tsc -b && vite build`, limpio) y las validaciones afectadas se repitieron en el navegador real después del cambio.

### Verificación exhaustiva contra los documentos vigentes, con evidencia

- **`AUDITORIA_BLOQUE10.4c.md`:** las dos tensiones detectadas quedan resueltas exactamente como se auditó — `GET /grupo-economico` sin sección propia; `otorgadoPorId` sin contrato de resolución, representado localmente. Sin cambios de backend, confirmado por `git status`.
- **`DISENO_BLOQUE10.4c.md`:** cada estado de UI de la sección 8 fue verificado, uno por uno, contra el código real y contra el navegador (ver sección 3). El flujo de bootstrap (sección 5) respeta el orden exacto: grupo primero, accesos después, sin bloquear el formulario de otorgar ante un fallo del listado — verificado en el código (el formulario se renderiza incondicionalmente una vez resuelto `grupo`, fuera de cualquier chequeo de `errorAccesos`).
- **`DECISIONES_TECNICAS_BLOQUE10.4c.md`:** las cuatro decisiones verificadas literalmente contra el texto renderizado — `"Grupo: {nombre}"`, `"Vos"`, `"Otro administrador de tu organización"`, `"Usuario no disponible"` — las cuatro coinciden carácter por carácter con lo aprobado, confirmado en pantalla real (sección 3).
- **Contratos reales del backend:** los cinco endpoints consumidos (`GET /grupo-economico`, `GET/POST/DELETE .../accesos[/:id]`, `GET .../usuarios/resolver`) se llaman con el método, la forma de parámetros y el manejo de respuesta exactos — verificado contra el servidor real de desarrollo, no solo por lectura de código.
- **Seguridad:** el gate de rol en el frontend (`if (usuario?.rol !== "ADMINISTRADOR")`) es una ayuda de interfaz, nunca la autorización real — cada uno de los cinco endpoints ya exige `ADMINISTRADOR` en el backend (`RolesGuard`), sin cambios. La comparación local para `"Vos"`/`"Otro administrador"` no participa en ninguna decisión de autorización, solo de presentación. Ningún dato de otra organización ajena al grupo aparece en ningún momento — garantizado server-side desde 10.3.a/10.4.a, sin cambios acá.
- **Permisos/regresiones de rol:** verificado en navegador real con un usuario `LECTURA` — la pantalla completa queda bloqueada (`"No tenés permiso para ver esta sección."`), y el ítem "Grupo Económico" no aparece en su menú.
- **Regresiones:** `Usuarios.tsx`, `AuditoriaAdministrativa.tsx` y `Organizacion.tsx` verificados en navegador real, sin cambios de comportamiento. Los cuatro eventos de auditoría generados durante la validación (`acceso_grupo_otorgado`, `acceso_grupo_revocado`) aparecen correctamente en `AuditoriaAdministrativa.tsx` sin ningún cambio de ese archivo, confirmando lo ya previsto en el diseño general de 10.4.
- **Código muerto / imports innecesarios:** ninguno encontrado — los cinco imports del archivo nuevo se usan todos; no hay funciones ni bloques sin alcanzar.
- **Inconsistencias con `Usuarios.tsx`:** ninguna real — mismas convenciones de clases CSS, mismo patrón de gate de rol, mismo uso de `useAsyncAction`/`useConfirm`. La ausencia de un estado `modo` (que sí tiene `Usuarios.tsx`) es una simplificación correcta, no una inconsistencia: esta pantalla tiene un solo formulario, no tres.
- **Oportunidades de simplificación:** ninguna adicional identificada — el archivo ya evita abstracciones prematuras (sin sub-componentes, sin hooks nuevos en archivo propio) y las dos funciones auxiliares (`otorgadoPor`, `destinatario`) son small y de un solo propósito.

---

## 3. Validaciones ejecutadas (build + navegador real, con los hallazgos ya corregidos)

1. `npm run build` (frontend) limpio, 0 errores, tras la corrección de los dos hallazgos.
2. `npm run build` (backend) limpio, sin cambios.
3. **Validación funcional completa en navegador real** (extensión de Chrome disponible en esta sesión), con screenshots reales, contra el servidor de desarrollo:
   - Bootstrap del grupo → `"Grupo: Grupo de Prueba Fase 10.1"` visible como línea secundaria.
   - Búsqueda por email exacto → candidato resuelto, confirmación `medium`, otorgamiento exitoso, listado actualizado con destinatario enriquecido.
   - `"Vos"` (acceso otorgado por el propio usuario logueado) y `"Otro administrador de tu organización"` (acceso otorgado por un segundo `ADMINISTRADOR` de prueba, creado y luego desactivado) — ambos verificados.
   - `"Usuario no disponible"` — verificado desasociando temporalmente la organización destinataria del grupo; la fila se degrada correctamente sin romper la tabla ni bloquear la revocación.
   - Búsqueda de email inexistente y de la propia organización → mismo mensaje genérico `"Usuario no encontrado."`, indistinguibles.
   - **Cancelación de la confirmación de otorgar** → sin ningún efecto, el candidato resuelto permanece visible, ninguna llamada de escritura se ejecuta.
   - **Cancelación de la confirmación de revocar** → sin ningún efecto, la fila permanece en el listado.
   - Revocación confirmada (`high`, borde y botón rojos) → fila removida.
   - Estado vacío sin grupo económico → verificado desasociando temporalmente la propia organización.
   - Regresión de rol (`LECTURA`) → pantalla bloqueada, ítem de menú ausente.
   - Regresión de pantallas existentes (`Usuarios.tsx`, `AuditoriaAdministrativa.tsx`, `Organizacion.tsx`) → sin cambios de comportamiento.
   - Consola del navegador sin errores de la aplicación (únicamente warnings preexistentes de React Router y ruido propio de la extensión de Chrome, ya visto en 10.4.b).

Todos los datos de prueba fueron revertidos tras cada ronda: accesos otorgados durante la validación, revocados; ambas organizaciones, reasociadas al grupo.

---

## 4. Limitaciones conocidas

- Las cuatro condiciones de rechazo de `usuarios/resolver` (inexistente, inactivo, propia organización, otro grupo) ya fueron verificadas exhaustivamente contra el backend real durante el cierre de 10.4.a, endpoint que no cambió acá. En esta ronda se reconfirmaron dos de las cuatro directamente contra la interfaz de 10.4.c (inexistente, propia organización), con resultado idéntico entre sí — suficiente para confirmar que el frontend no introduce ninguna distinción nueva, sin necesidad de repetir las cuatro.
- Sin pruebas automatizadas (mismo criterio que el resto del frontend del proyecto — validación manual real, no suites de test).
- El enriquecimiento del listado dispara una llamada paralela por cada `usuarioId` único — aceptado en el diseño por el volumen bajo esperado; no revisado bajo un volumen alto (fuera de alcance de este sub-bloque).

## 5. Residuos conocidos

- Usuario `admin-temp-10.4c@demo.com`, creado temporalmente en desarrollo para validar la etiqueta `"Otro administrador de tu organización"` (no existía otro `ADMINISTRADOR` real en la organización de prueba). No se pudo eliminar (no existe endpoint de borrado de usuarios) — queda **desactivado** explícitamente, documentado como residuo conocido, consistente con `METODOLOGIA_SDC.md` ("si algo no se puede limpiar por una regla de negocio, se documenta explícitamente").
- Sin ningún otro residuo — `AccesoGrupoEconomico` en `0`, ambas organizaciones de prueba reasociadas al grupo económico, confirmado contra el servidor real antes de detenerlo.

## 6. Conclusión técnica

La implementación de Bloque 10.4.c cumple exactamente el alcance autorizado, respeta las cuatro decisiones técnicas aprobadas sin desviación, no modifica backend ni contratos, y no introduce regresiones en ninguna pantalla existente. La auditoría adversarial encontró dos problemas reales — ambos de una clase que el propio pedido de auditoría señalaba explícitamente (memory leak / condición de carrera) — que fueron corregidos, recompilados y re-validados antes de este cierre. No quedó ningún hallazgo sin resolver.

---

## Archivos (sin commitear todavía)

- `frontend/src/pages/GrupoEconomico.tsx` (nuevo).
- `frontend/src/App.tsx` (modificado) — nueva ruta.
- `frontend/src/components/Layout.tsx` (modificado) — nuevo ítem de menú.
- **Sin cambios:** cualquier archivo de backend, `AuthContext.tsx`, `api/client.ts`, `ConfirmDialog.tsx`, `useAsyncAction.ts`, `AuditoriaAdministrativa.tsx`, `Usuarios.tsx`, `Organizacion.tsx`.

## Rollback

Revertir los tres archivos de la sección anterior — no hay commit todavía que revertir. Sin migración, sin cambio de backend.

---

## Qué queda fuera de Bloque 10.4 (confirmado, no implementado)

Topología del Grupo Económico (crear/asociar/desasociar como autoservicio); identidad compartida de Chofer; Pago Consolidado (10.5/10.6). Con este cierre, **Bloque 10.4 (Frontend de Grupo Económico) queda completo** — 10.4.a, 10.4.b y 10.4.c, los tres cerrados.

---

**Pendiente de tu aprobación.** No se hizo `git add`, `commit` ni `push`.

# Auditoría — Bloque 10.4.c: Administración Visual de Accesos de Grupo Económico

Fecha: 2026-07-17. Etapa de Auditoría únicamente — `METODOLOGIA_SDC.md`, etapa 1. **No se propone solución, no se diseña, no se implementa, no se abre ninguna decisión técnica, no se modifica ningún archivo, no se hace git.** Releídos frescos, en esta sesión: `CONSTITUCION_SDC.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `ACTA_CIERRE_BLOQUE10.4a.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.4b.md`. Inspeccionado fresco, contra el código real: los cuatro controllers de `backend/src/grupo-economico/` (`grupo-economico.controller.ts`, `acceso-grupo.controller.ts`, `organizaciones-accesibles.controller.ts`, `identidad-chofer.controller.ts`), `grupo-economico.module.ts`, `usuario-grupo-lookup.service.ts`, `otorgar-acceso.dto.ts`, y del frontend: `App.tsx`, `Layout.tsx`, `Usuarios.tsx`, `AuditoriaAdministrativa.tsx`, `ConfirmDialog.tsx`, `useAsyncAction.ts`, `AuthContext.tsx`, más una búsqueda exhaustiva (`grep`) de `grupo-economico`/`GrupoEconomico` en todo `frontend/src`.

**Objetivo del bloque, tal como quedó definido:** administración visual de accesos de Grupo Económico (otorgar, listar, revocar) y consulta del grupo — Decisión Técnica 9 de `DECISIONES_TECNICAS_BLOQUE10.4.md`, el tercer y último sub-bloque de Bloque 10.4.

---

## 1. Estado actual

**Frontend: cero código relacionado con administración de Grupo Económico.** `grep` sobre `grupo-economico`/`GrupoEconomico` en todo `frontend/src` devuelve una sola coincidencia: el hook `useOrganizacionesAccesibles.ts` de 10.4.b, que consume `organizaciones-accesibles` (un endpoint distinto, de otro propósito — selector de organización, no administración de accesos). No existe ninguna ruta, pantalla, componente, ítem de menú, ni llamada a ningún endpoint de administración de grupo (`GET /grupo-economico`, `POST/GET/DELETE .../accesos`, `GET .../usuarios/resolver`).

**`App.tsx` (releído completo):** no hay ninguna ruta `/administracion/grupo-economico` ni similar. Las únicas rutas bajo `/administracion/` son `usuarios` y `auditoria`.

**`Layout.tsx` (`NAV_ITEMS`, releído completo tras el cierre de 10.4.b):** no hay ningún ítem de menú para Grupo Económico — la lista termina en `"Usuarios"`/`"Auditoría Administrativa"`, ambos `roles: ["ADMINISTRADOR"]`.

**Backend: los cuatro sub-bloques previos de Grupo Económico (10.1, 10.2, 10.3.a, 10.4.a) están cerrados, desplegados y verificados en producción** — ningún endpoint nuevo hace falta para lo que Decisión Técnica 9 describe; 10.4.c es, en principio, un consumidor puro de contratos ya existentes (a diferencia de 10.4.a, que sí tuvo que agregar dos endpoints nuevos).

## 2. Componentes existentes reutilizables

- **`Usuarios.tsx` (releído completo, 335 líneas) — el patrón más cercano a lo que 10.4.c necesita.** Estructura ya probada: gate de rol al principio (`if (usuario?.rol !== "ADMINISTRADOR") return <error-banner>`, redundante a propósito con el `RolesGuard` del backend); un estado `modo` que alterna entre paneles de formulario (`""` | `"crear"` | `"invitar"` | `"editar"`); un `useAsyncAction` por acción independiente (`crearAccion`, `invitarAccion`, `editarAccion`, `filaAccion` para las acciones por fila); confirmación (`useConfirm()`) antes de cada acción de fila, con mensajes que varían según el caso (ej. el aviso especial de "único ADMINISTRADOR activo"); tabla con botones de acción por fila, deshabilitados mientras `filaAccion.busy`.
- **`AuditoriaAdministrativa.tsx` (releído completo) — no necesita ningún cambio.** Es genérica sobre `accion`/`entidad` (sin ningún valor hardcodeado) y ya maneja `usuario: null` con gracia (`d.usuario?.nombre || "—"`) — los cuatro eventos de auditoría de Grupo Económico (`acceso_grupo_otorgado`, `acceso_grupo_revocado`, `grupo_economico_creado`, `grupo_economico_organizacion_asociada`/`desasociada`) ya son visibles ahí hoy, sin ningún trabajo adicional.
- **`ConfirmDialog.tsx`/`useConfirm()`** — soporta `severity: "medium"`/`"high"`, exactamente lo que Decisión Técnica 9 pide (otorgar = medium, revocar = high).
- **`useAsyncAction.ts`** — patrón `busy`/`error`/`success` ya usado en cada pantalla administrativa existente.
- **Clases CSS ya existentes** — `.card`, `.form-grid`, `.field`, `.actions-row`, `.error-banner`, `.success-banner`, `.warning-card` (usada en `Usuarios.tsx` para el panel de "enlace de un solo uso") — ninguna necesita crearse de cero.

## 3. Endpoints ya disponibles (inventario completo, verificado contra el código real)

| Endpoint | Método | Rol | Controller | Cerrado en |
|---|---|---|---|---|
| `/grupo-economico` | `GET` | `ADMINISTRADOR` | `GrupoEconomicoController.miGrupo()` | 10.1 |
| `/grupo-economico` | `POST` | `ADMINISTRADOR` | `GrupoEconomicoController.crear()` | 10.1 |
| `/grupo-economico/:id/organizaciones` | `POST` | `ADMINISTRADOR` | `GrupoEconomicoController.asociar()` | 10.1 |
| `/grupo-economico/:id/organizaciones/desasociar` | `POST` | `ADMINISTRADOR` | `GrupoEconomicoController.desasociar()` | 10.1 |
| `/grupo-economico/:id/accesos` | `POST` | `ADMINISTRADOR` | `AccesoGrupoController.otorgar()` | 10.3.a |
| `/grupo-economico/:id/accesos` | `GET` | `ADMINISTRADOR` | `AccesoGrupoController.listar()` | 10.3.a |
| `/grupo-economico/:id/accesos/:accesoId` | `DELETE` | `ADMINISTRADOR` | `AccesoGrupoController.revocar()` | 10.3.a |
| `/grupo-economico/:id/usuarios/resolver` | `GET` | `ADMINISTRADOR` | `AccesoGrupoController.resolverUsuario()` | 10.4.a |
| `/grupo-economico/organizaciones-accesibles` | `GET` | cualquier autenticado | `OrganizacionesAccesiblesController` | 10.4.a |
| `/grupo-economico/choferes/...` (6 rutas) | varios | `ADMINISTRADOR` | `IdentidadChoferGrupoController` | 10.2 — **fuera de alcance de 10.4 completo** (Decisión Técnica 10) |

Los siete primeros son los relevantes para 10.4.c. `organizaciones-accesibles` ya fue consumido por 10.4.b, no por 10.4.c. Las rutas de `choferes/` quedan explícitamente fuera.

## 4. Contratos reutilizables (forma exacta, verificada contra el código real)

- **`GET /grupo-economico`** → `{ id, nombre, createdAt, organizaciones: { id, nombre }[] }` **o `null`** si la organización del actor no pertenece a ningún grupo — caso ya contemplado desde 10.1, no es un caso de error.
- **`POST /grupo-economico/:id/accesos`** → body `{ usuarioId: string }` (`@IsUUID()`, exige un UUID exacto — no hay variante que acepte email directamente); devuelve el `AccesoGrupoEconomico` creado (`{ id, usuarioId, organizacionId, otorgadoPorId, createdAt }`).
- **`GET /grupo-economico/:id/accesos`** → `{ id: string, usuarioId: string, otorgadoPorId: string, createdAt: string }[]` — **sin nombre ni email de ninguno de los dos usuarios** (ni el destinatario `usuarioId` ni quien otorgó `otorgadoPorId`), solo IDs crudos. Ordenado por `createdAt` descendente. Sin paginación.
- **`DELETE /grupo-economico/:id/accesos/:accesoId`** → `{ revocado: true }` o `404` si el acceso no existe bajo la organización del actor (nunca revela si existe bajo otra organización).
- **`GET /grupo-economico/:id/usuarios/resolver?email=...`** (o `?usuarioId=...`, exactamente uno de los dos) → `{ id, nombre, email, organizacionId, nombreOrganizacion }` o `404` genérico. **Solo resuelve usuarios de OTRA organización del mismo grupo — rechaza explícitamente cualquier usuario de la propia organización del actor** (`usuario-grupo-lookup.service.ts`, `resolverEnGrupo()`: `if (usuario.organizacionId === organizacionActorId) return null;`).

## 5. Dependencias con 10.4.a y 10.4.b

- **Con 10.4.a:** dependencia directa y completa — `usuarios/resolver` es el único mecanismo disponible para que un `ADMINISTRADOR` identifique al destinatario de un acceso sin tipear un UUID a mano. Sin este endpoint (cerrado en 10.4.a), 10.4.c no tendría forma de resolver la Decisión Técnica 2 ya ratificada.
- **Con 10.4.b:** dependencia estructural indirecta, no de contrato. `AuthContext.tsx` ahora expone `usuario.organizacionId` (agregado en 10.4.b) — dato que 10.4.c podría usar para mostrar "actuando como [organización]" en la pantalla, igual que ya lo hace el selector de `Layout.tsx`. No hay ningún endpoint de 10.4.b que 10.4.c consuma directamente (`organizaciones-accesibles` resuelve una pregunta distinta: "a qué organización puedo cambiar", no "a quién le di acceso a la mía"). Sin conflictos de archivos: 10.4.b tocó `AuthContext.tsx`, `Layout.tsx`, `ViajeForm.tsx` y dos hooks — ninguno de esos archivos necesita volver a tocarse para 10.4.c salvo, eventualmente, `Layout.tsx` (para el ítem de menú nuevo) y `App.tsx` (para la ruta nueva) — ambos sin superposición real de líneas con lo que ya cambió 10.4.b.

## 6. Riesgos

- **`GET /grupo-economico` no es un adorno opcional — es un prerrequisito estructural.** Todas las demás rutas de administración de accesos exigen el `:id` del grupo económico en la URL (`/grupo-economico/:id/accesos`, `/grupo-economico/:id/usuarios/resolver`). Ese id no está disponible en ningún otro contrato ya consumido por el frontend (ni en `organizaciones-accesibles`, ni en `AuthContext`) — la única forma de obtenerlo es `GET /grupo-economico`. Esto importa porque **Decisión Técnica 9, en su texto literal, describe la pantalla con "dos secciones diferenciadas: otorgar acceso, y accesos vigentes"** — sin mencionar una tercera sección de "consulta del grupo" (que sí proponía la sección 10 del diseño general anterior, `DISENO_BLOQUE10.4_FRONTEND.md`, como parte de la misma pantalla). Independientemente de si se decide mostrar visualmente los datos del grupo, **la llamada a `GET /grupo-economico` es inevitable** solo para poder armar las URLs de las otras cuatro rutas.
- **`usuarios/resolver` no puede enriquecer `otorgadoPorId`.** El listado de accesos (`GET /grupo-economico/:id/accesos`) devuelve `usuarioId` (destinatario, resoluble — pertenece, por construcción, a otra organización del mismo grupo) y `otorgadoPorId` (quien otorgó, que es siempre alguien de la **propia** organización del actor, por construcción de `otorgar()`). El endpoint de resolución rechaza explícitamente cualquier usuario de la propia organización (`resolverEnGrupo()`, sección 4) — así que **no existe hoy ningún contrato que permita mostrar el nombre de quien otorgó cada acceso**, solo el de a quién se le otorgó. Si el diseño de 10.4.c decide que ese dato debe mostrarse, no hay forma de resolverlo con los endpoints actuales.
- **Sin endpoint de listado/búsqueda amplia de usuarios candidatos** — ya una restricción deliberada y ya aprobada (Decisión Técnica 2 de `DECISIONES_TECNICAS_BLOQUE10.4.md`: "nunca parcial/'contiene'/autocompletado/listado abierto"), no un hallazgo nuevo, pero condiciona directamente cómo puede ser el formulario de "otorgar": un campo de búsqueda exacta (email o UUID), nunca una lista desplegable de candidatos.
- **`GET /grupo-economico/:id/accesos` no pagina.** Devuelve todos los accesos otorgados por la organización del actor en una sola respuesta. Riesgo bajo dado el volumen esperado (una relación cross-organización dentro de un mismo grupo económico es, por naturaleza, de bajo volumen — no miles de filas), pero es una limitación real del contrato, no del frontend.
- **Estado vacío obligatorio:** si la organización del actor no pertenece a ningún grupo económico (`GET /grupo-economico` → `null`, un caso legítimo desde 10.1, no un error), toda la pantalla de 10.4.c queda sin sentido — ninguna de las otras cuatro rutas tiene un `:id` válido para usar. La pantalla necesita, como mínimo, distinguir este caso de un error real de carga.

## 7. Deuda técnica

- **Contrato desactualizado en `DISENO_BLOQUE10.4_FRONTEND.md`, sección 9** — ya señalado en la auditoría de 10.4.b, pero ahora sí es directamente relevante: ese documento describe `GET /grupo-economico/:id/usuarios/buscar?email=...` con respuesta `{ id, nombre, email, organizacionId, activo }`. El contrato real, cerrado en 10.4.a, es `GET /grupo-economico/:id/usuarios/resolver` con respuesta `{ id, nombre, email, organizacionId, nombreOrganizacion }` (sin `rol`, sin `activo`, con `nombreOrganizacion` en su lugar). Cualquier diseño de 10.4.c debe citar `ACTA_CIERRE_BLOQUE10.4a.md` y el código real, no esa sección del documento general.
- **Ausencia estructural de un contrato para resolver `otorgadoPorId`** (sección 6) — deuda real, no creada por 10.4.c, mencionada acá porque es el primer sub-bloque donde efectivamente importaría.
- **`crear`/`asociar`/`desasociar` de Grupo Económico siguen sin ninguna interfaz** — deuda ya aceptada explícitamente desde el diseño general de 10.4 (sección 10: "queda fuera de 10.4, como procedimiento administrativo controlado"), no generada por 10.4.c, pero sigue vigente y no tiene ningún sub-bloque futuro asignado en `PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` más allá de lo ya excluido.
- **`IdentidadChoferGrupo` sin ninguna interfaz** — misma situación, dependencia real solo de Pago Consolidado (10.5/10.6), no de 10.4.

## 8. Alcance real necesario para 10.4.c

Con la sola base de lo verificado (sin proponer solución todavía), lo mínimo indispensable para que un `ADMINISTRADOR` pueda otorgar, ver y revocar accesos desde la interfaz es:
- Una llamada a `GET /grupo-economico` (obligatoria, aunque no necesariamente visible como sección propia — ver sección 6) para obtener el `:id` del grupo y decidir el estado vacío.
- Un formulario de resolución exacta (`GET /grupo-economico/:id/usuarios/resolver`) seguido de `POST /grupo-economico/:id/accesos` con el `usuarioId` ya resuelto.
- Una tabla sobre `GET /grupo-economico/:id/accesos`, con el problema de enriquecimiento de `usuarioId` (resoluble) y `otorgadoPorId` (no resoluble hoy — sección 6) sin resolver todavía.
- Una acción de revocar por fila sobre `DELETE /grupo-economico/:id/accesos/:accesoId`.
- Una ruta nueva y un ítem de menú nuevo, ambos `ADMINISTRADOR`-only, siguiendo el patrón ya usado por `/administracion/usuarios` y `/administracion/auditoria`.

Ningún cambio de backend parece necesario para cubrir lo anterior, salvo que el diseño decida que mostrar el nombre de quien otorgó cada acceso es un requisito real — en cuyo caso haría falta una extensión de backend (fuera del alcance de esta auditoría proponerla).

---

## Riesgos (resumen)

En orden de relevancia: (a) `GET /grupo-economico` es un prerrequisito estructural, no una sección opcional — tensión entre el texto literal de Decisión Técnica 9 (dos secciones) y la sección 10 del diseño general anterior (que sí proponía una tercera); (b) `otorgadoPorId` no tiene ningún contrato de resolución; (c) sin paginación en el listado (riesgo bajo); (d) estado vacío obligatorio si la organización no pertenece a ningún grupo.

## Preguntas abiertas

Ninguna requiere resolverse en esta etapa de auditoría — las dos tensiones reales (secciones 6 y 8: si `GET /grupo-economico` se muestra como sección visual propia o solo se consume internamente; si el nombre de `otorgadoPorId` es un requisito real que justificaría una extensión de backend) son, exactamente, el tipo de definición que corresponde a la etapa de Diseño, no a esta auditoría. No se encontró ningún conflicto arquitectónico que exija detenerse antes de diseñar.

## Recomendaciones

No se encontró ningún conflicto arquitectónico real ni ninguna razón para no avanzar. Se recomienda pasar a la etapa de Diseño Técnico de Bloque 10.4.c, con las dos tensiones de la sección anterior planteadas explícitamente como puntos a resolver (no como bloqueos), y con `ACTA_CIERRE_BLOQUE10.4a.md` como única fuente válida de los contratos reales de `usuarios/resolver` y `organizaciones-accesibles` (no la sección 9 de `DISENO_BLOQUE10.4_FRONTEND.md`, ya desactualizada).

---

No se propuso solución, no se diseñó, no se implementó, no se modificó ningún archivo, no se abrió ninguna decisión técnica, no se hizo git add/commit/push. Detenido al finalizar, a la espera de tu aprobación antes de iniciar la etapa de Diseño de Bloque 10.4.c.

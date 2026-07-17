# Acta de Cierre — Bloque 10.4.a: Backend mínimo para Frontend de Grupo Económico

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`). Fecha: 2026-07-17. Primer sub-bloque de Bloque 10.4, sobre la base ya cerrada de Bloques 10.1, 10.2, 10.3.a y 10.3.b, siguiendo `AUDITORIA_BLOQUE10.4_FRONTEND.md`, `DISENO_BLOQUE10.4_FRONTEND.md` y `DECISIONES_TECNICAS_BLOQUE10.4.md` (Decisiones 1 y 2, únicamente). **Todavía sin commit funcional** — este documento se genera para tu aprobación antes de cualquier `git add`/`commit`/`push`, según instrucción explícita.

---

## 1. Endpoints implementados

### `GET /grupo-economico/organizaciones-accesibles` (Decisión Técnica 1)

Nuevo controller dedicado, `OrganizacionesAccesiblesController`, con `@UseGuards(JwtAuthGuard)` únicamente — **sin `RolesGuard`**, deliberado: es el único endpoint de todo el módulo `grupo-economico` sin restricción de rol, porque el acceso multiempresa es independiente del rol funcional (ya establecido en `DECISIONES_TECNICAS_BLOQUE10.3.md`). Vive en un controller propio porque NestJS apila guards a nivel de clase — no existe forma de "quitar" `RolesGuard` para un único método si ya está declarado en `AccesoGrupoController`/`GrupoEconomicoController`.

Responde `{ id, nombre, esActual }[]`: siempre incluye la organización de pertenencia real del usuario, más las organizaciones adicionales con `AccesoGrupoEconomico` vigente en el mismo grupo — nunca organizaciones sin acceso. Orden: propia primero, resto alfabético. `esActual` refleja la organización activa del JWT en el momento de la consulta, no necesariamente la de pertenencia (ver sección 3, hallazgo corregido).

### `GET /grupo-economico/:id/usuarios/resolver` (Decisión Técnica 2)

Nuevo método en `AccesoGrupoController` (`ADMINISTRADOR`, mismo `verificarGrupo()` ya existente de 10.3.a). Exige exactamente uno de `email` o `usuarioId` (`400` si ambos o ninguno). Resuelve, vía `UsuarioGrupoLookupService.resolverEnGrupo()` (Prisma crudo, segundo consumidor ya autorizado desde 10.3.a), un usuario existente, activo, de **otra** organización del mismo grupo — nunca de otro grupo, nunca de la propia organización del actor. Contrato: `{ id, nombre, email, organizacionId, nombreOrganizacion }`, **sin `rol`** — confirmado explícitamente por vos como decisión final: el endpoint solo confirma identidad, el acceso multiempresa es independiente del rol, y no corresponde exponer información adicional de otra organización sin necesidad concreta. Las cuatro condiciones de rechazo (inexistente, inactivo, de otro grupo, de la propia organización) devuelven la misma respuesta genérica `404 "Usuario no encontrado."`, indistinguibles entre sí.

**Sin migración** — sin cambios de `schema.prisma`, confirmado por `prisma migrate status` (21/21, sin pendientes) antes y después del hallazgo de la sección 3.

## 2. Por qué no se amplió el allow-list de `PrismaService` crudo

Ambos endpoints resuelven sus necesidades sin exponer nuevo acceso crudo a nivel de controller: `organizaciones-accesibles` usa `ORGANIZACION_PRISMA` para `Organizacion`/`AccesoGrupoEconomico` (ninguno es modelo organizacional, pasan sin filtrar) y `UsuarioGrupoLookupService` —ya en el allow-list desde 10.3.a— para el único dato que requiere Prisma crudo (ver sección 3); `usuarios/resolver` reutiliza el mismo servicio con un método nuevo, estrecho, documentado. Ningún controller recibió `PrismaService` directamente.

## 3. Hallazgo real durante la revisión adversarial, y su corrección — `esActual` vs. pertenencia real

Al releer `organizaciones-accesibles.controller.ts` contra el caso explícito pedido (pertenencia en A, JWT activo en B tras un cambio de organización, acceso vigente a B), la primera versión calculaba la organización "propia" a partir de `actor.organizacionId` — el campo que `JwtStrategy.validate()` (`jwt.strategy.ts:25`) toma directo de `payload.organizacionId`. Pero `AuthService.cambiarOrganizacion()` (`auth.service.ts:113`) firma el nuevo JWT con `organizacionId: organizacionIdDestino` — tras un cambio de organización activa (Bloque 10.3.b), `actor.organizacionId` deja de representar la organización de pertenencia y pasa a representar el **contexto activo actual**.

**Consecuencia real de la primera versión:** en el escenario pedido, la organización de pertenencia (A) desaparecía por completo de la respuesta, y la organización activa (B) quedaba marcada como "propia" — violando directamente la Decisión Técnica 1 ("siempre incluye la organización de pertenencia del usuario").

Tampoco era viable resolver la pertenencia real consultando `Usuario` vía el cliente scopeado (`ORGANIZACION_PRISMA`): `organizacion-prisma.client.ts:85-99` filtra `findUnique` sobre modelos organizacionales (`Usuario` está en la lista, línea 175) descartando el resultado si `organizacionId` no coincide con el contexto activo — exactamente el caso que había que cubrir habría devuelto `null`.

**Corrección aplicada:** nuevo método `organizacionPropia(usuarioId)` en `UsuarioGrupoLookupService` (Prisma crudo, sin filtrar por contexto), usado exclusivamente por este controller para obtener la pertenencia real desde la base. `esActual` se calcula aparte, comparando cada organización candidata (propia o adicional) contra `actor.organizacionId` — puede corresponder a la propia o a una adicional, nunca a ambas ni a ninguna.

**Verificado, no solo corregido:** reproducido el escenario exacto contra el servidor real — `liquidaciones@demo.com` (pertenencia Organización Principal) con acceso otorgado a Organización B, login normal (JWT activo = pertenencia) y luego `POST /auth/cambiar-organizacion` real hacia B. `GET /grupo-economico/organizaciones-accesibles` con el token resultante devolvió exactamente `[{Organización Principal, esActual:false}, {Organización B, esActual:true}]` — pertenencia incluida, sin duplicados, sin organizaciones no autorizadas. Repetida toda la batería de pruebas previa (usuario de una sola organización, sin `RolesGuard`, filtrado de accesos obsoletos al desasociar un grupo, resolución por email/id, los cuatro rechazos genéricos) sin regresiones.

## 4. Respuestas a las 14 preguntas de la auditoría adversarial

1. **¿Puede revelar una organización sin acceso vigente?** No — `adicionales` solo incluye organizaciones con fila real en `AccesoGrupoEconomico` para `usuarioId: actor.id`, re-filtradas en cada consulta por pertenencia al mismo grupo (sección 6).
2. **¿La organización propia se obtiene desde el Usuario real, no de datos manipulables?** Sí, tras la corrección — `usuarioLookup.organizacionPropia(actor.id)`, con `actor.id` = `payload.sub`, verificado criptográficamente por la firma del JWT, no manipulable por el cliente.
3. **¿`esActual` representa la organización activa del JWT y no la de pertenencia?** Sí, tras la corrección — comparación explícita `org.id === actor.organizacionId` para cada organización candidata, independiente de cuál sea la propia.
4. **¿Qué ocurre al operar desde una organización adicional?** Verificado en sección 3: la propia aparece con `esActual:false`, la activa (aunque sea la adicional) con `esActual:true`.
5. **¿Puede un acceso viejo seguir apareciendo si las organizaciones dejan de pertenecer al mismo grupo?** No — re-verificado tras la corrección: al desasociar Organización B del grupo, desapareció de inmediato de la respuesta; al reasociarla, reapareció. Sin caché.
6. **¿El endpoint de resolución permite enumeración por email o UUID?** No — mismo `404` genérico ante cualquier no-coincidencia, sin filtrado parcial ni listado abierto.
7. **¿Hay diferencia observable entre inexistente, inactivo, propia organización y otro grupo?** No, las cuatro devuelven el mismo cuerpo y código, verificado explícitamente en esta ronda para las cuatro condiciones.
8. **¿Puede un `ADMINISTRADOR` consultar usuarios de un grupo ajeno manipulando `:id`?** No — `verificarGrupo(id, actor)` deriva la pertenencia al grupo desde `actor.organizacionId` (la organización que el actor está operando activamente, correcto en este contexto porque es la organización que ejerce la acción administrativa, no su pertenencia — distinción legítima, no el mismo bug de la sección 3) y la compara contra el `grupoEconomicoId` real de esa organización.
9. **¿Puede resolver un usuario y luego otorgar acceso aunque la situación cambie entre ambas llamadas?** `resolverUsuario()` no crea ni reserva nada — es una consulta pura.
10. **¿`otorgar()` vuelve a validar todo, sin confiar en la resolución previa?** Sí, sin cambios respecto de 10.3.a: revalida existencia, `activo`, organización, pertenencia al grupo y unicidad (`@@unique([usuarioId, organizacionId])` + manejo de `P2002`) de forma completamente independiente.
11. **¿Hay condiciones de carrera, fugas o bypass de permisos?** No encontradas, más allá del hallazgo ya corregido en la sección 3 (que era una fuga de datos incorrectos, no un bypass de permisos — nunca expuso una organización sin acceso real).
12. **¿Se modificó accidentalmente algún contrato previo?** No — `git status` confirma exactamente los archivos esperados; `verificarDestinatario()`, `otorgar()`, `listar()`, `revocar()`, `asociar()`, `desasociar()`, `AuthService.cambiarOrganizacion()`, `JwtStrategy`, `RolesGuard`, `schema.prisma` sin cambios.
13. **¿Hay desviación respecto del diseño aprobado?** Ninguna tras la corrección. El campo `rol` se omitió deliberadamente en `resolverEnGrupo()`, confirmado por vos como decisión final para este documento.
14. **¿Hay motivo objetivo para no cerrar 10.4.a?** No, tras corregir y re-validar el hallazgo de la sección 3.

## 5. Validaciones técnicas ejecutadas

1. `npm run build` limpio (0 errores) antes y después de la corrección.
2. `npx prisma validate` → esquema válido.
3. `npx prisma migrate status` → 21/21, sin pendientes, sin migración nueva.
4. Servidor de desarrollo levantado dos veces (antes y después de la corrección), `GET /api/v1/health` → `200` en ambas.

## 6. Validaciones funcionales ejecutadas (desarrollo)

**`organizaciones-accesibles`:** usuario con una sola organización; sin token → `401`; usuario con varias organizaciones (orden y `esActual` correctos); sin `RolesGuard` (usuario con rol `LIQUIDACIONES`, no `ADMINISTRADOR`, responde `200`); acceso obsoleto tras desasociar un grupo desaparece de inmediato; **escenario crítico de pertenencia A / JWT activo en B / acceso vigente a B**, verificado end-to-end con un cambio de organización real vía `POST /auth/cambiar-organizacion`.

**Resolución exacta:** email correcto; id correcto; usuario inexistente; usuario de la propia organización del actor; usuario inactivo; usuario de organización fuera del grupo (verificado desasociando temporalmente una organización real y restaurándola); ambos parámetros a la vez → `400`; ningún parámetro → `400`; las cuatro condiciones de rechazo devuelven la misma respuesta genérica.

## 7. Limpieza de datos de prueba (desarrollo)

Al finalizar: `AccesoGrupoEconomico` de prueba revocado (dos otorgamientos durante la validación, ambos revocados); Organización B re-asociada al grupo tras cada desasociación temporal; sin usuarios desactivados; estado de desarrollo idéntico al que existía antes de empezar. Servidor de desarrollo detenido.

## 8. Backend — archivos de la implementación (sin commitear todavía)

- `backend/src/grupo-economico/organizaciones-accesibles.controller.ts` (nuevo).
- `backend/src/prisma/usuario-grupo-lookup.service.ts` (modificado): nuevos métodos `resolverEnGrupo()` y `organizacionPropia()`.
- `backend/src/grupo-economico/acceso-grupo.controller.ts` (modificado): nuevo método `resolverUsuario()`.
- `backend/src/grupo-economico/grupo-economico.module.ts` (modificado): registro de `OrganizacionesAccesiblesController`.
- **Sin cambios:** `AuthController`, `AuthService`, `JwtStrategy`, `RolesGuard`, `ORGANIZACION_PRISMA`, `organizacion-prisma.client.ts`, `schema.prisma`, cualquier migración existente, cualquier archivo de frontend. Confirmado por `git status` antes de cada ronda de pruebas.

## 9. Rollback

Revertir los cuatro archivos de la sección 8 antes del commit funcional — no hay commit todavía que revertir. Sin migración.

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Cualquier código de frontend; `Layout.tsx`; selector de organización; flujo de confirmación de cambio; `beforeunload`; evento `storage`; sincronización entre pestañas; administración visual de accesos (10.4.c); administración de topología del Grupo Económico o de `IdentidadChoferGrupo` — todo excluido de 10.4 por Decisión Técnica 10.

---

**Revisión adversarial independiente ejecutada antes de este cierre** (misma sesión, contra las 14 preguntas específicas pedidas): encontró y corrigió el hallazgo de la sección 3 (pertenencia real vs. contexto activo del JWT en `organizaciones-accesibles`); repitió la batería completa de pruebas tras la corrección, sin regresiones; no encontró ningún otro problema objetivo.

**Pendiente de tu aprobación.** No se hizo `git add`, `commit` ni `push`. No se abre Bloque 10.4.b. El orden posterior, solo con nueva autorización: commit funcional → push → verificación de producción → actualizar este acta con la evidencia de producción → mover a `docs/cierres/` → commit documental → push.

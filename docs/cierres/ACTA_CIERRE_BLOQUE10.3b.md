# Acta de Cierre — Bloque 10.3.b: Cambio de Organización Activa

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`). Fecha: 2026-07-16. Continuación directa de Bloque 10.3.a, sobre la base ya cerrada de Bloques 10.1, 10.2 y 10.3.a, siguiendo `AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md`, `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` y `DECISIONES_TECNICAS_BLOQUE10.3b.md`. **Commit funcional real: `8c42486` — `feat(auth): add active organization switching`, pusheado a `origin/main` y desplegado en producción**, verificado.

---

## 1. Endpoint implementado y desplegado

**`POST /auth/cambiar-organizacion`**, en `AuthController`, con lógica en `AuthService.cambiarOrganizacion()` (Decisión Técnica 1). Único método de `AuthController` protegido por `@UseGuards(JwtAuthGuard)` — los otros tres (`login`, `recuperar-contrasena`, `restablecer-contrasena`) siguen públicos, sin cambios. Sin `RolesGuard`: la autorización real la da `AccesoGrupoEconomico`, no un rol.

**Request:** `{ organizacionId: string }` (`CambiarOrganizacionDto`, `@IsUUID()`). **Respuesta exitosa:** `{ accessToken, usuario }`, forma idéntica a `login()` (Decisión Técnica 3) — `usuario` con exactamente `{ id, nombre, email, rol, organizacionId }`, sin `organizacionesAccesibles`, sin `organizacionActiva`.

**Validaciones, en el orden exacto ya aprobado:**
1. `Usuario` (del `sub` del token) sigue existiendo.
2. `Usuario.activo === true`.
3. La organización destino existe.
4. Es la propia organización de pertenencia (volver) **o** existe `AccesoGrupoEconomico` vigente para `(usuario.id, organizacionId)`.
5. Si no es la propia organización: la organización de pertenencia del usuario y la destino pertenecen, en este momento, al mismo `GrupoEconomico` — revalidado en cada uso, nunca asumido desde el otorgamiento.

Cualquier fallo → `403` genérico (`"No tenés autorización para operar esa organización."`), sin distinguir motivo, sin emitir token.

**Sin migración** — todo el modelo de datos necesario (`AccesoGrupoEconomico`, `GrupoEconomico`, `Organizacion`) ya existía desde 10.1/10.3.a. Confirmado en producción vía `railway logs --deployment`: `"No pending migrations to apply."`

## 2. Por qué la lógica vive en `AuthService`, no en un guard `CanActivate` separado

En NestJS, los Guards corren antes que los Interceptors — corroborado no solo por análisis propio sino por un comentario preexistente e independiente en `organizacion-context.interceptor.ts` ("garantizado por Nest a correr antes que cualquier Interceptor"). Un guard nuevo que intentara usar `ORGANIZACION_PRISMA` se encontraría con el contexto de `AsyncLocalStorage` todavía sin sembrar. No hizo falta resolver esta tensión con nada nuevo: la Decisión Técnica 1 ya había puesto la lógica en `AuthService`, que ya está en el allow-list de `PrismaService` crudo desde `login()`. No se creó ningún archivo de guard.

## 3. Hallazgo real durante la implementación, y su corrección — excepción deliberada de `usuarioId null`

Al validar en desarrollo, la primera ejecución de un cambio exitoso falló con `P2003`. **Causa real:** `AuditLog.usuario` es una FK **compuesta** — `@relation(fields: [usuarioId, organizacionId], references: [id, organizacionId])`, confirmado en `schema.prisma`. La entrada del lado **destino** intentaba guardar `organizacionId: <destino>` junto con `usuarioId: <id del usuario>`, pero ese usuario pertenece realmente a la organización de **origen**: ese par no corresponde a ningún `Usuario` real, y Postgres rechazó la escritura.

Mismo tipo de tensión estructural ya resuelta en Bloque 10.2 para `IdentidadChoferGrupo.creadoPorId`. **Corrección aplicada, deliberada y documentada:** la entrada del lado destino guarda `usuarioId: null` (el campo es nullable — `AuditLog.usuarioId String?`, confirmado en schema — así que la FK compuesta no se evalúa) y conserva el id real del usuario como dato plano en `datosAnteriores.usuarioId`, junto con `organizacionOrigenId`. Trazabilidad completa por `entidad: "Usuario"` + `entidadId: usuario.id` (siempre poblado, nunca null) + `datosAnteriores`, sin violar integridad referencial. La entrada del lado origen no tiene este problema y no se modificó.

**Verificado, no solo razonado, que esta excepción no rompe nada:** `GET /organizacion/auditoria` (`organizacion.controller.ts:79-124`) hace `select: { usuarioId: true, usuario: { select: {...} } }` sobre una relación opcional — Prisma resuelve automáticamente `usuario: null` cuando `usuarioId` es `null`, sin ningún código especial, sin excepción, sin romper la serialización. Confirmado contra el endpoint real: la organización destino ve su entrada con `usuario: null` pero con `entidadId`/`datosAnteriores.usuarioId` intactos — ninguna otra organización queda expuesta por esta excepción, que queda acotada al propio evento autorizado.

## 4. Auditoría implementada

- **`organizacion_activa_cambiada`** — dos entradas atómicas por cambio exitoso, en la misma transacción (`$transaction([...])`, forma de arreglo — si una falla, ninguna se aplica): origen (`datosNuevos.organizacionDestinoId`, `usuarioId` real) y destino (`datosAnteriores: { organizacionOrigenId, usuarioId }`, `usuarioId` de la fila en `null` — sección 3).
- **`intento_cambio_organizacion_denegado`** — una entrada por intento fallido, exclusivamente bajo la organización de origen. La función `registrarIntentoDenegado()` recibe únicamente `(organizacionOrigenId, usuarioId)` como parámetros — **estructuralmente** no puede recibir ni guardar ningún dato de la organización destino. Escritura *best-effort*, envuelta en `try/catch`: un fallo al auditar nunca impide ni altera el `403` real (Decisión Técnica 5).

## 5. Vigencia heredada — verificado matemática y empíricamente

`segundosRestantes = exp_actual − ahora`, y `jwt.sign(payload, { expiresIn: segundosRestantes })` produce `exp_nuevo = iat_nuevo + segundosRestantes = exp_actual` exactamente. Probado dos veces contra el servidor real: la segunda con más de 20 segundos de diferencia real entre el login y el cambio — `iat` distinto (posterior), `exp` **exactamente idéntico**. Probado además en cadena completa A→B→A: el `exp` se mantuvo idéntico en las tres etapas, no solo en un salto.

## 6. Validaciones ejecutadas (desarrollo, antes del commit funcional, y re-verificadas contra el código real inmediatamente antes de stagear)

1. Build backend y frontend limpios (frontend sin cambios).
2. `prisma migrate status`: sin pendientes, 21 migraciones, ninguna nueva.
3. Cambio propio A→A (sin necesitar `AccesoGrupoEconomico`) → `201`.
4. A→B sin acceso → `403`.
5. `organizacionId` con formato inválido → `400` (DTO, antes de la lógica, sin auditoría).
6. Organización inexistente (UUID válido) → `403`.
7. Sin token → `401`.
8. A→B con acceso otorgado → `201`, respuesta con exactamente `{ accessToken, usuario }`, `usuario` con exactamente 5 claves.
9. Herencia de `exp` confirmada (sección 5).
10. Auditoría de éxito verificada contra `GET /organizacion/auditoria` real desde ambas organizaciones — cada una ve únicamente su propia mitad, sin fuga cruzada.
11. Auditoría de intento denegado verificada — bajo origen únicamente, sin ningún dato de la organización destino.
12. Token ya emitido sigue funcionando tras revocar el acceso (riesgo ya aceptado, Decisión Técnica 4 de `DECISIONES_TECNICAS_BLOQUE10.3.md`) — verificado contra `GET /organizacion` antes y después de revocar, `200` en ambos casos.
13. Un intento nuevo de cambio, después de revocar, con un token distinto → `403`.
14. Usuario desactivado a mitad de sesión (vía `PATCH /usuarios/:id/activo` real) → cambio de organización rechazado, confirmando revalidación real contra la base.
15. Organización desasociada del Grupo Económico después de otorgado el acceso (vía el endpoint real de 10.1) → siguiente intento de cambio rechazado; organización re-asociada al finalizar.
16. Regresión completa: `GET /grupo-economico` (10.1), `GET /grupo-economico/choferes/identidades` (10.2), `/organizacion`, `/viajes`, `/liquidaciones`, `/clientes` — sin cambios.
17. `GET /grupo-economico/organizaciones-accesibles` sigue sin existir (`404`) — confirmado que no se implementó, tal como se decidió (Decisión Técnica 3 de Bloque 10.3.b).
18. Sin secretos en logs — verificado con grep directo sobre el log real del servidor, sin coincidencias.

## 7. Producción — desplegada y verificada

- Commit `8c42486` pusheado a `origin/main`; deploy automático confirmado.
- `GET /api/v1/health` → `200`.
- `railway logs --deployment`: `"21 migrations found... No pending migrations to apply."` — ninguna migración nueva, tal como se esperaba.
- Rutas mapeadas y confirmadas en los logs de arranque: `AuthController` con sus 4 rutas (`login`, **`cambiar-organizacion`**, `recuperar-contrasena`, `restablecer-contrasena`); `GrupoEconomicoController`, `IdentidadChoferGrupoController`, `AccesoGrupoController` — las tres de 10.1/10.2/10.3.a — siguen mapeadas, sin cambios.
- `POST /auth/cambiar-organizacion` sin token → `401`.
- Regresión completa contra producción: `/organizacion`, `/viajes`, `/liquidaciones`, `/grupo-economico`, `/grupo-economico/choferes/identidades` → `401` sin cambios; `POST /grupo-economico/x/accesos` sin token → `401`.
- Sin errores ni excepciones en los logs de deploy (búsqueda explícita, sin coincidencias).
- Sin secretos en los logs de deploy (búsqueda explícita, sin coincidencias).
- **No se ejecutó ningún cambio de organización autenticado en producción, ni se otorgó ni revocó ningún acceso real** — toda la validación funcional se hizo contra el entorno de desarrollo local; contra producción solo se verificó ruteo, salud y logs, sin usar credenciales reales.

## 8. Limpieza de datos de prueba (desarrollo)

Al finalizar: `AccesoGrupoEconomico` en `0`; entradas de `AuditLog` de prueba (`organizacion_activa_cambiada` + `intento_cambio_organizacion_denegado`) eliminadas explícitamente en cada ronda de validación; `liquidaciones@demo.com` restaurado a `activo: true` / organización de pertenencia original; Organización B re-asociada al Grupo Económico de prueba — estado de desarrollo idéntico al que existía antes de empezar.

## 9. Backend — archivos del commit funcional (`8c42486`)

- `backend/src/auth/auth.controller.ts` (modificado): nuevo método `cambiarOrganizacion`.
- `backend/src/auth/auth.service.ts` (modificado): nuevo método `cambiarOrganizacion` + helper privado `registrarIntentoDenegado`.
- `backend/src/auth/dto/cambiar-organizacion.dto.ts` (nuevo).
- **Sin cambios**: `JwtStrategy`, `RolesGuard`, `organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`, `ORGANIZACIONAL_MODELS`, `schema.prisma`, cualquier archivo de frontend, `AccesoGrupoController`/`GrupoEconomicoController`/`IdentidadChoferGrupoController`. Confirmado por `git status` antes de stagear.

## 10. Rollback

Revertir el commit `8c42486` — ningún token ya emitido queda incompatible (el JWT no cambió de forma); los `AccesoGrupoEconomico` de 10.3.a siguen intactos. Sin migración que revertir.

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Selector visual de organización; cualquier código de frontend; propagación entre pestañas (evento `storage` — ratificada como decisión técnica, implementación íntegra de Bloque 10.4); `GET /grupo-economico/organizaciones-accesibles`; Pago Consolidado; cualquier cambio a `JwtStrategy`, `RolesGuard`, `ORGANIZACION_PRISMA`, o a la forma del JWT más allá de lo ya decidido — todo según lo previsto para 10.4 y bloques posteriores.

---

**Revisión adversarial independiente ejecutada antes de este cierre** (misma sesión): encontró y corrigió el hallazgo de la sección 3 (FK compuesta); no encontró ningún otro problema objetivo en una segunda ronda de revisión completa contra las 13 preguntas estándar de auditoría adversarial.

No se abre Bloque 10.4. Bloque 10.3.b queda cerrado con este documento, después de verificar el código, la validación funcional, la auditoría adversarial y el despliegue real en producción.

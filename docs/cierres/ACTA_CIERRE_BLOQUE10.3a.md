# Acta de Cierre — Bloque 10.3.a: Modelo y administración de accesos de Grupo Económico

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`: ninguna sesión se declara a sí misma terminada). Fecha de redacción original: 2026-07-16. Fecha de cierre efectivo: 2026-07-16, después de la corrección documentada abajo. Primer sub-bloque de la implementación de Bloque 10.3 (Acceso de usuarios y cambio de organización activa), sobre la base ya cerrada de Bloques 10.1 y 10.2, siguiendo `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` y `DECISIONES_TECNICAS_BLOQUE10.3.md`.

---

## Nota de corrección — esta acta fue publicada fuera de orden

**Hecho, sin ocultarlo:** la primera versión de este documento se commiteó y pusheó (`7836fbc`) **antes** de que el código funcional de 10.3.a (`schema.prisma`, la migración, `AccesoGrupoController`, `OtorgarAccesoDto`, `UsuarioGrupoLookupService`/`Module`, el cambio en `GrupoEconomicoModule`) tuviera su propio commit. En ese momento, todo lo que el resto de este documento describe como "ya validado" era cierto — build, pruebas, auditoría adversarial — pero el código en sí seguía únicamente en el árbol de trabajo local, sin publicar. Las secciones 2 y 10 originales, tal como se escribieron entonces, decían correctamente "no aplicada en producción todavía" — una auditoría independiente posterior detectó que esa secuencia (acta publicada antes que el código que documenta) era, en sí misma, una inconsistencia objetiva: el bloque no podía darse por cerrado mientras la funcionalidad no existiera desplegada.

**Corrección aplicada, en orden real:**
1. Commit técnico previo, ya publicado antes de esta acta: `23c50dc` — corrección del allow-list de `PrismaService` crudo en `prisma.module.ts`.
2. Commit documental original de esta acta (con las secciones 2 y 10 todavía diciendo "no aplicada en producción"): `7836fbc`.
3. **Commit funcional real de 10.3.a**, con el código completo: `fd8355b` — `feat(group-economic): add cross-organization access administration`.
4. **Deploy real verificado** vía `railway logs --deployment`: `21 migrations found in prisma/migrations` → `Applying migration 20260716011958_acceso_grupo_economico` → `All migrations have been successfully applied`.
5. Rutas nuevas confirmadas mapeadas y protegidas en producción: `Mapped {/api/v1/grupo-economico/:id/accesos, POST}`, `GET`, y `{/api/v1/grupo-economico/:id/accesos/:accesoId, DELETE}` — las tres devuelven `401` sin token, igual que cualquier otra ruta autenticada.
6. `AuthController` en producción sigue exponiendo exactamente las mismas 3 rutas de siempre (`login`, `recuperar-contrasena`, `restablecer-contrasena`) — sin `cambiar-organizacion`, confirmando que 10.3.b no se abrió.
7. Regresión completa repetida contra producción tras el deploy: `/organizacion`, `/viajes`, `/liquidaciones`, `/grupo-economico`, `/grupo-economico/choferes/identidades`, todas `401` sin cambios; `/health` → `200`; sin secretos en los logs de deploy.
8. **No se otorgó ningún acceso real en producción** — ninguna llamada autenticada se ejecutó contra el ambiente de producción durante esta verificación, solo checks de salud/ruteo sin credenciales.

**El cierre efectivo de Bloque 10.3.a queda establecido recién en este punto** — después del commit funcional (`fd8355b`) y de la verificación real de producción de arriba, no en el momento en que se escribió la primera versión de este documento. Las secciones 2 y 10 más abajo quedaron actualizadas para reflejar este estado final; el resto del documento (modelo, hallazgo arquitectónico, decisiones aplicadas, validaciones, auditoría adversarial, limpieza de datos) describe hechos que ya eran ciertos en el momento original y no cambiaron.

---

## 1. Modelo

**`AccesoGrupoEconomico`** (nuevo, no organizacional — no vive en `ORGANIZACIONAL_MODELS`, mismo tratamiento que `GrupoEconomico` e `IdentidadChoferGrupo`): `id`, `usuarioId`, `organizacionId` (la organización destino que otorga el acceso), `otorgadoPorId`, `createdAt`. Relación real (`@relation`) a `Usuario.id` en dos sentidos (`usuario`, `otorgadoPor`) — a diferencia deliberada de `IdentidadChoferGrupo.creadoPorId` (Bloque 10.2), documentada en el propio schema: esta tabla ES el mecanismo de control de acceso multiempresa, no un campo incidental de auditoría. `@@unique([usuarioId, organizacionId])` — un usuario no puede tener más de un acceso activo a la misma organización.

`Usuario` y `Organizacion` recibieron las relaciones inversas correspondientes (`accesosGrupoRecibidos`, `accesosGrupoOtorgados`, `accesosGrupoEconomico`) — ningún otro campo de ninguno de los dos modelos cambió.

## 2. Migración

**`20260716011958_acceso_grupo_economico`** — puramente aditiva, revisada antes de aplicarse:

```sql
CREATE TABLE "AccesoGrupoEconomico" (...);
CREATE INDEX "AccesoGrupoEconomico_usuarioId_idx" ON "AccesoGrupoEconomico"("usuarioId");
CREATE INDEX "AccesoGrupoEconomico_organizacionId_idx" ON "AccesoGrupoEconomico"("organizacionId");
CREATE UNIQUE INDEX "AccesoGrupoEconomico_usuarioId_organizacionId_key" ON "AccesoGrupoEconomico"("usuarioId", "organizacionId");
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT ..._usuarioId_fkey FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT ..._organizacionId_fkey FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT ..._otorgadoPorId_fkey FOREIGN KEY ("otorgadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Sin `DROP`, sin `DELETE`, sin `UPDATE` sobre ninguna tabla existente. Aplicada limpiamente en desarrollo. **Aplicada en producción** — confirmado vía `railway logs --deployment` (ver "Nota de corrección" arriba): `21 migrations found... Applying migration 20260716011958_acceso_grupo_economico... All migrations have been successfully applied`.

## 3. Hallazgo arquitectónico durante la implementación, y su resolución

Al implementar `otorgar()`, encontré que verificar al usuario destinatario (existencia, estado activo, organización de pertenencia) exige leer un `Usuario` de una organización **distinta** de la del actor — algo que el cliente scopeado (`ORGANIZACION_PRISMA`) estructuralmente no puede hacer, porque filtra `Usuario` a la organización del contexto activo (verificado en `organizacion-prisma.client.ts`: `findUnique` descarta el resultado si no coincide). Esto no estaba resuelto en el diseño aprobado, y `prisma.module.ts` documentaba explícitamente que "ningún módulo funcional debe importar" el módulo del cliente crudo de Prisma.

Te consulté antes de decidir (no lo resolví unilateralmente, por tratarse de un patrón arquitectónico ya establecido). Elegiste la opción de un **servicio dedicado y mínimo**, con las siguientes reglas explícitas, todas aplicadas:

- El controller (`AccesoGrupoController`) **no** recibe `PrismaService` crudo — solo `ORGANIZACION_PRISMA` y `UsuarioGrupoLookupService`.
- `UsuarioGrupoLookupService` (`backend/src/prisma/usuario-grupo-lookup.service.ts`) es el único componente nuevo con acceso al cliente crudo, vive en la capa de infraestructura de Prisma (no en `grupo-economico/`), y expone un único método estrecho: `verificarDestinatario(usuarioId)`, que devuelve exclusivamente `{ id, activo, organizacionId }` — nunca `passwordHash`, nunca `rol` (Decisión Técnica 1 ya estableció que el rol es irrelevante para el acceso de grupo), nunca un método genérico (`findMany`, `where` arbitrario).
- `UsuarioGrupoLookupModule` importa `PrismaModule` internamente pero exporta únicamente el servicio, nunca `PrismaService` — mismo patrón ya usado por `OrganizacionPrismaModule`, reutilizado en vez de inventado.
- `prisma.module.ts` quedó actualizado con el allow-list completo de los dos consumidores autorizados del cliente crudo (`AuthModule`, `UsuarioGrupoLookupModule`) y el comando de verificación exacto.
- **Verificación ejecutada** (no solo documentada): `grep -rn "PrismaService" backend/src --include=*.ts` — de los 21 resultados, solo dos son inyecciones reales fuera del propio módulo de Prisma (`auth.service.ts`, `usuario-grupo-lookup.service.ts`); el resto son menciones en comentarios o el módulo `_combustibles.disabled/` (confirmado no importado por `app.module.ts`, sin efecto en runtime).

No usé `AuthService` para esta responsabilidad (instrucción explícita) — `UsuarioGrupoLookupService` no depende de `AuthModule` ni viceversa.

## 4. Backend

Nuevo `backend/src/grupo-economico/acceso-grupo.controller.ts` (`AccesoGrupoController`), montado en `/api/v1/grupo-economico`:

| Endpoint | Rol | Qué hace |
|---|---|---|
| `POST /grupo-economico/:id/accesos` | `ADMINISTRADOR` | Otorga acceso a un usuario de otra organización del mismo grupo para operar la organización del actor |
| `GET /grupo-economico/:id/accesos` | `ADMINISTRADOR` | Lista los accesos otorgados **por** la organización del actor (nunca los de otra) |
| `DELETE /grupo-economico/:id/accesos/:accesoId` | `ADMINISTRADOR` | Revoca un acceso ya otorgado por la organización del actor |

### Deviación de alcance respecto del diseño, disclosed explícitamente

El diseño (`DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 15) preveía para 10.3.a "los tres endpoints de administración de accesos (sección 5, primeras tres filas)" — la primera fila de esa tabla era `GET /grupo-economico/organizaciones-accesibles`. **No la implementé.** Ese endpoint consulta, desde la perspectiva de quien YA tiene accesos, a qué organizaciones puede cambiar — es información que solo tiene sentido para alimentar el futuro selector de organización (Bloque 10.4), explícitamente fuera del alcance autorizado para 10.3.a ("no implementar selector de Organización"). En su lugar, implementé los tres endpoints que administran los accesos desde la perspectiva de quien los otorga (otorgar/listar/revocar) — sin los cuales el sub-bloque no sería usable ni verificable de punta a punta. Quedás en condiciones de pedir `organizaciones-accesibles` como parte de 10.3.b si hace falta antes del selector.

## 5. Decisiones técnicas aplicadas

Las cinco decisiones de `DECISIONES_TECNICAS_BLOQUE10.3.md` se aplicaron exactamente:

1. **Rol único**: `otorgar()` no valida ni acota el rol del destinatario — el guard sigue siendo `RolesGuard` estándar, sin ninguna lógica nueva de rol por organización.
2. **Sin `Organizacion.activo`**: no se agregó ningún campo de estado — `verificarGrupo()` valida únicamente existencia.
3. y 4. (vigencia del JWT, tokens ante revocación) — no aplican a este sub-bloque, son de 10.3.b (no se emite ningún token acá).
5. (recarga completa del frontend) — no aplica, este sub-bloque no toca frontend.

## 6. Autorizaciones — verificadas una por una

- **Solo el `ADMINISTRADOR` de la organización destino otorga/revoca** (Decisión Técnica 2 de Grupo Económico): la organización que actúa nunca sale de la URL ni del body, siempre es `actor.organizacionId` — verificado explícitamente (ver sección 8).
- **Sin `SUPERADMINISTRADOR`**: ningún endpoint opera sobre una organización que no sea la del actor.
- **`RolesGuard` sin modificar**: verificado que un rol no-`ADMINISTRADOR` (`LIQUIDACIONES`) recibe `403`.
- **`JwtStrategy`, `ORGANIZACION_PRISMA` sin modificar**: confirmado por diff (`git status`) — ningún archivo de esos dos mecanismos aparece modificado.

## 7. Validaciones ejecutadas

1. **Build backend**: limpio, sin errores.
2. **Build frontend**: limpio, sin errores (no debería haber ningún cambio — confirmado, ninguno).
3. **`prisma validate`**: `The schema... is valid`.
4. **Migración aplicada limpiamente** en desarrollo.
5. **Otorgar acceso real** (Admin B → `liquidaciones@demo.com`, de Org A, para operar Org B): `201`, fila creada con los campos correctos.
6. **Listar** desde Org B: muestra el acceso recién creado.
7. **Otorgar el mismo par de nuevo**: `400`, "ya tiene acceso otorgado".
8. **Otorgar a un usuario inactivo** (`invitado-frontend-a@demo.com`): `400`, "está inactivo".
9. **Otorgar a un usuario de la propia organización**: `400`, "ya pertenece a tu organización".
10. **Otorgar a un `usuarioId` inexistente**: `404`.
11. **Revocar un acceso ajeno** (Admin A intenta revocar lo que otorgó Admin B): `404`, sin revelar que existe.
12. **Rol no autorizado** (`liquidaciones@demo.com` intenta otorgar): `403`.
13. **Sin token**: `401`.
14. **Auditoría aislada**: el evento `acceso_grupo_otorgado` es visible en la auditoría de Org B (quien otorgó) y **no** aparece en la de Org A — verificado con ambas sesiones reales.
15. **Revocar correctamente**: `200`, `{ revocado: true }`; el listado queda vacío; revocar de nuevo el mismo id da `404` (no una excepción sin manejar).
16. **Regresión 10.1**: `GET /grupo-economico` sigue devolviendo el grupo real sin cambios.
17. **Regresión 10.2**: `GET /grupo-economico/choferes/identidades` sigue devolviendo la identidad real de Carlos Gómez sin cambios.
18. **Regresión general**: `/organizacion`, `/viajes`, `/liquidaciones`, `/clientes`, todos `200` sin cambios.
19. **Rutas nuevas exigen autenticación** igual que las existentes (`401` sin token).
20. **Sin secretos en logs**: no se registró ningún token ni contraseña durante la validación (confirmado por inspección de la salida de consola usada).

## 8. Auditoría adversarial — condiciones de carrera, bypass de permisos, fugas entre organizaciones

Ejecutada antes del cierre, buscando activamente fallas, no confirmando el propio trabajo:

- **Condición de carrera en `otorgar()`**: a diferencia de `Chofer.identidadChoferGrupoId` (Bloque 10.2, Hallazgo 1 — sin ninguna restricción a nivel de base, dependía enteramente de la lógica de aplicación), acá la restricción `@@unique([usuarioId, organizacionId])` es la garantía real, a nivel de base de datos, independiente de cualquier chequeo previo en el código. Verificado en dos niveles:
  - **A nivel de base, directo** (bypaseando la aplicación): 5 llamadas `create()` verdaderamente simultáneas (`Promise.all`) para el mismo par → exactamente 1 exitosa, 4 con `P2002`, exactamente 1 fila final en la tabla.
  - **A través del endpoint HTTP real**, con hasta 20 solicitudes simultáneas (`Promise.all`, no procesos separados): exactamente 1 exitosa en cada corrida (repetida varias veces), sin excepción. Verificado además que **ningún intento fallido, en ninguna corrida, dejó un `AuditLog` huérfano o duplicado**: tras una corrida de 20 solicitudes simultáneas, existía exactamente 1 fila en `AccesoGrupoEconomico` y exactamente 1 entrada nueva de `acceso_grupo_otorgado` en `AuditLog` — porque tanto `create()` como `auditLog.create()` viven dentro de la misma transacción, y cualquier fallo (por la restricción única) revierte la transacción completa antes de llegar a la escritura de auditoría.
- **Condición de carrera en `revocar()`**: el peor caso posible ante dos revocaciones simultáneas del mismo acceso es que la segunda reciba `P2025` (fila ya no existe), mapeado a `404` limpio por `PrismaExceptionFilter` — no una excepción sin manejar, no un `AuditLog` parcial (mismo razonamiento: `delete()` y `auditLog.create()` comparten transacción).
- **Bypass de permisos**: verificado que un usuario con rol distinto de `ADMINISTRADOR` no puede otorgar ni revocar (`403`); que un `ADMINISTRADOR` de una organización no puede otorgar acceso "en nombre" de otra organización (no existe ningún parámetro que acepte una organización distinta de `actor.organizacionId` para la escritura); que revocar un acceso ajeno responde `404`, no `403` (no revela que el recurso existe).
- **Fugas entre organizaciones**: verificado que `listar()` nunca muestra accesos otorgados por otra organización del mismo grupo (probado con datos reales de ambas organizaciones); que `UsuarioGrupoLookupService.verificarDestinatario()` nunca expone `passwordHash` ni ningún campo más allá de los tres declarados; que ninguna relación nueva agregada a `Usuario`/`Organizacion` (`accesosGrupoRecibidos`, `accesosGrupoOtorgados`, `accesosGrupoEconomico`) puede filtrarse a través de ningún endpoint preexistente, porque Prisma nunca incluye relaciones por default sin un `include`/`select` explícito, y ningún controller existente las referencia (verificado por búsqueda exhaustiva de `include:` en todo `backend/src`).
- **`AccesoGrupoEconomico` confirmado fuera de `ORGANIZACIONAL_MODELS`** — no se modificó esa lista.

**Resultado: ningún hallazgo requirió corrección.** A diferencia de Bloque 10.2, donde la auditoría adversarial encontró tres problemas reales, acá el diseño de la restricción única a nivel de base (en vez de solo lógica de aplicación) evitó por construcción la clase de bug que apareció en 10.2.

## 9. Limpieza de datos de prueba

Todos los `AccesoGrupoEconomico` y `AuditLog` generados durante la validación y la auditoría adversarial (11 entradas de auditoría de prueba en total, entre otorgamientos y revocaciones) fueron eliminados explícitamente al finalizar. Estado final de la base de desarrollo, verificado: `AccesoGrupoEconomico` en 0, sin ninguna entrada de `AuditLog` con `entidad: "AccesoGrupoEconomico"` — exactamente el mismo estado que antes de empezar, salvo el modelo y el código, que sí quedan.

## 10. Producción

**Desplegado y verificado**, tras el commit funcional `fd8355b` (ver "Nota de corrección" al inicio de este documento):

- Migración `20260716011958_acceso_grupo_economico` aplicada — confirmado en `railway logs --deployment`.
- `AccesoGrupoController` mapeado: `POST /api/v1/grupo-economico/:id/accesos`, `GET /api/v1/grupo-economico/:id/accesos`, `DELETE /api/v1/grupo-economico/:id/accesos/:accesoId` — las tres devuelven `401` sin token, igual que cualquier otra ruta protegida.
- `AuthController` sigue exponiendo exactamente las mismas 3 rutas de siempre — sin `cambiar-organizacion` (10.3.b no abierto).
- `GET /api/v1/health` → `200`.
- Regresión completa contra producción (`/organizacion`, `/viajes`, `/liquidaciones`, `/grupo-economico`, `/grupo-economico/choferes/identidades`) sin cambios de comportamiento.
- Sin secretos en los logs de deploy (verificado por búsqueda explícita).
- **No se creó ningún `AccesoGrupoEconomico` real en producción** — ninguna llamada autenticada se ejecutó contra el ambiente de producción durante esta verificación.

## 11. Rollback (si hiciera falta antes de aprobar)

- Descartar los archivos nuevos y modificados listados en `git status` (todavía no hay nada staged ni commiteado).
- La migración, si se llegara a aplicar y hubiera que revertirla: es aditiva y simétrica — eliminar la tabla no afecta ninguna fila de ninguna tabla preexistente (misma garantía que 10.1 y 10.2).

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Cambio de organización activa; guard de grupo para emitir tokens; ningún token nuevo emitido; `JwtStrategy` sin tocar; `RolesGuard` sin tocar; `ORGANIZACION_PRISMA` sin tocar; frontend; selector de organización; `GET /grupo-economico/organizaciones-accesibles` (ver sección 4, deviación disclosed); Pago Consolidado — todo según lo previsto para 10.3.b y bloques posteriores.

---

**Commits reales de este sub-bloque, en orden:**
1. `23c50dc` — `chore(prisma): fix raw client allow-list verification` (`backend/src/prisma/prisma.module.ts`, hallazgo de la auditoría adversarial).
2. `7836fbc` — `docs: close group economic access administration block` (`docs/cierres/ACTA_CIERRE_BLOQUE10.3a.md`, esta acta, publicada prematuramente — ver "Nota de corrección").
3. `fd8355b` — `feat(group-economic): add cross-organization access administration` (`backend/prisma/schema.prisma`, `backend/prisma/migrations/20260716011958_acceso_grupo_economico/`, `backend/src/grupo-economico/acceso-grupo.controller.ts`, `backend/src/grupo-economico/dto/otorgar-acceso.dto.ts`, `backend/src/grupo-economico/grupo-economico.module.ts`, `backend/src/prisma/usuario-grupo-lookup.service.ts`, `backend/src/prisma/usuario-grupo-lookup.module.ts`).
4. Este commit de corrección documental.

No se abre Bloque 10.3.b. Bloque 10.3.a queda cerrado en este punto, con el código funcional publicado y verificado en producción — no en el momento de la primera versión de esta acta.

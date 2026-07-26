# Auditoría — Bloque 10.3.b: Cambio de Organización Activa

Fecha: 2026-07-16. Auditoría técnica pura (`METODOLOGIA_SDC.md`, etapa 1) — **no se diseñó nada, no se propuso implementación, no se escribió código, no se generaron migraciones, no se modificó ningún archivo, no se hizo git add/commit/push.** Continuación directa de Bloque 10.3.a, ya cerrado y desplegado (`docs/cierres/ACTA_CIERRE_BLOQUE10.3a.md`, commit funcional `fd8355b`).

**Documentos rectores leídos/releídos para esta auditoría:** `RELEASE_SDC_v1.0.md`, `CERTIFICACION_FINAL_SDC_v1.0.md` (releído completo), `docs/cierres/ACTA_CIERRE_BLOQUE10.1.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.2.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.3a.md`, `AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, `DECISIONES_TECNICAS_BLOQUE10.3.md`, `docs/disenos/GRUPO_ECONOMICO_DISENO_TECNICO.md`, `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `CONSTITUCION_SDC.md`.

**Código releído fresco para esta auditoría** (no asumido desde documentos previos): `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `jwt.strategy.ts`, `roles.guard.ts`, `main.ts`, `organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`, `current-user.decorator.ts`, `jwt-auth.guard.ts`, `roles.decorator.ts`, `schema.prisma` (`Usuario`, `AccesoGrupoEconomico`), `frontend/src/context/AuthContext.tsx`, `frontend/src/pages/Login.tsx`, `frontend/src/api/client.ts`. Confirmado por `git log` que ninguno de los archivos de frontend cambió desde el 2026-07-14 — anterior a todo el Bloque 10, sin relación con este trabajo. Confirmado por `grep` que no existe hoy ningún middleware de NestJS (`NestMiddleware`/`MiddlewareConsumer`) en todo el backend, ni ningún vestigio de `cambiar-organizacion`/`GrupoEconomicoGuard` — el punto de partida es limpio, nada parcialmente construido.

---

## 1. ¿Qué piezas intervienen exactamente cuando un usuario hace login?

**Hecho confirmado** (`auth.controller.ts:13-16`): `AuthController` no tiene ningún `@UseGuards` a nivel de clase ni en `login()` — la ruta `POST /auth/login` es completamente pública, sin `JwtAuthGuard` ni `RolesGuard`.

**Hecho confirmado** (`auth.service.ts:15-40`): `AuthService.login(email, password)` — busca el `Usuario` con el cliente **crudo** de `PrismaService` (no `ORGANIZACION_PRISMA`, porque todavía no existe ningún contexto de organización); verifica `usuario.activo`; compara con `bcrypt.compare`; verifica `usuario.organizacionId` (chequeo defensivo — el campo es `String` obligatorio en el schema, así que esta condición no debería poder darse con datos íntegros, pero el código la contempla igual); arma el payload; firma con `this.jwt.sign(payload, { expiresIn: "12h" })`; devuelve `{ accessToken, usuario }`.

**Hecho confirmado** (`organizacion-context.interceptor.ts`): `OrganizacionContextInterceptor` (global, vía `APP_INTERCEPTOR`) corre en **todas** las rutas, incluida `/auth/login` — pero como `request.user` no existe todavía en una ruta pública, `organizacionId` queda `undefined` en el contexto, y simplemente no se usa (ningún modelo organizacional se consulta durante el login).

**Hecho confirmado** (frontend, `Login.tsx` + `AuthContext.tsx`): `Login.tsx` llama a `login()` del contexto → `AuthContext.login()` ejecuta `api.post("/auth/login", {...})` → guarda `accessToken` en `localStorage["token"]` y el objeto `usuario` completo (`JSON.stringify(data.usuario)`) en `localStorage["usuario"]` → actualiza el estado React → `Login.tsx` navega a `/`.

## 2. ¿Cómo se genera actualmente el JWT?

**Hecho confirmado** (`auth.service.ts:22-29`): `this.jwt.sign(payload, { expiresIn: "12h" })`, usando la instancia de `JwtService` inyectada (de `@nestjs/jwt`), configurada en `auth.module.ts`.

## 3. ¿Dónde vive hoy la expiración del token?

**Hecho confirmado, en dos lugares redundantes** — verificado en el código, no asumido:
- `auth.module.ts`: `JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: "12h" } })` — el valor por defecto del módulo.
- `auth.service.ts:29`: `{ expiresIn: "12h" }` pasado explícitamente en la llamada a `sign()` — este es el que realmente rige, porque el segundo argumento de `jwt.sign()` sobreescribe el default del módulo cuando ambos están presentes.

**Hecho confirmado:** el valor `"12h"` está hardcodeado como string literal en ambos lugares — no es una variable de entorno, no es una constante compartida entre los dos archivos.

## 4. ¿Qué información contiene actualmente el JWT?

**Hecho confirmado** (`auth.service.ts:22-28`): payload = `{ sub, email, rol, nombre, organizacionId }` — exactamente 5 campos, más lo que `jsonwebtoken` agrega automáticamente (`iat`, `exp`). Sin `jti`, sin versión de sesión, sin lista de organizaciones, sin referencia a Grupo Económico.

## 5. ¿Cómo `JwtStrategy` reconstruye el usuario?

**Hecho confirmado** (`jwt.strategy.ts:16-27`): `validate(payload)` — valida únicamente que `payload.organizacionId` sea un string no vacío (si no, `UnauthorizedException`); devuelve `{ id: payload.sub, email, rol, nombre, organizacionId }` como `request.user`. **No hace ninguna consulta a la base de datos** — la reconstrucción es puramente a partir del contenido ya firmado del token, sin revalidar contra `Usuario` (ni `activo`, ni `rol` actual, ni existencia). Esto es lo que sostiene el riesgo ya aceptado de "12 horas máximo" (`RELEASE_SDC_v1.0.md`, sección 13, línea 129) para cualquier cambio de permisos posterior al login.

## 6. ¿Qué debería modificarse para permitir cambiar únicamente la Organización activa?

*(Se responde a nivel de qué piezas se ven implicadas, no cómo — eso es diseño, etapa siguiente.)*

**Hecho confirmado, por lo que ya existe:** hoy no hay ningún endpoint, guard, ni método de `AuthService` que emita un token nuevo para una sesión ya autenticada — el único camino para obtener un token es `login()`, que exige contraseña. Cambiar de organización, tal como lo exige `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` (sección 3), necesita: (a) un punto de entrada nuevo, autenticado, que reciba la organización destino; (b) una verificación server-side contra `AccesoGrupoEconomico` (ya existe la tabla, cerrada en 10.3.a); (c) una forma de emitir un token nuevo con `organizacionId` distinto, sin volver a pedir contraseña; (d) un registro de auditoría del cambio.

**Hecho confirmado:** `JwtStrategy` **no necesitaría ningún cambio** para aceptar el token nuevo — ya valida cualquier `organizacionId` string no vacío, sin importar de dónde salió ni cuántas veces cambió antes.

## 7. ¿Qué puede reutilizarse exactamente del login existente?

**Hecho confirmado:**
- La misma instancia de `JwtService` ya inyectada y disponible vía `AuthModule` (no hace falta un módulo de JWT nuevo).
- La misma forma de payload (5 campos) y la misma llamada `sign(payload, { expiresIn: ... })` — mismo patrón, con la salvedad de la Decisión Técnica 3 (sección 9).
- La misma forma de respuesta `{ accessToken, usuario }` — ya usada por `login()`, ya consumida por `AuthContext.login()` en el frontend sin ningún cambio de contrato necesario.
- `JwtStrategy` sin cambios (punto 6).
- El patrón de "cliente crudo cuando todavía no hay organización activa fija" — aunque acá es distinto: a diferencia de `login()`, un cambio de organización ocurre con una sesión **ya autenticada**, así que sí existe un `organizacionId` de origen en el contexto — la pregunta de diseño (no resuelta acá) es si conviene usar el cliente scopeado (para la organización de origen) o el crudo (para verificar la de destino) en cada paso de la validación — mismo tipo de decisión ya resuelta en 10.3.a con `UsuarioGrupoLookupService`.

**No reutilizable:** `bcrypt.compare` — no hay contraseña que validar en un cambio de organización, la identidad ya está autenticada por el propio token vigente.

## 8. ¿Qué no debe tocarse bajo ningún concepto?

**Hecho confirmado y instrucción explícita coincidente:**
- `organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts` (`ORGANIZACION_PRISMA` completo) — verificado que hoy no dependen de nada relacionado con Grupo Económico, y no hay ninguna razón técnica encontrada en esta auditoría para cambiar eso.
- `roles.guard.ts` — su bypass de `ADMINISTRADOR` (línea 17) sigue siendo la razón por la que la autorización del cambio de organización no puede apoyarse en él (mismo razonamiento ya usado en 10.3.a para `AccesoGrupoController`).
- `ORGANIZACIONAL_MODELS` (`organizacional-models.ts`) — ninguna pieza de este bloque agrega ni saca modelos de esa lista.
- Cualquier controller operativo existente (Viajes, Facturas, Liquidaciones, Catálogos, Administración) — ninguno necesita saber que el cambio de organización existe.
- La forma del JWT en sí (5 campos) — ya decidido, sin lista de organizaciones ni de Grupo Económico dentro del token (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 11; reafirmado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 3).

## 9. ¿Qué riesgos de seguridad aparecen al emitir un nuevo token?

**Riesgo, mitigado por una decisión ya tomada:** confiar en la organización destino recibida del cliente sin verificarla server-side contra `AccesoGrupoEconomico` — ya identificado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` (sección 3) y resuelto ahí como requisito no negociable ("nunca se toma tal cual del cliente sin verificar").

**Riesgo, ya resuelto por Decisión Técnica:** reiniciar la vigencia del token en cada cambio permitiría extender una sesión indefinidamente encadenando cambios — `DECISIONES_TECNICAS_BLOQUE10.3.md`, Decisión 3, ya lo rechazó explícitamente (el token nuevo conserva la expiración original).

**Hecho confirmado, sin riesgo nuevo:** la firma del token usa el mismo `JWT_SECRET` ya validado en `main.ts` — ningún cambio de mecanismo de firma implicado.

## 10. ¿Qué riesgos aparecen respecto de `ORGANIZACION_PRISMA`?

**Hecho confirmado, ninguno nuevo detectado en esta relectura del código:** `obtenerOrganizacionIdActual()` (`organizacion-context.ts:14-21`) sigue leyendo un único valor de `AsyncLocalStorage`, sembrado una sola vez por request por `OrganizacionContextInterceptor` desde `request.user.organizacionId`. Cambiar de organización no cambia esto — cambia, únicamente, qué valor trae el **próximo** token, y por lo tanto qué valor siembra el interceptor en el **próximo** request. Cada request individual sigue viendo, sin excepción, un solo `organizacionId`.

## 11. ¿Qué riesgos aparecen respecto de `RolesGuard`?

**Riesgo ya identificado (no nuevo):** si la autorización del endpoint de cambio de organización se apoyara en `@Roles(...)`, el bypass de `ADMINISTRADOR` (`roles.guard.ts:17`) le daría a cualquier `ADMINISTRADOR` de cualquier organización la posibilidad de intentar el endpoint — la protección real tiene que venir de una verificación aparte contra `AccesoGrupoEconomico`, no de `RolesGuard`. Mismo razonamiento ya aplicado y ya probado en 10.3.a.

**Hecho confirmado:** una vez emitido el token nuevo, `RolesGuard` sigue funcionando exactamente igual para cualquier endpoint operativo — sigue leyendo `user.rol`, que no cambia con la organización activa (Decisión Técnica 1 de Bloque 10.3: rol único).

## 12. ¿Qué riesgos aparecen respecto del frontend?

**Hecho confirmado, hallazgo repetido de la auditoría anterior, todavía sin resolver:** `AuthContext.tsx:4-9`, la interfaz `Usuario` sigue sin declarar `organizacionId` — aunque el objeto que guarda en `localStorage` sí lo trae (`auth.service.ts` lo incluye en la respuesta). Esto importa más para 10.3.b que para 10.3.a: cualquier lógica de frontend que necesite saber "en qué organización estoy" para decidir si mostrar algo relacionado con el cambio, hoy no tiene ese dato tipado.

**Riesgo, ya señalado en el diseño previo, no resuelto:** `api/client.ts` no tiene ningún mecanismo de refresco de token — el reemplazo del token tras un cambio de organización tiene que pasar necesariamente por `localStorage` + alguna forma de que la aplicación vuelva a arrancar (Decisión Técnica 5: recarga completa).

**Nota de alcance:** este bloque (10.3.b), según tu instrucción explícita, es backend — cualquier cambio real a `AuthContext.tsx`/`Layout.tsx`/`api/client.ts` queda fuera de este sub-bloque. Se señala acá porque el **contrato** que el backend expone (forma de la respuesta del endpoint nuevo) condiciona qué tan fácil sea resolver esto después, no porque haya que tocarlo ahora.

## 13. ¿Qué riesgos aparecen respecto del almacenamiento del token?

**Hecho confirmado, riesgo ya existente y no agravado:** el token vive en `localStorage`, accesible por cualquier script que corra en el mismo origen (un riesgo genérico de XSS, ya presente hoy para el login normal, sin relación específica con este bloque). Cambiar de organización reutiliza el mismo mecanismo de almacenamiento — no lo hace ni más ni menos expuesto.

**Riesgo operativo, ya resuelto en el diseño:** reemplazar el token en `localStorage` antes de confirmar que la respuesta del servidor fue exitosa dejaría una sesión en un estado inconsistente — `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 10, ya fija el orden correcto (esperar la respuesta completa, recién ahí escribir).

## 14. ¿Qué riesgos aparecen respecto de múltiples pestañas del navegador?

**Riesgo real, ya señalado, sin decisión formal de implementación todavía:** si una pestaña cambia de organización y la otra queda con el token viejo, ambas siguen siendo, cada una, sesiones legítimamente autorizadas (no hay fuga de datos entre organizaciones), pero puede confundir al usuario sobre en qué organización está operando cada pestaña. `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` (sección 10) propuso un listener del evento `storage` como mitigación — **no fue elevado a Decisión Técnica formal** (las 5 decisiones ya aprobadas no lo mencionan), así que sigue siendo, estrictamente, una recomendación de diseño sin ratificar.

## 15. ¿Qué pruebas considera imprescindibles antes de implementar?

Ya detalladas extensamente en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 13 — resumidas y confirmadas como todavía vigentes tras esta relectura del código:

- Usuario sin `AccesoGrupoEconomico` intenta cambiar de organización → rechazado, sin token nuevo.
- Usuario intenta cambiar a una organización de un Grupo Económico distinto → rechazado.
- Acceso revocado → el siguiente intento de cambio falla; el token ya emitido antes de la revocación sigue funcionando hasta expirar (comportamiento esperado, no un bug — Decisión Técnica 4).
- Cambio repetido A→B→A → cada cambio auditado por separado; la vigencia total nunca supera las 12 horas del login original (Decisión Técnica 3).
- Volver a la organización de pertenencia propia (sin `AccesoGrupoEconomico`, porque es la suya) → debe funcionar.
- Prueba de fuga cruzada completa: después de A→B, ningún dato de A debe quedar accesible en B, ni por el nuevo endpoint ni por ningún endpoint operativo existente.
- Regresión completa de v1.0, 10.1, 10.2 y 10.3.a — ninguno de esos flujos debería cambiar de comportamiento.
- Concurrencia: si corresponde algún camino de escritura (por ejemplo, el `AuditLog` del cambio), probar bajo solicitudes simultáneas con el mismo rigor ya aplicado en 10.2 y 10.3.a (`Promise.all`, no procesos separados).

## 16. ¿Qué preguntas quedan abiertas para la etapa de diseño?

- Nombre exacto y ubicación del endpoint (`AuthController` vs. un módulo nuevo dedicado a sesión) — ya señalado como pendiente en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 16, punto 1.
- Nombre y ubicación exacta del guard nuevo de Grupo Económico.
- Si el intento denegado de cambio de organización genera `AuditLog` (`intento_cambio_organizacion_denegado`, ya propuesto en el diseño, sección 8) o se difiere.
- Si el listener del evento `storage` para múltiples pestañas (punto 14) se implementa en 10.3.b (aunque sea backend, podría no requerir frontend si se resuelve distinto) o se difiere explícitamente a 10.4, dado que este bloque es "únicamente cambio de Organización activa" sin selector visual.
- Si la corrección del tipo `Usuario` en `AuthContext.tsx` (para incluir `organizacionId`) se hace en 10.3.b o se difiere a 10.4 — dado que 10.3.b es explícitamente backend, esto probablemente se difiere, pero conviene decidirlo de forma explícita, no por omisión.
- Qué responde exactamente el endpoint más allá de `{ accessToken, usuario }` — por ejemplo, si conviene devolver también la lista de organizaciones a las que el usuario puede volver a cambiar, para evitar una segunda consulta inmediata desde el frontend en 10.4 (pregunta ya señalada en el diseño previo, sección 16, punto 4, sin resolver).

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo `git add`, commit ni push. Este es el único documento generado. Detenido al finalizar, a la espera de tu revisión antes de avanzar a la etapa de diseño.

# Auditoría — Bloque 10.3: Acceso de usuarios y cambio de organización activa

Fecha: 2026-07-16. Auditoría técnica pura (`METODOLOGIA_SDC.md`, etapa 1) — **no se diseñó nada, no se propuso código, no se escribieron migraciones, no se modificó `schema.prisma`, no se modificó frontend, no se implementó nada.** Solo detecta y documenta, contra el código real, sin resolver ninguna decisión.

**La pregunta que responde este documento, y solo esta:** ¿qué debe modificarse exactamente en SDC v1.1 para permitir que un mismo usuario autorizado opere más de una organización del mismo Grupo Económico sin romper ninguna garantía de aislamiento certificada en SDC v1.0?

**Documentos leídos completos:** `RELEASE_SDC_v1.0.md`, `CERTIFICACION_FINAL_SDC_v1.0.md`, `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`, `docs/disenos/GRUPO_ECONOMICO_DISENO_TECNICO.md`, `docs/estrategia/DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`, `docs/arquitectura/grupo-economico/DECISIONES_TECNICAS_GRUPO_ECONOMICO.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.1.md`, `docs/cierres/ACTA_CIERRE_BLOQUE10.2.md`, `CONSTITUCION_SDC.md`, `METODOLOGIA_SDC.md`.

**Código real releído para esta auditoría** (algunos ya verificados en bloques anteriores, releídos de nuevo para no asumir): `jwt.strategy.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `roles.guard.ts`, `roles.decorator.ts`, `jwt-auth.guard.ts`, `current-user.decorator.ts`, `organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`, `main.ts`, `schema.prisma` (modelo `Usuario`), `AuthContext.tsx`, `Login.tsx`, `Layout.tsx`, `api/client.ts` (Axios). Se buscó explícitamente cualquier `NestMiddleware`/`MiddlewareConsumer` en todo `backend/src` — **no existe ninguno**: el único mecanismo de autenticación/contexto son los guards (`JwtAuthGuard`, `RolesGuard`) y un único interceptor global (`OrganizacionContextInterceptor`).

---

## 1. ¿Cómo funciona exactamente hoy el login?

**Hecho confirmado** (`auth.controller.ts`, `auth.service.ts`): `POST /auth/login` recibe `{ email, password }`. `AuthService.login()` busca el `Usuario` por email usando el cliente **crudo** de Prisma (`PrismaService`, no el scoped `ORGANIZACION_PRISMA`) — porque todavía no existe ningún contexto de organización antes de autenticarse. Verifica `usuario.activo`, compara la contraseña con `bcrypt.compare`, arma un payload de 5 campos (ver pregunta 3), lo firma con `JwtService.sign(payload, { expiresIn: "12h" })`, y devuelve `{ accessToken, usuario: { id, nombre, email, rol, organizacionId } }`.

**Hecho confirmado** (`AuthContext.tsx`): el frontend guarda `accessToken` en `localStorage.setItem("token", ...)` y el objeto `usuario` completo (incluido `organizacionId`, aunque ver hallazgo de la pregunta 8) en `localStorage.setItem("usuario", JSON.stringify(...))`. No hay ningún mecanismo de refresco — el token vive tal cual hasta que expira (12h) o hasta `logout()` (que solo limpia `localStorage`, no invalida nada en el servidor).

## 2. ¿Cómo queda determinada la organización activa?

**Hecho confirmado:** hoy no existe el concepto de "organización activa" separado de "la organización del usuario" — son exactamente lo mismo, siempre. El valor sale de `payload.organizacionId` en el JWT, se valida en `JwtStrategy.validate()`, se copia a `request.user.organizacionId`, y `OrganizacionContextInterceptor` (global, `@Injectable()` registrado como `APP_INTERCEPTOR` en `organizacion-prisma.module.ts`) lo siembra en `AsyncLocalStorage` en cada request. No hay ningún paso de "elegir" — el login determina, para toda la vida de ese token, cuál es.

## 3. ¿Qué información contiene exactamente el JWT?

**Hecho confirmado, verificado línea por línea en `auth.service.ts`:**
```
{ sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre, organizacionId: usuario.organizacionId }
```
Cinco campos, ni uno más. Sin lista de organizaciones, sin grupo económico, sin permisos adicionales. Vigencia `12h`, declarada dos veces de forma redundante (en `JwtModule.register()` de `auth.module.ts` y otra vez, explícitamente, en la propia llamada `jwt.sign()`) — no hay conflicto entre ambas porque el segundo argumento de `sign()` sobreescribe el default del módulo, pero es una duplicación ya existente, anterior a este bloque. `JwtStrategy.validate()` reconstruye `request.user` como `{ id: payload.sub, email, rol, nombre, organizacionId }` — nota que renombra `sub` a `id`.

## 4. ¿Quién decide hoy la organización activa?

**Hecho confirmado:** nadie decide en tiempo de ejecución. Queda fijada de forma permanente por el valor de `Usuario.organizacionId` en la base, en el instante del login. Es un dato, no una decisión de ningún código de autorización. **Hecho confirmado** (`schema.prisma`, modelo `Usuario`, línea 139): `organizacionId String` — escalar, obligatorio, no nulo, no es una lista. No existe hoy ningún endpoint para cambiarlo — la única forma es edición directa en la base, y aun así no tendría efecto sobre tokens ya emitidos (que seguirían con el valor viejo hasta expirar).

## 5. ¿Qué piezas dependen implícitamente de que exista una sola organización?

**Hechos confirmados**, cada uno verificado en el código citado:

- `JwtStrategy.validate()` — exige que `payload.organizacionId` sea un string no vacío; rechaza cualquier otra forma (`jwt.strategy.ts:17-19`).
- `organizacion-context.ts` — `OrganizacionContexto` es `{ organizacionId: string | undefined }`, un único valor, nunca una colección.
- `organizacion-prisma.client.ts` — `obtenerOrganizacionIdActual()` devuelve un solo string; toda la extensión de Prisma (los 21 modelos organizacionales) inyecta ese mismo valor único en cada `where`/`data` de cada consulta del request.
- **Todos** los controllers de negocio existentes (Viajes, Facturas, Liquidaciones, Anticipos, Catálogos, Administración, y los ya construidos en 10.1/10.2) leen `actor.organizacionId` como si fuera, sin ambigüedad, "mi organización" — ninguno pregunta "¿cuál de mis organizaciones?".
- `AuditLog.create()`, vía el cliente scopeado, inyecta automáticamente el `organizacionId` del contexto activo — uno solo por escritura.
- **Frontend** — `AuthContext.tsx`: la interfaz `Usuario` no tiene ningún campo de "organización activa" distinto de la organización única que ya trae. `Layout.tsx` no tiene ningún selector ni ningún elemento que asuma más de una organización. `api/client.ts` (Axios): el interceptor de request solo reenvía el `Bearer` token, sin ningún header ni parámetro adicional de organización.

## 6. ¿Qué partes del backend deberán cambiar?

Según lo ya diseñado (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, secciones 3, 11 y 12) y **confirmado que hoy no existe todavía** (`AccesoGrupoEconomico` no está en `schema.prisma`, ningún endpoint de cambio de organización existe en `auth.controller.ts`):

- Modelo `AccesoGrupoEconomico` (nuevo, no organizacional, ya especificado en el diseño).
- Un endpoint nuevo de cambio de organización activa (orientativamente `POST /auth/cambiar-organizacion`), que valida el destino contra `AccesoGrupoEconomico` y reemite un token con la misma forma de siempre.
- Endpoints de alta/baja de `AccesoGrupoEconomico` (ya especificados, sección 12 del diseño).
- Un guard nuevo, separado de `RolesGuard`, para las operaciones de grupo (ya fundamentado por qué en el propio diseño, sección 3).
- `AuthController`/`AuthService` — agregar el método del punto anterior.

## 7. ¿Qué partes NO deben cambiar bajo ningún concepto?

- **La forma del JWT** — sigue con los mismos 5 campos, `organizacionId` sigue siendo un valor único, nunca una lista (decisión técnica ya tomada, diseño sección 11).
- **`organizacion-prisma.client.ts` / `organizacional-models.ts`** — cero cambios, en ningún bloque de Grupo Económico hasta ahora se tocó este mecanismo, y este bloque tampoco debería.
- **`RolesGuard`** — su bypass para `ADMINISTRADOR` (`roles.guard.ts:17`) es, precisamente, la razón ya documentada por la que el acceso de grupo necesita su propio guard — no se toca `RolesGuard` para resolver esto.
- **El límite de `12h` sin invalidación inmediata** — riesgo ya aceptado explícitamente (diseño sección 11, y `RELEASE_SDC_v1.0.md` sección 13, para otro caso análogo).
- **Ningún controller de negocio existente** (Viajes, Facturas, Liquidaciones, Catálogos, Administración, los de 10.1/10.2) debería requerir ni un solo cambio — todos siguen leyendo `actor.organizacionId` exactamente igual, sin saber que `AccesoGrupoEconomico` existe.

## 8. ¿Qué partes del frontend deberán cambiar?

*(Identificado para informar el diseño — no se implementa en este bloque; el frontend en sí es Bloque 10.4, ya separado en el plan aprobado.)*

**Hallazgo verificado, no asumido:** la interfaz `Usuario` de `AuthContext.tsx` es `{ id, nombre, email, rol }` — **no declara `organizacionId`**, aunque el objeto que `login()` guarda en `localStorage` sí lo trae en tiempo de ejecución (porque el backend lo envía). Es un desajuste real entre el tipo TypeScript y el dato efectivo — hoy inofensivo porque nada lo usa, pero cualquier futuro código que necesite leer la organización activa del usuario en el frontend va a encontrarse con que el tipo no lo contempla.

Para cuando llegue 10.4: `AuthContext` necesitaría un método de cambio de organización que llame al nuevo endpoint y reemplace token/usuario; `Layout.tsx` necesitaría el selector (ya previsto para 10.4, no para 10.3). `api/client.ts` no debería necesitar ningún cambio — sigue reenviando el `Bearer` token tal cual, sea cual sea.

## 9. ¿Qué riesgos reales aparecen al permitir varias organizaciones?

- **Confusión de sesión**: un usuario con acceso a más de una organización podría operar sobre la equivocada si el cambio no es explícito y visible — ya contemplado como principio de diseño ("selección consciente de organización"), pero es un riesgo real de UX, no solo de seguridad.
- **Superficie de exposición ampliada**: una cuenta con `AccesoGrupoEconomico` comprometida compromete más de una organización a la vez — riesgo inherente a la Decisión 3 de negocio ya aprobada ("todo el equipo administrativo"), no nuevo, pero vale la pena tenerlo presente al diseñar.
- **Tokens ya emitidos tras revocar un acceso**: siguen siendo válidos hasta expirar (máximo 12h) — riesgo ya aceptado, no nuevo.
- **Llamadas en vuelo durante un cambio de organización**: si el frontend cambia de token mientras hay pedidos HTTP todavía en curso con el token anterior, esos pedidos podrían completarse contra la organización vieja después de que la interfaz ya muestre la nueva — riesgo real de UX/consistencia, no de seguridad (cada pedido individual sigue aislado correctamente, solo podría mostrar datos de la organización "anterior" en una respuesta tardía).

## 10. ¿Cuáles son las posibles fugas de información?

- El endpoint de cambio de organización, si no valida estrictamente contra `AccesoGrupoEconomico` en el servidor antes de emitir el token nuevo, permitiría "saltar" a cualquier organización con solo conocer su id — por eso la validación tiene que ser servidor, nunca confiar en el id que mande el cliente (ya establecido como principio en 10.1/10.2, se hereda).
- Cualquier endpoint nuevo que liste "a qué organizaciones puedo cambiar" tiene que filtrar exactamente por los accesos otorgados a ese usuario — nunca listar organizaciones del grupo sin verificar el acceso individual.
- Mensajes de error que distingan "no tenés acceso" de "no existe" para una organización ajena al grupo — el patrón ya establecido en 10.1/10.2 (responder como si no existiera) debería mantenerse acá también.

## 11. ¿Qué pruebas de regresión serán obligatorias?

- Login/logout normales, sin ningún `AccesoGrupoEconomico` — sin ningún cambio de comportamiento.
- Un usuario sin acceso de grupo nunca ve ni puede usar el endpoint de cambio de organización, ni por la interfaz ni por acceso directo.
- Cambiar de organización emite un token nuevo, con la organización correcta, y el token anterior sigue siendo válido hasta su propia expiración (comportamiento esperado, no un bug).
- Revocar un acceso mientras existe un token activo con esa organización — confirmar que el comportamiento es exactamente el ya aceptado (sigue funcionando hasta expirar, nunca más de 12h).
- Regresión completa de v1.0, 10.1 y 10.2 — ninguno de esos flujos debería mostrar ninguna diferencia.
- `RolesGuard` sigue funcionando exactamente igual, para cualquier rol, en cualquier organización activa — el cambio de organización no debe alterar en absoluto la evaluación de roles.
- Prueba de fuga cruzada ampliada (mismo criterio que 10.1/10.2): un usuario sin `AccesoGrupoEconomico` para la Organización B no puede leer ni operar nada de la Organización B, ni por el endpoint de cambio, ni por ningún otro camino.

## 12. ¿Qué conflictos pueden aparecer?

- **`RolesGuard`**: conflicto ya identificado y resuelto en el diseño — no puede usarse para autorizar el cambio de organización, porque `ADMINISTRADOR` bypasea cualquier `@Roles(...)` sin excepción (`roles.guard.ts:17`); hace falta un guard separado.
- **Prisma Extension** (`organizacion-prisma.client.ts`): sin conflicto, siempre que el mecanismo nuevo nunca intente tener más de un `organizacionId` activo dentro del mismo request — cada request sigue viendo exactamente uno, sea cual sea.
- **`AuditLog`**: sin conflicto — sigue siendo organizacional, sigue exigiendo el `organizacionId` del contexto activo, que en cualquier momento dado sigue siendo uno solo.
- **Refresh de sesión**: no existe ningún mecanismo de refresh hoy (confirmado: `AuthController` solo tiene `login`, `recuperar-contrasena`, `restablecer-contrasena`) — el "cambio de organización" no es un refresh de sesión, es una reemisión de token para el mismo usuario ya autenticado. No hay nada preexistente con lo que pueda entrar en conflicto.
- **Cache**: no existe ningún mecanismo de caché en el backend hoy (sin Redis, sin almacenamiento en memoria más allá de lo que Node mantiene por request) — sin conflicto.
- **React Context** (`AuthContext.tsx`): acá sí hay una tensión real, no resuelta — hoy el contexto asume "un usuario, una organización, un estado" de punta a punta. Cambiar de organización activa plantea qué hacer con datos ya cargados en memoria de la organización anterior (¿se limpian?, ¿se recargan?, ¿quedan viejos hasta que el usuario navegue?) — no es un conflicto de arquitectura de backend, es una pregunta de diseño de frontend todavía sin responder (ver pregunta 13).
- **Axios** (`api/client.ts`): el interceptor de request no necesita cambios en sí (siempre reenvía el token vigente), pero un cambio de organización que reemite el token mientras hay pedidos en curso con el token anterior es el mismo riesgo ya señalado en la pregunta 9 — no es un conflicto de Axios en sí, es una consecuencia a tener en cuenta al diseñar el momento exacto en que se reemplaza el token guardado.

## 13. ¿Qué decisiones técnicas siguen abiertas antes del diseño?

1. **Qué pasa con los datos ya cargados en memoria del frontend al cambiar de organización** — pregunta real, sin resolver, sale directamente del conflicto con React Context (pregunta 12). No es una decisión de negocio, es una decisión técnica de diseño de frontend, pendiente para cuando corresponda (10.3 es backend; esto en rigor pertenece a 10.4, pero conviene decidirlo antes de diseñar el endpoint de 10.3, porque puede influir en qué devuelve la respuesta).
2. **Nombre exacto del endpoint y del guard nuevo** — el diseño ya los llamó "orientativos" (`POST /auth/cambiar-organizacion`, `GrupoEconomicoGuard`) — confirmar o ajustar recién en la etapa de diseño.
3. **Si el endpoint de cambio de organización debe aceptar volver a la organización de pertenencia principal sin que exista una fila explícita de `AccesoGrupoEconomico` para ella** — el diseño técnico ya lo contempla ("o que sea su propia organización de pertenencia, para volver", sección 11) — confirmar que sigue siendo así, no es una decisión nueva de este documento.
4. **Qué responde exactamente el endpoint de cambio de organización** — ¿solo el token nuevo, o también un resumen de a qué otras organizaciones puede cambiar el usuario, para no tener que hacer una segunda consulta? — no decidido.

---

## Conflictos arquitectónicos reales encontrados

**Ninguno que amerite detenerse.** Todo lo que apareció en esta auditoría — la tensión con `RolesGuard`, la pregunta sobre el estado de React Context, el desajuste de tipos en `AuthContext.tsx` — ya estaba anticipado en el diseño técnico aprobado o queda como una pregunta abierta legítima para la etapa de diseño, no como una contradicción de fondo entre lo que se pide construir y lo que el sistema certificado en v1.0 garantiza. La condición no negociable (el JWT mantiene un único `organizacionId` activo por sesión, `ORGANIZACION_PRISMA` no se debilita) es perfectamente compatible, en el código real, con todo lo que Bloque 10.3 necesita construir.

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se modificó `schema.prisma`, no se modificó frontend, no se hizo `git add`, commit ni push. Este es el único documento generado. Detenido a la espera de tu revisión antes de avanzar a la etapa de diseño.

# Bloque 9 — Diseño Técnico de Administración

Fecha: 2026-07-13. Convierte `BLOQUE9_AUDITORIA_ADMINISTRACION.md` (aprobada) en secuencia implementable. No se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push. No repite el contenido de la auditoría — lo da por leído y construye sobre él.

---

## 1. Alcance general

Bloque 9 elimina la dependencia de scripts y acceso directo a Prisma para: administrar usuarios de una organización, que un usuario gestione su propio acceso, recuperar una contraseña olvidada, administrar los datos de la propia organización, y dejar trazabilidad de todo lo anterior. Queda **fuera de alcance**, explícitamente: RBAC dinámico, planes comerciales, facturación SaaS, portal público de registro, multi-moneda funcional, branding avanzado — todo ya excluido por el propio encargo, coherente con `ROADMAP_PRODUCTO_SDC.md`.

---

## 2. Sub-bloques y orden recomendado

La numeración 9.1–9.6 se conserva como identificador, pero el **orden de implementación** se ajusta en un punto, justificado:

1. **9.1 — Administración de usuarios.** Primero: es la dependencia raíz de todo lo demás (ya identificado en la auditoría, sección 8) — sin usuarios administrables desde el producto, no hay a quién aplicarle perfil propio, recuperación de contraseña útil de probar de punta a punta, ni auditoría con datos reales.
2. **9.4 — Administración de organización.** Puede avanzar **en paralelo** con 9.1 — es una entidad distinta, sin dependencia técnica entre ambas. Se ordena acá solo para mantener la numeración pedida, no porque deba esperar a 9.1.
3. **9.3 — Recuperación de contraseña.** Después de 9.1, no antes — técnicamente es independiente (opera sobre `Usuario` sin importar cómo se creó), pero validar el flujo completo requiere un usuario dado de alta por el producto, no por script.
4. **9.2 — Perfil propio.** Después de 9.1 y 9.3 — reutiliza el mismo patrón de cambio de `passwordHash` que 9.3 define, conviene que ese patrón ya esté resuelto una vez, no dos.
5. **9.5 — Auditoría administrativa.** **Se divide en dos, contra lo asumido en la numeración original**: la **escritura** de eventos se implementa de forma incremental, dentro de cada uno de 9.1/9.2/9.3/9.4/9.6, no al final (la propia auditoría, sección 8, ya señaló esto: "puede hacerse en paralelo... no como una etapa aparte al final"). La **consulta** de auditoría (el único endpoint nuevo de este sub-bloque) sí se implementa al final, porque recién ahí hay eventos reales de todos los tipos para mostrar y probar.
6. **9.6 — Invitaciones.** Último. Depende de 9.1 (reutiliza la creación de `Usuario`) y del patrón de token de un solo uso que 9.3 ya deja resuelto. Es, además, la única mejora de este bloque que no es condición de cierre — 9.1 ya elimina la dependencia de scripts para dar de alta un usuario (con una contraseña temporal gestionada por el mismo mecanismo de 9.3), así que el objetivo central de Bloque 9 queda cumplido antes de llegar a 9.6.

**Orden final de implementación:** 9.1 → 9.4 (paralelo con 9.1) → 9.3 → 9.2 → escritura de 9.5 (incremental, dentro de cada uno de los anteriores) → consulta de 9.5 → 9.6.

---

## 3. Decisiones de negocio

### Decisión 1 — Alta inicial de Organización

**Alternativas evaluadas:**
- **Provisioning interno**: quien opera la plataforma SDC crea la organización y su primer `ADMINISTRADOR` mediante una operación controlada, propia del producto (no un script), pero no accesible a cualquiera.
- **Invitación del operador de plataforma**: variante de la anterior — en vez de crear directamente al primer usuario, se le envía una invitación (reutilizando el mecanismo de 9.6) para que él mismo defina su contraseña.
- **Registro público**: cualquiera puede crear su propia organización desde una pantalla pública, sin intervención humana de SDC.

**Recomendación: provisioning interno**, para esta etapa. Justificación: no existe todavía facturación SaaS ni ningún flujo comercial (`ROADMAP_PRODUCTO_SDC.md`, Bloque 14, todavía no abierto) — un registro público hoy crearía organizaciones sin ningún control de quién puede usar el sistema ni cómo se cobra, mezclando exactamente lo que el encargo pide evitar ("no mezclar esta necesidad con un futuro portal comercial o checkout"). La variante de invitación (opción 2) es una mejora legítima pero no imprescindible — puede adoptarse más adelante reutilizando 9.6 sin ningún cambio de arquitectura, así que no se pierde nada por no elegirla ahora.

**Mecanismo propuesto** (nuevo, necesita aprobación explícita — sección 12): un endpoint de plataforma (`POST /platform/organizaciones`) protegido por un secreto dedicado (`PLATFORM_PROVISIONING_SECRET`), verificado por fail-fast al arrancar la app, siguiendo exactamente el mismo patrón ya aprobado para `JWT_SECRET`/`CORS_ORIGIN` (Bloque 8.1.a). **No es un rol nuevo dentro de `RolNombre`** — es una autorización de un tipo distinto (autoridad sobre organizaciones, no un rol dentro de una organización), consistente con la instrucción de no crear un `SUPERADMINISTRADOR` improvisado dentro del enum actual. Este endpoint crea, en una sola operación: la `Organizacion` y su primer `Usuario` con `rol: ADMINISTRADOR`.

### Decisión 2 — Recuperación de contraseña

Tratada como parte imprescindible de Bloque 9, según lo pedido. Diseño completo en la sección 5 (9.3).

**Un punto requiere decisión explícita y no se resuelve acá** (sección 12): "revocación o invalidez práctica de sesiones anteriores" tras un cambio de contraseña. El sistema de sesión actual es completamente *stateless* (JWT sin persistencia — confirmado en la auditoría, sección 7) y `JwtStrategy.validate()` fue diseñado deliberadamente para **no consultar Prisma en cada request** (`jwt.strategy.ts`, comentario ya existente). Invalidar activamente tokens ya emitidos exige una de dos cosas: (a) una consulta a la base en cada request autenticado — reabre un principio arquitectónico ya cerrado en Bloque 8.1.c/d, o (b) un mecanismo de revocación (lista negra / tabla de sesiones) — una pieza de arquitectura nueva, no un ajuste de Bloque 9. **Recomendación**: no implementar revocación activa en esta etapa; aceptar que un token ya emitido sigue siendo válido hasta su expiración natural (12 horas) incluso después de un cambio de contraseña. Es un riesgo acotado en el tiempo, documentado, no un hueco de seguridad sin límite — y evita reabrir la arquitectura de Bloque 8 sin necesidad.

---

## 4. Modelo de datos propuesto

*(Propuesta de diseño — no se modifica `schema.prisma` en este documento.)*

**`Organizacion` — nuevos campos, todos nullable inicialmente** (misma estrategia que el Backfill de Bloque 8.1.b: agregar opcional primero, nunca `NOT NULL` de entrada sobre datos ya existentes):
```
razonSocial   String?
cuit          String?
domicilio     String?
telefono      String?
email         String?
logoUrl       String?
zonaHoraria   String?
moneda        String?
```
`moneda` se guarda como dato de configuración/visualización — **no implica lógica de multi-moneda funcional**, explícitamente fuera de alcance (sección 6).

**`PasswordResetToken` — nuevo modelo:**
```
id             String    @id @default(uuid())
organizacionId String
usuarioId      String
tokenHash      String    @unique
expiresAt      DateTime
usedAt         DateTime?
createdAt      DateTime  @default(now())

organizacion Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
usuario      Usuario      @relation(fields: [usuarioId, organizacionId], references: [id, organizacionId], onDelete: Cascade, onUpdate: Cascade)

@@index([organizacionId])
@@index([usuarioId])
```
Se guarda el **hash** del token (nunca el token en texto plano — el mismo principio que ya rige `Usuario.passwordHash`). Se usa la FK compuesta `(usuarioId, organizacionId)` sobre `Usuario`, reutilizando el patrón ya cerrado en Bloque 8.1.b.4.3 — nace compatible con multiempresa desde el origen, sin necesitar ninguna excepción.

**`InvitacionUsuario` — nuevo modelo, para 9.6:**
```
id             String    @id @default(uuid())
organizacionId String
email          String
nombre         String
rol            RolNombre
tokenHash      String    @unique
expiresAt      DateTime
aceptadaEn     DateTime?
creadaPorId    String
createdAt      DateTime  @default(now())

organizacion Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
creadaPor    Usuario      @relation(fields: [creadaPorId, organizacionId], references: [id, organizacionId], onDelete: Restrict, onUpdate: Cascade)

@@index([organizacionId])
```
Modelo separado de `PasswordResetToken`, no reutilizado, porque la semántica es distinta: uno recupera el acceso a algo que ya existe, el otro habilita la creación de algo que todavía no existe — mezclarlos complicaría la lectura de ambos flujos sin ahorrar complejidad real.

**Ningún cambio a `Usuario` es estrictamente necesario** para 9.1–9.3 — el campo `activo` ya cumple el rol de "desactivado"/"bloqueado administrativamente" (ver sección 5, 9.1). No se agrega un campo de bloqueo separado en esta etapa.

---

## 5. Endpoints propuestos, por sub-bloque

### 9.1 — Administración de usuarios
- `GET /usuarios` — ya existe, se mantiene.
- `POST /usuarios` — crea un usuario en la organización propia (derivada de `request.user.organizacionId`, nunca de un parámetro del body). Contraseña inicial: se genera un `PasswordResetToken` en el mismo momento y se devuelve el enlace de activación (reutiliza 9.3, evita "exponer contraseñas" tal como pide el encargo) — no se muestra ni se genera una contraseña visible en ningún momento.
- `PATCH /usuarios/:id` — edita `nombre`, `email`, `rol`. Restringido a la organización propia (el mecanismo de aislamiento ya vigente lo garantiza; ver sección 6).
- `PATCH /usuarios/:id/activo` — activar/desactivar. Antes de desactivar, o de cambiar el `rol` de un `ADMINISTRADOR` a otro rol: verificar que quede al menos un `ADMINISTRADOR` activo distinto en la misma organización — si no, rechazar con un error de negocio explícito.
- `POST /usuarios/:id/restablecer-acceso` — acción administrativa: genera un `PasswordResetToken` para ese usuario (mismo mecanismo que 9.3), sin que el administrador vea ni defina la contraseña en ningún momento.
- **Baja**: lógica (`activo: false`), no física — coherente con el patrón ya usado en `Cliente`/`Transportista`/`Chofer`/`Vehiculo`, y necesario porque `Usuario` es referenciado por historial (`Viaje.creadoPorId`, `Liquidacion.creadoPorId`, `AuditLog.usuarioId`) que no debe romperse.
- **Bloqueo/desbloqueo por intentos fallidos**: no se implementa en 9.1. Es una capacidad distinta (requiere conteo de intentos, ventanas de tiempo) que pertenece a la sección "Seguridad y reglas obligatorias" (rate limiting), no a la administración de usuarios en sí — `activo`/`inactivo` ya cubre el caso de "un administrador bloquea manualmente el acceso de alguien".
- `Usuario.email` sigue único global — sin cambios, decisión ya aprobada en Bloque 8.1.c.
- **Roles**: se conserva el enum `RolNombre` vigente, sin cambios. No se implementa RBAC dinámico en Bloque 9 — la evolución hacia roles configurables por organización queda documentada como capacidad futura (`BLOQUE9_AUDITORIA_ADMINISTRACION.md`, sección 3), condicionada a que exista Configuración de Organización (9.4) primero.

### 9.4 — Administración de organización
- `GET /organizacion` — devuelve los datos de la organización propia (resuelta por `request.user.organizacionId`, nunca por un `:id` en la URL — no existe "listar organizaciones" para un `ADMINISTRADOR` normal).
- `PATCH /organizacion` — edita los campos de la sección 4 (A). Solo rol `ADMINISTRADOR`.
- **B. Administración entre organizaciones**: fuera de alcance del `ADMINISTRADOR` normal, tal como pide el encargo. Se maneja, en esta etapa, exclusivamente a través del mismo mecanismo de plataforma de la Decisión 1 (`PLATFORM_PROVISIONING_SECRET`) — no se diseña ninguna otra capacidad de "administración entre organizaciones" en Bloque 9, porque no fue pedida y ampliaría el alcance ya delimitado.

### 9.3 — Recuperación de contraseña
- `POST /auth/recuperar-contrasena` — recibe `email`. Responde **siempre** con el mismo mensaje genérico y el mismo código HTTP, exista o no una cuenta con ese email (protección contra enumeración). Si existe y está `activo`, genera un `PasswordResetToken` (token aleatorio criptográfico, se guarda solo su hash, expiración corta — ej. 30-60 minutos) y lo entrega a través de la abstracción de envío (ver más abajo).
- `POST /auth/restablecer-contrasena` — recibe `token` y `nuevaContrasena`. Busca por el hash del token recibido; valida que no esté usado, que no haya expirado, y que el usuario siga `activo`. Si todo es válido: actualiza `passwordHash` (bcrypt), marca el token como usado (`usedAt`), y no permite reutilizarlo. Si el usuario ya no está activo: rechaza igual que si el token no existiera (mismo principio de no revelar información).
- **Abstracción de envío** (se define la interfaz, no el proveedor — según lo pedido): un `NotificadorService` con un único método, por ejemplo `enviarRecuperacionContrasena(destinatario, enlace)`, implementado en esta etapa por un adaptador de desarrollo (log a consola o no-op) — el proveedor real de email queda como decisión pendiente (sección 12), sin bloquear el resto del diseño.
- **`PasswordResetToken` se consulta con el cliente crudo de Prisma** (`PrismaService`, no `ORGANIZACION_PRISMA`) — igual que hoy hace `AuthService.login` — porque en el momento de pedir/usar el token todavía no existe contexto de organización autenticado. Es una extensión del mismo allow-list ya aprobado en Bloque 8.1.d, no un bypass nuevo.

### 9.2 — Perfil propio
- `GET /auth/perfil` — devuelve los datos propios del usuario autenticado.
- `PATCH /auth/perfil` — permite modificar `nombre` siempre; `email` solo reingresando la contraseña actual en el mismo request (control mínimo contra secuestro de sesión — la confirmación por correo antes de que el cambio surta efecto queda como mejora futura, no imprescindible para el cierre de Bloque 9; ver sección 12).
- `POST /auth/cambiar-contrasena` — recibe `contrasenaActual` y `contrasenaNueva`; verifica la actual con `bcrypt.compare` antes de aplicar el cambio.
- **Nunca editables por estos endpoints**: `rol`, `activo`, `organizacionId` — exclusivos de 9.1 (un administrador operando sobre otro usuario).

### 9.5 — Auditoría administrativa (consulta)
- `GET /organizacion/auditoria` — lista eventos de `AuditLog` de la organización propia (ya aislado automáticamente por el mecanismo vigente), con filtros por entidad, usuario y rango de fecha. Solo rol `ADMINISTRADOR`.

### 9.6 — Invitaciones
- `POST /usuarios/invitaciones` — administrador invita (`email`, `nombre`, `rol`); crea `InvitacionUsuario`, envía enlace vía `NotificadorService`.
- `GET /usuarios/invitaciones/:token` — endpoint público, valida el token sin autenticación previa (igual que 9.3), devuelve los datos mínimos para mostrar el formulario de aceptación (nombre de la organización, email).
- `POST /usuarios/invitaciones/:token/aceptar` — recibe la contraseña elegida; si el token es válido y no expiró, **recién ahí crea el `Usuario`** (`activo: true`, `rol` tomado de la invitación), marca `aceptadaEn`.
- **Decisión recomendada**: crear el `Usuario` al aceptar, no antes. Justificación: evita que una invitación pendiente y nunca aceptada bloquee ese `email` (único global) para otra organización; evita un estado intermedio de `Usuario` que signifique "todavía no es realmente un usuario", cuando `activo` ya tiene un significado claro y establecido ("puede operar").

---

## 6. Reglas de autorización

- Toda operación de 9.1, 9.2, 9.4, 9.5 usa exclusivamente `ORGANIZACION_PRISMA` — ninguna nueva vía de acceso directo a Prisma. El `organizacionId` de cada operación se deriva siempre de `request.user.organizacionId` (vía el mecanismo ya vigente de AsyncLocalStorage), nunca de un parámetro recibido en el body o en la URL.
- 9.3 y la mitad pública de 9.6 (solicitud/validación de token) son, por naturaleza, anteriores a la autenticación — usan `PrismaService` crudo, ya autorizado para ese caso puntual (igual que `AuthService.login` hoy).
- `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`: rol `ADMINISTRADOR` únicamente. El aislamiento ya vigente garantiza que un `ADMINISTRADOR` de la Organización A nunca pueda alcanzar un `:id` de la Organización B (el mismo comportamiento ya verificado en `ACTA_CIERRE_BLOQUE8.md` — `findUnique`/`update` devuelven "no encontrado" ante un `id` ajeno).
- `PATCH /organizacion`, `GET /organizacion/auditoria`: rol `ADMINISTRADOR` únicamente.
- `POST /platform/organizaciones`: fuera del sistema de roles — autorización propia vía `PLATFORM_PROVISIONING_SECRET` (Decisión 1).
- Última protección administrativa: antes de cualquier `PATCH` que deje a una organización sin ningún `ADMINISTRADOR` activo (desactivación o cambio de rol), la operación se rechaza — regla de negocio, verificada en el propio endpoint, no delegada a la base.

---

## 7. Eventos de AuditLog

Registrados de forma incremental, dentro de cada sub-bloque que los produce (sección 2):

| Evento (`accion`) | `entidad` | Producido por |
|---|---|---|
| `usuario_creado` | `Usuario` | 9.1 |
| `usuario_editado` | `Usuario` | 9.1 |
| `usuario_rol_cambiado` | `Usuario` | 9.1 |
| `usuario_activado` / `usuario_desactivado` | `Usuario` | 9.1 |
| `usuario_acceso_restablecido` | `Usuario` | 9.1 (acción administrativa) |
| `contrasena_cambiada` | `Usuario` | 9.2 (por el propio usuario) |
| `contrasena_recuperada` | `Usuario` | 9.3 (recuperación completada) |
| `organizacion_editada` | `Organizacion` | 9.4 |
| `invitacion_creada` | `Usuario` (entidadId = id de la invitación) | 9.6 |
| `invitacion_aceptada` | `Usuario` | 9.6 |
| `operacion_administrativa_rechazada` | `Usuario` | 9.1 (ej.: intento de desactivar al último administrador) |

**Nunca se registra**: contraseñas, hashes, ni el valor de ningún token — ni siquiera parcialmente, ni en `datosAnteriores`/`datosNuevos`. `datosAnteriores`/`datosNuevos` se limitan a los campos de negocio que cambiaron (ej. `rol` anterior/nuevo, `activo` anterior/nuevo).

`GET /organizacion/auditoria` se limita a consultar los eventos de esta tabla — no se convierte en un visor genérico de toda actividad del sistema, tal como pide el encargo.

---

## 8. Riesgos y casos borde

- **Organización sin ningún `ADMINISTRADOR` activo**: cubierto por la regla de la sección 6 — se verifica en cada operación que pudiera provocarlo, no solo se documenta.
- **Token de recuperación/invitación interceptado**: mitigado por expiración corta, uso único, y el hecho de que solo se almacena el hash (un acceso de solo lectura a la base no permite reconstruir el token original, igual que ya ocurre con `passwordHash`).
- **Enumeración de usuarios vía recuperación de contraseña**: mitigado por la respuesta indistinguible de 9.3 — mismo mensaje, mismo tiempo de respuesta aproximado, exista o no la cuenta.
- **Email ya usado en otra organización**: `Usuario.email` sigue único global — un alta o una invitación con un email ya existente en cualquier organización debe rechazarse con un mensaje claro, no con un error genérico de base de datos.
- **Cambio de contraseña no revoca sesiones anteriores**: riesgo aceptado y documentado explícitamente (Decisión 2) — acotado a un máximo de 12 horas por la expiración natural del JWT.
- **Reutilización de un token ya usado**: se previene marcando `usedAt` en el mismo momento en que se consume, antes de confirmar el cambio — no después.
- **Invitación aceptada dos veces (doble submit)**: se previene por el mismo mecanismo de `usedAt`/`aceptadaEn` — la segunda aceptación encuentra el token ya consumido y se rechaza.
- **Administrador que se autodesactiva por error**: la regla del último administrador activo lo cubre solo si es el único; si hay más de un `ADMINISTRADOR`, un usuario puede desactivarse a sí mismo hoy sin que exista una advertencia adicional — se documenta como un caso borde aceptado, no bloqueante, mitigable con una confirmación en la futura pantalla (fuera de alcance de este documento, que no diseña pantallas).

---

## 9. Estrategia de migración compatible con datos actuales

Mismo criterio ya aprobado y usado en Bloque 8.1.b/8.1.b.4: **aditivo primero, nunca destructivo**.
1. Agregar los campos nuevos de `Organizacion` (sección 4) como `nullable` — la organización real ya existente en producción queda con esos campos en `null`, sin ningún backfill forzado (a diferencia de `organizacionId`, no hay ninguna razón de integridad para exigir un valor desde el día uno).
2. Crear `PasswordResetToken` e `InvitacionUsuario` como tablas nuevas — no afectan ninguna tabla existente.
3. Ningún campo existente de `Usuario` cambia de tipo ni de obligatoriedad.
4. No se requiere ningún backfill de datos reales — a diferencia del Backfill de Bloque 8.1.b, acá no hay filas existentes que deban migrarse a un estado nuevo, solo estructura nueva sin poblar todavía.

---

## 10. Plan de validación

Mismo rigor ya aplicado en cada sub-bloque de Bloque 8 y en la Fase F — build, aplicación en desarrollo, regresión funcional completa por HTTP real, antes de cada commit:
- Login de un usuario creado por el propio flujo de 9.1 (no por script) — cierre del objetivo central del bloque.
- CRUD completo de usuarios vía HTTP, incluida la verificación de que un `ADMINISTRADOR` de una organización no puede alcanzar usuarios de otra (reutilizando exactamente el patrón de prueba ya usado en la Fase F).
- Protección del último administrador: intento deliberado de desactivar/cambiar de rol al único `ADMINISTRADOR` de una organización de prueba — debe rechazarse.
- Flujo completo de recuperación: solicitar, confirmar que la contraseña vieja deja de funcionar recién después de completar el restablecimiento (no antes), confirmar que el token no puede reutilizarse.
- Flujo completo de invitación (cuando se implemente 9.6): invitar, aceptar, confirmar alta correcta del usuario con el rol asignado.
- Confirmar que cada evento de la sección 7 efectivamente genera una fila en `AuditLog`, con el `organizacionId` correcto.
- Repetir, contra estos endpoints nuevos, el mismo tipo de prueba de fuga cruzada ya usada en `ACTA_CIERRE_BLOQUE8.md` — con una segunda organización de prueba, confirmar que ninguna operación administrativa nueva cruza el límite de organización.

---

## 11. Criterios de aceptación por sub-bloque

- **9.1**: un `ADMINISTRADOR` puede crear, editar, activar/desactivar usuarios de su propia organización, sin ningún acceso a la base, y nunca puede hacerlo sobre otra organización ni dejar la propia sin administrador activo.
- **9.4**: un `ADMINISTRADOR` puede ver y editar los datos de su propia organización, sin acceso a la base, y nunca puede ver ni editar otra organización.
- **9.3**: un usuario puede recuperar el acceso a su cuenta sin intervención del equipo técnico; la respuesta ante un email inexistente es indistinguible de una cuenta real; un token usado o expirado nunca funciona dos veces.
- **9.2**: un usuario puede editar su propio nombre y cambiar su propia contraseña sin depender de un administrador ni de un script.
- **9.5 (escritura)**: cada evento de la sección 7 queda registrado en el momento en que ocurre, con el usuario, la organización y el detalle correctos, sin datos sensibles. **9.5 (consulta)**: un `ADMINISTRADOR` puede ver el historial de su propia organización, nunca el de otra.
- **9.6**: un administrador puede invitar a alguien que todavía no tiene cuenta, y esa persona puede activarse a sí misma definiendo su propia contraseña, sin que el administrador la vea ni la genere.

**Criterio de cierre de Bloque 9 en conjunto**: ningún paso de la validación de la sección 10 requiere, en ningún momento, un script, una consulta directa a Prisma o una modificación manual de la base de datos.

---

## 12. Decisiones que todavía requieren aprobación del Product Owner

1. **Mecanismo de `PLATFORM_PROVISIONING_SECRET`** para el alta inicial de organizaciones (Decisión 1) — es una autorización de un tipo nuevo, distinta de todo lo existente, y necesita confirmación explícita antes de implementarse.
2. **No revocar sesiones anteriores tras un cambio de contraseña** (Decisión 2) — se recomienda aceptar el riesgo acotado a 12 horas en vez de reabrir la arquitectura stateless de Bloque 8; requiere conformidad explícita porque es una desviación literal de lo pedido ("revocación... de sesiones anteriores").
3. **Regla exacta para el cambio de email propio** (9.2) — si alcanza con reingresar la contraseña actual (propuesto) o si se requiere además una confirmación por correo antes de que el cambio surta efecto.
4. **Secuenciar 9.6 al final, no bloqueante para el cierre de Bloque 9** — se recomienda y se justifica en la sección 2, pero corresponde confirmarlo antes de planificar los sub-bloques uno por uno.
5. **Proveedor real de envío de email** (`NotificadorService`) — la interfaz queda definida (sección 5), el proveedor concreto (y su costo/configuración) no se decide en este documento y no bloquea el resto del diseño, pero sí bloquea que 9.3 y 9.6 funcionen de punta a punta en producción.

---

Fin del diseño. No se implementó nada de lo descripto acá — queda a la espera de tu revisión antes de abrir el primer sub-bloque técnico.

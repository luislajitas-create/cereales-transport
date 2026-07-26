# Diseño Técnico — Bloque 10.3: Acceso de usuarios y cambio de organización activa

Fecha: 2026-07-16. Diseño técnico — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push, no se implementó nada de frontend ni de backend.** Se apoya en `AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` (aprobada como base) y respeta, sin reabrirlas, las 5 Decisiones del Product Owner, las 4 Decisiones Técnicas y el diseño ya aprobado en `docs/disenos/GRUPO_ECONOMICO_DISENO_TECNICO.md`. Sigue el mismo formato que aquel diseño y que `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`: no se auto-aprueba, termina a la espera de aprobación explícita (`METODOLOGIA_SDC.md`, etapa 3).

**La pregunta que responde este documento, y solo esta:** ¿cómo puede un mismo usuario, autorizado explícitamente, operar varias Organizaciones del mismo Grupo Económico manteniendo siempre una sola Organización activa, un único `organizacionId` en el JWT, filtrado normal por `ORGANIZACION_PRISMA`, los roles funcionales existentes, y aislamiento completo entre Organizaciones?

No se diseña acá Pago Consolidado (Bloque 10.5), ni identidad compartida adicional más allá de la ya construida en 10.2, ni Transportistas/Vehículos compartidos, ni ningún cambio de semántica de los módulos operativos.

**Código real releído para este diseño**, además del ya verificado en la auditoría: `schema.prisma` completo, `backend/src/grupo-economico/grupo-economico.controller.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`, `current-user.decorator.ts`, `roles.decorator.ts`, `jwt-auth.guard.ts`, `CONSTITUCION_SDC.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `RELEASE_SDC_v1.0.md` (sección 13, riesgo de 12 horas, confirmado línea 129).

---

## 1. Modelo de autorización — `AccesoGrupoEconomico`

### Qué representa exactamente

Una autorización explícita, adicional y reversible, otorgada a un `Usuario` puntual (cuya organización de pertenencia sigue siendo, sin cambios, la de siempre) para operar **una** Organización adicional del mismo Grupo Económico. Nunca reemplaza `Usuario.organizacionId` — es siempre un permiso que se suma, no un traslado de pertenencia.

### Diferencia deliberada respecto del precedente de `IdentidadChoferGrupo.creadoPorId` (Bloque 10.2, Hallazgo 2)

En 10.2 se decidió, de forma explícita y documentada, **no** crear una relación real de una entidad de grupo hacia `Usuario`, precisamente porque no existía todavía ningún control de acceso multiempresa — cualquier relación así habría sido la primera conexión directa de una entidad de grupo a un `Usuario` de cualquier organización, sin ningún mecanismo que la gobernara. Ese razonamiento **no aplica acá, y por una razón estructural, no de preferencia**: `AccesoGrupoEconomico` no es un campo incidental de auditoría ("quién hizo esto") — es, en sí mismo, el mecanismo de control de acceso multiempresa que 10.2 todavía no tenía. Necesita una relación real e íntegra a `Usuario.id`, con la misma integridad referencial que ya usa cualquier otro campo "quién" del schema — de lo contrario no podría cumplir su propio propósito (saber, con certeza estructural, a qué `Usuario` real corresponde cada autorización).

### Qué Organización lo otorga

**La Organización destino** — la que el usuario queda autorizado a operar además de la suya — a través de su propio `ADMINISTRADOR` (Decisión Técnica 2, ya aprobada, sin reabrir). Nunca la organización de pertenencia del usuario, y nunca ningún `ADMINISTRADOR` de una tercera organización.

### Cómo se relaciona con el Usuario

Relación real (`@relation`) a `Usuario.id` — no a la clave compuesta `[id, organizacionId]` que usa el resto del schema para modelos organizacionales, porque `AccesoGrupoEconomico` en sí no tiene `organizacionId` propio que pudiera formar esa combinación (no es un modelo organizacional, mismo tratamiento que `GrupoEconomico`, `IdentidadChoferGrupo` y `Organizacion`). `Usuario.id` es la clave primaria (`@id`) del modelo — referenciarla directamente es válido y no exige ningún cambio en `Usuario`.

Dos relaciones distintas a `Usuario`, cada una con su propio sentido:
- **`usuarioId`** — el `Usuario` autorizado (a quien se le otorgó el acceso).
- **`otorgadoPorId`** — el `Usuario` (siempre `ADMINISTRADOR` de la organización destino, verificado en el momento de otorgar) que ejecutó el otorgamiento.

### Qué restricciones de unicidad necesita

`@@unique([usuarioId, organizacionId])` — no puede existir más de un acceso activo para el mismo par usuario/organización, tal como pide el punto 1 del pedido. Otorgar un acceso ya existente debe rechazarse explícitamente (mismo criterio ya usado en 10.1 para "una organización no puede pertenecer a dos grupos" y en 10.2 para "un chofer no puede tener dos identidades").

### Qué ocurre si el Usuario o la Organización quedan inactivos

- **`Usuario.activo` pasa a `false`**: el registro de `AccesoGrupoEconomico` **no se borra ni se marca automáticamente** — sigue existiendo como autorización otorgada, pero deja de poder usarse mientras el usuario esté inactivo, porque el endpoint de cambio de organización (sección 3) valida `usuario.activo` en el momento del cambio, no solo en el momento del otorgamiento. Si el usuario se reactiva más adelante, el acceso vuelve a funcionar sin necesidad de volver a otorgarlo — mismo comportamiento reversible que ya tiene `Usuario.activo` hoy para el resto del sistema.
- **La Organización destino sale del Grupo Económico** (`Organizacion.grupoEconomicoId` vuelve a `null`, vía el endpoint de desasociación ya construido en 10.1): tampoco se borra el `AccesoGrupoEconomico` automáticamente — evitar un borrado en cascada silencioso es el mismo criterio ya aplicado a `Chofer.identidadChoferGrupoId` en 10.2. Pero el endpoint de cambio de organización debe validar, en cada uso, que la organización de pertenencia del usuario **y** la organización destino sigan perteneciendo al mismo Grupo Económico en ese momento — si ya no coinciden, el cambio se rechaza, aunque el registro de `AccesoGrupoEconomico` siga técnicamente en la base. Es una validación en el momento de uso, no una limpieza automática de datos.

### Nulabilidad y borrado

`usuarioId`, `organizacionId`, `otorgadoPorId`: los tres obligatorios (`String`, no `String?`) — un `AccesoGrupoEconomico` sin alguno de los tres no representa nada válido. `onDelete: Restrict` en las tres relaciones, mismo patrón ya usado en todo el schema — ni `Usuario` ni `Organizacion` se borran nunca hoy (solo se desactivan), así que este `Restrict` es, en la práctica, una protección estructural sin costo operativo real, igual que ya lo es en el resto de los modelos.

---

## 2. Usuario y roles

### Las cuatro piezas, separadas explícitamente

- **A. Identidad de la persona**: `Usuario` — sin cambios, sigue siendo una fila, con un `email` único global, un `passwordHash`, y una organización de pertenencia (`organizacionId`, obligatoria, sin cambios).
- **B. Organizaciones a las que está autorizada**: la organización de pertenencia (siempre) más cualquier `AccesoGrupoEconomico` otorgado (sección 1) — nunca viven en el JWT (sección 3), se consultan server-side en el momento que hace falta.
- **C. Rol funcional dentro de cada Organización**: ver más abajo — es el punto que el pedido exige no asumir.
- **D. Organización activa de la sesión**: el `organizacionId` del token vigente en ese momento — sigue siendo, siempre, un único valor (sección 3).

### ¿El rol es único para el Usuario, o puede variar por Organización?

**Recomendación: el rol sigue siendo único por Usuario — `Usuario.rol` no cambia de forma, y se aplica igual sin importar cuál sea la Organización activa.** No se diseña un rol por Organización.

**Por qué, verificado contra el código real:**
- `Usuario.rol` (`schema.prisma:143`) es un campo único por fila de `Usuario` — no existe hoy ningún lugar del schema donde un rol dependa de la organización activa.
- `RolesGuard` (`roles.guard.ts`) lee `user.rol`, que sale del JWT (`payload.rol`, poblado en `auth.service.ts` desde `usuario.rol`) — no del contexto de organización activa. Cambiar de organización activa (sección 3) no cambia qué es `usuario.rol`, solo cambia `organizacionId`. Diseñar un rol distinto por organización exigiría que el JWT llevara, además, una tabla rol-por-organización, o que el guard consultara la base en cada request — ambas cosas son un cambio de arquitectura mucho mayor que el problema que este bloque necesita resolver, y contradicen la instrucción explícita de "no crear RBAC dinámico".
- Es la opción de menor cambio compatible con el caso real de los tres usuarios administrativos: son personas del equipo administrativo, con un rol de confianza ya alto en su propia organización (Decisión 3 de negocio, aprobada, "más amplio que el mínimo necesario, con conocimiento de ese costo").

**Consecuencia que se documenta explícitamente, no se oculta**: si una persona tiene `LIQUIDACIONES` en su Organización de pertenencia y recibe `AccesoGrupoEconomico` a otra Organización, va a operar esa otra Organización también como `LIQUIDACIONES` — el `ADMINISTRADOR` que otorga el acceso (Decisión Técnica 2) no tiene forma de otorgar un rol distinto ni más acotado dentro de su propia organización para esa persona en particular. Es una consecuencia directa, ya implícita, de la Decisión Técnica 3 ("independiente del rol de negocio... una vez dentro, sigue sujeta a los mismos controles de rol que ya rigen") — este diseño no la resuelve porque el pedido explícito fue no reabrir esa decisión ni crear RBAC dinámico. Queda anotada en la sección 16 por transparencia, no como una decisión pendiente nueva.

---

## 3. JWT y cambio de contexto

### El flujo exacto

1. El usuario, ya autenticado, con un token vigente cuya organización activa es la Organización de origen, invoca `POST /auth/cambiar-organizacion` con `{ organizacionId: <destino> }` en el cuerpo.
2. El backend valida, en este orden, todo server-side, nunca confiando en nada más que el `organizacionId` recibido como una intención a verificar (nunca un hecho a aceptar):
   - El `Usuario` del token sigue existiendo y `activo === true` (verificado ahora, no solo al login — ver sección 4).
   - La Organización destino existe (ver la nota sobre "Organización activa" más abajo — hallazgo real).
   - La Organización destino es la propia organización de pertenencia del usuario (para "volver"), **o** existe un `AccesoGrupoEconomico` vigente para ese par usuario/organización.
   - La organización de pertenencia del usuario y la organización destino pertenecen, en este momento, al mismo Grupo Económico (nunca asumido desde el momento en que se otorgó el acceso — ver sección 1).
   - (El rol no se valida acá — sigue siendo el mismo `Usuario.rol` de siempre, sección 2.)
3. Si toda la validación pasa: se registra un `AuditLog` de `organizacion_activa_cambiada` (sección 8) y se emite un token nuevo, con los mismos 5 campos de siempre, `organizacionId` apuntando a la Organización destino, vigencia `12h` desde este momento (no se hereda ni se extiende la vigencia del token anterior).
4. Si cualquier validación falla: `403` (nunca `404` para no revelar si la organización existe o no — mismo criterio ya usado en 10.1/10.2), sin emitir ningún token, sin tocar el token actual del usuario, con un mensaje genérico ("No tenés autorización para operar esa organización.").
5. El frontend reemplaza el token anterior (sección 10) — ver la salvedad importante en la sección 9 sobre qué implica "reemplazar" acá.
6. Toda request posterior usa exclusivamente el nuevo token, exactamente igual que hoy usa cualquier token — sin ningún cambio en `JwtStrategy`, `OrganizacionContextInterceptor` ni `ORGANIZACION_PRISMA`.

### Hallazgo real: "Organización destino activa" no tiene, hoy, dónde verificarse

El pedido exige validar que la "Organización destino" esté activa. **Verificado contra `schema.prisma`: `Organizacion` no tiene ningún campo `activo`, ni ningún mecanismo de desactivación, en ningún lugar del sistema hoy.** Solo `Usuario.activo` existe. No es un descuido de este diseño — es un hecho estructural ya vigente en v1.0, nunca necesario hasta ahora porque nunca existió la posibilidad de que un usuario intentara alcanzar una organización que no fuera la suya.

**Recomendación:** para esta primera versión, "Organización destino activa" se interpreta, la única forma posible hoy, como **"la Organización destino existe"** — no hay ningún estado intermedio de "organización suspendida" contra el cual comparar. Si en el futuro el negocio necesita poder suspender una organización completa (por ejemplo, por falta de pago), eso es una funcionalidad nueva, de alcance mayor a este sub-bloque, y no se construye acá.

### Vigencia, token anterior, y compatibilidad con el modelo stateless

- **Vigencia:** `12h`, igual que cualquier login, contadas desde el momento del cambio — no se hereda la expiración del token anterior.
- **El token anterior sigue siendo válido hasta su propia expiración natural**, exactamente el mismo comportamiento ya aceptado y documentado (`RELEASE_SDC_v1.0.md`, sección 13, línea 129: "el riesgo queda acotado a un máximo de 12 horas... fue una decisión consciente"). Esto significa que, durante un tiempo acotado, un usuario puede tener dos tokens simultáneamente válidos — uno para cada organización — de la misma manera que ya puede tener hoy dos tokens válidos si inicia sesión desde dos navegadores distintos. No es un caso nuevo de riesgo, es el mismo riesgo ya aceptado, aplicado a un segundo token en vez de a una segunda sesión de login.
- **Compatibilidad stateless total:** el nuevo token, una vez emitido, se valida exactamente igual que cualquier otro — ninguna consulta a la base por request, ningún cambio en `JwtStrategy.validate()`.
- **No se incluye la lista de organizaciones ni el Grupo Económico dentro del token** — se consulta server-side en el momento que hace falta (por ejemplo, para mostrar el selector), tal como ya lo estableció `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 11.

---

## 4. Tokens viejos y revocación

### Las cuatro alternativas, comparadas

| Alternativa | Evaluación |
|---|---|
| **A. Aceptar que el token siga válido hasta expirar** | Ya es, de hecho, el comportamiento general aceptado del sistema (`RELEASE_SDC_v1.0.md`, sección 13) — no agrega ningún mecanismo nuevo. |
| **B. Validar acceso contra base de datos en cada cambio de contexto, pero no en cada request** | Ya es, en los hechos, lo que el flujo de la sección 3 hace — el cambio de organización es, precisamente, el único momento en que se golpea la base para revalidar. |
| **C. Incorporar un mecanismo de versión/revocación de sesión** | Infraestructura nueva y genuinamente mayor: exigiría una tabla o un contador de "versión de sesión" por usuario, y que **todo** request (no solo el cambio de organización) la consultara — eso sí rompería el modelo stateless vigente, para todos los usuarios, no solo para quienes tienen acceso de grupo. No existe hoy para ningún otro caso de revocación (ver más abajo). |
| **D. Otra opción** | No se identificó ninguna alternativa adicional relevante para el alcance de este sub-bloque. |

**Recomendación: combinar A + B — exactamente el mecanismo ya diseñado en la sección 3.** Se rechaza explícitamente la Alternativa C para este sub-bloque.

**Por qué se rechaza C:** el sistema **ya** acepta hoy, para todo el resto de los cambios de permisos (desactivar un usuario, cambiarle el rol, cambiarle la contraseña), que el token emitido antes del cambio siga siendo válido hasta expirar — es un riesgo general del sistema, no específico de Grupo Económico, ya evaluado y aceptado en `RELEASE_SDC_v1.0.md`. Construir un mecanismo de revocación inmediata únicamente para el acceso de grupo, dejando sin resolver el mismo riesgo para desactivar un usuario o cambiarle el rol, sería inconsistente y de alcance mucho mayor al de este sub-bloque — coincide exactamente con la instrucción de "no reabrir toda la autenticación salvo necesidad real". No se identificó esa necesidad real: el límite ya aceptado es de un máximo de 12 horas, igual en todos los casos.

### Cada escenario pedido, explícitamente

- **Se revoca el acceso a una Organización, con un token ya emitido para esa Organización**: el token sigue siendo válido hasta expirar (máximo 12h) — riesgo ya aceptado, sin mecanismo nuevo.
- **La Organización queda inactiva**: no existe ese concepto hoy (ver hallazgo de la sección 3) — no aplica.
- **El usuario queda inactivo**: el token ya emitido sigue siendo válido hasta expirar — mismo riesgo general ya aceptado hoy para cualquier usuario desactivado, sección 13 de `RELEASE_SDC_v1.0.md`. Lo que **sí** cambia con este diseño es que cualquier **intento posterior** de cambiar de organización (sección 3) sí valida `usuario.activo` en el momento, así que un usuario recién desactivado no puede usar ese mecanismo para extender su alcance, aunque su token actual siga funcionando para lo que ya tenía activo.
- **Cambia el rol**: mismo criterio — el token ya emitido conserva el rol viejo hasta expirar, igual que hoy.
- **La Organización deja el Grupo Económico**: ver sección 1 — el `AccesoGrupoEconomico` no se borra, pero deja de poder usarse en el próximo intento de cambio de organización, porque se revalida la pertenencia al mismo grupo en cada uso, no solo al otorgar.

---

## 5. Backend — módulos y endpoints

### Módulos y responsabilidades mínimas

- **Administración de accesos**: otorgar y revocar `AccesoGrupoEconomico` — extiende el módulo `grupo-economico` ya existente, no uno nuevo.
- **Consulta de Organizaciones accesibles**: qué organizaciones, además de la propia, puede operar el usuario autenticado — necesario para el selector (sección 9, informativo para 10.4).
- **Cambio de Organización activa**: el endpoint de la sección 3, en `AuthController` (o un módulo nuevo y chico dedicado a sesión, si se prefiere no mezclarlo con `login`/`recuperar-contrasena` — decisión de implementación, sin impacto de diseño).
- **Guard específico de Grupo Económico**: `GrupoEconomicoGuard` (nombre orientativo, ya usado en el diseño previo) — verifica, para el endpoint de cambio de organización, que exista la autorización antes de emitir el token.
- **Auditoría**: sin módulo nuevo, se reutiliza `AuditLog` (sección 8).

### Endpoints, con contrato funcional completo

| Endpoint (orientativo) | Quién puede usarlo | Organización que gobierna | Validaciones server-side | Respuesta | Errores | Auditoría |
|---|---|---|---|---|---|---|
| `GET /grupo-economico/organizaciones-accesibles` | Cualquier usuario autenticado | Ninguna organización "gobierna" — es autoconsulta | Ninguna más allá de estar autenticado | Lista de organizaciones que el usuario puede operar (la propia + las de `AccesoGrupoEconomico` vigente, filtradas por pertenencia actual al mismo grupo) | — | No genera evento (es una lectura) |
| `POST /grupo-economico/:id/accesos` | `ADMINISTRADOR` de la organización destino, exclusivamente (Decisión Técnica 2) | La organización destino (`:id`), tomada de la URL pero **verificada** contra `actor.organizacionId` — el actor solo puede otorgar acceso a **su propia** organización, nunca a una organización ajena a través de este endpoint | Actor es `ADMINISTRADOR` de `:id`; el usuario destinatario existe, está `activo`, y pertenece a una organización del mismo Grupo Económico que `:id`; no existe ya un `AccesoGrupoEconomico` para ese par | El acceso creado | `403` si el actor no es `ADMINISTRADOR` de `:id`; `400` si ya existe, o si el destinatario no pertenece al mismo grupo | `acceso_grupo_otorgado`, bajo la organización que otorga |
| `DELETE /grupo-economico/:id/accesos/:accesoId` | Mismo criterio que el alta (Decisión Técnica 2) | Igual que arriba | Actor es `ADMINISTRADOR` de `:id`; el acceso pertenece a esa organización | `{ revocado: true }` | `403`/`404` según corresponda, sin revelar accesos de otras organizaciones | `acceso_grupo_revocado`, bajo la organización que revoca |
| `GET /grupo-economico/:id/accesos` | `ADMINISTRADOR` de esa organización | La organización consultada | Actor es `ADMINISTRADOR` de `:id` | Lista de accesos otorgados **por** esa organización (nunca los otorgados por otra) | `403` si no es `ADMINISTRADOR` de `:id` | No genera evento (lectura) |
| `POST /auth/cambiar-organizacion` | Cualquier usuario con `AccesoGrupoEconomico` vigente para el destino, o volviendo a su propia organización | Ninguna organización individual "gobierna" — depende del par usuario/destino | Ver flujo completo, sección 3 | `{ accessToken, usuario }`, misma forma que login | `403` genérico si no autorizado (nunca `404`) | `organizacion_activa_cambiada`, bajo origen y destino (sección 8) |

No se escribe código de ninguno de estos endpoints — es, únicamente, el contrato funcional que la implementación deberá cumplir.

---

## 6. `ORGANIZACION_PRISMA`

**Confirmado expresamente, verificado contra el código real (`organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`), no asumido:**

- No se modifica ni un carácter de estos tres archivos.
- No recibe ninguna lógica de Grupo Económico ni de `AccesoGrupoEconomico`.
- Sigue trabajando exclusivamente con un solo `organizacionId` por request, sembrado una única vez por `OrganizacionContextInterceptor` desde `request.user.organizacionId` — sin ningún cambio en ese interceptor.
- Nunca consulta varias organizaciones en la misma operación — no hay, en este diseño, ninguna consulta que abra el contexto de más de una organización a la vez (eso es exclusivo del futuro servicio de Pago Consolidado, Bloque 10.5, ya diseñado en `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 8, y fuera de alcance acá).
- Todos los 21 modelos de `ORGANIZACIONAL_MODELS` siguen, sin excepción, sin saber que existe Grupo Económico.

**Por qué el JWT nuevo alcanza para que esto funcione sin cambios:** `OrganizacionContextInterceptor` no le importa **cómo** se llegó al valor de `request.user.organizacionId` — solo le importa que exista y sea un string. Cambiar de organización activa (sección 3) simplemente hace que el **próximo** token traiga un valor distinto en ese mismo campo, con la misma forma de siempre. Desde la perspectiva de `ORGANIZACION_PRISMA`, cada request sigue viendo, exactamente igual que hoy, un usuario con una sola organización — porque, en los hechos, cada request individual **sigue teniendo** una sola organización activa. Cambiar de organización no es "tener dos a la vez", es "cerrar una sesión con la organización A y abrir una con la organización B", sin volver a pedir la contraseña — exactamente la analogía que ya usa `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 3.

---

## 7. `RolesGuard`

### Las dos preguntas que hoy se resuelven con un solo guard, y cómo se separan

- **¿Puede este usuario acceder a esta Organización?** — pregunta nueva, que no existía hasta este bloque. La responde el guard nuevo de Grupo Económico, únicamente en el endpoint de cambio de organización (sección 3/5) — nunca en los endpoints operativos normales (Viajes, Facturas, Liquidaciones, etc.), porque esos ya reciben, en cada request, una organización activa ya validada por el propio JWT.
- **¿Puede este rol ejecutar esta operación, dentro de la Organización activa?** — pregunta que ya existía, y que `RolesGuard` sigue respondiendo exactamente igual que hoy, sin ningún cambio de código, para **cualquier** endpoint, incluidos los nuevos de Grupo Económico (que también usan `@Roles("ADMINISTRADOR")`, como ya hace `GrupoEconomicoController` hoy).

### Orden de validación

Para el endpoint de cambio de organización específicamente: `JwtAuthGuard` (autentica el token actual) → guard nuevo de Grupo Económico (valida la autorización hacia la organización destino, sección 3) → el controller ejecuta la lógica y emite el token nuevo. `RolesGuard` **no interviene** en este endpoint específico — cambiar de organización no es una operación que dependa de un rol funcional, cualquier usuario autenticado puede intentarlo (la autorización real la da `AccesoGrupoEconomico`, no un rol).

Para el resto de los endpoints de Grupo Económico (otorgar/revocar acceso, consultar): `JwtAuthGuard` → `RolesGuard` (`@Roles("ADMINISTRADOR")`) — exactamente el mismo orden y mecanismo que ya usa `GrupoEconomicoController` hoy, sin ningún guard adicional, porque el pertenecer-a-la-organización-destino ya lo garantiza el propio JWT (el actor opera siempre sobre `actor.organizacionId`, igual que en 10.1/10.2).

**No se modifica la regla especial de `ADMINISTRADOR` en `RolesGuard`** — no se encontró ningún conflicto objetivo que la justifique. Su bypass (`roles.guard.ts:17`) sigue significando, exactamente igual que hoy, "administrador de mi propia organización activa" — nunca "administrador de todo el grupo".

---

## 8. Auditoría

### Los cuatro eventos, y dónde se guarda cada uno

- **`acceso_grupo_otorgado`** — una sola entrada, bajo la organización que otorga (`:id` de la sección 5), con `usuarioId` del actor (`otorgadoPorId`), y el `usuarioId` autorizado en `datosNuevos`.
- **`acceso_grupo_revocado`** — igual criterio, bajo la organización que revoca.
- **`organizacion_activa_cambiada`** — **dos entradas, una por organización involucrada**, no una sola: una bajo la organización de **origen** (`"salió hacia la organización X"`) y otra bajo la organización de **destino** (`"entró desde la organización Y"`). Es el mismo criterio que `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 10, ya estableció para eventos que involucran a más de una organización ("una entrada por organización... no como un evento único a nivel de grupo") — y responde directamente a lo que este punto pide: que el evento sea visible en la auditoría de **cada** organización involucrada, no solo una.
- **`intento_cambio_organizacion_denegado`** — **se incluye, con una salvedad de dónde vive.** Aporta valor real (es la única señal de un intento de acceder a una organización sin autorización) y no genera ruido excesivo porque solo ocurre ante un intento activo de cambio, no en cada request normal. Se registra bajo la organización de **origen** — la única organización cuyo contexto está activo en el momento del intento fallido, porque la organización destino nunca llegó a otorgarse.

### Qué conserva cada evento

Usuario actor; organización origen; organización destino; organización que otorgó/revocó (para los eventos de acceso); fecha (`AuditLog.fecha`, automática); motivo, cuando corresponde (por ejemplo, el motivo de una revocación, si se pide uno — no fue exigido explícitamente en las Decisiones Técnicas, queda como detalle de implementación, no bloqueante).

### Por qué no hace falta ningún cambio a `AuditLog`

Sigue siendo organizacional (exige `organizacionId`), sin ningún cambio de estructura — solo se agregan valores nuevos de `entidad`/`accion`, exactamente el mismo patrón ya usado en 10.1/10.2.

---

## 9. Frontend

**Nota de alcance:** esta sección, y las secciones 10 y 11, se diseñan ahora porque el pedido las incluye explícitamente y porque informan directamente el contrato que el backend de 10.3 debe exponer — pero **no se implementan en este sub-bloque.** El frontend es, por plan ya aprobado, el Bloque 10.4. Esto es exactamente el mismo criterio ya usado en la auditoría (`AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, pregunta 8).

### Cambios identificados

- **Corrección del tipo `Usuario` en `AuthContext.tsx`**: agregar `organizacionId: string` a la interfaz — hoy el dato ya viaja en tiempo de ejecución (`login()` lo recibe y lo guarda), pero el tipo no lo declara (hallazgo ya señalado en la auditoría, pregunta 8).
- **Consulta de Organizaciones accesibles**: `GET /grupo-economico/organizaciones-accesibles` (sección 5) — se consulta al cargar la sesión, o de forma diferida, cuando se necesita mostrar el selector.
- **Selector visible solo si hay más de una organización accesible**: para el resto de los usuarios, la lista tiene un solo elemento (la propia) y el selector simplemente no se renderiza — sin ningún cambio de comportamiento visible para ellos.
- **Cambio de Organización**: invoca `POST /auth/cambiar-organizacion`; ver la resolución de la tensión de memoria más abajo para qué pasa después.
- **Reemplazo del token y actualización del objeto usuario**: ver sección 10.
- **Navegación posterior**: al Dashboard (`/`), mismo destino que ya usa `Login.tsx` después de un login exitoso — consistencia con un patrón ya existente, no uno nuevo.
- **Manejo de errores**: si `cambiar-organizacion` devuelve `403`, se muestra el error sin tocar ni el token ni el `usuario` ya guardados — la sesión actual sigue intacta, el usuario simplemente no logró cambiar.

### La tensión señalada por la auditoría: qué pasa con los datos ya cargados en memoria

**Comparación de las cuatro alternativas:**

| Alternativa | Evaluación |
|---|---|
| **A. Recarga completa de la aplicación** | Garantiza cero residuo de cualquier estado en memoria, en cualquier componente, sin excepción — incluidos los `useState` locales de componentes que no pasan por `AuthContext`. Es, en los hechos, el mismo mecanismo que **ya existe** en el propio `api/client.ts` para el caso de un `401` (`window.location.href = "/login"`) — no introduce un patrón nuevo, reutiliza uno ya probado en producción. |
| **B. Limpiar `AuthContext`/estado y navegar al Dashboard (SPA)** | Más veloz para el usuario, pero no puede garantizar, sin auditar cada componente uno por uno, que ninguna pantalla mantenga datos ya cargados en un estado local propio (no todo el estado de la aplicación vive en `AuthContext`) — exactamente el riesgo que la auditoría señaló como no resuelto. |
| **C. Invalidación selectiva de estados y consultas** | Exigiría un sistema de invalidación de cache por clave (algo como React Query) que **no existe hoy en el proyecto** — instrucción explícita del pedido: "no incorporar una librería de cache nueva". Se descarta por eso, no por ser mala idea en abstracto. |
| **D. Otra alternativa** | No se identificó ninguna mejor para esta primera versión. |

**Recomendación: Alternativa A — recarga completa.** Es la más seguridad-primero de las cuatro (la propia instrucción del pedido fija esa prioridad por encima de la fluidez: "evitar mostrar datos residuales... incluso durante milisegundos"), y es, además, la de menor esfuerzo de implementación porque reutiliza un mecanismo ya existente y ya probado (`api/client.ts`), en vez de crear uno nuevo. El costo es una recarga completa de página en el momento del cambio — aceptable, porque cambiar de organización es, por diseño, una acción consciente y poco frecuente (sección 3 de `GRUPO_ECONOMICO_DISENO_TECNICO.md`: "acción puntual", nunca automática).

---

## 10. `localStorage` y Axios

### Orden exacto

1. Se invoca `POST /auth/cambiar-organizacion` y se espera la respuesta completa, sin tocar `localStorage` todavía — si falla, no se modifica nada (ver "estado inconsistente" más abajo).
2. Recién con la respuesta exitosa en mano: se sobreescribe `localStorage.setItem("token", ...)` y `localStorage.setItem("usuario", ...)` con los valores nuevos, en ese orden, antes de cualquier otra acción.
3. Se ejecuta la recarga completa (Alternativa A, sección 9) — por ejemplo, `window.location.href = "/"`.

### Por qué no hace falta actualizar el header de Axios "en caliente"

Porque el paso 3 recarga la página — el interceptor de request de `api/client.ts` (que ya lee `localStorage.getItem("token")` en cada request, sin cambios) va a leer el token nuevo naturalmente en cuanto la aplicación vuelva a arrancar. No se necesita ninguna actualización manual del cliente Axios en memoria.

### Requests en curso al momento del cambio

Cualquier pedido ya en vuelo antes de la recarga se resuelve contra el token con el que fue emitido (el anterior, todavía válido) o se cancela por el propio descarte de la página al navegar — comportamiento estándar del navegador, ya presente hoy cada vez que un usuario navega mientras un pedido está en curso; no se necesita ningún manejo especial nuevo.

### Dos pestañas abiertas y el evento `storage`

Riesgo real, explícitamente pedido: si la Pestaña 1 cambia de organización y recarga, la Pestaña 2 sigue mostrando la organización anterior con su propio token, todavía válido — no es un problema de seguridad (cada pestaña opera, en todo momento, dentro de una organización para la que su propio token está legítimamente autorizado), pero es una fuente real de confusión de UX.

**Recomendación**: agregar un listener del evento nativo `storage` (se dispara automáticamente en las **demás** pestañas cuando una cambia `localStorage`, nunca en la que hizo el cambio) en el punto de entrada de `AuthContext`, que, al detectar que `token` o `usuario` cambiaron, dispare la misma recarga completa (paso 3) en esa pestaña pasiva también — llevándola a converger con la organización activa más reciente. Reutiliza el mismo mecanismo de recarga ya elegido en la sección 9, sin ningún componente nuevo.

### Estado inconsistente

No existe, por construcción: mientras la respuesta de `cambiar-organizacion` no haya sido exitosa, ni el token ni el usuario guardados se tocan — el "todo o nada" ya está garantizado por el orden de los pasos 1-2, no hace falta ningún mecanismo adicional de "cerrar sesión si algo quedó a medias". Si después de la recarga el token nuevo resultara, por cualquier motivo, inválido, el interceptor de `401` ya existente en `api/client.ts` se hace cargo exactamente igual que hoy.

**No se incorpora ninguna librería de cache nueva** — confirmado, ninguna de las recomendaciones de esta sección la necesita.

---

## 11. Experiencia de usuario

- **Organización activa siempre visible**: en el mismo lugar donde hoy vive el nombre/rol del usuario en `Layout.tsx` (el pie de la barra lateral) — de forma permanente, no solo como un aviso puntual al cambiar, para que sea un ancla visual constante (mitiga directamente el riesgo de "creer estar en Empresa A cuando ya se cambió a B").
- **Advertencia antes de cambiar**: reutilizando el patrón de confirmación ya incorporado al proyecto para acciones críticas (commit `971f09c`, "add confirmations and prevent double submit on critical actions") — no un `window.confirm()` nativo (que además está explícitamente desaconsejado en este proyecto por las reglas de automatización de navegador, aunque acá aplica al usuario final, no a un agente), sino el mismo componente de confirmación ya usado en otras acciones críticas del sistema.
- **Confirmación visual después del cambio**: dado que la Alternativa A (sección 9) recarga la página, la propia barra lateral ya recargada, mostrando el nombre de la nueva organización, cumple ese rol — no se necesita, además, un toast separado, aunque podría agregarse como mejora menor sin impacto de diseño.
- **Formularios sin guardar**: punto real, señalado explícitamente por el pedido, **que este diseño no puede resolver sin verificar antes si existe hoy algún mecanismo de aviso de cambios sin guardar (`beforeunload` o equivalente) en alguna pantalla del sistema** — no se encontró evidencia de uno durante esta investigación, y confirmarlo con certeza exige revisar cada pantalla con formularios largos, fuera del alcance de este documento. Se dejar registrado como punto a verificar antes de implementar el control de cambio de organización en 10.4 (sección 16).
- **Pantalla posterior**: Dashboard (`/`), igual que después de un login (sección 9).

---

## 12. Modelo de datos y migración

### `AccesoGrupoEconomico` — campos, relaciones, índices, restricciones

- **Campos**: `id` (identificador propio), `usuarioId` (obligatorio), `organizacionId` (obligatorio — la organización destino), `otorgadoPorId` (obligatorio), `createdAt`.
- **Relaciones**: `usuarioId` → `Usuario.id` (`onDelete: Restrict`); `organizacionId` → `Organizacion.id` (`onDelete: Restrict`); `otorgadoPorId` → `Usuario.id` (`onDelete: Restrict`) — dos relaciones distintas hacia `Usuario`, con nombres de relación distintos (`@relation("AccesoOtorgado")` y `@relation("AccesoOtorgadoPor")`, orientativo, sin escribir código todavía).
- **Índices**: `@@index([usuarioId])`, `@@index([organizacionId])` — mismo criterio que cualquier FK del schema.
- **Restricción de unicidad**: `@@unique([usuarioId, organizacionId])` (sección 1).
- **Nulabilidad**: ningún campo opcional — un acceso sin alguno de los tres no representa nada válido.

### Distinción de cambios

| Cambio | Clasificación |
|---|---|
| `AccesoGrupoEconomico` (tabla nueva) | **Indispensable** |
| Cualquier campo nuevo en `Usuario` u `Organizacion` | **No aplica — ninguno de los dos se modifica** |
| Campo `activo` en `Organizacion` | **Futuro** — solo si el negocio confirma la necesidad de suspender organizaciones completas (hallazgo de la sección 3) |
| Cualquier cambio al JWT | **No aplica — el JWT no cambia de forma** (sección 3) |

### Migración

Puramente aditiva — una tabla nueva, cero columnas nuevas en tablas existentes, cero backfill (no hay datos previos que migrar, mismo patrón que 10.1 y 10.2).

### Habilitar los tres usuarios reales, sin asumir identidades ni permisos

Ninguna migración crea ningún `AccesoGrupoEconomico` automáticamente, ni siquiera en desarrollo — se otorgan, uno por uno, a través del endpoint de alta (sección 5), recién cuando exista la instrucción explícita con las identidades reales confirmadas (mismo criterio ya aplicado en 10.1 para el Grupo Económico real y en 10.2 para las identidades reales de chofer: "no se creó ningún dato real... queda pendiente de una instrucción explícita posterior").

---

## 13. Seguridad y prueba de fuga

Pruebas específicas a ejecutar antes de cerrar este sub-bloque:

- Un usuario sin `AccesoGrupoEconomico` intenta cambiar de organización → `403`, sin token nuevo emitido.
- Un usuario con acceso a la Organización B intenta cambiar a la Organización C, de un Grupo Económico distinto → `403`.
- El `ADMINISTRADOR` de la Organización A intenta otorgar acceso a un usuario para la Organización B (sin ser `ADMINISTRADOR` de B) → `403`.
- Se revoca un acceso ya otorgado → el siguiente intento de cambio a esa organización falla; el token ya emitido antes de la revocación sigue funcionando hasta su expiración (comportamiento esperado, sección 4, no un bug).
- Token manipulado (payload alterado a mano) → rechazado por la firma, igual que hoy, sin ningún cambio en `JwtStrategy`.
- Token viejo (organización a la que ya no se tiene acceso, revocado) reutilizado dentro de su ventana de 12h → sigue funcionando para esa organización (riesgo ya aceptado, sección 4) — la prueba confirma que el comportamiento es el esperado, no que sea un hallazgo.
- Organización inactiva → no aplica (hallazgo de la sección 3).
- Usuario inactivo intenta cambiar de organización → `403`.
- Cambio de rol del usuario mientras tiene un token vigente → el token conserva el rol viejo hasta expirar (riesgo ya aceptado, sin cambios).
- Cambio repetido A→B→A → cada cambio se audita por separado (sección 8), el resultado final dentro de A funciona exactamente igual que si nunca se hubiera ido.
- Dos pestañas abiertas, una cambia de organización → la otra debe converger al recargar (mecanismo de la sección 10) o, si eso no se implementó todavía, al menos no debe poder mezclar datos de ambas organizaciones dentro de la misma pestaña.
- Requests en curso al momento del cambio → se resuelven contra el token con el que fueron emitidos, nunca contra una mezcla de ambos contextos.
- Acceso directo por URL a una organización sin autorización (manipulando el body del request de cambio de organización a mano, sin pasar por la interfaz) → `403`, mismo resultado que a través de la interfaz — la protección es siempre server-side, nunca solo de interfaz.
- Datos cargados antes del cambio → no deben sobrevivir la recarga (Alternativa A, sección 9).
- **La prueba más importante, tal como la exige el pedido**: después del cambio A→B, ningún dato de A debe quedar visible, accesible, ni mezclado en B — ni en pantalla, ni en ninguna consulta al backend, ni en ningún estado de `localStorage` que no se haya reemplazado.

---

## 14. Regresión obligatoria

Login; JWT (forma y validación sin cambios); `RolesGuard` (para cualquier rol, en cualquier organización activa); Perfil; Mi Organización; Usuarios; Auditoría; Viajes; Facturas; Cobranzas; Liquidaciones; Centro de Inteligencia; Grupo Económico 10.1 (crear/asociar/desasociar); Identidad de Chofer 10.2 (crear/vincular/desvincular, incluida la protección de concurrencia ya verificada). Ninguno de estos módulos debería mostrar ninguna diferencia de comportamiento para una organización sin ningún `AccesoGrupoEconomico` asociado — que es, hoy, el caso de todas las organizaciones reales.

---

## 15. Secuencia de implementación

División en dos sub-etapas dentro de Bloque 10.3, con un punto de control intermedio verificable entre ellas — el frontend (secciones 9-11) queda, sin ambigüedad, fuera de ambas (es Bloque 10.4, ya planificado así):

### Etapa 10.3.a — Modelo y administración de accesos

**Objetivo:** que exista `AccesoGrupoEconomico` y se pueda otorgar/revocar/consultar, sin tocar todavía el flujo de autenticación ni emitir ningún token nuevo.

**Archivos:** `schema.prisma` (tabla nueva); extensión de `backend/src/grupo-economico/` con los tres endpoints de administración de accesos (sección 5, primeras tres filas).

**Migración:** sí, puramente aditiva (sección 12).

**Riesgos:** bajos — no hay ningún camino todavía por el que un `AccesoGrupoEconomico` otorgado tenga efecto real sobre ninguna sesión.

**Pruebas:** otorgar/revocar/consultar con los usuarios reales de desarrollo; unicidad del par usuario/organización; solo el `ADMINISTRADOR` de la organización destino puede otorgar/revocar (Decisión Técnica 2); regresión de 10.1/10.2 sin cambios.

**Rollback:** revocar los accesos otorgados, o eliminar la tabla — ningún dato operativo se ve afectado, ninguna sesión existente cambia de comportamiento.

**Criterio de cierre:** existen accesos reales otorgados y revocados correctamente en desarrollo, verificables por consulta, sin que ningún usuario haya podido todavía cambiar de organización activa con ellos.

### Etapa 10.3.b — Cambio de organización activa

**Objetivo:** que un usuario con `AccesoGrupoEconomico` vigente pueda efectivamente cambiar su organización activa y operar con el nuevo token.

**Archivos:** guard nuevo de Grupo Económico; endpoint `POST /auth/cambiar-organizacion` (`AuthController` o módulo dedicado); ningún cambio a `schema.prisma`.

**Migración:** ninguna — reutiliza la tabla ya creada en 10.3.a.

**Riesgos:** el más sensible de seguridad de todo el Bloque 10.3 — mitigado por construirse recién sobre 10.3.a ya validado, por el guard separado de `RolesGuard` (sección 7), y por la batería completa de pruebas de fuga de la sección 13 antes de cerrar.

**Pruebas:** todas las de la sección 13 relacionadas con el cambio de organización en sí.

**Rollback:** deshabilitar el endpoint (o revertir el commit) — ningún token ya emitido queda incompatible, porque el JWT no cambió de forma (sección 3); los accesos otorgados en 10.3.a siguen intactos para cuando se reintente.

**Criterio de cierre:** los usuarios administrativos ya aprobados (Decisión 3 de negocio) cambian de organización activa correctamente y operan la organización destino con su rol de siempre; ningún otro usuario puede; la prueba de fuga cruzada completa (sección 13) pasa; cada cambio y cada intento denegado queda en `AuditLog`.

**Dependencia:** 10.3.a debe estar cerrado antes de empezar 10.3.b — mismo criterio de puntos intermedios verificables que ya usó Bloque 10 completo entre sus seis sub-bloques.

---

## 16. Decisiones técnicas pendientes

Ninguna reabre una decisión ya aprobada (funcional o técnica). Quedan para confirmar antes o durante la implementación:

1. **Nombre exacto y ubicación del endpoint de cambio de organización** — se propuso `POST /auth/cambiar-organizacion` dentro de `AuthController`, o un módulo nuevo y chico dedicado a sesión — sin impacto de diseño, se resuelve en implementación.
2. **El rol funcional del usuario es único, no varía por Organización** (sección 2) — es una recomendación de diseño justificada contra el código y las Decisiones Técnicas ya aprobadas, no una decisión de negocio explícitamente confirmada hasta ahora. Se deja registrada la consecuencia (una persona opera la organización adicional con el mismo rol que tiene en la suya) para que quede a la vista antes de implementar, aunque no bloquea el diseño.
3. **"Organización destino activa" no tiene, hoy, ningún campo contra el cual validarse** (sección 3) — se recomendó tratarlo como "la organización existe" para esta primera versión; confirmar que no hace falta, en este mismo sub-bloque, adelantar un campo `Organizacion.activo` que hoy no existe en ningún lado del sistema.
4. **Si existe algún mecanismo de aviso de cambios sin guardar (`beforeunload` o equivalente) en alguna pantalla del sistema hoy** (sección 11) — no se pudo confirmar con certeza en esta investigación; verificar antes de implementar el control de cambio de organización en el frontend (Bloque 10.4), no bloqueante para 10.3 (que es exclusivamente backend).
5. **Motivo obligatorio u opcional al revocar un `AccesoGrupoEconomico`** (sección 8) — no fue exigido por ninguna Decisión Técnica ya aprobada; queda como detalle menor de implementación.

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo commit ni push, no se abrió implementación, no se alteró SDC v1.0.0 ni su tag. Este es el único documento generado. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier implementación.

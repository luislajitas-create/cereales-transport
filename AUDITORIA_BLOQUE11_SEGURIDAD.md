# Auditoría — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-23. Documento de auditoría, aprobado para su apertura por `PLAN_PROXIMA_ETAPA.md`. **No implementa, no modifica código, no modifica documentación existente, no hace refactors, no hace `git add`/`commit`/`push`.** Verifica, contra el estado real del código (no contra lo que dicen los documentos), el alcance de los 8 ítems que `PLAN_PROXIMA_ETAPA.md` (sección 7) propuso para este bloque.

**Método:** cada ítem se contrastó contra cuatro fuentes independientes — el texto original que lo documentó (`docs/roadmap/ROADMAP_PRODUCTO_SDC.md` §3, `docs/deuda-tecnica/DEUDA_TECNICA.md` sección A, `docs/cierres/ACTA_CIERRE_BLOQUE8.md` §6, `docs/cierres/ACTA_CIERRE_BLOQUE9.md` §6), el código real del backend (`backend/src`), el schema real (`backend/prisma/schema.prisma`), y — donde corresponde — el código real del frontend (`frontend/src`), para confirmar si cada consumidor relevante existe o no. No se ejecutó la aplicación; toda la evidencia es lectura de código, no observación de comportamiento en runtime. Donde esa limitación importa para la conclusión, se señala explícitamente.

---

## 1. Alcance auditado

Los 8 ítems que `PLAN_PROXIMA_ETAPA.md` propuso para Bloque 11, heredados de dos fuentes que nunca se habían consolidado contra el código real hasta ahora:

**Del roadmap original (`ROADMAP_PRODUCTO_SDC.md` §3, alcance del "Bloque 10" nunca ejecutado):**
1. 3 endpoints que devuelven `200` vacío en vez de `404` ante acceso cruzado.
2. Acceso runtime a `$queryRaw*`/`$executeRaw*` protegido solo a nivel de tipos.
3. Guardia de escritura anidada (`create`/`createMany`) incompleto.
4. Red de seguridad automática para `ORGANIZACIONAL_MODELS` (hoy lista manual).

**De `DEUDA_TECNICA.md`, sección A (Seguridad):**
5. `JWT_SECRET` con fallback hardcodeado.
6. CORS wildcard como fallback.
7. Sin rate-limiting en `POST /auth/login`.
8. `ClientesController.cuentaCorriente()` no excluye facturas `ANULADO`.

---

## 2. Exclusiones (confirmadas por esta auditoría, no solo heredadas)

- **Ítems 5 y 6 (`JWT_SECRET`, CORS) — ya resueltos, se excluyen del alcance de Bloque 11.** Ver hallazgo H-05/H-06 en la sección 3: ambos fueron corregidos durante Bloque 8.1.a, antes de que `DEUDA_TECNICA.md` (fechado 2026-07-11, previo al cierre de Bloque 8) pudiera reflejarlo. El documento de deuda técnica quedó desactualizado en este punto — no el código.
- **RBAC visual del frontend** (sidebar/formularios que no reflejan permisos por rol, `DEUDA_TECNICA.md` sección E) — no forma parte del alcance original de Bloque 10/11 en ningún documento rector; es un hallazgo de UX, no de seguridad de backend. Queda fuera.
- **Alta de organización por autoservicio, proveedor real de email, política de bloqueo por intentos fallidos como capacidad de negocio configurable** — son capacidades nuevas (Bloque 12 propuesto), no endurecimiento de lo existente. El ítem 7 (rate-limiting en login) se mantiene en Bloque 11 porque es una corrección técnica acotada, no una capacidad de producto nueva — pero cualquier política de bloqueo de cuenta configurable por organización queda fuera.
- **`NotificadorService` sin proveedor real** (riesgo remanente de Bloque 9) — decisión de costo/proveedor, no de arquitectura de seguridad. Fuera de alcance.
- **`PROCESANDO` sin recuperación manual en Pago Consolidado** (riesgo remanente de Bloque 10.5/10.6) — deuda propia de ese módulo, ya documentada y diferida por decisión explícita en su propio cierre. No es endurecimiento transversal de seguridad. Fuera de alcance.
- **Deuda de modelo de datos, arquitectura y frontend no listada en los 8 ítems** (montos en `Float`, enums duplicados, falta de tests, paginación, etc.) — real, pero no es lo que `PLAN_PROXIMA_ETAPA.md` autorizó para este bloque. Fuera de alcance.

---

## 3. Inventario exacto de hallazgos

### H-01 — Tres endpoints devuelven `200` vacío en vez de `404` ante acceso cruzado
**Estado: PENDIENTE, confirmado contra el código real.**

`backend/src/catalogos/clientes.controller.ts:33`, `transportistas.controller.ts:29`, `choferes.controller.ts:31` — los tres `findOne(@Param("id") id) { return this.prisma.X.findUnique({ where: { id } }); }` devuelven el resultado de Prisma tal cual, sin `if (!resultado) throw new NotFoundException(...)`. Cuando el `id` pertenece a otra organización, la extensión de aislamiento (`organizacion-prisma.client.ts`, método `findUnique`) ya devuelve `null` correctamente — el problema es exclusivamente que NestJS serializa ese `null` como `200` con cuerpo vacío, no como `404`. Idéntico exactamente al hallazgo original de `ACTA_CIERRE_BLOQUE8.md` §6, sin ningún cambio desde entonces.

**No hay fuga de datos** — confirmado de nuevo: la extensión ya filtra por `organizacionId` antes de que el controller vea el resultado. Es un defecto de código de estado HTTP, no de aislamiento.

**Verificación de contrato adicional (no incluida en la auditoría original de Bloque 8):** se revisó el frontend completo (`frontend/src`) y **ningún archivo llama a `GET /clientes/:id`, `GET /transportistas/:id` ni `GET /choferes/:id`** — las tres pantallas (`Clientes.tsx`, `Transportistas.tsx`) operan exclusivamente sobre el listado (`GET /clientes`) y sobre `PATCH`/`DELETE` directos por id, nunca sobre un `GET` individual. **Esto reduce el riesgo de contrato de esta corrección a prácticamente cero** — no hay ningún consumidor real hoy que dependa del `200` vacío actual.

**Debida diligencia adicional de esta auditoría:** se buscaron en todo `backend/src` otros `return this.prisma.X.findUnique(...)` sin verificación (mismo patrón sintáctico) para confirmar que el hallazgo de Bloque 8 sigue siendo exhaustivo. Se encontraron 9 casos adicionales (`administracion/organizacion.controller.ts`, `administracion/perfil.controller.ts`, `grupo-economico/grupo-economico.controller.ts` ×3, `grupo-economico/identidad-chofer.controller.ts` ×2, `grupo-economico/acceso-grupo.controller.ts`) — todos revisados individualmente y **ninguno pertenece a la misma clase de defecto**: en `organizacion.controller.ts`/`perfil.controller.ts` el `id` sale siempre de `actor.organizacionId`/`actor.id` (derivado del JWT, nunca de la URL), así que no existe la noción de "id ajeno"; en los de `grupo-economico`, el `findUnique` bare-return es siempre un re-fetch final de una entidad ya validada o recién creada/actualizada dentro del mismo handler (el `404` correspondiente, si aplica, ya se lanzó antes en la misma función). No se encontró ninguna cuarta instancia real del defecto de Bloque 8.

### H-02 — `$queryRaw*`/`$executeRaw*` protegido solo a nivel de tipos
**Estado: PENDIENTE, confirmado contra el código real.**

`backend/src/prisma/organizacion-prisma.client.ts:206-213` — el tipo `BaseConLecturaYEscrituraFlexible` usa `Omit<..., "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe" | ...>` para ocultar estos cuatro métodos del tipo público `OrganizacionPrismaClient`. Pero la extensión (`crearClienteOrganizacional`, líneas 50-172) **no define ningún hook `query` para estos cuatro métodos** — Prisma Client Extensions (`$extends`) no elimina métodos del objeto en runtime, solo permite interceptarlos si se los declara explícitamente. Como no están declarados, siguen existiendo, sin ninguna restricción de organización, en el objeto real que NestJS inyecta — el único obstáculo para invocarlos es el compilador de TypeScript (`(this.prisma as any).$queryRawUnsafe(...)` los expone de nuevo en runtime sin ningún error).

Confirmado además que los 7 métodos de escritura (`create`/`update`/etc.) del propio `OrganizacionPrismaClient` ya están tipados como `(args: any) => Promise<any>` por diseño (comentario explícito en el archivo) — es decir, el tipo público de este cliente ya renuncia a estrictez en varios puntos, lo que hace más plausible, no menos, que un `as any` puntual en un controller nuevo pase una revisión de código sin llamar la atención.

**Nota de diseño ya resuelta correctamente y fuera de este hallazgo:** el cliente de transacción (`tx`, usado en `facturas.controller.ts` para `SELECT ... FOR UPDATE`) expone `$queryRaw` (no `$queryRawUnsafe`) de forma deliberada y documentada — no es parte de este hallazgo, es la única excepción ya evaluada y aceptada.

### H-03 — Guardia de escritura anidada incompleto
**Estado: PENDIENTE PARCIAL, con un caso real concreto — requiere verificación adicional antes de Diseño.**

`backend/src/prisma/organizacion-prisma.client.ts:28` — `CLAVES_ESCRITURA_ANIDADA = ["connect", "connectOrCreate", "disconnect", "set"]`. El guardia (`asegurarSinEscrituraAnidada`) revisa estas 4 claves y **lanza una excepción** (falla segura) si aparecen en los datos de `create`/`createMany`/`update`/`upsert` sobre un modelo organizacional — pero **no incluye `create` como clave anidada**, es decir, no detecta un `create` anidado dentro de otro `create`.

**Caso real encontrado, único en todo el backend** (`backend/src/catalogos/clientes.controller.ts:41`): `ClientesController.create()` hace `data: { ...data, contactos: contactos ? { create: contactos } : undefined }` — un `create` anidado de `Contacto` (modelo organizacional) dentro del `create` de `Cliente`. El guardia no lo bloquea (no está en la lista), y la extensión de Prisma no intercepta escrituras anidadas (confirmado por el propio comentario del archivo, líneas 10-14) — así que ese `create` de `Contacto` no pasa por el hook que inyecta `organizacionId`.

**Punto que esta auditoría no pudo confirmar por lectura de código, solo por inferencia de schema:** `Contacto` se relaciona con `Cliente` mediante una **clave foránea compuesta** (`schema.prisma:300`, `@relation(fields: [clienteId, organizacionId], references: [id, organizacionId])`) — el mismo patrón de endurecimiento que Bloque 8.1 documentó explícitamente para varias relaciones organizacionales. Es plausible, por semántica estándar de Prisma sobre relaciones compuestas, que el motor resuelva `Contacto.organizacionId` automáticamente a partir del `Cliente` recién creado (que sí tiene `organizacionId` correcto, inyectado por el guardia en el nivel superior), sin depender del `contactos.create` explícito — lo que dejaría este caso concreto mitigado por diseño de schema, no por el guardia. **Esto no está verificado empíricamente** (no se ejecutó la aplicación); no puede darse por seguro ni por inseguro sin una prueba real. Es la pieza de este hallazgo que más necesita resolución antes de pasar a Diseño.

**Alcance de la revisión:** se confirmó, por búsqueda exhaustiva en `backend/src`, que este es el **único** uso de `create`/`connect`/`connectOrCreate` anidado en todo el backend — no hay una segunda instancia del mismo patrón en ningún otro controller.

### H-04 — Sin red de seguridad automática para `ORGANIZACIONAL_MODELS`
**Estado: PENDIENTE, confirmado.**

`backend/src/prisma/organizacional-models.ts` — lista manual de 21 strings (no 20 como decía la documentación de Bloque 8; el número creció con `PasswordResetToken` e `InvitacionUsuario` de Bloque 9, correctamente agregados). No existe ningún mecanismo (test automatizado, chequeo en build, o similar) que compare esta lista contra los modelos reales de `schema.prisma` y falle si un modelo nuevo con `organizacionId` queda afuera. La disciplina de mantenerla actualizada es hoy 100% manual y depende de que quien agregue un modelo nuevo recuerde hacerlo — confirmado que, hasta ahora, esa disciplina se sostuvo (Bloque 9 y Bloque 10 la actualizaron correctamente), pero no hay ninguna verificación automática que lo garantice hacia adelante.

### H-05 — `JWT_SECRET` con fallback hardcodeado
**Estado: YA RESUELTO — excluir del alcance de Bloque 11.**

`backend/src/config/env-validation.ts` (función `validarEntorno`, invocada en `main.ts:7` antes de importar `AppModule`) — falla el arranque (`process.exit(1)`) si `JWT_SECRET` no está definida, si coincide con alguno de los dos valores inseguros conocidos (`"dev-secret-change-me"`, `"cambiar-este-secreto-en-produccion"`), o si tiene menos de 16 caracteres. `auth.module.ts` y `jwt.strategy.ts` leen `process.env.JWT_SECRET` directamente, sin ningún fallback en el código. El propio comentario del archivo (línea 3) documenta que esto se resolvió en **Bloque 8.1.a** — antes de que `DEUDA_TECNICA.md` (2026-07-11) se escribiera, pero el documento nunca se actualizó para reflejarlo porque Bloque 8 cerró el 2026-07-13, después de la última actualización de esa tabla.

### H-06 — CORS wildcard como fallback
**Estado: YA RESUELTO — excluir del alcance de Bloque 11.**

Mismo mecanismo que H-05, misma función `validarEntorno()`: falla el arranque si `CORS_ORIGIN` no está definida. `main.ts:16` usa `app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true })` sin ningún `|| "*"` en el código. Resuelto también en Bloque 8.1.a.

### H-07 — Sin rate-limiting en `POST /auth/login`
**Estado: PENDIENTE, confirmado.**

`backend/src/auth/auth.controller.ts:18-21` — `@Post("login") login(@Body() dto: LoginDto) { return this.authService.login(...); }`, sin ningún guard ni decorador de límite de tasa. Confirmado en `backend/package.json`: no existe `@nestjs/throttler` ni ninguna librería equivalente entre las dependencias. Búsqueda adicional en todo `backend/src` de cualquier mecanismo de bloqueo por intentos fallidos (campo tipo `intentosFallidos`, `bloqueado`, etc.): ninguno existe. Coincide exactamente con el riesgo remanente ya señalado explícitamente en `ACTA_CIERRE_BLOQUE9.md` §6 ("sin política de bloqueo por intentos fallidos de login... no formaba parte del alcance aprobado").

### H-08 — `cuentaCorriente()` no excluye facturas `ANULADO`
**Estado: PENDIENTE, confirmado.**

`backend/src/catalogos/clientes.controller.ts:152-173` — `cuentaCorriente()` consulta `this.prisma.factura.findMany({ where: { clienteId: id }, include: { cobranzas: { where: { anulada: false } } } })`, sin ningún filtro sobre `Factura.estado`. `EstadoFacturaEnum` (`schema.prisma:69-74`) incluye el valor `ANULADO`. El filtro sí excluye cobranzas anuladas (`anulada: false`), pero no excluye facturas en estado `ANULADO` del cálculo de `debe` — cada factura anulada sigue sumando su `importe` completo al saldo deudor mostrado. Confirmado sin cambios desde que se documentó por primera vez (`BLOQUE4.3_DISENO_COBRANZAS.md`).

---

## 4. Prioridad e impacto

| Hallazgo | Prioridad | Impacto | Esfuerzo estimado (sin diseñar todavía) |
|---|---|---|---|
| H-08 (`cuentaCorriente` sin excluir anulados) | **P1** | Alto — dato financiero incorrecto visible a Facturación/Gerencia, en producción hoy | S |
| H-07 (rate-limiting login) | **P1** | Alto si el sistema queda expuesto a fuerza bruta — dominio público de Railway confirmado | S |
| H-01 (3 endpoints `200`/`404`) | P2 (bajado de la evaluación original porque no hay fuga de datos, solo inconsistencia de contrato) | Bajo directo, medio indirecto (corrección de higiene de API, sin consumidor real hoy) | XS |
| H-02 (`$queryRaw*` runtime) | P1/P2 — bajo en probabilidad (requiere un `as any` deliberado o descuidado en código futuro), alto en severidad si ocurre | Alto condicional | S, una vez decidido el mecanismo |
| H-03 (guardia anidado, caso `Contacto`) | P2, pendiente de la verificación empírica señalada arriba para confirmar si ya está mitigado por schema | Medio, acotado a un único punto de código, sin evidencia de explotación | Depende del resultado de la verificación |
| H-04 (red de seguridad `ORGANIZACIONAL_MODELS`) | P2 | Medio a futuro (crece con cada modelo nuevo), bajo hoy (disciplina manual sostenida hasta ahora) | S/M (test automatizado) |
| ~~H-05~~ / ~~H-06~~ | — | — (ya resueltos) | — |

---

## 5. Dependencias

- **Ninguno de los 6 hallazgos pendientes (H-01, H-02, H-03, H-04, H-07, H-08) depende de otro para poder implementarse** — cada uno toca un archivo o una capa distinta, sin superposición de código entre sí.
- H-03 tiene una **dependencia interna de secuencia**, no de otro bloque: la verificación empírica de si el FK compuesto ya mitiga el caso `Contacto` debe resolverse **antes** de decidir el diseño de la corrección — si ya está mitigado, la corrección podría ser solo documentación; si no, requiere agregar `"create"` a `CLAVES_ESCRITURA_ANIDADA` y adaptar `ClientesController.create()` para no romper la funcionalidad de contactos.
- Ninguno depende de Bloque 12 (Alta de Organización) ni de ningún bloque futuro — todos son correcciones sobre superficie ya existente y cerrada.
- H-07 (rate-limiting) es funcionalmente independiente pero **relacionado en intención** con el riesgo ya señalado en el cierre de Bloque 9 (bloqueo por intentos fallidos) — no son el mismo mecanismo (uno es límite de tasa por IP/tiempo, el otro sería bloqueo de cuenta por intentos), y esta auditoría no asume que deban resolverse juntos; queda como pregunta abierta (sección 8).

---

## 6. Riesgos

### 6.1 Riesgo técnico
- H-03 es el único hallazgo con riesgo técnico de introducir una regresión si se corrige sin verificar primero el comportamiento real del FK compuesto — agregar `"create"` a la lista de claves bloqueadas sin más rompería `ClientesController.create()` con contactos (pasaría de funcionar silenciosamente a lanzar una excepción en cada alta de cliente con contactos), incluso si el frontend hoy no ejercita ese campo.
- H-02, si se implementa quitando literalmente los métodos del objeto en runtime (no solo del tipo), debe preservar el comportamiento ya vigente y correcto de `tx.$queryRaw` en `facturas.controller.ts` — un error de alcance rompería las dos operaciones `SELECT ... FOR UPDATE` ya en producción.

### 6.2 Riesgo funcional
- H-08 cambia un número que usuarios reales ya ven (`saldoActual` de Cuenta Corriente) — cualquier cliente con al menos una factura `ANULADO` verá un saldo menor después de la corrección. No es un bug de la corrección, es el comportamiento correcto, pero es un cambio visible que debe comunicarse, no sorprender.
- H-01 tiene riesgo funcional prácticamente nulo, confirmado por la ausencia total de consumidores en el frontend actual.

### 6.3 Riesgo de seguridad
- H-07 es el hallazgo de mayor riesgo de seguridad puro de los seis pendientes — el sistema está confirmado expuesto en un dominio público (Railway) sin ningún límite de intentos de login, hoy.
- H-02 es de baja probabilidad pero alta severidad si se explota — requiere acceso al código (no es explotable externamente sin antes comprometer o modificar el propio backend), por lo que su riesgo real depende de la disciplina de code review a futuro, no de un atacante externo hoy.
- H-01 no tiene riesgo de seguridad real (confirmado dos veces: por Bloque 8 y por esta auditoría — cero bytes de datos ajenos se transfieren).

### 6.4 Impacto sobre producción
- Los 6 hallazgos pendientes son correcciones sobre código ya desplegado; ninguno requiere una migración de schema **excepto potencialmente H-03**, si la resolución de diseño decidiera modelar la excepción de forma distinta (no se puede afirmar todavía, es una decisión de Diseño).
- H-08 cambia datos calculados en tiempo de consulta (no datos almacenados) — no requiere backfill ni migración, el cambio es inmediato al desplegar.
- H-07 agrega una dependencia nueva (`@nestjs/throttler` u otra) al `package.json` del backend — bajo impacto de producción, pero es la única corrección de las seis que introduce una librería nueva.
- Ninguno de los 6 hallazgos, tal como están hoy, compromete la exactitud de los datos financieros ya validados por Bloques 3-4 — H-08 es la única excepción parcial, y es justamente lo que la corrección busca arreglar, no algo que la corrección arriesgue.

---

## 7. Alcance mínimo necesario (constatación, no propuesta de diseño)

Esta auditoría no propone soluciones ni decide diseño (fuera de su mandato). Constata, sí, que de los 6 hallazgos pendientes, **cinco (H-01, H-02, H-04, H-07, H-08) son correcciones acotadas, de bajo esfuerzo relativo, sin decisiones de negocio pendientes** — la única pieza que requiere una decisión antes de poder dimensionar su esfuerzo real es H-03, por la verificación empírica señalada en la sección 3.

---

## 8. Preguntas que requieren decisión del Product Owner

1. **H-03 — antes de diseñar nada:** ¿autoriza que la etapa de Diseño incluya una verificación empírica puntual (crear un Cliente con contactos vía HTTP real, en desarrollo, y confirmar en la base si el `Contacto` resultante quedó con el `organizacionId` correcto) para saber si este caso ya está mitigado por el FK compuesto o si requiere corrección de código? Es la única forma de resolver la incertidumbre señalada sin asumir un resultado.
2. **H-01 — alcance exacto:** ¿la corrección debe limitarse a los 3 endpoints ya identificados en Bloque 8, o el Product Owner quiere que Diseño evalúe también agregar el mismo patrón de verificación (`if (!resultado) throw new NotFoundException(...)`) como regla general para cualquier `findOne` nuevo que se agregue a futuro (por ejemplo, vía un helper o un lint interno)? Esta auditoría no encontró una cuarta instancia real del defecto, pero tampoco hay ningún mecanismo que impida que se repita en un controller futuro.
3. **H-02 — mecanismo de bloqueo:** ¿prefiere que Diseño explore quitar `$queryRaw*`/`$executeRaw*` del objeto en runtime (más robusto, más invasivo) o reforzar únicamente la capa de revisión de código/lint (más simple, depende de disciplina humana)? Son dos enfoques con costo y garantías distintas — esta auditoría no elige entre ellos.
4. **H-04 — alcance de la red de seguridad:** ¿un test automatizado que compare `ORGANIZACIONAL_MODELS` contra `schema.prisma` en cada build es suficiente, o el Product Owner quiere algo más fuerte (por ejemplo, una verificación en tiempo de arranque, análoga a `validarEntorno()`)? Bloque 11 no tiene hoy ningún test automatizado como precedente en el proyecto (`DEUDA_TECNICA.md` sección D lo confirma) — esta sería la primera pieza de testing automatizado del backend si se opta por esa vía, lo cual excede el alcance típico de un ítem "menor" y vale la pena que el Product Owner lo sepa antes de aprobar el diseño.
5. **H-07 — alcance de la protección:** ¿el rate-limiting debe ser solo por IP/tiempo (más simple, no requiere cambios de schema) o el Product Owner quiere aprovechar este bloque para también resolver el riesgo remanente de Bloque 9 (bloqueo de cuenta por intentos fallidos, que si requiere schema nuevo)? Esta auditoría los mantiene como dos preguntas separadas porque son mecanismos distintos, pero señala que están relacionados en intención y el Product Owner podría preferir resolverlos juntos o mantenerlos separados a propósito.
6. **H-08 — comunicación del cambio:** dado que el saldo de Cuenta Corriente de clientes con facturas anuladas va a cambiar (bajar) visiblemente tras la corrección, ¿el Product Owner quiere que la etapa de Diseño incluya un paso de verificación contra los datos reales de producción (cuántos clientes tienen al menos una factura `ANULADO`, y cuánto cambia su saldo) antes de desplegar, para poder anticipar la pregunta si algún usuario la hace?

---

## 9. Resolución empírica de H-03

**Fecha:** 2026-07-23/24. Ejecutada en ambiente local de desarrollo (Postgres local + backend NestJS local, `npm run start:dev`), contra la base de desarrollo ya existente (`cereal_db`), reutilizando las organizaciones reales de desarrollo ya usadas en Bloque 8/9/10 para pruebas de aislamiento (`Organización Principal`, id `0eb8e034-3f42-453c-b17a-2d05978d46d3`, y `Organización B - Grupo Económico`, id `186f88d0-f209-4545-9d27-a3af3b1f53df`). **No se tocó producción ni ninguna base distinta de la de desarrollo en ningún momento.** No se modificó código de aplicación, schema ni migraciones — el único artefacto creado fue un script Node temporal, eliminado antes de finalizar (evidencia en la sección 9.5).

### 9.1 Precondiciones
- Postgres local en `localhost:5432`, esquema ya sincronizado (`npx prisma migrate status` → "Database schema is up to date!").
- Backend levantado con `npm run start:dev` (puerto 3000, prefijo `/api/v1`), con `DATABASE_URL`/`JWT_SECRET`/`CORS_ORIGIN` exportados en la misma sesión de shell (el arranque normal de `nest start` no carga `.env` por sí solo — solo la CLI de Prisma lo hace; esto no es parte del hallazgo, es una nota operativa para reproducir la prueba).
- Login real vía `POST /api/v1/auth/login` con `admin@demo.com` / `Demo1234!` (usuario seed, rol `ADMINISTRADOR`, organización Principal) → JWT real con `organizacionId` = Organización Principal, confirmado por decodificación del payload.

### 9.2 Payload de la prueba
`POST /api/v1/clientes`, con el JWT de Organización Principal, body:
```json
{
  "razonSocial": "H03 TEST CLIENTE 20260723",
  "cuit": "30-99999901-1",
  "contactos": [
    { "nombre": "H03 Contacto Valido", "telefono": "111-0001", "email": "h03valido@test.local" },
    { "nombre": "H03 Contacto Injection", "telefono": "111-0002", "email": "h03inject@test.local",
      "organizacionId": "186f88d0-f209-4545-9d27-a3af3b1f53df", "clienteId": "id-inventado-otra-org" }
  ]
}
```
El primer contacto es el **caso válido dentro de la misma organización**. El segundo es el **intento de usar una referencia perteneciente a otra organización**: incluye, como campos extra no declarados en `ContactoDto`, el `organizacionId` real de Organización B y un `clienteId` inventado — el máximo que un atacante podría intentar inyectar, dado que la API no expone legítimamente ningún campo de referencia cruzada en este endpoint.

### 9.3 Resultado HTTP observable
`201`-equivalente (creación exitosa), cuerpo de respuesta:
```json
{
  "id": "785c7f37-3fca-4b38-a2db-489cec31b07e",
  "organizacionId": "0eb8e034-3f42-453c-b17a-2d05978d46d3",
  "razonSocial": "H03 TEST CLIENTE 20260723",
  "contactos": [
    { "id": "c430001f-...", "organizacionId": "0eb8e034-...-46d3", "clienteId": "785c7f37-...-b07e", "nombre": "H03 Contacto Valido", ... },
    { "id": "c0e5dfda-...", "organizacionId": "0eb8e034-...-46d3", "clienteId": "785c7f37-...-b07e", "nombre": "H03 Contacto Injection", ... }
  ]
}
```
Los dos campos inyectados (`organizacionId` de Organización B, `clienteId` inventado) **no aparecen en absoluto en la respuesta** — ambos contactos quedaron con el `organizacionId` y `clienteId` reales de la operación (Organización Principal, el `Cliente` recién creado), como si la inyección nunca se hubiera enviado.

### 9.4 Resultado persistido en base de datos (consulta directa, bypaseando la app)
Verificado con una segunda consulta, usando `PrismaClient` crudo (sin la extensión de aislamiento, para leer exactamente lo que quedó en la tabla, no lo que un cliente scopeado filtraría):
```
Cliente.organizacionId === ORG_A: true
Contacto "H03 Contacto Valido": organizacionId=0eb8e034-... (ORG_A correcto), clienteId=785c7f37-... (coincide con el Cliente real)
Contacto "H03 Contacto Injection": organizacionId=0eb8e034-... (ORG_A correcto), clienteId=785c7f37-... (coincide con el Cliente real)
Contactos H03 encontrados en Organizacion B (deberia ser 0): 0
```
Coincide exactamente con la respuesta HTTP — no hay divergencia entre lo que la API devolvió y lo que quedó realmente en la base.

### 9.5 Comportamiento real del guardia organizacional
Revisado el log del backend durante la ventana de la petición: **no apareció ningún mensaje `[aislamiento]`** (el mensaje que `asegurarSinEscrituraAnidada` emite cuando bloquea una escritura anidada) ni ninguna excepción. Confirma, empíricamente y no solo por lectura de código, que el guardia **no intervino** en esta petición — el `create` anidado de `contactos` pasó completamente por fuera de su verificación, exactamente como predecía la lectura de `CLAVES_ESCRITURA_ANIDADA` (que no incluye `"create"`).

### 9.6 Efecto de las claves foráneas / restricciones compuestas del schema
La ausencia de intervención del guardia **no se tradujo en una fuga ni en un error** porque `Contacto` se relaciona con `Cliente` mediante una clave foránea **compuesta** (`schema.prisma:300`, `@relation(fields: [clienteId, organizacionId], references: [id, organizacionId])`). Al ejecutar el `create` anidado, el motor de Prisma resolvió `Contacto.organizacionId` **a partir del `Cliente` padre recién creado** (que sí tiya tenía el `organizacionId` correcto, inyectado por el guardia en el nivel superior de `Cliente.create`), no a partir de ningún valor provisto en la petición. El campo `organizacionId` inyectado manualmente en el payload de ataque fue, además, **eliminado antes de llegar al controller** por el `ValidationPipe` (`whitelist: true` en `main.ts`, combinado con `@ValidateNested`/`@Type(() => ContactoDto)` en `CreateClienteDto`) — hay, en los hechos, **dos capas independientes** que impidieron la fuga en este caso concreto: el `whitelist` de validación (defensa en profundidad, actúa primero) y el FK compuesto (mitigación estructural, actúa después, y habría bastado por sí sola aunque el whitelist no existiera).

### 9.7 Limitaciones de esta prueba (para no sobregeneralizar el resultado)
- Esta prueba confirma el comportamiento **únicamente para el caso real existente** (`Contacto` vía `ClientesController.create()`), con una relación modelada con FK compuesta. **No** prueba que cualquier `create` anidado futuro sobre cualquier otro modelo organizacional sea igual de seguro — la mitigación depende de que la relación esté modelada con FK compuesta (`(idPropio, organizacionId)`) hacia el padre, un patrón usado deliberadamente en varias relaciones del schema desde Bloque 8.1, pero no verificado acá como universal para los 21 modelos de `ORGANIZACIONAL_MODELS`.
- No se probó qué pasaría si el whitelist de validación estuviera ausente o mal configurado en un DTO futuro — la mitigación por FK compuesto sola (sección 9.6) ya habría bastado en esta prueba, pero no se aisló experimentalmente una prueba "solo FK compuesto, sin whitelist" para confirmarlo de forma independiente.
- No se probó `connectOrCreate`/`connect`/`disconnect`/`set` anidados (esos sí están cubiertos por el guardia explícito, código ya leído y no ejecutado en esta ronda porque no hay ninguna instancia real de esas claves en el backend — ver hallazgo H-03 original, sección 3).

### 9.8 Limpieza y evidencia de no persistencia de artefactos
- Los datos de prueba (`Cliente` "H03 TEST CLIENTE 20260723" y sus 2 `Contacto`) se eliminaron de la base de desarrollo (`deleteMany` + verificación posterior: 0 filas restantes) — no quedó ningún residuo, a diferencia del criterio de otros bloques (que sí documentaron y conservaron datos de prueba); acá se optó por limpiar porque es una prueba diagnóstica puntual, no una validación funcional que deba quedar como evidencia reproducible en la base.
- El script Node temporal usado para las consultas directas a la base (`backend/_tmp_h03_query.js`, `backend/_tmp_h03_verify.js`) se eliminó del disco antes de finalizar esta sesión — nunca se agregó a git (`git add`), y `git status --short` (sección "git status final" de la entrega) confirma que no aparece.
- No se modificó ningún archivo de código de aplicación, schema, migración ni configuración para lograr este resultado — la prueba se ejecutó contra el código exactamente como estaba al momento de la auditoría original.

### 9.9 Clasificación final de H-03

**MITIGADO POR SCHEMA.**

Justificación: el escenario de riesgo descrito originalmente en H-03 (un `create` anidado de un modelo organizacional, no cubierto por el guardia explícito de escrituras anidadas, resultando en un registro con `organizacionId` incorrecto o ausente) **fue reproducido empíricamente sin lograr la fuga** — en el único caso real existente en el código (`Contacto` vía `Cliente.create()`), tanto un caso válido como un intento explícito de inyección de referencia cruzada terminaron con el `organizacionId` correcto, verificado tanto en la respuesta HTTP como en una consulta directa a la base que bypasea la propia aplicación. La causa no es que el guardia lo haya bloqueado (confirmado que no intervino) sino que el diseño del schema (FK compuesta) lo resuelve de forma estructural, reforzado por el whitelist de validación como segunda capa independiente.

**No se reclasifica como "resuelto" ni se cierra el hallazgo**: la mitigación es real pero *no generalizable automáticamente* a los 21 modelos de `ORGANIZACIONAL_MODELS` sin auditar cuáles de ellos tienen relaciones con FK compuesta hacia otro modelo organizacional y cuáles no — eso queda como trabajo de la etapa de Diseño (no de esta resolución empírica, que se limitó al caso real existente).

---

## 10. Preguntas para decisión del Product Owner (tabla de decisiones)

| # | Hallazgo | Decisión requerida | Opciones posibles | Consecuencia de cada opción | Recomendación técnica (no vinculante) |
|---|---|---|---|---|---|
| 1 | H-03 | ¿Autoriza que Diseño incluya una verificación empírica puntual antes de decidir el diseño de la corrección? | (a) Sí, extender la verificación empírica a los demás modelos organizacionales con relaciones anidadas antes de diseñar; (b) No, diseñar directamente asumiendo que el patrón de FK compuesta es la mitigación estándar del proyecto | (a) Más tiempo antes de Diseño, mayor certeza sobre el alcance real del riesgo en los otros 20 modelos; (b) Diseño más rápido, pero podría dejar sin cubrir un modelo que no tenga FK compuesta hacia su padre organizacional | (a) — la resolución empírica de esta etapa (sección 9) ya demostró que la intuición de lectura de código no basta para afirmar con certeza el comportamiento; auditar (no corregir) los 21 modelos es barato comparado con el riesgo de dejar uno sin cubrir |
| 2 | H-01 | ¿El alcance de la corrección se limita a los 3 endpoints ya identificados, o se agrega una regla general para evitar que se repita en controllers futuros? | (a) Corregir solo los 3 endpoints puntuales; (b) Agregar además un mecanismo general (helper, lint, o patrón documentado) para prevenir la recurrencia | (a) Menor esfuerzo, no previene que un controller nuevo repita el mismo error; (b) Mayor esfuerzo, pero cierra la clase de defecto de forma duradera | (b) — el esfuerzo incremental es bajo (un helper `findUniqueOrNotFound` reutilizable) frente al valor de no tener que volver a auditar esto en cada bloque futuro |
| 3 | H-02 | ¿El mecanismo para bloquear `$queryRaw*`/`$executeRaw*` en runtime debe ser una eliminación real del objeto, o basta reforzar la disciplina de revisión de código? | (a) Quitar los métodos del objeto en runtime (más robusto, más invasivo, requiere cuidado de no romper `tx.$queryRaw`, ya usado legítimamente en `facturas.controller.ts`); (b) Dejarlo como está (protección de tipos) y reforzar solo la revisión de código/lint | (a) Cierra el vector por completo, incluso ante un `as any` deliberado o accidental; (b) Más simple, pero el riesgo señalado en esta auditoría (H-02) sigue exactamente igual | (a) — es la única opción que responde al hallazgo tal como está documentado; la mitigación de "solo revisión de código" ya fue, de hecho, la que dejó este hallazgo abierto desde antes de Bloque 8 |
| 4 | H-04 | ¿Qué nivel de red de seguridad automática para `ORGANIZACIONAL_MODELS` es aceptable? | (a) Test automatizado que compare la lista contra `schema.prisma` en cada build; (b) Verificación en tiempo de arranque, análoga a `validarEntorno()`; (c) Ninguna automatización, mantener la disciplina manual actual | (a) Primer test automatizado del backend — precedente nuevo para el proyecto (hoy no existe ningún test); (b) Protección en runtime de producción, no solo en desarrollo/CI; (c) Statu quo, riesgo de que un modelo nuevo quede afuera sin que nadie lo note hasta que ya esté en producción | (a) — es la opción de menor esfuerzo que además introduce el primer test automatizado del proyecto, un precedente valioso independientemente de este hallazgo puntual |
| 5 | H-07 | ¿El rate-limiting debe ser solo por IP/tiempo, o el bloque debe resolver también el bloqueo de cuenta por intentos fallidos (riesgo remanente ya señalado al cierre de Bloque 9)? | (a) Solo rate-limiting por IP/tiempo (`@nestjs/throttler`), sin cambios de schema; (b) Rate-limiting + bloqueo de cuenta por intentos fallidos (requiere campo nuevo en `Usuario`, cambio de schema); (c) Mantener como dos iniciativas separadas, resolver solo (a) en Bloque 11 | (a) Cierra el riesgo de fuerza bruta genérica rápido, sin tocar schema; (b) Cierra ambos riesgos juntos, pero mayor alcance y una migración nueva en un bloque pensado como "endurecimiento acotado"; (c) Dos bloques más chicos, más fáciles de auditar y cerrar por separado | (c) — son mecanismos distintos con esfuerzos distintos; forzarlos juntos infla el alcance de un bloque que hasta ahora es deliberadamente acotado y de bajo riesgo de ejecución |
| 6 | H-08 | ¿Se requiere verificación contra datos reales de producción antes de desplegar la corrección? | (a) Sí, contar en producción cuántos clientes tienen al menos una factura `ANULADO` y cuánto cambiaría su saldo, antes de desplegar; (b) No, desplegar directamente confiando en que la corrección es simplemente "más correcta" que el comportamiento actual | (a) Permite anticipar preguntas de usuarios reales si un saldo cambia visiblemente; mayor esfuerzo de verificación previa; (b) Más rápido, pero riesgo de que un usuario real note un cambio de saldo sin aviso previo | (a) — es una consulta de solo lectura contra producción (sin escribir nada), de bajo costo, y el propio hallazgo ya identificó que es "dato financiero visible a Facturación/Gerencia" — vale la pena saber el tamaño del impacto antes de desplegar, no después |

---

## Conclusión

De los 8 ítems que `PLAN_PROXIMA_ETAPA.md` propuso para Bloque 11, **2 ya están resueltos** (H-05, H-06 — deben excluirse formalmente del alcance) y **6 siguen genuinamente pendientes**, todos confirmados contra el código real, no asumidos contra la documentación. Ninguno de los 6 tiene una fuga de datos activa hoy. Los cinco hallazgos restantes (H-01, H-02, H-04, H-07, H-08) son correcciones acotadas, sin dependencias entre sí ni con bloques futuros, y sin necesidad de ninguna decisión de negocio previa salvo las preguntas de alcance/mecanismo de la sección 10.

**Actualización tras la resolución empírica (sección 9):** H-03 se clasificó como **MITIGADO POR SCHEMA** para el único caso real existente en el código (`Contacto` vía `ClientesController.create()`) — confirmado con una prueba real en desarrollo, no solo por lectura de código. La mitigación es genuina (FK compuesta + whitelist de validación), pero no se generalizó a los otros 20 modelos organizacionales sin auditar cuáles comparten el mismo patrón de relación — eso queda para la etapa de Diseño, no para esta resolución empírica.

Esta auditoría no propone solución para ningún hallazgo, no fija alcance final, y no fue más allá de los 8 ítems ya aprobados salvo la debida diligencia explícitamente señalada (búsqueda de instancias adicionales del mismo patrón para H-01 y H-03, necesaria para poder afirmar con evidencia que el inventario está completo).

Quedo a la espera de aprobación y de las definiciones de la tabla de decisiones (sección 10) antes de pasar a la etapa de Diseño.

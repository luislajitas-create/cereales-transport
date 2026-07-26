# Auditoría Adversarial — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. **No corrige hallazgos, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no actualiza documentación existente (salvo este documento), no hace refactors, no hace `git add`/`commit`/`push`.** Toda modificación temporal de código realizada durante esta auditoría (exclusivamente para los 6 casos de ruptura controlada de H-04, autorizados explícitamente para ese propósito) se aplicó una a la vez, se verificó, y se revirtió de inmediato con confirmación por `git diff` antes de continuar con el siguiente caso — protocolo impuesto por el Product Owner tras una interrupción durante el primer caso, documentada y resuelta antes de reanudar.

---

## 1. Principios de la auditoría

Aplicados en las cinco áreas: no se asumió que ninguna prueba "feliz" (camino esperado) demostrara seguridad — cada hallazgo de Bloque 11 se sometió a intentos deliberados de bypass, combinación de vectores y casos límite, ejecutados contra el backend real (Postgres local) o contra el código ya compilado (`dist/`), nunca simulados ni asumidos por lectura. No se corrigió ningún hallazgo encontrado. No se cambió el alcance de los 5 hallazgos auditados. Toda afirmación de este documento está respaldada por evidencia de código (cita de archivo:línea) o por salida real de ejecución (capturada textualmente en las secciones siguientes).

---

## 2. Auditoría adversarial H-08 — Cuenta corriente

| # | Hipótesis | Procedimiento | Resultado esperado | Resultado observado | Clasificación |
|---|---|---|---|---|---|
| 2.1 | Podría existir otro cálculo financiero (dashboard, aging, alertas) que no excluya `ANULADO` | Se re-ejecutó la búsqueda exhaustiva de `factura.(findMany\|aggregate\|groupBy\|count)` en todo `backend/src`, releyendo cada resultado línea por línea | Los mismos 6 puntos ya identificados en `AUDITORIA_BLOQUE11_SEGURIDAD.md`, sin ninguno nuevo | Confirmado: `dashboard.controller.ts:34` usa `estado: { in: ["FACTURADO","COBRADO_PARCIAL"] }` (excluye `ANULADO` implícitamente); `aging.service.ts:53` y `alertas.service.ts:30` pasan explícitamente `estado: { not: "ANULADO" }` al `where` de `obtenerFacturasEntrada`; los 3 restantes (`facturas.controller.ts:55,74,128`) son listados/exports que deliberadamente no filtran (mismo criterio de negocio ya documentado). Sin divergencia entre estos cálculos y `cuentaCorriente()` | **SIN HALLAZGO** |
| 2.2 | Podría ser posible registrar una cobranza sobre una factura ya `ANULADO`, generando estado inconsistente | `POST /facturas/:id/cobranzas` sobre la factura `H11-VALIDACION-001` (ya `ANULADO`) | Rechazo `400` | `{"message":"La factura está anulada","error":"Bad Request","statusCode":400}`, `saldoActual` sin cambios (`0`) tras el intento | **SIN HALLAZGO** |
| 2.3 | Podría aceptarse un importe negativo en una cobranza | `POST /facturas/:id/cobranzas` con `importe: -50000` | Rechazo `400` por validación de DTO | `{"message":["importe must be a positive number"],...}` | **SIN HALLAZGO** |
| 2.4 | Podría permitirse sobre-pagar una factura ya `COBRADO_TOTAL` | Tras dos cobranzas parciales que suman exactamente el importe de `H11-ADV-002` (150000 + 90000 = 240000, estado `COBRADO_TOTAL`), se intentó una tercera cobranza de `$1` | Rechazo `400` | `{"message":"El importe supera el saldo pendiente de la factura: saldo actual 0, intentado 1.",...}` | **SIN HALLAZGO** |
| 2.5 | El saldo final podría no reconciliar con la suma de movimientos (duplicación/exclusión incorrecta) | Reconstrucción completa: `factura FACTURADO 240000` + `2 cobranzas (150000+90000)` → verificar `saldoActual` contra suma manual | `saldoActual = 240000 - 150000 - 90000 = 0` | Confirmado: `{"saldoActual":0}`, y cada movimiento intermedio (`saldo` acumulado) también reconcilia aritméticamente (`240000 → 90000 → 0`, ver detalle en 2.6) | **SIN HALLAZGO** en el total; ver 2.6 para una divergencia de **presentación** detectada |
| 2.6 | El orden de movimientos podría mostrar estados intermedios engañosos si una cobranza tiene fecha anterior a la de su factura | Se registraron 2 cobranzas con `fecha` **anterior** a la `fecha` de la factura que las origina (factura `2026-07-24`, cobranzas `2026-07-20` y `2026-07-22`) | El detalle de movimientos debería, como mínimo, no mostrar un saldo negativo antes de que aparezca la factura que lo origina | El array `movimientos` quedó ordenado estrictamente por `fecha` (`raw.sort` en `clientes.controller.ts:171`, código preexistente, **no modificado por H-08**): las 2 cobranzas (fechadas antes) aparecen **antes** que la factura, mostrando `saldo: -150000` y `saldo: -240000` como pasos intermedios, antes de que la factura (que llega al final, `debe: 240000`) devuelva el saldo a `0`. El total final (`saldoActual: 0`) es correcto; el detalle de movimientos, leído en orden, es engañoso (sugiere que el cliente tuvo un saldo a favor de $240.000 antes de recibir la factura) | **HALLAZGO MENOR** (ver detalle abajo) |

**Detalle del hallazgo 2.6:** `cuentaCorriente()` (`clientes.controller.ts:154-178`) ordena el array combinado de facturas y cobranzas exclusivamente por `fecha`, sin ninguna regla de desempate ni validación de que `Cobranza.fecha >= Factura.fecha`. `RegistrarCobranzaDto` no impone esa restricción (confirmado por el DTO y por la prueba 2.6 en vivo, que aceptó sin error una cobranza fechada 4 días antes que su factura). El defecto es **preexistente** — la lógica de ordenamiento no fue tocada por la corrección de H-08 (que solo agregó el filtro `estado: { not: "ANULADO" }` al `where`, confirmado por `git diff` ya citado en `REVISION_IMPLEMENTACION_BLOQUE11.md`) — por lo tanto no es una regresión de Bloque 11, pero la auditoría lo señala porque el propio alcance de esta etapa pide explícitamente verificar "diferencias entre saldo devuelto y detalle de movimientos", y esta es una diferencia real y reproducible. Impacto: solo de presentación (el total sigue siendo correcto); podría confundir a un usuario de Facturación que lea el detalle línea por línea si alguna vez se carga una cobranza con fecha retroactiva a una anterior a su factura (escenario posible aunque no típico del flujo normal, donde las cobranzas normalmente se cargan con fecha posterior o igual a la factura).

**Verificación adicional:** múltiples facturas y múltiples cobranzas — ejecutado en 2.4/2.5/2.6 con 2 facturas (una `ANULADO`, una `COBRADO_TOTAL` con 2 cobranzas) sobre el mismo cliente; sin error, sin duplicación de importes, sin fuga de datos entre facturas.

---

## 3. Auditoría adversarial H-07 — Rate limiting de login

| # | Hipótesis | Procedimiento | Resultado esperado | Resultado observado | Clasificación |
|---|---|---|---|---|---|
| 3.1 | Variación de email (mayúsculas, espacios) podría resetear el contador | 2 requests consecutivos sin `X-Forwarded-For`, con `ADMIN@DEMO.COM` y luego `"  admin@demo.com  "` | El contador debe seguir decreciendo de forma continua (clave = IP, no email) | `Remaining: 9 → 8` (secuencia continua, sin reset) | **SIN HALLAZGO** |
| 3.2 | Payload inválido podría no contar contra el límite (bypass "gratis") | Requests con body `{}` o campos inválidos | Deben contar igual (el guard corre antes que el `ValidationPipe`) | Confirmado en múltiples pruebas: los `400` de validación decrementan `X-RateLimit-Remaining` igual que los `401` | **SIN HALLAZGO** |
| 3.3 | **`X-Forwarded-For` con un único valor falso, distinto en cada request** | 3 requests consecutivos, cada uno con un `X-Forwarded-For` distinto (`1.1.1.1`, `2.2.2.2`, `3.3.3.3`), intercalados con requests de control sin el header | Si el límite es genuinamente por IP real, un header arbitrario no debería otorgar presupuesto nuevo | **Cada IP falsa distinta devolvió `X-RateLimit-Remaining: 9` (presupuesto completamente nuevo)**, mientras los requests de control sin el header continuaron decreciendo normalmente (`8 → 7`) de forma independiente | **HALLAZGO CRÍTICO** — ver detalle abajo |
| 3.4 | La misma IP falsa repetida debería consumir su propio presupuesto correctamente (para descartar que el mecanismo esté simplemente roto) | 2 requests consecutivos con el mismo `X-Forwarded-For: 5.5.5.5` | El segundo debe mostrar `Remaining` decrementado respecto al primero | `9 → 8` — el conteo por clave funciona correctamente; el problema no es que el conteo falle, es que la clave es elegible por el atacante | Confirma el mecanismo del hallazgo 3.3, no es un hallazgo adicional |
| 3.5 | `X-Forwarded-For` con múltiples valores (formato real de cadena de proxies) podría comportarse distinto | `X-Forwarded-For: 9.9.9.9, 8.8.8.8` | — | También devolvió presupuesto nuevo (`Remaining: 9`) | Refuerza 3.3 |
| 3.6 | `X-Forwarded-For` con formato IPv6 | `X-Forwarded-For: 2001:db8::1` | Sin crash, tratado como clave válida | `Remaining: 9`, sin error de servidor | Refuerza 3.3 |
| 3.7 | `X-Forwarded-For` con texto arbitrario no-IP | `X-Forwarded-For: no-soy-una-ip` | — | También aceptado como clave nueva válida (`Remaining: 9`), sin ninguna validación de formato | Refuerza 3.3 — no hay validación alguna del valor |
| 3.8 | Ausencia de `X-Forwarded-For` | Requests sin el header | Debe usar la IP real de socket, key estable | Confirmado — continúa la secuencia del contador "real" sin crear una clave nueva | **SIN HALLAZGO** |
| 3.9 | Condición de carrera: ráfaga paralela podría permitir más de 10 aciertos sobre una misma clave | 15 requests **simultáneos** (mismo `X-Forwarded-For: 6.6.6.6`) | Exactamente 10 deberían pasar, 5 deberían recibir `429`, incluso en paralelo | **Exactamente 10× `400` y 5× `429`** | **SIN HALLAZGO** — el conteo es correcto incluso bajo concurrencia; el problema es exclusivamente la elegibilidad de la clave (3.3) |
| 3.10 | El límite podría persistir tras un reinicio del backend, o filtrarse a otros procesos | Se confirmó `6.6.6.6` bloqueado (`429`), se detuvo el proceso backend, se reinició con el mismo código, se repitió la misma clave | El contador es en memoria (`ThrottlerModule.forRoot` sin `storage` custom) — debería resetearse | Confirmado: tras el reinicio, `6.6.6.6` volvió a mostrar `Remaining: 9` | **OBSERVACIÓN** (comportamiento esperado del almacenamiento en memoria por defecto; no es un hallazgo de seguridad, pero es relevante operativamente: cada reinicio/deploy limpia todos los contadores, y si el backend llegara a escalar horizontalmente cada instancia mantendría su propio contador independiente — ninguno de los documentos de Bloque 11 reclama lo contrario, así que no es una desviación del alcance aprobado) |
| 3.11 | Otros endpoints del mismo controller podrían quedar afectados por el rate-limit de login | `GET /clientes` y `POST /auth/recuperar-contrasena` durante una ventana con `/auth/login` devolviendo `429` | Ambos deben responder normalmente | `200` en ambos casos | **SIN HALLAZGO** |
| 3.12 | El mensaje/código HTTP del `429` podría filtrar información sensible | Inspección del cuerpo y headers del `429` | Solo mensaje genérico + `Retry-After` | `{"statusCode":429,"message":"Demasiados intentos de inicio de sesión. Esperá un minuto antes de volver a intentar."}` — sin información de intentos restantes reales, sin nombres de usuario, sin distinguir si el email existe | **SIN HALLAZGO** |

### Detalle del hallazgo 3.3 (HALLAZGO CRÍTICO)

**Causa raíz:** `main.ts:22` configura `app.getHttpAdapter().getInstance().set("trust proxy", 1)`. Este valor le indica a Express (vía el módulo `proxy-addr`, usado internamente por `@nestjs/throttler` para derivar la clave de `req.ip`) que **confíe ciegamente en exactamente 1 salto de `X-Forwarded-For`**, sin validar que ese salto provenga realmente de la infraestructura de Railway — es decir, confía por **cantidad de saltos**, no por **identidad verificada del proxy**. Cualquier cliente HTTP directo (curl, un script, un navegador) puede establecer su propio header `X-Forwarded-For` con cualquier valor arbitrario; Express, configurado con `trust proxy: 1`, toma ese valor como si fuera la IP real del cliente añadida por un proxy confiable.

**Reproducción exacta (ambiente local, backend real, sin ningún proxy real interpuesto):**
```
curl -H "X-Forwarded-For: 1.1.1.1" ...   → X-RateLimit-Remaining: 9 (presupuesto nuevo)
curl -H "X-Forwarded-For: 2.2.2.2" ...   → X-RateLimit-Remaining: 9 (presupuesto nuevo)
curl -H "X-Forwarded-For: 3.3.3.3" ...   → X-RateLimit-Remaining: 9 (presupuesto nuevo)
```
Un atacante que rote el valor de `X-Forwarded-For` en cada intento (o en cada 10 intentos) obtiene, en los hechos, **intentos de login ilimitados**, anulando por completo el propósito de H-07.

**Alcance de la incertidumbre — no confirmado ni descartado por esta auditoría:** en este ambiente local no existe ningún proxy real interpuesto entre `curl` y el backend, así que el bypass reproducido aquí corresponde al escenario "el cliente llega directo al proceso Node". En producción (Railway), si el **único** camino de red hacia el backend pasa siempre por exactamente un proxy de Railway que **sobrescribe** (no solo agrega) el `X-Forwarded-For` entrante del cliente con la IP real observada, el mismo bypass podría no ser explotable de la misma forma. Esta auditoría no tiene acceso a la infraestructura de producción ni a la documentación interna de networking de Railway para confirmar ese comportamiento — es una verificación pendiente, no algo que se pueda dar por seguro leyendo el código del proyecto. Lo que sí es una afirmación firme, verificable en el propio código: **`trust proxy: 1` no valida la identidad del proxy confiable, solo cuenta saltos** — es el patrón exactamente advertido por la documentación de Express/`proxy-addr` como inseguro cuando existe cualquier camino de red hacia la aplicación que no pase por el número exacto de proxies asumido, y esta auditoría no encontró en el código ningún mecanismo adicional (allowlist de IP de proxy, validación de un secreto compartido con el borde de Railway, etc.) que mitigue ese riesgo.

**Impacto:** si es explotable en producción (pendiente de confirmar contra la infraestructura real), anula H-07 por completo — el sistema quedaría, en la práctica, sin ninguna protección de fuerza bruta contra `POST /auth/login`, exactamente el riesgo original que Bloque 11 buscaba cerrar (`AUDITORIA_BLOQUE11_SEGURIDAD.md`, H-07: "el sistema está confirmado expuesto en un dominio público (Railway) sin ningún límite de intentos de login, hoy").

---

## 4. Auditoría adversarial H-04 — Control automático de modelos organizacionales

Protocolo aplicado en los 6 casos, tras la interrupción y corrección del primero: una modificación por vez → test inmediato → documentación → reversión inmediata → `git diff` vacío confirmado → recién entonces el siguiente caso. Ningún caso dejó el árbol alterado al finalizar (confirmado individualmente 6 veces).

| # | Caso | Modificación temporal | Resultado esperado | Resultado observado | `git diff` post-reversión | Clasificación |
|---|---|---|---|---|---|---|
| 4.1 | Modelo faltante | Se eliminó `"Usuario"` de `ORGANIZACIONAL_MODELS` | Falla el test de "modelo faltante", identificando `"Usuario"` | `FAIL` — `+ Array ["Usuario"]`, exactamente en la aserción `todo modelo real con organizacionId debe estar en ORGANIZACIONAL_MODELS o en MODELOS_AISLAMIENTO_MANUAL` | Vacío (confirmado dos veces: una vez tras la interrupción del Product Owner, con recuperación validada explícitamente por el propio Product Owner, y una segunda vez al repetir el caso desde cero con el protocolo estricto) | **SIN HALLAZGO** |
| 4.2 | Modelo sobrante en `ORGANIZACIONAL_MODELS` | Se agregó `"ModeloFalsoXYZ"` (no existe en el schema) | Falla identificando `"ModeloFalsoXYZ"` | `FAIL` — `+ Array ["ModeloFalsoXYZ"]`, aserción `toda entrada de ORGANIZACIONAL_MODELS debe corresponder a un modelo real con organizacionId` | Vacío | **SIN HALLAZGO** |
| 4.3 | Duplicado dentro de `ORGANIZACIONAL_MODELS` | Se duplicó `"Usuario"` | Falla identificando el conteo de duplicados | `FAIL` — aserción `ORGANIZACIONAL_MODELS no debe tener nombres duplicados`, `Expected: 23, Received: 22` (`Set.size` colapsa el duplicado) | Vacío | **SIN HALLAZGO** (nota: Jest/ts-jest mostró el fragmento de código de un bloque `it()` adyacente en el stack trace, un artefacto de source-map, no un error del propio test — el nombre del test fallido y el mensaje siguen siendo exactos y autodescriptivos) |
| 4.4 | Eliminar una excepción deliberada | Se eliminó `"AccesoGrupoEconomico"` de `MODELOS_AISLAMIENTO_MANUAL` | Falla identificando `"AccesoGrupoEconomico"` como faltante | `FAIL` — `+ Array ["AccesoGrupoEconomico"]`, coincide exactamente con lo ya documentado empíricamente en `REVISION_IMPLEMENTACION_BLOQUE11.md` §3 | Vacío | **SIN HALLAZGO** |
| 4.5 | Agregar una excepción inexistente | Se agregó `"ExcepcionInexistenteXYZ"` a `MODELOS_AISLAMIENTO_MANUAL` | Falla identificando `"ExcepcionInexistenteXYZ"` | `FAIL` — `+ Array ["ExcepcionInexistenteXYZ"]`, aserción `toda entrada de MODELOS_AISLAMIENTO_MANUAL debe corresponder a un modelo real con organizacionId` | Vacío | **SIN HALLAZGO** |
| 4.6 | Mismo modelo en ambas listas | Se agregó `"AccesoGrupoEconomico"` también a `ORGANIZACIONAL_MODELS` (ya estaba en `MODELOS_AISLAMIENTO_MANUAL`) | Falla identificando la intersección | `FAIL` — `+ Array ["AccesoGrupoEconomico"]`, aserción `ningún modelo puede estar simultáneamente en ambas listas` | Vacío | **SIN HALLAZGO** |

**Confirmaciones adicionales:** en los 6 casos, exactamente **1 de los 10 tests** falló por vez (nunca más de uno, nunca un falso negativo en los 9 restantes) — cada caso está aislado a su propia aserción, sin efectos cruzados. Ningún caso requirió Postgres activo (los 6 se ejecutaron con `npm test -- --runInBand`, sin backend corriendo). El árbol quedó, en los 6 casos, exactamente como estaba antes de la prueba (confirmado por `git diff` sin salida, no solo sin el warning de advertencia).

**Estado H-04: SIN HALLAZGO.**

---

## 5. Auditoría adversarial H-01 — Respuestas 404 reutilizables

| # | Hipótesis | Procedimiento | Resultado esperado | Resultado observado | Clasificación |
|---|---|---|---|---|---|
| 5.1 | Llamada sin JWT | `GET /clientes/:id` sin header `Authorization` | `401`, nunca `404` | `{"message":"Unauthorized","statusCode":401}` | **SIN HALLAZGO** — 401 y 404 correctamente diferenciados |
| 5.2 | JWT malformado | `GET /clientes/:id` con `Authorization: Bearer esto.no.es.un.jwt.valido` | `401` | `{"message":"Unauthorized","statusCode":401}` | **SIN HALLAZGO** |
| 5.3 | Id vacío | `GET /clientes/` (slash final, sin id) | Debe enrutar de forma predecible, sin crash | Enruta al endpoint de **listado** (`@Get()`), no a `findOne` — comportamiento estándar de enrutamiento de Express/NestJS (un segmento vacío no matchea `:id`), no específico de la implementación de H-01 | **SIN HALLAZGO** |
| 5.4 | Id malformado (no UUID) | `GET /clientes/no-es-un-uuid-123` | `404` limpio, sin error 500 | `{"message":"Cliente no encontrado.","error":"Not Found","statusCode":404}` | **SIN HALLAZGO** |
| 5.5 | Id tipo inyección SQL | `GET /clientes/' OR '1'='1` (URL-encoded) | `404` limpio, sin ejecución de SQL arbitrario | `404`, mismo mensaje — Prisma parametriza automáticamente, el valor nunca se interpola como SQL | **SIN HALLAZGO** |
| 5.6 | Id con path traversal | `GET /clientes/../../etc/passwd` (URL-encoded) | `404` limpio | `404`, mismo mensaje | **SIN HALLAZGO** |
| 5.7 | Id extremadamente largo (10.000 caracteres) | `GET /clientes/aaaa...` (10k chars) | Sin crash, `404` o rechazo controlado | `404`, mismo mensaje, sin error de servidor | **SIN HALLAZGO** |
| 5.8 | Recurso dado de baja (soft-delete) | Se creó un cliente temporal, se dio de baja (`DELETE`, que solo marca `activo:false`), se llamó `findOne` sobre el mismo id | — | `200`, con `activo:false` visible en el cuerpo — el recurso sigue siendo accesible por id tras la baja | **OBSERVACIÓN** (ver detalle abajo — no es un defecto de H-01) |
| 5.9 | Fuga de existencia de recurso ajeno (diferenciar "existe en otra organización" de "no existe") | Comparación byte a byte del cuerpo `404` para id ajeno vs. id inexistente, en los 3 endpoints (ya ejecutado en `VALIDACION_FUNCIONAL_BLOQUE11.md` §6, re-confirmado por lectura de `encontrar-o-fallar.ts` en esta etapa) | Cuerpos idénticos, sin ningún campo adicional que distinga los dos casos | Idénticos: `{"statusCode":404,"message":"<mensaje fijo>","error":"Not Found"}` en ambos casos, sin diferencia de timing observable a nivel de contrato HTTP | **SIN HALLAZGO** |
| 5.10 | El helper podría enmascarar un error real de base de datos como `404` | Revisión de código: `encontrarOFallar(valor, mensaje)` recibe `valor` ya como el resultado *resuelto* de `await this.prisma.X.findUnique(...)` — si Prisma lanzara una excepción (timeout, violación de constraint, etc.), el `await` la propagaría **antes** de que `encontrarOFallar` llegara a ejecutarse; la función nunca ve una excepción, solo un valor ya resuelto o `null`/`undefined` | El helper solo puede activarse ante `null`/`undefined`, nunca ante una excepción real | Confirmado por construcción del código (`common/encontrar-o-fallar.ts:7-12`): la única rama de lanzamiento es `if (valor === null \|\| valor === undefined)` — no hay ningún `catch` ni supresión de errores en el helper ni en los 3 controllers que lo usan | **SIN HALLAZGO** |
| 5.11 | El helper podría alterar valores falsy legítimos (`0`, `""`, `false`) | Ya cubierto por `encontrar-o-fallar.spec.ts` (ejecutado como parte de la suite de tests de esta auditoría, ver secciones 4 y 7): `encontrarOFallar(0, ...) === 0`, `encontrarOFallar("", ...) === ""` | Deben devolverse sin alterar | Confirmado — ambos tests pasan (parte de los 10/10 verificados en cada corrida de esta auditoría) | **SIN HALLAZGO** |
| 5.12 | Diferencia entre `403` (rol insuficiente) y `404`/`401` | Revisión de código: `RolesGuard.canActivate()` devuelve `false` cuando el rol autenticado no está en la lista requerida; NestJS, ante un guard que retorna `false`, lanza automáticamente `ForbiddenException` (`403`) — comportamiento de framework, no código propio | `403` distinto de `401`/`404` | No se ejecutó una prueba HTTP en vivo de `403` — los 3 métodos `findOne` auditados **no tienen ningún decorador `@Roles`**, por lo que `RolesGuard` los deja pasar a cualquier usuario autenticado sin importar el rol (`roles.guard.ts:14`, `if (!requiredRoles \|\| requiredRoles.length === 0) return true`); generar una prueba real de `403` habría requerido credenciales de un usuario con rol restringido — se detectó un usuario real ya existente en la base de desarrollo (`validacion106-noadmin@demo.com`, rol `OPERACIONES`, creado en una validación de Bloque 10.6 anterior) pero **deliberadamente no se intentó adivinar su contraseña**, por ser una prueba de fuerza bruta contra una cuenta real fuera del alcance y la autorización de esta auditoría | **OBSERVACIÓN** — confirmado por revisión de código, no por ejecución HTTP directa; ver limitación explícita |

**Detalle del hallazgo 5.8 (OBSERVACIÓN):** `findOne` en los 3 controllers nunca filtró por `activo` — solo `findAll` lo hace por defecto (`incluirInactivos` query param). Esto es **anterior a Bloque 11** y **no fue parte del alcance de H-01** (que solo corrige `null` → `404`, no introduce ni remueve ningún filtro por `activo`). Un recurso dado de baja sigue siendo `200` con datos completos (incluyendo `activo:false`) ante un `GET` directo por id. No es un hallazgo de H-01; se documenta porque la auditoría pidió explícitamente probar "recursos borrados".

**Estado H-01: SIN HALLAZGO** (con 2 observaciones no bloqueantes, ninguna atribuible a la implementación de H-01 en sí).

---

## 6. Auditoría adversarial H-02 — Bloqueo runtime de métodos raw de Prisma

Diagnóstico ejecutado contra el código real compilado (`dist/`), instanciando `crearClienteOrganizacional()` exactamente como lo hace `organizacion-prisma.module.ts` en producción, con Postgres real.

| # | Vector de bypass | Procedimiento | Resultado esperado | Resultado observado | Clasificación |
|---|---|---|---|---|---|
| 6.1 | Notación de corchetes | `protegido["$queryRawUnsafe"]` | Bloqueado (el trap `get` intercepta corchetes igual que notación de punto) | Lanza el error `[aislamiento] "$queryRawUnsafe"...` | **SIN HALLAZGO** |
| 6.2 | Desestructuración | `const { $executeRaw } = protegido` | Bloqueado (la desestructuración dispara el mismo `[[Get]]` interno) | Lanza el error correspondiente | **SIN HALLAZGO** |
| 6.3 | **`Object.getPrototypeOf(protegido)`** | Obtener el prototipo real del objeto envuelto por el Proxy y acceder a `$queryRaw` directamente sobre él, sin pasar por el Proxy | El trap `get` del Proxy no se dispara para operaciones sobre el *prototipo* (solo sobre el propio objeto proxied) — riesgo teórico ya señalado como "no verificado" en `REVISION_IMPLEMENTACION_BLOQUE11.md` §5 (traps `has`/`ownKeys` no sobreescritos), pero **nunca se probó si el prototipo expone el método directamente invocable** | `Object.getPrototypeOf(protegido) !== protegido` (es un objeto real, distinto), y **`typeof proto.$queryRaw === "function"`** — la función real, sin ningún envoltorio, obtenida sin lanzar ningún error | **HALLAZGO CRÍTICO** — ver explotabilidad en 6.4 |
| 6.4 | Explotabilidad de 6.3: invocar la función obtenida | `proto.$queryRaw.call(protegido)\`SELECT 1 as ok\`` (invocación real como *tagged template*, la forma correcta de usar `$queryRaw`) | Si la función requiere estado interno accesible solo a través del objeto real (no del Proxy ni del prototipo), debería fallar | **Ejecutó SQL real exitosamente**: `[{"ok":1}]` — el bypass es completamente funcional, no solo una referencia inerte | **HALLAZGO CRÍTICO** (mismo hallazgo que 6.3, confirmación de explotabilidad) |
| 6.5 | Alcance del bypass: `$queryRawUnsafe` y ausencia total de scoping organizacional | `proto.$queryRawUnsafe.call(protegido, 'SELECT "organizacionId", COUNT(*)::int FROM "Cliente" GROUP BY "organizacionId"')`, **sin establecer ningún contexto organizacional** (`organizacionContextStorage` vacío) | Si hay algún control adicional, debería fallar o filtrar por organización | Devolvió filas de **ambas organizaciones** en la misma respuesta (`Organización Principal` y `Organización B`), confirmando fuga total cross-organización, sin ningún filtro | **HALLAZGO CRÍTICO** (mismo hallazgo, confirmación de impacto máximo) |
| 6.6 | `$executeRawUnsafe` vía el mismo bypass | `proto.$executeRawUnsafe.call(protegido, 'SELECT 1')` | Igual de bloqueado que `$queryRaw` en el trap, o igual de bypasseable | Ejecutó sin error | Mismo hallazgo (6.3-6.6 son un único hallazgo, un único vector, con los 4 métodos igualmente afectados) |
| 6.7 | `Reflect.get(protegido, "$executeRawUnsafe")` | — | `Reflect.get` sobre un Proxy sí dispara su trap `get` (a diferencia de `Object.getPrototypeOf`) | Lanza el error correctamente | **SIN HALLAZGO** |
| 6.8 | `Object.getOwnPropertyDescriptor` sobre el prototipo obtenido en 6.3 | `Object.getOwnPropertyDescriptor(proto, "$queryRaw")` | — | `undefined` — `$queryRaw` no es una propiedad *propia* del objeto que `Object.getPrototypeOf` devuelve (aparentemente el propio `$extends()` de Prisma expone sus métodos mediante otro mecanismo interno un nivel más adentro); esta vía específica de introspección no agrega bypass adicional al ya confirmado en 6.3 | **SIN HALLAZGO** (no es una vía adicional; el bypass real es 6.3, accediendo directamente a la propiedad *heredada*, no a su descriptor propio) |
| 6.9 | Acceso desde un delegado de modelo (`protegido.cliente.$queryRaw`) | — | `undefined` (los delegados de modelo de Prisma no exponen métodos de nivel de cliente) | `undefined` | **SIN HALLAZGO** |
| 6.10 | `"$queryRaw" in protegido` (operador `in`) | — | `true` (ya señalado como comportamiento esperado, no sobreescrito, en `REVISION_IMPLEMENTACION_BLOQUE11.md`) | `true` | **OBSERVACIÓN** (ya documentado, sin impacto práctico adicional más allá del hallazgo 6.3) |
| 6.11 | `Object.keys(protegido)` | — | No debería listar `$queryRaw` (no es propiedad propia enumerable) | `false` (no lo incluye) | **SIN HALLAZGO** |
| 6.12 | Cast a `any` (equivalente en runtime a acceso directo sin tipos) | `protegido.$queryRaw` desde JS puro (sin TypeScript) | Bloqueado | Lanza el error correctamente | **SIN HALLAZGO** — esto confirma que el vector que H-02 dice cerrar ("un `as any` deliberado o accidental") **sí** está cerrado; el vector que **no** está cerrado es más sofisticado (6.3) pero no requiere más que 2 líneas de JavaScript |
| 6.13 | `$transaction` en forma array (no interactiva) invocado a través del Proxy | `protegido.$transaction([protegido.cliente.findMany(...)])` | Debe funcionar (no es un método bloqueado), aunque el código real de la app solo usa la forma callback | Ejecutó correctamente, `1` resultado | **SIN HALLAZGO** — confirma que la forma array no introduce ningún problema adicional, aunque no se usa en el código real |
| 6.14 | `tx === protegido` al usar `$transaction` interactiva a través del Proxy | `protegido.$transaction(async (tx) => tx === protegido)` | `false` — `tx` debe ser un objeto independiente | `false` | **SIN HALLAZGO** — reconfirma lo ya validado en `VALIDACION_FUNCIONAL_BLOQUE11.md` §7 |
| 6.15 | `tx.$queryRaw` dentro de la transacción interactiva | `protegido.$transaction(async (tx) => tx.$queryRaw\`SELECT 1\`)` | Debe funcionar (uso legítimo documentado) | `[{"ok":1}]` | **SIN HALLAZGO** |
| 6.16 | Uso indirecto ya existente en el código (`as any` sobre `this.prisma` en algún controller) | Búsqueda exhaustiva (`grep`) de `as any).*\$(query\|execute)Raw` y `prisma as any` en todo `backend/src` | Ninguna instancia | `No matches found` | **SIN HALLAZGO** — el bypass de 6.3 no está siendo usado hoy en ningún punto del código real, es un vector teórico-pero-confirmado-explotable, no un defecto ya presente en producción |

### Detalle del hallazgo 6.3-6.6 (HALLAZGO CRÍTICO, unificado)

**Causa raíz:** `bloquearMetodosRawDeNivelSuperior()` (`organizacion-prisma.client.ts:61-75`) implementa **únicamente el trap `get`** del `Proxy`. Los traps `getPrototypeOf` (y, de forma relacionada, `getOwnPropertyDescriptor`, `has`, `ownKeys`) **no están sobreescritos**, por lo que el `Proxy` delega su comportamiento por defecto al objeto real (`target`) para cualquier operación que no sea una lectura/escritura de propiedad directa sobre el propio objeto proxied. `Object.getPrototypeOf(protegido)` devuelve el prototipo **real**, sin pasar por el trap `get` en absoluto — y ese prototipo expone `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe` como métodos directamente invocables, heredados, no bloqueados.

**Cadena de explotación completa, confirmada empíricamente:**
```js
const proto = Object.getPrototypeOf(clienteInyectado);       // no pasa por el trap get
const raw = proto.$queryRawUnsafe;                            // referencia real, sin bloqueo
await raw.call(clienteInyectado, "SELECT ... FROM cualquier_tabla");  // ejecuta, sin scoping
```
3 líneas de JavaScript, sin ningún privilegio adicional al de poder ejecutar código dentro del proceso del backend (el mismo umbral de acceso que el vector `as any` que H-02 sí bloquea correctamente — ver 6.12).

**Contradice el criterio de aceptación documentado:** `AUDITORIA_BLOQUE11_SEGURIDAD.md`, tabla de decisiones, opción recomendada para H-02: *"Quitar los métodos del objeto en runtime... Cierra el vector por completo, incluso ante un `as any` deliberado o accidental"*. `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, H-02 punto 9, evalúa el riesgo de compatibilidad futura con `$transaction`, pero no evalúa ni prueba el trap `getPrototypeOf`. El mecanismo elegido (Proxy con únicamente el trap `get`) **no** cierra el vector "por construcción" como se afirmó — cierra el vector de acceso *directo* (`.` , `[]`, desestructuración, `Reflect.get`, cast `any`), pero deja abierto el vector de acceso *vía prototipo*, que no requiere ninguna sofisticación adicional relevante.

**Impacto:** máximo posible dentro del modelo de amenaza de H-02 — ejecución de SQL crudo arbitrario (`$queryRawUnsafe`/`$executeRawUnsafe`, sin parametrización) desde cualquier punto del backend, con **fuga confirmada de datos de todas las organizaciones en una sola consulta**, sin pasar por ningún control de aislamiento. Requiere acceso de código (no explotable directamente por un atacante HTTP externo sin antes lograr ejecutar código dentro del backend — mismo matiz de riesgo ya señalado en la Auditoría original para el vector `as any`), pero el mecanismo específicamente elegido para cerrar *ese* riesgo no lo cierra frente a este vector, ligeramente más sofisticado pero igual de accesible a cualquier desarrollador (malicioso, descuidado, o a través de una dependencia de terceros comprometida — el escenario de cadena de suministro es exactamente el que un mecanismo "a prueba de construcción" debería cubrir).

**Estado H-02: HALLAZGO CRÍTICO** (los 4 métodos bloqueados exitosamente contra 11 de los 12 vectores probados; el vector de prototipo los deja completamente expuestos).

---

## 7. Regresión transversal

| Verificación | Procedimiento | Resultado |
|---|---|---|
| Build | `npm run build` (`nest build`), ejecutado 2 veces (antes y después de todas las pruebas adversariales, incluidos los 6 ciclos de modificación/reversión de H-04) | **Verde** ambas veces, sin errores ni advertencias de TypeScript |
| Tests | `npm test -- --runInBand`, ejecutado repetidamente (baseline, tras cada reversión de H-04, y al final) | **Verde** en todas las corridas de baseline/final: 2 suites, **10/10** tests |
| Autenticación | Login real (`admin@demo.com`) repetido tras cada reinicio del backend (2 reinicios durante esta auditoría) | Funcional en ambos casos, `201` con token válido |
| Aislamiento organizacional | `GET /clientes/:id` de Org B con JWT de Org A, tras el segundo reinicio del backend | `404`, igual que en la Validación Funcional — sin regresión |
| Transacciones | `$transaction` interactiva y en forma array, `tx.$queryRaw` (vectores 6.13-6.15) | Funcionan sin cambios |
| Otros módulos (dashboard, aging, alertas) | Revisión de código de los 3 puntos que consumen `Factura` fuera de `clientes.controller.ts` (sección 2.1) | Sin cambios, sin divergencia de criterio respecto a `ANULADO` |
| `npm audit` | `npm audit` (sin `--force`, no se aplicó ninguna corrección) | **27 vulnerabilidades preexistentes** (3 bajas, 16 moderadas, 8 altas) — ver detalle abajo |
| `package-lock.json` | `git diff --stat -- backend/package-lock.json` | Diff grande (5790 inserciones / 2456 eliminaciones) — **preexistente**, ya presente en `git status` al inicio de esta auditoría (agregado de `@nestjs/throttler`/`jest`/`ts-jest`/`@types/jest` en la Implementación de Bloque 11); no se ejecutó `npm install` durante esta auditoría, por lo que no hay ningún cambio nuevo atribuible a esta etapa |
| `trust proxy` — otros puntos de interacción | `grep -rn "res.cookie\|req.cookies\|req.protocol\|req.secure\|\.ips\b" backend/src` | `sin resultados` — confirma lo ya documentado en `REVISION_IMPLEMENTACION_BLOQUE11.md`: sin impacto sobre cookies o protocolo en código propio. El único efecto real de `trust proxy` en todo el código es sobre la resolución de `req.ip`, que es exactamente el mecanismo comprometido por el hallazgo de la sección 3 |

### Detalle de `npm audit`

Las 27 vulnerabilidades reportadas se originan, en su inmensa mayoría, en dependencias de **build/tooling preexistentes**, no relacionadas con Bloque 11: `@nestjs/cli`, `@angular-devkit/*` (usado internamente por `@nestjs/cli`), `webpack`, `exceljs`→`uuid`, `pdfkit`-relacionados, `glob`, `tmp`/`inquirer`. Ninguna de las dependencias **nuevas** de Bloque 11 (`jest@29.7.0`, `ts-jest@29.2.5`, `@types/jest@29.5.14`) aparece nombrada en ningún hallazgo del reporte. `@nestjs/throttler@5.2.0` (versión real instalada, confirmada) aparece mencionado solo como dependiente transitivo de `@nestjs/core <=11.1.17` — pero la versión de `@nestjs/core` realmente instalada (`10.4.22`) es la **misma que ya usa el resto de toda la aplicación**, desde antes de Bloque 11; agregar `@nestjs/throttler` no introduce una versión de `@nestjs/core` distinta ni agrega una superficie de vulnerabilidad nueva — comparte exactamente la ya existente. **Ninguna vulnerabilidad de `npm audit` es atribuible a las dependencias nuevas introducidas por Bloque 11.**

---

## 8. Resumen ejecutivo

| Área | Resultado | Severidad máxima | Observaciones |
|---|---|---|---|
| H-08 — Cuenta corriente | 5 de 6 pruebas sin hallazgo; 1 hallazgo de presentación | HALLAZGO MENOR | El detalle de movimientos puede mostrar saldos intermedios engañosos si una cobranza tiene fecha anterior a su factura; el total (`saldoActual`) siempre reconcilia correctamente; lógica de ordenamiento preexistente, no introducida por H-08 |
| H-07 — Rate limiting de login | Bypass completo confirmado vía `X-Forwarded-For` arbitrario | **HALLAZGO CRÍTICO** | `trust proxy: 1` confía por cantidad de saltos, no por identidad de proxy verificada; reproducido de forma determinística en ambiente local; explotabilidad en producción (Railway) no confirmada ni descartada por esta auditoría, requiere verificación contra la infraestructura real |
| H-04 — Modelos organizacionales | 6 de 6 casos de ruptura controlada fallan exactamente como se espera | SIN HALLAZGO | Sin falsos negativos, sin necesitar base de datos, árbol restaurado exactamente en los 6 casos |
| H-01 — Respuestas 404 | 12 pruebas sin hallazgo; 2 observaciones no vinculadas a H-01 | SIN HALLAZGO (con observaciones) | Recurso dado de baja sigue siendo `200` por id (comportamiento preexistente fuera de alcance de H-01); no se pudo probar `403` en vivo por falta de credenciales autorizadas de un rol no-`ADMINISTRADOR` |
| H-02 — Bloqueo de métodos raw | Bypass completo confirmado vía `Object.getPrototypeOf` | **HALLAZGO CRÍTICO** | El trap `get` del Proxy no cubre el acceso vía prototipo; los 4 métodos son completamente invocables por esa vía, con fuga cross-organización confirmada; requiere acceso de código (no explotable remotamente sin antes comprometer el backend) |
| Regresión transversal | Build y tests verdes; sin regresión en auth/aislamiento/transacciones; `npm audit` sin vulnerabilidades nuevas atribuibles a Bloque 11 | SIN HALLAZGO | 27 vulnerabilidades preexistentes de tooling, no atribuibles a las dependencias nuevas de Bloque 11 |

---

## 9. Conclusión

**NO APTO PARA CIERRE.**

Dos hallazgos **CRÍTICOS** confirmados con evidencia de ejecución real, ambos en mecanismos que son, cada uno, el núcleo completo de su hallazgo original:

1. **H-07** queda completamente anulable por cualquier cliente HTTP capaz de enviar un header arbitrario (`X-Forwarded-For`) — sin necesitar ningún acceso especial, sin necesitar comprometer nada más que una request HTTP normal. Esto reproduce, en la práctica, exactamente el escenario que Bloque 11 buscaba cerrar en primer lugar ("el sistema está confirmado expuesto en un dominio público sin ningún límite de intentos de login").
2. **H-02** queda completamente anulable por cualquier código que se ejecute dentro del proceso del backend, usando un vector (`Object.getPrototypeOf`) apenas más sofisticado que el vector (`as any`) que el mecanismo sí bloquea correctamente — con fuga de datos cross-organización confirmada en la misma prueba que confirmó la explotabilidad.

Ninguno de los dos hallazgos fue corregido en esta etapa (fuera de mandato). Ambos están documentados con evidencia reproducible, causa raíz identificada por archivo:línea, e impacto confirmado empíricamente, no solo teorizado.

**Recomendación de tratamiento (no vinculante, no implementada):**
- **H-07:** verificar contra la infraestructura real de Railway si existe garantía de que el único camino de red hacia el backend sobrescribe (no solo agrega) `X-Forwarded-For`; si no hay esa garantía, considerar reemplazar `trust proxy: 1` (confianza por cantidad de saltos) por una validación de identidad del proxy confiable (función de validación de IP conocida de Railway, o un header/secreto compartido adicional que un cliente externo no pueda forjar).
- **H-02:** considerar sobreescribir también el trap `getPrototypeOf` del `Proxy` (por ejemplo, devolviendo `null` o un objeto sin los 4 métodos), o evaluar un mecanismo de encapsulamiento que no depiende únicamente del trap `get` para la garantía de bloqueo.

El hallazgo menor de H-08 (sección 2.6) no bloquea el cierre por sí solo, pero se deja documentado para la misma decisión de tratamiento.

Se recomienda que el Product Owner decida el tratamiento de ambos hallazgos críticos (corrección dentro de Bloque 11 antes de cerrar, o apertura de un bloque de seguimiento inmediato) antes de dar por cerrado el bloque.

---

## 10. Informe final

- **Pruebas adversariales ejecutadas:** 6 (H-08) + 12 (H-07) + 6 (H-04) + 12 (H-01) + 16 (H-02) + 9 (regresión transversal) = **61 verificaciones individuales**, todas con evidencia de código o de ejecución citada en las secciones 2-7.
- **Hallazgos encontrados:**
  - 2 **HALLAZGO CRÍTICO** (H-07, sección 3.3-3.9; H-02, sección 6.3-6.6).
  - 1 **HALLAZGO MENOR** (H-08, sección 2.6).
  - 3 **OBSERVACIÓN** (H-07 sección 3.10 — reset del contador en memoria tras reinicio; H-01 sección 5.8 — recurso dado de baja accesible por id; H-01 sección 5.12 — `403` no verificado en vivo por falta de credenciales autorizadas).
  - El resto de las 61 verificaciones: **SIN HALLAZGO**.
- **Severidad:** máxima **CRÍTICO** (2 instancias, H-02 y H-07).
- **Archivos temporales creados y eliminados:**
  - `h02_diagnostico.js` (sesión de Validación Funcional previa, ya reportado en `VALIDACION_FUNCIONAL_BLOQUE11.md`).
  - `h02_adversarial.js`, `h02_bypass3_explotabilidad.js`, `h02_bypass3_alcance.js`, `h02_bypass3_alcance2.js` (esta auditoría) — los 4 creados en el directorio de scratchpad de la sesión (fuera del repositorio), ejecutados, y eliminados antes de finalizar. Ninguno se agregó a git en ningún momento.
  - Archivos de captura de respuestas HTTP en `/tmp` (`resp_*.json`, `par_*.json`, `longid_resp.txt`) — temporales del propio shell de la sesión, fuera del repositorio, no persistidos.
- **Datos temporales creados (no limpiados — conservados como evidencia, mismo criterio ya usado en `VALIDACION_FUNCIONAL_BLOQUE11.md`):**
  - Cliente `H11-ADV-TEMP` (id `fde1f14b-5c1a-4722-aeaa-8e9712484e44`), dado de baja (`activo:false`) — usado para la prueba 5.8.
  - Factura `H11-ADV-002` (id `0d1177cc-e454-4467-b0f7-7e22b89ffc58`), estado final `COBRADO_TOTAL`, con 2 cobranzas — usada para las pruebas 2.4-2.6.
- **Resultado de build:** verde (`nest build`, sin errores), verificado 2 veces.
- **Resultado de tests:** verde, **10/10**, verificado en baseline y en cada reversión de los 6 casos de H-04 (siempre 9/10 durante la ruptura controlada, 10/10 tras cada reversión).
- **Resultado de `npm audit`:** 27 vulnerabilidades preexistentes (3 bajas, 16 moderadas, 8 altas), ninguna atribuible a las dependencias nuevas de Bloque 11.
- **`git status --short`** (idéntico al estado previo a esta auditoría — sin cambios de código, sin `git add` ejecutado):
  ```
   M backend/package-lock.json
   M backend/package.json
   M backend/src/auth/auth.controller.ts
   M backend/src/auth/auth.module.ts
   M backend/src/catalogos/choferes.controller.ts
   M backend/src/catalogos/clientes.controller.ts
   M backend/src/catalogos/transportistas.controller.ts
   M backend/src/main.ts
   M backend/src/prisma/organizacion-prisma.client.ts
   M frontend/railway.json
  ?? AUDITORIA_ADVERSARIAL_BLOQUE11.md
  ?? AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? AUDITORIA_BLOQUE10.4_FRONTEND.md
  ?? AUDITORIA_BLOQUE11_SEGURIDAD.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3b.md
  ?? DECISIONES_TECNICAS_BLOQUE10.4.md
  ?? DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md
  ?? DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? DISENO_BLOQUE10.4_FRONTEND.md
  ?? "DISEÑO_BLOQUE11_SEGURIDAD.md"
  ?? PLAN_PROXIMA_ETAPA.md
  ?? PRE_IMPLEMENTACION_BLOQUE11.md
  ?? REVISION_IMPLEMENTACION_BLOQUE11.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```
  (única diferencia respecto del estado inicial: la aparición de este mismo archivo, `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, todavía sin agregar a git; `backend/src/prisma/organizacional-models.ts` y `modelos-aislamiento-manual.ts` no muestran ningún cambio de contenido pese a las 6 modificaciones temporales de la sección 4, confirmado por `git diff` vacío en cada una).

No se corrigió ningún hallazgo. No se cambió el alcance. No se generó ninguna corrección, reverificación, acta de cierre, commit ni push.

Me detengo y quedo a la espera de revisión.

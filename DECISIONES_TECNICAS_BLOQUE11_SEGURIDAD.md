# Decisiones Técnicas — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. Convierte `DISEÑO_BLOQUE11_SEGURIDAD.md` (aprobado) en decisiones cerradas y verificables. **No implementa código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no actualiza el roadmap, no hace `git add`/`commit`/`push`.** Donde existía más de una opción técnicamente válida, se elige una y se justifica — no quedan alternativas abiertas para la etapa de Implementación.

**Investigación adicional realizada para cerrar estas decisiones** (lectura de código, sin ejecutar ni modificar nada): versiones reales instaladas (`backend/package.json`), el enum completo de `EstadoFacturaEnum`, y la regla de negocio ya existente que impide anular una factura con cobranzas vigentes (`facturas.controller.ts:323`) — resuelve por completo un caso borde de H-08 que de otro modo habría quedado abierto.

---

## H-01 — Respuestas 404 reutilizables

1. **Ubicación exacta del helper:** `backend/src/common/encontrar-o-fallar.ts` (archivo nuevo, junto a `common/filters/prisma-exception.filter.ts`, mismo directorio de piezas compartidas de infraestructura).

2. **Firma del helper:**
   ```ts
   export function encontrarOFallar<T>(valor: T | null | undefined, mensaje: string): T
   ```

3. **Tipo de excepción:** `NotFoundException` de `@nestjs/common` — es la misma que ya usan los controllers que hoy hacen esto bien (`viajes.controller.ts`, `facturas.controller.ts`, etc.). No se introduce ninguna clase de excepción nueva.

4. **Preservación del tipado genérico:** el parámetro es `T | null | undefined`, el retorno es `T` — TypeScript infiere `T` desde el valor recibido (p. ej., desde el resultado ya tipado de `await this.prisma.cliente.findUnique(...)`), así que el `return encontrarOFallar(resultado, mensaje)` de cada controller queda con el mismo tipo de retorno que tenía antes, sin necesitar ningún `as` ni cast manual. No se usa ningún tipo condicional ni sobrecarga — la genericidad de una sola letra alcanza para el caso de uso completo.

5. **Controllers exactos donde se aplica:**
   - `backend/src/catalogos/clientes.controller.ts`, método `findOne`.
   - `backend/src/catalogos/transportistas.controller.ts`, método `findOne`.
   - `backend/src/catalogos/choferes.controller.ts`, método `findOne`.
   
   Ningún otro controller se modifica en este bloque (decisión ya cerrada en Diseño, sección "Exclusiones").

6. **Mensaje de error observable** (uno por controller, reutilizando literalmente los mismos mensajes que ya usa el resto del código para la misma entidad, por consistencia):
   - Clientes: `"Cliente no encontrado."`
   - Transportistas: `"Transportista no encontrado."`
   - Choferes: `"Chofer no encontrado."`
   
   Cuerpo de respuesta resultante (formato estándar de NestJS, sin personalización adicional): `{ "statusCode": 404, "message": "Cliente no encontrado.", "error": "Not Found" }`.

7. **Compatibilidad con el contrato actual:** confirmada sin impacto — ningún archivo de `frontend/src` invoca `GET /clientes/:id`, `GET /transportistas/:id` ni `GET /choferes/:id` (verificado por búsqueda exhaustiva en la auditoría). El cambio de `200` vacío a `404` no tiene ningún consumidor real que deba adaptarse.

8. **Criterio para futuros controllers:** se documenta como comentario en el propio archivo del helper (no como regla de lint ni de CI, para no introducir infraestructura adicional fuera del alcance de este bloque): *"Usar este helper en cualquier `findOne` nuevo que reciba un `id` desde la URL. No aplica a lookups internos por `actor.organizacionId`/`actor.id` (esos nunca tienen la noción de 'id ajeno')."* No se retrofitean los controllers ya correctos (`viajes`, `facturas`, `liquidaciones`, `anticipos`) — siguen con su patrón inline existente, que ya es correcto.

9. **Pruebas requeridas:**
   - Manuales (HTTP real, mismo criterio que el resto del proyecto): por cada uno de los 3 endpoints — `id` propio (200 con datos), `id` de otra organización (404), `id` inexistente (404).
   - **Unitaria automatizada, nueva:** `backend/src/common/encontrar-o-fallar.spec.ts` — dado que el orden de implementación (sección "Decisiones transversales") ubica H-04 antes de H-01, la infraestructura de Jest ya existe al llegar a este hallazgo. `encontrarOFallar` es una función pura, sin dependencias de NestJS ni de base de datos — agregarle un test unitario mínimo (retorna el valor si no es `null`/`undefined`; lanza `NotFoundException` con el mensaje exacto si lo es) tiene costo marginal casi nulo y dejaría, incidentalmente, la primera prueba unitaria de una pieza de dominio del proyecto (H-04 prueba solo metadatos de schema). Se decide agregarlo.

---

## H-02 — Bloqueo runtime de métodos raw de Prisma

**Mecanismo elegido: Proxy.** Se descarta la eliminación/sobrescritura directa de propiedades por la siguiente razón técnica, no por preferencia estilística: `$extends()` de Prisma está, él mismo, implementado internamente con mecanismos de interceptación (no son necesariamente propiedades propias y enumerables del objeto devuelto) — no hay garantía, sin inspeccionar el código fuente interno de Prisma versión por versión, de que un `delete objeto.$queryRaw` o una reasignación remueva realmente el acceso, en vez de no hacer nada porque la resolución ocurre en un nivel que la eliminación directa no alcanza. Un `Proxy` que envuelve el objeto completo intercepta **cualquier** acceso a esas cuatro propiedades antes de que la petición llegue al objeto real, sin depender de ningún supuesto sobre cómo Prisma implementa `$extends()` por dentro — es la única de las dos opciones que da una garantía verificable por construcción, no por inspección de una versión particular de una librería de terceros.

1. **Mecanismo exacto:** un `Proxy` con un trap `get`, que:
   - Si la propiedad solicitada es una de las 4 bloqueadas, lanza un `Error` inmediatamente (no ejecuta ni devuelve nada del objeto real).
   - Si no, devuelve la propiedad del objeto real — y si es una función, la devuelve **atada (`.bind(target)`) al objeto real, nunca al Proxy**, para que cualquier lógica interna de Prisma que dependa de `this` (incluidos campos privados de clase, si existieran) siga recibiendo el objeto real como contexto, no el Proxy. Esto evita que el Proxy rompa, por efecto colateral, algún método legítimo que si se invocara con el Proxy como `this` fallara por depender de estado interno no accesible a través de él.

   ```ts
   const METODOS_RAW_BLOQUEADOS = new Set([
     "$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe",
   ]);

   function bloquearMetodosRaw<T extends object>(cliente: T): T {
     return new Proxy(cliente, {
       get(target, prop, _receiver) {
         if (typeof prop === "string" && METODOS_RAW_BLOQUEADOS.has(prop)) {
           throw new Error(
             `[aislamiento] "${prop}" no está disponible en el cliente organizacional de nivel ` +
               `superior. Si necesitás una consulta SQL cruda protegida por bloqueo de fila, usá ` +
               `el cliente de transacción (tx) dentro de $transaction().`,
           );
         }
         const valor = (target as any)[prop];
         return typeof valor === "function" ? valor.bind(target) : valor;
       },
     }) as T;
   }
   ```

2. **Momento del ciclo de vida donde se aplica:** dentro de la propia función `crearClienteOrganizacional()` (`backend/src/prisma/organizacion-prisma.client.ts`), envolviendo el resultado de `prisma.$extends({...})` justo antes de devolverlo. Se aplica **una sola vez**, en el momento de construcción del cliente (la función se invoca una única vez al arrancar la app, para construir el singleton inyectado como `ORGANIZACION_PRISMA` — confirmado por el comentario ya existente en el archivo: "es un singleton construido una sola vez al arrancar"). No se re-envuelve en cada request.

3. **Métodos exactos bloqueados:** `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe` — exactamente los 4 ya identificados en la auditoría, ni uno más ni uno menos. No se bloquea `$transaction` (necesario para toda la app) ni ningún método de modelo.

4. **Comportamiento observable al intentar usarlos:** cualquier acceso a `(prismaInyectado as any).$queryRaw` (o cualquiera de los otros 3) desde un controller lanza el `Error` de forma inmediata y sincrónica, en el momento del acceso a la propiedad — antes incluso de que se intente invocar como función.

5. **Tipo de error:** `Error` nativo de JavaScript, no una excepción HTTP de NestJS. Mismo criterio ya usado por `asegurarSinEscrituraAnidada` en el mismo archivo (un error de programación — "esto nunca debería ejecutarse en código correcto" — no una condición de negocio que un usuario final pueda provocar; no tiene sentido mapearlo a un código HTTP específico, y de hecho no debería ser alcanzable desde ningún request real).

6. **Mensaje de error:** `[aislamiento] "$queryRaw" no está disponible en el cliente organizacional de nivel superior. Si necesitás una consulta SQL cruda protegida por bloqueo de fila, usá el cliente de transacción (tx) dentro de $transaction().` (el nombre del método se interpola según cuál de los 4 se haya intentado) — mismo prefijo `[aislamiento]` que ya usa el guardia de escritura anidada existente, por consistencia de convención dentro del mismo archivo.

7. **Cómo se preservan los usos legítimos dentro de transacciones:** el Proxy envuelve **únicamente** el objeto devuelto por `crearClienteOrganizacional()` — el objeto vinculado al token `ORGANIZACION_PRISMA`. El parámetro `tx` que recibe el callback de `$transaction(async (tx) => {...})` es un objeto que Prisma construye internamente, de forma independiente, en cada invocación — nunca es el mismo objeto que el Proxy envuelve. No se aplica ningún envoltorio sobre `tx` en ningún punto del código. **Queda expresamente prohibido, como restricción de esta decisión, que la implementación bloquee los métodos raw del cliente transaccional** — si en la implementación se detectara que el mecanismo elegido afecta a `tx` de cualquier forma no prevista acá, la implementación debe detenerse y no cerrar el hallazgo hasta resolver esa discrepancia, no proceder igual.

8. **Cómo se evita afectar `PrismaClient` internamente:** el Proxy envuelve el resultado de `prisma.$extends(...)`, nunca el `PrismaService` crudo (el singleton subyacente inyectado en `crearClienteOrganizacional(prisma: PrismaService)`). `PrismaService` en sí mismo permanece con acceso completo a todos sus métodos, incluidos los raw — sigue siendo la base sobre la que Prisma construye internamente el objeto `tx` de cada transacción, sin ninguna restricción nueva.

9. **Riesgo de compatibilidad con versiones futuras de Prisma:** bajo pero no nulo. El mecanismo elegido no depende de ningún detalle interno de la implementación de `$extends()` (por eso se prefirió sobre la eliminación directa) — el único escenario de riesgo real sería que una versión futura de Prisma cambiara la forma en que `$transaction` deriva el objeto `tx` a partir del cliente extendido, de modo que dejara de ser un objeto verdaderamente independiente del que el Proxy envuelve. Mitigación: la prueba de regresión del punto 10 debe volver a ejecutarse en cualquier actualización de la versión de `@prisma/client`/`prisma`, no solo una vez al cerrar este hallazgo.

10. **Pruebas requeridas:**
    - Diagnóstico puntual en desarrollo (mismo método ya usado para resolver H-03 empíricamente): confirmar que `(prismaInyectado as any).$queryRawUnsafe("SELECT 1")` lanza el error esperado, con el mensaje exacto del punto 6.
    - Regresión explícita de los 2 usos legítimos existentes (`facturas.controller.ts:349` y `facturas.controller.ts:397`, ambos `tx.$queryRaw` para `SELECT ... FOR UPDATE` dentro de `registrarCobranza`/flujo equivalente): ejecutar el flujo real de registro de cobranza en desarrollo, con datos reales, confirmando que sigue funcionando exactamente igual que antes de esta corrección.

---

## H-04 — Red de seguridad de modelos organizacionales

1. **Framework de pruebas:** Jest. Es el framework por defecto de NestJS (`@nestjs/testing` ya está instalado como `devDependency` en `backend/package.json`, aunque hoy sin uso — confirmado; no se agrega como dependencia nueva, ya está presente).

2. **Dependencias nuevas necesarias:**
   - `jest` `^29.7.0`
   - `ts-jest` `^29.2.5`
   - `@types/jest` `^29.5.14`
   
   Las tres son compatibles con la versión real instalada de TypeScript (`^5.7.2`) y con el target de Node declarado (`@types/node: ^20.17.9`). No se agrega `@nestjs/testing` (ya está presente) ni ninguna otra librería — el test de H-04 no necesita levantar un `TestingModule` de NestJS, solo importar `Prisma.dmmf` de `@prisma/client` (ya instalado) y los dos arrays de modelos, ambos TypeScript plano sin decoradores ni inyección de dependencias.

3. **Scripts nuevos de `package.json`:**
   ```json
   "test": "jest"
   ```
   Un único script, sin variantes (`test:watch`, `test:cov`, etc.) — no se introduce infraestructura de testing mayor a la estrictamente necesaria para este bloque, tal como fija el Diseño.

4. **Ubicación exacta del test:** `backend/src/prisma/organizacional-models.spec.ts` (junto a `organizacional-models.ts`, que es lo que prueba).

5. **Forma de obtener la lista de modelos con `organizacionId` desde `schema.prisma`:** introspección en runtime vía `Prisma.dmmf.datamodel.models`, exportado por `@prisma/client` (disponible en la versión instalada, `^5.22.0`, sin necesitar conexión a una base de datos — el test corre sin Postgres activo). Cada modelo expone `.name` y `.fields` (arreglo de objetos con `.name`/`.kind`/`.type`); se filtran los modelos que tengan un campo con `name === "organizacionId"` y `kind === "scalar"`.

6. **Lista exacta de excepciones deliberadas:**
   - `AccesoGrupoEconomico`
   - `PagoConsolidadoLiquidacion`
   
   (Resultado del relevamiento de la sección H-03 de este documento — ninguna otra excepción existe hoy.)

7. **Lugar donde se declara esa lista:** archivo nuevo `backend/src/prisma/modelos-aislamiento-manual.ts`, mismo patrón que `organizacional-models.ts` (un array `as const` con nombre exportado, p. ej. `MODELOS_AISLAMIENTO_MANUAL`), con un comentario por entrada citando la razón arquitectónica exacta (reutilizando el texto ya existente en `schema.prisma`, sección H-03 de este documento).

8. **Validaciones que debe realizar el test** (cinco verificaciones independientes, cada una con su propio `expect`, para que un fallo señale exactamente cuál invariante se rompió):
   - **Modelos faltantes:** todo modelo real del schema con `organizacionId` debe estar en `ORGANIZACIONAL_MODELS` o en `MODELOS_AISLAMIENTO_MANUAL` — `expect(faltantes).toEqual([])`.
   - **Modelos sobrantes en `ORGANIZACIONAL_MODELS`:** toda entrada de esa lista debe corresponder a un modelo real del schema que además tenga `organizacionId` — `expect(sobrantesOrganizacionales).toEqual([])`.
   - **Excepciones que dejaron de existir:** toda entrada de `MODELOS_AISLAMIENTO_MANUAL` debe corresponder a un modelo real del schema que además tenga `organizacionId` (si un modelo se elimina o pierde el campo, la entrada de la lista de excepción queda obsoleta y el test debe fallar) — `expect(sobrantesManual).toEqual([])`.
   - **Excepciones no documentadas / duplicados entre listas:** ningún nombre puede estar simultáneamente en `ORGANIZACIONAL_MODELS` y en `MODELOS_AISLAMIENTO_MANUAL` — `expect(interseccion).toEqual([])`.
   - **Duplicados dentro de la misma lista:** ni `ORGANIZACIONAL_MODELS` ni `MODELOS_AISLAMIENTO_MANUAL` pueden repetir un mismo nombre — `expect(new Set(lista).size).toBe(lista.length)` para cada una.

9. **Mensajes de fallo esperados:** no se define un mensaje de `expect` personalizado — se usa `toEqual([])` sobre un array de nombres de modelo calculado explícitamente en cada `it()`. El propio diff que Jest imprime por defecto (`- []`, `+ ["NombreDelModelo"]`) ya identifica exactamente qué modelo violó la invariante, sin necesitar un mensaje adicional. Esta es una decisión deliberada de simplicidad: agregar mensajes personalizados no aportaría información que el diff de Jest no dé ya, y sí agregaría código de mantenimiento extra.

10. **Ejecución:** comando separado (`npm run test`), **nunca** como parte de `npm run build` ni de `npm run start:dev` — riesgo ya señalado en el Diseño (no interferir con el watch mode de Nest). El proyecto no tiene CI hoy (`.github/` no existe, confirmado en `DEUDA_TECNICA.md`) — por ahora la ejecución es manual/local, previa a cada commit relacionado con `schema.prisma` o con las dos listas. Queda documentado como el candidato natural para un futuro pipeline de CI, si llegara a crearse, pero eso no es parte de este bloque.

---

## H-07 — Rate limiting de login

1. **Librería y versión:** `@nestjs/throttler` `^5.2.0` — la línea de versión 5.x es la compatible con `@nestjs/common`/`@nestjs/core` `^10.4.15` (versión real instalada).

2. **Configuración:** **local**, no global. `ThrottlerModule.forRoot([...])` se importa dentro de `AuthModule` únicamente (no en `AppModule`) — el registro del módulo deja sus providers disponibles para inyección, pero **no aplica ningún guard por sí solo**; el guard se agrega explícitamente solo donde se decide (punto 3). Esto mantiene el resto de la API (endpoints autenticados, y los otros 3 endpoints públicos de `AuthController`) sin ningún cambio de comportamiento, tal como fija el alcance del Diseño.

3. **Decorador/mecanismo exacto:** `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 10, ttl: 60000 } })`, ambos aplicados **a nivel de método**, únicamente sobre `AuthController.login()` — nunca a nivel de clase (evita afectar `cambiarOrganizacion`, `recuperarContrasena`, `restablecerContrasena`, los otros 3 métodos del mismo controller).

4. **Ventana temporal:** 60 segundos (`ttl: 60000` en milisegundos, unidad que usa la librería).

5. **Cantidad máxima de intentos:** 10 por ventana. **Justificación:** debe ser lo bastante bajo para frenar de forma significativa un ataque de fuerza bruta (10/minuto = 600/hora por IP, muy por debajo de lo que un ataque automatizado sin límite lograría) y lo bastante alto para no interferir con el patrón de validación manual ya establecido en este mismo proyecto (las actas de cierre de Bloques 8-10 documentan sesiones de prueba con múltiples logins sucesivos, de distintos usuarios, desde la misma máquina/IP de desarrollo). Un umbral más agresivo (p. ej. 5/minuto, valor típico citado como línea de base en guías de fuerza bruta) se descarta explícitamente por el riesgo concreto y ya documentado de fricción con el propio flujo de trabajo de QA de este proyecto.

6. **Clave de identificación:** **IP** (comportamiento por defecto de `@nestjs/throttler`, vía `req.ip`). Se descarta "IP + usuario" porque en el momento de la petición a `/auth/login` el "usuario" es un dato no verificado (el propio email que se está intentando validar) — un atacante que varía el email en cada intento evadiría trivialmente una clave que dependa de él. La política de bloqueo de cuenta por usuario queda, además, explícitamente fuera de alcance (punto 13).

7. **Comportamiento detrás de proxy — decisión adicional necesaria, no prevista explícitamente en el Diseño:** producción corre en Railway, detrás de un proxy/balanceador (confirmado por la documentación de infraestructura del proyecto). Sin configuración adicional, `req.ip` en Express refleja la IP del proxy interno de Railway, no la del cliente real — esto haría que **todo el tráfico de producción comparta la misma "IP"** a los efectos del throttling, inutilizando el límite (un solo IP artificial acumularía los intentos de todos los usuarios reales). **Decisión:** agregar `app.set("trust proxy", 1)` en `backend/src/main.ts`, antes de `app.listen(...)`, para que Express resuelva la IP real del cliente desde el header `X-Forwarded-For` que el proxy de Railway ya agrega. Esto se agrega a los archivos afectados de H-07 (no estaba en el Diseño original, que no había entrado en este nivel de detalle).

8. **Código HTTP esperado:** `429 Too Many Requests` (comportamiento por defecto de la librería, sin sobreescribir el código de estado).

9. **Headers relevantes:** el header `Retry-After` (segundos hasta que se permite un nuevo intento) que la librería agrega por defecto en la respuesta `429`. No se configuran headers adicionales (`X-RateLimit-*`) — mantener el footprint mínimo, consistente con la decisión de no exceder el alcance ya fijado.

10. **Mensaje observable:** se sobreescribe el mensaje por defecto de la librería (`"ThrottlerException: Too Many Requests"`, en inglés, inconsistente con el resto de los mensajes de error del sistema, todos en español) mediante el `errorMessage` configurable del módulo: **`"Demasiados intentos de inicio de sesión. Esperá un minuto antes de volver a intentar."`**

11. **Configuración por entorno:** **no** se hace configurable vía variable de entorno. Se decide usar constantes nombradas en código (`LOGIN_THROTTLE_TTL_MS = 60_000`, `LOGIN_THROTTLE_LIMITE = 10`, declaradas en `auth.module.ts`), siguiendo el mismo patrón que el proyecto ya usa para valores de este tipo (`AUDITORIA_LIMITE_DEFECTO`/`AUDITORIA_LIMITE_MAXIMO` en `organizacion.controller.ts`, `JWT_SECRET_LONGITUD_MINIMA` en `env-validation.ts`) — ninguno de esos precedentes usa variables de entorno para umbrales de este tipo, y `@nestjs/config` (instalado pero confirmado sin uso real en `DEUDA_TECNICA.md`) no se activa recién para este caso puntual, para no introducir un patrón nuevo sin relación con el hallazgo que se está cerrando.

12. **Pruebas requeridas (manuales, HTTP real):**
    - Login inválido repetido hasta 10 veces en menos de 60 segundos → todas responden `401` (nunca `429` antes de la 11ª).
    - Intento número 11 dentro de la misma ventana → `429`, con el mensaje del punto 10 y el header `Retry-After` presente.
    - Tras esperar a que expire la ventana (60 segundos desde el primer intento contabilizado) → login vuelve a aceptarse normalmente.
    - Caso de uso legítimo de QA: varios logins sucesivos con usuarios **distintos** (`admin@demo.com`, `gerencia@demo.com`, etc.) desde la misma máquina de desarrollo, dentro de una ventana de 60 segundos, en cantidad menor a 10 → todos deben responder según sus credenciales (200/401), nunca `429` — confirma que el límite no rompe el patrón de prueba ya usado en bloques anteriores.

13. **Confirmación:** este bloque **no** implementa ningún mecanismo de bloqueo de cuenta por intentos fallidos. Esa capacidad —distinta de rate-limiting por IP— permanece como el mismo riesgo remanente ya señalado al cierre de Bloque 9, sin resolver, fuera del alcance de Bloque 11 por decisión explícita del Product Owner.

---

## H-08 — Cuenta corriente

1. **Condición exacta a agregar al `where`:** en `ClientesController.cuentaCorriente()` (`backend/src/catalogos/clientes.controller.ts`), el `where` de `this.prisma.factura.findMany(...)` pasa de `{ clienteId: id }` a `{ clienteId: id, estado: { not: "ANULADO" } }`.

2. **Estados que se incluyen:** `FACTURADO`, `COBRADO_PARCIAL`, `COBRADO_TOTAL` (los 3 valores restantes de `EstadoFacturaEnum`, confirmado completo en `schema.prisma`).

3. **Estados que se excluyen:** únicamente `ANULADO`.

4. **Impacto sobre facturas históricas:** todas las facturas ya anuladas en la base (en cualquier organización, en cualquier fecha) dejan de sumar su `importe` al `debe` del cliente correspondiente, de forma retroactiva e inmediata al desplegar — no requiere backfill ni migración, es un filtro de lectura, no un cambio de datos almacenados.

5. **Compatibilidad con datos actuales — caso borde ya resuelto, no abierto:** se investigó si una factura `ANULADO` puede tener cobranzas no-anuladas asociadas (lo que dejaría "dinero ya cobrado" fuera del estado de cuenta al excluir la factura completa). **Confirmado que no puede ocurrir**: `facturas.controller.ts:323` ya rechaza explícitamente anular una factura con cobranzas vigentes (`"No se puede anular una factura con cobranzas vigentes registradas"`) — una factura solo llega a `ANULADO` si no tiene ninguna cobranza activa asociada. La corrección de H-08 no puede, por lo tanto, hacer desaparecer del historial ningún cobro real ya registrado.

6. **Casos borde:**
   - Cliente cuyas **todas** las facturas están `ANULADO` → `movimientos: []`, `saldoActual: 0`. Comportamiento correcto y ya soportado por la estructura de la función (no requiere manejo especial: el `for` sobre un array vacío no agrega nada).
   - Cliente sin ninguna factura `ANULADO` → resultado idéntico al comportamiento actual (verificado como caso de regresión, no de riesgo).

7. **Pruebas requeridas (manuales, HTTP real, contra datos de desarrollo):**
   - Cliente con una factura `ANULADO` conocida (se identifica o se crea una en desarrollo siguiendo el flujo real: crear factura → anular): `saldoActual` excluye su importe, comparado explícitamente contra el valor que devolvía el endpoint antes de la corrección.
   - Cliente sin facturas anuladas: `saldoActual` idéntico al valor previo a la corrección (regresión).
   - Cliente con todas sus facturas `ANULADO`: `saldoActual: 0`, `movimientos: []`, sin error.

8. **Consulta de verificación previa al despliegue sobre producción, solo lectura** (actividad separada, no parte de esta implementación, según la decisión ya tomada por el Product Owner — se especifica acá para que quede lista antes de desplegar):
   ```sql
   SELECT c."razonSocial", COUNT(f.id) AS facturas_anuladas, SUM(f.importe) AS delta_saldo
   FROM "Factura" f
   JOIN "Cliente" c ON c.id = f."clienteId" AND c."organizacionId" = f."organizacionId"
   WHERE f.estado = 'ANULADO'
   GROUP BY c."razonSocial"
   ORDER BY delta_saldo DESC;
   ```
   Solo lectura (`SELECT`), sin ningún efecto sobre datos. Permite anticipar, antes de desplegar, cuántos clientes reales y cuánto saldo cambia — información que el Product Owner puede usar para decidir si avisar a algún usuario antes del despliegue.

---

## H-03 — Cierre documental

1. **Resultado del relevamiento de los 24 modelos:** de los 24 modelos de `schema.prisma` con un campo escalar `organizacionId`, 22 están registrados en `ORGANIZACIONAL_MODELS` (aislamiento automático vía la extensión de Prisma) y 2 no lo están.

2. **Los 2 modelos excluidos deliberadamente:**
   - `AccesoGrupoEconomico`
   - `PagoConsolidadoLiquidacion`

3. **Justificación arquitectónica de cada exclusión** (cita literal de los comentarios ya existentes en `schema.prisma`, confirmados vigentes):
   - `AccesoGrupoEconomico` (`schema.prisma:115-116`): *"No es un modelo organizacional (no vive en ORGANIZACIONAL_MODELS) — mismo tratamiento que GrupoEconomico e IdentidadChoferGrupo, aislamiento manual, nunca por la extensión de Prisma"* — es, en sí mismo, el mecanismo que permite el acceso cruzado entre organizaciones; auto-limitarlo a la organización del actor lo volvería incapaz de cumplir su propio propósito. Verificado en código (`acceso-grupo.controller.ts`) que cada consulta sobre este modelo ya filtra manualmente por `organizacionId` donde corresponde.
   - `PagoConsolidadoLiquidacion` (`schema.prisma:439-441`): *"No es organizacional (une organizaciones distintas, no podría serlo)"* — cada fila representa, a propósito, una liquidación de una organización distinta a la de quien arma el pago consolidado. Verificado en código (`pago-consolidado.service.ts`) que el acceso a filas de otras organizaciones se hace mediante cambio explícito de contexto (`organizacionContextStorage.run({ organizacionId }, ...)`), nunca de forma implícita o sin control.

4. **Confirmación:** no se implementa ninguna corrección de código para H-03 en este bloque. Su único efecto sobre la implementación de Bloque 11 es informar la arquitectura de H-04 (la existencia de estas 2 excepciones deliberadas es, precisamente, la razón por la que el test de H-04 necesita una segunda lista, no una sola).

5. **Criterio que deberá cumplir cualquier modelo organizacional futuro con escrituras anidadas:** todo modelo organizacional nuevo que participe de una escritura anidada (`create` anidado, `connect`, `connectOrCreate`, etc.) a través de otro modelo organizacional padre **debe** modelar su relación hacia ese padre mediante clave foránea compuesta `(idPropio, organizacionId)` referenciando la clave compuesta `(id, organizacionId)` del padre — el mismo patrón ya usado por `Contacto → Cliente` y por prácticamente la totalidad de las relaciones organizacionales del schema actual (confirmado en el relevamiento del punto 1). Si una relación no puede modelarse así por algún motivo, **la escritura anidada no debe usarse** — debe reemplazarse por una escritura explícita en dos pasos (crear el padre, luego crear el hijo con `organizacionId` inyectado explícitamente por la extensión de Prisma), nunca asumir que Prisma completará el campo por inferencia sin que una clave foránea compuesta lo garantice estructuralmente.

---

## Decisiones transversales

### Archivos exactos previstos a modificar o crear

| Archivo | Hallazgo | Tipo |
|---|---|---|
| `backend/src/common/encontrar-o-fallar.ts` | H-01 | Nuevo |
| `backend/src/common/encontrar-o-fallar.spec.ts` | H-01 | Nuevo |
| `backend/src/catalogos/clientes.controller.ts` | H-01, H-08 | Modificado |
| `backend/src/catalogos/transportistas.controller.ts` | H-01 | Modificado |
| `backend/src/catalogos/choferes.controller.ts` | H-01 | Modificado |
| `backend/src/prisma/organizacion-prisma.client.ts` | H-02 | Modificado |
| `backend/src/prisma/modelos-aislamiento-manual.ts` | H-04 | Nuevo |
| `backend/src/prisma/organizacional-models.spec.ts` | H-04 | Nuevo |
| `backend/package.json` | H-04, H-07 | Modificado (dependencias + script `test`) |
| `backend/jest.config.js` (o campo `"jest"` embebido en `package.json`, a definir en Implementación cuál de las dos formas usar — ambas son equivalentes en efecto, diferencia puramente de organización de archivos) | H-04 | Nuevo |
| `backend/src/auth/auth.module.ts` | H-07 | Modificado |
| `backend/src/auth/auth.controller.ts` | H-07 | Modificado |
| `backend/src/main.ts` | H-07 | Modificado (`trust proxy`, decisión nueva de esta etapa) |

Ningún archivo de `frontend/src`, ningún archivo de `schema.prisma`, ninguna migración.

### Dependencias nuevas

| Paquete | Versión | Tipo | Hallazgo |
|---|---|---|---|
| `jest` | `^29.7.0` | devDependency | H-04 |
| `ts-jest` | `^29.2.5` | devDependency | H-04 |
| `@types/jest` | `^29.5.14` | devDependency | H-04 |
| `@nestjs/throttler` | `^5.2.0` | dependency | H-07 |

### Comandos de prueba

- `npm run test` (nuevo, backend) — ejecuta el test de H-04. No requiere Postgres activo.
- Validación manual HTTP real (H-01, H-02, H-07, H-08) — mismo procedimiento ya usado en todo el proyecto: `npm run start:dev` + login real + requests reales contra `localhost:3000/api/v1`, usando los usuarios/organizaciones de desarrollo ya existentes.

### Estrategia de rollback (por hallazgo)

| Hallazgo | Rollback |
|---|---|
| H-01 | Revertir los 3 controllers al `return` directo; eliminar el archivo del helper. Sin efecto sobre datos. |
| H-02 | Revertir `organizacion-prisma.client.ts` a la versión sin el Proxy. Sin efecto sobre datos ni sobre ningún contrato público (nunca hubo un uso legítimo externo de los 4 métodos bloqueados). |
| H-04 | Eliminar el test, la lista nueva y el script `test`; las dependencias de desarrollo pueden quedar instaladas sin efecto (no se ejecutan en producción). Sin ningún riesgo — es la corrección de menor impacto de rollback de todo el bloque. |
| H-07 | Revertir `auth.module.ts`/`auth.controller.ts`/`main.ts`; desinstalar `@nestjs/throttler` si se desea (no obligatorio, no tiene efecto si no se usa). Sin efecto sobre datos. |
| H-08 | Revertir la condición agregada al `where` de `cuentaCorriente()`. Sin efecto sobre datos (el cambio nunca escribió nada, solo leyó distinto). |

Los cinco rollbacks son de una sola pieza cada uno (un commit revertido), sin dependencias entre sí — consistente con que los cinco hallazgos se implementan y cierran de forma independiente (Diseño, sección 6).

### Orden definitivo de implementación

Confirmado el orden ya propuesto en el Diseño, sin cambios: **H-08 → H-07 → H-04 → H-01 → H-02.** Se ratifica con una razón adicional encontrada en esta etapa: H-01 incluye ahora una prueba unitaria (punto 9 de H-01) que depende de que la infraestructura de Jest de H-04 ya exista — el orden ya proponía H-04 antes de H-01 por otros motivos (sección 10 del Diseño), y esta nueva decisión refuerza, no contradice, esa secuencia.

### Criterios de aceptación por hallazgo (consolidado)

| Hallazgo | Criterio de aceptación |
|---|---|
| H-01 | Los 3 endpoints devuelven `404` con el mensaje exacto correspondiente ante `id` ajeno/inexistente; `200` sin cambios ante `id` propio válido. Test unitario de `encontrarOFallar` en verde. Cero regresión en el resto de cada controller. |
| H-02 | El objeto `ORGANIZACION_PRISMA` lanza el error del punto 6 (H-02) ante cualquiera de los 4 métodos bloqueados. Los 2 usos legítimos de `tx.$queryRaw` en `facturas.controller.ts` siguen funcionando sin cambios, verificado empíricamente. |
| H-04 | `npm run test` pasa en el estado correcto del código; falla de forma controlada y verificable (mensaje autodescriptivo de Jest) ante cualquiera de las 5 violaciones de invariante de la sección H-04, punto 8. No requiere Postgres activo. `npm run build`/`npm run start:dev` funcionan sin cambios. |
| H-07 | `POST /auth/login` responde `429` al superar 10 intentos en 60 segundos por IP, con el mensaje del punto 10 y header `Retry-After`; vuelve a aceptar tras expirar la ventana. `trust proxy` configurado y verificado en desarrollo (simulando el header `X-Forwarded-For`). Ningún otro endpoint afectado. Sin bloqueo de cuenta. |
| H-08 | `GET /clientes/:id/cuenta-corriente` excluye facturas `ANULADO` del cálculo; regresión confirmada en clientes sin facturas anuladas; caso borde (cliente 100% anulado) sin error. Consulta de verificación de producción (punto 8 de H-08) documentada y lista para ejecutarse antes del despliegue. |

### Riesgos conocidos (consolidado, con mitigación ya definida en cada hallazgo)

- **H-02:** dependencia de que `tx` sea realmente un objeto independiente del cliente envuelto — mitigado con verificación empírica obligatoria antes de cerrar, no solo lectura de código.
- **H-04:** primera infraestructura de testing del proyecto — mitigado acotando el footprint al mínimo (una dependencia de test, un script, sin integración con build/watch).
- **H-07:** umbral mal calibrado podría interferir con QA propio, o el `trust proxy` mal configurado podría dejar el límite inefectivo en producción (todo el tráfico compartiendo una sola IP aparente) — ambos mitigados con decisiones numéricas y de configuración ya cerradas en este documento, no dejadas abiertas.
- **H-08:** cambio de un valor financiero ya visible — mitigado por la decisión ya tomada del Product Owner (verificación de impacto real en producción antes de desplegar, no parte de esta implementación).
- **H-01:** ninguno identificado más allá de la regresión estándar de cada controller.

### Exclusiones definitivas (ratificadas, sin cambios respecto del Diseño)

- H-03 no recibe corrección de código en este bloque.
- Bloqueo de cuenta por intentos fallidos de login — fuera de H-07.
- Verificación de impacto en producción de H-08 — actividad separada, previa al despliegue, no parte de la implementación.
- Retrofit de los controllers ya correctos al helper de H-01.
- Extensión del rate-limiting a otros endpoints públicos de `AuthController`.
- Cualquier cambio de frontend.
- Actualización del roadmap (`docs/roadmap/ROADMAP_PRODUCTO_SDC.md`) — corresponde a una etapa posterior al cierre del bloque, no a esta.

### Documentación a actualizar después de implementar (no en esta etapa)

Listado para referencia futura, ninguno de estos documentos se toca en esta etapa de Decisiones Técnicas:
- `ACTA_CIERRE_BLOQUE11.md` (nuevo, al cerrar el bloque completo).
- `docs/deuda-tecnica/DEUDA_TECNICA.md` — remover o marcar como resueltos los ítems de la sección A correspondientes a H-01, H-02, H-04, H-07, H-08 (y confirmar, de paso, que la actualización refleje también que H-05/H-06 ya estaban resueltos desde Bloque 8.1.a, corrección pendiente desde la auditoría de este mismo bloque).
- `docs/roadmap/ROADMAP_PRODUCTO_SDC.md` — marcar como cerrado el punto que originalmente motivó este bloque (sección 7, "Bloque 10 — Endurecimiento de seguridad remanente" en la numeración original del roadmap).
- `PLAN_PROXIMA_ETAPA.md` — puede quedar como referencia histórica de por qué se abrió este bloque, sin necesidad de edición.

---

## Conclusión

Las 5 correcciones de Bloque 11 (H-01, H-02, H-04, H-07, H-08) quedan con decisiones técnicas cerradas y verificables — mecanismo exacto, archivos exactos, valores numéricos exactos y justificados, mensajes exactos, y criterios de aceptación exactos, sin ninguna alternativa dejada abierta para la etapa de Implementación. H-03 queda documentado y cerrado como excepción sin corrección, con un criterio explícito para prevenir el mismo tipo de incertidumbre en el futuro. No se implementó ninguna de estas decisiones, no se modificó código, schema, ni se realizó ninguna operación de git.

Quedo a la espera de aprobación antes de comenzar la Implementación.

# Diseño de Corrección — H-02 (V2): cierre completo, incorporando la causa raíz del vector de escritura de prototipo

Fecha: 2026-07-24. **No implementa la solución, no escribe código productivo definitivo, no crea tests permanentes, no modifica ningún documento anterior, no modifica backend/frontend/schema, no crea migraciones, no genera parches.** Se basa en `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md` y en todos los antecedentes ya aprobados de la cadena de H-02. No se repite ningún experimento ya realizado ni se reabre la investigación de causa raíz — donde una pregunta de diseño hubiera exigido nueva investigación, se documenta explícitamente como bloqueo (ver criterios de detención), no se improvisa.

---

## 1. Baseline documental

**Estado actual de H-02:** la Auditoría Adversarial de Bloque 11 confirmó un bypass del `Proxy` de bloqueo mediante acceso a la cadena de prototipos (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__`), con fuga cross-organización confirmada por ejecución real. Se diseñó, decidió y comenzó a implementar una corrección (V1) que agregaba traps `getPrototypeOf` y `setPrototypeOf`, más tratamiento explícito de `"__proto__"` dentro del trap `get` ya existente.

**Por qué la implementación V1 quedó bloqueada:** durante la validación adversarial de esa implementación, se descubrió que `cliente.__proto__ = valor` **no** disparaba el trap `setPrototypeOf` (a diferencia de `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, que sí funcionaron correctamente) y, en cambio, mutaba realmente el objeto Prisma real, rompiendo métodos legítimos (`$connect`/`$disconnect`/`$transaction`) y filtrando propiedades del objeto asignado. Conforme al protocolo ya aprobado, la implementación se detuvo, se revirtió por completo, y se documentó como bloqueada (`IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`).

**Causa raíz confirmada** (`INVESTIGACION_H02_PROTO_SETTER.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`): el objeto que `prisma.$extends()` devuelve es, él mismo, un `Proxy` interno de Prisma (`createCompositeProxy`), cuyo propio trap `set` delega con `Reflect.set(target, prop, value)` — **3 argumentos, sin `receiver`**. Esto hace que el `Receiver` que nuestro `Proxy` externo le pasa al delegar `[[Set]]("__proto__", valor, Receiver=nuestroProxy)` se pierda antes de que la cadena de resolución llegue a invocar `[[SetPrototypeOf]]` sobre nuestro `Proxy` — el `[[SetPrototypeOf]]` termina invocándose sobre un objeto interno de Prisma, ordinario, sin ninguna protección, que lo acepta sin más.

**Decisiones que permanecen vigentes** (`REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, sección 2): valor de `getPrototypeOf` (`Object.prototype`); tratamiento de lectura de `__proto__` dentro del trap `get`; no bloquear `constructor` explícitamente; lista de 4 métodos SQL bloqueados; tipo de error (`Error` genérico); mensaje de error sin exponer información interna.

**Decisiones que requieren corrección** (mismo documento, sección 3): el trap `setPrototypeOf`, tal como está diseñado, **no** cubre la escritura vía `__proto__ =` — requiere un mecanismo adicional; la estrategia de testing debe garantizar que los vectores de escritura de prototipo se validen contra el objeto **real** de Prisma, no solo contra un mock ordinario.

**Alcance exacto de esta versión V2:** diseñar el mecanismo adicional necesario para cerrar `cliente.__proto__ = ...` (y cualquier vía equivalente), sin modificar ninguna de las 6 decisiones que permanecen vigentes, sin ampliar el alcance a H-07, sin modificar el `PrismaClient` real, y sin afectar al `TransactionClient`.

---

## 2. Objetivos de seguridad

| Objetivo | Categoría |
|---|---|
| Impedir acceso a `$queryRaw` | Confidencialidad |
| Impedir acceso a `$executeRaw` | Confidencialidad |
| Impedir acceso a `$queryRawUnsafe` | Confidencialidad |
| Impedir acceso a `$executeRawUnsafe` | Confidencialidad |
| Impedir recuperación del prototipo real (lectura) | Confidencialidad de referencias internas |
| Impedir sustitución del prototipo real (escritura) | Integridad del cliente Prisma |
| Impedir escritura de `"__proto__"` por cualquier vía | Integridad del cliente Prisma |
| Impedir bypass mediante `constructor.prototype` | Confidencialidad de referencias internas |
| Conservar métodos Prisma legítimos | Compatibilidad funcional |
| Conservar transacciones legítimas (`$transaction`, `tx.$queryRaw`/`tx.$executeRaw`) | Compatibilidad funcional |
| No envolver `tx` | Compatibilidad funcional / Integridad |
| No modificar el `target` real | Integridad del cliente Prisma |
| Mantener el filtrado por `organizacionId` en cada operación de modelo | Aislamiento organizacional |

**Distinción explícita:**
- **Confidencialidad de referencias internas:** que ningún mecanismo de reflexión (lectura de prototipo, introspección) exponga una referencia invocable a los 4 métodos raw ni al objeto interno real de Prisma.
- **Integridad del cliente Prisma:** que ninguna operación externa pueda mutar el objeto real que Prisma usa internamente para resolver sus propios métodos.
- **Compatibilidad funcional:** que ningún mecanismo de protección rompa un uso legítimo ya existente (métodos de modelo, transacciones, `$connect`/`$disconnect`).
- **Aislamiento organizacional:** que la extensión de `$allModels` (mecanismo de Bloque 8.1.d, completamente ajeno a H-02) siga funcionando exactamente igual — este objetivo no está en riesgo por nada de lo analizado en esta cadena de H-02, se incluye por completitud.

---

## 3. Modelo de amenazas actualizado

| # | Vector | Mecanismo ECMAScript | Trap esperado | Resultado seguro esperado | Riesgo si no se intercepta |
|---|---|---|---|---|---|
| A | Acceso directo a métodos raw (`cliente.$queryRaw`, etc.) | `[[Get]]` | `get` (ya existente) | Lanza `Error` | Ejecución de SQL arbitrario sin scoping organizacional |
| B | `Object.getPrototypeOf(cliente)` | `[[GetPrototypeOf]]` | `getPrototypeOf` (ya existente) | Devuelve `Object.prototype` | Fuga de referencia al prototipo real, exposición indirecta de A |
| C | `Reflect.getPrototypeOf(cliente)` | `[[GetPrototypeOf]]` (idéntico a B) | `getPrototypeOf` | Devuelve `Object.prototype` | Igual que B |
| D | Lectura `cliente.__proto__` | `[[Get]]` con `prop="__proto__"` | `get` (rama explícita, ya existente) | Devuelve `Object.prototype` | Igual que B |
| E | `Object.setPrototypeOf(cliente, x)` | `[[SetPrototypeOf]]` directo | `setPrototypeOf` (ya existente) | Lanza `Error` | Corrupción real del `target`, inyección de propiedades arbitrarias |
| F | `Reflect.setPrototypeOf(cliente, x)` | `[[SetPrototypeOf]]` (idéntico a E) | `setPrototypeOf` | Lanza `Error` | Igual que E |
| G | Escritura `cliente.__proto__ = x` | `[[Set]]` (no `[[SetPrototypeOf]]` directo — ver causa raíz) | `set` (**nuevo**, este diseño) | Lanza `Error`, antes de delegar | Igual que E — **confirmado explotable en la Implementación V1 bloqueada** |
| G' | `Reflect.set(cliente, "__proto__", x[, receiver])` | `[[Set]]` (mismo que G) | `set` (**nuevo**) | Lanza `Error` | Igual que G |
| G'' | Setter heredado de `__proto__` invocado directamente (`descriptor.set.call(cliente, x)`) | `[[SetPrototypeOf]]` directo (el propio setter lo invoca, per Anexo B.3.1) | `setPrototypeOf` (ya existente — **no** el trap `set`) | Lanza `Error` | Igual que E — vía alternativa de invocar el mismo método interno que E/F |
| H | `cliente.constructor.prototype` | `[[Get]]` de `"constructor"` (delegado, ligado vía `.bind(target)`) | `get` (ya existente, sin bloqueo explícito de la clave) | `undefined` (funciones ligadas no tienen `.prototype` propio) | Exposición del prototipo real, **solo si** se remueve el `.bind(target)` existente |
| I | Acceso a métodos legítimos heredados del prototipo real (uso normal) | `[[Get]]` | `get` (ya existente) | Funciona normalmente, ligado a `target` | Ninguno — **no es un vector de ataque**, es el comportamiento correcto que debe preservarse; el riesgo es el inverso (bloquearlo por error) |
| J | Mutaciones indirectas sobre el `Proxy`/`target` no confirmadas empíricamente (p. ej. `Object.defineProperty(cliente, "__proto__", {...})`) | `[[DefineOwnProperty]]` | Ninguno definido en este diseño | No determinado | **Riesgo residual no confirmado** — fuera del alcance de esta investigación (ninguna evidencia empírica de que sea explotable ni de que no lo sea); se marca explícitamente como pendiente de verificación en la Validación Adversarial posterior a la implementación, no se resuelve en este diseño |

---

## 4. Estrategias a comparar

### Estrategia A — Mantener los traps aprobados + trap `set` exclusivo para `"__proto__"`

Conserva `get`, `getPrototypeOf`, `setPrototypeOf` (los 4 ya validados o parcialmente validados de V1) y agrega un trap `set` nuevo que intercepta únicamente la clave `"__proto__"`, delegando el resto sin alterar su semántica. Es la estrategia recomendada por `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`.

### Estrategia B — Trap `set` más amplio, con política explícita para todas las escrituras

En lugar de una denylist mínima (solo `"__proto__"`), define una política explícita (allowlist o validación) para **cualquier** escritura sobre el cliente, no solo la de prototipo.

### Estrategia C — Definir `"__proto__"` como propiedad propia controlada sobre un wrapper o fachada

En lugar de interceptar vía trap `set`, definir explícitamente `"__proto__"` como una propiedad propia (con un descriptor fijo, no configurable) sobre un objeto intermedio que se interponga entre el `Proxy` externo y el `target` real de Prisma.

### Estrategia D — Reemplazar el `Proxy` actual por un wrapper explícito con lista permitida de propiedades y métodos

Misma estrategia ya descartada 2 veces (Estrategia C del Diseño V1, Estrategia 4 de la Revisión de Decisiones Técnicas) — se reconsidera por completitud, sin nueva evidencia que cambie su evaluación.

### Estrategia E — Modificar la extensibilidad o el prototipo del `target` real

Misma estrategia ya descartada 2 veces (Estrategia D del Diseño V1, Estrategia 3 de la Revisión) — se reconsidera por completitud.

### Estrategia F — `Proxy.revocable` o una membrana completa

`Proxy.revocable(target, handler)` construye un `Proxy` idéntico a `new Proxy(target, handler)`, más una función `revoke()` que lo desactiva permanentemente — **no cambia en absoluto el comportamiento de los traps ni resuelve el problema de propagación de `Receiver`**; añade una capacidad (revocar el acceso completo más adelante) que no está relacionada con el vector de escritura de prototipo. Una "membrana completa" (cubrir los 13 traps posibles con lógica consistente) es, en efecto, una versión extendida de la Estrategia B, ya evaluada como Estrategia B en la Revisión de Decisiones Técnicas previa (allí llamada "cobertura completa de membrana") y descartada por complejidad desproporcionada al beneficio marginal frente al vector realmente confirmado.

---

## 5. Análisis de la estrategia principal (Estrategia A: trap `set` explícito con tratamiento especial para `"__proto__"`)

- **¿Intercepta la escritura antes de llegar al Proxy interno de Prisma?** Sí. Nuestro `Proxy` es la capa más externa de toda la cadena (`cliente` → `ext`, Proxy de Prisma → niveles ordinarios → `Object.prototype`). El trap `set` de nuestro `Proxy`, si está definido, se invoca **primero**, antes de cualquier delegación hacia `target` (=`ext`). Si el trap detecta `"__proto__"` y lanza sin delegar, la operación **nunca llega** al trap `set` de Prisma.
- **¿Evita depender de la propagación del `Receiver`?** Sí — precisamente porque la decisión de bloquear ocurre enteramente dentro de nuestra propia capa, antes de que el `Receiver` tenga oportunidad de perderse en ningún punto posterior de la cadena.
- **¿Debe lanzar o devolver `false`?** **Lanzar.** Mismo razonamiento ya usado para el trap `setPrototypeOf` en `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` sección 4, reforzado acá: si el trap `set` devolviera `false`, el comportamiento observable dependería del modo estricto del código llamante (`Object.setPrototypeOf`-equivalente y la asignación directa en módulos ES/TS estrictos lanzarían; `Reflect.set` simplemente devolvería `false` sin lanzar, dejando que un código llamante descuidado lo ignore). Lanzar directamente produce el mismo resultado observable (excepción propagada) sin importar la forma de invocación ni el modo estricto del código que la origina.
- **¿Qué tipo de excepción corresponde?** `Error` genérico — mismo tipo ya usado en todo el archivo (decisión 1.6 de la Revisión, confirmada vigente).
- **¿Debe reutilizar el mensaje de `setPrototypeOf`?** No literalmente el mismo texto, pero sí la misma familia de estilo (`[aislamiento] ...`). Un mensaje distinto, específico para la operación de escritura de `"__proto__"`, aporta mejor trazabilidad de diagnóstico (permite distinguir, en un log de error, si el intento fue vía `setPrototypeOf` explícito o vía asignación de `__proto__`) sin ningún costo adicional.
- **¿Debe existir un mensaje específico para `"__proto__"`?** Sí, recomendado por el motivo anterior.
- **¿Cómo debe delegarse una escritura distinta de `"__proto__"`?** Ver sección 6.
- **¿Debe utilizarse `Reflect.set`?** Sí — es la forma idiomática y correcta de delegar dentro de un trap `set`.
- **¿Con tres o cuatro argumentos?** **Con cuatro** — `Reflect.set(target, prop, value, receiver)`, preservando el `receiver` que el propio trap recibió como 4.º parámetro. Esto es deliberadamente lo **opuesto** al patrón que causó el problema en el código de Prisma (`Reflect.set(target, prop, value)`, 3 argumentos) — nuestra propia capa debe dar el comportamiento correcto, aunque esto no “arregla” el defecto de Prisma en su propia capa (ver más abajo), es la implementación correcta de nuestra parte y evita introducir un problema análogo si en el futuro alguien envolviera nuestro propio `Proxy` con otro adicional.
- **¿Qué `receiver` debe utilizarse al delegar?** El `receiver` recibido como argumento del trap — nunca sustituido por `target` ni por `cliente` de forma fija.
- **¿La delegación podría volver a introducir el problema?** No para el vector ya confirmado (`"__proto__"`, interceptado antes de delegar). Para cualquier otra clave, la delegación hacia el `Proxy` interno de Prisma sigue sujeta al mismo comportamiento de Prisma (pérdida de `receiver` en su propio trap `set`) — pero esto **no es un vector de seguridad**, ya que ninguna otra clave conocida permite mutar el prototipo o exponer los métodos raw; el `receiver` perdido en una escritura legítima de una propiedad arbitraria (si existiera) afectaría, a lo sumo, sobre qué objeto aterriza esa escritura concreta, no sobre la seguridad del mecanismo de H-02.
- **¿Es necesario permitir escrituras legítimas?** Si existieran, sí — el trap debe delegar (no bloquear) cualquier clave que no sea `"__proto__"`, para no romper nada no contemplado.
- **¿Prisma o NestJS realizan escrituras sobre el cliente después de construirlo?** No se detectó ninguna en el código del proyecto ni en las investigaciones previas. No puede afirmarse con el 100% de certeza sin inspeccionar exhaustivamente el código fuente completo de Prisma más allá de lo ya consultado (`createCompositeProxy.ts`) — **esto excede el mandato de esta etapa** ("no continuar investigando la causa raíz", "no repetir experimentos ya realizados"). Se documenta como pregunta no cerrada con certeza absoluta, mitigada por el diseño de la política de delegación (sección 6): al no bloquear ninguna clave salvo `"__proto__"`, cualquier escritura legítima que Prisma necesitara realizar seguiría funcionando sin cambios.
- **¿Qué riesgo de regresión introduce el trap `set`?** Bajo — intercepta una única clave específica; delega, sin alterar semántica, cualquier otra.
- **¿Qué invariantes de `Proxy` deben respetarse?** El trap `set` debe devolver un valor coercible a `Boolean` (o lanzar, una salida abrupta válida y distinta) — cumplido: lanza para `"__proto__"`, devuelve el booleano que `Reflect.set` produzca para el resto. La invariante de que una propiedad no-configurable/no-writable no pueda modificarse queda respetada automáticamente porque se delega vía `Reflect.set`, que ya la hace cumplir internamente sin que nuestro código deba replicarla.

---

## 6. Delegación de escrituras legítimas — política exacta

| Opción | Semántica | Compatibilidad con `Proxy` interno de Prisma | Riesgo sobre `receiver` | Riesgo de recursión | Riesgo de modificación del `target` | Compatibilidad NestJS | Compatibilidad Prisma | Impacto de mantenimiento |
|---|---|---|---|---|---|---|---|---|
| `Reflect.set(target, prop, value, receiver)` (4 args) | Correcta y completa — preserva `receiver` | Sujeta al mismo defecto de Prisma en su propia capa (fuera de nuestro control), pero eso ya no es un problema de seguridad de H-02 | Ninguno de nuestro lado | Ninguno | Ninguno adicional al comportamiento normal de Prisma | Sin impacto | Alta — usa el mecanismo estándar de Prisma tal cual | Bajo — patrón estándar, 1 línea |
| `Reflect.set(target, prop, value)` (3 args) | Pierde el `receiver`, delegándolo implícitamente a `target` | Repite exactamente el mismo patrón que causó el problema original, si en el futuro alguien envuelve este `Proxy` con otro adicional | Alto — mismo defecto que el hallazgo de esta cadena de investigación | Ninguno | Igual que la opción anterior | Sin impacto | Alta, pero por el motivo equivocado | Bajo, pero **no recomendado** por inconsistencia de principios |
| `target[prop] = value` (asignación directa) | Equivalente, en la práctica, a `Reflect.set` con `receiver = target` (pierde el `receiver` explícitamente) | Mismo riesgo que la opción de 3 argumentos | Alto | Ninguno | Igual | Sin impacto | Alta, mismo motivo | **No recomendado**, mismo motivo |
| Rechazo total de cualquier escritura | Máxima simplicidad | No aplica (nada se delega) | No aplica | No aplica | Ninguno | Riesgo si Prisma/NestJS necesitaran escribir algo no detectado | Riesgo de romper algo no confirmado | Bajo, pero **potencialmente demasiado agresivo** sin confirmación de que ninguna escritura legítima exista |
| Lista permitida (allowlist) de claves escribibles | Intermedia | Requiere mantener la lista actualizada | Ninguno para las claves permitidas | Ninguno | Ninguno | Sin impacto | Frágil ante cambios internos de Prisma no anticipados | **Mayor complejidad de mantenimiento sin beneficio de seguridad claro** para el objetivo específico de este hallazgo |

**Política recomendada:** **denylist mínima** — bloquear únicamente `"__proto__"`, delegar cualquier otra clave vía `Reflect.set(target, prop, value, receiver)` (4 argumentos). Es la opción que cierra exactamente el vector confirmado, sin arriesgar romper ninguna escritura legítima no detectada, y que da el ejemplo correcto de propagación de `receiver` desde la capa que el propio proyecto controla.

---

## 7. Política para `"__proto__"`

- **Condición de detección:** `prop === "__proto__"` — comparación exacta contra el `PropertyKey`. `"__proto__"` nunca es un `Symbol`, así que comparar directamente contra el string literal es seguro y consistente con el patrón ya usado en el trap `get` existente (que ya hace exactamente esta comparación para la lectura).
- **Comportamiento esperado:** lanzar, como primera rama del trap `set`, **antes** de cualquier posible delegación.
- **Tipo de excepción:** `Error` genérico.
- **Mensaje:** patrón `[aislamiento]`, específico para la operación de escritura de `"__proto__"` — distinto en texto, pero de la misma familia de estilo que el de `setPrototypeOf`.
- **Consistencia con `setPrototypeOf`:** mismo criterio de "lanzar siempre, sin excepciones de caso", mismo prefijo, misma ausencia de información interna expuesta.
- **Comportamiento en modo estricto:** lanzar produce el mismo resultado observable (excepción propagada) sin importar el modo estricto del código llamante — no depende de cómo `PutValue`/`[[Set]]` evalúe el booleano de retorno según el modo, porque el trap nunca llega a devolver un booleano para esta clave, lanza directamente.
- **Comportamiento en modo no estricto:** idéntico al anterior, sin diferencia.
- **Comportamiento con `Reflect.set`:** `Reflect.set(cliente, "__proto__", valor[, receiver])` invoca el trap `set` de nuestro `Proxy` directamente (sea cual sea el `receiver` provisto o por defecto) — el trap detecta la clave y lanza, sin importar el valor de `receiver` recibido.
- **Garantía de no delegación al `target`:** estructural — el chequeo de `"__proto__"` se ubica como la primera rama del trap, con `throw` inmediato, de forma que la línea de delegación (`Reflect.set(target, ...)`) nunca se alcanza para esta clave específica.
- **Garantía de no modificación del `Proxy` interno de Prisma:** consecuencia directa de la garantía anterior — si la operación nunca se delega, el `Proxy` interno de Prisma nunca recibe el intento, y por lo tanto no puede, bajo ninguna circunstancia, mutar nada a partir de él.

**Casos explícitos analizados:**

| Caso | Mecanismo | Trap invocado | Cubierto por este diseño |
|---|---|---|---|
| `cliente.__proto__ = {}` | `[[Set]]` sobre `cliente` | `set` (nuevo) | Sí |
| `Reflect.set(cliente, "__proto__", {})` | `[[Set]]` sobre `cliente` | `set` (nuevo) | Sí |
| `Reflect.set(cliente, "__proto__", {}, otroReceiver)` | `[[Set]]` sobre `cliente` (el `receiver` explícito no cambia que el trap se invoque sobre `cliente`) | `set` (nuevo) — el chequeo de la clave no depende del valor de `receiver` | Sí |
| `Object.prototype.__proto__` setter invocado mediante `.call(cliente, {})` | Llamada de función directa sobre el setter heredado — **no pasa por `[[Set]]` en absoluto**; el setter, por Anexo B.3.1, hace `O = ToObject(this value) = cliente` y luego `O.[[SetPrototypeOf]](proto)` — esto invoca `[[SetPrototypeOf]]` **directamente** sobre `cliente` | `setPrototypeOf` (ya existente, **no** el trap `set` nuevo) | Sí, por un mecanismo distinto — importante distinguirlo: esta vía nunca pasa por `"__proto__"` como clave de propiedad, invoca el método interno directamente |
| `Object.prototype.__lookupSetter__("__proto__")` | Solo obtiene una **referencia** al setter — no lo invoca, no muta nada por sí sola | Ninguno necesario — no es un vector de escritura en sí mismo | Fuera del modelo de amenaza de escritura (es introspección, ya cubierta indirectamente: obtener la referencia no permite nada que la fila anterior no cubra ya al momento de invocarla) |
| Descriptor del setter heredado (`Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")`) | Lectura de metadatos públicos, no ejecuta nada | Ninguno necesario | Fuera del modelo de amenaza — información pública, sin capacidad de mutar nada por sí sola |

**Qué queda cubierto y qué queda fuera, justificado:** todos los casos de **invocación** de una mutación (asignación directa, `Reflect.set`, invocación explícita del setter heredado) quedan cubiertos, por 2 mecanismos complementarios (trap `set` nuevo para los que pasan por `[[Set]]`; trap `setPrototypeOf` ya existente para el que invoca `[[SetPrototypeOf]]` directamente). Los casos de mera **introspección** (obtener una referencia al setter, leer su descriptor) quedan deliberadamente fuera del modelo de amenaza de escritura, porque no ejecutan ninguna mutación por sí solos — ya están, además, cubiertos por el análisis de la vía de invocación explícita, que si se ejerciera, cae en la fila ya cubierta.

---

## 8. Interacción entre traps

| Vector | Trap que lo intercepta | Resultado esperado | ¿Delega al `target`? | Riesgo residual |
|---|---|---|---|---|
| A — Acceso directo a los 4 métodos raw | `get` | Lanza | No | Ninguno confirmado |
| B — `Object.getPrototypeOf` | `getPrototypeOf` | `Object.prototype` | No | Ninguno |
| C — `Reflect.getPrototypeOf` | `getPrototypeOf` | `Object.prototype` | No | Ninguno |
| D — Lectura `__proto__` | `get` (rama especial) | `Object.prototype` | No | Ninguno |
| E — `Object.setPrototypeOf` | `setPrototypeOf` | Lanza | No | Ninguno |
| F — `Reflect.setPrototypeOf` | `setPrototypeOf` | Lanza | No | Ninguno |
| G — Escritura `__proto__ =` | `set` (**nuevo**) | Lanza | No | Pendiente de confirmar empíricamente en Validación Adversarial de la próxima implementación |
| G' — `Reflect.set(cliente, "__proto__", x[, r])` | `set` (**nuevo**) | Lanza | No | Igual que G |
| G'' — Setter heredado invocado vía `.call(cliente, x)` | `setPrototypeOf` (ya existente) | Lanza | No | Pendiente de confirmar empíricamente (mecanismo ya implementado, pero este caso específico de invocación no fue probado en la Implementación V1) |
| H — `constructor.prototype` | `get` (vía `.bind(target)` ya existente) | `undefined` | Sí (delega `constructor`, pero el `.bind()` neutraliza `.prototype`) | Bajo — depende de que el `.bind(target)` no se remueva sin saberlo |
| I — Métodos legítimos heredados (uso normal) | `get` | Funciona normalmente | Sí | Ninguno (comportamiento deseado, no un riesgo) |
| Escritura legítima de otra propiedad (si existiera) | `set` (**nuevo**) | Delega vía `Reflect.set` (4 args) | Sí | Bajo — sujeto al comportamiento de Prisma en su propia capa, fuera de nuestro control, sin relación con la seguridad de H-02 |
| J — Mutaciones indirectas no confirmadas (`defineProperty` sobre `"__proto__"`, etc.) | Ninguno definido en este diseño | No determinado | Sí (delega al `target`, sin protección específica) | **Riesgo residual no confirmado — explícitamente fuera del alcance de este diseño, marcado para verificación en Validación Adversarial posterior** |

---

## 9. Invariantes ECMAScript

- **Extensibilidad esperada del `target`:** se mantiene el mismo supuesto ya verificado en `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` (extensible), con la misma reserva ya documentada de reverificar en cada actualización de Prisma.
- **Compatibilidad del retorno `Object.prototype` (trap `getPrototypeOf`):** sin cambios respecto de lo ya confirmado — el trap `set` nuevo no interactúa con esta invariante.
- **Ausencia de propiedades propias no configurables conflictivas:** `"__proto__"` no es una propiedad propia de `target` (es heredada) — no hay conflicto de invariante de configurabilidad respecto de esta clave específica en el propio objeto extendido.
- **Comportamiento cuando una propiedad es no-`writable`:** para claves distintas de `"__proto__"`, delegado correctamente vía `Reflect.set`, que ya respeta esta invariante internamente (devuelve `false` si corresponde, sin que nuestro trap deba replicar esa lógica).
- **Comportamiento cuando existe un accessor sin setter:** mismo argumento — `Reflect.set` lo maneja correctamente por sí solo.
- **Comportamiento del trap `set` si el `target` cambia en una futura versión de Prisma:** el mecanismo de la Estrategia A **no depende** de que Prisma siga rompiendo la propagación de `receiver` — intercepta `"__proto__"` **antes** de delegar, sin importar qué haga `target` internamente. Si una versión futura de Prisma corrigiera su propio trap `set` (usando `Reflect.set` de 4 argumentos), el mecanismo seguiría funcionando exactamente igual (interceptaría igual, antes de siquiera necesitar que Prisma "coopere"). Esto es una mejora estructural respecto del enfoque original de V1, que sí dependía implícitamente (sin saberlo) de un comportamiento no garantizado de Prisma.
- **`TypeError` exigidos por la especificación:** ninguno nuevo — lanzar desde un trap es siempre una salida abrupta válida, sin restricción adicional de la especificación sobre cuándo un trap puede optar por lanzar en lugar de retornar.
- **No se asume que futuras versiones de Prisma conservarán exactamente los mismos descriptors:** correcto y explícito — el diseño de la Estrategia A no depende de ningún descriptor específico de Prisma, solo depende de que nuestro `Proxy` sea la capa más externa (garantizado por construcción, el propio proyecto controla el orden de envoltura).
- **Condición de detención si una invariante deja de cumplirse:** si en Pre-Implementación o Implementación se detecta un `TypeError` de invariante de `Proxy` no anticipado en este diseño, debe documentarse y detenerse la implementación — no improvisar una corrección en el momento (mismo criterio ya aplicado en toda la cadena de H-02).

---

## 10. `constructor.prototype`

**Revisión de la decisión de no bloquear `"constructor"` explícitamente:**

- **Funciones ligadas:** sin cambios — confirmado en 2 etapas previas que `Function.prototype.bind` nunca produce una función con `.prototype` propio, por garantía de especificación ECMAScript (no de Prisma).
- **Propiedades no función llamadas `"constructor"`:** no existe tal caso en el objeto real — `ext.constructor` es siempre una función (confirmado empíricamente, `constructor.name === "t"`).
- **Constructor heredado:** el trap `get` trata `"constructor"` igual sea propio o heredado (solo verifica `typeof valor === "function"` antes de ligar) — sin diferencia relevante.
- **Modificaciones futuras de Prisma:** el riesgo es, en realidad, **más bajo** de lo que el análisis original (V1) le atribuyó — la garantía de que las funciones ligadas carecen de `.prototype` propio **no depende de ningún detalle de Prisma**, es una propiedad dura del lenguaje (`BoundFunctionExoticObject`, ECMA-262) aplicable a cualquier función, sin importar su origen. A diferencia del vector de escritura de `__proto__` (que sí dependía de un detalle de implementación de Prisma, y por eso falló), este vector no tiene ese mismo riesgo estructural.
- **Riesgo de que una función deje de enlazarse:** el único riesgo real es que un cambio futuro **del propio código del proyecto** remueva el `.bind(target)` del trap `get` sin saber que también cumple esta función — mitigado por el comentario ya planeado (Decisiones Técnicas V1, sección 5, aún vigente).
- **Necesidad de test permanente:** sí, ya contemplado (test unitario #13 de la sección 12).

**Conclusión de esta sección: mantener la decisión sin cambios.** No se agrega ninguna defensa adicional — sería complejidad innecesaria sobre un vector cerrado por una garantía dura del lenguaje, categóricamente distinta (más sólida) que la garantía que falló para `__proto__ =` (que dependía de un detalle de implementación de un tercero, no de la especificación).

---

## 11. Transacciones

Mismo diseño de validación ya usado y ya confirmado exitoso en la Implementación V1 bloqueada (sección 14 de ese documento: *"todos estos resultados fueron positivos y no están en cuestión"*), reutilizado sin cambios para V2, con una confirmación adicional específica del trap `set` nuevo:

- **`$transaction(callback)` continúa funcionando:** test de integración (no puede mockearse de forma representativa).
- **`$transaction(array)` continúa funcionando:** test de integración.
- **`tx` no queda envuelto:** test de integración — verificado por identidad (`tx !== cliente`) y por `Object.getPrototypeOf(tx) !== Object.prototype` (si `tx` estuviera envuelto por nuestro `Proxy`, este trap lo interceptaría; al no estarlo, su prototipo real permanece intacto).
- **`tx.$queryRaw` continúa permitido:** test de integración, ejecutando SQL real.
- **`tx.$executeRaw` continúa permitido:** test de integración.
- **El cliente superior continúa bloqueando los 4 métodos raw:** test de integración, regresión sobre el objeto real (no solo el mock).
- **El trap `set` nuevo no afecta al `TransactionClient`:** confirmado por el mismo argumento estructural ya usado repetidamente en esta cadena (`tx` nunca pasa por nuestro `Proxy`, en ningún punto del código, bajo ninguna forma de invocación de `$transaction`) — el trap `set` nuevo solo intercepta `[[Set]]` sobre **nuestro** `Proxy`, nunca sobre `tx`, que es un objeto completamente distinto construido por Prisma internamente.
- **No se altera el `this` de métodos legítimos:** cubierto por el test unitario #14 (método legítimo continúa correctamente ligado) y por el hecho de que el trap `set` nuevo no toca en absoluto el trap `get` (donde vive la lógica de `.bind(target)`).

**Distinción unitario/integración:** ninguno de estos 8 puntos puede validarse de forma representativa con un mock — todos requieren el mecanismo real de `$transaction` de Prisma, que no es replicable de forma fiel sin el objeto real (mismo aprendizaje ya aplicado en toda esta cadena: un mock simplificado esconde, precisamente, las características que importan).

---

## 12. Tests unitarios propuestos

| # | Caso | ¿Puede usar mock? | Justificación |
|---|---|---|---|
| 1 | `$queryRaw` bloqueado (acceso directo) | Sí | El chequeo ocurre en el trap `get`, antes de cualquier delegación — no depende de si `target` es o no un `Proxy` con problemas de `receiver` |
| 2 | `$executeRaw` bloqueado | Sí | Igual que #1 |
| 3 | `$queryRawUnsafe` bloqueado | Sí | Igual que #1 |
| 4 | `$executeRawUnsafe` bloqueado | Sí | Igual que #1 |
| 5 | `Object.getPrototypeOf` devuelve `Object.prototype` | Sí | `[[GetPrototypeOf]]` no involucra el problema de `receiver` de `[[Set]]` |
| 6 | `Reflect.getPrototypeOf` devuelve `Object.prototype` | Sí | Igual que #5 |
| 7 | Lectura de `__proto__` devuelve `Object.prototype` | Sí | `[[Get]]`, no `[[Set]]` |
| 8 | `Object.setPrototypeOf` rechazado | Sí, **pero reconfirmar también en integración** (#8 de la sección 13) por prudencia adicional, dado lo ocurrido | Ya confirmado en V1 que funciona igual contra mock y contra real (invoca `[[SetPrototypeOf]]` directamente) — la reconfirmación en integración es una medida de rigor adicional, no estrictamente necesaria por el mecanismo en sí |
| 9 | `Reflect.setPrototypeOf` rechazado | Sí, mismo criterio que #8 | Igual que #8 |
| 10 | `cliente.__proto__ = {}` rechazado | **No — debe usar el objeto real de Prisma, obligatoriamente** | Es exactamente el vector que el mock no detectó en la Implementación V1 |
| 11 | `Reflect.set(cliente, "__proto__", {})` rechazado | **No — debe usar el objeto real** | Mismo motivo que #10 — mismo mecanismo subyacente |
| 12 | Llamada directa al setter heredado (`descriptor.set.call(cliente, {})`) rechazada | **No — debe usar el objeto real** | Para confirmar que el trap `setPrototypeOf` ya existente efectivamente intercepta este camino específico también contra el objeto real, no solo en la teoría de la sección 7 |
| 13 | `constructor.prototype` no expone el prototipo real | Sí (garantía de especificación, no de Prisma — sección 10), reconfirmar en integración por prudencia | — |
| 14 | Un método legítimo continúa enlazado | Sí, para el caso básico; el caso realmente relevante (Prisma real funcionando) se cubre en integración | — |
| 15 | Una escritura legítima (si existe) mantiene el comportamiento aprobado | Sí — prueba general de que el trap `set` no bloquea todo, no depende del defecto específico de Prisma | Si Pre-Implementación no confirma ninguna escritura legítima real conocida, este test puede ser sintético (una clave arbitraria de prueba) |
| 16 | El `target` no resulta modificado después de cada ataque | **No — debe usar el objeto real** | Verificación de integridad más directa relacionada con el hallazgo original — replica exactamente la verificación que reveló el problema en la Implementación V1 (`$connect`/`$disconnect`/`$transaction` siguen siendo funciones después de cada intento) |

---

## 13. Tests de integración propuestos

Contra Prisma real (`prisma.$extends({ name: "..." })`, extensión mínima — no requiere los 14 hooks del proyecto ni necesariamente Postgres activo para los casos 1-7 y 13-14, que operan sobre la estructura del objeto; sí requiere Postgres para 8-12, que ejecutan operaciones reales):

1. Reproducir la estructura `Proxy` externo sobre `Proxy` interno (confirmar, como en la investigación, que `ext` es un `Proxy` — para detectar si una futura versión de Prisma cambiara esta característica estructural).
2. `cliente.__proto__ = {}` bloqueado.
3. `Reflect.set(cliente, "__proto__", {})` bloqueado.
4. El prototipo real no cambia después de los intentos 2 y 3.
5. `$connect` continúa disponible internamente (invocable, sigue siendo función) después de los intentos.
6. `$disconnect` continúa disponible internamente después de los intentos.
7. `$transaction` continúa disponible después de los intentos.
8. `$transaction(callback)` funciona (requiere Postgres).
9. `$transaction(array)` funciona (requiere Postgres).
10. `tx.$queryRaw` funciona (requiere Postgres).
11. `tx.$executeRaw` funciona (requiere Postgres).
12. Bloqueo de los 4 métodos raw en el cliente superior, confirmado sobre el objeto real (no solo el mock).
13. Ninguna propiedad del objeto malicioso usado en los intentos de ataque aparece accesible en `cliente` después de ellos (regresión directa del síntoma observado en V1: `cliente.marcador === "CONTAMINADO"`).
14. Los traps correctos se ejecutan para cada vector (instrumentación temporal, igual metodología ya usada en la investigación — **no** forma parte de la suite permanente, es evidencia de la etapa de Implementación).
15. **Confirmar el comportamiento en el código compilado (`dist/`) ejecutado directamente con `node`, fuera de Jest** — obligatorio, no opcional. No se acepta como evidencia suficiente que la suite de Jest pase — el propio hallazgo de esta cadena de investigaciones fue, precisamente, que Jest + mock no detectó el problema mientras que Node + objeto real sí. Esta verificación no forma parte de la suite permanente de `npm test` (no es apropiado atarla a ese comando), pero es un paso obligatorio de evidencia de la Implementación, documentado explícitamente, con el mismo método ya usado en `INVESTIGACION_H02_PROTO_SETTER.md`/`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md` (scripts temporales, eliminados después).

---

## 14. Validación adversarial (matriz completa para la etapa posterior a la implementación)

| Expresión | Resultado esperado | Trap esperado | ¿Puede modificar el `target`? | Evidencia a registrar |
|---|---|---|---|---|
| `cliente.$queryRaw` | Lanza | `get` | No | Mensaje de error exacto |
| `cliente.$executeRaw` | Lanza | `get` | No | Mensaje de error exacto |
| `cliente.$queryRawUnsafe` | Lanza | `get` | No | Mensaje de error exacto |
| `cliente.$executeRawUnsafe` | Lanza | `get` | No | Mensaje de error exacto |
| `Object.getPrototypeOf(cliente)` | `Object.prototype` | `getPrototypeOf` | No | Valor devuelto, `typeof .$queryRaw` sobre el resultado |
| `Reflect.getPrototypeOf(cliente)` | `Object.prototype` | `getPrototypeOf` | No | Igual que arriba |
| `cliente.__proto__` (lectura) | `Object.prototype` | `get` | No | Igual que arriba |
| `Object.setPrototypeOf(cliente, {})` | Lanza | `setPrototypeOf` | No | Mensaje de error, estado de `target` antes/después |
| `Reflect.setPrototypeOf(cliente, {})` | Lanza | `setPrototypeOf` | No | Igual que arriba |
| `cliente.__proto__ = {}` | Lanza | `set` (**nuevo**) | No | Mensaje de error, estado de `target` antes/después (`$connect` sigue siendo función) |
| `Reflect.set(cliente, "__proto__", {})` | Lanza | `set` (**nuevo**) | No | Igual que arriba |
| `Reflect.set(cliente, "__proto__", {}, cliente)` | Lanza | `set` (**nuevo**) — el `receiver` explícito no cambia que el trap se invoque | No | Igual que arriba, confirmando explícitamente que el `receiver` provisto no influye en la detección |
| `const setter = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")?.set; setter?.call(cliente, {})` | Lanza | `setPrototypeOf` (no `set` — invoca `[[SetPrototypeOf]]` directamente, per Anexo B.3.1) | No | Mensaje de error, y confirmación explícita de **cuál** trap se disparó (para verificar que el mecanismo es el esperado, no una coincidencia) |
| `cliente.constructor` | Función ligada (`bound ...`), sin `.prototype` propio | `get` | No | `typeof`, `.name` |
| `cliente.constructor.prototype` | `undefined` | (consecuencia del `.bind`, no un trap nuevo) | No | Valor exacto |

---

## 15. Alcance de archivos

- **¿Puede implementarse todo dentro de esa función?** Sí — el trap `set` nuevo es, estructuralmente, una propiedad más del mismo objeto `handler` ya existente dentro de `bloquearMetodosRawDeNivelSuperior()`, igual que los traps `getPrototypeOf`/`setPrototypeOf` ya agregados en V1.
- **¿Es necesario modificar otro archivo productivo?** No, según todo lo analizado en este diseño.
- **¿Es necesario crear helpers?** No de forma obligatoria — podría extraerse una función auxiliar pequeña dentro del mismo archivo para legibilidad (p. ej., una constante o función que identifique "claves de prototipo"), pero no requiere un archivo nuevo ni es indispensable.
- **¿Es necesario exportar internals para test?** Potencialmente, para pruebas unitarias aisladas de `bloquearMetodosRawDeNivelSuperior()` sin pasar por `crearClienteOrganizacional()` — pero dado que los tests críticos (los de escritura de `__proto__`, sección 12) deben usar de todas formas el objeto real de Prisma vía `$extends()`, puede optarse por probar siempre a través de `crearClienteOrganizacional()` con un `PrismaService` real o con un mock mínimo de `$extends`, sin necesitar exportar la función interna. Se deja como decisión de la etapa de Pre-Implementación, no se cierra en este diseño.
- **¿Es necesario modificar `PrismaService`?** No.
- **¿Es necesario modificar el módulo NestJS (`organizacion-prisma.module.ts`)?** No — mismo argumento ya confirmado en el Diseño V1: el `factory` de inyección de dependencias sigue recibiendo un objeto con la misma forma pública.
- **¿Es necesario modificar el flujo de transacciones?** No — confirmado extensamente (sección 11) que `tx` nunca pasa por este `Proxy`, bajo ninguna forma de invocación.

**Conclusión: se mantiene el alcance original — archivo único (`organizacion-prisma.client.ts`), función única (`bloquearMetodosRawDeNivelSuperior()`).** No se fuerza esta conclusión: cada pregunta fue respondida con el respaldo del análisis de las secciones anteriores, sin ninguna evidencia documental que la contradiga.

---

## 16. Compatibilidad

| Componente | Impacto esperado |
|---|---|
| `PrismaClient` (real, `PrismaService`) | Ninguno — nunca se toca directamente |
| Cliente extendido (`ext`, resultado de `$extends()`) | Ninguno — nunca se muta; el trap `set` nuevo solo decide si delega hacia él o no, nunca lo modifica |
| NestJS | Ninguno — la inyección de dependencias sigue recibiendo un objeto con la misma forma pública |
| Ciclo de vida (`$connect`/`$disconnect`) | Ninguno — confirmado en la Implementación V1 antes del bloqueo, y en la investigación posterior, que estos métodos funcionan correctamente mientras no se ejecute el ataque específico que este diseño cierra |
| `$transaction` | Ninguno — confirmado repetidamente que `tx` nunca pasa por este `Proxy` |
| Queries normales (métodos de modelo) | Ninguno — el trap `set` nuevo no intercepta lecturas ni invocaciones de método, solo escrituras de propiedad, y delega cualquier escritura que no sea `"__proto__"` |
| Métodos enlazados (`.bind(target)`) | Ninguno — el trap `set` nuevo no toca el trap `get`, donde vive esa lógica |
| Serialización (`JSON.stringify`) | Ninguno — no depende de `[[Set]]` en absoluto |
| Inspección (`util.inspect`/`console.log`) | Ninguno nuevo — mismo efecto cosmético ya evaluado y aceptado en V1 para `getPrototypeOf` (prefijo de clase reflejando `Object.prototype`); el trap `set` no participa en la inspección |
| Logging | Ninguno — ningún punto de logging del proyecto asigna propiedades sobre el cliente inyectado |
| Rendimiento | Despreciable — una comparación de string más en un trap que ya existe conceptualmente (mismo orden de costo que los demás chequeos ya aceptados) |
| Futuras actualizaciones de Prisma | El mecanismo es **robusto** frente a cambios internos de `createCompositeProxy` (sección 9) — no depende de que Prisma mantenga ni corrija su comportamiento actual de `receiver` |

---

## 17. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Evidencia necesaria |
|---|---|---|---|---|
| El trap `set` bloquea una escritura legítima no detectada | Baja | Medio (podría romper algo no identificado) | Denylist mínima (solo `"__proto__"`), delegación explícita de todo lo demás | Test unitario #15 (escritura legítima, sintética si no hay una real conocida), verificación en Pre-Implementación de si existe alguna escritura real conocida |
| Delegación incorrecta de `receiver` en nuestro propio trap | Baja | Alto si ocurriera (reintroduciría un problema análogo) | Uso explícito de `Reflect.set` con 4 argumentos, nunca 3 | Test unitario/integración #15, revisión de código en Pre-Implementación |
| Recursión (el trap `set` se invoca a sí mismo indirectamente) | Muy baja | Medio | La delegación vía `Reflect.set(target, ...)` opera sobre `target`, no sobre `cliente` — no hay ningún camino de vuelta hacia el `Proxy` externo | Revisión de código, sin necesidad de test adicional (estructuralmente imposible con este diseño) |
| Mutación accidental del `target` | Baja | Alto (repetiría el síntoma exacto de V1) | El trap `set` nuevo nunca escribe nada por sí mismo — solo decide lanzar o delegar | Tests #10, #11, #16 de la sección 12; #2-4, #13 de la sección 13 |
| Cambio interno de Prisma en una versión futura | Baja en el corto plazo | Medio | El mecanismo no depende del comportamiento actual de `createCompositeProxy` (sección 9) — robusto por diseño | Reverificación en cada actualización de `@prisma/client`, mismo criterio ya documentado para el resto de H-02 |
| Diferencia entre Jest y Node (repetición del patrón que causó el bloqueo de V1) | Media si no se corrige la estrategia de testing | Alto (repetiría exactamente el mismo error metodológico) | Tests críticos (10, 11, 12, 16 de la sección 12) obligados a usar el objeto real, no un mock; verificación adicional obligatoria en Node compilado fuera de Jest (sección 13, punto 15) | Ejecución real de ambos entornos, documentada explícitamente en la Implementación |
| Falsa cobertura mediante mocks | Media si no se sigue la clasificación de la sección 12 | Alto | Clasificación explícita, por vector, de qué test puede/no puede usar mock (sección 12) | Revisión de la suite de tests en Pre-Implementación contra esta clasificación, antes de darla por completa |
| Regresión de transacciones | Baja | Alto si ocurriera | Mismo diseño de validación ya usado y confirmado exitoso en V1 (sección 11) | Tests de integración 8-12 de la sección 13 |
| Exposición de otro vector de prototipo no contemplado (vector J, sección 3/8) | Baja pero no descartada | Medio-alto si existiera | No mitigado por este diseño — marcado explícitamente como riesgo residual no confirmado | Verificación adicional en la Validación Adversarial posterior a la implementación (fuera del alcance de este diseño resolverlo ahora) |
| Violación futura de invariantes de `Proxy` | Baja | Medio | Mismo criterio de detención ya aplicado (sección 9) — no asumir estabilidad, reverificar ante cualquier cambio de versión | Repetir la verificación de extensibilidad en cada actualización relevante |

---

## 18. Estrategia seleccionada

**Nombre:** Estrategia A — Trap `set` explícito para `"__proto__"`, complementario a los traps ya validados (`get`, `getPrototypeOf`, `setPrototypeOf`).

- **Componentes exactos:** el mismo `handler` de `Proxy` ya existente en `bloquearMetodosRawDeNivelSuperior()`, con 4 traps: `get` (existente, con la rama de `"__proto__"` de lectura ya diseñada en V1), `getPrototypeOf` (existente, sin cambios), `setPrototypeOf` (existente, sin cambios), `set` (**nuevo**, agregado en esta versión).
- **Traps necesarios:** los 4 mencionados arriba — ninguno adicional (`has`, `ownKeys`, `getOwnPropertyDescriptor`, `defineProperty`, `preventExtensions`, `isExtensible` permanecen deliberadamente sin cubrir, mismo criterio ya justificado en V1 por no representar vectores de invocación confirmados).
- **Política de delegación:** denylist mínima en el trap `set` — bloquear únicamente `"__proto__"`, delegar cualquier otra clave vía `Reflect.set(target, prop, value, receiver)` (4 argumentos, preservando el `receiver` recibido).
- **Política de errores:** `Error` genérico, patrón `[aislamiento]`, mensaje específico para la operación de escritura de `"__proto__"` (distinto del texto usado por `setPrototypeOf`, pero de la misma familia de estilo).
- **Alcance:** archivo único (`backend/src/prisma/organizacion-prisma.client.ts`), función única (`bloquearMetodosRawDeNivelSuperior()`).
- **Tests obligatorios:** 16 unitarios (sección 12, con la distinción explícita mock/objeto-real por caso) + 15 de integración (sección 13, incluyendo la verificación obligatoria en Node compilado fuera de Jest).
- **Criterios de aceptación:** sección 20.
- **Criterios de detención:** sección 21.

**Razones para descartar las demás:**
- **Estrategia B (trap `set` amplio con política general):** mayor complejidad y carga de mantenimiento (mantener una política para *todas* las escrituras, no solo una clave) sin beneficio de seguridad adicional demostrado — el vector confirmado es específico a una única clave (`"__proto__"`).
- **Estrategia C (`"__proto__"` como propiedad propia sobre un wrapper/fachada):** requeriría introducir una capa de indirección adicional (el wrapper) que el mecanismo actual no tiene — mayor complejidad estructural que un trap `set` directo, sin cerrar el vector de forma más robusta que la Estrategia A.
- **Estrategia D (wrapper explícito completo, allowlist total):** descartada por tercera vez consecutiva en esta cadena de documentos — alto costo (reescritura de 14 operaciones × ~22 modelos), alto riesgo de regresión, desproporcionado frente al problema puntual ya acotado con precisión.
- **Estrategia E (restringir extensibilidad/prototipo del `target` real):** descartada por tercera vez — riesgo alto y no cuantificable de romper funcionalidad interna de Prisma no verificada.
- **Estrategia F (`Proxy.revocable`/membrana completa):** `Proxy.revocable` no resuelve nada del problema en sí (añade una capacidad no relacionada); la membrana completa es la misma Estrategia B de la Revisión de Decisiones Técnicas previa, ya descartada por complejidad desproporcionada.

---

## 19. Plan de implementación (enumeración, no ejecución)

1. Confirmar baseline (`git status --short`, `git diff` sobre el archivo productivo único).
2. Modificar únicamente la función autorizada (`bloquearMetodosRawDeNivelSuperior()`).
3. Agregar el trap `set` nuevo, con el chequeo de `"__proto__"` y la delegación de 4 argumentos para el resto.
4. Revisar el diff productivo (debe limitarse exactamente a lo descrito en el punto 3, sin tocar los traps `get`/`getPrototypeOf`/`setPrototypeOf` ya existentes).
5. Crear los tests unitarios (sección 12), respetando la distinción mock/objeto-real por caso.
6. Crear los tests con Prisma real (sección 13).
7. Compilar (`npm run build`).
8. Ejecutar los tests específicos del archivo nuevo.
9. Ejecutar la integración (contra Postgres real).
10. Ejecutar la suite completa (`npm test`).
11. Repetir la validación adversarial (sección 14) en código compilado ejecutado directamente con Node, fuera de Jest.
12. Verificar invariantes (extensibilidad del `target`, ausencia de `TypeError` inesperados).
13. Revisar el diff final y `git status --short`.
14. Documentar la implementación.

No se ejecuta este plan en este documento.

---

## 20. Criterios de aceptación

- Los 4 métodos raw quedan bloqueados en el cliente superior (regresión).
- La lectura del prototipo real queda saneada (`getPrototypeOf`, `Reflect.getPrototypeOf`, lectura de `__proto__`) — regresión de V1.
- `Object.setPrototypeOf`/`Reflect.setPrototypeOf` quedan bloqueados — regresión de V1.
- La escritura `cliente.__proto__ = ...` queda bloqueada.
- `Reflect.set(cliente, "__proto__", ...)` queda bloqueado.
- El setter heredado de `__proto__`, invocado explícitamente vía `.call`, queda bloqueado (por el trap `setPrototypeOf` ya existente).
- El prototipo real del `target` permanece intacto después de cada intento de ataque de la matriz de la sección 14.
- El `target` permanece intacto (métodos legítimos siguen siendo funciones) después de cada intento.
- Los métodos Prisma legítimos siguen operativos.
- Las transacciones (`$transaction`, en sus 2 formas) siguen operativas.
- `tx.$queryRaw`/`tx.$executeRaw` siguen operativos dentro de una transacción legítima.
- El build queda aprobado.
- Los tests específicos del archivo nuevo quedan aprobados.
- La integración contra Postgres real queda aprobada.
- La suite completa (`npm test`) queda aprobada.
- La verificación en Node compilado (fuera de Jest) queda aprobada.
- No hay ampliación de alcance (ningún archivo fuera de los ya autorizados resulta modificado).

---

## 21. Criterios de detención

Detener una futura implementación si ocurre cualquiera de estos casos:

- El baseline no coincide con lo documentado en este diseño.
- La estrategia exige modificar internamente el código de Prisma.
- Se requiere tocar H-07 de cualquier forma.
- Se requiere modificar `schema.prisma`.
- Se requiere crear una migración.
- Se requiere envolver `tx` de cualquier forma.
- Falla alguna transacción legítima.
- Se bloquea una operación de Prisma legítima no contemplada.
- El `target` resulta modificado por cualquier vector probado.
- El prototipo real cambia por cualquier vector probado.
- `Reflect.set` (u otra API) encuentra un nuevo camino de bypass no contemplado en este diseño.
- El setter heredado de `__proto__` encuentra un nuevo camino de bypass no contemplado.
- Aparece una invariante de `Proxy` no contemplada en este diseño.
- Se requiere ampliar el número de archivos productivos sin nueva aprobación explícita.
- Jest pasa pero el código compilado ejecutado directamente con Node falla (repetición exacta del patrón que causó el bloqueo de V1).
- Los tests con mock contradicen el comportamiento contra Prisma real.

En cualquiera de estos casos: detener, no improvisar una solución alternativa, documentar el bloqueo con precisión, y regresar a la etapa de Decisiones Técnicas o de Diseño según corresponda a la naturaleza del hallazgo — mismo protocolo ya aplicado en toda la cadena de H-02.

---

## Conclusión

**A) DISEÑO V2 APROBABLE PARA PRE-IMPLEMENTACIÓN.**

Justificación: la estrategia recomendada por `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md` fue analizada de forma exhaustiva en este documento — cada una de las preguntas de diseño planteadas (secciones 5 a 10) fue respondida con fundamento técnico directo, sin dejar ninguna duda abierta que exigiera nueva investigación no resuelta. A diferencia del Diseño V1 (que no se había hecho estas preguntas específicas sobre el trap `set` porque, en ese momento, no se sabía que hiciera falta uno), este diseño incorpora explícitamente la causa raíz confirmada y cierra, con un mecanismo concreto y ya analizado en detalle, el vector que quedó abierto. El alcance de archivos se mantiene mínimo y fue confirmado explícitamente (sección 15), no asumido. La estrategia de testing corrige el defecto metodológico que causó el bloqueo anterior (sección 12, distinción explícita mock/objeto-real). No se identificó ningún bloqueo ni ninguna pregunta que requiriera reabrir la investigación de causa raíz. El documento deja, además, un riesgo residual explícitamente señalado y no resuelto (vector J, mutaciones indirectas no confirmadas) — pero señalarlo con precisión, sin resolverlo prematuramente sin evidencia, es exactamente el criterio de rigor ya exigido en toda esta cadena, no un motivo de bloqueo del diseño en sí.

---

## Informe final

- **Estrategia seleccionada:** Estrategia A — trap `set` explícito para `"__proto__"`, complementario a los traps ya validados.
- **Traps incluidos:** `get` (existente), `getPrototypeOf` (existente), `setPrototypeOf` (existente), `set` (**nuevo**).
- **Política para lectura de `"__proto__"`:** sin cambios respecto de V1 — dentro del trap `get`, devuelve `Object.prototype`.
- **Política para escritura de `"__proto__"`:** nuevo trap `set`, detecta la clave exacta, lanza `Error` antes de delegar — nunca llega al `Proxy` interno de Prisma.
- **Política de delegación de otras escrituras:** denylist mínima — `Reflect.set(target, prop, value, receiver)` con los 4 argumentos, preservando el `receiver` recibido.
- **Comportamiento de `getPrototypeOf`:** sin cambios — `Object.prototype`, sin tocar el `target`.
- **Comportamiento de `setPrototypeOf`:** sin cambios — lanza para `Object.setPrototypeOf`/`Reflect.setPrototypeOf` y para el setter heredado invocado directamente vía `.call`.
- **Tratamiento de `constructor.prototype`:** sin cambios — se mantiene la decisión de no bloquear `"constructor"` explícitamente, respaldada ahora con mayor solidez (garantía de especificación, no de Prisma).
- **Alcance de archivos:** confirmado sin cambios — archivo único (`organizacion-prisma.client.ts`), función única (`bloquearMetodosRawDeNivelSuperior()`).
- **Cantidad de tests unitarios propuestos:** 16, con distinción explícita de cuáles pueden usar mock (10 de los 16) y cuáles deben usar obligatoriamente el objeto real de Prisma (4 de los 16: casos 10, 11, 12 y 16; 2 adicionales recomendados por prudencia aunque no estrictamente necesarios: casos 8 y 9, 13).
- **Cantidad de tests de integración propuestos:** 15, incluyendo la verificación obligatoria en Node compilado fuera de Jest (punto 15).
- **Principales riesgos:** bloqueo de una escritura legítima no detectada (mitigado por denylist mínima); repetición del patrón Jest-pasa/Node-falla (mitigado por la clasificación explícita de tests y la verificación obligatoria fuera de Jest); vector J (mutaciones indirectas no confirmadas) como riesgo residual explícito, no resuelto por este diseño.
- **Conclusión:** **A) DISEÑO V2 APROBABLE PARA PRE-IMPLEMENTACIÓN.**
- **Documento generado:** `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` (este documento). Ningún otro documento fue generado ni modificado.
- **`git diff`:** idéntico al baseline (`backend/src/prisma/organizacion-prisma.client.ts`, 31 líneas modificadas — el mismo mecanismo original de H-02 ya documentado en etapas previas, sin ningún cambio nuevo de esta etapa).
- **`git status --short`** (idéntico al estado previo a esta etapa, salvo la aparición de este mismo archivo — sin cambios de código, sin `git add` ejecutado):
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
  ?? ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md
  ?? AUDITORIA_ADVERSARIAL_BLOQUE11.md
  ?? AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? AUDITORIA_BLOQUE10.4_FRONTEND.md
  ?? AUDITORIA_BLOQUE11_SEGURIDAD.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3b.md
  ?? DECISIONES_TECNICAS_BLOQUE10.4.md
  ?? DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md
  ?? DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md
  ?? DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md
  ?? DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? DISENO_BLOQUE10.4_FRONTEND.md
  ?? "DISEÑO_BLOQUE11_SEGURIDAD.md"
  ?? "DISEÑO_CORRECCION_H02_BLOQUE11.md"
  ?? "DISEÑO_CORRECCION_H02_BLOQUE11_V2.md"
  ?? IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
  ?? INVESTIGACION_H02_PROTO_SETTER.md
  ?? PLAN_PROXIMA_ETAPA.md
  ?? PRE_IMPLEMENTACION_BLOQUE11.md
  ?? PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
  ?? REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md
  ?? REVISION_IMPLEMENTACION_BLOQUE11.md
  ?? VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```

No se implementó ninguna solución. No se escribió código productivo definitivo. No se crearon tests permanentes. No se modificó ningún documento anterior. No se modificó ningún archivo del proyecto en ningún momento de esta etapa.

Me detengo y quedo a la espera de autorización.

# Decisiones Técnicas — Corrección de H-02: Bypass del Proxy mediante `Object.getPrototypeOf()`

Fecha: 2026-07-24. **No implementa la corrección, no modifica código de aplicación, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no modifica tests permanentes, no genera parches, no actualiza documentación existente, no hace `git add`/`commit`/`push`.** Se basa en `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`, `DISEÑO_CORRECCION_H02_BLOQUE11.md` y `backend/src/prisma/organizacion-prisma.client.ts` (lectura, no modificación). Cierra las decisiones técnicas que el Diseño dejó explícitamente abiertas. No se reabrió la Auditoría Adversarial — se ejecutó únicamente 1 diagnóstico temporal, de solo lectura, no destructivo, indispensable para resolver la decisión de la sección 1 (detallado ahí y en la sección de evidencia final), eliminado inmediatamente después, con el árbol verificado sin diferencias mediante `git diff`.

---

## 1. Invariantes del trap `getPrototypeOf`

**Qué exige ECMAScript** (fuente primaria: [MDN — `handler.getPrototypeOf()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getPrototypeOf), que documenta el algoritmo de la especificación ECMA-262 para el método interno `[[GetPrototypeOf]]` de un objeto `Proxy`):

- **Qué valores puede devolver el trap:** *"The `getPrototypeOf()` method must return an object or `null`"* — cualquier otro tipo de valor (string, number, boolean, `undefined`) provoca un `TypeError` inmediato.
- **Qué ocurre cuando el `target` es extensible:** el trap puede devolver **cualquier** objeto o `null`, sin ninguna restricción adicional — no existe ninguna obligación de que el valor devuelto guarde relación con el prototipo real del `target`.
- **Qué ocurre cuando el `target` NO es extensible:** el valor devuelto por el trap **debe ser exactamente el mismo** (misma referencia) que `Reflect.getPrototypeOf(target)` — si difiere, se lanza un `TypeError` en el momento de la llamada (`Object.getPrototypeOf(proxy)`, `Reflect.getPrototypeOf(proxy)`, o cualquier operación interna que dependa de `[[GetPrototypeOf]]`, como `instanceof`).
- **Qué error se produce ante la violación de una invariante:** `TypeError`, lanzado por el motor de JavaScript en el momento de la operación que dispara la comprobación — no es un error que el propio trap deba lanzar manualmente, es un fallo impuesto por la especificación sobre cualquier implementación de trap que no la respete.

**¿Puede Prisma cambiar la extensibilidad del objeto en runtime?** No se encontró, en la versión real instalada (`@prisma/client@^5.22.0`), ningún mecanismo público documentado que Prisma use para volver no-extensible al objeto devuelto por `$extends()`. Búsqueda exhaustiva en el código propio del proyecto (`grep -rn "Object.freeze\|Object.seal\|Object.preventExtensions" backend/src`): **0 resultados** — el propio proyecto tampoco lo hace en ningún punto. No puede descartarse con certeza absoluta que una versión futura de Prisma decida congelar internamente ese objeto por alguna razón no documentada, pero no hay ninguna evidencia, hoy, de que eso ocurra.

**Verificación empírica (solo lectura, diagnóstico temporal, ver sección "Evidencia utilizada" al final):**

| Verificación | Resultado |
|---|---|
| `Object.isExtensible(target)` (el objeto real devuelto por `prisma.$extends(...)`, antes de envolver) | `true` |
| `Object.isExtensible(proxy)` (el cliente ya protegido, `ORGANIZACION_PRISMA`) | `true` |
| `Object.getPrototypeOf(target)` — tipo y características | Un objeto (no `null`, no `Object.prototype`) — instancia de una clase interna de Prisma con nombre minificado (`constructor.name === "t"`), con 18 propiedades propias (`_originalClient`, `_middlewares`, `_extensions`, `$extends`, etc. — todas internas, ninguna es un dato de negocio ni un secreto). El prototipo de **ese** objeto es, a su vez, una instancia real de `PrismaClient` |

**Conclusión de la sección 1:** el `target` es hoy extensible, así que el trap `getPrototypeOf` puede devolver cualquier valor (objeto o `null`) sin violar ninguna invariante ni provocar ningún `TypeError`. El riesgo de que esto cambie en el futuro es bajo (nada en el proyecto ni en el uso documentado de Prisma lo fuerza), pero no nulo — se retoma como riesgo residual en la sección correspondiente.

---

## 2. Valor exacto del trap

### Alternativa A — `return null`

| Criterio | Resultado |
|---|---|
| Cumplimiento de invariantes ECMAScript | Cumple (target extensible, `null` es un valor válido) |
| Cierre completo del bypass | Sí — `$queryRaw` etc. no son accesibles desde `null` |
| `Object.getPrototypeOf(cliente)` | `null` |
| `Reflect.getPrototypeOf(cliente)` | `null` (mismo trap, mismo resultado) |
| `__proto__` | Depende de la decisión de la sección 3 — el trap `getPrototypeOf` por sí solo **no alcanza** a `__proto__` (ver esa sección) |
| `instanceof` (p. ej. `cliente instanceof Object`) | `false` — el algoritmo estándar de `instanceof` (`OrdinaryHasInstance`) camina la cadena de prototipos vía `[[GetPrototypeOf]]` hasta encontrar `null`; con el trap devolviendo `null` en el primer paso, la cadena queda "vacía" y ningún `instanceof` sobre una clase real puede dar `true` |
| `Object.prototype.isPrototypeOf(cliente)` | `false` — mismo mecanismo que `instanceof`, la cadena queda vacía |
| Compatibilidad con Prisma | Alta — no depende de ningún detalle interno de Prisma |
| Claridad semántica | Media — el objeto queda representado como si fuera "sin prototipo" (`Object.create(null)`-like), lo cual es semánticamente inusual para un objeto que en la práctica se comporta como cualquier otro objeto JavaScript |
| Riesgo de regresión | Bajo pero no nulo — cualquier código (del propio proyecto, de NestJS, o de una herramienta de depuración/logging) que dependa de `instanceof Object`, `isPrototypeOf`, o de la presencia de métodos de `Object.prototype` en la cadena de herencia (no de los propios, que siguen accesibles vía el trap `get`, sino de la cadena en sí) podría comportarse de forma inesperada |
| Comportamiento si el `target` deja de ser extensible | Si el `target` se vuelve no-extensible en el futuro y el trap sigue devolviendo `null` (que no coincide con el prototipo real), **cualquier llamada a `Object.getPrototypeOf`/`Reflect.getPrototypeOf` sobre el cliente lanzaría un `TypeError`** — comportamiento idéntico entre A y B en este escenario, ninguna alternativa es más segura que la otra frente a este riesgo específico |

### Alternativa B — `return Object.prototype`

| Criterio | Resultado |
|---|---|
| Cumplimiento de invariantes ECMAScript | Cumple (target extensible, cualquier objeto es válido, incluido `Object.prototype`) |
| Cierre completo del bypass | Sí — `Object.prototype` no contiene `$queryRaw` ni ningún método relacionado con Prisma; sus únicas propiedades son las genéricas de JavaScript (`hasOwnProperty`, `toString`, `valueOf`, `isPrototypeOf`, `__proto__` como accessor, etc.) |
| `Object.getPrototypeOf(cliente)` | `Object.prototype` |
| `Reflect.getPrototypeOf(cliente)` | `Object.prototype` (mismo trap, mismo resultado) |
| `__proto__` | Depende de la decisión de la sección 3, igual que en A |
| `instanceof` (p. ej. `cliente instanceof Object`) | `true` — la cadena de prototipos ahora contiene `Object.prototype`, que es exactamente lo que `Object` (la función constructora global) espera encontrar en su comprobación |
| `Object.prototype.isPrototypeOf(cliente)` | `true` — coincide exactamente con el candidato buscado |
| Compatibilidad con Prisma | Alta — mismo razonamiento que A, ningún detalle interno de Prisma involucrado |
| Claridad semántica | Alta — el objeto se comporta y se reporta como un objeto JavaScript ordinario y corriente, sin ninguna característica "exótica" visible desde fuera |
| Riesgo de regresión | Más bajo que A — preserva el comportamiento esperado de cualquier código que asuma (implícita o explícitamente) que está tratando con un objeto JavaScript normal |
| Comportamiento si el `target` deja de ser extensible | Idéntico a A (ver fila correspondiente arriba) |

### Decisión

**Alternativa B — `Object.prototype`.**

Justificación: ambas alternativas cierran el bypass con la misma efectividad y cumplen las invariantes de ECMAScript sin diferencia alguna — la decisión no se define por seguridad (empatan) sino por **menor riesgo de regresión y mayor claridad semántica**, exactamente los criterios que la restricción 9 del Diseño (*"evitar soluciones mágicas o difíciles de mantener"*) y la restricción 8 (*"mantener la legibilidad"*) priorizan. Un objeto cuyo `Object.getPrototypeOf()` da `null` se comporta, para cualquier código externo que lo inspeccione (`instanceof`, `isPrototypeOf`, herramientas de depuración como `util.inspect`/`console.log`, que mostrarían el prefijo inusual `[Object: null prototype]`), como un objeto "exótico" — no hay ningún beneficio de seguridad adicional en optar por esa rareza, y sí hay un riesgo (bajo pero real, no cuantificado con certeza porque no se ejecutó ninguna prueba adicional en esta etapa) de que algún código, presente o futuro, dependa implícitamente de que el objeto se comporte como un objeto JavaScript ordinario. `Object.prototype` es, en cambio, el prototipo raíz universal de JavaScript — genérico, estable desde el nacimiento del lenguaje, sin ninguna dependencia de versión de Prisma ni de Node, y semánticamente el más "aburrido" y predecible de los dos, que es exactamente la propiedad deseable acá.

---

## 3. Tratamiento de `__proto__`

**Cómo se resuelve `__proto__` en JavaScript:** `Object.prototype.__proto__` es una propiedad de **acceso** (accessor: getter + setter), heredada por (casi) todo objeto de JavaScript, definida en `Object.prototype` mismo (comportamiento "legacy" formalizado en el Anexo B de ECMA-262, no en el núcleo del lenguaje, pero presente en todos los motores de producción). Su *getter* está especificado, en esencia, como: *"devolver el resultado de invocar `[[GetPrototypeOf]]()` sobre `this`"*.

**¿El acceso pasa por el trap `get`?** **Sí.** Leer `cliente.__proto__` es, mecánicamente, una lectura de propiedad ordinaria con clave `"__proto__"` — invoca el método interno `[[Get]]`, que en un `Proxy` **sí** dispara el trap `get` (ya existente en este código). Esto es distinto de `Object.getPrototypeOf(cliente)`/`Reflect.getPrototypeOf(cliente)`, que invocan directamente el método interno `[[GetPrototypeOf]]`, un método interno **distinto**, con su propio trap dedicado (`getPrototypeOf`).

**Qué devolverá con el diseño actual (antes de esta corrección), y por qué:** el trap `get` ya existente, para cualquier clave no bloqueada, ejecuta `target[prop]` — es decir, evalúa `target.__proto__` **directamente sobre el objeto real** (`clienteExtendido`), no sobre el `Proxy`. Esa evaluación invoca el *getter* heredado de `Object.prototype` con `this = target`, que a su vez llama a `target.[[GetPrototypeOf]]()` — el método interno **real** del objeto real, que no tiene ningún trap ni ninguna intercepción (porque `target` no es un `Proxy`, es el objeto ordinario que el `Proxy` envuelve). El resultado es el prototipo real, sin ningún filtro — **exactamente la fuga ya confirmada por ejecución real en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` (hallazgo 6.3) y reconfirmada en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`**.

**Diferencia entre las tres formas:**

| Expresión | Método interno invocado | Trap que lo intercepta hoy | Trap que lo interceptará tras la corrección |
|---|---|---|---|
| `cliente.__proto__` | `[[Get]]` (con clave `"__proto__"`) | `get` (ya existe, pero hoy no filtra esta clave) | `get`, con una rama nueva para esta clave específica |
| `Object.getPrototypeOf(cliente)` | `[[GetPrototypeOf]]` | Ninguno (se delega directo al `target`) | `getPrototypeOf` (nuevo, sección 2) |
| `Reflect.getPrototypeOf(cliente)` | `[[GetPrototypeOf]]` (idéntico al anterior — `Reflect.getPrototypeOf` es, por especificación, un envoltorio directo sobre el mismo método interno) | Ninguno | `getPrototypeOf` (mismo trap que el caso anterior, mismo resultado) |

**Es una consecuencia directa de esta tabla, y no una elección estilística, que el trap `getPrototypeOf` de la sección 2 (por sí solo) NO alcanza a bloquear `__proto__`** — son dos métodos internos distintos, con dos traps distintos, y `__proto__` pasa por uno que ya existe pero que, hoy, no lo filtra.

### Decisión

**Bloquear `__proto__` dentro del trap `get` ya existente**, agregando una rama explícita: cuando `prop === "__proto__"`, el trap deberá devolver el mismo valor saneado que el trap `getPrototypeOf` (`Object.prototype`, por la decisión de la sección 2) — **no** dejar que `target["__proto__"]` se evalúe. Se descarta "dejar que derive de `getPrototypeOf`" porque, como demuestra la tabla, **no deriva** de ese trap en absoluto — son mecanismos independientes. Se descarta "otro mecanismo" porque no hay ninguna alternativa más simple ni más consistente con el resto del archivo que agregar una clave más al mismo tipo de verificación (`if (prop === "__proto__") return ...`) que el trap `get` ya hace hoy para las 4 claves bloqueadas — mantiene la restricción de mínima superficie y máxima legibilidad.

---

## 4. `setPrototypeOf`

**Qué ocurre actualmente si el `Proxy` no implementa `setPrototypeOf`:** por el mismo comportamiento por defecto de traps no implementados ya explicado en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` (H-02, pregunta 2) y confirmado en la sección 1 de este documento, el método interno `[[SetPrototypeOf]]` se delega directamente a `target.[[SetPrototypeOf]]()`.

**¿La operación se delega al `PrismaClient` real?** No al `PrismaClient` real (`PrismaService`), sino al objeto `clienteExtendido` (`target` de este `Proxy` específico) — que es el objeto real cuyo prototipo quedaría expuesto a mutación.

**¿Puede modificar el prototipo del `target`?** **Sí, hoy, sin ningún trap `setPrototypeOf`, `Object.setPrototypeOf(clienteProtegido, cualquierCosa)` cambiaría el prototipo REAL de `clienteExtendido`** — una mutación directa sobre un objeto que Prisma sigue usando internamente para resolver cada llamada a un método de modelo o de nivel superior.

**¿Puede degradar o romper la protección?** No de la forma exacta que motivó H-02 (cambiar el prototipo NO le da a un atacante acceso a `$queryRaw`; si acaso, lo aleja del prototipo real que hoy lo contiene). Pero sí representa una vía de **tampering** sobre un objeto compartido y sensible: reemplazar el prototipo por uno con getters maliciosos, o simplemente por `null` (rompiendo cualquier método heredado que Prisma necesite internamente), podría causar comportamientos indefinidos o fallos difíciles de diagnosticar en cualquier operación posterior sobre ese mismo cliente — incluyendo, potencialmente, la propia extensión de aislamiento organizacional (`$allModels` hooks), que también vive en ese objeto.

**¿Puede generar un nuevo bypass?** No un bypass de **lectura** de los 4 métodos raw (ese vector ya queda cerrado por las secciones 1-3). Pero sí es, en sí mismo, una superficie de **integridad** no controlada que no tiene ninguna razón legítima para estar abierta.

**¿Debe agregarse un trap `setPrototypeOf` que rechace siempre la operación?** Sí.

### Decisión

**Implementar `setPrototypeOf` lanzando una excepción controlada** (no simplemente devolviendo `false`).

Justificación, considerando las invariantes ya citadas (fuente primaria: [MDN — `handler.setPrototypeOf()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/setPrototypeOf)):
- El trap **debe devolver un `Boolean`** (*"The `setPrototypeOf()` method must return a `Boolean`... Other values are coerced to booleans"*) — devolver `false` es, en principio, la vía "idiomática" del mecanismo.
- Pero **devolver `false` produce comportamiento distinto según quién invoque la operación**: `Object.setPrototypeOf(clienteProtegido, x)` lanzaría un `TypeError` automáticamente (*"Many operations, including `Object.setPrototypeOf()`, throw a TypeError if the [[SetPrototypeOf]] internal method returns false"*), pero `Reflect.setPrototypeOf(clienteProtegido, x)` simplemente **devolvería `false` sin lanzar nada**, dejando que el código llamante decida si le importa revisar ese valor de retorno — un llamador descuidado (o malicioso) podría ignorar el `false` y continuar, sin enterarse de que la operación fue rechazada.
- MDN documenta explícitamente la alternativa de lanzar directamente dentro del trap como un patrón válido y reconocido: *"The latter approach will cause any operation that attempts to mutate[,] to throw. This approach is best if you want even non-throwing operations to throw on failure, or you want to throw a custom exception value."* — es decir, lanzar dentro del trap hace que **tanto `Object.setPrototypeOf` como `Reflect.setPrototypeOf`** fallen de forma igualmente ruidosa, sin depender de que el llamador revise un booleano.
- Esto es preferible en este contexto específico (un límite de seguridad, no una validación de negocio) porque **fallar en silencio nunca es aceptable en un control de aislamiento** — el mismo criterio que ya rige el resto del archivo (`asegurarSinEscrituraAnidada`, el trap `get` de los 4 métodos raw), que lanzan un `Error` explícito en lugar de devolver un valor que el código llamante podría ignorar.
- Adicionalmente, lanzar directamente permite reutilizar el mismo formato de mensaje `[aislamiento]` ya establecido en el resto del archivo (ver sección 10), en lugar de dejar que el motor de JavaScript genere un mensaje de `TypeError` genérico y sin contexto del proyecto.

Se descarta "no implementarlo" porque deja abierta la vía de *tampering* ya descrita, sin ningún beneficio a cambio. Se descarta "implementar devolviendo `false`" por la inconsistencia de comportamiento entre `Object.setPrototypeOf`/`Reflect.setPrototypeOf` y por la posibilidad de que un llamador ignore el booleano silenciosamente.

---

## 5. `constructor` y `constructor.prototype`

**Conclusión ya obtenida en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`** (H-02, pregunta 4, verificado por ejecución real): `protegido.constructor` pasa por el trap `get` (no está en la lista de métodos bloqueados), es una función, y por lo tanto el trap la devuelve **ligada** (`.bind(target)`). Las funciones ligadas (creadas por `Function.prototype.bind`) **no tienen una propiedad `.prototype` propia** — es una característica del propio objeto función ligado, definida por la especificación ECMAScript para el tipo "Bound Function Exotic Object", no una elección del proyecto. Por eso `protegido.constructor.prototype` da `undefined`, confirmado empíricamente.

**Por qué el `.bind` existente modifica/neutraliza ese camino:** el `.bind(target)` no fue diseñado pensando en `constructor.prototype` — su propósito documentado en el propio archivo es preservar el `this` correcto para que cualquier lógica interna de Prisma que dependa de campos privados o de estado interno del objeto real siga funcionando cuando se invoca a través del `Proxy`. El cierre de la vía `constructor.prototype` es un **efecto colateral** de esa decisión, no un objetivo original.

**¿Depende de un comportamiento accidental?** Sí, en el sentido de que nadie diseñó el `.bind(target)` pensando en este vector específico — pero el **mecanismo del que depende** (que `Function.prototype.bind` nunca produce una función con `.prototype` propio) es una característica **estable y garantizada por la especificación ECMAScript**, no un detalle de implementación de un motor particular ni de una versión de Node. No es "inestabilidad futura" en el sentido de que pueda dejar de ser cierto — es una consecuencia dura de la especificación del lenguaje. La única forma en que este cierre dejara de funcionar sería que alguien, en una modificación futura, **quite** el `.bind(target)` del trap `get` (por ejemplo, para "simplificar" el código sin entender que también cumple esta función) — ese es el riesgo real, no la especificación del lenguaje.

**¿Debería existir tratamiento explícito para `"constructor"`?** No.

### Decisión

**No bloquear explícitamente la clave `"constructor"` en el trap `get`.**

Justificación: agregar un bloqueo explícito sería una complejidad nueva, innecesaria, sobre un vector que ya está cerrado por un mecanismo existente y estable (la especificación de `Function.prototype.bind`) — contradice la restricción 7 (mínima superficie) y la restricción 9 (evitar soluciones mágicas). Bloquear `"constructor"` de forma directa, además, **podría romper usos legítimos** que hoy siguen funcionando sin problema: `protegido.constructor.name` (usado, por ejemplo, en cualquier inspección de depuración o en un `console.log` con formato detallado) sigue devolviendo un valor útil (`"bound t"`) — bloquear la clave completa eliminaría esa capacidad de introspección benigna sin ningún beneficio de seguridad adicional, ya que el vector real (`.prototype`) ya está cerrado.

**Restricción para la implementación:** dado que el cierre depende de que el `.bind(target)` del trap `get` permanezca exactamente como está, la implementación **deberá agregar un comentario explícito** junto a esa línea, documentando que además de su propósito original (preservar `this` correcto), esa línea es la que mantiene cerrado el vector `constructor.prototype` — para que ningún cambio futuro la remueva sin darse cuenta de esta segunda función que cumple. Esto se traslada como tarea al alcance de implementación (sección 12).

---

## 6. Métodos SQL bloqueados

**Lista definitiva, confirmada sin cambios:**
- `$queryRaw`
- `$queryRawUnsafe`
- `$executeRaw`
- `$executeRawUnsafe`

**¿Existen otros métodos equivalentes en la versión actual de Prisma (`@prisma/client@^5.22.0`) que deban contemplarse?** No se identificó ninguno. Los únicos mecanismos adicionales relacionados con SQL crudo en la API pública de Prisma son `Prisma.sql`, `Prisma.raw` y `Prisma.join` — pero estos **no son métodos del objeto cliente** (no viven en `protegido` ni en su prototipo): son utilidades estáticas exportadas directamente desde el paquete `@prisma/client` (`import { Prisma } from "@prisma/client"`), usadas para **construir** el argumento que luego se le pasa a `$queryRaw`/`$executeRaw`. No ejecutan nada por sí solas, y un `Proxy` que envuelve una *instancia* de cliente no tiene ningún punto de intercepción sobre ellas (son código completamente independiente del objeto `protegido`). Esto no representa un vector adicional: aunque alguien construya un fragmento SQL con `Prisma.sql`, seguirá necesitando invocar `$queryRaw` sobre el cliente para ejecutarlo — y ese método sigue bloqueado.

**Confirmación:** no se amplía el alcance. La lista de 4 métodos permanece exactamente la misma que ya fue aprobada en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` y verificada en cada etapa posterior de Bloque 11.

---

## 7. Interacción con `$transaction`

**Distinción de componentes** (basada en el flujo real del código, `organizacion-prisma.client.ts`):

| Componente | Qué es | Quién lo construye |
|---|---|---|
| `PrismaClient` real (`PrismaService`) | El singleton base de Prisma, inyectado en `crearClienteOrganizacional(prisma)`, con acceso completo y sin ninguna restricción | NestJS, vía `PrismaModule` |
| `clienteExtendido` | El objeto devuelto por `prisma.$extends({...})` — ya incluye los 14 hooks de aislamiento organizacional (`$allModels`), pero **sin ninguna protección de H-02 todavía** | `crearClienteOrganizacional()`, línea `prisma.$extends(...)` |
| Proxy adicional de H-02 (`bloquearMetodosRawDeNivelSuperior`) | El envoltorio que intercepta `get` (y, tras esta corrección, `getPrototypeOf` y `setPrototypeOf`) sobre `clienteExtendido` | `crearClienteOrganizacional()`, línea final (`return bloquearMetodosRawDeNivelSuperior(clienteExtendido)`) |
| Cliente organizacional protegido (`protegido`) | El resultado final, exportado como `ORGANIZACION_PRISMA`, lo que reciben todos los controllers vía inyección de dependencias | Resultado de lo anterior |
| `TransactionClient` (`tx`) | El objeto que Prisma construye **internamente**, de forma independiente, cada vez que se invoca `$transaction(async (tx) => {...})` — con las mismas garantías de aislamiento organizacional (la extensión se propaga), pero **nunca pasa por el Proxy de H-02** | El motor interno de `$transaction` de Prisma, a partir de `clienteExtendido` — nunca a partir de `protegido` |

**¿El Proxy de H-02 envuelve al objeto `tx`?** **No, en ningún caso, bajo ninguna forma de invocación.** Cuando código de aplicación hace `protegido.$transaction(callback)`: el trap `get` intercepta la lectura de `$transaction` (no está en la lista de métodos bloqueados), y como es una función, la devuelve ligada — `clienteExtendido.$transaction.bind(clienteExtendido)`. Al invocar esa función ligada, la ejecución ocurre **enteramente dentro de la implementación real de Prisma**, operando sobre `clienteExtendido` como `this` — el `Proxy` ya quedó fuera de la cadena de llamadas en ese punto. Prisma construye `tx` internamente, a partir de `clienteExtendido` (no de `protegido`), y se lo pasa al `callback` — el `Proxy` de H-02 **nunca vuelve a intervenir** en ningún punto de ese flujo. Esto es válido tanto para la forma interactiva (`$transaction(callback)`) como para la forma array (`$transaction([...])`) — en ambos casos, el punto de entrada es el mismo método `$transaction` de `clienteExtendido`, alcanzado de la misma forma (a través del `get` trap, nunca modificado por esta corrección).

**Por qué la solución elegida (secciones 1-4) no puede afectar esto:** las 3 piezas de esta corrección (`getPrototypeOf`, la rama de `"__proto__"` dentro de `get`, y `setPrototypeOf`) son **traps del mismo `Proxy` que ya existe**, ninguno de los cuales intercepta ni altera la invocación de `$transaction` ni la construcción de `tx`. Ya que `tx` nunca es, no fue, y no será el objeto envuelto por este `Proxy` (es un objeto distinto que Prisma construye por su cuenta), ningún cambio en el `handler` de este `Proxy` — sin importar cuántos traps se agreguen — puede, por construcción, afectar a `tx`. Esta garantía no depende de ninguna suposición sobre el funcionamiento interno de Prisma (a diferencia de la Estrategia D, descartada en el Diseño): depende únicamente de que `tx` nunca entra en contacto físico con el objeto `protegido` en ningún punto del código, lo cual ya está confirmado por lectura directa del flujo (arriba) y por evidencia empírica repetida en 3 etapas distintas de este bloque (`VALIDACION_FUNCIONAL_BLOQUE11.md` §7, `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §6.14-6.15, y la propia justificación ya citada en el código fuente, líneas 55-58 de `organizacion-prisma.client.ts`).

---

## 8. Compatibilidad general

Los 2 traps nuevos (`getPrototypeOf`, `setPrototypeOf`) y la rama nueva dentro del trap `get` ya existente (`"__proto__"`) **no tocan, no sobreescriben, y no interactúan con** ninguno de los siguientes mecanismos, todos gobernados por su comportamiento por defecto (delegación transparente al `target`), exactamente igual que hoy:

| Mecanismo | Trap del que depende | ¿Se modifica en esta corrección? | Conclusión |
|---|---|---|---|
| `Object.keys()` | `ownKeys` (+ `getOwnPropertyDescriptor` para filtrar enumerabilidad) | No | Sin cambios — mismo comportamiento ya confirmado sin hallazgo en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` 6.11 |
| `Reflect.ownKeys()` | `ownKeys` | No | Sin cambios |
| `Object.getOwnPropertyDescriptor()` | `getOwnPropertyDescriptor` | No | Sin cambios |
| Operador `in` | `has` | No | Sin cambios — mismo comportamiento ya confirmado ("sin impacto práctico") en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` 6.10 |
| `Object.freeze()` | `preventExtensions` (+ `isExtensible`, `defineProperty`) | No | Sin cambios — si alguna vez se invocara sobre `protegido` (no ocurre hoy, confirmado por `grep`), seguiría delegando al `target` real, exactamente igual que antes de esta corrección |
| `Object.seal()` | Igual que `freeze` | No | Sin cambios |
| `Object.preventExtensions()` | `preventExtensions` | No | Sin cambios |
| `util.inspect()` / `console.log()` | Internamente consulta `getPrototypeOf` (para decidir el prefijo de clase a mostrar) y `ownKeys`/`getOwnPropertyDescriptor` (para listar propiedades) | **Sí, parcialmente** — el prefijo que muestre `console.log(protegido)` cambiará de reflejar el prototipo real (hoy) a reflejar `Object.prototype` (tras la corrección) | Efecto puramente cosmético sobre el formato de salida por consola/logs — no afecta ningún comportamiento funcional. Con la Alternativa B elegida en la sección 2, el resultado es, además, el más "normal" posible (sin el prefijo inusual `[Object: null prototype]` que produciría la Alternativa A) |
| NestJS Dependency Injection | No consulta el prototipo del valor resuelto por un `useFactory` | No aplica | Ya confirmado en `DISEÑO_CORRECCION_H02_BLOQUE11.md`, riesgo R1 — sin evidencia de dependencia, a reverificar empíricamente en Pre-Implementación, no en esta etapa |
| Logging (del propio proyecto) | Ninguno de los puntos de logging existentes invoca reflexión sobre el cliente inyectado (confirmado por ausencia de cualquier `console.log(prisma)`/`JSON.stringify(prisma)` en el código, no encontrado en ninguna búsqueda previa de este bloque) | No | Sin impacto |
| Serialización (`JSON.stringify`) | `ownKeys`/`getOwnPropertyDescriptor` (nunca consulta `[[GetPrototypeOf]]`) | No | `JSON.stringify` no depende en absoluto de la cadena de prototipos — sin ningún cambio posible por esta corrección |
| Detección interna de Prisma | Desconocido con certeza — ver riesgo R1 de `DISEÑO_CORRECCION_H02_BLOQUE11.md`, no resuelto en esta etapa por decisión (requiere verificación empírica de Pre-Implementación, no de Decisiones Técnicas) | Pendiente de verificación en la etapa siguiente | Riesgo residual documentado, no una confirmación de ausencia de impacto |

**Conclusión de la sección 8:** el diseño no viola ninguna invariante de `Proxy` (secciones 1-2 ya lo confirman para `getPrototypeOf`; la cita de MDN de la sección 4 lo confirma para `setPrototypeOf`) y no introduce ningún efecto colateral sobre los mecanismos de reflexión que **no** se están modificando — el único efecto observable fuera del cierre del bypass en sí es el cambio cosmético en `util.inspect()`/`console.log()`, ya evaluado como aceptable.

---

## 9. Decisiones técnicas definitivas

| Tema | Alternativas | Decisión | Justificación |
|---|---|---|---|
| Valor de `getPrototypeOf` | `null` / `Object.prototype` | **`Object.prototype`** | Igual efectividad de cierre que `null`; menor riesgo de regresión (`instanceof`, `isPrototypeOf`, `util.inspect` se comportan de forma "normal"); mayor claridad semántica (sección 2) |
| Tratamiento de `__proto__` | Bloquear en `get` / derivar de `getPrototypeOf` / otro mecanismo | **Bloquear explícitamente dentro del trap `get` ya existente**, devolviendo el mismo valor que `getPrototypeOf` | `__proto__` pasa por `[[Get]]`, no por `[[GetPrototypeOf]]` — son mecanismos independientes, no hay forma de que uno "derive" del otro (sección 3) |
| Tratamiento de `setPrototypeOf` | Devolver `false` / lanzar excepción / no implementar / otra | **Implementar, lanzando una excepción controlada** (mismo estilo `[aislamiento]` que el resto del archivo) | Falla de forma consistente para `Object.setPrototypeOf` y `Reflect.setPrototypeOf` por igual, sin depender de que el código llamante revise un valor booleano de retorno (sección 4) |
| Tratamiento de `constructor` | Bloquear explícitamente / no bloquear | **No bloquear** — ya cerrado como efecto del `.bind(target)` existente | Agregar un bloqueo explícito sería complejidad innecesaria sobre un vector ya cerrado por un mecanismo estable de la especificación de `Function.prototype.bind`; rompería la introspección benigna de `constructor.name` sin ningún beneficio (sección 5) |
| Lista definitiva de métodos SQL bloqueados | 4 métodos ya conocidos / ampliar | **Sin cambios: `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`** | No se identificó ningún método equivalente adicional en la versión real instalada; `Prisma.sql`/`Prisma.raw`/`Prisma.join` no son métodos del cliente, no representan un vector nuevo (sección 6) |
| Tipo de error | `Error` genérico / `TypeError` / excepción personalizada / valor `undefined`/`false` | **`Error` genérico, mismo tipo ya usado en el resto del archivo** | Consistencia con `asegurarSinEscrituraAnidada` y el trap `get` ya existente — ninguno de los bloqueos actuales usa `TypeError` ni una clase de excepción nueva (sección 10) |
| Mensaje de error | — | **Mismo patrón `[aislamiento] "<operación>" ...`, mencionando la operación bloqueada, sin exponer detalles internos de Prisma** | Consistencia de estilo con los mensajes ya existentes; no revela nombres de clases internas minificadas ni estructura del objeto real (sección 10) |
| Ubicación exacta del cambio | — | **Único archivo: `backend/src/prisma/organizacion-prisma.client.ts`, función `bloquearMetodosRawDeNivelSuperior()`** | Mínima superficie de cambio, mismo criterio ya aprobado en el Diseño (sección 12) |
| Necesidad de tests permanentes | Sí / no | **Sí — ver sección 11** | El proyecto ya cuenta con infraestructura de Jest desde H-04; agregar cobertura a un mecanismo de seguridad crítico es consistente con el criterio ya aplicado a `encontrarOFallar` en H-01 |

---

## 10. Tipo y mensaje de error

**Comparación de opciones:**

| Opción | Evaluación |
|---|---|
| `TypeError` | Sería la elección "nativa" para errores de reflexión (es el tipo que el propio motor de JavaScript lanza ante violaciones de invariantes de `Proxy`), pero **no es el tipo ya usado en el resto del archivo** para los bloqueos de aislamiento — introduciría una inconsistencia de estilo sin ningún beneficio funcional (nada en el código del proyecto distingue el manejo de `TypeError` del de `Error` genérico) |
| `Error` genérico | **Elegido** — es exactamente el tipo ya usado por `asegurarSinEscrituraAnidada` y por el trap `get` existente para los 4 métodos raw; mantiene el archivo internamente consistente |
| Excepción personalizada (clase nueva) | Innecesaria — el archivo no tiene, hoy, ninguna clase de excepción propia; introducir una solo para este caso rompería la restricción de mínima superficie sin aportar ninguna capacidad que `Error` con un mensaje descriptivo no ofrezca ya |
| Devolver `undefined` | No aplica al trap `setPrototypeOf` (debe devolver un booleano o lanzar, según la sección 4); tampoco sería apropiado para el trap `getPrototypeOf`, que debe devolver un objeto o `null` por invariante de especificación (sección 1) — `undefined` violaría esa invariante y provocaría un `TypeError` del propio motor, no controlado por el proyecto |
| Devolver `false` (cuando la especificación lo permite) | Aplicable solo a `setPrototypeOf` — ya evaluado y descartado en la sección 4 a favor de lanzar directamente |

### Decisión

- **Tipo exacto:** `Error` (nativo de JavaScript, sin subclasificar) — mismo tipo que el resto del archivo.
- **Mensaje exacto (patrón):** mismo prefijo `[aislamiento]` ya usado en todo el archivo, mencionando explícitamente la operación bloqueada (`"getPrototypeOf"`, `"setPrototypeOf"`, o `"__proto__"`, según corresponda) — ejemplo de patrón (no de implementación final, que corresponde a Pre-Implementación): `[aislamiento] "<operación>" no está disponible en el cliente organizacional de nivel superior.` — reutilizando la misma frase de contexto ya usada para los 4 métodos raw donde sea aplicable (para `getPrototypeOf`/`__proto__`, el mensaje describe que se **oculta** el prototipo, no que se **ejecuta** una consulta; para `setPrototypeOf`, que se **rechaza** la mutación del prototipo).
- **¿Debe mencionar la operación bloqueada?** Sí — mismo criterio ya aplicado a los 4 métodos raw, donde el nombre de la propiedad se interpola en el mensaje.
- **¿Debe evitar exponer información interna?** Sí, explícitamente — el mensaje **no** debe incluir el nombre de la clase interna minificada de Prisma (`"t"`, confirmado en la sección 1), ni la lista de las 18 propiedades internas encontradas en el diagnóstico, ni ningún otro detalle de la estructura real del objeto — exactamente el mismo criterio de no filtrar información sensible ya aplicado y confirmado sin hallazgos en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §3.12 para los mensajes de H-07.

---

## 11. Tests permanentes requeridos

| Caso | Tipo | Justificación |
|---|---|---|
| Acceso directo a `$queryRaw` | Unitario | Regresión del mecanismo ya existente — debe seguir bloqueado exactamente igual tras el cambio |
| Acceso directo a `$executeRaw` | Unitario | Ídem |
| `Object.getPrototypeOf()` sobre el cliente protegido | Unitario | Verifica directamente el cierre del hallazgo 6.3 de la Auditoría Adversarial |
| `Reflect.getPrototypeOf()` sobre el cliente protegido | Unitario | Verifica el mismo trap por la vía alternativa ya confirmada como equivalente |
| `__proto__` sobre el cliente protegido | Unitario | Verifica el cierre del mecanismo distinto identificado en la sección 3 — no puede darse por cubierto solo con el test de `getPrototypeOf`, son rutas de código diferentes |
| `constructor.prototype` sobre el cliente protegido | Unitario | Confirma que sigue dando `undefined` — protege contra una futura modificación accidental del `.bind(target)` que reabriera este vector sin que nadie lo note (sección 5) |
| `Object.setPrototypeOf()` sobre el cliente protegido | Unitario | Verifica que la operación de mutación queda rechazada |
| `Reflect.setPrototypeOf()` sobre el cliente protegido | Unitario | Verifica el mismo trap por la vía que, según la sección 4, se comporta de forma distinta a `Object.setPrototypeOf` en el motor por defecto — debe confirmarse explícitamente que el mecanismo elegido (lanzar) also produce el resultado esperado por esta vía |
| `$transaction(callback)` — forma interactiva | Integración (requiere Postgres real) | No puede verificarse como unitario puro — depende del comportamiento real de Prisma; confirma ausencia de regresión funcional |
| `$transaction(array)` — forma array | Integración (requiere Postgres real) | Ídem — el propio código de producción no usa esta forma, pero el Diseño la exige como parte del alcance de no-regresión |
| Uso legítimo de `tx.$queryRaw` | Integración (requiere Postgres real, contra el flujo real de `registrarCobranza`/`anularCobranza` o un caso mínimo equivalente) | Es la verificación de mayor criticidad de toda esta corrección — confirma que la restricción 3 del Diseño se cumple, no solo por argumento estructural (sección 7) sino por ejecución real |
| Uso legítimo de `tx.$executeRaw` | Integración | Aunque no hay un uso real hoy en el código de producción para `$executeRaw` específicamente (los 2 usos reales son `$queryRaw`), se incluye por completitud, dado que el Diseño lo exige explícitamente como parte del alcance de no-regresión |

**Auditoría adversarial posterior (no un test automatizado, una etapa completa):** repetición de los 12 vectores ya usados en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §6, exigida como criterio de aceptación (ver `DISEÑO_CORRECCION_H02_BLOQUE11.md`, sección de Criterios de Aceptación, ya aprobada) — no se especifica más en este documento, pertenece a una etapa posterior a la implementación.

No se escribe ningún test en esta etapa — esta sección define **qué** deberá existir, no su contenido.

---

## 12. Alcance exacto de implementación

**Archivos que deberán modificarse:**
- `backend/src/prisma/organizacion-prisma.client.ts` — único archivo de código de aplicación a modificar.

**Funciones concretas:**
- `bloquearMetodosRawDeNivelSuperior()` — agregar los traps `getPrototypeOf` y `setPrototypeOf` al objeto `handler`, y agregar la rama de `"__proto__"` dentro del trap `get` ya existente.
- Ningún cambio en `crearClienteOrganizacional()`, en ningún hook de `$allModels`, ni en `asegurarSinEscrituraAnidada()`/`contieneEscrituraAnidadaNoSoportada()`.
- Agregar el comentario explicativo señalado en la sección 5, junto a la línea `.bind(target)` ya existente dentro del trap `get`.

**Tests que deberán crearse:**
- Un archivo de test nuevo (ubicación exacta a definir en Pre-Implementación, siguiendo el mismo criterio ya usado para `encontrar-o-fallar.spec.ts`: junto al archivo que prueba) cubriendo los 8 casos unitarios de la sección 11.
- Los 4 casos de integración de la sección 11 podrán vivir en el mismo archivo o en uno separado — decisión de Pre-Implementación, no de esta etapa.

**Archivos que expresamente NO deberán tocarse:**
- `backend/src/prisma/organizacion-prisma.module.ts` (el punto de inyección de dependencias — no necesita cambios, sigue recibiendo un objeto con la misma forma pública).
- `backend/src/prisma/organizacional-models.ts`, `backend/src/prisma/modelos-aislamiento-manual.ts`, `backend/src/prisma/organizacional-models.spec.ts` (mecanismo de H-04, sin relación con esta corrección).
- `backend/src/facturas/facturas.controller.ts` (los 2 usos legítimos de `tx.$queryRaw` — no requieren ningún cambio, la corrección debe ser transparente para ellos).
- Cualquier otro controller, DTO, o archivo de configuración — ninguno tiene relación con el mecanismo corregido.
- `backend/package.json` — no se agrega ninguna dependencia nueva (todo lo necesario para esta corrección es JavaScript/TypeScript estándar, sin librerías adicionales).

**No se autoriza ningún refactor colateral** — en particular, no se autoriza reorganizar los 4 métodos bloqueados existentes, ni renombrar ninguna función ya existente, ni "aprovechar" el cambio para tocar ningún otro punto del archivo no mencionado explícitamente arriba.

---

## 13. Criterios de rechazo

La implementación deberá **detenerse inmediatamente**, documentar el bloqueo, y **regresar a la etapa de Diseño** (no improvisar una solución alternativa) si se descubre, durante Pre-Implementación o Implementación, cualquiera de estas situaciones:

- El `target` real deja de ser extensible en algún punto del ciclo de vida de la aplicación, y la estrategia elegida (`Object.prototype` fijo) viola la invariante de igualdad exigida por la especificación para objetos no extensibles (sección 1).
- Se descubre que algún mecanismo interno de Prisma depende de poder leer el prototipo real del cliente a través del `Proxy` para funcionar correctamente (riesgo R1 del Diseño, pendiente de verificación empírica).
- Se descubre, por cualquier vía, que el `TransactionClient` (`tx`) resulta afectado de cualquier forma por los traps agregados — contradiría directamente el argumento estructural de la sección 7, y ameritaría revisar ese argumento antes de continuar.
- Se rompe cualquier variante de `$transaction` (interactiva o array).
- La solución, en la práctica, requiere modificar el prototipo real compartido (algo que este diseño evita explícitamente, a diferencia de la Estrategia D ya descartada) — si en algún punto de la implementación pareciera necesario para que algo funcione, es una señal de que el diseño actual no es viable tal como está planteado.
- Aparecen cambios de alcance no previstos en la sección 12 (archivos adicionales que "resulta que" también necesitan tocarse).
- No puede cerrarse `setPrototypeOf` sin romper algún uso legítimo de Prisma no identificado hasta ahora.
- La solución elegida solo **oculta** el bypass (por ejemplo, si alguna variante de acceso reflexivo no contemplada en este documento todavía permitiera recuperar una referencia invocable al cliente real) — el criterio de aceptación exige el cierre **completo**, no una mejora parcial.

---

## Conclusión obligatoria

**LISTO PARA PRE-IMPLEMENTACIÓN.**

Las 6 decisiones técnicas pendientes que el Diseño dejó abiertas (valor de `getPrototypeOf`, tratamiento de `__proto__`, tratamiento de `setPrototypeOf`, tratamiento de `constructor`, tipo y mensaje de error, alcance de tests) quedan cerradas en este documento, con justificación basada en invariantes de ECMAScript verificadas contra fuente primaria (MDN, que documenta el algoritmo de ECMA-262) y en evidencia empírica de solo lectura (extensibilidad del objeto real, características del prototipo filtrado). No se identificó, en esta etapa, ningún elemento que haga inviable la Estrategia A tal como fue seleccionada en el Diseño — al contrario, la verificación de extensibilidad (sección 1) confirma que la implementación es directamente viable sin ningún ajuste adicional al diseño ya aprobado.

Próximo paso: **`PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`**

No se genera este documento en esta etapa.

---

## Informe final

- **Valor elegido para `getPrototypeOf`:** `Object.prototype` (Alternativa B) — misma efectividad de cierre que `null`, menor riesgo de regresión, mayor claridad semántica.
- **Decisión sobre `__proto__`:** bloquear explícitamente dentro del trap `get` ya existente (no deriva del trap `getPrototypeOf`, son mecanismos internos distintos — `[[Get]]` vs. `[[GetPrototypeOf]]`).
- **Decisión sobre `setPrototypeOf`:** implementar el trap lanzando una excepción controlada (mismo estilo `[aislamiento]` del resto del archivo), no simplemente devolviendo `false` — evita la inconsistencia de comportamiento entre `Object.setPrototypeOf` (lanzaría igual) y `Reflect.setPrototypeOf` (devolvería `false` silenciosamente si solo se retornara el booleano).
- **Decisión sobre `constructor`:** no bloquear explícitamente — ya cerrado como efecto colateral estable (garantizado por especificación ECMAScript) del `.bind(target)` existente; se exige documentar esa dependencia con un comentario en el código al implementar.
- **Tests permanentes requeridos:** 8 unitarios (acceso directo a los 2 métodos raw ya cubiertos, `Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__`, `constructor.prototype`, `Object.setPrototypeOf`, `Reflect.setPrototypeOf`) + 4 de integración contra Postgres real (`$transaction` callback y array, `tx.$queryRaw` y `tx.$executeRaw` legítimos) + una nueva Auditoría Adversarial específica de H-02 como criterio de cierre (no un test automatizado).
- **Archivos previstos:** único archivo de código de aplicación a modificar, `backend/src/prisma/organizacion-prisma.client.ts` (función `bloquearMetodosRawDeNivelSuperior()`); archivo(s) de test nuevo(s) a definir en Pre-Implementación; explícitamente excluidos: `organizacion-prisma.module.ts`, todo lo de H-04, `facturas.controller.ts`, y cualquier otro archivo no listado.
- **Riesgos residuales:** (1) posible dependencia interna no identificada de NestJS/Prisma sobre la cadena de prototipo real del cliente inyectado — mitigado con verificación empírica exhaustiva en Pre-Implementación/Implementación, no asumida por diseño; (2) el `target` podría, en teoría, volverse no-extensible en el futuro, lo que activaría la invariante estricta de la especificación y produciría un `TypeError` en cualquier lectura de prototipo — riesgo simétrico entre las 2 alternativas de la sección 2, sin acción posible más allá de documentarlo; (3) el cierre del vector `constructor.prototype` depende de que nadie remueva el `.bind(target)` existente sin saber que también cumple esa función — mitigado exigiendo un comentario explicativo en el código.
- **Conclusión:** **LISTO PARA PRE-IMPLEMENTACIÓN.**
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

No se implementó nada. No se modificó código de aplicación, backend, frontend, schema, tests permanentes ni documentación previa. No se generó ningún parche. Se ejecutó únicamente 1 diagnóstico temporal de solo lectura (extensibilidad y características del prototipo real), en scratchpad, sin escritura en base de datos, eliminado inmediatamente y verificado con `git diff` sin diferencias de contenido. No se reabrió la Auditoría Adversarial.

Me detengo y quedo a la espera de autorización.

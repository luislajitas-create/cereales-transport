# Revisión Técnica — Defensa de `cliente.constructor`/`constructor.prototype` (H-02)

Fecha: 2026-07-25. **No implementa nada, no genera código, no modifica documentos anteriores, no modifica backend/frontend/tests/schema, no crea migraciones, no genera parches.** Se basa exclusivamente en `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md` y en el resto de los antecedentes ya aprobados de H-02. No se repite ningún experimento sobre Jest/Node/`PrismaClient`-vs-`PrismaService` (ya cerrado). No se reabre `__proto__`/`Receiver`/`getPrototypeOf`/`setPrototypeOf`/`TransactionClient` — todos permanecen exactamente como ya fueron diseñados y validados. Única evidencia nueva obtenida en esta etapa: 1 búsqueda estática (`grep`) sobre `backend/src`, explícitamente autorizada por esta consigna, sin ejecutar ni modificar nada.

---

## 1. Reconstrucción técnica del bypass

1. **`cliente.constructor` se resuelve vía `[[Get]]`** sobre el `Proxy` externo (`cliente`), con `prop = "constructor"` — invoca el trap `get` ya existente.
2. **El trap `get` obtiene el valor desde `target`** (`target["constructor"]`, donde `target` = el objeto real extendido por Prisma, `ext`) — `"constructor"` no está en `METODOS_RAW_BLOQUEADOS` ni es `"__proto__"`, así que cae en la rama genérica (`const valor = target[prop]`). Esta lectura, como `target` es en sí mismo un `Proxy` interno de Prisma (`createCompositeProxy`, confirmado en `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`), pasa por la resolución interna propia de Prisma — que, para la instancia real de producción (`prisma` construido como `PrismaService`), resuelve `"constructor"` al valor real: la clase `PrismaService` (confirmado en `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`, sección 1: `crudo.name === "PrismaService"`, `crudo.hasOwnProperty("prototype") === true`).
3. **`valor.bind(target)`** — el trap `get`, al detectar `typeof valor === "function"`, liga la clase `PrismaService` al objeto real (`target`), produciendo una nueva función ligada (*bound function exotic object*) en cada lectura.
4. **La función ligada no tiene `.prototype` propio** — garantía dura de ECMA-262 para cualquier resultado de `Function.prototype.bind()`, sin excepción, confirmada empíricamente (`Object.getOwnPropertyDescriptors(ctor)` solo tiene `length`/`name`, nunca `prototype`).
5. **La búsqueda de `.prototype` continúa por la cadena `[[Prototype]]` interna de la función ligada** — no encontrada como propiedad propia, JavaScript camina hacia `Object.getPrototypeOf(ctor)`. Ese valor **no** es `Function.prototype` por defecto: `Function.prototype.bind()` fija el `[[Prototype]]` de la función resultante igual al `[[Prototype]]` de la función *original* (`valor`, es decir `PrismaService`) en el momento del `bind` — y `Object.getPrototypeOf(PrismaService)` no es `Function.prototype`, sino la clase de la que `PrismaService` realmente hereda en JavaScript (`class PrismaService extends PrismaClient` establece, por convención del lenguaje, `PrismaService.__proto__ === PrismaClient`, el vínculo estático de herencia entre clases).
6. **Se alcanza `PrismaClient`** (la clase real de `@prisma/client`) como `Object.getPrototypeOf(ctor)` — confirmado empíricamente en la investigación previa.
7. **Se alcanza `PrismaClient.prototype`** — como `PrismaClient` es una clase ordinaria (no ligada), tiene su propia propiedad `.prototype`; la lectura `ctor.prototype` (no encontrada como propia sobre `ctor`) la encuentra ahí, por herencia a través del `[[Prototype]]` recién descrito.
8. **Se alcanza un método raw real** — `PrismaClient.prototype.$queryRaw` (y análogamente `$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`) son métodos de instancia reales de la clase base de Prisma, sin ninguna protección — confirmado empíricamente (`typeof ctor.prototype.$queryRaw === "function"`).
9. **Ese acceso ya no pasa por el `Proxy` organizacional** porque `ctor` (la función ligada) y, por extensión, `ctor.prototype` y cualquier cosa alcanzada a través de él, son objetos JavaScript **ordinarios**, nunca envueltos por ningún `Proxy` del mecanismo de protección — únicamente el objeto `cliente` original (el que `bloquearMetodosRawDeNivelSuperior()` devuelve) está envuelto; todo lo que se obtiene *a partir de* una lectura sobre `cliente` (como el valor de `cliente.constructor`) es, a partir de ese punto, un objeto libre de cualquier intercepción adicional, salvo que el propio trap `get` decida explícitamente sustituir ese valor antes de devolverlo — que es, precisamente, lo que hoy **no** hace para `"constructor"`.

---

## 2. Propiedades de seguridad requeridas

La defensa que se diseñe deberá garantizar, como mínimo:

- `cliente.constructor` no debe permitir recuperar `PrismaService`.
- `cliente.constructor` no debe permitir recuperar `PrismaClient`.
- `cliente.constructor.prototype` no debe exponer `PrismaClient.prototype`.
- Ningún método raw debe ser alcanzable desde la referencia devuelta por `cliente.constructor`.
- No debe romper el `this` de ningún método Prisma legítimo (invariante ya vigente del trap `get`, no debe degradarse).
- No debe modificar `PrismaService` (la clase real, ni su prototipo).
- No debe modificar `PrismaClient` (la clase real, ni su prototipo).
- No debe modificar ningún prototipo real compartido.
- No debe afectar `$transaction` en ninguna de sus formas.
- No debe envolver el `TransactionClient` (`tx`) de ninguna manera.
- No debe depender de ninguna particularidad accidental de Jest o de Node — debe comportarse igual en ambos, por construcción, no por coincidencia (lección directa de la investigación previa).
- No debe depender, como única defensa, de que la función ligada carezca de `.prototype` propio — esa garantía es cierta pero **insuficiente** (no cubre la herencia vía `[[Prototype]]`), confirmado en esta misma cadena de documentos.

---

## 3. Modelo de amenazas para `constructor`

| # | Vector | Objeto obtenido | ¿Pasa por el Proxy exterior? | Riesgo | Resultado seguro esperado | Defensa que debería interceptarlo | Clasificación |
|---|---|---|---|---|---|---|---|
| 1 | `cliente.constructor` | Función ligada, con `[[Prototype]]` heredado de `PrismaClient` | Sí (trap `get`) | Punto de origen de todo el resto de la cadena | Un valor que no permita, por ningún camino posterior, alcanzar `PrismaService`/`PrismaClient` | Trap `get`, nueva rama explícita para `"constructor"` | **Confirmado** |
| 2 | `cliente.constructor.prototype` | `PrismaClient.prototype` | No (lectura sobre un objeto ya fuera del Proxy) | Expone el prototipo real completo | `Object.prototype` (o equivalente coherente) | La sustitución del vector 1 debe garantizar esto como consecuencia | **Confirmado** |
| 3-6 | `cliente.constructor.prototype.$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` | Los 4 métodos raw reales, sin bloqueo | No | Ejecución de SQL arbitrario sin scoping | Ninguno de los 4, inalcanzables | Consecuencia directa de cerrar el vector 1 | **Confirmado** |
| 7 | `Object.getPrototypeOf(cliente.constructor)` | `PrismaClient` (la clase) | No — `cliente.constructor` ya es un objeto ordinario, `Object.getPrototypeOf` opera sobre él directamente, sin ningún trap de por medio | Vía alternativa hacia el mismo destino que el vector 1 | Debe dejar de exponer `PrismaClient` una vez cerrado el vector 1 | Cierre del vector 1 (no requiere trap adicional, ya que opera sobre el valor ya sustituido) | **Confirmado** (consecuencia directa) |
| 8 | `Reflect.getPrototypeOf(cliente.constructor)` | Idéntico al vector 7 (mismo método interno) | No | Idéntico | Idéntico | Idéntico | **Confirmado** (consecuencia directa) |
| 9 | `cliente.constructor.__proto__` | Idéntico al vector 7 (lectura de propiedad, sobre un objeto ordinario ya no envuelto) | No | Idéntico | Idéntico | Idéntico | **Confirmado** (consecuencia directa) |
| 10 | `cliente.constructor.__proto__.prototype` | `PrismaClient.prototype`, vía alternativa | No | Idéntico al vector 2 | Idéntico | Idéntico | **Confirmado** (consecuencia directa) |
| 11 | `cliente.constructor.constructor` | `Function` (el constructor global de JavaScript) | No | Ninguno específico de H-02 — ver sección 10 | `Function`, igual que en cualquier función de cualquier objeto del entorno | No aplica — no es un vector de H-02 | **Fuera de alcance** |
| 12 | `cliente.constructor.constructor("return this")()` | Ejecución de código arbitrario, `globalThis` | No | Amenaza genérica de ejecución de código, no específica de H-02 — ver sección 10 | Mismo que el vector 11 | No aplica | **Fuera de alcance** |
| 13 | `Reflect.get(cliente, "constructor")` | Idéntico al vector 1 (mismo trap `get`, mismo mecanismo) | Sí | Idéntico al vector 1 | Idéntico al vector 1 | Misma defensa del vector 1 | **Confirmado** |
| 14 | `Reflect.get(cliente, "constructor").prototype` | Idéntico al vector 2 | Parcial (la primera parte sí, la segunda no) | Idéntico al vector 2 | Idéntico al vector 2 | Misma defensa del vector 1 | **Confirmado** |
| 15 | `const ctor = cliente.constructor; const proto = ctor.prototype` | Idéntico al vector 2, en 2 sentencias | Idéntico al vector 2 | Idéntico al vector 2 | Idéntico al vector 2 | Misma defensa del vector 1 | **Confirmado** (misma semántica que el vector 2, sin diferencia sustantiva) |

**Nota sobre los vectores 11-12 (`Function` constructor):** no se afirma que representen un bypass de H-02, conforme a la instrucción explícita de esta etapa — ver justificación detallada en la sección 10.

---

## 4. Estrategias posibles

### Estrategia A — Bloquear completamente la lectura de `"constructor"` en el trap `get`

| Variante | Análisis |
|---|---|
| Lanzar excepción | Cierra el vector por completo, pero es semánticamente disruptivo: **todo** objeto JavaScript ordinario tiene `.constructor` — lanzar ante su sola lectura rompe la expectativa mínima de "objeto normal" de forma más agresiva que cualquier otra decisión ya tomada en H-02 (ninguna de las defensas anteriores lanza ante una simple *lectura* no destructiva; todas lanzan ante intentos de *mutación* o de acceso a los 4 métodos raw específicos, nunca ante la lectura de una propiedad tan genérica como `"constructor"`). Riesgo real, aunque no confirmado con búsqueda exhaustiva de terceros, de romper alguna herramienta de introspección/depuración/logging externa que inspeccione `.constructor` de cualquier objeto que reciba. |
| Devolver `undefined` | Menos agresivo que lanzar, pero igual de semánticamente inusual — ningún objeto JS ordinario tiene `.constructor === undefined`; rompe *duck-typing* genérico (`typeof x.constructor === "function"`, un patrón común en código defensivo de terceros). |
| Devolver `null` | Mismo problema que `undefined`, aún más inusual. |
| Devolver `Object` | Ver Estrategia C — es la variante "devolver algo" de esta misma estrategia, evaluada en detalle por separado por ser la más prometedora. |
| Devolver una función segura | Ver Estrategia B. |

**Compatibilidad con Prisma:** ninguna, dado que Prisma nunca ve el objeto `cliente` ya envuelto por el `Proxy` externo del proyecto — cualquier variante de A es, en ese sentido, igual de segura frente a Prisma. **Compatibilidad con NestJS:** sin impacto confirmado (la inyección vía `useFactory` no requiere `.constructor`). **Riesgo de romper introspección/librerías:** el más alto de todas las estrategias si se elige lanzar o `undefined`/`null`; bajo si se elige devolver `Object` (ver Estrategia C). **Impacto sobre serialización/logging/inspección:** lanzar rompería cualquier intento de `console.log`/`util.inspect` que internamente consulte `.constructor.name` para el prefijo de clase (mismo mecanismo ya aceptado como "efecto cosmético" para `getPrototypeOf`, pero acá con consecuencia de **excepción no capturada**, no solo un prefijo distinto — diferencia cualitativa importante).

### Estrategia B — Fachada segura para `"constructor"`

Construir una función/clase propia del mecanismo, con `.prototype` propio pero deliberadamente vacío, sin heredar de `PrismaService`/`PrismaClient`.

- **Función ordinaria vs. ligada vs. flecha:** una función flecha no es viable como sustituto — las funciones flecha nunca tienen `.prototype` propio (por un motivo distinto al de las funciones ligadas, pero con el mismo efecto de "no hay nada que devolver ahí", lo cual reintroduce la misma ambigüedad semántica que ya se descartó para `getPrototypeOf`/`null` en V1). Una función ordinaria (`function Cliente() {}`) o una clase vacía (`class ClienteSeguro {}`) sí tendría `.prototype` propio, controlado, vacío — viable, pero requiere definir y mantener ese objeto nuevo.
- **`Object.freeze`:** aplicable a la fachada para impedir que código consumidor la modifique — mitigación adicional de integridad, bajo costo si se opta por esta estrategia.
- **`Object.setPrototypeOf`:** podría usarse sobre la fachada para fijar explícitamente su `[[Prototype]]` a `Function.prototype` (o `null`), en lugar de confiar en el comportamiento por defecto de una declaración — más robusto, pero agrega una línea de configuración adicional.
- **Riesgos de invariantes:** ninguno relevante — la fachada es un objeto plano, no un `Proxy`, sin ninguna invariante de ECMAScript de las ya analizadas en esta cadena de documentos aplicándose a ella.
- **Superficie de complejidad adicional:** mayor que las Estrategias C/D — requiere definir, documentar y mantener un objeto nuevo (la fachada), además de la lógica del trap que la devuelve.

### Estrategia C — Devolver `Object` (el constructor global) como `"constructor"`

- `cliente.constructor === Object`: simple, no requiere construir nada nuevo — `Object` ya existe como global de JavaScript.
- `cliente.constructor.prototype === Object.prototype`: automáticamente cierto, sin ninguna intervención adicional — relación estándar y universal de JavaScript (`Object.prototype.constructor === Object`).
- **Coherencia con `getPrototypeOf` (ya devuelve `Object.prototype`, decisión ya vigente y validada en V1/V2):** MÁXIMA — `Object` es, precisamente, la contraparte natural de `Object.prototype` — un objeto cuyo prototipo aparente es `Object.prototype` "debería" tener `Object` como constructor aparente, exactamente como cualquier objeto plano `{}` real lo tiene. No introduce ninguna inconsistencia nueva al mecanismo; la refuerza.
- `instanceof`: `cliente instanceof Object` ya da `true` desde V1/V2 (por el trap `getPrototypeOf`) — devolver `Object` como constructor es perfectamente consistente con eso, sin fricción.
- **Riesgo de bypass:** nulo — `Object.prototype`/`Object` no contienen ningún método relacionado con Prisma (ya confirmado exhaustivamente en la Auditoría original de H-02).
- **Introspección:** `console.log`/`util.inspect` mostrarían el cliente como un objeto plano genérico, sin prefijo de clase — mismo efecto cosmético ya aceptado para el resto del mecanismo, sin ninguna excepción no capturada (a diferencia de la Estrategia A con `throw`).

### Estrategia D — Mantener el `.bind()` actual, sanear la cadena de prototipos del resultado

Ejecutar `Object.setPrototypeOf(funcionLigada, Function.prototype)` (o `null`) inmediatamente después de `.bind(target)`, antes de devolver el valor, **solo cuando la clave sea `"constructor"`**.

- **Impacto sobre `call`/`apply`/`bind`:** ninguno — cambiar el `[[Prototype]]` de una función no afecta su invocabilidad, que depende de su naturaleza de objeto función, no de su cadena de herencia.
- **Riesgo de modificar referencias compartidas:** **bajo, y por un motivo estructural importante** — `.bind()` crea una función **nueva** en cada invocación (nunca la misma referencia entre lecturas distintas de `cliente.constructor`) — por lo tanto, `Object.setPrototypeOf` aplicado sobre ese objeto recién creado **no afecta a `PrismaService` ni a `PrismaClient` reales**, ni a ninguna otra referencia compartida — es, en ese sentido, una mutación segura porque el objeto mutado es efímero y propio del trap, nunca compartido con nada más.
- **Costo y mantenibilidad:** bajo — una línea adicional, condicionada a `prop === "constructor"`, dentro del mismo trap `get` ya existente.

### Estrategia E — Interceptar únicamente accesos posteriores a `.prototype`

Técnicamente exigiría que `cliente.constructor` nunca devuelva la función ligada "cruda", sino que la envuelva ella misma en un `Proxy` adicional (una micro-membrana de segundo nivel, aplicada solo a este valor específico), cuyo propio trap `get` bloquee `"prototype"`.

- Viable en principio, pero introduce una segunda capa de `Proxy` — mayor complejidad que las Estrategias C/D, sin beneficio de seguridad adicional sobre ellas (todas cierran el mismo conjunto de vectores confirmados en la sección 3).

### Estrategia F — Lista permitida completa (allowlist), reemplazo del acceso dinámico

Misma estrategia arquitectónica de fondo ya evaluada y descartada 3 veces en esta cadena de documentos (Estrategia D del Diseño V1, Estrategia 4 de la Revisión de Decisiones Técnicas, Estrategia D del Diseño V2), por el mismo motivo: alto costo, alto riesgo de regresión, desproporcionado frente a un vector ya acotado con precisión. Se reconsidera acá solo por completitud, sin nueva evidencia que cambie esa evaluación ya asentada.

---

## 5. Análisis de bloquear `"constructor"`

- **¿Prisma necesita que consumidores externos lean `cliente.constructor`?** Sin evidencia de que sí — Prisma nunca ve el objeto envuelto por el `Proxy` externo del proyecto, opera enteramente sobre sus propios objetos internos.
- **¿NestJS utiliza esa propiedad después de la inyección?** Sin evidencia — la inyección vía `useFactory` no requiere inspeccionar `.constructor` del valor resuelto (ya confirmado en `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, sección 15).
- **¿El propio código del proyecto la utiliza?** **No.** Búsqueda estática (`grep -rn` de `.constructor`, `["constructor"]`, `Reflect.get(...constructor...)`) en la totalidad de `backend/src`: **0 resultados**.
- **¿Queries normales la utilizan?** No — las queries se invocan vía los delegados de modelo (`cliente.cliente.findMany(...)`, etc.), nunca vía `.constructor`.
- **¿`$transaction` la utiliza?** Sin evidencia — es un método invocado directamente, no depende de inspeccionar `.constructor` del cliente que lo invoca.
- **¿Logging o inspección pueden utilizarla?** En teoría sí (`util.inspect`/`console.log` consultan `.constructor.name` para decidir el prefijo de clase al formatear la salida) — mismo efecto cosmético ya aceptado y validado para `getPrototypeOf` en V1/V2.
- **¿Bloquearla produciría una regresión observable?** Con la Estrategia A (lanzar/`undefined`/`null`): riesgo real, aunque no confirmado con certeza absoluta sin auditar cada dependencia externa. Con la Estrategia C (`Object`): sin regresión esperada, dado que es indistinguible de un objeto plano legítimo para cualquier código que haga *duck-typing* genérico.
- **¿Devolver `Object` sería menos disruptivo que lanzar?** Sí, claramente — cualquier código que haga `typeof cliente.constructor === "function"` seguiría funcionando (`Object` es una función); cualquier intento de `new cliente.constructor()` obtendría un objeto plano en lugar de una excepción no capturada.
- **¿Devolver `undefined` sería más o menos compatible?** Menos compatible que `Object` — rompe la expectativa universal de que todo objeto tiene `.constructor`.
- **¿Qué comportamiento imita mejor un objeto ordinario saneado?** Devolver `Object` — es exactamente lo que un objeto cuyo prototipo real fuera `Object.prototype` (la elección ya vigente para `getPrototypeOf`) tendría de forma nativa, sin ninguna intervención adicional.

---

## 6. Función o valor seguro (si se elige Estrategia C)

| Propiedad | Valor |
|---|---|
| Valor exacto | El global `Object` (la función constructora estándar de JavaScript, ya existente, sin construir nada nuevo) |
| `typeof` esperado | `"function"` |
| `.prototype` propio | `Object.prototype` — el real, universal, el mismo que cualquier objeto JS ordinario usa; nunca contiene métodos de Prisma |
| `.prototype` heredado | No aplica — `Object.prototype` es el propio, no heredado |
| `constructor` de ese valor | `Object.prototype.constructor === Object` — relación circular estándar, sin ninguna rareza |
| `Object.getPrototypeOf(Object)` | `Function.prototype` — comportamiento estándar universal, sin ninguna cadena hacia Prisma |
| `Reflect.getPrototypeOf(Object)` | Idéntico |
| `Object.__proto__` | `Function.prototype`, idéntico |
| Posibilidad de invocación | `Object()` es válida y completamente segura (crea un objeto vacío) |
| Posibilidad de construcción con `new` | `new Object()` también válida y segura |
| Propiedades propias | Las estándar de la función global `Object` (`name`, `length`, y sus métodos estáticos ya públicos: `keys`, `values`, `assign`, etc. — ninguno relacionado con Prisma) |
| Propiedades heredadas | Las de `Function.prototype` (`call`, `apply`, `bind`, etc.) — estándar |
| Estabilidad de identidad entre accesos | **Total y perfecta** — `Object` es siempre la misma referencia global; `cliente.constructor === cliente.constructor` sería `true` (mejora respecto del mecanismo actual, que crea una nueva función ligada en cada lectura, por lo que hoy esa misma comparación da `false`) |
| Impacto en rendimiento | **Mejor** que el actual — no se ejecuta ningún `.bind()` para esta clave específica, se retorna una referencia constante ya existente, sin ninguna asignación nueva |

---

## 7. Identidad y caché

Bajo la Estrategia C, cada lectura de `cliente.constructor` debe devolver **la misma referencia** (el global `Object`) — no requiere caché, `freeze` ni gestión de estado propio, dado que `Object` es un valor global inmutable en su identidad (no puede dejar de ser el mismo objeto entre lecturas, es una garantía del lenguaje). **Sin riesgo de memory leak** — no se crea ningún objeto nuevo por cada lectura (mejora respecto del `.bind()` actual, que sí crea una función nueva cada vez, con el costo de recolección de basura correspondiente). **Identidad referencial:** estable y perfecta. **Consistencia:** total. **Testabilidad:** mejorada — una comparación directa (`expect(cliente.constructor).toBe(Object)`) es trivial y determinística, sin necesitar comparar por `typeof`/nombre como hoy. **Posibilidad de manipulación por el consumidor:** `Object` es el objeto global estándar del proceso — cualquier código JavaScript ya podría, en teoría, mutar propiedades de `Object` global (una práctica extremadamente inusual y detectable en cualquier código responsable); este riesgo es idéntico al que **ya existe** en cualquier programa JavaScript, no específico ni agravado por esta elección. **No se requiere `freeze` adicional** — congelar el objeto global `Object` del proceso completo afectaría a toda la aplicación (y a cualquier librería de terceros que dependa de extender `Object`), muy por fuera del alcance de H-02.

---

## 8. Interacción con el trap `get`

**Orden recomendado dentro del trap `get`:**

1. Métodos raw bloqueados (`METODOS_RAW_BLOQUEADOS`) — ya existente, primero.
2. `"__proto__"` — ya existente, segundo.
3. `"constructor"` — **nuevo**, tercero, con retorno fijo (`Object`, si se confirma la Estrategia C), **sin leer `target["constructor"]` en ningún momento**.
4. Lectura normal (`target[prop]`) — para cualquier otra clave, sin cambios.
5. `.bind(target)` si el valor es función — sin cambios, y ya no se aplica nunca a `"constructor"` (que se resuelve antes, en el paso 3).

**Respuestas puntuales:**

- **¿`constructor` debe resolverse antes de leer `target[prop]`?** Sí — con retorno fijo, sin tocar la lectura genérica en absoluto para esta clave.
- **¿Debe evitarse por completo acceder al constructor real?** Sí, recomendado — no hay ningún motivo para leer `target["constructor"]` si el resultado se va a sustituir de todas formas; evitar la lectura real también evita depender de cualquier efecto lateral no confirmado que la resolución interna de Prisma pudiera tener al resolver esa clave.
- **¿Debe reutilizarse un valor seguro constante?** Sí — `Object` ya es, por definición, constante y global; no requiere ninguna variable de módulo nueva.
- **¿Puede la simple lectura `target.constructor` producir efectos laterales?** No confirmado ni descartado — pero, bajo la estrategia recomendada, esta pregunta queda sin relevancia práctica: al no leerse en absoluto, cualquier efecto lateral hipotético queda evitado por diseño, no por haberlo descartado empíricamente.
- **¿Qué ocurre con símbolos?** `"constructor"` es siempre una clave de tipo string, nunca un `Symbol` — el chequeo (`prop === "constructor"`) no interfiere con ningún acceso vía `Symbol`, que sigue la rama genérica sin cambios, mismo patrón ya usado para `"__proto__"` y para los 4 métodos raw.
- **¿Qué ocurre con propiedades llamadas `"constructor"` propias de modelos o extensiones?** No se ha detectado, en ningún documento previo de esta cadena, ningún modelo Prisma o extensión organizacional que use `"constructor"` como nombre de campo de negocio (sería, además, una colisión extremadamente improbable e inconveniente para el propio Prisma). Se documenta como limitación aceptada: si alguna vez existiera un modelo con un campo literalmente llamado `"constructor"`, esta política lo taparía igual que la política ya vigente tapa cualquier campo llamado `"__proto__"` — mismo trade-off ya aceptado en el mecanismo existente.

---

## 9. Propiedad `"constructor"` propia o heredada

Confirmado (`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, y reconfirmado en `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`): `"constructor"` **nunca** es propiedad propia de `target` (el `Proxy` interno de Prisma) — siempre se resuelve por herencia, más abajo en su cadena.

La política debe **bloquear siempre la clave literal `"constructor"`**, sin mirar el valor real ni distinguir si sería propio o heredado en `target` — porque:
- El trap `get` no puede, de forma natural, diferenciar entre lectura de propiedad propia vs. heredada sin lógica adicional (`target.hasOwnProperty(prop)`), y no hay ningún beneficio de seguridad en intentar esa distinción: cualquier lectura de `"constructor"`, propia o heredada, tiene el mismo potencial de exponer una función con `.prototype` peligroso.
- Una extensión de Prisma que en el futuro definiera su propia propiedad `"constructor"` quedaría igual de bloqueada, sin necesitar ningún ajuste — la política no depende de dónde viva la propiedad real.
- Un valor no-función llamado `"constructor"` (en teoría posible, aunque extremadamente inusual) también queda cubierto sin problema — la política bajo la Estrategia C recomendada no depende de verificar `typeof valor === "function"` antes de decidir bloquear, a diferencia de la lógica actual del resto del trap.
- Frente a futuras versiones de Prisma: la política recomendada es **robusta** por diseño, precisamente porque no depende de leer ni inspeccionar el valor real de `"constructor"` en ningún momento — a diferencia del mecanismo actual, que sí lee `target["constructor"]` y confía (una confianza que resultó **infundada** para la clase real del proyecto) en que el `.bind()` posterior sea suficiente.

**Definición de política:** bloquear siempre la clave literal `"constructor"`, sin excepción contextual, sin depender del tipo ni del origen del valor real subyacente.

---

## 10. Constructor de funciones (`Function`)

`cliente.constructor.constructor` y `cliente.constructor.constructor("return globalThis")()`:

Bajo la Estrategia C (`cliente.constructor === Object`), `cliente.constructor.constructor` = `Object.constructor` = **`Function`**, el constructor global de JavaScript — este es exactamente el mismo resultado que **cualquier función de cualquier objeto en cualquier programa JavaScript** expone (`(function(){}).constructor === Function`, `Array.constructor === Function`, `(() => {}).constructor === Function`, sin ninguna excepción posible en el lenguaje) — no es un vector introducido, habilitado, ni agravado por el mecanismo de este proyecto ni por Prisma en particular.

**Distinción central, conforme a la instrucción explícita de esta etapa:** el acceso a `Function` (y por extensión, la capacidad de ejecutar código arbitrario vía `Function("código")(...)`) es una propiedad **inherente al lenguaje JavaScript**, alcanzable desde absolutamente cualquier función de cualquier objeto disponible en el entorno de ejecución — no es una amenaza que H-02 pueda, deba, o esté diseñado para cerrar. Ni bloquear ni sanear `cliente.constructor` elimina este camino en términos absolutos (seguiría existiendo vía cualquier otro objeto del programa, sin relación con `cliente`), y tampoco lo introduce ni lo agrava: si un atacante ya tiene la capacidad de ejecutar expresiones JavaScript arbitrarias contra `cliente` (prerrequisito indispensable para siquiera escribir `cliente.constructor.constructor(...)`), ya tiene, por definición, exactamente la misma capacidad vía cualquier otro objeto del mismo contexto — el umbral de amenaza es "ejecución de código arbitrario dentro del proceso", el mismo ya reconocido y aceptado en toda esta cadena de H-02 para el resto de los vectores, no uno nuevo ni más grave.

**Conclusión:** `cliente.constructor.constructor` (y su uso para ejecutar código arbitrario) se clasifica como **fuera de alcance** de H-02 — una característica general e ineliminable del lenguaje, no una amenaza específica a la seguridad organizacional/de aislamiento que este bloque protege (acceso privilegiado a los 4 métodos raw de Prisma). No se amplía H-02 hacia un sandbox general de JavaScript.

---

## 11. Matriz comparativa

| Criterio | A (bloquear, throw/undefined) | B (fachada) | C (`Object`) | D (bind + setPrototypeOf) | E (membrana anidada) | F (allowlist total) |
|---|---|---|---|---|---|---|
| Cierra `constructor.prototype` | Sí | Sí | Sí | Sí | Sí | Sí |
| Cierra acceso a `PrismaService` | Sí | Sí | Sí | Sí | Sí | Sí |
| Cierra acceso a `PrismaClient` | Sí | Sí | Sí | Sí | Sí | Sí |
| Cierra métodos raw heredados | Sí | Sí | Sí | Sí | Sí | Sí |
| Riesgo de regresión | Medio-alto (semántica disruptiva) | Bajo | **Muy bajo** | Bajo | Bajo-medio (más piezas) | Alto |
| Compatibilidad con Prisma | Alta | Alta | Alta | Alta | Alta | Incierta |
| Compatibilidad con NestJS | Alta | Alta | Alta | Alta | Alta | Alta |
| Complejidad | Baja | Media | **Muy baja** | Baja | Media-alta | Muy alta |
| Mantenibilidad | Media (mensaje/excepción a mantener) | Media (objeto nuevo a mantener) | **Alta** (nada que mantener, valor global estable) | Media | Media-baja (más piezas) | Muy baja |
| Rendimiento | Neutro | Neutro/leve costo de construcción | **Mejor que el actual** (sin `.bind()` para esta clave) | Neutro (mismo `.bind()` + 1 línea) | Leve costo (Proxy adicional) | Incierto |
| Invariantes ECMAScript | Sin riesgo (trap `get` ya lanza en otros casos) | Sin riesgo | Sin riesgo | Sin riesgo (mutación sobre objeto efímero propio) | Sin riesgo, pero más superficie de invariantes a revisar | Riesgo si se maneja mal cada delegado |
| Facilidad de testing | Media (verificar excepción) | Media (verificar identidad de la fachada) | **Alta** (comparación directa `=== Object`) | Media | Media | Baja (mucha superficie) |
| Superficie de cambio | 1 rama nueva en el trap `get` | 1 rama + 1 objeto nuevo | **1 rama nueva en el trap `get`, sin objetos nuevos** | 1 rama + 1 línea | 1 rama + 1 Proxy nuevo | Reescritura completa |
| Dependencia de internals de Prisma | Ninguna | Ninguna | **Ninguna** | Ninguna | Ninguna | Ninguna |

---

## 12. Estrategia recomendada

**Estrategia C — devolver el constructor global `Object` para la clave `"constructor"`, interceptada explícitamente y de forma temprana en el trap `get` ya existente.**

Frente a los 8 criterios de priorización fijados para esta etapa:

1. **Cobertura completa del bypass:** total — cierra los vectores 1-10 y 13-15 de la sección 3 (los únicos confirmados dentro del alcance de H-02).
2. **Mínima superficie de cambio:** la mínima de las 6 estrategias — una rama nueva dentro del trap `get` ya existente, sin construir ningún objeto adicional, sin archivo nuevo, sin dependencia nueva.
3. **No tocar el `target`:** cumplido — la sustitución ocurre enteramente en el valor de retorno del trap, nunca se lee ni se muta `target["constructor"]`.
4. **No tocar prototipos reales:** cumplido — `Object.prototype` es el prototipo universal de JavaScript, no un prototipo real de Prisma; no se muta nada.
5. **No crear una membrana completa:** cumplido — a diferencia de la Estrategia E, no se agrega ningún `Proxy` adicional.
6. **Compatibilidad con `PrismaService`:** cumplida — no depende de ningún detalle interno de `PrismaService`/`PrismaClient`, cierra el vector sin importar cómo esas clases estén implementadas o cambien en el futuro.
7. **Facilidad de validación:** la mayor de las 6 — comparación directa por identidad (`=== Object`), sin ambigüedad.
8. **Bajo riesgo de regresión:** el más bajo de las 6 — semánticamente coherente con la decisión ya vigente de `getPrototypeOf` (`Object.prototype`), sin ninguna excepción no capturada ante una simple lectura.

**Valor que devolverá el trap `get` para `"constructor"`:** el global `Object`.
**¿Lanzará o no?** No lanzará — devuelve un valor válido y coherente, consistente con el resto del mecanismo (que solo lanza ante intentos de *mutación* o acceso directo a los 4 métodos raw, nunca ante una lectura no destructiva).
**¿Conservará identidad estable?** Sí, siempre la misma referencia (`Object` es un global único e inmutable en su identidad).
**¿Será mutable?** El valor devuelto (`Object`) es el objeto global estándar del proceso — mutable en el sentido genérico en que cualquier objeto JavaScript lo es, pero esto no es un riesgo introducido por esta decisión (ver sección 7).
**¿Tendrá `.prototype`?** Sí — `Object.prototype`, el real y universal, verificado sin ningún método de Prisma.
**¿Heredará de `Function`?** Sí, de forma estándar (`Object.__proto__ === Function.prototype`) — sin ninguna cadena hacia `PrismaClient`.
**¿Cómo se validará que no conduce a `PrismaClient.prototype`?** Con un test que confirme, explícitamente, `cliente.constructor === Object` y `cliente.constructor.prototype === Object.prototype` (identidad exacta, no solo ausencia de `$queryRaw`) — ver sección 15.

No se escribe código definitivo en este documento.

---

## 13. Impacto sobre el Diseño V2

| Sección original de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` | Estado | Cambio necesario | Motivo |
|---|---|---|---|
| 2 — Objetivos de seguridad | Ajuste menor | Agregar explícitamente: "impedir recuperación de `PrismaService`/`PrismaClient` vía `constructor`" como objetivo propio, distinto del ya existente "impedir bypass mediante `constructor.prototype`" (que ya estaba, pero sin el mecanismo que lo cumpliera realmente) | El objetivo ya existía en la lista, pero el mecanismo que se suponía lo cumplía (`.bind(target)` solo) resultó insuficiente |
| 3 — Modelo de amenazas actualizado | Reemplazo parcial | La fila "H — `constructor.prototype`" debe reclasificarse de "Bajo — depende de que el `.bind(target)` no se remueva" a **confirmado, explotable contra la clase real**; agregar las filas de los vectores 7-10 y 13-15 de la sección 3 de este documento | El riesgo estaba subestimado; la investigación demostró que no dependía de remover el `.bind()`, sino de una limitación estructural de esa defensa por sí sola |
| 5 — Análisis de la estrategia principal (trap `set`) | Sin cambios | Ninguno | El trap `set` para `__proto__` no está relacionado con este hallazgo, sigue siendo correcto |
| 8 — Interacción entre traps | Reemplazo parcial | Agregar una fila nueva para `"constructor"` en la tabla de interacción, con el trap `get` (rama nueva) como responsable, y actualizar la fila de `constructor.prototype` de "riesgo residual" a "cerrado, por la rama nueva del trap `get`" | La tabla original no contemplaba una rama específica para `"constructor"`, asumía que el `.bind()` genérico bastaba |
| 10 (numeración original: `constructor.prototype`) | Reemplazo parcial | La conclusión "mantener la decisión sin cambios" queda revertida — se requiere la nueva rama explícita (Estrategia C de este documento) | Directamente contradicho por la evidencia nueva |
| 12 — Tests unitarios propuestos | Ajuste menor | Agregar los tests de la sección 15 de este documento a la lista ya existente (que solo tenía 1 test genérico de `constructor.prototype`, insuficiente) | La cobertura anterior no distinguía `PrismaService` real de un mock, el mismo error metodológico ya identificado |
| 13 — Tests de integración propuestos | Ajuste menor | Igual que el punto anterior, agregar los tests de integración de la sección 15 | Idéntico motivo |
| 14 — Validación adversarial | Ajuste menor | Agregar los vectores 7-15 de la sección 3 de este documento a la matriz ya existente | La matriz original solo tenía `cliente.constructor`/`cliente.constructor.prototype`, sin las variantes `Object.getPrototypeOf`/`Reflect.getPrototypeOf`/`__proto__` aplicadas sobre el propio constructor |
| 17 — Riesgos | Ajuste menor | Agregar una fila nueva: "la defensa de `constructor.prototype` depende únicamente de `.bind(target)`, sin verificar contra la clase real del proyecto" — con probabilidad "confirmada" (ya no un riesgo hipotético) | Directamente la causa del bloqueo de V2 |
| 20 — Criterios de aceptación | Ajuste menor | Agregar los criterios específicos de la sección 16 de este documento | Los criterios existentes ("constructor.prototype continúa protegido") no eran lo suficientemente específicos para haber detectado este hallazgo a tiempo |
| 21 — Criterios de detención | Ajuste menor | Agregar los criterios específicos de la sección 17 de este documento | Mismo motivo |
| El resto de las secciones (1, 4, 6, 7, 9, 11, 15, 16, 18, 19) | Sin cambios | Ninguno | No relacionadas con `constructor`/`constructor.prototype` — H-07, `Receiver`, `getPrototypeOf`/`setPrototypeOf` del cliente, `TransactionClient`, alcance de archivos, plan de implementación general, todos permanecen exactamente como ya fueron diseñados y validados |

---

## 14. Impacto sobre la Pre-Implementación V2

- **Pasos nuevos:** dentro del "Orden de implementación" ya existente, agregar explícitamente un paso para "incorporar la rama `"constructor"` al trap `get`, devolviendo `Object`" — ubicado junto al paso ya existente de "conservar el trap `get`" (no reemplaza ningún paso, se inserta como uno adicional).
- **Tests nuevos:** los 17 de la sección 15 de este documento, reemplazando/ampliando la cobertura de `constructor.prototype` que la Pre-Implementación V2 original daba por cerrada con un único test genérico.
- **Criterios de aceptación nuevos:** los de la sección 16 de este documento, agregados a la lista ya existente.
- **Criterios de detención nuevos:** los de la sección 17 de este documento, agregados a la lista ya existente — en particular, el criterio explícito "`PrismaClient` directo pasa pero `PrismaService` real falla" (la lección directa de esta cadena de investigación) debe quedar EXPLÍCITO desde el inicio, no descubierto durante la ejecución como ocurrió esta vez.
- **¿El alcance de archivos continúa siendo el mismo?** Sí — ver sección 18.

---

## 15. Tests obligatorios futuros

| # | Test | Tipo | Justificación |
|---|---|---|---|
| 1 | `cliente.constructor` no expone `PrismaService` (`cliente.constructor !== PrismaService`, o mejor, `cliente.constructor === Object`) | **Requiere `PrismaService` real** | Es el vector confirmado — un mock no lo reproduce |
| 2 | `cliente.constructor` no expone `PrismaClient` | **Requiere `PrismaService` real** | Idéntico motivo |
| 3 | `cliente.constructor.prototype` no expone `PrismaClient.prototype` (`cliente.constructor.prototype === Object.prototype`) | **Requiere `PrismaService` real** | Idéntico motivo |
| 4-7 | `cliente.constructor.prototype.$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` no son alcanzables | **Requiere `PrismaService` real** | Es, literalmente, la confirmación del cierre del hallazgo de esta cadena de documentos |
| 8 | `Reflect.get(cliente, "constructor")` mantiene la misma protección | Puede usar mock (mismo trap `get`, mismo mecanismo que el vector 1, no depende de las características del objeto envuelto una vez que la rama `"constructor"` existe) | Confirma que la protección no depende de la sintaxis de acceso |
| 9 | `Object.getPrototypeOf(cliente.constructor)` no permite reconstruir el camino | Puede usar mock, aunque se recomienda reconfirmar contra `PrismaService` real por prudencia (mismo criterio ya aplicado a otros vectores en esta cadena) | Vector derivado directamente del vector 1, una vez cerrado este también debería cerrarse |
| 10 | `cliente.constructor.__proto__` no permite reconstruir el camino | Igual que el 9 | Idéntico |
| 11 | `cliente.constructor.constructor` no reabre ningún acceso relevante para H-02 (confirma que da `Function`, igual que en cualquier objeto JS, sin relación con Prisma) | Puede usar mock | Documenta el límite de alcance fijado en la sección 10, no una defensa adicional |
| 12 | Métodos Prisma legítimos siguen funcionando (regresión) | Requiere `PrismaService` real (idealmente con Postgres, para confirmar `$connect` real) | Regresión estándar ya exigida en toda esta cadena |
| 13 | `$transaction(callback)` sigue funcionando | Integración (Postgres real) | Regresión estándar |
| 14 | `$transaction(array)` sigue funcionando | Integración (Postgres real) | Regresión estándar |
| 15 | Comportamiento idéntico en Jest y Node compilado, **usando la misma clase (`PrismaService`) en ambos** | Ambos entornos, mismo script/test | Aplicación directa de la lección de `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md` — la comparación Jest/Node solo es válida si ambos usan la clase real |
| 16 | Prueba obligatoria usando `PrismaService` real | Ya cubierta por los vectores 1-7, 12-14 — no es un test adicional, es la característica que todos esos deben cumplir | — |
| 17 | Prueba diferenciada con `PrismaClient` directo, únicamente como control de regresión metodológica (confirmar que con `PrismaClient` crudo el resultado ya era `undefined`, para no perder ese antecedente documental) | Puede usar `PrismaClient` directo, explícitamente etiquetado como "control histórico", no como validación de seguridad | Preserva la evidencia ya reunida sin necesitar repetir la investigación completa |

**Clasificación resumida:** 6 tests (1-7, 12) requieren obligatoriamente `PrismaService` real; 5 tests (8-11, 17) pueden usar mock o `PrismaClient` directo (con distinta finalidad cada uno, documentada); 2 tests (13-14) requieren integración con Postgres real; 1 test (15) exige ejecutarse en ambos entornos con la misma clase.

---

## 16. Criterios de aceptación actualizados

- ✓ El constructor productivo (`PrismaService`) no queda expuesto por ninguna vía.
- ✓ `PrismaService` no alcanzable desde `cliente.constructor` ni desde ninguna variante (`Reflect.get`, `__proto__`, `getPrototypeOf`).
- ✓ `PrismaClient` no alcanzable por ninguna vía equivalente.
- ✓ `PrismaClient.prototype` no alcanzable por ninguna vía equivalente.
- ✓ Los 4 métodos raw no alcanzables mediante `cliente.constructor.prototype` ni ninguna variante derivada.
- ✓ `Reflect.get(cliente, "constructor")` está protegido de la misma forma que `cliente.constructor`.
- ✓ La cadena de prototipos del valor sustituto (`Object`) es la estándar y segura (`Object.prototype`, sin ninguna desviación).
- ✓ Identidad estable entre lecturas sucesivas de `cliente.constructor` (`=== Object` siempre).
- ✓ `target` intacto tras cada vector de la matriz de validación.
- ✓ Prototipos reales (`PrismaService.prototype`, `PrismaClient.prototype`, `Object.prototype`) intactos tras cada vector.
- ✓ Métodos Prisma legítimos siguen funcionando, sin regresión.
- ✓ Transacciones (`$transaction`, `tx.$queryRaw`/`tx.$executeRaw`) siguen funcionando, sin regresión.
- ✓ Resultado idéntico entre Jest y Node compilado, usando la misma clase (`PrismaService`) en ambos.
- ✓ `PrismaService` real validado explícitamente — no basta con que los tests pasen contra un mock ni contra `PrismaClient` directo.

---

## 17. Criterios de detención actualizados

Una futura implementación deberá detenerse si:

- `cliente.constructor` sigue exponiendo `PrismaService`.
- `cliente.constructor` sigue exponiendo `PrismaClient`.
- `cliente.constructor.prototype` (o cualquier variante derivada) sigue exponiendo cualquiera de los 4 métodos raw.
- La defensa implementada depende únicamente de `.bind(target)`, sin una rama explícita adicional para `"constructor"`.
- Se modifica `PrismaService.prototype`.
- Se modifica `PrismaClient.prototype`.
- Se modifica `Function.prototype`.
- Se altera el `target` real de cualquier forma.
- Falla cualquier método Prisma legítimo.
- Falla `$transaction`, en cualquiera de sus formas.
- Jest y Node compilado difieren en el resultado, usando la misma clase en ambos.
- `PrismaClient` directo pasa las pruebas pero `PrismaService` real falla — **criterio explícito, directamente derivado de la causa del bloqueo anterior**.
- La solución exige una membrana completa (cobertura de todos los 13 traps de `Proxy`) sin aprobación explícita previa.
- Se requiere modificar otro archivo productivo además de `organizacion-prisma.client.ts`.

En cualquiera de estos casos: detener, no improvisar, documentar el bloqueo — mismo protocolo ya aplicado en toda esta cadena de H-02.

---

## 18. Alcance de archivos

- **¿Se necesita otro archivo productivo?** No — la Estrategia C recomendada es una rama adicional dentro del mismo trap `get` ya existente, en la misma función.
- **¿Se necesita un helper local?** No estrictamente — `Object` es una referencia global directa, no requiere ninguna función auxiliar.
- **¿Se necesita estado compartido?** No — `Object` no requiere ninguna variable de módulo nueva (a diferencia de, por ejemplo, una fachada de la Estrategia B, que sí la habría necesitado).
- **¿Se necesita modificar `PrismaService`?** No.
- **¿Se necesita modificar NestJS?** No.
- **¿Se necesita modificar la creación del cliente (`organizacion-prisma.module.ts`)?** No.
- **¿Se necesita modificar transacciones?** No.

**Conclusión: se mantiene el alcance original — archivo único (`backend/src/prisma/organizacion-prisma.client.ts`), función única (`bloquearMetodosRawDeNivelSuperior()`), archivo de tests único (`backend/src/prisma/organizacion-prisma.client.spec.ts`).** No se fuerza esta conclusión: la Estrategia C recomendada, por su propia naturaleza (una rama de retorno fijo, sin construir nada nuevo), es la que mejor se ajusta a mantener este alcance sin ninguna tensión.

---

## 19. Próxima etapa

**A) Actualizar parcialmente el Diseño V2 y la Preimplementación V2 mediante documentos V3.**

Justificación: la tabla de la sección 13 muestra que la mayoría de las secciones del Diseño V2 no requieren ningún cambio (H-07, `Receiver`, el trap `set` de `__proto__`, `getPrototypeOf`/`setPrototypeOf` del cliente, `TransactionClient`, el alcance de archivos, el plan de implementación general) — permanecen exactamente como ya fueron diseñados y validados, sin ninguna necesidad de reformulación. Lo que cambia es acotado y preciso: la defensa específica de `constructor`/`constructor.prototype`, en un número limitado de secciones (2, 3, 8, 10, 12-14, 17, 20-21), todas con "ajuste menor" o "reemplazo parcial", nunca "reformulación completa" de la sección. Esto excluye la opción B (reanudar directamente con una enmienda pequeña) porque el cambio, aunque acotado, sí requiere actualizar formalmente el modelo de amenazas y los criterios de aceptación/detención antes de una nueva implementación — no alcanza con "una enmienda técnica pequeña" sin dejar constancia documental de qué cambió y por qué, dado el precedente ya establecido en esta misma cadena (la falta de esa constancia fue, precisamente, cómo se llegó al bloqueo de V2). Excluye también la opción C (reformular por completo H-02) porque no hay ningún cuestionamiento sobre la arquitectura general (`Proxy` con traps adicionales) ni sobre el resto de las decisiones ya cerradas — el problema está circunscripto con precisión a una única propiedad (`"constructor"`) con una solución candidata ya identificada, de bajo riesgo y mínima superficie (sección 12).

No se ejecuta esta etapa en este documento. No se genera todavía el próximo prompt.

---

## Conclusión

**B) DEFENSA DE CONSTRUCTOR REQUIERE REDISEÑO PARCIAL.**

Justificación: no es un "ajuste menor" (opción A) — la decisión original (`DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, sección 5: "no bloquear `constructor` explícitamente... el `.bind(target)` ya cierra el vector") resultó **incorrecta** contra la clase real de producción, no solo incompleta en un detalle menor — se requiere una rama de código nueva (no existente en ningún diseño previo), con su propia estrategia evaluada y comparada contra 5 alternativas, y su propio valor de retorno específico (`Object`) a validar. No es tampoco un "rediseño completo de H-02" (opción C) — el resto del mecanismo (bloqueo de los 4 métodos raw, lectura y escritura de `__proto__`, `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, la no afectación de `tx`) permanece completamente válido, sin ningún cuestionamiento nuevo, y la solución identificada para este vector específico es de complejidad mínima, sin requerir ningún cambio arquitectónico. "Rediseño parcial" es la categoría que refleja con precisión el alcance real: una pieza específica y acotada del diseño ya aprobado necesita una decisión nueva, documentada formalmente (vía documentos V3, según la sección 19), antes de reintentar la implementación.

---

## Informe final

- **Causa del bypass:** `.bind(target)` garantiza correctamente que la función resultante no tenga `.prototype` **propio**, pero no impide que `.prototype` se resuelva por **herencia** a través del `[[Prototype]]` interno de la función ligada — que, para la clase real del proyecto (`PrismaService extends PrismaClient`), apunta a `PrismaClient` (la clase padre real, con su propio `.prototype` real, conteniendo los 4 métodos raw sin protección).
- **Estrategias consideradas:** 6 (A — bloquear con excepción/`undefined`/`null`; B — fachada segura; C — devolver `Object`; D — `bind` + `setPrototypeOf` sobre el resultado; E — membrana anidada; F — allowlist completo), comparadas en una matriz de 13 criterios.
- **Estrategia recomendada:** C — devolver el constructor global `Object` para la clave `"constructor"`, interceptada de forma temprana en el trap `get` ya existente, sin leer el valor real, sin construir ningún objeto nuevo.
- **Valor recomendado para `cliente.constructor`:** el global `Object` (identidad estable, `.prototype === Object.prototype`, coherente con la decisión ya vigente de `getPrototypeOf`).
- **Impacto sobre el Diseño V2:** 9 secciones requieren ajuste menor o reemplazo parcial (2, 3, 8, 10, 12, 13, 14, 17, 20-21); el resto permanece sin cambios.
- **Impacto sobre la Preimplementación V2:** 1 paso nuevo en el orden de implementación; 17 tests nuevos/ampliados reemplazando la cobertura insuficiente anterior; criterios de aceptación y detención ampliados.
- **Alcance de archivos:** sin cambios — se mantiene archivo único, función única, archivo de test único.
- **Cantidad de tests futuros:** 17, con clasificación explícita de cuáles requieren `PrismaService` real (6), cuáles pueden usar mock/`PrismaClient` directo (5, con distinta finalidad cada uno), cuáles requieren integración con Postgres (2), y cuál exige ejecutarse en ambos entornos con la misma clase (1).
- **Riesgos principales:** ninguno de regresión funcional significativo identificado para la Estrategia C recomendada (bajo riesgo en todos los criterios de la matriz comparativa); riesgo residual genérico de que futuras versiones de Prisma introduzcan un vector estructuralmente distinto, no cubierto por ninguna de las defensas ya diseñadas — mismo tipo de riesgo ya aceptado y documentado para el resto de H-02.
- **Próxima etapa recomendada:** A) actualizar parcialmente el Diseño V2 y la Preimplementación V2 mediante documentos V3 — no ejecutada en este documento.
- **Conclusión:** **B) DEFENSA DE CONSTRUCTOR REQUIERE REDISEÑO PARCIAL.**
- **Documento generado:** `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md` (este documento). Ningún otro documento fue generado ni modificado.
- **`git diff`:** idéntico al baseline (`backend/src/prisma/organizacion-prisma.client.ts`, 31 líneas modificadas — el mismo mecanismo original de H-02 ya documentado en etapas previas, sin ningún cambio nuevo de esta etapa).
- **`git status --short`:**

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
?? IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md
?? INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md
?? INVESTIGACION_H02_PROTO_SETTER.md
?? PLAN_PROXIMA_ETAPA.md
?? PRE_IMPLEMENTACION_BLOQUE11.md
?? PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
?? PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md
?? REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md
?? REVISION_IMPLEMENTACION_BLOQUE11.md
?? REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md
?? VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md
?? VALIDACION_FUNCIONAL_BLOQUE11.md
?? backend/src/common/encontrar-o-fallar.spec.ts
?? backend/src/common/encontrar-o-fallar.ts
?? backend/src/prisma/modelos-aislamiento-manual.ts
?? backend/src/prisma/organizacional-models.spec.ts
?? docs/validaciones/
```

Confirmado: `organizacion-prisma.client.ts` aparece únicamente como `M` (modificado, sin diferencia de contenido respecto del baseline ya validado en etapas previas — ningún cambio productivo de esta etapa). El único archivo nuevo agregado por esta etapa es `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`. No se realizó ningún `git add`, `git commit` ni `git push`. No se modificó ningún documento anterior. No se creó, modificó ni eliminó ningún test permanente. No se ejecutó ningún experimento adicional al margen de la única búsqueda estática autorizada (sección 5, sin resultados).

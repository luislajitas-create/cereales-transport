# Investigación — H-02: por qué `cliente.__proto__ = ...` no disparó el trap `setPrototypeOf`

Fecha: 2026-07-24. **Investigación pura — no diseña la solución, no modifica el diseño existente, no reabre la implementación, no modifica ningún archivo del proyecto.** Explica el fenómeno documentado en `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` (bloqueo de la corrección de H-02): por qué `Object.setPrototypeOf()`/`Reflect.setPrototypeOf()` quedaron correctamente bloqueados por el trap `setPrototypeOf`, pero la asignación `cliente.__proto__ = valor` no disparó ese mismo trap y corrompió el objeto real. Toda la evidencia se obtuvo mediante scripts temporales de solo lectura, creados en el directorio de scratchpad de la sesión (fuera del repositorio), sin ninguna escritura en base de datos, eliminados inmediatamente después de cada uso — confirmado en cada punto de control que `git status --short`/`git diff` quedaron idénticos al estado previo a esta etapa.

---

## 1. Reproducción del fenómeno mínimo (Proxy sin Prisma)

Se construyó un `Proxy` mínimo, envolviendo un objeto JavaScript ordinario (`{ metodoLegitimo() {...} }`), con el **mismo `handler` exacto** que `bloquearMetodosRawDeNivelSuperior()` usó durante la implementación bloqueada: traps `get`, `getPrototypeOf`, `setPrototypeOf` — **sin trap `set`** (igual que el código real).

**Resultado, en modo estricto (`"use strict"`):**

| Operación | Trap disparado | Resultado |
|---|---|---|
| `Object.setPrototypeOf(proxy, {})` | `setPrototypeOf` | Lanza correctamente |
| `Reflect.setPrototypeOf(proxy, {})` | `setPrototypeOf` | Lanza correctamente |
| `proxy.__proto__ = {}` | `setPrototypeOf` | **Lanza correctamente** |
| `Reflect.set(proxy, "__proto__", {})` | `setPrototypeOf` | Lanza correctamente |

**Con un objeto JavaScript ordinario como `target`, el mecanismo funciona exactamente como fue diseñado — incluida la asignación vía `__proto__`.** El objeto envuelto (`proxy.metodoLegitimo`) permaneció intacto en los 4 casos. Esto descarta, de entrada, que el problema sea inherente a `Proxy` como mecanismo o a la estrategia de "un solo trap `set` ausente, delegación por defecto" — con un `target` ordinario, esa estrategia cierra los 4 vectores sin excepción.

---

## 2. Proxy + objeto simple

Cubierto íntegramente por la sección 1 (mismo experimento) — se confirmó, además, que la **lectura** de `__proto__` (`proxy.__proto__` sin asignar) pasa por el trap `get` (ya documentado en `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, sección 3, sin novedad acá) y que `Object.getPrototypeOf`/`Reflect.getPrototypeOf` pasan por el trap `getPrototypeOf` — ambos funcionando sin cambios respecto de lo ya documentado.

---

## 3. Proxy + objeto Prisma

Se repitió exactamente el mismo experimento (mismo `handler`, misma instrumentación con `console.log` en cada trap) envolviendo, en lugar de un objeto ordinario, el objeto real devuelto por `prisma.$extends({ name: "experimento-minimo" })` — **una extensión mínima, sin ninguno de los 14 hooks organizacionales del proyecto**, para aislar si el fenómeno depende de la lógica propia del proyecto o es inherente a cualquier objeto que Prisma devuelva de `$extends()`.

**Resultado:**

```
=== proxy.__proto__ = {} (objeto extendido de Prisma real) ===
typeof proxy.$connect ANTES: function
  [ningún trap se registró durante la asignación]
  RESULTADO: no lanzo
typeof proxy.$connect DESPUES: undefined
proxy.marcador DESPUES: CONTAMINADO
Object.getPrototypeOf(proxy) === Object.prototype: true
```

**Traps ejecutados durante el intento de asignación: ninguno.** Ni `get`, ni `setPrototypeOf`, ni (por supuesto) `get`Prototype`Of` (ese sí se ejecutó, pero recién en la verificación posterior, no como parte de la asignación en sí). El trap `setPrototypeOf` de **nuestro** `Proxy` **nunca fue invocado**.

**Diferencias respecto de la sección 1:** con el objeto ordinario, el mismo `Reflect.set(proxy, "__proto__", valor)` disparó `setPrototypeOf` sin excepción. Con el objeto real de `prisma.$extends()`, ese mismo camino de código no disparó ningún trap del `Proxy` externo, y el objeto real quedó con su prototipo mutado (los 3 métodos `$connect`/`$disconnect`/`$transaction`, heredados del prototipo real anterior, dejaron de existir; la propiedad `marcador` del objeto malicioso pasó a ser accesible por herencia). **Confirmado: el fenómeno no depende de los hooks organizacionales del proyecto — se reproduce con una extensión de Prisma vacía.**

---

## 4. Modo estricto

Se probó explícitamente con `"use strict"` presente (secciones 1 y 3, y el experimento adicional de la sección 8) y, para descartar cualquier duda, también sin la directiva en un script CommonJS suelto (comportamiento por defecto no-estricto de Node en un `.js` sin `"use strict"` ni `"type": "module"`). **Resultado: sin ninguna diferencia observable entre modo estricto y no estricto**, ni en la excepción, ni en el valor de retorno, ni en si la modificación llegó a producirse. El modo estricto **no es la variable que explica el fenómeno**.

---

## 5. Descriptor de `__proto__`

`Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")`, verificado directamente:

```
configurable: true
enumerable: false
get: function "get __proto__"
set: function "set __proto__", aridad 1
```

Confirma que `__proto__` es, en efecto, una **propiedad de acceso** (accessor: tiene `get` y `set`, no `value`/`writable`), definida sobre `Object.prototype`, exactamente como documenta el Anexo B de ECMA-262 (*Additional ECMAScript Features for Web Browsers*, sección B.3.1, *"Object.prototype.__proto__"*).

**¿El setter de `__proto__` está obligado por especificación a llamar `[[SetPrototypeOf]]`?** Sí — el algoritmo del setter de Anexo B.3.1 es, en esencia: *"Let O be ? ToObject(this value). ... Let status be ? O.[[SetPrototypeOf]](proto). If status is false, throw a TypeError exception."* No existe, en la especificación, ningún camino alternativo — el setter de `__proto__` siempre delega a `[[SetPrototypeOf]]`, invocado sobre `O = ToObject(this value)` (es decir, sobre el objeto que resulte ser `this` en el momento en que el setter se ejecuta — no necesariamente sobre el objeto donde el setter está definido).

---

## 6. Proxy invariants — qué método interno ejecuta realmente `proxy.__proto__ = ...`

Consultado directamente en la especificación ECMAScript (TC39, [tc39.es/ecma262](https://tc39.es/ecma262/)):

- La asignación `proxy.__proto__ = valor` es, sintácticamente, una asignación de propiedad ordinaria (`MemberExpression.__proto__ = AssignmentExpression`) — se resuelve mediante `PutValue`, que invoca el método interno **`[[Set]]`** sobre `proxy` (no `[[SetPrototypeOf]]` directamente, y no de forma especial por tratarse de la clave `"__proto__"` — la sintaxis de asignación no distingue esta clave de cualquier otra).
- **`[[Set]]` de un objeto exótico `Proxy`** (ECMA-262, *"Proxy Object Internal Methods and Internal Slots"*, sección **10.5.9, `[[Set]] (propertyKey, value, receiver)`**): si el trap `set` del `handler` no está definido, el paso final del algoritmo delega directamente al `target`: *devuelve `? target.[[Set]](propertyKey, value, receiver)`* — crucialmente, el parámetro `receiver` se **propaga sin modificar** (sigue siendo el objeto sobre el que originalmente se invocó `[[Set]]`, es decir, `proxy`).
- **`target.[[Set]]("__proto__", valor, receiver=proxy)`**, si `target` es un objeto ordinario, se resuelve mediante el algoritmo abstracto **`OrdinarySet(O, P, V, Receiver)`** (ECMA-262, sección **10.1.9.1**): si `P` no es una propiedad propia de `O`, el algoritmo camina hacia `O.[[GetPrototypeOf]]()` y **continúa el mismo `Receiver` sin cambiarlo**, recursivamente, hasta encontrar la propiedad — en este caso, en `Object.prototype`. Una vez encontrada como propiedad de acceso: el setter se invoca como **`Call(setterFunc, Receiver, «V»)`** — es decir, con `this = Receiver`, el `Receiver` **original**, no el objeto donde el setter fue hallado.

**Conclusión de la sección 6 (según especificación, comportamiento esperado):** `proxy.__proto__ = valor` debe, por especificación, terminar invocando `proxy.[[SetPrototypeOf]](valor)` — es decir, **debe** disparar el trap `setPrototypeOf` del `Proxy` externo, exactamente como ocurrió en la sección 1 (objeto ordinario). **Esto es justo lo que NO ocurrió en la sección 3 (objeto de Prisma)** — la discrepancia entre el comportamiento esperado por especificación y el comportamiento observado es la pregunta central de esta investigación, resuelta empíricamente en la sección 7.

---

## 7. Instrumentación — ¿dónde se pierde el `Receiver`?

Dado que la especificación exige que el `Receiver` (`proxy`) se propague sin cambios a través de toda la cadena hasta el setter de `Object.prototype.__proto__`, se diseñó un experimento para confirmar, de forma aislada (sin nuestro `Proxy` externo de por medio), si **el objeto real que devuelve `prisma.$extends()` respeta ese contrato** al resolver `[[Set]]` sobre la clave `"__proto__"`.

**Método:** `Reflect.set(objetoReal, "__proto__", valorMalicioso, receiverExplicito)`, con `receiverExplicito` un objeto de control, distinto tanto del `target` como de cualquier objeto interno de Prisma — si el algoritmo `OrdinarySet` se respeta, la mutación **debe** aterrizar sobre `receiverExplicito` (nunca sobre `objetoReal`), sin importar qué haga `objetoReal` internamente.

**Resultado — objeto ordinario (control):**
```
Object.getPrototypeOf(receiverMarcador) después: CAMBIÓ -> {"marcador":"VIA-RECEIVER-EXPLICITO"}
```
Comportamiento correcto: la mutación aterriza exactamente donde la especificación exige.

**Resultado — objeto real de `prisma.$extends()`:**
```
Reflect.set(...) devolvió: true
Object.getPrototypeOf(receiverMarcador) después: SIN CAMBIOS (Object.prototype)
receiverMarcador.marcador después: undefined
```
**El `Receiver` explícito no recibió ninguna mutación, a pesar de que `Reflect.set` devolvió `true` (éxito).** Esto demuestra, de forma directa y aislada (sin que nuestro `Proxy` externo participe en absoluto), que **el objeto devuelto por `prisma.$extends()` no propaga/respeta el parámetro `Receiver` de `[[Set]]` al resolver la propiedad heredada `"__proto__"`** — contradice el comportamiento exigido por `OrdinarySet` (sección 6) para un objeto ordinario.

**Interpretación, dentro de los límites de esta investigación:** este comportamiento — devolver `true` sin operar sobre el `Receiver` provisto — es característico de un objeto cuya resolución de `[[Set]]` **no** sigue el algoritmo `OrdinarySet` estándar, consistente con que el objeto interno que Prisma construye para `$extends()` sea, él mismo, un mecanismo de intercepción de propiedades (p. ej., un `Proxy` propio de Prisma, u otro mecanismo exótico equivalente) cuya propia lógica de resolución no reenvía el `Receiver` recibido, aplicando en su lugar la mutación sobre algún objeto interno propio (consistente con la corrupción real observada en la sección 3: los métodos heredados legítimos del objeto real dejaron de funcionar). **Esta investigación no inspeccionó el código fuente interno de `@prisma/client`** (fuera de las fuentes autorizadas para esta etapa, limitadas a ECMAScript/MDN/V8/Node) — por lo tanto, esta interpretación describe el comportamiento observable y su consistencia con la especificación, sin afirmar conocer el mecanismo interno exacto que Prisma usa para implementarlo.

---

## 8. Node vs. Jest

**Hipótesis a resolver:** la discrepancia documentada en `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` (el test unitario de Jest sí detectó el lanzamiento esperado para `cliente.__proto__ = {}`; un script Node plano contra el mismo mecanismo no lo detectó) — ¿proviene del modo estricto, Babel, `ts-jest`, TypeScript, compilación, V8, Node, u otra causa?

**Experimento:** se reconstruyó, en un script Node plano (sin Jest, sin `ts-jest`, sin compilación TypeScript), **exactamente el mismo mock** que usaba el test unitario original (`ClienteExtendidoFalso`, una clase ES6 ordinaria con `$queryRaw()`/`metodoLegitimo()`), envuelto con el mismo `handler` instrumentado.

**Resultado:**
```
RESULTADO: lanzo -> BLOQUEADO-setPrototypeOf (esperado, igual que en Jest)
typeof proxy.metodoLegitimo tras el intento: function
```

**El mock se comporta idéntico en Node plano y en Jest — lanza correctamente en ambos.** Esto descarta, de forma concluyente, que la discrepancia se deba a `ts-jest`, Babel, TypeScript, el modo de compilación, o alguna particularidad del entorno de ejecución de Jest frente a Node. **La variable real que explica la discrepancia es el objeto envuelto (`target`), no el entorno de ejecución que lo envuelve:**
- El test unitario de Jest envolvía `ClienteExtendidoFalso` (un objeto JavaScript ordinario, una instancia de clase) — se comporta según lo esperado (secciones 1 y 8), motivo por el cual el test pasó.
- El script Node adversarial de la implementación bloqueada envolvía el objeto **real** devuelto por `prisma.$extends()` — que no respeta el contrato de `Receiver` (sección 7), motivo por el cual la asignación no lanzó y corrompió el objeto real.

El test unitario nunca detectó el problema porque, por diseño (para evitar depender de una conexión real, según pedía la Pre-Implementación), usaba un `target` de control que no reproduce esta característica específica del objeto real de Prisma — no porque el test estuviera mal escrito para lo que sí probaba, sino porque el mecanismo elegido para hacerlo "sin conexión real" excluía, sin que se supiera en ese momento, justamente el objeto cuyo comportamiento causa el problema.

---

## 9. ¿El bypass es real?

**A) El bypass descubierto es completamente real.**

Justificación: reproducido de forma consistente en 2 objetos reales distintos devueltos por `prisma.$extends()` (el mínimo de la sección 3 y, ya documentado en la Implementación bloqueada, el cliente organizacional completo con los 14 hooks) — no es un artefacto de un experimento particular ni depende de la lógica propia del proyecto (sección 3). No depende del modo estricto (sección 4). No depende de Jest, Babel, TypeScript ni de ninguna particularidad del entorno de ejecución (sección 8) — se reproduce igual en Node plano contra el código ya compilado. Tiene una causa raíz identificada y confirmada de forma aislada y directa, sin ambigüedad (sección 7: el objeto de Prisma no respeta el `Receiver` de `[[Set]]`, verificado con `Reflect.set` explícito, sin que nuestro `Proxy` externo participe en el experimento). No es "consecuencia del experimento" (opción B) ni "depende del entorno" en el sentido de Node/Jest/estricto (opción C) — depende, sí, de **qué objeto se envuelve**, pero eso no es "el entorno de ejecución", es una característica estructural del propio objeto de Prisma, presente de forma idéntica en cualquier entorno donde se lo use.

---

## 10. Impacto

- **Gravedad:** alta — el vector de escritura (`cliente.__proto__ = valor`) permite reemplazar por completo el prototipo real del cliente organizacional inyectado, con dos efectos observados: (1) corromper funcionalmente el objeto (los métodos heredados legítimos, como `$connect`/`$disconnect`/`$transaction`, dejan de existir); (2) inyectar en el objeto real cualquier propiedad arbitraria del objeto asignado como prototipo (confirmado con `cliente.marcador === "CONTAMINADO"`), incluyendo, en teoría, propiedades con *getters* maliciosos que se ejecutarían automáticamente ante cualquier acceso a una clave no bloqueada explícitamente por el trap `get` (que hace `target[prop]` para cualquier clave no reconocida, y esa lectura ahora recorrería el prototipo contaminado).
- **Explotabilidad:** mismo umbral que el resto del hallazgo H-02 original — requiere ejecución de código dentro del proceso del backend (no es alcanzable desde ningún endpoint HTTP sin escribir código nuevo primero, mismo matiz ya establecido en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`). No introduce un nuevo modelo de amenaza remoto.
- **Superficie afectada:** no es exclusiva de este proyecto ni de los 14 hooks organizacionales — es una característica general de **cualquier** objeto devuelto por `prisma.$extends()` cuando se lo envuelve con un `Proxy` que no define su propio trap `set`. Cualquier mecanismo futuro (de este proyecto o de otro que use el mismo patrón) que intente proteger un cliente extendido de Prisma únicamente con `getPrototypeOf`/`setPrototypeOf` (sin `set`) heredaría el mismo problema.
- **Limitaciones de este hallazgo:** no reabre, por sí solo, el acceso a los 4 métodos raw (`$queryRaw` y los otros 3) — esos siguen sin ser alcanzables por ninguna de las vías ya cerradas (acceso directo, `getPrototypeOf`, `Reflect.getPrototypeOf`, lectura de `__proto__`). Es un vector de **integridad** (corrupción/tampering del objeto real), no un vector adicional de **confidencialidad** directo — aunque el riesgo de escalada vía getters maliciosos (mencionado arriba) no se investigó ni se descartó en esta etapa, por estar fuera del objetivo de "explicar el fenómeno, no corregirlo".

---

## 11. Hipótesis descartadas y confirmadas

| Hipótesis | Evidencia | Resultado | Estado |
|---|---|---|---|
| El problema depende del modo estricto vs. no estricto | Secciones 1, 3, 4, 8 — mismo resultado con y sin `"use strict"` | Sin ninguna diferencia observable | **Descartada** |
| El problema es específico de Jest/`ts-jest`/Babel/compilación TypeScript | Sección 8 — mismo mock, mismo resultado en Node plano y en Jest | Comportamiento idéntico en ambos entornos | **Descartada** |
| El problema es específico de los 14 hooks organizacionales del proyecto | Sección 3 — `prisma.$extends({ name: "experimento-minimo" })`, sin ningún hook, reproduce el mismo fallo | Se reproduce igual sin ningún hook propio | **Descartada** |
| El objeto devuelto por `prisma.$extends()` no respeta el parámetro `Receiver` de `[[Set]]` al resolver `"__proto__"` | Sección 7 — `Reflect.set` con `Receiver` explícito, comparado contra un objeto de control | El objeto de Prisma no propaga la mutación al `Receiver` (a diferencia del control); `Reflect.set` devuelve `true` sin efecto observable sobre el `Receiver` | **Confirmada** |
| La asignación `cliente.__proto__ = valor` no dispara el trap `setPrototypeOf` de nuestro `Proxy` cuando envuelve un cliente Prisma real (hipótesis original, la que motivó esta investigación) | Sección 3 — instrumentación completa de los 3 traps, ninguno se disparó durante la asignación | Confirmado directamente por instrumentación | **Confirmada** |

---

## 12. Conclusión

**HIPÓTESIS ORIGINAL CONFIRMADA.**

Se confirmó, con evidencia empírica reproducible y aislada, que la asignación `cliente.__proto__ = valor` no dispara el trap `setPrototypeOf` de nuestro `Proxy` cuando el objeto envuelto es el resultado real de `prisma.$extends()` (con o sin los hooks del proyecto), y se identificó la causa raíz exacta: **el objeto que Prisma devuelve de `$extends()` no respeta el parámetro `Receiver` del método interno `[[Set]]` al resolver la propiedad heredada `"__proto__"`**, contradiciendo el comportamiento exigido por el algoritmo `OrdinarySet` de la especificación ECMAScript para un objeto ordinario — comportamiento verificado de forma aislada y directa (sección 7), sin depender de nuestro propio `Proxy` para observarlo. La discrepancia entre el resultado del test de Jest (que sí detectó el bloqueo esperado) y el script Node adversarial (que no lo detectó) se explica enteramente por el **objeto envuelto** en cada caso — un mock ordinario en el primero, el objeto real de Prisma en el segundo — y no por ninguna diferencia de entorno de ejecución, modo estricto, o herramienta de compilación (sección 8, hipótesis descartada explícitamente).

El diseño de la corrección (Proxy con traps adicionales) **sigue siendo, en principio, la estrategia correcta** — el problema no está en agregar `getPrototypeOf`/`setPrototypeOf`, ambos funcionaron exactamente como se diseñó para `Object.setPrototypeOf`/`Reflect.setPrototypeOf`. El problema es específico de la vía `__proto__ =`, que depende de un contrato (`Receiver` propagado correctamente) que el objeto de Prisma no cumple — algo que las Decisiones Técnicas previas no pudieron prever porque no existía, hasta esta investigación, evidencia de que el objeto de Prisma se comportara de esta forma no estándar.

**Será necesario revisar `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`** en su sección 4 (tratamiento de `setPrototypeOf`) — la decisión de "lanzar dentro del trap `setPrototypeOf`" sigue siendo válida para `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, pero no alcanza, por sí sola, a cubrir la vía `__proto__ =` cuando el `target` es un objeto de Prisma real — esto requiere una nueva decisión técnica (no necesariamente un cambio de estrategia de Diseño completo), que esta investigación no propone, conforme a su alcance.

---

## Informe final

- **Cantidad de experimentos realizados:** 8 scripts temporales distintos (Proxy mínimo instrumentado con 4 sub-casos; Proxy + `$extends()` mínimo instrumentado; verificación directa de propagación de `Receiver` con objeto de control vs. objeto real de Prisma; inspección del descriptor de `__proto__`; comparación Node-plano vs. mock-de-Jest) — todos de solo lectura, sin escritura en base de datos, todos eliminados inmediatamente después de su uso.
- **Documentación oficial consultada:**
  - [MDN — `handler.set()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/set) — definición del parámetro `receiver` y comportamiento de delegación por defecto.
  - [MDN — `Object.prototype.__proto__`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/proto) — descripción general del setter (remite a la especificación ECMAScript para el algoritmo interno exacto).
  - [ECMA-262 (TC39) — Proxy `[[Set]]`, sección 10.5.9](https://tc39.es/ecma262/#sec-proxy-object-internal-methods-and-internal-slots-set-p-v-receiver) — comportamiento de delegación al `target` con `receiver` preservado cuando el trap `set` no está definido.
  - [ECMA-262 (TC39) — `OrdinarySet`, sección 10.1.9.1](https://tc39.es/ecma262/#sec-ordinaryset) — propagación del `Receiver` a través de la cadena de prototipos e invocación del setter con `Call(setterFunc, Receiver, «V»)`.
  - Inspección directa (empírica, no documental) de `Object.getOwnPropertyDescriptor(Object.prototype, "__proto__")`, consistente con el Anexo B.3.1 de ECMA-262 (*Additional ECMAScript Features for Web Browsers*).
- **Causa raíz identificada:** el objeto real devuelto por `prisma.$extends()` no propaga/respeta el parámetro `Receiver` de `[[Set]]` al resolver la propiedad heredada `"__proto__"` — confirmado de forma directa y aislada con `Reflect.set(objetoReal, "__proto__", valor, receiverExplicito)`, comparado contra un objeto ordinario de control que sí lo respeta.
- **¿El bypass es real?** Sí — confirmado, reproducible, independiente de los hooks del proyecto, del modo estricto, y del entorno de ejecución (Node vs. Jest).
- **¿El diseño previo sigue siendo válido?** Sí, en principio — la estrategia de `Proxy` con traps adicionales (`getPrototypeOf`, `setPrototypeOf`) es correcta y funcionó exactamente como se diseñó para 3 de los 4 vectores nuevos (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `Object.setPrototypeOf`/`Reflect.setPrototypeOf`) y para la lectura de `__proto__`. Solo la vía de **escritura** vía `__proto__ =` queda sin cerrar por el mecanismo tal como se diseñó.
- **¿Será necesario modificar las Decisiones Técnicas?** Sí — específicamente la sección 4 de `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` (tratamiento de `setPrototypeOf`), que deberá incorporar una decisión adicional para la vía `__proto__ =` que no dependa de que el objeto de Prisma respete el `Receiver` de `[[Set]]` (dado que, confirmado en esta investigación, no lo respeta). Esta investigación no propone esa decisión — solo documenta la causa raíz que la próxima etapa deberá resolver.
- **`git diff`** (idéntico al baseline, sin cambios de código en ningún momento de esta investigación):
  ```
  diff --git a/backend/src/prisma/organizacion-prisma.client.ts b/backend/src/prisma/organizacion-prisma.client.ts
  index ce268fe..e440215 100644
  [sin cambios adicionales a los ya existentes del mecanismo original de H-02 — idéntico al
  documentado en PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md e IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md]
  ```
- **`git status --short`** (idéntico al estado previo a esta etapa, salvo la aparición de este mismo archivo):
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
  ?? IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
  ?? INVESTIGACION_H02_PROTO_SETTER.md
  ?? PLAN_PROXIMA_ETAPA.md
  ?? PRE_IMPLEMENTACION_BLOQUE11.md
  ?? PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
  ?? REVISION_IMPLEMENTACION_BLOQUE11.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```

No se diseñó ninguna solución. No se modificó el diseño existente. No se reabrió la implementación. No se modificó ningún archivo del proyecto en ningún momento de esta investigación.

Me detengo y quedo a la espera de autorización.

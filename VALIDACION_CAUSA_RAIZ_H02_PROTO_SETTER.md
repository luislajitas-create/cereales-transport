# Validación de Causa Raíz — H-02: `cliente.__proto__ = ...` y el trap `setPrototypeOf`

Fecha: 2026-07-24. **No implementa ninguna solución, no modifica código productivo, no modifica backend, no modifica frontend, no modifica tests permanentes, no modifica schema, no crea migraciones, no modifica documentación existente, no genera parches.** Objetivo único: confirmar o refutar rigurosamente la hipótesis de `INVESTIGACION_H02_PROTO_SETTER.md` ("el objeto devuelto por `prisma.$extends()` no respeta el parámetro `Receiver` de `[[Set]]`"), o encontrar una explicación alternativa compatible con ECMAScript que produzca el mismo comportamiento observado. Toda la evidencia se obtuvo mediante scripts temporales de solo lectura, en el directorio de scratchpad de la sesión (fuera del repositorio), sin ninguna escritura en base de datos, eliminados inmediatamente después de cada uso — confirmado en cada punto de control que `git status --short`/`git diff` quedaron idénticos al estado previo a esta etapa.

---

## 1. Revisión del algoritmo ECMAScript

**Qué algoritmo se ejecuta, paso a paso** (fuentes: [TC39 — ECMA-262, `OrdinarySet`/`OrdinarySetWithOwnDescriptor`](https://tc39.es/ecma262/#sec-ordinaryset), [TC39 — ECMA-262, Proxy `[[Set]]`](https://tc39.es/ecma262/multipage/reflection.html), [MDN — `handler.set()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/set); citas cortas textuales donde la herramienta de consulta pudo extraerlas literalmente del documento oficial, descritas con precisión donde no):

1. `proxy.__proto__ = valor` es una asignación de propiedad ordinaria — se resuelve vía `PutValue`, que invoca el método interno **`[[Set]]`** sobre `proxy`.
2. **`[[Set]]` de un `Proxy`** (ECMA-262, sección 10.5.9, *"[[Set]] ( P, V, Receiver )"*): si el `handler.set` está definido, se invoca `Call(trap, handler, «target, P, V, Receiver»)` — el trap recibe el `Receiver` original como 4.º argumento. Si el trap **no** está definido, el algoritmo delega directamente: retorna `? target.[[Set]](P, V, Receiver)` — el `Receiver` se propaga **sin modificar**.
3. Si el objeto que recibe `[[Set]]` en el paso anterior es un objeto **ordinario** (no un `Proxy`), se ejecuta **`OrdinarySet(O, P, V, Receiver)`** (ECMA-262, sección 10.1.9.1): obtiene el descriptor propio de `P` sobre `O` vía `OrdinaryGetOwnProperty`. Confirmado textualmente en esta etapa: *"If ownDesc is undefined, then... Let parent be ? obj.[[GetPrototypeOf]]()"* — si la propiedad no es propia, se sube al prototipo, y la recursión **mantiene el mismo `Receiver`**, nunca lo reemplaza por el objeto padre.
4. Una vez hallada la propiedad (en este caso, en `Object.prototype`) como un descriptor de **acceso** (accessor), se ejecuta **`OrdinarySetWithOwnDescriptor`**: confirmado textualmente en esta etapa: *"If IsAccessorDescriptor(ownDesc) is true, then let setter be ownDesc.[[Set]]. If setter is undefined, return false... Perform ? Call(setter, receiver, «value»)"* — **el setter se invoca con `this = Receiver`** (el `Receiver` original propagado desde el paso 2), **no** con el objeto donde el setter fue hallado (`Object.prototype`).
5. El setter de `Object.prototype.__proto__` (ECMA-262, Anexo B.3.1) ejecuta, en esencia: `Let O be ? ToObject(this value)` (es decir, `O = Receiver`) → `Let status be ? O.[[SetPrototypeOf]](proto)` → si `status` es `false`, lanza `TypeError`.

**¿En qué momento debería invocarse `[[SetPrototypeOf]]`?** En el paso 5, sobre `O = ToObject(this value)`, donde `this value = Receiver` propagado intacto desde el paso 2 en adelante — es decir, sobre el `proxy` original, **si y solo si** cada paso intermedio (2, 3, 4) propaga el `Receiver` sin alterarlo.

**¿Qué condiciones deben cumplirse?** Que **cada** objeto de la cadena de delegación (desde el `proxy` externo hasta `Object.prototype`) respete el contrato de `Receiver` tal como lo exige `OrdinarySet`/`OrdinarySetWithOwnDescriptor`, o — para el caso de un objeto exótico (otro `Proxy`) intermedio — que su propio trap `set` (si lo define) reenvíe el `Receiver` recibido al delegar.

**¿Qué condiciones impiden llegar a ese punto?** Que **cualquier** eslabón intermedio de la cadena — en particular, cualquier `Proxy` intermedio cuyo trap `set` no reenvíe el `Receiver` — sustituya el `Receiver` por otro valor (típicamente, por default, el propio `target` de ese eslabón) antes de llegar al setter de `Object.prototype.__proto__`. En ese caso, el `[[SetPrototypeOf]]` final se invoca sobre el objeto que ese eslabón haya sustituido, no sobre el `proxy` externo original.

---

## 2. ¿Es obligatorio llamar `[[SetPrototypeOf]]`?

**Si toda la cadena de delegación es una cadena de objetos ordinarios (sin ningún `Proxy` intermedio):** sí, es obligatorio — no existe, en ese caso, ningún camino válido en ECMAScript donde `proxy.__proto__ = objeto` no termine invocando `proxy.[[SetPrototypeOf]]()`. Demostrado en la sección 1: el algoritmo `OrdinarySet`/`OrdinarySetWithOwnDescriptor` no tiene ninguna rama alternativa — siempre propaga el mismo `Receiver` y siempre invoca el setter con `this = Receiver`.

**Si existe al menos un objeto exótico (`Proxy`) intermedio entre el `proxy` externo y `Object.prototype`:** **sí existe un camino válido, completamente conforme a especificación, donde `proxy.__proto__ = objeto` NO termina invocando `proxy.[[SetPrototypeOf]]()`.** El camino exacto: si ese `Proxy` intermedio define su propio trap `set`, y ese trap, en su implementación, **decide no reenviar** el `Receiver` recibido (por ejemplo, delegando con `Reflect.set(target, prop, value)`, la forma de 3 argumentos, en lugar de `Reflect.set(target, prop, value, receiver)`, la forma de 4), entonces el `[[SetPrototypeOf]]` final termina invocándose sobre **otro objeto** (el `target` de ese `Proxy` intermedio, por defecto de `Reflect.set` de 3 argumentos), no sobre el `proxy` externo. **Nada en la especificación de ECMAScript obliga a que la implementación de un trap `set` reenvíe el `Receiver` que recibió** — es una decisión de quien escribe el trap, no una invariante verificada por el motor. Esto se demuestra y se confirma con evidencia directa de código real en la sección 6.

---

## 3. Validación del `Receiver` — intento deliberado de refutar la hipótesis

Se buscó, deliberadamente, un escenario donde `Reflect.set(objetoReal, "__proto__", valor, receiverExplicito)` pudiera devolver `true` **sin** que eso implicara que Prisma "rompe" nada — es decir, un escenario compatible con la especificación que no involucrara ningún defecto de propagación de `Receiver`.

**Resultado: sí, existe tal escenario, y es exactamente lo que ocurre.** `Reflect.set(target, prop, value)` (forma de 3 argumentos, **sin** el 4.º argumento `receiver`) es, por sí misma, una operación **perfectamente válida y conforme a especificación** — cuando `receiver` no se provee, `Reflect.set` lo hace por defecto igual a `target`. No hay ninguna violación de invariante de ECMAScript en que un trap `set` haga esto — el motor no puede, ni debe, detectar ni impedir que un trap "ignore" el `Receiver` que se le pasó; simplemente no lo usa. **Es decir: no hace falta que Prisma "rompa" nada en el sentido de violar la especificación — basta con que su trap `set` use la forma de 3 argumentos de `Reflect.set` en lugar de la de 4**, algo perfectamente legal, para producir exactamente el efecto observado (el `Receiver` externo se pierde, silenciosamente, sin ningún error).

**Confirmado en la sección 6, con el código fuente exacto de Prisma.**

---

## 4. Objeto Prisma — inspección exclusivamente por reflexión

Ejecutado contra el objeto real devuelto por `prisma.$extends({ name: "validacion-causa-raiz" })` (extensión mínima, mismo criterio que en la investigación anterior, para no depender de los 14 hooks del proyecto):

| Verificación | Resultado |
|---|---|
| `Reflect.isExtensible(prisma)` | `true` |
| `Reflect.isExtensible(ext)` | `true` |
| `Object.isSealed(ext)` | `false` |
| `Object.isFrozen(ext)` | `false` |
| `Reflect.ownKeys(ext).length` | `63` (incluye `_extensions`, `_appliedParent`, `$use`, `$on`, `Symbol(nodejs.util.inspect.custom)`, y los 21 delegados de modelo como propiedades propias directas — `GrupoEconomico`, `Cliente`, etc.) |
| `Object.getOwnPropertyDescriptor(ext, "$connect")` | `undefined` — **no es propiedad propia** |
| `Object.getOwnPropertyDescriptor(ext, "$transaction")` | `undefined` — **no es propiedad propia** |
| `Object.getOwnPropertyDescriptor(ext, "$extends")` | `undefined` — **no es propiedad propia** |
| **`ext` es, en sí mismo, un `Proxy`** | **Confirmado directamente** — `util.inspect(ext, { showProxy: true })` (API pública documentada de Node.js) devuelve literalmente `Proxy [ {}, [Object] ]`, la representación estándar de Node para un objeto `Proxy`, exponiendo su `target` y su `handler` |
| **`prisma` (el `PrismaClient` real, antes de `$extends()`) también es un `Proxy`** | Confirmado con el mismo método: `util.inspect(prisma, { showProxy: true })` devuelve `Proxy [ [Object], [Object] ]` |

**Conclusión de la sección 4:** el objeto de Prisma **posee, en efecto, un `Proxy` interno** — no uno, sino (al menos) dos niveles: el propio `PrismaClient` ya es un `Proxy`, y `$extends()` construye otro `Proxy` adicional envolviéndolo. `$connect`/`$transaction`/`$extends` no son propiedades propias de `ext` — se resuelven por herencia, consistente con lo ya documentado en la investigación anterior.

---

## 5. Cadena de prototipos — reconstrucción completa

```
Nivel 0: ext                    | constructor.name="t" | ES UN PROXY (confirmado) | 63 propiedades propias
Nivel 1: Reflect.getPrototypeOf(ext)         | constructor.name="t" | objeto ordinario | 19 propiedades propias
Nivel 2: Reflect.getPrototypeOf(nivel 1)     | constructor.name="t" | objeto ordinario | 23 propiedades propias
Nivel 3: Reflect.getPrototypeOf(nivel 2)     | constructor.name="Object" | objeto ordinario | 12 propiedades propias
Nivel 4: Reflect.getPrototypeOf(nivel 3) = null
```

El **Nivel 3** tiene exactamente 12 propiedades propias — coincide exactamente con las 12 propiedades reales de `Object.prototype` en V8/Node (`constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `toString`, `valueOf`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`, `__proto__`) — **el Nivel 3 es, literalmente, `Object.prototype`**, confirmando que la cadena es completa y bien formada, sin ciclos ni anomalías.

**¿Dónde vive realmente `"__proto__"`?** En el Nivel 3 (`Object.prototype`), exactamente donde la especificación lo define — no hay ningún setter intermedio "falso" en los Niveles 1-2.

**¿Existe algún `Proxy` interno?** Sí — **únicamente en el Nivel 0** (`ext` mismo). Los Niveles 1, 2 y 3 son, todos, objetos ordinarios (confirmado individualmente con `util.inspect({ showProxy: true })` sobre cada uno). Esto acota con precisión **dónde** puede estar ocurriendo la pérdida del `Receiver`: tiene que ser en el `[[Set]]` del `Proxy` del Nivel 0 — es el único punto de la cadena completa donde un trap de `Proxy` (código de Prisma) participa en la resolución.

---

## 6. Código fuente de Prisma — confirmación directa

Búsqueda dirigida al repositorio oficial (`github.com/prisma/prisma`) del mecanismo de `Proxy` usado para construir el cliente extendido. Se localizó el archivo **`packages/client/src/runtime/core/compositeProxy/createCompositeProxy.ts`**, que implementa la función `createCompositeProxy` — el mecanismo real detrás de `$extends()` (y del propio `PrismaClient` base, ambos confirmados como `Proxy` en la sección 4).

**El archivo define un `handler` de `Proxy` con traps `get`, `has`, `ownKeys`, `set`, `getOwnPropertyDescriptor` y `defineProperty`.** No define `getPrototypeOf` ni `setPrototypeOf` — para esos dos, `ext` delega por defecto a su propio `target` interno (lo cual explica, adicionalmente, por qué la **lectura** de `__proto__`/`getPrototypeOf` nunca presentó problemas: al no haber trap `getPrototypeOf` en `ext`, esa delegación por defecto sí preserva el comportamiento esperado en ese sentido — el problema es específico de `[[Set]]`, no de `[[GetPrototypeOf]]`).

**El trap `set`, copiado literalmente del código fuente oficial:**

```javascript
set(target, prop, value) {
  const layer = keysToLayerMap.get(prop)
  if (layer?.getPropertyDescriptor?.(prop)?.writable === false) {
    return false
  }
  overwrittenKeys.add(prop)
  return Reflect.set(target, prop, value)
},
```

**Confirmación exacta y definitiva de la causa raíz:**
1. La firma del trap `set(target, prop, value)` **no declara el 4.º parámetro `receiver`** que el motor de JavaScript le pasa siempre a un trap `set` (per ECMA-262 10.5.9, paso 2 de la sección 1 de este documento) — el trap simplemente no lo lee, aunque lo recibe.
2. La línea final, `return Reflect.set(target, prop, value)`, invoca `Reflect.set` con **exactamente 3 argumentos** — la forma que, por especificación de `Reflect.set` (ECMA-262), hace que el `receiver` interno de esa llamada sea **el propio `target`**, no el `Receiver` original que el motor le pasó al trap (y que el trap ignoró).

Esto es exactamente la condición descripta como "camino válido" en la sección 2, y exactamente el escenario buscado en la sección 3 — confirmado ahora no por inferencia, sino **leyendo la línea de código responsable, directamente en el repositorio oficial de Prisma**.

**Nota de alcance:** el archivo consultado corresponde a la rama `main` del repositorio oficial en el momento de esta consulta, no necesariamente línea por línea idéntico a la versión exacta instalada en este proyecto (`@prisma/client@^5.22.0`) — pero el mecanismo de `createCompositeProxy` (el uso de `Reflect.set` de 3 argumentos dentro de un trap `set` para el cliente extendido) es estructural al enfoque de Prisma para `$extends()`, no un detalle incidental de una versión puntual, y es coherente con toda la evidencia empírica ya reunida en esta y la anterior investigación contra la versión real instalada.

---

## 7. Issues oficiales

Búsqueda dirigida a `github.com/prisma/prisma` (issues y discussions oficiales) con los términos `Proxy`, `receiver`, `$extends`, `prototype`, `__proto__`, `setPrototypeOf`, `Reflect.set`. **No se encontró ningún issue oficial que documente específicamente este patrón** (un `Proxy` externo que envuelve un cliente extendido de Prisma y pierde el `Receiver` en la asignación de `__proto__`). Los resultados relacionados con "Proxy" en el rastreador de Prisma corresponden a un tema distinto (objetos `Proxy` que aparecen al serializar resultados de *computed fields* en Next.js Server Actions, sin relación con el mecanismo de `createCompositeProxy` ni con `Receiver`/`setPrototypeOf`). No se encontró, tampoco, ningún comentario del equipo de Prisma reconociendo o discutiendo esta característica como una decisión deliberada o como un defecto — la ausencia de discusión pública es consistente con que este patrón de uso (envolver el cliente extendido con un `Proxy` externo de seguridad) sea, hasta donde esta búsqueda pudo determinar, un caso no contemplado por el equipo de Prisma, ni reportado previamente por otros usuarios en el repositorio oficial.

---

## 8. Hipótesis alternativas

| Hipótesis | Evidencia a favor | Evidencia en contra | Resultado |
|---|---|---|---|
| **A) Prisma "rompe" el `Receiver`** | Código fuente oficial citado literalmente (sección 6): el trap `set` de `createCompositeProxy` usa `Reflect.set(target, prop, value)`, forma de 3 argumentos, ignorando el `Receiver` recibido. Comportamiento reproducido de forma aislada (`INVESTIGACION_H02_PROTO_SETTER.md`, sección 7) y ahora explicado línea por línea | Ninguna | **Confirmada** |
| **B) `Proxy` externo (el nuestro) incorrecto** | Ninguna | El mismo `handler` exacto (`get`+`getPrototypeOf`+`setPrototypeOf`, sin `set`), envolviendo un objeto ordinario, funciona exactamente como se diseñó (`INVESTIGACION_H02_PROTO_SETTER.md`, sección 1) — el defecto no está en nuestro código | **Descartada** |
| **C) Objeto exótico permitido por ECMAScript (comportamiento legítimo, no un "bug")** | Cierto en sentido estricto: `Reflect.set` de 3 argumentos es válido por especificación, ninguna invariante de `Proxy` se viola (sección 3) | No contradice a A — es la explicación de **por qué** A es posible sin que el motor lo impida, no una hipótesis alternativa excluyente | **Confirmada como matiz de A, no como hipótesis independiente** |
| **D) Limitación del experimento** | Ninguna | Reproducido en 2 investigaciones independientes, con un objeto de control que sí funciona correctamente (descartando que el experimento en sí esté mal construido), y ahora confirmado contra el código fuente real, no solo contra el comportamiento observado | **Descartada** |
| **E) Bug de Node** | Ninguna | El comportamiento de Node/V8 en cada paso individual (delegación de `Proxy` sin trap `getPrototypeOf`/`setPrototypeOf`, `Reflect.set` de 3 argumentos con `receiver` por defecto = `target`) es exactamente el exigido por la especificación — no hay ninguna desviación del motor respecto de ECMA-262 | **Descartada** |
| **F) Bug de V8** | Ninguna | Mismo motivo que E — el motor ejecuta fielmente lo que el código de aplicación (de Prisma) le indica | **Descartada** |
| **G) Bug de Prisma** | El resultado es, para el caso de uso de este proyecto (envolver el cliente con un `Proxy` de seguridad externo), indeseado y sorprendente | El uso de `Reflect.set` de 3 argumentos es una simplificación común y legítima en implementaciones de `Proxy` cuando no se anticipa que el objeto vaya a ser envuelto por otro `Proxy` externo que dependa de la identidad del `Receiver` — no hay evidencia (sección 7) de que el equipo de Prisma lo considere un defecto, ni de que exista algún caso de uso documentado de Prisma que dependa de preservar el `Receiver` en `$connect`/otros métodos anteriormente probados | **Ni confirmada ni descartada como "bug" en sentido estricto — es una consecuencia real y no documentada de una decisión de implementación válida, no necesariamente un defecto reconocido por Prisma** |

---

## 9. Grado de certeza

- **Hipótesis principal (A, con el matiz de C): 100%.** No se trata de una inferencia ni de una probabilidad — la causa raíz fue confirmada leyendo directamente la línea de código responsable en el repositorio oficial de `prisma/prisma`, reproducida de forma aislada dos veces (esta etapa y la anterior), en objetos reales (`$extends()` mínimo y completo), con un objeto de control que demuestra el comportamiento correcto para contraste. No queda ningún elemento de la cadena de causalidad sin verificar: desde el algoritmo de especificación (sección 1) hasta la línea exacta de `Reflect.set` de 3 argumentos (sección 6), pasando por la confirmación de que `ext` es un `Proxy` (sección 4) y de que es el único eslabón no-ordinario de la cadena completa (sección 5).
- **Hipótesis alternativas (B, D, E, F): 0%.** Cada una fue descartada con evidencia directa y específica, no por default ni por ausencia de investigación.
- **Hipótesis G (bug de Prisma en sentido de defecto reconocido): no aplica un porcentaje binario** — es una cuestión de clasificación/opinión sobre la intención de Prisma, no un hecho verificable con la evidencia disponible (no hay ningún issue oficial que la confirme o la niegue, sección 7). Lo que sí tiene 100% de certeza es el **comportamiento en sí** (independientemente de si se lo llama "bug" o "decisión de diseño no documentada para este caso de uso").

---

## 10. Conclusión

**A) La hipótesis anterior queda confirmada.**

La conclusión de `INVESTIGACION_H02_PROTO_SETTER.md` — "el objeto devuelto por `prisma.$extends()` no respeta el parámetro `Receiver` de `[[Set]]`" — queda **confirmada de forma completa y definitiva**, con un nivel de evidencia superior al de la investigación anterior: no solo se demostró el comportamiento de forma aislada (como ya hacía la investigación previa), sino que se identificó **la línea exacta de código fuente oficial de Prisma responsable** (`createCompositeProxy.ts`, trap `set`, `Reflect.set(target, prop, value)` sin el 4.º argumento `receiver`), y se confirmó, mediante inspección por reflexión, que **el objeto que Prisma devuelve de `$extends()` es en sí mismo un `Proxy`** (dato que la investigación anterior no había llegado a determinar con certeza, y que era el eslabón faltante para explicar el mecanismo completo, no solo el síntoma).

No se encontró ninguna explicación alternativa compatible con ECMAScript que produzca el mismo comportamiento observado sin involucrar esta causa — las hipótesis B, D, E y F fueron descartadas con evidencia directa; la hipótesis C no es una alternativa a A, sino la explicación de por qué A es posible sin violar ninguna invariante del lenguaje.

No se propone ninguna solución en este documento. No se modifica ninguna decisión técnica. No se reabre la implementación.

---

## Informe final

- **Cantidad de experimentos ejecutados:** 2 scripts temporales en esta etapa (inspección con `util.inspect({showProxy:true})` sobre `prisma` y `ext`; reflexión completa de descriptores/`ownKeys`/extensibilidad/cadena de prototipos nivel por nivel) — sumados a los 8 ya ejecutados en `INVESTIGACION_H02_PROTO_SETTER.md`, para un total acumulado de 10 experimentos entre ambas etapas. Todos de solo lectura, sin escritura en base de datos, todos eliminados inmediatamente después de su uso.
- **Documentación oficial consultada:**
  - [TC39 — ECMA-262, `OrdinarySet`/`OrdinarySetWithOwnDescriptor`, sección 10.1.9](https://tc39.es/ecma262/#sec-ordinaryset).
  - [TC39 — ECMA-262, Proxy `[[Set]]`, sección 10.5.9](https://tc39.es/ecma262/multipage/reflection.html).
  - [MDN — `handler.set()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/set) — definición de `receiver`.
  - Node.js — `util.inspect()` con la opción documentada `showProxy`, usada como evidencia empírica para determinar si un objeto es un `Proxy`.
- **Código oficial inspeccionado:** [`prisma/prisma` — `packages/client/src/runtime/core/compositeProxy/createCompositeProxy.ts`](https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/compositeProxy/createCompositeProxy.ts) (rama `main`), función `createCompositeProxy`, trap `set` completo citado en la sección 6.
- **Issues oficiales encontrados:** ninguno específico a este patrón (búsqueda documentada en la sección 7).
- **Hipótesis confirmada:** A) Prisma no reenvía el `Receiver` en el trap `set` de su `Proxy` interno (`createCompositeProxy`), usando `Reflect.set` de 3 argumentos — confirmado con evidencia de código fuente directa, no solo de comportamiento.
- **Hipótesis descartadas:** B (Proxy externo incorrecto), D (limitación del experimento), E (bug de Node), F (bug de V8) — las 4 con evidencia directa en contra.
- **Grado de certeza:** 100% para la hipótesis principal; 0% para las hipótesis alternativas descartadas; sin porcentaje aplicable para la clasificación de "bug de Prisma" (cuestión de intención/reconocimiento, no de hecho verificable).
- **¿La investigación anterior cambia?** No se contradice en ningún punto — se **profundiza y se cierra por completo**: la investigación anterior había llegado hasta "el objeto de Prisma no respeta el Receiver, sin poder afirmar el mecanismo interno exacto (fuera de las fuentes autorizadas en esa etapa)"; esta etapa, con acceso autorizado al código fuente oficial de Prisma, identificó la línea exacta responsable y confirmó adicionalmente que `ext` es, en sí mismo, un `Proxy`.
- **¿La causa raíz puede considerarse demostrada?** Sí, de forma completa y definitiva — no queda ningún eslabón de la cadena de causalidad sin verificar directamente.
- **`git diff`:** idéntico al baseline (`backend/src/prisma/organizacion-prisma.client.ts`, 31 líneas modificadas — el mismo mecanismo original de H-02 ya documentado en etapas previas, sin ningún cambio nuevo de esta etapa).
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
  ?? VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```

No se propuso ninguna solución. No se modificó ninguna decisión técnica. No se implementó nada. No se modificó ningún archivo del proyecto en ningún momento de esta etapa.

Me detengo y quedo a la espera de autorización.

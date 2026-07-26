# Validación de Arquitectura — `cliente.constructor === Object` (H-02)

Fecha: 2026-07-25. Etapa exclusivamente de validación arquitectónica de la Estrategia C recomendada en `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`. **No implementa nada, no modifica código, no modifica tests, no modifica documentación existente.** No se rediseñan alternativas nuevas ni se reabren las estrategias A/B/D/E/F más allá de lo estrictamente necesario para contestar la pregunta 6, ya comparadas en el documento anterior. No se ejecuta ningún experimento nuevo — se razona sobre semántica estándar de ECMAScript, ya verificada empíricamente en etapas previas de esta cadena (`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`) para las partes que dependen de comportamiento real de Prisma/Node, y sobre la especificación ECMA-262 para las partes puramente de lenguaje.

---

## Alcance

Exclusivamente la sustitución del valor devuelto por el trap `get` para la clave `"constructor"`. No se evalúa ningún otro trap, ningún otro vector, ninguna otra propiedad.

---

## 1. ¿`cliente.constructor === Object` cierra completamente el bypass identificado?

**Sí, de forma completa respecto del bypass confirmado en esta cadena de documentos.**

El bypass consiste en una cadena de 8 pasos (sección 1 de `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`): lectura de `"constructor"` → función ligada sin `.prototype` propio → resolución por herencia vía `[[Prototype]]` → `PrismaClient` → `PrismaClient.prototype` → métodos raw reales. Sustituir el valor devuelto en el primer paso (la lectura de `"constructor"` sobre `cliente`) por una referencia fija (`Object`) **interrumpe la cadena en su origen**: ningún paso posterior de la cadena original puede ejecutarse, porque ya no hay ninguna función ligada a `PrismaService`/`PrismaClient` de la cual partir. `Object` no tiene ninguna relación de herencia, directa ni indirecta, con `PrismaClient` — es una función completamente ajena al árbol de clases de Prisma. No existe ningún camino, desde `Object` o `Object.prototype`, que reconstruya `PrismaClient`, `PrismaService` ni ninguno de sus métodos.

Cierra, además, no solo el vector original (`cliente.constructor.prototype`) sino toda su familia de variantes (`Reflect.get(cliente, "constructor")`, que pasa por el mismo trap; y los derivados que operan sobre el valor ya sustituido: `Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `.__proto__`), dado que todos parten del mismo primer paso interceptado.

---

## 2. ¿`Object.prototype` vuelve a exponer algún camino hacia `PrismaService`/`PrismaClient`/métodos raw?

**No.**

`Object.prototype` es el prototipo raíz universal de JavaScript — el punto terminal de toda cadena de prototipos del lenguaje (`Object.getPrototypeOf(Object.prototype) === null`, sin excepción posible). Sus únicas propiedades son las estándar del lenguaje (`hasOwnProperty`, `toString`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `__defineGetter__`/`__defineSetter__`/`__lookupGetter__`/`__lookupSetter__` en entornos que las exponen, y el par de acceso `__proto__`) — ninguna relacionada con Prisma, ninguna que permita alcanzar `PrismaClient` ni `PrismaService`. `Object.prototype` no es un objeto que este proyecto construye ni modifica; es compartido por absolutamente todos los objetos del proceso, y ya fue auditado exhaustivamente como superficie segura en la etapa original de H-02 (mismo prototipo ya devuelto hoy por `getPrototypeOf(cliente)`, sin hallazgos).

**Caso límite a documentar (no es un bypass, es una limitación genérica ya aceptada):** si en algún momento código de terceros o del propio proceso Node **extendiera** `Object.prototype` agregándole una propiedad nueva (una práctica extremadamente inusual y ya considerada antipatrón en JavaScript, conocida como "monkey-patching de prototipos nativos"), esa propiedad se volvería visible a través de `cliente.constructor.prototype.esaPropiedad` — pero esto sería visible, de forma idéntica, en **cualquier objeto del proceso completo**, no específico de `cliente` ni de Prisma; no es un riesgo introducido por esta estrategia, es una propiedad general del entorno de ejecución, fuera del control de este mecanismo.

---

## 3. ¿`Object` conserva un comportamiento suficientemente compatible con un objeto ordinario?

**Sí.**

- `typeof cliente.constructor === "function"` → `true`, igual que en cualquier objeto ordinario.
- `cliente.constructor.name === "Object"` → comportamiento estándar y esperable para un objeto plano.
- `cliente.constructor()` → ejecutable, devuelve un objeto vacío, sin efectos secundarios ni excepciones.
- `new cliente.constructor()` → ejecutable, devuelve un objeto vacío, sin excepciones.
- `cliente instanceof cliente.constructor` → evalúa `Object.getPrototypeOf` a lo largo de la cadena de `cliente` buscando `Object.prototype`; dado que el trap `getPrototypeOf` de este mismo mecanismo ya devuelve `Object.prototype` (decisión previa, ya vigente), da `true` — **perfectamente coherente**, sin ninguna contradicción entre `instanceof` y `.constructor`, exactamente el mismo comportamiento que tendría un objeto literal `{}` real.
- Cualquier código de terceros que haga *duck-typing* genérico (`typeof x.constructor === "function"`, `x.constructor === Object`, `x instanceof x.constructor`) sigue funcionando sin sorpresas — es indistinguible de un objeto plano legítimo.

No se identifica ninguna incompatibilidad con el "contrato implícito" de lo que un consumidor esperaría de `.constructor` en un objeto JavaScript ordinario.

---

## 4. Comportamiento específico de cada expresión derivada

| Expresión | Resultado | Riesgo |
|---|---|---|
| `cliente.constructor.prototype` | `Object.prototype` | Ninguno — ver pregunta 2 |
| `Object.getPrototypeOf(cliente.constructor)` | `Function.prototype` | Ninguno — cadena estándar de JavaScript, sin relación con Prisma |
| `Reflect.getPrototypeOf(cliente.constructor)` | `Function.prototype` (mismo mecanismo interno que `Object.getPrototypeOf`) | Ninguno |
| `cliente.constructor.constructor` | `Function` (el constructor global) | Fuera de alcance de H-02, según ya fue clasificado y justificado en la sección 10 de `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md` — inherente a cualquier función de cualquier objeto en cualquier programa JavaScript, no introducido ni agravado por esta decisión |
| `cliente instanceof Object` (usando `Object` directamente, no `cliente.constructor`) | `true`, vía el trap `getPrototypeOf` ya vigente — sin relación con esta estrategia, mencionado por completitud | Ninguno |
| `util.inspect(cliente)` | Formatea el objeto sin prefijo de clase reconocible más allá de `Object` (mismo efecto cosmético ya aceptado para `getPrototypeOf` desde V1/V2) — no expone `$queryRaw` ni ningún método real de Prisma en la salida, dado que la enumeración de `util.inspect` recorre las claves propias vistas a través del trap `get`/`ownKeys` ya existentes, sin relación con `.constructor` | Ninguno — riesgo puramente cosmético, ya aceptado |
| `console.log(cliente)` | Mismo comportamiento que `util.inspect`, dado que Node delega en él internamente | Ninguno |

---

## 5. ¿Incompatibilidades conocidas con Prisma / NestJS / JavaScript / ECMAScript?

- **Prisma:** ninguna — Prisma nunca ve el objeto `cliente` ya envuelto por el `Proxy` externo del proyecto; la sustitución ocurre enteramente del lado de este mecanismo, sin interacción con el código interno de Prisma en ningún punto (a diferencia del `__proto__=` original, donde el problema surgía precisamente de que Prisma sí participaba internamente).
- **NestJS:** ninguna — la inyección de dependencias vía `useFactory` no inspecciona `.constructor` del valor resuelto (ya confirmado en `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, sección 15, sin hallazgos nuevos que lo contradigan).
- **JavaScript en general:** ninguna incompatibilidad de sintaxis, invariante o especificación — devolver un valor distinto para una clave leída vía un trap `get` de `Proxy` es exactamente el propósito para el que ese trap existe en el lenguaje; no hay ninguna invariante de `Proxy` (de las 8 definidas por ECMA-262 para el trap `get`) que se vea comprometida por devolver `Object` en lugar del valor real, dado que `"constructor"` no es una propiedad no configurable ni no-escribible en `target` (no aplica la invariante de "el trap `get` debe devolver el mismo valor que una propiedad no configurable y no escribible del target", porque esa propiedad no tiene esa condición en ningún objeto involucrado).
- **ECMAScript:** ninguna — `Object` es un valor de primera clase, válido como retorno de cualquier función, incluido un trap de `Proxy`.

**No se identifica ninguna incompatibilidad conocida.**

---

## 6. ¿Alguna alternativa objetivamente superior a `Object`?

Comparación exclusivamente contra `undefined`, `null`, excepción, y función fachada (sin reabrir D/E/F, ya evaluadas y descartadas en el documento anterior):

| Alternativa | Cierra el bypass | Compatibilidad con objeto ordinario | Riesgo de romper `typeof x.constructor === "function"` | Riesgo de excepción no capturada en lectura no destructiva | Identidad estable entre lecturas | Costo de implementación |
|---|---|---|---|---|---|---|
| `undefined` | Sí | Baja — ningún objeto JS ordinario tiene `.constructor === undefined` | Sí, rompe ese patrón | No | Sí (siempre el mismo valor primitivo) | Mínimo |
| `null` | Sí | Baja — mismo problema, aún más inusual | Sí | No | Sí | Mínimo |
| Excepción | Sí | Nula — ningún objeto ordinario lanza al leer `.constructor` | Sí, de forma más severa (rompe la ejecución, no solo el valor) | **Sí** — la única de las 4 con este riesgo | No aplica | Mínimo |
| Función fachada | Sí | Alta — si se construye con cuidado | No, se preserva | No | Sí, si se cachea correctamente | Medio — requiere definir, documentar y mantener un objeto nuevo (Estrategia B, ya evaluada) |
| **`Object`** | **Sí** | **Máxima — indistinguible de un objeto plano legítimo** | **No, se preserva perfectamente** | **No** | **Sí, perfecta (valor global único)** | **Mínimo — sin objetos nuevos que mantener** |

`Object` domina a `undefined`/`null` en compatibilidad con el patrón de *duck-typing* genérico, sin ninguna desventaja compensatoria (mismo costo mínimo, misma cobertura completa del bypass). Domina a la excepción en el criterio más crítico de los cinco (no interrumpe ejecución ante una simple lectura no destructiva, consistente con el resto del mecanismo que solo lanza ante mutaciones o acceso directo a los 4 métodos raw). Iguala a la función fachada en compatibilidad y cobertura, pero la supera en costo de mantenimiento (no requiere definir, documentar ni testear un objeto nuevo del propio proyecto) y en coherencia arquitectónica (es la contraparte natural y ya prevista de la decisión, ya vigente desde V1/V2, de que `getPrototypeOf(cliente)` devuelva `Object.prototype`).

**No se identifica ninguna alternativa, entre las 4 comparadas, objetivamente superior a `Object`.**

---

## Resultado

**A) `Object` es una solución correcta y suficiente.**

---

## Informe final

- **Pregunta 1 (cierre del bypass):** completo — interrumpe la cadena en su origen, sin dejar ningún camino derivado abierto dentro del alcance de H-02.
- **Pregunta 2 (`Object.prototype` como nueva superficie):** sin riesgo — prototipo raíz estándar de JavaScript, sin relación con Prisma; único caso límite documentado es genérico del entorno (monkey-patching de `Object.prototype`), no específico de esta decisión.
- **Pregunta 3 (compatibilidad con objeto ordinario):** máxima — indistinguible de un objeto plano legítimo en todos los patrones de uso habituales (`typeof`, invocación, `new`, `instanceof`).
- **Pregunta 4 (expresiones derivadas):** todas resuelven a valores estándar de JavaScript, sin ningún camino hacia Prisma; `cliente.constructor.constructor` (`Function`) permanece fuera de alcance de H-02 por los motivos ya documentados.
- **Pregunta 5 (incompatibilidades):** ninguna identificada con Prisma, NestJS, JavaScript ni ECMAScript.
- **Pregunta 6 (alternativa superior):** ninguna entre las 4 comparadas (`undefined`, `null`, excepción, función fachada) — `Object` domina o iguala a cada una en todos los criterios evaluados.
- **Resultado:** **A) Object es una solución correcta y suficiente.**
- **Próxima etapa (según instrucción, no ejecutada en este documento):** `DISEÑO_CORRECCION_H02_BLOQUE11_V3`, limitado exclusivamente a incorporar la protección de `constructor`.
- **Documento generado:** `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md` (este documento). Ningún otro documento fue generado ni modificado.
- **`git diff`:** sin cambios respecto del baseline ya confirmado (`backend/src/prisma/organizacion-prisma.client.ts`, 30 inserciones / 1 eliminación, sin ninguna modificación nueva de esta etapa).
- **`git status --short`:** el único archivo nuevo agregado por esta etapa es `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md`, sumado al conjunto ya existente de documentos no rastreados de esta cadena. No se realizó ningún `git add`, `git commit` ni `git push`. No se modificó ningún documento anterior. No se modificó código productivo, tests ni configuración.

Se detiene esta etapa. Se espera autorización explícita antes de iniciar `DISEÑO_CORRECCION_H02_BLOQUE11_V3`.

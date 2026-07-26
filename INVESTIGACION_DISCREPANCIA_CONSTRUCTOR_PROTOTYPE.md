# Investigación — Discrepancia `cliente.constructor.prototype` (Jest vs. Node compilado)

Fecha: 2026-07-25. Investigación acotada exclusivamente a determinar la naturaleza de la discrepancia que bloqueó `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`. **No reabre H-02, no rediseña la solución, no modifica el Proxy ni sus traps, no modifica documentación existente, no implementa ninguna corrección, no modifica ningún archivo del proyecto.** Toda la evidencia se obtuvo mediante scripts temporales (un script Node en scratchpad, un archivo de test temporal dentro de `backend/src/prisma/` — necesario para ejecutar en el entorno real de Jest/`ts-jest`, no en scratchpad, que Jest no rastrea), todos eliminados inmediatamente después de su uso — confirmado con `git status --short`/`git diff` idénticos al estado previo a esta etapa.

---

## 1. Reproducción

Se reconstruyó, en cada script temporal, el mecanismo exacto de 4 traps de V2 (idéntico al que estaba implementado en el momento del bloqueo, sin ninguna variación) — sin depender del código productivo, que ya había sido revertido por completo.

| Entorno | Objeto envuelto | `ctor.name` | `ctor.prototype` | `typeof ctor.prototype?.$queryRaw` |
|---|---|---|---|---|
| Node (script plano, `dist/`) | `new PrismaClient()` (crudo) | `"bound t"` | `undefined` | `"n/a"` |
| Node (script plano) | `new PrismaService()` (clase real del proyecto) | `"bound PrismaService"` | `Object [PrismaClient] {}` | **`"function"`** |
| Jest (`ts-jest`, archivo temporal) | `new PrismaService()` | `"bound PrismaService"` | `Object [PrismaClient] {}` | **`"function"`** |
| Jest (`ts-jest`, archivo temporal) | `new PrismaClient()` (crudo) | `"bound t"` | `undefined` | `"n/a"` |
| Node / Jest (ambos) | Mock ordinario (`class ClienteExtendidoFalso`) | `"bound ClienteExtendidoFalso"` | `undefined` | `"n/a"` |

**Cadena de prototipos, previa al `.bind()` (valor crudo `target["constructor"]`):**

| Caso | `crudo.name` | `crudo.prototype` | `hasOwnProperty("prototype")` |
|---|---|---|---|
| `PrismaClient` crudo (Node y Jest, idéntico) | `"t"` | `t [PrismaClient] {}` (objeto real) | `true` |
| `PrismaService` (Node y Jest, idéntico) | `"PrismaService"` | `t [PrismaClient] {}` (objeto real) | `true` |

---

## 2. Localizar la diferencia

**La diferencia NO aparece "durante Jest", "durante transpile", "durante Babel" ni "durante ts-jest".** Se demostró de forma directa: el mismo par exacto de resultados (`PrismaClient` crudo → `undefined`; `PrismaService` → `{}` con `$queryRaw` invocable) se reprodujo **de forma idéntica tanto en Node plano (`dist/`, sin Jest de por medio) como en Jest (`ts-jest`)** — cuando se usa la misma clase en ambos casos. La variable que determina el resultado es, exclusivamente, **qué clase se instancia como `prisma`** antes de llamar a `$extends()`: `PrismaClient` (la clase cruda de `@prisma/client`) da `undefined`; `PrismaService` (`class PrismaService extends PrismaClient`, la clase real que usa el proyecto) da un `.prototype` real con `$queryRaw` invocable — en **ambos** entornos de ejecución, sin excepción.

**¿Antes o después del `.bind()`?** Después. Antes del `.bind()`, el valor crudo (`target["constructor"]`) **siempre** tiene `.prototype` como propiedad propia (`hasOwnProperty("prototype") === true`), en los 2 casos (`PrismaClient` crudo y `PrismaService`) — esto es esperado y correcto, cualquier función/clase ordinaria tiene su propio `.prototype`. Después del `.bind()`, la propiedad **propia** `.prototype` desaparece correctamente en ambos casos (garantía de especificación para funciones ligadas, ya confirmada en etapas previas) — **pero el valor que se obtiene al leer `ctor.prototype` (una lectura que, al no ser propia, camina la cadena de prototipos del objeto función `ctor`) difiere según el caso**, porque el `.bind()` preserva, en su propio `[[Prototype]]` interno (no en `.prototype`, son conceptos distintos), la cadena de herencia estática de la clase original:

- `PrismaClient` (la clase cruda de `@prisma/client`), según lo observado, no tiene una superclase JS explícita relevante para este efecto — su `[[Prototype]]` de clase termina siendo `Function.prototype`, que no tiene `.prototype` propio → `ctor.prototype` da `undefined`.
- `PrismaService extends PrismaClient` — por convención de `class ... extends ...` en JavaScript, `PrismaService.__proto__ === PrismaClient` (la clase padre, no una instancia) — y `Function.prototype.bind()` establece el `[[Prototype]]` de la función ligada resultante igual al `[[Prototype]]` de la función original (`PrismaService`) **en el momento del bind**, es decir, `Object.getPrototypeOf(ctor) === PrismaClient` (la clase real de Prisma). Como `PrismaClient` **sí** tiene su propio `.prototype` (es una clase real, no ligada), la lectura de `ctor.prototype` — al no encontrar la propiedad como propia sobre `ctor`, camina hacia `Object.getPrototypeOf(ctor)` = `PrismaClient` — y **la encuentra ahí**, heredada.

Esto no tiene relación con Jest, con la compilación de TypeScript, ni con ningún paso de transformación — es un efecto puro de cómo `Function.prototype.bind()` interactúa con la cadena de herencia estática de clases ES6, documentado por la propia especificación ECMAScript (el `[[Prototype]]` de una función ligada se toma del `[[Prototype]]` de la función objetivo en el momento del bind, distinto de si esa función objetivo tiene o no una propiedad `.prototype` propia).

---

## 3. Inspección del constructor

Ya cubierta en el detalle de la sección 1 y 2. Resumen adicional:

- `Object.getOwnPropertyDescriptors(ctor)`: en ambos casos (`PrismaClient` crudo y `PrismaService`), solo `length` y `name` — **`prototype` nunca es una descriptor propio de `ctor`**, confirmando que la garantía de especificación ("las funciones ligadas no tienen `.prototype` propio") se cumple siempre, sin excepción, en ambos entornos.
- `Reflect.ownKeys(ctor)`: idéntico a lo anterior, `["length", "name"]`.
- `Object.getPrototypeOf(ctor)`: **es exactamente donde aparece la diferencia** — `Function.prototype` para `PrismaClient` crudo; `PrismaClient` (la clase real) para `PrismaService`. Esta diferencia de `[[Prototype]]` es lo que determina si la lectura no-propia de `.prototype` encuentra algo o no.

---

## 4. ¿Existe bypass?

**Sí, existe bypass — confirmado con evidencia directa, no por inferencia.**

`cliente.constructor.prototype.$queryRaw` es, en el caso real de producción (`prisma` construido como `PrismaService`, exactamente como lo hace `crearClienteOrganizacional(prisma: PrismaService)` en el código real), una **referencia de función real, `typeof === "function"`**, obtenida sin pasar por ningún trap del `Proxy` de protección — ni `get` (que sí bloquea el acceso directo a `$queryRaw` sobre `cliente`, pero esto es un camino distinto, vía `constructor.prototype`, no vía `cliente.$queryRaw` directo), ni `getPrototypeOf`, ni `setPrototypeOf`, ni el `set` nuevo de V2 (ninguno de los 4 traps intercepta esta cadena de lectura: `cliente.constructor` pasa por `get`, que no bloquea `"constructor"` — decisión ya vigente, ver sección 6 —, y el `.bind(target)` que se aplica no impide que `Object.getPrototypeOf(ctor)` alcance la clase real `PrismaClient`).

**No se confirma, en esta etapa, si esa referencia es efectivamente *invocable* con éxito para ejecutar SQL real** (no se invocó — esta investigación se limitó a `typeof`, sin llamar a la función, conforme al alcance acotado de esta etapa: "únicamente `cliente.constructor.prototype`", sin reabrir pruebas más amplias de explotabilidad). Sin embargo, el propio modelo de amenaza ya usado en toda esta cadena de documentos (`AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`) clasifica la **obtención de una referencia real y no bloqueada** a uno de los 4 métodos raw como el hecho constitutivo del bypass — la explotación real (invocarlo) es una consecuencia directa una vez obtenida la referencia, no un paso adicional que agregue incertidumbre.

---

## 5. Matriz

| Entorno | Resultado (`ctor.prototype`) | ¿Existe bypass? |
|---|---|---|
| Node, `PrismaClient` crudo | `undefined` | No |
| Node, `PrismaService` (clase real) | `Object [PrismaClient] {}`, con `$queryRaw` invocable | **Sí** |
| Jest, `PrismaClient` crudo | `undefined` | No |
| Jest, `PrismaService` (clase real) | `Object [PrismaClient] {}`, con `$queryRaw` invocable | **Sí** |
| Mock ordinario (Node y Jest, idéntico) | `undefined` | No |

**El bypass aparece exactamente cuando el objeto envuelto desciende de `PrismaService` (la clase real del proyecto) — en ambos entornos de ejecución por igual, sin ninguna excepción.**

---

## 6. Clasificación

**D) Otro — problema real de seguridad, pero cuya manifestación en el bloqueo original de V2 fue diagnosticada incorrectamente como una discrepancia de entorno.**

Justificación: no es (A) una diferencia del runner — se demostró exhaustivamente que Jest y Node compilado producen **el mismo resultado exacto** cuando se usa la misma clase (`PrismaService`); la vez anterior en que se creyó ver una discrepancia Jest/Node fue porque el diagnóstico de Node (ejecutado durante el bloqueo de la Implementación V2) usó, por error de quien ejecutó la prueba, `PrismaClient` crudo en lugar de `PrismaService` — no una diferencia real de los entornos. No es (B) una expectativa incorrecta del test únicamente — el test en sí (`expect(ctor.prototype).toBeUndefined()`) tenía la expectativa correcta según el diseño aprobado en V1/V2, pero esa expectativa resultó ser **incorrecta respecto de lo que el mecanismo realmente garantiza** para la clase real usada en producción — es, en efecto, más una falla del **diseño** (una premisa no verificada contra la clase real) que del test en sí, aunque el test fue el que correctamente lo detectó. Es (C), parcialmente, en el sentido de que el comportamiento de `PrismaClient`/`$extends()` en sí es legítimo y documentado (no hay ningún defecto de Prisma involucrado esta vez, a diferencia del hallazgo de `__proto__`) — la causa es enteramente de nuestro propio código (`PrismaService extends PrismaClient`) interactuando con una garantía de ECMAScript que se asumió más fuerte de lo que realmente es. Se clasifica como **(D) — problema real de seguridad**, porque el resultado final, sin ambigüedad, es que existe una referencia real y no bloqueada a `$queryRaw` alcanzable desde `cliente.constructor.prototype.$queryRaw` contra el objeto que el código productivo realmente construye.

---

## 7. Impacto sobre H-02

**B) Sí. Existe un bypass real que obliga a modificar el diseño.**

La implementación V2 debe permanecer bloqueada. No se debe reanudar sin modificar el diseño — el mecanismo ya aprobado (`.bind(target)` como única defensa para `constructor.prototype`, decisión ya cerrada en `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` sección 5 y ratificada sin cambios en `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` sección 10) resultó insuficiente contra la clase real del proyecto (`PrismaService`, que extiende `PrismaClient`) — la garantía en la que se basaba esa decisión ("las funciones ligadas nunca tienen `.prototype` propio") es cierta pero **no alcanza a cubrir la lectura heredada de `.prototype` a través de la cadena de herencia estática de la clase original**, algo que no se había puesto a prueba contra la clase real hasta esta investigación (las verificaciones previas de este vector, en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` e `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`/V1, se habían ejecutado contra un script que — según se determinó en esta misma investigación — probablemente también usó `PrismaClient` crudo en lugar de `PrismaService`, sin que eso se detectara en su momento).

No se propone ninguna solución en este documento, conforme al alcance de esta etapa.

---

## Conclusión

**B) La discrepancia corresponde a un bypass real.**

No es una diferencia del entorno de validación — se demostró exhaustivamente que Jest y Node compilado producen resultados idénticos ante la misma entrada. La discrepancia observada durante el bloqueo de la Implementación V2 fue, en realidad, un artefacto de que el diagnóstico de Node de aquel momento usó una clase distinta (`PrismaClient` crudo) a la que realmente usa el código productivo (`PrismaService`) — al corregir esa discrepancia metodológica y usar la clase real en ambos entornos, Jest y Node coinciden exactamente, y ambos revelan el mismo hallazgo: `cliente.constructor.prototype.$queryRaw` es una referencia de función real y no bloqueada, alcanzable sin pasar por ningún trap del mecanismo de protección, contra el objeto que el código productivo realmente construye en producción.

---

## Informe final

- **Experimentos ejecutados:** 5 (Node con `PrismaClient` crudo; Node con `PrismaService`; Jest con `PrismaService`; Jest con `PrismaClient` crudo; mock ordinario en ambos entornos, ejecutado como parte de los mismos scripts) — todos mediante scripts/archivos temporales, eliminados inmediatamente después de su uso.
- **Node:** `PrismaClient` crudo → `ctor.prototype: undefined` (sin bypass); `PrismaService` → `ctor.prototype` real, con `$queryRaw` invocable (**bypass confirmado**).
- **Jest:** idéntico a Node en ambos casos — `PrismaClient` crudo → `undefined`; `PrismaService` → bypass confirmado, mismo resultado exacto que Node.
- **Prisma real:** el bypass se confirma exclusivamente cuando se envuelve un objeto derivado de `PrismaService` (la clase real usada por `crearClienteOrganizacional`), no con `PrismaClient` crudo.
- **Mocks:** sin bypass en ningún entorno, consistente con que un mock ordinario (clase simple, sin heredar de nada con `.prototype` propio relevante más allá de `Object.prototype`) no reproduce la condición estructural necesaria.
- **Existencia de bypass:** **Sí**, confirmado con evidencia directa (`typeof ctor.prototype.$queryRaw === "function"`), no por inferencia.
- **Clasificación:** D) problema real de seguridad — la discrepancia Jest/Node observada en el bloqueo de V2 fue un artefacto metodológico (clase incorrecta usada en el diagnóstico de Node de aquel momento), no una diferencia real de entornos.
- **Impacto sobre H-02:** B) la Implementación V2 debe permanecer bloqueada — existe un bypass real que obliga a modificar el diseño (la defensa de `constructor.prototype` basada únicamente en `.bind(target)` es insuficiente contra la clase real del proyecto).
- **Documento generado:** `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md` (este documento). Ningún otro documento fue generado ni modificado.
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
  ?? VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```

No se modificó absolutamente nada. No se reabrió H-02 más allá de esta investigación acotada. No se propuso ninguna solución.

Me detengo. Espero autorización.

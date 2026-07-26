# Implementación — Corrección de H-02: Bypass del Proxy mediante la cadena de prototipos

Fecha: 2026-07-24. Ejecutada conforme a `DISEÑO_CORRECCION_H02_BLOQUE11.md`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` y `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`. **Implementación detenida durante la validación adversarial (Nivel 5) por aparición de un bypass no contemplado en el diseño aprobado.** Todos los cambios de esta corrección fueron revertidos antes de finalizar. No se hizo `git add`, `commit` ni `push` en ningún momento.

---

## 1. Objetivo

Implementar la corrección del bypass del Proxy organizacional mediante acceso o modificación de la cadena de prototipos, cerrando `Object.getPrototypeOf()`, `Reflect.getPrototypeOf()`, `__proto__` (lectura y escritura), y `Object.setPrototypeOf()`/`Reflect.setPrototypeOf()`, sin afectar `$transaction` ni el `TransactionClient`.

---

## 2. Baseline inicial

Confirmado al inicio de la etapa, idéntico al documentado en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`: `git diff -- backend/src/prisma/organizacion-prisma.client.ts` mostraba únicamente el mecanismo original de H-02 (definición de `METODOS_RAW_BLOQUEADOS`, la función `bloquearMetodosRawDeNivelSuperior()` con su único trap `get`, y el cambio de `return prisma.$extends(...)` a `const clienteExtendido = ...; return bloquearMetodosRawDeNivelSuperior(clienteExtendido);`) — cero líneas de la corrección nueva. `git status --short` idéntico al ya documentado en las etapas previas.

---

## 3. Archivos modificados durante la implementación (todos revertidos)

- `backend/src/prisma/organizacion-prisma.client.ts` — modificado y luego **revertido exactamente al baseline** (confirmado por `git diff` idéntico al de la sección 2, ver sección 16).
- `backend/src/prisma/organizacion-prisma.client.spec.ts` — creado y luego **eliminado** antes de finalizar.

**Ningún otro archivo fue tocado.**

---

## 4. Cambios implementados (posteriormente revertidos)

Se agregaron, dentro de `bloquearMetodosRawDeNivelSuperior()`, en el orden exacto exigido por el checklist de `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`:

1. Tratamiento explícito de la clave `"__proto__"` dentro del trap `get` ya existente, devolviendo `Object.prototype`.
2. Comentario técnico junto al `.bind(target)` existente, documentando su relación con el cierre de `constructor.prototype`.
3. Trap `getPrototypeOf`, devolviendo `Object.prototype`.
4. Trap `setPrototypeOf`, lanzando una excepción `[aislamiento] "setPrototypeOf" no está disponible...`.

---

## 5. Explicación de `getPrototypeOf` (tal como se implementó)

Devolvía `Object.prototype` de forma incondicional, sin consultar ni delegar al prototipo real del `target`. **Este trap funcionó exactamente como se diseñó** — confirmado en la sección 13 (Nivel 5): tanto `Object.getPrototypeOf(cliente)` como `Reflect.getPrototypeOf(cliente)` devolvieron `Object.prototype` de forma consistente, sin exponer el prototipo real ni ninguno de los 4 métodos raw. **Este componente de la corrección no presentó ningún problema.**

---

## 6. Explicación de `setPrototypeOf` (tal como se implementó)

Lanzaba siempre una excepción, sin importar el valor propuesto. **Funcionó correctamente para `Object.setPrototypeOf(cliente, {})` y `Reflect.setPrototypeOf(cliente, {})`** — ambos lanzaron la excepción esperada, confirmado en la sección 13. **No funcionó para la asignación `cliente.__proto__ = {}`** — ver sección 7 y sección 13, es la causa exacta del bloqueo de esta implementación.

---

## 7. Tratamiento de `__proto__` (tal como se implementó, y el problema encontrado)

**Lectura** (`cliente.__proto__`): funcionó exactamente como se diseñó — la rama agregada al trap `get` interceptó la clave `"__proto__"` y devolvió `Object.prototype`, sin delegar nunca a `target["__proto__"]`. Confirmado sin hallazgo en la sección 13.

**Escritura** (`cliente.__proto__ = valor`): **NO funcionó como se diseñó.** El diseño y las Decisiones Técnicas asumían que esta asignación invoca el método interno `[[SetPrototypeOf]]` de la misma forma que `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, y que por lo tanto quedaría cubierta por el mismo trap `setPrototypeOf`. La verificación empírica (sección 13) demostró que **esto no es así en la práctica**: `cliente.__proto__ = { marcador: "CONTAMINADO" }` no disparó el trap `setPrototypeOf` (no se lanzó ninguna excepción) y, más grave todavía, **mutó realmente el prototipo del objeto `target` real** — confirmado porque, después del intento, `cliente.$connect`, `cliente.$disconnect` y `cliente.$transaction` (métodos legítimos, previamente funcionales) pasaron a ser `undefined`, y la propiedad `marcador` del objeto malicioso quedó accesible como `cliente.marcador === "CONTAMINADO"`. `Object.getPrototypeOf(cliente)` siguió reportando `Object.prototype` después del ataque (porque ese trap sigue funcionando, enmascarando el problema) — es decir, la lectura del prototipo seguía "viéndose" correcta mientras el objeto real ya estaba corrompido por debajo.

No se pudo determinar, dentro del tiempo y el alcance de esta etapa (que prohíbe explícitamente improvisar una solución alternativa), la causa exacta de por qué la asignación vía `__proto__ =` no dispara el mismo trap `setPrototypeOf` que sí dispara `Object.setPrototypeOf`/`Reflect.setPrototypeOf` — se observó, además, que el comportamiento fue **distinto entre dos entornos de ejecución**: en la suite de Jest (código TypeScript compilado por `ts-jest`, en modo estricto por ser módulos ES/TS), un test unitario equivalente **sí** detectó el lanzamiento esperado; en un script Node.js plano ejecutado directamente contra el código ya compilado (`dist/`, con y sin `"use strict"` explícito), la misma asignación **no** lanzó ninguna excepción y sí corrompió el objeto real. Esta inconsistencia entre entornos, sin una explicación confirmada, es en sí misma motivo suficiente de bloqueo — no alcanza con que el mecanismo "parezca" funcionar en un solo entorno de prueba.

---

## 8. Estado de `constructor.prototype`

No llegó a evaluarse de forma definitiva de manera aislada, dado que la implementación se detuvo durante la ejecución del Nivel 5 (que incluye este vector dentro de la misma corrida). En la corrida que sí se ejecutó (sección 13), `cliente.constructor.prototype` siguió dando `undefined` — comportamiento heredado del mecanismo original (`.bind(target)`), no alterado por esta corrección, sin relación con el problema encontrado.

---

## 9. Comentario incorporado junto a `.bind(target)`

Se agregó (y luego se revirtió junto con el resto de los cambios) el comentario documentando que el `.bind(target)` existente, además de preservar el `this` correcto, es lo que mantiene cerrado el vector `constructor.prototype` — tal como se había diseñado. Este componente no presentó ningún problema por sí mismo.

---

## 10. Tests agregados (posteriormente eliminados)

`backend/src/prisma/organizacion-prisma.client.spec.ts` — 12 tests unitarios (contra un `target` controlado, sin conexión real) + 6 tests de integración (contra Postgres real). El detalle completo de los 18 casos y sus resultados está en las secciones 11-14. El archivo fue eliminado como parte del rollback (sección 3).

---

## 11. Resultados de build

**Verde**, sin errores ni advertencias — confirmado 2 veces: una vez con la corrección completa implementada (antes de detectar el problema), y una segunda vez después de revertir todos los cambios (sección 16).

---

## 12. Resultados de tests unitarios

Los 12 tests unitarios (contra el `target` controlado/mock, sin conexión real) **pasaron los 12**, incluyendo el test de asignación `cliente.__proto__ = {}` (que en el entorno de Jest/`ts-jest` sí lanzó la excepción esperada). **Este resultado, en retrospectiva, no es representativo del comportamiento real** — ver sección 7: el mismo escenario, ejecutado contra el código ya compilado en un script Node.js plano, mostró un comportamiento distinto (sin lanzar, con corrupción real del objeto). Se documenta este resultado como parte del registro completo de la etapa, no como evidencia de que el mecanismo funcionó correctamente.

---

## 13. Resultados de integración y validación adversarial (Nivel 5) — aquí se detectó el bloqueo

Ejecutados contra el backend real (código compilado, `dist/`, Postgres local), en scripts temporales de solo lectura, eliminados inmediatamente después de cada uso (ninguno quedó en el repositorio, confirmado por `git status --short` en cada punto de control):

| Vector | Resultado | Conforme al diseño |
|---|---|---|
| Acceso directo a `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` | Los 4 lanzan el error de aislamiento (regresión del mecanismo original) | ✅ Sí |
| `Object.getPrototypeOf(cliente)` | `Object.prototype`, sin exponer el prototipo real | ✅ Sí |
| `Reflect.getPrototypeOf(cliente)` | `Object.prototype`, sin exponer el prototipo real | ✅ Sí |
| `cliente.__proto__` (lectura) | `Object.prototype`, sin exponer el prototipo real | ✅ Sí |
| `Object.setPrototypeOf(cliente, {})` | Lanza la excepción `[aislamiento] "setPrototypeOf"...` | ✅ Sí |
| `Reflect.setPrototypeOf(cliente, {})` | Lanza la excepción `[aislamiento] "setPrototypeOf"...` | ✅ Sí |
| **`cliente.__proto__ = {...}` (asignación)** | **No lanza ninguna excepción. Muta el prototipo real del `target`: `$connect`/`$disconnect`/`$transaction` pasan a `undefined`; la propiedad del objeto asignado (`marcador: "CONTAMINADO"`) queda leíble en `cliente.marcador`. `Object.getPrototypeOf(cliente)` sigue reportando `Object.prototype` después del ataque, enmascarando la corrupción real.** | ❌ **No — bypass confirmado, no contemplado por el diseño ni por las Decisiones Técnicas** |
| `cliente.constructor` / `cliente.constructor.prototype` | `undefined` en `.prototype` (comportamiento heredado, sin cambios) | ✅ Sí |
| Método legítimo (`cliente.$connect`, antes del ataque) | Función correctamente enlazada | ✅ Sí, antes de la corrupción descrita arriba |
| `Object.isExtensible(cliente)` | `true` | ✅ Sí |

**Confirmación explícita pedida por la consigna de esta etapa:**
- ¿Ningún camino devuelve el prototipo real? — **Parcialmente falso.** Ningún camino de **lectura** (`getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__` lectura) devuelve el prototipo real. Pero la vía de **escritura** (`__proto__ =`) permite **reemplazar** el prototipo real por uno arbitrario, sin pasar por el trap de rechazo.
- ¿Ninguna modificación alcanza al `target`? — **Falso.** La asignación `cliente.__proto__ = {...}` sí alcanza y muta el `target` real.
- ¿Los métodos legítimos continúan funcionando? — Sí, **hasta que ocurre el ataque de la fila marcada arriba** — después de él, dejan de funcionar (efecto directo de la corrupción, no un defecto adicional independiente).
- ¿No aparecen nuevas superficies de bypass? — **Falso.** Apareció una: la asignación vía `__proto__ =` no cierra, permite corromper el `target` real, activando el Criterio de Detención correspondiente de `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` ("aparece otro bypass").

---

## 14. Validación de transacciones

Ejecutada antes de detectar el problema (sobre el código con la corrección todavía completa): `$transaction(callback)` y `$transaction(array)` funcionaron sin cambios; `tx.$queryRaw` y `tx.$executeRaw` funcionaron legítimamente dentro de la transacción; se confirmó que el `TransactionClient` (`tx`) no queda envuelto por el `Proxy` de H-02 (`tx !== protegido`, `Object.getPrototypeOf(tx) !== Object.prototype`); se confirmó que el cliente organizacional superior siguió bloqueando los 4 métodos raw sobre el objeto real. **Todos estos resultados fueron positivos y no están en cuestión** — el bloqueo de esta implementación es exclusivamente por el hallazgo de la sección 13 (asignación vía `__proto__`), no por ningún problema de transacciones.

---

## 15. Validación de invariantes

`Object.isExtensible(target)` (indirectamente, vía `Object.isExtensible(cliente)`, que delega al `target` real por no estar sobreescrito `isExtensible`/`preventExtensions`) se mantuvo en `true` durante toda la implementación, consistente con lo verificado en `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`. No se observó ningún `TypeError` de violación de invariante de `Proxy` en ningún momento — el problema encontrado no es una violación de invariante de `Proxy` (que hubiera sido detectada por el propio motor de JavaScript), sino un **comportamiento del mecanismo elegido que no cierra el vector de escritura vía `__proto__` como se había diseñado**, algo que solo la ejecución real pudo revelar.

---

## 16. Diff final (tras el rollback completo)

`git diff -- backend/src/prisma/organizacion-prisma.client.ts`, ejecutado después de revertir todos los cambios de esta corrección:

```diff
diff --git a/backend/src/prisma/organizacion-prisma.client.ts b/backend/src/prisma/organizacion-prisma.client.ts
index ce268fe..e440215 100644
--- a/backend/src/prisma/organizacion-prisma.client.ts
+++ b/backend/src/prisma/organizacion-prisma.client.ts
@@ -47,8 +47,35 @@ function asegurarSinEscrituraAnidada(data: unknown, operacion: string) {
   }
 }
 
+// Bloque 11, H-02 — $queryRaw/$queryRawUnsafe/$executeRaw/$executeRawUnsafe no son
+// interceptados por $extends() (las Query Extensions de Prisma no cubren estos 4 métodos de
+// nivel superior, ver comentario grande más arriba) y, confirmado empíricamente en
+// pre-implementación, tampoco son propiedades propias del objeto extendido — una eliminación
+// o reasignación directa no los habría bloqueado de forma confiable. Este Proxy envuelve
+// ÚNICAMENTE el objeto devuelto acá (el que queda inyectado como ORGANIZACION_PRISMA) — nunca
+// toca `tx`, que Prisma construye de forma independiente en cada $transaction() (confirmado
+// empíricamente: tx no comparte identidad con este objeto, incluso invocando $transaction()
+// a través del Proxy).
+const METODOS_RAW_BLOQUEADOS = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]);
+
+function bloquearMetodosRawDeNivelSuperior<T extends object>(cliente: T): T {
+  return new Proxy(cliente, {
+    get(target, prop, _receiver) {
+      if (typeof prop === "string" && METODOS_RAW_BLOQUEADOS.has(prop)) {
+        throw new Error(
+          `[aislamiento] "${prop}" no está disponible en el cliente organizacional de nivel ` +
+            `superior. Si necesitás una consulta SQL cruda protegida por bloqueo de fila, usá ` +
+            `el cliente de transacción (tx) dentro de $transaction().`,
+        );
+      }
+      const valor = (target as Record<string, unknown>)[prop as string];
+      return typeof valor === "function" ? valor.bind(target) : valor;
+    },
+  }) as T;
+}
+
 export function crearClienteOrganizacional(prisma: PrismaService) {
-  return prisma.$extends({
+  const clienteExtendido = prisma.$extends({
     name: "organizacion-scope",
     query: {
       $allModels: {
@@ -169,6 +196,8 @@ export function crearClienteOrganizacional(prisma: PrismaService) {
       },
     },
   });
+
+  return bloquearMetodosRawDeNivelSuperior(clienteExtendido);
 }
```

**Idéntico, línea por línea, al diff documentado como baseline en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` sección 1** — ninguna línea de esta corrección permanece en el árbol de trabajo.

`backend/src/prisma/organizacion-prisma.client.spec.ts` — eliminado, no aparece en `git status --short`.

**Confirmación explícita:**
- No se modificó ningún otro archivo productivo — confirmado por `git status --short` (sección 20), idéntico al estado previo a esta etapa.
- No se modificó H-07 — ningún archivo relacionado con H-07 aparece tocado.
- No hubo cambios incidentales — el único archivo productivo tocado en todo momento fue `organizacion-prisma.client.ts`, y quedó revertido a su baseline exacto.
- No se ejecutó ningún comando destructivo de git (`git reset --hard`, `git checkout .`, `git restore .`) — el rollback se hizo editando manualmente el archivo de vuelta a su contenido original, verificado con `git diff`.
- El alcance aprobado se respetó completamente hasta el momento de la detención — no se improvisó ninguna solución alternativa al encontrar el problema.

---

## 17. Riesgos residuales

- **El vector de escritura vía `cliente.__proto__ = valor` permanece abierto** — es exactamente el mismo estado que antes de intentar esta corrección (el mecanismo original de H-02 nunca implementó ningún trap `setPrototypeOf`), así que no hay ninguna regresión respecto del estado ya conocido y ya documentado como `HALLAZGO CRÍTICO` en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` — pero tampoco se logró cerrarlo en esta etapa.
- **Causa raíz no determinada:** no se investigó, dentro de esta etapa, por qué la asignación vía `__proto__ =` no dispara el trap `setPrototypeOf` de la misma forma que `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, ni por qué el comportamiento difiere entre el entorno de Jest/`ts-jest` (donde sí se detectó el lanzamiento esperado) y un script Node.js plano contra el código compilado (donde no se detectó). Esta investigación queda pendiente para una nueva etapa de Diseño o de Decisiones Técnicas, según corresponda.
- **Los otros 3 vectores del hallazgo original (`getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__` de lectura) sí se cerraron correctamente durante la implementación**, pero como toda la corrección fue revertida (no se puede cerrar solo una parte sin dejar coherencia con las Decisiones Técnicas aprobadas, que exigían el cierre de los 4 vectores simultáneamente), ninguno de los 4 queda cerrado en el código real al finalizar esta etapa.

---

## 18. Conclusión

**IMPLEMENTACIÓN BLOQUEADA.**

La implementación se detuvo durante el Nivel 5 (validación adversarial) al confirmar empíricamente que la asignación `cliente.__proto__ = valor` no es interceptada por el trap `setPrototypeOf` tal como el Diseño y las Decisiones Técnicas asumían, y que esa vía permite corromper realmente el objeto `target` (rompiendo métodos legítimos y filtrando propiedades de un objeto arbitrario), mientras el trap `getPrototypeOf` sigue reportando `Object.prototype`, enmascarando la corrupción. Esto activa, de forma directa e inequívoca, el criterio de detención "aparece otro bypass" de `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` sección 7. Conforme a ese mismo documento, no se improvisó ninguna solución alternativa — se detuvo la implementación, se retiraron únicamente los cambios de esta corrección, se conservaron intactos los cambios preexistentes de Bloque 11, se verificó el árbol con `git diff`, y se documenta el bloqueo en este informe.

**Corresponde volver a Decisiones Técnicas** (no a Diseño completo — la estrategia elegida, Proxy con traps adicionales, sigue siendo válida en principio; lo que falló es el mecanismo específico elegido para el caso de la asignación vía `__proto__`, que requiere una nueva decisión técnica puntual, no necesariamente un cambio de estrategia completo) para investigar la causa raíz de esta discrepancia y definir un mecanismo que sí cierre también la vía de escritura.

No se nombra la siguiente etapa formalmente en este documento (no corresponde a `REVISION_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, que solo aplica si la implementación hubiera quedado validada) — queda a criterio del Product Owner decidir si se reabre `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` para este punto específico, o si se solicita un nuevo análisis técnico dedicado a esta discrepancia puntual antes de continuar.

---

## Informe final

- **Archivos modificados:** `backend/src/prisma/organizacion-prisma.client.ts` (modificado y revertido); `backend/src/prisma/organizacion-prisma.client.spec.ts` (creado y eliminado). Ningún otro archivo.
- **Traps implementados (durante la implementación, luego revertidos):** `getPrototypeOf` (nuevo) y `setPrototypeOf` (nuevo), más una rama nueva para `"__proto__"` dentro del trap `get` ya existente.
- **Comportamiento final de `getPrototypeOf`:** funcionó correctamente en todos los casos probados — cierra `Object.getPrototypeOf()` y `Reflect.getPrototypeOf()` sin excepciones.
- **Comportamiento final de `setPrototypeOf`:** funcionó correctamente para `Object.setPrototypeOf()` y `Reflect.setPrototypeOf()`, mas **no** para la asignación `cliente.__proto__ = valor`, que lo evade por completo y corrompe el objeto real — este es el motivo exacto del bloqueo.
- **Comportamiento final de `__proto__`:** lectura correctamente bloqueada (devuelve `Object.prototype`); escritura **no** bloqueada (bypass confirmado, corrompe el `target` real).
- **Estado de `constructor.prototype`:** sin cambios respecto del mecanismo original, sigue dando `undefined` (comportamiento heredado, no relacionado con el problema encontrado).
- **Comentario agregado junto a `.bind(target)`:** implementado según lo diseñado, sin problemas — revertido junto con el resto de los cambios.
- **Tests unitarios agregados:** 12, todos en verde en el momento de ejecutarlos — pero uno de ellos (asignación `__proto__ =`) resultó no representativo del comportamiento real fuera del entorno de Jest, según se determinó después.
- **Tests de integración agregados:** 6, todos en verde en el momento de ejecutarlos, sin relación con el problema encontrado (el problema se detectó en la validación adversarial posterior, no en estos tests).
- **Resultado del build:** verde, tanto con la corrección completa como después del rollback.
- **Resultado de la suite nueva:** 18/18 en verde en el momento de la ejecución (12 unitarios + 6 de integración) — ver advertencia de la sección 12 sobre el test de `__proto__ =`.
- **Resultado de la integración:** todos los casos (`$transaction` callback y array, `tx.$queryRaw`, `tx.$executeRaw`, `tx` no envuelto, bloqueo superior sobre objeto real) en verde, sin relación con el bloqueo.
- **Resultado de la validación adversarial:** 9 de 10 vectores sin hallazgo; 1 vector (`cliente.__proto__ = valor`) con hallazgo confirmado — bypass real, con corrupción del objeto real, no solo teórico.
- **Funcionamiento de `$transaction`:** sin problemas, en sus 2 formas, confirmado antes del bloqueo.
- **Riesgos residuales:** el vector de escritura vía `__proto__` permanece sin cerrar (mismo estado que antes de esta etapa, sin regresión); causa raíz de la discrepancia entre entornos (Jest vs. Node plano) no determinada, queda pendiente de investigación.
- **Conclusión final:** **IMPLEMENTACIÓN BLOQUEADA.**
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
  ?? IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md
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

No se hizo `git add`, `commit` ni `push` en ningún momento. Me detengo y quedo a la espera de la decisión del Product Owner antes de continuar.

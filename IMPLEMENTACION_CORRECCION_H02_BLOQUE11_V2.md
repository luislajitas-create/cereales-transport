# Implementación — Corrección de H-02 V2

Fecha: 2026-07-25. Ejecutada conforme a `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` y `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`. **Implementación detenida durante la ejecución de los tests unitarios contra el objeto real de Prisma, por activación directa del criterio de detención "Jest contradice Node compilado".** Todos los cambios de esta implementación fueron revertidos antes de finalizar. No se hizo `git add`, `commit` ni `push` en ningún momento.

---

## 1. Resumen de cambios (implementados y luego revertidos)

Se agregó, dentro de `bloquearMetodosRawDeNivelSuperior()`, exactamente lo diseñado en V2:

1. Conservación íntegra de los traps `get` (incluida la rama de lectura de `"__proto__"`) y del `.bind(target)` — sin ninguna línea reescrita.
2. **Trap `set` nuevo** — intercepta exclusivamente `"__proto__"` (lanza antes de delegar); delega cualquier otra clave vía `Reflect.set(target, prop, value, receiver)`, 4 argumentos.
3. Reincorporación del trap `getPrototypeOf` (idéntico al ya validado en la Implementación V1, antes de su reversión completa).
4. Reincorporación del trap `setPrototypeOf` (idéntico al ya validado en V1), con su comentario corregido para reflejar con precisión que ya **no** cubre `cliente.__proto__ = ...` (eso lo cubre el trap `set` nuevo).

Los 4 traps quedaron implementados en un único objeto `handler`, dentro de la única función autorizada, en el único archivo autorizado.

---

## 2. Diff funcional

El diff productivo completo, revisado manualmente antes de proceder con los tests (paso 9 del orden obligatorio), se limitó exactamente a lo descrito en la sección 1 — confirmado por `git diff` que ninguna otra línea del archivo (la extensión de aislamiento organizacional, `asegurarSinEscrituraAnidada`, `crearClienteOrganizacional`) resultó modificada. El diff completo (ya revertido) se reproduce en la sección 12 de este documento como evidencia del estado final.

---

## 3. Archivos modificados durante la implementación (todos revertidos)

- `backend/src/prisma/organizacion-prisma.client.ts` — modificado y luego **revertido exactamente al baseline** (confirmado por `git diff` idéntico al de `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, sección 1).
- `backend/src/prisma/organizacion-prisma.client.spec.ts` — creado y luego **eliminado** antes de finalizar.

**Ningún otro archivo fue tocado** — ni `organizacion-prisma.module.ts`, ni `PrismaService`, ni ningún controller, ni `package.json`, ni ningún archivo de H-01/H-04/H-07/H-08.

---

## 4. Tests agregados (creados y luego eliminados)

`backend/src/prisma/organizacion-prisma.client.spec.ts`, con 3 `describe` blocks, siguiendo exactamente la clasificación mock/objeto-real ya cerrada en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`:

- **Unitarios (mock, sin conexión real):** 9 casos — acceso directo a los 4 métodos raw, lectura de prototipo (`Object.getPrototypeOf`/`Reflect.getPrototypeOf`/`__proto__`), método legítimo enlazado, escritura legítima delegada correctamente.
- **Contra el objeto real de Prisma (sin necesitar Postgres activo):** 9 casos — `Object.setPrototypeOf`/`Reflect.setPrototypeOf` rechazados, `constructor.prototype`, `cliente.__proto__ = {}` rechazado sin corromper el cliente real, `Reflect.set(cliente, "__proto__", {})` rechazado (con y sin `receiver` explícito), setter heredado invocado vía `.call()` rechazado, regresión de bloqueo de los 4 métodos raw sobre el objeto real, extensibilidad preservada.
- **Integración (Postgres real):** 5 casos — `$transaction(callback)`/`tx.$queryRaw`, `tx.$executeRaw`, `$transaction(array)`, `tx` no envuelto por el Proxy, confirmación explícita de que el nuevo trap `set` no afecta a `tx`.

Total: 23 tests, en el archivo eliminado como parte del rollback (sección 3).

---

## 5. Build

**Verde**, sin errores ni advertencias — confirmado 2 veces: una con la implementación completa (antes de detectar el problema) y una segunda vez después de revertir todos los cambios (sección 12).

---

## 6. Resultados unitarios

De los 23 tests del archivo (eliminado), **22 pasaron y 1 falló**:

```
Corrección de H-02 V2 — unitarios (mock, sin conexión real)
  √ los 9 casos, todos en verde

Corrección de H-02 V2 — contra el objeto real de Prisma (sin necesitar Postgres activo)
  √ Object.setPrototypeOf(cliente, {}) es rechazado
  √ Reflect.setPrototypeOf(cliente, {}) es rechazado
  × cliente.constructor.prototype no permite recuperar el prototipo real
      expect(received).toBeUndefined()
      Received: {}
  √ cliente.__proto__ = {} es rechazado, sin corromper el cliente real
  √ Reflect.set(cliente, "__proto__", {}) es rechazado, sin corromper el cliente real
  √ Reflect.set(cliente, "__proto__", {}, cliente) con receiver explícito también es rechazado
  √ el setter heredado de __proto__, invocado directamente vía .call(cliente, ...), es rechazado
  √ el cliente organizacional superior continúa bloqueando los 4 métodos raw (regresión, objeto real)
  √ el cliente protegido se mantiene extensible tras la corrección

Corrección de H-02 V2 — integración (Postgres real)
  √ los 5 casos, todos en verde
```

**El único fallo detectado — `cliente.constructor.prototype` devolvió `{}` en lugar de `undefined` contra el objeto real de Prisma, ejecutado vía Jest — es la causa exacta del bloqueo de esta implementación** (sección 9).

**Verificación de no-contaminación entre tests:** se repitió el test aislado (`npx jest ... -t "constructor.prototype no permite"`), sin ejecutar ningún otro test del mismo `describe` antes — **falló exactamente igual**, confirmando que no se trata de un problema de orden de ejecución ni de estado compartido entre tests dentro del mismo archivo.

---

## 7. Resultados de integración

Los 5 casos de integración contra Postgres real (`$transaction` en sus 2 formas, `tx.$queryRaw`, `tx.$executeRaw`, confirmación de que `tx` no queda envuelto) **pasaron todos, sin ninguna excepción**, antes de que se detectara el problema que causó el bloqueo. Estos resultados no están en cuestión — el bloqueo de esta implementación es exclusivamente por el hallazgo de la sección 6/9, no por ningún problema de transacciones.

---

## 8. Resultados en Node compilado (fuera de Jest)

Se ejecutó un diagnóstico puntual, de solo lectura, contra el código ya compilado (`dist/`), reproduciendo exactamente el mismo escenario que el test fallido de Jest (`cliente.constructor.prototype`, contra el objeto real de Prisma, mismo mecanismo de 4 traps ya implementado en ese momento):

```
typeof ctor: function
ctor.name: bound t
ctor.prototype: undefined
ctor.hasOwnProperty('prototype'): false
```

**Resultado: `undefined` — exactamente el esperado, contradiciendo directamente el `{}` que Jest reportó para el mismo vector, contra el mismo código.** Esta discrepancia entre Jest y Node compilado, para un vector que **antes** (en la Implementación V1) se había confirmado sin problemas en ambos entornos, es la evidencia central del bloqueo.

---

## 9. Validación adversarial

No se completó la matriz adversarial completa de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` sección 14 — la implementación se detuvo en el paso 15 del orden obligatorio (validación adversarial), inmediatamente después de que la ejecución de los tests unitarios (paso 13) revelara la discrepancia Jest/Node descrita arriba. Conforme a las instrucciones de esta etapa ("Si cualquiera ocurre: NO intentar corregir. NO improvisar. Generar documentación de bloqueo"), no se continuó ejecutando el resto de la matriz una vez activado el criterio de detención.

**Vectores sí confirmados antes de la detención** (secciones 6-8): los 4 métodos raw bloqueados sobre el objeto real; lectura de prototipo saneada (mock); `Object.setPrototypeOf`/`Reflect.setPrototypeOf` rechazados sobre el objeto real; `cliente.__proto__ = {}` rechazado sobre el objeto real, sin corromper el cliente (`$connect`/`$disconnect`/`$transaction` siguieron siendo función, ninguna propiedad del objeto malicioso se filtró); `Reflect.set(cliente, "__proto__", {})` rechazado, con y sin `receiver` explícito; setter heredado invocado vía `.call()` rechazado; extensibilidad preservada.

**Vector con hallazgo:** `constructor.prototype` — comportamiento correcto en Node compilado, comportamiento distinto (inesperado) en Jest.

---

## 10. Criterios de aceptación — evaluación

| Criterio | Estado |
|---|---|
| ✓ Build exitoso | Cumplido |
| ✓ Tests unitarios | **No cumplido** — 22/23, 1 fallo |
| ✓ Tests Prisma real | Cumplido para los casos ejecutados antes de la detención |
| ✓ Node compilado | Cumplido para el vector reproducido, pero **contradice** el resultado de Jest para ese mismo vector |
| ✓ Suite completa | No se llegó a ejecutar (detención en el paso 13-15 del orden obligatorio) |
| ✓ `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` bloqueados | Cumplido |
| ✓ `Object.getPrototypeOf`/`Reflect.getPrototypeOf` saneados | Cumplido |
| ✓ Lectura de `__proto__` saneada | Cumplido |
| ✓ `Object.setPrototypeOf`/`Reflect.setPrototypeOf` bloqueados | Cumplido |
| ✓ `cliente.__proto__ =` bloqueado | Cumplido |
| ✓ `Reflect.set("__proto__")` bloqueado | Cumplido |
| ✓ Setter heredado evaluado | Cumplido (rechazado correctamente) |
| ✓ `constructor.prototype` continúa protegido | **No cumplido de forma consistente** — protegido en Node compilado, no protegido de la misma forma en Jest |
| ✓ `tx` continúa operativo | Cumplido |
| ✓ `tx` raw continúa permitido | Cumplido |
| ✓ `target` intacto | Cumplido para los vectores ejecutados |
| ✓ Prototipo intacto | Cumplido para los vectores ejecutados |

**No se cumplen todos los criterios simultáneamente — la implementación no puede declararse exitosa.**

---

## 11. Criterios de detención — cuál se activó

**"Jest contradice Node compilado"** — activado de forma directa e inequívoca. El mismo vector (`cliente.constructor.prototype`, contra el mismo mecanismo de 4 traps ya implementado, contra el mismo objeto real de Prisma) produjo `{}` en Jest y `undefined` en Node compilado. Conforme al criterio ya definido en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md` sección 10, punto 9, esto exige detención inmediata, sin importar que el resultado "correcto" (Node) sea el que ya se esperaba — la sola existencia de la discrepancia entre ambos entornos es, por sí misma, la condición de detención, independientemente de cuál de los dos resultados sea el "bueno".

No se determinó, en esta etapa, la causa de la discrepancia — conforme a las instrucciones ("NO intentar corregir. NO improvisar."), no se investigó más allá de la verificación mínima ya documentada (confirmar que no es contaminación entre tests, sección 6).

---

## 12. Diff final (tras el rollback completo) y `git status`

`git diff -- backend/src/prisma/organizacion-prisma.client.ts`, ejecutado después de revertir todos los cambios:

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

**Idéntico, línea por línea (mismo hash `e440215`), al diff documentado como baseline en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md` sección 1** — ninguna línea de esta implementación permanece en el árbol de trabajo.

`backend/src/prisma/organizacion-prisma.client.spec.ts` — eliminado, no aparece en `git status --short`.

`git status --short` final:
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

**Confirmación explícita:** no se modificó ningún otro archivo productivo; no se modificó H-07; no hubo cambios incidentales; no se ejecutó ningún comando destructivo de git (`git reset --hard`, `git checkout .`, `git restore .` — la reversión fue manual, editando el archivo de vuelta a su contenido exacto, verificado con `git diff`); el alcance aprobado se respetó completamente hasta el momento de la detención.

---

## Conclusión

**B) IMPLEMENTACIÓN V2 BLOQUEADA.**

La implementación se detuvo durante la ejecución de los tests unitarios (paso 13 del orden obligatorio), al confirmar que el vector `cliente.constructor.prototype` — ya cerrado y validado en V1, sin relación directa con el mecanismo nuevo de V2 (el trap `set`) — produce resultados distintos entre Jest (`{}`) y Node compilado (`undefined`) contra el mismo código, el mismo objeto real de Prisma, y el mismo mecanismo completo de 4 traps. Esto activa de forma directa e inequívoca el criterio de detención "Jest contradice Node compilado", definido explícitamente para esta etapa. Conforme a las instrucciones, no se intentó corregir ni se improvisó ninguna solución — se detuvo la implementación, se revirtieron íntegramente los cambios (verificado por `git diff` idéntico al baseline), se conservaron intactos los cambios preexistentes de Bloque 11, y se documenta el bloqueo en este informe.

No se determinó la causa de esta discrepancia — es un hallazgo nuevo, no investigado en ninguna etapa previa de esta cadena (todas las investigaciones previas se centraron en el vector de escritura de `__proto__`, no en `constructor.prototype`, que hasta ahora siempre se había comportado de forma consistente entre entornos). Corresponde a una nueva etapa de investigación, fuera del mandato de esta implementación, determinar la causa raíz de esta discrepancia específica antes de poder reintentar la implementación.

---

## Informe final

- **Archivos modificados:** `backend/src/prisma/organizacion-prisma.client.ts` (modificado durante la implementación, revertido exactamente al baseline); `backend/src/prisma/organizacion-prisma.client.spec.ts` (creado, eliminado). Ningún otro archivo.
- **Líneas modificadas (durante la implementación, antes del revert):** +69 líneas netas sobre el baseline de V2 (trap `set` nuevo + traps `getPrototypeOf`/`setPrototypeOf` reincorporados + comentario corregido en `setPrototypeOf`) — todas revertidas; el diff final es idéntico al baseline original (mismo hash `e440215`).
- **Tests creados:** 23 (9 unitarios con mock, 9 contra el objeto real de Prisma, 5 de integración con Postgres real) — todos eliminados como parte del rollback.
- **Tests aprobados:** 22 de 23 — el único fallo (`constructor.prototype`) es la causa exacta del bloqueo.
- **Build:** verde, tanto con la implementación completa como después del rollback.
- **Integración:** los 5 casos con Postgres real, todos en verde antes de la detención.
- **Node compilado:** vector reproducido (`constructor.prototype`) dio el resultado correcto (`undefined`) — **en contradicción directa** con el resultado de Jest (`{}`) para el mismo vector, siendo esa contradicción la causa del bloqueo.
- **Validación adversarial:** no completada — detenida antes de ejecutar la matriz completa, conforme al protocolo de detención inmediata.
- **`git diff`:** idéntico al baseline tras el rollback (`backend/src/prisma/organizacion-prisma.client.ts`, mismo hash `ce268fe..e440215`, 30 inserciones/1 eliminación — el mecanismo original de Bloque 11, sin ningún rastro de esta implementación).
- **`git status --short`:** idéntico al estado previo a esta etapa, salvo la aparición de este mismo documento (`IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`) — sin `git add` ejecutado.

No se hizo `git add`, `commit` ni `push` en ningún momento. Me detengo y quedo a la espera de la decisión del Product Owner antes de continuar.

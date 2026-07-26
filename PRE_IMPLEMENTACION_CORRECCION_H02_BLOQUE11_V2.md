# Pre-Implementación — Corrección de H-02 (V2): checklist operativo

Fecha: 2026-07-25. **No implementa todavía, no modifica código productivo, no modifica tests, no modifica backend/frontend/schema, no crea migraciones, no genera parches, no modifica ningún documento anterior.** Transforma `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` (ya aprobado) en un checklist técnico ejecutable. No rediseña, no vuelve a justificar ninguna decisión ya cerrada, no repite ninguna investigación ni experimento.

---

## 1. Baseline

**Estado esperado del árbol antes de comenzar la implementación:**

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

Confirmado en esta etapa: `git diff -- backend/src/prisma/organizacion-prisma.client.ts` muestra exactamente el mismo mecanismo original de H-02 (30 inserciones, 1 eliminación, sin ningún rastro de la implementación V1 revertida) — idéntico al baseline ya documentado en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` e `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`.

**Archivos que deberán permanecer sin cambios durante toda la implementación de V2:** todos los listados arriba salvo `backend/src/prisma/organizacion-prisma.client.ts` (único archivo productivo autorizado) y `backend/src/prisma/organizacion-prisma.client.spec.ts` (archivo de tests, no trackeado hoy porque no existe — deberá crearse). En particular, permanecen sin cambios: `organizacion-prisma.module.ts`, cualquier controller, `schema.prisma`, cualquier archivo de H-01/H-04/H-07/H-08, y los 9 archivos ya modificados desde antes de esta cadena de H-02 (auth, catálogos, main.ts, package.json/lock, railway.json).

**Documentos aprobados que rigen esta implementación:** `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, `DISEÑO_CORRECCION_H02_BLOQUE11.md`, `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `INVESTIGACION_H02_PROTO_SETTER.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`.

**Archivos productivos autorizados:** `backend/src/prisma/organizacion-prisma.client.ts` (único).

**Archivos de tests autorizados:** `backend/src/prisma/organizacion-prisma.client.spec.ts` (a crear).

---

## 2. Archivos autorizados

- **Archivo productivo permitido:** `backend/src/prisma/organizacion-prisma.client.ts`.
- **Función permitida:** `bloquearMetodosRawDeNivelSuperior()`.
- **Archivo de tests permitido:** `backend/src/prisma/organizacion-prisma.client.spec.ts`.

**¿Es suficiente modificar únicamente esos archivos?**

**Sí.** Confirmado explícitamente en `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, sección 15, respondiendo cada pregunta relevante (necesidad de tocar `organizacion-prisma.module.ts`, `PrismaService`, el flujo de transacciones, o de crear helpers en otro archivo) con "No" en todos los casos, sobre la base del análisis técnico ya cerrado en ese documento — no hay ningún elemento nuevo en esta etapa que lo contradiga. El trap `set` nuevo es, estructuralmente, una propiedad más del mismo objeto `handler` ya existente dentro de la única función autorizada.

---

## 3. Orden de implementación

1. Verificar baseline (`git status --short`, `git diff` sobre el archivo productivo único) — debe coincidir exactamente con la sección 1 de este documento.
2. Localizar la función `bloquearMetodosRawDeNivelSuperior()` dentro del archivo.
3. Incorporar el trap `set` nuevo al mismo objeto `handler` — chequeo de `"__proto__"` primero (lanza), delegación de 4 argumentos para el resto.
4. Conservar el trap `get` exactamente como está (incluida la rama de lectura de `"__proto__"` ya existente desde V1) — **no tocar ninguna línea de este trap**.
5. Conservar el trap `getPrototypeOf` exactamente como está — **no tocar ninguna línea**.
6. Conservar el trap `setPrototypeOf` exactamente como está — **no tocar ninguna línea**.
7. Conservar el `.bind(target)` dentro del trap `get` exactamente como está, incluido su comentario explicativo ya existente — **no tocarlo**.
8. Revisar consistencia entre los 4 traps: mismo estilo de mensaje (`[aislamiento] ...`), mismo tipo de excepción (`Error` genérico), mismo criterio de "lanzar siempre, sin casos de excepción silenciosa".
9. Revisar la delegación del trap `set` nuevo: confirmar que usa `Reflect.set(target, prop, value, receiver)` con los 4 argumentos, nunca 3, y que el `receiver` usado es el parámetro recibido por el trap, nunca sustituido por `target` ni por una constante fija.
10. Revisar los mensajes de error: el del trap `set` nuevo debe ser específico para la operación de escritura de `"__proto__"`, distinto en texto pero de la misma familia de estilo que el de `setPrototypeOf`; ninguno de los 4 mensajes debe exponer nombres de clases internas de Prisma, estructura del objeto real, ni ningún otro detalle interno.
11. Revisar el diff productivo completo (`git diff -- backend/src/prisma/organizacion-prisma.client.ts`) — debe limitarse exactamente a la incorporación del trap `set` nuevo; ninguna otra línea del archivo debe aparecer modificada respecto del baseline de la sección 1.
12. Recién después de confirmar los pasos 1-11, comenzar la creación de tests (sección 6 de este documento).

No se escribe código en esta etapa — este orden es el checklist que deberá seguirse durante la Implementación.

---

## 4. Cambios funcionales esperados

**Qué cambia:** el `handler` del `Proxy` que envuelve el cliente organizacional gana un trap `set` que no existía en ninguna versión anterior (ni en el mecanismo original de Bloque 11, ni en la implementación V1 revertida). Este trap intercepta exclusivamente los intentos de escritura sobre la clave `"__proto__"` del cliente inyectado.

**Qué permanece igual:** el comportamiento de los 4 métodos raw bloqueados (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`); el comportamiento de la lectura del prototipo (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, lectura de `__proto__`); el comportamiento de `Object.setPrototypeOf`/`Reflect.setPrototypeOf`; el comportamiento de `constructor.prototype`; el comportamiento de cualquier método legítimo de Prisma (de modelo o de nivel superior); el comportamiento de `$transaction` en sus 2 formas y de `tx.$queryRaw`/`tx.$executeRaw`; el comportamiento del resto de la aplicación (H-01, H-04, H-07, H-08), completamente ajeno a este cambio.

**Qué comportamiento debe mantenerse idéntico:** todo lo anterior, sin ninguna excepción — este cambio es estrictamente **aditivo**, no debe alterar ningún comportamiento ya validado.

**Qué nuevo comportamiento debe aparecer:** `cliente.__proto__ = valor` y `Reflect.set(cliente, "__proto__", valor[, receiver])` deben lanzar una excepción, sin llegar nunca a modificar el objeto real de Prisma — cerrando el vector confirmado explotable en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` y en la Implementación V1 bloqueada.

---

## 5. Validaciones de implementación (inmediatamente después de modificar el archivo productivo)

- **Compilación:** `npm run build` debe terminar en verde, sin errores ni advertencias nuevas de TypeScript.
- **Lint:** el proyecto no tiene un comando de lint separado configurado (confirmado en etapas previas de Bloque 11) — no aplica como paso adicional; la compilación de TypeScript cumple el rol de verificación estática disponible.
- **Revisión manual del diff:** confirmar, leyendo el diff completo, que el único cambio es la incorporación del trap `set` — ninguna línea de los traps `get`/`getPrototypeOf`/`setPrototypeOf` ni del resto del archivo (la extensión de aislamiento organizacional, `asegurarSinEscrituraAnidada`, `crearClienteOrganizacional`) aparece modificada.
- **Revisión de traps:** confirmar que el `handler` del `Proxy` sigue siendo un único objeto literal pasado a `new Proxy(cliente, {...})` — no se introduce un segundo `Proxy` ni una capa de envoltura adicional.
- **Revisión de delegación:** confirmar visualmente que la línea de delegación del trap `set` nuevo es `Reflect.set(target, prop, value, receiver)`, con los 4 argumentos exactos, antes de continuar con cualquier test.

---

## 6. Plan de tests

### A) Tests unitarios

- **Objetivo:** validar el comportamiento del `Proxy` (los 4 traps) de forma aislada, rápida, reproducible.
- **Criterio de aprobación:** los 16 casos de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` sección 12 pasan, respetando estrictamente la clasificación ya cerrada en ese documento: los casos 1-7, 14 (parcial) y 15 pueden usar un `target` de control (mock); los casos 8, 9, 13 pueden usar mock pero deben **reconfirmarse** también en integración por prudencia; los casos 10, 11, 12 y 16 **deben** ejecutarse obligatoriamente contra el objeto real devuelto por `prisma.$extends()` (no un mock ordinario) — no se acepta como evidencia suficiente que estos 4 casos pasen solo contra un mock, dado que es exactamente el defecto metodológico que causó el bloqueo de la Implementación V1.
- **Criterio de detención:** si cualquiera de los 4 casos obligatoriamente-contra-objeto-real (10, 11, 12, 16) no puede ejecutarse contra el objeto real por alguna restricción técnica no anticipada, detener — no sustituirlo por una versión con mock y darlo por válido.

### B) Tests con Prisma real (integración)

- **Objetivo:** validar el comportamiento del mecanismo completo contra el objeto real de Prisma y, para los casos que lo requieran, contra Postgres real — incluyendo transacciones.
- **Criterio de aprobación:** los 15 casos de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` sección 13 pasan, incluido el punto 15 (verificación en Node compilado fuera de Jest), sin excepción.
- **Criterio de detención:** si algún caso de integración falla, o si la infraestructura local (Postgres) no está disponible para ejecutar los casos que lo requieren (8-12), detener y documentar — no simular éxito ni omitir el caso.

### C) Validación adversarial

- **Objetivo:** repetir, contra el mecanismo ya implementado, los 15 vectores de la matriz de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md` sección 14, más los 2 vectores adicionales explícitamente pedidos en esta etapa (`Reflect.set(cliente, "__proto__", {}, cliente)` con receiver idéntico al propio cliente; y confirmación de que ningún vector nuevo, no contemplado en el diseño, aparece durante la ejecución real).
- **Criterio de aprobación:** los 15+ vectores, sin ningún hallazgo — ningún camino recupera el prototipo real, ninguno modifica el `target`, ninguno modifica el prototipo real.
- **Criterio de detención:** cualquier vector que produzca un resultado distinto del esperado detiene la implementación de inmediato (ver sección 10).

### D) Node compilado fuera de Jest

- **Objetivo:** confirmar, de forma independiente de Jest/`ts-jest`, que el mecanismo funciona igual contra el código ya compilado (`dist/`), ejecutado directamente con `node` — mismo método ya usado en `INVESTIGACION_H02_PROTO_SETTER.md`/`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md` (script temporal, eliminado inmediatamente después).
- **Criterio de aprobación:** los vectores críticos (10, 11, 12, 16 de la sección A; y la matriz completa de la sección C) producen exactamente el mismo resultado en Node compilado que en Jest.
- **Criterio de detención:** cualquier discrepancia entre el resultado de Jest y el de Node compilado detiene la implementación de inmediato — es, textualmente, el patrón exacto que causó el bloqueo de la Implementación V1, y no se acepta como resuelto hasta que ambos entornos coincidan.

---

## 7. Matriz de validación

| Vector | Resultado esperado | Trap involucrado | Evidencia requerida |
|---|---|---|---|
| `cliente.$queryRaw` | Lanza | `get` | Mensaje de error exacto |
| `cliente.$executeRaw` | Lanza | `get` | Mensaje de error exacto |
| `cliente.$queryRawUnsafe` | Lanza | `get` | Mensaje de error exacto |
| `cliente.$executeRawUnsafe` | Lanza | `get` | Mensaje de error exacto |
| `Object.getPrototypeOf(cliente)` | `Object.prototype` | `getPrototypeOf` | Valor devuelto; `typeof` de `$queryRaw` sobre el resultado = `"undefined"` |
| `Reflect.getPrototypeOf(cliente)` | `Object.prototype` | `getPrototypeOf` | Igual que arriba |
| `cliente.__proto__` (lectura) | `Object.prototype` | `get` (rama especial) | Igual que arriba |
| `Object.setPrototypeOf(cliente, {})` | Lanza | `setPrototypeOf` | Mensaje de error; estado del `target` antes/después idéntico |
| `Reflect.setPrototypeOf(cliente, {})` | Lanza | `setPrototypeOf` | Igual que arriba |
| `cliente.__proto__ = {}` | Lanza | `set` (**nuevo**) | Mensaje de error; `$connect`/`$disconnect`/`$transaction` siguen siendo función antes/después |
| `Reflect.set(cliente, "__proto__", {})` | Lanza | `set` (**nuevo**) | Igual que arriba |
| Setter heredado invocado vía `.call(cliente, {})` | Lanza | `setPrototypeOf` (no `set`) | Mensaje de error; confirmación explícita de cuál trap se disparó |
| `cliente.constructor.prototype` | `undefined` | (`get`, consecuencia del `.bind(target)`) | Valor exacto |
| `$transaction(callback)` | Funciona sin cambios | Ninguno bloquea (delegado vía `get`) | Resultado real de una consulta ejecutada dentro |
| `$transaction(array)` | Funciona sin cambios | Ninguno bloquea | Resultado real |
| `tx.$queryRaw` | Funciona sin cambios | Ninguno (`tx` nunca pasa por este `Proxy`) | SQL real ejecutado |
| `tx.$executeRaw` | Funciona sin cambios | Ninguno | SQL real ejecutado |

---

## 8. Rollback

- **Cuándo detener la implementación:** ante cualquiera de los criterios de detención de la sección 10 de este documento, en el momento exacto en que se detecte — no continuar "para ver si el resto funciona".
- **Cuándo revertir:** inmediatamente después de detener, antes de documentar el bloqueo — mismo protocolo ya aplicado en la Implementación V1 bloqueada.
- **Procedimiento de reversión:** revertir manualmente, dentro de `organizacion-prisma.client.ts`, únicamente las líneas agregadas por esta implementación (el trap `set` nuevo) — dejando el archivo exactamente en el estado documentado como baseline en la sección 1 de este documento. Eliminar el archivo de test nuevo (`organizacion-prisma.client.spec.ts`) si se hubiera creado. Verificar con `git diff -- backend/src/prisma/organizacion-prisma.client.ts` que el resultado es idéntico al baseline. Verificar con `git status --short` que no queda ningún archivo de test sin eliminar.
- **Prohibido para este rollback:** `git reset --hard`, `git checkout .`, `git restore .` — mismo criterio ya establecido en `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` sección 8, porque cualquiera de estos 3 comandos afectaría también los otros cambios ya presentes en el árbol de trabajo, no exclusivos de esta corrección.
- **Qué condiciones invalidan el cambio:** cualquiera de los 9 criterios de detención de la sección 10.
- **Qué resultados son inaceptables:** el `target` modificado por cualquier vector; el prototipo real modificado por cualquier vector; cualquier regresión sobre `$transaction`/`tx`; cualquier discrepancia entre Jest y Node compilado; cualquier necesidad de tocar un archivo fuera de los 2 autorizados.

---

## 9. Criterios de aceptación

- ✓ Build exitoso.
- ✓ Suite unitaria — los 16 casos de la sección 6.A, con la clasificación mock/objeto-real respetada.
- ✓ Integración con Prisma real — los 15 casos de la sección 6.B.
- ✓ Node compilado fuera de Jest — resultado idéntico al de Jest para los vectores críticos.
- ✓ Bypass eliminado — `cliente.__proto__ = valor` y `Reflect.set(cliente, "__proto__", valor)` lanzan, sin excepción.
- ✓ `target` intacto después de cada vector de la matriz de validación (sección 7).
- ✓ Prototipo real intacto después de cada vector.
- ✓ `tx` funcional en sus 2 formas de `$transaction`, con `tx.$queryRaw`/`tx.$executeRaw` operativos.
- ✓ Métodos raw superiores (los 4, sobre el cliente organizacional) bloqueados, sin regresión.
- ✓ Métodos raw de `tx` (los legítimos, dentro de una transacción) permitidos, sin regresión.

---

## 10. Criterios de detención

Detener inmediatamente la implementación si aparece cualquiera de los siguientes:

1. Modificación del `target` (cualquier método legítimo deja de ser función, o aparece una propiedad no esperada).
2. Modificación del prototipo real (`Object.getPrototypeOf` del `target`, verificado por una vía independiente del `Proxy`, difiere de lo esperado).
3. Regresión funcional en cualquier flujo ya validado (H-01, H-04, H-07, H-08, o cualquier operación de modelo/transacción).
4. Fallo en transacciones (`$transaction` en cualquiera de sus 2 formas, o `tx.$queryRaw`/`tx.$executeRaw`).
5. Aparición de un bypass nuevo, no contemplado en la matriz de la sección 7.
6. Incumplimiento de una invariante de ECMAScript no anticipada en el Diseño V2 (por ejemplo, un `TypeError` de invariante de `Proxy` inesperado).
7. Necesidad de ampliar el alcance del cambio más allá de la función autorizada.
8. Necesidad de modificar otro archivo productivo además de `organizacion-prisma.client.ts`.
9. Contradicción entre el resultado de Jest y el de Node compilado (para cualquier vector, no solo los ya identificados como críticos).

En cualquiera de estos casos: detener, no improvisar una solución alternativa, ejecutar el rollback de la sección 8, y documentar el bloqueo con precisión (qué criterio se activó, con qué evidencia) — mismo protocolo ya aplicado en la Implementación V1.

---

## 11. Checklist final (operativo, paso a paso)

1. [ ] Ejecutar `git status --short` y `git diff -- backend/src/prisma/organizacion-prisma.client.ts` — confirmar coincidencia exacta con la sección 1 de este documento.
2. [ ] Abrir `backend/src/prisma/organizacion-prisma.client.ts` y localizar `bloquearMetodosRawDeNivelSuperior()`.
3. [ ] Confirmar que el `handler` actual tiene exactamente 3 traps: `get`, `getPrototypeOf`, `setPrototypeOf`.
4. [ ] Agregar el trap `set` nuevo al mismo objeto `handler`, con el chequeo de `"__proto__"` como primera rama (lanza `Error` con mensaje específico) y delegación vía `Reflect.set(target, prop, value, receiver)` (4 argumentos) para cualquier otra clave.
5. [ ] Confirmar que ninguna línea de los traps `get`/`getPrototypeOf`/`setPrototypeOf` ni del `.bind(target)` fue tocada.
6. [ ] Ejecutar `npm run build` — debe terminar en verde.
7. [ ] Ejecutar `git diff -- backend/src/prisma/organizacion-prisma.client.ts` — el diff debe mostrar únicamente la incorporación del trap `set` nuevo.
8. [ ] Crear `backend/src/prisma/organizacion-prisma.client.spec.ts` con los 16 casos unitarios de la sección 6.A, respetando la clasificación mock/objeto-real.
9. [ ] Ejecutar la suite específica del archivo nuevo — los 16 casos deben pasar.
10. [ ] Agregar los tests de integración de la sección 6.B al mismo archivo (o a uno separado, según se determine en el momento) — los 15 casos deben pasar, incluido el punto 15 (Node compilado).
11. [ ] Ejecutar `npm test -- --runInBand` (suite completa del proyecto) — debe seguir en verde, sin ninguna regresión sobre los tests preexistentes de H-01/H-04.
12. [ ] Ejecutar la validación adversarial completa (sección 6.C / matriz de la sección 7) contra el backend real.
13. [ ] Ejecutar la verificación en Node compilado, fuera de Jest, con un script temporal (eliminado inmediatamente después) — confirmar coincidencia exacta con los resultados de Jest para los vectores críticos.
14. [ ] Verificar invariantes: `Object.isExtensible` sobre el `target`/`Proxy` se mantiene `true`; ningún `TypeError` de invariante de `Proxy` inesperado apareció en ningún paso.
15. [ ] Revisar el diff final completo (`git diff`) y `git status --short` — confirmar que únicamente `organizacion-prisma.client.ts` (modificado) y `organizacion-prisma.client.spec.ts` (nuevo) aparecen, sin ningún otro archivo productivo tocado.
16. [ ] Si todos los pasos anteriores se cumplieron sin activar ningún criterio de detención (sección 10): documentar la implementación en `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`.
17. [ ] Si algún criterio de detención se activó en cualquier paso: ejecutar el rollback de la sección 8, y documentar el bloqueo en `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md` con la conclusión "IMPLEMENTACIÓN BLOQUEADA", igual formato que el precedente ya usado para V1.

No se ejecuta este checklist en este documento.

---

## Conclusión

**A) PREIMPLEMENTACIÓN APROBADA.**

Justificación breve: el Diseño V2 dejó cerradas todas las decisiones necesarias (traps a modificar, política de delegación, política de errores, alcance de archivos, clasificación exacta de qué tests requieren el objeto real de Prisma) sin ninguna pregunta abierta que impidiera convertir el diseño en un checklist operativo. Los archivos autorizados (uno productivo, uno de test) fueron confirmados suficientes con respaldo técnico explícito, no asumidos. El checklist resultante es secuencial, verificable paso a paso, e incorpora expresamente la lección metodológica de la Implementación V1 bloqueada (obligar a los vectores críticos de escritura de prototipo a validarse contra el objeto real de Prisma, y a reconfirmarse en Node compilado fuera de Jest, no solo contra un mock en Jest). No se identificó ningún bloqueo ni ninguna necesidad de ajuste adicional al Diseño V2 ya aprobado.

---

## Informe final

- **Archivos autorizados:** `backend/src/prisma/organizacion-prisma.client.ts` (productivo, único); `backend/src/prisma/organizacion-prisma.client.spec.ts` (tests, a crear).
- **Función autorizada:** `bloquearMetodosRawDeNivelSuperior()`.
- **Orden definitivo de implementación:** 12 pasos (sección 3), desde verificar baseline hasta comenzar los tests recién después de confirmar los 11 pasos previos.
- **Cantidad de validaciones previstas inmediatamente tras modificar el código:** 5 (sección 5) — compilación, lint (no aplica), revisión manual del diff, revisión de traps, revisión de delegación.
- **Cantidad de pruebas previstas:** 16 unitarias + 15 de integración + 17 vectores de la matriz de validación (sección 7, que se solapa parcialmente con la validación adversarial de 15+ vectores de la sección 6.C) + verificación en Node compilado — total acumulado consistente con lo ya cerrado en `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`.
- **Criterios de aceptación:** 10, todos binarios (sección 9).
- **Criterios de detención:** 9 (sección 10).
- **Conclusión:** **A) PREIMPLEMENTACIÓN APROBADA.**
- **Documento generado:** `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md` (este documento). Ningún otro documento fue generado ni modificado.
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

No se implementó absolutamente nada. No se modificó código productivo, tests, backend, frontend ni schema. No se generó ningún parche. No se modificó ningún documento anterior.

Me detengo y quedo a la espera de autorización.

# Revisión de Decisiones Técnicas — H-02

Fecha: 2026-07-24. **No implementa ninguna solución, no genera código, no modifica documentación existente, no modifica backend/frontend/tests/schema, no crea migraciones, no genera parches.** Revisa las decisiones de `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` a la luz de la evidencia ya cerrada en `INVESTIGACION_H02_PROTO_SETTER.md` y `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`. No se repite ningún experimento, no se vuelve a validar ningún hecho ya demostrado. Alcance exclusivo: H-02. H-07 permanece completamente fuera de esta revisión.

**Hechos ya demostrados, tomados como punto de partida sin volver a discutirlos:**
1. El bypass mediante lectura del prototipo (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, lectura de `__proto__`) fue correctamente identificado.
2. El cliente devuelto por `prisma.$extends()` está envuelto por `Proxy`s internos de Prisma (`createCompositeProxy`).
3. La implementación prevista bloquea correctamente `Object.getPrototypeOf()`, `Reflect.getPrototypeOf()`, lectura de `__proto__`, `Object.setPrototypeOf()` y `Reflect.setPrototypeOf()`.
4. La escritura mediante `cliente.__proto__ = ...` no queda protegida por la estrategia originalmente aprobada.
5. La causa técnica identificada (el trap `set` de `createCompositeProxy` usa `Reflect.set(target, prop, value)` de 3 argumentos, sin reenviar `receiver`) se usa como supuesto de trabajo confirmado.

---

## 1. Revisión de cada decisión técnica

### 1.1 — Valor de `getPrototypeOf`: `Object.prototype` (Alternativa B)

- **Descripción:** el trap `getPrototypeOf` del `Proxy` externo devuelve siempre `Object.prototype`, en lugar de `null` o del prototipo real.
- **Fundamento original:** misma efectividad de cierre que `null`, pero preserva semántica de objeto ordinario (`instanceof`, `isPrototypeOf`, formato de `util.inspect`) — menor riesgo de regresión y mayor claridad semántica.
- **Impacto de la nueva evidencia:** ninguno. La investigación y la validación de causa raíz se centraron exclusivamente en el vector de **escritura** (`__proto__ =`); el trap `getPrototypeOf` en sí — que gobierna la **lectura** — funcionó exactamente como se diseñó durante toda la Implementación (`IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, sección 5: *"este componente de la corrección no presentó ningún problema"*).
- **¿Sigue siendo válida?** **Sí.**
- **Justificación:** ningún hallazgo de la investigación cuestiona esta decisión ni el razonamiento que la sustenta.

### 1.2 — Tratamiento de `__proto__` (lectura): bloqueado dentro del trap `get` existente

- **Descripción:** el trap `get` ya existente intercepta explícitamente la clave `"__proto__"` y devuelve `Object.prototype`, en lugar de delegar a `target["__proto__"]`.
- **Fundamento original:** `__proto__` se resuelve vía `[[Get]]`, no vía `[[GetPrototypeOf]]` — son mecanismos internos distintos que requieren tratamiento explícito cada uno.
- **Impacto de la nueva evidencia:** ninguno sobre la **lectura** en sí — funcionó correctamente durante toda la Implementación. La investigación posterior confirmó, además, con mayor precisión aún, por qué esta distinción (`[[Get]]` vs. `[[GetPrototypeOf]]`) era necesaria — reforzando, no contradiciendo, el razonamiento original.
- **¿Sigue siendo válida?** **Sí**, para la lectura.
- **Justificación:** la evidencia nueva es enteramente compatible con esta decisión; de hecho, la explica con mayor rigor todavía (`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, sección 1, pasos 1-2).

### 1.3 — Tratamiento de `setPrototypeOf`: lanzar excepción controlada, cubriendo `Object.setPrototypeOf()`/`Reflect.setPrototypeOf()`/`cliente.__proto__ = ...`

- **Descripción:** un único trap `setPrototypeOf`, que lanza siempre una excepción, se documentó como suficiente para cerrar las **3** vías de escritura mencionadas explícitamente en su propio fundamento (`DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, sección 4: *"sin este trap, Object.setPrototypeOf(), Reflect.setPrototypeOf() y `cliente.__proto__ = ...` mutarían el prototipo REAL del target"*).
- **Fundamento original:** lanzar en lugar de devolver `false` para que `Object.setPrototypeOf`/`Reflect.setPrototypeOf` fallen igual de explícitos, sin depender de que el código llamante revise un booleano — razonamiento basado en que las 3 vías invocan, todas, el mismo método interno `[[SetPrototypeOf]]` sobre el mismo objeto (el `Proxy` externo).
- **Impacto de la nueva evidencia:** **directo y central.** `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md` demostró que la premisa de que las 3 vías llegan al mismo trap es **falsa** cuando el objeto envuelto es un `Proxy` interno de Prisma sin propagación correcta de `Receiver`: `Object.setPrototypeOf`/`Reflect.setPrototypeOf` sí invocan `[[SetPrototypeOf]]` directamente sobre el `Proxy` externo (confirmado, funcionan) — pero `cliente.__proto__ = valor` pasa primero por `[[Set]]` sobre el `Proxy` externo, que delega a `target.[[Set]]` (`target` = el `Proxy` interno de Prisma), cuyo propio trap `set` (`createCompositeProxy`) usa `Reflect.set` de 3 argumentos, perdiendo el `Receiver` antes de que la cadena llegue a invocar `[[SetPrototypeOf]]` sobre el `Proxy` externo.
- **¿Sigue siendo válida?** **Parcialmente.**
- **Justificación:** la parte de la decisión que cubre `Object.setPrototypeOf()`/`Reflect.setPrototypeOf()` sigue siendo correcta y no requiere ningún cambio. La parte que **asumía** (sin haberlo verificado empíricamente en su momento) que el mismo trap alcanzaría también a `cliente.__proto__ = ...` queda refutada — no por un error de razonamiento sobre ECMAScript en abstracto (el razonamiento era correcto **para un objeto ordinario**, confirmado en `INVESTIGACION_H02_PROTO_SETTER.md`, sección 1), sino por no haber contemplado que el objeto envuelto pudiera ser, él mismo, un `Proxy` con un trap `set` que no reenvía `receiver`. Esta vía requiere un mecanismo **adicional**, no cubierto por esta decisión tal como está escrita.

### 1.4 — Tratamiento de `constructor`: no bloquear explícitamente

- **Descripción:** no se agrega ningún bloqueo explícito para la clave `"constructor"` — el vector `constructor.prototype` queda cerrado como efecto colateral del `.bind(target)` ya existente en el trap `get`.
- **Fundamento original:** las funciones ligadas (`Function.prototype.bind`) nunca tienen `.prototype` propio, por especificación ECMAScript — mecanismo estable, no requiere tratamiento adicional; bloquear `"constructor"` rompería introspección benigna sin beneficio de seguridad.
- **Impacto de la nueva evidencia:** ninguno. Confirmado explícitamente en `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, sección 8: *"sin cambios respecto del mecanismo original, sigue dando `undefined` (comportamiento heredado, no relacionado con el problema encontrado)"*.
- **¿Sigue siendo válida?** **Sí.**
- **Justificación:** ningún hallazgo de la investigación involucra a `constructor`/`constructor.prototype` de ninguna forma.

### 1.5 — Lista definitiva de métodos SQL bloqueados: sin cambios (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`)

- **Descripción:** los 4 métodos ya identificados, sin ampliación.
- **Fundamento original:** no se identificó ningún método SQL equivalente adicional en la versión real instalada; `Prisma.sql`/`Prisma.raw`/`Prisma.join` no son métodos del cliente, no representan un vector nuevo.
- **Impacto de la nueva evidencia:** ninguno. El hallazgo de esta investigación es un vector de **integridad** (corrupción del objeto real vía `__proto__ =`), no un vector de **exposición de un método SQL adicional** — no hay ninguna relación entre ambos.
- **¿Sigue siendo válida?** **Sí.**
- **Justificación:** el alcance de esta decisión (qué métodos bloquear) es independiente del mecanismo (qué trap los bloquea) — el segundo es lo que necesita ajuste, no el primero.

### 1.6 — Tipo de error: `Error` genérico, mismo patrón que el resto del archivo

- **Descripción:** cualquier bloqueo usa `Error` nativo (no `TypeError` ni una excepción personalizada), con mensaje `[aislamiento] ...`.
- **Fundamento original:** consistencia de estilo con `asegurarSinEscrituraAnidada` y el trap `get` ya existente.
- **Impacto de la nueva evidencia:** ninguno sobre el **principio** — pero deja pendiente una **aplicación nueva**: si se agrega un mecanismo adicional (p. ej., un trap `set` explícito) para cerrar `__proto__ =`, ese mecanismo nuevo también deberá decidir su tipo de error — decisión que, por el mismo principio ya establecido acá, debería ser igualmente `Error` genérico con el mismo patrón, pero que no fue tomada explícitamente para un trap que no se contemplaba en su momento.
- **¿Sigue siendo válida?** **Sí**, como principio general a aplicar a cualquier mecanismo nuevo.
- **Justificación:** no hay ningún motivo, a la luz de la nueva evidencia, para apartarse de este principio — de hecho, aplica con la misma fuerza al mecanismo adicional que se necesitará diseñar.

### 1.7 — Mensaje de error: sin exponer información interna

- **Descripción:** ningún mensaje de error debe incluir nombres de clases internas minificadas de Prisma, estructura del objeto real, etc.
- **Fundamento original:** consistencia con el criterio ya aplicado y confirmado sin hallazgos en H-07.
- **Impacto de la nueva evidencia:** ninguno — de hecho, esta investigación **generó** nueva información interna de Prisma (el nombre del archivo `createCompositeProxy.ts`, el nombre minificado de clase `"t"`, la estructura exacta de 63/19/23/12 propiedades por nivel) que **no debe** filtrarse en ningún mensaje de error productivo — el principio se mantiene y adquiere, si acaso, más relevancia.
- **¿Sigue siendo válida?** **Sí.**
- **Justificación:** sin cambios; aplica igual a cualquier mecanismo nuevo.

### 1.8 — Ubicación exacta del cambio: único archivo, única función (`bloquearMetodosRawDeNivelSuperior()`)

- **Descripción:** todo el mecanismo de corrección vive en `backend/src/prisma/organizacion-prisma.client.ts`, dentro de esa única función.
- **Fundamento original:** mínima superficie de cambio (restricción 7 del Diseño original).
- **Impacto de la nueva evidencia:** **parcial.** Las 3 estrategias más prometedoras identificadas en la sección 6 de este documento (ver abajo) **siguen siendo compatibles** con esta misma ubicación — ninguna de ellas requiere tocar otro archivo. Pero no puede darse por sentado sin evaluarlo explícitamente en la próxima etapa de Diseño: si la estrategia elegida terminara requiriendo, por ejemplo, alguna verificación adicional en `organizacion-prisma.module.ts` (poco probable, pero no descartable a priori), la decisión debería revisarse en ese momento.
- **¿Sigue siendo válida?** **Parcialmente** — el **principio** (mínima superficie) sigue siendo válido y deseable; el **alcance exacto** (un único archivo) es altamente probable que se mantenga, pero queda formalmente pendiente de confirmar en la próxima etapa de Diseño, no en esta revisión.
- **Justificación:** ninguna de las estrategias identificadas en la sección 6 de este documento requiere, hasta donde este análisis puede determinar sin diseñar la solución, tocar un archivo adicional — pero esta revisión no tiene mandato para "elegir" ni "confirmar" una estrategia, por lo que no puede cerrar esta decisión con el mismo grado de certeza que las anteriores.

### 1.9 — Necesidad de tests permanentes: sí (originalmente 8 unitarios + 4 de integración; ampliados a 12 + 6 en Pre-Implementación/Implementación)

- **Descripción:** se decidió que la corrección requiere tests permanentes, distinguiendo unitarios (con `target` controlado, sin conexión real) de integración (contra Postgres real).
- **Fundamento original:** cobertura completa de los vectores del hallazgo, siguiendo el mismo criterio ya aplicado a H-01/H-04.
- **Impacto de la nueva evidencia:** **directo.** `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` (sección 12) documentó que el test unitario de `cliente.__proto__ = valor` **pasó** contra un `target` controlado (una clase ES6 ordinaria, mock), dando una falsa sensación de cobertura — precisamente porque, según confirmó `INVESTIGACION_H02_PROTO_SETTER.md` (sección 8), un objeto ordinario **sí** se comporta como el mecanismo espera; el problema es exclusivo de objetos que, como el cliente real de Prisma, son ellos mismos `Proxy`s con un trap `set` que no reenvía `receiver`. La categorización "unitario = sin conexión real, con mock" resultó **insuficiente** para este vector específico — no porque el test estuviera mal diseñado para lo que efectivamente probaba, sino porque el mecanismo de "aislar sin conexión real" excluyó, sin saberlo en ese momento, justamente la característica del objeto real que causa el problema.
- **¿Sigue siendo válida?** **Parcialmente.**
- **Justificación:** la necesidad de tests permanentes en general sigue siendo válida y necesaria. Pero la estrategia de clasificación (qué vectores pueden validarse con mock y cuáles requieren el objeto real) debe revisarse: como mínimo, el vector `cliente.__proto__ = valor` (y, por prudencia, probablemente también `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, aunque estos sí funcionaron correctamente contra el mock **y** contra el objeto real) deben tener cobertura de test contra el objeto **real** de Prisma, no solo contra un mock — no como reemplazo del test unitario existente, sino como complemento obligatorio.

---

## 2. Decisiones que no cambian

Las siguientes 6 decisiones permanecen **correctas sin modificación**, porque ninguna evidencia de la investigación las contradice, y en varios casos la evidencia nueva las **refuerza**:

- **1.1 — Valor de `getPrototypeOf`: `Object.prototype`.** El vector de lectura del prototipo está completamente resuelto y no depende de ninguna característica interna de Prisma que la investigación haya puesto en duda.
- **1.2 — Tratamiento de `__proto__` (lectura) dentro del trap `get`.** Mismo motivo — la investigación confirma, con mayor detalle todavía, por qué esta distinción era necesaria.
- **1.4 — No bloquear `constructor` explícitamente.** El mecanismo del que depende (comportamiento de `Function.prototype.bind`) es una garantía de especificación, no afectada por nada de lo descubierto.
- **1.5 — Lista de 4 métodos SQL bloqueados.** El hallazgo nuevo es de una clase distinta (integridad, no exposición de un método adicional).
- **1.6 — Tipo de error (`Error` genérico).** Principio general, aplicable también al mecanismo nuevo que se diseñe.
- **1.7 — Mensaje de error sin exponer información interna.** Mismo motivo — principio general reforzado, no contradicho.

**Por qué permanecen válidas, en conjunto:** todas corresponden a partes del mecanismo que operan **antes** o **de forma independiente** del punto exacto donde ocurre la pérdida de `Receiver` (dentro del trap `set` interno de Prisma) — la lectura del prototipo, el manejo de `constructor`, el alcance de los métodos bloqueados, y el estilo de los mensajes de error no interactúan, en ningún punto, con la cadena de `[[Set]]` que resultó ser el origen del problema.

---

## 3. Decisiones que cambian

### 3.1 — Decisión 1.3: tratamiento de `setPrototypeOf`

- **Decisión original:** un único trap `setPrototypeOf` (lanzando excepción) es suficiente para cerrar `Object.setPrototypeOf()`, `Reflect.setPrototypeOf()` **y** `cliente.__proto__ = ...`.
- **Limitación descubierta:** el trap `setPrototypeOf` de un `Proxy` solo se invoca cuando el método interno `[[SetPrototypeOf]]` se invoca **directamente sobre ese `Proxy`**. `cliente.__proto__ = valor` no invoca `[[SetPrototypeOf]]` directamente — invoca `[[Set]]`, que se resuelve a través de una cadena de delegación que, en este caso, pasa por el trap `set` interno de Prisma (`createCompositeProxy`), el cual **no reenvía el `Receiver`** que recibió, rompiendo la cadena antes de que `[[SetPrototypeOf]]` llegue a invocarse sobre nuestro `Proxy` externo.
- **Por qué ya no resulta suficiente:** porque cubre solo 2 de las 3 vías que originalmente pretendía cerrar — la vía más "directa" de invocar el método interno (`Object.setPrototypeOf`/`Reflect.setPrototypeOf`), pero no la vía sintáctica más común y más probable de aparecer en código real (`obj.__proto__ = valor`), que depende de un mecanismo distinto (`[[Set]]`) y de una cadena de delegación vulnerable a comportamientos no estándar de objetos intermedios.
- **Qué característica técnica nueva debe contemplarse:** que el objeto envuelto por nuestro `Proxy` (el resultado de `prisma.$extends()`) es, él mismo, un `Proxy` interno de Prisma, cuyo propio trap `set` no preserva el `Receiver` — cualquier mecanismo de cierre para la vía de escritura debe operar de forma que **no dependa** de que esa cadena de delegación llegue intacta hasta nuestro trap `setPrototypeOf` — debe interceptar el intento **antes** de que la operación se delegue hacia el objeto interno de Prisma.

### 3.2 — Decisión 1.9: estrategia de testing (clasificación unitario/mock vs. integración/real)

- **Decisión original:** los tests unitarios pueden validarse contra un `target` controlado (mock), sin conexión real, para todos los vectores del hallazgo.
- **Limitación descubierta:** un mock basado en un objeto JavaScript ordinario (por ejemplo, una instancia de clase ES6) **no reproduce** la característica específica del objeto real de Prisma (ser, él mismo, un `Proxy` con un trap `set` que no reenvía `receiver`) que causa el fallo del mecanismo para la vía `__proto__ =`. El test unitario existente pasó sin detectar el problema real.
- **Por qué ya no resulta suficiente:** porque, para el vector específico de escritura vía `__proto__`, "sin conexión real" y "representativo del objeto real" resultaron ser objetivos **en tensión** — el mock más simple y más rápido de construir (un objeto ordinario) es, precisamente, el que no reproduce el comportamiento problemático.
- **Qué característica técnica nueva debe contemplarse:** que la validación de cualquier mecanismo que dependa de la identidad/comportamiento del objeto envuelto por nuestro `Proxy` debe, como mínimo para los vectores de escritura de prototipo, ejecutarse contra el objeto **real** devuelto por `prisma.$extends()` (no necesariamente contra el backend completo con Postgres — el propio `INVESTIGACION_H02_PROTO_SETTER.md` demostró que alcanza con `prisma.$extends({ name: "..." })`, una extensión mínima, sin necesitar los 14 hooks del proyecto ni datos reales) — pero sí contra el objeto Proxy real de Prisma, no contra un sustituto ordinario.

---

## 4. Supuestos invalidados

### 4.1 — "`cliente.__proto__ = valor` invoca el mismo método interno `[[SetPrototypeOf]]` que `Object.setPrototypeOf`/`Reflect.setPrototypeOf`, sobre el mismo objeto"

- **Cuál era el supuesto:** que las 3 formas de intentar cambiar el prototipo de `cliente` terminan, todas, invocando `cliente.[[SetPrototypeOf]]()` — es decir, disparando el mismo trap.
- **Por qué parecía razonable:** porque, para **cualquier objeto ordinario**, esto es exactamente lo que exige la especificación ECMAScript (confirmado formalmente en `INVESTIGACION_H02_PROTO_SETTER.md`, secciones 5-6: el setter de `__proto__`, por Anexo B.3.1, siempre delega a `[[SetPrototypeOf]]` sobre el `Receiver` correcto, y `OrdinarySet` preserva ese `Receiver` sin modificarlo a través de toda la cadena de prototipos). No era un supuesto arbitrario ni descuidado — era el comportamiento por defecto, documentado y exigido por el lenguaje, para el caso general.
- **Qué evidencia lo invalida:** `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, secciones 6-7 — el objeto envuelto (`ext`, resultado de `$extends()`) es él mismo un `Proxy`, y su propio trap `set` (código fuente citado literalmente de `createCompositeProxy.ts`) usa `Reflect.set(target, prop, value)` de 3 argumentos, rompiendo la propagación del `Receiver` antes de que la cadena llegue a nuestro trap `setPrototypeOf`.
- **Impacto sobre H-02:** es el supuesto cuya invalidación motivó toda esta cadena de investigación — directamente responsable de que la Implementación quedara bloqueada (`IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`) y de que se necesite una decisión técnica adicional (sección 3.1 de este documento).

### 4.2 — "Un `target` de control (objeto JavaScript ordinario) es representativo del objeto real de Prisma para efectos de testear el mecanismo de `Proxy`"

- **Cuál era el supuesto:** que el mecanismo de bloqueo (nuestro `Proxy`, con sus traps) es agnóstico de qué objeto envuelve — que su corrección puede validarse igual de bien contra cualquier `target`, real o simulado.
- **Por qué parecía razonable:** porque, en principio, la lógica de **nuestros propios traps** (comparar la clave contra una lista, lanzar o no) no depende de ninguna característica especial del `target` — y eso sigue siendo cierto para los traps `get`/`getPrototypeOf`. El supuesto fallaba específicamente para `[[Set]]`, un método interno cuyo comportamiento **si** depende de las características del objeto delegado (si es o no un `Proxy`, y cómo implementa sus propios traps).
- **Qué evidencia lo invalida:** la discrepancia documentada entre el test unitario (con mock, pasó) y la validación adversarial (con objeto real, falló) — explicada en detalle en `INVESTIGACION_H02_PROTO_SETTER.md`, sección 8.
- **Impacto sobre H-02:** exige revisar la estrategia de testing (sección 3.2 de este documento) antes de dar por válida cualquier futura implementación.

### 4.3 — "El `target` que envuelve nuestro `Proxy` es un objeto ordinario, sin traps propios que puedan interferir"

- **Cuál era el supuesto:** implícito en el análisis de invariantes del `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md` original (sección 1 de ese documento), que verificó `Object.isExtensible(target)` pero no consideró la posibilidad de que `target` fuera, él mismo, un objeto exótico con comportamiento de `[[Set]]` no estándar.
- **Por qué parecía razonable:** porque el análisis de invariantes de `Proxy` (target extensible o no) es, en sí mismo, correcto y suficiente para los traps `getPrototypeOf`/`get` — el supuesto no era erróneo para esos dos traps, solo resultó incompleto para `setPrototypeOf`/`[[Set]]`, un ángulo que no formaba parte de las preguntas que ese documento se planteó en su momento.
- **Qué evidencia lo invalida:** la confirmación directa, con `util.inspect({showProxy:true})`, de que tanto `prisma` como el resultado de `$extends()` son, ellos mismos, `Proxy`s (`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, sección 4).
- **Impacto sobre H-02:** cualquier análisis futuro de invariantes de `Proxy` para este mecanismo debe considerar explícitamente la posibilidad de `Proxy`s anidados, no solo la extensibilidad de un objeto ordinario.

---

## 5. Restricciones nuevas

Restricciones técnicas que no existían (ni podían formularse) durante el Diseño original de la corrección de H-02:

- **Proxy sobre Proxy:** cualquier mecanismo de protección debe funcionar correctamente incluso cuando el objeto envuelto es, él mismo, un `Proxy` — no puede asumirse, como sí se hacía implícitamente antes, que el `target` es siempre un objeto ordinario cuyo comportamiento de reflexión sigue fielmente los algoritmos estándar de `OrdinarySet`/`OrdinaryGet`.
- **Comportamiento interno de Prisma:** el mecanismo de `createCompositeProxy` de Prisma tiene comportamientos específicos (como la pérdida de `Receiver` en su trap `set`) que no están documentados públicamente como una garantía o característica formal de la librería (`VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, sección 7: no se encontró ningún issue oficial que lo mencione) — cualquier solución no debe depender de que este comportamiento se mantenga exactamente igual en futuras versiones de Prisma, ni debe asumir que es "intencional" o "estable" en ningún sentido garantizado.
- **Propagación del `receiver`:** ya no puede asumirse que el `Receiver` de una operación `[[Set]]` se propaga correctamente a través de **todas** las capas de `Proxy` involucradas — solo puede garantizarse la propagación correcta dentro de la capa que el propio proyecto controla (nuestro `Proxy`); cualquier capa fuera de nuestro control (como el `Proxy` interno de Prisma) puede romper esa propagación sin que el motor de JavaScript lo señale de ninguna forma (no hay ningún `TypeError` ni advertencia — la operación simplemente "tiene éxito" sobre un objeto distinto del esperado).
- **Límites de interceptación:** nuestro `Proxy` solo puede interceptar de forma confiable las operaciones que se resuelven **directamente sobre él** (`[[Get]]`, `[[GetPrototypeOf]]`, `[[SetPrototypeOf]]` cuando se invocan explícitamente) — no puede depender de que una operación que se resuelve indirectamente (`[[Set]]` delegando hacia `[[SetPrototypeOf]]` a través de una cadena de prototipos) "llegue" intacta hasta él si un objeto intermedio, fuera de nuestro control, la intercepta antes.
- **Compatibilidad con ECMAScript:** cualquier mecanismo elegido sigue debiendo respetar las invariantes de `Proxy` ya analizadas (target extensible, valores de retorno válidos para cada trap) — esto no cambia — pero además debe evitar asumir garantías que ECMAScript **no** ofrece, como que el `Receiver` se preserve a través de traps arbitrarios de terceros (algo que la especificación permite romper, no lo prohíbe).

---

## 6. Estrategias posibles (sin elegir, sin implementar)

### Estrategia 1 — Trap `set` explícito en el `Proxy` externo, interceptando `"__proto__"` directamente

- **Descripción:** agregar un trap `set(target, prop, value, receiver)` al mismo `handler` ya existente, que rechace (lance) explícitamente cuando `prop === "__proto__"`, **antes** de delegar cualquier cosa a `target`.
- **Ventajas:** intercepta el intento en el punto más externo posible de la cadena — no depende de que la operación se propague correctamente a través de ninguna capa interna de Prisma; cierra el vector de raíz sin necesitar que Prisma "coopere" de ninguna forma.
- **Riesgos:** hay que asegurar que el trap `set` no bloquee ninguna escritura legítima de propiedad sobre el cliente — a confirmar en la etapa de Diseño si existe algún caso real de asignación directa de propiedades sobre el cliente organizacional (no detectado hasta ahora en el código del proyecto, que solo invoca métodos, no asigna propiedades).
- **Complejidad:** baja-media — mismo patrón ya usado para las 4 claves raw, extendido a una clave más, en un trap nuevo.
- **Compatibilidad con Prisma:** alta — no depende de ningún detalle interno de Prisma, opera enteramente en la capa del `Proxy` propio del proyecto.
- **Compatibilidad con NestJS:** sin impacto esperado.
- **Impacto esperado:** cierre completo y robusto del vector de escritura, incluso si Prisma cambiara su implementación interna en el futuro.
- **Necesidad de cambios arquitectónicos:** no.

### Estrategia 2 — Combinación: mantener `setPrototypeOf` + agregar el trap `set` de la Estrategia 1

- **Descripción:** conservar el trap `setPrototypeOf` ya implementado y validado (cierra `Object.setPrototypeOf`/`Reflect.setPrototypeOf`), y agregar el trap `set` de la Estrategia 1 como mecanismo independiente para `__proto__ =`.
- **Ventajas:** las mismas de la Estrategia 1, más una capa de defensa adicional (si en el futuro alguna vía llegara a invocar `[[SetPrototypeOf]]` directamente sobre el `Proxy` externo, sigue estando cubierta); no se descarta trabajo ya hecho y ya validado para 2 de las 3 vías originales.
- **Riesgos:** mínimos — 2 mecanismos independientes, sin conflicto entre sí (cada uno cubre un método interno distinto: `[[Set]]` vs. `[[SetPrototypeOf]]`).
- **Complejidad:** baja-media, ligeramente superior a la Estrategia 1 (un trap más, aunque ya construido en la implementación bloqueada, solo hay que retenerlo).
- **Compatibilidad con Prisma / NestJS:** igual que la Estrategia 1.
- **Impacto esperado:** mismo cierre que la Estrategia 1, con redundancia (defensa en profundidad) sin costo adicional relevante.
- **Necesidad de cambios arquitectónicos:** no.

### Estrategia 3 — Restringir la extensibilidad del `target` real (`Object.preventExtensions`/`freeze`/`seal`) antes de envolverlo

- **Descripción:** aplicar una restricción de extensibilidad sobre el objeto real devuelto por `$extends()`, de forma que la invariante de `[[SetPrototypeOf]]` para objetos no extensibles (solo permite mantener el mismo prototipo) rechace cualquier intento, sin importar sobre qué objeto termine aterrizando el `Receiver` perdido.
- **Ventajas:** cierra el vector "por definición del lenguaje", sin depender de ningún trap adicional propio.
- **Riesgos:** **altos** — no se sabe si Prisma depende de poder seguir modificando ese objeto en tiempo de ejecución (agregar propiedades, etc.); mismo tipo de riesgo ya identificado y descartado para la Estrategia D del `DISEÑO_CORRECCION_H02_BLOQUE11.md` original (mutar/restringir el objeto real compartido) — requeriría verificación empírica exhaustiva antes de poder considerarse viable.
- **Complejidad:** baja en líneas de código, alta en riesgo oculto no proporcional a esa simplicidad.
- **Compatibilidad con Prisma:** incierta y potencialmente riesgosa.
- **Compatibilidad con NestJS:** sin impacto directo, pero cualquier ruptura de Prisma afectaría toda la aplicación.
- **Impacto esperado:** cierre completo en teoría, con riesgo de regresión funcional no cuantificado.
- **Necesidad de cambios arquitectónicos:** no, pero alto riesgo de romper algo no relacionado.

### Estrategia 4 — Wrapper explícito (allowlist) en reemplazo completo del `Proxy`

- **Descripción:** misma Estrategia C ya descartada en el `DISEÑO_CORRECCION_H02_BLOQUE11.md` original, reconsiderada a la luz de la nueva evidencia — construir un objeto compuesto manualmente que nunca exponga ninguna referencia navegable al objeto real, eliminando la dependencia de que cualquier operación de reflexión "llegue" correctamente a un trap.
- **Ventajas:** elimina la clase entera de vulnerabilidad — la pérdida de `Receiver` a través de `Proxy`s anidados deja de ser relevante porque no hay ningún `Proxy` intermedio del cual depender.
- **Riesgos:** mismo riesgo ya documentado en el Diseño original — alto esfuerzo, alto riesgo de regresión al reimplementar 14 operaciones × ~22 modelos organizacionales.
- **Complejidad:** alta — la mayor de las 5 estrategias.
- **Compatibilidad con Prisma:** incierta (mismo motivo ya documentado).
- **Compatibilidad con NestJS:** sin impacto esperado.
- **Impacto esperado:** cierre completo y robusto, al costo de la mayor complejidad y el mayor riesgo de regresión de todas las alternativas.
- **Necesidad de cambios arquitectónicos:** sí — reemplazo completo del mecanismo actual.

### Estrategia 5 — Solo revisión de código/lint (referencia, ya descartada)

- **Descripción:** igual que la Estrategia E ya descartada en el Diseño original — no cierra nada en tiempo de ejecución.
- **Estado:** descartada por el mismo motivo ya documentado; la nueva evidencia, si acaso, refuerza por qué es insuficiente — el vector resultó ser más sutil de lo que ya se pensaba (ni siquiera un test unitario cuidadosamente escrito lo detectó).

---

## 7. Matriz comparativa

| Estrategia | Cobertura del bypass | Compatibilidad con Prisma | Riesgo de regresión | Complejidad | Mantenibilidad | Impacto sobre rendimiento | Impacto sobre transacciones | Facilidad de validación |
|---|---|---|---|---|---|---|---|---|
| 1 — Trap `set` explícito para `__proto__` | Completa (vía escritura) | Alta | Bajo | Baja-media | Buena | Despreciable | Ninguno (mismo argumento ya usado: no toca `tx`) | Alta — test determinístico y directo |
| 2 — `setPrototypeOf` + trap `set` combinados | Completa + redundante | Alta | Bajo | Baja-media | Buena | Despreciable | Ninguno | Alta |
| 3 — Restringir extensibilidad del `target` real | Completa en teoría | Incierta / riesgosa | **Alto** | Baja (líneas) / alta (riesgo oculto) | Mala | Despreciable | Riesgo desconocido si Prisma comparte el mismo `target` internamente | Difícil — requiere verificación exhaustiva de toda la superficie de Prisma |
| 4 — Wrapper explícito (allowlist) | Completa y robusta | Incierta | **Alto** | **Alta** | Mala (duplica trabajo por modelo nuevo) | Incierto, potencialmente peor | Requiere reimplementar el manejo de `tx` explícitamente | Compleja — mucha superficie nueva a cubrir |
| 5 — Solo lint/revisión de código | Nula en runtime | No aplica | Alto (deja expuesto) | Baja | Buena, pero irrelevante | No aplica | No aplica | No aplica — no cierra nada que validar |

---

## 8. Recomendación técnica

**Estrategia 2 (combinación: mantener `setPrototypeOf` ya validado + agregar el trap `set` explícito para `"__proto__"`) merece pasar a una futura etapa de Diseño.**

Justificación exclusivamente técnica:
- Es la única estrategia, junto con la 1, que cierra el vector de raíz sin depender de ningún comportamiento interno de Prisma que esté fuera del control del proyecto — no requiere que Prisma "coopere" con la propagación de `Receiver`, ni asume nada sobre versiones futuras de `createCompositeProxy`.
- Frente a la Estrategia 1 sola, la Estrategia 2 conserva el trabajo ya construido y ya validado (el trap `setPrototypeOf`, que funciona correctamente para `Object.setPrototypeOf`/`Reflect.setPrototypeOf`) — descartarlo sería desperdiciar una pieza que ya demostró funcionar, sin ninguna ganancia a cambio; mantenerlo agrega una capa de defensa en profundidad sin costo de complejidad ni de riesgo adicional relevante.
- Frente a las Estrategias 3 y 4, tiene un riesgo de regresión sustancialmente menor (no toca ni el objeto real de Prisma ni requiere una reescritura mayor) y una complejidad mucho más baja, sin sacrificar cobertura del bypass.
- Es la de mayor facilidad de validación — un test unitario directo (`cliente.__proto__ = valor` debe lanzar) puede confirmar el cierre sin ambigüedad, sin depender de inferencias indirectas.
- Mantiene la restricción de mínima superficie de cambio (decisión 1.8, sección 1 de este documento) — sigue siendo, según todo lo analizado hasta ahora, compatible con modificar únicamente `bloquearMetodosRawDeNivelSuperior()`.

No se implementa esta recomendación en este documento — queda para la etapa de Diseño correspondiente.

---

## 9. Riesgos

- **Riesgos residuales:** no se ha verificado, en ninguna etapa hasta ahora, si existen **otras** vías de escritura de prototipo no contempladas (por ejemplo, `Reflect.defineProperty(cliente, "__proto__", {...})` con un descriptor que intente redefinir la propiedad, en lugar de asignarla) — aunque `"__proto__"` no es, por especificación, una propiedad redefinible de esa forma en el caso general, esto merece una verificación explícita en la próxima etapa de Diseño, no asumirse por descarte.
- **Riesgos de regresión:** bajos para las Estrategias 1/2 (recomendadas), altos para las Estrategias 3/4 — ya cuantificado en la matriz comparativa (sección 7).
- **Riesgos para Prisma:** ninguno directo si se opta por las Estrategias 1/2 (no se toca ningún objeto de Prisma); alto si se optara por la Estrategia 3 (restringir extensibilidad del objeto real).
- **Riesgos para futuras actualizaciones:** el comportamiento exacto de `createCompositeProxy` (uso de `Reflect.set` de 3 argumentos) podría cambiar en versiones futuras de `@prisma/client` — para mejor (si Prisma empezara a reenviar el `Receiver` correctamente, lo cual haría innecesaria, aunque no dañina, la Estrategia 1/2) o, en teoría, de forma distinta pero igualmente no conforme. Cualquier solución elegida no debe asumir el comportamiento actual como permanente; debe reverificarse en cada actualización de Prisma — mismo criterio de mantenimiento ya aplicado al resto de H-02 en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` y `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`.
- **Riesgos de mantenimiento:** bajos para las Estrategias 1/2 (mismo archivo, mismo patrón ya usado en el resto del mecanismo); altos para las Estrategias 3/4 (riesgo oculto no proporcional en la 3; duplicación de trabajo por cada modelo nuevo en la 4).

---

## 10. Plan propuesto (solo enumerar etapas, no ejecutarlas)

En el orden recomendado:

1. **Diseño de la corrección de H-02 (nueva iteración)** — evaluar formalmente las estrategias de la sección 6 de este documento (comparativa ya hecha acá; el Diseño debe formalizar la selección con el mismo rigor que el Diseño original, incluyendo las restricciones nuevas de la sección 5).
2. **Decisiones Técnicas de la corrección (nueva iteración)** — cerrar los detalles de implementación del mecanismo elegido (mensaje de error exacto del nuevo trap, si corresponde; confirmación final de que la ubicación sigue siendo un único archivo).
3. **Pre-Implementación (nueva iteración)** — checklist actualizado, incorporando explícitamente que los tests de escritura de prototipo deben validarse contra el objeto real de `$extends()`, no solo contra un mock (decisión 3.2 de este documento).
4. **Implementación (nueva iteración)** — codificar el mecanismo, con el mismo estándar de evidencia ya usado en el resto de Bloque 11.
5. **Nueva Auditoría Adversarial específica de H-02** — repetir los 12 vectores ya usados en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` (sección 6), más los nuevos vectores confirmados en esta cadena de investigación (`__proto__ =`, y cualquier otro que la etapa de Diseño identifique como riesgo residual).
6. **Documento de cierre correspondiente** (Revisión de Implementación / Validación Funcional / Acta, según corresponda), una vez que la Auditoría Adversarial quede sin hallazgos.

No se ejecuta ninguna de estas etapas en este documento.

---

## Conclusión

**B) Las decisiones técnicas requieren una revisión parcial.**

Justificación: de las 9 decisiones revisadas, **6 permanecen completamente válidas sin ningún cambio** (getPrototypeOf, tratamiento de lectura de `__proto__`, tratamiento de `constructor`, lista de métodos SQL, tipo de error, mensaje de error) — la estrategia general (`Proxy` con traps adicionales sobre el mecanismo ya existente) sigue siendo, en principio, la correcta, y no hay ningún indicio de que deba abandonarse. Pero **2 decisiones requieren un cambio real, no cosmético** (el mecanismo para cerrar `setPrototypeOf`/`__proto__ =`, y la estrategia de testing que debe validar ese mecanismo contra el objeto real de Prisma) y **1 decisión queda pendiente de reconfirmar** (el alcance exacto de "único archivo", altamente probable que se mantenga pero no formalmente cerrado por esta revisión). Esto excede lo que razonablemente se llamaría "ajustes menores" (opción A) — se descubrió un supuesto técnico concreto que resultó falso, con una causa raíz específica que amerita una nueva decisión de diseño, no una simple corrección de redacción. Al mismo tiempo, está muy lejos de una "reformulación completa" (opción C) — no hay ningún cuestionamiento sobre la arquitectura general elegida (`Proxy`), sobre el archivo/función donde vive el mecanismo, ni sobre 6 de las 9 decisiones ya tomadas; el problema está acotado con precisión a un único punto (la vía de escritura del prototipo) con una solución candidata ya identificada y recomendada (Estrategia 2, sección 8) que no requiere ningún cambio arquitectónico.

---

## Informe final

- **Cantidad de decisiones revisadas:** 9 (todas las de `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`).
- **Decisiones que permanecen válidas sin cambios:** 6 — valor de `getPrototypeOf` (Object.prototype), tratamiento de lectura de `__proto__`, tratamiento de `constructor`, lista de 4 métodos SQL bloqueados, tipo de error (`Error` genérico), mensaje de error sin exponer información interna.
- **Decisiones que cambian:** 2 — tratamiento de `setPrototypeOf` (la premisa de que cubre también `__proto__ =` es falsa, requiere mecanismo adicional) y estrategia de testing (los vectores de escritura de prototipo deben validarse contra el objeto real de Prisma, no solo contra un mock). 1 decisión adicional (ubicación exacta del cambio) queda parcialmente pendiente de reconfirmar, sin evidencia que la contradiga hasta ahora.
- **Supuestos invalidados:** 3 — (1) que las 3 vías de escritura de prototipo invocan el mismo trap `setPrototypeOf`; (2) que un `target` de control ordinario es representativo del objeto real de Prisma para efectos de testing; (3) que el `target` envuelto por nuestro `Proxy` es siempre un objeto ordinario sin traps propios.
- **Nuevas restricciones identificadas:** 5 — Proxy sobre Proxy; comportamiento interno de Prisma no garantizado ni documentado; propagación del `receiver` no garantizada a través de capas fuera de control del proyecto; límites de interceptación (operaciones indirectas pueden ser absorbidas antes de llegar a nuestro trap); compatibilidad con ECMAScript (no asumir garantías que la especificación no ofrece).
- **Cantidad de estrategias consideradas:** 5 (4 nuevas + 1 de referencia ya descartada previamente, reconsiderada por completitud).
- **Estrategia recomendada para una futura etapa de Diseño:** Estrategia 2 — mantener el trap `setPrototypeOf` ya validado + agregar un trap `set` explícito que intercepte directamente la clave `"__proto__"` en el `Proxy` externo, sin depender de la propagación de `Receiver` a través de las capas internas de Prisma.
- **Riesgos principales:** riesgo residual de vías de escritura de prototipo no exploradas todavía (a verificar en Diseño); riesgo de que el comportamiento de `createCompositeProxy` cambie en versiones futuras de Prisma (mitigado por reverificación en cada actualización, mismo criterio ya aplicado al resto de H-02); ningún riesgo directo sobre Prisma ni sobre transacciones para la estrategia recomendada.
- **Documento generado:** `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md` (este documento). Ningún otro documento fue generado.
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

No se implementó ninguna solución. No se generó código. No se modificó ninguna documentación existente. No se modificó ningún archivo del proyecto en ningún momento de esta etapa.

Me detengo y quedo a la espera de autorización.

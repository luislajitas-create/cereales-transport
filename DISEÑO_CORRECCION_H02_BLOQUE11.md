# Diseño de Corrección — H-02: Bypass del Proxy mediante `Object.getPrototypeOf()`

Fecha: 2026-07-24. **No implementa, no modifica código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no modifica tests, no genera parches, no actualiza documentación existente, no hace `git add`/`commit`/`push`.** Se basa exclusivamente en `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` y `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md` — no se generó evidencia nueva, no se reabrió la auditoría, no se ejecutó ninguna prueba en esta etapa.

---

## Objetivo funcional

Definir una solución que elimine completamente el bypass confirmado en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` (sección 6, hallazgo 6.3-6.6) — acceso a `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe` vía `Object.getPrototypeOf(clienteInyectado)` y mecanismos equivalentes — sin modificar ningún comportamiento funcional legítimo del sistema, en particular sin afectar `$transaction` (en sus dos formas) ni los 2 usos legítimos de `tx.$queryRaw` ya en producción.

---

## Restricciones obligatorias (heredadas de `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`)

1. Eliminar el bypass mediante `Object.getPrototypeOf()` y cualquier mecanismo equivalente que permita acceder al `PrismaClient` original.
2. No romper `$transaction(callback)` ni `$transaction(array)`.
3. No romper `tx.$queryRaw`/`tx.$executeRaw`/`tx.$queryRawUnsafe`/`tx.$executeRawUnsafe` cuando se usan legítimamente dentro de una transacción.
4. No modificar el comportamiento del `PrismaClient` estándar.
5. No introducir incompatibilidades con futuras versiones razonables de Prisma.
6. No degradar significativamente el rendimiento.
7. Mantener la menor superficie posible de cambios.
8. Mantener la legibilidad del código.
9. Evitar soluciones "mágicas" o difíciles de mantener.

---

## Alternativas

Las 5 estrategias ya identificadas en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` (H-02, punto 8), analizadas acá con el detalle adicional pedido para esta etapa de diseño.

### Estrategia A — Cobertura del trap `getPrototypeOf` (con tratamiento explícito de `__proto__`)

- **Descripción:** agregar el trap `getPrototypeOf` al mismo objeto `handler` que ya define `get` en `bloquearMetodosRawDeNivelSuperior()`, devolviendo un valor saneado en lugar de delegar por defecto al `target`; y extender la lógica ya existente del trap `get` para que, cuando la clave solicitada sea `"__proto__"`, devuelva ese mismo valor saneado en lugar de `target["__proto__"]`.
- **Funcionamiento:** por especificación ECMA-262 (ya citada en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, H-02 pregunta 2), cualquier operación que invoque el método interno `[[GetPrototypeOf]]` de un `Proxy` (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, y cualquier mecanismo interno del motor que dependa de la cadena de prototipos de este objeto específico) pasa ahora por el trap definido, en vez de delegar directamente al `target`. `__proto__` es, en cambio, una propiedad de acceso heredada de `Object.prototype` — su lectura dispara el trap `get` **ya existente** (confirmado empíricamente en el Análisis Técnico), así que basta con agregar su clave a la lógica de intercepción que ese trap ya tiene, sin necesitar un trap adicional distinto para cubrirla.
- **Ventajas:** cierra exactamente los 2 mecanismos distintos confirmados como explotables por ejecución real (`getPrototypeOf`/`Reflect.getPrototypeOf` por un lado, `__proto__` por otro); no toca ningún objeto real de Prisma (ni `clienteExtendido`, ni su prototipo, ni `tx`) — opera enteramente sobre la capa de `Proxy` que el propio proyecto ya construye; cambio ubicado íntegramente en el mismo archivo, mismo patrón que el trap `get` ya existente.
- **Desventajas:** no cierra, por sí sola, los vectores de introspección puramente informativos ya identificados en la Auditoría Adversarial (hallazgos 6.10-6.11: operador `in`, `Object.keys`) — quedarían exactamente igual que hoy, sin ningún cambio, deliberadamente fuera de alcance.
- **Riesgos:** posible que algún mecanismo interno de NestJS, de alguna librería de logging/depuración, o de una herramienta de inspección no identificada dependa de poder leer el prototipo real del objeto inyectado — no se detectó ningún caso así en el código del proyecto (búsqueda exhaustiva ya documentada en el Análisis Técnico), pero no puede descartarse con certeza absoluta sin la verificación empírica que corresponde a una etapa posterior (Pre-Implementación/Implementación), no a este diseño.
- **Compatibilidad con Prisma:** alta — no depende de ningún detalle interno de cómo Prisma implementa `$extends()` más allá de lo ya verificado (que los 4 métodos raw viven en el prototipo, no como propiedades propias del objeto extendido); una actualización futura de Prisma no debería alterar el comportamiento del trap en sí, aunque sí amerita reverificar, ante cada actualización, que esa premisa siga siendo cierta.
- **Impacto sobre rendimiento:** despreciable — `getPrototypeOf` no es una operación de uso frecuente en el código del proyecto (0 usos confirmados por búsqueda exhaustiva); el costo adicional en el trap `get` es una comparación de string más contra un valor ya conocido, del mismo orden que las 4 comparaciones que ya existen.
- **Impacto sobre mantenibilidad:** bajo — la lógica de bloqueo queda concentrada en el mismo `handler`, mismo criterio (mensaje de error consistente, mismo prefijo `[aislamiento]`) ya usado para los 4 métodos raw actuales.
- **Complejidad de implementación:** baja.
- **Complejidad de auditoría futura:** baja — un futuro auditor revisa el mismo `handler` (ahora con 2 traps en vez de 1, más una rama adicional dentro del trap `get`) para confirmar la cobertura, sin tener que razonar sobre un mecanismo nuevo o distinto al ya documentado.

### Estrategia B — Cobertura completa de membrana (A + `has`, `ownKeys`, `getOwnPropertyDescriptor`, `setPrototypeOf`)

- **Descripción:** además de todo lo de la Estrategia A, sobreescribir `has` (para que `"$queryRaw" in x` devuelva `false`), `ownKeys` (para que `Object.keys`/`for...in`/`JSON.stringify` no listen las 4 claves bloqueadas), `getOwnPropertyDescriptor` (consistente con lo anterior), y `setPrototypeOf` (para impedir reasignar el prototipo del objeto envuelto).
- **Funcionamiento:** cada trap adicional filtra las 4 claves bloqueadas de lo que el comportamiento por defecto expondría, replicando en cada uno el mismo criterio de lista de bloqueo ya usado en `get`.
- **Ventajas:** cierre "estético" completo — ningún mecanismo de reflexión, ni siquiera los puramente informativos, revelaría la existencia de los métodos bloqueados.
- **Desventajas:** mayor superficie de código (5-6 traps en vez de 2); los traps `ownKeys`/`getOwnPropertyDescriptor` están sujetos a **invariantes de `Proxy` verificadas por el motor** (por ejemplo, el resultado de `ownKeys` debe ser consistente con lo que `getOwnPropertyDescriptor` reporta para claves no configurables) — implementarlos de forma incompleta o inconsistente puede provocar un `TypeError` en tiempo de ejecución ante ciertas operaciones reflexivas, exactamente el tipo de "solución mágica y frágil" que la restricción 9 pide evitar; cierra vectores que la propia Auditoría Adversarial ya clasificó como **sin impacto práctico** (hallazgos 6.10-6.11: no aportan invocación, solo listado/enumeración), por lo que el costo y el riesgo adicional no se corresponden con una reducción de riesgo real proporcional.
- **Riesgos:** riesgo medio-alto de introducir errores sutiles de invariantes de `Proxy` — categoría de bug difícil de detectar sin ejercitar exhaustivamente cada combinación de operación reflexiva sobre el objeto, incluyendo las que use internamente Node/V8 en operaciones no obvias (serialización, depuración, algunas formas de clonado).
- **Compatibilidad con Prisma:** alta en principio (mismo razonamiento que A), pero con más superficie de código que podría chocar con algún uso interno de reflexión sobre el objeto no identificado hasta ahora.
- **Impacto sobre rendimiento:** despreciable, mismo razonamiento que A.
- **Impacto sobre mantenibilidad:** media — más traps que mantener sincronizados entre sí; si en el futuro se agrega un 5.º método a bloquear, hay que tocar consistentemente varios traps en vez de uno solo.
- **Complejidad de implementación:** media.
- **Complejidad de auditoría futura:** media-alta — un auditor futuro debe verificar la consistencia de 5-6 traps distintos entre sí, no solo la cobertura de 1-2.

### Estrategia C — Wrapper explícito (allowlist) en reemplazo del `Proxy`

- **Descripción:** reemplazar el mecanismo de `Proxy` por un objeto/clase construido manualmente que delega explícitamente, uno por uno, cada método y cada delegado de modelo permitido, sin exponer nunca una referencia al objeto real ni a su prototipo.
- **Funcionamiento:** en vez de interceptar accesos sobre un objeto real envuelto, el wrapper define de antemano, de forma estática, la superficie completa permitida — cualquier cosa no declarada explícitamente simplemente no existe en el objeto resultante.
- **Ventajas:** elimina la clase entera de vulnerabilidad — no depende de qué traps de reflexión se cubran o se olviden, porque no hay ningún objeto real alcanzable desde fuera para reflexionar sobre él.
- **Desventajas:** requiere reimplementar/delegar explícitamente cada una de las 14 operaciones de primer nivel × ~22 modelos organizacionales que el cliente expone hoy automáticamente vía `$allModels` — cambio de fondo, no incremental, con alto riesgo de introducir regresiones sutiles de comportamiento en cualquiera de los métodos re-implementados.
- **Riesgos:** alto esfuerzo, alta probabilidad de discrepancias de comportamiento entre el wrapper manual y lo que Prisma realmente hace internamente (tipos de retorno, manejo de errores, comportamiento ante argumentos límite) para cada uno de los métodos reimplementados.
- **Compatibilidad con Prisma:** incierta — depende de si Prisma expone una forma estable de enumerar/delegar programáticamente todos sus modelos sin depender de la extensión de tipos actual; no evaluado (evaluarlo sería, en sí mismo, trabajo de diseño adicional no cubierto por este documento).
- **Impacto sobre rendimiento:** potencialmente peor si la delegación explícita agrega capas adicionales de indirección por cada llamada, aunque no necesariamente significativo en términos absolutos.
- **Impacto sobre mantenibilidad:** malo — cada modelo nuevo agregado a `ORGANIZACIONAL_MODELS` requeriría además una entrada explícita en el wrapper, duplicando trabajo que hoy resuelve automáticamente `$allModels` de la extensión de Prisma.
- **Complejidad de implementación:** alta — la de mayor esfuerzo de las 5 alternativas.
- **Complejidad de auditoría futura:** alta — superficie de código mucho mayor a revisar, y cada actualización de Prisma obligaría a revisar si la forma de delegación manual sigue siendo fiel al comportamiento real.

### Estrategia D — Eliminar/reasignar `$queryRaw` etc. directamente sobre el prototipo compartido

- **Descripción:** ejecutar `delete Object.getPrototypeOf(cliente).$queryRaw` (y equivalente para los otros 3 métodos) una vez, al construir el cliente, en lugar de agregar traps de intercepción.
- **Funcionamiento:** mutaría directamente el objeto prototipo real, eliminando las propiedades heredadas en su origen, antes de que el `Proxy` (u otro mecanismo) llegue a envolver nada.
- **Ventajas:** cerraría el vector de prototipo sin agregar ningún trap nuevo al `Proxy`.
- **Desventajas:** **riesgo directo de violar la restricción 3** (no romper `tx.$queryRaw`). Si el objeto prototipo mutado resulta ser el **mismo** que Prisma usa internamente para construir el objeto `tx` en cada `$transaction()` (no confirmado ni descartado por la evidencia disponible — determinarlo requeriría una prueba empírica que esta etapa de diseño no está autorizada a ejecutar), eliminar `$queryRaw` del prototipo compartido rompería silenciosamente los 2 flujos de negocio ya en producción (`registrarCobranza`, `anularCobranza`), posiblemente sin ningún error visible hasta el primer intento real de uso.
- **Riesgos:** alto — la propia justificación original de `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` para descartar la eliminación directa de propiedades (*"no hay garantía... de que un `delete` remueva realmente el acceso... podría no alcanzar el nivel correcto"*) aplica acá con el mismo peso, agravada por el riesgo adicional de afectar a `tx`.
- **Compatibilidad con Prisma:** incierta y riesgosa — depende de un detalle interno de Prisma no documentado públicamente (si el prototipo es compartido entre el cliente de nivel superior y el cliente transaccional), que además podría cambiar sin aviso entre versiones.
- **Impacto sobre rendimiento:** no aplica (operación única al construir el cliente, no en cada acceso).
- **Impacto sobre mantenibilidad:** malo — cualquier actualización de Prisma podría alterar si el prototipo sigue compartido de la misma forma, sin ninguna señal de alerta hasta que algo se rompa en producción.
- **Complejidad de implementación:** baja en líneas de código, pero **alta en riesgo oculto no proporcional a esa simplicidad aparente**.
- **Complejidad de auditoría futura:** alta — habría que re-verificar, en cada actualización de Prisma, si el supuesto de "prototipo compartido" (o no) sigue siendo válido, sin que el código deje ninguna pista de que esa verificación es necesaria.

### Estrategia E — Reforzar únicamente con revisión de código / regla de lint

- **Descripción:** agregar una regla de ESLint personalizada que detecte y rechace, en tiempo de CI/pre-commit, patrones como `getPrototypeOf`, `__proto__`, `Reflect.getPrototypeOf` aplicados sobre el cliente inyectado.
- **Funcionamiento:** análisis estático de código, sin ningún efecto en tiempo de ejecución.
- **Ventajas:** bajo esfuerzo de implementación; agrega una capa de detección temprana para código nuevo del propio equipo.
- **Desventajas:** **no cumple el objetivo funcional de esta corrección** — no elimina el bypass en tiempo de ejecución (restricción 1 no se satisface); no protege contra el escenario de mayor relevancia práctica ya señalado en el Análisis Técnico (una dependencia npm comprometida ejecutando código dentro del proceso, que no pasa por ningún linter del proyecto); ya fue rechazada explícitamente como insuficiente por sí sola en la propia Auditoría original de H-02 (`AUDITORIA_BLOQUE11_SEGURIDAD.md`, tabla de decisiones, opción (b) descartada a favor de la (a) elegida).
- **Riesgos:** deja el sistema expuesto exactamente al escenario de mayor relevancia práctica identificado.
- **Compatibilidad con Prisma:** no aplica (no toca código de Prisma).
- **Impacto sobre rendimiento:** no aplica.
- **Impacto sobre mantenibilidad:** buena en sí misma, pero de valor de seguridad limitado frente al objetivo de esta corrección.
- **Complejidad de implementación:** baja.
- **Complejidad de auditoría futura:** baja, pero irrelevante — no resuelve el problema de fondo que esta corrección debe cerrar.

---

## Comparativa

| Estrategia | Seguridad | Complejidad | Compatibilidad | Riesgo | Mantenimiento |
|---|---|---|---|---|---|
| A — Trap `getPrototypeOf` + `__proto__` en `get` | Alta (cierra los 2 vectores confirmados) | Baja | Alta | Bajo | Bajo |
| B — Membrana completa (A + `has`/`ownKeys`/`getOwnPropertyDescriptor`/`setPrototypeOf`) | Muy alta (cierre estético completo) | Media | Alta, con matices | Medio (invariantes de Proxy) | Medio |
| C — Wrapper explícito (allowlist) | Muy alta (elimina la clase de vulnerabilidad) | Alta | Incierta | Alto (reescritura mayor) | Malo |
| D — Eliminar/reasignar sobre prototipo compartido | Alta si funciona, pero de confiabilidad incierta | Baja (líneas) | Incierta y riesgosa | Alto (podría romper `tx`) | Malo |
| E — Solo lint/revisión de código | Baja (no cierra en runtime) | Baja | No aplica | Alto (deja expuesto el escenario principal) | Bueno, pero irrelevante para el objetivo |

---

## Selección

**Estrategia A — Cobertura del trap `getPrototypeOf`, con tratamiento explícito de `__proto__` dentro del trap `get` ya existente.**

### Por qué resulta superior

Es la única de las 5 alternativas que satisface simultáneamente las 9 restricciones obligatorias sin ningún compromiso:

1. **Elimina el bypass confirmado** (restricción 1): cierra tanto `Object.getPrototypeOf`/`Reflect.getPrototypeOf` (mismo mecanismo, mismo trap) como `__proto__` (mecanismo distinto, cubierto extendiendo el trap `get` ya existente) — los 2 vectores de invocación confirmados por ejecución real en la Auditoría Adversarial. Los otros 2 vectores mencionados en la consigna (`constructor.prototype`, `Object.create`) ya quedaron cerrados transitivamente: `constructor.prototype` porque el `.bind(target)` ya existente en el trap `get` despoja a la función devuelta de su propiedad `.prototype` (confirmado empíricamente en el Análisis Técnico, sin que esta corrección necesite tocar nada ahí); `Object.create` porque, según el propio Análisis, no es una vía de fuga nueva sino una consecuencia de tener ya la referencia filtrada — al cerrar el origen de esa referencia, esta vía queda cerrada también.
2. **No rompe `$transaction`** (restricción 2): el diseño no toca en absoluto el trap de invocación de métodos ni la lógica de `$transaction` — sigue exactamente igual, en ambas formas.
3. **No rompe `tx.$queryRaw`** (restricción 3): esta es la razón decisiva que separa a la Estrategia A de la D. A diferencia de D (que mutaría un objeto real potencialmente compartido con `tx`), A opera **enteramente sobre la capa de `Proxy` propia del proyecto** — nunca toca `clienteExtendido`, su prototipo, ni ningún objeto que Prisma construya internamente. El objeto `tx` nunca pasó, no pasa, y no pasará por este `Proxy` (confirmado en `VALIDACION_FUNCIONAL_BLOQUE11.md` y reconfirmado en `AUDITORIA_ADVERSARIAL_BLOQUE11.md`) — por construcción, ningún cambio en el `handler` de este `Proxy` puede afectar a `tx`, sin necesidad de asumir nada sobre si comparte o no un prototipo con el cliente de nivel superior.
4. **No modifica el `PrismaClient` estándar** (restricción 4): el cambio vive enteramente en `bloquearMetodosRawDeNivelSuperior()`, una función propia del proyecto — Prisma nunca es consciente de que este trap existe.
5. **Compatible con futuras versiones razonables de Prisma** (restricción 5): no depende de ningún detalle interno no documentado de Prisma más allá de lo ya verificado (los 4 métodos viven en el prototipo, no como propiedad propia) — a diferencia de D, que depende de un supuesto no confirmado sobre prototipos compartidos.
6. **Sin degradación de rendimiento** (restricción 6): mismo orden de costo que el trap `get` ya existente y ya aceptado.
7. **Mínima superficie de cambio** (restricción 7): frente a B (más traps, más superficie), C (reescritura completa) y D (riesgo oculto desproporcionado a su simplicidad aparente), A es la opción de menor huella que **efectivamente cierra el vector confirmado** — descarta a E precisamente porque E, siendo la de menor huella de todas, no cumple el objetivo funcional.
8. **Legible** (restricción 8): mismo patrón, mismo archivo, mismo estilo que el trap ya existente y ya revisado.
9. **No mágica, no difícil de mantener** (restricción 9): se apoya en semántica de `Proxy` estándar y ya documentada (misma explicación de ECMA-262 ya usada en el Análisis Técnico), no en un truco frágil ni en suposiciones no verificables sobre el funcionamiento interno de Prisma.

### Por qué se descartan las demás

- **Estrategia B** se descarta porque va más allá de lo que el objetivo funcional exige: cierra además vectores (`in`, `Object.keys`) que la propia Auditoría Adversarial ya clasificó explícitamente como *"sin impacto práctico"* (no aportan invocación, solo listado) — el costo adicional (más superficie, riesgo real de violar invariantes de `Proxy` que pueden producir errores en tiempo de ejecución) no se justifica frente a un beneficio de seguridad marginal. Contradice directamente las restricciones 7 y 9.
- **Estrategia C** se descarta porque es la de mayor riesgo de regresión de las 5 (reescritura de 14 operaciones × ~22 modelos), la de mayor esfuerzo, y la de compatibilidad con Prisma menos verificada — viola las restricciones 5 y 7 de forma clara, y no hay evidencia de que el objetivo funcional (cerrar el bypass confirmado) requiera un cambio de esta magnitud.
- **Estrategia D** se descarta, ratificando lo ya señalado por el propio Análisis Técnico, por el riesgo directo y no descartable de violar la restricción 3 más crítica de todas (no romper `tx.$queryRaw`, un flujo de negocio ya en producción) — es la única de las 5 alternativas con potencial de causar una regresión funcional real, no solo teórica.
- **Estrategia E** se descarta porque no cumple el objetivo funcional en absoluto — no elimina el bypass en tiempo de ejecución (restricción 1), y ya fue rechazada por este mismo motivo en la Auditoría original de H-02, antes incluso de que existiera el mecanismo actual de `Proxy`.

---

## Diseño técnico

*(Descripción de diseño únicamente — sin código.)*

**Componentes afectados:** únicamente `backend/src/prisma/organizacion-prisma.client.ts`, específicamente la función `bloquearMetodosRawDeNivelSuperior()` — la única pieza del sistema responsable de construir la barrera de protección alrededor del cliente inyectado. Ningún otro archivo requiere cambios: `organizacion-prisma.module.ts` (el punto de la aplicación DI que construye `ORGANIZACION_PRISMA`) sigue recibiendo, sin necesitar saberlo, un objeto con la misma forma pública que hoy — mismo alcance de "archivo único" ya confirmado como suficiente en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` para el mecanismo original de H-02.

**Flujo antes:** `crearClienteOrganizacional(prisma)` construye `clienteExtendido` vía `prisma.$extends(...)`, y lo envuelve en un `Proxy` cuyo `handler` define solo el trap `get`. Cualquier lectura de propiedad sobre el objeto resultante pasa por ese único trap; cualquier otra operación reflexiva — en particular, el método interno `[[GetPrototypeOf]]` — se delega directamente, sin ningún filtro, al objeto real (`clienteExtendido`), exponiendo su prototipo real. Ese prototipo, a su vez, expone como propiedades heredadas los 4 métodos raw, sin ningún bloqueo, invocables directamente.

**Flujo después:** el mismo `handler` del mismo `Proxy` gana dos piezas de lógica adicionales, ambas ubicadas junto a la lógica ya existente: (1) un trap `getPrototypeOf`, que en lugar de delegar al comportamiento por defecto, devuelve un valor saneado (el valor exacto — candidato principal `null` — queda para definir en la etapa de Decisiones Técnicas, ver Plan de Implementación); (2) dentro del trap `get` ya existente, una rama adicional para quando la clave solicitada sea `"__proto__"`, que devuelve ese mismo valor saneado en lugar de continuar con la lógica de paso transparente actual (`target[prop]`). Cualquier otra operación — lectura de un delegado de modelo permitido, invocación de `$transaction`, lectura de cualquier propiedad no bloqueada — sigue exactamente el mismo camino que hoy, sin ningún cambio de comportamiento fuera de estos dos puntos de intercepción nuevos.

**Responsabilidades:** `bloquearMetodosRawDeNivelSuperior()` sigue siendo la única función responsable de construir la barrera de protección — no se introduce ninguna responsabilidad nueva en ningún otro punto del sistema (ni en el módulo de inyección de dependencias, ni en ningún controller, ni en la extensión de aislamiento por organización — `asegurarSinEscrituraAnidada` y los 14 hooks de `$allModels` en el mismo archivo permanecen completamente intactos).

**Interacción con Prisma:** el diseño no toca ningún objeto propio de Prisma — ni `PrismaService`, ni `clienteExtendido`, ni el objeto `tx` que Prisma construye internamente en cada `$transaction()`. La corrección opera enteramente en la capa de `Proxy` que el propio proyecto ya construye por encima de esos objetos; Prisma nunca "ve" ni necesita saber que este trap existe.

**Interacción con Proxy:** de los 13 traps posibles que admite un objeto `Proxy`, el diseño deja cubiertos 2 (`get`, ya existente; `getPrototypeOf`, nuevo), y deja sin cubrir, deliberadamente y por decisión ya justificada en la sección de Selección, los 11 restantes (`has`, `ownKeys`, `getOwnPropertyDescriptor`, `setPrototypeOf`, `defineProperty`, `deleteProperty`, `isExtensible`, `preventExtensions`; `apply` y `construct` no aplican, el objeto no es invocable ni construible; `set` tampoco fue nunca parte del alcance de H-02).

**Interacción con transacciones:** ninguna, por diseño. El objeto `tx` que recibe el callback de `$transaction()` nunca fue, no es, y no será envuelto por este `Proxy` — es un objeto que Prisma construye de forma completamente independiente en cada invocación (confirmado empíricamente en `VALIDACION_FUNCIONAL_BLOQUE11.md` §7 y reconfirmado en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §6.14-6.15). El diseño no introduce ningún mecanismo que pudiera, ahora o en el futuro, extender la protección (o cualquier otro efecto) hacia `tx` — se mantiene exactamente la misma separación ya vigente y ya validada dos veces.

---

## Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Algún mecanismo interno de NestJS, de una librería de logging/depuración, o de una herramienta de inspección no identificada dependa de poder leer el prototipo real del cliente inyectado para funcionar correctamente | Baja — no se encontró ningún caso en el código del proyecto (búsqueda exhaustiva ya documentada); NestJS resuelve esta inyección vía `useFactory`, que no depende de reflexión sobre el prototipo del valor devuelto | Medio si ocurriera — podría manifestarse como un error sutil, no necesariamente al arrancar la app, sino en un punto de uso específico no cubierto por las pruebas estándar | Verificar empíricamente en Pre-Implementación/Implementación arrancando la aplicación completa y ejercitando los flujos principales (no solo pruebas aisladas), antes de dar la corrección por cerrada — mismo estándar ya aplicado al mecanismo original de H-02 |
| R2 | Devolver `null` desde el trap `getPrototypeOf` produzca, en algún caso no anticipado, un comportamiento distinto al esperado por código que dependa implícitamente de `Object.prototype` en la cadena de herencia de este objeto específico | Baja — las llamadas a métodos de `Object.prototype` (p. ej. `.toString()`, `.hasOwnProperty()`) sobre el objeto envuelto se resuelven vía el trap `get` (ya existente, sin cambios), no dependen del resultado de `getPrototypeOf` | Bajo a medio | Si la verificación empírica de Pre-Implementación revela algún problema, la alternativa de diseño (`Object.prototype` en lugar de `null`) queda disponible sin cambiar de estrategia — ambas opciones cierran el vector confirmado por igual, difieren solo en cuán "vacía" queda la cadena de herencia resultante; la elección entre ambas es una decisión de Decisiones Técnicas, no de este diseño |
| R3 | Que `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe` tengan, en la versión real de Prisma instalada, alguna ubicación adicional no contemplada (además del prototipo ya identificado) desde la cual también sean alcanzables | Baja — ya verificado específicamente para los 4 métodos en el Análisis Técnico, con evidencia de ejecución real | Alto si ocurriera — dejaría un vector residual no cerrado por esta corrección, dando una falsa sensación de cierre completo | El Plan de Validación de este documento exige repetir explícitamente, tras la implementación, los mismos 4 vectores ya confirmados por la Auditoría Adversarial — no darlos por cerrados solo por diseño, sino por verificación empírica posterior |
| R4 | Una actualización futura de Prisma altere la relación entre el objeto extendido y su prototipo, dejando sin cobertura una ubicación nueva para los métodos raw | Baja en el corto plazo, no nula a mediano plazo — dependencia de un detalle no documentado públicamente por Prisma, mismo riesgo ya reconocido para el mecanismo original en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` | Medio | Documentar explícitamente que cualquier actualización de `@prisma/client`/`prisma` debe re-ejecutar la verificación de este diseño (los mismos 4 vectores), no darla por válida indefinidamente — mismo criterio de mantenimiento ya aplicado al resto del mecanismo de H-02 |

---

## Plan de implementación

*(Sin código — tareas pequeñas y verificables, en orden.)*

1. Verificar empíricamente, en el entorno de desarrollo, si `clienteExtendido` (el objeto real envuelto por el `Proxy`) es extensible (`Object.isExtensible`) — determina si existe alguna restricción de invariante de `Proxy` que condicione qué valor puede devolver el trap `getPrototypeOf` sin provocar un `TypeError`. Tarea de verificación previa a Decisiones Técnicas, no de implementación de código de aplicación.
2. En la etapa de Decisiones Técnicas, definir el valor exacto que devolverá el trap `getPrototypeOf` (candidato principal: `null`; alternativa ya identificada: `Object.prototype`), en base al resultado de la tarea 1.
3. Agregar el trap `getPrototypeOf` al `handler` del `Proxy` en `bloquearMetodosRawDeNivelSuperior()`, devolviendo el valor definido en la tarea 2.
4. Extender el trap `get` ya existente con una rama adicional para la clave `"__proto__"`, devolviendo el mismo valor saneado que el trap `getPrototypeOf`.
5. Verificar, en desarrollo, que los 4 vectores de bypass ya confirmados por la Auditoría Adversarial (`Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__`, `constructor.prototype`) dejan de exponer los métodos raw.
6. Verificar, en desarrollo, que los 2 usos legítimos de `tx.$queryRaw` (`registrarCobranza`, `anularCobranza`, en `facturas.controller.ts`) siguen funcionando exactamente igual que antes de la corrección.
7. Verificar que `$transaction` en sus dos formas (callback y array) sigue funcionando sin cambios.
8. Ejecutar el build completo (`npm run build`) y la suite de tests existente (`npm test`), confirmando que ambos permanecen en verde.
9. Ejercitar manualmente, contra el backend real, al menos los mismos flujos ya cubiertos en `VALIDACION_FUNCIONAL_BLOQUE11.md` para H-02 y H-08 (H-08 depende de operaciones de facturación que a su vez usan `tx.$queryRaw`), confirmando ausencia de regresión.
10. Documentar el resultado de las tareas 5-9 como evidencia de cierre, antes de considerar la corrección lista para una nueva Auditoría Adversarial específica de H-02.

---

## Plan de validación

Una vez implementada la solución, deberá verificarse explícitamente:

- **Build:** `npm run build` en verde, sin errores ni advertencias nuevas de TypeScript.
- **Tests:** `npm test` en verde — como mínimo los mismos 10/10 ya existentes (más cualquier test nuevo que Decisiones Técnicas decida agregar para este mecanismo, a definir en esa etapa, no en este diseño).
- **H-02 original:** los 4 métodos raw deben seguir bloqueados exactamente igual ante acceso directo (punto, corchetes, desestructuración, `Reflect.get`, cast `any`) — sin cambios de mensaje ni de comportamiento respecto del mecanismo ya vigente.
- **Bypass mediante `Object.getPrototypeOf()`:** debe dejar de exponer los 4 métodos raw.
- **`Reflect.getPrototypeOf()`:** debe dejar de exponerlos (mismo mecanismo subyacente que el anterior; verificar igual, sin asumir que un resultado implica el otro).
- **`__proto__`:** debe dejar de exponerlos.
- **`constructor.prototype`:** confirmar que sigue sin exponerlos (ya bloqueado hoy por el `.bind(target)` existente) — verificar explícitamente que el cambio de esta corrección no lo altera de ninguna forma.
- **Funcionamiento de transacciones:** `$transaction(callback)`, `$transaction([...])` (forma array), y los 2 usos reales de `tx.$queryRaw` en `facturas.controller.ts` — todos deben comportarse exactamente igual que antes de la corrección, verificado contra el backend real, no solo por lectura de código.
- **Ausencia de regresiones:** repetir, como mínimo, los flujos ya cubiertos en `VALIDACION_FUNCIONAL_BLOQUE11.md` — login, aislamiento organizacional, y los 3 endpoints de H-01 — para confirmar que ningún otro punto del sistema se vio afectado.

---

## Criterios de aceptación

La corrección solo podrá considerarse aceptada si:

- Desaparece completamente el bypass (los 4 métodos raw quedan inalcanzables por las 4 vías ya confirmadas: `Object.getPrototypeOf`, `Reflect.getPrototypeOf`, `__proto__`, y por acceso directo ya bloqueado desde antes).
- No aparecen nuevos vectores equivalentes — verificado mediante una **nueva Auditoría Adversarial específica de H-02**, repitiendo como mínimo los 12 vectores ya usados en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` (sección 6), no solo los 4 explícitamente corregidos.
- No se rompe ninguna funcionalidad existente — confirmado por el Plan de Validación completo de este documento.
- Build y tests permanecen verdes.
- La Auditoría Adversarial específica de H-02 (mencionada arriba) queda **sin hallazgos**.

---

## Próxima etapa

**`DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`**

Objetivo: cerrar las decisiones técnicas que este diseño dejó explícitamente abiertas — en particular, el valor exacto que devolverá el trap `getPrototypeOf` (`null` vs. `Object.prototype`, tarea 1-2 del Plan de Implementación), y cualquier otro detalle de implementación que deba fijarse antes de pasar a Pre-Implementación, siguiendo la misma metodología de etapas ya usada para el resto de Bloque 11.

No se genera este documento en esta etapa.

---

## Informe final

- **Estrategia seleccionada:** Estrategia A — cobertura del trap `getPrototypeOf` del `Proxy` existente, con tratamiento explícito de `__proto__` dentro del trap `get` ya existente.
- **Principales motivos:** es la única de las 5 alternativas que satisface simultáneamente las 9 restricciones obligatorias; cierra los 2 vectores de invocación confirmados por ejecución real sin tocar ningún objeto propio de Prisma (por lo que no puede afectar a `tx`, a diferencia de la Estrategia D); mínima superficie de cambio, mismo archivo, mismo patrón ya usado y ya auditado; no depende de ningún supuesto no verificado sobre el funcionamiento interno de Prisma.
- **Riesgos identificados:** 4 (R1-R4 en la tabla correspondiente) — el de mayor relevancia es R1 (posible dependencia interna no identificada de la cadena de prototipo real), mitigado mediante verificación empírica exhaustiva en la etapa de Pre-Implementación/Implementación, no asumida por diseño.
- **Tareas previstas:** 10 tareas ordenadas y verificables (Plan de Implementación), desde la verificación de extensibilidad del objeto hasta la documentación de evidencia de cierre, sin incluir escritura de código de aplicación fuera de las tareas 3-4.
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

No se implementó nada. No se modificó código, backend, frontend, schema, tests ni documentación previa. No se generó ningún parche. No se generó evidencia nueva ni se reabrió la auditoría — todo este diseño se basó exclusivamente en `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` y `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`, ya aprobados.

Me detengo y quedo a la espera de autorización antes de implementar cualquier cambio.

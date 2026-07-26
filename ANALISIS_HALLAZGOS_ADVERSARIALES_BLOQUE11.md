# Análisis de Hallazgos Adversariales — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. **No corrige código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no modifica tests, no actualiza documentación existente (salvo este documento), no hace refactors, no hace `git add`/`commit`/`push`.** Analiza exclusivamente los dos hallazgos críticos de `AUDITORIA_ADVERSARIAL_BLOQUE11.md` (H-02 y H-07) para determinar su alcance técnico real antes de que el Product Owner decida su tratamiento. No se implementó ninguna corrección, no se generó ningún parche, no se ejecutó ninguna prueba destructiva adicional — la única ejecución de código realizada en esta etapa fue de reflexión pura, de solo lectura, sin abrir transacciones de escritura ni ejecutar SQL, para responder con precisión las preguntas 4 y 6 de H-02 (detallado en la sección de evidencia).

---

## H-02 — Bypass del Proxy mediante `Object.getPrototypeOf()`

### 1. ¿Por qué el Proxy permite este bypass?

`bloquearMetodosRawDeNivelSuperior()` (`backend/src/prisma/organizacion-prisma.client.ts:61-75`) construye el `Proxy` con un único trap:

```ts
return new Proxy(cliente, {
  get(target, prop, _receiver) { /* ... */ },
});
```

Un objeto `Proxy` de ECMAScript admite **13 traps posibles**, uno por cada método interno de un objeto ordinario (`get`, `set`, `has`, `deleteProperty`, `ownKeys`, `getOwnPropertyDescriptor`, `defineProperty`, `getPrototypeOf`, `setPrototypeOf`, `isExtensible`, `preventExtensions`, `apply`, `construct`). El objeto `handler` pasado acá solo define **1 de los 13**. Para cualquier trap **no definido**, el `Proxy` no bloquea nada ni deja pasar "por accidente" — **delega el método interno directamente al `target`**, sin ejecutar ninguna lógica del `handler`. Como `getPrototypeOf` no está definido, `Object.getPrototypeOf(clienteProtegido)` nunca invoca el trap `get` — invoca el método interno `[[GetPrototypeOf]]` del `Proxy`, que (sin trap propio) reenvía la llamada a `target.[[GetPrototypeOf]]()` y devuelve el prototipo **real**, sin ningún envoltorio. Una vez obtenida esa referencia, cualquier acceso posterior sobre ella (`.  $queryRaw`, etc.) ocurre sobre un objeto ordinario, no sobre el `Proxy` — el trap `get` ya quedó completamente fuera del camino.

### 2. ¿Qué parte exacta de ECMAScript explica este comportamiento?

ECMA-262, sección de **Proxy Object Internal Methods and Internal Slots**, específicamente el algoritmo de `[[GetPrototypeOf]] ( )` para objetos exóticos Proxy: si `handler.getPrototypeOf` es `undefined`, el paso final del algoritmo es literalmente *"Return ? target.[[GetPrototypeOf]]()"*. No es un comportamiento implícito de la implementación de V8/Node — es el comportamiento **exigido por la especificación** para cualquier trap omitido: la delegación al `target` real es el valor por defecto documentado para los 13 traps, no una laguna accidental del motor.

### 3. ¿El problema es propio de Proxy o de la estrategia elegida?

**De la estrategia elegida, no de `Proxy` como mecanismo.** `Proxy` puede ofrecer una barrera completa ("membrana") si se implementan de forma consistente todos los traps relevantes para el modelo de amenaza — es el patrón conocido en la literatura de seguridad de JavaScript como *object-capability membrane*: una membrana que solo cubre 1 de los 13 traps (en este caso, únicamente `get`) dejaMedio abierta cualquier vía de reflexión que no pase por ese trap específico. `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (H-02, punto de justificación del mecanismo) argumentó correctamente que `Proxy` da *"una garantía verificable por construcción"* frente a la eliminación/reasignación directa de propiedades — esa comparación sigue siendo válida (`Proxy` es estrictamente superior a un `delete` o reasignación) — pero la implementación resultante solo aprovechó una fracción de la superficie de protección que `Proxy` puede ofrecer. El mecanismo elegido es sólido en su principio; la cobertura de traps implementada es incompleta.

### 4. ¿Puede reproducirse mediante otras APIs?

Se verificó empíricamente (script de solo lectura, sin abrir ninguna operación de escritura ni ejecutar SQL — ver sección de evidencia) cada API sugerida:

| API | ¿Reproduce el bypass? | Evidencia |
|---|---|---|
| `Reflect.getPrototypeOf(protegido)` | **Sí — idéntico a `Object.getPrototypeOf`** | Misma referencia exacta (`=== true`), expone `$queryRaw` como función. `Reflect.getPrototypeOf` invoca el mismo método interno `[[GetPrototypeOf]]`, con el mismo comportamiento por defecto ante trap ausente |
| `protegido.__proto__` | **Sí — misma referencia** | `__proto__` es una propiedad de acceso (getter) heredada de `Object.prototype`; acceder a ella **sí** dispara el trap `get` del Proxy (es una lectura de propiedad como cualquier otra) — pero como `"__proto__"` no está en `METODOS_RAW_BLOQUEADOS`, el trap simplemente hace `target["__proto__"]` y devuelve el resultado tal cual, que es el mismo prototipo real. A diferencia de `getPrototypeOf` (que evita el trap por completo), esta vía **sí pasa por el trap** pero lo atraviesa sin ser bloqueada, por no estar la clave en la lista de bloqueo |
| `protegido.constructor.prototype` (a través del Proxy) | **No — bloqueado accidentalmente por el propio `.bind(target)` defensivo** | `protegido.constructor` sí pasa por el trap `get`, no está bloqueado, y como es una función, el trap la devuelve `.bind(target)`. Las funciones ligadas (`bind()`) **no tienen `.prototype` propio** por especificación (`hasOwnProperty("prototype") === false`, confirmado empíricamente) — `protegido.constructor.prototype` da `undefined`. Esta vía específica queda neutralizada, sin que haya sido un diseño deliberado (es un efecto colateral del `.bind(target)` que existe por otra razón, documentada en el propio código) |
| `Object.getPrototypeOf(protegido).constructor.prototype` (constructor obtenido a partir del prototipo YA filtrado, no a través del Proxy) | No aporta un vector **nuevo** — es una forma más larga de llegar al mismo resultado que ya se obtiene directamente con `Object.getPrototypeOf(protegido)` | El constructor obtenido por esta vía no está ligado (no pasó por el trap), tiene `.prototype` propio, pero confirmar su `.prototype.$queryRaw` es redundante frente al vector ya confirmado en la fila 1 |
| `Object.create(prototipoYaFiltrado)` | **Sí, pero como consecuencia, no como vía de fuga nueva** | Un objeto nuevo creado con `Object.create()` a partir de la referencia ya obtenida hereda `$queryRaw` como función invocable — confirma que, una vez obtenida la referencia (por cualquiera de las vías de arriba), puede propagarse libremente por herencia prototípica ordinaria, sin volver a tocar el Proxy nunca más |

**Conclusión de la pregunta 4:** existen al menos **2 vías independientes y directas** para obtener la referencia real sin pasar por el bloqueo (`Object.getPrototypeOf`/`Reflect.getPrototypeOf`, equivalentes; y `__proto__`, mecanismo distinto pero mismo resultado) — ambas confirmadas por ejecución real, no solo por lectura de especificación.

### 5. ¿El bypass requiere uso deliberadamente malicioso, o puede producirse indirectamente desde código normal?

**Requiere una línea de código específica y deliberada** (`Object.getPrototypeOf(x)`, `Reflect.getPrototypeOf(x)`, o `x.__proto__`) — ningún patrón de uso normal, idiomático o accidental de un cliente de Prisma en el código de este proyecto pasa por ahí. No existe ningún caso conocido en el ecosistema de NestJS/Prisma donde un desarrollador necesite inspeccionar el prototipo de un cliente inyectado como parte de un flujo legítimo (a diferencia de, por ejemplo, un cast `as any`, que sí puede colarse "por accidente" al copiar un patrón de otro archivo bajo presión de tiempo — el propio escenario que `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` cita como motivación para H-02). Por lo tanto: **es alcanzable únicamente mediante intención deliberada de evadir el bloqueo**, no mediante un error de tipeo o un patrón de código convencional. Esto **reduce**, pero no elimina, el riesgo — sigue siendo relevante frente a un desarrollador interno malicioso, una revisión de código descuidada que no reconozca el patrón como sospechoso, o una dependencia de terceros comprometida (ataque de cadena de suministro) que ejecute código arbitrario dentro del proceso del backend.

### 6. ¿Existe alguna ruta dentro del código actual del proyecto que alcance el bypass sin escribir código nuevo?

**No.** Búsqueda exhaustiva (`grep -rn` en todo `backend/src`) de los patrones `getPrototypeOf`, `__proto__`, `.constructor.prototype`, `Object.create(`, `Reflect.get` → **0 resultados** en la totalidad del código fuente del proyecto. El bypass es real y reproducible, pero **no está siendo alcanzado hoy por ningún punto del código existente** — es un vector teórico confirmado, no un defecto ya en explotación.

### 7. Clasificación del riesgo

| Categoría | ¿Aplica? | Justificación |
|---|---|---|
| Arquitectónico | **Sí** | La estrategia de protección (membrana de un solo trap) es incompleta por diseño, no por un error de implementación puntual — es una decisión de arquitectura (qué traps cubrir) la que dejó el vector abierto |
| Runtime | **Sí** | El bypass ocurre y se resuelve enteramente en tiempo de ejecución, sin ningún indicio en tiempo de compilación (TypeScript no tiene forma de prevenir esto — de hecho el propio bypass usa JavaScript estándar, sin necesitar ningún `as any`) |
| Accidental | **No** (ver pregunta 5) | Requiere una línea de código específica y deliberada, no ocurre por un patrón de uso normal |
| Solo desarrollador | **Sí, con matices** | No es explotable directamente por un atacante HTTP externo sin antes lograr ejecutar código dentro del proceso del backend (no hay ningún endpoint que exponga esta reflexión al exterior) — el umbral de acceso es el mismo que ya existía para el vector `as any` que H-02 sí cierra correctamente |
| Explotable desde API | **No, directamente** | Ningún endpoint HTTP existente permite disparar este bypass sin la adición de código nuevo (confirmado en la pregunta 6) |
| Otro — cadena de suministro | **Sí** | El escenario de mayor relevancia práctica no es "un desarrollador del equipo escribe esto a propósito" sino "una dependencia npm comprometida, con capacidad de ejecutar código arbitrario dentro del proceso, usa este patrón para exfiltrar datos cross-organización sin que ningún log de `[aislamiento]` lo delate" — el propio mecanismo de bloqueo fue diseñado, según su justificación documentada, precisamente para no depender "de la disciplina de code review a futuro" (`AUDITORIA_BLOQUE11_SEGURIDAD.md`, tabla de decisiones H-02) |

### 8. Estrategias posibles de corrección (sin elegir ninguna)

| # | Estrategia | Ventajas | Desventajas | Impacto | Compatibilidad con Prisma | Complejidad | Mantenimiento |
|---|---|---|---|---|---|---|---|
| A | Agregar el trap `getPrototypeOf` al `Proxy` existente, devolviendo `null` (o un objeto vacío/saneado) | Cierra exactamente el vector confirmado (6.3-6.6 de la Auditoría Adversarial); cambio acotado a un único archivo, coherente con el mecanismo ya elegido y aprobado | No cubre `__proto__` por sí solo (esa vía pasa por `get`, ya bloqueada porque `"__proto__"` podría agregarse a `METODOS_RAW_BLOQUEADOS`, pero requiere ese agregado adicional); no cubre `has`/`ownKeys`/`getOwnPropertyDescriptor` (ya señalados como no bloqueados en `REVISION_IMPLEMENTACION_BLOQUE11.md`, aunque sin bypass de invocación confirmado a través de esos) | Bajo — un objeto `Proxy` con `getPrototypeOf: null`-returning puede romper código legítimo que dependa de `instanceof` o de introspección de prototipo en algún punto no auditado (no se encontró ninguno en este proyecto, pero Prisma internamente podría depender de esto para alguna operación no probada) | Alta si se limita a devolver `null` o un prototipo mínimo; requiere confirmar empíricamente (como ya se hizo para H-02 en Pre-Implementación) que ningún mecanismo interno de Prisma dependa de la cadena de prototipo real del cliente extendido | Baja — una función adicional en el `handler` | Bajo — mismo patrón y ubicación que el trap `get` ya existente, fácil de razonar junto a él |
| B | Cobertura completa de membrana: agregar también `has`, `ownKeys`, `getOwnPropertyDescriptor` (y `setPrototypeOf`, por completitud) | Cierra no solo el bypass de invocación sino también toda forma de introspección (`"$queryRaw" in x`, `Object.keys`, `JSON.stringify`, `Object.getOwnPropertyDescriptor`) — la membrana queda completa según el patrón estándar de seguridad de Proxy | Mayor superficie de código a mantener; cada trap nuevo debe replicar la misma lista de bloqueo y el mismo criterio de paso transparente, con riesgo de inconsistencia entre traps si se edita uno y no los demás | Ninguno esperado sobre funcionalidad legítima (ningún punto del código actual usa `in`/`Object.keys` sobre el cliente inyectado, confirmado en la Auditoría Adversarial, hallazgo 6.10-6.11) | Alta, mismo razonamiento que A | Media — 4-5 traps en vez de 1, cada uno con su propia lógica de paso transparente para claves no bloqueadas | Medio — más superficie a revisar en cada cambio futuro del mecanismo, pero acotada al mismo archivo |
| C | Reemplazar `Proxy` por un objeto "wrapper" compuesto manualmente (allowlist explícita de métodos permitidos, en vez de denylist reflexiva) | Elimina la clase entera de vulnerabilidad (no depende de qué traps se cubran o se olviden — si un método no se declaró explícitamente en el wrapper, no existe, punto) | Requiere reimplementar/delegar explícitamente cada uno de los métodos y delegados de modelo que el cliente expone hoy (14 operaciones × ~20 modelos organizacionales + métodos de nivel superior) — cambio de fondo, no incremental | Alto — reescritura sustancial de `organizacion-prisma.client.ts`, con riesgo de introducir regresiones en cualquiera de los métodos re-implementados | Depende de si Prisma expone una forma estable de enumerar/delegar todos sus modelos programáticamente sin depender de la extensión de tipos actual — no evaluado en este análisis (evaluarlo sería, en sí mismo, trabajo de una etapa de Diseño, no de este análisis) | Alta — es la opción de mayor esfuerzo de implementación de esta tabla | Alto — cada modelo nuevo agregado a `ORGANIZACIONAL_MODELS` requeriría además una entrada explícita en el wrapper, duplicando el mantenimiento que hoy resuelve automáticamente el `$allModels` de la extensión de Prisma |
| D | Eliminar/reasignar `$queryRaw` etc. directamente sobre el objeto prototipo compartido (`delete Object.getPrototypeOf(cliente).$queryRaw`) | Cerraría el vector de prototipo sin agregar traps nuevos | **Riesgo alto de romper el uso legítimo de `tx.$queryRaw`** (`facturas.controller.ts`, `registrarCobranza`/`anularCobranza`): si el prototipo mutado es **compartido** entre el cliente de nivel superior y el objeto `tx` que Prisma construye internamente en cada `$transaction()` (no confirmado ni descartado en este análisis — requeriría verificación empírica adicional, fuera de alcance de esta etapa), mutar el prototipo podría eliminar `$queryRaw` también de `tx`, rompiendo dos flujos de negocio ya en producción. Ya descartado explícitamente por este mismo motivo de fondo en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (H-02, sección de justificación del mecanismo: *"no hay garantía... de que un `delete` remueva realmente el acceso... podría no alcanzar el nivel correcto"*) | Potencialmente alto y con efecto colateral cruzado hacia un flujo de negocio ya validado (H-02 punto 10 de Decisiones Técnicas exige expresamente no afectar `tx`) | Riesgosa — depende de un detalle interno de Prisma no documentado públicamente (si el prototipo es compartido entre instancias/usos) | Baja en líneas de código, pero **alta en riesgo de romper algo no relacionado sin darse cuenta** | Malo — cualquier cambio de versión de Prisma podría alterar si el prototipo sigue siendo compartido de la misma forma, sin ninguna señal de alerta hasta que algo se rompa en producción |
| E | Reforzar únicamente con revisión de código / regla de lint personalizada que prohíba `getPrototypeOf`/`__proto__`/`Reflect.getPrototypeOf` sobre el cliente inyectado | Bajo esfuerzo de implementación; agrega una capa de detección temprana (CI/pre-commit) | No cierra el vector en runtime — un atacante de cadena de suministro (pregunta 7) no pasa por ESLint del proyecto; mismo criterio ya explícitamente rechazado como insuficiente por sí solo en la Auditoría original de H-02 (opción (b), descartada a favor de la (a) elegida) | Ninguno sobre funcionalidad | No aplica (no toca código de Prisma) | Baja | Bajo, pero de valor limitado si se usa como única mitigación |

**Ninguna de las 5 estrategias fue elegida ni implementada en esta etapa.**

---

## H-07 — `trust proxy`

### 1. ¿Qué hace exactamente Express cuando `trust proxy = 1`?

`app.getHttpAdapter().getInstance().set("trust proxy", 1)` (`main.ts:22`) configura el valor numérico de confianza de proxy de Express, que delega en el módulo `proxy-addr` (dependencia interna de Express, usada también por `@nestjs/throttler` para resolver `req.ip`). Con un valor numérico `N`, Express/`proxy-addr` interpreta la configuración como: *"confiar en los primeros `N` saltos de proxy contados desde el proxy más cercano al servidor (front-facing) hacia el cliente"*. Con `N=1`: se confía en exactamente 1 salto — el valor de `X-Forwarded-For` que ese único salto confiable haya agregado se toma como la IP real del cliente, **sin verificar la identidad de ese salto** (no hay ninguna validación de que la request efectivamente haya pasado por una IP de proxy conocida/esperada) — la confianza es puramente por **cantidad**, no por **identidad**.

### 2. ¿Cómo determina Express la IP cliente?

Con `trust proxy` configurado como número, Express (vía `proxy-addr`) construye una lista de direcciones = `[direccion del socket TCP directo, ...valores de X-Forwarded-For en el orden en que aparecen]`, y devuelve como `req.ip` la dirección ubicada en la posición `N` de esa lista (contando desde el extremo más cercano al servidor). Si `X-Forwarded-For` no está presente, `req.ip` es simplemente la dirección del socket TCP directo, sin importar el valor de `trust proxy`. Si está presente y tiene menos entradas que `N`, se usa la entrada más externa disponible.

### 3. ¿Qué papel cumple `X-Forwarded-For`?

Es el **único** insumo externo (controlable, al menos parcialmente, por cualquier cliente HTTP) que determina el resultado de `req.ip` cuando `trust proxy > 0`. Ningún otro header participa en este cálculo (confirmado por lectura de `main.ts`, `auth.module.ts`, `auth.controller.ts` — no hay ninguna configuración de `X-Real-IP` ni de ningún otro header alternativo). Su valor es, por diseño del protocolo HTTP, un header ordinario que **cualquier cliente puede establecer libremente** al hacer la request — su confiabilidad depende enteramente de que la infraestructura de red intermedia lo sanitice (sobrescriba o valide) antes de que la aplicación lo vea; Express/`proxy-addr` **no hacen ninguna sanitización propia**, solo cuentan posiciones.

### 4. ¿Qué comportamiento observó la Auditoría?

(`AUDITORIA_ADVERSARIAL_BLOQUE11.md`, sección 3.3-3.9): en el ambiente de desarrollo local, sin ningún proxy real interpuesto entre `curl` y el proceso Node, cada valor arbitrario y distinto de `X-Forwarded-For` enviado directamente por el cliente HTTP fue aceptado por la aplicación como una "IP" nueva y legítima, otorgando un presupuesto de intentos de login completamente nuevo (`X-RateLimit-Remaining: 9`) en cada caso — confirmado con IPs inventadas, formato IPv6, múltiples valores separados por coma, y texto arbitrario no-IP, sin ninguna validación de formato ni de origen.

### 5. ¿Ese comportamiento demuestra una vulnerabilidad del sistema o solo una limitación del entorno local?

**Ambas cosas, en proporciones que no pueden separarse sin información adicional de la infraestructura real:**

- **Es, con certeza, una demostración de que el código, tal como está escrito, no valida el origen del `X-Forwarded-For` que confía** — esto es un hecho verificable por lectura de código, independiente de cualquier entorno: `trust proxy: 1` (numérico) es, por diseño de Express/`proxy-addr`, un mecanismo de confianza por **cantidad de saltos**, no por **identidad del proxy**. Esta característica del código es real y no depende del entorno donde se ejecute.
- **Lo que la Auditoría no pudo confirmar ni descartar** es si, en la topología de red real de producción (Railway), existe una garantía de que el único camino posible hacia el proceso Node pasa siempre por exactamente 1 proxy de borde que sobrescribe (o al menos sanea) cualquier `X-Forwarded-For` que el cliente haya intentado forjar antes de que llegue a la aplicación. Si esa garantía existe y se sostiene siempre, el comportamiento observado en desarrollo (sin ningún proxy real) no se reproduciría de la misma forma en producción. Esta pregunta **no se puede responder por lectura de código del proyecto ni por pruebas en el entorno local** — depende de infraestructura fuera del repositorio.

### 6. Comportamiento esperado detrás de Railway — investigación con documentación oficial

Se consultaron la documentación oficial de Railway (`docs.railway.com`) y los foros de soporte oficiales de Railway (`station.railway.com`, donde participan empleados identificados de Railway). Resultado:

**La documentación oficial de networking de Railway (`docs.railway.com/networking/edge-networking`) no especifica el tratamiento de `X-Forwarded-For`.** Solo indica, en términos generales, que el proxy de borde ("edge proxy / tcp-proxy") *"termina TLS, agrega headers, y resuelve información de ruteo"* — sin detallar cuáles headers agrega, ni si sobrescribe los que el cliente ya envió.

**Los foros de soporte de Railway contienen respuestas de empleados de Railway que se contradicen entre sí:**

- Un empleado (identificado como *phin*, en el hilo "Security-Critical Questions on Edge Proxy Header Handling and Hop Count") afirma explícitamente: *"We do strip `X-Forwarded-For` at our edge and ensure clients cannot overwrite it."* — es decir, según esta respuesta, Railway **elimina/sobrescribe** cualquier valor que el cliente haya enviado.
- Un usuario de la comunidad (*zah340*, en el mismo hilo) reporta el comportamiento contrario, basado en observación práctica: *"Railway appends the real client IP... It does NOT strip client-supplied values. If a client sends `X-Forwarded-For: 1.2.3.4`, your app sees `X-Forwarded-For: 1.2.3.4, <real-ip>`."* — es decir, según este reporte, Railway **preserva** el valor enviado por el cliente y solo **agrega** el suyo al final.
- Sobre la cantidad de saltos: el mismo usuario de comunidad afirma *"Typically 1 hop... It is not officially documented as stable tho"* (no oficial, no garantizado); otro empleado de Railway (*phin*) responde de forma menos precisa: *"You may see another hop as the request is forwarded through our network"* — sin comprometerse a un número exacto.
- Sobre cuál extremo del header es confiable, hay una **tercera contradicción**: un empleado (*brody*, en el hilo "Edge Proxy X-Forwarded-For and X-Real-Ip can't be trusted") afirma *"The right most value of the `X-Forwarded-For` header is trustworthy"*; otro empleado (*sam-a*, en el hilo "Which header should I rely on for real client IP") recomienda lo opuesto: *"Use `X-Forwarded-For` and take the first IP. This will work consistently across both routing paths... clients can send a spoofed `X-Forwarded-For`, but the real client IP will always be the leftmost entry since our edge proxy appends to the chain."* — esta última cita es, además, **internamente inconsistente**: si el proxy "agrega" (`appends`) su valor a la cadena, el resultado de agregar debería quedar en el extremo **derecho** (el más reciente), no en el izquierdo, tal como la propia convención estándar de `X-Forwarded-For` establece (`client, proxy1, proxy2, ...`, cada proxy agrega al final). La cita de *sam-a*, tomada literalmente, contradice tanto la convención estándar del protocolo como la respuesta de su propio compañero *brody*.
- El foro también menciona que Railway comenzó a desplegar infraestructura CDN nueva **"desde aproximadamente febrero de 2026"**, lo que causó *"cambios de ruta de ruteo"* (*"routing path shifts"*) — es decir, existe evidencia de que el comportamiento pudo haber **cambiado con el tiempo**, lo que podría explicar por qué distintas respuestas, de distintas fechas, describen comportamientos distintos o contradictorios, sin que ninguna sea necesariamente "incorrecta" en el momento en que se escribió.

**Respuesta directa a las 4 opciones planteadas:**
- ¿Railway reescribe `X-Forwarded-For`? — Afirmado por un empleado (*phin*), en un hilo.
- ¿Railway preserva el header (agregando, no sobrescribiendo)? — Afirmado por un usuario de la comunidad con evidencia práctica reportada (*zah340*), y consistente con una lectura literal de la palabra "appends" usada por otro empleado (*sam-a*) en un hilo distinto.
- ¿Railway elimina headers falsificados? — Ver arriba: la respuesta oficial más explícita (*phin*) dice que sí, pero no hay una segunda fuente oficial independiente que la confirme, y hay un reporte práctico que la contradice.
- **✔️ No existe documentación oficial suficiente y consistente** — es la conclusión más defendible: la documentación formal (`docs.railway.com`) no cubre el tema en absoluto, y las respuestas de soporte, aunque provienen de empleados identificados, **se contradicen entre sí** en al menos 2 dimensiones (si se sobrescribe o se preserva; y cuál extremo del header es confiable), sin que ninguna esté marcada como respuesta oficial canónica o versionada.

### 7. ¿El hallazgo es confirmado, probable, pendiente o falso positivo en desarrollo?

**PENDIENTE (de validación externa).** No es un falso positivo — el comportamiento inseguro del *código*, tal como está escrito (confianza por cantidad de saltos, sin verificar identidad del proxy), es un hecho verificable independientemente del entorno, y quedó demostrado con ejecución real en desarrollo. Tampoco puede clasificarse como "confirmado" en producción, porque no hay evidencia externa consistente que determine si la topología real de Railway neutraliza ese riesgo (si Railway efectivamente sanea `X-Forwarded-For` antes de que la aplicación lo vea, como afirma un empleado, el bypass reproducido en desarrollo no se replicaría de la misma forma) o si lo deja expuesto (como sugiere el reporte contrario de otro usuario). Tampoco puede calificarse de "probable" con confianza suficiente, dado que la evidencia disponible está genuinamente dividida entre fuentes de similar autoridad (dos respuestas de empleados de Railway, en hilos distintos, que se contradicen entre sí).

### 8. Alternativas técnicas posibles si el problema existiera en producción (sin elegir ninguna)

| # | Alternativa | Descripción |
|---|---|---|
| A | Configurar `trust proxy` con una función personalizada en vez de un número | Express permite pasar una función `(ip, hopIndex) => boolean` — permitiría validar la IP del salto contra un rango/lista conocida de IPs de Railway, en vez de confiar ciegamente por cantidad. Depende de que Railway publique rangos de IP estables de su edge (no confirmado en la documentación consultada) |
| B | Obtener confirmación oficial y por escrito de Railway sobre el comportamiento exacto de `X-Forwarded-For` para este proyecto/plan específico, antes de decidir cualquier cambio de código | Cierra la incertidumbre de raíz; no requiere cambio de código si la confirmación revela que el comportamiento actual ya es seguro |
| C | Reducir `trust proxy` a `0` (no confiar en ningún proxy) | Elimina la superficie de spoofing por completo, pero agrupa a todos los usuarios reales de producción bajo la IP interna del proxy de Railway como clave única — el límite de intentos se volvería inefectivo también para tráfico legítimo (mismo problema que `trust proxy` buscó resolver originalmente, en sentido inverso) |
| D | Agregar un mecanismo de mitigación de fuerza bruta independiente de la IP (p. ej., bloqueo temporal de cuenta tras N intentos fallidos, ya señalado como riesgo remanente desde el cierre de Bloque 9) | No depende de la confiabilidad de ningún header de red; cierra el riesgo de fuerza bruta por una vía completamente distinta, en paralelo o en reemplazo del límite por IP |
| E | Agregar CAPTCHA u otro desafío interactivo tras un umbral de intentos fallidos | Mecanismo estándar de la industria para este escenario exacto, independiente de la resolución de IP |
| F | Migrar el rate-limiting de login a la capa de infraestructura/edge de Railway, si el plan contratado ofrece esa capacidad | Evita depender de la resolución de IP dentro del propio proceso de la aplicación |
| G | Mantener `trust proxy: 1` sin cambios, aceptando el riesgo documentado, condicionado a que la confirmación de la alternativa B resulte favorable | No es una alternativa técnica nueva, es la opción de no cambiar nada — se incluye por completitud, ya que "no corregir" es una decisión legítima si la validación externa (alternativa B) confirma que el riesgo no es real en producción |

**Ninguna de las 7 alternativas fue elegida ni implementada en esta etapa.**

---

## Conclusión

| Hallazgo | Categoría | Justificación |
|---|---|---|
| **H-02** — Bypass del Proxy vía `Object.getPrototypeOf()` | **REQUIERE DECISIÓN DEL PRODUCT OWNER** | El bypass está confirmado con evidencia de ejecución real (no es un falso positivo), tiene causa raíz identificada con precisión (cobertura parcial de traps de `Proxy`), y existen 5 estrategias de corrección viables, cada una con trade-offs reales de riesgo/esfuerzo/mantenimiento (sección H-02, punto 8) — ninguna es obviamente superior sin una decisión de producto sobre cuánto esfuerzo/riesgo de regresión vale la pena asumir frente a un vector que, aunque real, requiere ejecución de código dentro del backend (no es explotable directamente desde la API pública hoy, confirmado en la pregunta 6). No se lo clasifica como "corregir obligatoriamente" porque hay más de un camino razonable y el umbral de explotación no es trivial desde afuera; no se lo clasifica como "aceptable como riesgo" porque contradice directamente el criterio de aceptación que el propio proyecto documentó para H-02 ("cierra el vector por completo") |
| **H-07** — `trust proxy` / `X-Forwarded-For` | **PENDIENTE DE VALIDACIÓN EXTERNA** | La vulnerabilidad del *código* (confianza por cantidad de saltos, no por identidad) es un hecho verificado y no depende de ninguna validación externa — pero su **explotabilidad real en producción** depende enteramente de un comportamiento de infraestructura (Railway) que la documentación oficial no cubre y que las respuestas de soporte de Railway contradicen entre sí (sección H-07, punto 6). No puede clasificarse como "falso positivo" (el código tiene el problema, demostrado con ejecución real) ni como "confirmado" (no hay evidencia externa consistente de que se replique en producción) ni como "corregir obligatoriamente" (podría no haber nada que corregir si la infraestructura real ya lo neutraliza) ni como "aceptable como riesgo" (sería prematuro aceptar un riesgo cuya existencia real todavía no está determinada) — la única categoría que refleja honestamente el estado de la evidencia es pedir la validación externa antes de decidir |

Ninguno de los dos hallazgos se corrigió, se cambió de alcance, ni se generó código o parche alguno en esta etapa.

---

## Informe final

**Conclusiones:**
- H-02: bypass confirmado por ejecución real vía `Object.getPrototypeOf()`/`Reflect.getPrototypeOf()`/`__proto__` (3 vías equivalentes confirmadas); `.constructor.prototype` vía el Proxy queda neutralizado por el propio `.bind(target)` ya existente (efecto colateral, no diseño deliberado); explicado por especificación ECMA-262 (delegación por defecto de traps no implementados); es un problema de la estrategia de un solo trap, no de `Proxy` como mecanismo; no requiere más que 2-3 líneas de JavaScript deliberado, no se produce por accidente; sin ninguna ruta existente en el código actual que lo alcance sin escribir código nuevo; riesgo arquitectónico + runtime + de cadena de suministro, no explotable directamente desde la API pública hoy; 5 estrategias de corrección identificadas, ninguna elegida. Categoría: **REQUIERE DECISIÓN DEL PRODUCT OWNER**.
- H-07: comportamiento de Express/`proxy-addr` con `trust proxy` numérico documentado y explicado con precisión; confirma confianza por cantidad de saltos, no por identidad de proxy; la documentación oficial de Railway no cubre el tema, y las respuestas de soporte (de empleados identificados) se contradicen en si Railway sobrescribe o preserva `X-Forwarded-For`, y en cuál extremo del header sería confiable; 7 alternativas técnicas identificadas, ninguna elegida. Categoría: **PENDIENTE DE VALIDACIÓN EXTERNA**.

**Evidencia utilizada:**
- Código real del proyecto: `backend/src/prisma/organizacion-prisma.client.ts` (líneas 61-75, 200), `backend/src/main.ts` (línea 22), `backend/src/auth/auth.module.ts`, `backend/src/auth/auth.controller.ts`.
- Ejecución real de código (solo lectura/reflexión, sin abrir ninguna operación de escritura ni ejecutar SQL): 1 script temporal (`h02_variantes.js`), creado en el directorio de scratchpad de la sesión (fuera del repositorio), ejecutado una vez contra el código compilado (`dist/`) y Postgres local (sin realizar ninguna consulta ni transacción, solo instanciar el cliente para poder inspeccionar sus referencias), y eliminado inmediatamente después. Nunca agregado a git.
- Búsqueda de código (`grep -rn`) de los patrones `getPrototypeOf`, `__proto__`, `.constructor.prototype`, `Object.create(`, `Reflect.get` en todo `backend/src`: 0 resultados.
- `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `REVISION_IMPLEMENTACION_BLOQUE11.md` (citados como fuente de los criterios de aceptación originales y del mecanismo ya evaluado).

**Documentación externa consultada:**
- [Edge Networking | Railway Docs](https://docs.railway.com/networking/edge-networking) — documentación oficial, no cubre el tratamiento de `X-Forwarded-For`.
- [Security-Critical Questions on Edge Proxy Header Handling and Hop Count](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775) — foro de soporte oficial de Railway, respuestas de empleados (*phin*) y comunidad (*zah340*), contradictorias entre sí.
- [Edge Proxy X-Forwarded-For and X-Real-Ip can't be trusted](https://station.railway.com/questions/edge-proxy-x-forwarded-for-and-x-real-ip-c5a50049) — foro de soporte oficial de Railway, respuesta de empleado (*brody*).
- [Which header should I rely on for real client IP?](https://station.railway.com/questions/which-header-should-i-rely-on-for-real-c-d78a6f96) — foro de soporte oficial de Railway, respuesta de empleado (*sam-a*), internamente inconsistente respecto de la cita de *brody*.

**`git status --short`** (idéntico al estado previo a esta etapa — sin cambios de código, sin `git add` ejecutado):
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
?? DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
?? DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
?? DISENO_BLOQUE10.4_FRONTEND.md
?? "DISEÑO_BLOQUE11_SEGURIDAD.md"
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
(única diferencia respecto del estado inicial: la aparición de este mismo archivo, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, todavía sin agregar a git).

No se implementó ninguna corrección. No se generó código ni parches. No se modificó documentación previa. No se ejecutó ninguna prueba destructiva adicional más allá de la reflexión de solo lectura ya detallada.

Me detengo y quedo a la espera de la decisión del Product Owner antes de cualquier corrección.

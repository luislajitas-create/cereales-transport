# Bloque 7.2.b — Modelo Cognitivo y Ontología del Negocio (SDC v2)

Fecha: 2026-07-10. Documento de arquitectura conceptual pura, desde una mirada de arquitectura empresarial — **no se escribió código, no se propusieron tablas, no se propuso SQL, no se propusieron endpoints, no se diseñó ninguna pantalla ni dashboard, no se modificó el modelo de datos, no se hizo commit, no se hizo push.**

**Relación con lo anterior:** este documento construye sobre `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md`, ya aprobado, y **no lo modifica ni lo reemplaza**. 7.2.a organiza *qué capacidades analíticas necesita dirigir* una empresa de transporte de cereales (7 dominios). Este documento va un nivel más abajo y más al fondo: antes de que cualquier dominio pueda generar un indicador, una alerta o un análisis cruzado, tiene que existir una respuesta compartida a una pregunta más básica — **¿qué es, conceptualmente, cada cosa sobre la que ese dominio razona?** Sin esa respuesta común, "Viaje" podría significar una cosa distinta para Performance Operativa y para Performance Financiera, y la arquitectura de dominios de 7.2.a perdería el terreno común que la sostiene.

**Pregunta que responde este documento, y solo esta:** *¿cómo entiende SDC el negocio de una empresa de transporte de cereales, independientemente de cómo esté hoy implementado en el software?*

**Grounding:** para responder con honestidad qué representa cada concepto, este documento se apoya en el modelo real ya construido y validado en los Bloques 3-6 — no para describirlo como estructura técnica (eso está fuera de alcance), sino para asegurar que la ontología que seguirsegue no invente conceptos que no tienen correlato en lo que la organización ya usa todos los días. Ningún nombre de tabla, campo o relación técnica se usa como argumento en sí mismo — se usa solo como evidencia de que el concepto de negocio correspondiente ya existe y ya se opera.

---

# Parte 1 — Por qué un modelo cognitivo es distinto de un modelo de datos

Un modelo de datos responde "¿cómo se guarda esto?". Un modelo cognitivo responde una pregunta anterior: **"¿qué es esto, para quién existe, y por qué existe separado de lo demás?"**. La diferencia no es de detalle — es de naturaleza. Un modelo de datos puede cambiar por completo (una migración, un rediseño, un cambio de motor de base de datos) sin que cambie en nada lo que la organización entiende por "un viaje" o "una liquidación". El modelo cognitivo es lo que sobrevive a esos cambios — es, en ese sentido, lo único de esta arquitectura que puede sostener a SDC durante diez años, porque no depende de ninguna decisión técnica tomada en 2026.

Este documento evita deliberadamente cualquier lenguaje de implementación. Cuando se menciona un nombre ya familiar (Viaje, Liquidación, Factura), se lo trata como un **concepto de negocio con historia propia**, no como una tabla con columnas. La pregunta que se responde en cada caso es siempre la misma: *¿qué representa esto en la realidad de una empresa de transporte de cereales, y qué papel cognitivo cumple frente a los demás conceptos?*

---

# Parte 2 — La unidad económica fundamental: el Viaje

Antes de recorrer el resto de la ontología, conviene resolver la pregunta que la organiza a todas: **¿cuál es el hecho a partir del cual existe todo lo demás?**

La respuesta es el **Viaje**. No porque sea la entidad más grande o más compleja, sino porque es la única que cumple tres condiciones a la vez, y ninguna otra las cumple simultáneamente:

1. **Es un hecho, no un acuerdo ni un documento.** Un Viaje ocurre — algo físico se movió de un origen a un destino, en una fecha real, con un peso real. No es una promesa (como una Factura antes de cobrarse) ni una agregación posterior (como una Liquidación). Es el evento primario.

2. **De él derivan, sin excepción, tanto el ingreso como el costo del negocio.** No hay ingreso (Factura) que no provenga, en última instancia, de uno o más Viajes. No hay costo de transporte (Liquidación) que no provenga, en última instancia, de uno o más Viajes. Cualquier otro concepto financiero del sistema es, mirado con suficiente perspectiva, una forma distinta de mirar el mismo Viaje.

3. **Es el único concepto que participan, al mismo tiempo, todos los demás roles del negocio** — un Cliente que lo encarga, un Productor del que proviene la mercadería, un Transportista que lo ejecuta, un Chofer que lo conduce, un Vehículo que lo transporta, un Cereal que se mueve, un origen y un destino geográficos. Ningún otro concepto de la ontología reúne a tantos actores distintos alrededor de un mismo hecho.

Esta conclusión no es nueva en el proyecto — es la misma que ya había emergido, desde el ángulo analítico, en `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` (el "resultado económico de un viaje" como el Análisis Cruzado de mayor valor). Lo que este documento agrega es la razón ontológica de fondo: no es que el Viaje resulte ser útil para calcular rentabilidad — es que el Viaje **es**, estructuralmente, la unidad económica del negocio, y la rentabilidad es apenas una de las preguntas que se le pueden hacer.

---

# Parte 3 — Las cuatro clases de conceptos

Antes de recorrer entidad por entidad, conviene establecer una distinción que atraviesa a toda la ontología: no todos los conceptos cumplen el mismo papel cognitivo. Se distinguen cuatro clases:

## Clase I — Identidad (actores y categorías)

Representan **quién o qué participa**, no un hecho fechado. Existen antes de cualquier Viaje y persisten después de él. No generan valor económico por sí mismos — son el vocabulario con el que se describe a quien sí lo genera.

*Ejemplos: Cliente, Transportista, Chofer, Vehículo, Productor, Cereal, Ubicación.*

## Clase II — Hecho económico (eventos fechados)

Representan **algo que ocurrió**, en un momento determinado, y que no puede deshacerse sin dejar rastro (solo anularse explícitamente). Es la clase que genera conocimiento nuevo — antes de que el hecho ocurriera, esa información no existía en ningún lado.

*Ejemplos: Viaje, Anticipo, Cobranza.*

## Clase III — Materialización (documentos que empaquetan hechos en una forma financiera o legal)

No generan un hecho nuevo — **formalizan, agrupan o documentan** hechos que la Clase II ya produjo, bajo una lógica y un ritmo propios (contable, fiscal, de tesorería). Si desaparecieran, el hecho económico subyacente seguiría siendo cierto — lo que desaparecería es su forma reconocible para pagar, cobrar o declarar.

*Ejemplos: Liquidación, Factura.*

## Clase IV — Memoria y gobierno

No describen al negocio — describen **lo que el sistema sabe sobre sí mismo**: quién hizo qué, cuándo cambió el estado de algo, quién autorizó una excepción. Sostienen la confianza en las otras tres clases, pero no participan del hecho económico en sí.

*Ejemplos: registro de cambios de estado, registro de auditoría, y el propio concepto de Usuario en su rol de responsable de una acción (no como actor de negocio).*

Esta clasificación es, deliberadamente, distinta de la clasificación "transaccional / financiero / operativo / analítico" que se retoma en la Parte 6 — esa clasifica **de qué naturaleza es la información**; esta clasifica **qué papel cognitivo cumple**. Un mismo concepto puede ser, por ejemplo, financiero (Parte 6) y de Clase III (Parte 3) a la vez — son dos preguntas distintas sobre el mismo concepto.

---

# Parte 4 — Ontología, concepto por concepto

## Viaje

**Qué representa:** el hecho económico primario del negocio — el movimiento real de una carga de cereal desde un origen hasta un destino, en una fecha determinada, ejecutado por un chofer y un vehículo de un transportista, encargado por un cliente, y originado en la producción de un productor. Es, como se estableció en la Parte 2, la unidad económica fundamental de SDC.

**Clase:** II — Hecho económico. **Naturaleza:** operativo en su ejecución, pero es la semilla de todo lo financiero que sigue.

**Cómo se relaciona con el resto:** todo lo demás en la ontología, salvo los conceptos de identidad puros, existe en función de uno o más Viajes — directamente (Liquidación, Factura) o indirectamente (Comisión, Anticipo cuando está asociado a un viaje).

## Liquidación

**Qué representa:** el acto de **formalizar cuánto se le debe pagar** a un transportista o a un chofer por un conjunto de Viajes ejecutados en un período determinado, una vez descontada la comisión pactada, los anticipos ya entregados y cualquier otro ajuste. No es un hecho nuevo — es la conversión de varios hechos (Viajes) y de otro hecho previo (Anticipos) en una única cifra a pagar, con una fecha y un estado propios (de borrador a pagada).

**Clase:** III — Materialización del costo. **Naturaleza:** financiera, con una dimensión temporal propia (un período, no una fecha puntual como el Viaje).

**Cómo se relaciona con el resto:** agrupa Viajes (el costo de cada uno) y Anticipos (lo ya entregado) en una sola posición neta. No compite con el Viaje como unidad económica — lo hereda y lo reorganiza según el ritmo con el que el negocio paga a quien transporta.

## Factura

**Qué representa:** el acto de **formalizar el derecho a cobrar** a un cliente por uno o más Viajes ya realizados. Es la contraparte, del lado del ingreso, de lo que la Liquidación es del lado del costo — misma lógica, otra dirección.

**Clase:** III — Materialización del ingreso. **Naturaleza:** financiera y fiscal — a diferencia de la Liquidación, tiene una consecuencia legal frente a un tercero (el cliente, y potencialmente el fisco) que la Liquidación, al ser interna, no tiene de la misma forma.

**Cómo se relaciona con el resto:** agrupa Viajes del lado del ingreso, igual que la Liquidación los agrupa del lado del costo. Una misma carga de cereal, entonces, deja huella en ambas materializaciones a la vez — es exactamente ese doble reflejo del mismo Viaje lo que hace posible, más adelante, calcular su resultado económico.

## Cobranza

**Qué representa:** el hecho, distinto de la Factura, de que el dinero efectivamente entró. Una Factura es una promesa formalizada; una Cobranza es el cumplimiento, total o parcial, de esa promesa. Pueden existir varias Cobranzas para una misma Factura, y puede pasar un tiempo considerable entre una y otra — ese tiempo es, en sí mismo, información de negocio (mora, cartera).

**Clase:** II — Hecho económico (es un evento fechado y real: el dinero entró tal día, por tal importe), aunque depende de que exista antes una Factura de Clase III. Es, junto con el Anticipo, uno de los pocos hechos económicos que no son, en sí mismos, la unidad fundamental (el Viaje) sino una consecuencia posterior de ella.

**Naturaleza:** financiera, de tesorería específicamente — no de facturación.

## Cliente

**Qué representa:** quién encarga y paga el transporte — la contraparte comercial y fiscal de cada Viaje y de cada Factura. Es un concepto de identidad, no de hecho: el Cliente existe independientemente de que en un momento dado tenga o no Viajes activos.

**Clase:** I — Identidad. **Naturaleza:** comercial.

**Distinción importante:** el Cliente no es necesariamente quien produjo la mercadería — ese es un rol distinto, el del Productor. SDC ya modela correctamente esa distinción como dos roles independientes de un mismo Viaje, reflejando cómo funciona realmente el comercio de granos (un productor puede vender a través de un intermediario o acopio que es, comercialmente, el Cliente).

## Transportista

**Qué representa:** la entidad legal y económica con la que SDC contrata el servicio de transporte, y a quien SDC le paga (vía Liquidación) por los Viajes ejecutados con su flota y sus choferes. Es el "empleador" o contraparte comercial del lado de la capacidad de transporte, así como el Cliente lo es del lado de la demanda.

**Clase:** I — Identidad. **Naturaleza:** comercial/operativa.

## Chofer

**Qué representa:** la persona que efectivamente conduce y ejecuta el Viaje. A diferencia del Vehículo, el Chofer tiene un interés económico propio y directo en el resultado del Viaje — una comisión pactada — lo que lo distingue de un simple recurso operativo y lo acerca, en algunos aspectos, a un actor económico con voz propia dentro de la Liquidación.

**Clase:** I — Identidad, aunque con una carga económica (la comisión pactada) que ningún otro concepto de identidad tiene de la misma forma.

**Cómo se relaciona con el resto:** pertenece a un Transportista, pero puede ser destinatario directo de una Liquidación (existen liquidaciones de tipo Chofer, distintas de las de tipo Transportista) — reflejo de que, en la práctica del negocio, a veces se liquida a la empresa de transporte y a veces directamente a la persona que condujo.

## Vehículo

**Qué representa:** la capacidad física con la que se ejecuta un Viaje — el camión y, cuando corresponde, el acoplado. A diferencia del Chofer, no tiene interés económico propio: no cobra comisión, no es destinatario de una Liquidación. Su relevancia de negocio es de capacidad y de cumplimiento (documentación vigente), no de reparto económico.

**Clase:** I — Identidad. **Naturaleza:** operativa, con una dimensión de riesgo/cumplimiento (vencimientos documentales) que lo conecta directamente con el dominio Riesgos de `BLOQUE7.2.a`.

## Productor

**Qué representa:** el origen real de la mercadería transportada — quien la produjo, más allá de quién la vende o la encarga transportar (el Cliente). Es un rol opcional en cada Viaje, lo cual en sí mismo es información de negocio: no todo Viaje tiene un origen productivo identificado con precisión, y esa ausencia no es un error de captura, es a veces la realidad del negocio (mercadería que ya cambió de mano antes de llegar a SDC).

**Clase:** I — Identidad. **Naturaleza:** comercial, del lado del origen de la cadena, no del cliente final.

## Anticipo

**Qué representa:** dinero que se le entrega a un chofer o transportista **antes** de que exista una Liquidación formal que lo reconozca — un adelanto de un gasto o de una parte de lo que, eventualmente, la Liquidación va a reconocer como suyo. Es, cognitivamente, un caso particular: es un hecho económico real (el dinero salió, en una fecha concreta) que **todavía no tiene su materialización correspondiente** — queda en un estado de espera hasta que una Liquidación lo absorba y lo descuente del neto a pagar.

**Clase:** II — Hecho económico, con una característica única entre todos los conceptos de esta clase: nace **pendiente de materialización**, algo que ni el Viaje ni la Cobranza tienen de la misma forma (el Viaje se materializa casi siempre por partida doble —costo y venta—, la Cobranza ya presupone que la Factura existió antes).

**Naturaleza:** financiera, aunque su origen suele ser operativo (un gasto de ruta, un adelanto personal al chofer).

## Comisión

**Qué representa:** a diferencia de todos los conceptos anteriores, la Comisión **no es una cosa, es una regla** — la proporción del valor de un Viaje que le corresponde al Chofer (o al Transportista) que lo ejecutó. Existe en dos momentos distintos y con dos naturalezas distintas:

- **Como acuerdo permanente** (la comisión pactada con un Chofer), que no está atada a ningún Viaje en particular — es una condición general de la relación comercial.
- **Como instancia aplicada** a un Viaje concreto dentro de una Liquidación, que puede coincidir con el acuerdo permanente o apartarse de él de forma excepcional (un override), quedando ese apartamiento registrado como un hecho de gobierno (Clase IV) porque altera, caso por caso, una regla que en principio debería ser estable.

**Clase:** no encaja limpiamente en ninguna de las cuatro — es, en rigor, una **relación de reparto**, no un hecho ni una identidad ni una materialización. Es la regla que conecta al Viaje (que genera el valor) con el Chofer (que recibe una parte de él), y su instancia aplicada vive dentro de la Liquidación que la ejecuta.

**Por qué importa distinguirla así:** tratar a la Comisión como si fuera un dato más de la Liquidación esconde una pregunta de gobernanza real — ¿cuándo un apartamiento del acuerdo permanente es una excepción legítima y cuándo es un problema de control? Esa pregunta ya está resuelta parcialmente en el sistema (el override queda registrado), pero **como regla de negocio, no como simple campo numérico** — es la distinción que este documento quiere dejar explícita.

---

# Parte 5 — Mapa de relaciones conceptuales

No es un diagrama de entidades ni de tablas — es la forma en que los conceptos se necesitan unos a otros para tener sentido.

```
                         PRODUCTOR ──(origen de)──▶
                                                      \
CLIENTE ──(encarga/paga)──▶                            VIAJE ◀──(ejecuta)── TRANSPORTISTA
                                                       /  |  \                    │
                          CEREAL ──(qué se mueve)────▶   |    ◀──(pertenece a)────┤
                     UBICACIÓN (origen/destino) ────▶    |                        │
                                                          |                     CHOFER ── comisión (regla) ──▶ (aplicada dentro de)
                                                          |                        │
                              ┌───────────────────────────┴────────────────────┐  VEHÍCULO (capacidad, sin interés económico propio)
                              ▼                                                  ▼
                        FACTURA (materializa el ingreso)          LIQUIDACIÓN (materializa el costo)
                              │                                                  │
                              ▼                                                  ▼
                        COBRANZA (realiza el ingreso en caja)         ANTICIPO (adelanto previo, absorbido acá)
```

Dos lecturas quedan explícitas en este mapa:

1. El Viaje es el único punto por el que pasan, a la vez, la rama de ingreso (Factura → Cobranza) y la rama de costo (Liquidación ← Anticipo). Ninguna otra entidad tiene esa posición central.
2. La Comisión no aparece como un nodo del mapa — aparece como una etiqueta sobre la relación entre el Viaje/Chofer y la Liquidación, justamente porque es una regla, no una cosa (Parte 4).

---

# Parte 6 — Clasificación por naturaleza: transaccional, financiero, operativo, analítico

Distinta de la clasificación por clase cognitiva (Parte 3) — esta responde **de qué tipo de información se trata**, no qué papel cumple.

| Concepto | Transaccional | Financiero | Operativo | Analítico |
|---|---|---|---|---|
| Viaje | Sí (es la transacción primaria) | — | Sí | — |
| Liquidación | Sí (registra un evento de cierre) | Sí | — | — |
| Factura | Sí | Sí | — | — |
| Cobranza | Sí | Sí | — | — |
| Anticipo | Sí | Sí | Parcial (origen operativo) | — |
| Comisión | — (es regla, no transacción) | Sí | — | — |
| Cliente | — | — | — (identidad, no operación) | — |
| Transportista | — | — | — | — |
| Chofer | — | — | Sí (ejecuta operación) | — |
| Vehículo | — | — | Sí | — |
| Productor | — | — | — | — |

**La columna Analítico queda vacía a propósito.** Ninguno de los conceptos que hoy sostiene el negocio de SDC es, en sí mismo, un concepto analítico — todos son transaccionales, financieros o operativos, es decir, describen al negocio tal como ocurre, no lo interpretan. Lo analítico no es un concepto adicional que falte agregar a esta lista: es exactamente lo que describe `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` — una capa que se apoya *sobre* esta ontología para producir conocimiento nuevo (indicadores, análisis cruzados, alertas), sin agregarle a la ontología ningún concepto propio. Es la confirmación, desde este documento, de por qué 7.2.a tuvo que construirse como una capa aparte y no como una extensión de los conceptos ya existentes.

---

# Parte 7 — Qué genera conocimiento y qué solo lo materializa

Distinción explícita, porque el usuario la pidió como pregunta propia y porque atraviesa a toda la Parte 4:

**Genera conocimiento nuevo (no existía antes de que el hecho ocurriera):**
- El **Viaje** — es el único que crea valor económico real donde antes no había ninguno.
- El **Anticipo** — crea una obligación real (dinero que efectivamente salió) antes de cualquier documento que la reconozca formalmente.
- La **Cobranza** — crea la certeza de que un ingreso prometido se volvió, efectivamente, caja.

**Solo materializa conocimiento que ya existía en otro lado:**
- La **Liquidación** — no crea costo, empaqueta el costo que los Viajes y los Anticipos ya habían generado, bajo el ritmo de un período de pago.
- La **Factura** — no crea ingreso, documenta con validez legal un ingreso que el Viaje ya había generado.

**No genera ni materializa — define una regla que otros hechos ejecutan:**
- La **Comisión** — no es un hecho ni un documento, es la condición que determina cómo se reparte lo que el Viaje generó.

**Ni generan ni materializan valor económico — describen a los actores:**
- Cliente, Transportista, Chofer, Vehículo, Productor — existen para que los hechos económicos tengan sentido, pero no son, ellos mismos, hechos.

---

# Parte 8 — Relación con los 7 dominios de `BLOQUE7.2.a`

Sin modificar ni reabrir ese documento, esta ontología explica *por qué* sus dominios están organizados como están:

- **Estado Operativo y Performance Operativa** leen, sobre todo, la Clase II (el Viaje como hecho) y la Clase I operativa (Chofer, Vehículo).
- **Performance Comercial** lee la Clase I comercial (Cliente, Productor) contra el Viaje.
- **Performance Financiera** es, casi en su totalidad, la lectura conjunta de la Clase III (Liquidación, Factura) y la Clase II financiera (Anticipo, Cobranza) — es, en este sentido, el dominio que más directamente convierte "materialización" en conocimiento de negocio.
- **Riesgos** relee, bajo una lente de exposición, tanto hechos (Anticipos sin liquidar) como atributos de identidad con vencimiento (documentación del Chofer y el Vehículo).
- **Gobierno** es, casi literalmente, la Clase IV completa — y es, en particular, el dominio dueño de la pregunta sobre cuándo una Comisión aplicada se apartó de la pactada.

Esta correspondencia no estaba escrita en 7.2.a de forma explícita — surge naturalmente de tener ahora una ontología común. Es, en sí misma, la prueba de que ambos documentos son coherentes entre sí sin haberse modificado uno al otro.

---

# Parte 9 — Cómo debería pensar SDC el negocio, independientemente de la tecnología

Síntesis de todo lo anterior en un conjunto de afirmaciones que deberían sobrevivir a cualquier reescritura técnica del sistema:

1. El Viaje es la unidad económica fundamental — todo lo financiero es una forma distinta de mirarlo, nunca un hecho independiente de él.
2. Hay una diferencia real entre generar valor y documentarlo — Liquidación y Factura no son "lo mismo que el Viaje pero en otra tabla", son actos de un tipo cognitivo distinto (materialización), con su propio ritmo y su propia lógica.
3. Los actores (Cliente, Transportista, Chofer, Vehículo, Productor) son vocabulario, no hechos — su valor está en darle sentido a los hechos, no en generar valor por sí mismos.
4. Una regla de reparto (la Comisión) no es un dato — es una relación entre dos conceptos (el Viaje que genera valor, el Chofer que recibe una parte), y merece tratarse con ese peso, especialmente cuando se aparta de lo pactado.
5. Lo analítico no es una entidad más — es una capa que interpreta a las demás, y por eso puede evolucionar (nuevos indicadores, nuevos cruces, eventualmente IA) sin que la ontología de base tenga que cambiar.
6. La confianza en el sistema (Clase IV) no es un accesorio de auditoría — es la condición que hace que las otras tres clases sean creíbles.

---

# Parte 10 — Qué queda explícitamente fuera de este documento

- Cualquier tabla, campo, tipo de dato o relación técnica — lo que se nombró de la implementación actual fue solo evidencia de que el concepto de negocio ya existe, nunca una propuesta.
- Cualquier pantalla, dashboard o reporte.
- Cualquier decisión de tecnología.
- El diseño de los dominios analíticos (eso ya está resuelto y aprobado en `BLOQUE7.2.a`, y no se reabre acá).
- Cualquier cambio al modelo de datos actual — esta ontología describe lo que el negocio ya es, no propone qué debería agregarse o cambiarse en el sistema.

---

# Parte 11 — Puntos conceptuales pendientes de discusión

Este documento no se da por aprobado. Antes de continuar con los siguientes sub-bloques, estos puntos merecen conversación explícita:

1. **¿La Comisión debería tratarse, hacia adelante, como una regla de negocio de primera clase (con su propio ciclo de vida, versión pactada vs. aplicada) en vez de como un atributo dentro de otros conceptos?** Este documento la identifica como conceptualmente distinta de todo lo demás (Parte 4), pero no resuelve qué implica eso para el resto de la arquitectura — es una pregunta abierta, no una conclusión.

2. **¿Es correcto que el Productor sea un rol opcional, o esa opcionalidad esconde una pérdida de trazabilidad que el negocio debería resolver?** La ontología documenta la opcionalidad como reflejo de la realidad del negocio (Parte 4), pero no evalúa si esa realidad es la deseada o simplemente la heredada.

3. **¿El Vehículo debería seguir sin interés económico propio en la ontología, o hay escenarios de negocio (alquiler de flota, tercerización de acoplados) donde eso deja de ser cierto?** Se asumió que el Vehículo es puramente un recurso de capacidad — vale la pena confirmar que esa es una verdad estable del negocio y no una simplificación del momento.

4. **¿La distinción entre Clase II (hecho) y Clase III (materialización) debería tener alguna consecuencia de gobernanza explícita** — por ejemplo, ¿debería ser más difícil (o quedar más visiblemente auditado) anular una Factura o una Liquidación que anular un Anticipo, dado que las primeras dos son materializaciones con consecuencia legal y la segunda es un hecho interno?

5. **¿Existen otros conceptos-regla, como la Comisión, que este documento no haya identificado?** Por ejemplo, ¿la condición comercial de un Cliente (plazo de pago, descuentos) es también una "relación" con la misma naturaleza dual (pactada vs. aplicada) que la Comisión, y merece el mismo tratamiento conceptual?

6. **¿Esta ontología debe revisarse cada vez que el negocio incorpore un concepto nuevo (por ejemplo, si en el futuro se integra el peso real de báscula, ya señalado como pregunta abierta en `BLOQUE7_ROADMAP_FUNCIONAL.md`), o solo cuando ese concepto altere la unidad económica fundamental?** No se resuelve acá qué tan seguido debería revisitarse este documento — solo se señala que la pregunta existe.

---

## Cierre

Este documento no propone ninguna implementación, ninguna tabla, ningún cambio al sistema. Establece que el Viaje es la unidad económica fundamental de SDC, distingue cuatro clases cognitivas de conceptos (Identidad, Hecho económico, Materialización, Memoria y gobierno), recorre once conceptos centrales del negocio bajo esa lente, y confirma —sin modificarla— la coherencia de `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` desde un nivel más profundo.

**No se da nada por aprobado.** Los seis puntos de la Parte 11 quedan explícitamente abiertos para discusión antes de avanzar a cualquier sub-bloque posterior que se apoye en esta ontología.

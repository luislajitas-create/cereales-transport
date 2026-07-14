# Bloque 7.2.c — Arquitectura del Ciclo de Vida del Conocimiento (SDC v2)

Fecha: 2026-07-10. Documento de arquitectura conceptual pura — **no se escribió código, no se propusieron tablas, no se propuso SQL, no se propusieron endpoints, no se diseñó ninguna pantalla ni dashboard, no se modificó el modelo de datos, no se hizo commit, no se hizo push.**

**Relación con lo anterior:** este documento construye sobre `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` y `BLOQUE7.2.b_MODELO_COGNITIVO_ONTOLOGIA.md`, ambos aprobados, y **no modifica ni reabre ninguno de los dos**. 7.2.a respondió *qué dominios* necesita dirigir el negocio. 7.2.b respondió *qué es*, ontológicamente, cada concepto. Ninguno de los dos respondió una tercera pregunta, distinta de las anteriores: **¿cómo viaja la información dentro de SDC, desde que un hecho ocurre hasta que se convierte en una decisión — y qué gana y qué pierde en el camino?** Esa es la pregunta de este documento.

**Pregunta que responde este documento, y solo esta:** *¿cuáles son las etapas por las que atraviesa el conocimiento dentro de SDC, en qué orden, con qué ritmo cada una, y qué se transforma en cada paso?*

---

# Parte 1 — Por qué hace falta una vista de proceso, además de las vistas de estructura

7.2.a y 7.2.b son, los dos, **vistas estáticas**: uno organiza el negocio en dominios que coexisten al mismo tiempo, el otro clasifica a los conceptos en clases que también coexisten al mismo tiempo. Ninguno de los dos cuenta una historia — dicen qué hay, no cómo llegó a estar ahí ni hacia dónde va después.

Pero el conocimiento en SDC no aparece completo de una sola vez. Un Viaje ocurre en un instante; el margen que ese Viaje dejó, comparado con el del mes anterior, en un Dashboard Ejecutivo, es una idea que solo existe después de que ese hecho atravesó varias transformaciones sucesivas. Sin una vista de proceso, la arquitectura conceptual de SDC describiría bien el "mapa" pero no el "viaje" — y es precisamente ese viaje el que determina cuánto tarda una pregunta en poder responderse, y qué tan confiable es la respuesta en cada punto del camino.

---

# Parte 2 — Las cinco etapas del ciclo de vida del conocimiento

```
Etapa 0          Etapa 1              Etapa 2               Etapa 3                  Etapa 4
EL HECHO    ──▶  LA MATERIALIZACIÓN ─▶ LA SEMÁNTICA        ─▶ LA MADURACIÓN         ─▶ EL CONSUMO
(Viaje,          (Liquidación,          COMPARTIDA            ANALÍTICA               (Dashboard, Reporte,
Anticipo,        Factura)               (el glosario único    (dentro de un            KPI, Alerta,
Cobranza)                               de 7.2.a, Parte 3)     dominio de 7.2.a)         Insight, IA)

  Clase II            Clase III          condición            capacidad                acción humana
  (7.2.b)              (7.2.b)           transversal          analítica                 o automática
                                          (7.2.a)              (7.2.a, Parte 4)
```

## Etapa 0 — El Hecho

**Qué transforma:** nada todavía — es el origen. La realidad genera información nueva: un Viaje se ejecuta, un Anticipo se entrega, una Cobranza ingresa.

**Gobernada por:** Clase II de `BLOQUE7.2.b` (Hecho económico).

**Ritmo:** instantáneo — ocurre en el momento en que ocurre, sin ritmo propio más allá del de la operación real.

**Qué gana / qué pierde:** en este punto el conocimiento es máximamente detallado y mínimamente interpretado. No hay todavía ninguna pregunta de negocio respondida — solo un registro de que algo real sucedió.

## Etapa 1 — La Materialización

**Qué transforma:** el Hecho se empaqueta bajo una lógica financiera o legal propia — se convierte en Liquidación (del lado del costo) o en Factura (del lado del ingreso). No se reinterpreta el hecho, se lo reorganiza según el ritmo con el que el negocio paga y cobra.

**Gobernada por:** Clase III de `BLOQUE7.2.b` (Materialización).

**Ritmo:** periódico — a diferencia del Hecho, la Materialización no ocurre en el instante en que el Hecho ocurrió, sino en el momento en que el negocio decide cerrar un período (liquidar) o emitir un documento (facturar). Es la primera etapa donde aparece una demora deliberada entre que algo pasó y que quedó formalizado.

**Qué gana / qué pierde:** gana validez formal (algo que se puede pagar, cobrar o declarar); pierde granularidad — varios Hechos quedan agrupados bajo una sola cifra de período.

## Etapa 2 — La Semántica Compartida

**Qué transforma:** antes de que cualquier cálculo ocurra sobre un Hecho o una Materialización, ambos se leen a través de definiciones únicas y comunes — qué es un "período", cuándo algo está "vencido", qué cuenta como "activo", cómo se define un "margen" (`BLOQUE7.2.a`, Parte 3).

**Gobernada por:** ninguna clase ni dominio específico — es, por diseño, transversal a todos.

**Ritmo:** constante — a diferencia de las demás etapas, esta no es un evento que ocurre una vez por Hecho, es una condición siempre vigente que se aplica cada vez que cualquier otra etapa necesita interpretar un dato.

**Por qué es la etapa más silenciosa y más peligrosa de omitir:** no produce, por sí sola, ningún resultado visible — no hay una pantalla que muestre "la Semántica Compartida de hoy". Por eso es la etapa que más fácil se salta en la práctica (cada consumidor define su propio "vencido", como ya le pasó al Dashboard actual) y también la que, si falla, hace que todo lo que viene después parezca correcto sin serlo — dos indicadores que dicen cosas distintas sobre la misma pregunta, sin que nadie note por qué.

## Etapa 3 — La Maduración Analítica

**Qué transforma:** el Hecho, ya materializado y leído con semántica común, se convierte en conocimiento de negocio dentro de un Dominio de `BLOQUE7.2.a`. Esta etapa no es un solo paso — tiene, ella misma, cuatro profundidades sucesivas, ya definidas en 7.2.a, Parte 4:

1. **Información Directa** — el estado tal cual, sin agregación.
2. **Indicador** — una agregación dentro de un dominio.
3. **Análisis Cruzado** — una combinación entre dominios (el caso central: el resultado económico de un Viaje).
4. **Alerta/Umbral** — el mismo conocimiento anterior, con una condición de disparo y un destinatario agregados.

Estas cuatro profundidades son, dentro de la Etapa 3, una **escalera de maduración del mismo conocimiento** — no cuatro tipos de dato distintos. Un mismo número (el margen de un cliente) puede existir como Indicador para un análisis puntual y, con el agregado de un umbral, convertirse en Alerta sin dejar de ser, en el fondo, la misma pieza de conocimiento.

**Gobernada por:** el Dominio correspondiente de `BLOQUE7.2.a` (Performance Financiera, Performance Operativa, etc.), bajo la Semántica Compartida de la Etapa 2.

**Ritmo:** bajo demanda o recurrente, según el consumidor — un Indicador se puede recalcular cada vez que alguien pregunta, o de forma periódica; una Alerta necesita, además, un chequeo continuo del umbral.

**Qué gana / qué pierde:** gana significado de negocio (deja de ser un número y pasa a responder una pregunta real); pierde, cada vez más a medida que sube de profundidad, la traza directa hacia el Hecho individual que lo originó — de ahí la importancia de la Parte 4.

## Etapa 4 — El Consumo

**Qué transforma:** el conocimiento ya maduro llega a alguien (o, en el futuro, a algo) que decide — Dashboard Ejecutivo, Reporte de Rentabilidad, Centro de Alertas, un Insight automático, una futura recomendación de IA. Es la única etapa de las cinco cuyo destino no es otro dato, sino una acción.

**Gobernada por:** el consumidor específico, que — según el principio ya establecido en 7.2.a — solo lee, nunca recalcula.

**Ritmo:** bajo demanda (alguien abre un Dashboard) o proactivo (una Alerta llega sin que nadie la pida).

**Qué gana / qué pierde:** gana relevancia inmediata para quien decide; pierde, casi por completo, la posibilidad de reconstruir el detalle bruto sin volver explícitamente a buscarlo — una cifra de margen mensual en un Dashboard Ejecutivo no muestra, por sí sola, cuáles Viajes la componen.

---

# Parte 3 — No todo hecho recorre las cinco etapas completas

El ciclo descrito en la Parte 2 es el camino completo para un **Hecho económico** (Clase II): un Viaje siempre puede, en principio, llegar a materializarse (Liquidación, Factura) antes de convertirse en conocimiento de dominio.

Pero no todo lo que termina siendo conocimiento de negocio nace de un Hecho económico. Un ejemplo ya señalado en 7.2.a y 7.2.b: el vencimiento de la licencia de un Chofer, o del seguro de un Vehículo, es un atributo de un concepto de **Identidad** (Clase I) — no hay ningún Hecho económico ni ninguna Materialización de por medio. Ese dato salta directo de un cambio de atributo (Etapa 0, en una versión más simple — "algo cambió", no "algo se transó") a la Etapa 2 (Semántica: qué significa "por vencer") y de ahí a la Etapa 3 dentro del dominio Riesgos, sin pasar por la Etapa 1.

**Esto no es una excepción que rompe el modelo — es parte de él.** El ciclo de cinco etapas es el camino más largo, no el único válido. Cada concepto recorre las etapas que su propia naturaleza (Parte 3 de 7.2.b) le exige, ni una más.

---

# Parte 4 — Qué se gana y qué se pierde: la abstracción creciente y el rol de Gobierno

A medida que el conocimiento avanza de la Etapa 0 a la Etapa 4, gana significado y pierde detalle — es una relación inversa constante a lo largo de todo el ciclo. Un Hecho individual (un Viaje) es completamente específico pero no responde, por sí solo, ninguna pregunta de gestión; un número en un Dashboard Ejecutivo responde una pregunta de gestión importante pero ya no permite, con solo mirarlo, saber qué lo compone.

Esta pérdida de detalle es necesaria — nadie puede dirigir un negocio mirando cada Viaje uno por uno — pero **no puede ser una pérdida irreversible**. Ahí es donde entra el dominio Gobierno de `BLOQUE7.2.a`, y la Clase IV de `BLOQUE7.2.b`: su función, a lo largo de todo este ciclo, es garantizar que **cualquier cifra en la Etapa 4 pueda reconstruirse hacia atrás hasta el Hecho o los Hechos de la Etapa 0 que la originaron**, aunque esa reconstrucción no sea el camino habitual de consulta. La trazabilidad no es una etapa más del ciclo — es la condición que hace que las cuatro pérdidas de detalle sucesivas (Etapas 1 a 4) sean aceptables en vez de ser, simplemente, información perdida.

---

# Parte 5 — El ciclo se cierra, no termina

Llamar a esto "ciclo de vida" y no "cadena de producción" es deliberado: la Etapa 4 no es el final del recorrido, es el punto donde el conocimiento vuelve a tocar la realidad y genera nuevos Hechos.

Un ejemplo concreto, ya anticipado en `BLOQUE7.2.b` (Parte 11, punto 1): si un Análisis Cruzado en el dominio Performance Financiera revela que la Comisión aplicada a un Chofer se aparta sistemáticamente de la pactada, esa información —ya consumida por Gerencia en la Etapa 4— puede derivar en una decisión de renegociar la Comisión pactada. Esa renegociación no es un dato más del sistema: es una decisión de negocio que, a partir de ese momento, va a cambiar cómo se generan los próximos Hechos (los próximos Viajes de ese Chofer, liquidados bajo una condición distinta).

El ciclo, entonces, no es una línea recta de cinco pasos — es un círculo donde la Etapa 4 realimenta a la Etapa 0. Esto es, en el fondo, la razón de ser de toda esta arquitectura: el conocimiento no existe para describir el pasado, existe para cambiar cómo se generan los hechos futuros.

---

# Parte 6 — Ritmos distintos, un solo reloj conceptual

| Etapa | Ritmo | Por qué |
|---|---|---|
| 0 — El Hecho | Instantáneo | Ocurre cuando la operación real ocurre, sin demora propia |
| 1 — Materialización | Periódico | Se acumula hasta el cierre de un período (liquidar) o el momento de emitir un documento (facturar) |
| 2 — Semántica Compartida | Constante | No es un evento, es una condición siempre vigente |
| 3 — Maduración Analítica | Bajo demanda o recurrente | Depende de si el dominio la recalcula al consultarse o en lote; las Alertas necesitan, además, vigilancia continua del umbral |
| 4 — Consumo | Bajo demanda o proactivo | Un Dashboard se abre; una Alerta llega sin pedirse |

Esta tabla explica, desde la arquitectura conceptual, un fenómeno que de otro modo parecería una inconsistencia técnica: por qué el dominio Estado Operativo (cerca de la Etapa 0) se siente "siempre actualizado" mientras que Performance Financiera (que depende de la Etapa 1, periódica) se siente "por lotes". No es una limitación de implementación — es una diferencia real en la naturaleza del conocimiento de cada dominio, heredada de en qué etapa del ciclo se apoya principalmente.

---

# Parte 7 — Una pregunta real recorriendo las cinco etapas

Para hacer concreto el modelo, se traza el recorrido completo de una de las 20 preguntas priorizadas en `BLOQUE7.1_MAPA_INDICADORES.md`: **"¿qué cliente deja mayor utilidad?"**

1. **Etapa 0:** ocurren múltiples Viajes para distintos Clientes, cada uno con su toneladas, tarifa y ejecución real.
2. **Etapa 1:** cada Viaje queda reflejado en una Factura (su ingreso) y en una Liquidación (su costo) — dos materializaciones independientes del mismo Hecho.
3. **Etapa 2:** antes de comparar nada, se aplica la definición común de "período" (¿el mes calendario? ¿el ciclo de facturación?) y de "utilidad" (¿bruta? ¿neta de qué conceptos?) — sin esta etapa, dos personas podrían calcular "la misma" utilidad y obtener números distintos.
4. **Etapa 3:** dentro de Performance Financiera, el Análisis Cruzado combina la Factura y la Liquidación de cada Viaje agrupado por Cliente, produciendo el Indicador de utilidad por Cliente.
5. **Etapa 4:** ese Indicador llega a un Dashboard Ejecutivo, donde un Director General lo consume para decidir a qué cliente priorizar.

Y el ciclo se cierra (Parte 5): si el Director General decide renegociar la tarifa con el cliente de menor utilidad, esa decisión va a generar, de ahí en adelante, nuevos Viajes con una tarifa distinta — nuevos Hechos, en la Etapa 0, ya influidos por el conocimiento que el ciclo anterior produjo.

---

# Parte 8 — Relación con `BLOQUE7.2.a` y `BLOQUE7.2.b`

Sin modificar ni reabrir ninguno de los dos:

- Las **Etapas 0 y 1** de este documento son, exactamente, las Clases II y III de `BLOQUE7.2.b` — este documento no les agrega nada, les agrega el ritmo con el que ocurren.
- La **Etapa 2** es la Parte 3 ("semántica compartida") de `BLOQUE7.2.a`, ahora ubicada explícitamente en el tiempo — no como un concepto abstracto sino como el punto exacto del ciclo donde, si falta, todo lo posterior queda en riesgo.
- La **Etapa 3** es, punto por punto, la Parte 4 de `BLOQUE7.2.a` ("la profundidad analítica") — este documento no la redefine, muestra que sus cuatro niveles son etapas sucesivas de una misma transformación, no categorías paralelas.
- La **Etapa 4** es la Parte 7 de `BLOQUE7.2.a` (la relación con los consumidores futuros), ahora entendida como el punto donde el ciclo se cierra sobre sí mismo (Parte 5 de este documento), algo que 7.2.a no había señalado porque su vista era estructural, no temporal.

Los tres documentos, juntos, responden ahora tres preguntas distintas y complementarias sobre la misma realidad: **qué dirige el negocio** (7.2.a), **qué es cada cosa** (7.2.b), y **cómo se mueve el conocimiento entre una y otra** (7.2.c).

---

# Parte 9 — Qué queda explícitamente fuera de este documento

- Cualquier tabla, campo, tipo de dato o mecanismo técnico de cómputo, almacenamiento o actualización.
- Cualquier pantalla, dashboard o reporte específico — el ejemplo de la Parte 7 traza un recorrido conceptual, no diseña el Dashboard Ejecutivo.
- Cualquier decisión de tecnología (no se habla de procesos batch, cachés, colas, ni nada equivalente — el "ritmo" de la Parte 6 es una propiedad conceptual del conocimiento, no una especificación técnica).
- La redefinición de los dominios de 7.2.a o de las clases de 7.2.b — este documento los usa, no los cambia.
- El diseño de cómo se implementa la trazabilidad de la Parte 4 — se establece que debe existir, no cómo se construye.

---

# Parte 10 — Puntos conceptuales pendientes de discusión

Este documento tampoco se da por aprobado automáticamente. Antes de continuar:

1. **¿Todas las Alertas necesitan vigilancia continua del umbral, o algunas pueden evaluarse solo bajo demanda?** La Parte 6 asume vigilancia continua para todas — vale la pena confirmar si eso es cierto para el negocio o si hay alertas de menor urgencia que alcanza con revisar periódicamente.

2. **¿Quién es responsable, en términos de negocio (no técnicos), de mantener viva la Etapa 2 (Semántica Compartida)?** Ya se señaló en 7.2.a y 7.2.b que hace falta un árbitro — este documento agrega que ese árbitro no actúa una vez, sino de forma continua, porque la Semántica no es un evento sino una condición permanente.

3. **¿El "cierre del ciclo" (Parte 5) debería quedar registrado en algún lugar como decisión de negocio explícita** (por ejemplo, que una renegociación de Comisión motivada por un Análisis Cruzado quede vinculada a ese análisis), **o alcanza con que ocurra de manera informal, fuera del sistema?**

4. **¿Existen Hechos económicos que deberían tener un camino de materialización más corto o más largo que el descrito?** Este documento asume que todo Hecho económico pasa, cuando corresponde, por una sola etapa de Materialización — cabría confirmar si eso es siempre cierto o si hay casos (por ejemplo, ajustes posteriores a una Liquidación ya pagada) que requieren pensar en más de una materialización sucesiva sobre el mismo Hecho.

---

## Cierre

Este documento no propone ninguna implementación, ninguna tabla, ningún cambio al sistema. Describe el ciclo de vida del conocimiento en SDC en cinco etapas (Hecho, Materialización, Semántica Compartida, Maduración Analítica, Consumo), muestra que no todo concepto recorre las cinco por igual, explica qué se gana y qué se pierde en cada transición, y cierra el círculo mostrando cómo una decisión tomada en la última etapa realimenta a la primera — sin modificar, en ningún momento, lo ya aprobado en `BLOQUE7.2.a` ni en `BLOQUE7.2.b`.

**No se da nada por aprobado.** Los cuatro puntos de la Parte 10 quedan explícitamente abiertos para discusión antes de avanzar a un eventual 7.2.d.

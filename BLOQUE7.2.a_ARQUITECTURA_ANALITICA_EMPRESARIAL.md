# Bloque 7.2.a — Arquitectura Analítica Empresarial de SDC

Fecha: 2026-07-10. Documento de arquitectura conceptual de nivel ejecutivo — **no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se modificó el modelo de datos, no se diseñó ninguna pantalla, reporte ni dashboard específico, no se propuso tecnología, no se hizo commit, no se hizo push.**

**Relación con lo anterior:** `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` inventarió ~70 preguntas de negocio. `BLOQUE7.1_MAPA_INDICADORES.md` las clasificó por profundidad de procesamiento (4 niveles) y priorizó las 20 de mayor valor. Este documento no organiza esas preguntas por cuánto cuesta calcularlas — las organiza **por cómo piensa el negocio**: qué gobierna un Director Operativo, qué gobierna un Responsable Comercial, qué gobierna quien administra el dinero. La profundidad de procesamiento (Nivel 1-4) sigue existiendo, pero pasa a ser una clasificación secundaria, dentro de cada dominio — no la estructura organizadora.

**Pregunta que responde este documento, y solo esta:** *¿cuáles son los grandes dominios analíticos que necesita dirigir una empresa de transporte de cereales, y cómo se relacionan entre sí — de modo que cualquier capacidad futura (reporte, dashboard, alerta, KPI, insight, IA) sepa a qué dominio pertenece antes de que exista?*

**Lo que este documento explícitamente no es:** no es el diseño de ningún reporte, dashboard o pantalla — tampoco es el diseño técnico de "cómo se calcula" cada cosa (eso ya se exploró, a nivel de componentes de software, en un borrador previo de este mismo sub-bloque, y se descarta como estructura organizadora en favor de la que sigue). Es la organización del negocio en sí, no de cómo el software la va a implementar.

---

# Parte 1 — Principio rector: primero el negocio, después el software

La tentación natural, al diseñar una capa analítica, es organizarla por tipo de procesamiento: qué es una consulta directa, qué es un indicador agregado, qué es un cruce complejo. Ese es un criterio de software — útil más adelante, cuando se diseñe técnicamente cada capacidad, pero prematuro ahora, porque obliga a pensar en términos de cómo se calcula algo antes de tener claro **para quién existe y qué decisión de negocio sostiene**.

Este documento invierte ese orden:

1. **Primero**, se identifican los dominios en los que una empresa de transporte de cereales ya piensa, con o sin sistema — los que un Director General reconocería de inmediato en una reunión de gerencia, sin que nadie se los tenga que explicar.
2. **Después**, dentro de cada dominio, se identifica qué profundidad de procesamiento requiere cada pregunta que ese dominio responde (información directa, indicador, análisis cruzado, alerta) — reutilizando la clasificación ya validada en `BLOQUE7.1_MAPA_INDICADORES.md`, pero ahora como subdivisión interna de un dominio, no como el eje principal.

La ventaja de este orden es que los dominios de negocio cambian muy poco con el tiempo — una empresa de transporte de cereales va a seguir necesitando dirigir su operación, su relación comercial y sus finanzas dentro de cinco o diez años, aunque el software cambie por completo. Organizar primero por dominio es lo que le da a esta arquitectura la capacidad de sostener el crecimiento de SDC en el tiempo, en vez de quedar atada a las decisiones técnicas del momento en que se escribió.

---

# Parte 2 — Los 7 dominios analíticos de SDC

Cada dominio se describe por su **pregunta rectora** (la que resume, en una sola frase, para qué existe), quién lo dirige naturalmente en la organización, y su **naturaleza**: si genera conocimiento propio o si es una lectura, con otro propósito, sobre datos que ya viven en otro dominio.

## 1. Estado Operativo

**Pregunta rectora:** ¿qué está pasando en el negocio ahora mismo?

**Dirige:** cualquier rol que necesite el pulso del día — Director Operativo, Responsable Administrativo, según el dato.

**Naturaleza:** el dominio más simple y el único que no interpreta nada — muestra el estado presente de la operación y las finanzas, sin comparar, sin proyectar, sin cruzar. Es el punto de partida del que todos los demás dominios, tarde o temprano, derivan algo.

## 2. Performance Operativa

**Pregunta rectora:** ¿qué tan bien está rindiendo la operación de transporte en sí misma?

**Dirige:** Director/Gerente Operativo.

**Naturaleza:** mide eficiencia física del negocio — viajes, flota, choferes, tiempos, cuellos de botella — con foco en throughput y utilización, no en dinero. Es donde vive la pregunta de "¿estamos usando bien lo que tenemos?".

## 3. Performance Comercial

**Pregunta rectora:** ¿cómo está evolucionando la relación con los clientes y con el mercado?

**Dirige:** Responsable Comercial.

**Naturaleza:** mide la salud y la evolución de la cartera de clientes — crecimiento, caída, concentración, mezcla de producto — con foco en relación y volumen, no en rentabilidad directa (eso es Performance Financiera, aunque ambos dominios compartan datos de origen).

## 4. Performance Financiera

**Pregunta rectora:** ¿cuánto gana realmente el negocio, y con qué eficiencia mueve el dinero?

**Dirige:** Responsable Administrativo/Financiero.

**Naturaleza:** el dominio de mayor densidad analítica — rentabilidad, márgenes, cobranza, costo de comisiones. Es donde vive el análisis de mayor valor ya identificado en 7.1 (rentabilidad por cliente/viaje/cereal/ruta).

## 5. Riesgos

**Pregunta rectora:** ¿qué podría salir mal, y qué tan expuestos estamos hoy?

**Dirige:** transversal — cada riesgo concreto se dirige a quien puede actuar sobre él (Operaciones ante un riesgo documental, Administración ante un riesgo de cartera, Comercial ante un riesgo de concentración de cliente); la síntesis del conjunto es de Gerencia General.

**Naturaleza:** a diferencia de los cuatro anteriores, **Riesgos no genera dato propio** — es una lente de exposición y umbral que se aplica sobre datos que ya existen en Estado Operativo, Performance Operativa, Comercial o Financiera. Una documentación por vencer es, primero, un dato de Performance Operativa (estado de la flota); Riesgos lo vuelve a leer bajo la pregunta de "¿qué tan cerca está de convertirse en un problema?". Esta distinción importa porque evita el error de tratar a Riesgos como un dominio con datos duplicados de los otros cuatro.

## 6. Gobierno

**Pregunta rectora:** ¿podemos confiar en lo que el sistema dice, y sabemos quién hizo cada cosa?

**Dirige:** transversal, con precedente ya sentado en el Bloque 5.1 (seguridad de catálogos) — en la práctica, quien sea responsable de control interno o seguridad del sistema.

**Naturaleza dual:** por un lado responde preguntas propias (qué usuario hizo qué, quién autorizó un override, quién anuló algo) apoyado en el registro de trazabilidad; por otro, es la garantía de integridad que sostiene la confianza en los otros seis dominios — si Gobierno no puede responder "quién cargó este dato", ningún otro dominio puede afirmar con seguridad que su información es correcta.

## 7. Inteligencia Predictiva (futura)

**Pregunta rectora:** ¿qué es probable que pase, y qué deberíamos anticipar?

**Dirige:** a definir cuando se aborde — previsiblemente Gerencia General.

**Naturaleza:** no se diseña en este documento. Corresponde al Nivel 4 ya excluido en `BLOQUE7.1_MAPA_INDICADORES.md` (proyección de caja, simulación de pérdida de cliente, alertas predictivas). Se declara como séptimo dominio, no porque se vaya a construir ahora, sino porque los seis anteriores deben construirse sabiendo que este va a consumirlos — es el motivo por el cual, más adelante, la coherencia de datos y definiciones entre los seis dominios activos no es un lujo sino un requisito para que este séptimo sea viable el día que se aborde.

---

# Parte 3 — La semántica compartida que sostiene a los 7 dominios

Los dominios organizan el negocio, pero por debajo de los siete tiene que existir una **semántica única** — qué es un "período", cuándo algo está "vencido", qué significa "activo", cómo se define "margen" — para que un mismo concepto no signifique una cosa en Performance Comercial y otra distinta en Riesgos.

Esto no es un octavo dominio: es la condición que hace que los siete anteriores puedan coexistir sin contradecirse. Ya existe una señal temprana de por qué esto importa: el Dashboard actual calcula "vencido" y "confirmado" con una lógica propia, sin que exista un lugar único donde esa definición esté declarada — cualquier dominio nuevo que use esos mismos conceptos hereda esa ambigüedad si no se resuelve antes.

Esta arquitectura no fija todavía cuáles son esas definiciones (es una decisión de negocio, ver Parte 9) — fija el principio de que deben vivir en un solo lugar, vinculante para los siete dominios.

---

# Parte 4 — Dentro de cada dominio: la profundidad analítica

Una vez identificado el dominio al que pertenece una pregunta de negocio, recién ahí corresponde clasificarla por cuánto hay que procesar el dato para responderla — reutilizando, sin modificarla, la escala ya validada en `BLOQUE7.1_MAPA_INDICADORES.md`:

- **Información Directa** — el estado de una entidad, sin agregación ni cruce. Es, casi siempre, el contenido natural del dominio Estado Operativo, pero puede aparecer dentro de cualquier otro dominio como su capacidad más simple.
- **Indicador** — una agregación dentro del mismo dominio: suma, promedio, ranking, comparación de período.
- **Análisis Cruzado** — combina información de más de un dominio para producir un concepto que no vive en ninguno de los dos por separado (el caso central: el resultado económico de un viaje, que solo existe cruzando Performance Operativa con Performance Financiera).
- **Alerta/Umbral** — una capacidad, no exclusiva del dominio Riesgos, que le agrega a un Indicador o Análisis Cruzado ya existente una condición de disparo y un destinatario.

Esta clasificación explica **cómo se construye** una capacidad; el dominio explica **para quién existe y qué decisión de negocio sostiene**. Las dos son necesarias, pero en ese orden.

---

# Parte 5 — Las 20 preguntas priorizadas, ubicadas por dominio

Referencia: Parte 4 de `BLOQUE7.1_MAPA_INDICADORES.md`. Cuando una pregunta es leída por más de un dominio (una misma capacidad, dos lentes de negocio distintas — nunca dos cálculos distintos), se indica el dominio primario y el secundario entre paréntesis.

| # | Pregunta | Dominio primario | Profundidad |
|---|---|---|---|
| 1 | Total pendiente de cobrar / a pagar, hoy | Performance Financiera | Indicador |
| 2 | Qué cliente deja mayor utilidad | Performance Financiera (lee Performance Comercial) | Análisis Cruzado |
| 3 | Clientes con mayor deuda y antigüedad (aging) | Performance Financiera (Riesgos lo relee como exposición) | Indicador |
| 4 | Documentación que vence en 30 días | Performance Operativa (Riesgos lo relee como alerta) | Alerta |
| 5 | % de facturación en el cliente más grande | Performance Comercial (Riesgos lo relee como concentración) | Indicador |
| 6 | Cliente que creció o cayó en volumen | Performance Comercial | Análisis Cruzado |
| 7 | % de viajes descargados sin facturar | Estado Operativo (Riesgos lo relee como fuga de caja) | Información Directa |
| 8 | Costo de comisiones y anticipos del período | Performance Financiera | Indicador |
| 9 | Cuello de botella operativo por etapa | Performance Operativa | Análisis Cruzado |
| 10 | Chofer con mayor anticipo sin liquidar | Performance Financiera (Riesgos lo relee como exposición) | Indicador |
| 11 | Facturación mensual y su evolución | Performance Financiera | Indicador |
| 12 | Margen promedio por cereal | Performance Financiera (lee Performance Comercial) | Análisis Cruzado |
| 13 | Camión/chofer que más trabaja o está subutilizado | Performance Operativa | Indicador |
| 14 | Ruta más rentable | Performance Financiera (lee Performance Operativa) | Análisis Cruzado |
| 15 | Clientes activos vs. dados de baja | Performance Comercial | Información Directa |
| 16 | % de facturas cobradas en plazo | Performance Financiera | Indicador |
| 17 | Tiempo promedio de un viaje punta a punta | Performance Operativa | Análisis Cruzado |
| 18 | Comisión pactada vs. aplicada (overrides) | Performance Financiera (Gobierno lee quién autorizó) | Indicador |
| 19 | Productor con más movimientos y cliente asociado | Performance Comercial | Indicador |
| 20 | Flujo de caja proyectado | Inteligencia Predictiva (futura) — fuera de alcance | — |

**Lectura:** más de un tercio de las 20 preguntas de mayor valor son leídas por dos dominios a la vez, siempre con el mismo patrón — un dominio "vertical" (Estado Operativo, Performance Operativa, Comercial o Financiera) genera el dato, y un dominio "transversal" (Riesgos o Gobierno) lo relee bajo su propia pregunta rectora. Ninguna aparece con dos cálculos distintos — es la prueba, sobre casos reales, de que la arquitectura de dominios no obliga a duplicar lógica.

---

# Parte 6 — Cómo se relacionan los 7 dominios entre sí

```
                         Inteligencia Predictiva (futura)
                     ── consume, eventualmente, a los 6 dominios activos ──

  ┌────────────┬──────────────┬──────────────┬──────────────┐
  │  Estado     │ Performance  │ Performance  │ Performance   │
  │  Operativo  │ Operativa    │ Comercial    │ Financiera    │
  └────────────┴──────────────┴──────────────┴──────────────┘
        4 dominios "verticales" — cada uno con dueño natural,
        cada uno genera conocimiento propio sobre su parte del negocio

  ┌───────────────────────┐        ┌───────────────────────┐
  │       Riesgos           │        │       Gobierno           │
  │  lente transversal de    │        │  lente transversal de     │
  │  exposición — relee a     │        │  confianza y trazabilidad │
  │  los 4 verticales, no     │        │  — responde lo propio y   │
  │  genera dato propio       │        │  además valida a los 6     │
  └───────────────────────┘        └───────────────────────┘

                 semántica compartida (Parte 3) — por debajo de los 7,
                 única, sin la cual ningún dominio puede confiar en
                 lo que otro dominio le entrega
```

Los cuatro dominios verticales son, cada uno, dueños de una pregunta rectora propia y de un rol ejecutivo que lo dirige sin ambigüedad. Riesgos y Gobierno son transversales por naturaleza — no porque sean menos importantes, sino porque su función es leer y validar, no generar. Inteligencia Predictiva queda deliberadamente afuera de la construcción activa, como séptimo dominio declarado pero no diseñado.

---

# Parte 7 — Relación con los consumidores futuros (sin diseñarlos)

Cada capacidad mencionada por el usuario se apoya en una combinación distinta de dominios. Se señala la relación conceptual — no es diseño de ninguna de ellas, cada una se aborda en su propio sub-bloque futuro.

| Consumidor futuro | Dominios de los que se abastece |
|---|---|
| Dashboard Operativo | Estado Operativo + Performance Operativa |
| Dashboard Administrativo | Performance Financiera + Riesgos (cartera, anticipos) |
| Dashboard Ejecutivo | Síntesis de los 4 dominios verticales, con Riesgos como capa de alerta superpuesta |
| Reporte de Rentabilidad | Performance Financiera, apoyado en datos de Performance Operativa y Comercial |
| Centro de Reportes | Acceso a cualquier dominio bajo demanda, sin restricción a uno solo |
| Centro de Alertas | Riesgos, más las alertas propias de cada dominio vertical |
| KPIs | Un subconjunto curado de cada dominio, con el mismo dueño ejecutivo que el dominio de origen |
| Insights automáticos | Cruces entre dominios que hoy nadie mira juntos — su valor depende directamente de que la semántica compartida (Parte 3) ya esté resuelta |
| Futuras capacidades de IA | Los 7 dominios como ontología de negocio — el requisito central es que la IA lea de una organización ya estable, no que interprete el modelo transaccional por su cuenta |

---

# Parte 8 — Qué queda explícitamente fuera de este documento

- El diseño de cualquiera de los consumidores de la Parte 7 — cada uno en su propio sub-bloque futuro.
- Cualquier pantalla, dashboard, reporte o maqueta.
- Cualquier decisión de modelo de datos, migración o tecnología.
- Las definiciones concretas de la semántica compartida (Parte 3) — se establece que deben existir en un solo lugar, no cuáles son.
- El método de la Inteligencia Predictiva (Parte 2.7) — se declara su lugar en la arquitectura, no su diseño.
- El orden en que se construyen los dominios o los consumidores — decisión de roadmap, no de arquitectura.

---

# Parte 9 — Puntos de decisión pendientes

1. **¿Quién es, formalmente, el dueño ejecutivo de cada uno de los 4 dominios verticales?** Este documento propone un dueño natural por rol (Operativo, Comercial, Administrativo/Financiero) pero la asignación real de responsabilidad organizacional es una decisión de negocio, no técnica.

2. **¿Quién arbitra la semántica compartida (Parte 3) cuando dos dominios ya calculan lo mismo distinto?** El caso concreto ya existe: "vencido"/"confirmado" en el Dashboard actual.

3. **¿Quién sintetiza el dominio Riesgos a nivel de Gerencia General, y con qué frecuencia?** Es transversal por diseño — necesita, aun así, un responsable de mirar el conjunto, no solo cada riesgo por separado en su dominio de origen.

4. **¿Cuál dominio se construye primero?** El roadmap ya señala a Performance Financiera (vía el Reporte de Rentabilidad, ítem #30) como la pieza de mayor apalancamiento — confirmar ese orden, o ajustarlo, es una conversación de alcance separada.

5. **¿Se espera a resolver la brecha de captura de datos (vencimientos documentales, `medioPago`) antes de construir las capacidades de Riesgos que dependen de ellos, o se construyen igual documentando la limitación como conocida?**

---

## Cierre

Este documento organiza la inteligencia de SDC en 7 dominios analíticos — 4 verticales con dueño ejecutivo propio (Estado Operativo, Performance Operativa, Performance Comercial, Performance Financiera), 2 transversales que leen sobre los anteriores sin generar dato propio (Riesgos, Gobierno), y 1 declarado para el futuro sin diseñar (Inteligencia Predictiva) — sostenidos todos por una semántica compartida única. No se diseñó ninguna pantalla, ningún reporte, ninguna tecnología, no se modificó el modelo de datos, no se escribió código, no se hizo commit ni push.

Sirve como marco de referencia obligatorio para todo sub-bloque futuro de Bloque 7: cualquier capacidad nueva —empezando, previsiblemente, por el Reporte de Rentabilidad dentro de Performance Financiera— deberá declarar primero a qué dominio pertenece y qué preguntas rectoras responde, antes de discutir cómo se calcula.

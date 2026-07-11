# Bloque 7.2.d — Principios Rectores y Marco de Gobernanza Conceptual (SDC v2)

Fecha: 2026-07-11. Documento de cierre de la serie de arquitectura conceptual — **no se escribió código, no se propusieron tablas, no se propuso SQL, no se propusieron endpoints, no se diseñó ninguna pantalla ni dashboard, no se modificó el modelo de datos, no se hizo commit, no se hizo push.**

**Relación con lo anterior:** este documento cierra la serie iniciada en `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md`, continuada en `BLOQUE7.2.b_MODELO_COGNITIVO_ONTOLOGIA.md` y `BLOQUE7.2.c_CICLO_VIDA_CONOCIMIENTO.md` — los tres ya aprobados, y **ninguno de los tres se modifica ni se reabre acá**. Cada uno respondió una pregunta propia: 7.2.a *qué dirige* el negocio (7 dominios), 7.2.b *qué es* cada concepto (ontología, 4 clases cognitivas), 7.2.c *cómo se mueve* el conocimiento entre uno y otro (5 etapas cíclicas). Este documento no agrega una cuarta pregunta estructural — hace algo distinto: **extrae lo invariante que atraviesa a los tres, y organiza lo que los tres dejaron abierto**, para que la serie completa pueda usarse como una sola referencia en vez de tres documentos que hay que leer por separado para encontrar el mismo principio repetido de tres formas.

**Pregunta que responde este documento, y solo esta:** *¿cuáles son las leyes que no pueden violarse sin romper la coherencia de esta arquitectura, y qué queda pendiente de decidir antes de que un sub-bloque futuro empiece a construir sobre ella?*

---

# Parte 1 — Por qué hace falta un documento de cierre

Tres documentos, escritos en momentos distintos, inevitablemente repiten ideas con palabras distintas y dejan cabos sueltos en lugares distintos. Ya pasó en esta misma serie: la pregunta "¿quién sostiene la Semántica Compartida?" aparece en 7.2.a como "¿quién arbitra cuando dos dominios ya calculan lo mismo distinto?" y vuelve a aparecer en 7.2.c como "¿quién es responsable de mantenerla viva de forma continua?" — es la misma pregunta de fondo, formulada dos veces, en dos documentos distintos, sin que ninguno de los dos supiera que el otro también la había hecho.

Sin un documento de cierre, dos riesgos concretos:

1. **Los principios quedan implícitos en tres lugares en vez de explícitos en uno.** Cualquier sub-bloque futuro tendría que releer los tres documentos completos para reconstruir "las reglas del juego" de esta arquitectura.
2. **Los catorce puntos de decisión pendientes (cinco en 7.2.a, seis en 7.2.b, cuatro en 7.2.c, con una superposición) quedan dispersos**, sin un registro único que permita, en un momento dado, saber cuáles ya se resolvieron y cuáles siguen abiertos.

Este documento resuelve los dos riesgos — no resolviendo las preguntas de fondo (eso sigue sin corresponderle a este documento), sino dándoles un único lugar donde vivir.

---

# Parte 2 — Los principios rectores

Nueve afirmaciones que atraviesan, cada una, más de uno de los tres documentos — la "constitución" mínima de la arquitectura conceptual de SDC. Cada principio indica de dónde surge.

1. **El negocio se organiza primero; el software, después.** Los dominios (7.2.a) reflejan cómo piensa la organización, no cómo procesa datos el sistema — y por eso cambian mucho menos en el tiempo que cualquier decisión técnica. *(7.2.a, Parte 1)*

2. **El Viaje es la unidad económica fundamental.** Todo concepto financiero del sistema es, en última instancia, una forma distinta de mirar uno o más Viajes — ningún otro concepto genera valor económico de manera independiente. *(7.2.b, Parte 2)*

3. **Generar valor y documentarlo son actos cognitivamente distintos.** Un Hecho (Viaje, Anticipo, Cobranza) crea conocimiento que no existía antes; una Materialización (Liquidación, Factura) empaqueta ese conocimiento bajo una lógica y un ritmo propios, pero no crea valor nuevo. Confundir ambos roles — tratar a una Liquidación como si generara el costo, en vez de reconocer que solo lo documenta — es la forma más común de perder de vista de dónde viene, en realidad, cada número. *(7.2.b, Parte 3 y Parte 7)*

4. **La semántica es única y vinculante, nunca local.** Un mismo término (período, vencido, activo, margen) tiene una sola definición válida para todos los dominios y todas las etapas del ciclo — ningún consumidor, por más simple que sea, tiene permitido definir su propia versión. *(7.2.a, Parte 3; 7.2.c, Etapa 2)*

5. **Ningún consumidor recalcula lo que el sistema ya definió.** Un Dashboard, un Reporte, una Alerta, un futuro módulo de IA: todos leen del mismo conocimiento ya madurado dentro de un Dominio — ninguno tiene lógica de negocio propia sobre un concepto que ya está definido en otro lugar. *(7.2.a, Parte 7; 7.2.c, Etapa 4)*

6. **Las reglas de reparto no son datos — son relaciones, y se gobiernan como tales.** La Comisión es el caso identificado, pero el principio es general: cuando un concepto conecta a dos partes bajo una condición pactada que puede apartarse caso por caso (un override), ese apartamiento es, en sí mismo, un hecho de gobierno que merece quedar trazado, no una simple corrección de un campo numérico. *(7.2.b, Parte 4 y Parte 9)*

7. **Lo analítico interpreta; no agrega conceptos nuevos a lo que el negocio ya es.** Ningún indicador, análisis cruzado o alerta introduce una entidad nueva a la ontología — todos son lecturas, con distinto grado de elaboración, sobre conceptos que ya existían antes de que existiera cualquier capacidad analítica. *(7.2.b, Parte 6)*

8. **La abstracción nunca es irreversible.** A medida que el conocimiento madura (de Hecho a Materialización a Indicador a Consumo), gana significado y pierde detalle — pero siempre tiene que ser posible reconstruir, hacia atrás, qué Hecho originó una cifra determinada. Esa garantía no es opcional ni es un lujo de auditoría: es la condición que hace aceptable cada pérdida de detalle en el camino. *(7.2.c, Parte 4)*

9. **El conocimiento no describe el pasado — cambia cómo se generan los hechos futuros.** El ciclo de vida del conocimiento no termina en el consumo: una decisión tomada con ese conocimiento (renegociar una Comisión, priorizar un Cliente) genera nuevos Hechos, distintos de los que existían antes de que esa decisión se tomara. *(7.2.c, Parte 5)*

---

# Parte 3 — El patrón de gobernanza que se repite

Revisando los tres documentos en conjunto, aparece un mismo patrón de gobernanza tres veces, con distintos nombres, sin que ninguno de los tres lo hubiera declarado como patrón general:

- **Todo dominio vertical (Estado Operativo, Performance Operativa, Comercial, Financiera) tiene un dueño natural** — un rol ejecutivo que lo reconocería sin que nadie se lo explique.
- **Todo dominio transversal (Riesgos, Gobierno) tiene un árbitro**, no un dueño — alguien que decide cuando dos lecturas del mismo dato entran en conflicto, no alguien que genera el dato.
- **Toda regla de reparto (como la Comisión) tiene una condición pactada y una instancia aplicada**, y el apartamiento entre ambas siempre queda trazado, nunca se pierde silenciosamente.

Este patrón — **dueño para lo vertical, árbitro para lo transversal, trazabilidad para toda excepción a una regla** — es, en la práctica, el marco de gobernanza conceptual que la serie 7.2 construyó sin nombrarlo como tal hasta este documento. Cualquier concepto nuevo que se incorpore a esta arquitectura en el futuro debería poder ubicarse en uno de estos tres papeles, no inventar un cuarto.

---

# Parte 4 — Registro maestro de puntos de decisión pendientes

Los catorce puntos únicos ya señalados a lo largo de la serie (con una superposición ya fusionada), agrupados por tema — no por el documento en el que aparecieron primero.

## Grupo A — Gobernanza y responsables (quién decide)

- ¿Quién es, formalmente, el dueño ejecutivo de cada uno de los 4 dominios verticales? *(7.2.a, Parte 9.1)*
- ¿Quién arbitra la Semántica Compartida cuando dos partes del sistema ya calculan lo mismo distinto, y quién la mantiene viva de forma continua, no solo en el momento del conflicto? *(7.2.a, Parte 9.2 + 7.2.c, Parte 10.2 — mismo punto, dos ángulos)*
- ¿Quién sintetiza el dominio Riesgos a nivel de Gerencia General, y con qué frecuencia? *(7.2.a, Parte 9.3)*

## Grupo B — Reglas de negocio (la Comisión y sus posibles análogos)

- ¿La Comisión debería tratarse como una regla de negocio de primera clase, con su propio ciclo de vida (pactada vs. aplicada), en vez de como un atributo dentro de otros conceptos? *(7.2.b, Parte 11.1)*
- ¿Existen otros conceptos-regla con la misma naturaleza dual — por ejemplo, la condición comercial de un Cliente (plazo de pago, descuentos)? *(7.2.b, Parte 11.5)*

## Grupo C — Fidelidad de la ontología a la realidad del negocio

- ¿Es correcto que el Productor sea un rol opcional en cada Viaje, o esa opcionalidad esconde una pérdida de trazabilidad que el negocio debería resolver? *(7.2.b, Parte 11.2)*
- ¿El Vehículo debería seguir sin interés económico propio, o hay escenarios (alquiler de flota, tercerización de acoplados) donde eso deja de ser cierto? *(7.2.b, Parte 11.3)*
- ¿Existen Hechos económicos que requieren más de una Materialización sucesiva (por ejemplo, ajustes posteriores a una Liquidación ya pagada)? *(7.2.c, Parte 10.4)*

## Grupo D — Gobernanza de excepciones y auditoría

- ¿La distinción entre Hecho y Materialización debería tener una consecuencia de gobernanza explícita — por ejemplo, que anular una Factura o una Liquidación quede más visiblemente auditado que anular un Anticipo? *(7.2.b, Parte 11.4)*
- ¿El cierre del ciclo (una decisión que genera nuevos Hechos) debería quedar registrado explícitamente como decisión de negocio, o alcanza con que ocurra de manera informal? *(7.2.c, Parte 10.3)*

## Grupo E — Evolución y mantenimiento de la arquitectura

- ¿Esta ontología debe revisarse cada vez que el negocio incorpore un concepto nuevo, o solo cuando ese concepto altere a la unidad económica fundamental? *(7.2.b, Parte 11.6)*
- ¿Todas las Alertas necesitan vigilancia continua del umbral, o algunas pueden evaluarse solo bajo demanda? *(7.2.c, Parte 10.1)*

## Grupo F — Secuencia y alcance de construcción

- ¿Cuál dominio se construye primero? *(7.2.a, Parte 9.4)*
- ¿Se espera a resolver la brecha de captura de datos (vencimientos documentales, `medioPago`) antes de construir las capacidades de Riesgos que dependen de ellos? *(7.2.a, Parte 9.5)*

**Este documento no resuelve ninguno de estos catorce puntos.** Los organiza para que dejen de estar dispersos en tres documentos distintos, y para que cualquier conversación futura sobre alguno de ellos pueda ubicarse de inmediato en el grupo temático correspondiente.

---

# Parte 5 — Criterio de coherencia para sub-bloques futuros

A partir de acá, cualquier sub-bloque que diseñe una capacidad concreta (empezando, previsiblemente, por el Reporte de Rentabilidad dentro de Performance Financiera) debería, antes de avanzar a diseño técnico, poder responder cinco preguntas apoyándose en esta serie:

1. **¿A qué dominio o dominios de `BLOQUE7.2.a` pertenece?** Si la respuesta involucra a más de un dominio vertical, ¿cuál es primario y cuál secundario, siguiendo el patrón ya usado en la Parte 5 de ese documento?

2. **¿Qué conceptos de la ontología de `BLOQUE7.2.b` utiliza, y respeta la clase cognitiva de cada uno?** En particular: ¿trata a una Materialización como si generara valor por sí sola? ¿trata a una regla de reparto como si fuera un dato simple?

3. **¿En qué etapa o etapas del ciclo de `BLOQUE7.2.c` se apoya, y de qué etapas anteriores depende?** ¿Su ritmo (instantáneo, periódico, bajo demanda) es coherente con las etapas de las que depende?

4. **¿Compromete alguno de los nueve principios de la Parte 2?** Si es así, ¿cómo se resuelve esa tensión antes de seguir, en vez de resolverla implícitamente durante la implementación?

5. **¿Qué puntos del registro maestro (Parte 4) resuelve, cuáles asume sin resolver — y por qué es seguro asumirlos —, y cuáles deja explícitamente abiertos?**

Este criterio no es una etapa nueva de `METODOLOGIA_SDC.md` — es un filtro adicional, específico de esta arquitectura, que se aplica *antes* de la Etapa 1 (Auditoría) de cualquier sub-bloque que construya sobre la serie 7.2.

---

# Parte 6 — Qué significa que la serie 7.2 esté cerrada

Cerrar la serie **no significa que los catorce puntos de la Parte 4 estén resueltos** — significa que las tres preguntas estructurales (qué dirige el negocio, qué es cada cosa, cómo se mueve el conocimiento entre una y otra) ya tienen una respuesta lo bastante estable como para dejar de tratarse como borrador y empezar a usarse como referencia.

Esta serie completa (7.2.a a 7.2.d) ocupó un lugar que `METODOLOGIA_SDC.md` no tenía nombrado hasta ahora: no es una Auditoría (no diagnostica un problema puntual) ni es un Diseño técnico (no propone una solución implementable) — es una capa de **arquitectura conceptual** que antecede a ambas, y que ningún sub-bloque anterior de SDC había necesitado de forma tan explícita. Su cierre no reemplaza ni acorta ninguna de las nueve etapas de la metodología para el trabajo que viene después: el primer sub-bloque que diseñe una capacidad concreta sobre esta base sigue empezando, como siempre, en la Etapa 1 (Auditoría) — con la diferencia de que ahora tiene, además del código existente, esta arquitectura como referencia adicional para auditar contra ella.

---

# Parte 7 — Qué queda explícitamente fuera de este documento

- La resolución de cualquiera de los catorce puntos del registro maestro — se organizan, no se deciden.
- El diseño o la elección de cuál sub-bloque concreto se aborda primero (Grupo F del registro es, precisamente, esa pregunta sin resolver).
- Cualquier modificación a `BLOQUE7.2.a`, `BLOQUE7.2.b` o `BLOQUE7.2.c`.
- Cualquier tabla, pantalla, tecnología o decisión de implementación.
- El commit de la serie — sigue en pie la decisión ya tomada de esperar a que toda la serie esté cerrada antes de un único commit conjunto.

---

## Cierre de la serie 7.2

Con este documento se cierra la serie completa de arquitectura conceptual de SDC:

- **7.2.a** estableció *qué dirige* el negocio — 7 dominios analíticos.
- **7.2.b** estableció *qué es* cada concepto — el Viaje como unidad económica fundamental, y cuatro clases cognitivas.
- **7.2.c** estableció *cómo se mueve* el conocimiento — cinco etapas cíclicas, no lineales.
- **7.2.d** extrajo lo invariante de los tres (nueve principios rectores, un patrón de gobernanza de tres papeles), consolidó los catorce puntos que los tres dejaron abiertos, y fijó el criterio de coherencia que cualquier trabajo futuro sobre esta arquitectura debería cumplir.

No se escribió código, no se modificó el modelo de datos, no se propuso ninguna pantalla ni tecnología, no se hizo commit ni push en ninguno de los cuatro documentos de la serie. Queda a la espera de la aprobación de este último documento y, después, del commit único que reunirá a toda la serie 7.2 — ya acordado que se hará recién quede cerrada por completo.

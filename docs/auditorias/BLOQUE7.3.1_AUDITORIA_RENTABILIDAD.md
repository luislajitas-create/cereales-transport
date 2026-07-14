# Bloque 7.3.1 — Auditoría: Rentabilidad por Viaje, Cliente y Transportista

Fecha: 2026-07-11. Etapa 1 (Auditoría) de `METODOLOGIA_SDC.md` — **documento de diagnóstico puro: no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se propone todavía ninguna solución.** Toda afirmación sobre el estado actual va acompañada de su referencia `archivo:línea`.

**Relación con lo anterior:** `BLOQUE7.3_ALCANCE.md` fijó la frontera de este sub-bloque: 7.3.1 calcula rentabilidad por viaje/cliente/transportista sobre **un período dado (una foto, no una serie)**, y establece la definición oficial de ingreso, costo, margen y rentabilidad que 7.3.5 va a reutilizar después. Este sub-bloque construye sobre la arquitectura conceptual ya cerrada (`BLOQUE7.2.a-d`): pertenece al dominio Performance Financiera, es un Análisis Cruzado (Etapa 3 de `BLOQUE7.2.c`) que combina las dos Materializaciones (Clase III de `BLOQUE7.2.b`) del mismo Viaje — Factura y Liquidación.

**Pregunta que responde esta auditoría, y solo esta:** *¿qué existe hoy en el sistema para calcular el ingreso y el costo de un Viaje, y qué se lo impide hacer de forma directa?*

---

# Parte 1 — Cómo se genera hoy el ingreso y el costo de un Viaje

## El ingreso: `Viaje.importeTotal`

Se fija al crear el Viaje como `toneladas × tarifaTonelada` (`backend/src/viajes/viajes.controller.ts:169`) y se recalcula si se editan esos dos campos (`viajes.controller.ts:234-239`). Es el único monto de "ingreso" que existe en el sistema — no hay, hoy, ningún concepto de ingreso separado del que ya vive en el Viaje.

Cuando el Viaje se factura, ese mismo valor se copia sin modificar a `FacturaViaje.importeViaje` (`backend/src/facturas/facturas.controller.ts:309`), y `Factura.importe` es la suma de esos importes para todos los Viajes incluidos (`facturas.controller.ts:286`).

## El costo: `LiquidacionViaje`

Cuando el Viaje se liquida, `LiquidacionViaje.subtotal` toma el mismo `v.importeTotal` (`backend/src/liquidaciones/liquidaciones.controller.ts:625`), y de ahí:

```
comisionMonto = subtotal × (comisionPct / 100)      (liquidaciones.controller.ts:626)
totalViaje     = subtotal − comisionMonto            (liquidaciones.controller.ts:627)
```

`comisionPct` es el de la Liquidación (que puede coincidir con `Chofer.comisionPct` o apartarse de él como override explícito, con su registro en `AuditLog` — `liquidaciones.controller.ts:553-554` y `601-612`). `totalViaje` es lo que efectivamente se le paga al transportista o chofer por ese Viaje.

## No existe, hoy, ningún cálculo de margen o rentabilidad

Una búsqueda de "rentabilidad", "margen" y "utilidad" en todo `backend/src` y `frontend/src` no devuelve ningún resultado de negocio (el único match, en `liquidaciones.controller.ts`, es la variable de layout `margenInferior` del generador de PDF, sin relación con esto). Confirma, desde el código, lo que ya había anticipado `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md`: el dato para calcular rentabilidad existe, pero nadie lo cruza.

---

# Parte 2 — La mecánica aritmética del margen, tal como el código la implica

Con lo anterior, y sin que el sistema lo calcule en ningún lugar hoy, la aritmética ya está determinada por cómo se construyen Factura y Liquidación a partir del mismo `Viaje.importeTotal`:

- SDC le factura al Cliente el 100% de `v.importeTotal`.
- SDC le paga al Transportista/Chofer `v.importeTotal − comisionMonto`.
- El margen bruto de ese Viaje, en ausencia de cualquier otro costo, es exactamente `comisionMonto` — ni más ni menos que la comisión aplicada.

Esto es una observación, no una propuesta de fórmula (eso corresponde a la Etapa 2): el margen de un Viaje, con el modelo actual, **coincide numéricamente con su comisión aplicada**, porque no existe ningún otro costo modelado a nivel de Viaje individual. Esta auditoría deja constancia de esa coincidencia porque no es obvia a simple vista y porque cualquier diseño posterior tiene que decidir explícitamente si esa igualdad es realmente la definición de "margen" que el negocio quiere, o si hay otros costos (Parte 4.d) que deberían restarse también.

---

# Parte 3 — Las garantías de integridad ya existentes, y sus límites

## Lo que ya protege al dato

Desde el Bloque 4.1, un Viaje facturado o liquidado tiene bloqueada la edición de los campos que afectan `importeTotal` (`toneladas`, `tarifaTonelada`) y de los campos que identifican al Viaje (`viajes.controller.ts:27-34`, aplicado en `:216-227`). Esto garantiza que, mientras un Viaje esté facturado y/o liquidado, `Viaje.importeTotal`, `FacturaViaje.importeViaje` y `LiquidacionViaje.subtotal` se mantienen consistentes entre sí — los tres valen lo mismo.

## El límite: filas históricas de Facturas y Liquidaciones anuladas

Anular una Factura o una Liquidación **no borra** sus filas hijas (`FacturaViaje`, `LiquidacionViaje`) — solo cambia el estado del documento y revierte el estado del Viaje a pendiente (`facturas.controller.ts:317-331`, `liquidaciones.controller.ts:707-752`). El propio código ya reconoce este patrón en un comentario explícito sobre refacturación (`liquidaciones.controller.ts:71-73`, citando el commit `cb42b66`): *"un viaje refacturado tras anular la factura original... puede tener más de un FacturaViaje histórico"*. Lo mismo aplica, simétricamente, del lado de Liquidaciones.

Una consecuencia adicional, no señalada hasta ahora en ningún documento del proyecto: al anular una Factura o una Liquidación, el Viaje vuelve a estado editable (`estaFacturado`/`estaLiquidado` en `viajes.controller.ts:54-60` dependen del estado actual, que la anulación resetea). Si entre la anulación y la re-facturación/re-liquidación alguien edita `toneladas` o `tarifaTonelada`, la fila histórica (anulada) queda con un `importeTotal` distinto al que el Viaje tiene ahora. Esto significa que **cualquier cálculo de rentabilidad que recorra `viaje.facturasViaje` o `viaje.liquidacionesViaje` sin filtrar por el estado vigente del documento padre corre el riesgo de sumar montos duplicados o desactualizados**, no solo de contar de más.

---

# Parte 4 — Hallazgos, clasificados por impacto y riesgo

## a. No existe ningún punto del sistema que cruce Factura y Liquidación por Viaje

**Impacto:** Muy Alto — es, literalmente, la funcionalidad que da origen a este sub-bloque. **Riesgo:** Bajo, es un vacío (no hay nada que romper). El "reporte de conciliación" ya existente (`facturas.controller.ts:186-246`) compara viajes descargados contra facturados, pero no toca Liquidaciones ni calcula margen — es un antecedente útil de patrón de agregación por cliente, no una base reutilizable de cálculo.

## b. Filas históricas de documentos anulados deben excluirse explícitamente

**Impacto:** Alto — si se omite, los números de rentabilidad son incorrectos de forma silenciosa (ver Parte 3). **Riesgo:** Alto si no se documenta como requisito del diseño técnico, porque el error no sería evidente a simple vista — el total "cuadraría" pero estaría mal.

## c. Viajes con un solo lado materializado

Un Viaje puede estar facturado sin estar liquidado, o liquidado sin estar facturado (`estadoFacturacion` y `estadoLiquidacion` son máquinas de estado independientes en el mismo `Viaje`, `backend/prisma/schema.prisma:215-217`). No hay, hoy, ningún criterio de negocio sobre qué hacer con esos casos en un cálculo de rentabilidad. **Impacto:** Medio-Alto, porque en cualquier período va a haber Viajes en este estado (el ciclo de facturar y liquidar no es simultáneo). **Riesgo:** Medio — omitirlos silenciosamente subestima el volumen del período sin que se note.

## d. Ambigüedad sobre los "descuentos" no clasificados como adelanto

`LiquidacionMovimiento` que no se identifica como adelanto (`esAdelanto()`, `liquidaciones.controller.ts:32-35`, por nombre de `TipoGasto`) se trata como "descuento" y reduce `netoPagar` (`recomputeTotales`, `liquidaciones.controller.ts:754-772`). No hay, en el modelo, ninguna marca que diga si ese descuento es un costo que SDC absorbe (reduce su margen) o un cargo que se le pasa al transportista (neutro para el margen de SDC). **Impacto:** Medio — afecta la precisión del margen en los períodos donde existan estos movimientos. **Riesgo:** Medio, es una pregunta de negocio, no técnica (ver Parte 6).

## e. Ranking por transportista: el dato ya existe pero nunca se agregó

`Liquidacion.transportistaId` (para liquidaciones tipo `TRANSPORTISTA`) y `Viaje.transportistaId` (siempre presente) permiten agrupar por transportista sin necesidad de ningún dato nuevo. **Impacto:** Bajo como hallazgo (es la parte más simple de 7.3.1), se señala solo para que quede registrado que no hay brecha de datos acá.

## f. Ausencia de índices sobre `estadoFacturacion` y `estadoLiquidacion`

`Viaje` indexa `fecha`, `clienteId`, `transportistaId` y `estado` (`schema.prisma:240-243`), pero no `estadoFacturacion` ni `estadoLiquidacion` ni `choferId`. Un cálculo de rentabilidad por período que filtre por estos campos, sobre un volumen de datos creciente, podría degradar en performance. **Impacto:** Bajo al volumen actual, potencialmente Medio a futuro. **Riesgo:** Bajo — es una observación técnica, no bloqueante, para tener en cuenta en el diseño técnico si corresponde.

---

# Parte 5 — Relación con la arquitectura conceptual ya cerrada

Sin modificar ni reabrir la serie 7.2:

- El cruce Factura–Liquidación por Viaje es, exactamente, el Análisis Cruzado que `BLOQUE7.2.a` (Parte 2.4) y `BLOQUE7.2.b` (Parte 2) ya habían identificado como el de mayor valor y mayor esfuerzo relativo.
- El hallazgo de la Parte 3 (filas históricas de documentos anulados) es una instancia concreta del principio 8 de `BLOQUE7.2.d` ("la abstracción nunca es irreversible") leído al revés: antes de abstraer, hay que asegurarse de estar leyendo el Hecho vigente, no uno histórico ya reemplazado.
- El hallazgo de la Parte 4.d (descuentos ambiguos) es, en términos de `BLOQUE7.2.b` (Parte 4, Comisión), una posible segunda regla de reparto no identificada todavía — ya señalado como pregunta abierta en el Grupo B del registro maestro de `BLOQUE7.2.d`.

---

# Parte 6 — Qué no resuelve esta auditoría

- No define la fórmula final de "margen" ni de "rentabilidad" — solo documenta que, con los datos actuales, el margen naive coincide con la comisión aplicada, y señala qué otros elementos (Parte 4.d) podrían modificar esa fórmula.
- No decide qué hacer con los Viajes con un solo lado materializado (Parte 4.c).
- No decide si los "descuentos" no clasificados como adelanto reducen el margen de SDC (Parte 4.d).
- No propone ningún endpoint, pantalla, agregación técnica ni índice nuevo — son decisiones de la Etapa 2 (Diseño técnico), una vez aprobada esta auditoría.

---

# Parte 7 — Puntos de decisión pendientes para la Etapa 2

1. **¿Los "descuentos" no clasificados como adelanto reducen el margen de SDC, o son un cargo neutro que se le pasa al transportista?** (Parte 4.d) — sin esta definición, el margen calculado puede estar sobreestimado.
2. **¿Cómo se trata un Viaje con un solo lado materializado (facturado sin liquidar, o viceversa) dentro del cálculo del período?** (Parte 4.c) — ¿se excluye del todo, se muestra como "incompleto", o se estima con el lado faltante en cero?
3. **¿El margen "oficial" de 7.3.1 es únicamente `Factura − Liquidación`, o debería restar también algún otro costo no modelado hoy a nivel de Viaje** (combustible, seguros, administración) **que hoy vive mezclado dentro de los movimientos de Liquidación sin diferenciarse por Viaje?**

Estas tres preguntas quedan explícitamente abiertas — no se asume ninguna respuesta para poder avanzar más rápido, en línea con `METODOLOGIA_SDC.md`.

---

# Parte 8 — ¿Qué significa rentabilidad en SDC?

"Rentabilidad" mezcla, en el uso cotidiano, cuatro nociones distintas. Antes de pasar a diseño hace falta separarlas y decir sin ambigüedad cuál es el objeto de 7.3.1. Ninguna de las cuatro definiciones que siguen propone todavía una solución técnica — fijan alcance conceptual, no cálculo.

## Margen operativo

La diferencia entre el ingreso y el costo directo de **un Viaje individual**: `FacturaViaje.importeViaje` (ingreso) menos `LiquidacionViaje.totalViaje` (costo pagado a transportista/chofer). Es el nivel más granular — el Hecho económico ya analizado en la Parte 2 de esta auditoría, donde se estableció que hoy coincide aritméticamente con la comisión aplicada. Es un concepto de un solo Viaje, no de un conjunto.

## Resultado económico

La agregación del margen operativo de **un conjunto de Viajes**, agrupados por una dimensión (cliente, transportista, cereal, ruta) dentro de un período determinado — la sumatoria de márgenes operativos individuales, sin ningún ajuste adicional (costo de capital, gastos de estructura, riesgo comercial). Es el Análisis Cruzado de `BLOQUE7.2.c` (Etapa 3) que agrupa Hechos ya materializados. Puede expresarse en valor absoluto (cuánto ganó SDC con el Cliente X en el período) o como porcentaje sobre el ingreso de ese mismo grupo.

## Rentabilidad financiera

La relación entre el resultado económico y el recurso financiero comprometido para obtenerlo — por ejemplo, cuánto tarda en recuperarse ese resultado según el tiempo que el dinero queda inmovilizado en cartera pendiente de cobro o en anticipos entregados y aún no liquidados. Es una medida de eficiencia en el uso del dinero, no solo de cuánto se ganó — pertenece a la dimensión de Performance Financiera que `BLOQUE7.2.a` describe como "con qué eficiencia mueve el dinero" (Parte 2.4), distinta de la dimensión de "cuánto gana" que cubre el resultado económico.

## Rentabilidad comercial

El valor de una relación comercial (con un Cliente, o de una alianza con un Transportista) más allá del margen puntual de un período — incorpora volumen, tendencia de crecimiento, concentración de riesgo, costo de servicio no reflejado en la comisión (esfuerzo comercial, riesgo de cobro, exclusividad) y horizonte de la relación. Es una lectura estratégica que cruza Performance Comercial con Performance Financiera, y que ningún cálculo de un solo período puede responder por sí sola.

## Qué cubre 7.3.1, y qué queda fuera

**7.3.1 tiene como objeto exclusivo el margen operativo y su agregación en resultado económico**, por viaje/cliente/transportista, sobre un período dado — exactamente lo que `BLOQUE7.3_ALCANCE.md` ya había fijado como su alcance, ahora nombrado sin ambigüedad.

**Rentabilidad financiera y rentabilidad comercial quedan explícitamente fuera de 7.3.1.** Y, para que quede dicho antes de que alguien lo asuma más adelante: **tampoco son el objeto de 7.3.5** (Benchmarking y tendencias) — ese sub-bloque agrega evolución temporal al mismo margen operativo/resultado económico de 7.3.1, no introduce ninguna de estas dos dimensiones nuevas. Ninguno de los cinco sub-bloques ya planificados en `BLOQUE7.3_ALCANCE.md` cubre rentabilidad financiera ni rentabilidad comercial — quedan señaladas acá como candidatas a un futuro sub-bloque o bloque propio, sin fecha ni compromiso todavía.

---

## Cierre

Esta auditoría documenta que SDC ya tiene, en `Viaje`, `FacturaViaje` y `LiquidacionViaje`, todo el dato necesario para calcular el margen operativo y el resultado económico de un período — el vacío no es de datos, es de un punto del sistema que los cruce, y de tres decisiones de negocio (Parte 7) que hoy no tienen respuesta. Se identificaron dos riesgos de integridad concretos (documentos anulados que dejan filas históricas, y Viajes con solo un lado materializado) que cualquier diseño posterior tiene que resolver explícitamente, no dar por sentado. La Parte 8 fija, sin ambigüedad, que el objeto de 7.3.1 es el margen operativo y el resultado económico — no la rentabilidad financiera ni la rentabilidad comercial, que quedan fuera de todo el Bloque 7.3 tal como está planificado hoy.

**No se propuso ninguna solución.** Con esta aclaración, la Auditoría queda cerrada y aprobada — el siguiente paso es la Etapa 2 (Diseño técnico) de 7.3.1.

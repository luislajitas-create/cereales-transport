# Bloque 7.3.2 — Auditoría: Aging de Cobranzas y Tablero Financiero

Fecha: 2026-07-11. Etapa 1 (Auditoría) de `METODOLOGIA_SDC.md` — **documento de diagnóstico puro: no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se propone todavía ninguna solución.** Toda afirmación sobre el estado actual va acompañada de su referencia `archivo:línea`.

**Relación con lo anterior:** `BLOQUE7.3_ALCANCE.md` fijó a 7.3.2 como el segundo sub-bloque del dominio Performance Financiera, después de 7.3.1 (`BLOQUE7.3.1_DISENO_RENTABILIDAD.md`, ya implementado y validado). Esta auditoría se apoya en la arquitectura ya cerrada — `BLOQUE7.2.a` (dominios), `BLOQUE7.2.b` (ontología: Factura y Cobranza como Materialización y Hecho económico respectivamente), `BLOQUE7.2.c` (ciclo de vida del conocimiento), `BLOQUE7.2.d` (principios rectores), `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` y `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` (constitución técnica ya en vigencia para cualquier cálculo nuevo) — sin reabrir ninguno de esos documentos.

**Pregunta que responde esta auditoría, y solo esta:** *¿qué existe hoy en el sistema para calcular la cartera de cobranzas de un período (saldos, vencimientos, mora, DSO), y qué se lo impide hacer de forma directa?*

---

# Parte 1 — Cómo se representan hoy la Factura y la Cobranza

## La Factura emitida

`Factura` (`backend/prisma/schema.prisma:353-369`) tiene `fecha` (emisión) y `vencimiento` — **dos campos `DateTime` reales y distintos**, ambos obligatorios: `CreateFacturaDto` exige los dos con `@IsDateString()` (`backend/src/facturas/dto/create-factura.dto.ts:12-16`), y `FacturasController.create()` los persiste tal cual, sin derivar uno del otro (`facturas.controller.ts:257-296`). **No hay una fecha de vencimiento "implícita" ni calculada — es un dato real que carga quien factura**, a diferencia de lo que `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` dejaba como pregunta abierta para otros campos (ej. `Cliente.condicionesComerciales`, que sigue sin estructurar y no se usa para sugerir nada — sigue fuera de este alcance).

`Factura.importe` se fija una sola vez, en la creación, como la suma de `Viaje.importeTotal` de los viajes incluidos (`facturas.controller.ts:286`) — no se recalcula después. Las mismas guardas del Bloque 4.1 que ya usó `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` (Parte 3) impiden editar `toneladas`/`tarifaTonelada` de un Viaje ya facturado, así que `Factura.importe` permanece consistente con la realidad mientras la Factura esté vigente.

## La Cobranza parcial o total

`Cobranza` (`schema.prisma:384-398`) es una fila por cada pago recibido contra una Factura — no hay un campo "saldo" en `Factura`, el saldo siempre se deriva sumando las `Cobranza` de esa factura. Cada `Cobranza` tiene `importe`, `fecha`, `medioPago` (texto libre, sin normalizar — mismo hallazgo ya señalado en `DEUDA_TECNICA.md` D5, no se reabre acá) y `anulada`/`anuladaMotivo`/`anuladaFecha`.

`registrarCobranza()` (`facturas.controller.ts:334-385`) es la única vía de creación: bloquea la fila de la Factura (`FOR UPDATE`, línea 348) para que dos cobranzas concurrentes no lean el mismo saldo disponible, filtra `vigentes = cobranzas.filter(c => !c.anulada)` (línea 354), rechaza duplicados exactos (fecha+importe+medioPago idénticos, líneas 357-364) y rechaza que la suma supere `factura.importe + 0.01` de tolerancia (línea 366-370, `TOLERANCIA_REDONDEO`, línea 16).

## Cómo se recalcula el estado de la Factura

`calcularEstadoFactura(importeFactura, totalCobradoVigente)` (`facturas.controller.ts:18-22`) es una función pura: `COBRADO_TOTAL` si lo cobrado vigente ≥ importe, `COBRADO_PARCIAL` si es mayor a cero, si no `FACTURADO`. Se invoca en dos lugares — al registrar una cobranza (línea 381) y al anular una (línea 424) — **siempre recalculando desde cero sobre las cobranzas vigentes actuales**, nunca incrementando/decrementando un contador. Consecuencia importante: `Factura.estado` puede retroceder (de `COBRADO_TOTAL` a `COBRADO_PARCIAL`, por ejemplo) si se anula una cobranza — no es un estado monótono, pero **siempre está actualizado y es confiable en el momento en que se lee**, porque no depende de una secuencia de eventos históricos sin filtrar (a diferencia del hallazgo central de `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` sobre `LiquidacionViaje`/`FacturaViaje` históricos — ver Parte 3).

---

# Parte 2 — Qué significa "vencida" hoy

**No existe ningún campo ni estado almacenado que diga "vencida".** El único lugar del sistema que hoy responde esa pregunta es el Dashboard, de forma ad-hoc:

```
vencimiento < hoy  AND  estado IN ("FACTURADO", "COBRADO_PARCIAL")
```
(`dashboard.controller.ts:32-35`), con `hoy = new Date()` sin normalizar a inicio de día (línea 15). Correctamente excluye `COBRADO_TOTAL` (ya está pagada, no importa si venció) y `ANULADO` (no es una deuda real). El saldo se calcula recién en memoria, después de la consulta: `saldoPendiente = f.importe − Σcobranzas vigentes` (líneas 51-60), filtrando solo las que quedan con saldo > 0 (línea 62).

Esta es, hoy, la única "definición de negocio" de factura vencida que existe — vive dentro de un controller de Estado Operativo (`DashboardController`), no en el Motor de Inteligencia, y nadie la declaró formalmente como la semántica oficial. Es exactamente el caso concreto que `BLOQUE7.2.a` (Parte 3) y `BLOQUE7.2.d` (principio 4) ya habían anticipado en abstracto — acá aparece materializado con código real.

**Matiz no señalado hasta ahora:** al comparar `vencimiento < hoy` sin normalizar horas, una Factura se considera "vencida" desde la medianoche del día de su propio vencimiento (porque `vencimiento` se persiste a medianoche — `new Date(vencimiento)` sobre un `IsDateString`, `facturas.controller.ts:293`), no recién al día siguiente. No es un bug — es una decisión implícita que nadie declaró explícitamente, y que 7.3.2 va a heredar o vas a tener que decidir si cambia.

---

# Parte 3 — Vigencia y exclusión de casos anulados

## Facturas anuladas

`FacturasController.anular()` (`facturas.controller.ts:317-331`) **bloquea la anulación si existe alguna cobranza vigente** (`factura.cobranzas.some(c => !c.anulada)`, línea 321) — a diferencia de Liquidaciones, acá no hay forma de que una Factura quede `ANULADO` con cobranzas vigentes todavía asociadas. Esto simplifica el caso frente al de 7.3.1: **una Factura `ANULADO` nunca tiene saldo pendiente real que rescatar** — excluirla completamente del cálculo de cartera (`estado !== "ANULADO"`) es suficiente y correcto, sin necesidad de mirar sus cobranzas históricas.

Confirmado con datos reales del entorno de desarrollo (validación manual de 7.3.1, mismo día): existen Facturas `ANULADO` reales en la base (`QA-FACT-PLANILLA`, `REG2-1783475965780`, visibles en la pantalla de Facturación) — el caso no es hipotético.

## Cobranzas anuladas

`anularCobranza()` (`facturas.controller.ts:388-428`) marca `anulada: true` sin borrar la fila (mismo patrón de conservar historial completo que ya usan Liquidaciones y Facturas) y recalcula `totalCobradoVigente` excluyendo la cobranza recién anulada (línea 421-423), propagando el nuevo estado a la Factura. **El filtro `anulada: false` ya es, en el código actual, la única fuente de verdad para "cobrado real"** — el mismo filtro que cualquier cálculo de aging tiene que aplicar.

## Por qué este caso es más simple que el de 7.3.1

`BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` (Parte 3) encontró que anular una Liquidación o Factura no borra sus filas hijas (`LiquidacionViaje`/`FacturaViaje`), dejando filas históricas que un cálculo descuidado podría sumar por error. Para Aging **ese riesgo no se replica de la misma forma**: la cartera se calcula directamente sobre `Factura` (no sobre una tabla puente con múltiples episodios por Viaje), y una Factura anulada, por la guarda ya descripta, nunca convive con una cobranza vigente. El único filtro de vigencia que aging necesita es sobre los dos campos de estado que ya existen (`Factura.estado`, `Cobranza.anulada`) — no hay una tercera capa de historial que reconciliar.

---

# Parte 4 — Las seis nociones de deuda, definidas con precisión

| Concepto | Definición, con los datos actuales |
|---|---|
| **Saldo pendiente** | Por Factura vigente (`estado !== ANULADO`): `importe − Σ Cobranza.importe` (solo `anulada: false`). Puede ser 0 (ya `COBRADO_TOTAL`). |
| **Deuda vencida** | Suma de saldos pendientes de Facturas vigentes con `vencimiento < hoy`. |
| **Deuda por vencer** | Suma de saldos pendientes de Facturas vigentes con `vencimiento ≥ hoy`. |
| **Días de mora** | Por Factura vencida con saldo > 0: `hoy − vencimiento`, en días. No existe hoy en ningún lugar del sistema — es cálculo nuevo, pero directo. |
| **Aging (0-30/31-60/61-90/+90)** | Clasificación de "días de mora" en baldes — mismo dato de base que la fila anterior, agrupado. |
| **DSO** | Ver más abajo — no es un concepto único, tiene al menos dos variantes honestas distintas. |

## DSO: dos variantes posibles, ninguna es "la" fórmula obvia

- **DSO histórico (por facturas ya cobradas):** para las Facturas que llegaron a `COBRADO_TOTAL` dentro de un período, promedio de `(fecha de la cobranza que completó el pago) − Factura.fecha`. Es exacto para lo que mide, pero mira solo hacia atrás — ignora la cartera todavía abierta.
- **DSO clásico/snapshot (fórmula contable estándar):** `(saldo pendiente total actual / ventas facturadas del período) × días del período`. Es la fórmula de uso común en finanzas, pero es una aproximación reconocida de la industria — mezcla un saldo de un instante con ventas de un rango de tiempo, no una medición longitudinal real.

Ninguna de las dos es "más correcta" en abstracto — son preguntas de negocio distintas (¿cuánto tardamos en cobrar lo que ya cobramos? vs. ¿cuál es la relación entre lo que se debe hoy y lo que se facturó en el período?). Cuál adoptar como el "DSO oficial" de 7.3.2 es una decisión de negocio (Parte 12), no una que esta auditoría resuelva.

---

# Parte 5 — Qué puede calcularse hoy sin datos nuevos

Con `Factura` y `Cobranza` tal como existen: saldo pendiente (por factura, por cliente, total), deuda vencida vs. por vencer, días de mora por factura, aging en baldes, y **ambas** variantes de DSO de la Parte 4. Ninguno requiere un campo nuevo en el modelo — la brecha, si existe, es de definición de negocio, no de datos (mismo patrón que ya había anticipado `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md`: "el sistema no tiene un problema de datos faltantes, tiene un problema de datos nunca combinados").

---

# Parte 6 — Qué no puede calcularse con honestidad

- **DSO de tendencia real** (cómo evolucionó la eficiencia de cobro mes a mes, más allá de un snapshot puntual): requeriría guardar una foto periódica del saldo pendiente en el tiempo — hoy solo existe el estado actual, no un histórico de saldos. Fuera de 7.3.2 tal como está planteado (además, es más cercano a 7.3.5 — Tendencias — que a este sub-bloque, ver `BLOQUE7.3_ALCANCE.md`).
- **Medio de pago predominante, de forma confiable:** `Cobranza.medioPago` es texto libre sin normalizar (D5) — cualquier agregación por medio de pago hereda ese ruido.
- **Probabilidad de impago / score de riesgo por cliente:** es Nivel 4 (predictivo), ya excluido explícitamente en `BLOQUE7.1_MAPA_INDICADORES.md` y en `BLOQUE7.2.a` (dominio Inteligencia Predictiva, fuera de Bloque 7.3 según `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 2).
- **Proyección de cobranza futura:** mismo motivo, Nivel 4, ya fuera de alcance en toda la serie.

---

# Parte 7 — Riesgos de doble conteo, vigencia o interpretación

| # | Riesgo | Nota |
|---|---|---|
| 1 | Sumar cobranzas anuladas por no filtrar `anulada: false` | Mismo patrón de riesgo ya identificado y mitigado en 7.3.1 para otras entidades |
| 2 | Incluir Facturas `ANULADO` en la cartera | Se excluyen enteras — no requieren mirar cobranzas históricas (Parte 3) |
| 3 | **Definir "vencida" por segunda vez, distinta de la que ya usa el Dashboard** (`dashboard.controller.ts:32-35`) | Riesgo real y ya materializado, no hipotético — ver Parte 2 y Parte 8 |
| 4 | Ambigüedad de "hoy" (hora del día, huso horario) al comparar contra `vencimiento` | Menor, pero afecta en qué momento exacto una factura pasa a "vencida" el mismo día de su vencimiento |
| 5 | Redondeo de punto flotante mostrando saldos de centavos que en realidad son cero | Ya existe una `TOLERANCIA_REDONDEO = 0.01` (`facturas.controller.ts:16`) pensada para el registro de cobranzas — un cálculo de aging que no la reutilice podría mostrar "saldo pendiente: $0.01" en facturas que ya están, en la práctica, completamente cobradas |
| 6 | Cruzar, en un futuro (7.3.4), el "importe facturado" de este sub-bloque con el "ingreso" de 7.3.1 sin notar que son fuentes distintas (`Factura.importe` vs. `Σ FacturaViaje.importeViaje` de los viajes de un cliente) | Hoy coinciden siempre (Parte 1), pero conviene dejarlo señalado para cuando se diseñe el consumidor que combine ambos |

---

# Parte 8 — Qué pertenece al Motor de Inteligencia y qué no

Aplicando la regla 1 de `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` ("vive dentro del Centro de Inteligencia... nunca dentro de un controller de dominio transaccional"):

- **Pertenece a `FacturasController` (sin cambios):** la creación de Facturas y Cobranzas, las validaciones de duplicado/tope, la transición de `Factura.estado` (`calcularEstadoFactura`). Es Materialización (Clase III de `BLOQUE7.2.b`) — el Motor la lee, nunca la reimplementa ni la duplica.
- **Pertenece al Motor de Inteligencia (`backend/src/inteligencia/`):** saldo pendiente agregado, "vencida", deuda vencida/por vencer, días de mora, aging, DSO — ninguno de estos existe como campo persistido, todos son lecturas interpretadas sobre `Factura`/`Cobranza` ya materializadas (Etapa 3 de `BLOQUE7.2.c`, igual que 7.3.1).

**Hallazgo que hay que resolver, no ignorar:** el Dashboard actual (`dashboard.controller.ts`) **ya calcula una versión de "vencida" fuera del Motor**, desde antes de que el Motor existiera. `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (Parte 8, punto 4) ya había dejado esta pregunta explícitamente abierta ("¿el Dashboard actual se migra alguna vez bajo el Centro de Inteligencia?") — 7.3.2 es el primer sub-bloque donde esa pregunta deja de ser hipotética: si el Motor define "vencida" de una forma distinta a la del Dashboard, el sistema va a mostrar dos números distintos para la misma pregunta de negocio en dos pantallas distintas. No se resuelve en esta auditoría (Parte 12).

---

# Parte 9 — Semántica compartida a extraer ahora a `backend/src/inteligencia/shared/`

`BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` (regla 8) es explícito: *"si dos cálculos nuevos necesitan la misma regla... se extrae antes de duplicarse una segunda vez — no después."* 7.3.2 es exactamente ese segundo cálculo. Candidatos concretos, identificados — no implementados:

1. **Filtro de vigencia de documento/movimiento anulado.** 7.3.1 lo usa para `Factura.estado`/`Liquidacion.estado`; 7.3.2 lo necesita otra vez para `Factura.estado`/`Cobranza.anulada`. Mismo patrón conceptual ("¿este registro sigue siendo válido?"), aplicado a pares de entidades distintas.
2. **Definición de "hoy"/fecha de referencia**, ya usada de forma ad-hoc en el Dashboard (`dashboard.controller.ts:15`) y necesaria de nuevo para vencida/mora/aging en 7.3.2.
3. **Tolerancia de redondeo monetario** (`TOLERANCIA_REDONDEO = 0.01`), hoy solo en `facturas.controller.ts:16`, relevante para cualquier cálculo de saldo, no solo para registrar una cobranza.

Esta auditoría **identifica** los tres candidatos — la decisión de extraerlos ahora, o de aceptar la duplicación una vez más y refactorizar después, es de la Etapa 2 (Diseño técnico), no de acá.

---

# Hallazgos confirmados

1. `Factura.vencimiento` es un campo real, obligatorio y ya poblado — no hay brecha de captura como la que sí existía para vencimientos documentales de Chofer/Vehículo (`BLOQUE7.1_INTELIGENCIA_OPERATIVA.md`).
2. El saldo pendiente y `Factura.estado` son siempre confiables en el momento de la lectura — no hay filas históricas contaminando el cálculo (a diferencia de `LiquidacionViaje`/`FacturaViaje` en 7.3.1), porque `anular()` bloquea la anulación de una Factura con cobranzas vigentes.
3. **"Vencida" ya está definida en el sistema, pero de forma ad-hoc y fuera del Motor de Inteligencia** (`dashboard.controller.ts:32-35`) — 7.3.2 no parte de cero, parte de una definición ya en uso que hay que adoptar o reemplazar explícitamente, no ignorar.
4. DSO no es un único número — hay al menos dos definiciones honestas y distintas, ninguna claramente "la correcta" sin una decisión de negocio.

# Brechas de datos

- Ninguna brecha de datos bloqueante para saldo, vencida, mora, aging o cualquiera de las dos variantes de DSO.
- `Cobranza.medioPago` sigue sin normalizar (D5) — no bloquea 7.3.2, pero cualquier futuro desglose por medio de pago hereda ese ruido.
- No existe histórico de saldo en el tiempo — bloquea únicamente el DSO de tendencia (Parte 6), que de todos modos no es objeto de 7.3.2 sino de 7.3.5.

# Decisiones de negocio pendientes

1. **¿Cuál de las dos variantes de DSO (histórico o snapshot/clásico) es el "DSO oficial" de 7.3.2 — o se muestran ambas?**
2. **¿Se adopta la definición de "vencida" que ya usa el Dashboard (`vencimiento < hoy AND estado IN [FACTURADO, COBRADO_PARCIAL]`) como la semántica oficial del Motor, y se plantea (en otro sub-bloque, no en este) migrar al Dashboard para que la consuma de ahí — o el Motor define la suya propia y ambas coexisten con el riesgo ya señalado en la Parte 7?**
3. **¿Una Factura vence, para propósitos de aging, desde la medianoche de su propio día de vencimiento, o recién al día siguiente?** Hoy el Dashboard implica lo primero, sin que nadie lo haya decidido conscientemente.
4. **¿Los tres candidatos de la Parte 9 se extraen a `inteligencia/shared/` ya en el Diseño técnico de 7.3.2, o se acepta una tercera duplicación puntual y se refactoriza más adelante?**

# Riesgos

Ver Parte 7 — ninguno bloqueante, todos mitigables con las mismas técnicas ya validadas en 7.3.1 (filtros explícitos de vigencia, reutilización de definiciones ya existentes en vez de inventar nuevas).

# Recomendación: ¿puede 7.3.2 implementarse sin migración?

**Sí.** Todos los conceptos de la Parte 4 —saldo pendiente, deuda vencida, deuda por vencer, días de mora, aging, y ambas variantes de DSO— se calculan enteramente sobre `Factura` y `Cobranza` tal como existen hoy en `schema.prisma`. No hace falta ningún campo nuevo, ningún índice adicional (`Factura` ya indexa `vencimiento` y `clienteId`, `schema.prisma:367-368`), y ninguna migración. La única condición para que la recomendación se sostenga es que las cuatro decisiones de negocio de más arriba se resuelvan antes de escribir el Diseño técnico — no porque falte dato, sino porque falta acuerdo sobre qué significa cada número.

---

## Cierre

Esta auditoría documenta que SDC ya tiene, en `Factura` y `Cobranza`, todo el dato necesario para calcular la cartera de cobranzas de un período — el vacío no es de datos, es de una definición compartida de "vencida" (que además ya existe, sin declarar, en el Dashboard) y de una decisión sobre qué variante de DSO adoptar. Se identificó que el riesgo de vigencia es más simple de resolver que en 7.3.1 (no hay filas históricas que filtrar, alcanza con los dos campos de estado ya existentes), y se señalaron tres candidatos concretos para extraer a `inteligencia/shared/` en este sub-bloque, tal como la constitución técnica ya anticipaba.

**No se propuso ninguna solución, ningún endpoint, ninguna pantalla.** Queda a la espera de aprobación antes de pasar a la Etapa 2 (Diseño técnico) de 7.3.2.

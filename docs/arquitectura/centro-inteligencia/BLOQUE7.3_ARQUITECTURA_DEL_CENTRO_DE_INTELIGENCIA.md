# Bloque 7.3 — Arquitectura del Centro de Inteligencia (SDC v2)

Fecha: 2026-07-11. Documento de arquitectura — puente entre la arquitectura conceptual ya cerrada (`BLOQUE7.2.a` a `BLOQUE7.2.d`) y los sub-bloques concretos de Bloque 7.3. **No se escribió código nuevo, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit, no se hizo push.** A diferencia de la serie 7.2 (puramente conceptual), este documento sí referencia la estructura técnica real ya aprobada en `BLOQUE7.3.1_DISENO_RENTABILIDAD.md` (el módulo `backend/src/inteligencia/`), porque su propósito es, precisamente, dejar de hablar solo en abstracto y decir cómo se organiza en código lo que la serie 7.2 diseñó en concepto.

**Nota post-aprobación:** al momento de escribir este documento el módulo todavía se llamaba `reportes/` — se renombró a `inteligencia/` el mismo día, durante la implementación de 7.3.1, precisamente para que la estructura de carpetas coincidiera desde el principio con el nombre que este documento ya usa. Las referencias de más abajo están actualizadas a ese nombre.

**Relación con lo anterior:** no modifica ni reabre `BLOQUE7.2.a-d`, `BLOQUE7.3_ALCANCE.md` ni `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md`/`BLOQUE7.3.1_DISENO_RENTABILIDAD.md`. Los da por aprobados y construye sobre ellos.

**Pregunta que responde este documento, y solo esta:** *¿qué es el Centro de Inteligencia como una única arquitectura, y cómo tienen que relacionarse dentro de ella 7.3.1 a 7.3.5 (y lo que venga después) para que ninguno recalcule lo que otro ya resolvió?*

---

# Parte 1 — ¿Qué es el Centro de Inteligencia?

El Centro de Inteligencia es el nombre concreto que toma, a partir de Bloque 7.3, el Motor de Inteligencia que la serie 7.2 diseñó en abstracto. Hasta `BLOQUE7.3.1_DISENO_RENTABILIDAD.md` los 7 dominios de `BLOQUE7.2.a` eran un concepto sin cuerpo — con la aprobación del módulo `backend/src/inteligencia/` nace su primer módulo real.

**Definición:** el Centro de Inteligencia es el conjunto de módulos backend que:
1. leen el modelo transaccional existente (`Viaje`, `Factura`, `Liquidación`, etc.) sin modificarlo ni agregarle responsabilidades;
2. aplican una semántica compartida única (vigencia de documentos, definición de período, definición de margen — `BLOQUE7.2.a`, Parte 3);
3. producen conocimiento reutilizable, en las cinco formas que distingue la Parte 4 de este documento (KPI, Insight, Alerta, Benchmark, Tendencia);
4. son la única fuente autorizada de esos cálculos — ningún consumidor (pantalla, reporte, dashboard futuro, IA futura) tiene permitido recalcular nada por su cuenta, principio ya fijado como contrato de responsabilidad en `BLOQUE7.3.1_DISENO_RENTABILIDAD.md`, sección 6, y que este documento generaliza a todo el Centro.

No es un dominio nuevo ni una entidad de negocio — es el **lugar arquitectónico** (y físico, en el código) donde viven juntos los dominios que `BLOQUE7.2.a` ya había definido.

---

# Parte 2 — Qué dominios contiene, y cuáles quedan fuera de este ciclo

| Dominio (`BLOQUE7.2.a`) | ¿Bloque 7.3 lo cubre? | Sub-bloque(s) |
|---|---|---|
| Estado Operativo | **No** — ya tiene una implementación de facto, previa a esta arquitectura: `dashboard.controller.ts` (`viajesEnCurso`, `pendientesFacturar`, `facturasVencidas`, `liquidacionesPendientesPago`, `anticiposNoLiquidados`) ya calcula, sin saberlo, Información Directa de este dominio | — (ver Parte 8, punto 3) |
| Performance Operativa | Parcial | 7.3.5 |
| Performance Comercial | Parcial | 7.3.5 |
| Performance Financiera | **Sí — es el núcleo de este ciclo** | 7.3.1, 7.3.2, 7.3.5 |
| Riesgos | Parcial, condicionado | 7.3.3 (con el límite ya fijado en `BLOQUE7.3_ALCANCE.md`, Frontera 2) |
| Gobierno | No | Ningún sub-bloque de 7.3 lo aborda — sigue siendo `AuditLog` tal cual está |
| Inteligencia Predictiva | No | Declarado, no diseñado (sin cambios respecto de `BLOQUE7.2.a`) |

**Lectura:** Bloque 7.3, tal como está planificado, es en la práctica la primera implementación real del dominio Performance Financiera, con una extensión parcial hacia Riesgos y hacia Performance Operativa/Comercial — no un Centro de Inteligencia que cubra los 7 dominios. Vale la pena decirlo así de explícito para que nadie asuma, por el nombre del documento, que Bloque 7.3 cierra toda la arquitectura de 7.2.a — cierra una porción, la de mayor apalancamiento, no el total.

---

# Parte 3 — Qué consume y qué produce cada sub-bloque

| Sub-bloque | Consume | Produce |
|---|---|---|
| **7.3.1** Rentabilidad | `Viaje`, `FacturaViaje`+`Factura` (vigente), `LiquidacionViaje`+`Liquidación` (vigente) | Margen operativo por viaje; resultado económico por cliente/transportista/total — expuesto como funciones reutilizables en `rentabilidad.calc.ts` |
| **7.3.2** Aging de cobranzas | `Factura`, `Cobranza` | Indicadores de cartera (DSO, aging 30/60/90, total a cobrar) |
| **7.3.3** Alertas (condicionado) | Los productos ya calculados de 7.3.1/7.3.2 (ej. anticipos sin liquidar, cartera vencida) + datos operativos ya confiables | Alertas (umbral + destinatario) — no recalcula nada, lee lo que 7.3.1/7.3.2 ya definieron |
| **7.3.4** Dashboard Ejecutivo | Los productos ya calculados de 7.3.1, 7.3.2 y 7.3.3 | Una vista consolidada con drill-down — pura composición y presentación, sin lógica de cálculo propia |
| **7.3.5** Benchmarking y Tendencias | Los mismos productos de 7.3.1 (y 7.3.2), sobre una serie de períodos sucesivos | Comparaciones entre pares (Benchmark) y evoluciones en el tiempo (Tendencia) |

Ningún sub-bloque, salvo 7.3.1 y 7.3.2 (que son los únicos que tocan datos transaccionales directamente), tiene permiso de leer `Viaje`/`Factura`/`Liquidación` por su cuenta — todos los demás consumen lo que 7.3.1/7.3.2 ya calcularon. Es la aplicación directa, ahora con nombres concretos, del principio "un dato, un dominio dueño" de `BLOQUE7.2.d`.

---

# Parte 4 — La diferencia entre KPI, Insight, Alerta, Benchmark y Tendencia

Los cinco términos se usan a veces como sinónimos fuera de este proyecto. Acá no lo son — cada uno responde a un eje distinto, y ninguno es una forma nueva de calcular algo: los cinco se apoyan en los mismos Indicadores y Análisis Cruzados ya definidos por `BLOQUE7.2.a` (Parte 4), solo que envueltos con un propósito distinto.

## KPI (Indicador Clave de Desempeño)

Un **Indicador** (`BLOQUE7.2.a`, Parte 4) que, además, alguien decidió seguir de forma recurrente, con un dueño y una cadencia de revisión asignados. No todo Indicador es un KPI — "resultado económico del mes" es un Indicador en cuanto existe; se vuelve KPI cuando Gerencia decide mirarlo todos los meses como parte de su rutina. La diferencia no es de cálculo, es de **decisión de negocio sobre qué mirar siempre**.

## Insight

Un hallazgo que el propio sistema detecta y trae a la superficie **sin que nadie lo haya pedido**. No es una categoría de cálculo nueva — usa Indicadores o Análisis Cruzados ya existentes — es una capa de interpretación que decide qué, dentro de todo lo calculable, merece atención ahora. "El margen del Cliente X cayó 30% este mes" no es un KPI (nadie lo estaba mirando activamente) — es un Insight porque el sistema lo encontró y lo señaló antes de que alguien preguntara.

## Alerta

Ya definida en `BLOQUE7.2.a` (Parte 4): un Indicador o Análisis Cruzado con un **umbral de disparo** y un **destinatario**. Se dispara ante una condición, no se consulta — es la única de las cinco que empuja información en vez de esperar a que alguien la busque (junto con Insight, aunque con una diferencia clave: la Alerta dispara sobre una condición explícita y conocida de antemano; el Insight surge de un patrón que nadie definió como condición previa).

## Benchmark

Una comparación entre **pares de la misma categoría, en un mismo momento** — cliente vs. cliente, chofer vs. chofer, transportista vs. transportista. Es un Análisis Cruzado con eje **horizontal**: compara entidades entre sí, no una entidad contra su propio pasado.

## Tendencia

La evolución de un mismo Indicador o Análisis Cruzado **a lo largo de varios períodos**. Es un Análisis Cruzado con eje **vertical/temporal**: la misma entidad (o el mismo agregado), distintos momentos.

## Tabla de distinción

| | Eje de comparación | ¿Se consulta o se empuja? | Origen |
|---|---|---|---|
| KPI | Ninguno (valor puntual) | Se consulta | Decisión humana de seguimiento |
| Insight | Ninguno o cualquiera | Se empuja | Detección automática de patrón |
| Alerta | Ninguno (umbral) | Se empuja | Condición predefinida |
| Benchmark | Entre entidades (horizontal) | Se consulta | Comparación explícita pedida |
| Tendencia | En el tiempo (vertical) | Se consulta | Serie histórica pedida |

**Dónde caen los sub-bloques de 7.3:** Benchmark y Tendencia son, juntas, exactamente lo que `BLOQUE7.3_ALCANCE.md` (Frontera 1) ya había fijado como el contenido de **7.3.5**. Alerta es **7.3.3**. KPI no tiene un sub-bloque propio — es, probablemente, una forma de presentar en **7.3.4** una selección de los Indicadores que 7.3.1/7.3.2 ya calculan (ver Parte 8, punto 3). **Insight no tiene, hoy, ningún sub-bloque en el roadmap de Bloque 7.3** — queda señalado como una capacidad real y distinta, no cubierta todavía (ver Parte 8, punto 2).

---

# Parte 5 — Qué puede reutilizar cualquier módulo futuro

- **La semántica compartida fijada en 7.3.1** (filtro de vigencia — `Factura.estado !== "ANULADO"`, `Liquidacion.estado !== "ANULADA"` — y la definición de margen operativo/resultado económico): cualquier sub-bloque que hable de "margen" debe llamar a `rentabilidad.calc.ts`, nunca reimplementar la fórmula. Es la aplicación concreta del principio 4 de `BLOQUE7.2.d` (semántica única y vinculante).
- **El patrón de filtrado de vigencia** en sí, más allá del margen: es un patrón general para cualquier Análisis Cruzado futuro que toque `Factura` o `Liquidación` (no exclusivo de rentabilidad) — 7.3.2 (aging) también tiene que decidir cómo trata facturas anuladas, y debería resolverlo con el mismo criterio, no uno propio.
- **El patrón "completos vs. incompletos"** (`BLOQUE7.3.1_DISENO_RENTABILIDAD.md`, sección 3.2): cualquier Análisis Cruzado que dependa de que dos materializaciones coexistan debe adoptar el mismo tratamiento — excluir de totales, mostrar aparte — no inventar una variante.
- **El contrato de responsabilidad backend-calcula/frontend-presenta**: vinculante para todo el Centro de Inteligencia, no solo para 7.3.1. Ninguna pantalla futura (7.3.4 incluida) recalcula nada.
- **La restricción de roles `ADMINISTRADOR`/`GERENCIA`** para datos financieros sensibles: precedente a evaluar (no necesariamente copiar sin pensar) para 7.3.2 y 7.3.4.

---

# Parte 6 — Cómo se relacionan 7.3.1 a 7.3.5 en una única arquitectura

```
7.3.1 Rentabilidad ──┬──────────────▶ 7.3.4 Dashboard Ejecutivo
7.3.2 Aging ─────────┤                 (consolida y presenta,
                      │                  no calcula nada propio)
                      ▼
                 7.3.3 Alertas
                 (lee productos de 7.3.1/7.3.2,
                  nunca los recalcula)

7.3.1 Rentabilidad ──────────────────▶ 7.3.5 Benchmarking y Tendencias
                                        (extiende sobre múltiples períodos,
                                         reutiliza rentabilidad.calc.ts)
```

7.3.1 y 7.3.2 son los únicos con lectura directa del modelo transaccional — todo lo demás depende de al menos uno de los dos. Esto confirma, ahora en términos de dependencia técnica real, el orden ya fijado en `BLOQUE7.3_ALCANCE.md`: 7.3.1 y 7.3.2 primero, 7.3.3 y 7.3.4 después (dependen de que exista algo que leer), 7.3.5 en cualquier momento después de 7.3.1 (solo depende de ese, no de los demás).

**Organización de módulos:** `backend/src/inteligencia/reportes/` es, hoy, el hogar de 7.3.1 (`rentabilidad.calc.ts`); `inteligencia/shared/`, `inteligencia/alertas/` y `inteligencia/benchmarking/` ya existen como carpetas vacías, preparadas para 7.3.2/7.3.3/7.3.5. Cuando se diseñe 7.3.2, va a necesitar su propio archivo de cálculo (`aging.calc.ts`, por ejemplo) dentro de `reportes/` — y en ese momento va a hacer falta decidir si la semántica compartida (filtro de vigencia, definición de período) se extrae a `inteligencia/shared/` o se mantiene duplicada hasta que la duplicación se note en la práctica. **Esa decisión no se toma en este documento** — queda señalada para el Diseño técnico de 7.3.2 (Parte 8, punto 1).

---

# Parte 7 — Qué queda fuera de este documento

- El diseño técnico de 7.3.2, 7.3.3, 7.3.4 o 7.3.5 — cada uno sigue su propio ciclo completo de `METODOLOGIA_SDC.md` (Auditoría → Diseño → Aprobación → Implementación...).
- Cualquier código, migración o commit.
- La resolución de los dominios no cubiertos por Bloque 7.3 (Estado Operativo, Gobierno, Inteligencia Predictiva) — quedan señalados como fuera de este ciclo, no resueltos.
- La decisión de extraer o no la semántica compartida a `inteligencia/shared/` — se señala como pendiente, no se decide.

---

# Parte 8 — Puntos de decisión pendientes

1. **¿La semántica compartida (filtro de vigencia, definición de período) se extrae a `inteligencia/shared/` antes de escribir 7.3.2, o se acepta cierta duplicación por ahora y se refactoriza cuando duela?** (Parte 6.)
2. **¿La capacidad de Insight se incorpora al roadmap de Bloque 7.3 como un sub-bloque nuevo, o queda para un futuro Bloque 7.4?** Hoy no tiene dueño en ningún documento aprobado.
3. **¿Quién decide qué Indicadores se convierten en KPI dentro de 7.3.4** — lo decide el diseño del Dashboard Ejecutivo de forma centralizada, o cada dueño de dominio (Financiero, Operativo) de forma independiente?
4. **¿El Dashboard operativo actual (`dashboard.controller.ts`, dominio Estado Operativo de facto) se migra en algún momento bajo el Centro de Inteligencia, o queda como una implementación separada, previa a esta arquitectura, sin necesidad de unificarse?**

---

## Cierre

El Centro de Inteligencia es el cuerpo real que empieza a tomar el Motor de Inteligencia conceptual de la serie 7.2, a partir del módulo `backend/src/inteligencia/` ya aprobado en 7.3.1. Este documento fija cómo se relacionan los cinco sub-bloques de Bloque 7.3 entre sí (quién lee el modelo transaccional, quién solo consume lo ya calculado), distingue con precisión KPI/Insight/Alerta/Benchmark/Tendencia, y deja explícito que Bloque 7.3, tal como está planificado, cubre a fondo un solo dominio (Performance Financiera) y parcialmente otros dos (Riesgos, y Performance Operativa/Comercial) — no los 7 dominios de `BLOQUE7.2.a`.

No se implementó nada. Queda a la espera de aprobación antes de continuar con el diseño de 7.3.2.

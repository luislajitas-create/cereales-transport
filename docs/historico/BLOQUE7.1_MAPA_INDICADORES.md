# Bloque 7.1 — Mapa de Indicadores (SDC v2)

Fecha: 2026-07-10. Documento de análisis funcional y diseño conceptual puro — **no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit, no se hizo push. No se diseñan pantallas, no se propone implementación.** Construye sobre el inventario de `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` (Partes 1 y 2) para responder las Partes 3 y 4 de ese mismo análisis.

---

# PARTE 3 — Mapa de Inteligencia (4 niveles)

Clasifica las preguntas del inventario según cuánto hay que procesar el dato para responderlas — no según qué tan importante es la pregunta (eso es la Parte 4). Un mismo tema de negocio puede tener preguntas en varios niveles (ej. "facturas vencidas" es Nivel 1; "aging de cartera de esas mismas facturas" ya es Nivel 2).

## Nivel 1 — Información inmediata

Se obtiene directamente de una tabla o de un filtro simple, sin agregaciones ni cruces. Es, en varios casos, lo que el Dashboard ya muestra hoy.

- Cuántas facturas están vencidas hoy, y por cuánto monto (ya existe).
- Cuántas liquidaciones confirmadas están pendientes de pago (ya existe).
- Cuántos viajes están en curso ahora mismo (ya existe).
- Cuántos clientes activos hay frente a dados de baja.
- Cuántos vehículos activos hay disponibles por transportista.
- Qué porcentaje de viajes descargados todavía no se facturó.
- Qué anulaciones se realizaron y por qué motivo (liquidaciones, facturas, cobranzas, anticipos).
- Qué documentación vence en los próximos 30 días (una vez que el dato se cargue).

## Nivel 2 — Indicadores

Requieren un cálculo sobre una o dos tablas — sumas, promedios, agrupaciones, comparaciones de fecha. Ninguno cruza más de dos entidades de negocio distintas.

- Total pendiente de cobrar / total a pagar a transportistas.
- Aging de cartera (30/60/90 días) por cliente.
- DSO (días promedio de cobro) por cliente.
- Facturación mensual total y su evolución mes a mes.
- Costo total de comisiones pagadas por período.
- Gasto por categoría de anticipo (combustible, seguros, efectivo, otros).
- Ranking de clientes por toneladas o por facturación.
- Ranking de choferes/camiones por viajes o toneladas.
- Concentración de facturación en el cliente más grande.
- Estacionalidad de volumen operativo (viajes/toneladas por mes).
- Tarifa promedio por tonelada, por cereal.

## Nivel 3 — Análisis

Combinan varios módulos/entidades entre sí — el resultado no vive en ninguna tabla individual, surge de cruzar `Viaje` con `Liquidacion` y/o `Factura`, o de comparar un período contra otro.

- **Rentabilidad por viaje, cliente, transportista o cereal** (cruce `Viaje` + `LiquidacionViaje` + `FacturaViaje`) — el análisis más complejo y más valioso de todo el inventario.
- Margen promedio por ruta (origen-destino).
- Evolución del margen mes a mes.
- Cliente que creció o cayó en volumen respecto al período anterior.
- Tiempo promedio de un viaje punta a punta, y en qué etapa se traba más (cruce con `HistorialEstadoViaje`).
- Comparación de comisión pactada vs. aplicada, cruzada con quién autorizó el override (`AuditLog`).
- Relación entre anticipos otorgados y viajes realizados.

## Nivel 4 — Predicción futura (no implementar todavía, solo identificar)

Requieren proyectar o simular, no solo consultar el pasado. Se listan para que quede constancia de que existen como necesidad de negocio real — **ninguno se diseña ni se implementa en este bloque.**

- Proyección de flujo de caja (a cobrar menos a pagar) de las próximas semanas.
- Proyección de facturación o de cobranza del próximo período, basada en la tendencia histórica.
- Simulación de impacto si un cliente o transportista grande dejara de operar.
- Alerta predictiva de qué cliente tiene mayor probabilidad de atrasarse en el próximo pago, según su historial.
- Proyección de necesidad de flota/choferes según la tendencia de volumen.

---

# PARTE 4 — Las 20 preguntas de mayor valor para un gerente

Ordenadas por una combinación de **Impacto** (cuánto cambia una decisión real), **Frecuencia de uso** (cada cuánto un gerente necesitaría la respuesta) y **Complejidad** (Nivel 1-4 de la Parte 3, más alto = más difícil de construir). Se explica el porqué de cada una, no solo el orden.

| # | Pregunta | Impacto | Frecuencia | Complejidad | Por qué |
|---|---|---|---|---|---|
| 1 | ¿Cuánto tengo pendiente de cobrar y cuánto tengo que pagar, en total, hoy? | Muy Alto | Diaria | Nivel 2 | Es la pregunta de caja más básica de cualquier negocio — y hoy el Dashboard solo muestra lo vencido/confirmado, no el total real de ambos lados. |
| 2 | ¿Qué cliente deja mayor utilidad? | Muy Alto | Mensual | Nivel 3 | Sin esta respuesta, cualquier decisión comercial (a quién priorizar, a quién negociar mejor tarifa) se toma a ciegas — es el hallazgo central de todo el Bloque 7. |
| 3 | ¿Qué clientes tienen mayor deuda y qué antigüedad tiene (aging)? | Muy Alto | Semanal | Nivel 2 | Determina literalmente a quién llamar primero para cobrar — impacto directo en caja. |
| 4 | ¿Qué documentación (RTO, seguro, licencia) vence en los próximos 30 días? | Muy Alto | Semanal | Nivel 1 (una vez cargado el dato) | Riesgo legal real para una empresa de transporte, no solo una mejora de producto — un vehículo circulando sin seguro vigente es responsabilidad de la empresa. |
| 5 | ¿Qué porcentaje de mi facturación depende de mi cliente más grande? | Alto | Mensual | Nivel 2 | Mide el riesgo de concentración comercial — perder ese cliente sin saber cuánto representa es el tipo de sorpresa que puede quebrar una pyme de transporte. |
| 6 | ¿Qué cliente creció o cayó en volumen respecto al período anterior? | Alto | Mensual | Nivel 3 | Es la diferencia entre reaccionar a una caída de negocio cuando ya es tarde, o notarla a tiempo. |
| 7 | ¿Qué porcentaje de viajes descargados todavía no se facturó? | Alto | Semanal | Nivel 1 | Cada viaje descargado sin facturar es ingreso ya generado pero no reclamado — fuga de caja silenciosa si nadie lo mira. |
| 8 | ¿Cuánto costó en comisiones y anticipos este período? | Alto | Mensual | Nivel 2 | Es el costo variable más grande del negocio (además del propio flete) — sin este número no se puede calcular rentabilidad real. |
| 9 | ¿En qué etapa se traban más los viajes (cuello de botella operativo)? | Alto | Mensual | Nivel 3 | Un Gerente Operativo necesita saber si el problema está en carga, en tránsito o en descarga para decidir dónde intervenir. |
| 10 | ¿Qué chofer acumula mayor anticipo sin liquidar? | Alto | Quincenal | Nivel 2 | Exposición financiera directa — dinero ya entregado que todavía no se descontó de ninguna liquidación. |
| 11 | ¿Cuál es la facturación mensual y cómo evolucionó? | Alto | Mensual | Nivel 2 | La métrica de negocio más elemental para cualquier Director General — hoy no existe ni siquiera como serie temporal simple. |
| 12 | ¿Qué margen promedio deja cada cereal? | Alto | Mensual | Nivel 3 | Para una cerealera, decidir qué tipo de carga priorizar cuando hay que elegir es una decisión de mezcla de producto, no solo de volumen. |
| 13 | ¿Qué camión o chofer trabaja más y cuál está subutilizado? | Medio-Alto | Mensual | Nivel 2 | Optimización de flota — un camión parado es costo fijo sin ingreso. |
| 14 | ¿Qué ruta (origen-destino) es más rentable? | Medio-Alto | Trimestral | Nivel 3 | Ayuda a decidir con qué zonas conviene enfocar el desarrollo comercial. |
| 15 | ¿Cuántos clientes activos tengo frente a los que dejaron de operar? | Medio | Mensual | Nivel 1 | Salud general de la cartera comercial, de un vistazo. |
| 16 | ¿Qué porcentaje de facturas se cobra dentro del plazo pactado? | Medio-Alto | Mensual | Nivel 2 | Mide la disciplina de cobro real, más allá de cuánta plata hay pendiente en un momento puntual. |
| 17 | ¿Cuál es el tiempo promedio de un viaje de punta a punta? | Medio | Mensual | Nivel 3 | Sirve para prometer plazos realistas a los clientes y detectar degradación del servicio. |
| 18 | ¿Cuál es la comisión promedio pactada frente a la aplicada (overrides)? | Medio | Mensual | Nivel 2 | Control de gobernanza — detecta si se están negociando condiciones fuera de norma sin que nadie lo note. |
| 19 | ¿Qué productor genera más movimientos y con qué cliente se asocia? | Medio | Trimestral | Nivel 2 | Relevante específicamente para el negocio cerealero — entender la cadena origen-cliente, no solo el cliente final. |
| 20 | ¿Cuál sería el flujo de caja proyectado de las próximas semanas? | Muy Alto | Semanal | Nivel 4 (predicción, no implementar todavía) | Es la pregunta que más valor le daría a un Director General — pero es, honestamente, la más difícil de las 20: no es una consulta, es una proyección. Se incluye en el ranking para que quede su lugar marcado, no porque esté lista para construirse ahora. |

**Nota sobre el orden:** las primeras 4 combinan impacto muy alto con complejidad baja o media — son, casi con seguridad, las primeras candidatas cuando se decida pasar de este análisis a diseño. La pregunta #20 se incluyó deliberadamente última pese a su impacto máximo, porque su complejidad (Nivel 4) la ubica en una categoría distinta de esfuerzo — no compite en el mismo terreno que el resto.

---

## Cómo se relaciona este mapa con lo ya priorizado en Bloque 7

El ítem #30 de `BLOQUE7_ROADMAP_FUNCIONAL.md` ("Reporte de rentabilidad por viaje/cliente/transportista") es, en este mapa, la síntesis de las preguntas #2, #6, #12 y #14 — todas Nivel 3, todas dependen del mismo cruce `Viaje`-`Liquidacion`-`Factura`. Esto confirma, desde un ángulo distinto (preguntas de negocio en vez de auditoría de módulos), la misma conclusión a la que ya había llegado el Bloque 7: es la pieza de mayor apalancamiento de todo el backlog, porque una sola construcción de datos responde a varias de las preguntas de mayor valor de este mapa a la vez.

**No se diseñó ninguna pantalla, no se propuso implementación, no se modificó el roadmap existente, no se escribió código.**

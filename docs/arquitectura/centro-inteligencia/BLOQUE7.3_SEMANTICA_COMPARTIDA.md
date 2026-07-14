# Bloque 7.3 — Semántica Compartida del Motor de Inteligencia

Fecha: 2026-07-11. Documento breve — formaliza, en un solo lugar, las definiciones ya aprobadas en `BLOQUE7.3.1_DISENO_RENTABILIDAD.md` y `BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md`. No abre discusiones nuevas, no agrega indicadores, no amplía el roadmap, no reabre 7.3.1 ni 7.3.2 — es un índice de referencia, no una decisión nueva.

| Concepto | Definición oficial | Fórmula conceptual | Fuente de verdad | Sub-bloque |
|---|---|---|---|---|
| Factura vigente | Factura no anulada | estado distinto de ANULADO | `Factura.estado` | 7.3.1 |
| Cobranza vigente | Cobranza no anulada | `anulada` = falso | `Cobranza.anulada` | 7.3.2 |
| Saldo pendiente | Lo que falta cobrar de una factura vigente | importe menos la suma de sus cobranzas vigentes | `Factura.importe`, `Cobranza.importe` | 7.3.2 |
| Factura vencida | Vigente, no cobrada del todo, y vencida desde el día siguiente a su vencimiento (nunca el mismo día) | estado distinto de ANULADO y de COBRADO_TOTAL, y vencimiento (fecha de negocio) anterior a hoy (fecha de negocio) | `Factura.estado`, `Factura.vencimiento` | 7.3.2 |
| Deuda vencida | Suma de saldos pendientes de facturas vencidas | Σ saldo pendiente donde vencida = verdadero | derivado | 7.3.2 |
| Deuda por vencer | Suma de saldos pendientes de facturas vigentes, no vencidas, con saldo > 0 | Σ saldo pendiente donde vencida = falso | derivado | 7.3.2 |
| Días de mora | Días desde el vencimiento, solo si la factura está vencida (si no, cero) | hoy menos vencimiento, en días | derivado | 7.3.2 |
| Buckets 0-30 / 31-60 / 61-90 / +90 | Clasificación de días de mora en rangos; una factura no vencida nunca entra en un bucket, va aparte como "por vencer" | rangos sobre días de mora | derivado | 7.3.2 |
| DSO histórico | Indicador oficial: días reales que tardaron en cobrarse las facturas ya cobradas del todo en el período | promedio de (fecha de la cobranza que completó el pago menos fecha de la factura) | `Factura.fecha`, `Cobranza.fecha` | 7.3.2 |
| DSO snapshot | Indicador complementario, aproximación estándar de industria — nunca se combina con el histórico | saldo pendiente total actual / ventas facturadas del período × días del período | `Factura.importe`, saldo pendiente | 7.3.2 |
| Margen operativo | Ingreso menos costo de un viaje individual | factura vigente del viaje menos liquidación vigente del viaje | `FacturaViaje`, `LiquidacionViaje` | 7.3.1 |
| Resultado económico | Agregación del margen operativo de varios viajes, por cliente, transportista o total, en un período | Σ margen operativo | derivado | 7.3.1 |
| Fecha de negocio | El "hoy" usado en cualquier comparación de vencimiento o mora — normalizado a medianoche, sin hora | fecha actual truncada al día | reloj del sistema | 7.3.2 |
| Tolerancia monetaria | Margen aceptado al comparar importes, para no arrastrar errores de redondeo de punto flotante | 0.01 | constante compartida | 7.3.1 (origen), 7.3.2 (formalizada) |
| El frontend no recalcula | Todo número que se muestra llega ya calculado del backend | ninguna pantalla suma, resta, multiplica ni divide un importe o porcentaje — solo formatea | contrato de responsabilidad del Motor | 7.3.0 / 7.3.1 |

---

Quince definiciones, sin código, sin tablas nuevas, sin diseño de pantallas, sin decisiones pendientes. Vive junto a `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` como referencia obligatoria para cualquier cálculo nuevo del Centro de Inteligencia.

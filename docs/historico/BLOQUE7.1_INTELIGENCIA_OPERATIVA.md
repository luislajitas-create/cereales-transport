# Bloque 7.1 — Modelo de Inteligencia Operativa (SDC v2)

Fecha: 2026-07-10. Documento de análisis funcional y diseño conceptual puro — **no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit, no se hizo push.** Abre el primer sub-bloque de evolución funcional (Bloque 7.1), sobre la base de `BLOQUE7_AUDITORIA_FUNCIONAL.md` y `BLOQUE7_ROADMAP_FUNCIONAL.md`.

**Pregunta que responde este documento, y solo esta:** *¿qué debería poder responder SDC utilizando únicamente los datos que ya posee?*

**Método:** el análisis se hace desde el negocio, no desde el código — pensando simultáneamente como Director General, Gerente Operativo, Responsable Administrativo, Responsable Comercial, dueño de una empresa de transporte, dueño de una cerealera, y analista financiero. No se diseñan pantallas ni se propone implementación — ese es el alcance explícito del próximo sub-bloque, no de este.

**Grounding de datos:** para responder con honestidad "¿SDC ya tiene este dato?" en la Parte 2, este documento se apoya en el modelo de datos real ya auditado en los Bloques 3-6 (`Viaje`, `Cliente`, `Transportista`, `Chofer`, `Vehiculo`, `Productor`, `Cereal`, `Ubicacion`, `TipoGasto`, `AnticipoGasto`, `Liquidacion`, `LiquidacionViaje`, `LiquidacionMovimiento`, `Factura`, `FacturaViaje`, `Cobranza`, `Usuario`, `AuditLog`, `HistorialEstadoViaje`) — no se volvió a leer código para producir este documento, se usa el conocimiento ya validado y documentado en los bloques anteriores.

---

# PARTE 1 — Inventario completo de preguntas de negocio

Organizado en 15 categorías. No es una lista de funcionalidades — es todo lo que un usuario de negocio podría querer preguntarle al sistema, exista o no la forma de responderlo hoy.

## 1. Rentabilidad y márgenes

- ¿Qué cliente deja mayor utilidad?
- ¿Qué cliente deja menor utilidad (o pérdida)?
- ¿Qué viaje dejó el menor margen?
- ¿Cuál fue el costo promedio por tonelada transportada?
- ¿Cuál es el margen promedio por cereal?
- ¿Cuál es el margen promedio por transportista?
- ¿Qué ruta (origen-destino) es más rentable?
- ¿Cómo evolucionó el margen promedio mes a mes?
- ¿Qué porcentaje del importe facturado se destina a comisiones y anticipos?

## 2. Cobranza y cartera

- ¿Qué cliente tarda más en pagar (días promedio de cobro)?
- ¿Qué clientes tienen mayor deuda (saldo pendiente) hoy?
- ¿Cuál es la antigüedad de la deuda por cliente (30/60/90 días)?
- ¿Cuánto se cobró este mes comparado con meses anteriores?
- ¿Qué porcentaje de facturas se cobra dentro del plazo pactado?
- ¿Qué medio de pago predomina en las cobranzas?
- ¿Cuántas facturas están vencidas hoy y por cuánto monto total?

## 3. Facturación y finanzas generales

- ¿Cuánto dinero hay pendiente de cobrar en total (no solo lo vencido)?
- ¿Cuánto dinero debo pagar a transportistas/choferes en total (no solo lo confirmado)?
- ¿Cuál es la facturación mensual total?
- ¿Cómo evolucionó la facturación mes a mes / año a año?
- ¿Cuál es el ticket promedio de una factura?
- ¿Qué porcentaje de los viajes ya descargados todavía no se facturó?
- ¿Cuál sería el flujo de caja proyectado (a cobrar menos a pagar) de las próximas semanas?

## 4. Pagos a transportistas y choferes (Liquidaciones)

- ¿Cuánto se le pagó a cada chofer/transportista este mes?
- ¿Qué chofer o transportista genera mayor costo de comisión?
- ¿Cuál es el promedio de comisión pactada frente a la efectivamente aplicada (overrides)?
- ¿Cuánto se gastó en anticipos/gastos por categoría (combustible, seguros, efectivo, otros)?
- ¿Qué liquidaciones están confirmadas y pendientes de pago, por cuánto monto total?
- ¿Cuál es el tiempo promedio entre el cierre de un período liquidado y el pago efectivo?

## 5. Operación / Viajes

- ¿Cuántos viajes se realizaron este mes comparado con el mes anterior?
- ¿Cuántas toneladas se transportaron en total, o en un período dado?
- ¿Cuál es el tiempo promedio de un viaje de punta a punta (de asignado a descargado)?
- ¿En qué etapa del ciclo de vida se traban más los viajes (cuello de botella)?
- ¿Cuántos viajes se cancelaron, y qué proporción representan del total?
- ¿Cuál es la tasa de cumplimiento de viajes (completados vs. cancelados)?
- ¿Qué días o meses tienen mayor volumen operativo (estacionalidad)?

## 6. Flota (vehículos)

- ¿Qué camión trabaja más (en viajes o en toneladas)?
- ¿Qué camión está subutilizado?
- ¿Qué vehículos tienen documentación (RTO, seguro) por vencer?
- ¿Cuál es la relación entre la capacidad declarada del vehículo y las toneladas efectivamente transportadas?
- ¿Cuántos vehículos activos hay disponibles, por transportista?

## 7. Choferes

- ¿Qué chofer tiene más viajes o más toneladas transportadas?
- ¿Qué chofer genera más anticipos o gastos?
- ¿Qué chofer tiene la licencia de conducir por vencer?
- ¿Cuál es la comisión promedio pactada por chofer?
- ¿Qué chofer cambió de transportista, y cuándo?

## 8. Comercial / Clientes

- ¿Qué cliente creció en volumen respecto al período anterior?
- ¿Qué cliente cayó en volumen respecto al período anterior?
- ¿Qué cliente es nuevo este período (primera operación registrada)?
- ¿Qué cliente dejó de operar (sin viajes en los últimos N meses)?
- ¿Cuál es el ranking de clientes por toneladas transportadas o por facturación?
- ¿Qué porcentaje de la facturación total representa el cliente más grande (concentración de riesgo comercial)?
- ¿Cuántos clientes activos hay frente a clientes dados de baja?

## 9. Productores / Origen de la mercadería

- ¿Qué productor genera más movimientos o viajes?
- ¿Qué productor mueve mayor volumen de toneladas?
- ¿Con qué cliente se asocia más frecuentemente cada productor?

## 10. Cereales / Producto

- ¿Qué cereal se transporta más, en volumen?
- ¿Qué cereal deja mayor margen promedio?
- ¿Cómo varía la mezcla de cereales transportados según la temporada?
- ¿Cuál es la tarifa promedio por tonelada, según el tipo de cereal?

## 11. Geografía / Rutas

- ¿Cuáles son los orígenes y destinos más frecuentes?
- ¿Qué ruta (origen-destino) tiene mayor volumen de viajes?
- ¿Qué ruta resulta más cara de operar por tonelada?

## 12. Cumplimiento y riesgo

- ¿Qué documentación (RTO, seguro, licencia) vence en los próximos 30 días?
- ¿Hay choferes o vehículos operando hoy con documentación ya vencida?
- ¿Qué anulaciones se realizaron (liquidaciones, facturas, cobranzas, anticipos) y por qué motivo?
- ¿Quién autorizó o ejecutó cada cambio crítico (override de comisión, una anulación)?

## 13. Anticipos y gastos

- ¿Cuánto se gastó en total, por categoría de gasto, en un período dado?
- ¿Qué chofer acumula el mayor monto de anticipos todavía sin liquidar?
- ¿Cuál es la relación entre anticipos otorgados y viajes realizados (anticipo promedio por viaje)?

## 14. Usuarios y gobernanza

- ¿Quién usa el sistema, y con qué frecuencia?
- ¿Qué usuario realizó más operaciones críticas (anulaciones, overrides de comisión)?
- ¿Hay usuarios inactivos que deberían darse de baja?

## 15. Tendencias, comparaciones temporales y futuro

- ¿Cómo evolucionó cada uno de los indicadores anteriores, mes a mes o año a año?
- ¿Cuál sería la proyección de facturación o de cobranza para el próximo período?
- ¿Cuál sería el impacto si un cliente o transportista grande dejara de operar mañana?

---

# PARTE 2 — Disponibilidad de datos, por pregunta

**Columnas:** ¿SDC ya tiene el dato? (Sí / Parcial / No) — Tablas involucradas — Tipo de cálculo (Directo / Simple / Complejo) — Datos nuevos que haría falta capturar, si corresponde.

**Convención de "Parcial":** el campo existe en el modelo de datos pero hoy no se captura de forma confiable desde ningún formulario (ya señalado en `BLOQUE7_AUDITORIA_FUNCIONAL.md`), o el dato existe pero como texto libre sin normalizar.

## 1. Rentabilidad y márgenes

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Qué cliente deja mayor utilidad | Sí | `Viaje`, `FacturaViaje`, `LiquidacionViaje` | Complejo (cruza 3 entidades por viaje) | — |
| Qué cliente deja menor utilidad | Sí | ídem | Complejo | — |
| Qué viaje dejó el menor margen | Sí | `Viaje`, `LiquidacionViaje` | Complejo | — |
| Costo promedio por tonelada | Sí | `Viaje`, `LiquidacionViaje` | Simple | — |
| Margen promedio por cereal | Sí | `Viaje`, `Cereal`, `LiquidacionViaje` | Complejo | — |
| Margen promedio por transportista | Sí | `Viaje`, `Transportista`, `LiquidacionViaje` | Complejo | — |
| Ruta más rentable | Sí | `Viaje`, `Ubicacion` (origen/destino), `LiquidacionViaje` | Complejo | — |
| Evolución del margen mes a mes | Sí | ídem + agrupación temporal | Complejo | — |
| % del facturado que se va en comisiones/anticipos | Sí | `Factura`, `LiquidacionViaje`, `LiquidacionMovimiento` | Complejo | — |

## 2. Cobranza y cartera

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Cliente que tarda más en pagar (DSO) | Sí | `Factura`, `Cobranza` | Simple | — |
| Clientes con mayor deuda hoy | Sí | `Factura`, `Cobranza` | Simple | — |
| Antigüedad de deuda por cliente (aging) | Sí | `Factura`, `Cobranza` | Simple | — |
| Cobrado este mes vs. meses anteriores | Sí | `Cobranza` | Simple | — |
| % de facturas cobradas en plazo | Sí | `Factura`, `Cobranza` | Simple | — |
| Medio de pago predominante | Parcial | `Cobranza.medioPago` (texto libre, sin normalizar — ya señalado en `DEUDA_TECNICA.md` D5) | Simple, pero sobre datos sucios | Normalizar `medioPago` a catálogo cerrado |
| Facturas vencidas hoy, cantidad y monto | Sí | `Factura`, `Cobranza` | Directo (ya lo calcula el Dashboard hoy) | — |

## 3. Facturación y finanzas generales

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Total pendiente de cobrar (no solo vencido) | Sí | `Factura`, `Cobranza` | Simple | — |
| Total a pagar a transportistas/choferes | Sí | `Liquidacion` | Simple | — |
| Facturación mensual total | Sí | `Factura` | Simple | — |
| Evolución de facturación mes a mes / año a año | Sí | `Factura` + agrupación temporal | Simple | — |
| Ticket promedio de factura | Sí | `Factura` | Simple | — |
| % de viajes descargados sin facturar | Sí | `Viaje` (`estadoFacturacion`) | Directo | — |
| Flujo de caja proyectado | Parcial | `Factura`, `Cobranza`, `Liquidacion` | Complejo, y es predicción (Nivel 4) | Requiere modelo de proyección, no solo consulta |

## 4. Pagos a transportistas y choferes

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Cuánto se pagó a cada chofer/transportista este mes | Sí | `Liquidacion` | Simple | — |
| Chofer/transportista de mayor costo de comisión | Sí | `LiquidacionViaje` | Simple | — |
| Comisión pactada vs. aplicada (overrides) | Sí | `Chofer.comisionPct`, `Liquidacion.comisionPct`, `AuditLog` | Simple | — |
| Gasto por categoría de anticipo | Sí | `AnticipoGasto`, `TipoGasto` | Simple | — |
| Liquidaciones confirmadas pendientes de pago | Sí | `Liquidacion` | Directo (ya lo calcula el Dashboard hoy) | — |
| Tiempo promedio entre cierre de período y pago | Sí | `Liquidacion` (`periodoHasta`, `fechaPago`) | Simple | — |

## 5. Operación / Viajes

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Viajes este mes vs. mes anterior | Sí | `Viaje` | Simple | — |
| Toneladas transportadas por período | Sí | `Viaje` | Simple | — |
| Tiempo promedio de un viaje punta a punta | Sí | `HistorialEstadoViaje` | Complejo (requiere calcular deltas entre transiciones) | — |
| Cuello de botella por etapa | Sí | `HistorialEstadoViaje` | Complejo | — |
| Viajes cancelados y proporción del total | Sí | `Viaje` | Simple | — |
| Tasa de cumplimiento (completados vs. cancelados) | Sí | `Viaje` | Simple | — |
| Estacionalidad de volumen operativo | Sí | `Viaje` + agrupación temporal | Simple | — |

## 6. Flota (vehículos)

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Camión que más trabaja | Sí | `Viaje`, `Vehiculo` | Simple | — |
| Camión subutilizado | Sí | ídem | Simple | — |
| Vehículos con documentación por vencer | Parcial | `Vehiculo.vencimientoRto`, `vencimientoSeguro` (campos existen, hoy sin captura confiable desde UI, ver `BLOQUE7_AUDITORIA_FUNCIONAL.md` sección 6) | Directo, una vez cargado el dato | Capturar el dato desde un formulario (no es un dato nuevo en el modelo, es un dato no cargado en la práctica) |
| Capacidad declarada vs. toneladas transportadas | Parcial | `Vehiculo.capacidadKg` (opcional, probablemente sub-cargado) | Simple | Asegurar carga consistente de `capacidadKg` |
| Vehículos activos disponibles por transportista | Sí | `Vehiculo` | Directo | — |

## 7. Choferes

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Chofer con más viajes/toneladas | Sí | `Viaje`, `Chofer` | Simple | — |
| Chofer que genera más anticipos/gastos | Sí | `AnticipoGasto`, `Chofer` | Simple | — |
| Chofer con licencia por vencer | Parcial | `Chofer.licenciaVencimiento` (campo existe, sin captura confiable hoy) | Directo, una vez cargado el dato | Capturar el dato desde un formulario |
| Comisión promedio pactada por chofer | Sí | `Chofer.comisionPct` | Directo | — |
| Chofer que cambió de transportista | **No** | `Chofer.transportistaId` es una FK actual única, sin historial de cambios | — | Requiere una tabla de historial de reasignación (dato nuevo) |

## 8. Comercial / Clientes

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Cliente que creció en volumen | Sí | `Viaje` + comparación de períodos | Complejo | — |
| Cliente que cayó en volumen | Sí | ídem | Complejo | — |
| Cliente nuevo este período | Sí | `Viaje`, `Cliente` (primera fecha de viaje) | Simple | — |
| Cliente que dejó de operar | Sí | `Viaje` (ausencia de registros recientes) | Simple | — |
| Ranking de clientes por toneladas/facturación | Sí | `Viaje`, `Factura` | Simple | — |
| Concentración de facturación en el cliente más grande | Sí | `Factura` | Simple | — |
| Clientes activos vs. dados de baja | Sí | `Cliente.activo` | Directo | — |

## 9. Productores

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Productor con más movimientos | Sí | `Viaje`, `Productor` | Simple | — |
| Productor con mayor volumen | Sí | ídem | Simple | — |
| Cliente más asociado a cada productor | Sí | `Viaje` (cruza `clienteId` y `productorId`) | Simple | — |

## 10. Cereales / Producto

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Cereal más transportado | Sí | `Viaje`, `Cereal` | Simple | — |
| Cereal de mayor margen promedio | Sí | `Viaje`, `Cereal`, `LiquidacionViaje` | Complejo | — |
| Mezcla de cereales por temporada | Sí | `Viaje`, `Cereal` + agrupación temporal | Simple | — |
| Tarifa promedio por tonelada por cereal | Sí | `Viaje.tarifaTonelada`, `Cereal` | Simple | — |

## 11. Geografía / Rutas

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Orígenes/destinos más frecuentes | Sí | `Viaje`, `Ubicacion` | Simple | — |
| Ruta con mayor volumen | Sí | ídem | Simple | — |
| Ruta más cara por tonelada | Sí | `Viaje`, `Ubicacion` | Simple | — |

## 12. Cumplimiento y riesgo

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Documentación que vence en 30 días | Parcial | `Chofer.licenciaVencimiento`, `Vehiculo.vencimientoRto/vencimientoSeguro` | Directo, una vez cargado el dato | Capturar el dato desde un formulario |
| Choferes/vehículos con documentación ya vencida | Parcial | ídem | Directo | ídem |
| Anulaciones realizadas y motivo | Sí | `Liquidacion.estado`, `Factura.estado`, `Cobranza.anulada/anuladaMotivo`, `AnticipoGasto.anulado/anuladoMotivo` | Simple | — |
| Quién autorizó cada cambio crítico | Parcial | `AuditLog` (solo cubre override de comisión y anulación de cobranza — no anulación de liquidaciones/facturas/anticipos ni ediciones de catálogos, ya señalado en `DEUDA_TECNICA.md` B14) | Simple sobre lo que sí está cubierto | Ampliar el `AuditLog` a más acciones |

## 13. Anticipos y gastos

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Gasto total por categoría en un período | Sí | `AnticipoGasto`, `TipoGasto` | Simple | — |
| Chofer con mayor anticipo sin liquidar | Sí | `AnticipoGasto` (`liquidado:false`) | Simple | — |
| Anticipo promedio por viaje | Sí | `AnticipoGasto`, `Viaje` | Simple | — |

## 14. Usuarios y gobernanza

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Quién usa el sistema y con qué frecuencia | **No** | `Usuario` no registra accesos/logins, solo credenciales | — | Requiere registro de eventos de login (dato nuevo) |
| Usuario con más operaciones críticas | Parcial | `AuditLog` (cobertura incompleta, igual que en cumplimiento) | Simple sobre lo cubierto | Ampliar `AuditLog` |
| Usuarios inactivos que deberían darse de baja | Parcial | `Usuario.activo`, pero sin marca de último acceso | Simple, con la limitación anterior | Requiere registro de último acceso (dato nuevo) |

## 15. Tendencias y futuro

| Pregunta | ¿Dato ya existe? | Tablas | Cálculo | Datos nuevos |
|---|---|---|---|---|
| Evolución de cualquier indicador mes a mes/año a año | Sí | Todas las anteriores + agrupación temporal | Simple a Complejo, según el indicador de base | — |
| Proyección de facturación/cobranza | Parcial | `Factura`, `Cobranza`, series históricas | Complejo — es predicción (Nivel 4), no una consulta | Requiere un método de proyección, no solo el dato histórico |
| Impacto de perder un cliente/transportista grande | Parcial | `Viaje`, `Factura`, `Liquidacion` | Complejo — es simulación (Nivel 4) | Requiere un modelo de simulación, no solo el dato |

---

## Lectura de conjunto de la Parte 2

De las ~70 preguntas inventariadas, la enorme mayoría (más de 50) **ya son respondibles con los datos que SDC tiene hoy** — el sistema no tiene, en el fondo, un problema de datos faltantes, tiene un problema de datos nunca combinados ni presentados. Las excepciones reales (dato genuinamente ausente, no solo sin capturar) son pocas y puntuales:

1. **Historial de reasignación de chofer entre transportistas** — no existe ningún registro de "quién trabajó para quién y cuándo", solo el estado actual.
2. **Registro de accesos/login de usuarios** — no hay ningún rastro de cuándo se conectó cada persona.
3. **`AuditLog` incompleto** — cubre solo 2 de las muchas acciones críticas del sistema (override de comisión, anulación de cobranza).
4. **Normalización de `Cobranza.medioPago`** — el dato existe pero como texto libre inconsistente, lo que degrada cualquier análisis por medio de pago.

Todo lo demás marcado "Parcial" en las tablas de arriba **no es un dato faltante en el modelo** — son campos que ya existen (vencimientos documentales, capacidad de vehículo) pero que hoy no se cargan de forma confiable porque no hay ningún formulario que los pida (ya diagnosticado en `BLOQUE7_AUDITORIA_FUNCIONAL.md`, sección 6). Es una brecha de captura, no de modelo de datos.

---

**No se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit ni push para producir este documento.**

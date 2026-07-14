# Bloque 7.3.3 — Auditoría: Alertas Operativas y Documentales

Fecha: 2026-07-11. Etapa 1 (Auditoría) de `METODOLOGIA_SDC.md` — **documento de diagnóstico puro: no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se propone todavía ninguna solución.** Toda afirmación sobre el estado actual va acompañada de su referencia `archivo:línea`.

**Relación con lo anterior:** `BLOQUE7.3_ALCANCE.md` (Frontera 2) condicionó explícitamente las alertas documentales a que exista primero captura confiable de esos datos — esta auditoría empieza, precisamente, verificando si esa condición sigue vigente. Se apoya en `BLOQUE7.2.a` (Riesgos: lente transversal, no genera dato propio), `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (7.3.3 = dominio Riesgos, condicionado) y `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` (qué consume una Alerta: los mismos valores que dashboards/reportes, más un umbral y un destinatario que ella misma agrega — nunca recalcula lo que otro dominio ya definió), sin reabrir ninguno.

**Pregunta que responde esta auditoría, y solo esta:** *¿qué señales confiables existen hoy para construir alertas, cuál es el estado real de la brecha documental, y qué le falta al sistema — más allá del dato — para que una señal se convierta en una alerta de verdad?*

---

# Parte 1 — Estado real de la brecha de captura documental

`BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` ya había señalado que `Chofer.licenciaVencimiento`, `Vehiculo.vencimientoRto` y `Vehiculo.vencimientoSeguro` existen en el modelo (`schema.prisma:145,163-164`, los tres `DateTime?` nullable) pero no se cargan de forma confiable. Se reverifica hoy, con grounding directo:

- Los tres campos siguen siendo opcionales en los DTOs de creación/edición (`create-chofer.dto.ts:32`, `update-chofer.dto.ts:32`, `create-vehiculo.dto.ts:32,36`, `update-vehiculo.dto.ts:33,37`) — el backend los acepta si llegan, no los exige.
- **El frontend no tiene ningún campo para cargarlos.** `Transportistas.tsx` (única pantalla que da de alta choferes) captura `nombre`, `dni`, `cuil`, `licenciaNumero`, `comisionPct` (`Transportistas.tsx:9,151`) — `licenciaVencimiento` no aparece en ningún lugar del archivo. Mismo patrón confirmado para `vencimientoRto`/`vencimientoSeguro` de `Vehiculo`: ningún componente del frontend los referencia.

**Conclusión: la brecha sigue exactamente como se documentó, sin resolver.** La condición de la Frontera 2 de `BLOQUE7.3_ALCANCE.md` se confirma vigente — las alertas documentales no tienen, hoy, ningún dato real para leer.

---

# Parte 2 — Qué es una Alerta, y qué no le corresponde calcular

`BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` (sección 5) ya fijó la regla: una Alerta consume "los mismos valores que dashboards/reportes, más un umbral y un destinatario que la propia Alerta agrega — el Motor expone el valor a evaluar, nunca almacena el umbral". Esto tiene una consecuencia directa para 7.3.3: **para las señales que ya tiene un dueño (cartera vencida en 7.3.2), 7.3.3 no recalcula nada — lee.** Solo las señales que todavía no existen en ningún lado (Parte 3) requieren un cálculo nuevo.

---

# Parte 3 — Señales confiables ya disponibles

## Cartera vencida (ya calculada, dominio Performance Financiera)

`AgingController` (`aging.controller.ts`, commit `2e886bc`) ya expone deuda vencida, por cliente y por factura, con la definición oficial de "vencida" ya formalizada en `inteligencia/shared/vigencia.ts`. Una alerta de cartera vencida **lee este resultado**, no reimplementa la definición.

## Anticipos sin liquidar (ya expuesto, sin dueño formal en el Motor)

`AnticipoGasto.liquidado: false` ya se agrega hoy en `DashboardController` (`dashboard.controller.ts:41-45`, `anticiposNoLiquidados`) — dato confiable (mismo patrón de vigencia ya usado en 7.3.1/7.3.2), pero **vive en el Dashboard, no en el Centro de Inteligencia** — el mismo patrón de duplicación de dueño ya señalado para "vencida" en `BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md` (Parte 2), ahora para un segundo indicador.

## Viajes estancados en un mismo estado (señal nueva, dominio Performance Operativa — nunca calculada)

Cada cambio de estado de un Viaje deja una fila en `HistorialEstadoViaje`, incluida la creación (`viajes.controller.ts:192`, alta inicial con `estadoNuevo: "PENDIENTE"`) y cada transición posterior (`viajes.controller.ts:305-312`, dentro de `aplicarCambioEstado()`). **El tiempo en el estado actual de un Viaje es, entonces, `hoy − fecha del último registro de `HistorialEstadoViaje` de ese Viaje`** — dato ya confiable y completo, nunca cruzado hasta ahora (coincide con el ítem #10 de `BLOQUE7_ROADMAP_FUNCIONAL.md`, "alerta de viajes estancados").

## Facturas próximas a vencer (variante hacia adelante de 7.3.2, no calculada)

`Factura.vencimiento` ya es un dato real (`BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md`, Parte 1) — hoy 7.3.2 solo lo usa para clasificar deuda ya vencida o por vencer, no para alertar *antes* de que venza. Es el mismo dato, una lectura distinta (ítem #6 de `BLOQUE7_ROADMAP_FUNCIONAL.md`, "alerta previa al vencimiento").

---

# Parte 4 — Umbral y destinatario: lo que falta más allá del dato

Cada señal de la Parte 3 tiene, hoy, el valor a evaluar — ninguna tiene **umbral** ni **destinatario** definidos:

- **Umbral:** ¿a partir de cuántos días de mora se alerta por cartera vencida? ¿Cuántos días de anticipo sin liquidar es "demasiado"? ¿Cuánto tiempo en un mismo estado es "estancado" — es el mismo umbral para `EN_CARGA` que para `EN_TRANSITO`? Ninguno de estos números existe en ningún documento aprobado — son decisiones de negocio, no técnicas.
- **Destinatario:** `BLOQUE7.2.d` (Grupo A) y `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (Parte 8, punto 3) ya habían dejado esta pregunta abierta en abstracto — acá se confirma, con grounding real, que **no hay ningún mecanismo en el sistema para asignar ni para entregar un destinatario.**

---

# Parte 5 — No existe infraestructura de notificación activa

Se buscó en todo el backend cualquier rastro de envío de email, push o mensajería (`nodemailer`, `sendMail`, proveedores externos) — **no hay ninguno.** Esto no es una brecha de captura de datos, es una pregunta de alcance que hay que resolver antes del diseño técnico: **¿qué significa "alertar" en 7.3.3?** Las dos lecturas posibles son muy distintas en esfuerzo y en lo que requieren:

1. **Alerta visual, dentro de la aplicación** (un "Centro de Alertas" que el usuario ve al loguearse o al entrar a una pantalla dedicada) — no requiere ninguna infraestructura nueva, es consistente con el resto de 7.3 (cálculo on-the-fly, sin dependencias externas).
2. **Alerta activa** (email, notificación push) — requiere integrar un proveedor externo, gestionar credenciales, colas de envío — un salto de complejidad y de infraestructura que ningún sub-bloque anterior de Bloque 7.3 tuvo que dar.

---

# Hallazgos confirmados

1. La brecha de captura documental (licencia, RTO, seguro) sigue exactamente igual que en `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` — confirmado con grounding directo en DTOs y frontend, no solo heredado del documento anterior.
2. Tres señales no documentales ya son confiables y calculables hoy: cartera vencida (ya con dueño en 7.3.2), anticipos sin liquidar (dato confiable, sin dueño formal en el Motor todavía) y viajes estancados (dato confiable, nunca antes calculado por nadie).
3. Ninguna señal, documental o no, tiene hoy un umbral ni un destinatario — son decisiones de negocio explícitamente pendientes, no solo para las alertas documentales sino para **todas**.
4. No existe infraestructura de notificación activa en el proyecto — "alertar" hoy solo puede significar, sin trabajo adicional de infraestructura, una superficie visual dentro de la aplicación.

# Brechas de datos

- Bloqueante para alertas documentales: vencimientos de licencia/RTO/seguro, sin resolver (Parte 1).
- No bloqueante para el resto: cartera vencida, anticipos sin liquidar, y tiempo en estado de un Viaje ya son datos completos y confiables.

# Decisiones de negocio pendientes

1. **¿Qué umbral dispara cada alerta** (días de mora, días de anticipo sin liquidar, tiempo por estado de un Viaje — posiblemente distinto por estado)?
2. **¿Quién es el destinatario de cada tipo de alerta** — un rol, una persona, o se resuelve por dominio (Financiero para cartera/anticipos, Operativo para viajes estancados)?
3. **¿"Alertar" significa, en 7.3.3, una superficie visual dentro de la aplicación, o se espera una notificación activa (email/push)?** Cambia radicalmente el esfuerzo y probablemente amerita, si es lo segundo, tratarse como su propio sub-bloque de infraestructura, no como parte de 7.3.3.
4. **¿Se aborda ahora la parte de alertas no documentales (cartera vencida, anticipos, viajes estancados), dejando las documentales solo documentadas pero no implementables** (tal como ya preveía la Frontera 2 de `BLOQUE7.3_ALCANCE.md`), **o se espera a que la captura documental se resuelva para encarar todo junto?**

# Riesgos

| # | Riesgo | Nota |
|---|---|---|
| 1 | Reimplementar la definición de "vencida" o de "anticipo sin liquidar" dentro de 7.3.3 en vez de leer de 7.3.2/Dashboard | Ya cubierto por la regla de `BLOQUE7.3.0` — se reitera como riesgo concreto, no abstracto |
| 2 | Construir alertas documentales "de mentira" sobre datos que hoy nadie carga, mostrando alertas vacías o engañosas | Mitigado por la Frontera 2 ya aprobada — no se avanza sobre esa parte hasta resolver la captura |
| 3 | Asumir un umbral "razonable" sin que sea una decisión de negocio explícita, y que después haya que cambiarlo con impacto en usuarios ya acostumbrados a un número | Se deja expresamente como decisión pendiente (no se propone un valor por defecto en esta auditoría) |
| 4 | Confundir "Centro de Alertas visual" con "sistema de notificaciones activas" y subestimar el esfuerzo de la segunda opción | Señalado explícitamente en la Parte 5 como una bifurcación de alcance, no un detalle de implementación |

# Recomendación: ¿puede 7.3.3 implementarse sin migración?

**Depende de qué alcance se confirme (decisión pendiente 4).** Si el alcance es alertas visuales, no documentales, sobre cartera vencida/anticipos/viajes estancados: **sí, sin ninguna migración** — los tres datos ya existen y son confiables. Si se insiste en incluir alertas documentales ya funcionales: **no es posible sin antes resolver la captura**, lo cual tampoco es, en sí, una migración de `schema.prisma` (los campos ya existen) sino un trabajo de formulario en el frontend, ajeno a este sub-bloque.

---

## Cierre

Esta auditoría confirma que la condición que `BLOQUE7.3_ALCANCE.md` ya había puesto sobre 7.3.3 sigue vigente, con evidencia directa de código. A diferencia de 7.3.1 y 7.3.2, el obstáculo principal de este sub-bloque no es de datos sino de **decisiones de negocio no tomadas** (umbral, destinatario, alcance de "alertar") y de una pregunta de infraestructura que ningún sub-bloque anterior tuvo que responder (notificación activa vs. superficie visual).

**No se propuso ninguna solución.** Queda a la espera de aprobación, y en particular de las cuatro decisiones de negocio señaladas, antes de pasar a la Etapa 2 (Diseño técnico) de 7.3.3.

# Auditoría Funcional — Grupo Económico, Ronda 2

Fecha: 2026-07-15. Segunda ronda de auditoría funcional pura — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se diseñaron tablas, no se propusieron endpoints, no se hizo commit ni push.** Complementa la primera auditoría de Grupo Económico (ya aprobada como base) sin repetirla — donde algo ya quedó respondido ahí, se referencia, no se reescribe.

**Pregunta central de esta ronda:** ¿qué reglas operativas, financieras y contables debe resolver SDC antes de diseñar una liquidación consolidada para varias empresas de un mismo grupo económico?

**Base leída para esta ronda:** la auditoría de Ronda 1, `RELEASE_SDC_v1.0.md`, `CERTIFICACION_FINAL_SDC_v1.0.md`, `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`, `docs/arquitectura/centro-inteligencia/BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`, y el código real de `liquidaciones.controller.ts`, `anticipos.controller.ts`, `organizacion-prisma.client.ts` y `schema.prisma` — únicamente para confirmar cómo se comporta el sistema hoy, no para diseñar cómo debería comportarse mañana.

**Convención de este documento:** cada afirmación está marcada como **Hecho confirmado** (verificado contra el código real, cita incluida), **Pregunta abierta** (el negocio tiene que resolverla, SDC no puede inferirla sola) o **Recomendación** (mi lectura funcional, no una decisión tomada).

---

## 0. Un hecho confirmado que atraviesa todo el documento

**Hecho confirmado:** hoy, `Liquidacion.netoPagar` se calcula como `totalBruto - totalAnticipos - totalDescuentos`, sin ningún piso en cero y sin ninguna validación que impida que los anticipos superen lo que el viaje generó (`liquidaciones.controller.ts`, método `recomputeTotales`). Un `AnticipoGasto`, una vez incluido en una liquidación, queda marcado `liquidado: true` y no puede volver a usarse en otra liquidación — es una relación de **uno a uno con su liquidación**, nunca de uno a muchos. Una liquidación solo se puede pagar completa (`pagar()` no acepta un importe parcial) y solo se puede anular si todavía no fue pagada. Estos cinco hechos son la base real sobre la que hay que razonar el resto de este documento — no una suposición mía sobre cómo "debería" funcionar hoy.

---

## 1. Quién realiza el pago

| Escenario | Qué pasa en la operación real | Qué debe seguir registrándose por CUIT | Qué necesita saber administración después | Información mínima a identificar | Riesgo si el sistema solo dice "pagado" |
|---|---|---|---|---|---|
| **Paga la Empresa A** (la que generó la deuda) | Es el caso simple — hoy es, de hecho, el único caso que existe | La deuda de A con el chofer, íntegra | Que A pagó lo suyo | Que el pago salió de una cuenta de A | Ninguno adicional — es el caso que ya funciona |
| **Paga la Empresa B** (por la deuda que generó A) | B adelanta fondos que, contablemente, son un gasto de A — existe una deuda interna de A hacia B por ese monto | La deuda de A con el chofer sigue siendo de A, aunque el dinero haya salido de B | Que existe un saldo pendiente entre A y B que en algún momento se tiene que saldar | Qué empresa aportó el dinero, y para la deuda de qué empresa | **Alto** — si el sistema solo registra "pagado", A parece haber pagado con fondos propios cuando en realidad le debe ese monto a B; sin ese dato, reconstruir la deuda interempresa exige revisar movimientos bancarios a mano |
| **Paga una empresa del grupo que no generó ningún viaje de este período** (ej. una sociedad holding) | El grupo tiene una entidad de tesorería que no es "A" ni "B" en el sentido operativo | Igual que el caso anterior — la deuda operativa sigue perteneciendo a quien generó el viaje | Reconciliar contra esa tercera entidad, no contra A ni B | Identidad exacta de quién pagó, aunque no haya generado ningún viaje | Igual que el caso anterior, agravado: si esa tercera entidad ni siquiera es una "Organización" en el sistema hoy, el pago queda huérfano de origen |
| **Paga una tesorería central del grupo** | Variante formal del caso anterior — existe una caja/cuenta que el grupo trata como propia, no de ninguna empresa en particular | Igual — la deuda por viaje sigue siendo de quien lo generó | Qué proporción de esa tesorería corresponde a cada empresa | Que el fondeo es "del grupo", no de una organización específica | Se pierde la trazabilidad de cuánto le debe cada empresa a la tesorería central |
| **El pago se divide entre varias cuentas** (ej. mitad desde A, mitad desde B) | Una sola operación real (el chofer recibe un pago) financiada con dos orígenes de fondos distintos | Cada empresa registra la porción que efectivamente puso, no un monto arbitrario | Cuánto puso cada una, no solo el total | El desglose exacto por origen de fondos, no solo el total transferido | **Alto** — sin el desglose, ninguna de las dos empresas puede reconstruir cuánto puso realmente en ese pago conjunto |
| **Una empresa adelanta fondos por otra** (préstamo interempresa puntual) | Es, en sustancia, el mismo caso que "paga la Empresa B por la deuda de A", pero con vocación explícita de devolverse — es un préstamo entre empresas del grupo, no una redistribución de gasto | La deuda operativa (con el chofer) es de quien generó el viaje; el préstamo interempresa es un hecho contable **distinto y adicional**, entre las dos empresas del grupo | Necesita ver el préstamo interempresa como una partida propia, separada de la deuda con el chofer, con su propio seguimiento hasta que se salde | Que existe una deuda interempresa nueva, con fecha, monto y las dos empresas involucradas | El mismo riesgo que los casos anteriores, más uno nuevo: sin este registro, el préstamo interempresa **no existe en ningún lado** — no hay forma de saber, meses después, que A le debe a B por haberle prestado fondos en julio |

**Recomendación:** en los seis escenarios, el hecho de negocio que SDC necesita capturar no es "quién debía" (eso ya lo sabe, es la liquidación por organización) sino **"de qué origen salió el dinero, y si ese origen coincide con quién debía"**. Cuando no coincide, aparece automáticamente una relación de deuda entre empresas del grupo que hoy no tiene ningún lugar donde vivir — ni siquiera como concepto. Esto es una pieza de información nueva, no una variación de lo que ya existe.

No diseño acá Caja, Banco ni Tesorería — dejo constancia de que el hecho de negocio ("quién puso el dinero" puede ser distinto de "quién debía") es real y tiene que quedar identificado de alguna forma, cualquiera sea el diseño técnico futuro.

---

## 2. Liquidación vs. pago

La Ronda 1 ya distinguió tres capas (deuda por empresa / pago real / separación contable). Esta ronda profundiza la cadena completa, que en realidad tiene **cinco eslabones**, no tres:

1. **Deuda de cada empresa con el chofer** — lo que el viaje y los descuentos de esa empresa generan. Existe una por empresa, siempre.
2. **Liquidación individual por CUIT** — el documento que hoy ya existe (`Liquidacion`), con su propio `netoPagar`, su propio estado, sus propios viajes y movimientos. No cambia.
3. **Orden de pago consolidada** — un concepto que hoy no existe: agrupa una o más liquidaciones (de una o más organizaciones del mismo grupo) que se van a saldar juntas.
4. **Transferencia bancaria real** — el hecho físico: una fecha, un monto, una cuenta de origen, un comprobante bancario.
5. **Comprobante entregado al chofer** — lo que el chofer recibe como constancia de que le pagaron.

**Hecho confirmado:** hoy los eslabones 2, 4 y 5 están fusionados en un solo evento (`pagar()` marca la liquidación como `PAGADA` con una fecha, y el Excel/PDF que ya existe es, a la vez, el detalle de la liquidación y el comprobante). El eslabón 3 no existe en absoluto.

Respondiendo cada pregunta:

- **¿Puede existir una orden de pago todavía no pagada?** Tiene que poder existir — es, de hecho, el estado natural entre "decidimos pagar esto junto" y "el banco ya acreditó la transferencia". Sin este estado intermedio, no hay forma de preparar un pago consolidado con anticipación y ejecutarlo después.
- **¿Puede pagarse parcialmente?** Acá aparece una pregunta real que el sistema actual evita por completo (hoy una liquidación se paga entera o no se paga). Con una orden de pago consolidada, "parcial" puede significar dos cosas distintas que **no son lo mismo**: (a) se paga menos del total de la orden, y hay que decidir qué liquidación(es) de las agrupadas queda(n) sin cubrir; o (b) se paga el total exacto pero en más de una transferencia. Son dos problemas de negocio distintos — el primero es "no alcanzó la plata", el segundo es "el banco lo partió en dos operaciones". **Pregunta abierta**: ¿el negocio necesita resolver (a), o alcanza con nunca generar una orden de pago por un monto que todavía no está disponible?
- **¿Puede una transferencia cancelar varias liquidaciones?** Es, literalmente, el caso que motivó esta auditoría completa — sí, tiene que poder.
- **¿Puede una liquidación incluirse en más de una orden de pago?** No debería — igual que un `AnticipoGasto` hoy solo puede pertenecer a una liquidación (`liquidado: true` lo bloquea para siempre), una liquidación ya incluida en una orden de pago no debería poder aparecer en una segunda, porque eso equivaldría a pagarla dos veces o a fragmentar su seguimiento sin ningún beneficio. **Recomendación**: mantener la misma regla de "una sola vez" que el sistema ya aplica a los anticipos.
- **¿Qué ocurre si se anula o revierte el pago?** Hoy anular una liquidación ya pagada está explícitamente prohibido (`"No se puede anular una liquidación ya pagada"`, `liquidaciones.controller.ts`). Con una orden de pago consolidada, revertir tiene que operar al nivel de la orden completa, no de una liquidación suelta dentro de ella — porque las liquidaciones agrupadas comparten un único hecho bancario; revertir una sin revertir las demás dejaría el registro contable de una transferencia real desalineado con lo que el sistema dice que pasó.
- **¿Qué estado conserva cada liquidación antes y después del pago consolidado?** Antes: el mismo ciclo que ya existe (BORRADOR → CONFIRMADA). Lo que cambia es qué dispara el paso a "pagada" — hoy lo dispara una acción sobre la liquidación misma; con pago consolidado, ese paso debería dispararlo la orden de pago, y propagarse a todas las liquidaciones agrupadas a la vez, atómicamente — el mismo patrón que `pagar()` ya usa hoy dentro de una sola liquidación (una transacción que actualiza la liquidación y todos sus viajes juntos), extendido a varias liquidaciones a la vez.
- **¿El chofer debe recibir un único comprobante o varios agrupados?** Es una decisión de negocio, no técnica — pero tiene una restricción real de la que no se puede escapar: el chofer recibió **una sola transferencia**, así que un comprobante que solo muestre eso sin desglosar de dónde viene cada parte va a generar la misma pregunta que motivó todo esto ("¿por qué me pagaron esto si yo trabajé para las dos empresas?"). **Recomendación funcional**: el comprobante que ve el chofer debería mostrar el total transferido de forma prominente, con el desglose por empresa como respaldo — no al revés.

---

## 3. Anticipos

**Hecho confirmado, importante para todo este punto:** `AnticipoGasto` exige `choferId` **y** `transportistaId` obligatorios (`schema.prisma:428-429`) — todo anticipo ya está atado, hoy, tanto a la persona como a la empresa de transporte para la que trabaja en ese momento. También: un anticipo con `viajeId` nulo es válido — no todo anticipo está atado a un viaje concreto, algunos son "generales" del período.

Analizando los siete casos:

- **Anticipo otorgado por A y descontado de viajes de A** — es exactamente el caso que ya funciona hoy. Sin cambios.
- **Anticipo otorgado por A pero descontado del pago consolidado que incluye viajes de A y B** — acá aparece la primera regla contable real que hace falta resolver: el anticipo lo dio A, así que **contablemente sigue siendo un descuento de la deuda de A**, aunque el pago físico al chofer sea uno solo junto con B. Que el pago sea conjunto no debería mover el anticipo de dueño.
- **Anticipos otorgados por ambas empresas** — cada uno se descuenta de la liquidación de la empresa que lo dio. No hay ninguna razón de negocio para que un anticipo de A se descuente de la deuda de B, ni siquiera cuando el pago final es conjunto.
- **Anticipo superior a lo adeudado por una de las empresas** — acá está el hallazgo más concreto de esta ronda: **hoy el sistema ya permite esto y no hace nada especial** — `netoPagar` simplemente da negativo. Ejemplo numérico con los campos reales: si la Empresa A le debe al chofer $150.000 por viajes del período, y le dio un anticipo de $200.000, `totalBruto = 150.000`, `totalAnticipos = 200.000`, `netoPagar = -50.000`. Hoy ese número negativo queda ahí, sin ninguna alerta ni ninguna acción automática — es responsabilidad de quien mira la pantalla darse cuenta. Con liquidación consolidada, ese saldo negativo de $50.000 de la Empresa A **¿se descuenta automáticamente de lo que la Empresa B le debe al mismo chofer en el mismo pago consolidado?** Es, literalmente, la pregunta de compensación entre empresas del grupo. **Pregunta abierta central de este documento.**
- **Saldo de anticipo que debe trasladarse al siguiente período** — **hecho confirmado**: hoy esto no existe en absoluto. Un anticipo se liquida una vez, contra una liquidación, y ahí termina su ciclo de vida — no hay ningún concepto de "saldo pendiente que se arrastra". El caso anterior (anticipo superior a lo debido) es, en los hechos, el mismo problema: hoy ese sobrante de $50.000 no se "traslada" a ningún lado, simplemente queda invisible dentro de un número negativo.
- **Anticipo asociado al chofer, al transportista o a un viaje concreto** — hoy siempre está asociado a las tres cosas a la vez cuando corresponde (chofer + transportista siempre; viaje, opcionalmente). No hay hoy ningún anticipo "solo del transportista sin chofer" — el modelo actual no distingue ese caso porque `choferId` es obligatorio.
- **Anticipos entregados desde una cuenta bancaria distinta de la empresa que genera los viajes** — mismo patrón que la sección 1: el origen de los fondos del anticipo puede no coincidir con la empresa a la que ese anticipo le corresponde contablemente. Hoy el sistema no distingue "qué organización cargó el anticipo" de "de qué cuenta salió la plata" porque no existe el segundo concepto en absoluto.

**Respondiendo directamente lo pedido:**

- **Qué pertenece contablemente a cada CUIT:** el anticipo pertenece siempre a la empresa que lo otorgó — eso no debería cambiar nunca, sea cual sea el pago consolidado que lo termine saldando.
- **Qué puede consolidarse en el pago:** el resultado neto de cada liquidación (positivo o negativo), no los anticipos individuales — los anticipos ya están "adentro" del neto de cada empresa antes de llegar a la consolidación.
- **Qué nunca debe compensarse automáticamente:** que un saldo negativo de la Empresa A (anticipo mayor a lo debido) se descuente sin más de lo que la Empresa B le debe al mismo chofer, **sin que quede un registro explícito de que eso pasó y por qué**. Compensar en silencio dos deudas de empresas legalmente distintas es, precisamente, el tipo de operación que necesita quedar trazada con el mismo cuidado que un préstamo interempresa (sección 1).
- **Qué necesita autorización explícita:** cualquier compensación entre lo que debe una empresa del grupo y lo que debe otra, para el mismo chofer, en el mismo pago consolidado — no debería ser un efecto automático de sumar dos liquidaciones.
- **Cómo debería visualizarse:** el aporte y el descuento por empresa deberían verse siempre desagregados, incluso en el comprobante consolidado — la misma recomendación que en la sección 2.

---

## 4. Préstamos, adelantos y otros saldos

**Hecho confirmado:** el modelo actual no distingue ninguno de estos conceptos entre sí — todo lo que hoy existe como "anticipo/gasto" es un único tipo de dato (`AnticipoGasto`), clasificado únicamente por `TipoGasto` (un catálogo de texto libre, sin ninguna regla de negocio distinta entre "Seguros", "Combustible", etc. — todos se tratan exactamente igual en el cálculo). No existe hoy ningún concepto de préstamo personal, adelanto de sueldo, multa, o deuda del chofer con la empresa como categorías con comportamiento propio.

Distinguiendo los conceptos que planteás, por su naturaleza de negocio real (no por cómo los trataría el sistema, que es justamente lo que no quiero decidir acá):

- **Anticipos operativos** (combustible, peajes, viáticos de un viaje) — gasto del viaje, nace y muere en la operación, ya cubierto en la sección 3.
- **Préstamos personales al chofer** — no tienen relación con ningún viaje ni con ninguna empresa en particular; son, en esencia, un préstamo de la persona jurídica (empresa o grupo) a la persona física. **Pregunta abierta**: ¿un préstamo personal lo hace "la empresa" o "el grupo"? Si el chofer trabaja para ambas, un préstamo personal es, funcionalmente, más parecido a algo que le presta el grupo que algo que le presta específicamente una de las dos razones sociales.
- **Adelantos de sueldo** — no aplica salvo que el chofer sea empleado en relación de dependencia de una de las empresas (a diferencia de un transportista tercerizado) — en ese caso sí pertenece, sin ambigüedad, a la empresa empleadora, nunca al grupo.
- **Descuentos y multas** — a diferencia de un anticipo, no son plata que salió antes; son una resta que se aplica en el momento de liquidar (ej. una multa de tránsito que se le carga al chofer). Pertenecen a la empresa cuyo viaje originó la multa.
- **Gastos recuperables** — gastos que el chofer adelantó de su bolsillo y la empresa le devuelve — es, en la práctica, lo opuesto direccional a un anticipo (la empresa le debe al chofer, no al revés), pero pertenece igual de claramente a la empresa del viaje que lo generó.
- **Saldos anteriores** — la sección 3 ya identificó que hoy esto no existe como concepto. Si llegara a existir, la pregunta de si un saldo arrastrado de la Empresa A puede aplicarse contra una deuda de la Empresa B es la misma pregunta de compensación ya planteada, no una nueva.
- **Ajustes manuales** — por su propia naturaleza (una corrección discrecional), deberían requerir siempre una decisión explícita y trazada, nunca aplicarse solos.
- **Deudas del chofer con una empresa del grupo** — es el caso inverso de un préstamo: acá el chofer le debe al grupo, no al revés. La misma pregunta de "¿es una deuda con la empresa A o con el grupo?" aplica igual.

**Respondiendo lo pedido:**

- **¿Pertenecen a una empresa o al grupo?** Depende del tipo: los que nacen de un hecho operativo concreto (multa de un viaje, gasto recuperable de un viaje, adelanto de sueldo de un empleado) pertenecen sin ambigüedad a la empresa de ese viaje o esa relación laboral. Los que no nacen de ningún hecho operativo (un préstamo personal, una deuda genérica) son, funcionalmente, más naturales al nivel del grupo — porque no hay ningún viaje ni ninguna empresa específica que los origine.
- **¿Pueden descontarse de pagos originados por otra empresa?** Los operativos, no — igual que los anticipos, deberían quedarse siempre dentro de la empresa que los generó. Los de nivel grupo (préstamo personal, deuda genérica), en principio sí podrían descontarse de cualquier pago consolidado al mismo chofer, porque no tienen una empresa "dueña" específica — pero esto no debería asumirse automáticamente, sino confirmarse como decisión de negocio.
- **¿Requieren autorización?** Todos los que impliquen mover valor entre lo que debe una empresa y lo que debe otra, sí — es la misma regla de la sección 3.
- **¿Deberían aparecer en el comprobante consolidado?** Sí, siempre que afecten el monto final que el chofer recibe — ocultarlos del comprobante rompe la misma necesidad de trazabilidad de arriba.

**No asumo que todo esto pueda compensarse automáticamente** — de hecho, el hallazgo más importante de esta sección es que hoy el sistema no distingue ninguno de estos conceptos entre sí, así que cualquier automatismo futuro necesita, primero, que el negocio decida si estos conceptos son realmente distintos entre sí o si "anticipo" alcanza para todos (ver sección 13).

---

## 5. Transportista, chofer y beneficiario del pago

**Hecho confirmado:** hoy una `Liquidacion` es de tipo `TRANSPORTISTA` o `CHOFER` (`schema.prisma:460`, enum `TipoLiquidacion`) — son dos circuitos completos y separados, no una liquidación con un beneficiario variable. Un `Chofer` pertenece a exactamente un `Transportista` (`schema.prisma:261`, `transportistaId` obligatorio) — hoy no existe la posibilidad de que un chofer trabaje para más de un transportista dentro de la misma organización, y mucho menos entre organizaciones.

Analizando los escenarios:

- **El viaje está asignado a un chofer, pero la liquidación es al transportista** — ya es el comportamiento normal de tipo `TRANSPORTISTA`: se liquida a la empresa de transporte, no a la persona que manejó. El chofer, en ese circuito, es un dato del viaje, no el beneficiario del pago.
- **El pago se transfiere al chofer directamente** — es el circuito `CHOFER`, ya existente, para cuando el chofer es, en los hechos, quien cobra directamente (transportista unipersonal o chofer propio).
- **Un transportista tiene varios choferes** — ya soportado hoy (`Transportista.choferes: Chofer[]`).
- **Un chofer trabaja para distintos transportistas** — **no soportado hoy**, ni siquiera dentro de una sola organización (`Chofer.transportistaId` es una relación fija, no histórica ni múltiple). Es un caso real de la industria (un chofer freelance que factura viajes de distintas empresas de transporte) que el modelo actual no contempla en absoluto, independientemente de Grupo Económico.
- **La misma persona o empresa opera en varios CUIT del grupo** — es, exactamente, el caso que dio origen a esta auditoría, ya cubierto en la Ronda 1.

**Respondiendo lo pedido:**

- **¿Cuál es la identidad compartida?** Depende del circuito: en tipo `CHOFER`, la identidad compartida relevante es la persona física (el chofer). En tipo `TRANSPORTISTA`, es la empresa de transporte. Son identidades compartidas de naturaleza distinta, y probablemente necesiten resolverse por separado, no con una única solución genérica de "compartir entidades".
- **¿Quién es el beneficiario real?** El que efectivamente recibe la transferencia — que hoy coincide siempre con quién es el sujeto de la liquidación (chofer o transportista), pero **no tiene por qué coincidir siempre en la realidad**: nada impide, en el mundo real, que un transportista cobre a nombre de sus choferes, o que un chofer cobre a una cuenta que no es la suya (ver el último punto).
- **¿Consolidar por chofer siempre es correcto?** No — solo tiene sentido cuando el beneficiario real del pago es, efectivamente, la persona física. Si el circuito real de la empresa es liquidar y pagar siempre al transportista (aunque distintos choferes hayan manejado), consolidar "por chofer" estaría resolviendo un problema que esa empresa no tiene, y creando artificialmente una necesidad de identidad compartida de chofer donde el negocio real nunca la necesitó.
- **¿Cuándo debería consolidarse por transportista?** Cuando el transportista (no el chofer individual) es quien opera, factura o cobra para ambas empresas del grupo — es, estructuralmente, el mismo problema que el del chofer, aplicado un nivel más arriba.
- **¿Qué ocurre si el titular de la cuenta bancaria no coincide con quien figura en los viajes?** Es un caso real (el chofer cobra a nombre de un familiar, o el transportista cobra por sus choferes) que hoy el sistema no distingue en absoluto — no existe ningún campo que separe "quién generó la deuda" de "a quién se le transfiere". Es la misma clase de brecha que "quién pagó" en la sección 1, pero del lado de quien cobra en vez de quien paga.

**Recomendación:** no asumir que "chofer" y "transportista" son las únicas dos identidades posibles de beneficiario — el caso del titular de cuenta distinto sugiere que el beneficiario del pago podría necesitar ser un concepto separado de "quién generó la deuda", en vez de asumir que siempre son la misma entidad.

---

## 6. Cuentas bancarias, cajas y tesorería futura

Sin diseñar el módulo, las preguntas concretas que una arquitectura financiera futura va a necesitar poder responder, tal como las plantaste, con mi lectura de cuáles son imprescindibles para resolver el caso real y cuáles pueden esperar:

| Pregunta | Imprescindible para v1.1 (resolver el caso real) | Puede esperar |
|---|---|---|
| ¿De qué cuenta salió el dinero? | — | ✓ (alcanza con saber "qué empresa lo puso", sin necesitar el detalle bancario exacto todavía) |
| ¿A qué empresa pertenece esa cuenta? | ✓ — es la base misma de la sección 1 | |
| ¿Qué empresa soportó finalmente el pago? | ✓ — es la pregunta que hoy no se puede responder y que originó todo este documento | |
| ¿Existe una caja o tesorería común? | Como concepto de negocio a reconocer, sí; como módulo con su propio saldo y movimientos, no | ✓ (el módulo en sí) |
| ¿Debe existir compensación entre empresas? | Como hecho a registrar (que existió un préstamo/adelanto interempresa), sí | Como mecanismo automático de compensación contable, no |
| ¿Cómo se concilia una transferencia contra varias liquidaciones? | ✓ — es el corazón funcional de la orden de pago consolidada (sección 2) | |
| ¿Cómo se registran comisiones bancarias, retenciones o diferencias? | — | ✓ (son ajustes de tesorería que no cambian la pregunta de fondo de "quién pagó qué") |

**Recomendación:** el alcance mínimo viable no necesita un módulo de Tesorería completo (cuentas, saldos, movimientos bancarios propios) — necesita, como mínimo indispensable, que cada pago (individual o consolidado) pueda identificar **qué organización puso los fondos**, incluso cuando no coincide con quién generó la deuda. Todo lo demás (conciliación bancaria real, comisiones, retenciones) es una capa de sofisticación posterior que no bloquea resolver el caso real planteado.

---

## 7. Combustible y otros insumos

No abro el módulo de Combustibles (deshabilitado, fuera de alcance de v1.0 según `ROADMAP_SDC_V1.md`). Reviso únicamente qué reglas del concepto Grupo Económico no debería cerrar por anticipado, para no tener que deshacer una decisión más adelante:

- **Combustible cargado por Empresa A para un viaje de Empresa B** — es, estructuralmente, el mismo caso que "una empresa adelanta fondos por otra" (sección 1), aplicado a un insumo en vez de a dinero. Si Grupo Económico resuelve bien el caso genérico de "quién puso el recurso vs. quién lo debía", el caso del combustible debería heredar esa misma solución sin necesitar una regla propia.
- **Tarjeta de combustible del grupo** — es exactamente el concepto de "tesorería/caja común" de la sección 6, aplicado a un insumo en vez de a efectivo. Misma recomendación: no diseñar el módulo ahora, pero no cerrar la posibilidad de que un recurso (tarjeta, cuenta, insumo) pertenezca al grupo y no a una organización específica.
- **Combustible asociado al vehículo / al chofer** — si Vehículos y Choferes terminan siendo entidades de identidad compartida a nivel de grupo (Ronda 1, sección 1), el combustible asociado a ellos hereda naturalmente esa misma identidad — no necesita su propia decisión independiente.
- **Combustible entregado como anticipo** — ya es, hoy, un caso real dentro de `AnticipoGasto` (la categorización `categorizarAnticipo()` en `liquidaciones.controller.ts` ya reconoce "Combustible" como una categoría de adelanto). Todo lo que esta ronda concluyó sobre anticipos (sección 3) aplica sin cambios.
- **Descuento de combustible dentro de una liquidación consolidada** — mismo caso que cualquier otro anticipo dentro de una liquidación consolidada (sección 3): pertenece a la empresa que lo otorgó, salvo que se decida explícitamente lo contrario.

**Conclusión de esta sección:** el módulo de Combustibles no necesita ninguna regla propia de Grupo Económico — hereda completamente las reglas que ya se definieron para anticipos, recursos compartidos y aportes cruzados entre empresas. Es una razón más para resolver esas reglas de forma genérica (a nivel de "recurso" y "aporte de fondos/insumos"), no una por una para cada módulo que las vaya a necesitar.

---

## 8. Clientes y productores — identidad maestra vs. relación comercial

La Ronda 1 dejó esto como pregunta abierta sin la distinción que pediste ahora. Separando con precisión:

- **Identidad maestra**: quién es, en el mundo real, esa persona o empresa — su razón social, su CUIT real, su existencia como entidad. Esto no cambia según con cuál organización del grupo esté operando.
- **Relación comercial**: los términos específicos de cómo esa organización hace negocios con esa identidad — condiciones de pago, tarifas, comisiones, contactos, si está activo o no para esa organización en particular, límite de crédito.

**Hecho confirmado sobre el estado actual:** hoy `Cliente` mezcla ambas cosas en una sola entidad, scopeada a una organización (`schema.prisma:187-205`) — no hay ninguna separación entre "quién es este cliente" y "qué términos comerciales tiene con esta organización", porque hoy solo existe una organización por cliente.

Analizando los puntos pedidos, uno por uno:

- **Condiciones de pago distintas** — perfectamente razonable que la Empresa A le dé 30 días y la Empresa B le dé 60 al mismo cliente real. Es relación comercial, no identidad.
- **Tarifas distintas** — mismo caso.
- **Comisiones distintas** — mismo caso (aplica más a Transportistas/Choferes que a Clientes, pero la lógica es idéntica).
- **Contactos distintos** — un cliente puede tener una persona de contacto para la Empresa A y otra distinta para la Empresa B, sin que eso diga nada sobre si es "el mismo cliente" — es, con más claridad todavía, relación comercial y no identidad.
- **Estado activo distinto** — un cliente puede estar dado de baja para la Empresa A (dejaron de operar juntos) y seguir activo para la Empresa B — de nuevo, relación comercial.
- **Límite de crédito distinto** — cada empresa asume su propio riesgo comercial con ese cliente, independientemente de que sea la misma empresa real — relación comercial.
- **Facturación desde diferentes CUIT** — esto es, directamente, la razón legal por la que la relación comercial tiene que poder ser distinta por organización, aunque la identidad sea la misma: cada factura sale de un CUIT específico, con sus propias condiciones.

**Conclusión de esta sección — respondiendo lo pedido directamente:** "compartir clientes" significa, con la evidencia de arriba, **compartir identidad maestra, nunca relación comercial**. Cada organización del grupo debería poder tener sus propias condiciones de pago, tarifas, contactos, estado y límite de crédito con el mismo cliente real, sin que eso implique que son dos clientes distintos ni que sus términos comerciales tengan que coincidir. Es exactamente el mismo patrón que ya identificamos para Choferes en la Ronda 1: una identidad, con datos operativos/comerciales que pueden variar según con qué organización del grupo se está tratando.

**Aplicado a Productores:** el mismo razonamiento aplica sin cambios — un productor (el origen del grano) es una identidad real que no cambia según qué CUIT del grupo lo registró en un viaje puntual; lo que sí podría variar por organización es, como mucho, algún dato de relación (localidad registrada, por ejemplo, si un productor opera en distintas zonas según con cuál empresa trabaja) — aunque acá el caso es más débil que en Clientes, porque `Productor` hoy no tiene ningún campo de tipo "condición comercial" (solo `nombre`, `cuit`, `localidad`).

---

## 9. Catálogos compartidos: Cereales, Ubicaciones, Tipos de gasto

Analizando cada uno por separado, sin asumir que los tres se comportan igual:

**Cereales.** No tiene ningún campo de configuración por organización hoy (`schema.prisma:308-319`: solo `nombre`). Es, de los tres, el más claro candidato a catálogo común del grupo — "Trigo" es "Trigo" sin importar qué empresa lo registra, y no hay ningún atributo que pudiera necesitar variar por organización.

**Ubicaciones.** Tiene `tipo` (ACOPIO/PLANTA/PUERTO/CAMPO/OTRO) y `localidad`, ninguno de los dos con motivo aparente para variar según la organización que lo usa — un puerto es el mismo puerto lo use quien lo use. Mismo candidato fuerte que Cereales.

**Tipos de gasto.** Tiene un campo que las otras dos no tienen: `afectaLiquidacion` (booleano, `schema.prisma:341`) — **esto es una regla de negocio propia de cada organización**, no un dato descriptivo neutro. Es perfectamente razonable que la Empresa A considere que "Multas" afecta el neto a pagar y la Empresa B decida que no. Esto convierte a Tipos de gasto en un caso distinto de los otros dos: el **nombre** del tipo de gasto ("Combustible", "Seguros") podría ser común al grupo, pero su **comportamiento** (`afectaLiquidacion`) necesita poder configurarse por organización.

**Respondiendo lo pedido:**

- **¿Cuáles pueden ser catálogo común del grupo?** Cereales y Ubicaciones, sin reservas evidentes. Tipos de gasto, solo en su identidad (el nombre), no en su comportamiento.
- **¿Cuáles necesitan configuración particular por empresa?** Tipos de gasto, por el campo `afectaLiquidacion`.
- **¿Qué ocurre si una organización desactiva un valor que otra sigue usando?** Es la misma pregunta que ya resolvió Bloque 5.2 para el modelo actual (soft-delete con `activo`, filtrado en listados nuevos, permitido en historial ya existente) — pero aplicada ahora entre organizaciones del mismo grupo en vez de dentro de una sola: si "Cereal: Sorgo" fuera compartido y la Empresa A lo desactiva, ¿deja de estar disponible también para la Empresa B, que todavía lo usa activamente? Es una pregunta real que no tiene una respuesta obvia — desactivar algo compartido tiene un efecto que se sale de los límites de quien lo desactivó.
- **¿Conviene una identidad común con habilitación por organización?** Con la evidencia de esta sección, sí — el mismo patrón que ya se perfiló para Clientes y Choferes: una identidad compartida (el nombre del cereal, la ubicación, el nombre del tipo de gasto), con la posibilidad de que cada organización decida si lo usa, y en el caso de Tipos de gasto, con qué comportamiento.

---

## 10. Usuarios y flujo operativo

Retomando la Ronda 1 con la precisión que pediste — identificando **personas concretas**, no roles abstractos:

- **Necesitan operar una sola organización**: la enorme mayoría — cualquier persona de Operaciones, Facturación o Liquidaciones que trabaja el día a día de una sola empresa del grupo, sin ningún motivo de negocio para cruzar a la otra.
- **Necesitan operar varias organizaciones**: quien arma o ejecuta el pago consolidado — no necesariamente todo el equipo administrativo, solo quien concretamente tiene que ver ambas deudas al mismo tiempo para juntarlas en un pago.
- **Necesitan solo la vista consolidada**: el dueño o dirección del grupo — alguien que quiere ver el negocio completo, pero probablemente no necesita "operar" (crear, editar) sobre ninguna organización individual, solo consultar.
- **Necesitan la orden de pago consolidada**: el mismo perfil que "varias organizaciones" de arriba — es, en los hechos, el caso de uso más concreto y acotado de todos los planteados.
- **Necesitan auditoría del grupo**: quien tiene que responder, ante cualquier pregunta, "qué pasó entre las empresas del grupo" — probablemente el mismo perfil administrativo/de dirección, no un rol operativo nuevo.
- **Necesitan configurar el grupo**: previsiblemente muy poca gente — quien da de alta qué organizaciones pertenecen a qué grupo, análogo a lo acotado que es hoy `ADMINISTRADOR` de Mi Organización.

**Respondiendo lo pedido directamente:** no, resolver únicamente el pago consolidado **no requiere** cambiar el modelo completo de usuarios (`Usuario → Organización`) para todo el mundo. El caso real identificado en la Ronda 1 y profundizado acá es acotado: hace falta que **alguna** combinación de personas (quien arma la orden de pago, quien la ejecuta, quien la audita) pueda ver más de una organización del grupo — no que cada usuario de cada organización gane, de golpe, visibilidad sobre el resto del grupo. Esto sugiere que la pregunta de fondo no es "¿todo usuario pertenece a una organización, o a un grupo con varias organizaciones permitidas?" sino algo más parecido a "¿quién, específicamente, necesita ese acceso ampliado, y qué tan amplio tiene que ser?" — una pregunta de alcance mucho más chica que la que se planteó en la Ronda 1, aunque en la misma dirección.

---

## 11. Centro de Inteligencia

Retomando la Ronda 1 con el detalle pedido, indicador por indicador, marcando dónde una suma simple sería incorrecta:

- **Rentabilidad** — sumar el margen de A más el margen de B para obtener "el margen del grupo" es correcto **solo si no hay viajes ni operaciones entre las dos empresas del grupo** (es decir, si A nunca le "vende" ni le "compra" nada a B). Si en algún momento una empresa del grupo le factura algo a la otra (una operación interna), sumar sin más **duplicaría** ese valor a nivel de grupo — es exactamente el mismo problema contable que "eliminación de operaciones intercompañía" en cualquier consolidación contable real. **Hecho confirmado**: hoy no existe ningún caso de una organización facturándole a otra (cada organización factura a sus propios `Cliente`), así que este riesgo es hipotético hoy — pero si el modelo evoluciona a compartir identidades entre organizaciones del grupo, la pregunta deja de ser hipotética.
- **Ingresos y Costos** — misma lógica que rentabilidad: sumables directamente mientras no existan operaciones entre empresas del grupo.
- **Comisión** — es un costo de A o de B según de qué liquidación salga — sumable sin riesgo, no hay forma de que una comisión aparezca dos veces.
- **Anticipos** — sumables por organización sin problema; lo que **no** es una suma simple es "cuánto le anticipó el grupo a este chofer en total", porque ahí hay que sumar a través de la identidad compartida del chofer (Ronda 1), no a través de la organización — es una dimensión de agregación distinta a la que el Motor usa hoy.
- **Deuda con choferes** — mismo caso que Anticipos: sumable por organización sin riesgo; la vista "cuánto le debe el grupo a este chofer en total" exige la identidad compartida, no una simple suma de organizaciones.
- **Pagos realizados** — con la orden de pago consolidada (sección 2), un mismo pago podría aparecer, mal sumado, tanto en la vista de la Empresa A como en la de la Empresa B, y si alguien suma ambas vistas para "el total pagado por el grupo", **contaría el mismo pago dos veces si no se resta la parte que ya se contó en cada empresa** — acá sí hay un riesgo real de duplicación si no se diseña con cuidado.
- **Aging** — sumable por organización sin riesgo (cada factura, de cada organización, es un hecho independiente); no hay ningún caso evidente de duplicación acá porque Aging no cruza organizaciones en ningún punto de este análisis.
- **Alertas** — la Ronda 1 ya identificó que hoy una alerta como "chofer con anticipos altos" evalúa cada organización por separado, y que junto podría ser una alerta real que hoy nadie ve. Acá no hay riesgo de "suma incorrecta" porque hoy no se suman entre sí — el riesgo es el opuesto: **faltan** alertas de grupo que hoy no existen en absoluto.
- **Benchmarking** — comparar la Empresa A contra la Empresa B (como si fueran dos clientes o transportistas dentro de un mismo ranking) es un uso nuevo y legítimo que hoy no tiene sentido porque el Motor nunca compara organizaciones entre sí, solo clientes/transportistas dentro de una organización.

**Conclusión de la sección:** los indicadores financieros (rentabilidad, ingresos, costos, comisión) son sumables por grupo **siempre que no existan operaciones entre empresas del mismo grupo** — una condición que hoy se cumple porque esas operaciones no existen, pero que cualquier diseño futuro debería verificar explícitamente, no asumir. Los indicadores de identidad compartida (anticipos y deuda por chofer, a nivel de grupo) necesitan una dimensión de agregación nueva que hoy el Motor no tiene (agrupar por persona real, no por organización). Los pagos consolidados necesitan cuidado explícito para no contarse dos veces.

---

## 12. Anulaciones, correcciones y auditoría

Analizando cada escenario contra el comportamiento real ya confirmado en las secciones anteriores:

- **Se incluyó una liquidación incorrecta en una orden de pago** — hoy, anular una liquidación ya pagada está bloqueado por diseño (`"No se puede anular una liquidación ya pagada"`). Con pago consolidado, si el error se detecta **antes** de ejecutar el pago, debería poder sacarse de la orden sin problema (la liquidación individual vuelve a su estado previo). Si se detecta **después**, es un problema distinto y más delicado: ya hubo una transferencia bancaria real que incluía ese monto — no se puede simplemente "anular" sin dejar un rastro de que el dinero salió igual.
- **Se pagó desde la empresa equivocada** — es exactamente el problema que la sección 1 identificó como el riesgo central de todo este documento: sin el dato de "quién puso los fondos" separado de "quién debía", este error ni siquiera se puede detectar después, mucho menos corregir.
- **La transferencia fue rechazada** — la orden de pago (sección 2) necesita poder volver a un estado "pendiente de pago" sin perder el hecho de que se intentó y falló — un rechazo bancario es información real que no debería desaparecer silenciosamente.
- **El importe transferido no coincide con lo esperado** — necesita quedar registrada la diferencia explícitamente, no ajustarse en silencio para que "cierre" — es el mismo principio que ya rige el resto de SDC (`CONSTITUCION_SDC.md`, Artículo 7: "no se esconde la realidad incómoda").
- **Se anuló una liquidación después de generar la orden de pago (pero antes de pagar)** — la orden de pago debería quedar con un desbalance visible (le falta o le sobra ese monto), no recalcularse sola sin dejar rastro de que una de sus partes desapareció.
- **Una empresa abandona el grupo** — todo lo que esa empresa haya compartido con el resto del grupo (identidad de choferes/transportistas compartidos, catálogos comunes, órdenes de pago conjuntas ya ejecutadas) tiene que **seguir siendo consultable como hecho histórico**, aunque la organización ya no pertenezca más al grupo hacia adelante — no debería poder desaparecer ni perder trazabilidad retroactivamente.
- **Un chofer fue duplicado por error y luego unificado** — es el escenario inverso del problema de origen de esta auditoría (dos identidades que en realidad son una sola persona). Todo el historial de viajes, anticipos y liquidaciones de ambas identidades duplicadas tiene que preservarse íntegro después de unificarlas — unificar no puede significar "elegir una identidad y descartar el historial de la otra".

**Respondiendo lo pedido:** deberían conservar trazabilidad completa, sin excepción: el origen de fondos de cada pago (quién puso el dinero, aunque no coincida con quién debía), cualquier compensación entre empresas del grupo, cualquier rechazo o diferencia bancaria, y el historial completo de cualquier identidad (chofer, transportista, cliente) que alguna vez estuvo duplicada y después se unificó. Nada de esto debería borrarse silenciosamente — es consistente con el principio ya vigente en todo SDC (`CONSTITUCION_SDC.md`, Artículo 7, principio 7: "toda excepción a una regla de negocio queda trazada — nada se pierde en silencio").

---

## 13. Decisiones de negocio pendientes

Lista concreta para vos, como dueño del producto, antes de pasar a diseño técnico. Ninguna es una pregunta técnica.

### Decisión 1 — ¿Qué recursos se comparten realmente dentro del grupo, y cuáles no?

- **Por qué importa:** define el alcance real de todo lo que viene después. Compartir Choferes sin compartir Clientes es un proyecto mucho más chico que compartir ambos, y ambos casos resuelven problemas de negocio distintos.
- **Alternativas reales:** (a) solo Choferes/Transportistas/Vehículos (el caso concreto que motivó esto); (b) (a) más Clientes/Productores; (c) (a) más Cereales/Ubicaciones/Tipos de gasto; (d) todas las anteriores juntas.
- **Recomendación funcional:** empezar por (a) — es la única con un caso de negocio real y concreto ya identificado (el chofer que cobra una sola vez). Las demás son candidatos razonables pero sin un caso de uso urgente todavía descripto.
- **Impacto de postergarla:** sin esta decisión, no se puede acotar el alcance de v1.1 — cualquier diseño técnico que arranque sin esto corre el riesgo de resolver más (o menos) de lo que el negocio realmente necesita hoy.

### Decisión 2 — ¿Puede compensarse automáticamente un saldo negativo de una empresa contra lo que debe otra, en el mismo pago consolidado?

- **Por qué importa:** es la pregunta financiera más delicada de todo el documento (sección 3) — mezclar, aunque sea parcialmente, la deuda de dos personas jurídicas distintas sin una decisión explícita.
- **Alternativas reales:** (a) nunca se compensa automático, siempre requiere una acción explícita y quede registrada como tal; (b) se compensa automático pero queda registrado como préstamo interempresa; (c) se compensa automático sin dejar rastro adicional (no recomendado, ver sección 3).
- **Recomendación funcional:** (a) para empezar — es la opción más segura y la más fácil de relajar después si se comprueba que genera demasiada fricción operativa; ir de (a) a (b) es mucho más simple que ir de (c) a (a) una vez que ya se acostumbraron a que "simplemente funcione".
- **Impacto de postergarla:** si se diseña la orden de pago consolidada sin esta decisión, el comportamiento por defecto que termine implementándose de hecho será la decisión — mejor tomarla a propósito.

### Decisión 3 — ¿Quién, específicamente, necesita ver o operar más de una organización del grupo?

- **Por qué importa:** de esto depende si hace falta un cambio grande al modelo de usuarios o uno mucho más chico y acotado (sección 10).
- **Alternativas reales:** (a) una o dos personas puntuales (quien arma/ejecuta el pago consolidado); (b) todo el perfil administrativo de ambas empresas; (c) todos los `ADMINISTRADOR` de cualquier organización del grupo automáticamente.
- **Recomendación funcional:** (a) — es el alcance mínimo que resuelve el caso real, con la menor ampliación de superficie de riesgo (Ronda 1, sección 4).
- **Impacto de postergarla:** sin esto, cualquier diseño de acceso multiempresa corre el riesgo de sobredimensionarse "por las dudas", exactamente el tipo de decisión que `CONSTITUCION_SDC.md` (Artículo 5) pide evitar sin una justificación concreta.

### Decisión 4 — ¿Existen hoy, o van a existir, operaciones comerciales entre las dos empresas del grupo (una le vende/factura/presta a la otra)?

- **Por qué importa:** si la respuesta es no, sumar los indicadores financieros por grupo (sección 11) es seguro. Si la respuesta es sí (aunque sea ocasional), cualquier vista consolidada del Centro de Inteligencia necesita, desde el diseño, contemplar la eliminación de esas operaciones internas — agregarlo después es mucho más costoso que preverlo ahora.
- **Alternativas reales:** (a) nunca va a pasar; (b) no pasa hoy pero podría pasar (ej. un préstamo interempresa puntual); (c) ya pasa o se sabe que va a pasar de forma recurrente.
- **Recomendación funcional:** aunque la respuesta hoy sea (a), documentarla como supuesto explícito del diseño — no como un hecho asumido en silencio — para que si algún día deja de ser cierto, se sepa exactamente qué parte del diseño hay que revisar.
- **Impacto de postergarla:** es la decisión con mayor costo de haberla ignorado si resulta ser (c) más adelante — una vista de grupo que sumó mal desde el principio es difícil de corregir sin generar desconfianza en los números ya mostrados.

### Decisión 5 — ¿Cuántos y cuáles comprobantes recibe el chofer en un pago consolidado?

- **Por qué importa:** afecta directamente la experiencia del chofer, que es, en definitiva, quien vivió el problema real que originó todo esto (recibir un pago que no entiende porque no ve de dónde sale cada parte).
- **Alternativas reales:** (a) un único comprobante consolidado con desglose por empresa; (b) un comprobante por empresa, más un resumen de que se pagaron juntos; (c) dejar que cada empresa siga generando su propio comprobante, sin ningún documento nuevo a nivel de pago consolidado.
- **Recomendación funcional:** (a) — es la que mejor refleja la experiencia real del chofer (una transferencia) sin perder la trazabilidad por empresa (sección 2).
- **Impacto de postergarla:** es la decisión de menor riesgo estructural de las cinco — se puede ajustar más adelante sin rediseñar nada de lo anterior, así que si hace falta priorizar, esta puede resolverse en último lugar sin bloquear el resto.

---

## Alcance mínimo para empezar a usar SDC v1.1 vs. lo que puede esperar

**Imprescindible para resolver el caso real** (un chofer que trabaja para dos empresas del grupo en la misma semana y cobra una vez): identidad compartida de Choferes (y, en la misma medida, Transportistas/Vehículos si aplica el mismo caso); una orden de pago que agrupe liquidaciones de distintas organizaciones para el mismo beneficiario; el registro de qué organización puso los fondos cuando no coincide con quién generó la deuda; y las Decisiones 1, 2 y 3 de la sección anterior, resueltas antes de diseñar.

**Puede esperar:** compartir Clientes/Productores (sin un caso de uso urgente todavía); compartir Cereales/Ubicaciones/Tipos de gasto (fricción real pero no bloqueante); cualquier módulo de Tesorería/Caja propiamente dicho (sección 6); préstamos personales y otros saldos distintos de anticipos operativos (sección 4, salvo que ya estén ocurriendo en la operación real hoy); la vista consolidada completa del Centro de Inteligencia (sección 11) más allá de lo estrictamente necesario para mostrar el pago consolidado.

---

No se propuso ningún diseño técnico, ninguna tabla, ningún endpoint, ninguna migración. No se modificó `schema.prisma` ni ningún documento anterior. No se hizo commit ni push. No se abrió ningún bloque de implementación. Quedo a la espera de tu revisión de esta segunda ronda, y en particular de las cinco decisiones de la sección 13, antes de avanzar a cualquier etapa de diseño técnico.

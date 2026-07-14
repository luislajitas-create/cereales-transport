# Changelog — Sistema Dador de Carga de Cereales (SDC)

Registro pensado para personas, no generado automáticamente desde Git. Cada sección explica qué cambió desde la mirada de quien usa el sistema o de quien toma decisiones de negocio con él — no desde la mirada de quien escribió el código.

---

## Versión inicial

La base funcional completa del sistema: los 7 módulos de negocio, de punta a punta, por primera vez funcionando juntos.

- **Autenticación y roles.** Login con 6 roles diferenciados (Administrador, Gerencia, Operaciones, Liquidaciones, Facturación, Lectura), cada uno viendo solo lo que le corresponde en el menú.
- **Dashboard operativo.** Un resumen de un vistazo del estado general: viajes en curso, pendientes de facturar, liquidaciones a pagar, anticipos sin liquidar.
- **Gestión de viajes.** Alta de un viaje y su ciclo de vida completo, desde que se asigna hasta que se descarga o se cancela.
- **Catálogos maestros.** Clientes, transportistas, choferes, vehículos, cereales, ubicaciones y productores, todos cargables desde la interfaz.
- **Anticipos y gastos.** Registro de adelantos y gastos asociados a un viaje o a un transportista/chofer en general.
- **Liquidaciones.** Cálculo de lo que se le paga a cada transportista/chofer por sus viajes, descontando anticipos.
- **Facturación y cobranzas.** Emisión de facturas a clientes por los viajes realizados, y registro de los pagos que se van cobrando.

Antes de sumar funcionalidad nueva, se reforzó esta base: se agregó control de acceso por rol en la carga de anticipos (antes cualquier usuario logueado podía cargarlos), se endureció la validación de los datos que entran por cada formulario, y los mensajes de error dejaron de mostrar detalles técnicos crudos cuando algo se rechaza por estar duplicado.

---

## Bloque 3 — Integridad de datos, comisiones y liquidaciones

Correcciones que garantizan que la plata que el sistema calcula sea la plata correcta, sin que el usuario tenga que revisarla a mano.

- **Integridad de datos.** Corregido un problema donde anular una liquidación podía, en ciertos casos, descontar el anticipo equivocado — de un chofer o transportista que no tenía nada que ver con esa liquidación.
- **Comisiones.** La comisión de cada chofer ahora se toma automáticamente de su ficha al armar una liquidación, en vez de tener que tipearla a mano cada vez (con el riesgo de error que eso implicaba). Si igual se necesita una comisión distinta a la de la ficha, el sistema lo permite pero deja constancia de que fue una excepción.
- **Liquidaciones.** Un viaje cuya liquidación se anuló ahora se puede volver a liquidar sin problema — antes quedaba trabado para siempre, sin ninguna forma de corregirlo salvo intervención directa en la base de datos.
- **QA.** Una auditoría funcional completa del sistema, módulo por módulo, identificó estos problemas (junto con los que resolvió el Bloque 4) antes de que afectaran a un cliente real — el sistema no estaba listo para operar con dinero real hasta resolverlos.

---

## Bloque 4 — Guardas de negocio, refacturación y cobranzas

Reglas que evitan que un documento financiero ya entregado (una factura, una liquidación) deje de coincidir con la realidad del viaje que lo originó.

- **Guardas de negocio.** Un viaje que ya fue facturado o liquidado ya no se puede editar ni cancelar por accidente — si hiciera falta corregir algo después de ese punto, el sistema lo impide en vez de permitir una divergencia silenciosa entre lo que dice el viaje y lo que ya se facturó o pagó.
- **Refacturación.** Si una factura se carga mal y hay que anularla, el viaje que quedó sin facturar ahora se puede volver a facturar correctamente — antes esto también quedaba trabado.
- **Cobranzas.** Los pagos registrados contra una factura ya no pueden superar el importe de la factura, no se duplican si se registra el mismo pago dos veces por error, y ahora se puede anular un pago individual mal cargado sin perder el resto del historial de esa factura.
- **QA.** Validación manual completa de los tres flujos de punta a punta: liquidar → confirmar → pagar → anular → volver a liquidar; facturar → anular → volver a facturar; y cobrar con sobrepago, duplicado y anulación — cada uno probado con datos reales antes de darlo por cerrado.

---

## Bloque 5 — Seguridad, integridad de catálogos, UX y planilla profesional

El salto de "funciona correctamente" a "se siente como un producto terminado" — al menos en la parte financiera principal del sistema.

- **Seguridad.** Antes, cualquier usuario logueado — incluido uno de solo consulta — podía crear, editar o dar de baja clientes, transportistas, choferes y vehículos, incluida la comisión que determina cuánto cobra un chofer. Ahora esas acciones están restringidas a los roles que realmente deberían poder hacerlas.
- **Integridad de catálogos.** Dar de baja un cliente, transportista, chofer o vehículo ahora tiene un efecto real: deja de aparecer para elegir al crear un viaje, una factura, una liquidación o un anticipo nuevo, y el sistema rechaza explícitamente cualquier intento de usarlo igual.
- **UX.** Las cuatro acciones más delicadas del sistema (anular una liquidación, confirmarla, anular una factura, marcar una liquidación como pagada) ahora piden una confirmación explícita antes de ejecutarse — la más delicada de todas, "marcar como pagada", pide además escribir el número de liquidación para confirmar, porque es la única acción del sistema que no se puede deshacer. Además, ya no es posible duplicar una liquidación o una factura haciendo doble clic por accidente.
- **Planilla profesional.** La pantalla de detalle de una liquidación, que antes era una tabla técnica de cuatro columnas, ahora es una planilla real: un resumen que se entiende en menos de 10 segundos (quién cobra, cuánto, por cuántos viajes), una tabla principal limpia, y el detalle técnico completo disponible con un clic para quien lo necesite — incluyendo, por primera vez, el número de factura de cada viaje para poder rastrearlo si un transportista llama por teléfono a preguntar.
- **QA.** Dos auditorías completas guiaron este bloque: una de producto (todo el sistema, buscando qué falta para sentirse profesional) y una específica de experiencia de usuario (las 12 pantallas, comparadas entre sí). Cada entrega se validó a mano contra datos reales, incluyendo la generación y lectura de los PDF y Excel de liquidaciones antes de darla por cerrada.

---

## Bloque 6 — Producción confiable

El sistema pasó de "funciona cuando lo probamos nosotros" a "sabemos con certeza qué corre en producción y que se actualiza solo".

- **Incidente resuelto: base de datos de producción desactualizada.** Una revisión en vivo encontró que la base de datos real tenía 5 de 7 actualizaciones de estructura sin aplicar, pese a que la aplicación ya desplegada las daba por hechas — cualquier intento real de liquidar con anticipo, anular y volver a liquidar, anular y volver a facturar, anular un pago, o dar de baja un chofer/vehículo se habría roto en el momento de usarlo. Se aplicaron las 5 actualizaciones pendientes en producción, con backup previo verificado y 17 pruebas funcionales contra la base real (todas exitosas) antes de dar el incidente por cerrado.
- **Actualizaciones de base de datos ahora automáticas.** La causa del incidente anterior — que nada en el proceso de despliegue aplicaba las actualizaciones de estructura pendientes — quedó resuelta: cada despliegue nuevo aplica automáticamente lo que haga falta antes de poner en línea la versión nueva, y si algo fallara, Railway no corta el tráfico hacia la versión anterior. Confirmado funcionando en un despliegue real.

---

## Bloque 7 — Centro de Inteligencia

El salto de "un sistema que registra viajes, facturas y liquidaciones" a uno que además dice, con datos ya cargados, qué cliente conviene más, qué transportista está funcionando peor este mes, y qué requiere atención hoy.

- **Rentabilidad por viaje, cliente y transportista.** Por primera vez, el sistema cruza automáticamente lo facturado a un cliente contra lo liquidado al transportista del mismo viaje y muestra el margen resultante — antes esa cuenta, si se quería, había que armarla a mano cruzando dos pantallas distintas.
- **Aging de cobranzas.** Cuánto hay pendiente de cobrar, separado por cuánto hace que está vencido (0-30, 31-60, 61-90, más de 90 días) y por cliente — la misma lógica que cualquier reporte de cartera de una empresa, ahora calculada automáticamente en vez de armarse en una planilla aparte.
- **Centro de Alertas.** Nueve situaciones que antes requerían revisar manualmente ahora se detectan solas y se muestran agrupadas por severidad: facturas vencidas o por vencer, clientes con deuda concentrada o elevada, anticipos sin liquidar hace demasiado, choferes con anticipos acumulados altos, viajes que quedaron sin facturar o sin liquidar, viajes estancados en un mismo estado. Cada rol ve solo las alertas que le corresponden a su trabajo diario.
- **Dashboard Ejecutivo.** Una sola pantalla que resume rentabilidad, cartera y alertas del período, pensada para una lectura de menos de un minuto — con acceso directo a cada módulo de origen para quien necesite el detalle completo.
- **Benchmarking y Tendencias.** Comparación automática entre un período y el anterior (qué cliente o transportista mejoró, cuál empeoró), evolución mensual de ingreso/costo/margen, y rankings de clientes, transportistas, cereales y rutas — la primera mirada del sistema que no es solo "cómo estamos hoy" sino "cómo venimos".
- **Acceso.** Las cinco pantallas nuevas son visibles solo para los roles a los que les corresponde ver información financiera comparativa (Administrador, Gerencia, y Facturación/Liquidaciones/Operaciones según la categoría de alerta).
- **QA.** Cada capacidad se validó con pruebas automáticas de cálculo puro (más de 80 casos entre las cinco) y, además, contra datos reales: se compararon a mano los números que muestra cada pantalla nueva con los que ya mostraban Facturas/Liquidaciones/Viajes, para confirmar que el Centro de Inteligencia lee la misma realidad que el resto del sistema, sin inventar ni recalcular nada por su cuenta.

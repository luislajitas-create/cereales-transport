# Bloque 8.1 — Diseño: Arquitectura Multiempresa y Aislamiento de Datos

Fecha: 2026-07-12. **Estado: APROBADO** (Alternativa 1, con las 7 decisiones finales incorporadas en las secciones 3-5). Documento de diseño técnico — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se diseñaron pantallas, no se implementó nada, no se hizo commit ni push.** Responde exclusivamente al hallazgo #1 de `BLOQUE8_AUDITORIA_PRODUCTIZACION.md` (ausencia total del concepto de organización en el modelo de datos) — no reabre gestión de usuarios, onboarding, moneda ni roles configurables: todos dependen de esta decisión y quedan, a propósito, fuera de este documento.

**La pregunta que responde este diseño, y solo esta:** ¿cómo representa SDC una organización, y cómo garantiza que los datos de una nunca se mezclen con los de otra?

El diseño técnico de implementación (fases, migración, mecanismo de aislamiento) se desarrolla en `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md`, a partir de las decisiones ya aprobadas acá.

---

## 1. Alcance

**En alcance:** el modelo conceptual de "Organización", su relación con "Usuario", el mecanismo por el cual el contexto de organización viaja desde la autenticación hasta el acceso a datos, la estrategia conceptual de migración de la instalación actual, y la evaluación comparada de las cuatro alternativas arquitectónicas posibles.

**Fuera de alcance, explícitamente:** el diseño detallado de la migración de `schema.prisma` (nombres de columnas, tipos, índices), el mecanismo técnico exacto de inyección automática de filtros (se establece como requisito, no se diseña su implementación), cualquier pantalla o flujo de UI, el CRUD de usuarios, la configuración de moneda/locale/umbrales por organización, y los roles configurables. Cada uno de estos queda señalado como dependiente de esta decisión, para un sub-bloque posterior (8.2 en adelante).

---

## 2. Las cuatro alternativas, evaluadas

### Alternativa 1 — Base de datos compartida, con identificador de organización en cada entidad

Todas las organizaciones viven en la misma base de datos y en las mismas tablas; cada fila de cada tabla operativa lleva una referencia a la organización dueña de ese dato.

| Criterio | Evaluación |
|---|---|
| Aislamiento de datos | Depende enteramente de que **todo** acceso a datos aplique el filtro correcto — no hay ninguna barrera física que lo garantice por sí sola. |
| Seguridad | Buena si el filtrado es sistemático (ver sección 4); el modo de falla, si algo se rompe, es **silencioso** (devuelve datos de otra organización sin ningún error visible) — el más peligroso de los cuatro en ese sentido específico. |
| Riesgo de filtración entre empresas | El más alto de las cuatro alternativas **si el filtrado depende de que cada desarrollador lo recuerde manualmente**; se reduce a un riesgo bajo y acotado si el filtrado es estructural y centralizado (condición que este diseño exige, no opcional). |
| Complejidad de implementación | Media — muchas tablas a tocar (blast radius amplio), pero cada cambio individual es simple y aditivo; el trabajo real está en construir el mecanismo de filtrado sistemático una sola vez. |
| Migraciones | Muchas, pero todas aditivas y de bajo riesgo individual (agregar una columna, poblarla, después endurecerla) — pueden hacerse de forma incremental, tabla por tabla. |
| Backups y restauración | Simple para toda la base a la vez; **no es posible, sin herramienta adicional, restaurar los datos de una sola organización** sin afectar al resto. |
| Soporte | Un solo entorno para monitorear; depurar un problema exige tener siempre presente de qué organización son los datos que se están mirando. |
| Costos | Los más bajos de las cuatro — una instancia de base de datos sirve a cualquier cantidad de organizaciones; el costo marginal de una organización nueva es, en la práctica, cero infraestructura adicional. |
| Onboarding | El más rápido de las cuatro — una organización nueva es, conceptualmente, una fila nueva más su catálogo inicial, no una infraestructura nueva. |
| Escalabilidad a 10/50/200/1.000 | La mejor de las cuatro — Postgres maneja con comodidad millones de filas con la indexación adecuada; el desafío se desplaza a la disciplina de indexar y filtrar bien, no a la cantidad de infraestructura. |
| Compatibilidad con Railway | Total — no cambia nada de la arquitectura de despliegue actual (un servicio de Postgres, un backend, un frontend). |
| Impacto sobre el sistema actual | Alto en cantidad de archivos tocados (cualquier consulta a una tabla organizacional), bajo en infraestructura. |
| Convertir la instalación actual en la primera organización | Directo: crear una fila de organización y asignarle el dato ya existente — sin mover datos entre sistemas. |

### Alternativa 2 — Un schema de PostgreSQL por organización

Cada organización tiene su propio *schema* dentro de la misma base de datos física — las tablas se repiten, una vez por organización, dentro de espacios de nombres separados.

| Criterio | Evaluación |
|---|---|
| Aislamiento de datos | Más fuerte que la Alternativa 1 a nivel de base de datos — un error de código que no cambie de *schema* correctamente no mezcla filas dentro de la misma tabla, porque son tablas distintas. |
| Seguridad | Mejor blast radius que la Alternativa 1, pero introduce un problema nuevo: la herramienta de acceso a datos del proyecto no está pensada para cambiar de *schema* de forma dinámica por cada pedido — hacerlo bien requiere managear varias conexiones o instancias en paralelo, con un costo de ingeniería real. |
| Riesgo de filtración entre empresas | Bajo si el ruteo de *schema* es correcto; el riesgo se traslada de "olvidé el filtro" a "conecté al *schema* equivocado" — un tipo de error distinto, no necesariamente más fácil de prevenir. |
| Complejidad de implementación | Alta — hace falta, además del modelo, un mecanismo nuevo para crear un *schema* y aplicarle todas las migraciones cuando se suma una organización, y un mecanismo de enrutamiento por pedido. |
| Migraciones | Hay que aplicar cada cambio de modelo **una vez por cada *schema* existente** — con 200 organizaciones, un cambio de modelo implica 200 aplicaciones de migración, no una. |
| Backups y restauración | Mejor granularidad que la Alternativa 1 — es técnicamente posible respaldar o restaurar un solo *schema* de forma independiente. |
| Soporte | Aislamiento más claro ayuda a depurar, pero hay que saber en qué *schema* mirar. |
| Costos | Similares a la Alternativa 1 mientras todo viva en la misma instancia de Postgres — pero una cantidad muy alta de *schemas* dentro de una misma base es un patrón con problemas operativos conocidos (degradación de las consultas de catálogo interno de Postgres a medida que crecen los miles de objetos). |
| Onboarding | Más trabajo que la Alternativa 1 (crear *schema* + aplicar migraciones), menos que las Alternativas 3 y 4. |
| Escalabilidad a 10/50/200/1.000 | Cómoda en 10-50; empieza a mostrar fricción operativa real hacia las 200; genuinamente riesgosa hacia las 1.000 sin inversión de herramientas adicional que hoy no existe. |
| Compatibilidad con Railway | Compatible (sigue siendo un solo servicio de Postgres), pero la complejidad real está en la capa de aplicación, no en la infraestructura. |
| Impacto sobre el sistema actual | Alto — exige construir infraestructura de conexión que hoy no existe en absoluto. |
| Convertir la instalación actual en la primera organización | Simple: el *schema* ya existente pasa a ser, conceptualmente, el de la primera organización. |

### Alternativa 3 — Una base de datos independiente por organización (misma infraestructura compartida)

Cada organización tiene su propia base de datos lógica, todas alojadas en la misma instancia de servidor de Postgres.

| Criterio | Evaluación |
|---|---|
| Aislamiento de datos | El más fuerte de las tres alternativas que comparten infraestructura — un error de código que apunte a la base equivocada no puede, por diseño, devolver filas de otra base en la misma consulta. |
| Seguridad | La más fuerte de las opciones que comparten servidor. |
| Riesgo de filtración entre empresas | Muy bajo por construcción — el error posible es "me conecté a la base equivocada", no "mezclé filas dentro de la misma consulta". |
| Complejidad de implementación | Alta — cada organización necesita su propio grupo de conexiones a la base, y Postgres tiene un límite real de conexiones simultáneas por servidor; sin una capa de administración de conexiones (hoy inexistente en el proyecto), esto no escala bien. |
| Migraciones | Igual que la Alternativa 2 pero a nivel de base completa — una migración se corre una vez por cada base de datos. |
| Backups y restauración | La más simple y la más limpia de respaldar o restaurar de forma completamente independiente por organización. |
| Soporte | Aislamiento claro; la pregunta operativa nueva es cuántas bases de datos simultáneas puede sostener cómodamente un mismo servidor. |
| Costos | Similares a la Alternativa 2 mientras se comparta la misma instancia de servidor — la presión aparece en la gestión de conexiones, no en el costo de almacenamiento. |
| Onboarding | Más trabajo que las Alternativas 1 y 2 — provisionar una base nueva, aplicar migraciones, antes de que la organización pueda operar. |
| Escalabilidad a 10/50/200/1.000 | Razonable hasta un número moderado de organizaciones; el límite de conexiones por servidor se vuelve el techo real bastante antes de llegar a 1.000, salvo que se invierta en una capa de *pooling* de conexiones que hoy no existe. |
| Compatibilidad con Railway | Un servicio de Postgres puede alojar varias bases de datos lógicas — compatible, pero toda la gestión de conexiones por organización es trabajo de aplicación nuevo. |
| Impacto sobre el sistema actual | Alto — necesita gestión de conexiones dinámica que hoy no existe en absoluto. |
| Convertir la instalación actual en la primera organización | El más simple de las cuatro en este punto específico: la base de datos actual, tal cual está, pasa a ser la de la primera organización, sin ningún cambio. |

### Alternativa 4 — Una instalación separada completa por cliente (el modelo actual)

Cada organización tiene su propia base de datos, su propio backend, su propio frontend, desplegados y administrados de forma independiente — es, literalmente, lo que existe hoy.

| Criterio | Evaluación |
|---|---|
| Aislamiento de datos | Absoluto — no hay ningún componente en tiempo de ejecución compartido entre organizaciones. |
| Seguridad | Aislamiento perfecto por diseño, pero **multiplica la superficie de administración de secretos** — cada instalación tiene su propio `JWT_SECRET`, su propia base, y un arreglo de seguridad (como el fail-fast de `JWT_SECRET` ya diseñado en Bloque 6 y nunca implementado) tiene que aplicarse una vez por instalación, con el riesgo real de que alguna quede desactualizada sin que nadie lo note. |
| Riesgo de filtración entre empresas | El más bajo de las cuatro, por construcción — no existe ningún camino técnico para que ocurra. |
| Complejidad de implementación | La más baja de las cuatro **hoy**, porque no requiere ningún cambio — es exactamente lo que ya existe. |
| Migraciones | Cada instalación se migra de forma completamente independiente — y este proyecto ya vivió, en producción real, un incidente donde eso falló (Bloque 6.1: 5 migraciones sin aplicar en la única instalación existente). Multiplicar instalaciones multiplica las oportunidades de que ese mismo incidente se repita, una vez por cliente. |
| Backups y restauración | Simple por instalación, pero la política de backup tiene que verificarse una vez por cliente — y ni siquiera está verificada hoy para la única instalación existente (`DEUDA_TECNICA.md`, sección B). |
| Soporte | El más difícil de escalar de las cuatro — no hay ningún lugar único donde mirar el estado de todos los clientes a la vez. |
| Costos | Los más altos de las cuatro, por lejos — cada cliente nuevo implica infraestructura completa nueva, sin ningún costo compartido. |
| Onboarding | El más lento y manual de las cuatro — es, exactamente, la brecha ya señalada como el mayor obstáculo a la repetibilidad en `FASEIII_PRODUCTIZACION_SDC.md`. |
| Escalabilidad a 10/50/200/1.000 | Se sostiene, con esfuerzo creciente, hasta 10; exige automatizar el propio proceso de despliegue para sostenerse en 50; es difícil de justificar en 200 o 1.000 sin construir, en los hechos, una plataforma de orquestación de instalaciones — un proyecto de ingeniería más grande que cualquiera de las otras tres alternativas. |
| Compatibilidad con Railway | Perfectamente compatible — es la arquitectura ya desplegada — pero cada instalación nueva es un conjunto propio de servicios y variables de entorno a mantener sincronizados a mano. |
| Impacto sobre el sistema actual | Ninguno — es el estado actual. |
| Convertir la instalación actual en la primera organización | No aplica — ya lo es, literalmente, sin ningún cambio. Es la única "ventaja" de esta alternativa en este punto, y es trivial precisamente porque no resuelve nada del problema que motivó esta auditoría. |

---

## 3. Recomendación

**Alternativa 1 — base de datos compartida, con identificador de organización en cada entidad — con una condición no negociable: el filtrado por organización debe ser un mecanismo estructural y centralizado, nunca una responsabilidad manual de cada controlador.**

**Por qué, contra las otras tres:**

- Es la única alternativa completamente coherente con lo que `FASEIII_PLAN_MAESTRO_2026_2030.md` y `FASEIII_PRODUCTIZACION_SDC.md` ya establecieron como objetivo: que sumar una organización nueva deje de ser un evento de infraestructura y se convierta en una operación de datos — la condición misma de que SDC se convierta en un producto repetible.
- Es la que mejor escala hacia los 1.000 clientes de la visión a cinco años, sin exigir, desde ahora, una inversión en infraestructura de conexiones o de administración de *schemas* que hoy no existe ni se necesita todavía a esta escala.
- Es la de menor costo marginal por organización nueva — coherente con el modelo de ingresos ya definido, que necesita que el costo de servir a un cliente adicional sea bajo para que el negocio sea rentable a escala.
- Es compatible, sin ningún cambio, con la infraestructura de Railway ya desplegada y ya validada (Bloque 6).
- Convertir la instalación actual en la primera organización es, de las cuatro, una de las dos más simples — sin mover datos entre sistemas.

**Por qué no las otras tres, en una frase cada una:** la Alternativa 2 cambia el riesgo de "me olvidé de filtrar" por "necesito administrar un enrutamiento de conexiones que el proyecto no tiene" sin una ganancia de aislamiento suficiente para justificarlo a esta escala. La Alternativa 3 tiene el mejor aislamiento de las que comparten infraestructura, pero su techo real (límite de conexiones por servidor) aparece antes de llegar a la escala que la visión a cinco años se propone. La Alternativa 4 es la que ya existe, y es, precisamente, la causa raíz de casi todos los hallazgos de la auditoría de productización — elegirla de nuevo sería no resolver el problema que este sub-bloque existe para resolver.

**Alternativa 1 aprobada.** Las siete decisiones que la acotan y la vuelven ejecutable están incorporadas en la sección 4.

---

## 4. Definición conceptual del diseño recomendado

**Qué es una Organización.** La entidad que representa a la empresa cliente que opera su propia instalación lógica de SDC — la dueña de todos los datos operativos y financieros de su negocio (viajes, clientes propios, transportistas, facturas, liquidaciones, cobranzas, anticipos), separada de cualquier otra organización que use el mismo sistema físico.

**Cómo se relaciona un Usuario con una Organización.** Todo Usuario pertenece a una Organización — es una relación de pertenencia operativa, no de propiedad; un Usuario opera dentro de su Organización con el rol que ya existe hoy (`ADMINISTRADOR`, `GERENCIA`, etc.), pero ese rol pasa a tener alcance dentro de esa Organización, no sobre el sistema completo.

**¿Puede un usuario pertenecer a más de una organización? — DECISIÓN 1, APROBADA: no, en esta primera versión.** Un usuario, una organización. No se diseñan membresías múltiples en 8.1 ni en su plan de implementación. La posibilidad de operar en varias organizaciones queda diferida explícitamente para un futuro canal de partners o de soporte — no es una omisión, es una decisión de alcance tomada con conocimiento de esa necesidad futura.

**Cómo se determina la organización activa.** Si un usuario pertenece a una sola organización (recomendación anterior), la organización activa es, simplemente, la del usuario autenticado — no hace falta ningún selector en la interfaz. Si en el futuro se aprobara la pertenencia múltiple, ahí sí haría falta un mecanismo de selección, pero queda fuera del alcance de este diseño.

**Qué información pertenece a la organización.** En esta primera versión, prácticamente todo el modelo operativo actual: Cliente, Transportista, Chofer, Vehículo, Productor, Viaje, Factura, Liquidación, Cobranza, Anticipo/Gasto, el historial de estados de viaje, el registro de auditoría, y el propio Usuario.

**Qué información, si existiera, sería global — DECISIÓN 3, APROBADA: en esta primera versión multiempresa, ningún dato de negocio es global.** Clientes, transportistas, choferes, vehículos, cereales, ubicaciones, tipos de gasto, viajes, anticipos, liquidaciones, facturas, cobranzas, usuarios y configuración pertenecen todos a una organización — incluidos los tres catálogos "simples" (Cereal, Ubicación, TipoGasto), que ya hoy cada cliente carga a su propio criterio, sin un catálogo "correcto" único de referencia. Solo podrían permanecer globales, en el futuro, elementos puramente técnicos o de plataforma (si llegaran a ser necesarios) — nunca algo que forme parte del modelo de negocio del cliente. No se identifica, hoy, ningún elemento así.

**Cómo debe viajar el contexto de organización desde la autenticación hasta el acceso a datos.** El mismo mecanismo de sesión que ya existe hoy (un token emitido al iniciar sesión) debe llevar, además de lo que ya lleva, el identificador de la organización del usuario. A partir de ahí, cualquier operación que ese usuario realice durante esa sesión ya sabe a qué organización pertenece, sin tener que volver a consultarlo en cada paso.

**Cómo se evita depender de que cada controlador recuerde filtrar manualmente — DECISIÓN 6, APROBADA, el punto más importante de este diseño.** El aislamiento no puede depender de que cada controlador agregue manualmente el identificador de organización. El plan de implementación (`BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md`) debe proponer un mecanismo centralizado y verificable que:
- obtenga el identificador de organización desde la sesión ya autenticada;
- lo propague automáticamente a todo acceso a datos;
- impida que se ejecute cualquier consulta sin ese contexto presente;
- impida operaciones de creación, actualización o vinculación que referencien entidades de otra organización;
- cubra no solo listados, también la búsqueda de un registro puntual por su identificador, las relaciones entre entidades, las agregaciones y las transacciones;
- falle de forma segura (nunca exponga datos) ante un usuario sin organización asignada.

El diseño técnico exacto de ese mecanismo es tarea del plan de implementación — acá queda fijado como requisito no negociable, no como una opción entre varias.

**Comportamiento ante usuarios sin organización.** Un usuario sin organización asignada no debería poder operar sobre ningún dato — en el peor caso, debería poder autenticarse solo para llegar a una pantalla que indique que su cuenta está pendiente de asignación, nunca a datos reales.

**Usuario de soporte transversal entre organizaciones — DECISIÓN 2, APROBADA: no se crea todavía.** Ningún rol con acceso libre entre organizaciones se diseña en 8.1. Cuando exista, en un sub-bloque futuro, deberá operar mediante acceso explícito y temporal, selección consciente de la organización sobre la que se está actuando, auditoría obligatoria de cada acceso, y nunca por ausencia de filtro — es decir, nunca porque el mecanismo de aislamiento simplemente no se le aplicó. Queda completamente fuera de alcance de 8.1 y de su plan de implementación.

**Comportamiento ante datos históricos existentes.** No debería quedar, en ningún momento del proceso de migración, ninguna fila de ninguna tabla sin una organización asignada — la estrategia de migración (más abajo) está diseñada, precisamente, para que eso nunca sea un estado intermedio válido por más de un paso reversible.

**Estrategia conceptual de migración de la instalación actual — DECISIÓN 7, APROBADA.** Todos los datos existentes se asignan a una primera organización creada para la empresa actual. La migración debe: crear esa organización; asociar los usuarios ya existentes a ella; asociar todos los datos históricos de cada tabla afectada; agregar las restricciones de obligatoriedad (`NOT NULL`) solo después de completado el *backfill*, nunca antes; y poder verificarse por completo antes de activar el aislamiento estricto — es decir, tiene que existir un punto de control explícito entre "los datos ya están etiquetados" y "el sistema empieza a exigir y a filtrar por esa etiqueta", no un solo paso que haga las dos cosas a la vez. Es el mismo patrón aditivo ya usado en migraciones anteriores del proyecto (agregar antes de exigir, nunca al revés) — el diseño detallado de esa migración (nombres, tipos, orden exacto de tablas) se desarrolla en `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md`.

**Estrategia de rollback.** Cada uno de los tres movimientos de la migración es simétrico y de bajo riesgo — volver atrás en cualquier punto no pierde datos, porque ningún paso borra ni mueve información entre organizaciones, solo la etiqueta. El rollback más delicado no es el de los datos, es el del mecanismo de filtrado automático en sí: si ese mecanismo se implementara y se detectara un problema, debería poder desactivarse de forma independiente (volviendo, temporalmente, al comportamiento actual de una única organización implícita) sin necesidad de revertir ninguna migración de datos ya aplicada.

**Plan de pruebas de aislamiento.** Antes de aprobar cualquier diseño técnico posterior, debería validarse explícitamente: (a) que una organización nunca puede leer datos de otra a través de ningún punto de acceso existente, probado con al menos dos organizaciones de prueba con datos reales cargados en paralelo, no con una sola; (b) que un intento deliberado de acceder a un recurso específico de otra organización por su identificador directo es rechazado — no alcanza con que "no aparezca en un listado", tiene que rechazarse también el acceso directo; (c) que el mecanismo de filtrado automático se prueba una sola vez, de forma centralizada — es, precisamente, la ventaja de que sea sistemático: si está bien probado en su único punto de aplicación, no hace falta volver a probarlo tabla por tabla.

**Riesgos de seguridad.**
- El riesgo central de toda la Alternativa 1: un punto de acceso a datos que quede, por error, fuera del mecanismo de filtrado sistemático. Se mitiga con el requisito no negociable de la Decisión 6, no con disciplina individual.
- El token de sesión pasa a ser el único portador del contexto de organización — su integridad importa más que hoy, porque un token falsificado ya no solo suplantaría un rol, suplantaría además la organización completa.

**DECISIÓN 4, APROBADA — `JWT_SECRET` y `CORS_ORIGIN`.** Se incorpora, al mismo ciclo de trabajo de 8.1, el fail-fast de `JWT_SECRET` ya diseñado en Bloque 6 y nunca implementado: el motivo es exactamente el de arriba, un secreto inseguro o ausente deja de ser solo un riesgo de suplantación de rol y pasa a ser un riesgo de aislamiento entre empresas. Se incorpora también el fail-fast de `CORS_ORIGIN`, en la medida en que ya forma parte del mismo diseño pendiente de Bloque 6 y puede resolverse sin ampliar sustancialmente el alcance de este ciclo.

**DECISIÓN 5, APROBADA — alcance de `ADMINISTRADOR`.** `ADMINISTRADOR` deja de ser un rol global. En esta primera versión significa, exclusivamente, "administrador de su propia organización" — no puede leer ni operar datos de ninguna otra organización, sin excepción. No se diseña todavía ningún rol de `SUPERADMIN` con alcance sobre el sistema completo; si llegara a hacer falta, es un diseño propio y posterior, no una extensión implícita de `ADMINISTRADOR`.

---

## 5. Resumen de decisiones aprobadas

1. **Alternativa aprobada:** base de datos compartida con identificador de organización en cada entidad perteneciente al cliente (Alternativa 1), con aislamiento centralizado y obligatorio.

2. **Relación Usuario–Organización:** cada usuario pertenece a una sola organización en esta primera versión. Sin membresías múltiples — diferido para un futuro canal de partners o de soporte.

3. **Usuario de soporte transversal:** no se crea todavía. Cuando exista, deberá operar con acceso explícito y temporal, selección consciente de organización, auditoría obligatoria, nunca por ausencia de filtro. Fuera de alcance de 8.1.

4. **Datos globales:** ninguno en esta primera versión. Todo el modelo de negocio del cliente (clientes, transportistas, choferes, vehículos, cereales, ubicaciones, tipos de gasto, viajes, anticipos, liquidaciones, facturas, cobranzas, usuarios, configuración) pertenece a una organización. Solo elementos puramente técnicos o de plataforma podrían, en el futuro, permanecer globales.

5. **`JWT_SECRET`/`CORS_ORIGIN`:** se incorpora al mismo ciclo el fail-fast de `JWT_SECRET` ya diseñado en Bloque 6, porque el token pasa a transportar contexto de organización — un secreto inseguro deja de ser solo un riesgo de rol y pasa a ser un riesgo de aislamiento entre empresas. Se incorpora también `CORS_ORIGIN` fail-fast en la medida en que no amplíe sustancialmente el alcance.

6. **`ADMINISTRADOR`:** deja de ser global. Significa "administrador de su propia organización" — sin acceso a otras. No se diseña `SUPERADMIN` todavía.

7. **Mecanismo de aislamiento:** debe ser centralizado y verificable — nunca dependiente de que cada controlador agregue manualmente el identificador de organización. Cubre obtención desde la sesión, propagación automática, bloqueo de consultas sin contexto, bloqueo de `create`/`update`/`connect` cruzados entre organizaciones, `findUnique`, relaciones, agregaciones y transacciones, y falla segura ante usuario sin organización.

8. **Instalación actual:** todos los datos existentes se asignan a una primera organización creada para la empresa actual — crear la organización, asociar usuarios y datos históricos, `NOT NULL` solo después del *backfill*, con un punto de verificación explícito antes de activar el aislamiento estricto.

---

**Diseño aprobado. El desarrollo técnico de estas ocho decisiones — fases, migración, mecanismo de aislamiento, pruebas, rollback, criterios de aceptación — está en `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md`.**

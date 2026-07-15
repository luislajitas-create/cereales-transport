# Grupo Económico — Diseño Técnico (SDC v1.1)

Fecha: 2026-07-15. Diseño técnico — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push, no se implementó nada de frontend ni de backend.** Responde a las 5 decisiones ya aprobadas en `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md` y a las dos auditorías funcionales (Ronda 1, en esta conversación; Ronda 2, `AUDITORIA_FUNCIONAL_GRUPO_ECONOMICO_RONDA2.md`) — no reabre ninguna decisión ya tomada ahí. Sigue el formato ya usado en `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md`: como aquel diseño, este tampoco se auto-aprueba — queda a la espera de aprobación explícita antes de escribir una sola línea de código (`METODOLOGIA_SDC.md`, etapa 3).

**La pregunta que responde este documento, y solo esta:** ¿cómo se construye, con el menor cambio posible sobre lo ya certificado en `RELEASE_SDC_v1.0.md`/`CERTIFICACION_FINAL_SDC_v1.0.md`, la capacidad de pagar en un único pago real lo que dos organizaciones del mismo grupo económico le deben, por separado, a un mismo chofer?

---

## 1. Arquitectura general

### La relación Grupo Económico → Organizaciones

Se introduce **una entidad nueva, un nivel por encima de `Organizacion`**: el Grupo Económico. La relación es la misma que ya existe hoy entre `Organizacion` y sus 21 modelos organizacionales, un escalón más arriba: una `Organizacion` puede pertenecer, opcionalmente, a un Grupo Económico. Un Grupo Económico agrupa una o más organizaciones. Una organización sin grupo asignado sigue funcionando exactamente igual que hoy — pertenecer a un grupo es una condición adicional, nunca un requisito nuevo para operar.

### Qué información pertenece al grupo

Únicamente lo que las decisiones aprobadas confirmaron como compartido: la identidad real de un Chofer (Decisión 1 de la Ronda 2, y ver sección 2 de este documento para Transportistas/Vehículos), la autorización de qué usuarios pueden operar más de una organización del grupo (Decisión 3), y el Pago Consolidado en sí (nuevo concepto, sección 5). Nada más pasa a ser "del grupo".

### Qué permanece en cada organización

Todo lo demás, sin excepción: Clientes, Productores, Cereales, Ubicaciones, Tipos de gasto, Viajes, Facturas, Cobranzas, Liquidaciones, y el propio Usuario en su relación de pertenencia principal — exactamente como lo certificó `RELEASE_SDC_v1.0.md` para v1.0. Este diseño no toca ninguna de estas 18 tablas organizacionales que quedan fuera de la Decisión 1.

### Cómo se conserva el aislamiento de v1.0

El mecanismo que hoy garantiza el aislamiento (`organizacion-prisma.client.ts`, `organizacion-context.ts`, la lista `ORGANIZACIONAL_MODELS`) **no se modifica**. Sigue exigiendo, exactamente igual que hoy, que toda operación sobre cualquiera de los 21 modelos organizacionales tenga un `organizacionId` de contexto, sembrado una sola vez por request (`OrganizacionContextInterceptor`), y sigue rechazando con `UnauthorizedException` cualquier operación que no lo tenga. El Grupo Económico y sus entidades nuevas (sección 10) se diseñan **fuera** de esa lista, con el mismo criterio que ya usa `Organizacion` hoy — que tampoco es un modelo organizacional, y cuyo aislamiento (`organizacion.controller.ts`) es manual, por `where: { id: actor.organizacionId }`, no por la extensión de Prisma. El Grupo Económico hereda ese mismo patrón ya probado, un nivel más arriba.

### Cómo se habilita acceso transversal sin eliminar el contexto de organización activa

**Principio rector de todo este diseño, tal como lo pediste:** cada operación funcional sigue ejecutándose dentro de exactamente una organización activa — nunca "sin organización" y nunca "en varias a la vez dentro de la misma consulta". Lo que cambia es que un usuario autorizado puede, entre una operación y la siguiente, **cambiar** cuál es su organización activa (sección 3), y que existe una capa nueva y separada (el servicio de Grupo Económico, sección 12) autorizada a ejecutar una secuencia de operaciones — una por organización, cada una dentro de su propio contexto aislado normal — y combinar los resultados después, en memoria, nunca dentro de una misma consulta a la base. Nunca existe una consulta que traiga filas de más de una organización a la vez.

---

## 2. Alcance de recursos compartidos

**Confirmado, sin discusión:** Choferes compartidos a nivel de grupo (Decisión 1 de la Ronda 2).

**Revisión del código real para Transportistas y Vehículos**, tal como pediste antes de decidir:

- `Transportista` (`schema.prisma:236-256`) es dueño de `choferes: Chofer[]` y `vehiculos: Vehiculo[]` — es decir, hoy un `Chofer` **siempre** pertenece a un `Transportista` de la misma organización (`Chofer.transportistaId`, clave compuesta con `organizacionId`). Esto tiene una consecuencia estructural directa: si se comparte la identidad de un Chofer entre dos organizaciones (sección 10), pero el `Transportista` al que ese Chofer está atado en cada organización sigue siendo un registro distinto y sin vínculo, el sistema va a mostrar, correctamente, "el mismo chofer, con un transportista distinto en cada organización" — lo cual **puede ser exactamente la realidad** (un chofer que en la Empresa A figura bajo un transportista y en la Empresa B bajo otro, aunque sea la misma persona con el mismo camión) o puede ser una duplicación más que también haría falta resolver, dependiendo de cómo esté armada la operación real de ustedes hoy — algo que no pude confirmar contra el código, porque es un hecho de negocio, no algo que el código revele.
- `Vehiculo` sigue exactamente el mismo patrón que `Chofer` respecto de `Transportista` (`schema.prisma:284-306`).

**Decisión de implementación a recomendar — Opción A: solo Choferes en la primera entrega.**

Justificación: es el menor cambio capaz de resolver el caso real aprobado. Incluir Transportistas y Vehículos ahora significaría diseñar y migrar tres identidades compartidas en la primera entrega en vez de una, sin que las decisiones aprobadas hayan confirmado que el caso del transportista/vehículo es real para ustedes (la Ronda 2, sección 7, ya señaló esto como una pregunta sin cerrar). Si más adelante se confirma que un Transportista (no solo un chofer individual) también trabaja para ambas empresas del grupo, el mismo mecanismo de identidad compartida diseñado acá para Chofer (sección 10) se puede replicar para Transportista sin rediseñar nada de lo ya construido — es una extensión aditiva, no un cambio de arquitectura.

**Fuera de alcance, confirmado:** Clientes, Productores, Cereales, Ubicaciones, Tipos de gasto — ninguno de los cinco se toca en este diseño.

---

## 3. Usuarios y contexto activo

### Quiénes son los "tres usuarios administrativos actuales"

La Decisión 3 aprobó que "todo el equipo administrativo actual del grupo" opere ambas empresas — no un criterio automático (ver la salvedad explícita más abajo). Este diseño trata eso como una **lista explícita y nombrada de personas**, no como una regla ("todo `ADMINISTRADOR` ve todo"). Es una distinción obligatoria por una razón técnica concreta: `RolesGuard` (`roles.guard.ts:17`) ya hace pasar a cualquier `ADMINISTRADOR` a través de **cualquier** verificación de rol existente en el sistema (`if (user.rol === "ADMINISTRADOR") return true`, sin excepción) — si el acceso a Grupo Económico se apoyara en ese mismo mecanismo, cualquier `ADMINISTRADOR` de cualquier organización, presente o futura, tendría acceso de grupo automáticamente, sin que nadie lo haya autorizado a esa persona en particular. Por eso el acceso de grupo se diseña como un mecanismo **separado y explícito**, evaluado aparte de `RolesGuard`.

### Diseño del acceso

- **Usuario con acceso a una sola organización** (el caso general, sin cambios): sigue siendo, exactamente como hoy, el usuario autenticado cuya única organización es la de su token.
- **Usuario con acceso a varias organizaciones del grupo**: son las personas específicas a quienes se les otorgó, una por una, un permiso explícito para operar una organización adicional del mismo grupo — nunca un efecto automático de su rol.
- **Organización activa dentro de la sesión**: sigue siendo, igual que hoy, el `organizacionId` que viaja en el token — con una diferencia: para un usuario con acceso a varias organizaciones, ese valor puede cambiar durante el día, sin necesidad de un nuevo login completo (ver sección 11).
- **Selección consciente de organización**: cuando un usuario con acceso a más de una organización cambia de organización activa, es una acción explícita y visible (nunca automática ni implícita) — el sistema emite un token nuevo, con la organización elegida, y dicho cambio queda auditado.
- **Cambio de organización**: acción puntual, disponible únicamente para quien tiene autorización explícita para más de una organización del grupo — el resto de los usuarios ni siquiera ve la opción.
- **Permisos para acceder a la vista consolidada**: el mismo permiso explícito de arriba habilita, además, operar el Pago Consolidado (sección 5) — no se diseñan dos permisos separados para esto, porque serían, en la práctica, la misma autorización de fondo ("esta persona opera Grupo Económico").
- **Auditoría de cada cambio de contexto**: cada vez que un usuario cambia su organización activa, o crea/confirma/anula un Pago Consolidado, queda un `AuditLog` — reutilizando el mecanismo ya existente, sin necesidad de uno nuevo.
- **Comportamiento de usuarios comunes sin acceso transversal**: exactamente el de hoy, sin ningún cambio — un usuario sin autorización explícita de grupo nunca ve un selector de organización, nunca puede cambiar de organización, y su token nunca contiene más que la organización a la que pertenece.

### Cómo se evita que una consulta normal mezcle organizaciones

No cambia nada del mecanismo ya existente para las 21 tablas organizacionales: cada request sigue teniendo exactamente un `organizacionId` de contexto (el de la organización activa en ese momento), y `crearClienteOrganizacional` lo sigue aplicando exactamente igual que hoy. Cambiar de organización activa no "abre" el acceso a ambas a la vez — cierra el acceso a la anterior y abre el acceso a la nueva, una por vez, igual que si el usuario cerrara sesión y volviera a entrar con otra cuenta, salvo que no hace falta volver a escribir la contraseña.

**No se permite una sesión "sin organización activa"**, tal como pediste: `JwtStrategy.validate()` ya rechaza, hoy, cualquier token sin `organizacionId` (`jwt.strategy.ts:17-19`) — este diseño no cambia esa validación. Todo token, siempre, tiene una organización activa concreta.

---

## 4. Liquidaciones por organización

Sin cambios respecto de hoy, confirmado explícitamente: cada `Liquidacion` sigue perteneciendo a una sola organización, sigue incluyendo únicamente viajes de esa organización, sigue calculando su propio `totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar` de forma completamente independiente, y `LiquidacionesController.create()` sigue sin ninguna posibilidad de tomar un viaje de otra organización — la clave compuesta `[viajeId, organizacionId]` (`schema.prisma:502`) lo sigue impidiendo estructuralmente, exactamente igual que hoy.

**El cambio mínimo necesario para que el sistema reconozca que dos liquidaciones (de distintas organizaciones) pertenecen al mismo chofer compartido** no está en `Liquidacion` — está, exclusivamente, en que `Chofer` (una vez que dos filas, una por organización, se vinculan explícitamente a la misma identidad de grupo — sección 10) permite que el servicio de Grupo Económico, al armar un Pago Consolidado, busque "todas las liquidaciones cerradas cuyo chofer comparte esta identidad de grupo", consultando cada organización involucrada por separado (sección 1). `Liquidacion` en sí no necesita ningún campo nuevo para esto.

---

## 5. Pago consolidado

### Qué es, y qué no es

- **Liquidación**: lo que una organización, sola, le debe a un chofer por un período — existe hoy, sin cambios.
- **Pago consolidado**: el hecho de que una o más liquidaciones (de una o más organizaciones del mismo grupo, para el mismo chofer) se van a saldar juntas, con una sola transferencia real. Es un concepto nuevo, de nivel de grupo — no organizacional.
- **Transferencia real**: el movimiento bancario físico en sí — fuera de alcance de este diseño (sección 6 y sección 9 de la Ronda 2 ya establecieron que no se construye Tesorería todavía). El Pago Consolidado registra la **referencia** a esa transferencia (una fecha, un identificador), no la transferencia en sí como entidad financiera propia.

### Qué registra, como mínimo

Grupo económico al que pertenece; beneficiario (la identidad de grupo del chofer); las liquidaciones incluidas, con la organización responsable de cada una y su subtotal; el total consolidado; fecha; estado; una referencia/identificación del pago (dato libre, ingresado por quien lo ejecuta — no un número de transacción bancaria verificado, porque eso pertenece a Tesorería, fuera de alcance); quién lo creó; quién lo confirmó o anuló; el motivo, si fue anulado.

### Reglas de negocio, verificadas contra las decisiones aprobadas

- **Todas las liquidaciones incluidas corresponden al mismo beneficiario real** — se verifica por identidad de grupo del chofer (sección 10), nunca por nombre.
- **Todas pertenecen a organizaciones del mismo grupo** — se verifica contra la pertenencia de cada `Organizacion` a un `GrupoEconomico` (sección 10).
- **Una liquidación no puede estar en dos pagos consolidados activos** — mismo criterio que ya aplica hoy a `AnticipoGasto.liquidado` (sección 0 de la Ronda 2): una vez incluida en un Pago Consolidado no anulado, queda bloqueada para cualquier otro.
- **El total es la suma exacta de las liquidaciones incluidas** — sin ajustes, sin redondeos discrecionales; si el total no cuadra, es un error de datos, no algo que el usuario deba reconciliar a mano (mismo criterio que ya usa `construirPlanilla()` hoy para `saldoFinal`).
- **Sin compensación automática entre organizaciones** — Decisión 2, aprobada, sin excepción: el sistema nunca resta el saldo negativo de una liquidación del total positivo de otra.
- **Saldo negativo de una organización**: siguiendo la Decisión 2 (nunca automático) y la instrucción de este documento ("debe bloquear o requerir tratamiento explícito"), el diseño recomienda que una liquidación con `netoPagar` negativo **no bloquee** la creación del Pago Consolidado por sí sola (bloquearlo dejaría el caso real sin resolver la primera vez que ocurra), pero **sí requiera una confirmación explícita y separada** de quien arma el pago, mostrando ese saldo negativo de forma prominente antes de continuar — nunca compensado en silencio, nunca oculto, siempre con el propio negativo visible en el desglose del pago (Ronda 2, sección 2, recomendación sobre el comprobante).
- **Puede existir antes de estar pagado**: sí — estado inicial de borrador, previo a cualquier ejecución real.
- **Confirmar el pago actualiza coherentemente las liquidaciones agrupadas**: siguiendo el mismo patrón atómico que ya usa `LiquidacionesController.pagar()` hoy (una transacción que actualiza la liquidación y todos sus viajes juntos), extendido a varias organizaciones: el servicio de Grupo Económico recorre cada organización involucrada, dentro de su propio contexto aislado, y marca como pagada la liquidación correspondiente de esa organización — si cualquiera de esos pasos falla, ninguno queda aplicado (todo o nada, igual que hoy).
- **Anularlo conserva trazabilidad y revierte estados sin borrar historial**: mismo criterio que `LiquidacionesController.anular()` ya aplica hoy — nunca se borra el Pago Consolidado, se marca como anulado, con motivo obligatorio, y cada liquidación agrupada vuelve a su estado previo dentro de su propia organización.

---

## 6. Anticipos y saldos negativos

Regla mínima, ya aprobada (Decisión 2) y verificada contra el código (`AnticipoGasto` en `schema.prisma:424-454`, `liquidaciones.controller.ts` método `recomputeTotales`):

- Cada anticipo sigue perteneciendo a una organización — sin cambios en `AnticipoGasto` ni en cómo se descuenta.
- Se descuenta únicamente dentro de la liquidación de esa organización — sin cambios en `recomputeTotales()`.
- Nunca se cruza automáticamente contra otra organización — reafirmado por la Decisión 2 y por la regla de "sin compensación automática" de la sección 5.
- Si una liquidación queda con `netoPagar` negativo, el Pago Consolidado no lo oculta — queda visible en el desglose por organización (sección 5).
- Cualquier compensación manual (si alguna vez se decide hacerla) queda fuera de este diseño — no se construye ningún mecanismo para eso, ni siquiera opcional; si el negocio decide compensar un saldo negativo contra otra deuda, hoy tendría que hacerlo por fuera del sistema, dejando constancia por su cuenta.

**No se diseña cuenta corriente intercompany**, tal como se pidió explícitamente — no hay, en este documento, ninguna entidad que registre "cuánto le debe la Empresa A a la Empresa B".

---

## 7. Beneficiario

### El contrato actual, verificado contra el código

- `Liquidacion.tipo` es `TRANSPORTISTA` o `CHOFER` (`schema.prisma:460`) — son dos circuitos ya separados y completos hoy.
- En el circuito `CHOFER`, el beneficiario ya es, hoy, la persona física — `Liquidacion.choferId`.
- En el circuito `TRANSPORTISTA`, el beneficiario ya es, hoy, la empresa de transporte — `Liquidacion.transportistaId`.
- No existe hoy ningún campo que distinga "quién generó la deuda" de "a quién se le transfiere" (Ronda 2, sección 5) — el beneficiario y el sujeto de la liquidación son, siempre, la misma entidad.

### Qué entra en esta primera versión

**Solo el circuito `CHOFER`.** Es el único con un caso real confirmado y aprobado (Decisión 1 de la Ronda 2, y la Decisión 2 de implementación de este documento, sección 2). El Pago Consolidado, tal como se diseña en la sección 5, opera exclusivamente sobre liquidaciones de tipo `CHOFER`, agrupadas por la identidad de grupo del chofer.

**Cuándo se consolidaría por Transportista**: el mismo mecanismo (identidad de grupo, sección 10) sería aplicable a `Transportista` el día que se confirme un caso real análogo — una empresa de transporte, no una persona, que trabaja para ambas organizaciones del grupo. No se construye ahora, siguiendo la misma lógica de "menor cambio" de la sección 2: no hay evidencia funcional aprobada de que este caso exista hoy.

**No se amplía el alcance sin esa evidencia**, tal como se pidió explícitamente.

---

## 8. Aislamiento y seguridad

Punto no negociable, tratado con el mismo rigor que `BLOQUE8.1_DISENO_MULTIEMPRESA.md` (Decisión 6 de ese diseño) exigió para el mecanismo original.

- **Aislamiento por organización**: sin cambios — `crearClienteOrganizacional` (`organizacion-prisma.client.ts`) sigue exactamente igual, sigue aplicándose a las mismas 21 tablas, con la misma lógica.
- **Contexto activo**: sigue viviendo exclusivamente en `organizacionContextStorage` (`AsyncLocalStorage`), sembrado una sola vez por request por `OrganizacionContextInterceptor` — sin cambios en ese archivo.
- **Filtrado centralizado**: se mantiene como la única fuente de aislamiento para las 21 tablas existentes. Las entidades nuevas de Grupo Económico (sección 10) no se agregan a `ORGANIZACIONAL_MODELS` — no son organizacionales, son de grupo, y se filtran manualmente por `grupoEconomicoId`, con el mismo patrón ya usado por `OrganizacionController` para `Organizacion` (`where: { id: actor.organizacionId }`, sin extensión de Prisma).
- **Imposibilidad de mezclar datos en módulos normales**: ningún módulo existente (Viajes, Facturas, Liquidaciones, Catálogos, etc.) se modifica — siguen operando, sin ningún cambio, exclusivamente contra la organización activa del contexto.
- **Autorización explícita para operaciones de grupo**: un guard nuevo y separado (`GrupoEconomicoGuard`, o equivalente — nombre a definir en implementación) verifica, para cada operación de grupo, que exista un permiso explícito otorgado a ese usuario para esa organización adicional — nunca se apoya en `RolesGuard` ni en el rol `ADMINISTRADOR` por sí solo (ver sección 3, por qué).
- **Auditoría obligatoria**: cada cambio de organización activa, y cada creación/confirmación/anulación de Pago Consolidado, genera un `AuditLog` — sin excepciones.
- **Protección ante manipulación de `organizacionId`/`grupoId` desde el cliente**: exactamente la misma que ya existe hoy para `organizacionId` — el valor nunca se toma de lo que envía el cliente en el cuerpo de una petición; sale siempre del token ya validado (`request.user`, poblado por `JwtStrategy`) o, para el cambio de organización activa, de una verificación server-side contra el permiso explícito otorgado, nunca de un parámetro que el cliente pueda editar.

### Cómo las operaciones consolidadas consultan varias organizaciones sin debilitar `ORGANIZACION_PRISMA`

Este es el punto de diseño más delicado de todo el documento, y la razón por la que se lo trata aparte: **ninguna consulta individual cruza organizaciones.** El servicio de Grupo Económico, para armar o ejecutar un Pago Consolidado, ejecuta una **secuencia** de operaciones — una por cada organización involucrada, cada una abriendo explícitamente el contexto de aislamiento de esa organización puntual (el mismo mecanismo de `organizacionContextStorage.run(...)` que hoy usa `OrganizacionContextInterceptor` para cada request, pero invocado explícitamente por el servicio de grupo, una vez por organización, en vez de una vez por request) — y combina los resultados **después**, en memoria, del lado de la aplicación, nunca dentro de una consulta a la base de datos. Es exactamente el mismo patrón que ya usa el Centro de Inteligencia hoy para calcular sobre una sola organización (nunca hace `$queryRaw` ni bypassa el cliente scopeado) — extendido a ejecutarse N veces, una por organización, en vez de una sola vez.

**No se debilita `ORGANIZACION_PRISMA` para permitir acceso general transversal**, y **no se resuelve quitando filtros ni creando bypasses directos** — ambas instrucciones se cumplen exactamente así: el cliente scopeado (`OrganizacionPrismaClient`) sigue siendo el único punto de acceso a las 21 tablas organizacionales, sin ninguna excepción, sin ningún modo "sin filtro", ni siquiera para el servicio de Grupo Económico.

---

## 9. Centro de Inteligencia

No se modifica la semántica actual por organización — `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` sigue rigiendo exactamente igual, sin ninguna excepción para el Motor existente.

**Para la primera entrega, se recomienda: queda totalmente fuera de alcance.**

Justificación: ninguna de las cinco decisiones aprobadas incluye una vista consolidada del Centro de Inteligencia — el objetivo aprobado es, explícitamente, resolver el pago consolidado. La Ronda 1 ya identificó que una vista de grupo (rentabilidad, alertas, etc.) es una capacidad analítica nueva, no una consecuencia automática de compartir la identidad del chofer — construirla ahora sería más alcance del que el caso real exige. Un resumen mínimo relacionado con pagos consolidados (por ejemplo, "cuánto se pagó en total al grupo este mes") tampoco se incluye en la primera entrega: el propio Pago Consolidado (sección 12, endpoint de consulta) ya permite ver esa información directamente, sin necesitar que el Motor de Inteligencia la recalcule.

---

## 10. Modelo de datos propuesto

Se muestran los modelos, relaciones, restricciones e índices — sin escribirlos como código ni como migración, tal como se pidió.

### Entidades nuevas

**`GrupoEconomico`** — nivel de grupo, no organizacional (mismo tratamiento que `Organizacion`, fuera de `ORGANIZACIONAL_MODELS`).
- Campos: identificador propio, nombre, fecha de creación.
- Relación: una a muchas con `Organizacion` (una organización pertenece, como máximo, a un grupo).

**`Organizacion` (modificada)** — se le agrega una referencia opcional y nula por defecto a `GrupoEconomico`. Una organización sin este valor sigue funcionando exactamente igual que hoy, sin ningún cambio de comportamiento.

**`IdentidadChoferGrupo`** — nivel de grupo, no organizacional. Representa a la persona real, compartida entre organizaciones del mismo grupo.
- Campos: identificador propio, referencia al grupo económico al que pertenece, un nombre de referencia (para mostrarla en pantallas de grupo sin tener que ir a buscar el nombre en cada organización), fecha de creación, quién la creó/vinculó.
- Relación: una a muchas con `Chofer` (un `Chofer`, de una organización puntual, puede vincularse — opcionalmente, nunca por defecto — a una `IdentidadChoferGrupo`).

**`Chofer` (modificada)** — se le agrega una referencia opcional y nula por defecto a `IdentidadChoferGrupo`. Un `Chofer` sin este valor sigue siendo, exactamente como hoy, una identidad exclusiva de su organización, sin ningún cambio de comportamiento. **Se mantiene, sin ningún cambio, dentro de `ORGANIZACIONAL_MODELS`** — sigue siendo un modelo organizacional, sigue exigiendo `organizacionId`, sigue con todas sus claves compuestas actuales intactas. El vínculo a la identidad de grupo es un dato adicional, no un reemplazo de su pertenencia a la organización.

**`AccesoGrupoEconomico`** — nivel de grupo, no organizacional. El permiso explícito de la sección 3.
- Campos: identificador propio, referencia al usuario, referencia a la organización adicional que ese usuario queda autorizado a operar (más allá de la suya propia), quién otorgó el permiso, fecha de otorgamiento.
- Restricción: no puede existir más de un permiso activo para el mismo par usuario/organización.
- Nota de diseño: el `Usuario.organizacionId` actual (su organización de pertenencia principal) **no cambia** — este permiso es siempre adicional, nunca un reemplazo.

**`PagoConsolidado`** — nivel de grupo, no organizacional.
- Campos: identificador propio, referencia al grupo económico, referencia a la identidad de chofer beneficiaria, fecha, estado (borrador / confirmado-pendiente-de-pago / pagado / anulado — nombres funcionales, a definir en implementación), total consolidado, referencia de pago (texto libre), quién lo creó, quién lo confirmó/pagó, quién lo anuló y por qué motivo.

**`PagoConsolidadoLiquidacion`** — nivel de grupo, no organizacional (une entidades de distintas organizaciones, por lo que no puede ser ella misma organizacional).
- Campos: identificador propio, referencia al Pago Consolidado, referencia a la organización dueña de esa liquidación (dato explícito, no inferido), referencia a la liquidación puntual dentro de esa organización, el subtotal de esa liquidación al momento de incluirla (una copia del `netoPagar` de ese momento, para que el total del pago no cambie retroactivamente si algo de la liquidación se recalculara después — mismo criterio de integridad que ya usa `LiquidacionViaje` al copiar `subtotal`/`comisionMonto` en el momento de crear la liquidación, en vez de recalcularlos siempre desde el viaje).
- Restricción: una liquidación (identificada por organización + id) no puede aparecer en más de una fila de esta tabla mientras el Pago Consolidado que la contiene no esté anulado.

### Relaciones, en resumen

```
GrupoEconomico  1 ── N  Organizacion (opcional)
GrupoEconomico  1 ── N  IdentidadChoferGrupo
GrupoEconomico  1 ── N  PagoConsolidado
IdentidadChoferGrupo  1 ── N  Chofer (opcional, uno por organización como máximo)
IdentidadChoferGrupo  1 ── N  PagoConsolidado (como beneficiario)
Usuario  1 ── N  AccesoGrupoEconomico (además de su organización principal)
PagoConsolidado  1 ── N  PagoConsolidadoLiquidacion
PagoConsolidadoLiquidacion  N ── 1  Liquidacion (de una organización específica)
```

### Nulabilidad y reglas de borrado

- `Organizacion.grupoEconomicoId`: opcional. Si se elimina un `GrupoEconomico` (caso raro, no contemplado como flujo normal), las organizaciones no deberían eliminarse ni quedar huérfanas de forma destructiva — la relación se diseña para impedir el borrado del grupo mientras tenga organizaciones asociadas, siguiendo el mismo criterio restrictivo que ya usa `Organizacion` con sus propias relaciones (`onDelete: Restrict` en todos los modelos organizacionales).
- `Chofer.identidadChoferGrupoId`: opcional. Desvincular un chofer de su identidad de grupo no debería borrar la identidad de grupo en sí, ni afectar ningún Pago Consolidado ya existente que la haya usado como beneficiario.
- `PagoConsolidadoLiquidacion`: no debería poder borrarse individualmente una vez creada — se anula el Pago Consolidado completo (sección 5), nunca se quita una liquidación suelta de un pago ya armado sin dejar rastro.

### Auditoría

Se reutiliza `AuditLog` tal como existe hoy, sin ningún cambio a su estructura — con nuevos valores de `entidad` (`"PagoConsolidado"`, `"AccesoGrupoEconomico"`, `"Chofer"` con una acción `identidad_grupo_vinculada`) y `accion`, siguiendo exactamente el mismo patrón que ya usan `organizacion_editada` o `comisionPct_override` hoy. `AuditLog` en sí sigue siendo organizacional (sigue exigiendo `organizacionId`) — cada evento de auditoría de una operación de grupo se registra tantas veces como organizaciones involucre (una entrada por organización, con el mismo criterio de "una operación por organización" de la sección 8), no como un evento único a nivel de grupo sin organización.

### Distinción de cambios

| Cambio | Clasificación |
|---|---|
| `GrupoEconomico`, `Organizacion.grupoEconomicoId` | **Indispensable** |
| `IdentidadChoferGrupo`, `Chofer.identidadChoferGrupoId` | **Indispensable** |
| `AccesoGrupoEconomico` | **Indispensable** |
| `PagoConsolidado`, `PagoConsolidadoLiquidacion` | **Indispensable** |
| Identidad de grupo equivalente para `Transportista`/`Vehiculo` | **Futuro** — condicionado a la Decisión de la sección 2 si se revisa más adelante |
| Cualquier entidad de cuenta corriente intercompany | **Futuro** — explícitamente fuera de alcance (sección 6) |
| Comprobante consolidado (contenido/formato) | **Futuro** — aprobado explícitamente para después (Decisión 5) |
| Vista consolidada del Centro de Inteligencia | **Futuro** — fuera de alcance (sección 9) |

### Estrategia para datos existentes y para la organización certificada en v1.0

Ningún dato existente se modifica por el solo hecho de que este diseño se implemente. `Organizacion.grupoEconomicoId` nace nulo para todas las organizaciones ya existentes — nada cambia de comportamiento hasta que alguien, explícitamente, cree un `GrupoEconomico` y asocie organizaciones a él. Ningún `Chofer` existente queda vinculado a ninguna `IdentidadChoferGrupo` de forma automática — cada vínculo se crea uno por uno, a mano (sección 14). El tag `v1.0.0` y el commit que certifica queda exactamente donde está — este diseño se construye por encima, sin alterar nada de lo ya congelado.

---

## 11. JWT, sesión y contexto

### Qué contiene el JWT

**Recomendación: el JWT no cambia de forma — sigue teniendo exactamente los mismos cinco campos que hoy** (`sub`, `email`, `rol`, `nombre`, `organizacionId`), y `organizacionId` sigue representando, siempre, la organización activa de esa sesión puntual — nunca una lista.

**No se incorpora al token ni el grupo económico, ni la lista de organizaciones permitidas.** Esa información se consulta server-side, contra `AccesoGrupoEconomico`, en el momento en que hace falta (por ejemplo, al mostrar el selector de organización) — no viaja en el token.

### Cómo se cambia de organización activa sin un nuevo login completo

Se agrega un endpoint dedicado (sección 12) que: recibe la organización a la que el usuario quiere cambiar; verifica, contra `AccesoGrupoEconomico`, que ese usuario esté autorizado para esa organización (o que sea su propia organización de pertenencia, para volver); si está autorizado, emite un token nuevo, con la misma vigencia de 12 horas que ya usa `auth.service.ts:29`, con `organizacionId` apuntando a la organización elegida; registra el cambio en `AuditLog`. El usuario sigue autenticado con la misma contraseña — no hace falta volver a ingresarla, porque la identidad de la persona no cambió, solo su organización activa.

### Evaluación de riesgos, uno por uno

- **Tamaño y vigencia de los permisos**: el token sigue siendo del mismo tamaño de siempre (cinco campos), porque los permisos de grupo no viajan en él — se consultan en el momento. Sin impacto.
- **Cambio de organización sin login**: cubierto arriba — es un endpoint autenticado que reemplaza el token, no un login nuevo.
- **Riesgo de tokens antiguos**: si a un usuario se le revoca el acceso a una organización adicional mientras todavía tiene un token activo con esa organización como activa, ese token sigue siendo válido hasta su expiración natural (máximo 12 horas) — es exactamente el mismo riesgo, y el mismo límite de tiempo, que ya acepta hoy `RELEASE_SDC_v1.0.md` (sección 13, riesgo aceptado: "una sesión iniciada no se cierra automáticamente si el usuario cambia su contraseña... el riesgo queda acotado a un máximo de 12 horas"). Se recomienda aceptar el mismo riesgo, con el mismo límite, en vez de construir un mecanismo de invalidación inmediata que hoy tampoco existe para ningún otro cambio de permisos.
- **Invalidación**: no se diseña invalidación inmediata de tokens — no existe hoy para ningún otro caso (desactivar un usuario tampoco invalida su token actual), y agregarla solo para este caso sería inconsistente con el resto del sistema y mayor alcance del necesario.
- **Seguridad**: el endpoint de cambio de organización nunca acepta la organización destino como un dato que se toma "tal cual" del cliente sin verificar — siempre se valida contra `AccesoGrupoEconomico` en el servidor antes de emitir el nuevo token (mismo principio de la sección 8).
- **Compatibilidad con el modelo stateless vigente**: total — el mecanismo sigue sin consultar la base en cada request para validar la sesión (`RELEASE_SDC_v1.0.md`, sección 7), porque el nuevo token, una vez emitido, se valida exactamente igual que cualquier otro token de hoy, sin ninguna consulta adicional por request.

---

## 12. Backend

### Módulos y responsabilidades

- **Gestión del grupo**: alta de un `GrupoEconomico`, asociación de organizaciones existentes a un grupo. Operación de bajísima frecuencia — no necesita una interfaz sofisticada.
- **Identidad compartida de chofer**: vincular un `Chofer` de una organización con un `Chofer` de otra organización del mismo grupo, creando o reutilizando una `IdentidadChoferGrupo`; consultar qué choferes ya están vinculados.
- **Membresías/autorizaciones** (`AccesoGrupoEconomico`): otorgar y revocar el acceso de un usuario a una organización adicional del mismo grupo.
- **Selección de organización activa**: el endpoint de cambio de organización de la sección 11.
- **Liquidaciones por empresa**: sin cambios — sigue siendo, exactamente, `LiquidacionesController` tal como existe hoy.
- **Pagos consolidados**: alta, consulta, confirmación y anulación del `PagoConsolidado`, incluyendo la búsqueda de "liquidaciones elegibles" (cerradas, no incluidas en otro pago activo, del mismo beneficiario, de organizaciones del mismo grupo).
- **Auditoría**: sin un módulo nuevo — se reutiliza `AuditLog` como ya se usa hoy, con las entradas nuevas descriptas en la sección 10.

### Endpoints propuestos y contrato funcional de alto nivel

*(Rutas orientativas, sin código — el nombrado final se ajusta en implementación.)*

| Endpoint (orientativo) | Qué hace | Quién puede usarlo |
|---|---|---|
| `POST /grupos-economicos` | Crea un grupo económico y, opcionalmente, asocia organizaciones existentes | Operación administrativa de plataforma — fuera del uso diario de cualquier organización, análoga a cómo hoy se crea una organización nueva (acceso directo, sin flujo de autoservicio, ver `RELEASE_SDC_v1.0.md` sección 4) |
| `GET /grupos-economicos/:id` | Consulta un grupo: sus organizaciones, sus identidades de chofer vinculadas | Usuario con `AccesoGrupoEconomico` en alguna organización de ese grupo |
| `POST /grupos-economicos/:id/choferes/vincular` | Vincula un `Chofer` de una organización con un `Chofer` de otra (crea o reutiliza una `IdentidadChoferGrupo`) | Usuario con `AccesoGrupoEconomico`, acción explícita, nunca automática (sección 14) |
| `GET /grupos-economicos/:id/choferes` | Lista las identidades de chofer del grupo, con el detalle de a qué `Chofer` de cada organización corresponden | Usuario con `AccesoGrupoEconomico` |
| `POST /grupos-economicos/:id/accesos` | Otorga a un usuario acceso a una organización adicional del grupo | `ADMINISTRADOR` de la organización que otorga el acceso, exclusivamente (no cualquier usuario con acceso de grupo puede otorgar más accesos) |
| `DELETE /grupos-economicos/:id/accesos/:accesoId` | Revoca un acceso ya otorgado | Mismo criterio que el alta |
| `POST /auth/cambiar-organizacion` | Cambia la organización activa de la sesión y reemite el token | Cualquier usuario con `AccesoGrupoEconomico` para la organización destino (o su propia organización de pertenencia, para volver) |
| `GET /grupos-economicos/:id/pagos-consolidados/candidatos` | Lista liquidaciones elegibles para un beneficiario dado, a través de las organizaciones del grupo | Usuario con `AccesoGrupoEconomico` |
| `POST /grupos-economicos/:id/pagos-consolidados` | Crea un Pago Consolidado en borrador, con las liquidaciones elegidas | Usuario con `AccesoGrupoEconomico` |
| `GET /grupos-economicos/:id/pagos-consolidados` / `/:pagoId` | Consulta pagos consolidados existentes | Usuario con `AccesoGrupoEconomico` |
| `POST /grupos-economicos/:id/pagos-consolidados/:pagoId/confirmar` | Marca el pago como pagado; actualiza cada liquidación agrupada en su propia organización | Usuario con `AccesoGrupoEconomico` |
| `POST /grupos-economicos/:id/pagos-consolidados/:pagoId/anular` | Anula el pago, con motivo obligatorio; revierte las liquidaciones agrupadas | Usuario con `AccesoGrupoEconomico` |

No se escribe código de ninguno de estos endpoints — es, únicamente, el contrato funcional que la implementación futura deberá cumplir.

---

## 13. Frontend

Pantallas mínimas, sin rediseñar nada de lo ya existente:

- **Selector de organización activa**: un control nuevo y chico, visible únicamente para quien tiene `AccesoGrupoEconomico` — en el mismo lugar donde hoy vive el nombre de la organización/usuario en `Layout.tsx` (el pie de la barra lateral). Para el resto de los usuarios, no aparece nada nuevo.
- **Administración básica del Grupo Económico**: una pantalla simple para ver el grupo, sus organizaciones, y sus choferes vinculados — reutilizando el mismo patrón visual ya usado en `Organizacion.tsx`/`Usuarios.tsx` (tarjetas, tablas, formularios simples), sin ningún componente nuevo.
- **Acceso de usuarios al grupo**: una pantalla para otorgar/revocar `AccesoGrupoEconomico`, con el mismo patrón visual que ya usa `Usuarios.tsx` para dar de alta o desactivar usuarios.
- **Selección de liquidaciones elegibles**: reutiliza el mismo patrón que ya existe hoy en `Liquidaciones.tsx` para elegir viajes/anticipos candidatos (checkboxes sobre una tabla, con un total que se recalcula al marcar/desmarcar) — aplicado ahora a liquidaciones ya cerradas, de más de una organización, en vez de a viajes.
- **Creación y confirmación del pago consolidado**: mismo patrón de `Liquidaciones.tsx` (armar → confirmar → pagar), con el desglose por organización siempre visible, incluyendo cualquier saldo negativo sin ocultarlo (sección 5).
- **Consulta de pagos consolidados**: un listado simple, mismo patrón que el listado de liquidaciones o facturas ya existente.

**No se diseña el comprobante consolidado** (aprobado explícitamente para después). **No se rediseña ninguna pantalla existente** — `Liquidaciones.tsx`, `Usuarios.tsx`, `Organizacion.tsx` y el resto siguen exactamente iguales; lo nuevo se agrega al lado, no encima.

---

## 14. Migración y compatibilidad

Secuencia seguida, en el mismo espíritu aditivo que ya usó Bloque 8.1 para la migración original (agregar antes de exigir, nunca al revés, con un punto de control explícito entre cada paso):

1. **Creación del grupo inicial**: se crea un `GrupoEconomico` nuevo, vacío, sin ningún efecto sobre el sistema en producción hasta el paso siguiente.
2. **Asociación de organizaciones existentes**: las dos organizaciones reales del grupo económico de ustedes se asocian a ese `GrupoEconomico` (`Organizacion.grupoEconomicoId`). Sin ningún efecto de comportamiento todavía — ninguna pantalla nueva se activa por este paso solo.
3. **Migración de choferes duplicados / resolución de duplicados reales**: **nunca automática por nombre**, tal como se exige explícitamente. Se revisa, a mano, cada caso de un chofer que hoy existe duplicado (una fila por organización) y que se sabe, con certeza operativa, que es la misma persona real — y recién ahí se crea la `IdentidadChoferGrupo` correspondiente y se vincula cada `Chofer` a ella, uno por uno. Un nombre igual, o parecido, nunca es criterio suficiente por sí solo — el criterio confiable es la confirmación explícita de una persona con conocimiento real de la operación (ver más abajo).
4. **Preservación de viajes y liquidaciones existentes**: ninguno se toca — todos siguen perteneciendo exactamente a la organización y al `Chofer` (de esa organización) que ya tenían antes de este proceso.
5. **Activación gradual del acceso multiempresa**: se otorga `AccesoGrupoEconomico` a las personas específicas ya identificadas (Decisión 3), una por una, verificando después de cada alta que el selector de organización y el cambio de contexto funcionan correctamente para esa persona antes de dar el siguiente permiso.
6. **Compatibilidad temporal**: durante todo este proceso, y después, cualquier organización sin grupo asignado, y cualquier chofer sin identidad de grupo vinculada, sigue funcionando exactamente igual que en v1.0 — no existe ningún estado intermedio en el que algo deje de funcionar como antes.

### Criterios confiables de identidad y revisión manual (paso 3)

- Coincidencia de un dato identificador fuerte de la persona real (DNI, si está cargado en ambas fichas) — necesaria pero no suficiente por sí sola, porque un DNI mal tipeado en una de las dos organizaciones no debería llevar a fusionar dos personas distintas por error, ni la ausencia de DNI en una ficha debería impedir vincular a alguien que sí lo es.
- Confirmación explícita de una persona con conocimiento operativo real (quien administra la organización, o quien conoce personalmente a los choferes) — es, en los hechos, el criterio que realmente decide, no un cálculo del sistema.
- El vínculo queda registrado con quién lo hizo y cuándo (`AuditLog`, sección 10) — para que, si se comprueba después que dos choferes se vincularon por error, se pueda revertir sabiendo exactamente qué se hizo y por qué.

### Rollback

Cada paso es reversible sin pérdida de datos, por el mismo motivo que ya vale para la migración original de Bloque 8.1: ningún paso mueve ni borra datos entre organizaciones, solo agrega una referencia opcional. Desasociar una organización de su grupo, desvincular un `Chofer` de su identidad de grupo, o revocar un `AccesoGrupoEconomico`, en cualquier momento, deja al sistema exactamente en el estado anterior a ese vínculo — ningún viaje, factura, liquidación o pago consolidado ya ejecutado se ve afectado por deshacer un vínculo posterior.

---

## 15. Pruebas obligatorias

- Dos organizaciones del mismo grupo, con datos reales cargados en paralelo.
- Una organización ajena al grupo, para confirmar que nunca aparece en ninguna operación de grupo.
- Usuario con acceso a una sola organización — confirmar que no ve ningún elemento de Grupo Económico.
- Los usuarios administrativos con `AccesoGrupoEconomico` — confirmar que ven y pueden operar exactamente las organizaciones autorizadas, ni una más.
- Cambio consciente de organización — confirmar que emite un token nuevo, correcto, y que queda auditado.
- Aislamiento normal intacto — repetir, sin ningún cambio de resultado esperado, las pruebas de aislamiento ya documentadas en `ACTA_CIERRE_BLOQUE8.md` (Fase F): dos organizaciones con datos de negocio idénticos (mismo CUIT, mismo nombre) sin ninguna mezcla.
- Mismo chofer vinculado en ambas organizaciones — confirmar que el vínculo funciona y que cada `Chofer` sigue siendo, por lo demás, independiente (comisión, licencia, estado, todo propio de su organización).
- Liquidaciones independientes — cada una calcula su propio neto sin ninguna influencia de la otra organización.
- Pago consolidado único — que agrupe correctamente liquidaciones de ambas organizaciones, con el total exacto.
- Saldo negativo sin compensación automática — confirmar que el pago consolidado lo muestra, sin descontarlo de la otra organización.
- Liquidación ya utilizada en un pago consolidado — confirmar que no puede incluirse en un segundo pago mientras el primero no esté anulado.
- Beneficiarios distintos — confirmar que un pago consolidado nunca mezcla liquidaciones de dos choferes distintos, aunque sean de organizaciones del mismo grupo.
- Organizaciones de grupos económicos distintos — confirmar que nunca se puede armar un pago consolidado que cruce dos grupos distintos.
- Anulación de un pago consolidado — confirmar que revierte cada liquidación en su propia organización, y que queda trazado el motivo.
- Auditoría — confirmar que cada cambio de contexto y cada operación de grupo deja su `AuditLog` correspondiente, en la organización que corresponde.
- Regresión completa de v1.0 — todos los flujos financieros críticos ya validados (liquidar→confirmar→pagar→anular; facturar→cobrar→anular→refacturar) siguen funcionando exactamente igual para una organización sin grupo asignado.
- Prueba de fuga cruzada ampliada — además de las pruebas de aislamiento ya existentes, confirmar específicamente que un usuario **sin** `AccesoGrupoEconomico` no puede, ni por el menú ni por acceso directo a un endpoint de grupo, leer ni operar sobre ninguna organización que no sea la suya — mismo criterio que ya se aplicó en Bloque 9 para `GET /usuarios` (Ronda de Frontend Administrativo, hallazgo del Grupo 4: la pantalla se oculta y, además, ni siquiera se consulta el backend para un rol no autorizado).

---

## 16. Plan de implementación

Sub-etapas pequeñas y desplegables, sin ninguna migración "big bang", con dependencias explícitas:

| Etapa | Objetivo | Áreas afectadas | Migraciones | Riesgos | Pruebas | Criterio de cierre | Rollback |
|---|---|---|---|---|---|---|---|
| **A** | Modelo base de grupo: `GrupoEconomico`, `Organizacion.grupoEconomicoId` | Backend, schema | Sí, aditiva (columna opcional) | Mínimo — nada cambia de comportamiento hasta asociar una organización | Crear un grupo, asociar y desasociar una organización, confirmar cero efecto sobre el resto del sistema | Existe un grupo con dos organizaciones asociadas, sin ningún cambio visible en ninguna pantalla | Quitar la asociación, sin pérdida de datos |
| **B** | Identidad compartida de chofer: `IdentidadChoferGrupo`, `Chofer.identidadChoferGrupoId`, endpoint de vinculación manual | Backend, schema | Sí, aditiva | Vincular por error a la persona equivocada — mitigado por el criterio de revisión manual (sección 14) | Vincular dos choferes reales, confirmar que cada uno sigue siendo independiente en su organización | Un chofer real queda vinculado entre las dos organizaciones, verificado a mano | Desvincular, sin pérdida de datos |
| **C** | Acceso de usuarios: `AccesoGrupoEconomico`, endpoint de otorgar/revocar, endpoint de cambio de organización activa, guard de grupo | Backend | Sí, aditiva | El más sensible de seguridad — mitigado por el guard separado de `RolesGuard` (sección 8) y por la prueba de fuga cruzada ampliada (sección 15) | Todas las pruebas de la sección 15 relacionadas con acceso | Los usuarios administrativos aprobados cambian de organización activa correctamente, y nadie más puede | Revocar accesos, sin pérdida de datos; el JWT no cambió de forma, no hay incompatibilidad con tokens ya emitidos |
| **D** | Selector de organización activa en el frontend, pantalla de administración de accesos y de choferes de grupo | Frontend | No | Bajo — pantallas nuevas, aisladas del resto | Validación manual en navegador real, con los tres usuarios reales | Un usuario autorizado cambia de organización desde la interfaz y ve los datos correctos de cada una | Ocultar las pantallas nuevas, sin ningún efecto sobre el backend |
| **E** | Pago consolidado: `PagoConsolidado`, `PagoConsolidadoLiquidacion`, endpoints de candidatos/creación/confirmación/anulación | Backend, schema | Sí, aditiva | El de mayor lógica de negocio — mitigado por las reglas explícitas de la sección 5 y las pruebas dedicadas de la sección 15 | Todas las pruebas de la sección 15 relacionadas con pago consolidado, incluyendo saldo negativo y liquidación ya usada | Un pago consolidado real, con las dos organizaciones, se crea, se confirma, y ambas liquidaciones quedan pagadas correctamente | Anular el pago (revierte liquidaciones); si el problema es del modelo en sí, la tabla puede vaciarse sin afectar liquidaciones (que vuelven a su estado anterior) |
| **F** | Pantallas de selección de liquidaciones elegibles, creación/confirmación del pago consolidado, y consulta, en el frontend | Frontend | No | Bajo — reutiliza patrones visuales ya existentes | Validación manual en navegador real, con el caso real completo: mismo chofer, dos organizaciones, un pago | El caso real (Carlos Gómez, Empresa A y B, una transferencia) se puede ejecutar de punta a punta desde la interfaz | Ocultar las pantallas nuevas, sin ningún efecto sobre el backend |

**Dependencias:** A antes que B (necesita el grupo para vincular choferes a él); B antes que E (el pago consolidado necesita la identidad compartida); C puede ir en paralelo con B; D depende de C; F depende de E y de D.

---

## 17. Decisiones pendientes

Decisiones **técnicas** todavía sin resolver — ninguna reabre una decisión funcional ya aprobada:

1. **Nombres exactos de los estados de `PagoConsolidado`** (sección 5 usó nombres funcionales orientativos) — se define recién al implementar, sin impacto de negocio.
2. **Quién puede otorgar `AccesoGrupoEconomico`**: este diseño propuso "el `ADMINISTRADOR` de la organización que otorga el acceso" (sección 12) como supuesto razonable, pero no fue una decisión de negocio explícita — vale la pena confirmarlo antes de implementar la Etapa C.
3. **Qué pasa si se otorga `AccesoGrupoEconomico` a un usuario cuyo rol no es `ADMINISTRADOR`** (por ejemplo, alguien de `LIQUIDACIONES`): la Decisión 3 aprobó "todo el equipo administrativo actual", que probablemente incluye roles distintos de `ADMINISTRADOR` — hace falta confirmar si el permiso de grupo es independiente del rol de negocio en cada organización (recomendado, y lo que este diseño asume) o si además debería exigir un rol mínimo.
4. **Vigencia del `AccesoGrupoEconomico`**: ¿es indefinido hasta revocación manual (lo que este diseño asume, sección 10), o debería tener alguna forma de expiración o revisión periódica?

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo commit ni push, no se abrió implementación, no se alteró SDC v1.0.0 ni su tag. Este es el único documento generado. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier implementación.

# Diseño — Bloque 10.6: Pago Consolidado (Frontend)

Fecha: 2026-07-20. Etapa de **Diseño únicamente** — `METODOLOGIA_SDC.md`, etapa 3. No hay código, no hay componentes de implementación, no hay decisiones técnicas. Base: `AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md` (auditoría de frontend, aprobada) y el comportamiento **real** ya implementado y cerrado en Bloque 10.5 (`ACTA_CIERRE_BLOQUE10.5.md`, `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, código real de `pago-consolidado.controller.ts`/`.service.ts`) — no sobre el roadmap original (`docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md`), que describía un "saldo negativo con confirmación explícita" y una operación "anular" que **no existen** en lo implementado. Ninguna decisión descartada durante 10.5 (compensación automática tipo saga, atomicidad global entre organizaciones) se reintroduce acá.

---

## 1. Objetivos funcionales

1. Permitir a un `ADMINISTRADOR` con acceso vigente a las organizaciones involucradas armar, en una sola pantalla, un pago que agrupa liquidaciones **ya confirmadas** de un mismo chofer (identidad compartida, Bloque 10.2) repartidas entre **más de una organización** del mismo Grupo Económico.
2. Llevar ese pago, de forma visible y controlada, a través de sus tres etapas reales: borrador → preparado (bloqueo) → confirmado (aplicación real del pago, organización por organización).
3. Exponer con honestidad el resultado real de la confirmación — incluido un resultado **parcial**, que el backend define como legítimo y esperado, nunca como un error a ocultar — y ofrecer el camino de reintento que el backend ya soporta.
4. Permitir cancelar un pago mientras todavía sea reversible (antes de que cualquier liquidación haya sido efectivamente pagada), dejando trazabilidad del motivo.
5. Cerrar, de punta a punta desde la interfaz, el caso real que originó todo el Bloque 10 (un chofer, dos organizaciones, un único pago) — sin requerir que el usuario cambie de organización activa en ningún momento del flujo.

---

## 2. Flujo completo del usuario

1. El administrador entra a la sección de Pago Consolidado. La pantalla se comporta como una pantalla **de nivel de grupo**, no de una organización activa — igual que `Grupo Económico` (10.4.c) — nunca exige ni depende de cuál organización esté activa en la sesión.
2. Ve el listado de pagos consolidados existentes del grupo, con su estado actual, beneficiario, total y fecha.
3. Para iniciar uno nuevo: elige un beneficiario (una identidad de chofer compartida ya vinculada, Bloque 10.2) de entre las del grupo.
4. El sistema muestra las liquidaciones candidatas de ese beneficiario — **ya agregadas de todas las organizaciones donde tiene acceso vigente**, en una sola vista, sin que el administrador tenga que consultarlas organización por organización.
5. El administrador selecciona cuáles candidatas incluir (puede ser una sola organización o varias) y ve el total en vivo a medida que selecciona.
6. Confirma la creación → el pago queda en borrador. Puede, en cualquier momento mientras siga en borrador, cancelarlo sin ninguna consecuencia, porque todavía no bloqueó nada.
7. Cuando decide avanzar, prepara el pago: el sistema revalida cada liquidación y bloquea todas, en todas las organizaciones involucradas, o ninguna. El pago pasa a preparado.
8. Todavía puede cancelar desde preparado — libera los bloqueos, sin ninguna consecuencia financiera.
9. Cuando decide ejecutar el pago real, confirma: el sistema aplica el pago organización por organización. El resultado puede ser: **completo** (todas las organizaciones aplicadas), **parcial** (algunas sí, algunas no) o **fallido** (ninguna).
10. Si el resultado es parcial o fallido, el administrador ve exactamente qué organización(es) quedaron pendientes o fallaron, y puede **reintentar** — el sistema solo vuelve a tocar lo que no se aplicó, nunca repite lo que ya se pagó.
11. Un pago fallido (nada se llegó a aplicar) todavía puede cancelarse. Un pago parcial (algo ya se aplicó) **no puede cancelarse nunca** — solo reintentarse hasta llegar a confirmado, o quedar así indefinidamente si la causa del fallo no se resuelve por otra vía.
12. Un pago confirmado o cancelado es un estado final — la pantalla lo muestra como consulta, sin ninguna acción disponible sobre él.

---

## 3. Pantallas necesarias

### 3.1 Listado de Pagos Consolidados (pantalla principal)

Punto de entrada. Lista todos los pagos consolidados del grupo, con al menos: beneficiario, estado, total, cantidad de organizaciones involucradas, fecha de creación. Permite abrir el detalle de cualquiera y ofrece la acción de iniciar uno nuevo.

### 3.2 Selección de beneficiario y candidatos (flujo de creación)

No necesariamente una pantalla separada — puede vivir como una sección dentro de la misma vista principal (igual que el patrón ya usado en `Liquidaciones` para armar una liquidación nueva) — pero funcionalmente son dos pasos:
- Elegir la identidad de chofer del grupo.
- Ver y seleccionar, de una sola vez, las liquidaciones candidatas de todas las organizaciones donde el administrador tiene acceso, con el total en vivo de lo seleccionado.

### 3.3 Detalle de un Pago Consolidado

Muestra el pago completo: beneficiario, estado actual, total, referencia, quién lo creó y cuándo, y el desglose fila por fila — cada liquidación incluida, su organización, su monto, y su progreso individual de aplicación (pendiente / aplicada / fallida). Desde acá se disparan todas las acciones de ciclo de vida (preparar, confirmar/reintentar, cancelar), siempre condicionadas al estado actual del pago.

No se especifica en esta etapa si 3.1 y 3.3 son dos rutas distintas o una lista con detalle expandible en el mismo lugar — es una decisión técnica, no funcional.

---

## 4. Componentes reutilizables (a nivel funcional, no de implementación)

No se proponen componentes nuevos. Se identifican, para la etapa de Decisiones Técnicas, los patrones **ya construidos y ya validados en producción** que este bloque necesitaría:

- **Patrón de pantalla de nivel de grupo, no atada a la organización activa** — ya usado y ya probado en `Grupo Económico` (10.4.c): bootstrap de datos de grupo al entrar, sin depender de qué organización esté activa en la sesión. Es el patrón que la Auditoría de este bloque confirmó como el correcto (sección 3 de `AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md`) — cambiar de organización activa no sirve acá, porque hay que ver y operar sobre datos de más de una organización a la vez.
- **Patrón de selección de candidatos con total en vivo** — ya usado en `Liquidaciones` (selección por casillero sobre una tabla, total recalculado en cada cambio de selección, sin estado derivado guardado aparte).
- **Patrón de acción según estado** — ya usado en `Liquidaciones`: qué botones se muestran depende exclusivamente del estado real del registro, nunca de un estado de interfaz que lo replique por separado.
- **Patrón de confirmación con severidad, y confirmación con texto tipeado para la acción más irreversible** — ya usado en `Liquidaciones` para marcar una liquidación como pagada (única pantalla del proyecto que exige tipear un valor para confirmar). La acción de **confirmar** un Pago Consolidado es, como mínimo, igual de irreversible — y potencialmente más, porque afecta más de una organización a la vez — así que amerita, como mínimo, el mismo nivel de fricción deliberada.
- **Patrón de estados de carga/vacío/error por sección**, siempre con su propio texto, nunca un componente compartido genérico — ya usado consistentemente en toda la aplicación.
- **Patrón de mensajes de éxito/error tras una acción**, con manejo uniforme del mensaje real que devuelve el backend.

---

## 5. Estados visuales

### 5.1 Estados del Pago Consolidado (siete, exactamente los siete reales del backend — `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, Decisión 5)

| Estado real | Qué debe transmitir visualmente |
|---|---|
| `BORRADOR` | En armado, todavía sin ningún compromiso — editable/cancelable sin fricción. |
| `PREPARADO` | Bloqueado, listo para ejecutar — cancelable, pero ya no es "solo un borrador". |
| `PROCESANDO` | Transición en curso — de muy corta duración en la práctica (la aplicación real ocurre en el mismo ciclo de la petición), pero debe existir como estado posible de la interfaz, sin ninguna acción disponible mientras dure. |
| `CONFIRMADO` | Éxito completo, estado final — sin ninguna acción disponible salvo consulta. |
| `PARCIAL` | **Resultado real y esperado, no un error** — debe distinguirse visualmente tanto de un éxito completo como de un fallo total, mostrando con claridad qué se aplicó y qué no, con la acción de reintentar disponible y visible. |
| `FALLIDO` | Nada se aplicó todavía — reintentable y también cancelable (la única variante de fallo que sigue siendo reversible). |
| `CANCELADO` | Estado final — con el motivo de cancelación visible. |

### 5.2 Estado de aplicación por fila (tres, exactamente los reales — `estadoAplicacion`)

`PENDIENTE` (todavía no se intentó o quedó pendiente de un intento anterior), `APLICADA` (pagada, definitivo, nunca se vuelve a tocar), `FALLIDA` (se intentó y no se pudo, candidata a reintento). Cada fila del desglose debe mostrar su propio estado — el estado del pago en conjunto no alcanza para saber qué pasó organización por organización, especialmente en `PARCIAL`.

---

## 6. Permisos según rol

Exactamente lo que el backend ya exige, sin relajar ni anticipar nada adicional del lado de la interfaz (Decisión Técnica 4 de 10.5):

- Toda la sección es exclusiva de `ADMINISTRADOR` — mismo criterio ya usado en `Grupo Económico`, `Usuarios`, `Auditoría`: el gate de rol en la interfaz es una ayuda de navegación, nunca la autorización real (esa ya la exige el backend en los 7 endpoints).
- Dentro de esa sección, cada acción (crear, preparar, confirmar, cancelar, e incluso listar/consultar) puede fallar igualmente por falta de acceso vigente a alguna organización involucrada — no alcanza con pertenecer al mismo grupo. La interfaz no debe asumir que, por ser `ADMINISTRADOR` y ver la sección, el usuario automáticamente puede operar sobre cualquier pago que aparezca listado (ver sección 7 y 13).

---

## 7. Manejo de errores

El backend ya distingue con precisión cada motivo de rechazo — la interfaz debe mostrar el mensaje real que devuelve, no un mensaje genérico propio, siguiendo el mismo criterio ya usado en toda la aplicación. Categorías reales que la interfaz debe contemplar:

- **Sesión/autenticación**: token ausente o vencido.
- **Rol insuficiente**: rechazo por no ser `ADMINISTRADOR`.
- **Acceso insuficiente a una organización involucrada**: puede ocurrir en cualquier operación, incluida la lectura — y puede aparecer recién en un paso avanzado del flujo (preparar, confirmar) aunque el paso anterior haya funcionado, porque el backend revalida en cada llamada, nunca asume lo ya verificado (ver caso borde de revocación a mitad de flujo, sección 13).
- **Datos no encontrados**: identidad de chofer inexistente en el grupo, pago inexistente — mismo mensaje genérico que el backend ya usa para no distinguir "no existe" de "no pertenece a este grupo".
- **Validación de la selección al crear**: ítems duplicados, liquidación que ya no está disponible (ya no `CONFIRMADA`, ya incluida en otro pago consolidado, no corresponde al beneficiario declarado) — puede ocurrir aunque la liquidación haya aparecido como candidata segundos antes, porque otra persona pudo haber actuado en el medio (ver casos borde).
- **Transición de estado inválida**: intentar preparar algo que no está en borrador, confirmar algo que no está en preparado/parcial/fallido, cancelar algo que ya tiene alguna liquidación pagada — la interfaz debe evitar mostrar estas acciones cuando el estado no las admite (sección 5), pero el backend es quien decide en última instancia, así que el error real debe mostrarse igual si ocurre.
- **Colisión de concurrencia**: alguien más ya bloqueó una liquidación involucrada, o el pago ya está siendo procesado por otra operación en curso — mensajes reales y específicos del backend, no genéricos.

No corresponde a esta etapa decidir el mecanismo visual exacto (banner, inline, modal) — sí corresponde dejar establecido que cada acción tiene su propio espacio de error, igual que ya ocurre en el resto de la aplicación, y que un error en una acción puntual (por ejemplo, cancelar una fila) no debe interrumpir ni ocultar el resto de la pantalla.

---

## 8. Estados de carga

- Carga inicial del listado de pagos consolidados.
- Carga de las identidades de chofer disponibles para elegir beneficiario.
- Carga de candidatos tras elegir un beneficiario (puede tardar más que una consulta de una sola organización, porque el backend recorre cada organización involucrada en secuencia).
- Carga del detalle de un pago al abrirlo.
- Estado "en curso" (`busy`) independiente para cada acción de ciclo de vida — crear, preparar, confirmar/reintentar, cancelar — de forma que una acción en curso sobre un pago no bloquee la interacción con otro, siguiendo el mismo criterio ya usado en el resto de la aplicación (acciones independientes, cada una con su propio estado de carga).
- Ninguna acción de escritura debe permitir un segundo disparo mientras la primera sigue en curso (doble clic) — mismo criterio ya aplicado en toda la aplicación tras el bloque de confirmaciones y prevención de doble envío.

---

## 9. Confirmaciones

Siguiendo el criterio ya establecido (severidad graduada según el impacto real, `ConfirmDialog` con sus variantes ya probadas):

| Acción | Severidad | Justificación |
|---|---|---|
| Crear (pasar a borrador) | Baja o ninguna | Totalmente reversible, no bloquea nada todavía. |
| Preparar | Media | Bloquea liquidaciones reales en más de una organización, aunque todavía es reversible cancelando. |
| Cancelar (desde borrador o preparado) | Media | Requiere motivo obligatorio (el backend lo exige, `cancelar` no acepta un motivo vacío) — la interfaz debe pedirlo antes de permitir confirmar la cancelación, no después. |
| **Confirmar (aplicar el pago)** | **Alta, con el mismo nivel de fricción que la confirmación de pago de una liquidación individual** (texto tipeado) | Es la acción financiera más irreversible de todo el flujo — afecta, en el mismo paso, liquidaciones de más de una organización, algunas de las cuales pueden aplicarse exitosamente aunque otras no. El usuario debe confirmar entendiendo explícitamente que el resultado puede ser parcial. |
| **Reintentar (confirmar sobre un pago parcial o fallido)** | Alta, mismo criterio que confirmar | Es la misma operación del backend (`confirmar`, ver Decisión Técnica 5) — vuelve a mover dinero real en las organizaciones todavía pendientes. |
| Cancelar un pago fallido | Media | Mismo criterio que cancelar desde preparado — sigue siendo 100% reversible porque nada se pagó. |

No corresponde a esta etapa el texto exacto de cada mensaje de confirmación — sí corresponde dejar establecido que **confirmar y reintentar exigen el nivel de fricción más alto ya disponible en la aplicación**, y que **cancelar exige motivo obligatorio antes de poder confirmarse**.

---

## 10. Mensajes al usuario

- Mensajes de éxito y error deben usar, siempre que exista, el mensaje real devuelto por el backend — mismo criterio ya aplicado en toda la aplicación, nunca un texto inventado que oculte el motivo real.
- **El resultado de confirmar no es binario y el mensaje no puede tratarlo como tal.** Un `201` de éxito HTTP puede corresponder a `CONFIRMADO`, `PARCIAL` o `FALLIDO` — tres resultados distintos que necesitan tres mensajes distintos, no un único "operación exitosa" que sería engañoso si el resultado real fue parcial o fallido. Esta es la diferencia más importante respecto de cualquier otra acción ya existente en la aplicación, donde éxito de la petición HTTP y éxito del resultado de negocio siempre coincidieron.
- El mensaje de un resultado `PARCIAL` debe comunicar, como mínimo, que **no es un error del sistema** sino un resultado esperado, cuántas organizaciones se aplicaron y cuántas quedan pendientes, y que existe una acción de reintento disponible.
- El mensaje de cancelación debe reflejar el motivo ingresado, no solo confirmar que se canceló.

---

## 11. Navegación

- Nueva entrada de menú, exclusiva de `ADMINISTRADOR`, en el mismo nivel que "Grupo Económico" — coherente con que ambas son funcionalidades de nivel de grupo, no de una sola organización.
- Punto de entrada único: el listado de pagos consolidados del grupo (sección 3.1).
- Desde el listado, drill-down al detalle de un pago puntual (sección 3.3) y a la creación de uno nuevo (sección 3.2).
- Ninguna pantalla de este bloque debe depender de ni modificar la organización activa de la sesión — a diferencia de `Viajes`/`Facturas`/`Liquidaciones`, que sí operan sobre la organización activa. Entrar o salir de esta sección no debe disparar ningún cambio de contexto.
- No se define en esta etapa si el detalle vive en una URL propia o en un panel dentro de la misma pantalla del listado — decisión técnica.

---

## 12. Integración con los endpoints reales del backend

Contratos reales, tal como quedaron implementados y cerrados en Bloque 10.5 (no el roadmap original) — todos bajo `/grupo-economico/:grupoId/...`, todos exigen `ADMINISTRADOR` y acceso vigente a cada organización involucrada, revalidado en cada llamada:

**Prerrequisitos, ya existentes de bloques anteriores:**
- `GET /grupo-economico` — datos del grupo y sus organizaciones (`{id, nombre, organizaciones: [{id, nombre}]}`). Necesario porque **los endpoints de Pago Consolidado nunca devuelven el nombre de la organización, solo su `organizacionId`** — la interfaz debe resolver el nombre cruzando contra esta lista, mismo patrón ya usado en `Grupo Económico`.
- `GET /grupo-economico/choferes/identidades` (Bloque 10.2) — identidades de chofer del grupo, con los choferes vinculados de cada organización. Es el punto de partida para elegir beneficiario — Pago Consolidado no tiene su propio selector de chofer, reutiliza esto.

**Endpoints propios de Pago Consolidado (los 7 reales, ninguno más):**
- `GET .../pagos-consolidados/candidatos?identidadChoferGrupoId=...` — liquidaciones `CONFIRMADA` y todavía sin bloquear, del chofer elegido, ya combinadas de todas las organizaciones donde el actor tiene acceso vigente. Cada ítem trae `id, numero, periodoDesde, periodoHasta, netoPagar, organizacionId` — sin nombre de organización (resolver contra el prerrequisito de arriba).
- `POST .../pagos-consolidados` — crea el `BORRADOR`. Cuerpo: `identidadChoferGrupoId`, `items: [{organizacionId, liquidacionId}]` (al menos uno, sin duplicados), `referenciaPago` opcional. No hay ningún campo de "saldo negativo" ni similar — no existe ese concepto en lo implementado.
- `GET .../pagos-consolidados` — lista todos los pagos del grupo.
- `GET .../pagos-consolidados/:pagoId` — detalle completo de un pago, con su desglose de filas.
- `POST .../pagos-consolidados/:pagoId/preparar` — sin cuerpo. Bloquea y pasa a `PREPARADO`.
- `POST .../pagos-consolidados/:pagoId/confirmar` — sin cuerpo. Aplica el pago; es también la operación de reintento (se llama exactamente igual, sobre el mismo pago, cuando quedó `PARCIAL` o `FALLIDO`) — no existe un endpoint separado de "reintentar".
- `POST .../pagos-consolidados/:pagoId/cancelar` — cuerpo: `{motivo}` (obligatorio, no vacío). Rechazado si el pago ya tiene alguna liquidación pagada.

**No existe ningún endpoint de "anular" un pago ya confirmado** — una vez `CONFIRMADO` o con al menos una liquidación pagada (`PARCIAL`), no hay ninguna operación de reversión disponible, ni la habrá dentro del alcance de este bloque (Decisión Técnica 1 de 10.5, sin compensación automática).

---

## 13. Casos borde

- **Beneficiario sin ninguna liquidación candidata** en ninguna organización — estado vacío explícito, no un error.
- **Beneficiario con candidatos en una sola organización** — sigue siendo válido crear un pago consolidado con una sola organización (el backend lo permite, no exige un mínimo de dos); la interfaz no debe bloquearlo, aunque en ese caso el valor de "consolidar" sea menor.
- **La lista de candidatos queda desactualizada entre que se muestra y que se confirma la creación** — otra persona pudo haber bloqueado esa misma liquidación en el medio (otro pago consolidado en curso). El error real llega recién al crear o al preparar, nunca antes — la interfaz debe poder mostrar ese rechazo tardío con claridad, no asumir que lo mostrado en pantalla sigue siendo válido.
- **Colisión real de bloqueo al preparar** — la liquidación se bloqueó en otra operación entre que el pago se creó y que se preparó.
- **Colisión real al confirmar** — dos intentos de confirmar el mismo pago casi al mismo tiempo (doble clic, o dos administradores); el backend garantiza que solo uno se ejecuta, el otro debe recibir y mostrar el rechazo real, no reintentarlo automáticamente.
- **Resultado parcial que se reintenta y vuelve a fallar en la misma organización** — el backend no garantiza que un reintento eventualmente tenga éxito (por ejemplo, si la causa del fallo en esa organización no es transitoria). La interfaz no debe sugerir ni forzar un reintento automático o en bucle — debe permitir al administrador reintentar cuando decida, y dejar el pago en `PARCIAL` indefinidamente si así se elige, sin señalarlo como un error del sistema.
- **Acceso revocado a mitad de flujo** — el administrador pudo tener acceso vigente a una organización al empezar el flujo y perderlo antes de terminar un paso posterior (por ejemplo, entre ver el detalle y confirmar). El backend lo revalida en cada llamada; la interfaz debe tratar ese rechazo como un caso esperado, no como una falla inesperada.
- **`listar()` puede rechazar por completo** si el administrador no tiene acceso vigente a alguna organización involucrada en **cualquier** pago del grupo, incluso uno que no le interese — limitación real y conocida del backend (`AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`, Hallazgo 3, informativo, no corregido en 10.5). La interfaz debe tratar ese caso como un error de acceso general de la pantalla, no intentar "adivinar" ni filtrar del lado del cliente.
- **Pago en `BORRADOR` abandonado indefinidamente** — sigue apareciendo en el listado hasta que alguien lo cancele o lo prepare; no hay expiración automática. La interfaz no debe ocultarlo ni tratarlo como un error de datos.
- **Grupo con más de dos organizaciones en el futuro** — aunque el caso real actual es de dos, el diseño de las pantallas (especialmente el desglose de candidatos y el desglose de filas del detalle) no debe asumir que siempre habrá exactamente dos; debe funcionar igual de bien con una, dos o más.
- **Motivo de cancelación vacío** — el backend lo rechaza; la interfaz debe impedir enviar la cancelación sin motivo, en vez de dejar que el usuario descubra el rechazo después de confirmar.

---

## 14. Criterios de aceptación

1. Un administrador puede completar el caso real completo (mismo chofer, dos organizaciones, un pago) de punta a punta desde la interfaz — crear, preparar, confirmar — sin cambiar de organización activa en ningún momento.
2. El listado de pagos consolidados refleja siempre el estado real devuelto por el backend, sin ningún estado propio de la interfaz que pueda desincronizarse.
3. Las acciones disponibles sobre un pago (preparar / confirmar-reintentar / cancelar) coinciden, en cada momento, exactamente con lo que la tabla de transiciones real del backend permite — nunca se ofrece una acción que el backend vaya a rechazar en el estado actual.
4. Un resultado `PARCIAL` se comunica de forma clara y distinta tanto de un éxito completo como de un fallo total, mostrando el desglose por organización y ofreciendo el reintento.
5. Confirmar (incluido el reintento) exige el nivel de confirmación más alto ya disponible en la aplicación.
6. Cancelar exige un motivo no vacío antes de poder confirmarse.
7. Todo mensaje de error mostrado corresponde al mensaje real devuelto por el backend, nunca a un texto genérico que oculte la causa.
8. La pantalla completa es inaccesible para cualquier rol distinto de `ADMINISTRADOR`, con el mismo criterio ya usado en el resto de la aplicación.
9. Ningún caso borde de la sección 13 provoca una pantalla rota, un estado de carga infinito, o una acción disponible que el backend vaya a rechazar de forma segura pero silenciosa para el usuario.

---

## Qué queda fuera de este documento (confirmado, no decidido)

Nombres de rutas, estructura de componentes, hooks, nombres de archivos, manejo de estado técnico, estructura de las llamadas HTTP, textos exactos de mensajes y confirmaciones, disposición visual exacta de cada pantalla. Todo eso corresponde a la etapa de Decisiones Técnicas, que no se abre con este documento.

---

**Detenido al finalizar.** A la espera de tu revisión. No se avanza a Decisiones Técnicas sin autorización explícita.

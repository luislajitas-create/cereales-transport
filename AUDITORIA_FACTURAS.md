# Auditoría — Módulo Facturación

Registro de bloques de deuda técnica y modularización del módulo Facturación, mismo formato que `AUDITORIA_LIQUIDACIONES.md`. Origen: auditoría técnica integral del sistema SDC (post Viajes 2.0 / Liquidaciones 2.0).

---

## FAC-1 — Eliminar sobre-fetching y agregar paginación a GET /facturas

**Hallazgo:** `findAll()` en `facturas.controller.ts` reutilizaba `includeFactura` (viajes.viaje con `cereal, origen, destino, transportista` completos, más `cobranzas` completas) para cada factura del listado. Sin paginación: todas las facturas del sistema, sin límite — mismo patrón exacto que motivó H-6/H-7/H-11 en Viajes y LIQ-1 en Liquidaciones.

**Auditoría previa:**
1. `findAll()` tenía filtros `clienteId`, `estado`, `desde`, `hasta`; `include: includeFactura` completo; `orderBy: { fecha: "desc" }`; sin `page`/`limit`/`skip`/`take`.
2. Columnas reales consumidas por `Facturas.tsx` (tabla "Facturas emitidas"): `numero`, `cliente?.razonSocial`, `fecha`, `vencimiento`, `importe`, `estado`, `id` (key + "Ver"). Nada de `viajes`/`cobranzas` completos.
3. Consumidores frontend: grep de `"/facturas"` en todo `frontend/src` — único consumidor real de `GET /facturas` es `Facturas.tsx`.
4. Consumidores backend internos: grep de `factura.findMany` — `dashboard.controller.ts`, `clientes.controller.ts` y `aging.service.ts` hacen su propia query directa, sin pasar por `FacturasController.findAll()` — no afectados.
5. Retrocompatibilidad: descartado modo dual (mismo criterio que H-11/LIQ-1) — cambio de contrato limpio, backend y frontend en el mismo commit.
6. Estrategia: offset (`page`/`limit` → Prisma `skip`/`take`), replicando el patrón ya usado en `organizacion.controller.ts` / `viajes.controller.ts` (H-11) / `liquidaciones.controller.ts` (LIQ-1).

**Implementación:**
- `backend/src/facturas/facturas.controller.ts`: `selectFacturaListado` (8 campos reales), `FACTURAS_LIMITE_DEFECTO=20`, `FACTURAS_LIMITE_MAXIMO=100` (idénticos al patrón ya usado tres veces). `findAll()` agrega `page`/`limit`, `Promise.all([count, findMany con skip/take])`, devuelve `{ datos, pagina, limite, total }`. Ningún otro endpoint tocado (`findOne`, `create`, `anular`, `registrarCobranza`, `anularCobranza`, exports, `conciliacion` siguen usando `includeFactura` sin cambios).
- `backend/src/facturas/facturas.controller.pagination.spec.ts` (nuevo, 7 tests): defaults, cálculo de `skip`, clamp de `limit`, forma exacta de la respuesta, mismo `where` entre `count` y `findMany`, `select` (no `include`).
- `frontend/src/pages/Facturas.tsx`: `cargar()` reemplazada por `buscar(paginaNueva, limiteNueva)` con sincronización de URL (mismo patrón que `Liquidaciones.tsx`/LIQ-1). Nuevo estado `pagina`/`limite`/`total`. Bloque de UI de paginación idéntico al ya usado en el proyecto, sin CSS nuevo. Los 3 call-sites que refrescaban el listado (`crearFactura`, `registrarCobranza`, `anularFactura`) actualizados a `buscar(pagina, limite)`, permaneciendo en la página actual.

**Medición de impacto (dataset real, 3 facturas):**

| Escenario | Tamaño de respuesta | Tiempo promedio (5 corridas, localhost) |
|---|---|---|
| Antes (sin paginar, include completo) | 8411 bytes | ~0.238 s |
| Después, `limit=20` (3 registros, 1 sola página) | 731 bytes (−91% vs. antes) | ~0.212 s |
| Después, `limit=1` (1 registro por página) | 269 bytes (−97% vs. antes) | ~0.208 s |

**Nota sobre el tiempo (mismo criterio que H-11/LIQ-1):** con 3 registros el tiempo es prácticamente igual antes/después — esperado, domina el overhead de red/autenticación. La reducción real y medible es de tamaño de payload; el beneficio de tiempo se hará evidente cuando el volumen de facturas reales crezca.

**Validación funcional (navegador real):** listado con las 3 facturas reales; paginación con límite 1 mostró "Página 1 de 3 (3 en total)"; Anterior/Siguiente correcto; refresh conservó página/límite; Ver, Registrar cobranza, Anular factura, Buscar viajes pendientes + Crear factura siguieron funcionando exactamente igual; Conciliación sin cambios. Confirmado por el usuario.

**Regresiones:** ninguna esperada. `findOne()`, exports, `conciliacion()`, `create()`, `anular()`, `registrarCobranza()`, `anularCobranza()` arman cada uno su propia query independiente. `dashboard.controller.ts`/`clientes.controller.ts`/`aging.service.ts` no afectados (confirmado en la auditoría).

**Builds y tests:** backend build OK, **14/14 suites** (13 previas + 1 nueva), **104/104 tests** (97 previos + 7 nuevos). Frontend build OK, sin errores TypeScript.

**Deuda remanente identificada, fuera de alcance de FAC-1 (backlog):**
- `Facturas.tsx` sin extracción de subcomponentes ni `React.memo`.
- Falta de gating de rol en la UI (el backend ya exige `@Roles("FACTURACION","ADMINISTRADOR")` correctamente).
- N+1 evitable en `anular()` (loop de `update` idéntico reemplazable por `updateMany`).

---

## FAC-2 — Extraer FilaFactura a componente propio

**Objetivo:** iniciar la modularización de Facturación con el mismo criterio mecánico ya aplicado en H-8 (`FilaViaje`) y LIQ-2 (`FilaLiquidacion`) — extraer únicamente la fila del listado, sin tocar lógica, estado, hooks ni `React.memo`.

**Implementación:** nuevo `frontend/src/components/FilaFactura.tsx` — componente puramente presentacional (celdas + botón "Ver" que dispara `onVerDetalle(id)`), con su propia copia local de `fmtMoney` (mismo criterio que `FilaLiquidacion.tsx`: se sigue usando en muchos otros lugares de `Facturas.tsx`, no se movió). Props: `{ factura: any; onVerDetalle: (id: string) => void }`. `Facturas.tsx`: el `.map()` inline de la fila se reemplazó por `<FilaFactura key={f.id} factura={f} onVerDetalle={verDetalle} />`. El padre sigue manejando listado, paginación, detalle, estado y callbacks. Sin estado interno nuevo, sin `React.memo`, sin hooks nuevos — mismo alcance mínimo pedido.

**Validación funcional (navegador real):** listado visualmente idéntico; paginación, refresh, Ver, Buscar viajes pendientes/Crear factura, Registrar cobranza, Anular factura, Conciliación funcionan exactamente igual. Confirmado por el usuario (checklist combinado FAC-1+FAC-2).

**Regresiones:** ninguna — cambio puramente mecánico de ubicación de código (mismo patrón que H-8/LIQ-2), sin tocar lógica, contratos ni backend.

**Builds y tests:** backend sin cambios, 14/14 suites, 104/104 tests verde. Frontend build OK, sin errores TypeScript, 124 módulos (+1 por el archivo nuevo).

**Deuda remanente sin cambios (backlog):** falta de gating de rol en la UI, N+1 evitable en `anular()`, Detalle/Formulario/Confirmaciones/Exports/Conciliación sin extraer.

---

## FAC-3 — Anulación de cobranzas desde Facturación

**Objetivo:** exponer en la interfaz el endpoint `POST /facturas/:id/cobranzas/:cobranzaId/anular` (ya existente en el backend, protegido con `@Roles("FACTURACION","ADMINISTRADOR")` desde antes de SEC-UI-1, pero sin ninguna acción en la UI para invocarlo), permitiendo anular una cobranza cargada por error conservando trazabilidad y recalculando saldo y estado de la factura.

**Auditoría previa (antes de tocar código):**
1. Modelo Prisma: `Cobranza` ya tenía `anulada`, `anuladaMotivo`, `anuladaFecha` (sin eliminación física posible — no hay `delete` de `Cobranza` en ningún endpoint). `Factura.estado` es `FACTURADO | COBRADO_PARCIAL | COBRADO_TOTAL | ANULADO` — no existe un estado "PENDIENTE" separado; `FACTURADO` es el estado equivalente a "sin cobrar".
2. Endpoint/DTO/Controller: `anularCobranza()` en `facturas.controller.ts` ya bloqueaba la fila de la `Factura` (`SELECT ... FOR UPDATE`) dentro de una transacción, verificaba existencia de factura/cobranza, rechazaba cobranzas ya anuladas, guardaba `anuladaMotivo`/`anuladaFecha`, creaba un `AuditLog` y recalculaba el estado con `calcularEstadoFactura()`. Único defecto real encontrado: `AnularCobranzaDto.motivo` era `@IsOptional()`, violando la regla de negocio "motivo obligatorio" — el sibling `AnularAnticipoDto` ya resolvía esto con `@IsString() @IsNotEmpty()`.
3. Estado de factura ANULADA: la única vía de negocio hacia `ANULADO` (`anular()`, endpoint separado de factura) exige que ninguna cobranza esté vigente (`cobranzas.some(c => !c.anulada)` debe ser `false`), por lo que en la práctica una factura `ANULADA` nunca tenía cobranzas vigentes — pero `anularCobranza()` no verificaba `factura.estado` de forma explícita, solo dependía transitivamente de que la cobranza individual ya estuviera anulada.
4. Cálculo de saldo/estado: `totalCobradoVigente = suma de cobranzas no anuladas`; `calcularEstadoFactura(importe, totalCobradoVigente)` ya reproducía correctamente las reversiones COBRADO_TOTAL→COBRADO_PARCIAL/FACTURADO y COBRADO_PARCIAL→FACTURADO.
5. Impacto en cuenta corriente/aging/conciliación/dashboard/reportes: todos leen `Factura.estado`/`Cobranza.anulada` en tiempo real desde la base — sin caches ni desnormalización — no requerían cambios.
6. Auditoría: `AuditLog` ya se creaba correctamente al anular (no así al registrar, que queda fuera de alcance de FAC-3).
7. Aislamiento multiempresa: automático vía Prisma Client Extensions (Bloque 8.1.d, `organizacion-prisma.client.ts`) — `findUnique` devuelve `null` si la fila es de otra organización, y toda escritura inyecta `organizacionId` en el `where`. Ningún endpoint de `facturas.controller.ts` construye queries manuales que lo eludan.
8. Roles reales: `@Roles("FACTURACION","ADMINISTRADOR")` en los 4 endpoints de escritura (`create`, `anular`, `registrarCobranza`, `anularCobranza`); `RolesGuard` da paso libre a `ADMINISTRADOR` sin importar la lista declarada. `GERENCIA`, `OPERACIONES`, `LIQUIDACIONES` y `LECTURA` quedan fuera.
9. Consumidores frontend: único consumidor de detalle de factura y `FilaFactura` es `Facturas.tsx` — sin otros componentes a actualizar.
10. Pruebas existentes: ninguna cubría `anularCobranza()` ni la regla de negocio de `anular()` (factura) sobre cobranzas vigentes.

**Reglas funcionales implementadas/validadas:**
- No eliminación física; se conserva importe, fecha, usuario y datos originales de la cobranza.
- Motivo obligatorio (antes opcional) — `AnularCobranzaDto` ahora usa `@IsString() @IsNotEmpty()`, más un guard defensivo en el controller (mismo patrón que `AnticiposController.anular`) detrás del `ValidationPipe` global.
- No se puede anular la misma cobranza dos veces (`cobranza.anulada` ya `true` → 400).
- **Nuevo en esta iteración:** rechazo explícito e independiente por `factura.estado === "ANULADO"` — antes de mirar la cobranza, con mensaje propio ("La factura está anulada; no se pueden modificar sus cobranzas"). Cubre el caso de datos inconsistentes donde la cobranza figurase como vigente pese a que la factura ya está anulada.
- Recalculo de total cobrado, saldo y estado tras anular — reversiones COBRADO_TOTAL→COBRADO_PARCIAL/FACTURADO y COBRADO_PARCIAL→FACTURADO verificadas.
- Evita doble ejecución por doble-click o solicitudes concurrentes: el `SELECT ... FOR UPDATE` sobre la fila de `Factura` serializa las transacciones concurrentes sobre la misma factura; la segunda espera, relee `cobranza.anulada = true` y es rechazada.
- Aislamiento multiempresa: probado simulando el comportamiento real de la extensión (`findUnique` → `null` cuando la fila es de otra organización).

**Implementación — backend:**
- `backend/src/facturas/dto/anular-cobranza.dto.ts`: `motivo` pasa de opcional a obligatorio.
- `backend/src/facturas/facturas.controller.ts` (`anularCobranza`): guard explícito por `factura.estado === "ANULADO"` (antes del lookup de la cobranza); guard defensivo de motivo ausente; se retira el `|| null` ya innecesario en `anuladaMotivo`/`datosNuevos.motivo`. Ningún otro endpoint tocado.

**Implementación — frontend:**
- `frontend/src/pages/Facturas.tsx`: tabla de "Cobranzas" del detalle ahora muestra estado (`badge ACTIVO` "Vigente" / `badge ANULADO` "Anulada (fecha) — motivo", reutilizando clases CSS ya existentes) y botón "Anular cobranza" (solo cobranzas vigentes, solo `puedeGestionarFacturas`, `disabled={busy}`). Confirmación vía `useConfirm()` con `requireMotivo: true` (mismo componente `ConfirmDialog` que `Anticipos.tsx`), mostrando importe/fecha/medio de pago de la cobranza a anular. Tras confirmar: `run()` de `useAsyncAction` llama al endpoint, refresca detalle (`verDetalle`) y listado (`buscar(pagina, limite)`) sin perder página/límite/factura seleccionada.
- **Ajuste post-validación:** el botón "Anular factura" usaba `detalle.cobranzas.length === 0` para decidir su visibilidad — con FAC-3 una factura puede quedar con cobranzas *todas anuladas* (no necesariamente cero), caso que el backend sí permite anular pero que esa condición ocultaba. Se reemplazó por `detalle.cobranzas.every((c) => c.anulada)`, que coincide exactamente con la regla real del backend (`factura.cobranzas.some(c => !c.anulada)` bloquea).

**Roles:** verificado con `RolesGuard` real (no simulado) sobre los 4 handlers de escritura de `FacturasController` — `FACTURACION` y `ADMINISTRADOR` permitidos; `OPERACIONES`, `LIQUIDACIONES`, `GERENCIA` y sin usuario autenticado, rechazados. `LECTURA` puede consultar (`findAll`/`findOne`/`conciliacion`) pero no ejecutar.

**Concurrencia:** cubierta por el `SELECT ... FOR UPDATE` preexistente sobre `Factura`, sin cambios — verificado por inspección de código (no hay test de concurrencia real con DB, igual que el resto del módulo).

**Auditoría:** cada anulación de cobranza registra un `AuditLog` con `usuarioId`, `entidad: "Cobranza"`, `entidadId`, `accion: "anular"`, `datosAnteriores` (importe/fecha/medioPago previos) y `datosNuevos` (`anulada: true`, `motivo`) — verificado con test dedicado.

**Aislamiento multiempresa:** sin cambios de código (ya cubierto por la extensión de Prisma de Bloque 8.1.d) — verificado con tests que simulan `findUnique` devolviendo `null` para factura/cobranza de otra organización.

**Pruebas (backend, 19 nuevas):**

| Archivo | Tests | Contenido |
|---|---|---|
| `dto/anular-cobranza.dto.spec.ts` (nuevo) | 3 | motivo ausente, motivo vacío, motivo válido |
| `facturas.controller.cobranzas-anular.spec.ts` (nuevo) | 12 | anulación exitosa, reversión COBRADO_TOTAL→COBRADO_PARCIAL, auditoría, motivo ausente/vacío, factura inexistente, factura/cobranza de otra organización, cobranza inexistente, cobranza de otra factura, cobranza ya anulada, factura ANULADA (cobranza ya anulada por invariante), factura ANULADA con cobranza vigente/inconsistente (guard explícito nuevo) |
| `facturas.controller.anular-factura.spec.ts` (nuevo) | 4 | permite anular con todas las cobranzas anuladas, permite anular sin cobranzas, rechaza con una cobranza vigente, rechaza si la factura no existe |
| `facturas.roles.spec.ts` (existente, ajustado) | — | se sumó `GERENCIA` a la matriz de roles rechazados (sin sumar tests nuevos, mismo `it.each`) |

Base preexistente antes de FAC-3: **255 tests / 23 suites**. 255 + 19 = **274 tests / 26 suites**, confirmado por `npx jest --clearCache && npx jest`.

**Validación funcional (navegador real):** login local `admin@demo.com`/`Demo1234!`; factura `H11-ADV-002` (COBRADO_TOTAL, 2 cobranzas vigentes) — se anuló la cobranza de $150.000, se guardaron fecha y motivo, se recalcularon total cobrado y saldo, la factura pasó a `COBRADO_PARCIAL`, y el botón "Anular factura" no apareció porque quedaba otra cobranza vigente. Confirmado por el usuario.

**Regresiones:** ninguna esperada — `create()`, `registrarCobranza()` y el resto de endpoints no fueron tocados; suite completa (274/274) y build de ambos lados verdes.

**Builds y tests finales:** backend `npm run build` OK; `npx jest --clearCache && npx jest` → **26/26 suites, 274/274 tests**; frontend `tsc -b` (typecheck) y `vite build` OK.

**Deuda remanente identificada, fuera de alcance de FAC-3 (backlog):** falta recuperación por email/notificaciones sobre la anulación (explícitamente pospuesto por el usuario); `npm run start:dev` no carga `.env` automáticamente (no hay `dotenv`/`ConfigModule` antes de `validarEntorno()` en `main.ts`) — hay que exportar las variables al shell antes de levantar el backend local.

---

## FAC-4 — Auditoría del registro de cobranzas + fricciones de UX detectadas en su validación

**Brecha original:** durante la auditoría de FAC-3 se confirmó que `anularCobranza()` genera `AuditLog` correctamente, pero `registrarCobranza()` — el evento financiero más frecuente del módulo (toda cobranza que entra) — no generaba ninguno. No había forma de determinar quién registró un pago, sobre qué factura, cuándo, por qué importe o mediante qué medio. Tampoco existía ningún test para este endpoint (`registrarCobranza` no tenía spec dedicado antes de FAC-4).

### Atomicidad

La creación de la `Cobranza` y su `AuditLog` viven en la misma transacción (`this.prisma.$transaction(async (tx) => {...})`), igual que en `anularCobranza`: `tx.cobranza.create()` → `tx.auditLog.create()` → `tx.factura.update()`, en ese orden, dentro del mismo callback.

**Aclaración honesta:** los tests que simulan un fallo de `auditLog.create()` (mock rechazado) **no tienen una base de datos real detrás** — no demuestran un rollback físico en PostgreSQL. Lo que sí prueban, a nivel de código: la excepción se propaga fuera del callback de `$transaction`, y `factura.update()` (que corre después en el código) nunca llega a ejecutarse dentro de esa misma invocación. La atomicidad real — que `cobranza.create()` también se revierta en la base si algo posterior falla — es una garantía de las transacciones interactivas de Prisma/PostgreSQL, no algo que estos mocks reproduzcan ni que el equipo deba afirmar que reproducen. Este matiz quedó documentado como comentario dentro de los propios tests (`facturas.controller.registrar-cobranza.spec.ts`).

### Usuario obligatorio (nunca `usuarioId: null` en Cobranza)

`JwtAuthGuard` ya garantiza un usuario autenticado en cualquier request, pero como defensa en profundidad se agregó `asegurarUsuarioIdentificable(user)` en `facturas.controller.ts` — lanza `UnauthorizedException` si `!user?.id`, ejecutado **antes** de abrir la transacción en `registrarCobranza` **y** en `anularCobranza` (el mismo control aplica a ambos endpoints de Cobranza, no solo al nuevo). `usuarioId: user?.id || null` pasó a `usuarioId: user.id` en los dos, ya que el guard garantiza que nunca falta. No es una regresión sobre el comportamiento validado de FAC-3: el caso que ahora rechaza (`user` vacío) nunca era alcanzable en producción bajo `JwtAuthGuard`, solo endurece un camino teórico. Cubierto con 4 tests (2 por endpoint: `user` `undefined` y objeto sin `id`).

### Datos anteriores/posteriores

Cada `AuditLog` de `registrarCobranza` (`accion: "crear"`) registra:
- `datosAnteriores`: `facturaEstado`, `totalCobradoVigente` y `saldo` **antes** de la nueva cobranza.
- `datosNuevos`: `facturaId`, `clienteId` (disponible gratis desde `factura`, ya cargada por `findUnique`, sin consulta adicional), `importe`, `fecha`, `medioPago`, `observacion` (solo si existe — nunca la clave con valor vacío), `facturaEstado`, `totalCobradoVigente` y `saldo` **después**.
- `entidadId` usa el id real devuelto por `tx.cobranza.create()`, nunca un valor supuesto.

Verificado con reversiones reales: COBRADO_TOTAL→COBRADO_PARCIAL/FACTURADO y COBRADO_PARCIAL→FACTURADO, más los casos de pago parcial y pago que completa la factura.

### Inventario y sanitización de campos sensibles

Se recorrieron los **30 call-sites reales** de `auditLog.create()` en el backend (se excluyó `_combustibles.disabled/` por no estar registrado en `AppModule` — código muerto, no corre). Ningún módulo activo guarda `password`, `passwordHash`, `token`, `tokenHash` ni enlaces de recuperación completos en `datosAnteriores`/`datosNuevos`; los tokens reales viven siempre en `PasswordResetToken`/`InvitacionUsuario` como `tokenHash`, nunca copiados a un `AuditLog`. Dos casos con `usuarioId: null` ya existían, documentados y ajenos a Cobranza (`auth.service.ts`, `pago-consolidado.service.ts`): operaciones cross-organización donde la FK compuesta `[usuarioId, organizacionId]` no puede apuntar a un usuario de otra organización — el "quién" real se preserva como dato plano (`actorId`) dentro del JSON.

Como defensa en profundidad (no porque el inventario haya encontrado algo hoy), `AuditoriaAdministrativa.tsx` sanitiza en el único punto de salida hacia el administrador: `PATRON_CLAVE_SENSIBLE` (`password|contrase|hash|token|secret|clave|authorization|cookie|api[_-]?key`) reemplaza por `[oculto]` el valor de cualquier clave que matchee, sin importar qué módulo la haya escrito, presente o futuro.

### Medio de pago: obligatorio, atajos y opción "Otro"

**Auditoría de valores reales** (schema, seed, tests, datos locales): `Cobranza.medioPago` era `String?`, texto libre puro, sin enum en ningún lado del sistema. El seed no crea ninguna `Cobranza`. Los únicos valores con evidencia real (consulta `groupBy` sobre la base de desarrollo) fueron `TRANSFERENCIA`, `EFECTIVO` y una variante no normalizada `Transferencia` (cargada a mano en validaciones manuales previas).

**Primer intento (corregido por el usuario):** se restringió el DTO con `@IsIn(["TRANSFERENCIA","EFECTIVO"])`. El usuario señaló correctamente que eso convertía una mejora de UX en una restricción comercial nueva no solicitada — nada en el negocio dice que esos son los *únicos* medios aceptables.

**Diseño final:**
- `medioPago` es **obligatorio** (antes opcional) y ya **no tiene lista cerrada**: `@IsNotEmpty()` + `@MaxLength(60)` + normalización por `trim()` (`@Transform`, mismo helper `recortar` que `UpdateOrganizacionDto`) — cualquier descripción real no vacía es válida.
- Frontend (`Facturas.tsx`): select con `TRANSFERENCIA`/`EFECTIVO` como atajos rápidos + opción **"Otro"**, que despliega un input obligatorio (`maxLength=60`, mismo límite que el backend). El valor enviado y auditado (`medioPagoAEnviar`) es siempre la descripción tipeada — **nunca el literal `"OTRO"`**.
- El botón "Registrar cobranza" queda deshabilitado mientras no haya un medio confirmado (sin selección, o "Otro" con el campo todavía vacío) — nunca se registra una cobranza sin que el usuario confirme el medio.
- Tras un registro exitoso se resetean tanto el select como el campo de descripción personalizada.
- Cobranzas históricas con valores previos, no normalizados o nulos no se tocan ni se re-validan: la celda de solo lectura sigue imprimiendo el string tal cual.

### Opciones dinámicas de Auditoría Administrativa

Los filtros de texto libre "Entidad"/"Acción" (que quedaban obsoletos en cuanto alguien tipeaba un valor que ya no existía) se reemplazaron por selects poblados desde `GET /organizacion/auditoria/opciones` (nuevo, `@Roles("ADMINISTRADOR")`): usa `auditLog.groupBy({by:["entidad"]})` / `groupBy({by:["accion"]})`, ordena alfabéticamente y no depende de ninguna lista manual — cualquier `entidad`/`accion` que un módulo futuro registre aparece sola. Cada select agrega la opción **"Todas"** (`value=""`), mapeando exactamente al mismo comportamiento de "sin filtro" que ya tenía el input de texto. Filtros, paginación y contrato con el backend quedaron intactos.

Además, la tabla de resultados muestra ahora **"Antes"** (`datosAnteriores`) y **"Después"** (`datosNuevos`) como columnas separadas — la versión anterior usaba `datosNuevos || datosAnteriores`, que ocultaba uno de los dos estados cuando ambos existían.

### Roles y aislamiento multiempresa

- `GET /organizacion/auditoria/opciones`: `@Roles("ADMINISTRADOR")`, verificado con `RolesGuard` real sobre `GERENCIA`/`OPERACIONES`/`LIQUIDACIONES`/`FACTURACION`/`LECTURA`/sin usuario (todos rechazados) y `ADMINISTRADOR` (permitido).
- Aislamiento: `groupBy` es uno de los métodos cubiertos por la extensión de Prisma de Bloque 8.1.d (inyecta `organizacionId` automáticamente) — a diferencia de auditorías anteriores de este bloque, acá se probó con **datos reales de dos organizaciones distintas** (no solo declarado): nueva sección G en `organizacion-prisma.client.spec.ts`, contra la base local real, que crea dos `Organizacion` + `AuditLog` temporales, confirma que `groupBy` de una organización nunca incluye la entidad/acción exclusiva de la otra, y limpia sus propios datos en `afterAll` (verificado sin residuos tras la corrida).

### Pruebas — reconciliación completa (274 → 317, +43 a lo largo de todo FAC-4)

| Archivo | Tests | Contenido |
|---|---|---|
| `dto/registrar-cobranza.dto.spec.ts` (nuevo) | 14 | válido completo, importe cero/negativo, fecha inválida, sin fecha/importe/medioPago, TRANSFERENCIA/EFECTIVO aceptados, medioPago ausente/vacío/solo-espacios rechazado, medio personalizado aceptado, trim sin rechazar, longitud excesiva rechazada, longitud límite aceptada |
| `facturas.controller.registrar-cobranza.spec.ts` (nuevo) | 17 | registro exitoso (1 cobranza + 1 auditoría), ID real de `cobranza.create()`, contenido completo de la auditoría, omisión de `observacion`, estados/totales/saldos anterior-posterior, pago parcial, pago que completa la factura, factura inexistente, factura de otra organización, factura anulada, importe que supera el saldo, sin auditoría duplicada, fallo simulado de `auditLog.create` (con la aclaración honesta sobre qué prueba y qué no), guard de usuario no identificable (2 variantes), auditoría con medio personalizado exacto (nunca "OTRO"), guard defensivo de medioPago vacío |
| `facturas.controller.cobranzas-anular.spec.ts` (existente, ajustado) | +2 | guard de usuario no identificable aplicado también a `anularCobranza` (2 variantes) |
| `organizacion.roles.spec.ts` (nuevo) | 4 | matriz de roles para `auditoriaOpciones` |
| `organizacion.controller.auditoria-opciones.spec.ts` (nuevo) | 4 | orden alfabético, delegación sin filtro manual, ausencia de duplicados, listas vacías |
| `organizacion-prisma.client.spec.ts` (existente, ajustado) | +2 | aislamiento real de `groupBy` entre dos organizaciones (sección G, DB local, con limpieza propia) |

Base preexistente antes de FAC-4 (cierre de FAC-3): **274 tests / 26 suites**. 274 + 43 = **317 tests / 30 suites**, confirmado por `npx jest --clearCache && npx jest`.

### Validación funcional (navegador real)

Aprobada por el usuario en tres rondas sucesivas, cubriendo: registro de cobranza con auditoría completa (factura `FC-RC13-0001`, pago parcial + total); columnas "Antes"/"Después" mostrando estado/total cobrado/saldo anterior y posterior con usuario identificado; selectores de Entidad/Acción con "Todas" y filtrado real por `crear`/`Cobranza`; medio de pago obligatorio con `TRANSFERENCIA`/`EFECTIVO`/"Otro" y descripción personalizada; reset del selector tras un registro exitoso; auditoría mostrando siempre el medio confirmado, nunca el literal `"OTRO"`. Sin regresiones sobre `anularCobranza`/FAC-3 (recálculo de saldo/estado tras anular verificado en la misma sesión).

**Regresiones:** ninguna esperada — `create()`, `anular()` (factura), `anularCobranza()` no cambiaron su lógica de negocio; suite completa (317/317) y build de ambos lados verdes.

**Builds y tests finales:** backend `npm run build` OK; `npx jest --clearCache && npx jest` → **30/30 suites, 317/317 tests**; frontend `tsc -b` (typecheck) y `vite build` OK.

**Deuda remanente identificada, fuera de alcance de FAC-4 (backlog):** recuperación por email/notificaciones sobre el registro de cobranzas (explícitamente pospuesto); `npm run start:dev` sigue sin cargar `.env` automáticamente (mismo hallazgo que FAC-3, todavía sin resolver — bloque técnico separado).

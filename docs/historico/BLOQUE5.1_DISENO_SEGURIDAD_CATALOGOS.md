# Bloque 5.1 — Diseño Técnico: Seguridad del Módulo Catálogos

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Responde a `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md`, con el mismo nivel de rigor que los diseños de los Bloques 3 y 4.

---

## 0. Alcance

**En alcance:**
1. Cerrar los 3 hallazgos P0 y los 3 P1 principales de la auditoría: control de acceso por rol en los 15 endpoints mutantes de `CatalogosModule`, validación de `activo` al referenciar catálogos desde `Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto`, y filtrado de `activo:true` por defecto en listados/exports/selects.
2. Extender el concepto de soft-delete (`activo`) a `Chofer` y `Vehiculo` (hallazgo #7), dada su relación directa con la rotación real de personal y flota.
3. Diseño conceptual del lado frontend (qué debería cambiar, sin escribir código) para que la UI deje de exponer funciones a roles sin permiso y para que los selects distingan catálogos inactivos.

**Fuera de alcance de este documento** (señalados en la auditoría, a resolver aparte si se decide):
- Extender `activo` a `Cereal`/`Ubicacion`/`TipoGasto` (impacto/beneficio menor, ver hallazgo #7 con prioridad diferenciada).
- Gestión de usuarios vía API/UI (ya fuera de alcance de v1.0 según `ROADMAP_SDC_V1.md`).
- Decisión sobre si `LECTURA` debe o no ver `GET /clientes/:id/cuenta-corriente` (hallazgo #13) — es una pregunta de negocio, no técnica, se deja como punto de decisión abierto (sección 10).
- UI de edición/baja para catálogos (hallazgo #12, ya cubierto conceptualmente en `BLOQUE5_AUDITORIA_PRODUCTO.md` F6/5.6 del roadmap) — este documento solo asegura que, cuando esa UI se construya, tenga un backend que la respalde correctamente; no diseña los formularios en sí.

---

## 1. Causa raíz

**`CatalogosModule` fue el único módulo de negocio que nunca recibió la capa `RolesGuard`/`@Roles` que sí se aplicó, desde el principio, a `ViajesModule`, `AnticiposModule`, `FacturasModule` y `LiquidacionesModule`.** No es un descuido puntual en un endpoint — es la ausencia sistemática de una capa entera en 5 controllers completos (`clientes`, `transportistas`, `choferes`, `vehiculos`, `simples`). El propio código del proyecto ya tenía, en el módulo deshabilitado de combustibles, una matriz de roles granular pensada para datos de catálogo/operación — la convención existía, simplemente nunca se extendió a `CatalogosModule` cuando se construyó.

La causa raíz de los hallazgos de integridad (sección 3 de la auditoría) es distinta y más simple: `activo` se agregó a `Cliente`/`Transportista` como un campo de schema, pero **nunca se completó el circuito** — se implementó el "apagado" (`DELETE` → `activo:false`) sin implementar ninguno de los dos lados que le dan sentido: (a) que los listados/selects dejen de mostrarlo por defecto, y (b) que los `create()` de otros módulos rechacen referenciarlo. Un soft-delete sin ninguno de esos dos efectos no es, en la práctica, un soft-delete — es solo una etiqueta visual en una columna que nadie consulta.

---

## 2. Decisiones de diseño

### 2.1 Matriz de roles propuesta para `CatalogosModule`

**Principio general, consistente con el patrón ya usado en los 4 controllers protegidos:** los `GET` (lectura, incluidos exports y `findOne`) quedan sin `@Roles` — cualquier usuario autenticado puede consultar catálogos, igual que hoy puede consultar viajes/facturas/liquidaciones sin restricción de rol en sus lecturas. Las mutaciones (`POST`/`PATCH`/`DELETE`) sí llevan `@Roles(...)`.

| Catálogo | Roles propuestos para mutación | Justificación |
|---|---|---|
| Clientes | `OPERACIONES`, `FACTURACION`, `ADMINISTRADOR` | Operaciones da de alta clientes al armar un viaje nuevo; Facturación interactúa directamente con clientes al facturar — ambos tienen un motivo de negocio legítimo para mantenerlos. |
| Productores | `OPERACIONES`, `ADMINISTRADOR` | Dato exclusivamente ligado al armado de un viaje. |
| Transportistas | `OPERACIONES`, `ADMINISTRADOR` | Mismo criterio que Productores — dato maestro de logística, gestionado por quien arma los viajes. |
| Choferes (incluida `comisionPct`) | `OPERACIONES`, `LIQUIDACIONES`, `ADMINISTRADOR` | Alta/datos personales del chofer son de Operaciones; `comisionPct` fue diseñada en el Bloque 3.2 específicamente para uso de Liquidaciones — ambos roles tienen un motivo legítimo, a diferencia de Facturación/Gerencia/Lectura. |
| Vehículos | `OPERACIONES`, `ADMINISTRADOR` | Dato de flota, ligado al armado de viajes. |
| Cereales | `OPERACIONES`, `ADMINISTRADOR` | Catálogo de referencia para el alta de viajes. |
| Ubicaciones | `OPERACIONES`, `ADMINISTRADOR` | Ídem. |
| Tipos de gasto | `OPERACIONES`, `LIQUIDACIONES`, `ADMINISTRADOR` | Consumido principalmente por Anticipos (Operaciones/Liquidaciones ya comparten permisos sobre `AnticipoGasto` — ver `anticipos.controller.ts:204,226,243`, `@Roles("LIQUIDACIONES","OPERACIONES","ADMINISTRADOR")` — se replica el mismo criterio). |

`GERENCIA` y `LECTURA` quedan sin permisos de mutación en ningún catálogo, consistente con su rol de solo-consulta/supervisión en el resto del sistema (ninguno de los 2 tiene `@Roles` en ningún endpoint mutante de Viajes/Facturas/Liquidaciones/Anticipos tampoco).

**Punto de decisión (sección 10):** esta matriz es una propuesta razonada por analogía con el resto del sistema, no una certeza de negocio — se presenta para tu ajuste antes de implementar.

### 2.2 Validación de `activo` al crear operaciones nuevas

**Regla:** `ViajesController.create()`, `FacturasController.create()`, `LiquidacionesController.create()` y `AnticiposController.create()` deben rechazar la operación (con `400` y mensaje explícito) si cualquiera de los catálogos referenciados (`Cliente`, `Transportista`, `Chofer` una vez extendido `activo`) está inactivo.

- `ViajesController.create()`: validar `Cliente.activo`, `Transportista.activo`, `Chofer.activo` (una vez agregado, ver 2.3), `Productor.activo` (si se decide extenderlo, fuera de alcance por defecto).
- `FacturasController.create()`: validar `Cliente.activo` — ya trae el cliente indirectamente vía `clienteId` en el `where` de viajes elegibles (`facturas.controller.ts:256-263`); agregar la verificación de `activo` es un chequeo adicional de bajo costo en el mismo punto.
- `LiquidacionesController.create()`: validar `Transportista.activo`/`Chofer.activo` — ya se hace `findUnique` de `Chofer` cuando `tipo==="CHOFER"` (`liquidaciones.controller.ts:334-336`, desde el Bloque 3.2); es el lugar natural para agregar la verificación.
- `AnticiposController.create()`: validar `Transportista.activo`/`Chofer.activo`.

**No se propone** bloquear la edición (`update()`) de un `Viaje`/`Factura`/`Liquidacion` ya existente si el catálogo referenciado se desactiva *después* de creada la operación — eso rompería el historial y no es el problema que la auditoría identificó (el problema es crear operaciones *nuevas* contra un catálogo ya inactivo, no las que ya existían cuando estaba activo).

### 2.3 Extender `activo` a `Chofer` y `Vehiculo`

**Recomendación: sí, extenderlo a ambos**, dado que:
- Es exactamente el mismo patrón ya validado para `Cliente`/`Transportista` — replicar una convención ya probada, no inventar una nueva.
- La rotación de choferes (personal que deja de trabajar para el transportista) y de vehículos (venta, baja de flota) es una realidad operativa concreta para una empresa de transporte, a diferencia de `Cereal`/`Ubicacion`/`TipoGasto`, que rara vez necesitan "retirarse" (un tipo de cereal o una ubicación geográfica no dejan de existir).
- No se puede hacer un hard-delete de ninguno de los dos sin romper referencias históricas (`Viaje.choferId`, `Viaje.camionId`/`acopladoId`, `AnticipoGasto.choferId`/`transportistaId`, `LiquidacionViaje` indirectamente vía `Liquidacion.choferId`) — el soft-delete es la única opción que preserva historial.

**No se propone** extenderlo a `Cereal`/`Ubicacion`/`TipoGasto` en este mismo sub-bloque — el beneficio es menor (bajo o nulo turnover real de estos catálogos) y agregarlo igual no cuesta nada hacerlo después, de forma independiente, si se decide.

### 2.4 Comportamiento de `findAll()` — filtro por defecto, con opción de ver inactivos

**Regla:** `GET /clientes`, `/transportistas`, `/choferes`, `/vehiculos` filtran `where: {activo: true}` **por defecto**. Se agrega un query param opcional (`?incluirInactivos=true`) que, cuando se manda, devuelve todos (activos e inactivos) — necesario para que una futura pantalla de administración pueda listar/reactivar inactivos, y para que los exports Excel/PDF (que hoy muestran la columna "Estado") sigan pudiendo mostrar el historial completo si se les pasa el mismo parámetro.

**Los exports (`export/excel`, `export/pdf`) mantienen el comportamiento de traer todos por defecto** (no tiene sentido que un reporte de auditoría/histórico excluya inactivos silenciosamente) — la diferencia es que los **selects usados para crear operaciones nuevas** (consumidos por `ViajeForm`, `Facturas`, `Liquidaciones`, `Anticipos`) deben usar el `findAll` filtrado (sin el query param), mientras que una futura pantalla de "ver todos los clientes/transportistas, incluidos inactivos" usaría el parámetro explícito.

### 2.5 Reactivación simétrica

**Regla:** agregar `activo?: boolean` a `UpdateClienteDto` (hoy ausente), espejando lo que `UpdateTransportistaDto` ya tiene — para que `PATCH /clientes/:id` pueda tanto dar de baja como reactivar, igual que Transportista, cerrando la asimetría del hallazgo #8. Ambos quedan protegidos por el mismo `@Roles` de la sección 2.1 — hoy esa asimetría existe además sin ninguna protección de rol, así que este cambio conviene hacerse en el mismo commit que 2.1, no antes.

### 2.6 Bloqueo de edición sobre un registro inactivo — evaluado y no recomendado por ahora

Se evaluó bloquear `PATCH` sobre un `Cliente`/`Transportista`/`Chofer`/`Vehiculo` ya inactivo (hallazgo #9), pero **no se recomienda bloquearlo**: existe un caso de uso legítimo (corregir un dato de un registro inactivo antes de reactivarlo, o simplemente corregir un error de tipeo en un CUIT histórico) que un bloqueo total impediría. Se prioriza **no** replicar acá el patrón de bloqueo estricto usado en `ViajesController` (Bloque 4.1) porque el contexto es distinto: un viaje bloqueado por facturación/liquidación protege snapshots financieros ya congelados; un cliente inactivo no tiene ningún snapshot que proteger, solo un estado operativo. Queda como hallazgo P2 documentado, sin acción propuesta en este bloque.

---

## 3. Alternativas evaluadas

### 3.1 Alcance del control de acceso: ¿matriz por catálogo o un único rol para todo `CatalogosModule`?

- **Alternativa A — Un solo par de roles para los 8 catálogos** (ej. `OPERACIONES`, `ADMINISTRADOR` para todo, sin distinguir Choferes/TiposGasto). Más simple de implementar y de razonar, pero ignora que `comisionPct` de Chofer y `TipoGasto` tienen un vínculo real con `LIQUIDACIONES` ya establecido en otras partes del sistema (Bloque 3.2, `anticipos.controller.ts`).
- **Alternativa B — Matriz diferenciada por catálogo (recomendada, sección 2.1).** Más fiel a cómo ya está repartida la responsabilidad de negocio en el resto del sistema, mismo esfuerzo de implementación (es una lista de decoradores, no lógica adicional).

**Recomendación: Alternativa B.**

### 3.2 Validación de `activo`: ¿bloqueo estricto o advertencia no bloqueante?

- **Alternativa A — Advertencia no bloqueante** (permitir crear el viaje/factura/liquidación igual, pero devolver un aviso). Se descarta: no cierra el hallazgo de integridad real (sigue siendo posible generar operaciones financieras contra un catálogo dado de baja), y el patrón de "advertencia que no bloquea nada" ya demostró ser inefectivo en este mismo sistema (es, en esencia, lo que pasa hoy con la columna "Estado" que nadie filtra).
- **Alternativa B — Bloqueo estricto con `400` (recomendada).** Consistente con el resto de guardas ya construidas en los Bloques 4.1-4.3 (mensajes de negocio claros en vez de fallar silenciosamente o permitir datos inconsistentes).

**Recomendación: Alternativa B.**

### 3.3 `activo` en `Chofer`/`Vehiculo`: ¿campo booleano simple o algo más granular (ej. motivo de baja, fecha)?

- **Alternativa A — Booleano simple `activo Boolean @default(true)`, espejando `Cliente`/`Transportista` exactamente.** Consistente, mínimo, sin inventar un concepto nuevo.
- **Alternativa B — Agregar también `activoMotivo`/`activoFecha`** (mismo patrón que `AnticipoGasto.anulado`/`anuladoMotivo` o `Cobranza.anulada`/`anuladaMotivo`/`anuladaFecha`). Da más trazabilidad, pero ninguno de los 2 catálogos que ya tienen `activo` (`Cliente`, `Transportista`) tiene motivo/fecha — agregarlo solo para Chofer/Vehiculo generaría una inconsistencia nueva entre catálogos hermanos.

**Recomendación: Alternativa A**, por consistencia con el patrón ya establecido en `Cliente`/`Transportista` — si en el futuro se decide que hace falta trazabilidad de motivo/fecha, debería aplicarse a los 4 catálogos a la vez, no solo a 2.

---

## 4. Migraciones necesarias

Una sola migración, puramente aditiva:

- `Chofer.activo Boolean @default(true)` — no nullable, con default, sin backfill (todos los choferes existentes son activos hoy, `true` es el valor correcto).
- `Vehiculo.activo Boolean @default(true)` — ídem.

100% expresable en el DSL de Prisma — sin SQL manual, mismo perfil de bajo riesgo que las migraciones aditivas de los Bloques 3.1/4.2/4.3. No toca `Cliente`, `Transportista`, ni ninguna otra tabla. No requiere `DELETE`/`DROP` de nada existente.

**Sin migración para el resto de los cambios de este bloque** — el control de acceso (`@Roles`) y el filtro de `findAll` son cambios de código puro, sin impacto de schema; agregar `activo` a `UpdateClienteDto` tampoco requiere migración (el campo `activo` ya existe en `Cliente` desde antes).

---

## 5. Impacto en frontend (conceptual — sin código en este documento)

- **`Layout.tsx`:** las entradas de navegación `/clientes` y `/transportistas` deberían pasar de `roles: null` a listar los mismos roles que la sección 2.1 autoriza a mutar (`OPERACIONES`, `FACTURACION` para Clientes; `OPERACIONES` para Transportistas), más `ADMINISTRADOR` — a menos que se decida que **ver** el listado de clientes/transportistas (sin poder mutarlo) siga abierto a todos los roles, en cuyo caso el link permanece visible para todos, pero los formularios de alta dentro de esas páginas deberían ocultarse condicionalmente según el rol del usuario autenticado (disponible vía `useAuth()`, ya usado en `Layout.tsx:17`).
- **`Clientes.tsx`/`Transportistas.tsx`:** el formulario "Nuevo cliente"/"Nuevo transportista" y los mini-formularios "+ Chofer"/"+ Vehículo" deberían condicionarse a que `usuario.rol` esté en la lista permitida — mismo patrón que ya usa `Layout.tsx` para decidir qué linkear.
- **`ViajeForm.tsx`, `Facturas.tsx`, `Liquidaciones.tsx`, `Anticipos.tsx`:** sin cambios de comportamiento necesarios si el backend ya filtra `activo:true` por defecto en `findAll` (sección 2.4) — los selects dejarían de mostrar inactivos automáticamente, sin tocar el código de estas 4 páginas.
- **`App.tsx`:** agregar un guard de ruta genérico por rol (un componente `RequireRole` envolviendo las rutas sensibles) cerraría el hallazgo #11 de forma pareja para todos los módulos, no solo Catálogos — se señala acá porque este bloque lo evidencia con más fuerza, pero es una mejora transversal (ya listada como sub-bloque 5.13 del roadmap general).

Ninguno de estos cambios de frontend se implementa en este documento — quedan descritos para cuando se apruebe la implementación.

---

## 6. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Algún flujo real de negocio hoy depende, sin documentarlo, de que un rol no contemplado en la matriz de la sección 2.1 pueda mutar un catálogo (ej. Gerencia dando de alta un cliente en la práctica, aunque no sea "su" función formal). | Media | Antes de implementar, confirmar la matriz de roles con el uso real observado, no solo con la analogía del resto del sistema — es exactamente el punto de decisión de la sección 10. |
| 2 | Bloquear la creación de operaciones contra catálogos inactivos (sección 2.2) podría interrumpir un flujo en curso si alguien desactivó un transportista/cliente por error. | Baja | Ya existe reactivación (sección 2.5); el mensaje de error de `400` debe ser explícito ("este cliente está dado de baja, reactívelo primero") para que el camino de corrección sea obvio, mismo criterio que las guardas de los Bloques 4.1-4.3. |
| 3 | Migración de `activo` en `Chofer`/`Vehiculo`, aunque aditiva, requiere tocar 2 controllers adicionales (crear la verificación de `activo` en los `create()` de Liquidaciones/Anticipos/Viajes) — más superficie de cambio que un típico sub-bloque de 4.x. | Media | Separar en dos entregas si se prefiere: primero `RolesGuard` (P0, aislado, sin dependencias), después la extensión de `activo` + validación de integridad (P1, con más superficie). Ver plan de pruebas, ambos son independientes entre sí. |
| 4 | El filtro por defecto de `findAll` (sección 2.4) podría "esconder" del uso normal a un cliente/transportista que alguien necesita ver puntualmente sin reactivarlo (ej. para consultar histórico). | Baja | El query param `?incluirInactivos=true` cubre este caso sin reintroducir el problema de mostrarlos siempre. |

---

## 7. Plan de pruebas

**Control de acceso (P0):**
1. Con usuario `LECTURA`: `POST /clientes`, `/transportistas`, `/choferes`, `/vehiculos`, `/cereales`, `/ubicaciones`, `/tipos-gasto`, `/productores` → todos deben responder `403`.
2. Con usuario `LECTURA`: `PATCH`/`DELETE` de los mismos → `403`.
3. Con usuario `OPERACIONES`: alta de cliente, transportista, chofer, vehículo, cereal, ubicación, productor → `200`/`201`.
4. Con usuario `LIQUIDACIONES`: `PATCH /choferes/:id` con `comisionPct` → `200`. Con usuario `FACTURACION`: mismo intento → `403`.
5. Con usuario `FACTURACION`: `POST /clientes` → `200`. Con usuario `GERENCIA`: mismo intento → `403`.
6. Con usuario `ADMINISTRADOR`: cualquier mutación en cualquier catálogo → `200`, siempre (verifica que el bypass de `RolesGuard` para admin sigue funcionando).
7. Regresión: `GET` de todos los catálogos sigue funcionando sin restricción para los 6 roles.
8. Frontend: usuario `LECTURA` navega a `/clientes` → ya no ve el formulario "Nuevo cliente" (una vez implementado el cambio de frontend de la sección 5).

**Integridad — validación de `activo` (P1):**
9. Dar de baja un `Cliente` → intentar `POST /facturas` referenciándolo → `400` con mensaje explícito.
10. Dar de baja un `Transportista` → intentar `POST /viajes` referenciándolo → `400`.
11. Dar de baja un `Chofer` (una vez agregado `activo`) → intentar `POST /liquidaciones` de tipo `CHOFER` referenciándolo → `400`. Mismo caso para `POST /anticipos`.
12. Reactivar el `Cliente`/`Transportista`/`Chofer` de los casos anteriores → repetir la operación → ahora `200`/`201`.
13. `GET /clientes`, `/transportistas`, `/choferes`, `/vehiculos` sin query param → no incluyen los dados de baja. Con `?incluirInactivos=true` → sí los incluyen.
14. Exports Excel/PDF de Clientes/Transportistas → siguen mostrando activos e inactivos con su columna "Estado" (regresión, sin cambios).
15. `ViajeForm.tsx`/`Facturas.tsx`/`Liquidaciones.tsx`/`Anticipos.tsx`: los selects ya no muestran clientes/transportistas dados de baja (una vez que el filtro de `findAll` esté activo, sin ningún cambio de código en estas páginas).
16. `PATCH /clientes/:id` con `{activo: true}` sobre un cliente dado de baja → lo reactiva (cierre del hallazgo #8).

**Regresión transversal:**
17. Todo el ciclo de Viajes/Liquidaciones/Facturas/Cobranzas de los Bloques 4.1-4.3 sigue funcionando igual sobre catálogos activos (sin cambios de comportamiento para el caso normal).

---

## 8. Plan de rollback

- **`@Roles(...)` en los 15 endpoints (P0):** revertir es trivial y no destructivo — quitar los decoradores deja el comportamiento exactamente como está hoy. Sin datos involucrados.
- **Migración `activo` en `Chofer`/`Vehiculo`:** aditiva, mismo perfil que las migraciones ya hechas en los Bloques 3-4 — revertir es un `DROP COLUMN` seguro, sin pérdida de otros datos. Único dato que se pierde al revertir es el propio estado `activo`/`inactivo` que se haya cargado durante la ventana en que estuvo activo.
- **Validación de `activo` en los 4 `create()`:** revertir el código deja el comportamiento actual (sin bloqueo), sin necesidad de tocar el schema.
- **Filtro por defecto en `findAll`:** revertir es quitar el `where`, sin pérdida de datos — los registros inactivos nunca se borran, solo se dejan de mostrar por defecto.
- Ningún rollback de este bloque implica pérdida de datos de negocio.

---

## 9. Criterios de aceptación

1. Ningún endpoint mutante de `CatalogosModule` es accesible por un rol fuera de la matriz de la sección 2.1; `ADMINISTRADOR` sigue teniendo acceso total.
2. `GET` de todos los catálogos sigue sin restricción de rol.
3. Un `Cliente`/`Transportista`/`Chofer` dado de baja no puede referenciarse en un `Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto` nuevo — la operación se rechaza con `400` y un mensaje que indique cómo resolverlo (reactivar primero).
4. `Chofer` y `Vehiculo` tienen el mismo mecanismo de soft-delete que `Cliente`/`Transportista`, sin pérdida de historial en viajes/liquidaciones/anticipos ya existentes que los referencien.
5. Los listados y selects de creación de operaciones nuevas excluyen catálogos inactivos por defecto; un query param explícito permite verlos igual cuando hace falta (exports, pantallas de administración futuras).
6. `Cliente` puede reactivarse vía `PATCH` igual que `Transportista` (cierre de la asimetría del hallazgo #8).
7. Ninguna operación histórica (viajes/facturas/liquidaciones/anticipos ya creados) cambia de comportamiento retroactivamente.
8. Build y typecheck limpios; el plan de pruebas de la sección 7 pasa contra la base local.

---

## 10. Puntos de decisión pendientes para tu aprobación

1. **Matriz de roles de la sección 2.1** — ¿la aprobás tal cual, o querés ajustar algún catálogo (en particular Clientes con `FACTURACION`, y Choferes/TiposGasto con `LIQUIDACIONES`)?
2. **Extensión de `activo` a `Chofer`/`Vehiculo` (sección 2.3)** — ¿se incluye en este mismo sub-bloque, o se separa en dos entregas (primero `RolesGuard`, que es aislado y sin dependencias; después la extensión de `activo` + validación de integridad, que toca más controllers)?
3. **`GET /clientes/:id/cuenta-corriente` sin restricción de rol (hallazgo #13)** — ¿debe `LECTURA` poder ver el estado de cuenta financiero de un cliente, o se restringe también? No es parte del alcance de control de acceso de mutaciones, pero quedó expuesto en la auditoría y conviene decidirlo junto con el resto.
4. **Cambios de frontend de la sección 5** — ¿se implementan en el mismo sub-bloque que el backend, o se separan (el backend ya cierra el riesgo de seguridad real; el frontend es consistencia de UX, que podría ir en el sub-bloque 5.13 del roadmap general)?

No se implementó nada de este diseño — queda a la espera de tu revisión y de tus respuestas a los 4 puntos anteriores antes de tocar código.

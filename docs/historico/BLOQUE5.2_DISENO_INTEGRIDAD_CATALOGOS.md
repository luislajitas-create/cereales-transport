# Bloque 5.2 — Diseño Técnico: Entrega 2 de Seguridad/Integridad de Catálogos

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generó ninguna migración, no se tocó la base de datos, no se hizo commit. Es la continuación directa de `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md`: aquella Entrega 1 (control de acceso por rol) ya está implementada y en `main` (`258e8a4 feat(catalogos): enforce role-based access control on mutating endpoints`). Este documento cierra los hallazgos **P1** de `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md` que quedaron fuera de esa primera entrega: extensión de `activo` a `Chofer`/`Vehiculo`, filtrado por defecto de catálogos inactivos, y validación de integridad en los `create()` de Viajes/Anticipos/Liquidaciones/Facturas.

Todo el código citado abajo fue releído hoy contra el estado actual del repo (post-`258e8a4`), no contra la auditoría original — donde algo cambió desde el 5.1, se señala explícitamente.

---

## 0. Alcance

**En alcance (según lo pedido):**
1. Soft-delete (`activo`) para `Chofer` y `Vehiculo`.
2. Filtrado de catálogos inactivos en listados y selects usados para crear operaciones nuevas.
3. Validación de `activo` en `ViajesController.create()`, `AnticiposController.create()`, `LiquidacionesController.create()`, `FacturasController.create()`.
4. Definición explícita de qué pasa con historial ya existente que referencia catálogos luego inactivados.

**Fuera de alcance (heredado de la decisión ya tomada en 5.1, sin cambios):**
- `Cereal`, `Ubicacion`, `TipoGasto`, `Productor` no reciben `activo` — mismo criterio de la sección 2.3 del diseño 5.1 (bajo/nulo turnover real).
- Gating de rol en el frontend (`Layout.tsx` con `roles: null` para `/clientes` y `/transportistas`, guard de rutas en `App.tsx`) — es una mejora de UX distinta (evita un 403 después de un clic, no cierra ningún agujero de seguridad ya que el backend protege desde la Entrega 1); pertenece al sub-bloque 5.13 del roadmap general. Se señala en la sección 6 pero no se diseña acá.
- UI de edición/baja con formularios para ningún catálogo (hallazgo #12 de 5.1, F6 del roadmap) — este documento asegura que el backend tenga el soporte correcto; no diseña pantallas.

---

## 1. Hallazgos actuales (releídos hoy contra el código real)

| # | Hallazgo | Archivo:línea | Estado |
|---|---|---|---|
| H1 | `Chofer` y `Vehiculo` no tienen campo `activo` en el schema | `schema.prisma:137-168` | Sin cambios desde 5.1 |
| H2 | `ChoferesController`/`VehiculosController` no tienen endpoint `DELETE` (no existe forma de "retirar" un chofer/vehículo, ni siquiera vía API directa) | `choferes.controller.ts`, `vehiculos.controller.ts` | Sin cambios desde 5.1 |
| H3 | `ClientesController.findAll()`/`TransportistasController.findAll()`/`ChoferesController.findAll()`/`VehiculosController.findAll()` no filtran `activo:true` | `clientes.controller.ts:21-24`, `transportistas.controller.ts:17-23`, `choferes.controller.ts:17-23`, `vehiculos.controller.ts:14-20` | Sin cambios desde 5.1 |
| H4 | `UpdateClienteDto` no incluye `activo` — `Cliente` sigue sin poder reactivarse vía `PATCH`, a diferencia de `Transportista` (`UpdateTransportistaDto.activo?: boolean`) | `update-cliente.dto.ts:1-23` vs. `update-transportista.dto.ts:16-18` | Sin cambios desde 5.1 |
| H5 | Ningún `create()` de Viaje/Factura/Liquidación/Anticipo valida `activo` de los catálogos que referencia | `viajes.controller.ts:135-164`, `facturas.controller.ts:256-308`, `liquidaciones.controller.ts:313-...`, `anticipos.controller.ts:205-224` | Sin cambios desde 5.1 |
| H6 (nuevo, no estaba explícito en 5.1) | `FacturasController.create()` ni siquiera verifica que `Cliente` exista — solo filtra los `Viaje` por `clienteId` (`facturas.controller.ts:266-273`); un `clienteId` inexistente pasaría el filtro de viajes (devolviendo `0` coincidencias, lo cual sí frena la operación indirectamente) pero un `clienteId` de un cliente inactivo con viajes propios pendientes de facturar **no se frena en ningún punto** | `facturas.controller.ts:256-273` | Confirmado hoy |
| H7 (nuevo) | `LiquidacionesController.create()` con `tipo==="TRANSPORTISTA"` nunca hace `findUnique` de `Transportista` — a diferencia del caso `tipo==="CHOFER"` que sí trae el `Chofer` (línea 334) | `liquidaciones.controller.ts:313-353` | Confirmado hoy |
| H8 | `TransportistasController.findAll()`/`findOne()` incluyen `choferes`/`vehiculos` anidados sin filtrar `activo` — esto es intencional de preservar (ver sección 3) pero hay que decidirlo explícitamente para no dejarlo como omisión | `transportistas.controller.ts:19-22, 27-30` | Punto de decisión, sección 3 |
| H9 | Exports Excel/PDF de Choferes ya existen (`choferes.controller.ts:42-136`) y usan `findMany` propio, no pasan por `findAll()` — no se ven afectados por el filtro que se agregue a `findAll()`, ya muestran todo | `choferes.controller.ts:44-46, 82-84` | Confirmado, sin acción necesaria |

---

## 2. Qué modelos necesitan campo `activo`

| Modelo | Tiene `activo` hoy | Se agrega en este bloque | Justificación |
|---|---|---|---|
| `Cliente` | Sí | — | Ya existe; se completa el circuito (filtro + validación), no el campo. |
| `Transportista` | Sí | — | Ídem. |
| `Chofer` | No | **Sí** | Rotación real de personal — ver sección 2.3 de `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md`, decisión ya razonada y no reabierta acá. |
| `Vehiculo` | No | **Sí** | Baja de flota (venta, siniestro) — mismo razonamiento. |
| `Cereal`, `Ubicacion`, `TipoGasto`, `Productor` | No | No | Fuera de alcance, decisión ya tomada en 5.1 (sección 0 de este documento). |

---

## 3. Endpoints que deben filtrar `activo:true` por defecto

Regla general (idéntica a la ya aprobada conceptualmente en 5.1 sección 2.4): **los endpoints usados para poblar selects de creación de operaciones nuevas filtran por defecto; los endpoints de exportación/auditoría y las vistas de administración de catálogo no filtran.**

| Endpoint | Filtra por defecto | Query param para ver todos | Consumido por (selects de alta) |
|---|---|---|---|
| `GET /clientes` | **Sí** (nuevo) | `?incluirInactivos=true` | `ViajeForm.tsx:38`, `Facturas.tsx:24` |
| `GET /transportistas` | **Sí** (nuevo) | `?incluirInactivos=true` | `ViajeForm.tsx:40`, `Liquidaciones.tsx:28`, `Anticipos.tsx:24` |
| `GET /choferes` | **Sí** (nuevo) | `?incluirInactivos=true` | `ViajeForm.tsx:57`, `Anticipos.tsx`, `Liquidaciones.tsx` (selects de chofer) |
| `GET /vehiculos` | **Sí** (nuevo) | `?incluirInactivos=true` | `ViajeForm.tsx:58` |
| `GET /clientes/export/excel`, `/export/pdf` | No (sin cambios) | — | Reportería/auditoría, debe incluir historial completo |
| `GET /transportistas/export/excel`, `/export/pdf` | No (sin cambios) | — | Ídem |
| `GET /choferes/export/excel`, `/export/pdf` | No (sin cambios, ya trae todos hoy) | — | Ídem |
| `GET /transportistas` (nested `include: {choferes, vehiculos}`) | **No** (decisión explícita) | N/A, ya trae todo | `Transportistas.tsx` — es la vista de administración del propio transportista, donde conviene ver también los choferes/vehículos dados de baja (para poder reactivarlos ahí eventualmente) |

**Sobre H8 (decisión):** el `include` anidado de `TransportistasController.findAll()`/`findOne()` se deja sin filtrar a propósito. Es una vista de gestión ("todos los choferes/vehículos de este transportista"), no un select para una operación nueva — mismo criterio que ya se aplica a los exports. Filtrarlo ahí escondería del propio dueño del dato la existencia de choferes/vehículos inactivos, que es exactamente lo que se necesita ver para decidir reactivarlos.

**Nombre del query param:** se mantiene `incluirInactivos` (booleano, `?incluirInactivos=true`) por consistencia entre los 4 endpoints — mismo nombre ya propuesto en 5.1 para Cliente/Transportista, extendido ahora a Chofer/Vehiculo.

---

## 4. Endpoints que deben permitir ver históricos aunque estén inactivos

Estos **no cambian** con este bloque — ya se comportan correctamente hoy porque un `include`/`findUnique` de Prisma no filtra por `activo` salvo que se le pida explícitamente, y en ningún punto de estos endpoints se agrega ese filtro:

| Endpoint | Por qué debe seguir mostrando inactivos |
|---|---|
| `GET /clientes/:id`, `/transportistas/:id`, `/choferes/:id`, `/vehiculos/:id` (`findOne`) | Una pantalla de detalle de un `Viaje`/`Factura`/`Liquidacion` histórico necesita poder resolver "¿quién era este cliente/chofer?" aunque hoy esté inactivo. |
| `GET /viajes/:id`, `/facturas/:id`, `/liquidaciones/:id`, `/anticipos/:id` (con sus `include` de `cliente`/`transportista`/`chofer`/`camion`/`acoplado`) | Idéntico razonamiento — el detalle de una operación ya creada debe mostrar los catálogos referenciados tal como eran, sin que su baja posterior rompa la visualización. **No se debe agregar ningún filtro `where: {activo: true}` a estos `include` anidados** — es el error más fácil de cometer al implementar este bloque, y el que rompería más silenciosamente el historial. |
| `GET /viajes`, `/facturas`, `/liquidaciones`, `/anticipos` (listados) | Los propios `Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto` no tienen `activo` — solo sus catálogos referenciados pueden estarlo. El listado de operaciones nunca debe filtrar por el estado de sus catálogos relacionados. |
| Exports de Clientes/Transportistas/Choferes (Excel/PDF) | Ya cubierto en sección 3 — reportería de auditoría, sin cambios. |
| `TransportistasController.findAll()`/`findOne()` (`include: {choferes, vehiculos}`) | Ya cubierto en sección 3 (H8) — vista de gestión propia del transportista. |

**Regla de oro para la implementación:** el filtro `activo:true` se agrega únicamente en el `where` de nivel superior de `findAll()` en `ClientesController`/`TransportistasController`/`ChoferesController`/`VehiculosController`. Nunca dentro de un `include` anidado, y nunca en `findOne()`.

---

## 5. Validaciones a agregar en `create()`

Regla (idéntica a la ya aprobada en 5.1 sección 2.2, ahora con el detalle exacto de cada controller): rechazo con `400` y mensaje explícito si cualquier catálogo referenciado está inactivo. **No se valida en `update()`** de estas mismas operaciones ni en la edición de `Cliente`/`Transportista`/`Chofer`/`Vehiculo` ya inactivos (ver sección 2.6 de 5.1, no reabierta).

### 5.1 `ViajesController.create()` (`viajes.controller.ts:135-164`)

Validar, antes del `prisma.viaje.create`:
- `Cliente.activo === true` (`body.clienteId`)
- `Transportista.activo === true` (`body.transportistaId`)
- `Chofer.activo === true` (`body.choferId`) — **nuevo**, depende de que `Chofer.activo` exista (sección 2)
- `Vehiculo.activo === true` para `body.camionId` — **nuevo**
- `Vehiculo.activo === true` para `body.acopladoId`, solo si viene informado (es opcional) — **nuevo**

Implementación sugerida: un único `Promise.all` con los `findUnique` necesarios (evita 5 round-trips secuenciales), y un mensaje de error que identifique cuál catálogo específico está inactivo o no existe (ej. `"El chofer seleccionado está dado de baja. Reactívelo antes de crear el viaje."`), no un mensaje genérico — mismo criterio de mensajes explícitos usado en los Bloques 4.1-4.3.

### 5.2 `AnticiposController.create()` (`anticipos.controller.ts:205-224`)

Ya valida existencia obligatoria de `choferId`/`transportistaId`/`tipoGastoId` (línea 207-209), pero no su estado. Agregar:
- `Chofer.activo === true`
- `Transportista.activo === true`

### 5.3 `LiquidacionesController.create()` (`liquidaciones.controller.ts:313-...`)

- Si `tipo === "CHOFER"`: ya hace `findUnique` de `Chofer` en la línea 334 (para leer `comisionPct`) — es el punto natural para agregar `if (!chofer.activo) throw new BadRequestException(...)` en el mismo bloque, sin una consulta adicional.
- Si `tipo === "TRANSPORTISTA"`: **hoy no se hace ningún `findUnique` de `Transportista`** (H7) — hay que agregarlo. Se aprovecha el mismo punto para validar existencia (hoy tampoco se valida explícitamente, solo de forma indirecta vía el filtro de `viajes`) y `activo` a la vez.

### 5.4 `FacturasController.create()` (`facturas.controller.ts:256-308`)

Hoy no hay ningún `findUnique` de `Cliente` (H6). Agregar uno antes de la consulta de `viajes`, validando existencia + `activo`. Es una consulta adicional de bajo costo en el mismo punto donde ya se arma la transacción.

### 5.5 Resumen de validaciones nuevas por controller

| Controller | Catálogos a validar | ¿Requiere nueva consulta o reusa una existente? |
|---|---|---|
| `ViajesController.create()` | Cliente, Transportista, Chofer, Vehículo(camión), Vehículo(acoplado, si aplica) | Nuevas (ninguna se hacía antes) |
| `AnticiposController.create()` | Chofer, Transportista | Nuevas |
| `LiquidacionesController.create()` | Chofer (si tipo CHOFER) / Transportista (si tipo TRANSPORTISTA) | Chofer: reusa consulta existente. Transportista: nueva. |
| `FacturasController.create()` | Cliente | Nueva |

---

## 6. Qué pasa con registros históricos que referencian entidades luego inactivadas

Definición explícita (pedida en el alcance), consistente con la sección 4:

1. **Nada cambia retroactivamente.** Un `Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto` ya creado sigue existiendo, sigue mostrándose en listados y detalle, y su relación con el catálogo (ahora inactivo) permanece intacta — la FK nunca se toca, solo se agrega un filtro en las consultas de `findAll()` de los propios catálogos.
2. **Editar una operación histórica que referencia un catálogo inactivo no se bloquea por este motivo.** Si un `Viaje` en estado editable (no facturado/liquidado, ver Bloque 4.1) referencia un chofer que después fue dado de baja, `ViajesController.update()` no se ve afectado por este bloque — la validación de `activo` se agrega solo en `create()`, no en `update()` (mismo criterio ya fijado en 5.1 sección 2.2 para Cliente/Transportista, extendido sin cambios a Chofer/Vehículo).
3. **Reasignar** un catálogo inactivo a una operación existente (ej. cambiar el `choferId` de un viaje editable a un chofer inactivo vía `PATCH`) **queda fuera de alcance de este bloque** — hoy `UpdateViajeDto` permite cambiar `choferId`/`camionId`/etc. en un viaje editable sin ninguna validación de `activo`. Es una superficie de ataque menor (requiere que alguien reasigne deliberadamente a un catálogo ya dado de baja) comparada con el `create()` (H5), y añadirla ahora duplicaría buena parte de la lógica de la sección 5 sobre un caso de uso mucho más raro. Se señala como **punto de decisión** (sección 9) por si se prefiere cerrarlo en el mismo bloque.
4. **Los exports y las vistas de detalle preservan el historial exactamente como está hoy** (sección 4) — ningún dato se pierde ni se oculta retroactivamente, solo dejan de ofrecerse como opción para operaciones *nuevas*.

---

## 7. Migraciones necesarias

Una sola migración, puramente aditiva — igual que la ya diseñada en 5.1 sección 4, no implementada todavía:

```prisma
model Chofer {
  // ...campos existentes...
  activo Boolean @default(true)
}

model Vehiculo {
  // ...campos existentes...
  activo Boolean @default(true)
}
```

- No nullable, con `@default(true)`, sin backfill manual — todos los registros existentes son activos hoy, `true` es el valor correcto por defecto de Prisma al aplicar la migración.
- 100% expresable en el DSL de Prisma, sin SQL manual. No toca `Cliente`, `Transportista`, `Viaje`, ni ninguna otra tabla. No hay `DROP`/`DELETE` de nada.
- Mismo perfil de riesgo que las migraciones aditivas ya aplicadas en los Bloques 3.1/4.2/4.3/5.1(RBAC no requirió migración).

**Sin migración adicional** para el resto del bloque: el filtro de `findAll()`, las validaciones de `create()`, los nuevos endpoints `DELETE`/`activo` en `UpdateChoferDto`/`UpdateVehiculoDto`/`UpdateClienteDto` son cambios de código puro sobre columnas que ya existen (o que esta misma migración crea).

---

## 8. Cambios de API que este bloque agrega (resumen técnico)

Para que el diseño quede completo antes de implementar, esto es lo que se toca (sin escribirlo todavía):

- `ChoferesController`: nuevo `@Delete(":id")` (soft-delete, mismos roles que `create`/`update`: `OPERACIONES`, `LIQUIDACIONES`, `ADMINISTRADOR`); `UpdateChoferDto` gana `activo?: boolean`; `findAll()` gana filtro `activo:true` por defecto + query param `incluirInactivos`.
- `VehiculosController`: nuevo `@Delete(":id")` (mismos roles que `create`/`update`: `OPERACIONES`, `ADMINISTRADOR`); `UpdateVehiculoDto` gana `activo?: boolean`; `findAll()` gana el mismo filtro.
- `ClientesController.findAll()`: gana el filtro (cierra H3 para Cliente, ya identificado en 5.1 y nunca implementado).
- `TransportistasController.findAll()`: gana el filtro en el nivel superior, **sin tocar** el `include` anidado de `choferes`/`vehiculos` (sección 3, H8).
- `UpdateClienteDto`: gana `activo?: boolean` (cierra H4/asimetría de reactivación, hallazgo #8 de 5.1).
- `ViajesController.create()`, `AnticiposController.create()`, `LiquidacionesController.create()`, `FacturasController.create()`: ganan las validaciones de la sección 5.

---

## 9. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | El filtro por defecto en `findAll()` de Chofer/Vehículo podría romper algún consumidor del frontend que hoy asume que la lista siempre trae todos los registros (ej. si alguna pantalla hiciera un `find` client-side sobre un chofer específico esperando encontrarlo siempre) | Baja | Grep confirmado: los únicos consumidores de `GET /choferes`/`GET /vehiculos` son selects de alta de operación (`ViajeForm.tsx`, `Anticipos.tsx`, `Liquidaciones.tsx`), exactamente el caso que debe filtrar. Ningún consumidor depende de ver inactivos por esta vía. |
| 2 | Bloquear `create()` contra catálogos inactivos podría interrumpir un flujo en curso si alguien dio de baja un chofer/vehículo por error momentos antes | Baja | Reactivación simétrica ya diseñada (`activo?: boolean` en los 4 `Update*Dto`); mensaje de `400` explícito indicando cómo resolverlo. |
| 3 | Las 4 validaciones de la sección 5 tocan 4 controllers distintos con formas de invocación distintas (`Promise.all` en Viajes vs. reuso de `findUnique` existente en Liquidaciones) — más superficie de cambio que un sub-bloque típico de 4.x | Media | Ver propuesta de sub-bloques (sección 11): separar "extensión de `activo` + filtros" de "validación de integridad en los 4 `create()`" reduce el tamaño de cada entrega individual. |
| 4 | Omitir por error el filtro `activo:true` dentro de un `include` anidado (en vez de solo en el `where` de nivel superior) rompería silenciosamente el historial de operaciones ya facturadas/liquidadas que referencian catálogos inactivos | Media si no se tiene cuidado, evitable | Regla explícita en sección 4 ("regla de oro"); test de regresión específico en el plan de pruebas (ítem 10) que verifica que el detalle de una operación histórica sigue mostrando el catálogo inactivo. |
| 5 | `LiquidacionesController.create()` con `tipo==="TRANSPORTISTA"` no tenía ningún `findUnique` de `Transportista` antes de este bloque (H7) — agregar esa consulta es, en rigor, más que "solo" agregar una validación de `activo`, es cerrar una ausencia de verificación de existencia que ya era una laguna previa | Baja | Se señala explícitamente para que la implementación no lo trate como un efecto colateral no documentado — es intencional y forma parte de este bloque. |

---

## 10. Plan de pruebas

**Extensión de `activo` a Chofer/Vehículo:**
1. Migración aplicada → `GET /choferes`, `GET /vehiculos` siguen devolviendo todos los registros existentes (todos `activo: true` por defecto).
2. `DELETE /choferes/:id` con rol `OPERACIONES` → `200`, el chofer queda `activo: false`. Con rol `FACTURACION` → `403`.
3. `DELETE /vehiculos/:id` con rol `OPERACIONES` → `200`. Con rol `LIQUIDACIONES` → `403` (no está en la matriz de Vehículos).
4. `PATCH /choferes/:id` con `{activo: true}` sobre un chofer dado de baja → lo reactiva.
5. `PATCH /vehiculos/:id` con `{activo: true}` → ídem.
6. `PATCH /clientes/:id` con `{activo: true}` sobre un cliente dado de baja → ahora funciona (cierra H4).

**Filtrado en listados/selects:**
7. `GET /clientes`, `/transportistas`, `/choferes`, `/vehiculos` sin query param → excluyen los dados de baja.
8. Los mismos 4 endpoints con `?incluirInactivos=true` → incluyen todos.
9. `GET /transportistas` (o `/transportistas/:id`) → el `include` de `choferes`/`vehiculos` sigue trayendo inactivos (regresión de la decisión H8) aunque el chofer/vehículo esté dado de baja.
10. `GET /viajes/:id`, `/facturas/:id`, `/liquidaciones/:id`, `/anticipos/:id` de una operación histórica que referencia un chofer/vehículo/cliente/transportista ahora inactivo → el detalle sigue mostrando el nombre/datos completos, sin ocultarlos ni fallar (regresión crítica, sección 4).
11. `ViajeForm.tsx`/`Anticipos.tsx`/`Liquidaciones.tsx`/`Facturas.tsx`: los selects ya no muestran catálogos dados de baja (sin cambios de código en estas páginas, solo por el efecto del filtro del backend).

**Validación de integridad en `create()`:**
12. Dar de baja un `Chofer` → `POST /viajes` referenciándolo → `400` con mensaje explícito. Reactivar → `201`.
13. Dar de baja un `Vehiculo` (como camión) → `POST /viajes` referenciándolo → `400`. Igual para acoplado.
14. Dar de baja un `Cliente` → `POST /viajes` y `POST /facturas` referenciándolo → `400` en ambos.
15. Dar de baja un `Transportista` → `POST /viajes`, `POST /anticipos`, y `POST /liquidaciones` (tipo `TRANSPORTISTA`) referenciándolo → `400` en los 3.
16. Dar de baja un `Chofer` → `POST /anticipos` y `POST /liquidaciones` (tipo `CHOFER`) referenciándolo → `400` en ambos.
17. `POST /liquidaciones` con `tipo="TRANSPORTISTA"` y un `transportistaId` inexistente → `404`/`400` explícito (cierra H7, antes no se validaba existencia en absoluto).
18. `POST /facturas` con un `clienteId` inexistente → `404`/`400` explícito (cierra H6).

**Regresión transversal:**
19. Ciclo completo Viajes→Liquidaciones→Facturas→Cobranzas de los Bloques 3-4 sigue funcionando igual sobre catálogos activos, sin cambios de comportamiento para el caso normal.
20. Exports Excel/PDF de Clientes/Transportistas/Choferes → sin cambios, siguen mostrando activos e inactivos.

---

## 11. Plan de rollback

- **Migración `activo` en `Chofer`/`Vehiculo`:** aditiva, mismo perfil que las ya aplicadas en Bloques 3-4-5.1. Revertir es un `DROP COLUMN` seguro; el único dato que se pierde es el propio estado activo/inactivo cargado durante la ventana en que estuvo la columna.
- **Filtros en `findAll()`:** revertir es quitar el `where`, sin pérdida de datos — los registros inactivos nunca se borran, solo dejan de listarse por defecto.
- **Endpoints `DELETE`/reactivación nuevos (Chofer, Vehículo) y `activo` en `UpdateClienteDto`:** revertir el código deja el comportamiento actual (imposible dar de baja/reactivar), sin tocar el schema salvo la migración ya cubierta arriba.
- **Validaciones de `activo` en los 4 `create()`:** revertir el código deja el comportamiento actual (sin bloqueo), sin necesidad de tocar el schema.
- Ningún rollback de este bloque implica pérdida de datos de negocio (viajes, facturas, liquidaciones, anticipos ya creados permanecen intactos en todos los escenarios).

---

## 12. Criterios de aceptación

1. `Chofer` y `Vehiculo` tienen el mismo mecanismo de soft-delete (`activo`, `DELETE` para dar de baja, `PATCH {activo:true}` para reactivar) que `Cliente`/`Transportista`, sin pérdida de historial en viajes/liquidaciones/anticipos ya existentes que los referencien.
2. `Cliente` puede reactivarse vía `PATCH` igual que `Transportista` (cierra la asimetría H4/hallazgo #8 de 5.1).
3. `GET /clientes`, `/transportistas`, `/choferes`, `/vehiculos` excluyen inactivos por defecto; `?incluirInactivos=true` los incluye.
4. El `include` anidado de `choferes`/`vehiculos` en `TransportistasController` sigue mostrando inactivos (decisión H8), y el detalle de cualquier operación histórica (`Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto`) sigue mostrando catálogos inactivos sin ocultarlos ni fallar.
5. Ningún `Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto` nuevo puede crearse referenciando un `Cliente`/`Transportista`/`Chofer`/`Vehiculo` inactivo — la operación se rechaza con `400` y un mensaje que indique cómo resolverlo (reactivar primero).
6. `LiquidacionesController.create()` con `tipo="TRANSPORTISTA"` valida existencia del `Transportista` (cierra H7, antes ausente).
7. `FacturasController.create()` valida existencia y `activo` del `Cliente` (cierra H6, antes ausente).
8. Ninguna operación histórica (viajes/facturas/liquidaciones/anticipos ya creados) cambia de comportamiento retroactivamente.
9. Los exports Excel/PDF de los 4 catálogos siguen mostrando activos e inactivos, sin cambios.
10. Build y typecheck limpios; el plan de pruebas de la sección 10 pasa contra la base local.

---

## 13. Propuesta de sub-bloques (si conviene dividir)

El riesgo #3 de la sección 9 ya anticipa que este bloque, tomado entero, toca más superficie que un sub-bloque típico de 4.x (2 modelos nuevos + 4 controllers de catálogo + 4 controllers de operaciones). Se propone dividirlo en 2 entregas, cada una mergeable y probable de forma independiente:

**5.2.a — Extensión de `activo` a Chofer/Vehículo + filtros de listado**
- Migración (sección 7).
- `DELETE`/reactivación en `ChoferesController`/`VehiculosController` (sección 8).
- `activo` en `UpdateClienteDto` (cierra H4, no depende de la migración nueva).
- Filtro `activo:true` por defecto + `incluirInactivos` en los 4 `findAll()` de catálogo (sección 3).
- Autocontenido, bajo riesgo, no depende de nada más.

**5.2.b — Validación de integridad en `create()` (depende de 5.2.a)**
- Las 4 validaciones de la sección 5 (Viajes, Anticipos, Liquidaciones, Facturas).
- Depende de 5.2.a porque necesita que `Chofer.activo`/`Vehiculo.activo` ya existan en el schema.
- Es el cambio con más superficie (4 controllers de operaciones) pero cada validación es independiente entre sí — se puede implementar y probar controller por controller dentro de la misma entrega.

**Justificación de la división:** separa un cambio de infraestructura de datos (5.2.a, bajo riesgo, sin lógica de negocio nueva) de un cambio de reglas de negocio (5.2.b, mayor superficie, toca el flujo de creación de las 4 operaciones financieras centrales del sistema) — mismo criterio de separación ya usado exitosamente entre Entrega 1 (RBAC) y esta Entrega 2 en el propio 5.1/5.2.

No se propone dividir más allá de esto — 5.2.a y 5.2.b ya son unidades coherentes y de tamaño manejable (1-2 días cada una, estimación análoga a los sub-bloques del roadmap general).

---

## 14. Puntos de decisión pendientes para tu aprobación

1. **División en 5.2.a/5.2.b (sección 13)** — ¿se implementa en 2 entregas separadas, o se prefiere todo junto en una sola?
2. **Reasignación de catálogo inactivo a una operación existente vía `PATCH`** (punto 3 de la sección 6) — ¿queda fuera de alcance como se propone, o se agrega la misma validación de `activo` a los `update()` de Viajes/Anticipos/Liquidaciones/Facturas en este mismo bloque?
3. **Roles del nuevo `DELETE /choferes/:id` y `DELETE /vehiculos/:id`** — ¿se confirma que deben ser los mismos roles ya asignados a `create`/`update` de cada uno (`OPERACIONES`, `LIQUIDACIONES`, `ADMINISTRADOR` para Choferes; `OPERACIONES`, `ADMINISTRADOR` para Vehículos), o se prefiere restringir la baja a un subconjunto más chico (ej. solo `ADMINISTRADOR`)?
4. **Nombre del query param `incluirInactivos`** — ¿se aprueba tal cual, o se prefiere otro nombre/convención (ej. `soloActivos=false`, `estado=todos`)?

No se implementó nada de este diseño — queda a la espera de tu revisión y de tus respuestas a los 4 puntos anteriores antes de tocar código.

# Bloque 5.1 — Auditoría de Seguridad del Módulo Catálogos

Fecha: 2026-07-07. Documento de auditoría pura — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se hizo commit. Profundiza el hallazgo B8 de `BLOQUE5_AUDITORIA_PRODUCTO.md` (P0: catálogos sin `RolesGuard`) con el mismo nivel de detalle que los diseños de los Bloques 3 y 4.

**Alcance:** los 8 catálogos de `CatalogosModule` — Clientes, Transportistas, Choferes, Vehículos, Cereales, Ubicaciones, Tipos de gasto, Productores — más el catálogo de solo-lectura Usuarios (incluido porque vive en el mismo módulo, aunque no es un catálogo de negocio). Cruzado contra `frontend/src/pages/Clientes.tsx`, `Transportistas.tsx`, `Catalogos.tsx`, `ViajeForm.tsx`, `Anticipos.tsx`, `Liquidaciones.tsx`, `Facturas.tsx`, `components/Layout.tsx`, `App.tsx`.

---

## 0. Confirmación de mecanismo de control de acceso

`RolesGuard.canActivate()` (`backend/src/auth/roles.guard.ts:9-19`): `if (!requiredRoles || requiredRoles.length === 0) return true`. Esto es central para todo el resto del documento: **`RolesGuard` sin `@Roles(...)` en el método no restringe nada** — hace falta *ambas* piezas (el guard a nivel de clase y el decorador por método) para que un endpoint quede protegido por rol. Confirmado que `ADMINISTRADOR` siempre pasa (línea 17), independientemente de `@Roles`.

Precedente ya existente en el propio código (aunque deshabilitado): `backend/src/_combustibles.disabled/combustibles.controller.ts` sí aplica una matriz granular de roles por endpoint (lectura vs. mutación, con `LECTURA` incluido solo en endpoints de solo-consulta) — confirma que el patrón de diseño de roles para catálogos/datos maestros ya fue pensado una vez en este proyecto, solo que nunca se replicó en `CatalogosModule`.

---

## 1. Endpoints y control de acceso — tabla exhaustiva

### 1.1 Clientes (`clientes.controller.ts:14`, `@UseGuards(JwtAuthGuard)` — sin `RolesGuard`)

| Endpoint | Línea | Mutación | Rol requerido hoy | Visible en frontend a |
|---|---|---|---|---|
| `GET /clientes` | 19-22 | No | Ninguno (cualquier autenticado) | Todos los roles — `Layout.tsx:11` (`roles: null`) |
| `GET /clientes/:id` | 24-27 | No | Ninguno | Sin consumidor directo en frontend |
| `POST /clientes` | 29-36 | **Sí** | **Ninguno** | Todos los roles ven el formulario "Nuevo cliente" (`Clientes.tsx:43-60`), botón "Agregar" sin ninguna condición de rol |
| `PATCH /clientes/:id` | 38-42 | **Sí** | **Ninguno** | Sin consumidor (endpoint huérfano, ver Bloque 5 general) |
| `DELETE /clientes/:id` | 44-47 | **Sí** (soft-delete) | **Ninguno** | Sin consumidor — inalcanzable desde la UI construida, pero abierto por API directa |
| `GET /clientes/export/excel`, `/export/pdf` | 49-140 | No | Ninguno | Sin botón en frontend |
| `GET /clientes/:id/cuenta-corriente` | 142-163 | No (lectura financiera) | Ninguno | Botón "Cuenta corriente" visible a todos los roles (`Clientes.tsx:71`) |

**Hallazgo crítico de esta sección:** cualquier usuario autenticado — incluido el rol `LECTURA`, pensado explícitamente como de solo consulta (`backend/prisma/seed.js`, usuario "Lectura Demo") — puede dar de alta un cliente vía el propio formulario de la interfaz, sin necesitar API directa. No es un problema teórico de "API sin proteger", es un botón real, visible y funcional en la pantalla de un usuario de solo-lectura.

### 1.2 Transportistas (`transportistas.controller.ts:10`, `@UseGuards(JwtAuthGuard)` — sin `RolesGuard`)

| Endpoint | Línea | Mutación | Rol requerido hoy | Visible en frontend a |
|---|---|---|---|---|
| `GET /transportistas` | 15-21 | No | Ninguno | Todos los roles — `Layout.tsx:12` (`roles: null`) |
| `GET /transportistas/:id` | 23-29 | No | Ninguno | Sin consumidor directo |
| `POST /transportistas` | 31-34 | **Sí** | **Ninguno** | Todos los roles ven "Nuevo transportista" (`Transportistas.tsx:68-85`) |
| `PATCH /transportistas/:id` | 36-39 | **Sí** | **Ninguno** | Sin consumidor directo (solo se usa indirectamente vía `PATCH /choferes/:id`, ver 1.3) |
| `DELETE /transportistas/:id` | 41-44 | **Sí** (soft-delete) | **Ninguno** | Sin consumidor |
| `GET /transportistas/export/excel`, `/export/pdf` | 46-137 | No | Ninguno | Sin botón en frontend |

Mismo patrón que Clientes: alta de transportista expuesta y funcional para cualquier rol autenticado, incluido `LECTURA`.

### 1.3 Choferes (`choferes.controller.ts:10`, `@UseGuards(JwtAuthGuard)` — sin `RolesGuard`)

| Endpoint | Línea | Mutación | Rol requerido hoy | Visible en frontend a |
|---|---|---|---|---|
| `GET /choferes` | 15-21 | No | Ninguno | Consumido por `ViajeForm.tsx`, `Anticipos.tsx`, `Liquidaciones.tsx` (todos los roles que acceden a esas páginas) |
| `GET /choferes/:id` | 23-26 | No | Ninguno | Sin consumidor |
| `POST /choferes` | 28-31 | **Sí** | **Ninguno** | Formulario "+ Chofer" dentro de cada tarjeta de transportista (`Transportistas.tsx:147-154`), visible a todos los roles |
| `PATCH /choferes/:id` | 33-36 | **Sí** | **Ninguno** | Usado por "Guardar" de edición de `comisionPct` (`Transportistas.tsx:41-50, 109-141`), visible/funcional para todos los roles — **incluye la comisión que determina cuánto se le paga a un chofer**, un dato directamente financiero |
| `GET /choferes/export/excel`, `/export/pdf` | 38-131 | No | Ninguno | Sin botón en frontend |

**Hallazgo agravado:** la edición de `comisionPct` de un chofer (diseñada en el Bloque 3.2 específicamente para el flujo de Liquidaciones) es hoy editable por **cualquier rol autenticado**, incluidos `OPERACIONES`, `FACTURACION`, `GERENCIA` y `LECTURA` — no solo `LIQUIDACIONES`/`ADMINISTRADOR`, que serían los roles de negocio esperables para tocar un dato que afecta directamente cuánto cobra un chofer.

### 1.4 Vehículos (`vehiculos.controller.ts:7`, `@UseGuards(JwtAuthGuard)` — sin `RolesGuard`)

| Endpoint | Línea | Mutación | Rol requerido hoy | Visible en frontend a |
|---|---|---|---|---|
| `GET /vehiculos` | 12-18 | No | Ninguno | Consumido por `ViajeForm.tsx` (todos los roles con acceso a crear viaje) |
| `POST /vehiculos` | 20-23 | **Sí** | **Ninguno** | Formulario "+ Vehículo" (`Transportistas.tsx:165-175`), visible a todos los roles |
| `PATCH /vehiculos/:id` | 25-28 | **Sí** | **Ninguno** | Sin consumidor (endpoint huérfano) |

Sin `GET /:id`, sin `DELETE`. Es el catálogo con menor superficie de API de los 8 (ni siquiera tiene exportación Excel/PDF).

### 1.5 Cereales, Ubicaciones, Tipos de gasto, Productores (`simples.controller.ts`, los 4 con `@UseGuards(JwtAuthGuard)` — sin `RolesGuard`)

| Controller | Endpoints | Mutación | Rol requerido hoy | Visible en frontend a |
|---|---|---|---|---|
| `CerealesController` | `GET /cereales` (14), `POST /cereales` (15) | Sí (POST) | Ninguno | Todos los roles ven "Catálogos" solo si `roles: ["ADMINISTRADOR","OPERACIONES"]` los incluye (`Layout.tsx:13`) — **pero la ruta `/catalogos` no tiene ningún guard propio en `App.tsx`**, ver sección 4 |
| `UbicacionesController` | `GET /ubicaciones` (22), `POST /ubicaciones` (23) | Sí (POST) | Ninguno | Igual que arriba |
| `TiposGastoController` | `GET /tipos-gasto` (30), `POST /tipos-gasto` (31) | Sí (POST) | Ninguno | Igual que arriba |
| `ProductoresController` | `GET /productores` (38), `POST /productores` (39), `PATCH /productores/:id` (40-42) | Sí (POST, PATCH) | Ninguno | Igual que arriba — `PATCH` sin ningún consumidor en frontend |

### 1.6 Usuarios (`simples.controller.ts:45-52`, solo lectura)

`GET /usuarios` — `select` explícito que excluye `passwordHash` (correcto, confirmado). Sin mutaciones expuestas (no hay `POST`/`PATCH` de usuarios en absoluto, alta manual en base — ya señalado como deuda en `ROADMAP_SDC_V1.md`, fuera de alcance de este documento).

### 1.7 Resumen — 15 endpoints mutantes sin ningún control de rol

`POST /clientes`, `PATCH /clientes/:id`, `DELETE /clientes/:id`, `POST /transportistas`, `PATCH /transportistas/:id`, `DELETE /transportistas/:id`, `POST /choferes`, `PATCH /choferes/:id`, `POST /vehiculos`, `PATCH /vehiculos/:id`, `POST /cereales`, `POST /ubicaciones`, `POST /tipos-gasto`, `POST /productores`, `PATCH /productores/:id`.

---

## 2. Soft-delete (`activo`)

### 2.1 Solo 2 de 8 catálogos tienen el concepto de `activo` en el schema

| Catálogo | Campo `activo` en schema | `DELETE` (baja) | Reactivación vía API |
|---|---|---|---|
| Cliente | Sí (`schema.prisma:97`) | Sí (`clientes.controller.ts:44-47`) | **No** — `UpdateClienteDto` no incluye `activo` (`update-cliente.dto.ts:1-23`); una vez dado de baja, no hay forma de revertirlo salvo tocar la base directamente |
| Transportista | Sí (`schema.prisma:127`) | Sí (`transportistas.controller.ts:41-44`) | **Sí, asimétricamente** — `UpdateTransportistaDto.activo?: boolean` (`update-transportista.dto.ts:16-18`) permite reactivar vía `PATCH`, sin ningún guard de rol que lo proteja |
| Chofer | **No existe** | No existe | N/A |
| Vehiculo | **No existe** | No existe | N/A |
| Cereal | **No existe** | No existe | N/A |
| Ubicacion | **No existe** | No existe | N/A |
| TipoGasto | **No existe** | No existe | N/A |
| Productor | **No existe** | No existe | N/A |

**Hallazgo:** no hay ninguna forma de "retirar" un chofer que dejó la empresa o un vehículo vendido/dado de baja — quedan activos para siempre en cualquier selección, sin ninguna vía, ni siquiera manual, de marcarlos como no disponibles (borrarlos físicamente rompería las referencias históricas de `Viaje`/`AnticipoGasto`/`LiquidacionViaje`, dado que ninguna de esas relaciones tiene `onDelete: Cascade` hacia `Chofer`/`Vehiculo`).

### 2.2 Ningún listado, búsqueda ni exportación filtra por `activo`

Confirmado por lectura exhaustiva de los 2 controllers que sí tienen el campo:
- `clientes.controller.ts:19-22` (`findAll`), `:51-54` (export Excel), `:88-91` (export PDF) — ninguno filtra `where: {activo: true}`. Un cliente dado de baja sigue apareciendo en absolutamente todos los listados y exports, solo distinguible por la columna "Estado"/"Activo" (que además el export sí muestra correctamente, `:70`, `:111` — el dato existe, simplemente no se usa para filtrar).
- `transportistas.controller.ts:15-21` (`findAll`), `:47-51`, `:84-88` (exports) — mismo patrón, sin filtro. Y a diferencia de Clientes, **el export de Transportistas sí muestra el estado (`:67`, `:108`) pero la tabla de la interfaz (`Transportistas.tsx`) ni siquiera muestra la columna "Activo"** — un usuario viendo la pantalla de Transportistas no tiene forma visual de saber si uno está dado de baja, salvo yendo al export.

### 2.3 Selects del frontend — cero filtrado, confirmado exhaustivamente

Grep de `.activo` en todo `frontend/src`: **una sola coincidencia en todo el proyecto** (`Clientes.tsx:70`, para mostrar "Sí"/"No" en la tabla). Ningún `<select>`/dropdown de toda la aplicación filtra por `activo`. Cuatro flujos de creación consumen `/clientes` o `/transportistas` sin filtro:

| Página | Línea | Qué selecciona |
|---|---|---|
| `ViajeForm.tsx` | 38, 40, 113, 127 | Cliente y Transportista para un viaje nuevo |
| `Facturas.tsx` | 24 | Cliente para una factura nueva |
| `Liquidaciones.tsx` | 28 | Transportista para una liquidación nueva |
| `Anticipos.tsx` | 24 | Transportista para un anticipo/gasto nuevo |

En los 4 casos, un cliente/transportista dado de baja aparece en el `<select>` **exactamente igual** que uno activo — sin ninguna marca visual, sin agrupación, sin exclusión.

---

## 3. Integridad de datos

### 3.1 Confirmado: se puede crear un Viaje, Factura, Liquidación o Anticipo usando un catálogo inactivo

Grep de `activo` en todo `backend/src`: aparece únicamente en `clientes.controller.ts` (baja/export), `transportistas.controller.ts` (baja/export), `simples.controller.ts:50` (select de Usuario), y `auth.service.ts:12` (bloqueo de login de usuario inactivo). **Ninguno de los 4 métodos `create()` que referencian estos catálogos** (`ViajesController.create()`, `FacturasController.create()`, `LiquidacionesController.create()`, `AnticiposController.create()`) valida `activo` en ningún punto — la única validación es que el `id` referenciado exista (constraint de FK), no que esté operativo.

**Consecuencia concreta:** dar de baja un cliente o transportista (la única acción de "seguridad"/limpieza de datos que el sistema ofrece hoy para estas dos entidades) no tiene ningún efecto preventivo real — ese cliente/transportista sigue siendo 100% utilizable para generar nuevas operaciones financieras, tanto por la API directa como por la propia interfaz construida (ver 2.3). El botón "Dar de baja" (aunque hoy inalcanzable desde la UI, ver sección 4) daría una falsa sensación de control si se conectara tal cual está.

### 3.2 Editar un registro inactivo — sin ningún bloqueo

`PATCH /clientes/:id` y `PATCH /transportistas/:id` no verifican `activo` antes de aceptar cambios — se puede editar CUIT, razón social, etc. de un registro ya dado de baja sin ninguna restricción ni advertencia.

### 3.3 Inconsistencias entre backend y frontend

- El backend permite reactivar un Transportista vía `PATCH {activo: true}` (dato expuesto en el DTO); el frontend no ofrece ningún control para hacerlo, ni para clientes ni para transportistas — la asimetría de la sección 2.1 (Cliente sin reactivación posible vía API) es indetectable desde la UI en cualquier caso, porque ninguno de los dos tiene una UI de edición.
- `Chofer`/`Vehiculo` no tienen concepto de "inactivo" en el modelo, pero **si un chofer/vehículo ya no es operable** (ej. licencia vencida, vehículo fuera de servicio), el sistema no tiene ninguna forma de reflejarlo — ni en backend ni en frontend — más allá de dejar de seleccionarlo manualmente a criterio del operador, sin ningún control del sistema. Esto conecta directamente con el hallazgo F4/N2 de `BLOQUE5_AUDITORIA_PRODUCTO.md` (vencimientos de documentación no capturables ni alertados).

---

## 4. UX

### 4.1 Asimetría entre lo que el sidebar oculta y lo que el backend realmente protege

`Layout.tsx:4-14` (`NAV_ITEMS`):
- `/clientes` → `roles: null` (visible a **todos**, incluido `LECTURA`)
- `/transportistas` → `roles: null` (visible a **todos**, incluido `LECTURA`)
- `/catalogos` → `roles: ["ADMINISTRADOR", "OPERACIONES"]` (oculto para `LECTURA`, `GERENCIA`, `LIQUIDACIONES`, `FACTURACION`)

Pero `App.tsx:16-35` no aplica **ningún** guard de ruta por rol — todas las rutas cuelgan del mismo `<Route element={<Layout/>}>`, y `Layout.tsx:20` solo verifica `if (!usuario) return <Navigate to="/login"/>` (autenticación, no autorización). Esto significa:
- Para `/clientes` y `/transportistas`: el propio sidebar ya **muestra activamente** el botón de alta a un usuario `LECTURA` — no hace falta ni siquiera navegar manualmente, el link y el formulario están ahí.
- Para `/catalogos`: el link está oculto para `LECTURA`/`GERENCIA`/`LIQUIDACIONES`/`FACTURACION`, pero la ruta sigue siendo alcanzable escribiendo la URL directamente, y una vez ahí, el formulario funciona igual (mismo respaldo de backend sin `RolesGuard`).

Es decir, hay **dos variantes del mismo problema de fondo**: una donde la UI activamente expone la función a quien no debería tenerla (Clientes/Transportistas), y otra donde la UI la oculta pero no la bloquea (Catálogos) — ambas terminan en el mismo resultado porque el backend no protege ninguna.

### 4.2 Ausencia total de edición/baja en la interfaz construida

Ninguna de las 3 páginas (`Clientes.tsx`, `Transportistas.tsx`, `Catalogos.tsx`) ofrece un botón de edición o baja para ningún registro — a pesar de que el backend ya soporta `PATCH`/`DELETE` para Clientes y Transportistas. Esto significa que, paradójicamente, **hoy el riesgo de seguridad de catálogos solo es explotable por API directa** (Postman, curl, o cualquier cliente HTTP) — no por el uso normal de la aplicación construida, salvo en los casos ya señalados (alta de cliente/transportista/chofer/vehículo, sí expuestos).

### 4.3 Mensajes y confirmaciones

- No existe ningún mensaje de error o advertencia relacionado con permisos en ninguna de las 3 páginas — si un `PATCH`/`POST` fuera bloqueado por rol (hoy no lo está), el manejo de error genérico (`err?.response?.data?.message`) mostraría el mensaje que Nest genere por defecto para un `403`, sin ningún tratamiento específico.
- No hay ninguna confirmación antes de crear un registro de catálogo (aceptable, es de bajo riesgo comparado con anular una factura) — pero tampoco hay ninguna advertencia si se intenta cargar un CUIT que ya existe (el error solo aparece después del rechazo del backend por duplicado, cuando aplica — `Chofer.dni`/`Chofer.cuil`/`Vehiculo.patente`/`Cliente.cuit`/`Transportista.cuit` son `@unique`; `Productor.cuit` también; no así `Cereal.nombre`/`Ubicacion.nombre` que si son `@unique` a nivel simple, ver `schema.prisma`).

### 4.4 Botones visibles para usuarios sin permisos — confirmado, no hipotético

A diferencia de otros módulos de la aplicación donde el sidebar oculta correctamente lo que el backend también protege (Anticipos, Liquidaciones, Facturas — los 3 con `roles` explícitos en `Layout.tsx` **y** `RolesGuard`/`@Roles` reales en el backend), en Catálogos el patrón se rompe: para Clientes/Transportistas ni siquiera se intentó ocultar nada en el sidebar (`roles: null`), y en los 3 casos el backend no respalda ninguna restricción aunque el frontend la sugiera visualmente.

---

## 5. Clasificación de hallazgos (P0-P3)

| # | Hallazgo | Prioridad | Impacto | Riesgo | Complejidad | Beneficio esperado |
|---|---|---|---|---|---|---|
| 1 | 15 endpoints mutantes sin `RolesGuard`/`@Roles` en todo `CatalogosModule` | **P0** | Alto — cualquier usuario autenticado, incluido `LECTURA`, puede crear/editar/dar de baja datos maestros | Alto — sin control de acceso real sobre datos que alimentan facturación/liquidación | Baja — patrón mecánico, ya usado en 4 controllers del mismo proyecto | Muy alto relativo al esfuerzo — es el fix de seguridad más barato de todo el Bloque 5 |
| 2 | `Layout.tsx` muestra "Nuevo cliente"/"Nuevo transportista"/"+ Chofer"/"+ Vehículo" a **todos** los roles sin ninguna condición (`roles: null`) | **P0** | Alto — la UI misma invita a un usuario `LECTURA` a mutar datos maestros, no hace falta ni navegación manual | Alto, agrava el hallazgo #1 porque el camino de explotación es un clic, no una llamada de API | Baja | Alto |
| 3 | Edición de `Chofer.comisionPct` (dato financiero, diseñado en Bloque 3.2 para Liquidaciones) accesible a cualquier rol | **P0** | Alto — un dato que determina cuánto se le paga a un chofer, editable por cualquiera | Alto, riesgo financiero directo | Baja (incluida en el fix #1) | Alto |
| 4 | Ningún `create()` de Viaje/Factura/Liquidación/Anticipo valida `activo` del catálogo referenciado | **P1** | Alto — el soft-delete de Cliente/Transportista no tiene ningún efecto preventivo real | Medio-alto — un cliente/transportista dado de baja sigue generando operaciones nuevas | Media — requiere agregar la validación en 4 controllers distintos | Alto, cierra el propósito real de tener `activo` |
| 5 | `findAll`/exports de Cliente/Transportista no filtran `activo:true` | **P1** | Medio-alto — reincidencia de un ítem ya marcado "crítico antes de producción" en `ROADMAP_SDC_V1.md`, nunca resuelto | Medio | Baja | Alto, esfuerzo bajo |
| 6 | Selects de `ViajeForm`/`Facturas`/`Liquidaciones`/`Anticipos` no distinguen catálogos inactivos | **P1** | Medio-alto — un cliente/transportista dado de baja es indistinguible de uno activo al elegirlo | Medio | Baja-media (depende de #5 primero) | Alto |
| 7 | `Chofer`/`Vehiculo`/`Cereal`/`Ubicacion`/`TipoGasto` sin ningún concepto de `activo` — imposible "retirar" sin romper historial | **P1** | Medio-alto para Chofer/Vehiculo (rotación real de personal/flota), bajo para los demás | Medio — hoy se gestiona informalmente ("no lo selecciones"), sin control del sistema | Media (migración aditiva + lógica) | Medio-alto, prioritariamente para Chofer/Vehiculo |
| 8 | Asimetría de reactivación: Transportista reactivable vía `PATCH`, Cliente no | **P2** | Medio | Bajo-medio, inconsistencia más que vulnerabilidad | Baja | Medio |
| 9 | `PATCH` sobre un registro ya inactivo no se bloquea ni advierte | **P2** | Medio | Bajo-medio | Baja | Medio |
| 10 | `Transportistas.tsx` no muestra la columna "Activo" en su propia tabla (a diferencia de `Clientes.tsx`) | **P2** | Bajo-medio, inconsistencia de UI | Bajo | Baja | Bajo-medio |
| 11 | Ruta `/catalogos` oculta del sidebar para varios roles pero sin ningún guard de ruta real en `App.tsx` | **P2** | Medio — mismo problema de fondo que #1/#2 pero de menor exposición (requiere navegación manual) | Medio | Baja (depende de resolver #1 primero, después es solo consistencia visual) | Medio |
| 12 | Sin UI de edición/baja para ningún catálogo (endpoints huérfanos) | **P3** | Bajo-medio, ya señalado en `BLOQUE5_AUDITORIA_PRODUCTO.md` (F6) | Bajo (mitiga por omisión el riesgo de #1 desde el uso normal de la app, no es una mejora en sí) | Media | Medio |
| 13 | `GET /clientes/:id/cuenta-corriente` sin restricción de rol (dato financiero de lectura) | **P3** — pendiente de confirmar si `LECTURA` debe o no ver esta información | Medio, condicionado a la intención de negocio del rol `LECTURA` | Bajo-medio | Baja | Medio, depende de la respuesta de negocio |

**Los primeros 3 hallazgos (P0) son, en esencia, el mismo problema raíz (ausencia total de `RolesGuard` en el módulo) manifestado en 3 lugares distintos — se resuelven con un único cambio coordinado, no con 3 esfuerzos separados.** Ver `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md`.

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

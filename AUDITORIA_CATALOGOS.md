# Catálogos — registro de bloques funcionales

Registro mínimo de los bloques de producto sobre Clientes/Transportistas (fase de desarrollo orientado a producción — no auditoría técnica exhaustiva, documentación solo de lo indispensable).

---

## CAT-1 — Importación masiva de Clientes y Transportistas (CSV)

**Objetivo:** que una empresa con cartera existente pueda cargarla en minutos en vez de tipearla registro por registro.

**Backend:** `backend/src/common/csv.ts` (nuevo) — parser CSV mínimo (RFC4180-lite, sin dependencia nueva) + mapeo de filas por nombre de encabezado. `clientes.controller.ts`/`transportistas.controller.ts`: `GET .../importar/plantilla` (CSV descargable con columnas + ejemplo) y `POST .../importar` (`multipart/form-data`, `FileInterceptor`), validando cada fila con el mismo DTO del alta individual (`class-validator`), fila por fila — una fila inválida se reporta con motivo exacto sin bloquear las demás. No se verifica CUIT duplicado (el alta individual tampoco lo hace hoy en ningún lugar del sistema; `cuit` no es `@unique` en el schema — mismo criterio, no se inventa una regla nueva).

**Frontend:** `Clientes.tsx`/`Transportistas.tsx` — card "Importar desde CSV" (plantilla + input de archivo + resumen de creados/rechazados), adicional al alta individual existente, sin reemplazarla.

**Dependencias nuevas:** `multer` + `@types/multer` (ya transitiva de `@nestjs/platform-express`, declarada como dependencia directa).

**Validación:** backend build OK, 18/18 suites (+3: `csv.spec.ts`, `clientes.controller.importar.spec.ts`, `transportistas.controller.importar.spec.ts`), 125/125 tests (+16). Frontend build OK. Validado en navegador real: plantilla descargable, CSV con fila inválida reporta el motivo exacto sin bloquear las filas válidas, alta individual sin cambios.

**Deuda remanente (backlog):** Choferes/Camiones y catálogos simples (cereales, ubicaciones, tipos de gasto, productores) sin importación masiva — quedan para un bloque futuro si se justifica.

---

## CRM-1 — Gestión completa de Clientes

**Objetivo:** dejar el módulo Clientes listo para producción real (antes solo tenía alta).

**Backend:** `update-cliente.dto.ts` — se agrega `activo?: boolean` (`@IsOptional() @IsBoolean()`). Bug real preexistente confirmado con evidencia: sin este campo, el `ValidationPipe` global (`whitelist: true`) descartaba `activo` de cualquier `PATCH /clientes/:id` — un cliente dado de baja no tenía ningún camino de API para reactivarse. Mismo patrón que `UpdateTransportistaDto`/`UpdateChoferDto`/`UpdateVehiculoDto`, que ya lo declaraban. Sin este fix, la funcionalidad de "Reactivar" pedida no podía implementarse.

**Frontend (`Clientes.tsx`):**
- **Edición:** reutiliza el mismo formulario de alta ("Nuevo cliente" ↔ "Editar cliente"), precarga los datos, guarda con `PATCH` existente.
- **Baja/reactivación:** botones "Desactivar" (con confirmación vía `useConfirm`, mismo patrón que el resto del sistema) / "Reactivar" (sin confirmación adicional). `cargar()` ahora pide `incluirInactivos=true` — antes esta pantalla solo mostraba activos, lo que habría dejado los KPIs de inactivos/total siempre en 0 y sin forma de ver ni reactivar a quien se dio de baja. No afecta a otros consumidores (nadie más llama a `GET /clientes` para este listado).
- **Búsqueda instantánea:** filtro client-side por razón social/CUIT, sin botón — catálogo chico, ya completo en memoria (a diferencia de Viajes/Facturas/Liquidaciones, este listado no está paginado).
- **Orden:** por razón social, fecha de creación o estado — client-side.
- **KPIs:** activos/inactivos/total, mismas clases `.kpi-grid`/`.kpi-card` ya usadas en Liquidaciones/Dashboard.
- **UX:** `useAsyncAction` (mismo hook que el resto del sistema) reemplaza el `useState` de error suelto que tenía la pantalla, sumando el banner de éxito pedido sin inventar un mecanismo nuevo. Búsqueda/orden/selección de cuenta corriente no se resetean en ninguna acción (no hay código que las toque).

**CSS:** `styles.css` — nuevas clases `.badge.ACTIVO`/`.badge.INACTIVO` (antes de este fix se había usado por error un atajo reutilizando clases de otro dominio solo por su color; se corrigió antes de commitear).

**Validación:** backend build OK, 18/18 suites, 125/125 tests (sin cambios — el fix del DTO no rompió nada). Frontend build OK. Validado en navegador real tras un incidente de entorno (múltiples procesos de Vite zombis sirviendo versiones viejas — resuelto matando todos los procesos `vite` reales por línea de comando y levantando una única instancia limpia, verificada sirviendo el código actual antes de repetir la validación): KPIs, editar, desactivar/reactivar con confirmación, búsqueda instantánea, orden, sin regresiones en Viajes/Facturación/Liquidaciones/Documento Operativo/Transportistas.

**Deuda remanente (backlog):** la misma gestión completa (edición/baja/reactivación/búsqueda/orden/KPIs) todavía falta en Transportistas — candidato a un bloque futuro si se decide extenderlo ahí con el mismo criterio.

---

## CRM-2 — Gestión completa de Transportistas

**Objetivo:** llevar la pantalla Transportistas al mismo nivel funcional ya validado en Clientes (CRM-1), respetando su particularidad de dominio (cada transportista es una card expandible con choferes/vehículos inline, no una tabla plana).

**Backend:** sin cambios de producto — a diferencia de Clientes, `UpdateTransportistaDto` ya declaraba `activo?: boolean` y `findAll()` ya aceptaba `incluirInactivos`, así que la reactivación por API ya funcionaba antes de este bloque. `remove()` ya era baja lógica pura (`update({ activo: false })`), sin tocar choferes/vehículos/viajes/liquidaciones. No se modificó el schema Prisma ni ningún controller de producto.

**Frontend (`Transportistas.tsx`):** mismo patrón que CRM-1 sobre la estructura existente (no se convirtió a tabla): edición reutilizando el formulario de alta ("Nuevo transportista" ↔ "Editar transportista"), desactivar/reactivar con confirmación previa solo al desactivar, `cargar()` con `incluirInactivos=true` (sin efecto en otros consumidores de `GET /transportistas`: `Liquidaciones.tsx`/`Anticipos.tsx`/`Rentabilidad.tsx`/`ViajeForm.tsx` no envían ese parámetro), búsqueda instantánea por razón social/CUIT, orden por razón social/fecha/estado, KPIs activos/inactivos/total, banners de éxito/error vía `useAsyncAction`, badge de estado. CAT-1 (importación CSV) intacto. Gestión de choferes/vehículos (agregar, editar comisión) no se tocó funcionalmente, solo su visibilidad (ver matriz de roles).

### Falla de UI encontrada y corregida (verificación de autorización post-validación)

La pantalla nunca tuvo gating de UI por rol — a diferencia de Viajes/Liquidaciones, que ya usan el patrón `puedeGestionarX`. El backend siempre rechazó correctamente estas operaciones para LECTURA (`RolesGuard` + `@Roles(...)`), pero un usuario LECTURA veía y podía intentar ejecutar alta/edición/desactivación-reactivación/importación CSV de transportistas, alta/edición de choferes (incluida comisión) y alta de vehículos, recibiendo un 403 en vez de simplemente no ver la acción.

**Corrección:** se agregaron dos flags en `Transportistas.tsx`, mapeados exactamente contra los `@Roles()` reales de cada endpoint (no una regla nueva, mismo criterio que `puedeGestionarViajes`/`puedeGestionarLiquidaciones`):

| Acción | Endpoint | Roles permitidos (backend) | Flag de UI |
|---|---|---|---|
| Alta / edición / baja-reactivación de transportista | `POST\|PATCH\|DELETE /transportistas` | OPERACIONES, ADMINISTRADOR | `puedeGestionarTransportistas` |
| Importación CSV de transportistas (CAT-1) | `POST /transportistas/importar` | OPERACIONES, ADMINISTRADOR | `puedeGestionarTransportistas` |
| Alta / edición de vehículo | `POST\|PATCH /vehiculos` | OPERACIONES, ADMINISTRADOR | `puedeGestionarTransportistas` |
| Alta / edición (comisión) de chofer | `POST\|PATCH /choferes` | OPERACIONES, **LIQUIDACIONES**, ADMINISTRADOR | `puedeGestionarChoferes` |
| Consulta (listado/detalle, incluidos inactivos) | `GET /transportistas\|/choferes\|/vehiculos` | cualquier rol autenticado | sin gating — LECTURA puede consultar |

Nótese la asimetría real entre Choferes (admite LIQUIDACIONES) y Vehículos (no la admite) — se respetó tal cual está en el backend, sin unificar ambos flags en uno solo.

**Pruebas incorporadas:** `backend/src/catalogos/transportistas.roles.spec.ts` (nuevo, 32 tests) — no mockea metadata artificial: instancia `RolesGuard` real y lee los decoradores `@Roles()` reales de `TransportistasController`/`ChoferesController`/`VehiculosController` vía `Reflector`, el mismo mecanismo que usa producción. Cubre: LECTURA rechazado en cada endpoint de escritura de los tres controllers; sin usuario autenticado → rechazado; OPERACIONES/ADMINISTRADOR permitidos; LIQUIDACIONES permitido en Chofer pero rechazado en Vehículo; consulta (`findAll`/`findOne`) permitida para LECTURA en los tres. Antes de este bloque, `RolesGuard` no tenía ningún test en todo el backend.

**Validación:** backend build OK, 19/19 suites, **157/157 tests** (+32 del nuevo spec). Frontend typecheck + build OK. Vite dev (instancia única, verificada sin procesos zombis) confirmado sirviendo el código actualizado antes de cada validación. Validado en navegador real como `ADMINISTRADOR`: edición, cancelación, desactivación, reactivación, búsqueda, orden, KPIs, importación CSV y expansión de choferes/vehículos, todo sin regresiones. La verificación de autorización para LECTURA se hizo a nivel de pruebas automatizadas contra el mecanismo real (no visualmente, por no contar con acceso a esa cuenta en este entorno).

**Deuda remanente (backlog):** el mismo gating de UI (`puedeGestionarX`) que Clientes (CRM-1) tampoco tiene — queda como candidato a revisar junto con CRM-1 si se decide una pasada de auditoría de autorización a nivel de todo el frontend.

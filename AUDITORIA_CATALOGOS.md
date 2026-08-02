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

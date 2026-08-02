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

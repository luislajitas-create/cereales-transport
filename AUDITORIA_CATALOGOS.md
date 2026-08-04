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

---

## CAT-2 — Importación masiva de Choferes y Vehículos (CSV)

**Objetivo:** cerrar el backlog dejado abierto por CAT-1 — permitir la incorporación masiva de choferes y vehículos pertenecientes a transportistas **ya existentes**, con el mismo criterio de CAT-1 (parser compartido, resultado parcial por fila, sin rollback de archivo), preservando aislamiento multiempresa, validaciones de dominio reales y permisos exactos.

### Endpoints y plantillas

| Recurso | Plantilla | Importación |
|---|---|---|
| Choferes | `GET /choferes/importar/plantilla` | `POST /choferes/importar` (`multipart/form-data`, campo `archivo`) |
| Vehículos | `GET /vehiculos/importar/plantilla` | `POST /vehiculos/importar` (`multipart/form-data`, campo `archivo`) |

**Encabezados de Choferes:** `transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono` (mismas columnas de `CreateChoferDto`, salvo `transportistaId`).
**Encabezados de Vehículos:** `transportistaCuit,patente,marca,modelo,tipo,capacidadKg,vencimientoRto,vencimientoSeguro` (mismas columnas de `CreateVehiculoDto`, salvo `transportistaId`). Ninguna plantilla expone IDs internos.

### Resolución del transportista

La relación se resuelve por `transportistaCuit` (comparación exacta post-`trim()`) contra `Transportista.cuit`, la única clave comercial estable disponible (`@@unique([organizacionId, cuit])`). La consulta (`transportista.findMany`) ya viene acotada a la organización activa por la extensión de aislamiento (Bloque 8.1.d, `organizacion-prisma.client.ts`): un CUIT de **otra organización** produce el mismo resultado que un CUIT **inexistente** — decisión deliberada, no un bug, para no filtrar entre organizaciones si un CUIT ajeno existe o no. Nunca se auto-crea un transportista faltante: la fila se rechaza con `"No existe un transportista con CUIT '<cuit>' en esta organización."`.

### Matriz de roles

| Acción | Endpoint | Roles permitidos |
|---|---|---|
| Importar / plantilla Choferes | `POST /choferes/importar`, `GET /choferes/importar/plantilla` | OPERACIONES, LIQUIDACIONES, ADMINISTRADOR |
| Importar / plantilla Vehículos | `POST /vehiculos/importar`, `GET /vehiculos/importar/plantilla` | OPERACIONES, ADMINISTRADOR |

Misma matriz que el alta individual (`create()`) de cada recurso — la importación masiva no es una puerta de acceso distinta. La descarga de plantilla quedó bajo la misma matriz que su importación (antes no tenía `@Roles()`, quedaba abierta a cualquier rol autenticado). El backend rechaza el llamado aunque se bypasee el gating de UI (`RolesGuard` real, no un chequeo solo de frontend).

### Validaciones, límites y manejo seguro de errores

- **Duplicados reales según el schema** (auditado directamente, no asumido): Chofer tiene **dos** restricciones únicas por organización — `@@unique([organizacionId, cuil])` y `@@unique([organizacionId, dni])` —; Vehiculo tiene una sola, `@@unique([organizacionId, patente])`. Ambos se resuelven en **una consulta batch** (nunca una por fila): Choferes con un `OR` combinado sobre CUIL/DNI, Vehículos sobre patente. DNI es opcional (`dni String?`): solo se compara cuando la fila lo trae, porque varios choferes sin DNI son válidos (`NULL` no colisiona consigo mismo en Postgres). Se detecta contra la base **y** dentro del propio archivo, sin convertir silenciosamente un alta en edición.
- **Encabezado rechaza el archivo completo, antes de leer una sola fila y antes de cualquier consulta o escritura**, si: falta un encabezado obligatorio (Choferes: `transportistaCuit,nombre,cuil`; Vehículos: `transportistaCuit,patente,tipo`) o hay encabezados duplicados (que hoy pisarían datos silenciosamente al mapear por nombre). Columnas adicionales no reconocidas se siguen permitiendo — mismo criterio que CAT-1, que las ignora en vez de rechazarlas.
- **Límite de filas:** CAT-1 no tenía límite explícito (solo 2 MB de tamaño de archivo). Se definió `LIMITE_FILAS_IMPORTACION_CSV = 2000` en `backend/src/common/csv.ts`, una única constante compartida aplicada a **las cuatro** importaciones del sistema (Clientes, Transportistas, Choferes, Vehículos) para no dejar comportamientos distintos entre catálogos. Un archivo vacío o que supere el límite se rechaza completo, sin escribir nada.
- **Manejo seguro de errores de base de datos** (`backend/src/common/importacion-errores.ts`, nuevo): la base queda como última defensa ante condiciones de carrera (dos filas del archivo, o dos importaciones concurrentes, apuntando al mismo valor único) incluso después de la detección en lote + en memoria. `P2002` se traduce a un mensaje funcional por campo (reutilizando `mensajeUnico()`, extraída a `backend/src/common/prisma-mensajes.ts` para que la use también `PrismaExceptionFilter`, sin duplicar la lógica); otros códigos Prisma conocidos (`P2003`/`P2025`) devuelven un mensaje genérico de dominio. **Nunca se devuelve `error.message` crudo de Prisma/PostgreSQL al usuario** — para errores inesperados se devuelve un mensaje genérico fijo y solo se registra en el log del servidor el tipo de error, nunca el mensaje completo ni los datos de la fila (pueden contener información personal). Este mismo manejo (límite de filas + traducción segura de errores) se aplicó también a los importadores de CAT-1 (`transportistas.controller.ts`, `clientes.controller.ts`) para no dejarlos con un comportamiento más débil que CAT-2.
- **Rendimiento:** resolución de transportistas y de duplicados en lote (una consulta cada una, nunca una por fila), verificado con pruebas dedicadas.
- **Auditoría (AuditLog):** se confirmó que el alta individual de Chofer/Vehículo no genera `AuditLog` — la importación masiva sigue la misma política vigente y tampoco genera ninguno. No se amplió ni se rediseñó la Auditoría Administrativa (FAC-4).
- **Normalización:** se auditó el sistema completo (backend y frontend) y se confirmó que **no existe hoy ninguna normalización** de CUIT/CUIL/DNI/patente (mayúsculas, guiones, espacios) en ningún punto — solo el `.trim()` genérico del parser CSV compartido. **Decisión explícita: CAT-2 no introdujo normalización nueva**, para no inventar una regla de dominio unilateralmente; se preserva el comportamiento actual del sistema.

### Frontend

`frontend/src/pages/Transportistas.tsx`: dos bloques nuevos, "Importar Choferes" e "Importar Vehículos", agregados como cards independientes junto a la card "Importar desde CSV" (Transportistas) ya existente de CAT-1 — mismo patrón visual y de estado (plantilla descargable, selector de archivo, botón "Importar" deshabilitado durante la carga, banner de resultado con detalle de filas rechazadas). Gateados respectivamente por `puedeGestionarChoferes` y `puedeGestionarTransportistas` (mismos flags de CRM-2, ya alineados con la matriz de roles real). No se tocó la estructura de cards expandibles por transportista ni las altas individuales existentes. Al finalizar, se reutiliza `cargar()` sin perder búsqueda, orden ni transportista expandido.

### Pruebas

Suites nuevas: `backend/src/catalogos/choferes.controller.importar.spec.ts` (22 tests), `backend/src/catalogos/vehiculos.controller.importar.spec.ts` (21 tests). Cubren, para ambos recursos: archivo vacío / solo encabezado / encabezado obligatorio ausente / encabezado duplicado, archivo válido, mezcla de filas válidas e inválidas, transportista inexistente, transportista de otra organización, duplicado en base y dentro del archivo (CUIL **y DNI** para Choferes; patente para Vehículos), límite de filas exacto permitido y +1 rechazado, `P2002` traducido a mensaje funcional, error inesperado con mensaje genérico (nunca `error.message` crudo), y resolución en una sola consulta batch. `transportistas.roles.spec.ts` se extendió (80 tests en el archivo) para cubrir `importar()` y `plantillaImportacion()` de Choferes/Vehículos bajo el `RolesGuard` real. `clientes.controller.importar.spec.ts` se ajustó (una prueba existente pasó a esperar el mensaje genérico en vez del `error.message` crudo, para reflejar el nuevo manejo seguro de errores aplicado también a CAT-1).

**Resultado medido:** backend build limpio; Jest completo sin caché, **32 suites / 408 tests, todos verdes**; `npm run test:dev1` 14/14; frontend `tsc -b` + `vite build` limpios. Validación manual en entorno local (`localhost`, sin tocar Railway/producción) con dos CSV reales (`validacion-choferes.csv`, `validacion-vehiculos.csv`, carpeta temporal fuera de Git, eliminada al cierre): en ambos casos la primera fila se creó correctamente y la segunda (mismo CUIL / misma patente que la primera) se rechazó por duplicado dentro del archivo, con el resumen `total/creados/rechazados` correcto y sin regresiones visuales — validado por Luis.

**Deuda remanente (backlog):**
- Evaluar si conviene introducir normalización transversal de CUIT/CUIL/DNI/patente (mayúsculas, guiones, espacios) en un bloque de dominio independiente — hoy no existe en ningún punto del sistema, no solo en CAT-2.
- Evaluar si el alta (individual y masiva) de Cliente/Transportista/Chofer/Vehículo debería generar `AuditLog` — hoy ninguna lo hace; es una decisión de auditoría de todo el catálogo, no específica de CAT-2.
- `transportistas.controller.ts`/`clientes.controller.ts` no tienen detección proactiva en lote de CUIT duplicado (a diferencia de Choferes/Vehículos en CAT-2), aunque el schema sí tiene `@@unique([organizacionId, cuit])` en ambos modelos — un duplicado se sigue rechazando vía `P2002` (ya con mensaje seguro), solo sin la verificación previa en lote. Ampliar esto es una mejora futura, fuera del alcance de este cierre.

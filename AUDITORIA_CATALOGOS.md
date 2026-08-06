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
- **Normalización:** se auditó el sistema completo (backend y frontend) y se confirmó que **no existía entonces ninguna normalización** de CUIT/CUIL/DNI/patente (mayúsculas, guiones, espacios) en ningún punto — solo el `.trim()` genérico del parser CSV compartido. **Decisión explícita en CAT-2: no introducir normalización nueva** en ese momento, para no inventar una regla de dominio unilateralmente; quedó como deuda documentada y **se cerró en CAT-3** (ver esa sección más abajo — única entrada histórica de este punto, no se repite en la lista de deuda remanente de abajo).

### Frontend

`frontend/src/pages/Transportistas.tsx`: dos bloques nuevos, "Importar Choferes" e "Importar Vehículos", agregados como cards independientes junto a la card "Importar desde CSV" (Transportistas) ya existente de CAT-1 — mismo patrón visual y de estado (plantilla descargable, selector de archivo, botón "Importar" deshabilitado durante la carga, banner de resultado con detalle de filas rechazadas). Gateados respectivamente por `puedeGestionarChoferes` y `puedeGestionarTransportistas` (mismos flags de CRM-2, ya alineados con la matriz de roles real). No se tocó la estructura de cards expandibles por transportista ni las altas individuales existentes. Al finalizar, se reutiliza `cargar()` sin perder búsqueda, orden ni transportista expandido.

### Pruebas

Suites nuevas: `backend/src/catalogos/choferes.controller.importar.spec.ts` (22 tests), `backend/src/catalogos/vehiculos.controller.importar.spec.ts` (21 tests). Cubren, para ambos recursos: archivo vacío / solo encabezado / encabezado obligatorio ausente / encabezado duplicado, archivo válido, mezcla de filas válidas e inválidas, transportista inexistente, transportista de otra organización, duplicado en base y dentro del archivo (CUIL **y DNI** para Choferes; patente para Vehículos), límite de filas exacto permitido y +1 rechazado, `P2002` traducido a mensaje funcional, error inesperado con mensaje genérico (nunca `error.message` crudo), y resolución en una sola consulta batch. `transportistas.roles.spec.ts` se extendió (80 tests en el archivo) para cubrir `importar()` y `plantillaImportacion()` de Choferes/Vehículos bajo el `RolesGuard` real. `clientes.controller.importar.spec.ts` se ajustó (una prueba existente pasó a esperar el mensaje genérico en vez del `error.message` crudo, para reflejar el nuevo manejo seguro de errores aplicado también a CAT-1).

**Resultado medido:** backend build limpio; Jest completo sin caché, **32 suites / 408 tests, todos verdes**; `npm run test:dev1` 14/14; frontend `tsc -b` + `vite build` limpios. Validación manual en entorno local (`localhost`, sin tocar Railway/producción) con dos CSV reales (`validacion-choferes.csv`, `validacion-vehiculos.csv`, carpeta temporal fuera de Git, eliminada al cierre): en ambos casos la primera fila se creó correctamente y la segunda (mismo CUIL / misma patente que la primera) se rechazó por duplicado dentro del archivo, con el resumen `total/creados/rechazados` correcto y sin regresiones visuales — validado por Luis.

**Deuda remanente (backlog):**
- Evaluar si el alta (individual y masiva) de Cliente/Transportista/Chofer/Vehículo debería generar `AuditLog` — hoy ninguna lo hace; es una decisión de auditoría de todo el catálogo, no específica de CAT-2.
- `transportistas.controller.ts`/`clientes.controller.ts` no tienen detección proactiva en lote de CUIT duplicado (a diferencia de Choferes/Vehículos en CAT-2), aunque el schema sí tiene `@@unique([organizacionId, cuit])` en ambos modelos — un duplicado se sigue rechazando vía `P2002` (ya con mensaje seguro), solo sin la verificación previa en lote. Ampliar esto es una mejora futura, fuera del alcance de este cierre.

---

## CAT-3 — Normalización transversal de identificadores (CUIT, CUIL, DNI, patente)

**Problema original:** el sistema solo aplicaba `.trim()` a CUIT/CUIL/DNI/patente. Dos valores semánticamente idénticos pero escritos distinto (`"30-12345678-9"` vs `"30123456789"` vs `"30.123.456.789"`; `"ab-123-cd"` vs `"AB123CD"`) no eran reconocidos como el mismo identificador — ni por las restricciones únicas de la base (que comparan el string tal cual), ni por la resolución de `transportistaCuit` en la importación CSV, ni por ninguna búsqueda. Esto permitía duplicados semánticos y podía hacer que un CSV con un formato distinto al ya guardado no encontrara el transportista correspondiente.

### Política canónica

Implementada en `backend/src/common/normalizacion.ts` (único punto de esta política en todo el backend):

| Campo | Regla | Resultado de ejemplo |
|---|---|---|
| CUIT (Cliente, Transportista) / CUIL (Chofer) | Eliminar todo lo que no sea dígito | `"30-12345678-9"` → `"30123456789"` |
| DNI (Chofer, opcional) | Eliminar todo lo que no sea dígito; si el resultado queda vacío, se guarda `null`/`undefined` — nunca `""` | `"30.111.222"` → `"30111222"`; `""` → `undefined` |
| Patente (Vehículo) | `trim()` + mayúsculas + eliminar espacios/puntos/guiones | `"ab-123-cd"` → `"AB123CD"` |

**Decisiones explícitas de alcance (no se ampliaron sin pedirlo):**
- **No se valida ni corrige el dígito verificador fiscal de CUIT/CUIL.** `esCuitValido()` (`backend/src/common/cuit.ts`) ya existía y sigue sin aplicarse a Cliente/Transportista/Chofer — solo se usa en el alta de Organización. Agregarlo acá habría sido inventar una política fiscal nueva no pedida.
- **No se restringen las patentes al formato Mercosur.** Se preservan formatos históricos (3+3, una sola letra de provincia, etc.) — la única transformación es mayúsculas + remoción de separadores.
- **No se fusionan duplicados automáticamente**, ni en el alta/edición individual ni en la importación CSV ni en la migración de datos históricos: un duplicado semántico siempre se **rechaza** (fila de CSV, request HTTP, o migración completa), nunca se decide automáticamente qué registro conservar.
- No se normalizó ningún otro campo (nombre, razón social, teléfono, licencia) ni ninguna otra entidad — **Organizacion.cuit y Productor.cuit quedan fuera de CAT-3** (el pedido fue explícitamente Clientes/Transportistas/Choferes/Vehículos).

### Auditoría previa de colisiones (obligatoria antes de tocar código)

Confirmado `DATABASE_URL` apuntando a `localhost` antes de cualquier consulta. Script de solo lectura (temporal, eliminado al terminar) contra la base local: agrupó cada entidad por `(organizacionId, valor normalizado)` y buscó grupos con más de un valor crudo distinto.

**Resultado: 0 colisiones** sobre Cliente.cuit (6 filas), Transportista.cuit (3), Chofer.cuil (6), Chofer.dni (6), Vehiculo.patente (6) — ninguna organización tenía dos registros que fueran a colisionar al normalizar. No hizo falta detenerse ni informar colisiones (sección 1.5 del pedido).

### Aplicación transversal

Se resolvió con **un único punto de aplicación por capa**, sin reimplementar la normalización en cada controller:

- **DTO (`@Transform(siPresente(normalizarX))`)** en `create-cliente.dto.ts`, `update-cliente.dto.ts`, `create-transportista.dto.ts`, `update-transportista.dto.ts`, `create-chofer.dto.ts` (cuil y dni), `update-chofer.dto.ts` (cuil y dni), `create-vehiculo.dto.ts`, `update-vehiculo.dto.ts`. `class-transformer` aplica `@Transform()` tanto en el `ValidationPipe` global (`transform: true`, altas/ediciones HTTP) como en `plainToInstance()` (usado directamente por los importadores CAT-1/CAT-2) — un solo cambio en el DTO alcanza para normalizar **alta, edición e importación CSV** de las cuatro entidades a la vez. `siPresente()` deja pasar `undefined`/`null` intactos: un `PATCH` que no envía el campo no lo pisa con `""`.
- **Resolución de `transportistaCuit`** (Choferes/Vehículos, CAT-2): no pasa por ningún DTO — se agregó `normalizarCuit()` explícito en `choferes.controller.ts`/`vehiculos.controller.ts`, tanto en la consulta batch (`cuitsDelArchivo`) como en la resolución por fila, para que un CSV con o sin guiones resuelva siempre el mismo transportista.
- **Detección de duplicados en lote** (CAT-2): las claves de las consultas batch (`cuilsDelArchivo`, `dnisDelArchivo`, `patentesDelArchivo`) pasaron de `.trim()` a los normalizadores reales — de lo contrario, dos filas del mismo archivo con formatos distintos no se habrían detectado como duplicadas entre sí antes de llegar a la base.
- **Clientes/Transportistas (CAT-1):** sin arquitectura de detección proactiva en lote (deuda ya documentada en el cierre de CAT-2, no ampliada acá). El duplicado dentro del archivo y contra la base se sigue detectando correctamente porque el DTO ya normaliza antes de cada `create()` secuencial: la restricción real de la base (`P2002`) rechaza la segunda fila aunque use un formato distinto, con mensaje funcional (ver más abajo). Documentado como decisión explícita, no como omisión.
- **Aislamiento multiempresa:** sin cambios — la comparación de duplicados sigue ocurriendo exclusivamente contra la restricción real `@@unique([organizacionId, campo])` y las consultas batch acotadas por la extensión de aislamiento (Bloque 8.1.d); el mismo valor normalizado es válido en dos organizaciones distintas, verificado con pruebas dedicadas para las cuatro entidades.

### Bug preexistente encontrado y corregido durante la validación en vivo

Validando manualmente se detectó que un duplicado real en el alta/edición individual (no en la importación CSV) devolvía **HTTP 500 genérico** en vez de 409 con mensaje funcional — reproducible con un duplicado de Cliente sin ninguna variación de formato, así que **no es un bug de CAT-3**, ya estaba roto. Causa raíz: NestJS invierte internamente el array de `useGlobalFilters(...)` antes de resolverlos (`node_modules/@nestjs/core/router/router-exception-filters.js`, `filters.reverse()`) — con `useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter())`, el filtro que efectivamente se evalúa primero es el **último** pasado, no el primero: `AllExceptionsFilter` (catch-all) siempre ganaba y `PrismaExceptionFilter` nunca llegaba a ejecutarse para ningún error de Prisma, en ningún endpoint del sistema. La importación CSV no se veía afectada porque tiene su propio `try`/`catch` independiente de este filtro.

**Fix (autorizado explícitamente por el usuario tras reportarlo):** el registro de los dos filtros globales se extrajo a `backend/src/common/filters/registrar-filtros-globales.ts` (única función que decide el orden, documentada en detalle ahí) y `main.ts` pasó a llamarla en vez de registrar los filtros inline — orden final: `app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter())`. Verificado en vivo antes y después del fix: un `POST /clientes` duplicado pasó de `500 "Error interno del servidor"` a **`409 "Ya existe un registro con este CUIT"`** (mensaje ya sin `organizacionId`, ver "Corrección del mensaje" más abajo).

**Prueba de regresión automatizada (no solo validación manual):** `backend/src/common/filters/filtros-globales.e2e.spec.ts` — levanta una aplicación Nest real y mínima (`Test.createTestingModule` + `app.listen(0)`), registra los filtros con la MISMA función `registrarFiltrosGlobales()` que usa `main.ts`, y hace peticiones HTTP reales (`fetch`) contra dos rutas de prueba que lanzan, respectivamente, un `Prisma.PrismaClientKnownRequestError` P2002 real y un `Error` común. Verifica: el P2002 responde `409` con `"Ya existe un registro con este CUIT"` y nunca contiene el mensaje interno de Prisma (`"Unique constraint failed"`) ni `"organizacionId"`; el error común sigue respondiendo `500 "Error interno del servidor"` sin exponer su mensaje real. **Confirmado que detecta la regresión:** revertir el orden dentro de `registrarFiltrosGlobales()` a `(PrismaExceptionFilter, AllExceptionsFilter)` hace fallar el primer test (`Expected: 409, Received: 500`) — verificado manualmente revirtiendo y restaurando el orden antes de cerrar este punto.

### Corrección del mensaje de restricción compuesta

`mensajeUnico()` (`backend/src/common/prisma-mensajes.ts`) recibe el `meta.target` de un P2002 real, que en este sistema **siempre** incluye `organizacionId` (todas las restricciones únicas reales son compuestas `@@unique([organizacionId, campo])`, unicidad por organización, nunca global — Bloque 8.1.d). Antes de este ajuste, el mensaje listaba `organizacionId` tal cual junto al campo comercial (`"Ya existe un registro con este organizacionId, CUIT"`) — un campo técnico de aislamiento que la persona usuaria no reconoce ni puede "corregir". Se agregó un conjunto `CAMPOS_TECNICOS = new Set(["organizacionId", "id"])` excluido centralmente antes de armar el mensaje — no se ocultan campos comerciales, solo estos dos técnicos.

Ajuste adicional de cierre: el mapeo pasó de "campo → nombre legible" (`CAMPO_LEGIBLE`, con el artículo `"este"` fijo armado en `mensajeUnico()`) a `CAMPO_A_FRASE` — "campo → frase completa con el artículo correcto" (`"este CUIT"`, `"esta patente"`). Ningún controller decide el género a mano; es un único mapeo centralizado. Fallback seguro y genérico (`"Ya existe un registro con estos datos"`) en tres casos: no queda ningún campo comercial tras excluir los técnicos; queda más de uno (ninguna restricción real del sistema combina dos campos comerciales, así que no hay un artículo único que armar); o el campo no está en `CAMPO_A_FRASE` (nunca se expone un nombre de columna crudo ni se le adivina el género).

| Restricción real | Mensaje antes del fix de `organizacionId` | Mensaje final |
|---|---|---|
| `[organizacionId, cuit]` (Cliente/Transportista) | *"...con este organizacionId, CUIT"* | **"Ya existe un registro con este CUIT"** |
| `[organizacionId, cuil]` (Chofer) | *"...con este organizacionId, CUIL"* | **"Ya existe un registro con este CUIL"** |
| `[organizacionId, dni]` (Chofer) | *"...con este organizacionId, DNI"* | **"Ya existe un registro con este DNI"** |
| `[organizacionId, patente]` (Vehículo) | *"...con este organizacionId, patente"* | **"Ya existe un registro con esta patente"** |

Pruebas dedicadas: `backend/src/common/prisma-mensajes.spec.ts` (10 tests) — las cuatro combinaciones de la tabla (incluido el género de "patente"), orden de campos indistinto, `target` como string único, campo comercial no mapeado (fallback genérico, ya no expone el nombre crudo), y los tres casos de fallback seguro (`target` vacío, compuesto únicamente por campos técnicos, o con más de un campo comercial reconocido).

### Datos históricos y migración

**Se concluyó que SÍ hacía falta una migración**, aunque la auditoría no encontró colisiones: sin ella, un Transportista/Chofer/Vehículo/Cliente ya existente con formato no canónico (ej. `Transportista.cuit = "30-10000000-2"`) habría quedado **irresoluble** para cualquier comparación contra un valor ya normalizado — por ejemplo, `transportistaCuit` en un CSV nunca habría encontrado ese transportista, sin importar qué formato usara el archivo, porque el valor guardado no sería canónico. No es una cuestión de duplicados, es de consistencia del propio dato ya persistido.

**Migración:** `backend/prisma/migrations/20260804061709_normalizacion_transversal_identificadores_cat3/migration.sql`.

**Atomicidad real — `BEGIN;`/`COMMIT;` explícitos.** Corrección de una afirmación anterior de esta misma sección: **Prisma Migrate, para PostgreSQL, NO envuelve automáticamente cada `migration.sql` en una transacción** — es opt-in, agregando `BEGIN`/`COMMIT` explícitos (confirmado por Prisma: https://www.prisma.io/blog/prisma-migrate-dx-primitives). Sin ese `BEGIN`/`COMMIT`, cada sentencia del archivo habría corrido en autocommit: una colisión detectada en un bloque posterior (ej. Vehiculo.patente, el último) NO habría revertido los `UPDATE` ya confirmados por los bloques anteriores (Cliente, Transportista, Chofer), dejando una normalización parcial. El archivo envuelve los cinco bloques completos entre `BEGIN;` (primera sentencia) y `COMMIT;` (última) — cualquier `RAISE EXCEPTION` no capturado deja la transacción en estado abortado, y ese `COMMIT;` final se traduce en un `ROLLBACK` completo de los cinco bloques, no solo del que falló.

Por cada uno de los cinco campos (Cliente.cuit, Transportista.cuit, Chofer.cuil, Chofer.dni, Vehiculo.patente):
1. Un bloque `DO $$ ... $$` verifica, agrupando por `(organizacionId, valor normalizado)`, que ninguna organización quede con dos filas colisionando — si encuentra una, hace `RAISE EXCEPTION`; nunca elige automáticamente qué registro conservar.
2. Recién entonces, un `UPDATE` reescribe el campo a su forma canónica con `regexp_replace`/`upper`/`trim` — el DNI usa `NULLIF(..., '')` para preservar `NULL` en vez de guardar cadena vacía.

**Prueba de regresión estática:** `backend/src/common/migracion-cat3-atomicidad.spec.ts` — lee el archivo real de la migración (no una copia) y confirma: `BEGIN;` es la primera sentencia y `COMMIT;` la última; hay exactamente un `BEGIN;` y un `COMMIT;` en todo el archivo (sin `COMMIT` intermedio); los cinco bloques `DO $$` y los cinco `UPDATE` quedan contenidos entre ambos; ninguna sentencia de código usa un comando incompatible con una transacción explícita (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE`, `VACUUM`, `CREATE`/`DROP DATABASE`, `ALTER SYSTEM`); y cada uno de los cinco campos mantiene su `RAISE EXCEPTION` antes de su propio `UPDATE`.

**Prueba reproducible en una base Postgres local desechable** (no la base local principal, no producción): se creó una base temporal (`createdb`), se sembraron datos donde una colisión ocurre deliberadamente en el ÚLTIMO bloque (dos Vehículo con patente `"AB-123-CD"`/`"ab123cd"`, misma organización) después de que el PRIMER bloque (Cliente.cuit `"30-11111111-1"`, formato no canónico) ya habría aplicado su `UPDATE` dentro de la misma transacción. Se ejecutó `migration.sql` directamente con `psql -v ON_ERROR_STOP=1`: el bloque de Vehículo abortó exactamente como se esperaba (`ERROR: CAT-3: colision al normalizar Vehiculo.patente...`) y, consultando después, `Cliente.cuit` seguía siendo **`"30-11111111-1"`, sin ningún cambio** — la reversión fue completa, cero normalización parcial. Base temporal eliminada (`dropdb`) al terminar; la base local principal no fue tocada en ningún momento (confirmado antes y después: mismos 6/3/6/6 registros).

**Reconciliación del checksum local:** la versión anterior de esta migración (sin `BEGIN`/`COMMIT`) ya estaba aplicada en la base local principal, con su checksum antiguo registrado en `_prisma_migrations`. Confirmado `DATABASE_URL = localhost` antes de tocar nada, se eliminó **únicamente** esa fila (`DELETE ... WHERE migration_name = '20260804061709_normalizacion_transversal_identificadores_cat3'`, 1 fila afectada — nunca se reseteó la tabla ni la base) y se volvió a registrar con `npx prisma migrate resolve --applied <nombre>`, que hace que Prisma recalcule el checksum a partir del archivo actual, sin re-ejecutar la migración (los datos locales ya estaban normalizados de la corrida anterior — confirmado antes y después: mismos 6 CUIT de Cliente, todos canónicos). `npx prisma migrate status` confirma `Database schema is up to date!` sin drift.

Aplicada localmente con `npx prisma migrate deploy` y verificada con una consulta de solo lectura: los 5 campos, sobre las 27 filas existentes en ese momento, quedaron 100% canónicos, 0 problemas. `backend/prisma/seed.js` también se actualizó (normalización duplicada a propósito en JS plano, documentado en el propio archivo, porque el seed corre con `node` directo, fuera del build de TypeScript) para que un ambiente sembrado desde cero también quede canónico desde el primer momento, no solo el ya existente.

*Hallazgo incidental, no relacionado con CAT-3:* al re-ejecutar el seed se detectó que "Cliente Demo A" en la organización principal tiene un CUIT que no coincide con el que generaría el seed actual (`sembrarCatalogoBase` con `cuitBase="10000000"`) — un desajuste de datos preexistente entre versiones del seed, no introducido ni corregido en este bloque. La fila duplicada que este re-seed generó se eliminó antes de cerrar la validación.

### Pruebas incorporadas

- **`backend/src/common/normalizacion.spec.ts`** (25 tests): cada normalizador con guiones/puntos/espacios/mayúsculas, idempotencia (aplicar dos veces da el mismo resultado), DNI vacío/solo-separadores → `undefined`, `siPresente()` con valor presente/`undefined`/`null`/no-string.
- **`backend/src/catalogos/normalizacion-alta-edicion.spec.ts`** (34 tests): DTO (`plainToInstance` + `validate`, igual que el `ValidationPipe` real) para las 4 entidades, y un almacén Prisma-fake que simula la restricción única real de Postgres (incluida la semántica de que un `UPDATE` nunca colisiona con su propio valor anterior) — cubre, para Cliente/Transportista/Chofer/Vehículo: guarda el valor normalizado, rechaza un duplicado con formato distinto, edición no colisiona consigo misma, edición sí rechaza colisión con otro registro, aislamiento entre organizaciones. Incluye el bloque dedicado de edición de DNI (ver abajo).
- **`backend/src/common/prisma-mensajes.spec.ts`** (10 tests, nuevo en este cierre): las cuatro restricciones compuestas reales sin `organizacionId` en el mensaje, y los dos fallbacks seguros.
- **`backend/src/common/filters/filtros-globales.e2e.spec.ts`** (2 tests, nuevo en este cierre): regresión real de precedencia de filtros (ver arriba).
- **`backend/src/common/migracion-cat3-atomicidad.spec.ts`** (12 tests, nuevo en este cierre): lee el archivo real de la migración y confirma `BEGIN;`/`COMMIT;` explícitos, sin `COMMIT` intermedio, los cinco bloques contenidos entre ambos, ningún comando incompatible con transacciones explícitas, y cada campo con su chequeo de colisión antes de su `UPDATE` (ver "Atomicidad real" arriba).
- **Importadores CAT-1/CAT-2 actualizados** (`choferes.controller.importar.spec.ts` 24 tests, `vehiculos.controller.importar.spec.ts` 22, `clientes.controller.importar.spec.ts` 6, `transportistas.controller.importar.spec.ts` 4): se agregaron casos de CUIT/CUIL/patente con y sin guiones resolviendo al mismo registro, duplicado dentro del archivo con formatos distintos, y — para Clientes/Transportistas — un caso explícito de duplicado detectado vía la restricción real de la base (`P2002` → mensaje funcional) ya que esas dos importaciones no tienen detección proactiva en lote.

### DNI vacío en edición: decisión y prueba

Un `PATCH` de Chofer que **no envía** `dni` sigue sin tocar el valor guardado (Prisma ignora un campo `undefined` en `update()`). Un `PATCH` que **sí envía** `dni` vacío o compuesto solo por separadores (`""`, `" . - "`) es una intención explícita de **borrar el DNI**: `update-chofer.dto.ts` usa un transform dedicado (`normalizarDniEdicion()`, distinto de `siPresente(normalizarDni)` que usan el resto de los campos) que en ese caso normaliza a `null` — nunca a `undefined` — para que Prisma efectivamente limpie la columna en vez de dejarla sin cambios mientras el endpoint responde `200` como si hubiera aplicado el borrado pedido. El alta (`create-chofer.dto.ts`) no necesitó este ajuste: ahí no existe un valor previo que preservar, y `undefined`/vacío ya terminaba en `NULL` correctamente. Probado a nivel DTO y a nivel controller (verificando el `data` real que llega a `prisma.chofer.update()`) en `normalizacion-alta-edicion.spec.ts`.

### Validación final

- `npm run test:dev1`: 14/14 ✅
- Backend build: limpio
- Jest completo sin caché: **37 suites / 496 tests, todos verdes** (base CAT-2: 32 suites / 408 tests → **+5 suites, +88 tests**, medido, no estimado)
- Frontend `tsc -b` + `vite build`: limpios
- Migración aplicada y verificada en la base local (`localhost`)
- Validación manual en vivo (backend, vía API local): alta de Chofer con CUIL/DNI con guiones y puntos → guardado canónico; alta de Vehículo con patente en minúsculas y guiones → guardado canónico (`"ac-999-zz"` → `"AC999ZZ"`); importación CSV de Vehículos con `transportistaCuit` con guiones → resolvió el transportista correctamente; duplicado exacto de Cliente → `409` **"Ya existe un registro con este CUIT"** (repetido tras la corrección del mensaje, sin `organizacionId`); duplicado con formato distinto → mismo resultado
- **Validación manual visual en el navegador (los cuatro casos del checklist: Cliente, Transportista + búsqueda con otro formato, Chofer + borrado de DNI, Vehículo + duplicado de patente) — aprobada por Luis.**

### Auditoría productiva de solo lectura (previa a decidir si se aplica la migración)

Realizada manualmente por Luis directamente en Railway Database, **exclusivamente con `SELECT`** — sin mostrar variables ni secretos, sin ninguna escritura. Resultado agregado:

| Campo | Total | Cambiarían de formato | Normalizan a vacío | Colisiones |
|---|---:|---:|---:|---:|
| Cliente.cuit | 2 | 2 | 0 | 0 |
| Transportista.cuit | 2 | 2 | 0 | 0 |
| Chofer.cuil | 4 | 4 | 0 | 0 |
| Chofer.dni (no nulo) | 3 | 0 | 0 | 0 |
| Vehiculo.patente | 3 | 0 | 0 | 0 |

- **Migración `20260804061709_normalizacion_transversal_identificadores_cat3`: NO aplicada en producción** (0 filas coincidentes en `_prisma_migrations`).
- **Restricciones únicas verificadas presentes**, exactamente las que la migración asume: `Cliente_organizacionId_cuit_key`, `Transportista_organizacionId_cuit_key`, `Chofer_organizacionId_cuil_key`, `Chofer_organizacionId_dni_key`, `Vehiculo_organizacionId_patente_key`.
- **0 colisiones y 0 valores que normalizarían a cadena vacía** en los cinco campos, sobre los datos reales de producción — no hay ningún caso de aborto esperado con los datos actuales si se aplica la migración.
- Producción fue **consultada exclusivamente con `SELECT`** durante esta auditoría — **nunca modificada**: no se ejecutó la migración, no se corrieron seeds, no se escribió ningún dato de negocio.
- **Comparación de expresiones (auditoría vs. `migration.sql`):** las expresiones SQL de la migración (`regexp_replace(campo, '\D', '', 'g')` para CUIT/CUIL/DNI; `regexp_replace(upper(trim(both from patente)), '[\s.-]', '', 'g')` para patente) son equivalentes a los normalizadores de `backend/src/common/normalizacion.ts` (solo dígitos / mayúsculas sin separadores) — sin discrepancias. Cada chequeo de colisión (`DO $$ ... RAISE EXCEPTION ... END $$`) ocurre **antes** del `UPDATE` correspondiente en los cinco bloques, y los cinco bloques están envueltos entre `BEGIN;`/`COMMIT;` explícitos (ver "Atomicidad real" arriba — Prisma Migrate NO envuelve esto automáticamente para PostgreSQL). Una excepción no capturada dentro de un `DO $$ $$` deja la transacción abortada, y el `COMMIT;` final sobre una transacción abortada se traduce en `ROLLBACK` completo de los cinco bloques — nunca queda una migración parcialmente aplicada, verificado de forma reproducible en una base local desechable (ver arriba). El `UPDATE` de `Chofer.dni` no toca las filas ya `NULL` y convierte a `NULL` (vía `NULLIF(..., '')`) cualquier valor no nulo que normalice a cadena vacía — preserva la semántica documentada. Sin diferencias materiales encontradas.
- Esta auditoría es de **diagnóstico únicamente — la migración no se aplicó a producción** en este cierre; producción fue consultada, nunca modificada.
- **Flujo real de aplicación (no es un paso manual separado):** el `railway.json` del backend define `preDeployCommand: ["npx prisma migrate deploy"]`. Cuando se autorice el push de CAT-3 a `origin/main`, Railway va a reconstruir la imagen del backend y, **antes** de arrancar la nueva versión, va a ejecutar automáticamente `npx prisma migrate deploy` — eso es lo que aplica esta migración, no un comando manual aparte. Si la migración fallara, el deploy se detiene ahí (Railway no arranca la nueva versión del backend con una migración a medias) y no corresponde intentar ninguna reparación automática — habría que diagnosticar manualmente antes de reintentar.

### Deuda operativa (no relacionada con CAT-3 — no mezclar)

Durante la preparación de esta auditoría se intentó listar variables del servicio Postgres en Railway y, por un uso incorrecto del comando, se imprimió en la conversación un valor de contraseña. Verificado después: **ese valor no autentica** contra la base activa (falló la autenticación al probarlo directamente) — es una variable del servicio Postgres desincronizada respecto de la credencial realmente vigente, no la contraseña activa. El backend productivo fue confirmado sano (`/api/v1/health` → `200`, `database: connected`) sin ninguna rotación ni cambio de configuración. **El valor expuesto no se registra en ningún lugar de este repositorio.** Queda como deuda operativa **separada de CAT-3**: reconciliar las variables del servicio Postgres en Railway con la credencial realmente activa, en una ventana de mantenimiento propia.

### Frontend

`Clientes.tsx`/`Transportistas.tsx`: el filtro de búsqueda por CUIT ahora también compara dígito-a-dígito (además de la comparación de texto original) — sin este agregado, buscar `"30-12345678-9"` (como la mayoría de la gente lo escribe) no habría encontrado nada, porque el valor guardado ya no tiene guiones. No se tocó edición, orden, cards expandibles, ni el manejo de los inputs (siguen siendo controlados sin reformatear mientras el usuario escribe, para no romper el cursor) — la normalización ocurre en el backend al enviar, no en cada tecla. No existía ningún helper visual de formato de CUIT/CUIL previamente, así que no se agregó ninguno: los valores se muestran tal cual el backend los devuelve (canónicos, sin guiones).

### Limitaciones y deuda remanente

- `Organizacion.cuit` y `Productor.cuit` quedan **sin normalizar** — explícitamente fuera del pedido de CAT-3.
- El desajuste de datos del seed ("Cliente Demo A", ver arriba) queda documentado pero sin corregir — no es un problema de normalización.
- Detección proactiva en lote de CUIT para Clientes/Transportistas sigue como deuda de CAT-2, sin cambios.
- ~~`AuditLog` en altas/ediciones~~ — **cerrado por CAT-4** (ver sección abajo): las cuatro entidades ahora generan AuditLog en alta/edición/baja/reactivación/importación.

## CAT-4 — Auditoría integral de cambios en catálogos

**Objetivo:** Cliente/Transportista/Chofer/Vehículo no generaban ningún `AuditLog` en alta, edición, baja, reactivación ni importación CSV — a diferencia de Cobranza (FAC-3/FAC-4) y Usuario/Organización/GrupoEconómico, que sí lo hacían desde antes. CAT-4 cierra esa brecha reusando exactamente la pantalla de Auditoría Administrativa que ya existía (FAC-4), sin tocar frontend.

### Matriz auditada (previa a cualquier cambio de código)

| Entidad | Acción real | Endpoint | Rol permitido | AuditLog antes de CAT-4 |
|---|---|---|---|---|
| Cliente | Crear / Editar / Desactivar / Reactivar / Importar CSV | `POST` `PATCH` `DELETE /clientes[/:id]`, `POST /clientes/importar` | OPERACIONES, FACTURACION, ADMINISTRADOR | Ninguno |
| Transportista | ídem | `POST` `PATCH` `DELETE /transportistas[/:id]`, `POST /transportistas/importar` | OPERACIONES, ADMINISTRADOR | Ninguno |
| Chofer | ídem | `POST` `PATCH` `DELETE /choferes[/:id]`, `POST /choferes/importar` | OPERACIONES, LIQUIDACIONES, ADMINISTRADOR | Ninguno |
| Vehículo | ídem | `POST` `PATCH` `DELETE /vehiculos[/:id]`, `POST /vehiculos/importar` | OPERACIONES, ADMINISTRADOR (sin LIQUIDACIONES) | Ninguno |

Ningún helper/servicio de auditoría compartido existía en todo el backend antes de CAT-4 (confirmado por grep sobre los 16 archivos que ya usaban `auditLog.create()`/`tx.auditLog.create()`: todos inline, sin abstracción común). El modelo `AuditLog` (`id, organizacionId, usuarioId, entidad, entidadId, accion, datosAnteriores, datosNuevos, fecha`) representa las cinco acciones sin necesitar migración.

**Decisión de alcance confirmada explícitamente:** se audita al nivel del **contrato de backend**, no de lo que el frontend ejercita hoy. El frontend real de Cliente/Transportista solo llega a `activo` vía `PATCH .../:id` con `{ activo: !actual }` (nunca usa el `DELETE` dedicado); Chofer solo tiene UI para crear y editar `comisionPct`; Vehículo no tiene ninguna UI de editar/desactivar/reactivar. Los cuatro endpoints (`update`/`remove`) existen y responden igual en el backend para las cuatro entidades — auditar solo lo que el frontend usa hoy habría dejado sin rastro cualquier edición/baja hecha directamente contra la API.

### Política de eventos

- **Nomenclatura:** `entidad_accion` en snake_case (`cliente_creado`, `cliente_editado`, `cliente_desactivado`, `cliente_reactivado`; mismo patrón para `transportista_*`, `chofer_*`, `vehiculo_*`) — la convención dominante real (15 de 16 usos previos, `usuario_creado`/`usuario_editado`/`organizacion_editada`/etc.), no el patrón terse que solo usa Cobranza.
- **`DELETE /:id` y `PATCH /:id` con `{activo:false}` comparten la misma acción** (`X_desactivado`), decidida por el cambio real de `activo`, no por qué endpoint la disparó — son la misma mutación de negocio alcanzada por dos rutas.
- **Origen de importación CSV:** el modelo no tiene un campo dedicado para distinguir alta individual de alta por CSV. En vez de duplicar acciones (`cliente_creado_csv`), cada fila creada por importación reusa la misma acción que el alta individual (`cliente_creado`) y agrega una clave reservada `_origen: "importacion_csv"` dentro de `datosNuevos` (`backend/src/common/auditoria.ts`, `marcarOrigenImportacionCsv()`) — ningún campo real de las cuatro entidades se llama `_origen`, así que nunca se confunde con un dato de negocio. Mantiene el selector de acciones de Auditoría Administrativa sin duplicar entradas.
- **Sin evento agregado de lote de importación:** decisión explícita, no omisión. El modelo no tiene `batchId`/`importId` — agregarlo requeriría migración, y un evento por fila con `_origen` ya da trazabilidad completa sin ambigüedad ni riesgo de confundir el trail.
- **No hay backfill histórico:** CAT-4 solo audita operaciones desde su propio despliegue en adelante, tal como se pidió.

### Atomicidad

Mismo patrón que FAC-3/FAC-4 (`$transaction(async (tx) => {...})`): la mutación de negocio y el/los `AuditLog` corren en la misma transacción — si `auditLog.create()` falla, Prisma revierte también la mutación; si la mutación falla, nunca se llega a crear el AuditLog. `AuditLog` está en `ORGANIZACIONAL_MODELS`, así que `organizacionId` se inyecta automáticamente incluso dentro de `tx` — nunca se pasa manualmente.

- **`create()`:** entidad + AuditLog (`X_creado`, `datosAnteriores` ausente) en una transacción.
- **`update()`:** hace `findUnique` dentro del mismo `tx` para obtener el "antes" real (aislado por organización, igual que cualquier otra lectura), luego `update()`, luego compara antes/después con `calcularCamposCambiados()`.
- **`remove()` (`DELETE /:id`):** hace `findUnique` + `update({activo:false})` en la misma transacción; si `activo` ya era `false` (operación idempotente), no genera ningún evento.
- **`importar()`:** cada fila corre en su propio `$transaction` — entidad + AuditLog atómicos **por fila**, nunca todo el archivo en una sola transacción. Una fila cuyo `AuditLog` fallara no deja la entidad creada (revierte esa fila sola); las filas anteriores ya confirmadas se preservan intactas — mismo semántica de resultado parcial que CAT-1/CAT-2 ya tenían, ahora también atómica a nivel auditoría.

**Regla obligatoria de PATCH mixto (sección 3 del pedido):** un `PATCH` que cambia **solo** `activo` genera un único evento de estado (`X_desactivado`/`X_reactivado`); que cambia **solo** otros campos genera un único `X_editado`; que cambia **`activo` y otros campos en la misma petición** genera **dos eventos separados** (estado primero, edición después), ambos dentro de la misma transacción que el `UPDATE` — nunca se clasifica todo como un solo evento. Un `PATCH` que no cambia nada realmente (comparado campo a campo contra el valor previo, no solo "el campo vino en el body") no genera ningún evento.

### Datos personales — minimización antes de almacenar (ajuste obligatorio del usuario)

La propuesta inicial de este bloque era no enmascarar DNI/CUIL/teléfono/licencia porque ya son visibles en texto plano en otras pantallas — **el usuario no lo aprobó**: AuditLog tiene otra finalidad y retención potencialmente distinta, y que un dato sea consultable hoy en otra pantalla no justifica duplicarlo permanentemente en el historial de auditoría. Política final, implementada en `backend/src/common/auditoria.ts` (`sanitizarParaAuditoria()`, única función central, aplicada automáticamente por `registrarAuditoria()` — ningún controller la invoca a mano):

- `dni`, `cuil`, `telefono`, `licenciaNumero` → enmascarados, conservando como máximo los **últimos 4 caracteres** (`"30123456"` → `"****3456"`), comparación de nombre de campo sin distinguir mayúsculas/minúsculas.
- `cuit` (Cliente/Transportista) y `patente` (Vehículo) quedan **legibles** — son identificadores comerciales, no personales (decisión explícita del usuario para este bloque).
- Cualquier campo cuyo nombre matchee un patrón de secreto (`password`, `token`, `hash`, `secret`, `clave`, etc. — mismo patrón que ya usa el frontend de Auditoría Administrativa) se oculta por completo (`"[oculto]"`), como segunda salvaguarda estructural — ninguna de las cuatro entidades tiene hoy contraseñas/tokens.
- Aplica **recursivamente** a `datosAnteriores`/`datosNuevos` (objetos y arrays anidados).
- La clave reservada `_origen` nunca se enmascara ni se interpreta como dato personal.
- El diff que decide si un campo "cambió" (`calcularCamposCambiados()`) compara los valores **crudos**, antes de enmascarar — dos DNI distintos que enmascararían igual (mismos últimos 4 dígitos) no deben confundirse con "sin cambios".
- La sanitización visual de FAC-4 en el frontend (`PATRON_CLAVE_SENSIBLE`) **no se modificó** y sigue funcionando como segunda defensa — la de `auditoria.ts` es la primera, aplicada antes de escribir en la base.

### Snapshots por allowlist (nunca el objeto Prisma completo)

Cada controller define su propia función `snapshotX()` con una lista explícita de campos auditables — nunca se serializa el resultado de Prisma tal cual. Excluidos siempre: `organizacionId`, `id` (ya es `entidadId`), relaciones anidadas (`contactos`, `choferes`, `vehiculos`, `transportista`), timestamps técnicos (`createdAt`). Por entidad:

| Entidad | Campos en el snapshot |
|---|---|
| Cliente | `razonSocial`, `cuit`, `condicionesComerciales`, `activo` |
| Transportista | `razonSocial`, `cuit`, `domicilio`, `activo` |
| Chofer | `transportistaId`, `nombre`, `dni`, `cuil`, `comisionPct`, `licenciaNumero`, `licenciaVencimiento`, `telefono`, `activo` |
| Vehículo | `transportistaId`, `patente`, `marca`, `modelo`, `tipo`, `capacidadKg`, `vencimientoRto`, `vencimientoSeguro`, `activo` |

`transportistaId` se conserva como identificador plano (no como relación completa) porque es el único campo editable que muestra a qué transportista pertenece un Chofer/Vehículo — perderlo habría ocultado justamente el dato más relevante de una reasignación. Los eventos de edición (`X_editado`) solo incluyen los campos que **realmente cambiaron** (más un campo identificador estable — `razonSocial`/`nombre`/`patente` — para que el ADMINISTRADOR ubique el registro sin decodificar `entidadId`); los eventos de estado (`X_desactivado`/`X_reactivado`) incluyen ese mismo identificador más `activo`.

### Reutilización

`backend/src/common/auditoria.ts` — helper tipado único (no un servicio, no necesita inyección de dependencias): `registrarAuditoria(tx, {usuarioId, entidad, entidadId, accion, datosAnteriores?, datosNuevos?})` envuelve `tx.auditLog.create()` aplicando la sanitización siempre, más `calcularCamposCambiados()`, `subconjunto()` y `marcarOrigenImportacionCsv()` como utilidades puras compartidas por los cuatro controllers. Sin infraestructura nueva (sin colas, sin interceptores globales, sin event sourcing) — exactamente lo que pedía el punto 7 del alcance.

### Aislamiento multi-tenant y roles

- `AuditLog` está en `ORGANIZACIONAL_MODELS`: `organizacionId` se inyecta automáticamente en cada `auditLog.create()`, incluso dentro de `tx` — nunca se acepta del body ni se pasa manualmente en ningún punto de CAT-4 (verificado con una prueba dedicada sobre `registrarAuditoria()` que confirma que el objeto escrito nunca incluye la clave `organizacionId`).
- El "antes" de cada `update()`/`remove()` se lee con `tx.findUnique({where:{id}})` — el mismo mecanismo de aislamiento que cualquier otra lectura de la extensión; nunca se lee una entidad de otra organización para construir el snapshot previo.
- **Los roles de CAT-2 se preservaron exactamente**, sin ampliarlos: Choferes sigue siendo el único de los cuatro con `LIQUIDACIONES`; Vehículos sigue sin esa asimetría. No se agregó ningún `@Roles()` nuevo ni se relajó ninguno existente — CAT-4 solo agrega `@CurrentUser()` a los métodos que no lo tenían.

### Frontend

**Sin cambios.** Auditoría Administrativa (`AuditoriaAdministrativa.tsx`) ya obtiene entidades/acciones dinámicamente desde `GET /auditoria/opciones` (`groupBy` real sobre `entidad`/`accion`, sin lista hardcodeada) — confirmado con la suite existente `organizacion.controller.auditoria-opciones.spec.ts`, que ya prueba el comportamiento genérico con valores arbitrarios. Las nuevas entidades (`Cliente`, `Transportista`, `Chofer`, `Vehiculo`) y acciones (`*_creado`, `*_editado`, `*_desactivado`, `*_reactivado`) aparecerán solas en los selectores en cuanto existan eventos reales, sin ningún cambio de código en el frontend. La sanitización visual del frontend sigue aplicando igual sobre los valores ya enmascarados que llegan desde el backend.

**Limitación preexistente encontrada durante la validación manual (no introducida ni corregida por CAT-4):** el formulario rápido de alta de Chofer embebido en `Transportistas.tsx` no tiene campo de teléfono — solo Nombre, DNI, CUIL, N° Licencia y Comisión% (`nuevoChofer` en ese archivo). Un Chofer creado desde ese formulario persiste `telefono: null`, así que el enmascarado de teléfono no se puede observar visualmente desde esa pantalla. No es un defecto de CAT-4: el backend acepta y enmascara `telefono` igual que los otros tres campos personales cuando se envía (probado explícitamente en `backend/src/common/auditoria.spec.ts` y `backend/src/catalogos/choferes.controller.auditoria.spec.ts`, que sí crean choferes con teléfono y confirman `****xxxx`). Ampliar ese formulario queda fuera del alcance de CAT-4.

### Pruebas incorporadas (73 tests nuevos, 5 suites nuevas)

- **`backend/src/common/auditoria.spec.ts`** (24 tests): enmascarado de dni/cuil/telefono/licenciaNumero conservando últimos 4; cuit/patente sin tocar; ocultamiento total de campos-secreto; recursividad en objetos/arrays anidados; la clave `_origen` nunca se enmascara; `calcularCamposCambiados` (idéntico → sin cambios, fechas por valor no por identidad, `null`≡`undefined`); `subconjunto`; `registrarAuditoria` (forma exacta del registro, sanitiza antes de persistir, nunca incluye `organizacionId`, propaga el error si `auditLog.create` falla).
- **`clientes.controller.auditoria.spec.ts`** (16 tests), **`transportistas.controller.auditoria.spec.ts`** (11), **`choferes.controller.auditoria.spec.ts`** (11, incluye aserciones explícitas de enmascarado de DNI/CUIL/teléfono/licencia en create/update/importar), **`vehiculos.controller.auditoria.spec.ts`** (11): create (entidad+AuditLog, `datosAnteriores` vacío, rollback si `auditLog.create` falla), update (antes/después reales, PATCH idempotente sin evento, split de dos eventos en PATCH mixto, 404 sin tocar Prisma.update ni AuditLog si el registro no existe, rollback si `auditLog.create` falla, "antes" leído por el `tx` aislado), remove (baja lógica nunca física, sin evento fantasma si ya estaba inactivo), importar (evento por fila con `_origen`, fila rechazada sin entidad ni AuditLog, fila con fallo de auditoría no persiste la entidad y no afecta filas previas exitosas).
- Se actualizaron (sin cambiar su intención original) los specs preexistentes que ya mockeaban `create()`/`update()`/`importar()` de las cuatro entidades — `normalizacion-alta-edicion.spec.ts` y los cuatro `*.controller.importar.spec.ts` — para reflejar que ahora corren dentro de `$transaction` y reciben `@CurrentUser()`; ninguna aserción de negocio original se relajó ni se eliminó.

### Reconciliación del baseline

Cifra de referencia del usuario al abrir CAT-4: 36 suites / 484 tests. Medido en vivo antes de escribir código: **37 suites / 496 tests** — la diferencia es exactamente `migracion-cat3-atomicidad.spec.ts` (1 suite, 12 tests), agregado por CAT-3 y ya commiteado localmente (`48cbd1a`) antes de que arrancara este bloque; confirmado por `git log --follow` sobre ese archivo (aparece únicamente en el commit de CAT-3) y por conteo manual de sus `it(...)` (6 sueltos + 1 + `it.each` de 5 = 12). Ningún archivo ajeno explica la diferencia.

**Baseline real de cierre de CAT-4: 42 suites / 569 tests** (37/496 + 5 suites / 73 tests nuevos de este bloque).

### Validación

- `npm run test:dev1`: 14/14 ✅ (no relacionado con CAT-4, confirma que nada del entorno se rompió)
- Backend build (`nest build`): limpio
- `npx jest --no-cache` (backend, completo): **42 suites / 569 tests, todos verdes**
- Frontend `tsc -b` + `vite build`: limpios (CAT-4 no tocó ningún archivo de frontend)
- `git diff --check`: sin errores de espacio en blanco (solo avisos de conversión LF→CRLF, normales en este repo)

### Validación manual local

**Incidente en la primera ronda — sin correlato verificable en la base.** Se entregó a Luis un checklist visual de 10 pasos (Cliente, Transportista, Chofer, Vehículo, importación CSV, filtros, identidad del actor) y reportó los seis puntos como correctos. Al ir a limpiar los datos de prueba, **ninguno de los identificadores acordados existía en la base local conectada al backend** — el único evento real en `AuditLog` para las cuatro entidades era un `cliente_creado` aislado de un Cliente llamado "losnanos", sin relación con el checklist. Diagnóstico de solo lectura (sin tocar producción ni Railway): la configuración local no presentaba ninguna ambigüedad técnica — `backend/.env` apunta sin ambigüedad a `localhost:5432/cereal_db`, y `frontend/` no tiene ningún `.env` propio (solo `.env.example`), así que `api/client.ts` cae siempre a su fallback hardcodeado `http://localhost:3000/api/v1`. Sí se encontraron **tres árboles `npm run dev` completos corriendo en paralelo** (iniciados en tres momentos distintos, sin que ninguno cerrara al anterior — el `preflight` de DEV-1 no impidió los arranques sucesivos), pero los tres cargaban el mismo `.env`, así que no explican por sí solos una base de datos distinta. La causa más probable de la discrepancia — pestaña de navegador vieja, otro puerto, u otra URL — no pudo confirmarse de forma remota. **La primera ronda no se declaró válida ni se documenta acá como comprobada contra la base.**

**Saneamiento del entorno.** Se cerraron los tres árboles `npm run dev` completos (`taskkill /T /F` sobre la raíz de cada uno, confirmando primero que las tres cadenas de procesos pertenecían a este repo) y se levantó una única instancia mediante el flujo estándar de DEV-1. Verificado: un solo proceso backend y uno frontend (un PID cada uno), `localhost:5432/cereal_db`, `GET /health` → `200` con `database: connected`, login `admin@demo.com` exitoso.

**Comprobación de conexión antes de repetir.** Antes de crear cualquier dato, se le pidió a Luis abrir una **pestaña nueva** en `http://localhost:5173` (no reutilizar la anterior) y confirmar en DevTools → Network que la `Request URL` de la llamada a `/clientes` empezara exactamente con `http://localhost:3000/api/v1` — confirmado por Luis antes de continuar.

**Segunda ronda (abreviada), con evidencia consultada en la base local después de cada paso, antes de habilitar el siguiente:**
- **Cliente individual:** creado desde la UI (`CAT4-B Cliente Temp`) → verificado en la base: un único registro, un único `AuditLog` `cliente_creado`, `datosAnteriores` vacío, `datosNuevos` correcto, actor `admin@demo.com` / `Admin General`, sin eventos duplicados.
- **Chofer:** creado desde la UI dentro de un Transportista **ya existente** ("Transportista Demo A" — no se creó ni modificó ningún Transportista) → verificado un único registro y un único `AuditLog` `chofer_creado`; DNI/CUIL/licencia enmascarados exactamente `****` + últimos 4 caracteres; ninguno de los cuatro valores completos aparece en el JSON del evento (verificado por búsqueda de substring); actor correcto; `nombre`/`transportistaId` correctos.
- **Teléfono:** no observable desde esta pantalla — el formulario rápido de alta de Chofer en `Transportistas.tsx` no tiene campo de teléfono (ver "Frontend" arriba), así que se persistió `null`. Su enmascarado queda cubierto **exclusivamente por pruebas automatizadas** (`auditoria.spec.ts`, `choferes.controller.auditoria.spec.ts`), no por esta ronda visual.
- **Importación CSV de Cliente:** una fila válida + una fila con el mismo CUIT en otro formato → la UI reportó 1 creado / 1 rechazado; verificado en base: el creado existe con `datosNuevos._origen: "importacion_csv"`, actor correcto; la fila rechazada nunca llegó a existir como Cliente ni generó ningún `AuditLog` (confirmado además con una búsqueda amplia por si hubiera quedado un evento huérfano); sin duplicados.

**Qué NO fue revalidado visualmente en esta segunda ronda** — permanece cubierto únicamente por las 73 pruebas automatizadas de CAT-4 (ver "Pruebas incorporadas" arriba) y por la auditoría técnica del bloque, **no por evidencia de base de datos de esta ronda**: edición/desactivación/reactivación de Cliente; el ciclo completo de Transportista (crear/editar/desactivar/reactivar); alta/edición/baja/reactivación de Vehículo; la regla de PATCH mixto (dos eventos cuando cambian `activo` y otro campo en la misma petición); los eventos no-op; los filtros de Auditoría Administrativa por entidad/acción/rango de fecha y su paginación. No se afirma que estos casos hayan sido comprobados contra la base en esta segunda ronda.

**Limpieza de los datos de esta segunda ronda.** Los tres registros de prueba (`CAT4-B Cliente Temp`, `CAT4-B Cliente CSV Temp`, `CAT4-B Chofer Temp`) se eliminaron con un script de mantenimiento puntual fuera de la aplicación (`Prisma.delete()` directo, no vía los endpoints) — la regla de CAT-4 de nunca hacer baja física rige el comportamiento de la aplicación sobre datos de negocio reales, no la limpieza de fixtures de prueba desechables creados minutos antes. Verificado: conteos finales idénticos al baseline previo a la validación (Cliente 7, Transportista 3, Chofer 6, Vehículo 6); "losnanos" y "Transportista Demo A" intactos; `AuditLog` preservado íntegro como evidencia (72 eventos, incluidos los tres de esta ronda) — nunca se borra un `AuditLog`.

### Deuda remanente

- ~~Detección proactiva en lote de CUIT para Clientes/Transportistas (CAT-1)~~ — **cerrado por CAT-5** (ver sección abajo).
- La deuda operativa de variables de Postgres en Railway (ver CAT-3) sigue sin tocar, fuera del alcance de este bloque.
- El ciclo completo de Transportista, Vehículo, la regla de PATCH mixto y los filtros de Auditoría Administrativa no tienen evidencia de validación visual contra la base en este cierre (ver "Validación manual local" arriba) — quedan cubiertos únicamente por las 73 pruebas automatizadas y por la auditoría técnica del bloque. Si se detecta algo inesperado en producción, revisar primero ahí.
- El formulario rápido de alta de Chofer no captura teléfono (ver "Frontend" arriba) — deuda preexistente, no introducida por CAT-4, fuera de su alcance corregirla ahora.

## CAT-5 — Importación CSV eficiente y predecible de Clientes y Transportistas

**Problema anterior (deuda documentada desde CAT-2):** `ClientesController.importar()` y `TransportistasController.importar()` no tenían ninguna detección proactiva de CUIT duplicado — a diferencia de Choferes/Vehículos (CAT-2), que sí resuelven duplicados en lote. Antes de CAT-5, un archivo con un CUIT ya existente o repetido dependía enteramente de que el `create()` real chocara contra la restricción única de Postgres (`P2002`): cero consultas de lectura antes del loop, pero una transacción completa (create + intento de `AuditLog`) abierta y revertida por cada fila condenada a fallar. El "duplicado dentro del archivo" solo funcionaba porque el procesamiento era secuencial — la primera fila ya estaba comprometida en la base cuando la segunda intentaba escribir — no por una comparación explícita. Tampoco existía `validarEncabezados()` (sí presente en CAT-2): un CSV con la columna `cuit` mal escrita fallaba fila por fila con un mensaje de DTO, en vez de rechazarse completo con un mensaje claro.

### Algoritmo final (tres fases, sin consultas por fila)

Implementado igual en `ClientesController.importar()` y `TransportistasController.importar()` (`backend/src/catalogos/`):

1. **En memoria, sin tocar la base:** valida encabezados (`validarEncabezados()`, mismo criterio que CAT-2 — encabezados obligatorios ausentes o duplicados rechazan el archivo completo antes de leer una fila), límite de filas, y por cada fila válida según su DTO (`CreateClienteDto`/`CreateTransportistaDto`, con la normalización de CUIT de CAT-3 ya aplicada vía `@Transform`), detecta si el CUIT ya normalizado se repite dentro del propio archivo (`esDuplicadoEnArchivo()`, `backend/src/common/importacion-csv.ts`). Una fila cuyo DTO es inválido nunca llega a esta comparación, así que no "reserva" su CUIT — una fila válida posterior con el mismo CUIT puede crearse igual.
2. **Una única consulta batch:** `cliente.findMany({ where: { cuit: { in: [...] } } })` (o `transportista.findMany`) por los CUIT de las filas que sobrevivieron la fase 1 — nunca `findUnique`/`findFirst` por fila, y nunca se ejecuta si no quedó ninguna fila candidata. Ya acotada a la organización activa por la extensión de aislamiento (Bloque 8.1.d): `organizacionId` nunca se lee del CSV ni del body, ni se agrega ningún filtro manual.
3. **Creación en orden original:** cada fila candidata que no está en el conjunto de existentes se crea, en el mismo orden en que aparece en el archivo, con su `AuditLog` atómico (CAT-4). `P2002` durante este `create()` sigue existiendo como defensa final ante una condición de carrera real (otro proceso crea el mismo CUIT entre el paso 2 y el `create()`), traducido al mismo mensaje funcional seguro que ya usaba `mensajeErrorImportacion()` — nunca nombres de índice, `organizacionId`, SQL ni el mensaje crudo de Prisma.

`detalle` se arma indexando cada resultado por la posición original de su fila (`resultados[i]`), no por el orden en que cada fase resuelve las filas — así el resumen sale siempre en el orden del archivo sin importar si una fila se rechazó en la fase 1, 2 o 3.

### Cantidad de consultas vs. filas

| | Antes de CAT-5 | Después de CAT-5 |
|---|---|---|
| Lecturas antes del loop | 0 | 1 (0 si no hay filas candidatas) |
| Intentos de `create()` | 1 por cada fila con DTO válido (incluidas las condenadas a P2002) | 1 solo por fila que pasó ambos filtros (DTO + no-duplicada) |

No hay N+1 en ningún punto: la única consulta de lectura es una sola por archivo completo, sin importar cuántas filas tenga (probado explícitamente — ver "Pruebas" abajo).

### Normalización

Reutiliza sin cambios `normalizarCuit()`/`siPresente()` de CAT-3, ya aplicados por `@Transform()` en `CreateClienteDto`/`CreateTransportistaDto`. CAT-5 no agrega ninguna normalización nueva — solo compara los valores que el DTO ya normalizó.

### Semántica de primera aparición

Sin cambios respecto del contrato histórico: la primera aparición válida de un CUIT dentro del archivo se crea; las apariciones posteriores del mismo CUIT (con cualquier formato) se rechazan con `"CUIT '<valor>' duplicado dentro del archivo."`. Probado explícitamente el caso límite: una primera fila inválida (por otro motivo, ej. `razonSocial` vacía) seguida de una segunda fila válida con el mismo CUIT — la segunda se crea, porque la primera nunca llegó a registrarse como "vista".

### Condición de carrera y P2002

La consulta batch de la fase 2 es una foto de un instante — no reemplaza la restricción única real de la base. Si dos procesos importan el mismo CUIT nuevo casi simultáneamente, ambos pueden pasar la fase 2 sin verse; el `create()` real de uno de los dos sigue protegido por `@@unique([organizacionId, cuit])` y su fallo se traduce con `mensajeErrorImportacion()` al mismo mensaje funcional que cualquier otro duplicado — nunca expone el error crudo de Prisma/Postgres. Probado con un mock que hace pasar la fase 2 (CUIT no encontrado) y falla igual el `create()` con P2002.

### Atomicidad por fila (CAT-4, sin cambios de diseño)

Cada fila creada sigue ejecutando `create()` + `registrarAuditoria()` dentro del mismo `$transaction` — si el `AuditLog` falla, esa fila no persiste; si el `create()` falla, no hay `AuditLog` huérfano. CAT-5 no toca este mecanismo, solo reduce cuántas filas llegan a intentarlo.

### AuditLog

`accion: "cliente_creado"` / `"transportista_creado"`, `datosNuevos._origen: "importacion_csv"` — mismo contrato de CAT-4, sin cambios. Una fila rechazada en cualquiera de las tres fases (inválida, duplicada en archivo, ya existente, o P2002) nunca genera `AuditLog`. No se agregó ningún evento agregado de lote — mismo criterio que CAT-4 (el modelo no tiene `batchId`, y un evento por fila con `_origen` ya alcanza).

### Aislamiento multi-tenant

`organizacionId` nunca se lee del CSV ni del body en ningún punto (los DTO ni siquiera tienen ese campo). La consulta batch de existentes se apoya exclusivamente en la extensión de aislamiento (Bloque 8.1.d, ya probada en `organizacion-prisma.client.spec.ts`) — CAT-5 no agrega ningún filtro manual de organización, ni podría comparar contra otra organización aunque quisiera, porque `findMany` ya viene acotado antes de que el controller vea el resultado.

### Reutilización

`backend/src/common/importacion-csv.ts` — `esDuplicadoEnArchivo(clave, vistasEnArchivo)`, una única función pura (no un framework): dado un `Set` compartido entre las filas de un mismo archivo, indica si una clave ya normalizada es la primera aparición o una repetición. Deliberadamente **no** se generalizó el patrón completo de tres fases en una utilidad común a las cuatro importaciones: Choferes/Vehículos (CAT-2) resuelven una relación externa (`transportistaCuit`) y comparan dos claves simultáneas (CUIL+DNI), una forma genuinamente distinta al caso de una sola clave y una sola entidad que cubre CAT-5 — forzar una abstracción común habría sido más compleja que el problema que resuelve. **No se modificó `ChoferesController` ni `VehiculosController`** — su lógica de duplicados en lote ya existía, ya está probada, y no comparte código con la nueva utilidad.

### Frontend

**Sin cambios.** El contrato de respuesta (`total`/`creados`/`rechazados`/`detalle`, cada `detalle[i]` con `fila`/`ok`/`mensaje`) es idéntico al anterior — la UI de importación en `Clientes.tsx`/`Transportistas.tsx` sigue funcionando sin ningún ajuste. No se encontró ningún defecto real de presentación que justificara tocar el frontend.

### Pruebas incorporadas (33 tests nuevos, 1 suite nueva)

- **`backend/src/common/importacion-csv.spec.ts`** (4 tests): primera aparición vs. repetición, clave vacía nunca es duplicado, claves distintas no interfieren.
- **`clientes.controller.importar.spec.ts`** (20 tests, +14 sobre el baseline previo) y **`transportistas.controller.importar.spec.ts`** (19 tests, +15): archivo vacío; encabezados ausentes/duplicados; fila DTO inválida; CUIT duplicado exacto y con formato distinto dentro del archivo; primera fila inválida + segunda válida con el mismo CUIT; CUIT ya existente en la organización; aislamiento (un CUIT que la consulta batch no devuelve se trata como inexistente, sin comparación manual); la consulta de existentes se ejecuta exactamente una vez (y cero veces si no hay candidatas); mezcla completa de válidas/existentes/repetidas/inválidas con orden y conteos exactos; P2002 por condición de carrera traducido a mensaje funcional; error inesperado nunca expone detalles crudos; AuditLog por fila creada con `_origen`; fila rechazada sin AuditLog; fallo de AuditLog revierte solo esa fila y preserva las anteriores exitosas.
- Se actualizaron (sin relajar su intención) los dos tests de CAT-4 en `clientes.controller.auditoria.spec.ts`/`transportistas.controller.auditoria.spec.ts` que mockeaban `importar()`, agregando el nuevo `findMany` batch a su mock — ninguna aserción de negocio se eliminó.
- Ningún test previo de CAT-1/CAT-2/CAT-3/CAT-4 se relajó o eliminó; los dos tests de "duplicado dentro del archivo vía P2002" se actualizaron para reflejar la detección proactiva (ahora `create()` se llama una sola vez, no dos) — comportamiento intencionalmente mejorado, no una regresión.

### Validación

- `npm run test:dev1`: 14/14 ✅
- Backend build: limpio
- `npx jest --no-cache`: **43 suites / 602 tests, todos verdes** (baseline 42/569 + 1 suite/33 tests, reconciliado exacto)
- Frontend `tsc -b` + `vite build`: limpios (CAT-5 no tocó ningún archivo de frontend)
- `git diff --check`: sin errores

### Validación manual local

Ejecutada por Luis contra la base local, con verificación en base después de cada importación (dos rondas: la primera reveló un problema en la preparación de datos, no en el producto; la segunda quedó limpia).

**Incidente en la preparación de la primera ronda (no un defecto de CAT-5):** el script usado para elegir un CUIT "ya existente" en la organización de prueba consultó con `PrismaClient` crudo, sin pasar por la extensión de aislamiento organizacional de la aplicación, y sin filtrar manualmente por organización — devolvió el primer registro de toda la tabla, que pertenecía a **otra** organización, no a la del usuario de prueba. Al importar ese CUIT, la fila se creó en vez de rechazarse — comportamiento **correcto**: `@@unique([organizacionId, cuit])` permite legítimamente el mismo CUIT en organizaciones distintas, y la consulta batch real del controller (correctamente acotada por la extensión) nunca debía tratarlo como duplicado. Confirmado con el propio `AuditLog` generado (organización, actor y `_origen` correctos) que la importación se comportó exactamente como debía. La segunda ronda se preparó filtrando explícitamente por la organización real del usuario de prueba antes de elegir los CUIT "existentes", y quedó limpia.

**Clientes (segunda ronda, válida):** archivo de 4 filas → UI reportó **1 creado / 3 rechazados**, en el orden esperado: fila con CUIT nuevo creada; fila con el mismo CUIT en otro formato rechazada por "duplicado dentro del archivo"; fila con CUIT ya existente en la organización rechazada por "ya existe"; fila con razón social vacía rechazada por validación. Verificado en base: exactamente el Cliente esperado creado, ningún rastro de las tres filas rechazadas, un único `AuditLog` `cliente_creado` con `_origen: "importacion_csv"` y actor administrador correcto, cero eventos para las filas rechazadas.

**Transportistas:** mismo patrón de 4 filas, mismo resultado UI (**1 creado / 3 rechazados**, mismo orden y motivos), misma verificación en base — exactamente igual de limpio.

**Limpieza posterior:** se identificaron y eliminaron, por ID exacto y solo tras confirmar que cada uno coincidía en nombre/CUIT/organización con lo esperado, los registros funcionales de prueba de ambas rondas (incluidos los dos que quedaron creados por el incidente de preparación de la primera ronda) — verificadas cero dependencias antes de borrar. Los registros preexistentes usados como referencia de "ya existente" quedaron intactos, verificado campo por campo. Los `AuditLog` de las cuatro creaciones de prueba **se conservaron como evidencia**, sin excepción.

### Limitaciones y deuda remanente

- El límite de 2000 filas (`LIMITE_FILAS_IMPORTACION_CSV`) y el límite de tamaño de archivo (2 MB) no cambiaron — siguen siendo los mismos de CAT-1/CAT-2.
- La detección de duplicados sigue siendo por CUIT únicamente (la única restricción `@@unique` real de Cliente/Transportista además de `id`) — no se agregó ninguna otra clave.
- No se implementó ningún mecanismo de reintento automático ante P2002 — la fila se rechaza y debe volver a importarse manualmente, mismo criterio que Choferes/Vehículos.
- No se tocó la deuda de CAT-3 (`Organizacion.cuit`/`Productor.cuit` sin normalizar) ni la de CAT-4 (Transportista/Vehículo/filtros sin validación visual, teléfono de Chofer) — fuera de alcance de este bloque.

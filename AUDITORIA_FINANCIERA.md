# Auditoría de trazabilidad — módulo financiero

## AUD-1 — Auditoría de acciones financieras (Anticipos, Liquidaciones, Facturas)

**Problema anterior:** `docs/deuda-tecnica/DEUDA_TECNICA.md`, sección B, ya documentaba "AuditLog desigual — solo anulación de cobranza y override de `comisionPct` dejan rastro; anulación de anticipos/liquidaciones/facturas y ediciones de catálogos no". La parte de catálogos ya la cerró CAT-4/CAT-6/CAT-7 (ver `AUDITORIA_CATALOGOS.md`). AUD-1 cierra la parte financiera: `AnticipoGasto.create()/update()/anular()`, `Liquidacion.confirmar()/pagar()/anular()` y `Factura.create()/anular()` no tenían ningún rastro de quién/cuándo/qué, pese a ser acciones financieras reales (anular una factura o una liquidación revierte estado de viajes y anticipos).

### Decisión de producto confirmada antes de implementar

`registrarCobranza()`/`anularCobranza()` (Facturas) y el evento `comisionPct_override` (Liquidación) **no se tocaron** — quedan byte a byte iguales en nombre, entidad, `entidadId` y payload, por instrucción explícita. AUD-1 solo agrega eventos a operaciones que hoy carecían de trazabilidad.

### Matriz — alcance real auditado

| Entidad | Método | Transacción antes | AuditLog antes | Evento agregado |
|---|---|---|---|---|
| `AnticipoGasto` | `create()` | ninguna | ninguno | `anticipo_creado` |
| | `update()` | ninguna | ninguno | `anticipo_editado` |
| | `anular()` | ninguna | ninguno | `anticipo_anulado` |
| `Liquidacion` | `create()` | ✅ (ya existía) | parcial (`comisionPct_override`, condicional) | `liquidacion_creada` (siempre, conviviendo con el evento existente) |
| | `confirmar()` | ninguna | ninguno | `liquidacion_confirmada` |
| | `pagar()` | ✅ (ya existía) | ninguno | `liquidacion_pagada` |
| | `anular()` | ✅ (ya existía) | ninguno | `liquidacion_anulada` |
| `Factura` | `create()` | ✅ (ya existía) | ninguno | `factura_creada` |
| | `anular()` | ✅ (ya existía) | ninguno | `factura_anulada` |
| | `registrarCobranza()`/`anularCobranza()` | ✅ (ya existía) | ✅ (ya existía) | **sin cambios, por decisión explícita** |

Solo 4 de los 9 métodos requirieron envolver una transacción por primera vez (`AnticipoGasto.create/update/anular`, `Liquidacion.confirmar`) — en los 5 restantes se reutilizó el `tx` ya existente, sin transacciones anidadas en ningún caso.

### Acciones implementadas

`anticipo_creado`, `anticipo_editado`, `anticipo_anulado`, `liquidacion_creada`, `liquidacion_confirmada`, `liquidacion_pagada`, `liquidacion_anulada`, `factura_creada`, `factura_anulada` — exactamente las 9 correspondientes a operaciones reales. Ninguna acción de estado inventada.

### Atomicidad

Reutiliza `registrarAuditoria`/`calcularCamposCambiados`/`subconjunto` (`common/auditoria.ts`, CAT-4) sin modificarlos ni duplicarlos. `usuarioId` exclusivamente de `@CurrentUser()` — se agregó ese decorator donde faltaba (`AnticipoGasto.update()/anular()`, `Liquidacion.confirmar()/pagar()/anular()`, `Factura.create()/anular()`). `Factura.create()`/`anular()` reutilizan además `asegurarUsuarioIdentificable()`, helper local ya existente en el mismo archivo (defensa en profundidad previa a `registrarCobranza()`), aplicado ahora también a estos dos métodos por consistencia — sin crear un helper nuevo.

### Snapshots por allowlist

Ningún objeto Prisma completo se serializa. Las FK (`choferId`/`transportistaId`/`tipoGastoId`/`viajeId`/`clienteId`) quedan legibles en los snapshots — mismo criterio que `Chofer.transportistaId` en CAT-4: son la relación editable en sí, no dato personal. Ningún campo de este alcance es `Prisma.Decimal` (`importe`/`comisionPct`/totales son `Float` en el schema); `Date` se deja pasar tal cual (ya soportado por `sanitizarParaAuditoria`, mismo comportamiento que `Chofer.licenciaVencimiento` en producción).

- **`AnticipoGasto`**: `{choferId, transportistaId, tipoGastoId, viajeId, fecha, importe, observaciones, comprobanteAdjunto}` — **`comprobanteAdjunto: boolean`, nunca `comprobanteUrl`** (ver "Política de comprobantes" abajo). Sin campo identificador forzado en `anticipo_editado` (la entidad no tiene un "nombre" natural, a diferencia de Cliente/Chofer/Productor) — `entidadId` ya localiza el registro. `anticipo_anulado` incluye `anuladoMotivo`/`importe`/`fecha` como anclas de lectura humana.
- **`Liquidacion`**: `liquidacion_creada` = `{tipo, transportistaId, choferId, periodoDesde, periodoHasta, comisionPct, cantidadViajes, cantidadAnticipos}` — **sin los totales** (`totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar`), porque `recomputeTotales()` corre *después* del `$transaction` de `create()` — incluirlos habría auditado el valor default (`0`), no el real. Eventos de transición (`confirmada`/`pagada`/`anulada`) = `{numero, estado}` antes/después (`numero` como identificador estable legible, mismo criterio que `razonSocial` en Cliente); `pagada` agrega `fechaPago`.
- **`Factura`**: `factura_creada` = `{clienteId, numero, fecha, vencimiento, importe}`. `factura_anulada` = `{numero, estado}` antes/después.

### Política de comprobantes (`AnticipoGasto.comprobanteUrl`) — corrección post-revisión

**Evidencia inspeccionada antes de decidir:** `comprobanteUrl` es un campo `@IsString()` sin ninguna restricción de formato/dominio en `CreateAnticipoDto`/`UpdateAnticipoDto` — el cliente lo envía tal cual en el body, el backend nunca lo genera ni lo firma, y se persiste literal (`data: { comprobanteUrl: body.comprobanteUrl || null }`). No hay ningún control ni en el DTO ni en el schema que garantice que sea una ruta interna: puede ser cualquier URL, incluida una con firma/token de acceso temporal (ej. un link firmado de almacenamiento en la nube). `sanitizarParaAuditoria()` **no la enmascara** — ni `PATRON_CLAVE_SECRETA` (`password|contrase|hash|token|secret|clave|authorization|cookie|api[_-]?key`) ni `CAMPOS_A_ENMASCARAR` matchean el nombre de clave `comprobanteUrl` — así que un snapshot con la URL cruda habría quedado en texto plano en `AuditLog`, sin la protección que sí tienen `dni`/`cuil`/`telefono`/`licenciaNumero`.

**Sin evidencia de que la columna sea segura, se optó por minimizar en vez de confiar:** el snapshot nunca incluye `comprobanteUrl`, solo `comprobanteAdjunto: !!comprobanteUrl` (presencia, no valor). Casos:
- **Alta / se agrega un comprobante donde no había:** el booleano cambia (`false→true`) — se ve como cualquier otro campo editado, vía `calcularCamposCambiados`.
- **Se quita un comprobante:** el booleano cambia (`true→false`) — mismo mecanismo.
- **Se reemplaza un comprobante por otro** (ambos presentes, referencia real distinta): el booleano **no cambia** (`true→true`) — sin manejo especial, el cambio quedaría invisible. Se detecta comparando los valores crudos **solo para decidir si hubo cambio, nunca para guardarlos**, y se agrega un marcador explícito: `datosAnteriores: {comprobanteAdjunto: true}`, `datosNuevos: {comprobanteAdjunto: true, comprobanteActualizado: true}`.
- **Se reenvía exactamente el mismo comprobante:** ni el booleano ni la comparación cruda detectan cambio → 0 eventos, igual que cualquier PATCH idempotente.

Verificado por test que ninguna URL (`https://...`) ni la clave `comprobanteUrl` aparecen en el JSON serializado de ningún evento generado por este módulo.

### Idempotencia — corregido tras revisión (no todo "ya anulado" es un no-op)

**`AnticipoGasto.anular()`:** no verificaba `anulado` antes de proceder — una segunda llamada puede repetir el mismo motivo (sin cambio real) o enviar un motivo distinto (cambio real de `anuladoMotivo`, con `anulado` ya en `true`). Se comparan **ambos campos** (`actual.anulado !== actualizado.anulado || actual.anuladoMotivo !== actualizado.anuladoMotivo`): mismo motivo repetido → 0 eventos; motivo distinto → 1 evento `anticipo_anulado` con el motivo anterior y el nuevo en `datosAnteriores`/`datosNuevos`. No se agregó ninguna excepción nueva — la regla de negocio (permitir la segunda llamada) no cambió.

**`Liquidacion.anular()`:** solo bloquea `PAGADA` con una excepción propia — una liquidación ya `ANULADA` puede volver a pasar por `anular()` sin rechazo. Se compara `estado` antes/después: `BORRADOR`/`CONFIRMADA → ANULADA` genera evento; `ANULADA → ANULADA` (estado sin cambio real) no genera ninguno. `Factura.anular()` sigue el mismo criterio (`estado` antes/después), sin cambios adicionales respecto de la versión previa de este documento.

### Errores y duplicados

Sin cambios de infraestructura — `PrismaExceptionFilter`/mensajes funcionales existentes intactos. Ninguna operación rechazada por 404/400 genera `AuditLog` (verificado por test en los 9 métodos).

### Frontend

**Sin cambios.** `AuditoriaAdministrativa.tsx` ya deriva entidades/acciones dinámicamente (`groupBy` sobre datos reales, confirmado en CAT-7) — `AnticipoGasto`/`Liquidacion`/`Factura` y las 9 acciones nuevas aparecerán como opciones de filtro sin ningún cambio de código.

**Limitación reconocida explícitamente:** `Anticipos.tsx` no tiene ningún control de edición (el `PATCH` existe en el backend, ninguna pantalla lo usa — mismo patrón que `Productor` en CAT-6/7). `anticipo_editado` queda cubierto **únicamente por los tests automatizados**, sin validación manual end-to-end posible sin herramientas de desarrollador.

### Archivos tocados

- `backend/src/anticipos/anticipos.controller.ts` — `create()`/`update()`/`anular()` reescritos con `$transaction` + `registrarAuditoria`.
- `backend/src/liquidaciones/liquidaciones.controller.ts` — `liquidacion_creada` agregado a `create()` (sin tocar `comisionPct_override`); `confirmar()` envuelto en `$transaction` nuevo; `liquidacion_pagada`/`liquidacion_anulada` agregados a las transacciones ya existentes.
- `backend/src/facturas/facturas.controller.ts` — `factura_creada`/`factura_anulada` agregados a las transacciones ya existentes de `create()`/`anular()`; `@CurrentUser()` + `asegurarUsuarioIdentificable()` agregados a ambos métodos.
- `backend/src/facturas/facturas.controller.anular-factura.spec.ts` — adaptado a la nueva firma (actor + mock de `tx.auditLog.create`), mismas 4 reglas de negocio originales sin cambios.
- `backend/src/anticipos/anticipos.controller.auditoria.spec.ts` (nuevo, 20 tests — incluye los agregados en la corrección post-revisión: comprobante agregado/reemplazado/repetido, y anulación con motivo repetido vs. motivo distinto).
- `backend/src/liquidaciones/liquidaciones.controller.auditoria.spec.ts` (nuevo, 17 tests — incluye `ANULADA→ANULADA` sin evento fantasma).
- `backend/src/facturas/facturas.controller.auditoria.spec.ts` (nuevo, 8 tests).

### Pruebas incorporadas (3 suites nuevas / 45 tests nuevos en Jest backend)

Mismo patrón que `clientes.controller.auditoria.spec.ts` (CAT-4): mock de `tx` (`findUnique`/`create`/`update`/`auditLog.create`) + `$transaction: jest.fn((fn) => fn(tx))`. Cobertura por método: evento + actor correctos, `datosAnteriores`/`datosNuevos` = allowlist exacta, edición real con antes/después reales, idempotente → cero eventos, transición de estado inválida → 400 sin `AuditLog`, 404 sin escritura, fallo de `auditLog.create` propagado, convivencia de `liquidacion_creada` con `comisionPct_override` (con y sin override), aislamiento (mismo `tx`, sin lectura manual sin scope), sin `organizacionId` manual en ningún snapshot. Adicionalmente: anticipo/liquidación ya anulados con **mismo** valor → cero eventos; anticipo ya anulado con **motivo distinto** → 1 evento con motivo antes/después; comprobante agregado/reemplazado/repetido (sin URL en el JSON del evento en ningún caso).

**Mismo alcance honesto que las suites de CAT-4/6/7**: estas pruebas demuestran que un fallo de `auditLog.create()` se propaga como excepción del callback de `$transaction` — no reproducen físicamente un `ROLLBACK` de PostgreSQL. No se ejecutó ninguna prueba adicional contra una base local descartable en este bloque porque el mecanismo transaccional genérico de Prisma ya está demostrado (CAT-6, `migracion-cat6-atomicidad.spec.ts`) y ningún método de AUD-1 introduce SQL crudo nuevo.

Ningún test previo de CAT-1 a CAT-7 ni de Facturación/Liquidaciones/Anticipos se relajó ni se eliminó — `facturas.controller.anular-factura.spec.ts` conserva sus 4 reglas de negocio originales, solo con la firma adaptada.

### Validación

- `npm run test:dev1`: 14/14 ✅
- Backend build: limpio
- `npx jest --no-cache`: **52 suites / 708 tests, todos verdes** (baseline CAT-7: 49/663 + 3 suites/45 tests de AUD-1, reconciliado exacto)
- Frontend `tsc -b` + `vite build`: limpios (sin cambios de frontend en este bloque)
- `organizacion-payload.test.mjs` (Node 24, fuera de CI): 13/13 ✅ (sin relación con AUD-1)
- `git diff --check`: sin errores

### Validación manual real (post-implementación, base local, organización real de `admin@demo.com`)

Ejecutada desde la UI real (Anticipos/Liquidaciones/Facturas), no por script — las 9 operaciones financieras de AUD-1, sobre precondiciones temporales aisladas (un `TipoGasto`, tres `Viaje` y sus catálogos reales ya existentes de Cliente/Transportista/Chofer, nunca datos históricos).

- **Anticipo:** alta ($500, sin viaje asociado) → `anticipo_creado`; anulación (motivo `"Prueba AUD-1"`) → `anticipo_anulado`. `comprobanteAdjunto: false` en ambos eventos — **ninguna URL de comprobante apareció en ningún momento** en el JSON de los eventos.
- **Liquidación A** (crear → confirmar → pagar): valida la cadena completa hasta el estado terminal `PAGADA` — `liquidacion_creada` → `liquidacion_confirmada` → `liquidacion_pagada`, sin `comisionPct_override` (tipo Transportista).
- **Liquidación B** (crear → anular): valida el camino alternativo de baja desde `BORRADOR`, sobre un segundo viaje temporal independiente — `liquidacion_creada` → `liquidacion_anulada`. Usar dos liquidaciones separadas (A y B) permitió cubrir las 4 acciones de estado de `Liquidacion` sin que una transición terminal (pagar) bloqueara probar la otra (anular).
- **Factura** (crear → anular, sin cobranzas): `factura_creada` → `factura_anulada`.

En los 9 eventos: actor `admin@demo.com`/`Admin General` confirmado; snapshots limitados exactamente a la allowlist documentada arriba, sin `organizacionId`, relaciones completas ni campos técnicos; sin eventos duplicados. Los eventos preexistentes de `Cobranza` (5) y `comisionPct_override` permanecieron exactamente sin cambios durante toda la validación — confirmado explícitamente, no solo por inferencia.

**Auditoría Administrativa** (verificado visualmente por el Product Owner): las 3 entidades (`AnticipoGasto`, `Liquidacion`, `Factura`) y las 8 acciones distintas (`liquidacion_creada` aparece dos veces, una por cada Liquidación) se confirmaron como opciones de filtro dinámicas, sin ningún cambio de código — mismo mecanismo ya validado en CAT-7. Vista Antes/Después y actor confirmados correctos.

**`anticipo_editado` — misma limitación reconocida en CAT-6/7 para patrones equivalentes:** no existe ningún control de edición en `Anticipos.tsx` (el `PATCH` existe en el backend, ninguna pantalla lo llama). Este evento queda cubierto **únicamente** por los tests automatizados.

**Hallazgo de UI confirmado, sin relación con AUD-1:** `Anticipos.tsx` no expone ningún campo/selector de Viaje en su formulario, aunque el backend admite `viajeId` como opcional — comportamiento preexistente, no un defecto introducido por este bloque, sin agregar UI.

**Limpieza — restauración exacta:** la Liquidación A quedó en estado `PAGADA`, que no tiene reverso en la aplicación (no existe una acción de "despagar") — se restauró manualmente por script, exclusivamente el campo `estadoLiquidacion` del viaje temporal correspondiente, de `PAGADO` a `PENDIENTE`, antes de eliminar la Liquidación y el viaje. Las anulaciones de Liquidación B y de la Factura ya habían revertido sus viajes a `PENDIENTE`/`PENDIENTE_DE_FACTURAR` mediante la propia lógica de negocio (`anular()`), verificado explícitamente antes de borrar, no asumido por cascada. Limpieza ejecutada dentro de una única transacción local, con verificación previa exhaustiva (aborta sin escribir si algún ID/CTG/marcador/estado no coincide) — nunca tocó los 2 viajes reales usados como referencia inicial ni ningún otro dato histórico.

**Los 10 `AuditLog` generados por esta validación se conservan íntegramente como evidencia** (9 financieros de AUD-1 + 1 `tipo_gasto_creado` de la precondición) — nunca se borra `AuditLog`. Conteos finales tras la limpieza: `AnticipoGasto`, `Liquidacion`, `Factura`, `TipoGasto` y `Viaje` de la organización de vuelta exactamente al baseline previo a la validación; `AuditLog` de la organización pasó de 49 a **59** (organización) / 82 a **92** (total) y permanece en esos valores después de la limpieza.

### Deuda remanente

- Validación manual end-to-end de `anticipo_editado` no es posible sin agregar UI de edición a `Anticipos.tsx` — fuera de alcance explícito de AUD-1 ("no agregar UI ni endpoints").
- El resto de la deuda de `DEUDA_TECNICA.md` (duplicación de `EstadoFacturacionEnum`/`EstadoFacturaEnum`, `Factura.numero` manual, rate-limiting bypass, vencimientos de documentación) sigue sin tocar, sin relación con AUD-1.
- **Mejora UX prioritaria, separada — detalle de Liquidación muestra "Carta de Porte" en vez de CTG.** Confirmado visualmente durante la validación manual de AUD-1: la sección de candidatos de `Liquidaciones.tsx` sí muestra el CTG del viaje, pero la tabla del detalle de una Liquidación ya creada muestra "Carta de Porte" — el dato operativamente relevante para el usuario (según indicación directa de Luis) es el CTG, no la Carta de Porte. **No se modificó el frontend** (fuera de alcance de AUD-1). Propuesta para un bloque futuro: mostrar CTG como dato principal en la tabla de detalle de Liquidación, conservando Carta de Porte en una sección de "Información completa" o como dato secundario — revisar primero las exportaciones Excel/PDF de Liquidaciones antes de quitar o reordenar cualquier columna existente, para no perder información ya expuesta ahí.
- **`GET /liquidaciones/candidatos` interpreta `hasta` como medianoche UTC del día elegido**, no como el final de ese día — un `Viaje.fecha` con hora posterior a medianoche en la misma fecha calendario queda excluido por `fecha.lte(hasta)`, aunque un usuario mirando un selector de fecha esperaría que "hasta el 07/08/2026" incluyera todo ese día. Detectado durante la validación manual de AUD-1 (los 3 viajes temporales de precondición, creados con `fecha: new Date()` en vez de medianoche, no aparecían como candidatos hasta corregir manualmente su `fecha`). No es un hallazgo de AUD-1 ni se modificó el filtro — mismo criterio en `AnticiposController`/`FacturasController` (`export/excel`, `export/pdf`, `findAll`) y en cualquier otro endpoint que filtre por rango de fechas de la misma manera. Queda registrado como deuda técnica separada, a evaluar en un bloque futuro (candidato: normalizar `hasta` a `23:59:59.999` del día elegido, o documentar explícitamente la semántica actual en la UI).

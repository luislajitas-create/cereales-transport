# UX-FIN-1 — Ajustes financieros finales

Bloque limitado exclusivamente a los dos hallazgos confirmados por el Product Owner durante la validación manual de AUD-1: (A) CTG como dato principal en el detalle de Liquidación, (B) comportamiento inclusivo del filtro de fecha "Hasta".

**Este documento reemplaza la versión original.** La primera implementación de (B) usaba un único helper (`finDeDiaUtc`) para los 12 puntos detectados, tratándolos todos como si fueran la misma clase de fecha. El Product Owner detectó, antes de cerrar el bloque, que eso era incorrecto para `AuditLog.fecha` (un timestamp real) y pidió separar los dos dominios explícitamente. Esta versión documenta la corrección completa.

## A) CTG como dato principal en el detalle de Liquidación

Sin cambios respecto a la versión original — implementación validada y conservada intacta.

`construirPlanilla()` (`liquidaciones.controller.ts`) — fuente única de datos para pantalla/Excel/PDF, ya documentada así en el propio código — **ya incluía ambos campos** (`cartaPorte` y `ctg`) en cada fila antes de este bloque. No hizo falta tocar ningún `select`/`include`, DTO ni cálculo.

| Superficie | Antes | Después |
|---|---|---|
| Tabla de candidatos | CTG (ya correcto) | sin cambios |
| Detalle principal (pantalla) | Carta de Porte | **CTG** |
| "Ver información completa" (pantalla) | Ambos ya presentes | sin cambios |
| Excel | Ambos ya presentes (columnas "CP" y "CTG") | sin cambios |
| PDF — fila principal | Carta de Porte | **CTG** |
| PDF — línea secundaria | CTG (ya presente) | + Carta de Porte |

Ningún dato se pierde en ninguna superficie. Revalidado en esta corrección: liquidación de prueba creada en vivo (N° 16, entorno local) — pantalla principal muestra CTG, "información completa" muestra ambos, PDF/Excel sin tocar en esta corrección.

## B) Filtro "Hasta" — dos dominios de fecha distintos

### El error de la versión original

`new Date("YYYY-MM-DD")` (valor crudo de un `<input type="date">`) siempre parsea como medianoche UTC de ese día. Usado como límite superior (`lte`), excluye cualquier registro con hora posterior a medianoche dentro del mismo día calendario UTC — ese diagnóstico era correcto. El error fue aplicar la misma corrección (fin de día UTC) a los 12 puntos detectados, sin distinguir que **no todos son el mismo tipo de fecha**.

### Clasificación correcta — dos dominios

**Dominio A — fecha de negocio pura.** Se escribe siempre desde un `<input type="date">` como medianoche UTC, sin componente horario significativo: `Viaje.fecha`, `AnticipoGasto.fecha`, `Factura.fecha`/`vencimiento`, `Liquidacion.periodoDesde`/`periodoHasta`. Para estos campos, "Hasta 07/08" debe incluir todo el día calendario **UTC** — el criterio original sigue siendo correcto, solo se renombró el helper para dejar explícito que es específico de este dominio.

**Dominio B — timestamp real.** Tiene una hora real dentro de un instante UTC absoluto: `AuditLog.fecha` (`@default(now())`). Para este campo, "Hasta 07/08" debe representar el día calendario **local** de la organización — un evento tardío del día local (ej. 22:30 en Argentina/Salta) puede tener una hora UTC que ya cruzó a la medianoche del día siguiente (01:30Z), y quedaba incorrectamente excluido.

| Endpoint | Campo | Dominio | Helper |
|---|---|---|---|
| `Liquidacion.candidatos()` (×2) | `Viaje.fecha` / `AnticipoGasto.fecha` | A | `finDeFechaUtc` |
| `Anticipos.findAll()`/`export/excel`/`export/pdf` | `AnticipoGasto.fecha` | A | `finDeFechaUtc` |
| `Viajes.findAll()` | `Viaje.fecha` | A | `finDeFechaUtc` |
| `Facturas.findAll()`/`export/excel`/`export/pdf`/`conciliacion()` | `Factura.fecha` / `Viaje.fecha` | A | `finDeFechaUtc` |
| **`Organizacion.auditoria()`** | **`AuditLog.fecha`** | **B** | **`rangoDiaEnZona`** |
| `Inteligencia.rentabilidad()` | `Viaje.fecha` | A | `finDeFechaUtc` |
| `DashboardEjecutivo.dashboardEjecutivo()` | `Viaje.fecha` | A | `finDeFechaUtc` |
| `Benchmarking.comparacion()`/`evolucion()`/`rankings()` (×4) | `Viaje.fecha` | A | `finDeFechaUtc` |

Solo **un** punto de los 12 es Dominio B. Es, además, el único que la versión original identificó como "bug activo hoy" (los demás son bugs dormidos en páginas sin filtro de fecha conectado o sin consumidor real) — por eso fue el que el Product Owner detectó al validar.

### Política de zona horaria (nueva en esta corrección)

- `Organizacion.zonaHoraria` (campo `String?`, texto libre sin validación de formato) se usa si está presente y es un nombre de zona IANA válido.
- Si es nula, vacía o inválida: fallback a `America/Argentina/Salta` (`ZONA_ARGENTINA_DEFECTO`, `common/rango-fechas.ts`) — producto argentino, sin otra zona ya definida en el proyecto para reutilizar.
- Nunca se depende de la TZ del proceso/Railway: `rangoDiaEnZona()` recibe la zona como parámetro explícito de `Intl.DateTimeFormat({ timeZone })` en cada llamada, nunca del entorno.
- Validación: `new Intl.DateTimeFormat("en-US", { timeZone: zona })` lanza `RangeError` para un nombre no reconocido — se envuelve en try/catch (`zonaHorariaValida()`).
- `rangoDiaEnZona()` acepta cualquier zona IANA sintácticamente válida, pero la corrección solo está **verificada** para dos casos concretos: `America/Argentina/Salta` (no observa DST desde 2009 — es el fallback real del producto, offset fijo UTC-3 todo el año) y `America/New_York` (verificada explícitamente en días normales de invierno/verano y en sus dos transiciones DST 2026 — día de inicio: 23 horas de rango; día de fin: 25 horas de rango — con los límites exactos de 00:00:00.000 y 23:59:59.999 locales en los cuatro casos, `rango-fechas.spec.ts`, suite `rangoDiaEnZona — America/New_York (zona con DST)`, 6 tests). Estos tests **no garantizan** el comportamiento de cualquier otra zona IANA, ni de transiciones históricas o regulatorias extraordinarias (cambios de ley de un país, zonas que hayan movido su transición a otra hora en el pasado) — en particular si la medianoche local resultara inexistente o ambigua ese día, el resultado no está garantizado como un instante con significado local unívoco. La zona siempre se procesa explícitamente vía el parámetro `timeZone` de `Intl.DateTimeFormat`, nunca depende de la TZ del proceso.

### Diseño — dos helpers, no uno

`backend/src/common/rango-fechas.ts`:

- **`finDeFechaUtc(fechaTexto)`** — Dominio A. Renombrado desde `finDeDiaUtc` (mismo comportamiento exacto: último milisegundo del día calendario UTC). Aritmética pura sobre `Date.getTime()`, nunca `.setHours()`/`.getHours()` — resultado idéntico sin importar la TZ del proceso.
- **`rangoDiaEnZona(fechaTexto, zonaHoraria)`** — Dominio B. Devuelve `{ desde, hasta }`: los instantes UTC exactos de 00:00:00.000 y 23:59:59.999 del día calendario **local** en la zona dada. Implementado con `Intl.DateTimeFormat` + `formatToParts` (dos iteraciones para converger el offset), sin agregar ninguna dependencia nueva. Acepta cualquier zona IANA sintácticamente válida; el comportamiento está verificado para Argentina/Salta y para America/New_York en DST — ver alcance exacto de esa verificación en la política de zona horaria arriba.
- `zonaHorariaValida(zona)` y `ZONA_ARGENTINA_DEFECTO` — validación y fallback, ver política arriba.

`organizacion.controller.ts`.`auditoria()`: ahora recibe `@CurrentUser()`, resuelve la `zonaHoraria` de la organización del actor (`findUnique({ where: { id: actor.organizacionId }, select: { zonaHoraria: true } })` — mismo patrón de aislamiento manual que `obtener()`), y aplica `rangoDiaEnZona()` a **ambos** extremos (`fechaDesde` y `fechaHasta`) — no solo a `hasta`: en cualquier zona que no sea UTC, la medianoche local tampoco coincide con la medianoche UTC, así que `fechaDesde` también necesitaba la corrección, no solo `fechaHasta`.

### Hallazgo adicional descubierto durante esta corrección — off-by-one en Benchmarking (resuelto)

Al revisar expresamente (a pedido del Product Owner) si cambiar `hastaActual` a fin de día alteraba el cálculo automático del período anterior en `Benchmarking.comparacion()`, se encontró un off-by-one real: `diferenciaEnDias()` (`shared/fecha.ts`) normaliza sus operandos con `.setHours(0,0,0,0)` — un método que opera en la hora **local del proceso**, no en UTC. Antes de esta corrección, `hastaActual` era siempre una medianoche UTC "limpia", igual que `desdeActual`, así que ambos operandos se desplazaban de forma simétrica bajo cualquier TZ local del proceso y el resultado final era casualmente correcto. Al pasar `hastaActual` a fin de día (23:59:59.999 UTC), esa simetría se rompió: en un proceso cuya TZ local efectiva no es UTC, `desdeActual` (medianoche) y `hastaActual` (fin de día) del mismo rango pueden normalizar a días de calendario local distintos entre sí, produciendo una duración de período incorrecta (un día de más).

Se detectó de manera imprevista: `process.env.TZ` reasignado en un test no alcanza a cambiar la TZ efectiva que Node ya resolvió para `Intl`/`Date` en ese proceso (queda fija en la del sistema operativo — en la máquina de desarrollo usada para validar, `America/Argentina/Salta`), así que el test corrió, sin buscarlo, bajo una TZ real distinta a UTC y expuso el problema.

**Fix** (`benchmarking.controller.ts`, rama sin `desdeAnterior`/`hastaAnterior` explícitos): la duración se calcula contra la medianoche UTC cruda de `hasta` (`hastaActualMedianoche = new Date(hasta)`), no contra `hastaActual` — reproduce exactamente la aritmética previa a este bloque, sin importar la TZ efectiva del proceso. `hastaActual` (fin de día) se sigue usando para todo lo demás: la consulta a la base y el valor devuelto en `periodoActual.hasta`.

`normalizarFecha()`/`hoyNormalizado()` en sí (`shared/fecha.ts`, usadas también por Aging/Alertas/Vigencia/Dashboard Ejecutivo) siguen dependiendo de la TZ efectiva del proceso — es un riesgo preexistente a UX-FIN-1, no introducido ni resuelto acá, y esos módulos quedan fuera de alcance de este bloque.

### Explícitamente fuera de alcance

- `AgingController` — `desde`/`hasta` nunca llegan a un filtro Prisma, solo alimentan el cálculo de DSO en JS (`aging.calc.ts`).
- `combustibles.controller.ts` — módulo deshabilitado, inalcanzable.
- `dashboard.controller.ts.resumen()` — usa su propia lógica de "hoy" server-side, sin `desde`/`hasta` de usuario.
- `normalizarFecha()`/`hoyNormalizado()` (`shared/fecha.ts`) y sus consumidores fuera de Benchmarking (Aging, Alertas, Vigencia, Dashboard Ejecutivo) — dependencia preexistente de la TZ efectiva del proceso, documentada como hallazgo separado, no corregida en este bloque.
- `AuditoriaAdministrativa.tsx`.`formatearValorDetalle()` — formateador genérico de valores dentro de payloads JSON de auditoría (`datosAnteriores`/`datosNuevos`), aplica `.toLocaleDateString()` a cualquier string con forma de timestamp ISO. Si un campo de Dominio A (ej. `Viaje.fecha`) aparece anidado en un payload de auditoría, sufre el mismo bug que tenía `Liquidaciones.tsx` antes de esta corrección. Es una superficie real pero distinta de Liquidaciones — documentada, no corregida, según el alcance explícito del Product Owner ("al menos corregí las superficies de Liquidaciones... documentá el resto").
- `Facturas.tsx`/`FilaFactura.tsx` — mismo patrón de visualización (`new Date(factura.fecha).toLocaleDateString()`) para `Factura.fecha`/`vencimiento` (Dominio A). Fuera de Liquidaciones, mismo criterio que el punto anterior.
- El período "anterior" auto-calculado en `Benchmarking.comparacion()` cuando SÍ se pasan `desdeAnterior`/`hastaAnterior` explícitos — usa `finDeFechaUtc` igual que el período actual, sin off-by-one (cubierto por test).

### Archivos tocados

- `backend/src/common/rango-fechas.ts` — reescrito: `finDeFechaUtc` (renombrado), `rangoDiaEnZona` (nuevo), `zonaHorariaValida` (nuevo), `ZONA_ARGENTINA_DEFECTO` (nuevo).
- `backend/src/common/rango-fechas.spec.ts` — reescrito, 24 tests (7 `finDeFechaUtc` + 3 `zonaHorariaValida` + 8 `rangoDiaEnZona` Argentina/Salta + 6 `rangoDiaEnZona` con DST, `America/New_York`).
- `backend/src/administracion/organizacion.controller.ts` — `auditoria()` reescrito: `@CurrentUser()`, resolución/validación de zona, `rangoDiaEnZona()` en ambos extremos.
- `backend/src/administracion/organizacion.controller.auditoria-fecha.spec.ts` — reescrito, 12 tests (bordes de zona local, independencia de TZ, caso reportado, fallback, zona explícita).
- `backend/src/inteligencia/benchmarking.controller.ts` — rename + fix del off-by-one en la rama de período anterior automático.
- `backend/src/inteligencia/benchmarking.controller.off-by-one.spec.ts` (nuevo) — 4 tests, cubre duración equivalente, caso de un día, período anterior explícito, evolución/rankings.
- Rename mecánico `finDeDiaUtc` → `finDeFechaUtc` (sin cambio de lógica): `liquidaciones.controller.ts`, `liquidaciones.controller.candidatos.spec.ts`, `anticipos.controller.ts`, `viajes.controller.ts`, `facturas.controller.ts`, `inteligencia.controller.ts`, `dashboard-ejecutivo.controller.ts`.
- `frontend/src/pages/Liquidaciones.tsx` — 6 ocurrencias de `new Date(x).toLocaleDateString()` reemplazadas por `fmtFechaCalendario(x)` (helper preexistente, `utils/fecha.ts`, ya usado en `ViajeDetalle.tsx`/`FilaViaje.tsx`): candidatos (viaje/anticipo), KPI de período, detalle principal, adelantos generales, información completa.
- `frontend/src/components/FilaLiquidacion.tsx` — mismo fix, 1 ocurrencia (columna "Período" de la tabla de listado) — encontrado durante la validación manual en el navegador, no durante la auditoría original de texto (el bug era visualmente idéntico al de `Liquidaciones.tsx` pero vivía en un componente separado no inspeccionado en la primera pasada).

Ningún cambio de schema, migración, DTO, cálculo financiero ni lógica de AUD-1 (`common/auditoria.ts` no se tocó).

### Pruebas — 40 tests nuevos/reescritos en esta corrección (dos rondas)

Primera ronda (separación de dominios A/B + off-by-one de Benchmarking):
- `rango-fechas.spec.ts`: 18 (antes 7, sin contar los de DST agregados después).
- `organizacion.controller.auditoria-fecha.spec.ts`: 12 (antes 3).
- `benchmarking.controller.off-by-one.spec.ts`: 4 (nuevo).
- `liquidaciones.controller.candidatos.spec.ts`: 3, sin cambio de lógica (solo rename).

Segunda ronda (verificación de zonas IANA con DST, a pedido explícito):
- `rango-fechas.spec.ts`: +6 (`rangoDiaEnZona — America/New_York`, ver política de zona horaria).

### Reconciliación de conteos de tests

- Antes de esta corrección (primera versión de UX-FIN-1): 55 suites / 721 tests.
- Después de separar dominios A/B + fix de Benchmarking: 56 suites / 745 tests.
- Después de agregar los 6 tests de DST: **56 suites / 751 tests, todos verdes** — es el resultado final de este documento.

### Validación

- `npx tsc --noEmit` (backend): limpio.
- `npx jest --no-cache`: **56 suites / 751 tests, todos verdes** (corrido dos veces para confirmar estabilidad).
- `npm run build` (backend): limpio.
- `npx tsc -b` + `npx vite build` (frontend): limpios.
- `npm run test:dev1`: 14/14 ✅.
- `node --test organizacion-payload.test.mjs`: 13/13 ✅ (sin cambios, no afectado).
- `git diff --check`: sin errores reales (solo avisos de fin de línea LF/CRLF, ya presentes en el repo).

**Validación manual, entorno local real (backend/frontend corriendo, login `admin@demo.com`):**
- Zona horaria de la organización de prueba: `null` → ejerce el fallback `America/Argentina/Salta`.
- Evento de auditoría real creado en vivo (`PATCH /organizacion`) a las `2026-08-08T04:01:48.900Z`. `GET /organizacion/auditoria?fechaHasta=2026-08-08` lo incluye (total 3); `GET /organizacion/auditoria?fechaHasta=2026-08-07` lo excluye (total 2) — confirma el límite de zona local funcionando en ambas direcciones.
- Liquidación N° 11 existente (dato de sesiones anteriores): tabla de listado mostraba **20/1/2026 - 20/2/2026** para un `periodoDesde`/`periodoHasta` real de `2026-01-21`/`2026-02-21` — el bug de `FilaLiquidacion.tsx` reproducido en vivo, antes de aplicar el fix. Después del fix: **21/01/2026 - 21/02/2026**, correcto.
- Liquidación N° 16 creada en vivo (candidatos reales, transportista "Transportista Demo A", viaje N° 22 con `fecha: 2026-08-01T00:00:00.000Z`): tabla de candidatos, detalle principal, KPI de período e "información completa" muestran **01/08/2026** en todas las superficies — sin corrimiento de día. CTG visible como columna principal en pantalla; Carta de Porte visible en "información completa". PDF/Excel no se volvieron a descargar en esta corrección (su lógica no cambió respecto a la versión original, ya validada); confirmado por lectura de código que ambos campos siguen presentes (`liquidaciones.controller.ts` líneas 358-359, 511, 534). **Esta Liquidación N° 16 y el efecto secundario sobre el viaje N° 22 fueron reconciliados y eliminados después de validar — ver "Incidente de validación local" más abajo.**

### Incidente de validación local — creado y reconciliado dentro de esta misma corrección

La validación manual de esta corrección (entorno local, `admin@demo.com`) generó dos artefactos reales en la base de datos local, además de los ya esperados (evento de auditoría del PATCH de organización, mencionado arriba):

1. **Liquidación N° 16** (BORRADOR, transportista "Transportista Demo A", 1 viaje asociado — el histórico N° 22, que pasó de `estadoLiquidacion=PENDIENTE` a `LIQUIDADO` como efecto secundario esperado de la creación).
2. **Corrupción de encoding en `Organizacion.nombre`**: el PATCH de prueba usado para generar un evento de auditoría real (sección B) reenvió el nombre existente sin cambios reales *previstos*, pero el paso por `curl`/bash en Windows mangló el carácter "ó" (`Organización Principal` → `Organizaci�n Principal`). Se detectó al inspeccionar `datosAnteriores`/`datosNuevos` del evento de auditoría generado — el único campo con diferencia real fue `nombre`.

**Reconciliación** (auditoría de solo lectura antes de tocar nada, scopeada a la organización del admin — los conteos globales de la base incluyen otros tenants de este entorno multi-organización y no son comparables directamente):

| | Baseline previo a la validación | Antes de la limpieza | Después de la limpieza |
|---|---|---|---|
| Liquidacion (org) | 6 | 7 | 6 |
| Viaje (org) | 19 | 19 (sin cambio — solo el estado de #22 se movió) | 19 |
| AuditLog (org) | 59 | 61 | 61 (preservado como evidencia) |
| AuditLog (total, todas las organizaciones) | 92 | 94 | 94 (preservado) |

Exactamente 2 eventos de auditoría nuevos atribuibles a esta sesión (creación de la Liquidación N° 16, edición de Organización) — confirma la hipótesis 61/94, verificada por conteo real antes de asumir nada.

**Limpieza aplicada** (script transaccional local, ejecutado una vez, luego eliminado — ver sección de archivos): verificación exacta por ID de la Liquidación N° 16, sus relaciones (`LiquidacionViaje`, `LiquidacionMovimiento`) y el viaje asociado antes de tocar nada; si cualquier verificación no coincidía exactamente, el script abortaba sin aplicar cambios. Dentro de una única transacción Prisma: eliminación de las relaciones de la N° 16, eliminación de la N° 16, reversión de `estadoLiquidacion` del viaje histórico a `PENDIENTE`, y restauración de `Organizacion.nombre` al valor exacto leído de `datosAnteriores` del propio evento de auditoría (no hardcodeado como literal, para no arriesgar una segunda mangladura de encoding al escribir el script). No generó ningún AuditLog nuevo — es mantenimiento local directo, no una acción de usuario auditable. No tocó ningún otro viaje, liquidación, organización ni evento de auditoría.

Verificado después, por dos vías independientes (lectura directa a la base y `GET /organizacion` / `GET /liquidaciones` vía la API real corriendo): conteos de vuelta al baseline exacto, viaje histórico con `estadoLiquidacion=PENDIENTE`, `Organizacion.nombre` restaurado con la tilde correcta (`Organización Principal`, confirmado además que los bytes UTF-8 son válidos), Liquidación N° 16 y su relación ya no existen, AuditLog no disminuyó.

### Deuda remanente

- `AuditoriaAdministrativa.tsx`.`formatearValorDetalle()` puede mostrar mal una fecha de Dominio A anidada en un payload de auditoría — documentado arriba, no corregido.
- `Facturas.tsx`/`FilaFactura.tsx` tiene el mismo patrón de visualización sin corregir (Dominio A, fuera de Liquidaciones) — documentado arriba, no corregido.
- `normalizarFecha()`/`hoyNormalizado()` (`shared/fecha.ts`) dependen de la TZ efectiva del proceso fuera de Benchmarking (Aging, Alertas, Vigencia, Dashboard Ejecutivo) — riesgo preexistente, no introducido ni resuelto en UX-FIN-1.
- Los endpoints de `Anticipos`/`Facturas` (`findAll`/`export/excel`/`export/pdf`) corrigen el mismo patrón de Dominio A aunque hoy no tengan consumidor real conectado en el frontend — sin impacto visible hasta que se conecten, ya blindados igual.

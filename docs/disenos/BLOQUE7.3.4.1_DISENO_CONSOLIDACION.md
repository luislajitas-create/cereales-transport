# Bloque 7.3.4.1 — Diseño de Consolidación del Motor de Inteligencia

Fecha: 2026-07-11. Diseño técnico — **no se escribió código, no se modificó ningún archivo, no se hizo commit, no se hizo push.** Responde únicamente a los cinco hallazgos confirmados en `BLOQUE7.3.4.1_AUDITORIA_CONSOLIDACION.md`, sección 3 (H1-H5). No reabre nada de la sección 4 (evaluado y descartado) ni ningún sub-bloque anterior.

**Sin cambios de comportamiento, contrato HTTP, respuesta JSON, roles, endpoints, cache, CQRS, eventos ni arquitectura nueva** — todo lo que sigue es mover código existente de lugar, sin alterar qué hace.

---

## D-H1 y D-H2 — Extraer fetch+mapeo de Viaje y de Factura

**Qué se extrae:** dos funciones nuevas, junto a los servicios que ya hacen este trabajo hoy (no en `shared/`, porque no son semántica de negocio como vigencia/fecha/dinero/severidad — son acceso a datos + shaping, que es responsabilidad de capa de servicio, no de semántica compartida):

- `backend/src/inteligencia/rentabilidad.service.ts` gana una función exportada `obtenerViajesEntrada(prisma, where)` (nombre tentativo) que encapsula el `findMany` + `select` + `.map()` de líneas 24-56, parametrizada por el `where` que hoy arma cada llamador. `RentabilidadService.calcular()` la usa con su `where` actual (fecha + cliente + transportista opcionales). `AlertasService.calcular()` la usa con `{ estado: "DESCARGADO" }` sin más filtros.
- `backend/src/inteligencia/aging.service.ts` gana, de forma análoga, `obtenerFacturasEntrada(prisma, where)` que encapsula `aging.service.ts:18-47`. `AgingService.calcular()` la usa con su `where` actual (vigencia + cliente opcional). `AlertasService.calcular()` la usa con `{ estado: { not: "ANULADO" } }` sin más.

**Por qué en el service dueño y no en un archivo nuevo:** `RentabilidadService` y `AgingService` ya son, cada uno, la única fuente de la consulta+mapeo de su entidad — extraer ahí, en vez de crear un tercer archivo (`viaje-fetch.helper.ts`, por ejemplo), no introduce una pieza nueva a la arquitectura, solo declara explícito lo que ya era cierto implícitamente: quien define cómo se lee y mapea un `Viaje` para el Motor es `RentabilidadService`, y `AlertasService` lo reutiliza en vez de reimplementarlo. Es la misma relación de dependencia que `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (Parte 3) ya documentó a nivel de sub-bloque ("7.3.3 consume los productos ya calculados de 7.3.1/7.3.2") — este cambio la hace cierta también a nivel de código, no solo de resultado final.

**`AlertasService` después del cambio:** en vez de tener su propio `findMany` de `Viaje` (líneas 32-46) y su propio `findMany` de `Factura` (líneas 22-29) inline dentro del `Promise.all`, llama a `rentabilidadService`... **no** — importante: `AlertasService` no debe pasar a depender de `RentabilidadService` como servicio inyectado (eso sería un acoplamiento nuevo entre servicios, que hoy no existe y la auditoría confirmó como positivo que no exista). Depende directamente de las dos funciones nuevas, importadas como funciones sueltas desde `rentabilidad.service.ts` y `aging.service.ts` — igual que hoy ya importa `calcularAging`/`calcularRentabilidad` como funciones sueltas de los `.calc.ts`, no como servicios inyectados. Mismo patrón de dependencia que ya existe, aplicado un nivel antes (fetch, no solo cálculo).

**Qué no cambia:** el `select` de Prisma, los nombres de campo, el orden de mapeo, el `orderBy` de `RentabilidadService` (que `AlertasService` no necesita y no debe heredar — se deja como parámetro opcional del `where`/consulta, no forzado). Las cuatro consultas (`rentabilidad.service`, `aging.service`, y las dos reutilizadas dentro de `alertas.service`) siguen devolviendo exactamente los mismos datos que hoy.

---

## D-H3 — Extraer `primerDiaDelMes` a `shared/fecha.ts`

`shared/fecha.ts` ya es el dueño de la semántica de fecha del Motor (`hoyNormalizado`, `normalizarFecha`, `diferenciaEnDias`). `primerDiaDelMes` es la misma categoría de utilidad y hoy vive duplicada en `aging.controller.ts:8-12` y `dashboard-ejecutivo.controller.ts:10-14`. Se agrega como cuarta función exportada de `shared/fecha.ts`, y ambos controllers la importan en vez de declararla localmente. Sin cambio de comportamiento (misma implementación, carácter por carácter).

---

## D-H4 — Ubicación de `alertas.calc.ts`

**Decisión:** mover `reportes/alertas.calc.ts` → `alertas/alertas.calc.ts`, honrando la taxonomía ya aprobada en `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (Parte 6), que reservó `inteligencia/alertas/` específicamente para esta capacidad. Se prefiere esta opción sobre la alternativa (aceptar `reportes/` como hogar único de todo `.calc.ts` y dar de baja `alertas/`/`benchmarking/`) por tres razones:

1. Es el cambio de menor superficie: mover un archivo y actualizar dos imports (`alertas.controller.ts:7`, `alertas.service.ts:5`), contra reabrir y reescribir una sección de un documento de arquitectura ya aprobado.
2. La taxonomía por *tipo de capacidad* (reportes/KPI vs. alertas vs. benchmarking — Parte 4 del mismo documento) es más informativa a futuro que agrupar todo bajo "reportes/" — cuando 7.3.5 exista, `benchmarking/` como carpeta con contenido real (no vacía) confirma visualmente que la taxonomía se sigue, sin tener que releer el documento para saberlo.
3. No es una arquitectura nueva — es aplicar la que ya existía y que el código no siguió por una omisión puntual en 7.3.3.a, no por una decisión consciente de cambiarla.

`reportes/` queda, después de este cambio, con `rentabilidad.calc.ts` y `aging.calc.ts` — ambos indicadores de Performance Financiera "clásicos" (KPI/reporte), consistente con el nombre de la carpeta.

**Qué no cambia:** el contenido de `alertas.calc.ts` no se toca, solo su ubicación e imports. `alertas/.gitkeep` se elimina (deja de estar vacía la carpeta). `benchmarking/.gitkeep` se deja intacta — sigue siendo el lugar reservado para 7.3.5, sin abrir ese sub-bloque todavía.

---

## D-H5 — Reutilizar el tipo `BucketAging` en vez de re-declararlo

`aging.calc.ts:29` ya exporta `BucketAging`. Se importa ese tipo en los dos lugares que hoy repiten la unión literal a mano:

- `shared/umbrales.ts:6` — `Record<BucketAging, ...>` en vez de `Record<"0-30" | "31-60" | "61-90" | "+90", ...>`.
- `reportes/alertas.calc.ts:75` (que pasa a `alertas/alertas.calc.ts:75` tras D-H4) — `f.bucket as BucketAging` en vez de repetir la unión literal.

Sin cambio de valores ni de comportamiento — el conjunto de literales sigue siendo exactamente el mismo, solo tiene una única fuente.

---

## Archivos que se modifican

| Archivo | Cambio |
|---|---|
| `rentabilidad.service.ts` | Gana `obtenerViajesEntrada()` exportada; `calcular()` la usa internamente |
| `aging.service.ts` | Gana `obtenerFacturasEntrada()` exportada; `calcular()` la usa internamente |
| `alertas.service.ts` | Usa `obtenerViajesEntrada()`/`obtenerFacturasEntrada()` en vez de sus propios `findMany`+`map` inline |
| `shared/fecha.ts` | Gana `primerDiaDelMes()` exportada |
| `aging.controller.ts` | Elimina `primerDiaDelMes` local, importa la de `shared/fecha` |
| `dashboard-ejecutivo.controller.ts` | Elimina `primerDiaDelMes` local, importa la de `shared/fecha` |
| `reportes/alertas.calc.ts` → `alertas/alertas.calc.ts` | Se mueve, sin cambios de contenido salvo D-H5 |
| `alertas.controller.ts` | Actualiza import de `alertas.calc` a la nueva ruta |
| `alertas.service.ts` | Actualiza import de `alertas.calc` a la nueva ruta |
| `shared/umbrales.ts` | Importa `BucketAging` de `aging.calc.ts` en vez de re-declarar la unión |
| `alertas/.gitkeep` | Se elimina (carpeta deja de estar vacía) |

Ningún archivo de `reportes/rentabilidad.calc.ts` ni `reportes/aging.calc.ts` cambia de contenido ni de ubicación. Ningún controller cambia su ruta HTTP, sus roles, ni la forma de su respuesta.

---

## Plan de validación

1. **Build backend** — `npm run build` (o equivalente), sin errores de compilación ni de tipos, en particular en los imports movidos.
2. **Pruebas de cálculo puro** — re-ejecutar las tres suites ya existentes (`test-rentabilidad-calc.js` 15/15, `test-aging-calc.js` 29/29, `test-alertas-calc.js` 18/18): deben seguir pasando exactamente igual, porque ningún `.calc.ts` cambia su lógica (solo su import de tipo en el caso de `alertas.calc.ts`).
3. **Comparación de respuesta HTTP antes/después** — capturar `GET /inteligencia/rentabilidad`, `GET /inteligencia/cobranzas/aging`, `GET /inteligencia/alertas` y `GET /inteligencia/dashboard-ejecutivo` contra la base real, con los mismos parámetros, antes y después del cambio, y diffear byte a byte (mismo criterio que `compare-dash.js` en 7.3.4) — deben ser idénticas.
4. **Validación manual por rol** — login con `facturacion@demo.com`, `liquidaciones@demo.com`, `operaciones@demo.com` y confirmar que el Centro de Alertas sigue mostrando exactamente las mismas categorías filtradas por rol que antes (el filtrado por rol no se toca, pero depende de que `AlertasService.calcular()` siga devolviendo el mismo catálogo completo).
5. **Regresión de las 4 pantallas del Centro de Inteligencia** (Rentabilidad, Aging, Alertas, Dashboard Ejecutivo) — carga visual sin errores de consola, mismos números que la validación manual previa de 7.3.1-7.3.4 documentada en memoria.
6. **Regresión de módulos transaccionales no tocados** — smoke test de que `dashboard.controller.ts` (el dashboard operativo, no el ejecutivo) sigue funcionando sin cambios, dado que ninguno de los archivos de este diseño lo toca.

---

## Riesgos

- **Bajo.** Es un refactor de extracción sin cambio de lógica, sobre código ya cubierto por pruebas de cálculo puro y por comparación de respuesta HTTP. El único riesgo real es un error de copia al mover el `select`/`map` a la función compartida (por ejemplo, olvidar el `orderBy` que hoy solo tiene `RentabilidadService`) — mitigado por el paso 3 del plan de validación (diff byte a byte de la respuesta HTTP completa, que expondría cualquier diferencia de orden o de campo).
- Mover `alertas.calc.ts` de carpeta (D-H4) no tiene riesgo de comportamiento (TypeScript resuelve por ruta de import, no por convención de carpeta), solo riesgo mecánico de un import mal actualizado — lo captura el build (paso 1).

## Plan de rollback

Los cambios de este sub-bloque son, en su totalidad, un commit de refactor interno sin migración de datos ni cambio de contrato — revertir es `git revert` del commit único de este sub-bloque, sin pasos adicionales.

---

## Cierre

Ningún hallazgo de la sección 4 de la auditoría (evaluado y descartado) se retoma acá. Este diseño cubre exactamente H1 a H5. Queda a la espera de aprobación antes de implementar.

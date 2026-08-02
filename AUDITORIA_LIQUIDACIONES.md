# Auditoría — Módulo Liquidaciones

Registro de bloques de deuda técnica y mejoras arquitectónicas del módulo Liquidaciones, en el mismo formato que `AUDITORIA_VIAJES2.0_RC1.md`. Se origina en la auditoría técnica integral del sistema SDC (post Viajes 2.0), que identificó a Liquidaciones como el módulo de mayor prioridad: sobre-fetching más severo del sistema en su listado y falta de paginación.

---

## LIQ-1 — Eliminar sobre-fetching y agregar paginación a GET /liquidaciones

**Hallazgo (auditoría integral del sistema):** `findAll()` en `liquidaciones.controller.ts` reutilizaba `includeLiquidacion` — un `include` diseñado para el **detalle** (`construirPlanilla()`, usado en `findOne()`/exports), con 7 relaciones anidadas (`viajes.viaje` con `cereal, cliente, productor, origen, destino, camion, acoplado, facturasViaje.factura`, más `movimientos.tipoGasto`) — para **cada fila del listado**. Sin paginación: todos los registros, sin límite.

**Auditoría previa a la implementación (obligatoria, cambio de contrato real):**
1. **Qué devolvía `GET /liquidaciones`:** `include: includeLiquidacion` completo; filtros existentes `transportistaId`, `choferId`, `estado`, `tipo`; `orderBy: { createdAt: "desc" }`; sin `select` propio de listado; sin `page`/`limit`/`skip`/`take`.
2. **Columnas reales consumidas por `Liquidaciones.tsx`** (tabla de listado, releído completo): `numero`, `tipo`, `transportista?.razonSocial`, `chofer?.nombre`, `periodoDesde`, `periodoHasta`, `netoPagar`, `estado`, `id` (key + acción "Ver"). Nada de `viajes`, `movimientos`, `creadoPor`, ni relaciones anidadas de viaje.
3. **Consumidores frontend:** grep de `"/liquidaciones"` en todo `frontend/src` — **único consumidor real de `GET /liquidaciones` es `Liquidaciones.tsx`** (línea de `cargar()`, ahora `buscar()`). El resto de las coincidencias son rutas (`App.tsx`, `Layout.tsx`), un link (`Dashboard.tsx`), u otros endpoints del mismo archivo (`/candidatos`, `POST /liquidaciones`, `GET /:id`, `GET /:id/excel|pdf`).
4. **Consumidores backend internos:** grep de `liquidacion.findMany` en todo `backend/src` — encontrado `pago-consolidado.service.ts:170`, que hace su **propia** query con `select` ya preciso (`id, numero, periodoDesde, periodoHasta, netoPagar`) y su propio `where`, **sin pasar por `LiquidacionesController.findAll()`** — no afectado por este cambio.
5. **Retrocompatibilidad:** se descartó explícitamente un modo dual (array plano vs. objeto paginado) por agregar una rama de código para proteger a un consumidor inexistente, y por divergir del precedente ya validado (`GET /organizacion/auditoria`, `GET /viajes` de H-11). Aprobado: cambio de contrato limpio, backend y frontend en el mismo commit.
6. **Estrategia:** offset (`page`/`limit` → Prisma `skip`/`take`), replicando exactamente el patrón de `organizacion.controller.ts` y `viajes.controller.ts` (H-11) — mismos nombres de parámetros, misma forma de respuesta.

**Implementación:**
- `backend/src/liquidaciones/liquidaciones.controller.ts`: `selectLiquidacionListado` (select propio con los 8 campos reales confirmados en el punto 2), `LIQUIDACIONES_LIMITE_DEFECTO=20`, `LIQUIDACIONES_LIMITE_MAXIMO=100` (idénticos a los de H-11/auditoría). `findAll()` agrega `page`/`limit`, calcula con los mismos clamps, `Promise.all([count, findMany con skip/take])`, devuelve exactamente `{ datos, pagina, limite, total }`. Ningún otro método del controller tocado (`construirPlanilla`, `findOne`, `candidatos`, exports, `create`, `confirmar`, `pagar`, `anular` siguen usando `includeLiquidacion` sin cambios).
- `backend/src/liquidaciones/liquidaciones.controller.pagination.spec.ts` (nuevo, 7 tests): defaults, cálculo de `skip`, clamp de `limit` por encima del máximo, valores no numéricos cayendo a default, forma exacta de la respuesta, mismo `where` entre `count` y `findMany`, y que se usa `select` (no `include`).
- `frontend/src/pages/Liquidaciones.tsx`: `cargar()` reemplazada por `buscar(paginaNueva, limiteNueva)` (mismo patrón que `buscar()` de `Viajes.tsx`/H-11, con sincronización de URL vía `setSearchParams`). Nuevo estado `pagina`/`limite`/`total`, inicializado desde la URL. Nuevas `irAPagina()`/`cambiarLimite()`. Bloque de UI de paginación idéntico al de `Viajes.tsx`/`AuditoriaAdministrativa.tsx`, sin CSS nuevo. A diferencia de Viajes, el listado de Liquidaciones no tiene filtros propios en la UI — solo `page`/`limit` se persisten en la URL. Los 4 call-sites que refrescaban el listado tras crear/confirmar/pagar/anular (`cargar()`) se actualizaron a `buscar(pagina, limite)`, permaneciendo en la página actual en vez de resetear a la página 1.

**Validación funcional (navegador real, backend+frontend locales):** listado con las 6 liquidaciones reales (3 CONFIRMADA, 2 PAGADA, 1 ANULADA); con límite 2 mostró "Página 1 de 3 (6 en total)"; Anterior/Siguiente navegaron correctamente; refresh (F5) en página 2/3 con límite 2 conservó exactamente esa página y límite; Ver, Confirmar, Marcar como pagada (con motivo/confirmación tipeada), Anular, Excel, PDF y el formulario de Nueva liquidación siguieron funcionando exactamente igual. Confirmado por el usuario.

**Medición de impacto (dataset real, 6 liquidaciones):**

| Escenario | Tamaño de respuesta | Tiempo promedio (5 corridas, localhost) |
|---|---|---|
| Antes (sin paginar, include completo de detalle) | 9222 bytes | ~0.226 s |
| Después, `limit=20` (6 registros, select preciso, 1 sola página) | 1564 bytes (−83% vs. antes) | ~0.220 s |
| Después, `limit=3` (3 registros por página) | 802 bytes (−91% vs. antes) | ~0.219 s |

**Nota explícita sobre el tiempo (mismo criterio que H-11):** con 6 registros el tiempo es prácticamente igual antes/después — esperado, el overhead de red/autenticación domina sobre un `SELECT` de 6 filas. La reducción real y medible está en el **tamaño de la respuesta** (−83% a −91% según el `limit` elegido, con el mismo dataset), que es exactamente el objetivo de eliminar el `include` de 7 relaciones anidadas del listado. El beneficio de tiempo se hará evidente cuando el volumen de liquidaciones reales crezca.

**Regresiones:** ninguna esperada. `construirPlanilla()`, `findOne()`, `candidatos()`, exports Excel/PDF, `create()`, `confirmar()`, `pagar()`, `anular()` arman cada uno su propia query independiente, ninguno depende del resultado de `findAll()`. `pago-consolidado.service.ts` no se ve afectado (query propia, confirmado en la auditoría).

**Builds y tests:** backend build OK, **13/13 suites** (12 previas + 1 nueva), **97/97 tests** (90 previos + 7 nuevos). Frontend build OK, sin errores TypeScript.

**Deuda remanente identificada en la auditoría integral, fuera de alcance de LIQ-1 (backlog de bloques futuros):**
- `Liquidaciones.tsx` (497 líneas) sin extracción de subcomponentes ni `React.memo`.
- Falta de gating de rol en la UI de `Liquidaciones.tsx` (el backend ya exige `@Roles("LIQUIDACIONES","ADMINISTRADOR")` correctamente vía `RolesGuard`) — incluye la acción irreversible "Marcar como pagada".
- N+1 evitable en `pagar()`/`anular()` (loops de `update` idéntico reemplazables por `updateMany`).
- `CATEGORIAS_ADELANTO` duplicado entre `liquidaciones.controller.ts` y `Liquidaciones.tsx`.

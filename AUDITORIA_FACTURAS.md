# Auditoría — Módulo Facturación

Registro de bloques de deuda técnica y modularización del módulo Facturación, mismo formato que `AUDITORIA_LIQUIDACIONES.md`. Origen: auditoría técnica integral del sistema SDC (post Viajes 2.0 / Liquidaciones 2.0).

---

## FAC-1 — Eliminar sobre-fetching y agregar paginación a GET /facturas

**Hallazgo:** `findAll()` en `facturas.controller.ts` reutilizaba `includeFactura` (viajes.viaje con `cereal, origen, destino, transportista` completos, más `cobranzas` completas) para cada factura del listado. Sin paginación: todas las facturas del sistema, sin límite — mismo patrón exacto que motivó H-6/H-7/H-11 en Viajes y LIQ-1 en Liquidaciones.

**Auditoría previa:**
1. `findAll()` tenía filtros `clienteId`, `estado`, `desde`, `hasta`; `include: includeFactura` completo; `orderBy: { fecha: "desc" }`; sin `page`/`limit`/`skip`/`take`.
2. Columnas reales consumidas por `Facturas.tsx` (tabla "Facturas emitidas"): `numero`, `cliente?.razonSocial`, `fecha`, `vencimiento`, `importe`, `estado`, `id` (key + "Ver"). Nada de `viajes`/`cobranzas` completos.
3. Consumidores frontend: grep de `"/facturas"` en todo `frontend/src` — único consumidor real de `GET /facturas` es `Facturas.tsx`.
4. Consumidores backend internos: grep de `factura.findMany` — `dashboard.controller.ts`, `clientes.controller.ts` y `aging.service.ts` hacen su propia query directa, sin pasar por `FacturasController.findAll()` — no afectados.
5. Retrocompatibilidad: descartado modo dual (mismo criterio que H-11/LIQ-1) — cambio de contrato limpio, backend y frontend en el mismo commit.
6. Estrategia: offset (`page`/`limit` → Prisma `skip`/`take`), replicando el patrón ya usado en `organizacion.controller.ts` / `viajes.controller.ts` (H-11) / `liquidaciones.controller.ts` (LIQ-1).

**Implementación:**
- `backend/src/facturas/facturas.controller.ts`: `selectFacturaListado` (8 campos reales), `FACTURAS_LIMITE_DEFECTO=20`, `FACTURAS_LIMITE_MAXIMO=100` (idénticos al patrón ya usado tres veces). `findAll()` agrega `page`/`limit`, `Promise.all([count, findMany con skip/take])`, devuelve `{ datos, pagina, limite, total }`. Ningún otro endpoint tocado (`findOne`, `create`, `anular`, `registrarCobranza`, `anularCobranza`, exports, `conciliacion` siguen usando `includeFactura` sin cambios).
- `backend/src/facturas/facturas.controller.pagination.spec.ts` (nuevo, 7 tests): defaults, cálculo de `skip`, clamp de `limit`, forma exacta de la respuesta, mismo `where` entre `count` y `findMany`, `select` (no `include`).
- `frontend/src/pages/Facturas.tsx`: `cargar()` reemplazada por `buscar(paginaNueva, limiteNueva)` con sincronización de URL (mismo patrón que `Liquidaciones.tsx`/LIQ-1). Nuevo estado `pagina`/`limite`/`total`. Bloque de UI de paginación idéntico al ya usado en el proyecto, sin CSS nuevo. Los 3 call-sites que refrescaban el listado (`crearFactura`, `registrarCobranza`, `anularFactura`) actualizados a `buscar(pagina, limite)`, permaneciendo en la página actual.

**Medición de impacto (dataset real, 3 facturas):**

| Escenario | Tamaño de respuesta | Tiempo promedio (5 corridas, localhost) |
|---|---|---|
| Antes (sin paginar, include completo) | 8411 bytes | ~0.238 s |
| Después, `limit=20` (3 registros, 1 sola página) | 731 bytes (−91% vs. antes) | ~0.212 s |
| Después, `limit=1` (1 registro por página) | 269 bytes (−97% vs. antes) | ~0.208 s |

**Nota sobre el tiempo (mismo criterio que H-11/LIQ-1):** con 3 registros el tiempo es prácticamente igual antes/después — esperado, domina el overhead de red/autenticación. La reducción real y medible es de tamaño de payload; el beneficio de tiempo se hará evidente cuando el volumen de facturas reales crezca.

**Validación funcional (navegador real):** listado con las 3 facturas reales; paginación con límite 1 mostró "Página 1 de 3 (3 en total)"; Anterior/Siguiente correcto; refresh conservó página/límite; Ver, Registrar cobranza, Anular factura, Buscar viajes pendientes + Crear factura siguieron funcionando exactamente igual; Conciliación sin cambios. Confirmado por el usuario.

**Regresiones:** ninguna esperada. `findOne()`, exports, `conciliacion()`, `create()`, `anular()`, `registrarCobranza()`, `anularCobranza()` arman cada uno su propia query independiente. `dashboard.controller.ts`/`clientes.controller.ts`/`aging.service.ts` no afectados (confirmado en la auditoría).

**Builds y tests:** backend build OK, **14/14 suites** (13 previas + 1 nueva), **104/104 tests** (97 previos + 7 nuevos). Frontend build OK, sin errores TypeScript.

**Deuda remanente identificada, fuera de alcance de FAC-1 (backlog):**
- `Facturas.tsx` sin extracción de subcomponentes ni `React.memo`.
- Falta de gating de rol en la UI (el backend ya exige `@Roles("FACTURACION","ADMINISTRADOR")` correctamente).
- N+1 evitable en `anular()` (loop de `update` idéntico reemplazable por `updateMany`).

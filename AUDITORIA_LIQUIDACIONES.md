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

---

## LIQ-2 — Extraer FilaLiquidacion a componente propio

**Objetivo:** dejar el listado de Liquidaciones con la misma arquitectura ya alcanzada en Viajes 2.0 (H-8), sin modificar comportamiento, contratos ni backend.

**Auditoría previa a la implementación:**
1. **Líneas del archivo:** 546 (post LIQ-1, antes de esta extracción).
2. **Responsabilidades del archivo:** formulario "Nueva liquidación", búsqueda/selección de candidatos, creación de liquidación, listado paginado, detalle (KPIs + planilla + adelantos generales + tabla técnica), ciclo de vida (confirmar/pagar/anular), descarga Excel/PDF, mensajes globales.
3. **Qué convenía extraer:** únicamente la fila `<tr>` del listado principal — análogo exacto a `FilaViaje` (H-8).
4. **Lógica mezclada:** mínima — a diferencia de `FilaViaje` (que tenía `useAsyncAction` propio y menú contextual), la fila de Liquidaciones es puramente presentacional: celdas de datos + un botón "Ver" que dispara un callback del padre.
5. **Callbacks que quedan en el padre:** `verDetalle(id)` — gestiona el estado `detalle`, que permanece en `Liquidaciones.tsx` (fuera de alcance).
6. **Estado que permanece en el padre:** todo el existente (`liquidaciones`, `pagina`, `limite`, `total`, `detalle`, `form`, `candidatos`, `viajesSel`, `anticiposSel`, `descargando`, `detalleTecnicoAbierto`, `transportistas`, `choferes`, `busy/error/success`).
7. **Estado que baja al hijo:** ninguno — la fila no necesita estado propio.
8. **Props de `FilaLiquidacion`:** `{ liquidacion: any; onVerDetalle: (id: string) => void }`.
9. **Riesgo de prop drilling:** ninguno — un solo nivel de anidamiento, 2 props.
10. **Alternativas evaluadas:** A) extraer solo `FilaLiquidacion` (elegida — mismo criterio mecánico que H-8, `<table>`/`<thead>`/paginación quedan inline en el padre); B) extraer además un `ListadoLiquidaciones.tsx` que envuelva tabla+paginación completas (descartada — sería una extracción más agresiva que la que Viajes 2.0 aplicó, y la consigna pedía "exactamente el mismo criterio"); C) no extraer nada (descartada, no cumple el objetivo del bloque).
11. **Elegida:** A.
12. **Por qué:** consistencia estricta con el precedente de H-8, y la tabla de Liquidaciones (sin filtros propios en la UI) es más simple que la de Viajes, sin necesidad real de encapsular más que la fila.

**React.memo — auditado, NO aplicado, con evidencia:** tras crear/confirmar/pagar/anular, el código llama `buscar(pagina, limite)`, que reemplaza el array `liquidaciones` **completo** con objetos nuevos en cada actualización (`setLiquidaciones(res.data.datos)`). A diferencia de `actualizarEstadoFila` en Viajes (que preserva la referencia de las filas no tocadas vía `.map()` condicional), acá no existe un mecanismo de actualización local parcial — implementarlo sería un cambio de comportamiento/contrato, fuera de alcance de este bloque. Con el array completo reemplazándose siempre, `React.memo` no evitaría ningún render real: todas las filas reciben una referencia nueva en cada actualización, memo o no. Ni `React.memo` ni `useCallback` en `onVerDetalle` aportan nada medible en este bloque — mismo criterio de rigor que H-9 (confirmar el efecto real antes de aplicar memo, no aplicarlo por hábito).

**Implementación:**
- Nuevo `frontend/src/components/FilaLiquidacion.tsx`: componente puramente presentacional, con su propia copia local de `fmtMoney` (no se movió desde `Liquidaciones.tsx` porque ahí se sigue usando en muchos otros lugares — KPIs, planilla, candidatos; duplicarla una vez más es consistente con la convención ya existente en el proyecto, donde `fmtMoney` está duplicada en ~4 controllers backend y ~14 páginas frontend).
- `frontend/src/pages/Liquidaciones.tsx`: el `.map()` inline de la fila del listado se reemplazó por `<FilaLiquidacion key={l.id} liquidacion={l} onVerDetalle={verDetalle} />`. Nada más se tocó.

**Validación funcional (navegador real):** listado visualmente idéntico; paginación, refresh, Ver, Confirmar/Pagar/Anular, Excel/PDF y Nueva liquidación funcionan exactamente igual que antes de la extracción. Confirmado por el usuario (checklist combinado LIQ-1+LIQ-2).

**Regresiones:** ninguna — cambio puramente mecánico de ubicación de código (mismo patrón que H-8 en Viajes), sin tocar lógica, contratos ni backend.

**Builds y tests:** backend sin cambios, 13/13 suites, 97/97 tests verde. Frontend build OK, sin errores TypeScript, 123 módulos (+1 por el archivo nuevo).

**Deuda remanente sin cambios (backlog):** falta de gating de rol en la UI, N+1 evitable en `pagar()`/`anular()`, `CATEGORIAS_ADELANTO` duplicado, Detalle/Formulario/Confirmaciones/Exports sin extraer (fuera de alcance explícito de LIQ-2).

---

## LIQ-3 — Gating de rol en la UI de Liquidaciones

**Objetivo:** ocultar en `Liquidaciones.tsx` los controles que el backend igual rechazaría por rol, replicando el mismo criterio ya aplicado en Viajes 2.0 (L4.3), sin tocar backend ni contratos — hardening defensivo de UX, no una corrección de seguridad (el backend ya es la única autoridad real).

**Auditoría previa:**
1. **Roles exactos confirmados** (releído `liquidaciones.controller.ts`): los 4 endpoints mutantes (`create`, `confirmar`, `pagar`, `anular`) exigen exactamente `@Roles("LIQUIDACIONES", "ADMINISTRADOR")` — mismos roles para los cuatro.
2. **Controles a gatear:** el card completo "Nueva liquidación" (formulario + candidatos + botón "Crear liquidación (borrador)"), y en el Detalle: "Confirmar", "Marcar como pagada", "Anular".
3. **Patrón replicado:** `usuario?.rol === "X" || usuario?.rol === "Y"` → `puedeGestionarLiquidaciones`, mismo criterio que `puedeGestionarViajes` (`Viajes.tsx`) y `puedeEditar` (`Organizacion.tsx`).
4. **`useAuth()`** confirmado: expone `{ usuario }` con `usuario.rol: string`, igual que en el resto del sistema.

**Granularidad decidida:** ocultar el card "Nueva liquidación" **completo**, no solo el botón de envío — `Liquidaciones.tsx` es visible también para `GERENCIA` (nav de `Layout.tsx`: `["ADMINISTRADOR", "LIQUIDACIONES", "GERENCIA"]`), que no tiene ninguna razón legítima para buscar candidatos si de todos modos no puede crear la liquidación. Mismo criterio que Viajes oculta el control de creación completo, no solo deshabilita el submit.

**Implementación:** `Liquidaciones.tsx` — import de `useAuth`, constante `puedeGestionarLiquidaciones`; el card "Nueva liquidación" envuelto condicionalmente; los 3 botones de acción del Detalle (`Confirmar`, `Marcar como pagada`, `Anular`) con `puedeGestionarLiquidaciones &&` agregado a su condición existente por estado. Ningún otro cambio.

**Validación:** confirmado con un usuario `GERENCIA` real, tanto por API directa (`POST /liquidaciones` sin rol de gestión → `403 Forbidden`, `GET /liquidaciones` → `200`, confirmando que el backend sigue siendo la autoridad real) como en navegador: `ADMINISTRADOR` ve todo igual que antes; `GERENCIA` no ve el card "Nueva liquidación" ni los botones Confirmar/Marcar como pagada/Anular, pero conserva listado, paginación, Ver, Excel y PDF sin cambios. Confirmado por el usuario.

**Regresiones:** ninguna — cambio puramente de UI condicional, sin tocar backend, contratos, paginación (LIQ-1) ni `FilaLiquidacion` (LIQ-2).

**Builds y tests:** backend sin cambios, 13/13 suites, 97/97 tests verde. Frontend build OK, sin errores TypeScript, 123 módulos (sin cambios en la cantidad).

**Deuda remanente sin cambios (backlog):** N+1 evitable en `pagar()`/`anular()` (loops de `update` idéntico reemplazables por `updateMany` — impacto bajo, acotado al número de viajes de una sola liquidación); `CATEGORIAS_ADELANTO` duplicado entre backend y frontend; Detalle/Formulario/Confirmaciones/Exports sin extraer a subcomponentes.

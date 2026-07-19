# Auditoría — Bloque 10.6: Pago Consolidado (Frontend)

Fecha: 2026-07-17. Etapa de Auditoría únicamente — `METODOLOGIA_SDC.md`, etapa 1. **No se propone solución, no se diseña, no se implementa, no se modifica ningún archivo, no se hace git.** Se apoya en `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md` (releída, misma sesión) para todo lo relativo a backend/modelo de datos/aislamiento — no repite esa evidencia, la referencia. Releídos frescos: `CONSTITUCION_SDC.md`, `docs/metodologia/METODOLOGIA_SDC.md`, `docs/cierres/HITO_ESTABILIZACION_v1.1.md`, `docs/RELEASE_NOTES_v1.1.md`, `docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md`. Inspeccionado fresco, contra el código real: `Liquidaciones.tsx` completo (patrón de candidatos/selección/confirmación), `GrupoEconomico.tsx` (10.4.c, patrón de pantalla administrativa de grupo), `AuthContext.tsx`, `api/client.ts`, `App.tsx`, `Layout.tsx`.

---

## 0. Qué existe hoy de "Pago Consolidado" en el frontend

**Cero implementación.** `grep -rli "PagoConsolidado\|Pago Consolidado"` sobre `frontend/src` no devuelve ninguna coincidencia — ni pantalla, ni ruta, ni componente, ni llamada a ningún endpoint de pago consolidado (que, de todos modos, tampoco existe en el backend — ver `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 0).

## 1. Pantallas, formularios y listados reutilizables

### `Liquidaciones.tsx` — el patrón más cercano a lo que 10.6 necesitaría

Releído completo. Tres piezas directamente relevantes:
- **Selección de candidatos con total en vivo** (líneas 25-27, 179-180, 242-276): dos `Set<string>` (`viajesSel`, `anticiposSel`) poblados por checkboxes sobre una tabla; el total se recalcula en cada render filtrando `candidatos.viajes`/`candidatos.anticipos` por lo marcado — sin ningún estado derivado guardado aparte. Mismo patrón que `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 13, ya proponía reutilizar para "selección de liquidaciones elegibles".
- **Flujo de tres botones según estado** (líneas 489-491): `BORRADOR` → botón "Confirmar"; `CONFIRMADA` → botón "Marcar como pagada"; cualquier estado salvo `PAGADA` → botón "Anular". El botón visible depende exclusivamente de `detalle.estado`, sin ningún estado de UI adicional que lo replique.
- **Confirmación de alto riesgo con texto tipeado** (línea 119): `pagarLiquidacion()` usa `typedValueLabel` de `useConfirm()` (`requireTypedValue`, exige tipear el número de liquidación) — la única pantalla del proyecto que usa esa variante de confirmación, reservada para la acción financiera más irreversible del sistema hoy.

### `GrupoEconomico.tsx` (10.4.c) — el patrón más cercano para una pantalla de nivel de grupo

Releído completo (cerrado y en producción, `commit 8f0dfe9`). Confirma, con código real y ya validado, que una pantalla de nivel de grupo (no de una sola organización) es viable con los patrones ya existentes: bootstrap de datos de grupo al montar, gate de rol redundante, `useAsyncAction`/`useConfirm` para cada acción independiente, sin ningún componente nuevo. Es el precedente más reciente y más directamente análogo a lo que una pantalla de Pago Consolidado necesitaría — a diferencia de `Liquidaciones.tsx` (que opera sobre una sola organización, la activa), `GrupoEconomico.tsx` ya demuestra el patrón de **una pantalla que opera sobre datos de grupo, sin depender de cuál organización esté activa**.

## 2. Contratos que 10.6 consumiría — ninguno existe todavía

Los mismos que `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 6, describe como objetivo de 10.5 (candidatos/crear/confirmar/anular de `PagoConsolidado`) — ninguno está construido. 10.6 depende completamente de que 10.5 exista primero; no hay ningún contrato parcial ni endpoint provisional que 10.6 pudiera empezar a consumir hoy.

## 3. Comportamiento dependiente de la organización activa — la pregunta central de esta auditoría

**Verificado contra el código real de `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4: no alcanza, y no es el mecanismo correcto.**

El cambio de organización activa (`cambiarOrganizacion()`, `AuthContext.tsx`, 10.3.b/10.4.b) reemplaza el JWT completo — la sesión entera pasa a operar como una organización distinta, con una recarga completa de página. Es el mecanismo correcto para las pantallas existentes (Viajes, Facturas, Liquidaciones), que operan siempre sobre una sola organización a la vez. **No es el mecanismo que Pago Consolidado necesitaría**, por una razón verificada, no de diseño: una pantalla de Pago Consolidado necesita mostrar, **en la misma vista**, liquidaciones candidatas de **más de una organización simultáneamente** — algo que cambiar de organización activa, por construcción (reemplaza todo el contexto, una recarga completa, nunca dos contextos a la vez), no puede lograr. Obligar al usuario a cambiar de organización activa, mirar los candidatos de una, cambiar de nuevo, mirar los de la otra, y de algún modo combinarlos a mano, sería exactamente el tipo de reconciliación manual que `GRUPO_ECONOMICO_DISENO_TECNICO.md` (sección 5) explícitamente buscaba evitar ("si el total no cuadra, es un error de datos, no algo que el usuario deba reconciliar a mano").

**Lo que realmente resolvería esto, según la arquitectura ya verificada:** el backend de 10.5, con el mecanismo de `organizacionContextStorage` invocado explícitamente una vez por organización (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4), devuelve en una sola respuesta HTTP los candidatos ya agregados de todas las organizaciones del grupo. El frontend nunca necesitaría que el usuario tenga una organización particular activa — llamaría a un endpoint de nivel de grupo (autorizado por `AccesoGrupoEconomico`, no por el `organizacionId` del token activo), exactamente como ya lo hace hoy `GrupoEconomico.tsx` para `GET /grupo-economico` y `GET /grupo-economico/:id/accesos` — ninguno de esos dos depende de cuál organización esté activa en el momento de la llamada.

### Qué operaciones no pueden resolverse simplemente cambiando el token activo

- **Ver candidatos de más de una organización en la misma pantalla** — imposible por construcción, un token representa una sola organización a la vez.
- **Confirmar un pago que marca liquidaciones de dos organizaciones como pagadas "a la vez"** — aunque el usuario cambiara de organización activa entre una llamada y la otra, serían dos requests HTTP separadas, sin ninguna forma de que el frontend garantice atomicidad entre ambas (ver el mismo riesgo, del lado del backend, en `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4, "fallo transaccional parcial").
- **Cualquier operación que necesite, en un solo paso de UI, datos ya combinados de ambas organizaciones** (el total consolidado, el desglose por organización) — necesita que el backend ya los devuelva combinados; el frontend no tiene, ni debería construir, ninguna lógica propia de combinar datos de dos organizaciones distintas del lado del cliente.

## 4. Estados de UI — sin poder definirse todavía con precisión

No se puede, con rigor, listar los estados de carga/vacío/error específicos de Pago Consolidado sin que exista primero el contrato real de 10.5 (candidatos/crear/confirmar/anular) — cualquier estado que se describiera ahora sería una anticipación de diseño, no una auditoría del sistema real. Lo que sí es reutilizable, verificado: los tres patrones de estado ya usados consistentemente en `Liquidaciones.tsx` y `GrupoEconomico.tsx` (cargando/vacío/error, cada uno con su propio texto, sin componentes compartidos) — mismo criterio aplicable, sin poder anticipar el contenido exacto de cada mensaje.

## 5. Flujos de cobro — no aplica

Bloque 10.6, según toda la documentación consultada, opera exclusivamente sobre `Liquidacion`/Pago Consolidado (dinero que la organización paga, no que cobra) — no hay ningún flujo de cobranza involucrado. Ver `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 1, para la distinción verificada entre ambas direcciones.

## 6. División 10.5 / 10.6 — evidencia para mantenerla separada

- **Objetivo exacto de 10.5:** backend puro — modelos, migración, endpoints (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 6).
- **Objetivo exacto de 10.6:** frontend puro — pantallas que consumen esos endpoints, sin tocar backend.
- **Dependencia:** total y unidireccional — 10.6 no puede empezar a implementarse (más allá de una auditoría/diseño de UI en abstracto) sin que 10.5 exista, porque no hay ningún contrato real que consumir todavía.
- **Riesgos de combinarlos:** los mismos que ya llevaron a separar cada sub-bloque de Grupo Económico hasta ahora (`METODOLOGIA_SDC.md`, criterio de división 4: "el trabajo mezcla capas de riesgo distintas") — 10.5 es la etapa de mayor riesgo técnico de todo Bloque 10 (transacciones cruzando organizaciones, reversión de estados hoy irreversibles), 10.6 es de riesgo bajo (pantallas nuevas, patrones ya probados) — mezclarlas forzaría a validar ambas juntas, perdiendo la posibilidad de aprobar y cerrar el backend antes de exponerlo en pantalla, exactamente el mismo razonamiento que ya se aplicó, con éxito, en 10.4.a antes de 10.4.b/10.4.c.
- **Entregable mínimo de 10.6:** validación manual en navegador real del caso completo (mismo chofer, dos organizaciones, un pago) ejecutado de punta a punta desde la interfaz — mismo criterio de cierre que ya propone `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 16, "Etapa F".

**Conclusión de esta sección: hay evidencia documental y de código suficiente para mantener la división 10.5/10.6 — no hace falta el documento único de contingencia.**

## 7. Riesgos y deuda técnica (específicos de frontend)

- **Ninguno nuevo más allá de los ya heredados de 10.5** (sección 3) — el frontend en sí no introduce riesgo propio si consume correctamente endpoints ya atómicos y ya validados; el riesgo real vive enteramente del lado del backend.
- **Riesgo de UX, no de seguridad:** si 10.5 no resuelve el caso de fallo parcial entre organizaciones (sección 3), 10.6 heredaría la obligación de comunicar ese estado intermedio de forma clara — algo que no puede diseñarse todavía porque depende de cómo 10.5 decida representarlo.
- **Sin deuda técnica propia identificada** — no hay código de Pago Consolidado en frontend, así que no hay nada que auditar como ya construido incorrectamente.

---

## Resumen

Bloque 10.6 no tiene ninguna línea de código, ni ningún contrato que consumir todavía — depende por completo de que 10.5 exista primero. El hallazgo más importante de esta auditoría es que **el cambio de organización activa de v1.1 no es, verificado con evidencia de código, el mecanismo que Pago Consolidado necesita** — una pantalla de grupo necesita ver datos de varias organizaciones a la vez, algo que cambiar de token, por construcción, no puede lograr; el patrón correcto ya existe y ya está validado en producción: `GrupoEconomico.tsx` (10.4.c), que opera sobre datos de grupo sin depender de cuál organización esté activa. `Liquidaciones.tsx` aporta el patrón visual de selección de candidatos con total en vivo y el flujo de confirmación de alto riesgo (`requireTypedValue`), ambos directamente reutilizables una vez que 10.5 exista.

No se propuso solución, no se diseñó, no se implementó, no se modificó ningún archivo. Detenido al finalizar, a la espera de tu aprobación antes de iniciar la etapa de Diseño de Bloque 10.6.

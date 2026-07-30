# AUDITORÍA VIAJES 2.0 — GESTIÓN OPERATIVA
## Bloque 2: Listado operativo (`Viajes.tsx`)

**Tipo:** Auditoría funcional y técnica. Sin implementación, sin commits, sin push.

**Alcance de este documento:** exclusivamente `frontend/src/pages/Viajes.tsx`, el endpoint `GET /viajes` (`findAll`, `viajes.controller.ts:83-104`) y `GET /viajes/pendientes-facturar` cuando es directamente comparable, las consultas Prisma que ejecutan, y los índices del modelo `Viaje` que los sostienen.

**Explícitamente fuera de alcance:** Liquidaciones, Facturas, Anticipos, Reportes, Dashboard. Se cita `ViajeDetalle.tsx`/`ViajeForm.tsx` solo como referencia de comparación (qué acciones existen "un clic más allá" del listado), sin auditarlos de nuevo — ya cubiertos en `AUDITORIA_VIAJES2.0_NUCLEO.md`.

---

## 1. Consultas

**Consulta única, `GET /viajes` → `findAll()` (`viajes.controller.ts:84-103`):**

```ts
return this.prisma.viaje.findMany({ where, include: includeViaje, orderBy: { fecha: "desc" } });
```

- **Una sola consulta ejecutada por request.** No hay N+1 en el sentido clásico (múltiples round-trips a la base): la extensión de aislamiento por organización (`organizacion-prisma.client.ts:126-130`) inyecta `organizacionId` directamente en el mismo `where` que se envía a Prisma (`args.where = { AND: [args.where ?? {}, { organizacionId }] }`), y Prisma resuelve un `include` de relaciones *-a-uno (todas las de `Viaje`) con `JOIN`s en la misma consulta SQL, no con consultas separadas por fila.
- **`includeViaje`** (`viajes.controller.ts:17-20`) trae **9 relaciones completas**: `cereal, cliente, productor, transportista, chofer, camion, acoplado, origen, destino`. Es la misma constante que usan `create()`, `update()`, `cambiarEstado()`, `cancelar()` y `findOne()` — **no existe una variante reducida para el listado.**
- **Sobre-fetching confirmado por comparación directa con lo que `Viajes.tsx` efectivamente lee:**

  | Relación incluida | ¿Se usa en `Viajes.tsx`? | Evidencia |
  |---|---|---|
  | `cereal` | Sí — `v.cereal?.nombre` | `Viajes.tsx:91` |
  | `cliente` | Sí — `v.cliente?.razonSocial` | `Viajes.tsx:92` |
  | `transportista` | Sí — `v.transportista?.razonSocial` | `Viajes.tsx:93` |
  | `origen` | Sí — `v.origen?.nombre` | `Viajes.tsx:94` |
  | `destino` | Sí — `v.destino?.nombre` | `Viajes.tsx:94` |
  | `productor` | **No** | sin referencia en el archivo |
  | `chofer` | **No** | sin referencia en el archivo |
  | `camion` | **No** | sin referencia en el archivo |
  | `acoplado` | **No** | sin referencia en el archivo |

  De las 9 relaciones traídas, **4 no se usan nunca** en el listado (`productor`, `chofer`, `camion`, `acoplado`), y de las 5 que sí se usan, **cada una aporta un único campo** (`.nombre` o `.razonSocial`) pero se trae el objeto completo (p. ej. `Cliente` completo — `razonSocial, cuit, condicionesComerciales, activo, createdAt`, `schema.prisma:271-289` — para mostrar solo `razonSocial`).
- **Sobre-fetching también a nivel de columnas escalares de `Viaje` mismo:** sin `select`, Prisma devuelve las ~20 columnas escalares del modelo (`cartaPorte, observaciones, creadoPorId, estadoFacturacion, estadoLiquidacion, createdAt, updatedAt`, más los `*Id` de cada relación) aunque `Viajes.tsx` solo renderiza 8 (`numeroViaje, fecha, ctg, toneladas, importeTotal, estado`, más los 5 campos de relación de la tabla de arriba).
- **Índices utilizados por el `where` de `findAll`:**

  | Filtro (`viajes.controller.ts:92-101`) | Índice en `Viaje` (`schema.prisma:584-590`) | Cubierto |
  |---|---|---|
  | `organizacionId` (inyectado siempre) | `@@index([organizacionId])` | Sí |
  | `fecha` (`gte`/`lte`) | `@@index([fecha])` | Sí |
  | `clienteId` | `@@index([clienteId])` | Sí |
  | `transportistaId` | `@@index([transportistaId])` | Sí |
  | `estado` | `@@index([estado])` | Sí |
  | `cerealId` | *(ninguno)* | **No** |

  `cerealId` es el único filtro soportado por el backend sin índice dedicado — hoy no es crítico (baja cardinalidad esperada: pocos cereales por organización), pero es una asimetría real frente a los otros cinco filtros.
- **No existe un índice compuesto `(organizacionId, fecha)`.** Como *toda* consulta a `Viaje` recibe `organizacionId` inyectado por la extensión (no es opcional, es automático) y el orden por defecto es siempre `fecha desc`, el patrón `WHERE organizacionId = ? ORDER BY fecha DESC` se ejecuta en el 100% de las llamadas a `findAll` — hoy Postgres debe combinar dos índices de una sola columna (`organizacionId`, `fecha`) en vez de resolver el filtro y el orden con un único índice compuesto.

**`GET /viajes/pendientes-facturar` (`viajes.controller.ts:106-117`)** — mencionado solo por comparación: mismo patrón (`includeViaje` completo, sin `select`), pero está fuera del alcance de este bloque (es consumido por Facturación, no por el listado operativo).

---

## 2. Columnas

Tabla completa de `Viajes.tsx:70-104` (10 columnas, todas siempre visibles, sin opción de ocultar/reordenar):

| Columna | Origen | Utilidad | Frecuencia de uso estimada | ¿Debería estar visible? |
|---|---|---|---|---|
| N° | `Viaje.numeroViaje` (escalar, es también el link a Detalle — `Viajes.tsx:88`) | Identificador + punto de entrada a cada Viaje | Muy alta (única forma de entrar al Detalle desde la lista) | Sí |
| Fecha | `Viaje.fecha` (escalar) | Ordenar y ubicar temporalmente | Alta | Sí |
| CTG | `Viaje.ctg` (escalar) | Identificador operativo/legal (documento físico) | Alta para el operador de campo, pero **no es buscable** (§4) | Sí, pero incompleta sin buscador |
| Cereal | `cereal.nombre` | Contexto de carga | Media | Sí |
| Cliente | `cliente.razonSocial` | A quién se le presta el servicio | Alta | Sí |
| Transportista | `transportista.razonSocial` | Quién ejecuta el viaje | Alta | Sí |
| Origen → Destino | `origen.nombre` + `destino.nombre` (concatenados en una sola celda) | Trazabilidad logística | Media/alta | Sí |
| Tn | `Viaje.toneladas` (escalar) | Volumen operado | Alta | Sí |
| Importe | `Viaje.importeTotal` (escalar, vía `fmtMoney`) | Dato económico del viaje | Alta | Sí (nota: visible para **todos** los roles que ven Viajes, sin restricción — coincide con el hallazgo de permisos ya documentado en el Bloque 1, no se repite en detalle acá) |
| Estado | `Viaje.estado` (badge) | Foco operativo diario — es el dato más consultado | Muy alta | Sí |

**Columnas ausentes que el propio diseño del sistema sugiere como necesarias:**
- `estadoFacturacion` y `estadoLiquidacion` — **no se muestran en ningún lugar del listado.** El sistema ya tiene un endpoint dedicado (`GET /viajes/pendientes-facturar`) que depende exactamente de estos dos campos, lo que confirma que son centrales para la operación diaria, pero el operador no puede verlos sin entrar al Detalle de cada Viaje uno por uno. (Ya señalado como hallazgo R-11 en `AUDITORIA_VIAJES2.0_NUCLEO.md`; se reitera acá porque es el listado el lugar exacto donde debería resolverse.)
- `cartaPorte` — se trae en cada respuesta (ningún `select` la excluye) pero no se muestra en ninguna columna.

---

## 3. Filtros

**Filtros implementados en la UI (`Viajes.tsx:40-67`):** `Desde`, `Hasta`, `Cliente`, `Estado`. Se aplican solo al presionar el botón "Filtrar" (`Viajes.tsx:67`, `onClick={cargar}`) — **no** se disparan automáticamente al cambiar un valor, lo cual es una decisión razonable (evita una request por cada tecla/selección), pero no está comunicado en la interfaz (no hay ninguna pista visual de "cambios sin aplicar").

**Filtros que el backend ya soporta pero la UI no expone:** `transportistaId` y `cerealId` (`viajes.controller.ts:88,90`) — la capacidad ya existe del lado del servidor, alcanzaría con agregar dos `<select>` más en `Viajes.tsx`, siguiendo exactamente el mismo patrón que el filtro de Cliente ya existente (mismo componente, misma lógica de `filtros`/`setFiltros`).

**Filtros que no existen en absoluto (ni backend ni frontend):**
- Por rango de `toneladas` o `importeTotal`.
- Por `origenId`/`destinoId`.
- Por `estadoFacturacion`/`estadoLiquidacion` — **inconsistente con la existencia de `GET /viajes/pendientes-facturar`**, que sí filtra por estos dos campos pero como endpoint separado, no como opción del listado general.

**Combinación de filtros:** todos los filtros activos se combinan con `AND` implícito (cada `if` en `findAll` agrega una condición más al mismo objeto `where`, `viajes.controller.ts:92-101`) — comportamiento predecible y correcto, sin casos raros detectados (p. ej. `desde` sin `hasta` funciona como "desde esa fecha en adelante", y viceversa, gracias a que cada uno se evalúa independientemente, L93-96).

**Rendimiento de los filtros:** cubierto en §1 — cuatro de los cinco filtros soportados tienen índice dedicado; `cerealId` no.

---

## 4. Búsquedas

**No existe ninguna función de búsqueda de texto libre, en ningún nivel (ni UI, ni endpoint).** `findAll()` no acepta ningún parámetro tipo `q`/`search`, y `Viajes.tsx` no tiene ningún `<input type="search">` ni campo equivalente.

**Consecuencia práctica concreta:** para encontrar un Viaje puntual por CTG, Carta de Porte o N° de viaje — los tres identificadores que un operador manejaría en el día a día frente a un documento físico o un reclamo de cliente — la única vía es:
1. Acotar por `Desde`/`Hasta`/`Cliente`/`Estado` lo más posible, y
2. Recorrer visualmente la tabla resultante (sin buscar, sin resaltar, sin paginar — ver §6) hasta encontrarlo a simple vista.

Esto es una limitación real y de alto impacto en el uso diario, agravada por la ausencia de paginación: con suficientes Viajes, "recorrer visualmente" deja de ser viable.

**Oportunidad concreta:** agregar un parámetro `q` a `GET /viajes` que busque por coincidencia (`contains`, insensible a mayúsculas) sobre `ctg` y/o `cartaPorte` y/o el propio `numeroViaje` (como texto), con el mismo mecanismo de combinación `AND` que ya usan el resto de los filtros. Detalle de diseño e impacto de índices para este punto: ver Roadmap, Bloque L5.

---

## 5. Ordenamiento

- **Orden por defecto y único orden posible:** `orderBy: { fecha: "desc" }`, hardcodeado en el backend (`viajes.controller.ts:103`) — no hay parámetro de ordenamiento en `findAll()`, y `Viajes.tsx` no tiene ningún control (headers de tabla no son clickeables, no hay indicador de orden).
- **Consistencia:** al ser el único orden posible, es trivialmente "consistente" (no hay forma de que quede en un estado ambiguo), pero también totalmente inflexible — no se puede ordenar por Importe, por Estado, ni ver los Viajes más antiguos primero sin usar el filtro `Desde`/`Hasta` como sustituto indirecto.
- El índice `@@index([fecha])` sostiene bien este único orden; si en el futuro se habilitara ordenar por otra columna (p. ej. `importeTotal`), esa columna no tiene índice propio hoy.

---

## 6. Paginación

- **No implementada, en ningún nivel.** `findMany` no usa `skip`/`take`/cursor (`viajes.controller.ts:103`); `Viajes.tsx` renderiza el array completo de la respuesta en una única `<table>` sin virtualización ni "cargar más" (`Viajes.tsx:86-102`).
- **Escalabilidad:** con el volumen de datos actual (entornos de prueba, decenas de Viajes) no es perceptible. El riesgo crece con: (a) más Viajes por organización acumulados en el tiempo, y (b) el tamaño de cada fila de respuesta ya inflado por el sobre-fetching de §1 — ambos factores se multiplican entre sí.
- **Impacto ya observable, aunque no catastrófico todavía:** cada respuesta de `GET /viajes` transporta objetos completos de hasta 9 relaciones por Viaje. No se midió un volumen real de producción en este bloque (fuera de alcance — no se auditó Dashboard/Reportes ni se consultó la base de producción), así que esto queda como riesgo identificado, no como incidente confirmado.

---

## 7. Acciones

**Documentadas en el listado mismo (`Viajes.tsx`):**
- **Crear:** botón "+ Nuevo viaje" (`Viajes.tsx:35`), siempre visible, sin restricción por rol en la UI (mismo hallazgo ya documentado en el Bloque 1 — el backend sí exige `OPERACIONES`/`ADMINISTRADOR`).
- **Ver detalle:** único punto de entrada por fila, el número de Viaje (`Viajes.tsx:88`).

**No documentadas porque no existen en el listado (viven exclusivamente en `ViajeDetalle.tsx`, un clic más allá):**
- **Editar:** ningún acceso directo desde una fila de la tabla. Requiere: clic en el N° → cargar el Detalle → clic en "Editar viaje".
- **Avanzar estado:** mismo camino — sin ningún control en la fila del listado.
- **Cancelar:** mismo camino.

**Acciones masivas:** no existen. No hay selección múltiple (sin checkboxes por fila ni "seleccionar todos"), ni ninguna acción que opere sobre más de un Viaje a la vez.

**Acciones faltantes, evaluadas contra el uso diario esperado:**
- Avanzar de estado **desde la fila del listado** (la acción más repetitiva del ciclo operativo — ver §8).
- Exportar el resultado filtrado (CSV/Excel) — no se auditó si existe en otro módulo (Reportes, fuera de alcance), pero no existe en este listado.
- Cualquier acción masiva (avanzar/cancelar en lote) — pedida explícitamente para evaluar en este bloque; no existe hoy en ningún nivel.

---

## 8. UX operativa

**Conteo de clics para la operación más común (avanzar el estado de un Viaje que ya se está viendo en la lista):**
1. Clic en el N° de Viaje (fila del listado → Detalle).
2. Esperar la carga del Detalle (`GET /viajes/:id`, con su propio `include` aún más pesado que el del listado — historial, anticipos, liquidaciones, facturas).
3. Clic en "Avanzar a X".

Es decir: **una navegación completa de página entera** para una acción que, en términos de datos, ya tiene todo lo necesario disponible en la fila del listado (el `id` del Viaje y su `estado` actual).

**Pasos repetitivos detectados:** el patrón de arriba se repite idéntico para cada Viaje que un operador necesita avanzar en el día — si hoy tiene, por ejemplo, 10 Viajes en `EN_CARGA` para pasar a `CARGADO`, son 10 repeticiones completas del ciclo "entrar al Detalle → clic → volver a la lista" (volver a la lista tampoco preserva los filtros aplicados: al hacer clic en "atrás" o en "Viajes" del menú, `Viajes.tsx` vuelve a montar y a pedir `GET /viajes` sin filtros, perdiendo el estado de filtrado anterior — no hay persistencia de filtros en la URL ni en ningún estado global).

**Información innecesaria en el listado:** no se detectó un exceso relevante de información *mostrada* — las 10 columnas actuales son, en general, razonables. El desperdicio real está en el backend (§1: relaciones y columnas traídas pero nunca mostradas), no en lo que el usuario ve.

**Acciones ocultas:** Editar, Avanzar y Cancelar no están "ocultas" en el sentido de estar mal etiquetadas o difíciles de encontrar dentro del Detalle (están claras, ver Bloque 1) — están **ausentes del lugar donde el operador pasa la mayor parte del tiempo**, que es el listado.

---

## 9. Performance

- **Consulta costosa identificada:** `findAll()` con `includeViaje` completo (9 relaciones) y sin `select`, ejecutada sin paginar — ya detallado en §1 y §6. Es la única consulta del listado, pero es más pesada de lo que el propio listado necesita.
- **Renderizados innecesarios:** no se detectaron problemas de re-render en `Viajes.tsx` — es un componente simple, sin cálculos costosos sin memoizar, y los filtros se aplican manualmente (no en cada tecla). El componente no usa `React.memo`/`useMemo` en ningún lado, pero tampoco tiene una razón real para necesitarlos con la complejidad actual del archivo.
- **Datos no utilizados:** cuantificados en §1 (4 relaciones completas nunca leídas por el frontend, más columnas escalares de `Viaje` nunca renderizadas). Es el hallazgo de performance más concreto y accionable de este bloque.
- **Ausencia de medición real:** este bloque no ejecutó `EXPLAIN ANALYZE` contra una base con volumen de producción (fuera de alcance del bloque, y contra la instrucción vigente de no tocar credenciales/datos de producción para validación) — todo lo anterior es un análisis estático del código y el schema, no una medición empírica. Se recomienda medir antes de invertir esfuerzo en optimizaciones no evidentes (p. ej. el índice compuesto de §1 es una recomendación de buen sentido relacional, no una medición).

---

## Hallazgos priorizados

| # | Hallazgo | Severidad | Evidencia |
|---|---|---|---|
| H-1 | `findAll()` sobre-trae 4 relaciones completas nunca usadas por el listado (`productor`, `chofer`, `camion`, `acoplado`) y no usa `select` para las columnas escalares | Alto (performance/escalabilidad) | §1 |
| H-2 | No existe búsqueda de texto libre (CTG/Carta de Porte/N°) — única forma de ubicar un Viaje puntual es filtrar+recorrer visualmente | Alto (uso diario) | §4 |
| H-3 | Avanzar estado / Cancelar / Editar requieren salir del listado y entrar al Detalle — sin ninguna acción inline | Alto (UX operativa, clics) | §7, §8 |
| H-4 | Sin paginación — el listado completo se trae y renderiza siempre | Medio (hoy no crítico, riesgo creciente) | §6 |
| H-5 | Sin índice compuesto `(organizacionId, fecha)` pese a que ese patrón cubre el 100% de las consultas a `Viaje` | Medio | §1 |
| H-6 | `estadoFacturacion`/`estadoLiquidacion` no se muestran en el listado, pese a ser centrales para la operación (lo confirma la existencia de `GET /viajes/pendientes-facturar`) | Medio | §2, §3 |
| H-7 | Filtros de `transportistaId`/`cerealId` ya soportados por el backend pero no expuestos en la UI | Bajo/Medio | §3 |
| H-8 | Filtro `cerealId` sin índice dedicado (asimetría frente a los otros filtros) | Bajo | §1 |
| H-9 | Sin ordenamiento configurable (fijo por `fecha desc`) | Bajo | §5 |
| H-10 | Sin acciones masivas | Bajo (no urgente al volumen actual) | §7 |
| H-11 | Filtros no persisten al volver de un Detalle (se pierden al remontar `Viajes.tsx`) | Bajo | §8 |

---

## Roadmap propuesto

Bloques pequeños, cada uno implementable e independiente del resto. Orden sugerido combinando impacto/esfuerzo/riesgo:

| Bloque | Contenido | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|
| **L1** | Reemplazar `include: includeViaje` por un `select` dedicado en `findAll()` (solo lo que `Viajes.tsx` consume + `estadoFacturacion`/`estadoLiquidacion`) | Alto | Bajo | Bajo — cambia la forma de una respuesta ya sin tipos estrictos en el frontend (`any[]`), no afecta a `findOne`/`create`/`update` |
| **L2** | Mostrar `estadoFacturacion`/`estadoLiquidacion` como columnas/badges en la tabla (una vez disponibles por L1) | Medio-Alto | Bajo | Bajo |
| **L3** | Exponer en la UI los filtros `transportistaId`/`cerealId` que el backend ya soporta | Medio | Bajo | Bajo |
| **L4** | Índice compuesto `@@index([organizacionId, fecha])` en `Viaje` (migración Prisma) | Alto (transversal, no solo el listado) | Bajo-Medio | Bajo-Medio — requiere migración en producción; evaluar `CREATE INDEX CONCURRENTLY` en el diseño |
| **L5** | Búsqueda de texto libre (`q` sobre `ctg`/`cartaPorte`/`numeroViaje`) | Alto (uso diario) | Medio | Bajo-Medio — definir si alcanza con `contains` simple o hace falta índice funcional/trigram según volumen real |
| **L6** | Acción "Avanzar estado" inline por fila en el listado (reutiliza `POST /viajes/:id/estado` existente) | Alto (uso diario, reduce clics) | Medio | Bajo — sin backend nuevo, cuidar feedback/errores por fila |
| **L7** | Paginación real de `GET /viajes` + UI paginada | Alto a mediano plazo | Alto | Medio-Alto — cambia el contrato de la respuesta; requiere primero identificar todo otro consumidor de este endpoint (no relevado en este bloque) |
| **L8** | Ordenamiento configurable por columna (al menos Fecha/Estado/Importe) | Bajo-Medio | Bajo | Bajo |
| **L9** | Persistencia de filtros (en la URL, vía query params) al navegar a un Detalle y volver | Bajo-Medio | Bajo | Bajo |
| **L10** | Acciones masivas (selección múltiple + avanzar/cancelar en lote) | Bajo (no urgente hoy) | Alto | Medio — semántica de fallos parciales, permisos, UI de selección |

---

## Riesgos (del propio proceso de mejora, no solo del estado actual)

- **L7 (paginación) es el de mayor riesgo de romper algo si se implementa sin auditar primero quién más consume `GET /viajes`.** Este bloque no relevó otros consumidores del endpoint (fuera de alcance) — antes de tocar el contrato de la respuesta, corresponde un grep dedicado.
- **L4 (índice compuesto) es una migración sobre la tabla `Viaje` en producción.** Aunque `CREATE INDEX` no reescribe datos, sí puede bloquear escrituras si no se usa `CONCURRENTLY` — a definir explícitamente en el diseño de ese bloque, no asumirlo.
- **L1 (select reducido) no tiene un tipo TypeScript que lo proteja:** `Viajes.tsx` tipa la respuesta como `any[]` (`Viajes.tsx:10`), así que un recorte accidental de un campo que sí se usa no se detectaría en tiempo de compilación, solo en runtime/QA manual. Recomendación para el diseño de L1: verificar explícitamente, campo por campo, contra la lista de la tabla de §1 antes de aplicar el `select`.
- **Ninguno de los hallazgos de performance (§9) está medido contra datos reales de producción** — todo el análisis es estático. Antes de invertir esfuerzo en L4/L7 en particular, sería valioso confirmar con una medición real (fuera del alcance de este bloque de auditoría).

---

**Fin del Bloque 2 (listado operativo). Sin cambios de código. Sin commits. Sin push. Queda a la espera de aprobación antes de implementar cualquiera de los bloques del roadmap.**

# Bloque 7.3.4.1 — Auditoría de Consolidación del Motor de Inteligencia

Fecha: 2026-07-11. Documento de auditoría — **no se escribió código, no se modificó ningún archivo, no se hizo commit, no se hizo push.** Sub-bloque de consolidación, no agrega funcionalidad: su único propósito es dejar registrado el estado real del Motor de Inteligencia antes de abrir 7.3.5.

**Relación con lo anterior:** no reabre ni modifica 7.3.1, 7.3.2, 7.3.3.a ni 7.3.4 — los da por cerrados y aprobados. Contrasta su código, tal como quedó después del refactor de 7.3.4 (extracción de `RentabilidadService`/`AgingService`/`AlertasService`), contra `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`, `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` y `BLOQUE7.2.d_PRINCIPIOS_GOBERNANZA_CONCEPTUAL.md`.

---

## 1. Alcance

**Incluido** (16 archivos, todos en `backend/src/inteligencia/`):

| Archivo | Rol |
|---|---|
| `inteligencia.module.ts` | Módulo Nest |
| `inteligencia.controller.ts` | Controller — Rentabilidad |
| `aging.controller.ts` | Controller — Aging |
| `alertas.controller.ts` | Controller — Alertas |
| `dashboard-ejecutivo.controller.ts` | Controller — Dashboard Ejecutivo |
| `rentabilidad.service.ts` | Service — orquesta Prisma + cálculo |
| `aging.service.ts` | Service — orquesta Prisma + cálculo |
| `alertas.service.ts` | Service — orquesta Prisma + cálculo |
| `reportes/rentabilidad.calc.ts` | Cálculo puro |
| `reportes/aging.calc.ts` | Cálculo puro |
| `reportes/alertas.calc.ts` | Cálculo puro |
| `shared/fecha.ts` | Semántica compartida |
| `shared/vigencia.ts` | Semántica compartida |
| `shared/dinero.ts` | Semántica compartida |
| `shared/severidad.ts` | Semántica compartida |
| `shared/umbrales.ts` | Configuración de calibración |

**Excluido explícitamente**, según instrucción: módulos transaccionales, Prisma schema, migraciones, Docker, Railway, frontend fuera del Centro de Inteligencia. Las cuatro pantallas del Centro de Inteligencia (`Rentabilidad.tsx`, `Aging.tsx`, `Alertas.tsx`, `DashboardEjecutivo.tsx`) tampoco forman parte del alcance formal de esta auditoría (el objetivo, tal como fue planteado, es "el código del Motor de Inteligencia" — backend) y no se revisaron línea por línea; se mencionan una sola vez en la sección 4 porque una de ellas repite, en el frontend, un patrón ya señalado en el backend, y vale la pena que quede registrado aunque no se actúe sobre él en este sub-bloque.

`alertas/.gitkeep` y `benchmarking/.gitkeep` se revisan como parte del alcance (son la taxonomía de carpetas que 7.3.5 va a heredar), no como código.

---

## 2. Método

Relectura completa y línea por línea de los 16 archivos (no por memoria de haberlos escrito), cruzada contra:
- Los 8 puntos de la sección 6 de `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` (reglas obligatorias para cualquier cálculo).
- La Parte 6 de `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (organización de carpetas y su justificación).
- El principio 4 y 5 de `BLOQUE7.2.d_PRINCIPIOS_GOBERNANZA_CONCEPTUAL.md` (semántica única, ningún consumidor recalcula).
- Las 15 categorías de búsqueda pedidas, en orden.

Cada hallazgo cita archivo:línea exacto. No se proponen soluciones en este documento — eso es tarea del Diseño (`BLOQUE7.3.4.1_DISENO_CONSOLIDACION.md`), que se escribe después de que este documento sea aprobado.

---

## 3. Hallazgos confirmados

### H1 — Consulta + mapeo de Viaje duplicados (violación de regla 8)

El patrón "traer `Viaje` con `facturasViaje`/`liquidacionesViaje` filtrados por vigencia, y mapearlo a `ViajeEntrada[]`" aparece dos veces, con el mismo shape de `select` y el mismo mapeo campo a campo:

- `rentabilidad.service.ts:24-56` (consulta con `where.fecha`, `where.clienteId?`, `where.transportistaId?`)
- `alertas.service.ts:32-46` (consulta, misma `select`, sin filtro de fecha/cliente/transportista) + mapeo en `alertas.service.ts:72-77`

Comparación campo por campo del `select` (ambos):
```
id, numeroViaje, fecha, clienteId, cliente.razonSocial, transportistaId, transportista.razonSocial,
facturasViaje (where factura.estado != ANULADO) { importeViaje, factura.fecha },
liquidacionesViaje (where liquidacion.estado != ANULADA) { totalViaje, liquidacion.createdAt }
```
Y el mapeo a `ViajeEntrada` (`rentabilidad.service.ts:46-56` vs. `alertas.service.ts:72-77`) es línea por línea idéntico.

Es la segunda ocurrencia del mismo patrón (la primera es 7.3.1, la segunda 7.3.3.a) — por regla 8 de `BLOQUE7.3.0`, debía extraerse antes de escribir esta segunda copia. No se hizo en su momento porque 7.3.3.a se implementó bajo la modalidad directa (sin pausa de diseño salvo conflicto arquitectónico real), y una duplicación de este tipo no calificó, en ese momento, como conflicto arquitectónico bloqueante — quedó señalada implícitamente para consolidación, que es precisamente este sub-bloque.

**Por qué importa para 7.3.5:** Benchmarking y Tendencias (`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 6) va a necesitar leer `Viaje` sobre múltiples períodos sucesivos para reutilizar `rentabilidad.calc.ts` — es, con alta probabilidad, la tercera vez que este mismo patrón se necesita. Consolidar ahora evita escribirlo una tercera vez con una nueva variante (por período) antes de haber unificado las dos que ya existen.

### H2 — Consulta + mapeo de Factura duplicados (violación de regla 8)

El mismo patrón, sobre `Factura`:

- `aging.service.ts:18-47` (consulta con `where.clienteId?`)
- `alertas.service.ts:22-29` (misma `select`, sin filtro de cliente) + mapeo en `alertas.service.ts:63-67`

`select` idéntico en ambos:
```
id, numero, fecha, vencimiento, importe, estado, clienteId, cliente.razonSocial,
cobranzas (where anulada: false) { importe, fecha }
```
Mapeo a `FacturaEntrada` (`aging.service.ts:37-47` vs. `alertas.service.ts:63-67`) idéntico campo a campo.

Mismo razonamiento que H1: segunda ocurrencia del mismo patrón, mismo `select`, mismo mapeo — regla 8 de `BLOQUE7.3.0` ya debería haberlo extraído. 7.3.5 (Benchmarking y Tendencias sobre Performance Financiera) es candidato directo a una tercera ocurrencia.

### H3 — Helper `primerDiaDelMes` duplicado

Función idéntica, carácter por carácter, en dos controllers:

- `aging.controller.ts:8-12`
- `dashboard-ejecutivo.controller.ts:10-14`

```ts
function primerDiaDelMes(referencia: Date): Date {
  const d = new Date(referencia);
  d.setDate(1);
  return d;
}
```

No es una regla de negocio del Motor en sentido estricto (no toca `Factura`/`Liquidación`), por lo que no es, técnicamente, una violación de regla 8 (que habla de vigencia/período/redondeo) — pero sí es la categoría 6 pedida explícitamente ("Helpers repetidos") y la categoría 3 ("Funciones repetidas"): dos copias byte-idénticas de una función de 4 líneas, en dos archivos del mismo módulo.

*(Nota fuera de alcance: `frontend/src/pages/DashboardEjecutivo.tsx:21-25` tiene una tercera copia conceptual — mismo nombre, misma lógica, en TypeScript de frontend. No se cuenta como hallazgo de esta auditoría porque el frontend está explícitamente fuera de alcance, pero queda mencionado para que no se pierda de vista si en algún momento se decide compartir utilidades de fecha entre backend y frontend — algo que hoy el proyecto no hace en ningún otro lugar, así que no es una anomalía nueva introducida por el Motor.)*

### H4 — Deriva respecto de la taxonomía de carpetas declarada

`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 6, declaró la taxonomía: `inteligencia/reportes/` para 7.3.1 (`rentabilidad.calc.ts`), y `inteligencia/shared/`, `inteligencia/alertas/`, `inteligencia/benchmarking/` como carpetas vacías "preparadas para 7.3.2/7.3.3/7.3.5" respectivamente.

Lo que ocurrió en la implementación real:
- `aging.calc.ts` (7.3.2) → quedó en `reportes/`, consistente con lo que el propio documento anticipaba ("va a necesitar su propio archivo de cálculo... dentro de `reportes/`", Parte 6, párrafo final).
- `alertas.calc.ts` (7.3.3.a) → **también** quedó en `reportes/` (`reportes/alertas.calc.ts:1`), no en `alertas/`, que es la carpeta que el mismo documento había reservado específicamente para esta capacidad.
- `alertas/.gitkeep` y `benchmarking/.gitkeep` siguen siendo las dos únicas entradas de sus respectivas carpetas — ambas carpetas están vacías hoy.

No hay ningún error funcional acá — el import (`alertas.controller.ts:7`, `alertas.service.ts:5`) apunta correctamente a `./reportes/alertas.calc`, todo compila y corre. Es una deriva de organización, no de comportamiento: la taxonomía documentada y aprobada dice una cosa, el código hace otra, y nadie lo marcó como una decisión consciente en su momento.

**Por qué importa para 7.3.5:** si Benchmarking y Tendencias sigue el precedente real (todo cálculo puro en `reportes/`, sin importar la carpeta que su categoría tenía reservada), entonces `alertas/` y `benchmarking/` quedan como carpetas vacías permanentes y la taxonomía de la Parte 6 queda desactualizada sin que ningún documento lo diga. Si en cambio se decide honrar la taxonomía tal como está escrita, hay que mover `alertas.calc.ts` a `alertas/` ahora, antes de que 7.3.5 tenga que decidir lo mismo por sí solo sin precedente claro. Esto es exactamente el tipo de decisión que este sub-bloque de consolidación existe para resolver — se traslada al Diseño.

### H5 — Tipo `BucketAging` re-declarado como unión literal en vez de importado

`aging.calc.ts:29` define y exporta:
```ts
export type BucketAging = "0-30" | "31-60" | "61-90" | "+90";
```

Esa misma unión literal, en vez de importar `BucketAging`, se reescribe a mano en otros dos lugares:

- `shared/umbrales.ts:6` — `Record<"0-30" | "31-60" | "61-90" | "+90", ...>` (tipo de `FACTURA_VENCIDA_SEVERIDAD_POR_BUCKET`)
- `reportes/alertas.calc.ts:75` — `f.bucket as "0-30" | "31-60" | "61-90" | "+90"`

Es "Tipos repetidos" (categoría 4 de la búsqueda pedida): son tres declaraciones textuales del mismo conjunto de 4 valores, en vez de una declaración y dos importaciones. Hoy no genera ningún bug (los tres coinciden exactamente), pero si algún día se agrega o renombra un bucket, hay tres lugares que actualizar en vez de uno, y el compilador no avisa si alguno queda desactualizado sin que el `as` en `alertas.calc.ts:75` lo enmascare.

---

## 4. Evaluado y descartado explícitamente

Aplicando el criterio pedido — si el beneficio no es claro, la recomendación es no hacerlo — los siguientes candidatos se evaluaron y se descartan:

**`fechaCorte: hoy.toISOString().slice(0, 10)` repetido en 3 controllers** (`aging.controller.ts:33`, `alertas.controller.ts:40`, `dashboard-ejecutivo.controller.ts:55`). Es una línea de formato de presentación (fecha → string `YYYY-MM-DD`), no una regla de negocio ni una semántica del Motor — no cae bajo la regla 8 (que habla de vigencia/período/redondeo). Extraerla a un helper compartido cambia tres líneas autocontenidas y obvias por un import adicional en tres archivos, para ahorrar una línea de `Intl`/`Date` estándar de JavaScript. El costo de indirección supera el beneficio. **No se recomienda tocar.**

**`shared/.gitkeep`.** Quedó vestigial desde que `shared/` pasó a tener 5 archivos reales (`fecha.ts`, `vigencia.ts`, `dinero.ts`, `severidad.ts`, `umbrales.ts`). Git ya no necesita el placeholder para que la carpeta exista. Borrarlo es cosmético — no afecta compilación, tests, ni a ningún consumidor. **No vale la pena como acción de este sub-bloque**; si se toca en el futuro, que sea de paso, no como tarea dedicada.

**`VIAJE_SIN_FACTURAR_DIAS_*` y `VIAJE_SIN_LIQUIDAR_DIAS_*` con los mismos valores** (`shared/umbrales.ts:26-32`: ambas ternas son `0, 8, 16`). Podría leerse como "semántica repetida" (categoría 9), pero son dos decisiones de negocio distintas (sección 5 de `BLOQUE7.3.3a_DISENO_ALERTAS.md`, ya aprobada) que hoy coinciden en valor por calibración inicial, no por definición — es exactamente el tipo de coincidencia que un futuro ajuste de negocio podría separar (por ejemplo, si facturar se vuelve más urgente que liquidar). Son constantes declaradas, no lógica duplicada: fusionarlas ahora ataría dos decisiones de negocio independientes a un solo número por una coincidencia de hoy. **No se recomienda consolidar.**

**`calcularAging(entradaFacturas, hoy, hoy, hoy)` en `alertas.service.ts:70`.** El triple `hoy` como `periodoDesde`/`periodoHasta`/`hoy` es una consecuencia de que `calcularAging` (definida para 7.3.2) siempre requiere un período, aunque Alertas no use ni exponga el DSO resultante. Ya está comentado explícitamente en el propio archivo (`alertas.service.ts:68-69`) como una decisión consciente. La alternativa (hacer `periodoDesde`/`periodoHasta` opcionales en `calcularAging`, devolviendo `dso: null` cuando se omiten) tocaría la firma y el contrato de una función pura ya validada y en producción — el propio pedido de este sub-bloque excluye explícitamente cambiar comportamiento o contratos. **No se recomienda tocar.**

**Categorías buscadas sin hallazgos:** DTOs repetidos (el módulo no usa DTOs con `class-validator` en ningún endpoint — todos los parámetros son query strings simples validados a mano o dejados pasar a `Date` — no hay DTO que duplicar); acoplamientos innecesarios entre servicios (los tres servicios no se importan entre sí; solo `DashboardEjecutivoController` los inyecta a los tres, que es exactamente el patrón de "consumidor" aprobado en 7.3.4); reglas de negocio repetidas más allá de H1/H2 (no se encontró una tercera fórmula de negocio — margen, aging, severidad — reimplementada en ningún controller o service; los `*.calc.ts` siguen siendo la única fuente).

---

## 5. Verificación positiva (lo que ya está bien y no requiere acción)

- Ningún controller importa `PrismaService` — desde el refactor de 7.3.4, solo los tres servicios lo hacen (`rentabilidad.service.ts:2`, `aging.service.ts:2`, `alertas.service.ts:2`). Separación correcta entre orquestación (controllers) y acceso a datos + composición (services).
- `dashboard-ejecutivo.controller.ts` no tiene ningún import de Prisma ni de ningún módulo transaccional — es, tal como se diseñó en 7.3.4, un consumidor puro de los tres servicios.
- Ningún `*.calc.ts` importa `PrismaService`, `@nestjs/common` ni nada de HTTP — las tres funciones de cálculo (`calcularRentabilidad`, `calcularAging`, `calcularAlertas`) siguen siendo funciones puras testeables sin infraestructura, tal como exige la regla 2 de `BLOQUE7.3.0`.
- El filtro de vigencia (regla 4) está presente y es consistente en las cuatro consultas Prisma del módulo (`rentabilidad.service.ts:35,39`, `aging.service.ts:15,30`, `alertas.service.ts:23,30,38,42`) — ninguna quedó desactualizada respecto de las otras.
- Los roles se declaran exclusivamente en el backend vía `@Roles()` (regla 7) en los cuatro controllers — no hay ninguna lógica de autorización en el frontend más allá de ocultar ítems de menú (`Layout.tsx`), que es presentación, no autorización real.
- `alertas.controller.ts` filtra por rol *dentro* de una respuesta ya calculada (`TIPOS_POR_ROL`, líneas 18-24, aplicado en línea 36-37) sin recalcular ningún campo — coherente con el principio 5 de `BLOQUE7.2.d` ("ningún consumidor recalcula lo que el sistema ya definió").
- `dashboard-ejecutivo.controller.ts:50-52` y `:78-80` solo ordenan/recortan (`sort`, `slice`, `filter().length`) sobre campos ya calculados — ninguna operación aritmética sobre montos, coherente con la regla 6 de `BLOQUE7.3.0`.

---

## 6. Conclusión de la auditoría

El Motor de Inteligencia, después de 7.3.1 a 7.3.4, está en buen estado general: la separación controller→service→calc es consistente en los tres servicios, la semántica compartida (`shared/`) se usa de manera uniforme, y no aparecieron violaciones de las reglas 1, 2, 4, 5, 6 ó 7 de `BLOQUE7.3.0`. La superficie real de consolidación es acotada: dos duplicaciones genuinas de regla 8 (H1, H2) que van a agravarse con 7.3.5 si no se resuelven ahora, una duplicación trivial de helper (H3), una decisión de organización de carpetas sin resolver (H4), y una duplicación menor de tipo (H5). El resto de lo revisado, incluidas varias coincidencias que a primera vista parecían duplicación, resultó ser o bien código ya correcto, o bien una decisión de calibración que no conviene atar prematuramente.

**Recomendación:** vale la pena continuar a la etapa de Diseño para H1, H2, H3, H4 y H5 — son cambios acotados, de bajo riesgo, sin impacto en contratos HTTP ni en comportamiento observable, y H1/H2 en particular tienen un costo creciente cuanto más se posterguen (cada sub-bloque nuevo que necesite `Viaje` o `Factura` es una duplicación más que después hay que deshacer). Ningún otro hallazgo de los evaluados en la sección 4 justifica una acción de diseño.

Queda a la espera de aprobación antes de escribir `BLOQUE7.3.4.1_DISENO_CONSOLIDACION.md`.

# Acta de Cierre — Bloque 7: Centro de Inteligencia

**Estado: CERRADO.** Fecha de apertura: 2026-07-10 (`BLOQUE7_AUDITORIA_FUNCIONAL.md`). Fecha de cierre: 2026-07-11, tras validación visual completa en producción (5/5 módulos PASS). Consolida en un solo documento el trabajo distribuido en ~25 documentos de auditoría/diseño/cierre de sub-bloques (7.1, 7.2.a-d, 7.3.0 a 7.3.5) — cada uno conserva su detalle completo; este documento es la referencia de alto nivel.

---

## 1. Objetivos iniciales

Bloque 7 nació de una auditoría funcional (`BLOQUE7_AUDITORIA_FUNCIONAL.md`) que miró el sistema no desde el código sino desde el uso diario — como lo haría un Director Operativo o Gerencia — y encontró un patrón repetido: el sistema **registraba** datos financieros (viajes, facturas, liquidaciones, cobranzas) con solidez, pero **nunca los cruzaba entre sí**. No existía rentabilidad por viaje/cliente/transportista, no existía aging de cartera, no existían alertas proactivas, y no había forma de comparar un período contra otro. `BLOQUE7_ROADMAP_FUNCIONAL.md` clasificó ese hallazgo (ítem #30, "reporte de rentabilidad") como **"el mayor hallazgo individual de esa auditoría"**.

El objetivo formal, fijado en `BLOQUE7.3_ALCANCE.md`: construir un **Centro de Inteligencia** — un conjunto de módulos backend que lee el modelo transaccional ya validado por los Bloques 1-6, sin modificarlo, y expone ese cruce como información que ayuda a decidir, no solo a registrar.

---

## 2. Funcionalidades implementadas

| Sub-bloque | Qué responde | Commit |
|---|---|---|
| 7.3.1 — Rentabilidad | ¿Cuánto margen deja cada viaje/cliente/transportista? | `8b2f458` |
| 7.3.2 — Aging de Cobranzas | ¿Cuánto hay pendiente de cobrar, y hace cuánto está vencido? | `2e886bc` |
| 7.3.3.a — Centro de Alertas | 9 situaciones que requieren atención hoy, filtradas por rol | `cb4d60e` |
| 7.3.4 — Dashboard Ejecutivo | Una sola pantalla que consolida los tres anteriores | `7428812` |
| 7.3.4.1 — Consolidación del Motor | Sin funcionalidad nueva — elimina duplicaciones de código antes de seguir creciendo | `d947678` |
| 7.3.5 — Benchmarking y Tendencias | ¿Quién mejoró/empeoró? ¿Cómo evolucionó el margen? Rankings y top/bottom | `537f9e7` / `b8ab06e` (diseño) |

**Explícitamente no implementado:** 7.3.3.b (alertas documentales — vencimiento de licencia/RTO/seguro) quedó **condicionada desde el origen** (`BLOQUE7.3_ALCANCE.md`, Frontera 2) a que el modelo capture esos vencimientos, cosa que hoy no hace. No es una brecha de esta implementación — es un prerrequisito de datos que nunca se cumplió.

---

## 3. Arquitectura lograda

**Capa conceptual (7.2, sin código):** 7 dominios analíticos, el Viaje como unidad económica fundamental (4 clases cognitivas: Hecho, Materialización, Indicador, Consumo), un ciclo de vida del conocimiento de 5 etapas, y 9 principios rectores de gobernanza — entre ellos, el más citado durante todo Bloque 7.3: *"ningún consumidor recalcula lo que el sistema ya definió"*.

**Capa técnica (7.3.0, "Motor de Inteligencia"):** una constitución de 8 reglas obligatorias para cualquier cálculo nuevo — la más determinante en la práctica fue la **regla 8** ("si dos cálculos necesitan la misma regla, se extrae antes de duplicarse una segunda vez"), que motivó directamente el sub-bloque de consolidación 7.3.4.1.

**Patrón resultante, estable desde 7.3.4:**
```
Controller (autoriza por rol) → Service (lee Prisma, arma la entrada) → *.calc.ts (función pura, sin Prisma/HTTP)
```
Con `shared/` (fecha, vigencia, dinero, severidad, umbrales) como semántica única reutilizada por todos los cálculos. Después de 7.3.4.1, `RentabilidadService`/`AgingService` son la única fuente de fetch+mapeo de `Viaje`/`Factura` — `AlertasService` y `BenchmarkingService` los reutilizan, ninguno vuelve a tocar Prisma por su cuenta. Taxonomía de carpetas por tipo de capacidad (`reportes/`, `alertas/`, `benchmarking/`, `shared/`), no por sub-bloque.

**Extensión aditiva sin reapertura de decisiones cerradas:** 7.3.5 necesitó cereal/ruta en `RentabilidadService` — en vez de reabrir su diseño original, se extendió el mismo archivo con el mismo patrón (`porCereal`/`porRuta`, análogo a `porCliente`/`porTransportista`), sin tocar la fórmula de margen ya validada.

---

## 4. Decisiones importantes

- **Frontera 7.3.1/7.3.5:** 7.3.1 define snapshots estáticos por período; 7.3.5 reutiliza esas mismas funciones sobre múltiples períodos, sin redefinir nada — decidido antes de empezar 7.3.1, para que ambos sub-bloques compartieran contrato desde el diseño.
- **7.3.3.b condicionada:** las alertas documentales se declararon explícitamente fuera de alcance hasta que exista captura de vencimientos — evitó forzar una funcionalidad sin datos reales detrás.
- **Renombre `reportes/` → `inteligencia/`:** decisión temprana ("cambio barato hoy, caro después") que dejó preparada la estructura de carpetas para todo lo que vino después.
- **7.3.4 — extracción de servicios inyectables:** el único conflicto arquitectónico real durante la modalidad de auditoría/diseño completa — "no consultar Prisma directamente" chocaba con el precedente ya aprobado de 7.3.3.a. Se resolvió con una pregunta acotada al Product Owner, no con una decisión unilateral ni con un documento nuevo.
- **7.3.4.1 — consolidación antes de seguir creciendo:** el usuario pidió explícitamente parar y auditar el Motor ya construido antes de abrir 7.3.5, con un criterio de ingeniería explícito ("si el beneficio no es claro, la recomendación es no hacerlo") — resultó en 5 duplicaciones reales corregidas y 4 candidatos descartados conscientemente.
- **7.3.5 — cereal/ruta/comisión:** verificado que el Motor no exponía cereal, ruta ni comisión; en vez de decidir en silencio, se presentó como conflicto real al Product Owner. Resultado: extender `RentabilidadService` para cereal/ruta (aditivo, mismo patrón ya existente) y **descopear comisión explícitamente** (no tiene hogar natural en Rentabilidad, crear uno habría sido arquitectura nueva).
- **Recuperación de acceso a producción:** cuando la validación reveló que no había credenciales de producción conocidas, se resolvió con una consulta de solo lectura primero (nunca se leyeron hashes/secretos), confirmación explícita de que no crear un usuario nuevo sino resetear uno existente, y un script temporal fuera del repositorio que nunca expuso `DATABASE_URL`, contraseña ni hash — ejecutado enteramente por el Product Owner, no por el agente.

---

## 5. Validaciones realizadas

- **Cálculo puro:** 87 aserciones entre las 4 suites (Rentabilidad 21, Aging 29, Alertas 18, Benchmarking 19), corridas contra el build real en cada entrega, siempre en verde.
- **Comparación antes/después byte a byte:** en 7.3.4 (dashboard-ejecutivo vs. las 3 fuentes que consolida, 14/14 coincidencias) y en 7.3.4.1 (las 4 respuestas HTTP completas, capturadas con el código pre-refactor vía `git stash` y comparadas contra el post-refactor — idénticas).
- **Roles 200/403:** verificado en cada sub-bloque contra los 6 usuarios demo (`ADMINISTRADOR`, `GERENCIA`, `FACTURACION`, `LIQUIDACIONES`, `OPERACIONES`, `LECTURA`), local y luego en producción real.
- **Regresión visual local:** las 5 pantallas del Centro de Inteligencia más el Dashboard operativo, en cada entrega, sin errores de consola de aplicación.
- **Deploy automático confirmado:** `preDeployCommand` de Bloque 6.3 aplicó lo que hacía falta y el healthcheck cortó tráfico correctamente antes de exponer la versión nueva — confirmado sin credenciales (`/health` → `200`, rutas nuevas de Benchmarking → `401`, no `404`).
- **Validación visual autenticada en producción real (2026-07-11):** los 5 módulos — **PASS** en los 5 (Dashboard Ejecutivo, Rentabilidad, Aging, Centro de Alertas, Benchmarking y Tendencias). Cierre formal de Bloque 7.

---

## 6. Estado final del sistema

Ver `ESTADO_ACTUAL_POST_BLOQUE7.md` para el detalle completo. En resumen: los 7 módulos de negocio originales siguen funcionando de punta a punta sin cambios de comportamiento; el Centro de Inteligencia (5 pantallas nuevas) está en producción, validado, y con una separación arquitectónica (controller→service→cálculo puro) que no existía antes de Bloque 7 en ningún otro módulo del sistema. El despliegue es confiable y automático desde Bloque 6.3. La base de datos no tuvo una sola migración nueva durante todo Bloque 7 — el Motor se construyó exclusivamente leyendo el modelo ya existente.

---

## 7. Deuda técnica remanente

**Heredada, sin cambios durante Bloque 7** (`DEUDA_TECNICA.md`, secciones A-F): `JWT_SECRET`/CORS sin fail-fast, sin rate-limiting en login, `cuentaCorriente()` no excluye facturas anuladas, Dockerfiles divergentes sin unificar, backup de base de datos sin verificar, cero tests automatizados de framework, CRUD de usuarios y edición de catálogos sin exponer en la UI.

**Nueva, propia del Motor** (`DEUDA_TECNICA.md`, sección G, detallada en `ESTADO_ACTUAL_POST_BLOQUE7.md`):
1. Evolución de comisión no expuesta en Benchmarking (descopeada conscientemente).
2. Alertas documentales sin implementar (condicionadas a captura de vencimientos, nunca resuelta).
3. Dashboard operativo sin migrar a la semántica compartida del Motor (dos definiciones de "vencida" conviven).
4. Umbrales de alertas/tendencias sin calibrar contra uso real — son valores iniciales de criterio técnico.
5. Sin exportación (Excel/PDF) en ninguna de las 5 pantallas nuevas.

**Nueva, de procedimiento (surgida durante este cierre):** no existe un procedimiento documentado y repetible para crear/recuperar acceso administrativo en producción — se resolvió ad-hoc esta vez (Railway CLI + verificación de solo lectura + script temporal descartable). Vale la pena convertirlo en un procedimiento formal antes de que vuelva a hacer falta.

---

## 8. Lecciones aprendidas

- **Parar ante un conflicto arquitectónico real, en vez de decidir en silencio, funcionó dos veces** (7.3.4: Prisma directo vs. precedente; 7.3.5: cereal/ruta/comisión sin hogar en el Motor). En ambos casos, una pregunta acotada al Product Owner resolvió la ambigüedad más rápido y con menos riesgo que asumir una interpretación.
- **La consolidación explícita antes de cerrar (7.3.4.1) valió la pena.** Cinco sub-bloques construidos en secuencia con la misma modalidad directa acumularon duplicaciones reales (regla 8) que nadie había frenado a corregir sobre la marcha — pararse a auditar antes de agregar el sexto sub-bloque las encontró y las resolvió con bajo riesgo, en vez de heredarlas indefinidamente.
- **El propio criterio de "no inventar trabajo" evitó sobre-ingeniería.** La auditoría de consolidación descartó explícitamente 4 candidatos de mejora por no justificar el costo — la disciplina de decir "no vale la pena" fue tan importante como la de decir "esto sí hay que arreglarlo".
- **No asumir que un trabajo reportado como "listo para commit" ya está commiteado.** 7.3.4.1 quedó sin commitear entre una sesión y la siguiente; se detectó recién al revisar `git log` antes de tocar el mismo archivo desde 7.3.5 — la verificación activa de estado evitó mezclar dos unidades de trabajo en un commit confuso.
- **Extender en vez de duplicar, incluso cuando implica tocar un archivo ya cerrado, es preferible a crear un camino paralelo** — siempre que se lo plantee como decisión explícita al Product Owner en vez de asumirlo unilateralmente (cereal/ruta en `RentabilidadService` es el ejemplo directo).
- **La recuperación de acceso a producción no tenía plan previo, y se notó.** Fue resuelta de forma segura, pero improvisada — quedó como deuda de procedimiento explícita (sección 7) en vez de repetirse a ciegas la próxima vez.

---

## 9. Preparación para Bloque 8

Sin decidir ningún camino — este documento no abre Bloque 8, solo dejar visible qué terreno ya está preparado para cada uno de los dos caminos planteados:

**Camino "SDC v1 profesional"** (usuarios, edición de catálogos, UX pendiente, backups, endurecimiento productivo) — tiene backlog ya identificado y priorizado, sin necesidad de una auditoría nueva desde cero:
- `DEUDA_TECNICA.md` secciones A-F (seguridad de infraestructura, Dockerfiles, backup, tests, modelo de datos, UX).
- `BLOQUE7_ROADMAP_FUNCIONAL.md`, Oleadas 2-4 (CRUD de usuarios, edición de catálogos maestros, captura de vencimientos documentales, selección masiva en Liquidaciones — los ítems marcados "Muy Alto" impacto que Bloque 7 no tocó).
- La deuda de procedimiento de la sección 7 de este acta (gestión de acceso administrativo).

**Camino "SDC v2 avanzada"** (insights automáticos, simulaciones, predicción, IA) — **no tiene ningún backlog preparado hoy.** Ningún documento existente (incluida toda la serie 7.2) diseñó ese territorio — `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` declara el dominio "Inteligencia Predictiva" como uno de los 7 dominios analíticos, pero explícitamente "no diseñado, sin cambios" en cada revisión posterior. Elegir este camino implicaría empezar un ciclo de auditoría conceptual nuevo, no una extensión directa de lo ya construido.

**No se decide ningún camino en este documento — queda para la próxima conversación de alcance con el Product Owner, como pidió explícitamente.**

---

**Bloque 7 queda formalmente cerrado.** No se implementó ningún cambio de código para producir esta acta — es un documento de consolidación, sin commit ni push todavía (a la espera de instrucción explícita).

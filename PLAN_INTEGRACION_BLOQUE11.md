# Plan de Integración — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-25. Etapa exclusivamente de verificación. **No integra, no ejecuta `git add`, no ejecuta `commit`, no ejecuta `push`.** No reabre ningún hallazgo, no modifica código ni tests, no genera documentación técnica nueva del Bloque 11.

## Análisis del repositorio ejecutado

```
$ git status --short | wc -l → 57  (10 modificados, 47 sin rastrear)
$ git diff --stat → 9 files changed, 5930 insertions(+), 2466 deletions(-)
$ git diff --name-only → 9 archivos (los mismos 9 de --stat; frontend/railway.json
  aparece MODIFICADO en git status pero NO aparece en git diff — ver Riesgos, ítem 3)
```

## 1. Inventario de archivos

**A) Cambios productivos/tests propios del Bloque 11 (14 archivos):**

| Archivo | Pertenece a B11 | Hallazgo | Estado |
|---|---|---|---|
| `backend/package.json` | Sí | H-04 + H-07 (secciones distintas) | Modificado |
| `backend/package-lock.json` | Sí | H-04 + H-07 (derivado del anterior) | Modificado |
| `backend/src/auth/auth.controller.ts` | Sí | H-07 | Modificado |
| `backend/src/auth/auth.module.ts` | Sí | H-07 | Modificado |
| `backend/src/main.ts` | Sí | H-07 (`trust proxy`) | Modificado |
| `backend/src/catalogos/choferes.controller.ts` | Sí | H-01 | Modificado |
| `backend/src/catalogos/transportistas.controller.ts` | Sí | H-01 | Modificado |
| `backend/src/catalogos/clientes.controller.ts` | Sí | H-01 + H-08 (métodos distintos) | Modificado |
| `backend/src/prisma/organizacion-prisma.client.ts` | Sí | H-02 | Modificado |
| `backend/src/common/encontrar-o-fallar.ts` | Sí | H-01 | Nuevo |
| `backend/src/common/encontrar-o-fallar.spec.ts` | Sí | H-01 | Nuevo |
| `backend/src/prisma/modelos-aislamiento-manual.ts` | Sí | H-04 | Nuevo |
| `backend/src/prisma/organizacional-models.spec.ts` | Sí | H-04 | Nuevo |
| `backend/src/prisma/organizacion-prisma.client.spec.ts` | Sí | H-02 | Nuevo |

Justificación: cada archivo coincide exactamente con la "Lista de archivos" ya cerrada en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`/`PRE_IMPLEMENTACION_BLOQUE11.md` §5 y con los archivos citados en cada cierre formal individual — sin ningún archivo productivo adicional no previsto.

**B) Documentación propia del Bloque 11 (31 documentos, categoría C — no productivos):** auditoría (3), diseño/decisiones (5), la cadena completa de H-02 (17, incluidas las etapas bloqueadas V1/V2, investigaciones y la enmienda), implementación/revisión/validación de la primera pasada (3), cierres individuales (4), estado y cierre global (2) — el listado completo, agrupado por categoría, ya está en `CIERRE_GLOBAL_BLOQUE11.md` §9; no se repite acá.

**C) Cambios ajenos al Bloque 11 (12 archivos):**

| Archivo | Motivo |
|---|---|
| `frontend/railway.json` | Modificado según `git status`, pero sin ninguna diferencia de contenido real (`git diff`/`git diff --raw` vacíos, mismo blob hash indexado) — ver Riesgos, ítem 3 |
| `AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` | Bloque 10.3, anterior |
| `AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` | Bloque 10.3b, anterior |
| `AUDITORIA_BLOQUE10.4_FRONTEND.md` | Bloque 10.4, anterior |
| `DECISIONES_TECNICAS_BLOQUE10.3.md` | Bloque 10.3, anterior |
| `DECISIONES_TECNICAS_BLOQUE10.3b.md` | Bloque 10.3b, anterior |
| `DECISIONES_TECNICAS_BLOQUE10.4.md` | Bloque 10.4, anterior |
| `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` | Bloque 10.3, anterior |
| `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` | Bloque 10.3b, anterior |
| `DISENO_BLOQUE10.4_FRONTEND.md` | Bloque 10.4, anterior |
| `PLAN_PROXIMA_ETAPA.md` | Documento de planificación previo a la apertura de Bloque 11 (es su fuente, no su producto) |
| `docs/validaciones/` (`bloque10.6_screenshots`) | Evidencia de Bloque 10.6, anterior |

## 2. Consistencia

- Todos los archivos productivos citados en los 4 cierres individuales existen en el árbol de trabajo (verificado por listado directo de `backend/src/common/` y `backend/src/prisma/`).
- Todos los tests citados existen (`encontrar-o-fallar.spec.ts`, `organizacional-models.spec.ts`, `organizacion-prisma.client.spec.ts`) — ninguno faltante.
- No falta ningún archivo esperado según la "Lista de archivos" de `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`/`PRE_IMPLEMENTACION_BLOQUE11.md`.
- No se detectaron archivos huérfanos del Bloque 11 (scripts temporales, restos de implementaciones bloqueadas de H-02 V1/V2) — confirmado por listado directo de `backend/src/prisma/`, que solo contiene los archivos finales esperados.
- No falta ningún documento de cierre: los 4 individuales, el estado del bloque y el cierre global están presentes y fueron confirmados en la etapa anterior.

## 3. Propuesta de commits (no ejecutada)

**Recomendación: B) Un commit por hallazgo.**

Justificación técnica: esta estrategia no es una preferencia nueva de esta etapa — es la decisión **ya cerrada** en `DISEÑO_BLOQUE11_SEGURIDAD.md` §6 ("cada hallazgo se implementa, valida y se somete a commit... de forma independiente, no en un único commit conjunto: son cinco cambios sin dependencias técnicas entre sí, así que agruparlos en un solo commit solo aumentaría el radio de un eventual rollback sin ningún beneficio real") y ratificada en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` con la estrategia de rollback definida por hallazgo. Se descarta A (un único commit) por contradecir esa decisión ya aprobada. Se descarta C (productivo/tests/documentación como tres commits transversales) porque separaría la evidencia de cada hallazgo de su propio código, dificultando la trazabilidad que toda esta cadena documental construyó precisamente para evitar eso.

**Orden recomendado (ya fijado en `PRE_IMPLEMENTACION_BLOQUE11.md` §4):** H-08 → H-07 → H-04 → H-01 → H-02.

**Manejo de los 2 archivos compartidos:** `package.json`/`package-lock.json` (H-04 y H-07 tocan secciones distintas del mismo archivo) y `clientes.controller.ts` (H-01 y H-08 tocan métodos distintos, `findOne` vs `cuentaCorriente`) requieren staging parcial (`git add -p`) para respetar el commit-por-hallazgo sin mezclar cambios de dos hallazgos en el mismo commit — ambos casos ya fueron confirmados sin conflicto de contenido en `PRE_IMPLEMENTACION_BLOQUE11.md` §6.

**Documentación:** los documentos específicos de cada hallazgo (incluida toda la cadena de H-02) acompañan al commit de ese hallazgo; los documentos transversales del bloque (auditoría original, diseño, decisiones técnicas, pre-implementación, revisión de implementación, validación funcional, estado del bloque, cierre global) se recomiendan en un commit de cierre final, posterior a los 5 commits de hallazgo.

## 4. Riesgos de integración

| # | Riesgo | Clasificación |
|---|---|---|
| 1 | `package.json`/`package-lock.json` y `clientes.controller.ts` mezclan cambios de 2 hallazgos cada uno — requieren `git add -p` en vez de `git add <archivo>` si se sigue la estrategia B | **IMPORTANTE** |
| 2 | 12 archivos ajenos al Bloque 11 conviven sin rastrear en el mismo árbol de trabajo — riesgo real de inclusión accidental si se usa `git add -A`/`git add .` en cualquier commit de esta integración | **IMPORTANTE** |
| 3 | `frontend/railway.json` figura como modificado en `git status` pero sin ninguna diferencia de contenido real (`git diff` vacío) — anomalía no explicada, no atribuible a ningún hallazgo de Bloque 11, no debe incluirse en ningún commit de esta integración hasta investigarse por separado | **MENOR** |
| 4 | `package-lock.json` con 8246 líneas de diff (regeneración completa por las 4 dependencias nuevas de H-04/H-07) — tamaño esperado para un lockfile, sin riesgo de contenido | **MENOR** |
| 5 | Cambios de frontend | **SIN HALLAZGOS** — ningún archivo de `frontend/src` modificado; `railway.json` sin diff real (ítem 3) |
| 6 | Archivos temporales u olvidados | **SIN HALLAZGOS** — sin restos de scripts temporales ni de implementaciones bloqueadas de H-02 (V1/V2), confirmado por listado directo |
| 7 | Configuraciones fuera de alcance (schema, migraciones, CI) | **SIN HALLAZGOS** — ninguna tocada |
| 8 | Conflictos potenciales entre hallazgos (más allá de los archivos compartidos del ítem 1) | **SIN HALLAZGOS** — confirmado sin conflictos en `PRE_IMPLEMENTACION_BLOQUE11.md` §6 |

Ningún riesgo clasificado como **CRÍTICO**.

## 5. Checklist final

- [x] Documentación completa (auditoría, diseño, decisiones, pre-implementación, implementación, revisión, validación, 4 cierres individuales, estado, cierre global)
- [x] Código consistente con lo aprobado en cada cierre
- [x] Tests presentes (3 archivos de spec, todos existentes)
- [x] Builds documentados (confirmados en cada etapa relevante)
- [x] Validaciones registradas (funcional y adversarial, por hallazgo)
- [x] Auditorías registradas (original + adversarial)
- [x] Cierres individuales presentes (H-01, H-02, H-04, H-08)
- [x] Cierre global presente
- [x] Estado del bloque consistente con los cierres individuales
- [x] Archivos identificados y clasificados (Bloque 11 vs. ajenos)
- [x] Estrategia de commits definida (B, con manejo explícito de archivos compartidos)
- [ ] Listo para integración inmediata sin intervención manual — **no**, requiere separar los cambios ajenos antes de commitear (ver Riesgos, ítems 1-3)

## 6. Recomendación final

**C) REQUIERE SEPARAR CAMBIOS AJENOS**

Justificación, exclusivamente con la evidencia observada: no hay ningún hallazgo crítico ni contenido inconsistente — los 45 archivos propios del Bloque 11 (14 productivos/tests + 31 documentos) están completos, consistentes entre sí y con los 4 cierres formales ya aprobados. Lo que impide marcar "listo para integrar" sin salvedades es que el árbol de trabajo contiene, sin rastrear y mezclados con los del Bloque 11, 12 archivos ajenos (11 de bloques anteriores — 10.3, 10.3b, 10.4, 10.6 — más `PLAN_PROXIMA_ETAPA.md`, y `frontend/railway.json` con una anomalía de estado sin diff real). Ninguno de los 12 debe entrar en ningún commit de esta integración; con `git add` explícito por archivo (nunca `git add -A`/`git add .`) el riesgo queda controlado, pero la separación debe hacerse de forma deliberada, no darse por descontada.

## Conclusión

**PLAN DE INTEGRACIÓN DEL BLOQUE 11 COMPLETADO — ESPERANDO AUTORIZACIÓN PARA INTEGRAR**

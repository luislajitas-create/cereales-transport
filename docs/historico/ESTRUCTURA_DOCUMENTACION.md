# Estructura de documentación — propuesta final

Fecha: 2026-07-09. Propone dónde debería vivir cada documento que el proyecto ya genera y va a seguir generando, siguiendo el flujo de `METODOLOGIA_SDC.md`. **No se movió ningún archivo** — es una propuesta a aprobar antes de reorganizar nada.

---

## Por qué reorganizar

Hoy los ~28 documentos de proceso del proyecto viven sueltos en la raíz del repositorio, mezclados con el código y con la configuración (`Dockerfile`, `railway.json`, `package.json`). Funciona mientras el número de documentos es manejable, pero ya cuesta distinguir a simple vista un documento vigente (`DEUDA_TECNICA.md`) de uno de una etapa completamente superada del proyecto (`DIAGNOSTICO_Y_SOLUCION.md`, de la fase de estabilización de despliegue previa al Bloque 3). La estructura propuesta separa por **tipo de documento**, que es el eje por el que este proyecto ya los distingue en la práctica (auditoría vs. diseño vs. cierre son categorías que la metodología ya usa) — no por bloque ni por fecha, que cambian todo el tiempo.

## Estructura propuesta

```
docs/
  metodologia/
  roadmap/
  auditorias/
  disenos/
  qa/
  cierres/
  deuda-tecnica/
  historico/
```

## Qué vive en cada carpeta

### `docs/metodologia/`

El "cómo trabajamos" — documentos de proceso, no de producto. Cambian poco y cuando cambian, es una decisión consciente de metodología, no un efecto secundario de un bloque.

- `METODOLOGIA_SDC.md`
- `CONVENCIONES_DESARROLLO.md`
- `CHECKLIST_PRE_PUSH.md`
- `ESTRUCTURA_DOCUMENTACION.md` (este mismo documento)

### `docs/roadmap/`

El "qué sigue" — un único documento vigente por vez, no uno por bloque. Cuando se actualiza el roadmap (como en el cierre de Bloque 5.1-5.3.2), el documento anterior no se borra: se mueve a `docs/historico/` con un sufijo de fecha, y el nuevo pasa a ser el único `ROADMAP.md` sin sufijo en esta carpeta — así siempre hay un solo lugar donde mirar "qué es lo próximo", sin tener que decidir entre versiones.

- `ROADMAP.md` (el vigente — hoy sería el contenido de `ROADMAP_ACTUALIZADO.md`)

### `docs/auditorias/`

Documentos de diagnóstico puro (etapa 1 de la metodología) — no proponen solución, solo documentan el problema con evidencia verificable. Se nombran por lo que auditan, no por el bloque (un mismo documento de auditoría puede anteceder a más de un sub-bloque de diseño, como pasó con `BLOQUE5_AUDITORIA_PRODUCTO.md`, que dio origen a 5.1, 5.2 y 5.3).

- Ejemplos ya existentes: `BLOQUE5_AUDITORIA_PRODUCTO.md`, `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md`, `BLOQUE5.3_AUDITORIA_UX.md`, `BLOQUE5.3.2_AUDITORIA_PLANILLA_LIQUIDACION.md`, `BACKEND_REVIEW.md`.

### `docs/disenos/`

Documentos de diseño técnico (etapa 2) — la solución propuesta a un hallazgo de auditoría, con alternativas, migraciones, riesgos y plan de pruebas. Es la carpeta más numerosa hoy y la que más va a seguir creciendo.

- Ejemplos ya existentes: todos los `BLOQUE*_DISENO_*.md` (3, 3.2, 3.3, 4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.2.b, 5.3, 5.3.1, 5.3.2).

### `docs/qa/`

Auditorías funcionales de alcance amplio (módulo por módulo, contra un ambiente real), distintas de las auditorías puntuales de `docs/auditorias/` por su alcance transversal y su cadencia — no acompañan a un sub-bloque específico, se hacen en puntos de control del proyecto (después de un cluster de bloques, antes de decidir la siguiente prioridad grande).

- Ejemplos ya existentes: `QA_FINDINGS.md`, `QA_INFORME_FINAL.md`.

### `docs/cierres/`

Documentos de la etapa 9 — qué se hizo, qué se validó, qué quedó pendiente. Incluye tanto los cierres de un sub-bloque puntual como los cierres de proyecto más amplios (como el de Bloque 5.1-5.3.2).

- Ejemplos ya existentes: `BLOQUE5_ESTADO_ACTUAL.md`, `PROJECT_STATUS.md` (el más viejo de los dos, ya parcialmente superado — ver `docs/historico/`).

### `docs/deuda-tecnica/`

Un único documento vigente, igual que el roadmap — no uno por bloque. Se actualiza en cada cierre grande, nunca se duplica.

- `DEUDA_TECNICA.md` (el consolidado — reemplaza la necesidad de rastrear deuda mencionada suelta dentro de cada diseño/auditoría).

### `docs/historico/`

Documentos que ya cumplieron su función y fueron reemplazados por uno más nuevo, pero que se conservan por su valor de contexto histórico (por qué se tomó una decisión, qué problema existía en un momento dado). No se borra nada — se archiva.

- Candidatos ya identificables hoy: `DIAGNOSTICO_Y_SOLUCION.md`, `IMPLEMENTATION_STATUS.md` (ambos de la fase de estabilización de despliegue anterior al Bloque 3, ya sin vigencia práctica), `ROADMAP_SDC_V1.md` (roadmap de infraestructura pre-Bloque-5, absorbido y superado por `BLOQUE5_AUDITORIA_PRODUCTO.md`/`ROADMAP_BLOQUE5.md`), `ROADMAP_BLOQUE5.md` (versión anterior del roadmap, una vez que `ROADMAP_ACTUALIZADO.md` pase a ser el `ROADMAP.md` vigente), `PROJECT_STATUS.md` (una vez que su contenido relevante de producción esté reflejado en el cierre vigente).

## Qué queda fuera de `docs/` — y por qué

- **`README.md`** — queda en la raíz. Es la puerta de entrada al repositorio para cualquiera que no conozca todavía la metodología; moverlo a `docs/` lo haría menos descubrible, no más ordenado. (Nota aparte, ya señalada en `DEUDA_TECNICA.md`: su contenido está desactualizado — describe una estructura `app/backend`/`app/frontend` que ya no existe. Corregirlo es trabajo de código/contenido, no de reorganización, y no es parte de esta propuesta.)
- **`FUEL_MANAGEMENT_DESIGN_SUMMARY.md`** — no pertenece a ningún bloque de los documentados en `METODOLOGIA_SDC.md`; es el diseño de un módulo distinto (combustibles), explícitamente fuera de alcance de v1.0 según `ROADMAP_SDC_V1.md`. Si el módulo de combustibles se retoma alguna vez como su propio proyecto de bloques, este documento pasaría a `docs/disenos/` en ese momento — hasta entonces, se archiva junto con el resto de `docs/historico/` para no confundirlo con el trabajo activo.
- **`backend/`, `frontend/`, `Dockerfile`, `backend/Dockerfile`, `railway.json`, `docker-compose.yml`** — código y configuración, no documentación. Sin cambios.
- **Los 5 archivos `schema*.prisma` sueltos en la raíz y el directorio `app/`** — no son documentación ni código vigente; su destino correcto es la eliminación (`git rm`), ya señalada como deuda técnica en `DEUDA_TECNICA.md`, no la reorganización dentro de `docs/`.

## Convención para documentos nuevos, de acá en adelante

Cuando se cree un documento nuevo siguiendo el flujo de `METODOLOGIA_SDC.md`, va directo a la carpeta que le corresponde por tipo (no a la raíz, ni siquiera "temporalmente"):

| Se está escribiendo... | Va en... |
|---|---|
| Una auditoría de un problema puntual antes de diseñar la solución | `docs/auditorias/` |
| Un diseño técnico de un sub-bloque | `docs/disenos/` |
| Una auditoría funcional amplia, módulo por módulo | `docs/qa/` |
| El cierre de un sub-bloque o de un cluster de bloques | `docs/cierres/` |
| Una actualización del roadmap | reemplaza el `ROADMAP.md` vigente en `docs/roadmap/`; el anterior se archiva en `docs/historico/` |
| Una actualización de la deuda técnica | reemplaza el `DEUDA_TECNICA.md` vigente en `docs/deuda-tecnica/`, no se crea un archivo nuevo por bloque |
| Un cambio a la metodología, las convenciones o el checklist mismos | `docs/metodologia/` |

## Siguiente paso (no ejecutado en este documento)

Esta propuesta no reorganiza nada todavía. El siguiente paso, una vez aprobada, sería un único commit de tipo `docs:` que mueve los ~28 archivos existentes a su carpeta correspondiente (usando `git mv` para preservar el historial de cada archivo) y no toca ningún otro contenido — exactamente el tipo de cambio acotado y de bajo riesgo que la propia metodología de este documento describe.

# Preparación de Staging — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-25. Etapa exclusivamente de análisis y planificación operativa. **No ejecuta `git add`, `git reset`, `git restore`, `git commit`, `git push`, no crea ramas ni tags, no modifica ni mueve archivos.** Solo lectura (`git status`, `git diff`, `ls`) y documentación del plan exacto de staging para los 5 commits ya aprobados en `PLAN_INTEGRACION_BLOQUE11.md`.

## Estado base confirmado

```
$ git status --short | wc -l → 58  (10 modificados, 48 sin rastrear — incluye
  PLAN_INTEGRACION_BLOQUE11.md, generado en la etapa anterior)
$ git diff --stat → 9 files changed, 5930 insertions(+), 2466 deletions(-)
```

## 1. Inventario definitivo (58 elementos)

**Modificados (10):**

| Archivo | Tipo | Hallazgo | Staging | Commit destino | Observaciones |
|---|---|---|---|---|---|
| `backend/package-lock.json` | lockfile | H-04 + H-07 | archivo completo | H-04 | No se puede fragmentar por hunks sin riesgo de corromper el árbol de resolución — ver sección 5/11 |
| `backend/package.json` | configuración | H-04 + H-07 | parcial por hunks | H-07 y H-04 | 4 hunks identificados — ver secciones 3-5 |
| `backend/src/auth/auth.controller.ts` | productivo | H-07 | archivo completo | H-07 | Sin mezcla con otro hallazgo |
| `backend/src/auth/auth.module.ts` | productivo | H-07 | archivo completo | H-07 | Sin mezcla |
| `backend/src/main.ts` | productivo | H-07 | archivo completo | H-07 | Sin mezcla (`trust proxy`) |
| `backend/src/catalogos/clientes.controller.ts` | productivo | H-01 + H-08 | parcial por hunks | H-08 y H-01 | 3 hunks identificados — ver sección 3/6 |
| `backend/src/catalogos/choferes.controller.ts` | productivo | H-01 | archivo completo | H-01 | Sin mezcla |
| `backend/src/catalogos/transportistas.controller.ts` | productivo | H-01 | archivo completo | H-01 | Sin mezcla |
| `backend/src/prisma/organizacion-prisma.client.ts` | productivo | H-02 | archivo completo | H-02 | Sin mezcla — diff final único, sin restos de V1/V2 |
| `frontend/railway.json` | ajeno | — | **excluir** | ninguno | Modificado según `git status` pero sin diferencia de contenido real (`git diff` vacío, mismo blob indexado) — anomalía ya señalada en `PLAN_INTEGRACION_BLOQUE11.md` |

**Sin rastrear — código y tests del Bloque 11 (5):**

| Archivo | Tipo | Hallazgo | Staging | Commit destino |
|---|---|---|---|---|
| `backend/src/common/encontrar-o-fallar.ts` | productivo | H-01 | completo | H-01 |
| `backend/src/common/encontrar-o-fallar.spec.ts` | test | H-01 | completo | H-01 |
| `backend/src/prisma/modelos-aislamiento-manual.ts` | productivo | H-04 | completo | H-04 |
| `backend/src/prisma/organizacional-models.spec.ts` | test | H-04 | completo | H-04 |
| `backend/src/prisma/organizacion-prisma.client.spec.ts` | test | H-02 | completo | H-02 |

**Sin rastrear — documentación específica de hallazgo (20):**

| Archivo | Hallazgo | Commit destino |
|---|---|---|
| `CIERRE_FORMAL_H01_BLOQUE11.md` | H-01 | H-01 |
| `CIERRE_FORMAL_H02_BLOQUE11.md`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, `"DISEÑO_CORRECCION_H02_BLOQUE11.md"`, `"DISEÑO_CORRECCION_H02_BLOQUE11_V2.md"`, `ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`, `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`, `INVESTIGACION_H02_PROTO_SETTER.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`, `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`, `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md` (17 documentos) | H-02 | H-02 — ver sección 7 sobre históricos vs. esenciales |
| `CIERRE_FORMAL_H04_BLOQUE11.md` | H-04 | H-04 |
| `CIERRE_FORMAL_H08_BLOQUE11.md` | H-08 | H-08 |

**Sin rastrear — documentación transversal del Bloque 11 (13):**

`AUDITORIA_BLOQUE11_SEGURIDAD.md`, `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, `"DISEÑO_BLOQUE11_SEGURIDAD.md"`, `PRE_IMPLEMENTACION_BLOQUE11.md`, `REVISION_IMPLEMENTACION_BLOQUE11.md`, `VALIDACION_FUNCIONAL_BLOQUE11.md`, `ESTADO_BLOQUE11.md`, `CIERRE_GLOBAL_BLOQUE11.md`, `PLAN_INTEGRACION_BLOQUE11.md`, `PREPARACION_STAGING_BLOQUE11.md` (este documento) — **Commit destino: 6º commit documental** — ver sección 8.

**Sin rastrear — ajenos al Bloque 11 (11, a excluir):** `AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, `AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md`, `AUDITORIA_BLOQUE10.4_FRONTEND.md`, `DECISIONES_TECNICAS_BLOQUE10.3.md`, `DECISIONES_TECNICAS_BLOQUE10.3b.md`, `DECISIONES_TECNICAS_BLOQUE10.4.md`, `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md`, `DISENO_BLOQUE10.4_FRONTEND.md`, `PLAN_PROXIMA_ETAPA.md`, `docs/validaciones/` — ver sección 2.

Total: 10 modificados + 47 sin rastrear = 57 + este documento (aún no existía al iniciar la etapa) = **58**.

## 2. Archivos ajenos (12, incluido `frontend/railway.json`)

| Ruta | Pertenece a | Motivo de exclusión | Confirmación |
|---|---|---|---|
| `frontend/railway.json` | Ninguno (anomalía) | Modificado en `git status` sin diferencia de contenido real | **No debe entrar en ningún commit** de esta integración |
| `AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` | Bloque 10.3 | Trabajo anterior no commiteado | Excluir |
| `AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` | Bloque 10.3b | Trabajo anterior no commiteado | Excluir |
| `AUDITORIA_BLOQUE10.4_FRONTEND.md` | Bloque 10.4 | Trabajo anterior no commiteado | Excluir |
| `DECISIONES_TECNICAS_BLOQUE10.3.md` | Bloque 10.3 | Trabajo anterior no commiteado | Excluir |
| `DECISIONES_TECNICAS_BLOQUE10.3b.md` | Bloque 10.3b | Trabajo anterior no commiteado | Excluir |
| `DECISIONES_TECNICAS_BLOQUE10.4.md` | Bloque 10.4 | Trabajo anterior no commiteado | Excluir |
| `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` | Bloque 10.3 | Trabajo anterior no commiteado | Excluir |
| `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` | Bloque 10.3b | Trabajo anterior no commiteado | Excluir |
| `DISENO_BLOQUE10.4_FRONTEND.md` | Bloque 10.4 | Trabajo anterior no commiteado | Excluir |
| `PLAN_PROXIMA_ETAPA.md` | Previo a Bloque 11 | Es la fuente que propuso abrir Bloque 11, no su producto | Excluir |
| `docs/validaciones/bloque10.6_screenshots` | Bloque 10.6 | Evidencia anterior no commiteada | Excluir |

Ninguno de estos 12 fue ni será alterado en esta etapa. Ninguno debe recibir `git add` en ninguno de los 6 commits propuestos.

## 3. Análisis de hunks — `clientes.controller.ts`

`git diff --unified=3 -- backend/src/catalogos/clientes.controller.ts` muestra exactamente 3 hunks:

| # | Función | Cambio | Líneas aprox. | Pertenece a |
|---|---|---|---|---|
| 1 | (imports, línea 10) | `+ import { encontrarOFallar } from "../common/encontrar-o-fallar";` | 1 línea agregada | **H-01** — el `import` solo se usa en `findOne` |
| 2 | `findOne()` | `return this.prisma.cliente.findUnique(...)` → `async` + `const cliente = await ...` + `return encontrarOFallar(cliente, "Cliente no encontrado.")` | 3 líneas modificadas/agregadas | **H-01** |
| 3 | `cuentaCorriente()` | Comentario nuevo (3 líneas) + `where: { clienteId: id }` → `where: { clienteId: id, estado: { not: "ANULADO" } }` | 4 líneas agregadas/modificadas | **H-08** |

Criterio de pertenencia: cada hunk se asigna por la función que modifica, coincidiendo exactamente con lo ya documentado en `CIERRE_FORMAL_H01_BLOQUE11.md` (`findOne`) y `CIERRE_FORMAL_H08_BLOQUE11.md` (`cuentaCorriente`) — sin superposición entre ambos.

## 4. Análisis de hunks — `package.json`

`git diff --unified=2 -- backend/package.json` muestra exactamente 4 hunks:

| # | Contenido | Pertenece a |
|---|---|---|
| 1 | `+ "test": "jest",` (script) | **H-04** |
| 2 | `+ "@nestjs/throttler": "^5.2.0",` (dependencies) | **H-07** |
| 3 | `+ "jest"`, `+ "ts-jest"`, `+ "@types/jest"` (devDependencies) | **H-04** |
| 4 | `+ "jest": { moduleFileExtensions, rootDir, testRegex, transform }` (bloque de configuración embebida) | **H-04** |

Criterio de pertenencia: coincide exactamente con `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (H-04, punto 2-3; H-07, punto 1).

## 5. `package-lock.json` — tratamiento especial (no hunks)

`package-lock.json` es un artefacto generado por `npm install`, no editado a mano — sus 8246 líneas de diff no tienen una frontera semántica limpia por hallazgo (metadata de resolución, hashes de integridad y árbol de dependencias transitivas están entrelazados). Fragmentarlo con `git add -p` arriesga producir un lockfile inconsistente con `package.json` en el commit intermedio (`npm ci` fallaría si se revisara exactamente ese commit). No se dispone de un lockfile intermedio real (el `npm install` ya se ejecutó una sola vez, con las 4 dependencias nuevas juntas) y regenerar uno ahora sería ejecutar una implementación, fuera del alcance de esta etapa.

**Recomendación:** commitear `package-lock.json` completo junto con **H-04** (el segundo de los dos commits que tocan dependencias, según el orden ya aprobado H-08→H-07→H-04→H-01→H-02). Esto deja una inconsistencia transitoria real pero de bajo riesgo: entre el commit de H-07 y el de H-04, `package.json` declara `@nestjs/throttler` sin que el lockfile lo refleje todavía. Como todo el historial es local y no fue empujado (`push`) en ningún momento, nadie más puede clonar ni hacer `npm ci` sobre ese estado intermedio — el riesgo es teórico, no operativo. Ver sección 11, riesgo 2.

## 6. Commit 1 — H-08

**Mensaje propuesto:** `fix(bloque11): excluir facturas ANULADO del cálculo de cuenta corriente`

**Contenido:**
- `backend/src/catalogos/clientes.controller.ts` — únicamente el hunk 3 (`cuentaCorriente()`) de la sección 3, vía `git add -p`.
- `CIERRE_FORMAL_H08_BLOQUE11.md`.

No incluye archivos ajenos ni hunks de `findOne()`.

## 7. Commit 2 — H-07

**Mensaje propuesto:** `fix(bloque11): rate-limiting de login con @nestjs/throttler`

**Contenido:**
- `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.module.ts`, `backend/src/main.ts` — completos.
- `backend/package.json` — únicamente el hunk 2 (`@nestjs/throttler`) de la sección 4, vía `git add -p`.

**Aclaración expresa:** H-07 permanece **BLOQUEADO** por dependencia externa de Railway (confirmación pendiente de soporte oficial sobre `X-Forwarded-For`). Incluir su implementación local en este commit **no cierra H-07** — el mecanismo de rate-limiting queda operativo para el caso feliz, pero el bypass adversarial ya documentado (`AUDITORIA_ADVERSARIAL_BLOQUE11.md` §3) sigue sin resolución. No declarar H-07 cerrado en el mensaje de commit ni en ningún documento de esta etapa. No existe un `CIERRE_FORMAL_H07_BLOQUE11.md` — no corresponde generarlo.

## 8. Commit 3 — H-04

**Mensaje propuesto:** `test(bloque11): red de seguridad automática para ORGANIZACIONAL_MODELS`

**Contenido:**
- `backend/src/prisma/modelos-aislamiento-manual.ts`, `backend/src/prisma/organizacional-models.spec.ts` — completos.
- `backend/package.json` — hunks 1, 3 y 4 de la sección 4 (script `test`, devDependencies de Jest, bloque de configuración), vía `git add -p`.
- `backend/package-lock.json` — completo (ver sección 5).
- `CIERRE_FORMAL_H04_BLOQUE11.md`.

Separación de H-04 frente a H-07 en `package.json`: confirmada sin ambigüedad — cada hunk toca una clave distinta (`test`/`devDependencies`/`jest` vs. `dependencies.@nestjs/throttler`), sin ninguna línea compartida entre ambos hallazgos.

## 9. Commit 4 — H-01

**Mensaje propuesto:** `fix(bloque11): respuestas 404 reutilizables en findOne de catálogos`

**Contenido:**
- `backend/src/catalogos/clientes.controller.ts` — hunks 1 y 2 (`import` + `findOne()`) de la sección 3, vía `git add -p`.
- `backend/src/catalogos/choferes.controller.ts`, `backend/src/catalogos/transportistas.controller.ts` — completos.
- `backend/src/common/encontrar-o-fallar.ts`, `backend/src/common/encontrar-o-fallar.spec.ts` — completos.
- `CIERRE_FORMAL_H01_BLOQUE11.md`.

Separación de H-01 frente a H-08 ya resuelta en la sección 3 — sin ambigüedad, funciones distintas del mismo archivo.

## 10. Commit 5 — H-02

**Mensaje propuesto:** `fix(bloque11): harden Prisma proxy against raw method bypasses`

**Contenido:**
- `backend/src/prisma/organizacion-prisma.client.ts`, `backend/src/prisma/organizacion-prisma.client.spec.ts` — completos.
- `CIERRE_FORMAL_H02_BLOQUE11.md` y los 17 documentos históricos/de trazabilidad de H-02 listados en la sección 1.

**Documentos esenciales para comprender la implementación final:** `"DISEÑO_CORRECCION_H02_BLOQUE11_V2.md"`, `ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`, `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`, `CIERRE_FORMAL_H02_BLOQUE11.md`.

**Documentos históricos de intentos bloqueados (V1, V2 sin enmendar, e investigaciones):** `"DISEÑO_CORRECCION_H02_BLOQUE11.md"`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `INVESTIGACION_H02_PROTO_SETTER.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`, `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`, `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md`.

**Recomendación: incluir los 17 en el mismo commit de H-02, sin separarlos en uno documental posterior.** Justificación (no es una desviación de la base "un commit por hallazgo" — es la misma base): estos 17 documentos son, junto con el código, la evidencia íntegra de cómo se llegó a la solución final de H-02 — separarlos rompería la trazabilidad que toda esta cadena documental construyó deliberadamente. El código de H-02 nunca contuvo commits intermedios de V1/V2 (ambos se revirtieron por completo antes de cualquier integración), así que no hay ningún commit de código bloqueado que estos documentos deban acompañar por separado — todos narran, desde el mismo commit final, cómo se descartaron los intentos anteriores.

## 11. Documentación global (13 documentos transversales)

Opciones evaluadas: (A) incluirlos con H-02 por ser el último commit de hallazgo — descartado, mezclaría documentación transversal del bloque completo con la evidencia específica de un único hallazgo, degradando la trazabilidad por-hallazgo ya lograda en los 5 commits anteriores. (C) no integrarlos todavía — descartado, dejaría sin commitear documentación ya aprobada y cerrada (`ESTADO_BLOQUE11.md`, `CIERRE_GLOBAL_BLOQUE11.md`) sin ningún motivo pendiente.

**Recomendación: B) crear un sexto commit exclusivamente documental**, posterior a los 5 de hallazgo. Mensaje propuesto: `docs(bloque11): auditoría, diseño, validación y cierre global del Bloque 11`. Contenido: los 13 documentos listados en la sección 1 (auditoría, diseño, decisiones técnicas, pre-implementación, revisión de implementación, validación funcional, estado del bloque, cierre global, plan de integración, y este documento de preparación de staging).

## 12. Secuencia operativa propuesta (no ejecutada)

```
# Commit 1 — H-08
git add backend/src/catalogos/clientes.controller.ts -p   # "y" solo al hunk de cuentaCorriente(); "n" al de findOne()/import
git add CIERRE_FORMAL_H08_BLOQUE11.md
git diff --cached --stat
git diff --cached
git commit -m "fix(bloque11): excluir facturas ANULADO del cálculo de cuenta corriente"

# Commit 2 — H-07
git add backend/src/auth/auth.controller.ts backend/src/auth/auth.module.ts backend/src/main.ts
git add backend/package.json -p   # "y" solo al hunk de "@nestjs/throttler"; "n" a los otros 3
git diff --cached --stat
git diff --cached
git commit -m "fix(bloque11): rate-limiting de login con @nestjs/throttler"

# Commit 3 — H-04
git add backend/src/prisma/modelos-aislamiento-manual.ts backend/src/prisma/organizacional-models.spec.ts
git add backend/package.json -p   # "y" a los 3 hunks restantes (test/devDependencies/jest config)
git add backend/package-lock.json
git add CIERRE_FORMAL_H04_BLOQUE11.md
git diff --cached --stat
git diff --cached
git commit -m "test(bloque11): red de seguridad automática para ORGANIZACIONAL_MODELS"

# Commit 4 — H-01
git add backend/src/catalogos/clientes.controller.ts -p   # "y" a import + findOne(); ya no queda ningún hunk de cuentaCorriente()
git add backend/src/catalogos/choferes.controller.ts backend/src/catalogos/transportistas.controller.ts
git add backend/src/common/encontrar-o-fallar.ts backend/src/common/encontrar-o-fallar.spec.ts
git add CIERRE_FORMAL_H01_BLOQUE11.md
git diff --cached --stat
git diff --cached
git commit -m "fix(bloque11): respuestas 404 reutilizables en findOne de catálogos"

# Commit 5 — H-02
git add backend/src/prisma/organizacion-prisma.client.ts backend/src/prisma/organizacion-prisma.client.spec.ts
git add CIERRE_FORMAL_H02_BLOQUE11.md   # + los 16 documentos restantes de H-02, listados uno por uno
git diff --cached --stat
git diff --cached
git commit -m "fix(bloque11): harden Prisma proxy against raw method bypasses"

# Commit 6 — documentación transversal
git add AUDITORIA_BLOQUE11_SEGURIDAD.md AUDITORIA_ADVERSARIAL_BLOQUE11.md   # + los 11 documentos restantes de la sección 11
git diff --cached --stat
git commit -m "docs(bloque11): auditoría, diseño, validación y cierre global del Bloque 11"
```

Ninguno de estos comandos se ejecutó en esta etapa.

## 13. Guía de respuestas para `git add -p`

Para `clientes.controller.ts` (2 pasadas, una en el commit de H-08 y otra en el de H-01): cada hunk debe evaluarse por su contenido semántico, no por número de hunk (puede reordenarse entre corridas). El hunk que modifica el `where` de `this.prisma.factura.findMany` dentro de `cuentaCorriente()` → `y` en el commit de H-08, `n` en el de H-01. Los hunks que agregan el `import` de `encontrarOFallar` y que modifican `findOne()` → `n` en el commit de H-08, `y` en el de H-01.

Para `package.json` (2 pasadas, H-07 y H-04): el hunk que agrega `"@nestjs/throttler"` dentro de `dependencies` → `y` en el commit de H-07, `n` en el de H-04. Los 3 hunks restantes (script `"test"`, bloque `devDependencies` con `jest`/`ts-jest`/`@types/jest`, bloque de configuración `"jest": {...}`) → `n` en el commit de H-07, `y` en el de H-04.

Si algún hunk propuesto por Git agrupara líneas de dos funciones/secciones distintas en un mismo bloque (no ocurrió en ninguno de los 7 hunks analizados, todos ya coinciden exactamente con la frontera de un solo hallazgo), la respuesta correcta sería `s` (split) para dividirlo antes de decidir `y`/`n` línea por línea — no aplica en este caso, mencionado por completitud.

## 14. Verificación por commit (checklist y comandos)

Antes de cada `git commit` de los 6 propuestos:

- [ ] `git diff --cached --name-only` — solo contiene los archivos listados para ese commit, ninguno de los 12 ajenos.
- [ ] `git diff --cached` — revisar íntegro; para los 2 archivos con staging parcial, confirmar que no aparece ningún hunk del otro hallazgo.
- [ ] `git status --short` (fuera del índice) — confirmar que lo que queda sin stagear es exactamente lo esperado para los commits siguientes.
- [ ] Build esperado: `npm run build` en `backend/` — debe compilar en cada uno de los 5 puntos intermedios (cada commit de hallazgo, individualmente, debe dejar el árbol en estado compilable — confirmado ya en `REVISION_IMPLEMENTACION_BLOQUE11.md` que cada hallazgo es independiente sin dependencia técnica entre sí, salvo el orden ya fijado H-08→H-07→H-04→H-01→H-02).
- [ ] Tests esperados: `npm run test` en `backend/` — desde el commit de H-04 en adelante, la suite debe estar disponible y en verde; antes de H-04 (commits de H-08 y H-07), el comando `test` todavía no existe en `package.json`, por lo que no aplica.
- [ ] Documentación incluida: coincide exactamente con lo listado en la sección de ese commit (6-11).
- [ ] Mensaje de commit: coincide con el propuesto, sin declarar cerrado ningún hallazgo que no lo esté (H-07).
- [ ] `git diff --cached` revisado línea por línea antes de confirmar, no solo el `--stat`.

## 15. Riesgos de staging

| # | Riesgo | Clasificación |
|---|---|---|
| 1 | Selección incorrecta de hunks en `clientes.controller.ts` o `package.json` durante `git add -p` (marcar `y` donde correspondía `n`) | **IMPORTANTE** — mitigado por la guía semántica de la sección 13 y la verificación de la sección 14 |
| 2 | `package-lock.json` no puede fragmentarse — se commitea completo con H-04, dejando una inconsistencia transitoria entre los commits de H-07 y H-04 (`package.json` con `@nestjs/throttler` sin reflejo en el lockfile) | **IMPORTANTE**, pero de bajo riesgo operativo real — historial 100% local, sin `push` |
| 3 | Inclusión accidental de alguno de los 12 archivos ajenos si se usa `git add -A`/`git add .` en vez de rutas explícitas | **IMPORTANTE** — mitigado por la secuencia de comandos de la sección 12, que usa exclusivamente rutas explícitas |
| 4 | Inclusión accidental de `frontend/railway.json` (aparece en `git status` aunque sin diff real) | **MENOR** — no aparece en ningún `git add` de la secuencia propuesta |
| 5 | Documentación cruzada: algún documento de H-02 mal clasificado como transversal, o viceversa | **MENOR** — los 17 documentos de H-02 y los 13 transversales fueron clasificados uno por uno en la sección 1, sin ambigüedad de nombre |
| 6 | Commits intermedios que dejen el repositorio sin compilar | **SIN HALLAZGO** — cada uno de los 5 commits de hallazgo es autocontenido según `REVISION_IMPLEMENTACION_BLOQUE11.md`; la única dependencia de orden (H-04 antes de H-01, para que exista `encontrar-o-fallar.spec.ts` corriendo con Jest ya configurado) ya está reflejada en el orden aprobado |
| 7 | Dependencia real entre H-04 y H-07 más allá de `package.json`/`package-lock.json` | **SIN HALLAZGO** — confirmado en `PRE_IMPLEMENTACION_BLOQUE11.md` §6, sin conflicto de código entre ambos |

Ningún riesgo **CRÍTICO**.

## 16. Criterios para autorizar staging

| Criterio | Estado |
|---|---|
| Los 58 elementos de `git status` están inventariados y clasificados | CUMPLIDO |
| Los 12 archivos ajenos están identificados con motivo de exclusión | CUMPLIDO |
| `clientes.controller.ts` tiene sus 3 hunks separados sin ambigüedad | CUMPLIDO |
| `package.json` tiene sus 4 hunks separados sin ambigüedad | CUMPLIDO |
| `package-lock.json` tiene un tratamiento definido (no fragmentable) | CUMPLIDO |
| Los 6 commits tienen contenido y mensaje propuestos | CUMPLIDO |
| Existe una secuencia operativa completa de comandos | CUMPLIDO |
| Existe una guía semántica de respuestas para `git add -p` | CUMPLIDO |
| Existe una checklist de verificación previa a cada commit | CUMPLIDO |
| Ningún riesgo crítico pendiente | CUMPLIDO |
| Separación segura de todos los archivos compartidos | CUMPLIDO — sin hunks ambiguos en ninguno de los 2 archivos compartidos |
| Ejecución real de `git add -p` y verificación humana en el momento de integrar | **REQUIERE REVISIÓN MANUAL** — el plan está completo, pero la ejecución interactiva de `git add -p` no puede validarse por adelantado sin ejecutarla |

## Conclusión

**A) STAGING DEL BLOQUE 11 PUEDE EJECUTARSE DE FORMA SEGURA — ESPERANDO AUTORIZACIÓN**

# Cierre Global — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-25. Documento de cierre global, exclusivamente documental. Consolida los cierres individuales ya aprobados sin reinterpretarlos, sin reabrir ningún hallazgo y sin ejecutar código, tests ni comandos de git de escritura.

## 1. Resumen ejecutivo

Bloque 11 se abrió para endurecer 8 puntos de seguridad heredados de dos fuentes nunca consolidadas contra el código real (`ROADMAP_PRODUCTO_SDC.md` §3 y `DEUDA_TECNICA.md` sección A). De los 8, 2 (H-05, H-06) ya estaban resueltos antes de la apertura del bloque. De los 6 restantes, 4 quedan **CERRADOS FORMALMENTE** (H-01, H-02, H-04, H-08), 1 queda **fuera del alcance correctivo** por decisión explícita del Product Owner (H-03, mitigado por schema) y 1 queda **BLOQUEADO** por una dependencia externa (H-07, esperando confirmación de Railway). El nivel de cumplimiento alcanzado sobre lo que el bloque podía resolver internamente es completo: los 4 hallazgos cerrados pasaron por implementación, validación funcional, auditoría adversarial y — donde correspondió una corrección más compleja (H-02) — revisión independiente adicional, sin ningún hallazgo bloqueante remanente.

**Nivel de cumplimiento:** de los 6 hallazgos activos del bloque, el 67% (4/6) alcanzó cierre formal completo; el 33% restante (2/6) tiene un motivo de excepción explícito y documentado (decisión de Product Owner para H-03, dependencia externa para H-07), no una omisión del proceso. Ningún hallazgo quedó sin clasificar ni sin evidencia.

## 2. Objetivos del bloque

Mitigar: fuga de contrato HTTP por `200` vacío ante acceso cruzado (H-01); acceso runtime no controlado a métodos SQL crudos de Prisma (H-02); guardia de escritura anidada incompleto (H-03); ausencia de red de seguridad automática para modelos organizacionales (H-04); credenciales/CORS inseguros por defecto (H-05/H-06, ya resueltos); ausencia de límite de intentos de login (H-07); cálculo financiero incorrecto en cuenta corriente (H-08). Componentes cubiertos: catálogos (`clientes`/`transportistas`/`choferes`), el cliente Prisma organizacional de nivel superior, la infraestructura de testing del backend, autenticación, y el módulo de cuenta corriente. Quedó deliberadamente fuera de alcance: bloqueo de cuenta por intentos fallidos (distinto de rate-limiting), RBAC visual de frontend, alta de organización por autoservicio, proveedor real de email, y cualquier deuda de modelo de datos/arquitectura no listada en los 8 ítems originales.

## 3. Resumen de hallazgos

| Hallazgo | Severidad | Estado final | Documento de cierre | Riesgo residual |
|---|---|---|---|---|
| H-01 | P2 | CERRADO FORMALMENTE | `CIERRE_FORMAL_H01_BLOQUE11.md` | Bajo |
| H-02 | P1/P2 → Crítico confirmado | CERRADO FORMALMENTE | `CIERRE_FORMAL_H02_BLOQUE11.md` | Bajo y aceptado |
| H-03 | P2 | Fuera del alcance correctivo por decisión del Product Owner | `AUDITORIA_BLOQUE11_SEGURIDAD.md` §9 (mitigado por schema, no cerrado) | Bajo, no generalizado a los 21 modelos |
| H-04 | P2 | CERRADO FORMALMENTE | `CIERRE_FORMAL_H04_BLOQUE11.md` | Bajo |
| H-05 | — | Resuelto antes de Bloque 11 (Bloque 8.1.a) | `AUDITORIA_BLOQUE11_SEGURIDAD.md` §H-05 | Ninguno |
| H-06 | — | Resuelto antes de Bloque 11 (Bloque 8.1.a) | `AUDITORIA_BLOQUE11_SEGURIDAD.md` §H-06 | Ninguno |
| H-07 | P1 | Bloqueado por dependencia externa | `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md` | Medio-alto, no determinado en producción |
| H-08 | P1 | CERRADO FORMALMENTE | `CIERRE_FORMAL_H08_BLOQUE11.md` | Bajo |

## 4. Resultados obtenidos

**Hallazgos corregidos y cerrados (4):** H-01 (helper `encontrarOFallar`, 3 controllers), H-02 (Proxy con 4 traps sobre el cliente organizacional de nivel superior, incluida la corrección posterior de `constructor`/`constructor.prototype`), H-04 (red de seguridad automática vía test), H-08 (exclusión de facturas `ANULADO` en cuenta corriente). **Mejoras implementadas:** primer test automatizado del backend (H-04, extendido luego por H-01 y por H-02); rate-limiting funcional para el caso feliz de login (H-07, con bypass conocido y documentado); helper reutilizable de `404` (H-01). **Controles incorporados:** verificación automática de `ORGANIZACIONAL_MODELS`/`MODELOS_AISLAMIENTO_MANUAL` contra el schema real en cada ejecución de `npm run test`; bloqueo runtime (no solo de tipos) de los 4 métodos raw de Prisma en el cliente de nivel superior. **Verificaciones realizadas:** build, suite de tests, validación funcional HTTP real, auditoría adversarial, y — únicamente para H-02, dada su complejidad — revisión independiente adicional.

**Verificaciones realizadas, en cifras consolidadas:** 1 build exitoso confirmado repetidamente a lo largo de todas las etapas; 50 tests automatizados en verde en la suite final del backend (10 de la validación funcional original — 6 de H-04 + 4 de H-01 — más 40 agregados por la implementación V2 enmendada de H-02); 1 revisión de implementación cubriendo los 5 hallazgos de la primera pasada; 1 revisión independiente adicional, exclusiva de H-02.

## 5. Evidencia consolidada

- **Build:** exitoso en todas las etapas registradas (`REVISION_IMPLEMENTACION_BLOQUE11.md`, `VALIDACION_FUNCIONAL_BLOQUE11.md`, y cada cierre individual de H-02/H-04/H-08).
- **Suite de tests:** `VALIDACION_FUNCIONAL_BLOQUE11.md` §5 — 10/10 (H-01 + H-04) en la validación funcional original; posteriormente, la implementación V2 enmendada de H-02 agregó 40/40 tests propios (`organizacion-prisma.client.spec.ts`), con la suite completa del backend en 50/50 (`REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`).
- **Validación funcional:** `VALIDACION_FUNCIONAL_BLOQUE11.md` — 9 combinaciones HTTP reales (H-01), 8 pasos de flujo completo factura→cobranza→anulación (H-08), 8 verificaciones de diagnóstico + 2 usos reales de `tx.$queryRaw` (H-02 base), 8 pruebas HTTP incluida expiración de ventana (H-07). Estado declarado: los 5 hallazgos de la primera pasada, **VALIDADO**.
- **Auditoría adversarial:** `AUDITORIA_ADVERSARIAL_BLOQUE11.md` — H-01 (12 vectores, sin hallazgo bloqueante), H-04 (6 casos de ruptura controlada, sin hallazgo), H-08 (6 vectores, sin hallazgo bloqueante), H-02 (bypass confirmado, origen de toda la cadena de corrección posterior), H-07 (bypass confirmado, origen del bloqueo actual).
- **Revisión de implementación:** `REVISION_IMPLEMENTACION_BLOQUE11.md` — conformidad total en los 5 hallazgos de la primera pasada, un único desvío puramente sintáctico en H-07 (`trust proxy`), sin efecto de comportamiento.
- **Revisión independiente:** `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md` — exclusiva de H-02, dada la profundidad de su cadena de corrección (V1 → V2 → V2 enmendada); 0 hallazgos bloqueantes, 4 no bloqueantes registrados y aceptados sin corrección dentro de H-02.

**Aclaración sobre H-02:** a diferencia de los otros 3 hallazgos cerrados, H-02 requirió una cadena de corrección no lineal (Diseño V1 → bloqueado por comportamiento de `__proto__ =` → investigación de causa raíz → Diseño V2 con trap `set` → bloqueado por discrepancia de `constructor.prototype` → investigación de un error metodológico propio → Diseño V2 enmendado → implementación V2 enmendada → revisión independiente) antes de alcanzar el cierre. Esa profundidad adicional está documentada en su propio cierre (`CIERRE_FORMAL_H02_BLOQUE11.md`) y no se repite acá.

## 6. Hallazgos abiertos

**H-03.** Motivo: guardia de escritura anidada no cubre `create` anidado; el único caso real existente (`Contacto` vía `ClientesController.create()`) quedó mitigado por FK compuesta + whitelist de validación, confirmado empíricamente. Estado: fuera del alcance correctivo por decisión explícita del Product Owner — no se escribió corrección de código. Responsable: Product Owner (decisión ya tomada, registrada en `DISEÑO_BLOQUE11_SEGURIDAD.md` §3). Condición para su cierre: una nueva decisión del Product Owner que autorice auditar los 20 modelos organizacionales restantes para generalizar la mitigación, o que acepte formalmente el riesgo residual actual sin generalizarla.

**H-07.** Motivo: `trust proxy: 1` confía por cantidad de saltos, no por identidad verificada — bypass de rate-limiting confirmado en desarrollo con `X-Forwarded-For` arbitrario; explotabilidad en producción no determinada por contradicción en la documentación/soporte de Railway. Estado: bloqueado por dependencia externa. Responsable: equipo del proyecto, gestión externa (no corrección de código). Condición para su cierre: confirmación oficial y por escrito de soporte de Railway sobre si `X-Forwarded-For` se sobrescribe en el borde, cuántos saltos reales existen, y qué extremo del header es confiable.

## 7. Riesgo residual del bloque

**Riesgos mitigados:** fuga de contrato HTTP (H-01); acceso runtime a métodos SQL crudos vía Proxy, `__proto__` y `constructor` (H-02); ausencia de red de seguridad para modelos organizacionales (H-04); cálculo financiero incorrecto en cuenta corriente (H-08); credenciales/CORS inseguros por defecto (H-05/H-06, previos al bloque).

**Riesgos aceptados:** H-02 con riesgo residual bajo y aceptado, no cero — documentado explícitamente en `CIERRE_FORMAL_H02_BLOQUE11.md` (4 observaciones no bloqueantes, ninguna dentro del modelo de amenaza aprobado). Verificación de impacto de H-08 contra datos reales de producción, pendiente como actividad previa al despliegue, no como deuda de cierre.

**Riesgos pendientes:** H-03, sin generalización de su mitigación a los 20 modelos organizacionales restantes — riesgo bajo, no cuantificado fuera del único caso real ya auditado.

**Riesgos dependientes de terceros:** H-07 — el riesgo de seguridad más alto de los seis hallazgos activos, con explotabilidad en producción no determinada, dependiente exclusivamente de una confirmación de Railway que el proyecto no controla.

No se declara riesgo cero para el bloque.

## 8. Lecciones aprendidas

La auditoría adversarial resultó decisiva: los 5 hallazgos que pasaron validación funcional "feliz" solo revelaron sus bypasses reales (H-02, H-07) bajo intentos deliberados de romperlos, no bajo el camino esperado. La revisión independiente de H-02 confirmó el valor de una segunda mirada no contaminada por el contexto de quien implementó — detectó observaciones (`Symbol.toStringTag`, tests de bajo valor real) que la implementación original no había señalado, sin que ninguna resultara bloqueante. La trazabilidad documental estricta (cada etapa citando exactamente a la anterior, sin reinterpretar decisiones cerradas) permitió sostener una cadena de corrección larga y no lineal (H-02: V1 bloqueada → investigación → V2 bloqueada → investigación → enmienda → V2 enmendada) sin perder coherencia ni repetir trabajo ya cerrado. La lección más concreta: validar siempre contra el objeto real de producción (`PrismaService`, no `PrismaClient` directo) — un error metodológico propio, detectado y corregido dentro de la misma cadena, fue la causa de una discrepancia Jest/Node que en realidad nunca existió como tal.

## 9. Documentos generados

- **Auditoría:** `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`.
- **Diseño:** `DISEÑO_BLOQUE11_SEGURIDAD.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, `PRE_IMPLEMENTACION_BLOQUE11.md`, `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`, y la cadena completa de H-02 (`DISEÑO_CORRECCION_H02_BLOQUE11.md`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `INVESTIGACION_H02_PROTO_SETTER.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md`, `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`, `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md`, `ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md`).
- **Implementación:** `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`.
- **Validación:** `REVISION_IMPLEMENTACION_BLOQUE11.md`, `VALIDACION_FUNCIONAL_BLOQUE11.md`, `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`.
- **Cierres individuales:** `CIERRE_FORMAL_H01_BLOQUE11.md`, `CIERRE_FORMAL_H02_BLOQUE11.md`, `CIERRE_FORMAL_H04_BLOQUE11.md`, `CIERRE_FORMAL_H08_BLOQUE11.md`.
- **Estado del bloque:** `ESTADO_BLOQUE11.md`.
- **Cierre global:** `CIERRE_GLOBAL_BLOQUE11.md` (este documento).

## 10. Estado del repositorio

```
$ git diff --stat
 backend/package-lock.json                          | 8246 ++++++++++++++------
 backend/package.json                                |   15 +-
 backend/src/auth/auth.controller.ts                 |   19 +-
 backend/src/auth/auth.module.ts                     |   11 +
 backend/src/catalogos/choferes.controller.ts        |    6 +-
 backend/src/catalogos/clientes.controller.ts        |   11 +-
 backend/src/catalogos/transportistas.controller.ts  |    6 +-
 backend/src/main.ts                                  |    7 +
 backend/src/prisma/organizacion-prisma.client.ts     |   75 +-
 9 files changed, 5930 insertions(+), 2466 deletions(-)

$ git status --short | wc -l
56
```

**9 archivos modificados** (`M`) — los 9 corresponden a hallazgos del Bloque 11: H-01/H-08 (`clientes.controller.ts`), H-01 (`transportistas.controller.ts`, `choferes.controller.ts`), H-02 (`organizacion-prisma.client.ts`), H-07 (`auth.controller.ts`, `auth.module.ts`, `main.ts`), H-04/H-07 (`package.json`/`package-lock.json`). `frontend/railway.json` (modificado, sin diff nuevo relevante a este bloque) es ajeno. **~47 archivos sin rastrear** (`??`): los ~40 documentos `.md` de esta cadena y de cadenas anteriores del proyecto, más los archivos productivos/tests de H-01 (`common/encontrar-o-fallar.ts`/`.spec.ts`), H-04 (`prisma/modelos-aislamiento-manual.ts`, `prisma/organizacional-models.spec.ts`) y H-02 (`prisma/organizacion-prisma.client.spec.ts`), más `docs/validaciones/`. **El repositorio no está limpio** — ninguno de los cambios de Bloque 11 fue commiteado en ninguna etapa de esta cadena. No se ejecutó `git add`, `commit` ni `push` en esta etapa ni en ninguna anterior.

## 11. Conclusión

**Bloque 11 técnicamente finalizado** en la parte que dependía exclusivamente del equipo: 4 de 6 hallazgos activos cerrados formalmente (H-01, H-02, H-04, H-08), con evidencia de build, tests, validación funcional, auditoría adversarial y — para H-02 — revisión independiente, sin ningún hallazgo bloqueante remanente. **Hallazgos pendientes:** 2 — H-03 (fuera del alcance correctivo por decisión del Product Owner, sin generalizar su mitigación) y H-07 (bloqueado por dependencia externa de Railway). **Riesgo residual:** bajo y aceptado para los 4 hallazgos cerrados; bajo y no generalizado para H-03; medio-alto y no determinado para H-07, el único con explotabilidad de producción todavía sin resolver. **Estado para integración:** apto para los 4 hallazgos cerrados — el código correspondiente puede pasar a etapa de integración (commit/push) cuando así se autorice, sin que eso implique cerrar H-03 ni H-07. **Próximos pasos recomendados:** (1) gestionar la confirmación oficial de Railway para desbloquear H-07; (2) mantener H-03 en su estado actual salvo nueva decisión del Product Owner; (3) considerar la integración (commit) del trabajo ya cerrado de Bloque 11, actualmente sin commitear en su totalidad.

**BLOQUE 11 CERRADO DOCUMENTALMENTE — APTO PARA ETAPA DE INTEGRACIÓN**

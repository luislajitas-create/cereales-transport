# Estado General — Bloque 11: Endurecimiento de Seguridad

Fecha de última actualización: 2026-07-25. Tablero de control, exclusivamente documental y de gestión. No es auditoría, no es investigación, no es implementación, no es revisión adversarial. No reinterpreta el cierre de H-02.

## 1. Resumen ejecutivo

Bloque 11 identificó 8 ítems, de los cuales 2 (H-05, H-06) ya estaban resueltos antes de abrirse el bloque y quedan fuera de su alcance activo. De los 6 hallazgos activos, **1 está CERRADO** (H-02, con documento de cierre formal), **3 están VALIDADOS** (H-01, H-04, H-08 — implementados, validados funcionalmente y auditados adversarialmente sin hallazgo bloqueante, sin cierre formal propio todavía), **1 está BLOQUEADO** (H-07, esperando confirmación externa de Railway) y **1 permanece PENDIENTE** con clasificación especial (H-03, mitigado por schema pero explícitamente no cerrado por decisión del Product Owner).

## 2. Estado general

**Bloque 11 no está cerrado como bloque.** H-02 es el único con resolución formal completa. H-07 depende de un tercero externo (Railway) y no puede avanzar sin esa respuesta. H-03 quedó fuera del alcance correctivo por decisión explícita del Product Owner, sin que eso equivalga a su cierre. H-01, H-04 y H-08 están técnicamente completos pero sin el mismo tratamiento formal de cierre que recibió H-02.

## 3. Tabla de hallazgos

| Hallazgo | Descripción | Severidad | Estado | Evidencia principal | Riesgo residual | Próxima acción |
|---|---|---|---|---|---|---|
| H-01 | 3 endpoints devuelven `200` vacío en vez de `404` ante acceso cruzado | P2 | VALIDADO | Helper `encontrarOFallar`, validación funcional + adversarial sin hallazgo (`AUDITORIA_ADVERSARIAL_BLOQUE11.md` §5) | Bajo | Cierre formal documental (sin trabajo técnico pendiente) |
| H-02 | `$queryRaw*`/`$executeRaw*` alcanzables en runtime vía bypass de `Proxy` | P1/P2 → Crítico confirmado | **CERRADO** | `CIERRE_FORMAL_H02_BLOQUE11.md` | Bajo y aceptado | Integrar cuando corresponda; mantener congelado salvo bypass demostrable |
| H-03 | Guardia de escritura anidada incompleto (`create` no cubierto) | P2 | PENDIENTE (mitigado por schema, excluido del alcance correctivo) | `AUDITORIA_BLOQUE11_SEGURIDAD.md` §9 — resolución empírica | Bajo, no generalizado a los 21 modelos | Sin acción salvo nueva decisión del Product Owner |
| H-04 | Sin red de seguridad automática para `ORGANIZACIONAL_MODELS` | P2 | VALIDADO | Test automatizado (`organizacional-models.spec.ts`), 6 casos de ruptura controlada sin hallazgo (`AUDITORIA_ADVERSARIAL_BLOQUE11.md` §4) | Bajo | Cierre formal documental |
| H-05 | `JWT_SECRET` con fallback hardcodeado | — | CERRADO (fuera del alcance activo de Bloque 11) | Resuelto en Bloque 8.1.a, confirmado en auditoría | Ninguno | Ninguna |
| H-06 | CORS wildcard como fallback | — | CERRADO (fuera del alcance activo de Bloque 11) | Resuelto en Bloque 8.1.a, confirmado en auditoría | Ninguno | Ninguna |
| H-07 | Sin rate-limiting real — `trust proxy` confía por saltos, no por identidad | P1 | **BLOQUEADO** | `@nestjs/throttler` implementado; bypass confirmado con `X-Forwarded-For` arbitrario (`AUDITORIA_ADVERSARIAL_BLOQUE11.md` §3) | Medio-alto, no determinado en producción | Confirmación oficial y por escrito de Railway (soporte oficial, no foro comunitario) |
| H-08 | `cuentaCorriente()` no excluye facturas `ANULADO` | P1 | VALIDADO | Corrección aplicada, validación funcional + adversarial sin hallazgo (`AUDITORIA_ADVERSARIAL_BLOQUE11.md` §2) | Bajo | Cierre formal documental |

## 4. Detalle por hallazgo

**H-01.** Estado: VALIDADO. Último documento relevante: `AUDITORIA_ADVERSARIAL_BLOQUE11.md`. Confirmado: helper `encontrarOFallar` aplicado a los 3 controllers, `404` correcto ante id ajeno/inexistente, 12 vectores adversariales sin hallazgo bloqueante (2 observaciones no atribuibles a H-01). Falta: documento de cierre formal propio. Sin dependencias ni bloqueos. Próximo paso: generar `CIERRE_FORMAL_H01_BLOQUE11.md` cuando se priorice.

**H-02.** Estado: CERRADO. Último documento relevante: `CIERRE_FORMAL_H02_BLOQUE11.md`. Confirmado: 4 traps de `Proxy`, `constructor → Object`, 40/40 tests con `PrismaService` real, revisión independiente aprobada, riesgo residual bajo y aceptado. No queda nada pendiente sobre H-02. No reabrir.

**H-03.** Estado: PENDIENTE (clasificación especial: MITIGADO POR SCHEMA). Último documento relevante: `AUDITORIA_BLOQUE11_SEGURIDAD.md` §9. Confirmado: el único caso real (`Contacto` vía `Cliente.create()`) queda protegido por FK compuesta + whitelist de validación, verificado empíricamente. Falta: auditoría de los otros 20 modelos organizacionales para generalizar la mitigación (no autorizada todavía). Dependencia: decisión explícita del Product Owner para reabrir o formalizar el cierre. Sin ella, permanece como está.

**H-04.** Estado: VALIDADO. Último documento relevante: `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §4. Confirmado: primer test automatizado del backend, 6 casos de ruptura controlada (modelo faltante, sobrante, duplicado, excepción eliminada/agregada, doble pertenencia), los 6 sin hallazgo. Falta: documento de cierre formal propio. Sin dependencias ni bloqueos.

**H-07.** Estado: BLOQUEADO. Último documento relevante: `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`. Confirmado: `@nestjs/throttler` implementado y funcional para el caso feliz; bypass real confirmado con `X-Forwarded-For` falsificado en desarrollo. Falta: confirmación oficial de Railway sobre si el header se sobrescribe en el borde de red y cuántos saltos reales existen. Dependencia externa explícita — ver sección 7. No avanza a diseño de código hasta recibir esa respuesta.

**H-08.** Estado: VALIDADO. Último documento relevante: `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §2. Confirmado: filtro `estado !== "ANULADO"` aplicado, 6 vectores adversariales sin hallazgo bloqueante (1 hallazgo menor de presentación en el orden de movimientos, preexistente, no atribuible a H-08). Falta: documento de cierre formal propio. Sin dependencias ni bloqueos.

## 5. Métricas del bloque

Sobre los 6 hallazgos activos de Bloque 11 (excluidos H-05/H-06, ya resueltos antes de su apertura):

| Estado | Cantidad | Hallazgos |
|---|---|---|
| CERRADO | 1 | H-02 |
| VALIDADO | 3 | H-01, H-04, H-08 |
| IMPLEMENTADO | 0 | — |
| DISEÑO APROBADO / LISTO PARA IMPLEMENTACIÓN | 0 | — |
| EN ANÁLISIS | 0 | — |
| PENDIENTE | 1 | H-03 |
| BLOQUEADO | 1 | H-07 |
| **Total activo** | **6** | — |

(H-05 y H-06: 2 adicionales, CERRADOS antes de la apertura de Bloque 11, no contabilizados en el total activo.)

## 6. Próximo hallazgo recomendado

**H-08.**

Motivo: entre los hallazgos sin trabajo técnico pendiente (H-01, H-04, H-08, todos VALIDADO), H-08 fue clasificado **P1** en la auditoría original (dato financiero incorrecto, visible hoy a Facturación/Gerencia) — mayor severidad que H-01 y H-04 (ambos P2). No depende de Railway (a diferencia de H-07) ni requiere reabrir H-02. Su estado documental (validación funcional + adversarial, ambas sin hallazgo bloqueante) ya sostiene un cierre formal sin necesitar nueva evidencia técnica.

Etapa exacta siguiente: **`CIERRE_FORMAL_H08_BLOQUE11`** — exclusivamente documental, análoga en estructura a `CIERRE_FORMAL_H02_BLOQUE11.md`, sin reabrir implementación ni validación.

Documentos a revisar para esa etapa: `AUDITORIA_BLOQUE11_SEGURIDAD.md` (H-08), `DISEÑO_BLOQUE11_SEGURIDAD.md` §4.6, `REVISION_IMPLEMENTACION_BLOQUE11.md`, `VALIDACION_FUNCIONAL_BLOQUE11.md`, `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §2.

H-01 y H-04 están en la misma condición y son igualmente elegibles para el mismo tratamiento documental a continuación, en cualquier orden.

## 7. Bloqueos y dependencias

- **H-07 — BLOQUEADO.** Motivo: el bypass de rate-limiting vía `X-Forwarded-For` está confirmado en desarrollo, pero su explotabilidad en producción depende de la topología real de red de Railway. Dependencia: confirmación oficial y por escrito de soporte de Railway sobre (a) si `X-Forwarded-For` se sobrescribe o se preserva en el borde, (b) cuántos saltos reales existen, (c) qué extremo del header es confiable. Condición de desbloqueo: recibir esa respuesta — recién entonces corresponde una etapa de diseño de código para H-07, si la respuesta confirma que el riesgo es real en producción.
- **H-03 — no clasificado como bloqueo formal**, pero sin acción correctiva autorizada: el Product Owner excluyó explícitamente a H-03 del alcance de corrección de este bloque. No requiere una dependencia externa para desbloquearse — requiere una nueva decisión del Product Owner si se quiere reabrir su alcance (por ejemplo, auditar los 20 modelos restantes).

Para el resto de los hallazgos (H-01, H-02, H-04, H-08): **SIN BLOQUEOS FORMALES DOCUMENTADOS.**

## 8. Documentos de referencia

**A. Auditoría:** `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `AUDITORIA_ADVERSARIAL_BLOQUE11.md`.

**B. Análisis y Product Owner:** `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md`.

**C. Diseño:** `DISEÑO_BLOQUE11_SEGURIDAD.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, `PRE_IMPLEMENTACION_BLOQUE11.md`.

**D. Implementación (primera pasada, H-01/H-02 base/H-04/H-07 base/H-08):** `REVISION_IMPLEMENTACION_BLOQUE11.md`.

**E. Validación:** `VALIDACION_FUNCIONAL_BLOQUE11.md`.

**F. Cierres:**
- H-02 (fuente definitiva): `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`, `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`, `CIERRE_FORMAL_H02_BLOQUE11.md`.
- H-01, H-04, H-08: sin documento de cierre propio todavía (ver sección 6).

## 9. Estado del repositorio

```
$ git status --short | wc -l
52
$ git diff --stat | tail -1
9 files changed, 5930 insertions(+), 2466 deletions(-)
```

**El repositorio no está limpio.** De los 52 registros de `git status --short`: 10 archivos modificados (`M`), de los cuales solo `backend/src/prisma/organizacion-prisma.client.ts` corresponde a un hallazgo de Bloque 11 (H-02, ya cerrado); los otros 9 modificados (`auth.controller.ts`, `auth.module.ts` — de H-07; `clientes.controller.ts`, `choferes.controller.ts`, `transportistas.controller.ts` — de H-01/H-08; `main.ts`, `package.json`/`package-lock.json` — de H-07; `frontend/railway.json` — ajeno) pertenecen a etapas de implementación de Bloque 11 ya completadas pero **nunca commiteadas**. El resto son archivos sin rastrear (`??`): ~35 documentos `.md` de este bloque y de cadenas anteriores del proyecto, más los archivos de test/helper de H-01/H-04 (`encontrar-o-fallar.ts`/`.spec.ts`, `modelos-aislamiento-manual.ts`, `organizacional-models.spec.ts`, `organizacion-prisma.client.spec.ts`). No se ejecutó `git add`, `commit` ni `push` en ninguna etapa de esta cadena.

## 10. Conclusión

**A) BLOQUE 11 CON H-02 CERRADO — CONTINUAR CON EL HALLAZGO RECOMENDADO**

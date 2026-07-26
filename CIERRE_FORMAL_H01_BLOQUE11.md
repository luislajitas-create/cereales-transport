# Cierre Formal — H-01 (Bloque 11)

Fecha: 2026-07-25. Etapa exclusivamente documental. No investiga, no implementa, no modifica código ni tests, no reabre H-01.

## 1. Identificación del hallazgo

- **Identificador:** H-01. **Bloque:** 11 (Endurecimiento de Seguridad). **Componente:** endpoints `findOne` de catálogos.
- **Severidad:** P2 (bajado de la evaluación original porque no hay fuga de datos, solo inconsistencia de contrato HTTP).
- **Objetivo original:** que un `id` inexistente o perteneciente a otra organización devuelva `404`, no `200` con cuerpo vacío.
- **Archivos afectados:** `backend/src/catalogos/clientes.controller.ts`, `transportistas.controller.ts`, `choferes.controller.ts`. **Función afectada en cada uno:** `findOne()`.

## 2. Problema original

Los tres `findOne(@Param("id") id)` devolvían el resultado de Prisma tal cual (`return this.prisma.X.findUnique({ where: { id } })`), sin verificar `null`. La extensión de aislamiento ya devolvía `null` correctamente cuando el `id` pertenecía a otra organización — el defecto era exclusivamente que NestJS serializaba ese `null` como `200` vacío en vez de `404`. **Sin fuga de datos** (confirmado dos veces: por Bloque 8 y por `AUDITORIA_BLOQUE11_SEGURIDAD.md`) — es un defecto de higiene de contrato HTTP, no de aislamiento organizacional. Se priorizó por ser una inconsistencia de API que un consumidor futuro podría interpretar como "recurso vacío" en vez de "no encontrado", y por el riesgo de que el mismo patrón se repitiera en un controller nuevo sin ningún mecanismo que lo evitara.

## 3. Solución implementada

Helper reutilizable `encontrarOFallar<T>(valor: T | null | undefined, mensaje: string): T` (`backend/src/common/encontrar-o-fallar.ts`) — devuelve el valor si existe, lanza `NotFoundException` con el mensaje dado si es `null`/`undefined`. Aplicado en los tres `findOne()`, cada uno con su mensaje literal (`"Cliente no encontrado."`, `"Transportista no encontrado."`, `"Chofer no encontrado."`). Alcance: únicamente esos tres métodos; ningún otro método de esos controllers ni ningún otro controller fue modificado (retrofit de controllers ya correctos, descartado deliberadamente desde el Diseño). Limitación conocida y aceptada, no atribuible a H-01: `findOne` no filtra por `activo` (un recurso dado de baja sigue siendo `200` con `activo:false`) — comportamiento preexistente a Bloque 11, fuera de este alcance.

## 4. Evidencia

- **Build:** confirmado sin errores (`REVISION_IMPLEMENTACION_BLOQUE11.md`, `VALIDACION_FUNCIONAL_BLOQUE11.md` §2).
- **Tests unitarios:** `common/encontrar-o-fallar.spec.ts`, 4 casos, incluidos en la corrida de `npm run test` (10/10 en verde junto con los 6 de H-04) — cubren retorno del valor si no es `null`/`undefined`, excepción con mensaje exacto si lo es, y preservación de valores falsy legítimos (`0`, `""`).
- **Revisión de implementación:** conformidad total (`REVISION_IMPLEMENTACION_BLOQUE11.md` §4) — `encontrarOFallar` aparece en exactamente 4 archivos (su definición + los 3 controllers aprobados), mismo patrón de uso en los tres, sin variaciones injustificadas.
- **Validación funcional:** `VALIDACION_FUNCIONAL_BLOQUE11.md` §6 — 9 combinaciones (3 endpoints × id propio/ajeno/inexistente) con JWT real e IDs reales de `Organización B` (obtenidos vía cambio de organización legítimo, no manipulación directa de base). `200` con datos ante id propio; `404` con cuerpo `{"statusCode":404,"message":"<mensaje>","error":"Not Found"}` ante id ajeno/inexistente, idéntico en ambos casos. Estado declarado: **VALIDADO**.
- **Auditoría adversarial:** `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §5 — 12 vectores (sin JWT, JWT malformado, id vacío, id no-UUID, inyección SQL, path traversal, id de 10.000 caracteres, recurso dado de baja, fuga de existencia cross-organización, supresión de errores reales, valores falsy, diferenciación de `403`). 10 con **SIN HALLAZGO**; 2 con **OBSERVACIÓN** (recurso dado de baja sigue siendo `200`, y `403` no verificado por HTTP real sino por revisión de código) — ambas explícitamente no atribuibles a H-01. Estado declarado: **H-01: sin hallazgo bloqueante**.

## 5. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Los 3 endpoints devuelven `404` (no `200` vacío) ante id ajeno o inexistente | CUMPLIDO |
| Los 3 endpoints devuelven `200` con datos correctos ante id propio válido | CUMPLIDO |
| Mensaje de error exacto por entidad, formato estándar NestJS | CUMPLIDO |
| Cero regresión en el resto de cada controller (`findAll`, `create`, `update`, `remove`, exports) | CUMPLIDO |
| Test unitario de `encontrarOFallar` en verde | CUMPLIDO |
| Sin diferencia observable entre "existe en otra organización" y "no existe" | CUMPLIDO |
| Compatibilidad hacia atrás confirmada (sin consumidor real en frontend) | CUMPLIDO |
| Auditoría adversarial sin hallazgo bloqueante | CUMPLIDO |
| Build exitoso | CUMPLIDO |

**9/9 CUMPLIDO.**

## 6. Riesgo residual

**BAJO.** Documentado en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`: sin riesgo identificado más allá de la regresión estándar de cada controller, ya cubierta. Las 2 observaciones de la auditoría adversarial (recursos dados de baja siguen siendo accesibles por id; `403` no confirmado por HTTP real) son comportamiento preexistente a Bloque 11 y limitación metodológica de la propia auditoría (evitó deliberadamente un intento de fuerza bruta sobre una cuenta real), no defectos de H-01 — quedan registradas, sin acción en este cierre.

## 7. Resolución

H-01 corregido. H-01 validado funcionalmente. H-01 auditado adversarialmente sin hallazgo bloqueante. H-01 apto para integración.

## 8. Trazabilidad

- **Auditoría:** `AUDITORIA_BLOQUE11_SEGURIDAD.md` (H-01), `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §5.
- **Diseño:** `DISEÑO_BLOQUE11_SEGURIDAD.md` §4.1, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (H-01).
- **Implementación:** `PRE_IMPLEMENTACION_BLOQUE11.md` (orden de implementación, sin ajustes propios de H-01), `REVISION_IMPLEMENTACION_BLOQUE11.md` §4.
- **Validación:** `VALIDACION_FUNCIONAL_BLOQUE11.md` §6.
- **Cierre:** `ESTADO_BLOQUE11.md`, `CIERRE_FORMAL_H01_BLOQUE11.md` (este documento).

## 9. Estado del repositorio

```
$ git status --short | wc -l
54
$ git diff --stat | tail -1
9 files changed, 5930 insertions(+), 2466 deletions(-)
```

De los archivos modificados, `clientes.controller.ts`, `transportistas.controller.ts` y `choferes.controller.ts` corresponden a H-01 (`clientes.controller.ts` también a H-08, mismo archivo, métodos distintos). El resto (`auth.controller.ts`, `auth.module.ts`, `main.ts`, `package.json`/`package-lock.json` de H-07; `organizacion-prisma.client.ts` de H-02; `frontend/railway.json`, ajeno) no corresponden a H-01. El repositorio **no está limpio** — ninguno de estos cambios fue commiteado en ninguna etapa de esta cadena. No se ejecutó `git add`, `commit` ni `push` en esta etapa.

## 10. Conclusión

**H-01 CERRADO FORMALMENTE — APTO PARA INTEGRACIÓN**

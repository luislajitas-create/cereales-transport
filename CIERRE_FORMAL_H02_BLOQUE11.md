# Cierre Formal — H-02 (Bloque 11)

Fecha: 2026-07-25. Etapa exclusivamente documental: consolida el cierre de H-02. No es auditoría, no es revisión adversarial, no es implementación, no es corrección.

## 1. Resumen ejecutivo

H-02 (Bloque 11) — acceso indebido a los 4 métodos raw de Prisma desde el cliente organizacional de nivel superior — quedó corregido, validado con `PrismaService` real en Jest y en Node compilado, y revisado independientemente sin hallazgos bloqueantes. La solución final vive íntegramente en `bloquearMetodosRawDeNivelSuperior()` (`backend/src/prisma/organizacion-prisma.client.ts`), con 4 traps de `Proxy` (`get`, `set`, `getPrototypeOf`, `setPrototypeOf`). **H-02 cierra formalmente.**

## 2. Identificación del hallazgo

- **Identificador:** H-02. **Bloque:** 11 (Endurecimiento de Seguridad).
- **Componente afectado:** cliente Prisma organizacional de nivel superior (inyectado como `ORGANIZACION_PRISMA`).
- **Función productiva:** `bloquearMetodosRawDeNivelSuperior()`.
- **Archivo productivo:** `backend/src/prisma/organizacion-prisma.client.ts`.
- **Severidad original:** crítica — permitía ejecutar SQL crudo sin el scoping organizacional.
- **Objetivo de seguridad:** los métodos raw de Prisma podían ser alcanzados o utilizados fuera del cliente transaccional permitido mediante rutas del Proxy de nivel superior; el objetivo es que el cliente de nivel superior nunca exponga esos métodos, por ninguna ruta, mientras el cliente de transacción (`tx`) conserve el acceso raw ya aprobado.

## 3. Alcance

**Debía impedir:** acceso directo a `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe` en el cliente superior; bypass mediante manipulación de prototipos (`getPrototypeOf`/`setPrototypeOf`); bypass mediante lectura/escritura de `__proto__`; bypass mediante `constructor`/`constructor.prototype`.

**Debía mantenerse:** queries normales; métodos legítimos de Prisma; `$transaction(callback)`; `$transaction(array)`; los métodos raw permitidos dentro del `TransactionClient` (`tx`); el `target` real intacto; los prototipos reales intactos.

## 4. Cronología técnica

1. Auditoría adversarial (`AUDITORIA_ADVERSARIAL_BLOQUE11.md`) detecta H-02 entre otros hallazgos.
2. Análisis y decisión del Product Owner de corregir H-02.
3. Diseño V1 (`DISEÑO_CORRECCION_H02_BLOQUE11.md`).
4. Implementación V1.
5. Bloqueo: `cliente.__proto__ = x` no lanzaba y corrompía el objeto real.
6. Investigación del `Receiver` y del Proxy interno de Prisma (`createCompositeProxy`).
7. Validación de causa raíz: `Reflect.set` de 3 argumentos en Prisma descarta el `receiver`.
8. Revisión de las decisiones técnicas previas.
9. Diseño V2 con trap `set` explícito para `__proto__`.
10. Implementación V2.
11. Aparente discrepancia Jest/Node en `cliente.constructor.prototype`.
12. Corrección del error metodológico propio: el diagnóstico había usado `PrismaClient` directo en vez de `PrismaService` real.
13. Confirmación del bypass real vía `constructor.prototype` (independiente del entorno).
14. Revisión técnica del vector `constructor` (`REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`).
15. Validación arquitectónica de `cliente.constructor → Object`.
16. Enmienda puntual al Diseño V2 (`ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md`).
17. Implementación V2 enmendada.
18. Revisión independiente de la implementación.
19. Aprobación final — este cierre.

## 5. Causas raíz

**A. `__proto__ =`.** El Proxy interno de Prisma (`createCompositeProxy`, propio de `$extends()`) delega su trap `set` mediante `Reflect.set(target, prop, value)` de tres argumentos, sin preservar el `receiver`. Esto permite que la asignación `cliente.__proto__ = x`, si se delega sin protección explícita, invoque el setter heredado de `__proto__` con `this` apuntando al objeto interno crudo, evitando el trap `setPrototypeOf` del Proxy externo.

**B. `constructor.prototype`.** `PrismaService extends PrismaClient`. La función obtenida vía `.bind(target)` para la clave `"constructor"` no tiene `.prototype` propio (garantía de `bind()`), pero sí hereda por `[[Prototype]]` el `.prototype` real de la clase original — para `PrismaService`, eso resuelve a `PrismaClient`, cuyo `.prototype` real expone los 4 métodos raw sin protección.

Ambos vectores requerían defensas explícitas y complementarias — ninguno cubre al otro.

## 6. Solución definitiva

`bloquearMetodosRawDeNivelSuperior()` envuelve el cliente extendido en un único `Proxy` con 4 traps:

```
get(target, prop):
  1. si prop en {4 raw}         → lanza
  2. si prop === "__proto__"    → devuelve Object.prototype
  3. si prop === "constructor"  → devuelve Object
  4. lectura normal de target
  5. bind(target) si es función

set(target, prop, value, receiver):
  si prop === "__proto__" → lanza
  si no → Reflect.set(target, prop, value, receiver)   // 4 argumentos

getPrototypeOf(target) → Object.prototype

setPrototypeOf(target, proto) → lanza
```

`"constructor"` se resuelve con retorno fijo, sin leer `target["constructor"]`, sin `.bind()`, sin fachada, sin Proxy adicional — coherente con que `getPrototypeOf` ya devuelve `Object.prototype`. El `target` real no se modifica en ningún trap. `TransactionClient` (`tx`) no se envuelve — se construye de forma independiente en cada `$transaction()` y conserva `$queryRaw`/`$executeRaw`.

## 7. Archivos afectados

- **Productivo:** `backend/src/prisma/organizacion-prisma.client.ts` (único).
- **Tests:** `backend/src/prisma/organizacion-prisma.client.spec.ts` (único, nuevo).

No fueron necesarios: cambios de frontend, cambios de schema, migraciones, ningún otro archivo productivo, membranas adicionales, un segundo Proxy, ni modificaciones a `PrismaService` o `PrismaClient`.

## 8. Evidencia final

Evidencia consolidada de `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`, reejecutada y confirmada sin diferencias en `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`:

- Build: exitoso, sin errores.
- Suite específica: **40/40**.
- Suite completa del backend: **50/50** (3 suites).
- Validación en Node compilado con `PrismaService` real: coincide exactamente con Jest (28/28 en la implementación original; re-spot-check de la revisión independiente sobre 4 vectores centrales, también 4/4 coincidentes).
- Vectores críticos (raw directos, lectura/escritura de prototipo, `constructor`) validados en ambos entornos.
- `target`, `Object`, `Object.prototype`, `Function.prototype`, `PrismaService.prototype`, `PrismaClient.prototype`: todos intactos.
- Sin criterios de detención activos en ninguna etapa de la implementación enmendada.

No se detectaron cifras contradictorias entre `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md` y `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md` — ambas coinciden en las cifras arriba.

## 9. Matriz de aceptación

| Criterio | Estado |
|---|---|
| Build | CUMPLIDO |
| Tests específicos (40/40) | CUMPLIDO |
| Suite completa (50/50) | CUMPLIDO |
| PrismaService real como evidencia principal | CUMPLIDO |
| Node compilado coincide con Jest | CUMPLIDO |
| 4 raw directos bloqueados | CUMPLIDO |
| Lectura de prototipo saneada | CUMPLIDO |
| Escritura de prototipo bloqueada | CUMPLIDO |
| `__proto__ =` bloqueado | CUMPLIDO |
| `Reflect.set(cliente, "__proto__", x)` bloqueado | CUMPLIDO |
| Setter heredado (`.call`) bloqueado | CUMPLIDO |
| `constructor` devuelve `Object` | CUMPLIDO |
| `PrismaService` no alcanzable vía `constructor` | CUMPLIDO |
| `PrismaClient` no alcanzable vía `constructor` | CUMPLIDO |
| `PrismaClient.prototype` no alcanzable | CUMPLIDO |
| 4 raw no alcanzables vía `constructor` | CUMPLIDO |
| Queries normales | CUMPLIDO |
| `$transaction(callback)` | CUMPLIDO |
| `$transaction(array)` | CUMPLIDO |
| `tx` raw permitido | CUMPLIDO |
| Target intacto | CUMPLIDO |
| Prototipos reales intactos | CUMPLIDO |
| Consistencia Jest/Node | CUMPLIDO |
| Revisión independiente aprobada | CUMPLIDO |

**23/23 CUMPLIDO.**

## 10. Hallazgos no bloqueantes

Registrados en `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`, sección 14 — ninguno impide el cierre:

1. **`Symbol.toStringTag`** expone el string `"PrismaClient"`. Impacto: cosmético, no expone clase real, prototipo ni métodos raw. No impide el cierre porque está fuera del modelo de amenaza aprobado (que cubre clase, prototipo y métodos raw, no etiquetas de introspección). Tratamiento: registrar; no corregir dentro de H-02; considerar solo en mantenimiento futuro si aporta valor.
2. **Test F de integridad del target** (`__constructorHijackTest`/`__protoHijackTest`) es una aserción de bajo valor real (ningún vector la ataca). Impacto: nulo sobre seguridad, ya que los vectores reales están cubiertos por las categorías A-D. No impide el cierre. Tratamiento: registrar; no corregir dentro de H-02; mejorar solo en mantenimiento futuro.
3. **Ausencia de test estructural** que demuestre directamente que no se lee `target.constructor` (hoy verificado por inspección de código, no por test dedicado). Impacto: gap de testabilidad de una propiedad estructural, no de una propiedad de seguridad observable. No impide el cierre. Tratamiento: registrar; considerar únicamente en mantenimiento futuro.
4. **Comentario productivo extenso** (~19 líneas). Impacto: ninguno material, consistente con el estilo ya existente del archivo. No impide el cierre. Tratamiento: registrar; sin acción.

## 11. Límites y riesgo residual

El cierre de H-02 significa: los vectores aprobados del hallazgo quedan mitigados; el cliente organizacional superior no expone los métodos raw por ninguna de las rutas evaluadas; `TransactionClient` conserva los raw permitidos; la implementación coincide con el diseño aprobado.

H-02 **no** pretende: convertir el cliente en un sandbox general de JavaScript; ocultar toda información cosmética; bloquear `Function` global; bloquear `Object` global; crear una membrana universal; defender contra vectores fuera del modelo de amenazas aprobado (p. ej. `cliente.constructor.constructor`, explícitamente fuera de alcance); sustituir futuras auditorías de seguridad.

**Riesgo residual: BAJO y ACEPTADO** — no cero. Justificación: cobertura completa del modelo de amenazas aprobado; tests reales contra `PrismaService`, no mocks; validación fuera de Jest (Node compilado); integridad del `target` confirmada; revisión independiente sin hallazgos bloqueantes.

## 12. Resolución formal

Se declara formalmente: **H-02 corregido. H-02 validado. H-02 revisado independientemente. H-02 cerrado.** La implementación está apta para integración. El proyecto puede continuar con el siguiente hallazgo pendiente del Bloque 11. No se ejecuta integración, commit ni merge en esta etapa.

## 13. Artefactos de trazabilidad

- **A. Auditoría y análisis:** `AUDITORIA_ADVERSARIAL_BLOQUE11.md`, `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, `DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md` — detección y decisión de corregir.
- **B. Diseño y decisiones:** `DISEÑO_CORRECCION_H02_BLOQUE11.md`, `DECISIONES_TECNICAS_CORRECCION_H02_BLOQUE11.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md` — primer diseño (V1).
- **C. Implementaciones bloqueadas:** `IMPLEMENTACION_CORRECCION_H02_BLOQUE11.md`, `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md` — intentos detenidos por criterios de detención.
- **D. Investigaciones:** `INVESTIGACION_H02_PROTO_SETTER.md`, `VALIDACION_CAUSA_RAIZ_H02_PROTO_SETTER.md`, `REVISION_DECISIONES_TECNICAS_H02_BLOQUE11.md`, `INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md` — causas raíz.
- **E. Diseño final y enmienda:** `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, `PRE_IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2.md`, `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md`, `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md`, `ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md`.
- **F. Implementación aprobada:** `IMPLEMENTACION_CORRECCION_H02_BLOQUE11_V2_ENMENDADA.md`.
- **G. Revisión independiente:** `REVISION_INDEPENDIENTE_IMPLEMENTACION_H02_BLOQUE11.md`.
- **H. Cierre formal:** `CIERRE_FORMAL_H02_BLOQUE11.md` (este documento).

## 14. Estado del repositorio

```
$ git diff --stat -- backend/src/prisma/organizacion-prisma.client.ts
 backend/src/prisma/organizacion-prisma.client.ts | 75 +++++++++++++++++++++++-
 1 file changed, 74 insertions(+), 1 deletion(-)

$ git diff -- backend/src/prisma/organizacion-prisma.client.spec.ts
(sin salida — archivo nuevo, sin rastrear por git, no aparece en git diff por no estar indexado)
```

`git status --short` (51 líneas totales): 10 archivos modificados (`M`), de los cuales **solo 1 corresponde a H-02** (`organizacion-prisma.client.ts`); los otros 9 (`package.json`, `package-lock.json`, `auth.controller.ts`, `auth.module.ts`, `choferes.controller.ts`, `clientes.controller.ts`, `transportistas.controller.ts`, `main.ts`, `frontend/railway.json`) son ajenos, ya modificados desde antes del inicio de esta cadena. El resto son archivos sin rastrear (`??`): ~34 documentos `.md` de esta cadena y de cadenas anteriores del proyecto, más `backend/src/prisma/organizacion-prisma.client.spec.ts` (el único de tests correspondiente a H-02), `backend/src/common/encontrar-o-fallar.ts`/`.spec.ts`, `backend/src/prisma/modelos-aislamiento-manual.ts`, `backend/src/prisma/organizacional-models.spec.ts` (de H-04, ajenos a H-02) y `docs/validaciones/`. **El repositorio no está limpio** — tiene trabajo pendiente de commit de etapas y bloques anteriores, no exclusivo de H-02. No se ejecutó `git add`, `commit` ni `push` en esta etapa ni en ninguna de la cadena de H-02.

## 15. Conclusión

**H-02 CERRADO FORMALMENTE — APTO PARA INTEGRACIÓN**

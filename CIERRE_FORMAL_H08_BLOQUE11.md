# Cierre Formal — H-08 (Bloque 11)

Fecha: 2026-07-25. Etapa exclusivamente documental. No investiga, no implementa, no modifica código ni tests, no reabre H-08.

## 1. Identificación del hallazgo

- **Identificador:** H-08. **Bloque:** 11 (Endurecimiento de Seguridad). **Componente:** Cuenta corriente de clientes.
- **Severidad:** P1 (dato financiero incorrecto, visible hoy a Facturación/Gerencia, según priorización de `AUDITORIA_BLOQUE11_SEGURIDAD.md` §4).
- **Objetivo original:** que `cuentaCorriente()` no cuente el `importe` de facturas anuladas como parte de la deuda pendiente del cliente.
- **Archivo afectado:** `backend/src/catalogos/clientes.controller.ts`. **Función afectada:** `cuentaCorriente()` — endpoint `GET /clientes/:id/cuenta-corriente`.

## 2. Problema original

`cuentaCorriente()` consultaba `this.prisma.factura.findMany({ where: { clienteId: id }, ... })` sin ningún filtro sobre `Factura.estado`. `EstadoFacturaEnum` incluye `ANULADO`; cada factura anulada seguía sumando su `importe` completo al `debe` y al `saldoActual` mostrados. El filtro de cobranzas anuladas (`anulada: false`) ya excluía correctamente ese lado del cálculo, pero el lado de facturas quedaba sin el equivalente. Riesgo: un cliente con al menos una factura anulada veía un saldo deudor mayor al real, dato consumido directamente por Facturación/Gerencia.

## 3. Solución implementada

El `where` de `this.prisma.factura.findMany(...)` pasó de `{ clienteId: id }` a `{ clienteId: id, estado: { not: "ANULADO" } }` — mismo patrón ya usado en el propio proyecto (`inteligencia/aging.service.ts`) para el mismo concepto. Sin cambios en el filtro de cobranzas anuladas, en el orden cronológico de movimientos, ni en la forma de la respuesta (mismo shape, mismos campos y tipos). Alcance: únicamente esa condición, en esa función, en ese archivo. Limitación conocida y aceptada: el orden de movimientos por `fecha`, sin regla de desempate contra `Factura.fecha`, es un defecto preexistente no atribuible a H-08 (hallazgo 2.6 de la auditoría adversarial) — no se corrigió porque está fuera del alcance de este hallazgo.

## 4. Evidencia

- **Build:** confirmado sin errores durante Implementación y Revisión de Implementación (`REVISION_IMPLEMENTACION_BLOQUE11.md` §1).
- **Revisión de implementación:** conformidad total — `git diff` de `clientes.controller.ts` confirmó exactamente la condición agregada, sin tocar `create`/`update`/`remove`/exports; búsqueda exhaustiva de otros cálculos de `Factura` confirmó que ningún otro punto tenía el mismo defecto (`dashboard.controller.ts` y `aging.service.ts` ya excluían `ANULADO`; los 3 usos de `facturas.controller.ts` son listados que deliberadamente no filtran).
- **Validación funcional:** `VALIDACION_FUNCIONAL_BLOQUE11.md` §3 — flujo HTTP real completo (crear factura → cobrar parcialmente → anular cobranza → anular factura) sobre datos reales de desarrollo, 8 pasos, todos con el resultado esperado; caso final (factura anulada) confirma `movimientos: []`, `saldoActual: 0`. Estado declarado: **VALIDADO**.
- **Auditoría adversarial:** `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §2 — 6 vectores adversariales (otros cálculos financieros, cobranza sobre factura anulada, importe negativo, sobre-pago, reconciliación total, orden de movimientos con fechas retroactivas). 5 con **SIN HALLAZGO**; 1 (orden de movimientos) con **HALLAZGO MENOR**, explícitamente preexistente y no atribuible a H-08. Estado declarado: **H-08: sin hallazgo bloqueante**.
- **Tests relacionados:** ninguno automatizado específico de H-08 (validación manual HTTP real, mismo criterio metodológico usado en todo el proyecto hasta H-04); cubierto indirectamente por la suite de H-04 solo en cuanto a que el build/test general no se rompió.
- **Datos de prueba:** conservados en la base de desarrollo, trazables (`VALIDACION_FUNCIONAL_BLOQUE11.md` §3), sobre `Cliente Demo A` y su único viaje `DESCARGADO`/`PENDIENTE_DE_FACTURAR` disponible — no se generó ni se eliminó ningún dato productivo.

## 5. Criterios de aceptación

| Criterio | Estado |
|---|---|
| `cuentaCorriente()` excluye facturas `ANULADO` del cálculo de `debe`/`saldoActual` | CUMPLIDO |
| Regresión confirmada en clientes sin facturas anuladas (saldo idéntico al comportamiento previo) | CUMPLIDO |
| Caso borde: cliente con el 100% de sus facturas `ANULADO` → `movimientos: []`, `saldoActual: 0`, sin error | CUMPLIDO |
| Ningún otro método del mismo controller modificado (`create`/`update`/`remove`/exports) | CUMPLIDO |
| Ningún otro cálculo financiero equivalente con el mismo defecto | CUMPLIDO |
| Filtro de cobranzas anuladas y orden cronológico sin alterar | CUMPLIDO |
| Validación funcional HTTP real | CUMPLIDO |
| Auditoría adversarial sin hallazgo bloqueante | CUMPLIDO |
| Build exitoso | CUMPLIDO |

**9/9 CUMPLIDO.**

## 6. Riesgo residual

**BAJO.** Documentado en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`: el cambio corrige un valor financiero ya visible para usuarios reales — no es una regresión, es la corrección de un dato que ya estaba mal. Mitigación ya decidida por el Product Owner: una consulta de verificación contra datos reales de producción (cuántos clientes tienen al menos una factura `ANULADO`, cuánto cambia su saldo) queda pendiente **como actividad previa al despliegue**, explícitamente fuera del alcance de esta implementación y de este cierre — no bloquea el cierre del hallazgo en sí. El hallazgo menor de presentación (orden de movimientos con fechas retroactivas) queda registrado como deuda preexistente, no de H-08, sin acción en este cierre.

## 7. Resolución

H-08 corregido. H-08 validado funcionalmente. H-08 auditado adversarialmente sin hallazgo bloqueante. H-08 apto para integración.

## 8. Trazabilidad

- **Auditoría:** `AUDITORIA_BLOQUE11_SEGURIDAD.md` (H-08), `AUDITORIA_ADVERSARIAL_BLOQUE11.md` §2.
- **Diseño:** `DISEÑO_BLOQUE11_SEGURIDAD.md` §4.6, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (H-08).
- **Implementación:** `PRE_IMPLEMENTACION_BLOQUE11.md` (orden de implementación, sin ajustes propios de H-08), `REVISION_IMPLEMENTACION_BLOQUE11.md` §1.
- **Validación:** `VALIDACION_FUNCIONAL_BLOQUE11.md` §3.
- **Cierre:** `ESTADO_BLOQUE11.md`, `CIERRE_FORMAL_H08_BLOQUE11.md` (este documento).

## 9. Estado del repositorio

```
$ git status --short | wc -l
53
$ git diff --stat | tail -1
9 files changed, 5930 insertions(+), 2466 deletions(-)
```

De los archivos modificados, `backend/src/catalogos/clientes.controller.ts` corresponde a H-08 (y también a H-01, mismo archivo, métodos distintos). El resto de los modificados (`auth.controller.ts`, `auth.module.ts` de H-07; `choferes.controller.ts`, `transportistas.controller.ts` de H-01; `main.ts`, `package.json`/`package-lock.json` de H-07; `organizacion-prisma.client.ts` de H-02; `frontend/railway.json`, ajeno) no corresponden a H-08. El repositorio **no está limpio** — ninguno de estos cambios fue commiteado en ninguna etapa de esta cadena. No se ejecutó `git add`, `commit` ni `push` en esta etapa.

## 10. Conclusión

**H-08 CERRADO FORMALMENTE — APTO PARA INTEGRACIÓN**

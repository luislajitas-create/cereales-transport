# Acta de Cierre — Bloque 10.5: Pago Consolidado (Backend)

**Estado: CERRADO**, aprobado explícitamente por el Product Owner. Fecha: 2026-07-19. Sobre la base ya cerrada de Bloques 10.1 a 10.4 (SDC v1.1), siguiendo `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, `DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md` y `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, con auditoría adversarial completa (`AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`) y análisis forense de sus hallazgos (`ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md`), ambos documentos de control formalmente aprobados.

---

## 1. Alcance implementado

Primer mecanismo de todo SDC en el que un pago único aplica sobre liquidaciones de **varias organizaciones** del mismo Grupo Económico para un mismo beneficiario (chofer con identidad compartida, Bloque 10.2).

- **Modelos nuevos** (`schema.prisma`): `PagoConsolidado`, `PagoConsolidadoLiquidacion`, enums `EstadoPagoConsolidadoEnum` (`BORRADOR`/`PREPARADO`/`PROCESANDO`/`CONFIRMADO`/`PARCIAL`/`FALLIDO`/`CANCELADO`) y `EstadoAplicacionPagoConsolidadoEnum` (`PENDIENTE`/`APLICADA`/`FALLIDA`). Campo nuevo `Liquidacion.pagoConsolidadoLiquidacionId` (bloqueo persistente, único, opcional). Migración `20260718043131_pago_consolidado_grupo_economico`, aplicada y verificada.
- **Ciclo de vida de tres etapas** (Decisión Técnica 2): `crear()` (`BORRADOR`, sin bloqueo), `preparar()` (adquiere bloqueo persistente por organización, `PREPARADO`), `confirmar()` (aplica el pago real por organización dentro de su propia transacción, con reintento idempotente sobre filas no aplicadas — Decisión Técnica 1). `cancelar()` solo permitido antes de que cualquier liquidación haya sido efectivamente pagada (Decisión Técnica 5).
- **Sin compensación automática tipo saga entre organizaciones** para el paso de pago (Decisión Técnica 1) — un resultado `PARCIAL` es un estado legítimo y esperado, no una falla del diseño; no existe, con la arquitectura actual, una transacción física que cruce organizaciones para el dinero en sí.
- **Autorización** (Decisión Técnica 4): `ADMINISTRADOR` en los 7 endpoints, más acceso explícito y vigente (`AccesoGrupoEconomico`) a cada organización involucrada, revalidado en **cada** llamada — nunca confía en una autorización previamente válida.
- **7 endpoints** en `PagoConsolidadoController`: `candidatos`, `crear`, `listar`, `consultar`, `preparar`, `confirmar`, `cancelar`.

---

## 2. Incidentes y hallazgos a lo largo del bloque — todos resueltos

Bloque con más incidentes reales que cualquier otro de SDC v1.1, todos identificados y cerrados antes de este acta:

1. **Incidente de datos** durante la implementación: un uso indebido de `prisma migrate diff --shadow-database-url` apuntado a la base de desarrollo real la vació por completo. Recuperado en tres etapas separadas y autorizadas explícitamente (preservación y diagnóstico → reconstrucción desde migraciones + seed → actualización del seed multiempresa), sin ningún impacto en producción (confirmado: hosts de base de datos distintos). El seed de desarrollo (`backend/prisma/seed.js`) quedó reescrito para el schema multiempresa actual como parte de esta recuperación.
2. **Bug de pérdida de contexto de `AsyncLocalStorage`**: el patrón `organizacionContextStorage.run({organizacionId}, () => promesa)` sin `await` interno pierde el contexto porque Prisma difiere el despacho real de la query a un microtask posterior. Encontrado y corregido durante la validación funcional inicial, antes de cualquier auditoría adversarial.
3. **Conflicto con la FK compuesta de `AuditLog.usuario`** (`[usuarioId, organizacionId] → Usuario[id, organizacionId]`): un administrador de grupo económico no es `Usuario` nativo de las organizaciones ajenas a las que tiene acceso vía `AccesoGrupoEconomico`, así que auditar en su nombre en esas organizaciones viola la FK. Resuelto con decisión explícita del Product Owner: `usuarioId: null` + identidad real del actor en `datosNuevos/datosAnteriores.actorId` para organizaciones ajenas al actor — sin migración, sin relajar la FK compartida por todo el sistema.
4. **Inconsistencia transaccional en `crear()`**: la creación del `PagoConsolidado` y su auditoría no estaban acopladas — corregido envolviendo ambas en una única transacción, antes de la auditoría adversarial formal.
5. **Refactor de mantenibilidad** (autorizado explícitamente, sin cambio de comportamiento): extracción de `obtenerPagoOFallar()` y `liberarBloqueo()`, ambas duplicadas de forma idéntica en varios métodos.
6. **Auditoría adversarial completa** (`AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`) contra las doce dimensiones exigidas — ver sección 3.
7. **Hallazgos 1 y 2 de la auditoría adversarial**, analizados forensemente (`ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md`) y corregidos — ver sección 4.

Ninguno de estos incidentes o hallazgos permitió, en ningún momento, fuga de datos entre organizaciones, bypass de autorización, doble pago, ni corrupción del bloqueo persistente.

---

## 3. Auditoría adversarial — resumen por categoría

Las doce dimensiones exigidas, atacadas con código real y con peticiones HTTP verdaderamente concurrentes (no simuladas) contra un servidor de desarrollo vivo:

| Categoría | Resultado |
|---|---|
| Aislamiento multiempresa | Sin hallazgos |
| Autorizaciones (incluida una prueba TOCTOU real de revocación de acceso a mitad de flujo) | Sin hallazgos |
| Idempotencia y reintentos | Sin hallazgos |
| Concurrencia y bloqueo persistente (3 escenarios de carrera real) | Sin hallazgos |
| Consistencia, transacciones y compensaciones | 2 hallazgos medios — **corregidos** (sección 4) |
| Estados inválidos (matriz completa de transiciones) | Sin hallazgos |
| Auditoría | 1 hallazgo estructural, mismo que el anterior — **corregido** |
| Regresión sobre Bloques 10.1–10.4 (round-trips reales de escritura, no solo lecturas) | Sin hallazgos |

Un hallazgo informativo adicional (`listar()` deniega por completo si el actor carece de acceso a cualquier organización tocada por cualquier pago del grupo — falla en el sentido seguro, nunca filtra de más) queda documentado para una futura decisión de producto, no bloqueante.

---

## 4. Hallazgos 1 y 2 — análisis forense y corrección mínima

`ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md` respondió, punto por punto para cada hallazgo, la secuencia exacta de fallo, el punto de commit, el estado final de cada tabla, la respuesta al cliente, el comportamiento del reintento, la posibilidad de estados falsos, la posibilidad de auditoría faltante, y —el punto más importante— por qué **ninguno de los dos puede producir doble pago**: la garantía real depende únicamente de que `Liquidacion.estado` nunca se revierte de `PAGADA` a `CONFIRMADA`, independientemente de lo que digan `estadoAplicacion` o la auditoría.

El análisis descubrió, además, una consecuencia adicional del Hallazgo 2 no señalada en la auditoría original: si el proceso muere mientras un pago está en `PROCESANDO`, no existe ningún camino de código para sacarlo de ese estado (ni `confirmar()` ni `cancelar()` lo aceptan como estado de entrada). **Esta consecuencia queda expresamente fuera del alcance de este bloque**, por decisión explícita del Product Owner — no bloquea el cierre; podrá abrirse como una Decisión Técnica independiente si corresponde, porque tocaría la tabla de transiciones ya aprobada (Decisión 5).

**Corrección mínima aplicada** (alcance exacto autorizado, sin tocar reglas funcionales, estados, autorizaciones, DTOs, endpoints ni schema):

1. `preparar()`: adquisición de bloqueo + transición a `PREPARADO` + auditoría, unificadas en una única transacción física. La compensación manual que existía antes se eliminó por quedar redundante (y potencialmente incorrecta) una vez que la reversión nativa de la transacción cubre el mismo caso.
2. `cancelar()`: liberación de bloqueo + transición a `CANCELADO` + auditoría, unificadas en una única transacción física.
3. `confirmar()`: el `update` de `PagoConsolidadoLiquidacion.estadoAplicacion = "APLICADA"` se movió dentro del mismo `$transaction` que aplica el pago real.

**Reverificación tras la corrección** (exclusivamente las pruebas afectadas, ver `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`, sección 6): `cancelar()` transaccional verificado; `preparar()` verificado bajo dos carreras reales adicionales, una de ellas forzando explícitamente una reversión con trabajo previo real que deshacer dentro de la misma transacción; ciclo completo de fallo parcial + reintento de `confirmar()` repetido íntegramente, con resultado externo idéntico al de antes de la corrección — confirma que la corrección no cambió ningún comportamiento observable, solo cerró la ventana de inconsistencia interna. Sin duplicados de auditoría, sin bloqueos huérfanos, sin discrepancia entre `Liquidacion.estado`, `estadoAplicacion` y el rastro de auditoría en ningún escenario probado.

---

## 5. Validaciones técnicas ejecutadas

1. `npm run build` limpio en cada etapa: implementación inicial, corrección del bug de `AsyncLocalStorage`, resolución del conflicto de `AuditLog`, refactor de mantenibilidad, y las tres correcciones finales de los Hallazgos 1 y 2.
2. `npx prisma validate` y `npx prisma migrate deploy` — esquema válido, migración aplicada limpiamente sobre la base reconstruida.
3. Servidor de desarrollo levantado y detenido múltiples veces a lo largo del bloque, `GET /api/v1/health` → `200` en cada arranque.
4. Validación funcional completa contra datos reales sembrados (`admin@demo.com`, Organización Principal y Organización B, chofer compartido, dos liquidaciones `CONFIRMADA`), no contra mocks.

---

## 6. Archivos

**Nuevos:**
- `backend/prisma/migrations/20260718043131_pago_consolidado_grupo_economico/`
- `backend/src/grupo-economico/dto/crear-pago-consolidado.dto.ts`
- `backend/src/grupo-economico/dto/cancelar-pago-consolidado.dto.ts`
- `backend/src/grupo-economico/pago-consolidado.service.ts`
- `backend/src/grupo-economico/pago-consolidado.controller.ts`
- `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, `DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md`, `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`
- `AUDITORIA_ADVERSARIAL_BLOQUE10.5.md`, `ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md`
- `AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md` (auditoría del frontend de Pago Consolidado, producida en la misma etapa junto con la de 10.5 — 10.6 en sí **no** está implementado, queda como base para su propio bloque futuro)
- Este documento (`ACTA_CIERRE_BLOQUE10.5.md`)

**Modificados:**
- `backend/prisma/schema.prisma` (modelos y enums nuevos, sin tocar ningún modelo preexistente más allá del campo de bloqueo en `Liquidacion` y las relaciones inversas necesarias).
- `backend/prisma/seed.js` (reescrito para el schema multiempresa actual, como parte de la recuperación del entorno — sin `PagoConsolidado` en el seed, por decisión explícita).
- `backend/src/grupo-economico/grupo-economico.module.ts` (registro del nuevo controller/service).
- `backend/src/prisma/usuario-grupo-lookup.service.ts` (nuevo método `resolverChoferesDeIdentidad()`).
- `docs/roadmap/PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` (marca Bloque 10.5 como cerrado).

**Sin cambios:** ningún endpoint de Liquidaciones/Facturas/Anticipos/Cobranzas; `ORGANIZACION_PRISMA`/`organizacion-prisma.client.ts` (revertido tras uso diagnóstico temporal); ningún archivo de frontend.

---

## 7. Residuos conocidos

**Ninguno.** Todos los `PagoConsolidado` de prueba generados durante la implementación, la auditoría adversarial y la reverificación fueron eliminados; `Liquidacion` del seed restauradas a `CONFIRMADA` sin bloqueo ni `fechaPago`; los usuarios y la organización temporales creados exclusivamente para las pruebas de autorización de la auditoría adversarial fueron eliminados. El único `AccesoGrupoEconomico` vigente es el original del seed oficial. Confirmado contra la base real antes de este cierre.

Queda, sin relación con este bloque, el fixture ya documentado de `otorgadoPorId` en Organización B (mejora de mantenimiento futura, no bloqueante — registrado en memoria de sesiones previas).

---

## 8. Qué queda fuera de este bloque (confirmado, no implementado)

- **Bloque 10.6** (frontend de Pago Consolidado) — auditado (`AUDITORIA_BLOQUE10.6_PAGO_CONSOLIDADO.md`) pero no diseñado ni implementado. Requiere su propio ciclo completo.
- **Decisión técnica sobre `PROCESANDO` sin salida** (sección 4) — expresamente excluida de este bloque por decisión del Product Owner.
- **Filtrado parcial de `listar()`** (Hallazgo 3, informativo) — cambio de comportamiento, no de corrección; pendiente de una futura decisión de producto si se decide abordar.

---

## 9. Rollback

Revertir la migración `20260718043131_pago_consolidado_grupo_economico` (aditiva pura: 2 `CREATE TYPE`, 1 `ALTER TABLE ADD COLUMN`, 2 `CREATE TABLE` — ningún dato preexistente se transforma ni se pierde al revertirla) y los archivos listados en la sección 6. Sin impacto en ningún dato de `Liquidacion`/`Viaje`/`Factura`/`Cobranza` existente antes de este bloque.

---

## 10. Conclusión técnica

Bloque 10.5 cumple exactamente el alcance autorizado en `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sin ninguna desviación de las cinco decisiones aprobadas. Es, además, el bloque de todo SDC v1.1 con el proceso de control más exigente hasta la fecha: incidente real de datos recuperado sin pérdida de información de producción, bug de concurrencia real encontrado y corregido, conflicto arquitectónico real con un modelo compartido (`AuditLog`) resuelto sin relajar su integridad, auditoría adversarial completa con ataques reales (incluida concurrencia HTTP genuina, no simulada), análisis forense de cada hallazgo antes de decidir su corrección, y reverificación completa después de corregir. No queda ningún hallazgo crítico ni ningún hallazgo medio sin resolver. El entorno de desarrollo quedó restaurado a su línea base documentada.

---

**Aprobado explícitamente por el Product Owner.** Autoriza `git add` / `commit` / `push` de los archivos listados en la sección 6.

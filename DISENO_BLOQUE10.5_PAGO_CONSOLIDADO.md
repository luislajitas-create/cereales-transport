# Diseño Técnico — Bloque 10.5: Pago Consolidado (Backend)

Fecha: 2026-07-17. Etapa de Diseño — `METODOLOGIA_SDC.md`, etapa 2. **No se escribió código, no se modificó ningún archivo, no se hizo git.** Se apoya en `AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md` (aprobada como base técnica) y en `docs/cierres/HITO_ESTABILIZACION_v1.1.md`/`docs/RELEASE_NOTES_v1.1.md` para el estado real de lo ya construido. **No se usan los documentos históricos de diseño (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, etc.) como fuente de verdad donde contradicen al código real** — se citan únicamente donde la auditoría ya confirmó que coinciden. No se auto-aprueba — queda a la espera de aprobación explícita.

---

## 1. Alcance funcional exacto

- Modelos nuevos `PagoConsolidado` y `PagoConsolidadoLiquidacion`, a nivel de grupo (no organizacionales), migración aditiva.
- Endpoint de candidatos: liquidaciones `CONFIRMADA`, tipo `CHOFER`, del mismo beneficiario real (vía `IdentidadChoferGrupo`), de organizaciones que pertenecen, en este momento, al mismo `GrupoEconomico`, no incluidas todavía en un `PagoConsolidado` no anulado — agregadas de todas las organizaciones del grupo en una sola respuesta.
- Endpoint de creación: arma un `PagoConsolidado` en borrador con las liquidaciones elegidas, sin tocar ninguna liquidación todavía.
- Endpoint(s) de confirmación/pago: marcan, en cada organización involucrada, la liquidación correspondiente como pagada — ver capítulo dedicado (sección 7) para el número exacto de pasos, todavía sin decidir.
- Endpoint de anulación: revierte lo que sea reversible según el capítulo dedicado.
- Endpoints de consulta: listado y detalle de pagos consolidados existentes.
- Autorización por `AccesoGrupoEconomico` — independiente del rol funcional, mismo criterio ya establecido desde 10.3.a.
- Auditoría: una entrada de `AuditLog` por organización involucrada en cada operación (el modelo `AuditLog` sigue exigiendo `organizacionId`, confirmado en la auditoría).
- **Alcance exclusivo del circuito `CHOFER`** — confirmado como decisión de negocio ya aprobada (Decisión 1, `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`), no una limitación técnica nueva.

## 2. Exclusiones

- **Frontend (Bloque 10.6)** — ningún componente, pantalla ni contrato de UI se diseña acá.
- **Cambios de UX** — no aplica, no hay UX en este sub-bloque.
- **Migraciones no justificadas** — la única migración de este diseño es la aditiva de la sección 5; ningún otro modelo existente se modifica salvo que la Alternativa A de la sección 6.3 sea la elegida en la etapa de Decisiones (marcado explícitamente como condicional, no decidido acá).
- **Identidad compartida de Chofer** — ya cerrada en 10.2, se consume tal cual, sin reabrir ninguna decisión.
- **Cambio de organización activa** — ya cerrado en 10.3.b/10.4.b; confirmado en la auditoría que **no es el mecanismo que este bloque necesita** (sección 4 de la auditoría) — no se reabre, no se modifica.
- **Reglas de negocio nuevas ajenas a Pago Consolidado** — ninguna decisión de negocio se reabre (compensación automática entre organizaciones sigue prohibida, Decisión 2; alcance exclusivo `CHOFER` sigue vigente, Decisión 1).
- **Refactors generales** — ningún archivo existente se toca salvo el registro del módulo nuevo (`grupo-economico.module.ts`) y, condicionalmente, la extensión del allow-list de `PrismaService` crudo (sección 6.2).
- **Circuito `TRANSPORTISTA`** — sin caso real confirmado (auditoría, y Decisión 1 del PO), queda fuera.
- **Comprobante consolidado** — aprobado explícitamente para después (Decisión 5 del PO).
- **Cuenta corriente intercompany, compensación de saldos, vista consolidada del Centro de Inteligencia** — fuera de alcance, ya descartados en la documentación previa y sin ningún caso real que los justifique ahora.

---

## 3. Arquitectura propuesta

### Por qué este módulo no encaja en el patrón ya usado por el resto de `grupo-economico/`

Todos los controllers existentes de `grupo-economico/` (`GrupoEconomicoController`, `AccesoGrupoController`, `IdentidadChoferGrupoController`, `OrganizacionesAccesiblesController`) resuelven sus operaciones con una sola invocación a `ORGANIZACION_PRISMA`, en el contexto ya sembrado por la request activa — porque, hasta ahora, ninguna operación de grupo necesitó leer o escribir datos organizacionales de **más de una** organización dentro de la misma operación (`AccesoGrupoEconomico`, `IdentidadChoferGrupo` y `GrupoEconomico` en sí no son organizacionales, así que nunca necesitaron cruzar el límite). Pago Consolidado es la primera operación de todo el proyecto que sí lo necesita — su candidato principal (`Liquidacion`) **es** organizacional.

### Piezas nuevas

| Pieza | Responsabilidad |
|---|---|
| `PagoConsolidadoService` (nuevo) | Único punto que orquesta la secuencia de invocaciones a `organizacionContextStorage.run(...)`, una por organización involucrada — nunca una consulta que cruce organizaciones. Inyecta `ORGANIZACION_PRISMA` (para las operaciones dentro de cada contexto abierto explícitamente) **y**, para un único propósito acotado, `PrismaService` crudo (sección 6.2) — tercer consumidor del allow-list documentado en `prisma.module.ts`, después de `AuthService` y `UsuarioGrupoLookupService`. |
| `PagoConsolidadoController` (nuevo) | HTTP puro — valida el DTO, resuelve `:id` (grupo) contra `actor`, delega toda la orquestación real al servicio. `@UseGuards(JwtAuthGuard)` únicamente, sin `RolesGuard` — mismo criterio que `OrganizacionesAccesiblesController` (10.4.a): el acceso de grupo es independiente del rol. |
| Modelos `PagoConsolidado`/`PagoConsolidadoLiquidacion` | Nivel de grupo, no organizacionales — mismo tratamiento que `GrupoEconomico`/`AccesoGrupoEconomico`/`IdentidadChoferGrupo`. |

### Por qué se necesita `PrismaService` crudo, para qué exactamente, y para nada más

Resolver "qué organizaciones y qué `Chofer` están vinculados a esta `IdentidadChoferGrupo`" exige leer `Chofer` (modelo organizacional) **sin** que ninguna organización esté todavía activa en el contexto — exactamente el mismo problema ya resuelto en 10.3.a para `UsuarioGrupoLookupService` (leer `Usuario`, organizacional, de cualquier organización). Se propone un método nuevo, estrecho, siguiendo la misma disciplina ya establecida (`prisma.module.ts`): `resolverChoferesDeIdentidad(identidadChoferGrupoId): { choferId, organizacionId, nombre }[]` — nunca un método genérico, nunca expone campos más allá de los estrictamente necesarios. **Este es el único uso de Prisma crudo de todo el diseño** — cualquier lectura o escritura de `Liquidacion`, `LiquidacionViaje`, `Viaje`, etc. sigue pasando exclusivamente por `ORGANIZACION_PRISMA`, dentro de un contexto explícitamente abierto (sección 4).

---

## 4. Flujo completo de Pago Consolidado

### 4.1 Candidatos

1. El actor pide candidatos para un `identidadChoferGrupoId` dentro de un grupo `:id`.
2. El servicio verifica que la organización del actor pertenece al grupo `:id` (mismo patrón `verificarGrupo()` ya usado en `AccesoGrupoController`).
3. Vía `PrismaService` crudo (sección 3), resuelve todas las organizaciones que tienen un `Chofer` vinculado a esa `IdentidadChoferGrupo`.
4. Filtra esas organizaciones a las que, **en este momento**, siguen perteneciendo al grupo `:id` — revalidado, nunca asumido desde el vínculo original (mismo criterio ya aplicado en `cambiarOrganizacion()`, 10.3.b).
5. Para cada organización resultante, `organizacionContextStorage.run({organizacionId}, ...)` y consulta, vía `ORGANIZACION_PRISMA`, las `Liquidacion` `CONFIRMADA` de tipo `CHOFER` de ese chofer que no estén ya incluidas en un `PagoConsolidadoLiquidacion` cuyo `PagoConsolidado` no esté `ANULADO`.
6. Combina los resultados de todas las organizaciones **en memoria, del lado del servicio** — nunca en una consulta — y responde una sola lista, con la organización de cada liquidación explícita en cada fila.

### 4.2 Creación (borrador)

1. Body: `identidadChoferGrupoId`, un arreglo de `{ organizacionId, liquidacionId }`, `referenciaPago` opcional.
2. Revalida cada ítem exactamente como en el paso 5 de candidatos (nunca confía en una lista de candidatos ya mostrada antes — puede haber cambiado).
3. Verifica que **todas** las liquidaciones correspondan, transitivamente por su `Chofer`, al mismo `identidadChoferGrupoId` declarado — nunca se arma un pago mezclando beneficiarios (regla ya aprobada, `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 5, y coherente con la auditoría).
4. Crea el `PagoConsolidado` en `BORRADOR`, con el total como la suma exacta de los `netoPagar` de las liquidaciones incluidas (copiados al momento, mismo criterio de integridad que `LiquidacionViaje.subtotal`), y una fila de `PagoConsolidadoLiquidacion` por cada liquidación, con la organización explícita.

### 4.3 Confirmación / pago

Ver capítulo obligatorio (sección 7) — el número exacto de pasos (uno o dos) y el mecanismo ante fallo parcial son, deliberadamente, alternativas sin decidir en este documento.

### 4.4 Anulación

Revierte lo que sea reversible según el estado real del `PagoConsolidado` en el momento de anular — ver sección 7 para el detalle exacto de qué es reversible y qué no, dado el estado actual del código.

### 4.5 Consulta

Listado y detalle simples, filtrados por grupo `:id`, sin ninguna orquestación cruzando organizaciones más allá de lo ya calculado y guardado en `PagoConsolidado`/`PagoConsolidadoLiquidacion` (no vuelve a consultar cada organización en cada lectura — los datos ya están copiados).

---

## 5. Modelo de datos propuesto (descriptivo, sin migración)

**`PagoConsolidado`** — nivel de grupo, no organizacional.
- Campos: id, `grupoEconomicoId`, `identidadChoferGrupoId` (beneficiario), `estado` (nombres funcionales orientativos, a definir en la etapa de Decisiones — ver sección 7), `totalConsolidado`, `referenciaPago` (texto libre, opcional), `creadoPorId`, `confirmadoPorId`/`pagadoPorId` (según cuántos pasos se decidan), `anuladoPorId`, `anuladoMotivo`, `createdAt`, `updatedAt`.
- Relación: `N` `PagoConsolidadoLiquidacion`.

**`PagoConsolidadoLiquidacion`** — nivel de grupo, no organizacional (une organizaciones distintas).
- Campos: id, `pagoConsolidadoId`, `organizacionId` (explícito, nunca inferido), `liquidacionId`, `subtotalNetoPagar` (copiado al momento de incluir, mismo criterio que `LiquidacionViaje`), `createdAt`.
- Restricción de unicidad: ver sección 6.3 — dos alternativas, sin decidir.

**Sin cambios en `Liquidacion`, `LiquidacionViaje`, `LiquidacionMovimiento`, `AnticipoGasto`, `Chofer`, `IdentidadChoferGrupo`** — salvo que la Alternativa A de la sección 6.3 sea la elegida, condición explícita, no asumida.

---

## 6. Contratos backend

### 6.1 Endpoints propuestos

| Endpoint | Método | Body/Query | Autorización |
|---|---|---|---|
| `/grupo-economico/:id/pagos-consolidados/candidatos` | `GET` | `?identidadChoferGrupoId=` | `AccesoGrupoEconomico` (verificación exacta, sección 6.4) |
| `/grupo-economico/:id/pagos-consolidados` | `POST` | `CrearPagoConsolidadoDto` | ídem |
| `/grupo-economico/:id/pagos-consolidados` | `GET` | — | ídem |
| `/grupo-economico/:id/pagos-consolidados/:pagoId` | `GET` | — | ídem |
| `/grupo-economico/:id/pagos-consolidados/:pagoId/confirmar` (y/o `/pagar`, sección 7) | `POST` | — o `{ fechaPago? }` | ídem |
| `/grupo-economico/:id/pagos-consolidados/:pagoId/anular` | `POST` | `AnularPagoConsolidadoDto` (`motivo` obligatorio) | ídem |

### 6.2 DTOs

- `CrearPagoConsolidadoDto`: `identidadChoferGrupoId: string` (`@IsUUID()`), `items: { organizacionId: string; liquidacionId: string }[]` (`@ArrayMinSize(1)`), `referenciaPago?: string`.
- `AnularPagoConsolidadoDto`: `motivo: string` (obligatorio — mismo criterio ya usado en el resto del proyecto para acciones destructivas de alto impacto).
- DTO de confirmar/pagar: depende de la sección 7 — si hay un paso de "pagar" separado, análogo a `PagarLiquidacionDto` (`fechaPago?`).

### 6.3 La restricción de unicidad de `PagoConsolidadoLiquidacion` — dos alternativas, sin decidir

Prisma no admite un `@@unique` condicionado a "mientras el `PagoConsolidado` contenedor no esté anulado" — no es una limitación de este diseño, es una limitación real del motor.

**Alternativa A — agregar un campo de bloqueo a `Liquidacion`**, mismo patrón exacto que `AnticipoGasto.liquidado`: un booleano (o una referencia opcional al `PagoConsolidadoLiquidacion` activo) que permite el mismo `updateMany` condicional ya probado dos veces en este proyecto (`create()` de liquidaciones, y `AccesoGrupoEconomico`). Ventaja: garantía atómica real a nivel de base, mismo patrón ya validado. Desventaja: modifica un modelo existente y ya cerrado (`Liquidacion`) con un concepto que hoy no conoce — es la única migración de este diseño que tocaría un modelo fuera de los dos nuevos.

**Alternativa B — sin cambios en `Liquidacion`, verificación a nivel de aplicación** antes de cada `create()` de `PagoConsolidadoLiquidacion` (`findFirst` con join a `PagoConsolidado.estado != ANULADO`). Ventaja: no toca ningún modelo existente. Desventaja: sin garantía atómica a nivel de base — una carrera real (dos "crear pago consolidado" simultáneos incluyendo la misma liquidación) no queda completamente descartada, solo hecha muy improbable.

**No se elige entre A y B en este documento** — queda para la etapa de Decisiones Técnicas.

### 6.4 Autorización exacta — pregunta abierta, no decidida

Dos interpretaciones razonables de "usuario con `AccesoGrupoEconomico`" aplicadas a una operación que, por naturaleza, toca más de una organización a la vez:

- **Interpretación 1 — pertenencia al grupo alcanza:** el actor solo necesita que su propia organización pertenezca al grupo `:id` (mismo `verificarGrupo()` ya usado en el resto de `grupo-economico/`) — no se exige `AccesoGrupoEconomico` explícito hacia cada organización cuyas liquidaciones se estén incluyendo.
- **Interpretación 2 — acceso explícito a cada organización involucrada:** el actor necesita, además de pertenecer al grupo, un `AccesoGrupoEconomico` vigente hacia **cada** organización distinta de la suya que aparezca en el pago — mismo nivel de exigencia que ya rige para poder, hoy, ver u operar cualquier dato organizacional de otra organización (`cambiarOrganizacion()`, 10.3.b).

La Decisión 3 del Product Owner ("todo el equipo administrativo de ambas empresas puede ver y operar sobre el grupo completo") hace que, en el caso real actual de dos organizaciones, ambas interpretaciones coincidan en la práctica — pero divergen en cuanto el grupo creciera a más de dos organizaciones con accesos otorgados de forma desigual. **No se decide acá cuál rige.**

---

## 7. Modelo transaccional y estrategia ante fallos parciales

### Dónde comienza y dónde termina la operación

La creación de un `PagoConsolidado` (sección 4.2) es una sola escritura, a nivel de grupo, sin tocar ninguna organización — empieza y termina en una única operación, sin riesgo de estado intermedio real. **El punto crítico de todo el diseño es la confirmación/pago** (sección 4.3): empieza cuando el actor dispara la acción, y "termina", en la práctica, recién cuando la última organización de la secuencia respondió — éxito o fallo.

### Qué pasos son atómicos

- **Dentro de una organización**: sí. Marcar `Liquidacion.estado = PAGADA` junto con todos sus `Viaje.estadoLiquidacion = PAGADO` es un único `$transaction`, exactamente el mismo patrón que ya usa `LiquidacionesController.pagar()` hoy (`liquidaciones.controller.ts:695-703`) — reutilizable sin cambios conceptuales, una vez por organización.
- Marcar el propio `PagoConsolidado.estado` (una fila, a nivel de grupo) es, en sí mismo, una escritura atómica trivial.

### Qué NO puede ser atómico

La combinación de "marcar `N` liquidaciones como pagadas, cada una en su propia organización" **más** "marcar el `PagoConsolidado` como pagado", como una única operación indivisible — no existe, en la arquitectura actual, ningún mecanismo que permita una transacción de base de datos abarcando más de un contexto organizacional a la vez (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 4), y debilitar `ORGANIZACION_PRISMA` para lograrlo ya fue descartado explícitamente en la documentación previa a esta versión.

### Qué estados intermedios pueden existir

- El `PagoConsolidado` ya "en curso de pago", con 0 de N organizaciones escritas.
- El `PagoConsolidado` con `k` de `N` organizaciones ya escritas (su `Liquidacion` ya en `PAGADA`) y `N-k` todavía no.
- El caso límite: falla exactamente al pasar de la organización `k` a la `k+1` — el sistema, consultado organización por organización, es perfectamente consistente **dentro** de cada una (ninguna liquidación queda en un estado inválido); lo que queda inconsistente es únicamente la relación entre el estado del `PagoConsolidado` (a nivel de grupo) y la suma real de sus partes.

### Qué sucede si una organización confirma y otra falla — tres alternativas, sin decidir

**Alternativa 1 — Estado explícito de pago parcial, con reintento manual, idempotente por organización.**
Orden determinístico (ej. `organizacionId` ascendente). Ante un fallo, el `PagoConsolidado` queda en un estado nuevo y visible (nombre a definir) que muestra exactamente qué organizaciones ya se marcaron pagadas y cuáles no. Reintentar solo re-ejecuta las pendientes — nunca vuelve a tocar las ya exitosas (verificado antes de escribir: si esa organización ya está `PAGADA`, se salta). **Ventaja:** nunca se pierde el trabajo ya hecho; el sistema nunca miente sobre lo que realmente pasó. **Desventaja:** introduce un estado nuevo, exige que 10.6 sepa representarlo y ofrecer "reintentar", y depende de que alguien efectivamente reintente.

**Alternativa 2 — Compensación automática (estilo saga): revertir lo ya exitoso si algo falla, para preservar "todo o nada".**
Si la organización 2 falla, el sistema intenta revertir automáticamente lo que la organización 1 ya escribió. **Desventaja real, verificada, no hipotética:** exige construir, de todas formas, la reversión de una `Liquidacion` ya `PAGADA` — que **no existe hoy en ninguna forma** (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 3, `liquidaciones.controller.ts:715-717` rechaza explícitamente ese caso). Además, la propia compensación puede fallar, dejando exactamente el mismo problema que esta alternativa buscaba evitar, un nivel más abajo.

**Alternativa 3 — Revalidación exhaustiva antes de escribir nada, para reducir (no eliminar) la ventana de fallo.**
No es una alternativa excluyente de las otras dos — es una mitigación combinable con cualquiera: revalidar el estado real de cada liquidación, en cada organización, inmediatamente antes de empezar a escribir, reduce la probabilidad de que una organización falle por una condición ya detectable (liquidación ya no `CONFIRMADA`, anulada mientras tanto), pero no elimina el riesgo de un fallo real a mitad de la secuencia (caída de conexión, error de infraestructura).

### Qué operaciones pueden revertirse hoy, y cuáles no, con el código real existente (sin construir nada nuevo)

- Revertir un `PagoConsolidado` en `BORRADOR`, o uno donde ninguna organización llegó a escribir todavía: **sí, trivial** — solo se liberan las filas de `PagoConsolidadoLiquidacion`, ninguna `Liquidacion` fue tocada.
- Revertir un `PagoConsolidado` donde **al menos una** organización ya marcó su `Liquidacion` como `PAGADA`: **no es posible hoy** — exigiría, bajo cualquiera de las tres alternativas de arriba, construir la reversión de una liquidación pagada, pieza de lógica hoy inexistente en el sistema.

### Qué garantías de consistencia puede ofrecer honestamente cada alternativa

- **Alternativa 1:** consistencia eventual, con visibilidad total y permanente del estado real — nunca hay un momento en que el sistema "mienta", pero puede quedar a medio camino hasta que alguien actúe.
- **Alternativa 2:** apunta a consistencia total ("todo o nada" real), pero depende enteramente de construir, además, una reversión confiable de liquidaciones pagadas — sin eso construido, esta alternativa no es ejecutable tal como está descripta.
- **Alternativa 3:** no es, por sí sola, una garantía — es una reducción de probabilidad de la ventana de fallo, aplicable encima de cualquiera de las otras dos.

**Este documento no elige entre las tres alternativas.** Es, junto con las secciones 6.3 y 6.4, la decisión técnica más importante que queda pendiente para la etapa siguiente.

---

## 8. Servicios — resumen de responsabilidades

- `PagoConsolidadoService.candidatos(grupoId, identidadChoferGrupoId, actor)` — sección 4.1.
- `PagoConsolidadoService.crear(grupoId, dto, actor)` — sección 4.2.
- `PagoConsolidadoService.confirmar(grupoId, pagoId, actor)` / `.pagar(...)` (según sección 7) — orquesta la secuencia por organización.
- `PagoConsolidadoService.anular(grupoId, pagoId, dto, actor)` — revierte lo reversible (sección 7).
- Método nuevo en `UsuarioGrupoLookupService` o un servicio equivalente dedicado: `resolverChoferesDeIdentidad(identidadChoferGrupoId)` — único punto de acceso a `PrismaService` crudo de todo este diseño (sección 3).

## 9. Validaciones (resumen, ya detalladas en los flujos)

Identidad del beneficiario válida y perteneciente al grupo; cada organización de cada ítem pertenece, en este momento, al grupo; cada liquidación existe, es `CHOFER`, está `CONFIRMADA`, su chofer coincide con el beneficiario declarado, y no está ya incluida en un pago no anulado; el arreglo de ítems no está vacío; ninguna mezcla de beneficiarios; revalidación completa e independiente en cada paso del ciclo de vida (nunca confiar en lo ya verificado en un paso anterior).

## 10. Manejo de errores

Mensajes específicos por condición (a diferencia de `usuarios/resolver`, esto no es un flujo de resolución de identidad con riesgo de enumeración — es una operación ya `AccesoGrupoEconomico`-gated, entre pares administrativos del mismo grupo, donde la especificidad del error ayuda a operar, no filtra información sensible a un tercero). El manejo del fallo parcial en la confirmación/pago queda enteramente definido por la alternativa que se elija en la sección 7 — no se improvisa acá.

## 11. Auditoría

Una entrada de `AuditLog` por organización involucrada en cada operación (el modelo sigue exigiendo `organizacionId`, confirmado en la auditoría) — nunca una entrada única de "grupo" sin organización. Acciones nuevas propuestas: `pago_consolidado_creado`, `pago_consolidado_confirmado`/`pago_consolidado_pagado` (según sección 7), `pago_consolidado_anulado`, y — si la Alternativa 1 de la sección 7 resulta la elegida — `pago_consolidado_pago_parcial` o equivalente.

## 12. Archivos previstos a crear o modificar

**Nuevos:**
- `backend/src/grupo-economico/pago-consolidado.controller.ts`
- `backend/src/grupo-economico/pago-consolidado.service.ts`
- `backend/src/grupo-economico/dto/crear-pago-consolidado.dto.ts`
- `backend/src/grupo-economico/dto/anular-pago-consolidado.dto.ts`
- (Condicional a la sección 7) DTO de confirmar/pagar, si hay body.

**Modificados:**
- `backend/prisma/schema.prisma` — dos modelos nuevos; condicionalmente, un campo en `Liquidacion` (sección 6.3, Alternativa A).
- `backend/src/grupo-economico/grupo-economico.module.ts` — registrar el controller/servicio nuevo.
- `backend/src/prisma/usuario-grupo-lookup.service.ts` (o un servicio dedicado nuevo) — método nuevo de resolución cruzada (sección 3).
- `backend/src/prisma/prisma.module.ts` — actualizar el comentario/allow-list documentado, mismo criterio ya usado en cada extensión anterior.

**Sin cambios:** `LiquidacionesController`, `AccesoGrupoController`, `GrupoEconomicoController`, `IdentidadChoferGrupoController`, `ORGANIZACION_PRISMA`, `organizacion-context.ts`/`.interceptor.ts`, cualquier archivo de frontend.

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación propuesta |
|---|---|
| Fallo parcial entre organizaciones al confirmar/pagar | Sección 7 — tres alternativas descriptas, ninguna elegida todavía. |
| Reversión de una liquidación `PAGADA`, hoy inexistente | Necesaria bajo cualquier alternativa de la sección 7 que permita anular un pago ya ejecutado parcial o totalmente — su construcción queda como parte de la implementación de la alternativa que se elija, no de este documento. |
| Doble inclusión de una misma liquidación en dos pagos | Sección 6.3 — dos alternativas, ninguna elegida. |
| Autorización insuficientemente estricta o excesivamente restrictiva | Sección 6.4 — dos interpretaciones, ninguna elegida. |
| Ampliación del allow-list de `PrismaService` crudo | Acotada a un único método nuevo, estrecho, siguiendo la misma disciplina ya documentada en `prisma.module.ts` — no se expone ningún acceso genérico. |
| Mezcla de beneficiarios en un mismo pago | Validación explícita en creación (sección 4.2), revalidada en cada paso posterior. |
| Numeración/moneda/redondeo | Fuera de alcance — mismas limitaciones ya existentes en todo el sistema (`AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md`, sección 5), no agravadas ni resueltas por este diseño. |

## 14. Criterios de aceptación

- Los candidatos de un beneficiario aparecen correctamente agregados de todas las organizaciones del grupo, en una sola respuesta, sin ninguna liquidación de una organización ajena al grupo.
- Crear un pago consolidado arma un borrador con el total exacto, sin tocar ninguna liquidación.
- Confirmar/pagar (según la alternativa elegida en la etapa siguiente) marca coherentemente cada liquidación involucrada, en su propia organización.
- Ante un fallo parcial, el comportamiento del sistema coincide exactamente con la alternativa elegida — ninguna liquidación queda en un estado no documentado.
- Anular revierte exactamente lo que la sección 7 determina como reversible, ni más ni menos.
- Ninguna operación mezcla beneficiarios distintos ni cruza grupos económicos distintos.
- Toda operación exitosa y todo intento rechazado quedan en `AuditLog`, por organización.
- Regresión completa: `LiquidacionesController`, `AccesoGrupoController`, `GrupoEconomicoController`, `IdentidadChoferGrupoController` sin ningún cambio de comportamiento.

---

## Resumen ejecutivo

El diseño cubre un módulo nuevo (`PagoConsolidadoService`/`PagoConsolidadoController`), dos modelos nuevos a nivel de grupo, y un tercer consumidor —acotado y documentado— del allow-list de `PrismaService` crudo. La arquitectura de acceso a datos (secuencia explícita de `organizacionContextStorage.run()`, una por organización, combinando resultados en memoria) ya está confirmada como viable con la infraestructura actual, sin necesitar debilitar `ORGANIZACION_PRISMA`. **Quedan tres decisiones técnicas reales, no resueltas deliberadamente:** la estrategia ante un fallo parcial al confirmar/pagar (sección 7, la más importante), la forma de garantizar que una liquidación no se incluya en dos pagos a la vez (sección 6.3), y el nivel exacto de autorización exigido (sección 6.4).

## Decisiones que requieren aprobación del Product Owner

1. **Estrategia ante fallo parcial entre organizaciones** (sección 7) — Alternativa 1 (estado de pago parcial + reintento manual), Alternativa 2 (compensación automática, que exige construir la reversión de una liquidación pagada), o una combinación con la Alternativa 3 (revalidación exhaustiva, mitigación no excluyente).
2. **Número de pasos del ciclo de vida de `PagoConsolidado`** (sección 4.3, implícito en la sección 7) — dos pasos (confirmar = pagar, un solo punto de no retorno) o tres pasos (borrador → confirmado → pagado, espejo exacto del ciclo de `Liquidacion`, con un punto de control intermedio antes de ejecutar las escrituras cruzando organizaciones).
3. **Mecanismo de bloqueo de una liquidación ya incluida** (sección 6.3) — Alternativa A (campo nuevo en `Liquidacion`, garantía atómica real, toca un modelo existente) o Alternativa B (verificación a nivel de aplicación, sin tocar `Liquidacion`, sin garantía atómica completa).
4. **Nivel de autorización exigido** (sección 6.4) — pertenencia al grupo alcanza, o se exige `AccesoGrupoEconomico` explícito hacia cada organización involucrada en el pago puntual.
5. **Nombres exactos de los estados de `PagoConsolidado`** — orientativos en este documento, sin impacto de negocio, a definir junto con la decisión 2.

## Tensiones abiertas

- La reversión de una `Liquidacion` `PAGADA` no existe hoy en ninguna forma — es un prerrequisito real de cualquier alternativa de la sección 7 que permita anular un pago ya (parcial o totalmente) ejecutado, y no está, en sí misma, diseñada en este documento (se construiría como parte de la implementación de la decisión 1).
- No hay, en la arquitectura actual, ninguna forma de lograr una transacción física que cruce organizaciones — esto no es una limitación de este diseño, es una limitación real y verificada del mecanismo de aislamiento que todo SDC v1.0/v1.1 ya depende.

## Alternativas consideradas

Todas quedaron descriptas en línea, en las secciones correspondientes (7, 6.3, 6.4) — no se resolvió ninguna por iniciativa propia.

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo git add/commit/push. Detenido al finalizar, a la espera de tu aprobación antes de abrir `DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md` o implementar.

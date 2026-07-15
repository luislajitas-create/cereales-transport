# Plan de Implementación — Grupo Económico (Bloque 10, SDC v1.1)

Fecha: 2026-07-15. Registra fielmente el plan de implementación aprobado por el Product Owner, dividido en seis sub-bloques pequeños y autocontenidos, siguiendo la misma metodología ya usada en los Bloques 8 y 9: implementar → validar → acta de cierre → recién entonces el siguiente sub-bloque. No se escribió código, no se modificó `schema.prisma`, no se generaron migraciones al escribir este documento.

**Documentos rectores de los que este plan deriva, sin reabrir ninguna decisión ya tomada en ellos:** `GRUPO_ECONOMICO_DISENO_TECNICO.md`, `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`, `DECISIONES_TECNICAS_GRUPO_ECONOMICO.md`, `AUDITORIA_FUNCIONAL_GRUPO_ECONOMICO_RONDA2.md`, y la primera auditoría funcional de Grupo Económico (Ronda 1), aprobada en conversación.

---

## Bloque 10.1 — Modelo base de Grupo Económico

**Objetivo:** que exista la entidad `GrupoEconomico` y la posibilidad de asociarle organizaciones, sin ningún efecto de comportamiento todavía.

**Alcance exacto:** modelo `GrupoEconomico` (fuera de `ORGANIZACIONAL_MODELS`); `Organizacion.grupoEconomicoId` opcional; un módulo backend chico para crear un grupo y asociar/desasociar organizaciones.

**Qué modifica:** `schema.prisma` (dos adiciones puramente aditivas); un módulo backend nuevo.

**Qué no modifica:** ningún modelo organizacional existente ni su comportamiento; `ORGANIZACION_PRISMA`; ningún endpoint ni pantalla ya existente.

**Dependencias:** ninguna — es el punto de partida.

**Criterios de aceptación:** existe un `GrupoEconomico` con las dos organizaciones reales asociadas; la regresión completa de v1.0 pasa sin cambios; ninguna pantalla existente muestra ninguna diferencia visible.

**Rollback:** desasociar las organizaciones (o eliminar el grupo, si quedó vacío) — sin pérdida de datos, ninguna tabla existente se ve afectada.

**Riesgos:** mínimos — migración puramente aditiva, sin activar ningún filtrado ni comportamiento nuevo.

---

## Bloque 10.2 — Identidad compartida de Chofer

**Objetivo:** poder vincular, a mano, dos filas de `Chofer` (una por organización) como la misma persona real.

**Alcance exacto:** modelo `IdentidadChoferGrupo`; `Chofer.identidadChoferGrupoId` opcional; endpoint de vinculación manual y de consulta.

**Qué modifica:** `schema.prisma` (dos adiciones aditivas — `Chofer` se mantiene, sin cambios, dentro de `ORGANIZACIONAL_MODELS`); módulo backend de identidad compartida.

**Qué no modifica:** ningún dato existente de ningún `Chofer` (comisión, licencia, estado); ningún otro modelo; ninguna pantalla existente.

**Dependencias:** Bloque 10.1 (la identidad se asocia al grupo).

**Criterios de aceptación:** se vincula manualmente al chofer real de prueba entre las dos organizaciones; cada `Chofer` sigue siendo, en todo lo demás, completamente independiente en su organización; el vínculo queda en `AuditLog` con quién y cuándo.

**Rollback:** desvincular — no afecta ningún viaje, anticipo ni liquidación ya existente de ese chofer.

**Riesgos:** vincular por error a la persona equivocada — mitigado por el criterio de revisión manual explícita ya aprobado (nunca automático por nombre) y por dejar el vínculo auditado y reversible.

---

## Bloque 10.3 — Acceso de usuarios y cambio de organización activa

**Objetivo:** que un usuario autorizado explícitamente pueda operar más de una organización del grupo, cambiando su organización activa sin un login nuevo.

**Alcance exacto:** modelo `AccesoGrupoEconomico`; endpoints de otorgar/revocar acceso; endpoint de cambio de organización activa; guard nuevo y separado de `RolesGuard` — aplicando las 4 Decisiones Técnicas ya aprobadas (solo el Administrador de la organización involucrada otorga; independiente del rol de negocio; indefinido hasta revocación manual).

**Qué modifica:** `schema.prisma` (una tabla nueva); backend: guard nuevo, endpoint de cambio de organización, endpoints de alta/baja de acceso.

**Qué no modifica:** la forma del JWT (sigue con los mismos 5 campos); `RolesGuard` existente; ningún endpoint operativo existente (Viajes, Facturas, Liquidaciones, Catálogos); frontend (eso es 10.4).

**Dependencias:** Bloque 10.1.

**Criterios de aceptación:** los usuarios administrativos ya aprobados (Decisión 3 de negocio) cambian de organización activa y operan la organización destino con su rol de siempre; ningún otro usuario ve ni puede usar el mecanismo; la prueba de fuga cruzada ampliada pasa; cada cambio y cada alta/baja de acceso queda en `AuditLog`.

**Rollback:** revocar los accesos otorgados — el JWT no cambió de forma, ningún token queda incompatible; ningún dato operativo se ve afectado.

**Riesgos:** el más sensible de seguridad de todo el Bloque 10 — mitigado por el guard separado de `RolesGuard`, por la validación server-side estricta antes de emitir cualquier token nuevo, y por pruebas de fuga cruzada específicas antes de cerrar este sub-bloque.

---

## Bloque 10.4 — Frontend de acceso y administración de grupo

**Objetivo:** exponer en la interfaz lo que 10.1-10.3 ya construyeron en el backend.

**Alcance exacto:** selector de organización activa (visible solo con acceso otorgado); pantalla de administración básica del grupo; pantalla de otorgar/revocar acceso.

**Qué modifica:** frontend — 2-3 pantallas nuevas, un agregado chico a `Layout.tsx`.

**Qué no modifica:** ninguna pantalla existente; ningún endpoint backend (reutiliza exactamente lo ya construido en 10.1-10.3).

**Dependencias:** Bloque 10.3.

**Criterios de aceptación:** validación manual en navegador real, con los usuarios administrativos reales — cada uno cambia de organización desde la interfaz y ve los datos correctos de cada una; nadie sin acceso ve el selector.

**Rollback:** ocultar/retirar las pantallas nuevas, sin ningún efecto sobre el backend.

**Riesgos:** bajos — reutiliza patrones visuales ya existentes (`Organizacion.tsx`, `Usuarios.tsx`).

---

## Bloque 10.5 — Pago Consolidado (backend)

**Objetivo:** construir la capacidad de agrupar liquidaciones cerradas de distintas organizaciones del grupo en un único pago.

**Alcance exacto:** modelos `PagoConsolidado` y `PagoConsolidadoLiquidacion`; endpoints de candidatos, creación, confirmación y anulación, con las reglas exactas ya aprobadas (mismo beneficiario, mismo grupo, sin duplicarse entre pagos activos, sin compensación automática, saldo negativo visible con confirmación explícita, atomicidad).

**Qué modifica:** `schema.prisma` (dos tablas nuevas); backend: módulo de pagos consolidados.

**Qué no modifica:** `Liquidacion` no recibe ningún campo nuevo; ningún endpoint de Liquidaciones/Facturas/Anticipos existente; `ORGANIZACION_PRISMA`.

**Dependencias:** Bloque 10.2 (identidad de beneficiario) y Bloque 10.3 (usuario autorizado a operar más de una organización).

**Criterios de aceptación:** se arma un pago consolidado real con liquidaciones de ambas organizaciones para el chofer vinculado; el total es exactamente la suma; confirmar marca ambas liquidaciones como pagadas, atómicamente, cada una en su organización; un saldo negativo exige confirmación explícita adicional y nunca se compensa; anular revierte ambas liquidaciones con motivo trazado; pasan todas las pruebas de pago consolidado de la sección 15 del diseño técnico.

**Rollback:** anular el pago revierte las liquidaciones agrupadas; si el problema fuera del modelo en sí, la tabla puede vaciarse sin afectar ninguna liquidación.

**Riesgos:** el de mayor lógica de negocio de todo el Bloque 10 — mitigado por las reglas ya aprobadas y por pruebas dedicadas ("liquidación ya utilizada", "beneficiarios distintos", "organizaciones de grupos distintos").

---

## Bloque 10.6 — Pago Consolidado (frontend)

**Objetivo:** exponer en la interfaz lo construido en 10.5, cerrando de punta a punta el caso real que originó todo el Bloque 10.

**Alcance exacto:** selección de liquidaciones elegibles; creación/confirmación/anulación del pago consolidado; consulta de pagos consolidados.

**Qué modifica:** frontend — pantallas nuevas, con patrones ya existentes.

**Qué no modifica:** ninguna pantalla existente; ningún endpoint backend; no incluye el comprobante consolidado (Decisión 5 de negocio: aprobado explícitamente para después).

**Dependencias:** Bloque 10.4 y Bloque 10.5.

**Criterios de aceptación:** el caso real completo (mismo chofer, dos organizaciones, un pago) se ejecuta de punta a punta desde la interfaz, validado en navegador real.

**Rollback:** ocultar/retirar las pantallas nuevas, sin efecto sobre el backend.

**Riesgos:** bajos — mismo criterio que 10.4.

---

## Diagrama de dependencias

Dependencias exactas, tal como fueron aprobadas:

- `10.1` habilita `10.2` y `10.3`.
- `10.3` habilita `10.4`.
- `10.2` y `10.3` habilitan `10.5`.
- `10.4` y `10.5` habilitan `10.6`.

```
                10.1
               /    \
            10.2    10.3
               \    /  \
               10.5     10.4
                  \      /
                   \    /
                   10.6
```

---

## Bloque inicial recomendado

**Bloque 10.1 — Modelo base de Grupo Económico.** El más chico posible: una migración puramente aditiva, sin activar ningún comportamiento nuevo, con el rollback más simple de los seis y sin ningún riesgo de seguridad. No entrega todavía una funcionalidad visible para el usuario final, pero es el mismo tipo de primer paso "invisible pero necesario" que ya usó Bloque 8.1 antes de construir sobre una base ya validada.

---

Plan aprobado por el Product Owner. La implementación de cada sub-bloque queda sujeta, en todo momento, a la misma disciplina de `METODOLOGIA_SDC.md`: implementar → validar → commit → push → verificar producción → acta de cierre → recién entonces el siguiente sub-bloque.

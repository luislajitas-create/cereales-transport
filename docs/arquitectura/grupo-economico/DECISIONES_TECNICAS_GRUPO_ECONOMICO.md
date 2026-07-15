# Decisiones Técnicas — Grupo Económico

Fecha: 2026-07-15. Registra exclusivamente las 4 decisiones técnicas pendientes de la sección 17 de `GRUPO_ECONOMICO_DISENO_TECNICO.md`, aprobadas por el Product Owner. **No repite el diseño completo, no escribe implementación, no define migraciones.** Es la base final antes de iniciar cualquier trabajo de implementación, todavía no autorizado.

---

## Decisión Técnica 1 — Nombres de los estados del Pago Consolidado

**Pregunta:** ¿qué nombres de estado usa el Pago Consolidado — los mismos que ya usa Liquidación, o nombres propios?

**Decisión:** **nombres propios y distintos** a los de Liquidación (por ejemplo, EN PREPARACIÓN → LISTO PARA PAGAR → PAGADO, o ANULADO — el nombrado final se ajusta en implementación).

**Consecuencia arquitectónica inmediata:** el vocabulario de estados de `PagoConsolidado` (sección 10 del diseño técnico) se define de forma independiente al de `Liquidacion` — ninguna pantalla que muestre ambos conceptos a la vez repite la misma palabra para el estado de la liquidación individual y el del pago que la agrupa.

---

## Decisión Técnica 2 — Quién puede otorgar acceso a operar el Grupo Económico

**Pregunta:** ¿cualquier Administrador del grupo puede otorgar acceso a cualquier organización, o solo el Administrador de la organización involucrada?

**Decisión:** **solo el Administrador de la organización involucrada** puede otorgar acceso a esa organización.

**Consecuencia arquitectónica inmediata:** el endpoint de otorgamiento de `AccesoGrupoEconomico` (sección 12 del diseño técnico) valida que quien lo ejecuta sea `ADMINISTRADOR` específicamente de la organización destino del acceso — nunca de cualquier organización del grupo. Habilitar a una persona en ambas empresas del grupo exige dos altas separadas, una por cada Administrador.

---

## Decisión Técnica 3 — Si el acceso de grupo depende del rol de negocio

**Pregunta:** ¿el acceso de grupo exige que el usuario tenga un rol mínimo (por ejemplo, `LIQUIDACIONES` o `ADMINISTRADOR`), o es independiente de su rol?

**Decisión:** **independiente del rol de negocio** — el Administrador que otorga el acceso decide, sin que el sistema imponga una restricción adicional por rol.

**Consecuencia arquitectónica inmediata:** el guard de grupo (`GrupoEconomicoGuard`, sección 8 del diseño técnico) no valida el rol del usuario que recibe el acceso — solo verifica que exista un `AccesoGrupoEconomico` vigente. Una vez dentro de una organización adicional, la persona sigue sujeta, sin ninguna excepción, a los mismos controles de rol (`@Roles(...)`) que ya rigen cada operación normal en cualquier organización — el acceso de grupo habilita "entrar", nunca amplía "qué se puede hacer una vez adentro".

---

## Decisión Técnica 4 — Vigencia del acceso de grupo

**Pregunta:** ¿el acceso de grupo es indefinido hasta revocación manual, o debe expirar automáticamente / requerir revisión periódica?

**Decisión:** **indefinido hasta revocación manual** — mismo patrón que ya usa `Usuario.activo` hoy.

**Consecuencia arquitectónica inmediata:** `AccesoGrupoEconomico` no incorpora ningún campo ni mecanismo de expiración ni de recordatorio automático. Revocar sigue siendo, en todo momento, una acción explícita disponible para quien tiene la potestad de otorgarlo (Decisión Técnica 2).

---

## Resumen para la implementación

Las cuatro decisiones quedan incorporadas como restricciones obligatorias de la Etapa C del plan de implementación (`GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 16 — acceso de usuarios, guard de grupo, endpoint de cambio de organización activa) y de la Etapa E (Pago Consolidado, en lo referido a nombres de estado). Ninguna decisión aquí registrada reabre ninguna decisión funcional ya aprobada en `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`. La implementación todavía **no está autorizada** — queda pendiente de una instrucción explícita posterior.

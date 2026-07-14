# Roadmap actualizado — SDC, post Bloque 5.1-5.3.2

Fecha: 2026-07-09, actualizado 2026-07-11 (cierre de Bloque 7). Actualiza `ROADMAP_BLOQUE5.md` (2026-07-07) contra lo realmente ejecutado. No se implementó nada de lo listado acá — es organización y reordenamiento, a aprobar antes de tocar código.

**Actualización 2026-07-11:** este documento cubre exclusivamente la deuda técnica/infraestructura heredada de Bloque 5 — sigue vigente para eso. El trabajo de Bloque 6 (producción/despliegue) y Bloque 7 (Centro de Inteligencia) se documenta en `ESTADO_ACTUAL_POST_BLOQUE7.md` (resumen), `BLOQUE7_ROADMAP_FUNCIONAL.md` (backlog funcional específico de Bloque 7, con su propia priorización) y `DEUDA_TECNICA.md` (deuda técnica consolidada, ya actualizada con lo que Bloque 6 resolvió). Los cambios de estado que Bloque 6 produjo sobre las filas de este documento se marcan abajo, en el lugar donde ya estaban.

**Leyenda:** ✅ Completado · 🟡 Pendiente · 🔵 Diferido (decisión de negocio antes de estimar, no una prioridad técnica).

---

## 1. Sub-bloques del roadmap original — estado

| # | Nombre original | Estado | Nota |
|---|---|---|---|
| 5.0 | Verificación urgente de producción | ✅ **Completado — vía Bloque 6.1/6.2** | Se ejecutó, y encontró algo peor de lo que este roadmap sospechaba: no era una duda de configuración, era un incidente real (5 migraciones sin aplicar en producción). Diagnosticado y resuelto el 2026-07-10 — ver `ACTA_CIERRE_INCIDENTE.md`. |
| 5.1 | Seguridad crítica | ✅ **Parcial** — solo `RolesGuard` en catálogos (`258e8a4`) | `JWT_SECRET`/CORS fail-fast y rate-limiting, que este sub-bloque agrupaba originalmente, **no se hicieron**. Quedan reabiertos como ítem propio, ver sección 2. |
| 5.2 | Infraestructura de despliegue | 🟡 Pendiente, sin cambios | Ningún ítem (Dockerfiles, healthcheck, `.env.example`, backup) se tocó. |
| 5.3 | Observabilidad | 🟡 Pendiente, sin cambios | |
| 5.4 | Quick wins de negocio/datos | ✅ **Parcial** | Soft-delete real (vía 5.2.a/b) y typo `numerl` (vía 5.3.1) sí se resolvieron, con otro alcance/numeración. Validación de CUIT e índices de `estadoFacturacion`/`estadoLiquidacion` siguen pendientes. |
| 5.5 | UX financiera crítica | ✅ **Sí**, vía 5.3.1 (`971f09c`) | Acotado a Liquidaciones/Facturas/Anticipos/ViajeDetalle, no a las 12 pantallas. |
| 5.6 | Cerrar funcionalidad ya construida pero inaccesible | 🟡 Pendiente, sin cambios | |
| 5.7 | Cumplimiento normativo (vencimientos) | 🟡 Pendiente, sin cambios | |
| 5.8 | Deuda estructural de modelo de datos | 🟡 Pendiente, sin cambios | |
| 5.9 | Paginación y filtros | 🟡 Pendiente, sin cambios | |
| 5.10 | Tests automatizados | 🟡 Pendiente, sin cambios | |
| 5.11 | CI/CD básico | 🟡 Pendiente, sin cambios | |
| 5.12 | Mantenibilidad de backend (refactor de fondo) | 🟡 Pendiente, sin cambios | |
| 5.13 | Accesibilidad y consistencia visual | 🟡 Pendiente, sin cambios | Incluye el gating de rol en frontend (UX-16), que quedó explícitamente diferido acá desde 5.1/5.2. |
| 5.14 | Valor agregado | 🔵 Diferido | Sin cambios — sigue condicionado a decisiones de negocio. |

**No ejecutado y no estaba en el roadmap original:** 5.3.2 (rediseño de la planilla de Liquidación) — surgió durante la revisión de 5.3.1, ya ✅ completado (`f2c9505`).

---

## 2. Reordenamiento de lo que queda pendiente

El roadmap original recomendaba el orden 5.0 → 5.1 → 5.4 → 5.2 → 5.5 → 5.3 → 5.6 → ... Con 5.1/5.4/5.5 parcialmente resueltos, el orden real que queda por delante cambia. Los bloques se reagrupan acá por lo que efectivamente falta, no por su numeración original.

### Prioridad 1 — Cerrar lo que quedó a medias (antes de abrir sub-bloques nuevos)

**Actualización 2026-07-11:** de los 3 ítems de esta prioridad, la verificación de producción se completó (vía Bloque 6.1/6.2, con un resultado más grave de lo previsto — ver arriba) y la automatización de despliegue relacionada avanzó (Bloque 6.3, healthcheck + migraciones automáticas). Los otros dos ítems siguen exactamente como estaban: nadie los tocó en Bloque 6 (que se desvió hacia el incidente real que apareció al hacer la verificación) ni en Bloque 7 (funcional, no tocó infraestructura).

| Ítem | Contenido | Depende de | Esfuerzo | Riesgo de no hacerlo | Impacto | Estado |
|---|---|---|---|---|---|---|
| ~~**Verificación de producción** (ex-5.0)~~ | ~~Confirmar Root Directory de Railway y el entrypoint real del build.~~ | — | — | — | — | ✅ **Completado** (Bloque 6.1/6.2) |
| **Seguridad de infraestructura restante** (resto de 5.1) | `JWT_SECRET`/`CORS_ORIGIN` fail-fast al arrancar; rate-limiting básico en `POST /auth/login` (`@nestjs/throttler`). | Ninguna | Bajo (1 día aprox.) | Igual que hace tres bloques: fallback silencioso conocido y documentado, sin cerrar. | Alto, esfuerzo bajo. | 🟡 **Pendiente** |
| **`cuentaCorriente()` no excluye facturas anuladas** | `ClientesController.cuentaCorriente()` suma facturas `ANULADO` al saldo — dato financiero visible a Facturación/Gerencia. Señalado como "candidato a P0 aparte" desde el propio diseño de Bloque 4.3. | Ninguna | Bajo | Saldo de cliente mostrado incorrectamente inflado. | Alto, esfuerzo bajo — debería ir antes que cualquier sub-bloque nuevo. | 🟡 **Pendiente** |

**Por qué siguen primero:** son la cola de compromisos ya identificados hace tres bloques, que quedaron sin cerrar por decisiones de alcance tomadas sobre la marcha — cerrarlos no es "nuevo trabajo", es terminar lo que ya se empezó a diagnosticar. El hecho de que Bloque 6 haya resuelto un incidente más urgente que apareció en el camino no les resta prioridad relativa a estos dos.

### Prioridad 2 — Infraestructura de despliegue (ex-5.2)

**Actualización 2026-07-11:** automatización de `prisma migrate deploy` completada vía Bloque 6.3 (`railway.json`, `preDeployCommand` + `healthcheckPath`, validado en un deploy real). Sigue pendiente, sin cambios: unificación de Dockerfiles divergentes (raíz vs. `backend/Dockerfile`), `.env.example`, healthcheck/usuario no-root en Docker, backup de Postgres verificado/documentado, README desactualizado. Esfuerzo medio (1-2 días). Gana prioridad relativa porque, con la seguridad de catálogos y la UX financiera ya resueltas, es el bloque de mayor riesgo latente que queda sin tocar (Dockerfiles que probablemente ya construyen imágenes distintas en local vs. Railway).

### Prioridad 3 — Cerrar funcionalidad ya construida pero inaccesible (ex-5.6, ampliado)

Edición de viajes, anulación individual de cobranza, edición de catálogos, exports Excel/PDF fuera de Liquidaciones. **Gana prioridad** respecto al roadmap original: es trabajo de backend de los Bloques 3-4-5.2 que hoy nadie puede usar desde la interfaz, y la brecha se hizo más visible después de 5.3.1/5.3.2 (Liquidaciones ahora tiene una UX notablemente mejor que Facturas/Clientes/Transportistas, que quedaron sin ese mismo tratamiento).

### Prioridad 4 — UX no financiera restante (ex-5.13, ampliado con el resto de 5.3)

Loading states y manejo de error en las 8 pantallas que 5.3.1 no tocó (Clientes, Transportistas, Catálogos, listado de Viajes, ViajeForm, Conciliación parcialmente cubierta), gating de rol en frontend (UX-16), accesibilidad básica (asociar `label`/`input`, que no depende de una decisión de negocio a diferencia de `aria-live`/responsive). Esfuerzo medio.

### Prioridad 5 — Observabilidad (ex-5.3)

Sin cambios de contenido ni de posición relativa: logger estructurado, catch-all de excepciones, health check real, `AuditLog` extendido. Tiene más sentido una vez cerrada la Prioridad 1 (no vale la pena invertir en observar un despliegue que todavía no se confirmó que sea el correcto).

### Prioridad 6 — Cumplimiento normativo: vencimientos (ex-5.7)

Sin cambios. Sigue dependiendo de que exista edición de choferes/vehículos (Prioridad 3) para poder cargar/corregir vencimientos ya existentes.

### Prioridad 7 — CI/CD básico (ex-5.11)

Sin cambios de contenido. Sube un lugar en la cola relativa: con más superficie de UX y backend ya estabilizada, un pipeline de build+typecheck empieza a rendir más que cuando había cambios grandes de diseño en curso.

### Prioridad 8 — Tests automatizados (ex-5.10)

Sin cambios. Sigue recomendado arrancar acotado (los flujos financieros críticos, que ya tienen plan de pruebas manual documentado en los Bloques 3-4).

### Prioridad 9 — Accesibilidad avanzada y responsive (resto de ex-5.13)

`aria-live`, gestión de foco, diseño responsive — se separan de la Prioridad 4 porque dependen de una decisión de negocio explícita (¿hay requisito de accesibilidad? ¿hay uso mobile/tablet real o previsto?) que sigue sin responderse, exactamente igual que en el roadmap original.

### Prioridad 10 — Paginación y filtros (ex-5.9)

Sin cambios. El propio roadmap original ya señalaba que el riesgo es bajo hoy por el volumen de datos — sigue siendo así, no hay evidencia de que el volumen haya crecido.

### Prioridad 11 — Deuda estructural de modelo de datos (ex-5.8)

Sin cambios de contenido. Enums duplicados, clasificación de anticipos por texto, `medioPago` sin enum, constraint de `Ubicacion`. Sigue siendo el bloque de mayor esfuerzo relativo a su impacto inmediato — más seguro de encarar con tests mínimos ya en marcha (Prioridad 8).

### Prioridad 12 — Mantenibilidad de backend (ex-5.12)

Sin cambios. Capa de servicio, deduplicación de helpers — refactor de fondo, no debería intercalarse con trabajo funcional.

### 🔵 Diferido — Valor agregado (ex-5.14)

**Actualización 2026-07-11:** de los 5 ítems originales, 2 quedaron resueltos por Bloque 7.3 — **alertas proactivas** (Centro de Alertas, 7.3.3.a) y **Dashboard gerencial** (Dashboard Ejecutivo, 7.3.4, más Benchmarking y Tendencias, 7.3.5, que va más allá de lo que este ítem pedía originalmente). Siguen sin cambios, condicionados a conversación de alcance con negocio: AFIP/facturación fiscal, portal de autoservicio, importación masiva.

---

## 3. Qué perdió prioridad y por qué

- **5.4 (quick wins) ya no es un bloque único** — se resolvió parcialmente en el camino (soft-delete vía 5.2, typo vía 5.3.1). Lo que queda de 5.4 (validación de CUIT, índices de `estadoFacturacion`/`estadoLiquidacion`) es de esfuerzo tan bajo que no amerita ser su propio bloque — se puede intercalar en cualquiera de las prioridades 1-4 sin planificación aparte.
- **5.6 (funcionalidad inaccesible) sube de posición** — no porque haya cambiado su contenido, sino porque 5.3.2 hizo más visible el contraste: Liquidaciones tiene hoy una UX sensiblemente mejor que el resto de los módulos financieros, y esa brecha es más notoria (y más fácil de señalar a un cliente) que antes de 5.3.2. Bloque 7 amplió esta misma brecha: el Centro de Inteligencia también tiene ya un nivel de UX notablemente mejor que Clientes/Transportistas/Catálogos.
- **5.13 se dividió en dos** — la parte de gating de rol en frontend y asociación `label`/`input` no depende de ninguna decisión de negocio y es barata; la parte de accesibilidad avanzada/responsive sí depende de una respuesta de negocio pendiente desde el propio Bloque 5.3. Agruparlas ya no tiene sentido con la brecha de esfuerzo que las separa.

---

## 4. Relación con el backlog funcional de Bloque 7

Este documento prioriza deuda técnica/infraestructura heredada de Bloque 5 — no incluye el backlog funcional de producto que `BLOQUE7_AUDITORIA_FUNCIONAL.md`/`BLOQUE7_ROADMAP_FUNCIONAL.md` (2026-07-10) identificaron por separado, con su propia clasificación de impacto/esfuerzo/riesgo. De esos 33 ítems, Bloque 7.3 resolvió el de mayor impacto individual (**#30 — reporte de rentabilidad por viaje/cliente/transportista**, marcado ahí como "el mayor hallazgo de esa auditoría") y buena parte de otros: #17 (aging de cartera), #6/#7 (alertas y totales del Dashboard, superadas por el Centro de Alertas), #9 (comparación contra período anterior, resuelta y generalizada por Benchmarking), #18 (alertas proactivas de vencimiento, parcialmente — factura, no documental), y una parte de #31 (módulo de reportes centralizado — el Centro de Inteligencia cubre el caso financiero, no reemplaza un módulo de reportes general).

Quedan abiertos en ese roadmap, sin que Bloque 7 los haya tocado: la Oleada 2 completa (edición de catálogos, CRUD de usuarios, selección masiva en Liquidaciones, captura de vencimientos documentales), la Oleada 3 (mejoras menores de Viajes/Anticipos/Dashboard), y las Oleadas 4-5 restantes (numeración de factura condicionada a AFIP, romaneo real, módulo de reportes general, envío periódico por email). Es, en líneas generales, el mismo contenido que compone el camino "SDC v1 profesional" al momento de decidir el próximo bloque.

# Estado actual del proyecto — Cierre de Bloque 7 (SDC v1 + Centro de Inteligencia)

Fecha: 2026-07-11. Documento de cierre técnico y de producto — reemplaza a `BLOQUE5_ESTADO_ACTUAL.md` como referencia vigente (ese documento queda como registro histórico del estado al cierre de Bloque 5, no se borra). Escrito para que cualquier persona del equipo entienda en 10 minutos dónde está el proyecto SDC hoy, sin tener que leer los ~40 documentos de auditoría/diseño de los Bloques 1 a 7.

---

## Resumen ejecutivo

SDC tiene sus 7 módulos de negocio originales (Auth, Catálogos, Viajes, Anticipos, Liquidaciones, Facturas, Dashboard) funcionando de punta a punta, desplegado en Railway con despliegue automático confiable, y desde Bloque 7 suma un **Centro de Inteligencia** completo: cinco pantallas nuevas (Rentabilidad, Aging de Cobranzas, Centro de Alertas, Dashboard Ejecutivo, Benchmarking y Tendencias) que cruzan datos que antes vivían separados en Viajes/Facturas/Liquidaciones y los convierten en información que un Director Operativo o Gerencia puede usar para decidir, no solo para registrar.

Los flujos financieros críticos (liquidar → confirmar → pagar → anular; facturar → cobrar → anular → refacturar) siguen validados y sin bugs conocidos abiertos. El Bloque 6 resolvió un incidente real de producción (migraciones de base de datos sin aplicar) y automatizó el despliegue para que no vuelva a pasar. El Bloque 7.3 cerró con una consolidación explícita del código del Motor de Inteligencia (7.3.4.1) antes de darlo por terminado, dejándolo — según la propia auditoría de consolidación — "sin duplicaciones relevantes, con responsabilidades claras".

Lo que **no** se cerró todavía: seguridad de infraestructura (`JWT_SECRET`/CORS sin fail-fast, sin rate-limiting en login), un bug de saldo de cliente (`cuentaCorriente()` no excluye facturas anuladas), tests automatizados (siguen en cero), CRUD de usuarios y edición de catálogos desde la interfaz, captura de vencimientos documentales, y la mayor parte del backlog de UX no financiera. Nada de esto es sorpresa — está documentado en `DEUDA_TECNICA.md` y, para el backlog funcional específico, en `BLOQUE7_ROADMAP_FUNCIONAL.md`.

**En una frase:** el sistema es hoy confiable en los números que muestra y en cómo se despliega, y desde Bloque 7 además ayuda a interpretar esos números — pero todavía no es production-grade en seguridad de infraestructura ni en cobertura de pruebas automatizadas, y una parte importante de la funcionalidad que el backend ya soporta sigue sin un botón que la exponga.

---

## Qué se completó, bloque por bloque

| Bloque | Qué resolvió | Estado |
|---|---|---|
| 1-2 (base) | Los 7 módulos de negocio funcionando de punta a punta | ✅ |
| 3 | Integridad de datos, comisiones automáticas, liquidaciones que se pueden rehacer | ✅ |
| 4 | Guardas de negocio (viaje facturado/liquidado no editable), refacturación, cobranzas con tope | ✅ |
| 5.1-5.3.2 | Seguridad de catálogos por rol, soft-delete real, confirmaciones/doble-submit en las 4 pantallas financieras, planilla de liquidación profesional | ✅ (detalle completo en `BLOQUE5_ESTADO_ACTUAL.md`) |
| 6.1-6.2 | Incidente de migraciones de producción sin aplicar — diagnosticado y resuelto en producción real | ✅ (`ACTA_CIERRE_INCIDENTE.md`) |
| 6.3 | Automatización de `prisma migrate deploy` vía `preDeployCommand` + healthcheck — validado en un deploy real | ✅ |
| 7.2 | Arquitectura conceptual del Motor de Inteligencia (7 dominios, ontología, ciclo de vida del conocimiento, principios de gobernanza) | ✅ (puramente conceptual, sin código) |
| 7.3.1 | Rentabilidad por viaje/cliente/transportista | ✅ |
| 7.3.2 | Aging de cobranzas (DSO, buckets 30/60/90) | ✅ |
| 7.3.3.a | Centro de Alertas (9 tipos, filtrado por rol) | ✅ |
| 7.3.4 | Dashboard Ejecutivo (consolida los tres anteriores) | ✅ |
| 7.3.4.1 | Consolidación del Motor — eliminó duplicaciones de fetch+cálculo entre servicios | ✅ |
| 7.3.5 | Benchmarking y Tendencias (comparación entre períodos, evolución mensual, rankings) | ✅ — cierra Bloque 7.3 |
| 7.3.3.b | Alertas documentales (vencimiento de licencia/RTO/seguro) | 🟡 **Condicionado** — el modelo no captura esos vencimientos hoy, ver deuda del Motor más abajo |

---

## Estado general del sistema

**Backend.** 8 módulos activos (los 7 de negocio + `inteligencia/`). DTOs con `class-validator` en los endpoints de escritura de negocio; el Motor de Inteligencia usa query params simples (sin DTOs, por diseño — son filtros de lectura, no mutaciones). Sigue sin capa de servicio en los módulos transaccionales originales (los controllers de negocio escriben lógica directamente); el Motor de Inteligencia sí tiene una separación explícita controller→service→cálculo puro, que no existía antes de Bloque 7. Sin paginación en ningún listado. Cero tests automatizados de framework (`*.spec.ts`), aunque el Motor de Inteligencia sí tiene una suite propia de scripts de validación de cálculo puro (87 aserciones) que corre fuera del framework de testing formal.

**Frontend.** React 18 + Vite, sin librerías de UI externas. Los flujos financieros principales y las 5 pantallas del Centro de Inteligencia tienen manejo de error y feedback consistente. El resto de las pantallas (Clientes, Transportistas, Catálogos, listado de Viajes) sigue sin ese mismo tratamiento. Sin tipos compartidos con el backend (`any` en las respuestas de API, incluidas las nuevas del Motor).

**Base de datos.** 20 modelos, 9 enums, sin cambios de schema desde Bloque 5 — Bloque 7 se construyó **exclusivamente leyendo** el modelo existente, sin agregar ni una migración (principio explícito del Motor: "nunca modifica el modelo transaccional, solo lee"). Migraciones ahora se aplican automáticamente en cada deploy (Bloque 6.3).

**UX.** Liquidaciones y las 5 pantallas del Centro de Inteligencia están al nivel de un producto terminado. El resto de la aplicación mantiene el nivel funcional pero no pulido de los Bloques 1-5: sin loading states sistemáticos, sin accesibilidad, sin diseño responsive.

**Seguridad.** Control de acceso por rol correcto y consistente en catálogos (desde 5.1) y en las 5 pantallas del Centro de Inteligencia (desde 7.3, mismo patrón `@Roles`/`RolesGuard`). Sigue abierta la superficie de configuración de infraestructura: `JWT_SECRET`/CORS con fallback inseguro si no se configuran explícitamente, sin límite de intentos de login — exactamente el mismo hallazgo señalado en el cierre de Bloque 5, todavía sin resolver.

**Producción.** Desplegada en Railway (`cereales-transport-production.up.railway.app` / `perceptive-tranquility-production-0b34.up.railway.app`), con despliegue automático confiable desde Bloque 6.3 (migraciones aplicadas antes de cortar tráfico a la versión nueva, healthcheck real). El incidente de migraciones sin aplicar de Bloque 6.1 quedó resuelto y no debería poder repetirse con el mecanismo actual. Deploy del código de Bloque 7.3.4.1/7.3.5 confirmado en línea (health `200`, rutas nuevas de Benchmarking respondiendo `401` sin token — comportamiento esperado, no `404`) — **validación autenticada completa (login real + lectura de datos) pendiente de credenciales de producción**, ver sección de validación al final de este documento.

---

## Deuda técnica general (sin cambios respecto al cierre de Bloque 5)

Ver `DEUDA_TECNICA.md` para el listado completo. Los puntos que siguen sin resolver, en orden de la propia clasificación de ese documento:

1. `JWT_SECRET`/`CORS_ORIGIN` sin fail-fast, sin rate-limiting en login.
2. `ClientesController.cuentaCorriente()` no excluye facturas anuladas del saldo.
3. Cero tests automatizados de framework.
4. Dockerfiles divergentes (raíz vs. `backend/Dockerfile`) sin unificar.
5. Backup de base de datos sin documentar/verificar.
6. CRUD de usuarios y edición de catálogos maestros sin exponer en la UI (el backend ya lo soporta).

**Lo único que cambió de estado en esta sección desde Bloque 5:** la automatización de `prisma migrate deploy` (antes P1 abierto en la sección B de `DEUDA_TECNICA.md`) quedó resuelta por Bloque 6.3 — se actualiza en `DEUDA_TECNICA.md` como parte de este cierre.

---

## Deuda residual específica del Motor de Inteligencia (nueva, Bloque 7)

Cinco puntos que el propio desarrollo de Bloque 7.3 dejó señalados, explícitamente, como pendientes — ninguno es un bug, todos son decisiones o capacidades futuras conscientemente diferidas:

### 1. Evolución de comisión (7.3.5)
`Benchmarking` responde evolución mensual de ingreso/costo/margen, pero no de comisión — `Liquidacion.comisionPct`/`LiquidacionViaje.comisionMonto` existen en el modelo pero nunca se expusieron en el Motor (`rentabilidad.calc.ts` calcula el margen neteando la comisión dentro de `LiquidacionViaje.totalViaje`, sin exponer el monto en sí). Decisión tomada en 7.3.5: no crear un hogar nuevo para comisión solo para esto — sería arquitectura nueva, no reutilización. **Si el negocio pide esto explícitamente**, el punto de partida es extender `RentabilidadService`/`rentabilidad.calc.ts` una vez más, de la misma forma aditiva que ya se hizo para cereal/ruta.

### 2. Alertas documentales (7.3.3.b, condicionada desde el origen)
El catálogo de 9 alertas de 7.3.3.a es completo excepto por las alertas documentales (vencimiento de licencia de chofer, RTO y seguro de vehículo) — quedaron condicionadas desde `BLOQUE7.3_ALCANCE.md` (Frontera 2) a que exista captura de esos vencimientos en el modelo. Confirmado entonces (grep sobre `Transportistas.tsx`) que ese campo no existe. Es el mismo hallazgo que `DEUDA_TECNICA.md` sección E ya señalaba como F4/N2 desde antes de Bloque 7 — Bloque 7 no lo resolvió, solo reconfirmó que sigue siendo un prerrequisito.

### 3. Migración del Dashboard operativo a semántica compartida
`dashboard.controller.ts` (el Dashboard original, no el Ejecutivo) calcula sus propios indicadores (`facturasVencidas`, `anticiposNoLiquidados`) con su propia lógica, **sin usar** `shared/vigencia.ts`/`shared/fecha.ts` del Motor — señalado explícitamente en `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` (Parte 2 y Parte 8, punto 4) como una decisión consciente de no tocarlo durante Bloque 7.3, no un descuido. Hoy conviven dos definiciones de "vencida"/"vigente" en el código: la del Motor (oficial, usada por 5 pantallas nuevas) y la del Dashboard operativo (previa, usada por 1 pantalla). No hay evidencia de que ambas den resultados distintos hoy, pero es una duplicación de semántica que el propio principio 4 de `BLOQUE7.2.d` ("la semántica es única y vinculante, nunca local") marca como algo a resolver, no a mantener indefinidamente.

### 4. Calibración de umbrales
Los 20 valores numéricos de `shared/umbrales.ts` (cuándo una alerta es informativa/preventiva/crítica: días de mora, montos de deuda, porcentajes de concentración) y el umbral de `benchmarking.calc.ts` (±2% para "sin cambio") son, según sus propios comentarios en el código, **valores de calibración inicial, no definiciones de negocio validadas**. Nadie del negocio los revisó todavía contra la operación real — quedaron fijados con criterio técnico razonable al momento de diseñar cada sub-bloque. Recomendado: revisarlos después de un período de uso real del Centro de Alertas/Benchmarking, no antes (no hay forma de calibrar bien sin datos de uso).

### 5. Exportaciones pendientes
Ninguna de las 5 pantallas del Centro de Inteligencia tiene botón de exportación (Excel/PDF), a diferencia de Liquidaciones. Es la misma brecha ya señalada en `DEUDA_TECNICA.md` (F7) para el resto del sistema, ahora también aplicable al Centro de Inteligencia — Gerencia no puede hoy llevarse un ranking o una comparación de períodos a una reunión sin capturas de pantalla.

---

## Validación de producción pendiente

Confirmado sin credenciales (lectura pública, sin autenticación):
- `GET /api/v1/health` → `200`.
- Frontend (`perceptive-tranquility-production-0b34.up.railway.app`) → `200`.
- Rutas nuevas de Benchmarking (`/api/v1/inteligencia/benchmarking/rankings`) → `401` (ruta existe, protegida — no `404`), confirma que el deploy automático de Bloque 7.3.4.1/7.3.5 llegó a producción.
- Mismo chequeo contra `/api/v1/inteligencia/rentabilidad` → `401`, mismo resultado.

**Pendiente, requiere credenciales de producción que no están documentadas en el repositorio (a propósito, por seguridad):** login real como `ADMINISTRADOR`/`GERENCIA` y verificación visual de las 5 pantallas del Centro de Inteligencia contra los datos reales de producción, más verificación de roles 200/403 con los usuarios reales que existan ahí. Se completa apenas se disponga de un usuario de validación — ver el cierre de esta conversación para cómo proceder.

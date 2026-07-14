# Bloque 7 — Roadmap Funcional (SDC v2)

Fecha: 2026-07-10. Documento de priorización pura — **no se modificó código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit, no se hizo push. No se diseña ninguna solución técnica ni se propone implementación** — solo se clasifica qué se encontró en `BLOQUE7_AUDITORIA_FUNCIONAL.md` por impacto, esfuerzo y riesgo, para decidir en qué orden conviene encararlo.

---

## Relación con la priorización técnica ya existente

Este documento **no reemplaza** a `ROADMAP_ACTUALIZADO.md`, `DEUDA_TECNICA.md` ni `PLAN_VERSION_1_0.md` — los complementa desde un ángulo distinto. Aquellos documentos priorizan deuda técnica y de infraestructura (seguridad, despliegue, modelo de datos, arquitectura). Este documento prioriza **funcionalidad de producto** — qué le falta a SDC para que el trabajo diario de un Director Operativo, un Responsable Administrativo o quien liquida viajes sea más simple, más informado y más autónomo.

Varios ítems de este roadmap ya estaban identificados en esos documentos (edición de catálogos, filtros de Anticipos, parejar UX de Facturas, gestión de usuarios) — acá se marcan explícitamente como **"Ya conocido"** con su referencia, no se duplican como si fueran hallazgos nuevos. Los ítems marcados **"Nuevo"** son aporte real de esta auditoría (Bloque 7): principalmente el cruce de datos ya existentes que hoy nadie combina (rentabilidad, aging, tiempos por etapa) y las alertas proactivas que hoy no existen en ningún punto del sistema.

---

## Criterios de clasificación

**Impacto** — cuánto cambia el trabajo diario del usuario si se resuelve:
- **Muy Alto:** cambia una limitación estructural (algo que hoy es imposible sin acceso técnico a la base, o una decisión que se toma a ciegas por falta de dato).
- **Alto:** reduce fricción o riesgo real de uso diario, en un flujo que se usa todos los días.
- **Medio:** mejora perceptible pero no crítica, o de uso frecuente pero no diario.
- **Bajo:** mejora cosmética o de uso esporádico.

**Esfuerzo** — tamaño relativo de la implementación (sin diseñar la solución, estimación de orden de magnitud):
- **XS:** exponer algo que el backend ya construye (un botón, un filtro ya soportado).
- **S:** un formulario o pantalla acotada, sin lógica de negocio nueva compleja.
- **M:** una funcionalidad nueva con lógica de negocio propia, acotada a un módulo.
- **L:** cruza varios módulos/entidades, o requiere una nueva superficie de UI significativa.
- **XL:** rediseño de un flujo completo o integración externa.

**Riesgo** — de romper algo existente o de tomar una decisión difícil de revertir:
- **Bajo:** aditivo, no toca lógica financiera crítica ya validada.
- **Medio:** toca un flujo financiero existente, o depende de una decisión de negocio no tomada todavía.
- **Alto:** toca directamente el cálculo de dinero ya validado (liquidar/facturar/cobrar) o requiere migrar datos existentes de forma no trivial.

---

## Tabla maestra — todas las mejoras identificadas

| # | Módulo | Mejora | Impacto | Esfuerzo | Riesgo | Origen |
|---|---|---|---|---|---|---|
| 1 | Anticipos | Exponer filtros ya soportados por el backend (chofer, transportista, fecha, liquidado, anulado) | Alto | XS/S | Bajo | Ya conocido — `DEUDA_TECNICA.md` F8 |
| 2 | Reportes | Exponer en la interfaz los exports Excel/PDF que el backend ya construye (Facturas, Anticipos, Choferes, Transportistas) | Alto | XS | Bajo | Ya conocido — F7 |
| 3 | Facturas | Parejar confirmación/doble-submit/feedback al nivel de Liquidaciones | Alto | S | Bajo | Ya conocido — "Muy recomendable" en `PLAN_VERSION_1_0.md` |
| 4 | Dashboard | Drill-down: cada KPI lleva a su lista filtrada correspondiente | Medio | S | Bajo | Ya conocido — F17 |
| 5 | Catálogos | Validación de formato/dígito verificador de CUIT | Medio | S | Bajo | Ya conocido — N11 |
| 6 | Dashboard | Alerta previa al vencimiento de facturas (no solo posterior) | Alto | S | Bajo | Nuevo |
| 7 | Dashboard | Indicador de "total a cobrar" y "total a pagar" (no solo lo vencido/confirmado) | Medio | S | Bajo | Nuevo |
| 8 | Liquidaciones | Mostrar en la propia pantalla el historial de override de comisión (`AuditLog`) | Bajo | S | Bajo | Nuevo |
| 9 | Liquidaciones | Comparación contra el período anterior del mismo chofer/transportista | Medio | S | Bajo | Nuevo |
| 10 | Viajes | Alerta de viajes estancados en un mismo estado por demasiado tiempo | Medio | S | Bajo | Nuevo |
| 11 | Usuarios | Indicador de último acceso / detección de cuentas inactivas | Medio | S | Bajo | Nuevo |
| 12 | Catálogos | **Exponer la edición de catálogos maestros que el backend ya soporta** (clientes, transportistas, choferes, vehículos, productores) | **Muy Alto** | M | Bajo | Ya conocido — F3/F6, "Muy recomendable" en `PLAN_VERSION_1_0.md` |
| 13 | Catálogos | Captura de vencimientos documentales (RTO, seguro, licencia) en los formularios de chofer/vehículo | **Muy Alto** | M | Bajo | Ya conocido, ampliado — F4/N2 |
| 14 | Liquidaciones | **Selección masiva de viajes + anticipos del período, con revisión antes de confirmar** | **Muy Alto** | M | Bajo | Nuevo |
| 15 | Usuarios | **CRUD de usuarios desde la interfaz** (alta, cambio de rol, baja) | **Muy Alto** | M | Medio | Ya conocido como diferido — N3, esta auditoría lo eleva de prioridad |
| 16 | Liquidaciones | Liquidación recurrente / plantilla (mismo chofer, período tipo) | Alto | M | Bajo | Nuevo |
| 17 | Facturas | Aging de cartera (bandas 30/60/90 días) | Alto | M | Bajo | Nuevo |
| 18 | Dashboard | Alertas proactivas de vencimiento documental (depende del ítem 13) | Alto | M | Bajo | Nuevo |
| 19 | Viajes | Duplicar viaje como plantilla / recordar última selección de transportista-chofer-camión | Medio | M | Bajo | Nuevo |
| 20 | Viajes | Cambio de estado en lote para varios viajes | Medio | M | Bajo | Nuevo |
| 21 | Viajes | Indicador de tiempo promedio por etapa del ciclo de vida (`HistorialEstadoViaje`) | Medio | M | Bajo | Nuevo |
| 22 | Anticipos | Alerta de acumulación de anticipos sin liquidar por chofer | Medio | M | Bajo | Nuevo |
| 23 | Anticipos | Carga real de comprobante (archivo) en vez de URL manual | Medio | M | Bajo | Nuevo |
| 24 | Dashboard | Comparación mes anterior / tendencia histórica | Medio | M | Bajo | Nuevo |
| 25 | Dashboard | Vista diferenciada para el rol `GERENCIA` | Medio | M | Bajo | Ya conocido, ampliado — N7 |
| 26 | Viajes | Documento adjunto (carta de porte/CTG/remito) | Medio | M | Bajo | Nuevo |
| 27 | Facturas | Numeración automática de factura | Alto | S | Medio | Ya conocido — N1, condicionado a N4 |
| 28 | Facturas | Vencimiento sugerido según condición comercial del cliente | Medio | M | Medio | Nuevo, depende de estructurar `condicionesComerciales` |
| 29 | Anticipos | Tope/límite de anticipo por chofer | Medio | M | Medio | Nuevo, depende de política de negocio |
| 30 | Reportes | **Reporte de rentabilidad por viaje/cliente/transportista** (cruce Viaje–Liquidación–Factura) | **Muy Alto** | L | Medio | **Nuevo — mayor hallazgo de esta auditoría** |
| 31 | Reportes | Módulo de Reportes centralizado, con filtros comunes de fecha/cliente/transportista/cereal | Alto | L | Bajo | Nuevo |
| 32 | Reportes | Envío periódico automático de reportes por email | Medio | M | Bajo | Nuevo |
| 33 | Viajes | Captura de peso real de báscula/romaneo, diferenciado de lo declarado | Alto | L | Medio | Nuevo, depende de decisión de negocio (cómo se integra el romaneo) |

---

## Agrupación en oleadas de trabajo

No es una propuesta de implementación (fuera de alcance de este documento) — es una lectura de la tabla anterior ordenada por relación impacto/esfuerzo/riesgo, para facilitar la conversación de qué encarar primero.

### Oleada 1 — Mejor relación esfuerzo/valor (Alto+ impacto, XS-S esfuerzo, riesgo bajo)

Ítems 1, 2, 3, 6, 7, 4, 5, 8, 9, 10, 11. Ninguno requiere una decisión de negocio previa ni migración de datos. Todos son, individualmente, ejecutables como sub-bloques cortos siguiendo la metodología habitual (auditoría puntual si hace falta → diseño → aprobación → implementación).

### Oleada 2 — Alto valor estructural, esfuerzo medio (M), riesgo bajo-medio

Ítems 12, 13, 14, 15, 16, 17, 18. Son los que más cambian el trabajo diario: edición de catálogos y CRUD de usuarios eliminan la dependencia de acceso técnico a la base para operaciones cotidianas; la selección masiva en Liquidaciones y el aging de cartera atacan directamente los dos flujos financieros de mayor frecuencia de uso (liquidar, cobrar).

### Oleada 3 — Mejoras funcionales de menor urgencia (impacto medio, esfuerzo M, riesgo bajo)

Ítems 19, 20, 21, 22, 23, 24, 25, 26. Mejoran el día a día pero ninguno resuelve una limitación estructural — candidatas naturales para intercalar entre ítems de las Oleadas 1 y 2, no para bloquear el inicio de otra cosa.

### Oleada 4 — Requieren una decisión de negocio antes de poder estimarse en serio

Ítems 27, 28, 29, 33. Cada uno depende de una respuesta que hoy no existe (¿AFIP reemplaza o complementa la Factura interna? ¿cómo se define un tope de anticipo razonable? ¿cómo se integra el romaneo real, hay una báscula digital o es carga manual?). Corresponde señalarlas como preguntas abiertas, igual que ya se hace con N4 en `DEUDA_TECNICA.md`, no estimarlas a ciegas.

### Oleada 5 — Grandes apuestas de producto (impacto muy alto o alto, esfuerzo L)

Ítems 30, 31, 32. El reporte de rentabilidad (30) es, en criterio de esta auditoría, la mejora individual de mayor impacto de negocio de todo el análisis — pero es también la de mayor esfuerzo relativo, porque cruza tres entidades que hoy nunca se combinan en un mismo cálculo. Conviene tratarla como su propio sub-bloque de auditoría+diseño dedicado cuando se decida encararla, no como parte de un sub-bloque más chico.

---

## Lectura de conjunto

Los tres patrones señalados al cierre de `BLOQUE7_AUDITORIA_FUNCIONAL.md` (trabajo de backend invisible en la UI, datos capturados y nunca cruzados, todo reactivo y nada proactivo) se corresponden exactamente con las tres oleadas de mayor impacto de este roadmap: la Oleada 1 resuelve en buena parte el primer patrón (exponer lo que ya existe), la Oleada 2 avanza sobre el segundo (edición, aging, selección masiva), y la Oleada 5 — en particular el reporte de rentabilidad — es la respuesta más directa al tercer patrón y al segundo a la vez.

**No se diseñó ninguna solución técnica, no se propuso implementación, no se escribió código.** Este documento es insumo para decidir el orden del próximo ciclo de sub-bloques del Bloque 7, a definir en una conversación de alcance separada.

# Diseño Técnico — Bloque 7.3.3.a: Alertas Operativas y Financieras

Fecha: 2026-07-11. Etapa 2 (Diseño técnico) de `METODOLOGIA_SDC.md` — **aprobado, con las seis decisiones de la sección 1. Documento de diseño puro: no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit.** Construye sobre `BLOQUE7.3.3_AUDITORIA_ALERTAS.md` (aprobada), sin reabrirla.

**División de alcance:** 7.3.3.a (este documento) cubre alertas operativas y financieras, implementables ahora. **7.3.3.b (alertas documentales) queda solo registrada** (sección 17) — no se diseña.

---

# 1. Decisiones aprobadas

## 1.1 Catálogo

Aprobado el catálogo consolidado de 9 alertas (sección 2). La rentabilidad incompleta (candidata #9 original) queda como resumen de contexto (`viajesRentabilidadIncompleta`), no como alerta independiente — evita duplicar la misma condición que ya cubren las alertas 6 y 7.

## 1.2 Roles

Filtrado por rol **en backend**, nunca en el frontend: `ADMINISTRADOR`/`GERENCIA` ven las nueve categorías; `FACTURACION` ve las financieras y de cartera; `OPERACIONES` ve las operativas; el resto de los roles no ve ninguna, salvo que una alerta se lo asigne explícitamente (tabla de la sección 3). El frontend no decide ni filtra destinatarios — recibe ya la lista que le corresponde a quien está logueado.

## 1.3 Persistencia y descarte

Las alertas no son persistentes ni descartables en 7.3.3.a. Se recalculan enteras en cada consulta; desaparecen únicamente cuando deja de cumplirse la condición que las generó.

## 1.4 Severidad

Se crea `inteligencia/shared/severidad.ts` (sección 7). La severidad se calcula en backend y llega ya final al frontend — ninguna pantalla decide ni ajusta un nivel de severidad.

## 1.5 Umbrales

Los 8 umbrales numéricos quedan aprobados **únicamente como valores iniciales de calibración**, no como definiciones permanentes. Se centralizan en un archivo nuevo, `inteligencia/shared/umbrales.ts` (sección 8), con nombres explícitos, documentados como configuración inicial — nunca dispersos en `alertas.controller.ts`, en `alertas.calc.ts` ni en el frontend. Ajustar un número ahí no cambia ninguna fórmula de severidad. No se crea pantalla de configuración ni persistencia en base — son constantes de código, editables en el próximo sub-bloque que lo requiera.

## 1.6 Alcance

"Alertar" sigue significando, únicamente, una superficie visual dentro de SDC. No incluye email, WhatsApp, SMS, push, tareas programadas externas ni migraciones.

---

# 2. Alcance final cerrado

**Incluye:** el catálogo de 9 alertas (sección 3), calculadas on-the-fly, filtradas por rol en backend, sin persistencia ni descarte, con severidad y umbrales centralizados en `inteligencia/shared/`. Un endpoint y una pantalla ("Centro de Alertas").

**No incluye:**
- Email, WhatsApp, SMS, push, tareas programadas externas — ninguna forma de notificación activa (sección 1.6).
- Persistencia de alertas o de su estado — ninguna tabla nueva, ninguna migración.
- Pantalla de configuración de umbrales — quedan como constantes de código (sección 1.5).
- Filtro opcional por `clienteId`/`choferId` en el endpoint — se evaluó y se decide dejarlo fuera de este sub-bloque; el catálogo completo por rol ya resuelve el caso de uso principal (ver qué necesita atención), y agregar un filtro sin un caso de uso concreto que lo pida sería alcance no solicitado.
- Alertas documentales (7.3.3.b) — solo registradas (sección 17).
- Cualquier cambio a `schema.prisma`.
- Retrofit de `rentabilidad.calc.ts`/`aging.calc.ts` — se importan y se reutilizan, no se modifican.

---

# 3. Catálogo de alertas

| # | Alerta | Fuente (reutiliza, no recalcula) |
|---|---|---|
| 1 | Factura vencida | `aging.calc.ts` → `detalleFacturas` (vencida=true) |
| 2 | Factura próxima a vencer | `aging.calc.ts` → `detalleFacturas` (vencida=false) |
| 3 | Cliente con deuda vencida elevada | `aging.calc.ts` → `porCliente` |
| 4 | Anticipo sin liquidar | `AnticipoGasto` (primera lectura desde el Motor) |
| 5 | Chofer con anticipos acumulados altos | `AnticipoGasto`, agregado por chofer |
| 6 | Viaje sin facturar | `rentabilidad.calc.ts` → `viajesIncompletos` |
| 7 | Viaje sin liquidar | `rentabilidad.calc.ts` → `viajesIncompletos` |
| 8 | Viaje estancado en un estado | `HistorialEstadoViaje` (primera lectura desde el Motor) |
| 9 | Concentración de deuda en un cliente | `aging.calc.ts` → `totales` + `porCliente` |

`viajesRentabilidadIncompleta` (resumen de contexto, no alerta): unión exacta de 6 y 7, ya provista por `rentabilidad.calc.ts`.

---

# 4. Valores iniciales de los 8 umbrales

Ninguno está validado contra historia real del negocio — son un punto de partida explícitamente ajustable (sección 1.5), centralizados en `inteligencia/shared/umbrales.ts`:

| Alerta | Constante | Valor inicial |
|---|---|---|
| 1. Factura vencida | `FACTURA_VENCIDA_SEVERIDAD_POR_BUCKET` | `{ "0-30": informativa, "31-60": preventiva, "61-90": critica, "+90": critica }` (reutiliza los buckets ya definidos por Aging — no un umbral nuevo, solo el mapeo a severidad) |
| 2. Factura próxima a vencer | `FACTURA_PROXIMA_VENCER_DIAS_PREVENTIVA` / `_CRITICA` | 7 días / 2 días |
| 3. Cliente deuda vencida elevada | `CLIENTE_DEUDA_VENCIDA_MONTO_PREVENTIVA` / `_CRITICA` | $200.000 / $500.000 |
| 4. Anticipo sin liquidar | `ANTICIPO_SIN_LIQUIDAR_DIAS_INFORMATIVA` / `_PREVENTIVA` / `_CRITICA` | 15 / 31 / 61 días |
| 5. Chofer anticipos altos | `CHOFER_ANTICIPOS_MONTO_PREVENTIVA` / `_CRITICA` | $100.000 / $250.000 |
| 6. Viaje sin facturar | `VIAJE_SIN_FACTURAR_DIAS_INFORMATIVA` / `_PREVENTIVA` / `_CRITICA` | 0 / 8 / 16 días |
| 7. Viaje sin liquidar | `VIAJE_SIN_LIQUIDAR_DIAS_INFORMATIVA` / `_PREVENTIVA` / `_CRITICA` | 0 / 8 / 16 días |
| 8. Viaje estancado | `VIAJE_ESTANCADO_DIAS_INFORMATIVA` / `_PREVENTIVA` / `_CRITICA` | 3 / 6 / 11 días (umbral único para todos los estados — diferenciar por estado queda para una mejora futura) |
| 9. Concentración en un cliente | `CONCENTRACION_CLIENTE_PCT_PREVENTIVA` / `_CRITICA` | 25% / 40% |

Alertas 2, 3, 5 y 9 tienen solo dos niveles (preventiva/crítica) — no existe un nivel "informativa" para ellas: por diseño, no alertan en absoluto por debajo del umbral preventivo (a diferencia de 1, 4, 6, 7 y 8, que sí muestran un primer nivel informativo antes de escalar).

---

# 5. Reglas por alerta

| Alerta | Destinatarios (rol) | Acción esperada | Deja de estar activa cuando | Agrupación |
|---|---|---|---|---|
| 1. Factura vencida | ADMINISTRADOR, GERENCIA, FACTURACION | Gestionar el cobro | Se cobra del todo o se anula | Por registro (factura) |
| 2. Factura próxima a vencer | ADMINISTRADOR, GERENCIA, FACTURACION | Contactar al cliente antes del vencimiento | Se cobra, se anula, o vence (pasa a ser #1) | Por registro (factura) |
| 3. Cliente deuda vencida elevada | ADMINISTRADOR, GERENCIA, FACTURACION | Revisar la relación comercial / priorizar cobro | Baja del umbral | Por entidad (cliente) |
| 4. Anticipo sin liquidar | ADMINISTRADOR, GERENCIA, LIQUIDACIONES | Incluirlo en la próxima liquidación | Se liquida o se anula | Por registro (anticipo) |
| 5. Chofer anticipos altos | ADMINISTRADOR, GERENCIA, LIQUIDACIONES | Acelerar la liquidación del chofer | Baja del umbral | Por entidad (chofer) |
| 6. Viaje sin facturar | ADMINISTRADOR, GERENCIA, FACTURACION | Facturar el viaje | Se factura | Por registro (viaje) |
| 7. Viaje sin liquidar | ADMINISTRADOR, GERENCIA, LIQUIDACIONES | Liquidar el viaje | Se liquida | Por registro (viaje) |
| 8. Viaje estancado | ADMINISTRADOR, GERENCIA, OPERACIONES | Revisar por qué no avanza | Cambia de estado | Por registro (viaje) |
| 9. Concentración en un cliente | ADMINISTRADOR, GERENCIA | Evaluar riesgo de concentración comercial | Baja del umbral | Por entidad (cliente) |

Ninguna alerta acepta un mecanismo de "descartar" (sección 1.3) — no hay dónde persistir ese estado, y ocultar una condición real sin resolverla violaría el principio de abstracción reversible de `BLOQUE7.2.d`.

---

# 6. Cómo se evitan duplicados y cómo se reutiliza el resto del Motor

- Alertas 1, 2, 3, 9 → llaman a `calcularAging()` ya existente, leen su resultado.
- Alertas 6, 7 → llaman a `calcularRentabilidad()` ya existente, leen `viajesIncompletos`.
- Alertas 4, 5 → primera lectura de `AnticipoGasto` desde el Centro. Hoy ese dato también vive, de forma ad-hoc, en `DashboardController` (`dashboard.controller.ts:41-45`) — se acepta esa duplicación temporal, igual que ya se aceptó para "vencida" en 7.3.2, documentada como deuda técnica (sección 17).
- Alerta 8 → primera lectura de `HistorialEstadoViaje` desde el Centro, sin cálculo previo que reutilizar.
- Todas usan `inteligencia/shared/fecha.ts` para "hoy" y antigüedad — ninguna calcula una fecha de referencia por su cuenta.
- Ninguna alerta necesita `desde`/`hasta` — todas responden sobre el estado actual (`BLOQUE7.3.3_AUDITORIA_ALERTAS.md` ya lo anticipaba).

---

# 7. `inteligencia/shared/severidad.ts`

```
severidadPorUmbral(valor, umbralPreventiva, umbralCritica) =
  valor ≥ umbralCritica    → "critica"
  valor ≥ umbralPreventiva → "preventiva"
  si no                     → "informativa"
```

Cada función de `alertas.calc.ts` decide, además, su propio **umbral de inclusión** (el valor mínimo para que la alerta exista): para las de 3 niveles (1, 4, 6, 7, 8) es el umbral "informativa"; para las de 2 niveles (2, 3, 5, 9) es directamente el umbral "preventiva" — no se muestran en absoluto por debajo de él.

---

# 8. `inteligencia/shared/umbrales.ts`

Un único archivo, con una constante nombrada por cada valor de la tabla de la sección 4 — ejemplo de forma, sin código de implementación:

```
FACTURA_PROXIMA_VENCER_DIAS_PREVENTIVA = 7
FACTURA_PROXIMA_VENCER_DIAS_CRITICA = 2
CLIENTE_DEUDA_VENCIDA_MONTO_PREVENTIVA = 200000
CLIENTE_DEUDA_VENCIDA_MONTO_CRITICA = 500000
ANTICIPO_SIN_LIQUIDAR_DIAS_INFORMATIVA = 15
ANTICIPO_SIN_LIQUIDAR_DIAS_PREVENTIVA = 31
ANTICIPO_SIN_LIQUIDAR_DIAS_CRITICA = 61
CHOFER_ANTICIPOS_MONTO_PREVENTIVA = 100000
CHOFER_ANTICIPOS_MONTO_CRITICA = 250000
VIAJE_SIN_FACTURAR_DIAS_INFORMATIVA = 0
VIAJE_SIN_FACTURAR_DIAS_PREVENTIVA = 8
VIAJE_SIN_FACTURAR_DIAS_CRITICA = 16
VIAJE_SIN_LIQUIDAR_DIAS_INFORMATIVA = 0
VIAJE_SIN_LIQUIDAR_DIAS_PREVENTIVA = 8
VIAJE_SIN_LIQUIDAR_DIAS_CRITICA = 16
VIAJE_ESTANCADO_DIAS_INFORMATIVA = 3
VIAJE_ESTANCADO_DIAS_PREVENTIVA = 6
VIAJE_ESTANCADO_DIAS_CRITICA = 11
CONCENTRACION_CLIENTE_PCT_PREVENTIVA = 0.25
CONCENTRACION_CLIENTE_PCT_CRITICA = 0.40
FACTURA_VENCIDA_SEVERIDAD_POR_BUCKET = { "0-30": informativa, "31-60": preventiva, "61-90": critica, "+90": critica }
```

`alertas.calc.ts` importa estas constantes — nunca declara un número suelto propio. Ajustar un valor acá no requiere tocar ninguna fórmula de severidad ni ningún controller.

---

# 9. Roles y filtrado en backend

`AlertasController` se declara accesible para la unión de todos los roles destinatarios (`ADMINISTRADOR`, `GERENCIA`, `FACTURACION`, `LIQUIDACIONES`, `OPERACIONES`). Dentro del método, filtra la lista de alertas ya calculada según el rol del usuario autenticado (`@CurrentUser()`) contra la tabla de la sección 5 — nunca según un parámetro que el cliente HTTP pueda enviar. El frontend no recibe categorías que no le corresponden; no hay nada que ocultar del lado del cliente.

---

# 10. Contrato conceptual del endpoint

`GET /inteligencia/alertas`

**Autorización:** `@Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION", "LIQUIDACIONES", "OPERACIONES")`, filtrado interno por categoría (sección 9).

**Query params:** ninguno (sección 2 — sin filtro por cliente/chofer en este alcance; sin período, sección 6).

**Respuesta:**
```
{
  fechaCorte: "2026-07-11",
  resumen: { total, criticas, preventivas, informativas },
  alertas: [
    {
      tipo: "factura_vencida" | "factura_proxima_vencer" | "cliente_deuda_vencida" |
            "anticipo_sin_liquidar" | "chofer_anticipos_altos" |
            "viaje_sin_facturar" | "viaje_sin_liquidar" | "viaje_estancado" |
            "concentracion_cliente",
      severidad: "informativa" | "preventiva" | "critica",
      entidadId: string,
      entidadNombre: string,
      mensaje: string,
      valor: number,
      detalle: { ... }
    }
  ],
  viajesRentabilidadIncompleta: { total, sinFacturar, sinLiquidar, ambos }
}
```

**Contrato de responsabilidad:** todo campo llega calculado, incluida la severidad (sección 1.4) — el frontend no deriva ni ajusta nada más allá de formato.

---

# 11. Archivos previstos

**Backend:**

| Archivo | Contenido |
|---|---|
| `backend/src/inteligencia/shared/umbrales.ts` | Las 20 constantes nombradas de la sección 8 |
| `backend/src/inteligencia/shared/severidad.ts` | `severidadPorUmbral()` (sección 7) |
| `backend/src/inteligencia/reportes/alertas.calc.ts` | Una función pura por tipo de alerta (1-9), más el resumen `viajesRentabilidadIncompleta`; importa `umbrales.ts` y `severidad.ts`, nunca declara un número suelto |
| `backend/src/inteligencia/alertas.controller.ts` | `AlertasController` — orquesta las consultas, llama a `calcularAging()`/`calcularRentabilidad()` ya existentes, consulta `AnticipoGasto`/`HistorialEstadoViaje`, filtra por rol (sección 9) |
| `backend/src/inteligencia/inteligencia.module.ts` | Modificado — se agrega `AlertasController` |

**Sin cambios en:** `inteligencia.controller.ts`, `aging.controller.ts`, `rentabilidad.calc.ts`, `aging.calc.ts`, `DashboardController`, `schema.prisma`.

**Frontend:**

| Archivo | Contenido |
|---|---|
| `frontend/src/pages/Alertas.tsx` | "Centro de Alertas": resumen por severidad, lista agrupada por tipo, sección de contexto para `viajesRentabilidadIncompleta` — sin botón de descarte |
| `frontend/src/App.tsx` | Ruta `/inteligencia/alertas` |
| `frontend/src/components/Layout.tsx` | Entrada de menú, visible para los cinco roles (contenido ya filtrado por backend) |

---

# 12. Impacto en frontend

`Alertas.tsx` presenta el resumen y la lista, cada alerta con su severidad (color), entidad, mensaje y valor — todo tal cual llega del backend. Sin cálculo de días, montos ni porcentajes en el frontend. Sin botón de "descartar" (sección 1.3).

---

# 13. Criterios de aceptación

1. Cada una de las 9 alertas aparece cuando su condición se cumple y desaparece cuando deja de cumplirse.
2. La alerta de concentración no falla al dividir por cero cuando `totales.totalVencido` de Aging es 0 — simplemente no aparece.
3. `OPERACIONES` solo ve `viaje_estancado`; `FACTURACION` ve las financieras/cartera (1, 2, 3, 6); `LIQUIDACIONES` ve las de anticipos y liquidación (4, 5, 7); `ADMINISTRADOR`/`GERENCIA` ven las nueve.
4. La candidata "rentabilidad incompleta" no aparece como alerta individual, solo como `viajesRentabilidadIncompleta`.
5. Ninguna alerta expone un mecanismo de descarte.
6. Los resultados de aging/rentabilidad usados internamente coinciden exactamente con `/inteligencia/cobranzas/aging` y `/inteligencia/rentabilidad` para el mismo instante.
7. `alertas.calc.ts` no contiene ningún número suelto de umbral — todos vienen de `shared/umbrales.ts`.
8. `Alertas.tsx` no contiene ninguna operación aritmética sobre importes, días o porcentajes fuera de formato de presentación, y no calcula ni ajusta severidad.
9. Rol `LECTURA` recibe 403.

---

# 14. Plan de pruebas

1. Factura vencida hace 5 días → `factura_vencida`, `informativa` (bucket 0-30).
2. Factura que vence en 3 días → `factura_proxima_vencer`, `critica`.
3. Cliente con `totalVencido` = $250.000 → `preventiva`; con $600.000 → `critica`.
4. Anticipo sin liquidar hace 40 días → `preventiva`; hace 10 días → no aparece (por debajo del umbral informativa de 15).
5. Chofer con $300.000 acumulados → `critica`.
6. Viaje sin facturar hace 20 días → `critica`; hace 2 días → `informativa`.
7. Viaje sin liquidar, mismos casos que 6.
8. Viaje en `EN_TRANSITO` hace 12 días → `critica`; hace 1 día → no aparece (por debajo de 3).
9. Viaje sin facturar y sin liquidar a la vez → aparece en 6, en 7, y en `viajesRentabilidadIncompleta.ambos`.
10. Cliente con 45% de la deuda vencida total → `critica`; cartera sin deuda vencida → alerta de concentración ausente, sin error.
11. `OPERACIONES` → solo `viaje_estancado`. `FACTURACION` → 1, 2, 3, 6. `LIQUIDACIONES` → 4, 5, 7. `LECTURA` → 403.
12. Cambiar un valor en `umbrales.ts` (por ejemplo, `VIAJE_ESTANCADO_DIAS_PREVENTIVA`) reclasifica los casos de borde sin tocar `alertas.calc.ts`.
13. Regresión: `/inteligencia/rentabilidad`, `/inteligencia/cobranzas/aging`, Dashboard, Facturas, Liquidaciones sin cambios.

---

# 15. Riesgos y mitigación

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Umbrales mal calibrados (ruido o silencio) | Centralizados y nombrados (sección 8), ajustables sin tocar código de fórmulas — mitigación estructural, no solo de proceso |
| 2 | `AlertasController` reimplementa vigencia de Factura/Cobranza en vez de llamar a `calcularAging()` | Criterio de aceptación 6 |
| 3 | Un rol ve una categoría que no le corresponde | Filtrado server-side (sección 9); criterio de aceptación 3 |
| 4 | Duplicación de la lectura de `AnticipoGasto` entre Dashboard y Alertas diverge con el tiempo | Aceptada y documentada como deuda técnica (sección 17) |
| 5 | Umbral único de "viaje estancado" sin diferenciar por estado genera falsos positivos | Documentado como simplificación deliberada (sección 4) |

---

# 16. Plan de rollback

100% aditivo: dos archivos de semántica compartida nuevos, un archivo de cálculo nuevo, un controller nuevo, una ruta de frontend nueva. Ningún archivo existente pierde lógica propia. Revertir es eliminar el commit.

---

# 17. 7.3.3.b y deuda técnica — registradas, no diseñadas

- **7.3.3.b (alertas documentales):** condicionada a que exista captura confiable de vencimiento de licencia/RTO/seguro (`BLOQUE7.3.3_AUDITORIA_ALERTAS.md`, Parte 1) — sin abrir.
- Migración de `DashboardController` para consumir `esVencida()` de `shared/vigencia.ts`.
- Unificar la lectura de `AnticipoGasto` (duplicada entre Dashboard y Alertas).

---

## Cierre

Diseño aprobado con las seis decisiones de la sección 1. No se implementó nada todavía — no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push. Queda a la espera de la instrucción explícita para iniciar la Implementación de 7.3.3.a.

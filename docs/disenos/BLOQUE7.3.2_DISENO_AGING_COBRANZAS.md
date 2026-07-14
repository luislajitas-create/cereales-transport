# Diseño Técnico — Bloque 7.3.2: Aging de Cobranzas y Tablero Financiero

Fecha: 2026-07-11. Etapa 2 (Diseño técnico) de `METODOLOGIA_SDC.md` — **aprobado, con las siete decisiones de la sección 1. Documento de diseño puro: no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit.** Construye sobre `BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md` (aprobada), sin reabrirla.

---

# 1. Decisiones aprobadas

## 1.1 DSO

Se incluyen los dos, nunca combinados en un número único. **DSO histórico es el indicador oficial** (facturas ya `COBRADO_TOTAL`: promedio de `fecha de la cobranza que completó el pago − Factura.fecha`). **DSO snapshot/clásico se presenta como aproximación complementaria**, explícitamente etiquetada (`saldo pendiente total actual / ventas del período × días del período`). Cuando no hay datos suficientes (ninguna Factura `COBRADO_TOTAL` en el período para el histórico), el valor es `null` — nunca `0`.

## 1.2 Definición oficial de "vencida"

Una Factura está vencida **desde el día siguiente** a su fecha de vencimiento (no en el instante en que se supera la fecha/hora — la comparación es entre fechas de negocio normalizadas, sin componente horario):

```
esVencida(factura, hoyFecha) =
  factura.estado !== "ANULADO"
  AND factura.estado !== "COBRADO_TOTAL"
  AND normalizarFecha(factura.vencimiento) < hoyFecha
```

Vive en `backend/src/inteligencia/shared/vigencia.ts` (sección 7) — es la semántica oficial del Motor de Inteligencia a partir de 7.3.2. `DashboardController` **no se modifica en este sub-bloque**; su migración para consumir esta misma función, en vez de mantener su fórmula propia (`dashboard.controller.ts:32-35`), queda como deuda técnica documentada (sección 13), no como trabajo de 7.3.2.

## 1.3 Aging y período

La cartera de aging representa el estado completo **a la fecha de consulta** — no se filtra por `desde`/`hasta`. El período se usa exclusivamente para los cálculos de DSO (y cualquier otro indicador de período que se agregue a futuro). Buckets oficiales: **0-30, 31-60, 61-90, +90** días de mora. La deuda no vencida se muestra siempre separada, como **"por vencer"** — nunca dentro del bucket "0-30" ni de ningún otro bucket de mora.

## 1.4 Semántica compartida

Se crean `inteligencia/shared/fecha.ts`, `inteligencia/shared/vigencia.ts`, `inteligencia/shared/dinero.ts` (sección 7). **No se refactoriza 7.3.1** en este sub-bloque — `rentabilidad.calc.ts` sigue con su lógica inline hasta que se decida migrarlo aparte.

## 1.5 Roles

Acceso para `ADMINISTRADOR`, `GERENCIA` y **`FACTURACION`**. Esto es exclusivo del endpoint de aging — **no modifica el acceso al endpoint de rentabilidad de 7.3.1** (`InteligenciaController.rentabilidad()` sigue restringido a `ADMINISTRADOR`/`GERENCIA` únicamente, sin cambios). Al vivir aging en un controller separado (sección 1.6), esto se cumple sin tocar el controller de 7.3.1 en absoluto.

## 1.6 Organización

Se crea un controller específico, `AgingController`, dentro del módulo `inteligencia` — no se agrega a `InteligenciaController`. Ruta: `GET /inteligencia/cobranzas/aging`. Toda la lógica de cálculo permanece en funciones puras del Motor (`aging.calc.ts`), el controller solo orquesta la consulta y aplica autorización — mismo principio ya establecido para `InteligenciaController`/`rentabilidad.calc.ts` en 7.3.1.

## 1.7 Días de mora por cliente

`diasMoraPromedio` usa **promedio ponderado por saldo pendiente**, no promedio simple:

```
diasMoraPromedio(cliente) = Σ (diasMora_i × saldoPendiente_i) / Σ saldoPendiente_i
                             — solo sobre facturas vencidas de ese cliente
```

Una deuda de $500 vencida hace 5 días no pesa igual que una de $500.000 vencida hace 5 días bajo un promedio simple — el ponderado corrige eso, mismo criterio ya usado en `margenPct` de 7.3.1 (total/total, no promedio ingenuo de proporciones).

---

# 2. Alcance final cerrado

**Incluye:**
- Saldo pendiente, deuda vencida, deuda por vencer, días de mora y aging por buckets — por Factura, por Cliente y total.
- DSO histórico (oficial) y DSO snapshot/clásico (complementario), nunca combinados.
- Endpoint `GET /inteligencia/cobranzas/aging` y pantalla `Aging.tsx`, roles `ADMINISTRADOR`/`GERENCIA`/`FACTURACION`.
- `inteligencia/shared/fecha.ts`, `vigencia.ts`, `dinero.ts`.

**No incluye:**
- Exportación Excel/PDF → diferido a un futuro **7.3.2.b**, no abierto.
- Modificar `DashboardController` → deuda técnica documentada (sección 13), sub-bloque futuro.
- Normalizar `Cobranza.medioPago` (D5) → no bloquea, no se resuelve acá.
- DSO de tendencia (mes a mes) → Nivel 4/Tendencia, corresponde a 7.3.5.
- Retrofit de `rentabilidad.calc.ts` para usar la semántica compartida nueva → mejora futura opcional.
- Cualquier cambio a `schema.prisma` → no hace falta ninguno.

---

# 3. Definiciones oficiales

Sobre una Factura vigente (`estado !== "ANULADO"`), con `hoyFecha` = fecha de hoy normalizada a medianoche (sección 1.2):

```
saldoPendiente(factura) = factura.importe − Σ Cobranza.importe (solo anulada: false)
esVencida(factura)      = sección 1.2
diasMora(factura)       = esVencida(factura) ? (hoyFecha − vencimiento, en días) : 0
bucket(factura)          = !esVencida(factura)   → "por vencer"   (nunca "0-30", sección 1.3)
                            diasMora 1-30         → "0-30"
                            diasMora 31-60        → "31-60"
                            diasMora 61-90        → "61-90"
                            diasMora > 90         → "+90"
```

- **Deuda vencida** = Σ `saldoPendiente` de facturas donde `esVencida = true`.
- **Deuda por vencer** = Σ `saldoPendiente` de facturas donde `esVencida = false` y `saldoPendiente > 0`.
- **Total pendiente** = deuda vencida + deuda por vencer.
- Una Factura con `saldoPendiente = 0` (`COBRADO_TOTAL`) no participa de ninguna de las tres sumas.
- `diasMoraPromedio` por cliente: ponderado por saldo (sección 1.7).

---

# 4. Tratamiento de cobranzas parciales y anuladas

- Toda suma de cobrado usa exclusivamente `Cobranza.anulada === false` — `Factura.estado` se lee tal cual, ya confiable (`BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md`, Parte 1).
- Una Factura `ANULADO` se excluye **antes** de cualquier otro cálculo — no se le calcula saldo, mora ni bucket (nunca convive con cobranza vigente, auditoría Parte 3).
- Una Factura `COBRADO_PARCIAL` participa normalmente — su `saldoPendiente` es, por invariante del propio sistema (`calcularEstadoFactura`, `facturas.controller.ts:18-22`), siempre mayor a cero.

---

# 5. Arquitectura de cálculo

On-the-fly, igual que 7.3.1 (`BLOQUE7.3.1_DISENO_RENTABILIDAD.md`, sección 4) — sin tabla materializada, sin caché, sin migración. Índices ya existentes sobre `Factura.vencimiento` y `Factura.clienteId` (`schema.prisma:367-368`) cubren los filtros principales.

La vista de aging **no se filtra por `desde`/`hasta`** (sección 1.3) — el período se usa únicamente para poblar el DSO histórico (facturas cobradas totalmente en ese rango) y el denominador del DSO snapshot (ventas del período).

---

# 6. Contrato definitivo del endpoint

`GET /inteligencia/cobranzas/aging`

**Autorización:** `@Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION")` (sección 1.5), en `AgingController` — no afecta los roles de `InteligenciaController.rentabilidad()`.

**Query params:** `clienteId` (opcional, filtra la cartera). `desde`/`hasta` (opcionales, período de emisión usado solo para DSO; por defecto, el mes en curso — mismo criterio ya usado en `Rentabilidad.tsx`).

**Respuesta:**
```
{
  fechaCorte: "2026-07-11",
  periodo: { desde, hasta },
  totales: {
    totalPendiente, totalVencido, totalPorVencer,
    facturasPendientes, facturasVencidas
  },
  aging: {
    "0-30":  { monto, facturas },
    "31-60": { monto, facturas },
    "61-90": { monto, facturas },
    "+90":   { monto, facturas }
  },
  porCliente: [
    { clienteId, cliente, totalPendiente, totalVencido, totalPorVencer, diasMoraPromedio, facturas }
  ],                                        // orden descendente por totalVencido; diasMoraPromedio ponderado (1.7)
  detalleFacturas: [
    { facturaId, numero, cliente, fecha, vencimiento, importe, saldoPendiente, diasMora, vencida, bucket }
  ],
  dso: {
    historico: { dias, facturasConsideradas } | null,      // null si ninguna COBRADO_TOTAL en el período
    snapshotClasico: { dias, ventasPeriodo, carteraActual } // siempre etiquetado como aproximación
  }
}
```

**Contrato de responsabilidad:** igual que 7.3.1 — todo campo llega calculado, el frontend no deriva nada más allá de formato de presentación.

---

# 7. Archivos previstos

**Backend:**

| Archivo | Contenido |
|---|---|
| `backend/src/inteligencia/shared/fecha.ts` | `hoyNormalizado()`, `diferenciaEnDias()` |
| `backend/src/inteligencia/shared/vigencia.ts` | `esFacturaVigente()`, `esCobranzaVigente()`, `esVencida()` — generalizables a futuro para Liquidación |
| `backend/src/inteligencia/shared/dinero.ts` | `TOLERANCIA_REDONDEO`, `esCero()` |
| `backend/src/inteligencia/reportes/aging.calc.ts` | Funciones puras: `calcularAging(facturas)` — saldo, vencida, mora, buckets, DSO (histórico + snapshot), `diasMoraPromedio` ponderado |
| `backend/src/inteligencia/aging.controller.ts` | `AgingController` nuevo — `GET /inteligencia/cobranzas/aging` (sección 1.6) |
| `backend/src/inteligencia/inteligencia.module.ts` | Modificado — se agrega `AgingController` a `controllers: []`, junto a `InteligenciaController` |

**Sin cambios en:** `inteligencia.controller.ts` (el de 7.3.1), `rentabilidad.calc.ts`, `FacturasController`, `DashboardController`, `schema.prisma`.

**Frontend:**

| Archivo | Contenido |
|---|---|
| `frontend/src/pages/Aging.tsx` | Página nueva, mismo patrón que `Rentabilidad.tsx`: filtros, totales, aging por bucket, por cliente (detalle expandible), detalle de facturas, DSO (los dos números, etiquetados y separados) |
| `frontend/src/App.tsx` | Modificado — ruta `/inteligencia/cobranzas/aging` |
| `frontend/src/components/Layout.tsx` | Modificado — entrada de menú, roles `["ADMINISTRADOR", "GERENCIA", "FACTURACION"]` |

---

# 8. Impacto en frontend

`Aging.tsx` presenta: totales (pendiente/vencido/por vencer, este último siempre distinguido de los buckets de mora), una fila por bucket con monto y cantidad de facturas, tabla "por cliente" (con `diasMoraPromedio` ponderado y expandible de detalle, mismo mecanismo que `Rentabilidad.tsx`), tabla de detalle de facturas, y una sección de DSO con **los dos números por separado, cada uno con su etiqueta** ("DSO histórico" / "DSO aproximado (snapshot)"). Sin exportación (sección 2).

---

# 9. Criterios de aceptación

1. Una Factura `ANULADO` no aparece en ningún total, bucket ni DSO.
2. Una Cobranza anulada no reduce el saldo pendiente de su Factura.
3. Una Factura que vence hoy mismo **no** aparece como vencida — aparece en "por vencer" (sección 1.2).
4. Una Factura que venció ayer aparece con 1 día de mora, en el bucket "0-30".
5. DSO histórico es `null`, no `0`, cuando no hay ninguna Factura `COBRADO_TOTAL` en el período.
6. DSO histórico y DSO snapshot nunca se combinan en un solo campo ni en un solo número mostrado.
7. `esVencida()`, `hoyNormalizado()` y el filtro de vigencia viven en `inteligencia/shared/`; `aging.calc.ts` los importa — sin lógica de vigencia o fecha duplicada dentro de `aging.calc.ts`.
8. El período (`desde`/`hasta`) no excluye facturas viejas de la vista de aging — solo afecta el DSO.
9. `diasMoraPromedio` por cliente es ponderado por saldo, no promedio simple — verificado con un caso donde ambos cálculos den resultados distintos.
10. Un usuario `FACTURACION` accede a `/inteligencia/cobranzas/aging` sin problema, pero recibe 403 en el endpoint de rentabilidad de 7.3.1 (sección 1.5, verifica que no se filtró el aislamiento de roles).
11. Un rol no autorizado (`OPERACIONES`, `LIQUIDACIONES`, `LECTURA`) recibe 403 en aging; menú oculto.
12. Ningún archivo de 7.3.1 (`rentabilidad.calc.ts`, `inteligencia.controller.ts`) cambió de comportamiento.
13. `Aging.tsx` no contiene ninguna operación aritmética sobre importes fuera de formato de presentación.

---

# 10. Plan de pruebas

1. Factura con saldo total pendiente, sin cobranzas → `saldoPendiente = importe`.
2. Factura con una cobranza parcial vigente → saldo = importe − cobranza.
3. Factura con una cobranza anulada → esa cobranza no descuenta nada.
4. Factura `ANULADO` → ausente de todos los cálculos.
5. Factura que vence exactamente hoy → `esVencida = false`, va a "por vencer".
6. Factura vencida ayer → 1 día de mora, bucket "0-30".
7. Facturas en cada borde de bucket (30/31, 60/61, 90/91 días de mora) → clasificación correcta sin solaparse.
8. Cliente con una factura de bajo saldo muy vencida y otra de saldo alto poco vencida → `diasMoraPromedio` ponderado da un resultado distinto (y correcto) al que daría un promedio simple.
9. Período con al menos una Factura `COBRADO_TOTAL` → DSO histórico calcula un número; período sin ninguna → `null`.
10. DSO snapshot con cartera y ventas conocidas → verificar la fórmula a mano contra un caso real.
11. Filtro por `clienteId` → reduce correctamente `porCliente` y `detalleFacturas`.
12. Cambiar el período (`desde`/`hasta`) → la vista de aging no cambia (solo el DSO).
13. Usuario `FACTURACION`: acceso a aging OK, 403 en `/inteligencia/rentabilidad`.
14. Usuario `OPERACIONES`/`LIQUIDACIONES`/`LECTURA`: 403 en aging.
15. Regresión: `rentabilidad()`, Facturas, Cobranzas, Dashboard, Conciliación sin cambios de comportamiento.

---

# 11. Riesgos y mitigación

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El Dashboard y el Motor muestran dos números distintos de "facturas vencidas" (Dashboard no migra en este sub-bloque) | Riesgo aceptado explícitamente (sección 2); migración documentada como deuda técnica (sección 13) |
| 2 | Confundir DSO histórico con DSO snapshot en el frontend o en una futura integración (7.3.4) | Etiquetas explícitas siempre visibles, nunca un campo `dso` único |
| 3 | La corrección de "inicio de mora" (sección 1.2) reclasifica alguna Factura que hoy el Dashboard cuenta como vencida y el Motor no | Corrección deliberada, documentada como diferencia de criterio conocida hasta que el Dashboard migre |
| 4 | Ampliar roles de aging (`FACTURACION`) termine filtrando por error hacia el endpoint de rentabilidad | Controllers separados (sección 1.6) — cada uno con su propio `@Roles`, sin herencia; criterio de aceptación 10 lo verifica explícitamente |
| 5 | Duplicar de nuevo la semántica compartida en un futuro 7.3.3/7.3.5 en vez de reutilizar `shared/` | Precedente y regla 8 de `BLOQUE7.3.0`; reiterado en criterio de aceptación 7 |

---

# 12. Plan de rollback

100% aditivo: un controller nuevo, un módulo de cálculo nuevo, tres archivos de semántica compartida nuevos, dos rutas de frontend nuevas. Ningún archivo existente pierde ni cambia una línea de lógica propia (`inteligencia.module.ts` solo gana una entrada en su lista de `controllers`). Revertir es eliminar el commit — sin datos que reconciliar.

---

# 13. Pendiente registrado, no abierto

- **7.3.2.b** — exportación Excel/PDF del tablero de aging.
- **Migración de `DashboardController`** para consumir `esVencida()` de `inteligencia/shared/vigencia.ts` en vez de su fórmula propia (`dashboard.controller.ts:32-35`) — deuda técnica documentada, sub-bloque futuro, fuera de Bloque 7.3.
- **Retrofit de `rentabilidad.calc.ts`** para usar `inteligencia/shared/` — mejora opcional futura, no incluida en 7.3.2.

---

## Cierre

Diseño aprobado con las siete decisiones de la sección 1. No se implementó nada todavía — no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push. Queda a la espera de la instrucción explícita para iniciar la Etapa 4 (Implementación).

# Diseño Técnico — Bloque 7.3.1: Rentabilidad por Viaje, Cliente y Transportista

Fecha: 2026-07-11. Etapa 2 (Diseño técnico) de `METODOLOGIA_SDC.md` — **aprobado, con las tres decisiones de la sección 1. Documento de diseño puro: no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit.** Construye sobre `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` (aprobada) y `BLOQUE7.3_ALCANCE.md`, sin reabrir ninguno de los dos.

**Actualización post-aprobación (mismo día):** el módulo se renombró de `reportes/` a `inteligencia/`, con subcarpetas preparadas para el crecimiento del Centro de Inteligencia (`inteligencia/reportes/`, `inteligencia/shared/`, `inteligencia/alertas/`, `inteligencia/benchmarking/`). La ruta base del endpoint pasó de `/reportes/*` a `/inteligencia/*`. Ninguna decisión de la sección 1 cambió — es un ajuste de nombres y ubicación de archivos, ya reflejado en el resto de este documento.

---

## 1. Decisiones aprobadas

### 1.1 Roles

Acceso exclusivo a `ADMINISTRADOR` y `GERENCIA`. La información de rentabilidad se considera estratégica y sensible — el resto de los roles (`OPERACIONES`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`) queda sin acceso en esta primera versión.

### 1.2 Exportaciones

**No incluidas en 7.3.1.** Quedan explícitamente diferidas a un sub-bloque posterior, **7.3.1.b**, a abrir una vez validada en uso real la definición financiera de este sub-bloque (margen operativo / resultado económico, `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md`, Parte 8). No se abre 7.3.1.b ahora — queda solo nombrado para que no se pierda como pendiente.

### 1.3 Arquitectura

Módulo nuevo `backend/src/inteligencia/` (con subcarpetas `reportes/`, `shared/`, `alertas/`, `benchmarking/`, ver sección 5). **Toda la lógica de cálculo vive en el backend, dentro de este módulo** — el frontend consume y presenta los resultados ya calculados, nunca deriva ni recalcula un margen, un total ni un porcentaje por su cuenta. Este principio gobierna la sección 5 (archivos previstos) y el criterio de aceptación (sección 7).

---

## 2. Alcance final cerrado

**Incluye:**
- Cálculo oficial del margen operativo por Viaje, y su agregación en resultado económico por Cliente, por Transportista y total, sobre un período seleccionado (`desde`/`hasta`).
- Un endpoint (`GET /inteligencia/rentabilidad`), restringido a `ADMINISTRADOR`/`GERENCIA`.
- Una pantalla que consume ese endpoint y presenta los resultados, con filtros de fecha/cliente/transportista.
- Detalle de viajes completos (con ambos lados materializados) y de viajes incompletos (mostrados aparte, sin afectar los totales).

**No incluye (fuera de alcance de 7.3.1, no de todo Bloque 7.3):**
- Exportación a Excel/PDF → diferido a 7.3.1.b (sección 1.2).
- Por cereal o por ruta — el sub-bloque se llama, explícitamente, "por viaje, cliente y transportista".
- Series temporales, comparación entre períodos, tendencias → 7.3.5 (`BLOQUE7.3_ALCANCE.md`, Frontera 1).
- Alertas y umbrales → 7.3.3.
- Rentabilidad financiera y rentabilidad comercial (`BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md`, Parte 8).
- Cualquier cambio al modelo de datos existente — no se requiere ninguna migración (sección 4).

---

## 3. Resolución de las tres preguntas de negocio de la Auditoría (Parte 7)

### 3.1 ¿Los "descuentos" no clasificados como adelanto reducen el margen de SDC?

**Hallazgo:** revisé todo el backend buscando otros puntos de creación de `LiquidacionMovimiento` y no existe ninguno fuera de `liquidaciones.controller.ts:641`, dentro del `for (const a of anticipos)` de `create()` — **cada `LiquidacionMovimiento` nace, sin excepción, de un `AnticipoGasto` ya entregado** (`anticipoGastoId: a.id`, línea 646). La distinción "adelanto"/"descuento" de `esAdelanto()` (`liquidaciones.controller.ts:32-35`) no separa dos orígenes de dinero — separa el mismo origen en dos categorías de presentación según el nombre del `TipoGasto`.

Como ese monto ya fue pagado por SDC **antes** de la Liquidación, y `netoPagar` lo resta para no pagarlo dos veces, el total que SDC desembolsa por un Viaje (adelantado + neto) es siempre `totalViaje` — el mismo monto que ya integra el margen operativo. Adelantar parte del pago no cambia cuánto sale de SDC, solo cuándo.

**Decisión: neutros para el margen operativo.** `margen = FacturaViaje.importeViaje − LiquidacionViaje.totalViaje`, sin ajuste adicional por anticipos o descuentos.

### 3.2 ¿Cómo se trata un Viaje con un solo lado materializado?

**Decisión: excluir de totales y rankings, mostrar aparte cuántos y cuáles.** Reutiliza el patrón ya validado en `Conciliacion.tsx` (viajes pendientes mostrados aparte, no mezclados con el número principal) y el principio 8 de `BLOQUE7.2.d` (la abstracción nunca es irreversible).

### 3.3 ¿El margen restaría algún otro costo no modelado a nivel de Viaje?

Con el hallazgo de 3.1, no existe hoy ningún costo modelado a nivel de Viaje además de la comisión ya reflejada en `LiquidacionViaje.totalViaje`. **Decisión: `margen operativo = ingreso − costo` es la definición única y oficial de 7.3.1** — no incluye costos de estructura, administrativos ni financieros (eso es rentabilidad financiera, fuera de alcance).

---

## 4. Definición técnica exacta

Para un Viaje dentro del período `[desde, hasta]` (filtrado por `Viaje.fecha`):

```
ingreso = FacturaViaje.importeViaje de la Factura VIGENTE del viaje
          (factura.estado !== "ANULADO"), si existe alguna; si no, ingreso = null

costo   = LiquidacionViaje.totalViaje de la Liquidación VIGENTE del viaje
          (liquidacion.estado !== "ANULADA"), si existe alguna; si no, costo = null

margenOperativo = ingreso − costo,  solo si ingreso ≠ null Y costo ≠ null
margenPct       = margenOperativo / ingreso × 100
```

Si falta `ingreso` o `costo`, el Viaje va a la lista de **incompletos** (sección 3.2), no a los totales.

**Filtro de vigencia (obligatorio, ver Parte 3 de la Auditoría):** nunca tomar "la primera" fila de `facturasViaje`/`liquidacionesViaje` — filtrar siempre por el estado del documento padre. Si hubiera, de forma excepcional, más de una fila vigente para el mismo Viaje (no debería ocurrir: crear una Factura/Liquidación exige que el Viaje esté en `PENDIENTE_DE_FACTURAR`/`PENDIENTE` — `facturas.controller.ts:276-277`, `liquidaciones.controller.ts:559-560`), tomar la más reciente y no fallar silenciosamente.

**Agregación por Cliente/Transportista/Total:** suma de `ingreso`, suma de `costo`, `margen = Σingreso − Σcosto`; `margenPct` agregado = `margen total / ingreso total`, **nunca** promedio de los `margenPct` individuales.

**Arquitectura de cálculo — on-the-fly, sin migración:** consulta agregada en el momento del pedido, sin tabla materializada ni caché. Es una foto de un período (`BLOQUE7.3_ALCANCE.md`, Frontera 1), no algo de alta frecuencia — los índices ya existentes (`Viaje.fecha`, `clienteId`, `transportistaId`, `schema.prisma:240-243`) cubren los filtros principales. Alternativas de tabla materializada o vista SQL fueron evaluadas y descartadas por introducir una segunda fuente de verdad a sincronizar (mismo riesgo ya señalado en `BLOQUE4.2_DISENO_FACTURAVIAJE.md`) o SQL manual, sin evidencia de que hoy hagan falta.

---

## 5. Archivos previstos

**Backend — módulo `inteligencia/` nuevo, toda la lógica de cálculo vive acá. Estructura preparada desde 7.3.1 para el crecimiento del Centro de Inteligencia (`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`), con subcarpetas por categoría de consumo (`BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`, sección 5) — `alertas/` y `benchmarking/` quedan creadas y vacías, a llenar cuando se diseñen 7.3.3 y 7.3.5, no antes:**

| Archivo | Contenido |
|---|---|
| `backend/src/inteligencia/inteligencia.module.ts` | Declaración del módulo Nest, análogo a `dashboard.module.ts` |
| `backend/src/inteligencia/inteligencia.controller.ts` | `GET /inteligencia/rentabilidad` — orquesta la consulta a Prisma y arma la respuesta (sección 6) |
| `backend/src/inteligencia/reportes/rentabilidad.calc.ts` | Funciones puras de cálculo (margen por viaje, agregación por dimensión, separación de incompletos) — separadas del controller para que la definición técnica de la sección 4 sea testeable de forma aislada, mismo patrón que `construirPlanilla()` en `liquidaciones.controller.ts:61-147` pero en archivo propio dado que acá es el núcleo del sub-bloque, no un agregado secundario |
| `backend/src/inteligencia/shared/` | Vacía por ahora — futura semántica compartida (vigencia, período), a extraer cuando un segundo cálculo la necesite (`BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`, regla 8), no antes |
| `backend/src/inteligencia/alertas/`, `backend/src/inteligencia/benchmarking/` | Vacías — reservadas para 7.3.3 y 7.3.5 respectivamente, sin contenido en este sub-bloque |
| `backend/src/app.module.ts` | Modificado — registrar `InteligenciaModule` (mismo patrón que el resto de los módulos) |

**Frontend — solo consumo y presentación, cero cálculo:**

| Archivo | Contenido |
|---|---|
| `frontend/src/pages/Rentabilidad.tsx` | Página nueva, calcada del patrón de `Conciliacion.tsx`: filtros, tabla de totales, tabla por Cliente, tabla por Transportista, detalle expandible, sección de incompletos — todos los valores numéricos vienen tal cual del backend, ningún `+`/`−`/`×`/`÷` sobre importes en este archivo (criterio de aceptación, sección 7) |
| `frontend/src/App.tsx` | Modificado — nueva ruta `/inteligencia/rentabilidad`, alineada con la ruta base del endpoint (sección 6) |
| `frontend/src/components/Layout.tsx` | Modificado — nueva entrada de menú, visible solo si el usuario tiene rol `ADMINISTRADOR`/`GERENCIA` |

No se modifica `schema.prisma`, no hay migraciones, no se toca ningún controller existente (Facturas, Liquidaciones, Viajes, Dashboard) — el sub-bloque es aditivo puro.

---

## 6. Contrato conceptual del endpoint

`GET /inteligencia/rentabilidad`

**Autorización:** `JwtAuthGuard` + `RolesGuard`, `@Roles("ADMINISTRADOR", "GERENCIA")`.

**Query params:** `desde` (fecha, obligatorio), `hasta` (fecha, obligatorio), `clienteId` (opcional), `transportistaId` (opcional) — mismo patrón que `conciliacion()` (`facturas.controller.ts:186-190`) y el resto de los listados existentes.

**Respuesta:**
```
{
  periodo: { desde, hasta },
  totales: {
    ingreso, costo, margen, margenPct,
    viajesCompletos, viajesIncompletos
  },
  porCliente: [
    { clienteId, cliente, ingreso, costo, margen, margenPct, viajes }
  ],                                    // orden descendente por margen
  porTransportista: [
    { transportistaId, transportista, ingreso, costo, margen, margenPct, viajes }
  ],                                    // orden descendente por margen
  detalleViajes: [
    { viajeId, numeroViaje, fecha, cliente, transportista, ingreso, costo, margen, margenPct }
  ],
  viajesIncompletos: [
    { viajeId, numeroViaje, fecha, motivo: "sin facturar" | "sin liquidar" }
  ]
}
```

**Contrato de responsabilidad (decisión de arquitectura, sección 1.3):** todo campo numérico en esta respuesta llega ya calculado y final. El frontend no tiene autorización de diseño para derivar un solo número adicional a partir de estos campos más allá de formato de presentación (moneda, redondeo visual) — cualquier cálculo nuevo que un consumidor futuro necesite (7.3.4, 7.3.5) se agrega en `rentabilidad.calc.ts` o en un módulo hermano, nunca en una pantalla.

---

## 7. Criterio de aceptación

7.3.1 se considera terminado cuando, todo a la vez:

1. El endpoint devuelve `totales`, `porCliente`, `porTransportista`, `detalleViajes` y `viajesIncompletos` correctos para un período con datos reales de prueba, verificados a mano contra al menos un caso conocido.
2. Un usuario con rol distinto de `ADMINISTRADOR`/`GERENCIA` recibe `403` al intentar acceder al endpoint o ver la entrada de menú.
3. Un Viaje con Factura y/o Liquidación anulada (y no vuelta a emitir) no aparece en `detalleViajes` con datos, ni distorsiona ningún total — reproduce el escenario de la Parte 3 de la Auditoría.
4. Un Viaje con un solo lado materializado aparece únicamente en `viajesIncompletos`, con el `motivo` correcto, y no participa de `totales` ni de los rankings.
5. `margenPct` agregado (`porCliente`, `porTransportista`, `totales`) es siempre `margen total / ingreso total`, nunca un promedio de porcentajes individuales — verificado con un caso donde ambos cálculos darían resultados distintos.
6. Inspección de `Rentabilidad.tsx`: ningún operador aritmético sobre campos monetarios fuera de formato de presentación — todo número que se muestra viene literal de la respuesta del endpoint.
7. No hay ningún botón ni ruta de exportación Excel/PDF en la pantalla — confirma que 1.2 quedó fuera, no que se olvidó.
8. Ningún endpoint, pantalla ni comportamiento existente (Facturas, Liquidaciones, Viajes, Dashboard, Conciliación) cambia — regresión limpia.

---

## 8. Plan de pruebas

1. Viaje con Factura y Liquidación vigentes → aparece en detalle y en ambos rankings; margen = ingreso − costo, coincide con `comisionMonto` (Auditoría, Parte 2).
2. Viaje con Factura anulada sin re-facturar → sin ingreso, va a "incompletos", no se cuenta en el total.
3. Viaje con Factura anulada y re-facturada (dos `FacturaViaje` históricos) → usa solo la vigente.
4. Mismo caso del lado de Liquidación (anulada y re-liquidada).
5. Viaje facturado pero no liquidado (o viceversa) → aparece en "incompletos", no en rankings ni en el total.
6. Totales por Cliente/Transportista: suma exacta de los viajes completos; `margenPct` = margen total / ingreso total, no promedio de porcentajes.
7. Filtro por `clienteId`/`transportistaId` reduce correctamente el conjunto.
8. Período sin viajes → respuesta con totales en cero, listas vacías, sin error.
9. Un usuario sin rol autorizado recibe 403, tanto en el endpoint como en la visibilidad del menú.
10. Regresión: ningún endpoint ni pantalla existente cambia de comportamiento.
11. Revisión de código (no automatizable): `Rentabilidad.tsx` no contiene ninguna operación aritmética sobre importes — solo formateo.

---

## 9. Riesgos y mitigación

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Tomar filas de Factura/Liquidación anuladas y mostrar un margen incorrecto de forma silenciosa | Filtro explícito de vigencia (sección 4); prueba dedicada (Parte 3 de la auditoría) |
| 2 | Sobreestimar el margen si en el futuro un `TipoGasto` representa un costo real de SDC y no un anticipo | Hoy no ocurre (confirmado por grep, sección 3.1); documentado como supuesto a revalidar si cambia el modelo de `TipoGasto` |
| 3 | Exponer el margen de SDC a roles que no deberían verlo | Restricción de roles ya decidida (sección 1.1), en backend y en visibilidad de menú |
| 4 | El frontend termina recalculando algo "por comodidad" y diverge silenciosamente del backend | Contrato de responsabilidad explícito (sección 6) + criterio de aceptación punto 6, verificable por inspección de código |
| 5 | Performance degradada con volumen alto de viajes en el período | Cálculo on-the-fly elegido deliberadamente simple; índices ya existentes cubren los filtros principales; se revisa solo si hay evidencia real de degradación |
| 6 | Doble conteo de un Viaje en más de un Cliente/Transportista | No puede ocurrir — `clienteId` y `transportistaId` son campos únicos, no arrays, en `Viaje` (`schema.prisma:204,206`) |

---

## 10. Plan de rollback

Trivial: el diseño es 100% aditivo (módulo backend nuevo, página frontend nueva, sin migración, sin modificar ningún controller ni pantalla existente salvo el registro de rutas/menú). Revertir es eliminar el commit — no hay datos ni estado que reconciliar.

---

## 11. Pendiente registrado, no abierto: 7.3.1.b

Exportación a Excel/PDF del reporte de rentabilidad, con el mismo patrón ya usado en Facturas/Liquidaciones/Anticipos. Se abre como su propio sub-bloque una vez que 7.3.1 esté validado en uso real — no antes, y no como parte de este diseño.

---

## Cierre

Diseño aprobado con las tres decisiones de la sección 1. No se implementó nada todavía — no se escribió código, no se generaron migraciones, no se hizo commit ni push. Queda a la espera de la instrucción explícita para iniciar la Etapa 4 (Implementación).

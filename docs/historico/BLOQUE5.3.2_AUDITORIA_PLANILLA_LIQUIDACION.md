# Bloque 5.3.2 — Auditoría Funcional: Planilla Profesional de Liquidación

Fecha: 2026-07-08. Auditoría pura — no se modificó código, no se hizo commit, no se tocó `schema.prisma`. Cubre `frontend/src/pages/Liquidaciones.tsx`, `backend/src/liquidaciones/liquidaciones.controller.ts` (export Excel/PDF) y `backend/prisma/schema.prisma`. Contexto: `971f09c` (Bloque 5.3.1) ya está pusheado a `main`; este bloque es independiente y no lo toca.

---

## 0. Método

Se comparó, campo por campo, lo que muestran hoy las 3 salidas (pantalla, PDF, Excel) contra lo que efectivamente devuelve el backend (vía el `include` de Prisma) y contra el checklist de 17 campos pedido, más el mockup de planilla real pegado en la consigna. Todas las citas de línea son del estado actual del repo (sin cambios de este bloque).

---

## 1. Qué muestra hoy la pantalla (`Liquidaciones.tsx`)

Detalle de una liquidación ya creada (líneas 309-357 aprox.):

- Encabezado: `Liquidación N° {numero}` + badge de estado (`estado`).
- Resumen a nivel liquidación: Total bruto, Anticipos, Descuentos, Neto a pagar (línea ~316).
- Tabla de viajes (línea 320): columnas **Viaje** (renderiza `N° {numeroViaje} ({cereal.nombre})` en una sola celda, línea 324), **Subtotal**, **Comisión** (monto + %), **Total**.
- Tabla "Anticipos / gastos descontados" (solo si `movimientos.length > 0`): **Fecha, Tipo, Importe** — sin columna que indique a qué viaje corresponde.

Aparte, la sección "Nueva liquidación" (antes de crear) muestra una tabla de **candidatos** con N°, Fecha, CTG, Cereal, Tn, Importe — pero es una vista previa de selección, no la liquidación ya persistida, y esas columnas desaparecen una vez creada.

**No se muestra en pantalla:** fecha del viaje, carta de porte, CTG, origen, destino, cliente, productor, toneladas, tarifa/tn — de los 17 campos del checklist, la pantalla hoy expone efectivamente 5 (N° viaje, cereal, subtotal, comisión, total).

---

## 2. Qué muestra hoy el PDF (`exportarPdf`, líneas 240-310)

- Encabezado: N° de liquidación; si `tipo === "CHOFER"` → nombre del chofer, CUIL, chasis y acoplado (vía `datosChoferHeader`, línea 61); si no → tipo + razón social del transportista (`nombreContraparte`, línea 36). Período, estado.
- "Viajes incluidos": una línea de texto por viaje con **Fecha · CP (carta de porte) · CTG · Origen → Destino · Toneladas · Tarifa**, y debajo **Importe (subtotal) · Comisión $ (%) · Total** (líneas 274-284).
- "Anticipos / gastos descontados": agrupados por categoría vía `agruparAnticipos`/`categorizarAnticipo` (líneas 40-59) — Seguros, Transferencia Bancaria, Efectivo, Combustible, Otros — con fecha/tipo/importe por ítem y subtotal por categoría.
- Pie: Total bruto, Total anticipos, Total descuentos, Neto a pagar.

**No se muestra:** cereal, cliente, productor, N° de viaje interno (solo CP/CTG identifican el viaje).

---

## 3. Qué muestra hoy el Excel (`exportarExcel`, líneas 161-238)

Estructura idéntica al PDF, en filas de planilla: mismo encabezado según tipo, misma tabla de viajes con columnas **Fecha, CP, CTG, Origen, Destino, Toneladas, Tarifa, Importe, Comisión %, Comisión $, Total** (línea 190), mismo agrupado de anticipos por categoría, mismo pie de totales.

**No se muestra:** cereal, cliente, productor, N° de viaje interno — igual que el PDF (son, de hecho, la misma estructura de datos escrita en dos formatos distintos).

---

## 4. Qué información ya devuelve el backend

El detalle (`GET /liquidaciones/:id`) y ambos exports comparten el mismo `include` (`includeLiquidacion`, líneas 15-25):

```
viajes: { include: { viaje: { include: { cereal, cliente, origen, destino, camion, acoplado } } } }
movimientos: { include: { tipoGasto, viaje: { select: { id, numeroViaje } } } }
```

Esto significa que **ya viajan en la respuesta hoy, sin ningún cambio de backend**:
- Del viaje (siempre presentes como campos escalares del objeto): `fecha`, `cartaPorte`, `ctg`, `toneladas`, `tarifaTonelada`, `importeTotal`, `numeroViaje`.
- Relaciones ya incluidas: `cereal.nombre`, `cliente.razonSocial`, `origen.nombre`, `destino.nombre`, `camion.patente`, `acoplado.patente`.
- De `LiquidacionViaje`: `subtotal`, `comisionPct`, `comisionMonto`, `totalViaje`.
- De cada `movimiento`: `tipoGasto.nombre`, `importe`, `fecha`, `observacion`, y **el viaje asociado con su `numeroViaje`** (`movimiento.viaje`, puede ser `null` si el gasto no está atado a un viaje puntual).
- De la liquidación: `totalBruto`, `totalAnticipos`, `totalDescuentos`, `netoPagar`, `comisionPct` (nivel liquidación), `periodoDesde/Hasta`, `estado`.

**Lo único que NO viene incluido:** `productor`. El include de la línea 21 es `{ cereal, cliente, origen, destino, camion, acoplado }` — no tiene `productor: true`. El modelo `Productor` existe en el schema (línea 114) y `Viaje.productorId`/`Viaje.productor` ya existen como relación opcional (línea 205/225) — no hace falta ninguna migración, solo agregar `productor: true` al include.

---

## 5. Qué información falta

Cruzando el checklist de 17 campos contra las 3 salidas + backend:

| Campo | Pantalla | PDF/Excel | Backend disponible |
|---|---|---|---|
| N° de viaje | Sí | **No** | Sí |
| Fecha | No | Sí | Sí |
| Carta de Porte | No | Sí | Sí |
| CTG | No | Sí | Sí |
| Cliente | No | No | Sí (falta renderizar) |
| Productor | No | No | **No** (falta `productor: true` en el include) |
| Cereal | Sí | No | Sí |
| Origen | No | Sí | Sí |
| Destino | No | Sí | Sí |
| Toneladas | No | Sí | Sí |
| Tarifa/tn | No | Sí | Sí |
| Importe bruto | Sí (Subtotal) | Sí (Importe) | Sí |
| Comisión % | Sí | Sí | Sí |
| Comisión $ | Sí | Sí | Sí |
| Total por viaje | Sí | Sí | Sí |
| Anticipos | Sí (agregado, sin vínculo a viaje) | Sí (agrupado por categoría) | Sí |
| Gastos | Mezclado con "Anticipos" | Mezclado con "Anticipos" | Sí, pero sin distinción explícita (ver §6) |
| Neto | Sí | Sí | Sí |

**Conclusión:** de los 17 campos, 16 ya están disponibles en el backend sin tocar nada; el único que falta pedir es **Productor**, y es un cambio de una línea sin migración.

---

## 6. Campos duplicados / esquemas de clasificación inconsistentes

1. **Dos clasificaciones distintas sobre el mismo `tipoGasto.nombre`, con resultados distintos para el mismo registro.** `esAdelanto()` (línea 27) decide Anticipo vs. Descuento (para `totalAnticipos`/`totalDescuentos`) buscando `"anticipo"`/`"adelanto"` en el nombre. `categorizarAnticipo()` (línea 40) decide la categoría de agrupación del PDF/Excel (Seguros/Transferencia/Efectivo/Combustible/Otros) buscando otras palabras clave. Son dos funciones independientes sobre el mismo campo de texto libre, y **no siempre coinciden**. Con los tipos de gasto reales que existen hoy en la base:

   | TipoGasto (nombre real en catálogo) | `esAdelanto` → | `categorizarAnticipo` → |
   |---|---|---|
   | Adelanto quincenal | **Anticipo** | **Otros** (no contiene "efectivo"/"combustible"/etc.) |
   | Anticipo en efectivo | Anticipo | Efectivo |
   | Combustible (YPF Ruta) | Descuento | Combustible |
   | Multa / descuento administrativo | Descuento | Otros |
   | Peaje | Descuento | Otros |

   "Adelanto quincenal" — el tipo de gasto más usado en la data de prueba — se cuenta como **Anticipo** en el total (`totalAnticipos`) pero cae en el balde **"Otros"** en la tabla agrupada del PDF/Excel. Es información inconsistente entre el pie (que dice "esto es un anticipo") y el cuerpo (que lo etiqueta como "otros gastos").

2. **N° de viaje vs. CTG/Carta de porte como identificador de fila.** La pantalla identifica cada fila por N° de viaje interno; el PDF/Excel identifican cada fila por CP+CTG. Son dos convenciones de identificación distintas para la misma fila, ninguna de las 3 salidas muestra ambas.

3. **La categorización de gasto no es un campo del modelo, es texto libre interpretado por palabras clave.** `TipoGasto` (schema línea 188) solo tiene `nombre` (String libre) y `afectaLiquidacion` (Boolean) — no existe un campo `categoria` estructurado. Tanto `esAdelanto` como `categorizarAnticipo` son heurísticas de `string.includes(...)` sobre `nombre`. Si mañana se crea un tipo de gasto en Catálogos con un nombre que no calce con ninguna palabra clave (p. ej. "Descarga en destino"), cae silenciosamente en "Otros" / "Descuento" sin que nadie lo decida explícitamente. Esto **no se resuelve en este bloque** (implicaría agregar un campo al modelo `TipoGasto`, y 5.3.2 tiene prohibido tocar `schema.prisma`) — se deja documentado como limitación aceptada, no como algo a corregir ahora.

---

## 7. Campos que sobran / mal ubicados

- La celda "Viaje" de la pantalla (`N° {numeroViaje} ({cereal.nombre})`, línea 324) combina dos datos distintos en un solo texto sin columnas propias — dificulta ordenar/leer la tabla como planilla. No es que el dato "sobre", es que está empaquetado de forma que no se puede tratar como columna.
- No se detectaron campos que se muestren y no aporten ningún valor (no hay "ruido" evidente) — el problema de este módulo es de **omisión**, no de exceso.

---

## 8. Campos importantes que faltan

1. **Productor** — no viene del backend (ver §4/§5), es el único campo del checklist que requiere tocar backend.
2. **Cliente** — viene del backend pero no se renderiza en ninguna de las 3 salidas. Relevante sobre todo en liquidaciones tipo TRANSPORTISTA, que pueden agrupar viajes de clientes distintos dentro del mismo período.
3. **Vínculo explícito viaje ↔ gasto.** `movimiento.viaje.numeroViaje` ya viene en la respuesta (línea 24) pero ninguna de las 3 salidas lo usa — los anticipos/gastos se muestran como una lista o un agrupado por categoría, nunca "dentro de la fila del viaje que los originó". Es el hallazgo más importante de esta auditoría (ver §14).
4. **N° de viaje en PDF/Excel** — hoy solo la pantalla lo muestra; el documento que se le entrega al chofer (PDF) no tiene ningún identificador interno de la app, solo CP/CTG.

---

## 9. Qué datos deberían reorganizarse

- Separar la celda combinada "N° viaje + cereal" en columnas independientes (N° viaje, Cereal) para que la tabla se pueda leer/ordenar como planilla real.
- Unificar el conjunto de columnas por viaje entre pantalla, PDF y Excel — hoy son 3 subconjuntos distintos del mismo dato (ver tabla de §5), lo que obliga a mirar el PDF para ver origen/destino/fecha y la pantalla para ver el cereal, sin que ninguna vista sea "la completa".
- Mover el vínculo `movimiento → viaje` desde un dato invisible a una columna/agrupación visible (ver §10).

---

## 10. Qué información debería agruparse por viaje

Toda la fila de detalle de un viaje debería traer junta: N° de viaje, fecha, carta de porte, CTG, cereal, cliente, productor, origen→destino, toneladas, tarifa/tn, importe bruto, comisión % y $, total — y, si existen, los anticipos/gastos que se descontaron **de ese viaje puntual** (cuando `movimiento.viajeId` no es null). Hoy esta agrupación ya es posible con los datos existentes (salvo productor), pero no se hace en ninguna de las 3 salidas: los movimientos se presentan sueltos (pantalla) o agrupados por categoría de gasto sin importar el viaje (PDF/Excel).

**Caso sin resolver:** un `AnticipoGasto`/`LiquidacionMovimiento` puede no tener `viajeId` (es nullable, línea 262/336 del schema) — es un anticipo "general" al chofer/transportista, no atado a un viaje puntual. Estos no tienen dónde agruparse por viaje. Necesitan una fila o sección aparte ("Adelantos generales del período", fuera de la tabla de viajes).

---

## 11. Qué información debería quedar en el encabezado

Ya está resuelto y funciona (`datosChoferHeader`/`nombreContraparte`), coincide con el mockup pegado: para tipo CHOFER → nombre, CUIL, chasis, acoplado; para tipo TRANSPORTISTA → razón social. Se agregan, según el mockup: N° de liquidación, período, estado (ya existen). **Limitación existente a confirmar, no a corregir en este bloque:** el chasis/acoplado del encabezado se toma únicamente del **primer viaje** de la liquidación (línea 63-69) — si dentro del mismo período el chofer usó más de un camión, el encabezado muestra solo uno. El mockup pegado también asume un único camión por liquidación (una sola fila CHASIS/ACOPLADO), así que esto es coherente con el formato real, no es un bug — se deja como asunción de negocio confirmada por el propio mockup, no como hallazgo a resolver.

---

## 12. Qué información debería quedar en el pie

Ya existe y es correcta: Total bruto, Total anticipos, Total descuentos, Neto a pagar. El mockup pegado pide además los **subtotales por columna** (suma de Subtotal, suma de Comisión, suma de Total, y suma de cada categoría de adelanto, más el Saldo final) — hoy el pie solo tiene los 4 totales agregados de la liquidación, no una fila de sumatoria por columna de la tabla. Es una extensión natural una vez que la tabla tenga las columnas correctas.

---

## 13. Cómo debería verse una liquidación profesional (mockup pegado)

El mockup entregado en la consigna es el formato real que se le entrega a un chofer/transportista:

```
CHOFER / CUIL / CHASIS / ACOPLADO   (encabezado)

Viajes                                                          | Adelantos                                      | 
Fecha | Carta de Porte | CTG | Origen | Destino | Tn/Kg | Tarifa | Subtotal | % | Comisión | Total | Seguros | Transf. Bcria | Efectivo | Combustible | Saldo
...una fila por viaje...
                                    | Subtotal | Comisión | Total | ΣSeguros | ΣTransf | ΣEfectivo | ΣCombustible | Saldo final
```

**Reconciliación contra lo pedido y lo que ya existe, con discrepancias explícitas (no resueltas acá, quedan para el diseño):**

1. El mockup **no tiene columna de N° de viaje** — identifica cada fila solo por Fecha + Carta de Porte + CTG. Contradice el uso actual en pantalla (que identifica por N° de viaje). Decisión pendiente: ¿se agrega N° de viaje igual (útil para trazabilidad interna) o se respeta el mockup tal cual?
2. El mockup **no tiene columnas de Cliente, Productor ni Cereal** — pese a que el checklist de la consigna pide auditar específicamente esos 3 campos. Decisión pendiente: ¿van igual (aportan contexto que el chofer probablemente no necesita, pero el operador interno sí) o se dejan fuera de la planilla "para entregar" y solo aparecen en una vista interna?
3. El mockup organiza los adelantos como **columnas por categoría dentro de la misma fila del viaje** (Seguros / Transf. Bcria / Efectivo / Combustible), no como una tabla aparte agrupada — esto es estructuralmente distinto de cómo lo arma hoy el backend (`agruparAnticipos`, filas separadas por categoría, sin relación con la fila del viaje). Es el cambio de mayor esfuerzo de los 4.
4. El mockup usa **4 categorías fijas** (Seguros, Transferencia Bancaria, Efectivo, Combustible) sin "Otros" — pero 2 de los 5 tipos de gasto reales de la base (Peaje, Multa/descuento administrativo) no calzan en ninguna de esas 4 (ver tabla de §6). Decisión pendiente: ¿se agrega una 5ta columna "Otros" (rompe el mockup exacto pero cubre los datos reales) o se fuerza Peaje/Multas dentro de una de las 4 columnas existentes?
5. La columna **"Saldo"** del mockup aparece tanto por fila como en el total — hoy el sistema no calcula un saldo por fila (solo `totalViaje` a nivel viaje y `netoPagar` a nivel liquidación completa). Un "Saldo" por fila implicaría restarle a cada `totalViaje` los adelantos que le correspondan a **ese viaje puntual** — lo cual vuelve a chocar con el caso de adelantos sin `viajeId` (§10): esos no tienen fila propia para descontarse.

---

## 14. Auditoría específica de la sección de anticipos

Preguntas de la consigna, respondidas contra el comportamiento actual:

- **¿Se entiende de qué viaje salió cada gasto?** No. Ni en pantalla ni en PDF/Excel se muestra el viaje asociado a un movimiento, pese a que el dato (`movimiento.viaje.numeroViaje`) ya viene en la respuesta del backend (línea 24). Los movimientos "sin viaje" (generales) tampoco se distinguen de los que sí tienen viaje — se ven todos igual.
- **¿Se entiende por qué se descontó?** Parcialmente. Se muestra `tipoGasto.nombre` (p. ej. "Peaje", "Combustible (YPF Ruta)") y, en PDF/Excel, la categoría agrupadora — pero como se documentó en §6, esa categoría puede no coincidir con si el sistema lo está tratando como "anticipo" o "descuento" en los totales, así que el "por qué" que se ve no siempre explica el efecto real sobre el neto.
- **¿Se entiende cómo impacta en el neto?** Solo de forma agregada: el pie muestra Total anticipos y Total descuentos como dos números globales, pero no hay ninguna fila que diga "este gasto de $X restó $X al total de este viaje/liquidación" de forma directa — hay que hacer la cuenta mentalmente contra el gran total.

**Conclusión de este punto:** es el área con la brecha más grande entre lo que existe y lo que se necesita para que la planilla "se lea" como una liquidación real — no por falta de datos (el dato del vínculo viaje-gasto ya existe), sino por falta de presentación.

---

## 15. Resumen ejecutivo

- De 17 campos pedidos, **16 ya están disponibles en el backend sin ningún cambio**; falta agregar `productor: true` al include (1 línea, sin migración) para el único que falta.
- El problema no es de datos faltantes en el backend — es de **presentación fragmentada**: 3 salidas con 3 subconjuntos de columnas distintos, ninguna completa.
- Se encontró una inconsistencia real y verificable con datos actuales de la base: el tipo de gasto "Adelanto quincenal" se clasifica como Anticipo en los totales pero como "Otros" en la tabla agrupada del PDF/Excel (§6).
- El vínculo movimiento↔viaje ya existe en los datos y no se usa en ninguna salida — es el cambio de mayor impacto para que la planilla se lea como una liquidación real (§14).
- El mockup pegado por el usuario tiene 4 discrepancias concretas contra el checklist pedido (N° de viaje, Cliente/Productor/Cereal, adelantos por categoría en columnas, ausencia de columna "Otros") que quedan como puntos de decisión explícitos antes de diseñar — ver `BLOQUE5.3.2_DISENO_PLANILLA_LIQUIDACION.md` §Puntos de decisión.
- Ningún hallazgo de esta auditoría requiere tocar `schema.prisma` ni generar una migración, salvo la limitación aceptada de §6 (categorización por texto libre), que queda explícitamente fuera de alcance de 5.3.2.

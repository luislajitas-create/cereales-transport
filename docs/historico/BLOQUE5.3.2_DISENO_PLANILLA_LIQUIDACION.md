# Bloque 5.3.2 — Diseño Técnico: Planilla Profesional de Liquidación

Fecha: 2026-07-08. Documento de diseño puro — no se implementó nada, no se escribió código, no se generaron migraciones, no se hizo commit. Responde a `BLOQUE5.3.2_AUDITORIA_PLANILLA_LIQUIDACION.md`. Sub-bloque independiente de 5.3.1 (`971f09c`, ya pusheado) — no lo modifica ni depende de él más allá de compartir el mismo módulo de pantalla.

---

## 0. Puntos de decisión previos a estimar (no técnicos)

La auditoría (§13) encontró 4 discrepancias concretas entre el mockup real pegado por el usuario y el checklist de 17 campos pedido. Son decisiones de negocio, no de arquitectura — se señalan acá primero porque cambian el diseño de la tabla según la respuesta:

1. **¿La columna identificadora de fila es N° de viaje interno, o solo Fecha+CP+CTG como en el mockup?** El mockup no tiene N° de viaje. Recomendación: agregarlo igual como primera columna — es información ya disponible, de costo cero, y útil para que el operador ubique el viaje dentro de la app al revisar la liquidación antes de confirmarla/pagarla (el chofer que recibe el papel puede ignorar esa columna, no molesta).
2. **¿Cliente y Productor van en la planilla que se le entrega al chofer, o solo en una vista interna?** El mockup no los tiene. Argumento para incluirlos: si una liquidación TRANSPORTISTA agrupa viajes de distintos clientes, el operador necesita distinguirlos al revisar. Argumento para omitirlos en el PDF que recibe el chofer: no le aportan nada a quien cobra el flete. Recomendación: incluir ambos en pantalla (vista interna, de revisión) y dejarlos **opcionales** en PDF/Excel — pendiente de tu confirmación antes de diseñar el detalle de cada salida.
3. **¿Los adelantos van en columnas por categoría (como el mockup) o se mantiene el agrupado actual por categoría en filas separadas?** Es el cambio de mayor esfuerzo de los 4. Recomendación: adoptar el formato de columnas del mockup — es el que el usuario confirmó como "así se ve una liquidación profesional real"; el agrupado en filas actual no vino de ningún pedido explícito, es como se implementó originalmente.
4. **¿Se agrega una 5ta columna "Otros" para Peaje/Multas, o se fuerzan dentro de las 4 categorías del mockup?** Recomendación: agregar "Otros" — 2 de los 5 tipos de gasto reales de la base no calzan en las 4 columnas del mockup (auditoría §6/§13); forzarlos falsearía el dato.

El resto del documento diseña asumiendo las 4 recomendaciones anteriores, dejándolas explícitamente marcadas como **pendientes de tu aprobación**, no como decisión ya tomada.

---

## 1. Principios de diseño

1. **Una sola estructura de datos, tres formas de renderizarla.** Hoy pantalla/PDF/Excel arman cada una su propio subconjunto de columnas a mano. Se diseña una única función/forma de "aplanar" una liquidación a filas de planilla (por viaje + adelantos por categoría + saldo), consumida igual por los 3 lugares. Ningún cálculo nuevo — es reordenar y completar columnas sobre los mismos números que ya produce `recomputeTotales`.
2. **No tocar `esAdelanto`/`categorizarAnticipo` como lógica de cálculo de totales.** El pie (Total bruto/Anticipos/Descuentos/Neto) sigue significando lo mismo que hoy. Lo que cambia es *cómo se presenta* el desglose de adelantos (columnas por categoría en vez de bloques agrupados), no *cuánto* se cobra o se descuenta.
3. **Backend: un solo cambio, sin migración.** Agregar `productor: true` al `include` de `viajes.viaje` en `includeLiquidacion` (`liquidaciones.controller.ts:21`). El modelo `Productor` y la relación `Viaje.productor` ya existen (schema líneas 114, 205, 225) — es exponer un dato que ya está en la base, no crear uno nuevo.
4. **El vínculo movimiento↔viaje pasa de invisible a estructural.** Es el hallazgo de mayor impacto de la auditoría (§14). El agrupado por viaje debe usar `movimiento.viajeId`/`movimiento.viaje.numeroViaje` (ya disponible) para decidir en qué fila cae cada adelanto; los que no tengan `viajeId` van a una sección aparte, no se inventan ni se ocultan.

---

## 2. Estructura de datos objetivo

Por cada viaje de la liquidación, una fila con:

`N° viaje · Fecha · Carta de porte · CTG · Cereal · Cliente · Productor · Origen → Destino · Toneladas · Tarifa/tn · Importe bruto (subtotal) · Comisión % · Comisión $ · Total viaje · [Seguros | Transf. Bancaria | Efectivo | Combustible | Otros — solo los adelantos de ESE viaje] · Saldo (Total viaje − adelantos de esa fila)`

Todos estos campos ya existen hoy en la respuesta de `GET /liquidaciones/:id` salvo Productor (§0/§3). Ningún campo nuevo de cálculo: `Total viaje` = `LiquidacionViaje.totalViaje` (ya existe), `Saldo` de fila = dato derivado en el momento de renderizar (resta simple sobre datos ya presentes), no se persiste ni se guarda en base.

**Sección aparte, fuera de la tabla de viajes:** "Adelantos generales del período" — los `movimiento` con `viajeId = null`, con las mismas columnas de categoría, sin fila de viaje asociada (ver auditoría §10, caso sin resolver).

**Pie de tabla:** una fila de sumatorias por columna (Σ Subtotal, Σ Comisión, Σ Total, Σ por cada categoría de adelanto, Saldo final) — hoy el pie solo tiene los 4 totales agregados de la liquidación (Total bruto/Anticipos/Descuentos/Neto); se agrega la fila de sumatorias de columnas como complemento, sin reemplazar los 4 totales existentes (que siguen siendo la fuente de verdad legal/contable de cuánto se paga).

---

## 3. Cambio de backend necesario

Único cambio: en `liquidaciones.controller.ts:21`, agregar `productor: true` al include de `viaje` dentro de `includeLiquidacion`. Afecta a los 3 consumidores que comparten ese include (`findOne`, `exportarExcel`, `exportarPdf`) por igual, sin tocar ninguna otra función. Sin migración (la relación ya existe en el schema). Sin cambio de contrato de API (se agrega un campo al objeto ya devuelto, no se quita ni renombra nada — no rompe a ningún consumidor existente del endpoint).

---

## 4. Diseño del encabezado (pantalla + PDF + Excel)

Sin cambios respecto a hoy — ya cumple con el mockup: para CHOFER, nombre/CUIL/chasis/acoplado (del primer viaje, limitación ya documentada y aceptada, auditoría §11); para TRANSPORTISTA, razón social. Se mantiene N° de liquidación, período, estado. No hay trabajo de diseño pendiente acá, ya está resuelto por el código actual.

---

## 5. Diseño de la tabla de viajes (unificada)

Reemplaza, en pantalla, la tabla actual de 4 columnas (`Liquidaciones.tsx:320`, Viaje/Subtotal/Comisión/Total) por la estructura de §2. En PDF/Excel, se **agregan** columnas a la tabla ya existente (Cereal, Cliente, Productor si se confirma el punto 2 de §0, N° de viaje si se confirma el punto 1) en vez de rediseñarla desde cero — ya tienen Fecha/CP/CTG/Origen/Destino/Toneladas/Tarifa/Importe/Comisión/Total, que es la base correcta.

**Pantalla vs. PDF/Excel — mismo contenido, distinta densidad:** en pantalla, con `<table>` HTML y scroll horizontal ya soportado por el layout (`main-content { overflow-x: auto }`, `styles.css:48`), cabe la tabla completa sin recortar columnas. Se mantiene la misma información en las 3 salidas — no se ocultan columnas en pantalla que sí estén en el PDF, ni viceversa (cierra la inconsistencia de la auditoría §5/§6).

---

## 6. Diseño de la sección de adelantos (pivote a columnas por categoría)

**Alternativas evaluadas:**

- **A — Mantener el agrupado actual (filas separadas por categoría), solo agregar el vínculo a viaje como una columna más de esa tabla.** Más simple de implementar (no hay que pivotar), pero no cumple con el mockup real que el usuario definió como objetivo (columnas de adelanto integradas a la fila del viaje).
- **B — Pivotar a columnas por categoría dentro de la fila del viaje, como el mockup (recomendada, pendiente de aprobación por §0.3).** Por cada `LiquidacionViaje`, calcular en el momento de renderizar (no persistido) la suma de `movimiento.importe` cuyo `viajeId` coincide, separada por las 5 categorías de `categorizarAnticipo` (Seguros/Transferencia Bancaria/Efectivo/Combustible/Otros — la 5ta pendiente de §0.4). Es un `reduce` sobre datos ya disponibles en la respuesta actual, no requiere nuevos campos ni cambios de cálculo — el total de la fila (`Saldo`) es una resta simple.

**Recomendación: alternativa B.** Es la que responde literalmente al pedido ("quiero que la liquidación tenga esos datos", con el mockup como referencia exacta).

**Adelantos sin viaje asociado** (`movimiento.viajeId === null`): no entran en ninguna fila de la tabla de viajes. Van en la sección aparte "Adelantos generales del período" (§2), con las mismas 5 columnas de categoría, sin columna de viaje. Se restan igual del `netoPagar` general (ya lo hacen hoy, sin cambios de cálculo) pero no aparecen en el "Saldo" de ninguna fila puntual.

---

## 7. Diseño del pie

Se agrega una fila de sumatorias por columna al final de la tabla de viajes (Σ Subtotal, Σ Comisión $, Σ Total, Σ por categoría de adelanto — de las filas de viaje **y** de la sección de adelantos generales combinadas —, Saldo final). Los 4 totales actuales (Total bruto/Anticipos/Descuentos/Neto a pagar) se mantienen intactos como el resumen "oficial" de la liquidación — la fila de sumatorias de columnas es un complemento visual de la tabla, no un cálculo nuevo ni una fuente de verdad distinta. El "Saldo final" de la fila de sumatorias debe coincidir matemáticamente con `netoPagar` — si no coincide (por ejemplo, por un movimiento sin `viajeId` mal categorizado), es una señal de bug a nivel de test, no algo que el usuario deba reconciliar a mano.

---

## 8. Aplicación a pantalla / PDF / Excel

Las 3 salidas consumen la misma estructura aplanada de §2 (viajes + adelantos por categoría + saldo + sumatorias). La diferencia entre salidas es solo de formato de renderizado (tabla HTML vs. texto PDF vs. filas de Excel), no de contenido — cierra exactamente el pedido de "no quiero tres versiones distintas de la misma información".

---

## 9. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Los 4 puntos de decisión de §0 no están resueltos — implementar sin resolverlos obliga a adivinar o a rehacer trabajo | Alta | No implementar hasta tener respuesta explícita a los 4 puntos |
| 2 | La categorización por palabras clave (`categorizarAnticipo`) puede seguir clasificando mal tipos de gasto nuevos que no calcen con ningún patrón (auditoría §6, limitación aceptada, no se corrige en este bloque) | Media | Documentar la limitación en el propio código/UI (ej. un tipo de gasto sin categoría reconocida cae en "Otros" de forma visible, no silenciosa) |
| 3 | Ensanchar la tabla en pantalla (7-12 columnas más) puede requerir scroll horizontal marcado en pantallas chicas | Baja | Ya existe `overflow-x: auto` en `.main-content` (styles.css:48); validar visualmente en la implementación, no se prevé rediseño de layout |
| 4 | Agregar columnas al PDF (`pdfkit`, texto posicionado manualmente por coordenadas) es más laborioso que en Excel/HTML — riesgo de overflow de página con tantas columnas | Media | Evaluar en el diseño de implementación si el PDF necesita orientación horizontal (`landscape`) en vez de vertical, dado el ancho de columnas del mockup |

---

## 10. Plan de pruebas (a definir en detalle al implementar)

1. Backend: `GET /liquidaciones/:id` devuelve `viaje.productor.nombre` cuando el viaje tiene productor asignado, y `null`/ausente cuando no (viajes sin productor son válidos, campo opcional).
2. Pantalla: cada fila de viaje muestra las 14+ columnas de §2 con los valores correctos contra un caso de prueba conocido; los adelantos por categoría de una fila suman exactamente lo que aparece como "Saldo" de esa fila.
3. Adelantos sin `viajeId`: aparecen en la sección "Adelantos generales", no en ninguna fila de viaje, y sí impactan el `netoPagar` general.
4. PDF/Excel: mismas columnas y mismos valores que pantalla para la misma liquidación (paridad exacta entre las 3 salidas).
5. Regresión: liquidaciones ya existentes (creadas antes de este cambio) siguen mostrando `totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar` idénticos a los que tenían — el cambio es de presentación, no de cálculo.
6. Caso borde: tipo de gasto que no calza con ninguna palabra clave de `categorizarAnticipo` → cae en "Otros" de forma visible en la columna correspondiente, no desaparece.

---

## 11. Rollback

Frontend: build estático, revertir es redeploy del commit anterior (igual que 5.3.1). Backend: el único cambio (`productor: true` en un include) es trivial de revertir con un commit de reversión — no hay migración que deshacer, no hay dato persistido nuevo (el "Saldo" de fila y las sumatorias son calculados al vuelo, no se guardan).

---

## 12. Criterios de aceptación

1. Pantalla, PDF y Excel muestran exactamente las mismas columnas por viaje, sin subconjuntos distintos entre salidas.
2. Los 17 campos del checklist están presentes en las 3 salidas (sujeto a la resolución de los puntos de decisión §0.1/§0.2 sobre si N°-viaje/Cliente/Productor van en el PDF que recibe el chofer).
3. Cada adelanto/gasto con `viajeId` aparece en la fila de su viaje correspondiente, en la columna de su categoría.
4. Los adelantos sin `viajeId` aparecen en una sección separada, claramente distinguible de los de viaje.
5. El "Saldo" de cada fila y la sumatoria final son matemáticamente consistentes con `netoPagar` (mismo número, dos caminos de cálculo).
6. Ningún cambio de cálculo sobre `totalBruto`/`totalAnticipos`/`totalDescuentos`/`netoPagar`/`comisionMonto` respecto al comportamiento actual — el bloque es 100% de presentación salvo el include de `productor`.
7. Cero migraciones, cero cambios a `schema.prisma`.
8. Build y typecheck limpios; plan de pruebas de §10 pasa en el entorno local.

---

## 13. Ajuste de jerarquía visual de pantalla (iteración posterior a §0-12)

Los puntos de decisión de §0 quedaron aprobados y §1-12 se implementaron: backend con `construirPlanilla()` (fuente única de la estructura), pantalla/PDF/Excel mostrando las 21 columnas (§2) sin diferencias entre salidas. Al revisarlo, la pantalla terminó "pareciendo una tabla técnica" — este apartado documenta el ajuste acordado por chat antes de este documento (jerarquía primaria/secundaria) y el refinamiento pedido ahora (un solo toggle, no por fila), para que quede todo por escrito antes de seguir tocando código.

### 13.1 Jerarquía primaria/secundaria (ya acordada)

**Columnas primarias en pantalla** (siempre visibles, sin scroll horizontal, 10 columnas): Fecha, Carta de Porte, Cliente, Origen, Destino, Tn, Tarifa, Bruto, Descuentos, Neto.

**Regla de negocio de presentación** (no es un cálculo nuevo, es una suma de dos valores que `construirPlanilla()` ya produce por separado): `Descuentos` de fila = `comisionMonto + totalAdelantos` de esa fila; `Neto` de fila = `saldo` (que ya es `totalViaje - totalAdelantos` = `subtotal - comisionMonto - totalAdelantos`). Con esta agrupación, `Bruto - Descuentos = Neto` se verifica con los tres únicos números que el chofer ve en la fila, sin necesitar entender la separación comisión/adelantos — esa separación es justamente lo que pasa a ser "detalle técnico" (§13.2).

**Columnas secundarias** (fuera de la tabla principal): N° de viaje, CTG, Cereal, Productor, Comisión % y Comisión $ (por separado), y el desglose de adelantos por categoría (Seguros / Transferencia Bancaria / Efectivo / Combustible / Otros) de cada fila.

### 13.2 Corrección de este ajuste: un solo toggle, no por fila

La primera implementación (ya escrita en el working tree, sin commit) puso un botón "Ver detalle" **por fila**, con expansión individual. Se reemplaza por:

- **Un único botón, una sola vez, para toda la liquidación** — no hay botón en ninguna fila de la tabla principal.
- **La tabla principal (10 columnas) nunca cambia de forma** — ni gana una columna de acción, ni se intercalan filas de detalle entre las filas de viaje.
- Debajo de toda la tabla principal (después de su fila de Totales), un botón "Mostrar detalle técnico" / "Ocultar detalle técnico". Al activarlo, se despliega ahí mismo la tabla técnica completa: exactamente la tabla de 21 columnas ya diseñada en §2/§5 (N° viaje, CTG, Cereal, Productor, Comisión %, Comisión $, las 5 columnas de categoría de adelanto, Saldo) — una fila por viaje, igual que hoy la muestra el Excel. No es una tabla nueva a diseñar: es la misma estructura de §2 que ya está construida, ahora detrás de un solo toggle en vez de ser la vista por defecto.

**Dónde queda la sección "Adelantos / gastos generales del período (sin viaje asociado)":** se mantiene **siempre visible**, fuera del toggle — no es "detalle técnico" en el mismo sentido que N°/CTG/Cereal/Productor (que es metadata de trazabilidad interna); es dinero real que reduce lo que cobra el chofer, y ocultarlo detrás de un botón podría leerse como que la app esconde un descuento. Orden final de la pantalla: resumen (Total bruto/Anticipos/Descuentos/Neto, ya existente) → tabla principal de 10 columnas con su fila de Totales → "Adelantos / gastos generales del período" (si existen, siempre visible, sin cambios respecto a lo ya implementado) → botón "Mostrar detalle técnico" (con la tabla completa debajo si está activado) → botones de acción (Descargar Excel/PDF, Confirmar/Anular, sin cambios). Marco esto como recomendación, no como algo ya resuelto — si preferís que "Adelantos generales" también quede detrás del toggle, es un cambio de una línea en la implementación.

### 13.3 Tooltip en la columna Descuentos

Pedido: mostrar el desglose (Comisión + categorías) sin abrir el detalle. Diseño: usar el atributo HTML nativo `title` sobre cada celda de la columna Descuentos de la tabla principal — es el mecanismo de tooltip más simple posible, no requiere ninguna librería nueva (mismo criterio ya establecido en 5.3.1 de no agregar dependencias de UI) ni JS adicional, es soporte nativo del navegador. Contenido del tooltip por fila: `Comisión: {pct}% ({monto}) · Seguros: {monto} · Transferencia Bancaria: {monto} · Efectivo: {monto} · Combustible: {monto} · Otros: {monto}` (mismos datos que ya calcula `construirPlanilla()`, ninguno nuevo). La celda "Descuentos" de la fila de Totales lleva el mismo tratamiento con los totales agregados. Limitación conocida y aceptada: `title` es un tooltip básico del navegador (aparece con demora, sin estilo propio) — es la opción de menor esfuerzo y cero dependencias; si más adelante se quiere un tooltip con estilo propio, es un cambio de UI aislado a esa celda, no afecta nada de este diseño.

### 13.4 PDF y Excel — confirmación de lo ya acordado por chat (sin cambios respecto a esa conversación)

- **PDF:** mismas 10 columnas primarias que pantalla, formato vertical (portrait, no landscape) por ser más imprimible con solo 10 columnas. Debajo de cada fila principal, una línea secundaria compacta en gris con N° de viaje, CTG, Cereal, Productor y — solo cuando `totalAdelantos > 0` — el desglose de categorías con adelanto (evita ruido en filas sin descuentos). Es la implementación ya escrita (con una corrección de bug: el título "Carta de Porte" se abrevia a "C. Porte" para que no rompa a dos líneas dentro de su columna y se superponga con la fila de datos — el resto de las celdas también se truncan igual que ya truncaban las de texto largo, por consistencia).
- **Excel:** sin cambios — se mantiene completo con las 21 columnas actuales (N°/CTG/Cereal/Cliente/Productor/Origen/Destino/Tn/Tarifa/Subtotal/%/Comisión $/Total/las 5 categorías/Saldo), tal como ya se aprobó. Un Excel completo es lo esperable de un export técnico; no se le aplica ninguna jerarquía visual.

### 13.5 Estado de la implementación al momento de este documento

El código de §1-12 (backend `construirPlanilla`, include de `productor`, PDF/Excel con las 21 columnas) está escrito en el working tree, sin commit ni push. Sobre esa base ya se habían escrito dos ajustes adicionales, también sin commit: una primera versión de pantalla con toggle **por fila** (superada por §13.2, hay que reemplazarla por el toggle único) y una versión de PDF con las 10 columnas primarias en portrait con línea secundaria por fila y el bug de "Carta de Porte" ya corregido (esta coincide con §13.4, no hace falta tocarla de nuevo). Nada de esto se commiteó ni se pusheó. No se toca más código hasta aprobar este documento.

---

## 14. Banda de resumen superior (nueva, antes de la tabla principal)

Objetivo explícito: que se entienda el resultado general de la liquidación en menos de 10 segundos, antes de revisar viaje por viaje. Se diseña reutilizando el patrón `.kpi-grid`/`.kpi-card` que ya existe en `styles.css:60-64` y ya se usa en `Dashboard.tsx` — mismo look & feel que el resto de la app, **cero CSS nuevo, cero librería nueva**.

### 14.1 Tiles (6, no 8 — ver reconciliación abajo)

| Tile | Label | Value | Sub (si aplica) | Origen del dato |
|---|---|---|---|---|
| 1 | "Chofer" (tipo CHOFER) o "Transportista" (tipo TRANSPORTISTA) | nombre / razón social | — | ya disponible (`liquidacion.chofer.nombre` / `liquidacion.transportista.razonSocial`), mismo dato que ya usa `nombreContraparte()` |
| 2 | "CUIL" (tipo CHOFER) o "CUIT" (tipo TRANSPORTISTA) | `chofer.cuil` / `transportista.cuit` | — | ya disponible, ver 14.2 (nomenclatura) |
| 3 | "Período" | `{periodoDesde} → {periodoHasta}` | `{cantidadViajes} viajes · {toneladasTotales} toneladas` | período ya disponible; cantidad y toneladas son nuevas (14.3) |
| 4 | "Importe bruto" | `fmtMoney(planilla.totales.subtotal)` | — | ya disponible (mismo valor que la fila Totales de la tabla principal) |
| 5 | "Total descuentos" | `fmtMoney(planilla.totales.comisionMonto + planilla.totales.totalAdelantos)` | — | ya disponible, ver 14.4 (reconciliación con el `totalDescuentos` legacy) |
| 6 | "Neto a pagar" | `fmtMoney(liquidacion.netoPagar)` | — | ya disponible, sin cambios |

El ejemplo que pegaste para "Período" (con el salto de línea y las dos líneas de `sub`) coincide exactamente con la estructura `.label`/`.value`/`.sub` que ya tiene `.kpi-card` — no hace falta ningún elemento visual nuevo, es el mismo tile que hoy usa `Dashboard.tsx` para "VIAJES DEL MES" (mismo componente visual, solo cambian los datos).

### 14.2 Punto de decisión — CUIL vs. CUIT

Pediste "CUIL" explícitamente, pero el dato solo se llama así en el modelo `Chofer.cuil`. `Transportista` (persona jurídica) tiene `cuit`, no `cuil` — son campos distintos en el schema (`schema.prisma:142` vs. `:125`), no es lo mismo pedirle el CUIL a una persona física que el CUIT a una empresa. Recomendación: el label del tile es dinámico según `liquidacion.tipo` ("CUIL" para CHOFER, "CUIT" para TRANSPORTISTA) — mostrar siempre "CUIL" sería incorrecto para la mitad de las liquidaciones (las de tipo TRANSPORTISTA). Marcado como punto a confirmar, no como algo ya resuelto.

### 14.3 Nuevo agregado en `construirPlanilla()`: toneladas totales y cantidad de viajes

Cantidad de viajes = `planilla.filas.length`, no requiere ningún cambio (ya es la longitud del array existente). Toneladas totales sí requiere un agregado nuevo en el objeto `totales` de `construirPlanilla()` (§2): `toneladas: filas.reduce((acc, f) => acc + f.toneladas, 0)`. No es un cálculo de negocio — es una sumatoria de display, no toca ningún monto, no participa de `netoPagar` ni de ningún otro total financiero. Formato: `toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` para que salga "354,80" como en tu ejemplo (coma decimal, dos decimales, separador de miles si corresponde).

### 14.4 Punto de decisión — qué significa "Total de descuentos" acá

Hay dos números distintos en la app que podrían llamarse "Total de descuentos":

- **(a) El legacy** `liquidacion.totalDescuentos` — el que ya se muestra hoy en el párrafo de resumen actual (`Liquidaciones.tsx`, línea con `<strong>Descuentos:</strong>`). Es la suma de movimientos que `esAdelanto()` clasifica como "no es anticipo" — **excluye la comisión** y excluye los movimientos clasificados como "anticipo".
- **(b) El nuevo, de §13.1** — `comisionMonto + totalAdelantos` combinados, que es el que ya usa la columna "Descuentos" de la tabla principal (para que `Bruto - Descuentos = Neto` cierre con los 3 números visibles en cada fila).

Si la banda de resumen usa (a) y la tabla de abajo usa (b), la pantalla mostraría **dos números distintos bajo el mismo nombre "Descuentos"** a centímetros de distancia — confuso, contradice el objetivo de "entender el resultado en 10 segundos". Recomendación: la banda de resumen usa (b), igual que la tabla — es una sola fuente de verdad para "Descuentos" en toda la pantalla. Esto implica reemplazar el párrafo de texto actual (`Total bruto: ... Anticipos: ... Descuentos: ... Neto a pagar:`) por la banda nueva, no agregarla como una cuarta forma más de mostrar lo mismo. Marcado como recomendación a confirmar: si preferís conservar el párrafo legacy además de la banda, dejarían convivir (a) y (b) en la misma pantalla con nombres distintos (ej. "Descuentos (retenciones)" vs. "Descuentos totales") para no generar confusión — pero mi recomendación es reemplazarlo.

---

## 15. Número de factura en el detalle técnico

### 15.1 Evaluación de impacto (pedida explícitamente antes de implementar)

**No es una consulta costosa ni rompe la arquitectura actual.** `Viaje` ya tiene la relación `facturasViaje: FacturaViaje[]` (`schema.prisma:237`), y `FacturaViaje` ya tiene la relación a `Factura` (`schema.prisma:377`) con su campo `numero` (único). Agregar `facturasViaje: { include: { factura: { select: { numero: true, estado: true } } } }` al include de `viaje` dentro de `includeLiquidacion` es exactamente el mismo tipo de cambio que ya se hizo para `productor: true` (§3): Prisma resuelve el include anidado en una consulta adicional acotada a los viajes de la liquidación (no es N+1, es una sola consulta `WHERE viajeId IN (...)` sobre como máximo la cantidad de viajes de esa liquidación — típicamente 1 a 30). Sin migración, sin cambio de contrato (se agrega un campo, no se quita ni renombra nada), sin tocar ninguna regla de negocio (es de solo lectura, no participa de ningún cálculo). **Conclusión: se puede diseñar y luego implementar sin necesidad de pausar a evaluar más — no aplica la condición de "detenerse a explicar impacto" porque el impacto es bajo y acotado.**

### 15.2 Diseño

Un viaje puede, en teoría, tener más de un `FacturaViaje` a lo largo de su historia (si se facturó, se anuló esa factura, y se refacturó — flujo ya soportado desde el commit `cb42b66`, "allow refacturing viajes after annulment"). Para no mostrar un número de factura anulada como si fuera la vigente: se filtra a `factura.estado !== "ANULADO"` y se toma ese número; si por algún motivo quedara más de uno vigente (no debería pasar dado que el flujo de refacturación anula la anterior antes de permitir una nueva), se listan separados por coma en vez de ocultar el dato. Si no hay ninguna factura vigente asociada, el campo queda `null` y la tabla muestra "—".

Se agrega como campo nuevo en cada `fila` de `construirPlanilla()` (§2): `facturaNumero: string | null`. Es aditivo — no cambia la firma de nada que ya consume `construirPlanilla()`, no rompe a `findOne`/`exportarExcel`/`exportarPdf` (los que no lo usen, simplemente ignoran el campo nuevo, igual que hoy ignoran campos que no renderizan).

**Dónde se muestra:** únicamente en la tabla de "detalle técnico" de pantalla (§13.2), como columna adicional (22da) junto a N°/CTG/Cereal/Productor. No se agrega a PDF ni a Excel — no fue pedido para esas salidas, y agregarlo ahí sin que se pida sería expansión de alcance no solicitada.

---

No se implementó nada de §13, §14 ni §15 — queda a la espera de tu aprobación antes de tocar código. El resto del documento (§0-12) ya está aprobado e implementado (pendiente de ajustar pantalla y PDF según §13, y de sumar §14/§15 en la misma pasada de implementación).

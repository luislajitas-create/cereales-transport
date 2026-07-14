# Bloque 7.3.0 — Motor de Inteligencia: Constitución Técnica

Fecha: 2026-07-11. Documento de arquitectura, no de implementación — **no se escribió código, no se modificó ningún archivo, no se generaron migraciones, no se hizo commit.** No repite nada de `BLOQUE7.2.a-d` ni de `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` — es la base técnica mínima y obligatoria que 7.3.1 a 7.3.5 (y cualquier cálculo analítico posterior) tienen que cumplir, sin excepción, para seguir siendo el mismo Motor y no cinco implementaciones distintas con el mismo nombre.

---

## 0. Por qué este documento es corto y aparte

`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` explica el porqué (dominios, relaciones, consumidores). Este documento no explica nada — ordena. Está separado a propósito: una constitución que hay que releer entera para encontrar una regla deja de usarse. Esta cabe en una pantalla.

---

## 1. Qué es

El conjunto de módulos backend responsables de todo cálculo analítico de SDC — hoy, `backend/src/inteligencia/` (con sus subcarpetas `reportes/`, `shared/`, `alertas/`, `benchmarking/`) y lo que se agregue junto a él. Es la única pieza del sistema autorizada a definir qué es un margen, un aging, una alerta o una tendencia.

## 2. Responsabilidades

- Calcular, a partir del modelo transaccional, todo resultado analítico del sistema.
- Aplicar una única semántica (vigencia, período, fórmulas) a cada concepto, sin importar quién lo consuma.
- Entregar resultados ya terminados — ningún consumidor recibe datos a medio calcular.
- Ser la única fuente de verdad citable para cualquier cifra analítica de SDC.

## 3. Qué nunca hace

- Nunca modifica el modelo transaccional (`Viaje`, `Factura`, `Liquidación`...) — solo lee.
- Nunca decide presentación ni UI — eso es responsabilidad exclusiva del consumidor.
- Nunca permite que un consumidor recalcule lo que ya expuso.
- Nunca redefine un concepto que ya tiene definición (un segundo "margen" o un segundo "vigente" es, por definición, un bug de arquitectura, no una variante válida).
- Nunca presenta un dato de una brecha de captura conocida como si fuera confiable, sin decirlo.
- Nunca mezcla el cálculo de dos capacidades distintas en el mismo archivo por comodidad.

## 4. Componentes

- **Un módulo Nest por área** (`inteligencia.module.ts`, y los que se sumen) — resuelve autorización y orquesta, no calcula.
- **Un archivo de cálculo puro por capacidad** (`rentabilidad.calc.ts`, y análogos futuros como `aging.calc.ts`) — funciones testeables sin HTTP, sin efectos de lado.
- **Un archivo de semántica compartida**, todavía no creado (`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 8.1) — cuando exista, cualquier `.calc.ts` nuevo lo consume en vez de reimplementar vigencia o período.

## 5. Quién consume qué

| Consumidor | Consume del Motor |
|---|---|
| Dashboards | Solo agregados y KPIs ya calculados — nunca el detalle transaccional crudo |
| Reportes | Agregados **y** detalle fila por fila (viaje por viaje) — a diferencia de un dashboard, un reporte puede mostrar el cálculo abierto |
| Alertas | Los mismos valores que dashboards/reportes, más un umbral y un destinatario que la propia Alerta agrega — el Motor expone el valor a evaluar, nunca almacena el umbral |
| IA (futura) | El mismo contrato que todo lo demás: funciones de `*.calc.ts` o los endpoints ya expuestos — **nunca** acceso directo a `Viaje`/`Factura`/`Liquidación`. Sin esta regla, una IA futura terminaría reinventando su propia definición de margen la primera vez que alguien le pida un cálculo que el Motor no expuso todavía |

## 6. Reglas obligatorias para cualquier cálculo nuevo

1. Vive dentro del Centro de Inteligencia (`backend/src/inteligencia/`, en la subcarpeta que corresponda por categoría de consumo) — nunca dentro de un controller de dominio transaccional (`ViajesController`, `FacturasController`, `LiquidacionesController`).
2. Se expone como función pura, reutilizable y testeable sin necesidad de HTTP.
3. Reutiliza la semántica ya definida por un cálculo anterior — no la redefine, aunque sea "solo un poco distinta".
4. Filtra explícitamente por vigencia en todo lo que toque `Factura` o `Liquidación`.
5. Declara qué pasa con los datos incompletos — nunca los oculta en silencio ni los estima sin decirlo.
6. El resultado que expone es final: ningún consumidor tiene autorización de diseño para operar aritméticamente sobre él más allá de formato de presentación.
7. Los roles que pueden consumirlo se declaran en el backend — nunca se infieren ni se aplican solo en el frontend.
8. Si dos cálculos nuevos necesitan la misma regla (vigencia, período, redondeo), esa regla se extrae a un lugar común antes de duplicarse una segunda vez — no después.

**Dos ejemplos de qué significa violar estas reglas, para que no queden abstractas:**
- Un endpoint de `LiquidacionesController` que suma facturas de un cliente "para mostrar un total en pantalla" viola la regla 1 — ese cálculo pertenece al Motor, no a un controller de dominio transaccional, aunque sea una sola línea.
- Una pantalla que toma `ingreso` y `costo` de la respuesta del Motor y le resta un descuento visual "solo para este caso" viola la regla 6 — si ese descuento es real, el Motor lo tiene que exponer; si no lo expone, no existe.

## 7. Cómo se verifica

- En la aprobación de cualquier diseño técnico de 7.3.x, se contrasta contra la sección 6, punto por punto — no se improvisa una lista nueva cada vez.
- En cada revisión de código de un cálculo nuevo, se busca cualquier operador aritmético sobre campos monetarios fuera de un `*.calc.ts` — si aparece en un controller o en una pantalla, es una violación de la regla 1 o de la regla 6, no un detalle de estilo.
- Si un cálculo nuevo repite una fórmula que ya existe en otro `.calc.ts`, la regla 8 se está por incumplir — se extrae antes de aprobar el diseño, no después de mergear.

---

## Cierre

Esta constitución no se revisa por cada sub-bloque — se hereda. `BLOQUE7.3.1_DISENO_RENTABILIDAD.md` ya la cumple sin haberla tenido escrita; de acá en adelante, 7.3.2 a 7.3.5 la tienen como punto de partida obligatorio, no como sugerencia.

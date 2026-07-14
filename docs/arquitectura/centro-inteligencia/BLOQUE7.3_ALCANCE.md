# Bloque 7.3 — Diseño Funcional de la Inteligencia Operativa: Alcance y Roadmap

Fecha: 2026-07-11. Documento breve de alcance — abre Bloque 7.3, construido sobre la arquitectura conceptual ya cerrada en la serie `BLOQUE7.2.a` a `BLOQUE7.2.d`. No es un diseño técnico ni una auditoría — fija el orden de trabajo y dos fronteras de alcance que se acordaron antes de abrir el primer sub-bloque, para que no queden implícitas ni se descubran a mitad de camino.

---

## Los cinco sub-bloques

| # | Sub-bloque | Dominio principal (`BLOQUE7.2.a`) |
|---|---|---|
| 7.3.1 | Rentabilidad por viaje, cliente y transportista | Performance Financiera |
| 7.3.2 | Aging de cobranzas y tablero financiero | Performance Financiera |
| 7.3.3 | Alertas operativas y documentales | Riesgos |
| 7.3.4 | Dashboard ejecutivo con drill-down | Síntesis de los 4 dominios verticales + Riesgos |
| 7.3.5 | Benchmarking y tendencias | Performance Comercial + Performance Operativa |

Orden de trabajo: 7.3.1 → 7.3.2 → 7.3.3 → 7.3.4 → 7.3.5. 7.3.4 va después de 7.3.1-7.3.3 porque es un Consumidor (Etapa 4 de `BLOQUE7.2.c`) que depende de que exista conocimiento ya maduro en los dominios anteriores — no tiene sentido antes.

Cada sub-bloque recorre el ciclo completo de `METODOLOGIA_SDC.md` (Auditoría → Diseño técnico → Aprobación → Implementación → Build → Validación → Commit → Push → Cierre) de forma independiente, con su propio commit.

---

## Frontera 1 — Alcance de 7.3.1 frente a 7.3.5

**7.3.1 — Rentabilidad base:**
- Define y calcula la rentabilidad por viaje, cliente y transportista.
- Trabaja sobre un período seleccionado (una foto, no una serie).
- Entrega valores consolidados y rankings de ese período.
- Establece la única definición oficial de ingreso, costo, margen y rentabilidad — la Semántica Compartida (`BLOQUE7.2.a`, Parte 3) para estos términos nace acá.
- No incluye series temporales, tendencias ni comparaciones entre períodos.

**7.3.5 — Benchmarking y tendencias:**
- Reutiliza íntegramente las definiciones de 7.3.1 — no recalcula ni redefine rentabilidad, ingreso, costo o margen.
- Agrega evolución temporal, comparación entre períodos, variaciones y tendencias.
- Incluye ruta más rentable a lo largo del tiempo y evolución mensual del margen.
- Es, en términos de `BLOQUE7.2.c`, la misma Etapa 3 (Maduración Analítica) que 7.3.1, pero aplicada sobre una serie de fotos sucesivas en vez de una sola.

Consistente con el principio 5 de `BLOQUE7.2.d` (ningún consumidor recalcula lo que el sistema ya definió): 7.3.5 es, estrictamente, un consumidor de las definiciones de 7.3.1.

## Frontera 2 — Alcance de 7.3.3 frente a la brecha de captura de datos

Ya señalado como punto de decisión pendiente en `BLOQUE7.2.d` (Grupo F): las alertas documentales de licencia, RTO y seguro dependen de datos que `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` marcó como "Parcial" — el campo existe en el modelo pero no se captura de forma confiable desde ningún formulario.

Se resuelve así: **las alertas documentales quedan condicionadas a que exista primero una captura confiable de esos datos.** Dentro de ese límite, 7.3.3 podrá:

- Diseñar alertas basadas en datos hoy confiables (no documentales — p. ej. anticipos sin liquidar, cartera vencida).
- Documentar el diseño de las alertas documentales (licencia, RTO, seguro) como parte del sub-bloque.
- Pero **no considerar esas alertas documentales implementables ni completas** hasta que exista captura consistente desde la interfaz — quedan documentadas, no construidas, hasta que ese requisito previo se resuelva (en su propio ciclo, fuera de 7.3.3).

---

## Qué queda fuera de este documento

- El diseño técnico de cualquiera de los cinco sub-bloques.
- Cualquier código, migración, pantalla o tecnología.
- La resolución de los puntos de decisión pendientes del registro maestro de `BLOQUE7.2.d` que no sean, específicamente, las dos fronteras de este documento.

---

## Próximo paso

Se abre 7.3.1 — Rentabilidad por viaje, cliente y transportista — en Etapa 1 (Auditoría) de `METODOLOGIA_SDC.md`.

# Bloque 7.3.5 — Diseño funcional breve: Benchmarking y Tendencias

Fecha: 2026-07-11. Diseño práctico (modalidad directa desde 7.3.4), sin auditoría separada.
Último sub-bloque de Bloque 7.3 — cierra el Centro de Inteligencia.

## Alcance

Un módulo nuevo, consumidor puro de `RentabilidadService` (el único servicio del Motor con
lectura directa del modelo transaccional), que responde tres tipos de pregunta:

1. **Comparación entre períodos** — ¿qué cliente/transportista mejoró o empeoró? Compara el
   margen por dimensión entre el período actual y el inmediatamente anterior (misma duración).
2. **Evolución mensual** — serie de ingreso/costo/margen mes a mes, con tendencia
   creciente/decreciente/estable calculada entre el primer y el último punto.
3. **Rankings y Top/Bottom** — por cliente, transportista, cereal y ruta, para un período dado.

## Decisión de arquitectura (resuelta con el Product Owner antes de implementar)

El alcance original pedía también "ranking de cereales", "ranking de rutas" y "evolución de
comisión". Verificado que `RentabilidadService`/`rentabilidad.calc.ts` no exponían cereal,
ruta ni comisión — ninguno de los tres podía resolverse "consumiendo exclusivamente" el Motor
existente, como exige la consigna. Decisión tomada: **extender `RentabilidadService` de forma
aditiva** con `porCereal`/`porRuta` (mismo patrón que `porCliente`/`porTransportista`, mismo
archivo, sin tocar la fórmula de margen) y **descopear comisión** — no tiene hogar natural en
Rentabilidad (que ya la netea dentro de `LiquidacionViaje.totalViaje`) y crear uno sería
arquitectura nueva, no reutilización. Queda pendiente para un futuro sub-bloque si el negocio
lo pide explícitamente.

## Componentes

- `reportes/rentabilidad.calc.ts` — extendido: `ViajeEntrada`/`ViajeCalculado` ganan
  cereal/origen/destino; `ResultadoRentabilidad` gana `porCereal`/`porRuta`
  (`agregarPorDimension`, ya existente, reutilizada sin cambios).
- `rentabilidad.service.ts` — `obtenerViajesEntrada()` (compartida con `AlertasService` desde
  7.3.4.1) trae los 3 campos nuevos en el mismo `select`, sin queries adicionales.
- `benchmarking/benchmarking.calc.ts` — cálculo puro nuevo: `compararPeriodos()`,
  `calcularEvolucion()`, `topBottom()`. Recibe `ResultadoRentabilidad` ya calculado, nunca
  Prisma. Clasifica tendencia con un único umbral de calibración (±2%, `VARIACION_ESTABLE_PCT`),
  mismo criterio que `severidadPorUmbral` pero sin reutilizarlo (forma distinta: dirección de
  cambio con 5 estados, no magnitud con 3 niveles).
- `benchmarking.service.ts` — orquesta: llama a `RentabilidadService.calcular()` una vez
  (rankings), dos veces en paralelo (comparación) o N veces en paralelo (evolución mensual,
  un mes por llamada) y delega todo el cálculo a `benchmarking.calc.ts`.
- `benchmarking.controller.ts` — 3 endpoints, resuelve defaults de fecha/topN, sin lógica de
  negocio propia.

## Contrato HTTP

- `GET /inteligencia/benchmarking/comparacion?desde&hasta&desdeAnterior?&hastaAnterior?` —
  si no se pasa período anterior, se usa el inmediatamente anterior de igual duración.
- `GET /inteligencia/benchmarking/evolucion?meses?&hasta?` — default 6 meses hasta hoy.
- `GET /inteligencia/benchmarking/rankings?desde?&hasta?&topN?` — default mes en curso, top 5.

Roles: `ADMINISTRADOR`+`GERENCIA` únicamente — mismo precedente que Rentabilidad y Dashboard
Ejecutivo (`BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 5).

## Frontend

`Benchmarking.tsx` — tres cards independientes (comparación, evolución, rankings), cada una
con su propio filtro y botón. Solo presenta lo que el backend ya calculó — sin aritmética
sobre importes/porcentajes, mismo contrato que las demás pantallas del Centro.

## Qué no cambia

Ningún endpoint, rol, fórmula, severidad ni umbral existente. `porCereal`/`porRuta` son campos
nuevos agregados a la respuesta de `/inteligencia/rentabilidad` — aditivo, no rompe consumidores
existentes (Dashboard Ejecutivo, pantalla de Rentabilidad) que ya ignoran campos desconocidos.

## Validación

Pure-calc: 19 aserciones nuevas en `benchmarking.calc.ts` (comparación, evolución, top/bottom)
+ 6 nuevas en `rentabilidad.calc.ts` (porCereal/porRuta) — 87 aserciones totales en las 4
suites, todas en verde. Manual: los 3 endpoints contra datos reales, roles 200/403 en los 6
usuarios demo, regresión visual de las 6 pantallas del Centro de Inteligencia + Dashboard
operativo, sin errores de consola de aplicación.

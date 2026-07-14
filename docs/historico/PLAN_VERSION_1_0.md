# Plan hacia la versión 1.0 — SDC

Fecha: 2026-07-09. Responde, con lo ya documentado en `ROADMAP_ACTUALIZADO.md`, `DEUDA_TECNICA.md`, `RECOMENDACIONES_PRODUCTO.md` y `BLOQUE5_ESTADO_ACTUAL.md`, a una sola pregunta: **¿qué falta objetivamente para que SDC llegue a 1.0?** No se agregó ninguna idea nueva — es clasificación de lo que esos cuatro documentos ya señalaron.

Estado de partida: SDC está en `0.5` (ver `VERSIONADO_SDC.md`) — Bloques 3, 4 y 5.1-5.3.2 cerrados. `1.0` se alcanza cuando se cumple `CRITERIOS_LIBERACION.md`.

---

## Imprescindible para 1.0

Los 5 ítems que `DEUDA_TECNICA.md` marca explícitamente como bloqueantes reales antes de operar con dinero real sin supervisión (su sección "Resumen de bloqueantes reales"), en el mismo orden de esfuerzo creciente que ese documento propone:

1. **Verificar Root Directory de Railway y el entrypoint real del build.** Sigue sin confirmarse si producción corre el código que se cree que corre — `BLOQUE5_ESTADO_ACTUAL.md` lo señala como una verificación (sub-bloque 5.0) que nunca se llegó a ejecutar, pese a ser, según su propia auditoría de origen, "la mejor relación beneficio-esfuerzo de todo el roadmap".
2. **`JWT_SECRET`/`CORS_ORIGIN` fail-fast + rate-limiting en login.** `ROADMAP_ACTUALIZADO.md` los agrupa en su "Prioridad 1" junto al punto anterior — quedaron fuera del alcance real de 5.1 pese a que la propuesta original los incluía.
3. **`cuentaCorriente()` excluyendo facturas anuladas del cálculo de saldo.** Señalado en `DEUDA_TECNICA.md` como "candidato a P0 aparte" desde el propio diseño de Bloque 4.3, nunca resuelto — es deuda de integridad contable, la misma categoría de riesgo que ya motivó los P0 de Bloques 3-4.
4. **Backup de base de datos documentado y verificado.** Sin esto, cualquier otro criterio de esta lista es secundario si ocurre un incidente de datos.
5. **Unificar los dos Dockerfiles y automatizar `prisma migrate deploy`.** Riesgo de despliegue silencioso ya señalado desde `ROADMAP_SDC_V1.md` (previo a todo el trabajo de Bloques 3-5) y reconfirmado sin resolver en cada auditoría posterior.

**Por qué estos y no otros:** son, según la propia lectura de `DEUDA_TECNICA.md`, los únicos ítems donde el sistema podría estar manejando o mostrando dinero real de forma incorrecta, o donde un incidente de infraestructura podría perder datos financieros ya cargados — no mejoras de calidad, condiciones para que los números que el sistema muestra sigan siendo confiables una vez que haya un cliente real operando sin supervisión diaria.

---

## Muy recomendable

Ítems que ninguno de los cuatro documentos marca como bloqueante técnico, pero que **`RECOMENDACIONES_PRODUCTO.md` identifica como la diferencia entre "funciona" y "se siente terminado"**, y que `ROADMAP_ACTUALIZADO.md` ya prioriza en sus primeras posiciones restantes:

1. **Parejar Facturas y Anticipos al mismo nivel de confirmación/doble-submit/feedback que Liquidaciones ya tiene.** Es, textualmente, la primera de las "tres mejoras que más valor le darían al usuario" de `RECOMENDACIONES_PRODUCTO.md`, y coincide con la Prioridad 4 de `ROADMAP_ACTUALIZADO.md`. No bloquea la exactitud de los números, pero es la brecha de calidad más visible del sistema hoy — el mismo documento advierte que es lo primero que se nota "en la misma sesión de trabajo" entre módulos hermanos.
2. **Exponer la edición de viajes y catálogos que el backend ya soporta.** Segunda mejora de `RECOMENDACIONES_PRODUCTO.md`, y Prioridad 3 de `ROADMAP_ACTUALIZADO.md` — descrita en ambos documentos como la relación esfuerzo/valor más favorable de todo el backlog, porque no requiere lógica nueva, solo un formulario. Hoy corregir un dato mal cargado depende de pedirle a alguien acceso directo a la base.
3. **Estados de carga y manejo de error consistentes en las 8 pantallas que 5.3.1 no tocó.** Tercera mejora de `RECOMENDACIONES_PRODUCTO.md`, marcada P1 en `DEUDA_TECNICA.md` (sección E) — transversal, barata, mejora la percepción de calidad de toda la aplicación a la vez.
4. **Gating de rol en el frontend** (sidebar y formularios reflejando los permisos reales desde Bloque 5.1). `DEUDA_TECNICA.md` lo marca P1 — no es un agujero de seguridad (el backend ya protege), pero `RECOMENDACIONES_PRODUCTO.md` señala exactamente este tipo de "callejón sin salida visible" como lo que un cliente encuentra solo, en los primeros cinco minutos de explorar por su cuenta.
5. **Empezar tests automatizados, acotado a los flujos financieros críticos.** `BLOQUE5_ESTADO_ACTUAL.md` lo señala como la mayor brecha de confianza a mediano plazo ("toda la validación de los Bloques 3-5 fue manual"); `DEUDA_TECNICA.md` lo marca P1. No hace falta cobertura amplia para 1.0, pero llegar a la primera versión de producción sin ningún test automatizado de los flujos que ya se identificaron como críticos (liquidar/facturar/cobrar) dejaría a 1.1 cargando con el mismo riesgo que ya se documentó dos veces.

---

## Puede esperar para 1.1

Todo lo demás que los cuatro documentos señalan como real pero no urgente para llegar a 1.0 — organizado por documento de origen, sin repetir el detalle ya escrito ahí:

**De `DEUDA_TECNICA.md`** (secciones B-F, todo lo que no está en "Imprescindible"): CI/CD, observabilidad/logging estructurado, `AuditLog` extendido, `HEALTHCHECK`/usuario no-root en Docker, `.env.example`, limpieza de los `schema*.prisma` sueltos y el directorio `app/` duplicado, unificación de `EstadoFacturacionEnum`/`EstadoFacturaEnum`, migración de `Float` a `Decimal` (marcado explícitamente en el propio documento como "mejor evaluarlo como iniciativa propia", no para intercalar con otro trabajo), clasificación de anticipos por campo explícito en vez de texto libre, capa de servicio en el backend, paginación, exports/filtros faltantes en el frontend, validación de CUIT, vencimientos de documentación y sus alertas, accesibilidad avanzada y diseño responsive (ambos ya señalados como dependientes de una decisión de negocio sin responder), y las preguntas de negocio abiertas (N4/AFIP, gestión de usuarios vía API, portal de autoservicio).

**De `RECOMENDACIONES_PRODUCTO.md`:** no aporta ítems adicionales a esta categoría — el documento es deliberadamente acotado a tres mejoras (ya incluidas en "Muy recomendable") y no propone un backlog largo.

**De `ROADMAP_ACTUALIZADO.md`:** todo lo agrupado en sus Prioridades 5 a 12 (observabilidad, cumplimiento normativo, CI/CD, tests más allá del arranque acotado, accesibilidad avanzada, paginación/filtros, deuda estructural de modelo de datos, mantenibilidad de backend) y lo marcado 🔵 Diferido (valor agregado — AFIP, alertas proactivas, Dashboard gerencial, portal de autoservicio, importación masiva), que ese mismo documento condiciona explícitamente a una conversación de alcance con negocio antes de estimar.

**De `BLOQUE5_ESTADO_ACTUAL.md`:** no aporta ítems adicionales — es el documento de cierre que los otros tres ya desagregan; se usó acá solo para confirmar el estado de partida (`0.5`) y el hecho de que ningún P0/P1 de seguridad de infraestructura quedó cerrado en 5.1, ya reflejado en "Imprescindible" y "Muy recomendable".

---

## Lectura de conjunto

Los cinco ítems de "Imprescindible" comparten una característica ya señalada en `DEUDA_TECNICA.md`: son baratos de resolver individualmente (ninguno pasa de esfuerzo medio) y ninguno requiere una decisión de negocio pendiente — son, en ese sentido, la forma más corta de llegar a `1.0` desde donde está el proyecto hoy. Los cinco de "Muy recomendable" no bloquean la liberación, pero dejarlos para 1.1 significa liberar una primera versión de producción con una asimetría de calidad ya documentada entre Liquidaciones y el resto del sistema — vale la pena, como mínimo, decidir conscientemente si esa asimetría es aceptable para el primer cliente real, en vez de que sea un descubrimiento suyo.

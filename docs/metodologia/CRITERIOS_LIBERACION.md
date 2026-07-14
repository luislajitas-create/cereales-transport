# Criterios de liberación — SDC

Checklist de qué debe cumplirse antes de considerar una versión "lista para producción" (aplica en particular al salto a `1.0`, ver `VERSIONADO_SDC.md`). Documento corto, para consultar rápido antes de dar por cerrada una versión.

```
□ Build backend limpio.

□ Build frontend limpio.

□ QA completo del bloque que cierra la versión — auditoría +
   validación manual de los flujos afectados, no solo del
   último sub-bloque.

□ Ninguna deuda técnica marcada como bloqueante de producción
   sigue abierta (ver la sección "Resumen de bloqueantes
   reales" de DEUDA_TECNICA.md — debe estar vacía).

□ Roadmap actualizado y consistente con lo realmente
   implementado (sin sub-bloques marcados ✅ que en verdad
   quedaron parciales).

□ Changelog actualizado con la versión que se está liberando.

□ Documentación de diseño/auditoría de los bloques que
   componen esta versión existe y no contradice lo que el
   código hace hoy.

□ Validación manual de regresión de los flujos financieros
   críticos (liquidar→confirmar→pagar→anular, facturar→
   anular→refacturar, cobranza con sobrepago/duplicado/
   anulación) — aunque la versión no los haya tocado
   directamente.

□ Sin migraciones pendientes de aplicar contra el entorno
   de producción.

□ Sin datos de prueba residuales en el ambiente que se
   va a liberar.

□ git status y git diff revisados antes del último commit
   de la versión — sin archivos fuera de alcance.
```

**Regla general:** si un punto no se puede marcar con certeza (no "probablemente sí", sino certeza verificada), la versión no está lista — se resuelve el punto o se documenta explícitamente como excepción aceptada antes de liberar, nunca se asume.

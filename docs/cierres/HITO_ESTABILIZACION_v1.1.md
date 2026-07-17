# Hito de Estabilización — SDC v1.1

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md` — "el cierre es una afirmación del dueño del producto, no una conclusión que el agente saca solo"). Fecha: 2026-07-17. Cierra formalmente, como un único hito de versión, los siete sub-bloques que componen SDC v1.1 — Grupo Económico: acceso multiempresa y cambio de organización activa.

No repite el contenido de cada acta individual — las cita, cada una ya aprobada y cerrada por separado en su momento, según la misma disciplina de `METODOLOGIA_SDC.md` aplicada sub-bloque por sub-bloque durante todo Bloque 10. Este documento es la certificación de que el conjunto, tomado como versión completa, queda estable y listo para el tag `v1.1.0`.

---

## 1. Alcance de la versión

SDC v1.1 agrega, sobre la base congelada de SDC v1.0.0 (tag inmutable, commit `9d1e29d`), la capacidad de que organizaciones distintas —hasta ahora completamente aisladas entre sí, sin ninguna excepción— puedan pertenecer a un mismo **Grupo Económico** y compartir, de forma explícita, auditada y reversible, dos cosas: la identidad de un chofer real que trabaja para más de una organización del grupo, y el acceso de un usuario administrativo para operar más de una organización sin necesitar una cuenta ni un login distinto por cada una.

**Caso real que motivó todo el bloque:** una empresa que opera con dos CUIT del mismo grupo económico, donde un mismo chofer hace viajes para ambas y se le paga con una única transferencia.

## 2. Sub-bloques cerrados en esta versión

| Sub-bloque | Objetivo | Commit(s) funcional(es) | Commit de cierre | Acta |
|---|---|---|---|---|
| **10.1** | Modelo base de `GrupoEconomico` y asociación de organizaciones | `a963ba2` | `99ae7f7` | `docs/cierres/ACTA_CIERRE_BLOQUE10.1.md` |
| **10.2** | Identidad compartida de Chofer entre organizaciones del grupo | `fa0a01f`, `133f8f7` (corrección de atomicidad) | `70f28e2` | `docs/cierres/ACTA_CIERRE_BLOQUE10.2.md` |
| **10.3.a** | Otorgar/listar/revocar acceso multiempresa | `23c50dc`, `fd8355b` | `e5931bb` (corregido — ver nota) | `docs/cierres/ACTA_CIERRE_BLOQUE10.3a.md` |
| **10.3.b** | Cambio de organización activa (`POST /auth/cambiar-organizacion`) | `8c42486` | `424173a` | `docs/cierres/ACTA_CIERRE_BLOQUE10.3b.md` |
| **10.4.a** | Backend mínimo para el frontend (`organizaciones-accesibles`, `usuarios/resolver`) | `7ad92dd` (funcional + acta en un mismo commit) | — | `ACTA_CIERRE_BLOQUE10.4a.md` (raíz del repositorio — excepción documentada, no movida a `docs/cierres/`) |
| **10.4.b** | Selector de organización, cambio de contexto, sincronización entre pestañas | `8168563` (funcional + acta) | — | `docs/cierres/ACTA_CIERRE_BLOQUE10.4b.md` |
| **10.4.c** | Administración visual de accesos (otorgar/listar/revocar desde la interfaz) | `8f0dfe9` (funcional + acta) | — | `docs/cierres/ACTA_CIERRE_BLOQUE10.4c.md` |

**Nota sobre 10.3.a:** su primera declaración de cierre (`7836fbc`) se publicó antes de que el código funcional tuviera su propio commit — una auditoría independiente detectó la inconsistencia en la misma sesión y se corrigió sin reescribir historia (orden real: `23c50dc` → `7836fbc` → `fd8355b` → `e5931bb`). Documentado en detalle en la propia acta y en la memoria del proyecto como lección aplicada a los cierres posteriores.

## 3. Qué agrega SDC v1.1, en conjunto

- **Modelo `GrupoEconomico`** (no organizacional, aislamiento manual) y `Organizacion.grupoEconomicoId` — una organización pertenece, como máximo, a un grupo a la vez.
- **`IdentidadChoferGrupo`** — vínculo manual, reversible y auditado entre dos filas de `Chofer` (una por organización) que representan a la misma persona real; cada `Chofer` conserva íntegros sus viajes, anticipos, liquidaciones y comisión dentro de su propia organización.
- **`AccesoGrupoEconomico`** — el mecanismo real de acceso multiempresa: un `ADMINISTRADOR` de una organización otorga, a un usuario de otra organización del mismo grupo, la capacidad de operar la suya, con revocación en cualquier momento y sin efecto retroactivo sobre lo ya hecho.
- **`POST /auth/cambiar-organizacion`** — cambio de organización activa sin cerrar sesión, con el mismo `exp` del token heredado exactamente (nunca extiende ni reinicia una sesión), revalidado en cada uso (nunca confía en que un acceso ya otorgado siga vigente).
- **Selector de organización en el frontend**, sincronización entre pestañas por el evento nativo `storage`, y protección de datos sin guardar en el formulario de mayor riesgo (`ViajeForm.tsx`).
- **Pantalla de administración visual** (`/administracion/grupo-economico`) para otorgar, listar y revocar accesos desde la interfaz, sin depender de ningún acceso técnico a la base.

## 4. Qué queda explícitamente fuera de v1.1

- **Pago Consolidado** (Bloques 10.5 y 10.6 del plan original) — backend y frontend para agrupar liquidaciones de distintas organizaciones del grupo en un único pago al mismo beneficiario. No autorizado todavía; queda como el siguiente hito posible sobre esta misma base.
- **Topología avanzada del Grupo Económico como autoservicio** — crear/asociar/desasociar organizaciones sigue siendo un procedimiento administrativo de baja frecuencia, sin pantalla dedicada más allá de lo ya expuesto en 10.1.
- **Administración visual de identidad compartida de Chofer** — el vínculo existe y es auditable, pero sin pantalla propia (queda condicionado a cuando se autorice Pago Consolidado, su único consumidor real hasta ahora).
- Cualquier capacidad ya listada como fuera de alcance en `RELEASE_SDC_v1.0.md`, sección 4, que sigue sin resolverse en esta versión (alta de organización por autoservicio, roles configurables, localización, facturación SaaS, etc.) — v1.1 no las aborda, no era su objetivo.

## 5. Seguridad — resumen de lo verificado a lo largo de los siete sub-bloques

- Aislamiento entre organizaciones ajenas al grupo verificado explícitamente en cada sub-bloque — ninguna organización fuera del grupo económico del actor aparece en ningún endpoint nuevo, bajo ninguna condición probada.
- El acceso de grupo es independiente del rol funcional del usuario (decisión de diseño ya ratificada desde 10.3), y su otorgamiento/revocación queda siempre bajo control exclusivo del `ADMINISTRADOR` de la organización involucrada — nunca de un tercero, nunca de la organización destino.
- Todo cambio de organización activa, todo otorgamiento y toda revocación quedan en `AuditLog`, con la excepción deliberada y documentada de `usuarioId: null` en la entrada del lado destino de un cambio de organización (FK compuesta de `AuditLog.usuario`, resuelta en 10.3.b) — el id real se conserva como dato plano, sin perder trazabilidad.
- Dos hallazgos reales de auditoría adversarial, ambos encontrados y corregidos dentro del propio ciclo de su sub-bloque antes de cualquier cierre: la condición de carrera de `IdentidadChoferGrupo` en 10.2, y la confusión entre organización de pertenencia y organización activa del JWT en `organizaciones-accesibles` (10.4.a).
- Ningún endpoint de esta versión expone `passwordHash`, tokens, ni datos de una organización no autorizada — verificado explícitamente en cada sub-bloque, no asumido.

## 6. Producción

Los seis sub-bloques de backend y frontend con evidencia de despliegue real (10.1, 10.2, 10.3.a, 10.3.b, 10.4.a) fueron verificados contra producción antes de su cierre — migraciones aplicadas, rutas mapeadas, sin errores ni secretos en los logs de despliegue, según el detalle de cada acta. 10.4.b y 10.4.c (exclusivamente frontend, sin cambios de backend ni de contrato) no requirieron una verificación de producción propia más allá de la ya realizada para los endpoints que consumen, ya cerrados y verificados en 10.3.b/10.4.a.

**No existe todavía ningún `GrupoEconomico`, `IdentidadChoferGrupo` ni `AccesoGrupoEconomico` real en producción** — solo el modelo y el código de esta versión están desplegados; la creación de un grupo económico real con las organizaciones reales del cliente queda pendiente de una instrucción explícita separada, fuera del alcance de este hito.

## 7. Deuda técnica y limitaciones conocidas, heredadas de v1.0 y sin cambios en v1.1

Todo lo ya documentado en `RELEASE_SDC_v1.0.md`, sección 13, sigue vigente sin modificación — v1.1 no las agrava ni las resuelve. Específico de v1.1:
- El listado de accesos (`GET /grupo-economico/:id/accesos`) no pagina — riesgo aceptado por el bajo volumen esperado (relación cross-organización dentro de un mismo grupo, no un catálogo masivo).
- No existe contrato de backend para resolver el nombre real de quien otorgó un acceso cuando no es el propio usuario que consulta la pantalla (`otorgadoPorId` de la propia organización) — representado en la interfaz como "Vos" / "Otro administrador de tu organización", documentado como limitación dependiente de una futura evolución del backend, no como un defecto (`DECISIONES_TECNICAS_BLOQUE10.4c.md`, Decisión 2).

## 8. Validaciones ejecutadas

Cada sub-bloque fue validado de forma independiente y completa antes de su propio cierre — build limpio de backend y frontend en cada uno; validación funcional real (no solo `curl`) en 10.4.b y 10.4.c, con navegador real y casos de cancelación, error, estado vacío y regresión explícitamente probados; auditoría adversarial ejecutada antes de cerrar cada sub-bloque de backend y cada sub-bloque de frontend con lógica propia (10.2, 10.3.a, 10.3.b, 10.4.a, 10.4.b, 10.4.c), con hallazgos reales encontrados, corregidos y re-validados en varios de ellos (10.2, 10.4.a, 10.4.c). El detalle completo de cada validación vive en su acta correspondiente (sección 2).

---

## Conclusión

Los siete sub-bloques listados en la sección 2 fueron implementados, validados, auditados de forma adversarial y cerrados individualmente, cada uno con la aprobación explícita del dueño del producto. Tomados en conjunto, constituyen una unidad funcional completa y coherente — acceso multiempresa y cambio de organización activa — sin ningún hallazgo pendiente sin resolver. **SDC v1.1 queda en condiciones de estabilizarse como versión**, sujeto a esta misma aprobación formal.

No se modificó código, no se hicieron refactors, no se cambió ningún contrato al generar este documento.

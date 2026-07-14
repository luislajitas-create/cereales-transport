# Plan de Reorganización de Documentación — SDC

Fecha: 2026-07-14. Documento de organización pura — **no se movió, renombró ni eliminó ningún archivo; no se creó ninguna carpeta; no se modificó el contenido de ningún documento existente; no se hizo `git add`, commit ni push.** Este documento es el único artefacto que produce este trabajo.

**Alcance:** los 95 archivos `.md` que existen hoy en el repositorio — 47 ya trackeados en `main` y 48 sin trackear (relevados en la auditoría previa de esta misma conversación). Quedan explícitamente fuera de alcance los 5 archivos `.md` de `backend/src/_combustibles.disabled/` (ver sección 7) y todo archivo que no sea `.md`.

**Método:** se leyó el encabezado (o el documento completo, cuando hacía falta para resolver una ambigüedad) de los 95 archivos. La clasificación se apoya en la jerarquía que el propio proyecto ya declaró en `CONSTITUCION_SDC.md` (Artículo 1) y en las referencias cruzadas explícitas que cada documento hace de los demás ("reemplaza a...", "responde a...", "consolida...").

---

## 1. Estructura de carpetas propuesta

```
docs/
  metodologia/
  estrategia/
  arquitectura/
    centro-inteligencia/
    multiempresa/
    produccion-deploy/
  disenos/
  auditorias/
  cierres/
  deuda-tecnica/
  roadmap/
  qa/
  historico/
```

### Justificación de cada carpeta

- **`docs/metodologia/`** — el "cómo trabajamos": reglas de proceso, convenciones de commit, checklists. Ninguno de estos documentos está superado; se actualizan por decisión consciente, no por efecto secundario de un bloque. Es exactamente la carpeta que `ESTRUCTURA_DOCUMENTACION.md` ya había propuesto en 2026-07-09 (ver sección 6, hallazgo 1).

- **`docs/estrategia/`** — carpeta nueva respecto de la propuesta original de `ESTRUCTURA_DOCUMENTACION.md`. Se agrega porque los 6 documentos de Fase II/III (identidad, mercado, modelo de negocio, plan maestro) responden preguntas de negocio, no de ingeniería — mezclarlos con `auditorias/`o `disenos/` (carpetas que hoy son 100% técnicas) les restaría visibilidad. `CONSTITUCION_SDC.md` ya los trata como un dominio de gobierno propio ("Identidad y filosofía del producto", "Estrategia comercial y de crecimiento"), lo cual respalda que merezcan su propio espacio.

- **`docs/arquitectura/`** — documentos que describen **cómo está construido el sistema hoy**, no el proceso por el cual se llegó ahí. Se diferencia de `disenos/` en que un documento de "diseño" es un artefacto de una etapa puntual del flujo de `METODOLOGIA_SDC.md` (etapa 2, ligado a un sub-bloque cerrado), mientras que un documento de "arquitectura" sigue siendo la referencia viva de un mecanismo que cualquier trabajo futuro debe respetar (el mismo criterio que usa `CONSTITUCION_SDC.md` para citar `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` como "ley"). Tres subcarpetas, cada una por volumen y cohesión temática propios:
  - `centro-inteligencia/` (8 documentos — Motor de Inteligencia, arquitectura analítica, ontología, gobernanza conceptual).
  - `multiempresa/` (1 documento — el diseño aprobado de aislamiento por organización, la arquitectura que corre en producción hoy).
  - `produccion-deploy/` (1 documento — el procedimiento de migraciones vigente).

- **`docs/disenos/`** y **`docs/auditorias/`** — el resto de los pares auditoría/diseño de sub-bloque que documentan un mecanismo específico todavía vigente (Rentabilidad, Aging, Alertas, Consolidación del Motor, Benchmarking, Plan de implementación de multiempresa, diseño/auditoría de deploy) pero que, a diferencia de los documentos de `arquitectura/`, son el detalle de una entrega puntual, no la ley general del subsistema.

- **`docs/cierres/`** — todas las Actas de Cierre, sin excepción, sin importar antigüedad. `CONSTITUCION_SDC.md` (Artículo 1) las nombra explícitamente como la fuente de verdad de "estado real del sistema en un momento dado" — nunca se degradan a histórico.

- **`docs/deuda-tecnica/`** — `DEUDA_TECNICA.md`, documento vivo y consolidado, citado como ley propia en `CONSTITUCION_SDC.md`.

- **`docs/roadmap/`** — reservada para el/los roadmap(s) de ejecución vigente(s). Hoy contiene dos documentos de vigencia ambigua (ver sección 8) — no hay, al día de hoy, ningún roadmap que se pueda calificar sin dudas como 100% vigente.

- **`docs/qa/`** — carpeta preparada para auditorías de calidad. Queda vacía hoy: las dos únicas auditorías QA que existieron (`QA_FINDINGS.md`, `QA_INFORME_FINAL.md`) tienen sus hallazgos íntegramente absorbidos por `DEUDA_TECNICA.md` y por los cierres de Bloques 3-5, así que van a histórico (sección 5) y no a esta carpeta.

- **`docs/historico/`** — todo documento cuyo contenido informativo está absorbido, superado o reemplazado por otro documento que sigue vigente (una Acta de Cierre, `DEUDA_TECNICA.md`, `RELEASE_SDC_v1.0.md`, u otro documento del mismo tipo más reciente). Es la carpeta más grande (44 de 90 documentos dentro de alcance) porque la mayoría de los ciclos de auditoría/diseño de los Bloques 3, 4, 5, 6.1, 7.1 y 9 ya cerraron con una acta o un estado consolidado que capta lo esencial.

---

## 2. Árbol completo propuesto

```
/ (raíz del repositorio)
├── README.md
├── CONSTITUCION_SDC.md
├── RELEASE_SDC_v1.0.md
├── CHANGELOG.md
├── PLAN_REORGANIZACION_DOCUMENTACION.md   (este documento, hasta que se decida su propio destino)
│
└── docs/
    ├── metodologia/
    │   ├── METODOLOGIA_SDC.md
    │   ├── CONVENCIONES_DESARROLLO.md
    │   ├── CHECKLIST_PRE_PUSH.md
    │   ├── CRITERIOS_LIBERACION.md
    │   └── VERSIONADO_SDC.md
    │
    ├── estrategia/
    │   ├── FASEII_AUDITORIA_ESTRATEGICA_SDC.md
    │   ├── FASEII_MANIFIESTO_SDC.md
    │   ├── FASEII_MERCADO_Y_POSICIONAMIENTO.md
    │   ├── FASEII_MODELO_DE_NEGOCIO.md
    │   ├── FASEIII_PLAN_MAESTRO_2026_2030.md
    │   └── FASEIII_PRODUCTIZACION_SDC.md
    │
    ├── arquitectura/
    │   ├── centro-inteligencia/
    │   │   ├── BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md
    │   │   ├── BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md
    │   │   ├── BLOQUE7.3_ALCANCE.md
    │   │   ├── BLOQUE7.3_SEMANTICA_COMPARTIDA.md
    │   │   ├── BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md
    │   │   ├── BLOQUE7.2.b_MODELO_COGNITIVO_ONTOLOGIA.md
    │   │   ├── BLOQUE7.2.c_CICLO_VIDA_CONOCIMIENTO.md
    │   │   └── BLOQUE7.2.d_PRINCIPIOS_GOBERNANZA_CONCEPTUAL.md
    │   ├── multiempresa/
    │   │   └── BLOQUE8.1_DISENO_MULTIEMPRESA.md
    │   └── produccion-deploy/
    │       └── BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md
    │
    ├── disenos/
    │   ├── BLOQUE7.3.1_DISENO_RENTABILIDAD.md
    │   ├── BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md
    │   ├── BLOQUE7.3.3a_DISENO_ALERTAS.md
    │   ├── BLOQUE7.3.4.1_DISENO_CONSOLIDACION.md
    │   ├── BLOQUE7.3.5_DISENO_BENCHMARKING.md
    │   ├── BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md
    │   └── BLOQUE6.3_DISENO_DEPLOY.md
    │
    ├── auditorias/
    │   ├── BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md
    │   ├── BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md
    │   ├── BLOQUE7.3.3_AUDITORIA_ALERTAS.md
    │   ├── BLOQUE7.3.4.1_AUDITORIA_CONSOLIDACION.md
    │   ├── BLOQUE8_AUDITORIA_PRODUCTIZACION.md
    │   └── BLOQUE6.3_AUDITORIA_DEPLOY.md
    │
    ├── cierres/
    │   ├── ACTA_CIERRE_BLOQUE7.md
    │   ├── ACTA_CIERRE_BLOQUE8.md
    │   ├── ACTA_CIERRE_BLOQUE9.md
    │   ├── ACTA_CIERRE_FRONTEND_BLOQUE9.md
    │   └── ACTA_CIERRE_INCIDENTE.md
    │
    ├── deuda-tecnica/
    │   └── DEUDA_TECNICA.md
    │
    ├── roadmap/
    │   ├── ROADMAP_PRODUCTO_SDC.md               (vigencia a confirmar — sección 8)
    │   └── BLOQUE7_ROADMAP_FUNCIONAL.md          (vigencia a confirmar — sección 8)
    │
    ├── qa/                                        (vacía, preparada)
    │
    └── historico/
        ├── PLAN_VERSION_1_0.md
        ├── QA_FINDINGS.md
        ├── QA_INFORME_FINAL.md
        ├── RECOMENDACIONES_PRODUCTO.md
        ├── ROADMAP_ACTUALIZADO.md
        ├── ROADMAP_BLOQUE5.md                    (candidato a eliminar — sección 9)
        ├── ESTADO_ACTUAL_POST_BLOQUE7.md
        ├── ESTRUCTURA_DOCUMENTACION.md
        ├── BLOQUE3_DISENO_INTEGRIDAD_DATOS.md
        ├── BLOQUE3.2_DISENO_COMISION_PCT.md
        ├── BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md
        ├── BLOQUE4_DISENO_REGLAS_NEGOCIO.md
        ├── BLOQUE4.1_DISENO_GUARDAS_VIAJES.md
        ├── BLOQUE4.2_DISENO_FACTURAVIAJE.md
        ├── BLOQUE4.3_DISENO_COBRANZAS.md
        ├── BLOQUE5_AUDITORIA_PRODUCTO.md
        ├── BLOQUE5_ESTADO_ACTUAL.md
        ├── BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md
        ├── BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md
        ├── BLOQUE5.2_DISENO_INTEGRIDAD_CATALOGOS.md
        ├── BLOQUE5.2.b_DISENO_VALIDACION_INTEGRIDAD.md
        ├── BLOQUE5.3_AUDITORIA_UX.md
        ├── BLOQUE5.3_DISENO_UX.md
        ├── BLOQUE5.3.1_DISENO_ACCIONES.md
        ├── BLOQUE5.3.2_AUDITORIA_PLANILLA_LIQUIDACION.md
        ├── BLOQUE5.3.2_DISENO_PLANILLA_LIQUIDACION.md
        ├── BLOQUE6_AUDITORIA.md                  (candidato a eliminar — sección 9)
        ├── BLOQUE6_DISENO.md                     (candidato a eliminar — sección 9)
        ├── BLOQUE6.1_AUDITORIA_PRODUCCION.md
        ├── BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md
        ├── BLOQUE6.1_DISENO_PRODUCCION.md
        ├── BLOQUE7_AUDITORIA_FUNCIONAL.md
        ├── BLOQUE7.1_INTELIGENCIA_OPERATIVA.md
        ├── BLOQUE7.1_MAPA_INDICADORES.md
        ├── BLOQUE9_AUDITORIA_ADMINISTRACION.md
        ├── BLOQUE9_DISENO_ADMINISTRACION.md
        ├── BLOQUE9_FRONTEND_AUDITORIA.md
        ├── BLOQUE9_FRONTEND_DISENO.md
        ├── DIAGNOSTICO_Y_SOLUCION.md
        ├── IMPLEMENTATION_STATUS.md
        ├── PROJECT_STATUS.md
        ├── ROADMAP_SDC_V1.md
        ├── BACKEND_REVIEW.md
        └── FUEL_MANAGEMENT_DESIGN_SUMMARY.md
```

**Fuera de este árbol, sin cambios:** los 5 archivos `.md` de `backend/src/_combustibles.disabled/` (ver sección 7).

---

## 3. Documentos permanentes en la raíz

| Archivo | Por qué se queda en la raíz (no se asume, se justifica) |
|---|---|
| `README.md` | Convención universal — es el primer archivo que cualquier herramienta (GitHub, un IDE, un clon nuevo) muestra por defecto. Moverlo rompería esa convención sin ningún beneficio de organización a cambio. |
| `CONSTITUCION_SDC.md` | El propio documento se autodefine como "el índice y la ley de jerarquía" entre todos los demás, escrito explícitamente "para que alguien nuevo... pueda encontrar, en cinco minutos, cuál de todos estos documentos leer". Esa función de índice de entrada requiere la máxima visibilidad posible — la raíz, igual que el README. Moverlo a `docs/metodologia/` lo escondería justo detrás de la carpeta que necesita señalar primero. |
| `RELEASE_SDC_v1.0.md` | Es la certificación comercial de la versión actualmente publicada — el documento que responde "¿qué es SDC v1.0 y qué puede esperar un cliente que la adquiere?". Tiene una audiencia distinta (comercial/producto) de toda la documentación de proceso interno, y su vigencia es la del producto en sí, no la de un bloque cerrado. |
| `CHANGELOG.md` | Convención estándar de la industria (junto a README y LICENSE) para que cualquier persona — técnica o no — encuentre sin buscar la historia de versiones en lenguaje humano. |

**No se incluye `METODOLOGIA_SDC.md` en la raíz** pese a su importancia, porque `CONSTITUCION_SDC.md` (que sí queda en la raíz) ya cumple la función de señalarlo por nombre — no hace falta duplicar la puerta de entrada. Queda en `docs/metodologia/`, un salto de un clic desde el índice.

---

## 4. Tabla de movimientos completa (95 documentos)

Todas las ubicaciones actuales son la raíz del repositorio salvo que se indique lo contrario. Ningún movimiento fue ejecutado — es una propuesta.

### 4.1 — Se quedan en la raíz

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `README.md` | *(sin cambio, raíz)* | Ver sección 3. |
| `CONSTITUCION_SDC.md` | *(sin cambio, raíz)* | Ver sección 3. |
| `RELEASE_SDC_v1.0.md` | *(sin cambio, raíz)* | Ver sección 3. |
| `CHANGELOG.md` | *(sin cambio, raíz)* | Ver sección 3. |

### 4.2 — `docs/metodologia/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `METODOLOGIA_SDC.md` | `docs/metodologia/METODOLOGIA_SDC.md` | Ley de proceso vigente, citada por `CONSTITUCION_SDC.md`. |
| `CONVENCIONES_DESARROLLO.md` | `docs/metodologia/CONVENCIONES_DESARROLLO.md` | Reglas de commit/schema/migraciones seguidas hoy sin cambios. |
| `CHECKLIST_PRE_PUSH.md` | `docs/metodologia/CHECKLIST_PRE_PUSH.md` | Checklist operativo usado antes de cada push. |
| `CRITERIOS_LIBERACION.md` | `docs/metodologia/CRITERIOS_LIBERACION.md` | Criterio ya usado para certificar v1.0; seguirá aplicando a futuras versiones mayores. |
| `VERSIONADO_SDC.md` | `docs/metodologia/VERSIONADO_SDC.md` | Esquema de versionado efectivamente en uso desde `0.1` hasta `1.0`. |

### 4.3 — `docs/estrategia/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `FASEII_AUDITORIA_ESTRATEGICA_SDC.md` | `docs/estrategia/FASEII_AUDITORIA_ESTRATEGICA_SDC.md` | Base de todo el resto de Fase II/III; sin reemplazo. |
| `FASEII_MANIFIESTO_SDC.md` | `docs/estrategia/FASEII_MANIFIESTO_SDC.md` | Citado como ley de "identidad y filosofía" en `CONSTITUCION_SDC.md`. |
| `FASEII_MERCADO_Y_POSICIONAMIENTO.md` | `docs/estrategia/FASEII_MERCADO_Y_POSICIONAMIENTO.md` | Citado como ley de "estrategia comercial" en `CONSTITUCION_SDC.md`. |
| `FASEII_MODELO_DE_NEGOCIO.md` | `docs/estrategia/FASEII_MODELO_DE_NEGOCIO.md` | Igual cita. |
| `FASEIII_PLAN_MAESTRO_2026_2030.md` | `docs/estrategia/FASEIII_PLAN_MAESTRO_2026_2030.md` | Igual cita, plan de ejecución a 5 años. |
| `FASEIII_PRODUCTIZACION_SDC.md` | `docs/estrategia/FASEIII_PRODUCTIZACION_SDC.md` | Citado en `CONSTITUCION_SDC.md` como criterio de aceptación de funcionalidad nueva (Art. 5). |

### 4.4 — `docs/arquitectura/centro-inteligencia/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` | `docs/arquitectura/centro-inteligencia/BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` | Nombrado explícitamente como "ley" en `CONSTITUCION_SDC.md` Art. 1. |
| `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md` | `docs/arquitectura/centro-inteligencia/...` | Describe la arquitectura vigente del subsistema, no un sub-bloque puntual. |
| `BLOQUE7.3_ALCANCE.md` | `docs/arquitectura/centro-inteligencia/...` | Define el alcance formal del Centro de Inteligencia, vigente. |
| `BLOQUE7.3_SEMANTICA_COMPARTIDA.md` | `docs/arquitectura/centro-inteligencia/...` | Vocabulario/semántica compartida entre módulos del Motor, vigente. |
| `BLOQUE7.2.a_ARQUITECTURA_ANALITICA_EMPRESARIAL.md` | `docs/arquitectura/centro-inteligencia/...` | Arquitectura conceptual, sin código, pero base de todo 7.3. |
| `BLOQUE7.2.b_MODELO_COGNITIVO_ONTOLOGIA.md` | `docs/arquitectura/centro-inteligencia/...` | Ídem. |
| `BLOQUE7.2.c_CICLO_VIDA_CONOCIMIENTO.md` | `docs/arquitectura/centro-inteligencia/...` | Ídem. |
| `BLOQUE7.2.d_PRINCIPIOS_GOBERNANZA_CONCEPTUAL.md` | `docs/arquitectura/centro-inteligencia/...` | Ídem. |

### 4.5 — `docs/arquitectura/multiempresa/` y `docs/arquitectura/produccion-deploy/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `BLOQUE8.1_DISENO_MULTIEMPRESA.md` | `docs/arquitectura/multiempresa/BLOQUE8.1_DISENO_MULTIEMPRESA.md` | Es, literalmente, cómo funciona el aislamiento por organización hoy en producción — no un capítulo cerrado del pasado. |
| `BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` | `docs/arquitectura/produccion-deploy/BLOQUE6.2_PROCEDIMIENTO_MIGRACIONES.md` | Procedimiento operativo todavía vigente para aplicar migraciones. |

### 4.6 — `docs/disenos/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `BLOQUE7.3.1_DISENO_RENTABILIDAD.md` | `docs/disenos/BLOQUE7.3.1_DISENO_RENTABILIDAD.md` | Diseño del módulo de Rentabilidad, vigente, sin cambios desde su cierre. |
| `BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md` | `docs/disenos/BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md` | Ídem, Aging de Cobranzas. |
| `BLOQUE7.3.3a_DISENO_ALERTAS.md` | `docs/disenos/BLOQUE7.3.3a_DISENO_ALERTAS.md` | Ídem, Centro de Alertas. |
| `BLOQUE7.3.4.1_DISENO_CONSOLIDACION.md` | `docs/disenos/BLOQUE7.3.4.1_DISENO_CONSOLIDACION.md` | Diseño de la consolidación del Motor, vigente. |
| `BLOQUE7.3.5_DISENO_BENCHMARKING.md` | `docs/disenos/BLOQUE7.3.5_DISENO_BENCHMARKING.md` | Ídem, Benchmarking y Tendencias. |
| `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md` | `docs/disenos/BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md` | Plan de fases A-F efectivamente ejecutado; detalle del diseño de multiempresa. |
| `BLOQUE6.3_DISENO_DEPLOY.md` | `docs/disenos/BLOQUE6.3_DISENO_DEPLOY.md` | Diseño de automatización de deploy, vigente (`preDeployCommand` sigue en `railway.json` hoy). |

### 4.7 — `docs/auditorias/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` | `docs/auditorias/BLOQUE7.3.1_AUDITORIA_RENTABILIDAD.md` | Auditoría que originó el diseño vigente de Rentabilidad. |
| `BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md` | `docs/auditorias/BLOQUE7.3.2_AUDITORIA_AGING_COBRANZAS.md` | Ídem, Aging. |
| `BLOQUE7.3.3_AUDITORIA_ALERTAS.md` | `docs/auditorias/BLOQUE7.3.3_AUDITORIA_ALERTAS.md` | Ídem, Alertas. |
| `BLOQUE7.3.4.1_AUDITORIA_CONSOLIDACION.md` | `docs/auditorias/BLOQUE7.3.4.1_AUDITORIA_CONSOLIDACION.md` | Ídem, Consolidación. |
| `BLOQUE8_AUDITORIA_PRODUCTIZACION.md` | `docs/auditorias/BLOQUE8_AUDITORIA_PRODUCTIZACION.md` | Origen documentado de la decisión de multiempresa, sin reemplazo. |
| `BLOQUE6.3_AUDITORIA_DEPLOY.md` | `docs/auditorias/BLOQUE6.3_AUDITORIA_DEPLOY.md` | Origen del diseño de deploy vigente. |

### 4.8 — `docs/cierres/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `ACTA_CIERRE_BLOQUE7.md` | `docs/cierres/ACTA_CIERRE_BLOQUE7.md` | Acta de cierre formal — nunca a histórico (Art. 1, `CONSTITUCION_SDC.md`). |
| `ACTA_CIERRE_BLOQUE8.md` | `docs/cierres/ACTA_CIERRE_BLOQUE8.md` | Ídem. |
| `ACTA_CIERRE_BLOQUE9.md` | `docs/cierres/ACTA_CIERRE_BLOQUE9.md` | Ídem. |
| `ACTA_CIERRE_FRONTEND_BLOQUE9.md` | `docs/cierres/ACTA_CIERRE_FRONTEND_BLOQUE9.md` | Ídem. |
| `ACTA_CIERRE_INCIDENTE.md` | `docs/cierres/ACTA_CIERRE_INCIDENTE.md` | Ídem — cierre formal de un incidente, no de un bloque, pero misma categoría documental. |

### 4.9 — `docs/deuda-tecnica/` y `docs/roadmap/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `DEUDA_TECNICA.md` | `docs/deuda-tecnica/DEUDA_TECNICA.md` | Documento vivo, citado como ley en `CONSTITUCION_SDC.md`. |
| `ROADMAP_PRODUCTO_SDC.md` | `docs/roadmap/ROADMAP_PRODUCTO_SDC.md` | Ver sección 8 — vigencia parcial, requiere tu confirmación. |
| `BLOQUE7_ROADMAP_FUNCIONAL.md` | `docs/roadmap/BLOQUE7_ROADMAP_FUNCIONAL.md` | Ver sección 8 — ídem. |

### 4.10 — `docs/historico/`

| Ubicación actual | Ubicación propuesta | Motivo |
|---|---|---|
| `PLAN_VERSION_1_0.md` | `docs/historico/PLAN_VERSION_1_0.md` | Objetivo cumplido — absorbido por `RELEASE_SDC_v1.0.md`. |
| `QA_FINDINGS.md` | `docs/historico/QA_FINDINGS.md` | Hallazgos resueltos, consolidados en `DEUDA_TECNICA.md` y cierres de Bloques 3-5. |
| `QA_INFORME_FINAL.md` | `docs/historico/QA_INFORME_FINAL.md` | Igual razón. |
| `RECOMENDACIONES_PRODUCTO.md` | `docs/historico/RECOMENDACIONES_PRODUCTO.md` | Recomendaciones ejecutadas (5.3.1/5.3.2) o superadas por `ROADMAP_PRODUCTO_SDC.md`. |
| `ROADMAP_ACTUALIZADO.md` | `docs/historico/ROADMAP_ACTUALIZADO.md` | Cubre solo deuda heredada de Bloque 5; su estado quedó consolidado en documentos posteriores. |
| `ROADMAP_BLOQUE5.md` | `docs/historico/ROADMAP_BLOQUE5.md` | Ver sección 5 y 9 — reemplazado explícitamente por `ROADMAP_ACTUALIZADO.md`; candidato a eliminar. |
| `ESTADO_ACTUAL_POST_BLOQUE7.md` | `docs/historico/ESTADO_ACTUAL_POST_BLOQUE7.md` | Ver sección 5 — su función de "estado vigente" la cumple hoy `RELEASE_SDC_v1.0.md`. |
| `ESTRUCTURA_DOCUMENTACION.md` | `docs/historico/ESTRUCTURA_DOCUMENTACION.md` | Ver sección 5 — reemplazada por este mismo plan. |
| `BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` | `docs/historico/BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` | Implementado y cerrado; sin relevancia arquitectónica hoy. |
| `BLOQUE3.2_DISENO_COMISION_PCT.md` | `docs/historico/BLOQUE3.2_DISENO_COMISION_PCT.md` | Ídem. |
| `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` | `docs/historico/BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md` | Ídem. |
| `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` | `docs/historico/BLOQUE4_DISENO_REGLAS_NEGOCIO.md` | Ídem. |
| `BLOQUE4.1_DISENO_GUARDAS_VIAJES.md` | `docs/historico/BLOQUE4.1_DISENO_GUARDAS_VIAJES.md` | Ídem. |
| `BLOQUE4.2_DISENO_FACTURAVIAJE.md` | `docs/historico/BLOQUE4.2_DISENO_FACTURAVIAJE.md` | Ídem. |
| `BLOQUE4.3_DISENO_COBRANZAS.md` | `docs/historico/BLOQUE4.3_DISENO_COBRANZAS.md` | Ídem. |
| `BLOQUE5_AUDITORIA_PRODUCTO.md` | `docs/historico/BLOQUE5_AUDITORIA_PRODUCTO.md` | Origen de Bloque 5, ya cerrado; alto valor de trazabilidad, cero valor operativo hoy. |
| `BLOQUE5_ESTADO_ACTUAL.md` | `docs/historico/BLOQUE5_ESTADO_ACTUAL.md` | Reemplazado explícitamente por `ESTADO_ACTUAL_POST_BLOQUE7.md` (que a su vez es histórico — ver arriba). |
| `BLOQUE5.1_AUDITORIA_SEGURIDAD_CATALOGOS.md` | `docs/historico/...` | Implementado y cerrado (`258e8a4`). |
| `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md` | `docs/historico/...` | Ídem. |
| `BLOQUE5.2_DISENO_INTEGRIDAD_CATALOGOS.md` | `docs/historico/...` | Implementado y cerrado. |
| `BLOQUE5.2.b_DISENO_VALIDACION_INTEGRIDAD.md` | `docs/historico/...` | Ídem. |
| `BLOQUE5.3_AUDITORIA_UX.md` | `docs/historico/...` | Cerrado vía 5.3.1/5.3.2. |
| `BLOQUE5.3_DISENO_UX.md` | `docs/historico/...` | Ídem. |
| `BLOQUE5.3.1_DISENO_ACCIONES.md` | `docs/historico/...` | Implementado (`971f09c`). |
| `BLOQUE5.3.2_AUDITORIA_PLANILLA_LIQUIDACION.md` | `docs/historico/...` | Implementado (`f2c9505`). |
| `BLOQUE5.3.2_DISENO_PLANILLA_LIQUIDACION.md` | `docs/historico/...` | Ídem. |
| `BLOQUE6_AUDITORIA.md` | `docs/historico/BLOQUE6_AUDITORIA.md` | Ver sección 5 y 9 — reemplazado por `BLOQUE6.1_AUDITORIA_PRODUCCION.md`/`BLOQUE6.3_AUDITORIA_DEPLOY.md`; candidato a eliminar. |
| `BLOQUE6_DISENO.md` | `docs/historico/BLOQUE6_DISENO.md` | Ver sección 5 y 9 — reemplazado por `BLOQUE6.1_DISENO_PRODUCCION.md`/`BLOQUE6.3_DISENO_DEPLOY.md`; candidato a eliminar. |
| `BLOQUE6.1_AUDITORIA_PRODUCCION.md` | `docs/historico/BLOQUE6.1_AUDITORIA_PRODUCCION.md` | Incidente cerrado, consolidado en `ACTA_CIERRE_INCIDENTE.md`. |
| `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` | `docs/historico/BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` | Ídem. |
| `BLOQUE6.1_DISENO_PRODUCCION.md` | `docs/historico/BLOQUE6.1_DISENO_PRODUCCION.md` | Ídem — el procedimiento vigente que sobrevive es `BLOQUE6.2`/`BLOQUE6.3`, ya en `arquitectura/`/`disenos/`. |
| `BLOQUE7_AUDITORIA_FUNCIONAL.md` | `docs/historico/BLOQUE7_AUDITORIA_FUNCIONAL.md` | Abrió el ciclo de Bloque 7, ya cerrado por `ACTA_CIERRE_BLOQUE7.md`. |
| `BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` | `docs/historico/BLOQUE7.1_INTELIGENCIA_OPERATIVA.md` | Conceptual, superado por 7.2/7.3 (ya en `arquitectura/`). |
| `BLOQUE7.1_MAPA_INDICADORES.md` | `docs/historico/BLOQUE7.1_MAPA_INDICADORES.md` | Ídem. |
| `BLOQUE9_AUDITORIA_ADMINISTRACION.md` | `docs/historico/BLOQUE9_AUDITORIA_ADMINISTRACION.md` | Cerrado por `ACTA_CIERRE_BLOQUE9.md`, que consolida su contrato completo (16 endpoints). |
| `BLOQUE9_DISENO_ADMINISTRACION.md` | `docs/historico/BLOQUE9_DISENO_ADMINISTRACION.md` | Ídem. |
| `BLOQUE9_FRONTEND_AUDITORIA.md` | `docs/historico/BLOQUE9_FRONTEND_AUDITORIA.md` | Cerrado por `ACTA_CIERRE_FRONTEND_BLOQUE9.md`. |
| `BLOQUE9_FRONTEND_DISENO.md` | `docs/historico/BLOQUE9_FRONTEND_DISENO.md` | Ídem. |
| `DIAGNOSTICO_Y_SOLUCION.md` | `docs/historico/DIAGNOSTICO_Y_SOLUCION.md` | Incidente puntual (junio 2026) ya resuelto, sin contradicción viva. |
| `IMPLEMENTATION_STATUS.md` | `docs/historico/IMPLEMENTATION_STATUS.md` | Snapshot muy temprano (27/06/2026), absorbido por reportes de estado posteriores. |
| `PROJECT_STATUS.md` | `docs/historico/PROJECT_STATUS.md` | Snapshot de deploy (03/07/2026), superado por `ESTADO_ACTUAL_POST_BLOQUE7.md`/`RELEASE_SDC_v1.0.md`. |
| `ROADMAP_SDC_V1.md` | `docs/historico/ROADMAP_SDC_V1.md` | Primer roadmap del proyecto (03/07/2026); v1.0 ya se certificó. |
| `BACKEND_REVIEW.md` | `docs/historico/BACKEND_REVIEW.md` | Diagnóstico original (03/07/2026); sus hallazgos abiertos viven hoy en `DEUDA_TECNICA.md`, que sí sigue vigente. |
| `FUEL_MANAGEMENT_DESIGN_SUMMARY.md` | `docs/historico/FUEL_MANAGEMENT_DESIGN_SUMMARY.md` | Ver sección 8 — módulo deshabilitado, fuera de alcance de v1.0. |

---

## 5. Duplicados, superposiciones y contradicciones (Etapa 3)

| Situación | Cuál reemplaza a cuál | Cuál conservar como vigente | Cuál pasa a histórico |
|---|---|---|---|
| Roadmap de Bloque 5 | `ROADMAP_ACTUALIZADO.md` reemplaza explícitamente a `ROADMAP_BLOQUE5.md` (así lo dice el propio `ROADMAP_ACTUALIZADO.md` en su primera línea) | Ninguno de los dos es hoy "el roadmap vigente" (ver sección 8) | `ROADMAP_BLOQUE5.md` — además, candidato a eliminar (sección 9), por ser duplicado puro sin contenido propio que `ROADMAP_ACTUALIZADO.md` no tenga con más precisión |
| Auditoría/diseño general de Bloque 6 | `BLOQUE6.1_AUDITORIA_PRODUCCION.md` + `BLOQUE6.3_AUDITORIA_DEPLOY.md` (más detallados, ya trackeados) reemplazan a `BLOQUE6_AUDITORIA.md`; `BLOQUE6.1_DISENO_PRODUCCION.md` + `BLOQUE6.3_DISENO_DEPLOY.md` reemplazan a `BLOQUE6_DISENO.md` | Los 4 documentos de `BLOQUE6.1`/`BLOQUE6.3` | `BLOQUE6_AUDITORIA.md` y `BLOQUE6_DISENO.md` — además, candidatos a eliminar (sección 9) |
| Estado del proyecto post-Bloque 5 | `ESTADO_ACTUAL_POST_BLOQUE7.md` reemplaza explícitamente a `BLOQUE5_ESTADO_ACTUAL.md` (texto literal: "reemplaza... ese documento queda como registro histórico, no se borra") | Ninguno de los dos — hoy el estado vigente lo da `RELEASE_SDC_v1.0.md` | Ambos — `BLOQUE5_ESTADO_ACTUAL.md` por instrucción explícita del propio proyecto, `ESTADO_ACTUAL_POST_BLOQUE7.md` porque su rol de "estado vigente" ya lo absorbió el RELEASE |
| Estructura de documentación | Este mismo documento (`PLAN_REORGANIZACION_DOCUMENTACION.md`) reemplaza a `ESTRUCTURA_DOCUMENTACION.md` — misma pregunta, respuesta más completa y ya ejecutable | `PLAN_REORGANIZACION_DOCUMENTACION.md` | `ESTRUCTURA_DOCUMENTACION.md` |
| Planes hacia 1.0 | `RELEASE_SDC_v1.0.md` (certificación final) absorbe el objetivo de `PLAN_VERSION_1_0.md` (plan hacia esa meta) | `RELEASE_SDC_v1.0.md` | `PLAN_VERSION_1_0.md` |
| QA funcional | `DEUDA_TECNICA.md` y los cierres de Bloques 3-5 absorbieron los hallazgos accionables de `QA_FINDINGS.md`/`QA_INFORME_FINAL.md` | `DEUDA_TECNICA.md` | Ambos QA — se conservan por el detalle `archivo:línea` que no se repitió en ningún otro lado |
| Documentación del módulo de combustibles | Posible superposición entre `FUEL_MANAGEMENT_DESIGN_SUMMARY.md` (raíz) y `backend/src/_combustibles.disabled/README.md` (mismo módulo, mismo resumen) | No se pudo confirmar duplicado literal sin una lectura completa de ambos — **no se afirma como hecho, se marca como pendiente de revisión** (sección 8) | Ninguno todavía — ver sección 8 |

**No se encontraron contradicciones activas hoy** (es decir, dos documentos vigentes afirmando cosas incompatibles sobre el estado actual del sistema). La única tensión histórica detectada — `PROJECT_STATUS.md` (03/07/2026, afirmaba deploy validado) vs. la duda sobre el entrypoint real señalada después en `BLOQUE5_ESTADO_ACTUAL.md`/`BLOQUE6_AUDITORIA.md` — ya se resolvió con el incidente de Bloque 6.1/6.2 y su acta de cierre; ambos documentos de origen son hoy histórico sin conflicto pendiente.

---

## 6. Documentos históricos (resumen)

44 documentos (de los 90 dentro de alcance) van a `docs/historico/` — el detalle completo, uno por uno con motivo, está en la tabla 4.10. En síntesis, por origen:

- **Bloques 3, 4 y 5** completos (17 documentos): bugs de integridad de datos, reglas de negocio y UX/seguridad de catálogos, todos implementados y cerrados hace varios bloques.
- **Bloque 6, ciclo general y 6.1** (5 documentos): el incidente de migraciones sin aplicar, ya cerrado con `ACTA_CIERRE_INCIDENTE.md`.
- **Bloque 7, ciclo 7.1 y su auditoría de apertura** (3 documentos): conceptual, superado por la arquitectura 7.2/7.3 ya construida.
- **Bloque 9 completo** (4 documentos): administración y su frontend, ambos cerrados con acta propia que consolida el contrato final.
- **Documentos de estado/roadmap/QA tempranos** (9 documentos): snapshots y planes cuya función quedó absorbida por documentos posteriores o por `RELEASE_SDC_v1.0.md`.
- **`ESTRUCTURA_DOCUMENTACION.md`**: reemplazado por este plan.
- **`FUEL_MANAGEMENT_DESIGN_SUMMARY.md`**: módulo deshabilitado, fuera de alcance de v1.0.

---

## 7. Fuera de alcance: `backend/src/_combustibles.disabled/`

| Archivo | Por qué queda fuera de este plan |
|---|---|
| `backend/src/_combustibles.disabled/README.md` | Documentación co-ubicada con código deshabilitado dentro de `backend/src/`, no documentación de proceso del proyecto en la raíz. |
| `backend/src/_combustibles.disabled/DATABASE_SCHEMA.md` | Ídem. |
| `backend/src/_combustibles.disabled/IMPLEMENTATION_GUIDE.md` | Ídem. |
| `backend/src/_combustibles.disabled/QUICK_REFERENCE.md` | Ídem. |
| `backend/src/_combustibles.disabled/WORKFLOW_EXAMPLES.md` | Ídem. |

Mover estos 5 archivos implicaría tocar la estructura de `backend/src/`, lo cual excede lo que pediste ("solo reorganizar la documentación existente", "no modificar backend"). Quedan donde están, documentando el módulo de combustibles exactamente como hoy — deshabilitado y fuera del alcance de v1.0 según `ROADMAP_SDC_V1.md`.

---

## 8. Pendientes que requieren tu decisión (no se resolvieron unilateralmente)

1. **`ROADMAP_PRODUCTO_SDC.md`** (2026-07-13, el roadmap más reciente del proyecto): señala como faltante el CRUD completo de usuarios y el panel de administración — ambos **ya construidos en Bloque 9**, posterior a este documento. No está claro si seguís considerándolo el roadmap de producto vigente (con esos dos puntos tácitamente resueltos) o si preferís marcarlo histórico hasta que se actualice explícitamente. Propuesto en `docs/roadmap/` a la espera de tu confirmación.

2. **`BLOQUE7_ROADMAP_FUNCIONAL.md`**: mezcla ítems ya implementados (rentabilidad, aging, alertas) con backlog funcional que no fue vuelto a evaluar en ningún documento posterior. Mismo caso que el anterior — propuesto en `docs/roadmap/`, vigencia a confirmar.

3. **Posible superposición `FUEL_MANAGEMENT_DESIGN_SUMMARY.md` vs. `backend/src/_combustibles.disabled/README.md`**: ambos documentan el mismo módulo deshabilitado. No se leyó el contenido completo de los dos para confirmar si son duplicados exactos o si aportan información distinta (uno podría ser el resumen ejecutivo y el otro la referencia técnica). Antes de decidir si `FUEL_MANAGEMENT_DESIGN_SUMMARY.md` es candidato a eliminación real, convendría una comparación línea por línea — no se hizo en este plan porque excedía el objetivo de organización pura.

4. **`CONSTITUCION_SDC.md`, Artículo 1 (tabla de jerarquía), quedó desactualizada**: fue escrita el 2026-07-12, antes del cierre de Bloque 8 (multiempresa), Bloque 9 (administración) y de la certificación de `RELEASE_SDC_v1.0.md`. Hoy no menciona ninguno de esos tres. No se modificó — está fuera del alcance de este trabajo ("no editar contenido de ningún documento") — pero lo señalo porque es un hallazgo objetivo que probablemente quieras resolver en un trabajo aparte, exclusivamente sobre ese documento.

---

## 9. Documentos que conviene eliminar

Tres documentos, y solo estos tres, cumplen el criterio más estricto para eliminación real (no histórico): están **reemplazados de forma explícita y literal** por otro documento que ya cubre el 100% de su contenido con igual o mayor detalle, y no aportan ningún dato, cita o `archivo:línea` que no esté ya en el documento que los reemplaza.

| Archivo | Reemplazado íntegramente por | Por qué no hace falta ni siquiera como histórico |
|---|---|---|
| `ROADMAP_BLOQUE5.md` | `ROADMAP_ACTUALIZADO.md` | El propio reemplazo declara que actualiza "contra lo realmente ejecutado" — el original quedó desactualizado en cada fila, sin ningún dato que el segundo no repita corregido. |
| `BLOQUE6_AUDITORIA.md` | `BLOQUE6.1_AUDITORIA_PRODUCCION.md` + `BLOQUE6.3_AUDITORIA_DEPLOY.md` (ya trackeados en `main`) | Los 5 hallazgos que agrupaba están cada uno desarrollado con más profundidad en los documentos que sí quedaron en el repositorio oficial. |
| `BLOQUE6_DISENO.md` | `BLOQUE6.1_DISENO_PRODUCCION.md` + `BLOQUE6.3_DISENO_DEPLOY.md` (ya trackeados en `main`) | Misma razón. |

**No se eliminó ninguno de los tres.** Quedan, por ahora, ubicados en `docs/historico/` en la tabla de movimientos (sección 4.10), como corresponde a la restricción de no eliminar nada en este trabajo. Esta sección es solo la recomendación explícita que pediste, a ejecutar (o no) en un paso posterior y separado.

---

## 10. Cierre de este documento

Resumen cuantitativo:

- **95** documentos `.md` relevados en total.
- **4** permanecen en la raíz.
- **86** se proponen distribuidos en 11 carpetas/subcarpetas de `docs/` (5 metodología, 6 estrategia, 10 arquitectura, 7 diseños, 6 auditorías, 5 cierres, 1 deuda técnica, 2 roadmap, 0 QA, 44 histórico).
- **5** quedan fuera de alcance (`backend/src/_combustibles.disabled/`).
- **3** son candidatos explícitos a eliminación real, no ejecutada.
- **2** tienen vigencia ambigua y quedan pendientes de tu confirmación.

No se movió, renombró, eliminó ni editó ningún archivo. No se creó ninguna carpeta. No se hizo `git add`, commit ni push. Este documento es, en sí mismo, la única entrega de este trabajo — queda a la espera de tu revisión antes de ejecutar cualquier movimiento.

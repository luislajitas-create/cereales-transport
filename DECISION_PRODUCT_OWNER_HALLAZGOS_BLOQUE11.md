# Decisión del Product Owner — Hallazgos Críticos de Bloque 11

Fecha: 2026-07-24. **No modifica código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no modifica tests, no genera parches, no actualiza documentación previa, no hace `git add`/`commit`/`push`.** Transforma la evidencia técnica ya cerrada en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` y `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` en decisiones de producto y arquitectura. No se ejecutó ninguna prueba nueva, no se generó evidencia nueva, no se reabrió la auditoría — toda afirmación de este documento cita directamente a esos dos documentos ya aprobados.

---

# H-02 — Bypass del Proxy mediante `Object.getPrototypeOf()`

## Resumen ejecutivo

La Auditoría Adversarial descubrió que los 4 métodos raw de Prisma (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`), bloqueados correctamente ante acceso directo (punto, corchetes, desestructuración, `Reflect.get`, cast `any`), quedan completamente expuestos si se obtienen a través de `Object.getPrototypeOf(clienteInyectado)` — confirmado con ejecución real: SQL crudo ejecutado exitosamente, con **fuga de datos de ambas organizaciones en una sola consulta, sin ningún contexto organizacional establecido**.

El Análisis Técnico aclaró que esto **no es un defecto de `Proxy` como mecanismo**, sino de la estrategia elegida: el `handler` del `Proxy` implementa únicamente el trap `get` (1 de 13 posibles), y por especificación ECMA-262, cualquier trap no implementado delega directamente al objeto real — `getPrototypeOf` nunca pasa por el bloqueo. El Análisis también confirmó dos matices importantes: (a) el bypass requiere una línea de código deliberada, no ocurre por accidente ni por un patrón de uso idiomático; y (b) **no existe hoy ninguna ruta en el código real del proyecto que alcance este bypass sin escribir código nuevo** (búsqueda exhaustiva, cero resultados).

**Riesgo real:** no es explotable directamente por un atacante HTTP externo — requiere que alguien (un desarrollador del equipo, con intención deliberada; o, más relevante en la práctica, una dependencia npm comprometida con capacidad de ejecutar código dentro del proceso del backend) escriba o inyecte 2-3 líneas específicas de JavaScript. El umbral de acceso es el mismo que ya existía para el vector `as any` — que el mecanismo actual sí bloquea correctamente. El impacto, si se alcanza ese umbral, es máximo: lectura y escritura SQL arbitraria, sin ningún control de aislamiento organizacional.

## Clasificación definitiva

**Vulnerabilidad corregible.**

Se descarta "riesgo aceptable" porque el hallazgo contradice directamente el criterio de aceptación que el propio proyecto documentó para H-02 (`AUDITORIA_BLOQUE11_SEGURIDAD.md`: *"cierra el vector por completo, incluso ante un `as any` deliberado o accidental"*) — aceptar el riesgo sin más equivaldría a dar por cumplido un criterio que, con evidencia, no se cumple. Se descarta "vulnerabilidad no corregible" porque el Análisis Técnico documentó 5 estrategias de corrección viables, con al menos una (Estrategia A: agregar el trap `getPrototypeOf`) de complejidad baja, mantenimiento bajo y alta compatibilidad esperada con Prisma. Se descarta "riesgo arquitectónico" como clasificación *final* — es, sí, la **causa raíz** del problema (una decisión de arquitectura, cobertura parcial de traps, dejó el vector abierto), pero la causa raíz siendo arquitectónica no impide que exista una corrección concreta, acotada y de bajo riesgo; "riesgo arquitectónico" describiría mejor una situación sin salida clara, que no es el caso acá.

## Impacto

- **Sobre el aislamiento organizacional:** máximo. El aislamiento por organización es la garantía central de todo el producto SDC — un sistema multi-tenant cuya promesa básica es que ninguna organización pueda ver datos de otra. Este hallazgo demuestra, con ejecución real, que esa garantía puede violarse por completo desde dentro del proceso del backend, sin dejar ningún registro distinguible de una operación legítima (el bypass no pasa por ningún log de `[aislamiento]`).
- **Sobre Prisma:** cualquier corrección depende de un detalle no documentado públicamente por Prisma (si `$queryRaw` vive en un prototipo compartido entre el cliente de nivel superior y el objeto `tx` transaccional). El Análisis ya señaló que una de las 5 estrategias (mutar el prototipo directamente) es riesgosa exactamente por esto. Cualquier estrategia elegida deberá verificarse empíricamente contra la versión real de Prisma instalada, con el mismo rigor ya aplicado en la Pre-Implementación original de H-02.
- **Sobre mantenibilidad:** bajo, si se opta por las estrategias de menor huella (agregar 1-4 traps adicionales al mismo `Proxy` ya existente, mismo archivo, mismo patrón). Alto, si se optara por la estrategia de mayor alcance (reescritura completa a un wrapper explícito) — no recomendada por el propio Análisis salvo que las estrategias más acotadas resulten insuficientes.
- **Sobre futuros desarrolladores:** el hallazgo no cambia el modelo de confianza hacia el equipo actual (no fue explotado, no hay evidencia de mala fe), pero deja una brecha documentada que **cualquier persona con este mismo documento en mano** podría explotar deliberadamente si el equipo cambia o si el proyecto se abre a colaboradores externos. Cerrarlo reduce la dependencia de "que nadie lo descubra" como control de seguridad, que nunca es una estrategia sostenible.
- **Sobre seguridad:** mientras no se corrija, el mecanismo de H-02 da una falsa sensación de cierre completo. El propio equipo, al leer `REVISION_IMPLEMENTACION_BLOQUE11.md` o `VALIDACION_FUNCIONAL_BLOQUE11.md`, podría asumir razonablemente que "los 4 métodos raw quedan bloqueados" sin matices — y esa asunción sería incorrecta hasta que se corrija.

## Decisión del Product Owner

**Corregir obligatoriamente.**

Justificación: el hallazgo compromete la garantía de aislamiento organizacional, que es el activo de seguridad más valioso de todo el sistema — no es un defecto de conveniencia ni de higiene de código, es central al modelo de negocio multi-tenant de SDC. Al mismo tiempo, el Análisis Técnico ya identificó que **no hay evidencia de explotación activa** (sin ninguna ruta existente en el código actual) y que **existe al menos una estrategia de corrección de bajo costo y bajo riesgo de regresión** (Estrategia A). La combinación de "impacto máximo si ocurre" + "costo de corrección bajo" hace que diferir la corrección a "una versión futura" no planificada sea una decisión injustificada — no hay ningún motivo de costo, complejidad o incertidumbre que justifique posponerla. No requiere más investigación previa a nivel de decisión de producto (el Análisis ya cubrió las preguntas necesarias para decidir); sí requerirá, dentro de la propia etapa de corrección, la verificación empírica adicional ya señalada como restricción (ver abajo).

## Restricciones para una futura corrección

Cualquier solución que se diseñe para H-02 deberá cumplir, sin excepción:

1. **No romper `tx.$queryRaw`** — los 2 usos legítimos ya en producción (`facturas.controller.ts`, `registrarCobranza`/`anularCobranza`) deben seguir funcionando exactamente igual, verificado empíricamente (no solo por lectura de código) antes de cerrar la corrección — mismo estándar de evidencia ya exigido en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` para el mecanismo original.
2. **No modificar ningún comportamiento funcional existente** de ningún endpoint ni de ningún flujo ya validado — la corrección debe ser invisible para cualquier código que use el cliente de forma legítima.
3. **No degradar rendimiento** de forma perceptible — cualquier trap adicional agregado al `Proxy` debe tener costo marginal (evaluación de una clave de string contra un `Set`, mismo patrón ya usado en el trap `get` existente).
4. **Mantener compatibilidad con la versión real de Prisma instalada** (`^5.22.0` al momento de este documento) y quedar acompañada de una nota explícita de que debe reverificarse ante cualquier actualización futura de `@prisma/client`/`prisma` — mismo criterio de riesgo ya documentado en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, H-02, punto 9.
5. **Minimizar la superficie de cambio** — preferir la estrategia de menor huella que cierre efectivamente el vector confirmado, evitando una reescritura mayor salvo que se demuestre, con evidencia, que las opciones acotadas son insuficientes.
6. **Verificar empíricamente, no solo por lectura**, que ningún mecanismo interno de Prisma dependa de la cadena de prototipo del cliente extendido quedando accesible desde fuera — mismo estándar metodológico ya aplicado en Pre-Implementación de Bloque 11 para el mecanismo original.
7. **Documentar explícitamente qué queda cubierto y qué no** al cerrar la corrección — para evitar repetir el mismo patrón de "criterio de aceptación más amplio de lo que la implementación realmente garantiza" que originó este hallazgo.

No se propone ninguna implementación en este documento.

---

# H-07 — `trust proxy`

## Resumen ejecutivo

La Auditoría Adversarial demostró, con ejecución real en el ambiente de desarrollo local (sin ningún proxy real interpuesto), que el límite de intentos de login puede evadirse por completo enviando un `X-Forwarded-For` distinto y arbitrario en cada request — cada valor falso recibe un presupuesto de intentos completamente nuevo, anulando el propósito de H-07.

El Análisis Técnico aclaró la causa exacta: `trust proxy: 1` (configuración numérica de Express) confía por **cantidad de saltos**, no por **identidad verificada del proxy** — es, por diseño, indiferente a si el salto de confianza es realmente la infraestructura de Railway o cualquier otro origen. El Análisis investigó la documentación oficial de Railway y encontró que **no cubre el tratamiento de `X-Forwarded-For`**, y que las respuestas del propio equipo de soporte de Railway, en distintos hilos, **se contradicen entre sí** sobre si el header se sobrescribe o se preserva, y sobre cuál extremo del header sería confiable.

**Incertidumbres que permanecen:** si la topología real de producción de Railway garantiza que el `X-Forwarded-For` que llega a la aplicación ya viene saneado (en cuyo caso el bypass demostrado en desarrollo no se reproduciría de la misma forma en producción), o si, por el contrario, el cliente puede efectivamente inyectar valores que la aplicación termine confiando (en cuyo caso el bypass es plenamente explotable en producción). Ninguna de las dos posibilidades pudo confirmarse ni descartarse con la evidencia disponible.

## Evidencia disponible

**Evidencia empírica** (`AUDITORIA_ADVERSARIAL_BLOQUE11.md`, sección 3):
- Bypass reproducido de forma determinística en desarrollo local: 3 valores distintos de `X-Forwarded-For` (formato IPv4, IPv6, múltiples valores, texto arbitrario no-IP), cada uno recibió presupuesto de intentos completamente nuevo.
- La misma IP falsa, repetida, consume correctamente su propio presupuesto (el conteo en sí no está roto).
- Condición de carrera descartada: 15 requests paralelos sobre la misma clave respetaron exactamente el límite de 10, incluso bajo concurrencia.
- El contador es en memoria y se resetea ante un reinicio del backend (comportamiento esperado del almacenamiento por defecto, no una vulnerabilidad).
- Otros endpoints del mismo controller no se ven afectados por el límite de login.

**Evidencia documental** (`ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, sección H-07, punto 6):
- Documentación oficial de Railway (`docs.railway.com/networking/edge-networking`): no especifica el tratamiento de `X-Forwarded-For`.
- Foro de soporte oficial de Railway, hilo 1: un empleado (*phin*) afirma que Railway "elimina `X-Forwarded-For` en el borde y asegura que los clientes no puedan sobrescribirlo".
- Foro de soporte oficial de Railway, mismo hilo: un usuario de la comunidad (*zah340*) reporta el comportamiento contrario por observación práctica, y señala que la cantidad de saltos "no está documentada oficialmente como estable".
- Foro de soporte oficial de Railway, hilo 2: un empleado distinto (*brody*) afirma que el valor más a la derecha del header es el confiable.
- Foro de soporte oficial de Railway, hilo 3: un tercer empleado (*sam-a*) recomienda tomar el valor más a la izquierda — contradice a *brody*, y es, además, internamente inconsistente con la propia descripción de "agregar al final" que ese mismo empleado usa.

**Aspectos aún no demostrados:**
- El comportamiento real de la infraestructura de producción de Railway para el despliegue específico de este proyecto.
- Si el número de saltos reales en producción es exactamente 1 (el valor configurado) o puede variar.
- Si existe alguna forma de validar la identidad del proxy de Railway (rango de IPs conocido, header adicional firmado) que el proyecto no esté usando hoy.

## Clasificación definitiva

**Riesgo pendiente.**

Se descarta "falso positivo": el código, tal como está escrito, es objetivamente inseguro por diseño (confianza por conteo, no por identidad) — esto es un hecho verificable sin depender de ningún entorno, y el bypass fue demostrado con ejecución real. Se descarta "vulnerabilidad confirmada": no hay evidencia consistente de que el mismo comportamiento se reproduzca en la topología real de producción — la única fuente que afirma que Railway sanea el header (*phin*) es tan válida, en principio, como la que afirma lo contrario (*zah340*), sin que ninguna tenga peso documental superior. Se descarta "vulnerabilidad probable" por el mismo motivo: no hay una inclinación de evidencia hacia un lado más que hacia el otro, la contradicción es genuina y de igual peso en ambas direcciones. "Riesgo pendiente" es la única clasificación que refleja con precisión el estado real: un defecto de diseño confirmado en el código, con explotabilidad en producción no determinada.

## Dependencias externas

La decisión sobre este hallazgo **depende explícitamente** de:
- ✅ **Comportamiento del proxy de Railway** — es la dependencia central; sin conocer con certeza si Railway sobrescribe o preserva `X-Forwarded-For`, y cuántos saltos reales existen, no puede evaluarse la explotabilidad real.
- ✅ **Documentación oficial** — ya consultada (`docs.railway.com`) y confirmada insuficiente; no cubre el tema.
- ✅ **Confirmación del proveedor** — pendiente; las respuestas ya recabadas provienen de un foro de soporte comunitario/de empleados, no de un canal oficial de confirmación para este proyecto/plan específico.
- ⚠️ **Pruebas en producción** — posiblemente necesarias incluso después de obtener una confirmación de Railway, dado que la propia evidencia documental sugiere que el comportamiento pudo haber cambiado con el tiempo (despliegue de infraestructura CDN nueva desde aproximadamente febrero de 2026) — una confirmación desactualizada podría no reflejar el estado actual.

## Decisión del Product Owner

**Esperar validación externa.**

Justificación: a diferencia de H-02 (donde el costo de corregir es bajo y el camino es razonablemente claro), acá el costo de **corregir sin saber** es real y puede ser contraproducente: cualquier solución que asuma un comportamiento específico de Railway (por ejemplo, validar contra un rango de IPs supuesto, o cambiar el número de saltos confiados) podría (a) no resolver nada si la suposición es incorrecta, o (b) romper el rate-limiting también para tráfico legítimo (el mismo riesgo que motivó agregar `trust proxy` en primer lugar). "Corregir inmediatamente" sin esa información sería una corrección a ciegas. "Aceptar el riesgo" sería prematuro: no se sabe todavía si hay, en efecto, un riesgo real que aceptar en producción — podría no haber ninguno. "Reabrir investigación" no es necesario: la investigación ya realizada (documentación oficial + 3 hilos de soporte) fue exhaustiva dentro de lo que está públicamente disponible; lo que falta no es más investigación de este tipo, sino una **confirmación directa y específica** del proveedor para este despliegue, que es exactamente lo que "esperar validación externa" implica gestionar. El costo de esta espera es bajo (una consulta a soporte de Railway), y el valor informativo es alto — evita gastar esfuerzo de desarrollo en una corrección que podría no ser necesaria o podría ser la incorrecta.

---

# Matriz de decisiones

| Hallazgo | Riesgo | Evidencia | Decisión | Acción futura |
|---|---|---|---|---|
| H-02 — Bypass del Proxy vía `Object.getPrototypeOf()` | Crítico si se explota (fuga total cross-organización confirmada); requiere ejecución de código dentro del backend, sin ruta explotable hoy desde el código existente | Empírica (bypass y explotabilidad confirmados por ejecución real, solo lectura) + de especificación (ECMA-262, comportamiento por defecto de traps no implementados) | **Corregir obligatoriamente** | Abrir etapa de Corrección Dirigida para H-02 dentro de Bloque 11, respetando las 7 restricciones de la sección correspondiente; elegir una de las 5 estrategias ya documentadas en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` (o una combinación) recién en esa etapa, no en este documento |
| H-07 — `trust proxy` confía por cantidad de saltos, no por identidad | Crítico en el código (confirmado); explotabilidad en producción no confirmada ni descartada | Empírica (bypass reproducido en desarrollo local, sin proxy real) + documental (oficial insuficiente, soporte contradictorio) | **Esperar validación externa** | Contactar a Railway (canal de soporte oficial, no el foro comunitario) solicitando confirmación específica y por escrito, para el despliegue de este proyecto, sobre: (a) si `X-Forwarded-For` se sobrescribe o se preserva; (b) cuántos saltos reales existen; (c) cuál extremo del header es confiable. Recién con esa respuesta, decidir si corresponde corrección de código, y de qué tipo |

---

# Resolución final del Bloque 11

**Otro:** el bloque avanza en dos vías paralelas, con tratamiento distinto para cada hallazgo crítico.

- **H-02 queda listo para pasar a Corrección Dirigida** de inmediato — no depende de ninguna información externa, la decisión ya está tomada (corregir obligatoriamente), y el Análisis Técnico ya dejó un conjunto de estrategias evaluadas listas para que la siguiente etapa elija entre ellas.
- **H-07 queda pendiente de validación externa** — no puede avanzar a una etapa de corrección de código sin antes obtener la confirmación del proveedor descrita arriba; forzar una corrección ahora sería actuar sobre una base de evidencia insuficiente y potencialmente contraproducente.

Ninguna de las categorías de estado únicas ofrecidas ("Listo para Corrección Dirigida", "Pendiente de validación externa", "Listo para cierre", "Requiere nueva auditoría") describe con precisión el estado real del bloque completo, porque los dos hallazgos críticos están en etapas distintas del mismo proceso de decisión. Forzar una única categoría escondería esa diferencia real y podría llevar a bloquear innecesariamente la corrección de H-02 a la espera de H-07, o a avanzar prematuramente sobre H-07 arrastrado por el impulso de corregir H-02.

El Bloque 11, en su conjunto, **no está listo para cierre** (ninguna de las dos vías está resuelta todavía) y **no requiere una nueva auditoría** (la evidencia ya reunida es suficiente para decidir sobre ambos hallazgos, tal como demuestra este mismo documento).

---

# Próxima etapa recomendada

**`DISEÑO_CORRECCION_H02_BLOQUE11.md`**

Objetivo: diseñar, sobre la base de las 5 estrategias ya identificadas en `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md` y las 7 restricciones fijadas en este documento, la corrección concreta para H-02 — eligiendo una estrategia (o una combinación), justificando la elección frente a las alternativas descartadas, y dejando definido el mecanismo exacto antes de pasar a Decisiones Técnicas e Implementación, siguiendo la misma metodología de etapas ya usada para el resto de Bloque 11.

Para H-07, la próxima acción **no es un documento de diseño todavía** — es la gestión externa descrita en la Matriz de decisiones (contactar a soporte oficial de Railway). Un eventual `DISEÑO_CORRECCION_H07_BLOQUE11.md` solo tendría sentido **después** de recibir esa confirmación, y su contenido dependerá directamente de la respuesta obtenida (podría no requerir ningún cambio de código, si Railway confirma que el riesgo no es real en producción).

No se genera ninguno de estos documentos en esta etapa.

---

## Informe final

- **Decisión tomada para H-02:** **Corregir obligatoriamente.** Clasificado como Vulnerabilidad corregible. Impacto máximo sobre el aislamiento organizacional si se explota, pero sin ruta de explotación existente en el código actual. Corrección de bajo costo disponible (Estrategia A del Análisis Técnico). Sujeta a 7 restricciones documentadas arriba, ninguna implementación propuesta en este documento.
- **Decisión tomada para H-07:** **Esperar validación externa.** Clasificado como Riesgo pendiente. El código es objetivamente inseguro por diseño, pero su explotabilidad real en producción depende de información de Railway que hoy es contradictoria e insuficiente. Próxima acción: contacto directo con soporte oficial de Railway, no corrección de código.
- **Estado recomendado del Bloque 11:** Otro — dos vías paralelas: H-02 listo para Corrección Dirigida; H-07 pendiente de validación externa. El bloque no cierra hasta que ambas vías se resuelvan.
- **`git status --short`** (idéntico al estado previo a esta etapa, salvo la aparición de este mismo archivo — sin cambios de código, sin `git add` ejecutado):
  ```
   M backend/package-lock.json
   M backend/package.json
   M backend/src/auth/auth.controller.ts
   M backend/src/auth/auth.module.ts
   M backend/src/catalogos/choferes.controller.ts
   M backend/src/catalogos/clientes.controller.ts
   M backend/src/catalogos/transportistas.controller.ts
   M backend/src/main.ts
   M backend/src/prisma/organizacion-prisma.client.ts
   M frontend/railway.json
  ?? ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md
  ?? AUDITORIA_ADVERSARIAL_BLOQUE11.md
  ?? AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? AUDITORIA_BLOQUE10.4_FRONTEND.md
  ?? AUDITORIA_BLOQUE11_SEGURIDAD.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3b.md
  ?? DECISIONES_TECNICAS_BLOQUE10.4.md
  ?? DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md
  ?? DECISION_PRODUCT_OWNER_HALLAZGOS_BLOQUE11.md
  ?? DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? DISENO_BLOQUE10.4_FRONTEND.md
  ?? "DISEÑO_BLOQUE11_SEGURIDAD.md"
  ?? PLAN_PROXIMA_ETAPA.md
  ?? PRE_IMPLEMENTACION_BLOQUE11.md
  ?? REVISION_IMPLEMENTACION_BLOQUE11.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```

No se modificó código, backend, frontend, schema, tests ni documentación previa. No se generó ningún parche. No se ejecutó ninguna prueba nueva ni se generó evidencia nueva — toda esta decisión se basó exclusivamente en `AUDITORIA_ADVERSARIAL_BLOQUE11.md` y `ANALISIS_HALLAZGOS_ADVERSARIALES_BLOQUE11.md`, ya aprobados.

Me detengo y quedo a la espera de autorización antes de cualquier corrección.

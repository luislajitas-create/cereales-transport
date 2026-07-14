# Bloque 8.1 — Plan de Implementación: Multiempresa y Aislamiento de Datos

Fecha: 2026-07-12. Documento de planificación técnica — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push.** Desarrolla, en fases y sub-bloques concretos, las 8 decisiones ya aprobadas en `BLOQUE8.1_DISENO_MULTIEMPRESA.md` — no las repite ni las vuelve a justificar, las convierte en secuencia de trabajo.

---

## 1. Fases de implementación

**Fase A — Cimientos de seguridad.** Fail-fast de `JWT_SECRET`/`CORS_ORIGIN` (Decisión 5). Es la única fase sin ninguna dependencia de las demás — reduce superficie de riesgo antes de tocar cualquier cosa relacionada con organización, y puede implementarse y cerrarse primero, de forma aislada.

**Fase B — Modelo de datos: Organización y backfill no forzado.** Se crea la entidad Organización, se agrega la referencia de organización en cada tabla afectada de forma opcional (nunca obligatoria en este paso), se asigna a cada fila ya existente el id de la organización única que representa a la instalación actual, y se verifica que el 100% de las filas de cada tabla quedó cubierto. **No se activa ningún filtrado ni ninguna exigencia todavía** — el sistema sigue comportándose exactamente igual que hoy.

**Fase C — Autenticación: contexto de organización en la sesión.** El token de sesión emitido al iniciar sesión incorpora el id de organización del usuario. Tampoco cambia comportamiento visible todavía — el dato viaja, pero nada lo exige aún.

**Fase D — Mecanismo centralizado de aislamiento (construcción y prueba, sin activar).** Se construye el mecanismo que exige y aplica automáticamente el filtro por organización (Decisión 7), y se prueba exhaustivamente contra datos de más de una organización de prueba — sin activarlo todavía sobre los datos reales de la instalación actual.

**Fase E — Endurecimiento y activación del aislamiento estricto.** Una vez verificada la cobertura del 100% de los datos (Fase B) y aprobado el mecanismo de aislamiento (Fase D), se vuelve obligatoria la referencia de organización (`NOT NULL`) y se activa el filtrado estricto en el sistema real. **Es el punto de no retorno conceptual del plan** — antes de esta fase, el sistema sigue funcionando como una sola organización implícita; después, el aislamiento es real y exigido en producción.

**Fase F — Validación con una segunda organización real de prueba.** Se crea una segunda organización de prueba, con su propio catálogo cargado, y se ejercita el plan de pruebas de seguridad (sección 5) contra el sistema ya activado, no contra un entorno aislado. Bloque 8.1 no se da por cerrado sin esta fase.

**Dependencias entre fases:** A no depende de nada. B y C pueden avanzar en paralelo entre sí (no dependen una de la otra), pero ambas deben estar completas antes de D. D debe estar completa y aprobada antes de E. E debe estar completa antes de F.

---

## 2. Entidades afectadas

**Reciben la referencia de organización de forma directa** (son, hoy, el modelo operativo completo del cliente — Decisión 4): `Cliente`, `Transportista`, `Chofer`, `Vehiculo`, `Productor`, `Cereal`, `Ubicacion`, `TipoGasto`, `Viaje`, `Factura`, `Liquidacion`, `Usuario`.

**Entidades con una entidad padre ya organizacional** (`FacturaViaje`, `LiquidacionViaje`, `LiquidacionMovimiento`, `HistorialEstadoViaje`, `Cobranza`, `AnticipoGasto`, `AuditLog`, y el contacto de `Cliente`): heredan el contexto de organización a través de la entidad a la que pertenecen (por ejemplo, una `Cobranza` pertenece a una `Factura`, que ya pertenece a una organización). **Queda como punto a resolver en el diseño técnico detallado de la Fase B/D** (no en este plan) si además reciben su propia referencia directa — más simple de filtrar y más eficiente de consultar — o si el mecanismo de aislamiento resuelve su pertenencia siempre a través del padre. Ambos caminos son coherentes con las decisiones aprobadas; la elección es de implementación, no de arquitectura.

---

## 3. Estrategia de migración y backfill

1. **Crear la Organización única** que representa a la empresa que ya usa SDC hoy (Decisión 8).
2. **Agregar la referencia opcional**, tabla por tabla, empezando por los catálogos simples (`Cereal`, `Ubicacion`, `TipoGasto`, `Productor`) y avanzando hacia las entidades con más relaciones (`Viaje`, `Factura`, `Liquidacion`) — no por una necesidad de integridad referencial (es un valor fijo, no una relación nueva entre datos existentes), sino para poder verificar de forma incremental y detectar cualquier problema en lo más simple antes de llegar a lo más complejo.
3. **Backfill**: asignar a cada fila ya existente de cada tabla el id de la organización única, tabla por tabla, confirmando que la cantidad de filas actualizadas coincide con la cantidad total de filas de esa tabla antes de continuar con la siguiente.
4. **Verificación de cobertura del 100%**: una comprobación explícita, por tabla, de que no queda ninguna fila sin organización asignada — es la condición de salida de la Fase B, no un paso opcional.
5. **Recién en la Fase E** se vuelve la referencia obligatoria (`NOT NULL`) — nunca antes de completar y verificar los cuatro pasos anteriores.

---

## 4. Mecanismo centralizado de aislamiento (contrato conceptual)

No se diseña acá la tecnología ni el patrón exacto de construcción (es tarea de la Fase D, con su propio diseño técnico dedicado) — se fija el contrato que ese mecanismo tiene que cumplir, verificable con independencia de cómo se construya:

- Obtiene el id de organización del contexto de la sesión ya autenticada — nunca lo vuelve a resolver ni lo recibe como un parámetro que el código que hace la consulta tenga que recordar pasar.
- Aplica esa condición de forma automática a toda lectura sobre una tabla organizacional, sin que quien escribe la consulta tenga que declararla.
- Verifica, en toda escritura (creación, actualización, vinculación entre entidades), que todo lo referenciado pertenece a la misma organización que la sesión actual — rechaza la operación si no.
- Cubre, de forma uniforme, listados, búsqueda de un registro puntual por su identificador, relaciones anidadas, agregaciones (las que ya usa el Centro de Inteligencia para rentabilidad, aging, alertas y benchmarking) y operaciones dentro de una transacción.
- Falla de forma segura ante la ausencia de contexto de organización — deniega, nunca ejecuta "sin filtro por las dudas".

**Por qué se prueba antes de activarse (Fase D antes que E):** activar un mecanismo de esta naturaleza directamente sobre los datos reales de la única organización existente no probaría nada — con un solo tenant, un filtro roto y un filtro que funciona bien se ven exactamente igual. La prueba real solo es posible con al menos dos organizaciones de datos, que es, precisamente, el contenido de la Fase F.

---

## 5. Cambios de autenticación y JWT

- El token de sesión incorpora el id de organización del usuario autenticado, junto a lo que ya lleva hoy (identificador de usuario, email, rol, nombre).
- El proceso de login resuelve la organización del usuario en el mismo paso en que hoy ya resuelve su rol — sin una consulta adicional posterior.
- Cualquier punto de entrada autenticado accede al id de organización ya presente en la sesión, sin tener que decodificar ni consultar de nuevo.
- Un usuario sin organización asignada no debe poder obtener una sesión utilizable para operar sobre datos — el login lo rechaza, o emite, como mucho, una sesión de alcance limitado a una pantalla de "pendiente de asignación" (coherente con el comportamiento ya definido en el diseño aprobado).
- El comportamiento actual de `ADMINISTRADOR` (acceso total, sin ningún concepto de alcance) se ajusta para que ese acceso total aplique solo dentro de la organización de la sesión — nunca al sistema completo (Decisión 6).

---

## 6. Pruebas de seguridad entre dos organizaciones

Plan concreto, a ejecutar en la Fase F contra el sistema ya activado, con al menos dos organizaciones de prueba, cada una con su propio catálogo de clientes, transportistas, viajes y facturas cargado:

1. Un usuario de la Organización A nunca ve, en ningún listado del sistema, ningún registro perteneciente a la Organización B.
2. Un usuario de la Organización A que intenta acceder a un recurso puntual de la Organización B por su identificador directo (no solo desde un listado) recibe un rechazo equivalente a "no encontrado" — no un error que revele que el recurso existe.
3. Un usuario de la Organización A no puede crear una relación hacia una entidad de la Organización B (por ejemplo, facturar un viaje propio contra un cliente que en realidad pertenece a la otra organización).
4. **La prueba de mayor riesgo silencioso:** las agregaciones y los cálculos del Centro de Inteligencia (rentabilidad, aging, alertas, benchmarking) de la Organización A nunca incorporan datos de la Organización B — un número mal agregado es mucho menos visible que una fila de más en un listado, y por eso se prueba de forma explícita y separada.
5. Un usuario sin organización asignada no puede completar un login operativo.
6. El rol `ADMINISTRADOR` de la Organización A no tiene, en ningún punto del sistema, acceso a datos o acciones de la Organización B.
7. Las pruebas 1 y 2 se repiten **después** de la activación del aislamiento estricto (Fase E), no solo antes — para confirmar que el endurecimiento no dejó ninguna ruta previa sin cubrir.

---

## 7. Rollback

| Fase | Riesgo | Estrategia de rollback |
|---|---|---|
| A — Fail-fast JWT/CORS | Bajo | Revertir una variable de entorno o un cambio de código acotado, sin relación con datos. |
| B — Organización + backfill | Bajo | Ningún dato se mueve ni se borra — la columna opcional puede quitarse o dejarse sin usar sin pérdida de información. |
| C — Organización en el JWT | Bajo | Un dato adicional en la sesión no rompe nada mientras nada lo exija todavía (antes de la Fase E). |
| D — Mecanismo de aislamiento (construcción) | Bajo | No está activado en producción real — su rollback es, simplemente, no activarlo. |
| E — Endurecimiento y activación estricta | **Alto — la fase de mayor riesgo del plan** | Antes de ejecutarla, debe existir la capacidad de desactivar el filtrado estricto sin revertir la migración de datos (volver, temporalmente, al comportamiento de una sola organización implícita) — ya establecido como condición en el diseño aprobado. Revertir el `NOT NULL` a opcional es, en sí, una operación de bajo riesgo si hiciera falta. |
| F — Validación con segunda organización | Ninguno | Son datos de prueba — su rollback es eliminarlos, sin efecto sobre la organización real. |

---

## 8. Criterios de aceptación

- Las 8 decisiones aprobadas en `BLOQUE8.1_DISENO_MULTIEMPRESA.md` quedan reflejadas exactamente en la implementación, sin desviaciones no conversadas.
- El 100% de las filas de cada tabla afectada tiene organización asignada antes de que la referencia se vuelva obligatoria.
- Las 7 pruebas de la sección 6 pasan, ejecutadas contra datos reales de al menos dos organizaciones, incluida la repetición posterior a la activación estricta.
- Ningún endpoint, listado, agregación o cálculo del Centro de Inteligencia devuelve datos de una organización distinta a la del usuario autenticado, bajo ninguna combinación de rol probada.
- El fail-fast de `JWT_SECRET`/`CORS_ORIGIN` está implementado y verificado — el sistema no arranca con un secreto por defecto inseguro.
- `ADMINISTRADOR` no tiene, en ningún punto probado, alcance fuera de su propia organización.
- La instalación actual sigue funcionando sin ningún cambio de comportamiento visible para el usuario final, salvo la existencia — invisible en el uso diario — de la organización a la que todos sus datos ya pertenecen.
- Ningún dato de la instalación actual se perdió, se movió de forma incorrecta ni quedó huérfano durante la migración.

---

## 9. División recomendada en sub-bloques implementables

| Sub-bloque | Contenido | Depende de |
|---|---|---|
| **8.1.a** | Fail-fast de `JWT_SECRET`/`CORS_ORIGIN` (Fase A) | Ninguno — puede implementarse y cerrarse primero |
| **8.1.b** | Modelo de Organización + backfill no forzado (Fase B) | Ninguno |
| **8.1.c** | Organización en el JWT (Fase C) | 8.1.b (necesita que la entidad Organización ya exista) |
| **8.1.d** | Mecanismo centralizado de aislamiento — construcción y prueba, sin activar (Fase D) | 8.1.b y 8.1.c completos; requiere su propio diseño técnico dedicado, con el nivel de detalle que este plan no cubre |
| **8.1.e** | Endurecimiento y activación del aislamiento estricto (Fase E) | 8.1.b, 8.1.c y 8.1.d completos y validados |
| **8.1.f** | Validación de aislamiento con una segunda organización real de prueba (Fase F) — cierre de Bloque 8.1 | 8.1.e completo |

Cada sub-bloque sigue su propio ciclo completo (diseño técnico cuando haga falta, implementación, validación, commit propio) — no se combinan en un solo commit, con el mismo criterio ya usado en el proyecto para separar trabajo que mezcla capas de riesgo distintas (`METODOLOGIA_SDC.md`, criterio 4). 8.1.a puede avanzar en cualquier momento, incluso en paralelo con el resto, por no depender de nada.

---

## Principios obligatorios de implementación

Dos reglas arquitectónicas adicionales, incorporadas como requisitos no negociables para toda la implementación de Bloque 8.1 en adelante — se suman a las 8 decisiones ya aprobadas en `BLOQUE8.1_DISENO_MULTIEMPRESA.md`, no las reemplazan.

**1. Ningún acceso a datos organizacionales podrá consultar Prisma directamente.** Todo acceso a una tabla organizacional debe pasar, sin excepción, por el mecanismo centralizado de aislamiento definido en la sección 4. No importa qué tecnología se elija para construirlo (*middleware*, extensión de Prisma, capa de repositorio, servicio dedicado, u otra) — lo no negociable es que exista un único punto responsable del aislamiento, y que ningún controlador, servicio o módulo tenga una vía alternativa de acceso a datos que lo evite. El objetivo es eliminar por completo el riesgo ya señalado en el diseño aprobado: que un desarrollador olvide agregar manualmente el filtro por organización.

**2. El mecanismo de aislamiento debe ser transparente para los módulos funcionales.** Rentabilidad, Aging, Alertas, Benchmarking, Dashboard Ejecutivo, y cualquier módulo futuro del Centro de Inteligencia, deben comportarse exactamente igual que hoy — sin incorporar ninguna lógica de organización dentro de sus propios cálculos. Un módulo funcional nunca debe preguntarse "¿de qué organización son estos datos?" — siempre debe recibir, ya desde el punto en que los obtiene, únicamente datos que ya fueron aislados por el mecanismo centralizado. Esta regla protege, en particular, el principio ya establecido en `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` de que un cálculo puro no accede a Prisma ni a HTTP — el aislamiento por organización se resuelve antes de que cualquier dato llegue a esa capa, no dentro de ella.

**3. Prueba obligatoria de seguridad — "Prueba de fuga cruzada".** Se agrega a las 7 pruebas ya definidas en la sección 6 una prueba específica que valida el caso más exigente de aislamiento: dos organizaciones distintas, cada una con datos que **coinciden exactamente en su valor** con los de la otra — mismo nombre de cliente, mismo CUIT, mismo número de factura, mismos códigos internos, mismos nombres de transportistas, mismos nombres de choferes. La prueba debe demostrar que, aun en ese escenario de coincidencia total de valores:
- esos registros nunca aparecen mezclados en ningún listado ni resultado;
- nunca pueden relacionarse entre sí (una entidad de una organización no puede vincularse con una de la otra, aunque comparta el mismo valor de texto);
- nunca pueden actualizarse entre sí (una operación de escritura sobre el registro de una organización nunca afecta al de la otra, aunque ambos compartan el mismo identificador de negocio, como el mismo CUIT o el mismo número de factura);
- nunca pueden agregarse juntos en ningún cálculo del Centro de Inteligencia (rentabilidad, aging, alertas, benchmarking).

Es la prueba de mayor exigencia de todo el plan, porque descarta de forma explícita cualquier mecanismo de aislamiento que dependiera — aunque fuera sin querer — de que los valores de negocio resultaran distintos entre organizaciones. El aislamiento tiene que sostenerse exclusivamente por el identificador de organización, nunca por una coincidencia de que los datos "se vean distintos" entre sí.

**4. La "Prueba de fuga cruzada" pasa a formar parte de los criterios obligatorios de aceptación de Bloque 8**, con el mismo carácter de obligatoriedad que las ya listadas en la sección 8. Ninguna implementación multiempresa puede considerarse terminada mientras esta prueba no pase de forma completa.

---

## Regla permanente de evolución del producto

**Toda funcionalidad nueva desarrollada a partir de Bloque 8 deberá nacer siendo compatible con el modelo multiempresa.**

Esto implica que:

- No se aceptarán implementaciones "temporales" para una sola organización con la promesa de adaptarlas más adelante.
- Ningún diseño podrá asumir implícitamente que existe una única empresa usando el sistema.
- Toda nueva entidad, endpoint, cálculo, pantalla o proceso deberá diseñarse considerando desde el inicio el contexto de organización.
- El mecanismo de aislamiento aprobado en Bloque 8.1 deberá ser reutilizado siempre; nunca duplicado ni reemplazado por soluciones locales.
- Si una funcionalidad no puede implementarse respetando esta regla, deberá detenerse y elevar un conflicto arquitectónico antes de escribir código.

Esta regla existe porque adaptar después un sistema pensado para un solo cliente a un modelo multiempresa es sistemáticamente más costoso que diseñarlo correctamente desde el origen — es, de hecho, precisamente el problema que motivó toda la Etapa 1 de Bloque 8: un sistema construido sin este concepto desde el principio, que después tuvo que auditarse, diseñarse y planificarse como un esfuerzo aparte para incorporarlo. Repetir ese mismo error hacia adelante, funcionalidad por funcionalidad, anularía el propósito de haber resuelto el aislamiento una vez de forma centralizada. La repetibilidad del producto — la condición misma que separa un sistema exitoso para un cliente de un producto que se puede implementar en cualquier empresa del rubro — depende de que esta disciplina se sostenga en cada entrega futura, no solo en la que resolvió el aislamiento por primera vez. Esta regla protege, de forma directa, la visión ya fijada en `CONSTITUCION_SDC.md`, `FASEIII_PRODUCTIZACION_SDC.md` y `FASEIII_PLAN_MAESTRO_2026_2030.md` — sin ella, cada bloque nuevo podría silenciosamente reabrir la misma brecha que Bloque 8 existe para cerrar.

---

**Fin del plan. No se implementó nada de lo descripto acá — queda a la espera de tu revisión antes de abrir el primer sub-bloque técnico (8.1.a o 8.1.b).**

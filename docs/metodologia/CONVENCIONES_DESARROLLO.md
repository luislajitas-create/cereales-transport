# Convenciones de desarrollo — SDC

Fecha: 2026-07-09. Consolida las convenciones que el proyecto ya usó de forma consistente durante los Bloques 3, 4 y 5. No introduce reglas nuevas — documenta lo que ya demostró funcionar, para dejar de depender de recordarlo de una conversación a otra.

---

## Formato de commits

`tipo(alcance): descripción breve en imperativo`

- **Tipo**, en minúscula: `feat` (funcionalidad nueva), `fix` (corrección de un comportamiento existente), `chore` (tareas de mantenimiento sin lógica de negocio), `docs` (solo documentación).
- **Alcance**, entre paréntesis, en minúscula: el módulo o dominio afectado (`liquidaciones`, `catalogos`, `facturas`, `cobranzas`, `viajes`, `anticipos`, `auth`, `api`, `finance`, `ux`).
- **Descripción**, en inglés, en imperativo, sin punto final: `redesign settlement planilla with KPI summary and invoice lookup`, `validate active references on create operations`, `enforce role-based access control on mutating endpoints`.
- **Una sola línea.** Los commits de este proyecto no llevan cuerpo extendido ni trailers — el detalle de qué cambió y por qué vive en el documento de diseño y en el de cierre correspondientes, no en el mensaje de commit.

## Alcance de cada commit

- **Un sub-bloque = un commit.** `258e8a4` (5.1), `8173bd5` (5.2.a), `ccf4673` (5.2.b), `971f09c` (5.3.1), `f2c9505` (5.3.2) — cada uno corresponde exactamente a un sub-bloque cerrado y validado, ni más ni menos.
- **Solo los archivos de código del alcance aprobado se stagean.** Nunca `git add -A`. Se revisa `git status` antes de stagear y se agregan los archivos por nombre.
- **La documentación de proceso (auditoría, diseño, cierre) no se commitea junto con el código que implementa**, salvo pedido explícito. Se generan, se usan para la conversación de aprobación, y quedan como archivos sin trackear hasta que se decida explícitamente incluirlos.
- **Archivos sin relación con el sub-bloque en curso quedan fuera aunque tengan cambios pendientes** (el caso repetido de `frontend/railway.json`, que aparece modificado en `git status` sin ningún diff de contenido real — se verifica y se excluye, no se incluye "ya que estamos").

## Reglas para migraciones

- **Toda migración se describe en el documento de diseño antes de generarse** — nombre orientativo, tipo de columnas, si es aditiva o no, si requiere backfill. Nunca se improvisa corriendo `prisma migrate dev` directamente.
- **Preferencia fuerte por migraciones puramente aditivas**: columnas nuevas con `@default(...)`, sin `DROP`, sin backfill manual cuando el default ya es el valor correcto para todos los registros existentes (ejemplo: `Chofer.activo Boolean @default(true)` — todos los choferes existentes son activos hoy, no hace falta backfill).
- **Expresable en el DSL de Prisma, sin SQL manual, salvo que sea estrictamente necesario** (constraints por expresión como `COALESCE(localidad,'')` son la única excepción documentada, y quedaron como diseño sin implementar precisamente por ese motivo).
- **Cambios que relajan una restricción existente (quitar un `@unique`) se documentan con la misma seriedad que agregar una** — con su propia sección de riesgo, plan de pruebas y plan de rollback (`LiquidacionViaje.viajeId`, `FacturaViaje.viajeId`, ambos pasaron por este tratamiento en Bloques 3.3 y 4.2).
- **Todo diseño con migración incluye un plan de rollback explícito** — qué se pierde y qué no se pierde si se revierte.

## Reglas para `schema.prisma`

- **Nunca se modifica fuera de un sub-bloque de trabajo explícitamente autorizado a tocarlo.** Es habitual que una ronda de trabajo se acote explícitamente con "no tocar schema.prisma" cuando el alcance es solo de presentación o de código de aplicación — esa restricción se respeta al pie de la letra, incluso si tocar el schema resolvería el problema de forma más elegante.
- **Cada cambio de schema se justifica por su relación de negocio, no solo por conveniencia técnica** (ejemplo: extender `activo` a `Chofer`/`Vehiculo` se justificó por la rotación real de personal/flota, y explícitamente **no** se extendió a `Cereal`/`Ubicacion`/`TipoGasto` por la ausencia de ese mismo turnover real).
- **Consistencia de patrón por sobre la solución "ideal" aislada** — cuando se evalúa cómo modelar algo nuevo, se prioriza replicar un patrón ya usado en el schema (ejemplo: `activo Boolean @default(true)` simple, sin motivo/fecha, "por consistencia con `Cliente`/`Transportista`", aunque un diseño desde cero tal vez hubiera preferido más trazabilidad).

## Cuándo usar auditoría

- Antes de encarar un área del sistema que no se revisó recientemente o donde se sospecha un problema sin evidencia confirmada todavía.
- Cuando el pedido es amplio ("qué le falta a este módulo para ser profesional") y no una corrección puntual ya identificada.
- Siempre antes de un diseño técnico que toque una superficie nueva — un diseño nunca es el primer documento que toca un tema, salvo que la auditoría ya exista de una ronda anterior y siga vigente.

## Cuándo escribir diseño

- Siempre antes de implementar, sin excepción de tamaño. Incluso un cambio "de una palabra" (el typo `detalle.numerl`) pasó por quedar documentado como hallazgo antes de corregirse — la diferencia con un cambio grande no es si hay diseño o no, es cuánto ocupa.
- Cuando una auditoría ya identificó el problema y hace falta decidir *cómo* resolverlo, incluyendo alternativas descartadas y por qué.
- Cuando aparece una ampliación de alcance durante una conversación (una mejora nueva pedida sobre la marcha) — se escribe como una sección nueva o un documento nuevo de diseño antes de tocar código, nunca se implementa directamente sobre la marcha aunque el pedido sea claro.

## Cuándo hacer QA

- No por cada sub-bloque — el QA de este proyecto (`QA_FINDINGS.md`/`QA_INFORME_FINAL.md`) es una auditoría funcional amplia, módulo por módulo, contra un ambiente real, hecha en puntos de control del proyecto (al cierre de un cluster de bloques, antes de decidir la siguiente gran prioridad), no como parte del ciclo de cada sub-bloque individual.
- Se diferencia de una auditoría puntual (`docs/auditorias/`) en que cruza módulos buscando patrones repetidos (la misma clase de bug apareciendo en más de un lugar), no un problema aislado.

## Cómo validar un bloque

Orden fijo, siempre en este orden:

1. Build de backend y de frontend — los dos, siempre, incluso si el cambio parece de un solo lado.
2. Reinicio limpio de los servidores si hay sospecha de estado stale (verificar puertos, matar procesos viejos antes de levantar los nuevos).
3. Login real contra la UI, no solo llamadas de API.
4. Ejercitar el flujo en pantalla: crear/ver/confirmar/anular según corresponda, no solo el caso feliz — incluir los casos de regresión de bloques anteriores relacionados.
5. Cuando el cambio toca datos financieros exportables: generar el PDF/Excel real y leerlo, no asumir que el código que lo genera está bien porque compila.
6. Revisar la consola del navegador por errores nuevos (descartando el ruido ya conocido de extensiones del navegador).
7. Limpiar cualquier dato de prueba creado durante la validación; documentar como residuo conocido lo que no se pueda limpiar por una regla de negocio real.
8. `git diff` y `git status` antes de proponer un commit — nunca después.

## Cómo escribir mensajes de error

- En español, dirigidos al usuario de negocio, no al desarrollador. Un `400` nunca debería devolver el nombre de una constraint de Postgres.
- Explícitos sobre *cómo* resolver el problema, no solo qué salió mal (ejemplo consolidado en varios bloques: `"este cliente está dado de baja, reactívelo primero"`, no `"cliente inactivo"`).
- Las violaciones de constraints únicas de Prisma (`P2002`) se traducen a mensajes de negocio mediante el filtro de excepciones global — nunca se expone el error crudo de Prisma al usuario final.
- Bloqueo estricto con `400` y mensaje claro, no advertencias silenciosas, cuando la regla de negocio lo amerita (decisión explícita tomada en 5.2: se evaluó permitir la operación con solo un aviso y se descartó, porque "el patrón de advertencia que no bloquea nada ya demostró ser inefectivo en este mismo sistema").

## Cómo evaluar riesgo antes de implementar

- Todo diseño técnico incluye una sección de alternativas evaluadas (mínimo dos), con una recomendación justificada — nunca se presenta una única opción como si fuera la única posible.
- Todo riesgo identificado lleva severidad y mitigación concreta, no solo la mención del riesgo.
- Se distingue explícitamente entre una acción reversible (confirmación simple) y una genuinamente irreversible (confirmación reforzada, como tipear el número de liquidación antes de "Marcar como pagada") — el nivel de fricción en la UI es proporcional al costo real de un error, no uniforme.
- Antes de tocar una tabla que "no es dueña" del módulo en el que se está trabajando (el patrón de escritura cruzada entre Liquidaciones/Anticipos/Viajes), se evalúa explícitamente el riesgo de acoplamiento — ya causó un bug real una vez, y esa experiencia se cita como precedente en las auditorías siguientes en vez de repetirse sin más contexto.
- No se introduce una librería o dependencia externa nueva para resolver un problema que se puede resolver con lo que ya existe en el proyecto (decisión mantenida de forma consistente en frontend: sin librería de UI, sin librería de modales — `ConfirmDialog`/`useAsyncAction` se construyeron con React + CSS plano).

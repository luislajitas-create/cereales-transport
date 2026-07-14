# Metodología SDC — la constitución del proyecto

Fecha: 2026-07-09. Formaliza el flujo de trabajo que ya se usó, sin excepciones relevantes, durante los Bloques 3, 4 y 5. No es una propuesta nueva — es la descripción por escrito de lo que ya funcionó, para que se mantenga sin depender de que alguien lo recuerde de memoria.

---

## El flujo oficial de trabajo

Todo sub-bloque de trabajo en SDC pasa, en este orden, por las siguientes 9 etapas. Ninguna etapa se salta; algunas pueden ser breves si el alcance es chico, pero ninguna desaparece.

### 1. Auditoría

**Objetivo:** entender y documentar el problema real antes de proponer una solución. Sin código, sin migraciones, sin cambios de ningún archivo del proyecto — es un documento de diagnóstico puro, con referencias verificables (`archivo:línea`) a lo que existe hoy.

Una auditoría responde "¿qué está pasando?", no "¿qué vamos a hacer?". Clasifica hallazgos por prioridad/impacto/riesgo, pero no decide todavía cómo resolverlos.

### 2. Diseño técnico

**Objetivo:** proponer una solución concreta al problema que la auditoría documentó. Sigue sin tocar código. Un diseño técnico de SDC incluye, como mínimo: alcance (qué entra y qué queda explícitamente fuera), alternativas evaluadas con una recomendación justificada, migraciones necesarias (si las hay, descritas en detalle antes de generarlas), impacto en frontend si corresponde, riesgos con su mitigación, plan de pruebas, plan de rollback, y — cuando hay algo que no se puede decidir solo desde lo técnico — una sección explícita de puntos de decisión pendientes para el dueño del producto.

Un diseño técnico nunca se auto-aprueba. Termina siempre con una variación de "no se implementó nada de este diseño, queda a la espera de tu aprobación".

### 3. Aprobación

**Objetivo:** que una persona (no el mismo proceso que escribió el diseño) revise y apruebe explícitamente el alcance antes de que se escriba una sola línea de código. La aprobación puede venir con ajustes — cuando eso pasa, los ajustes se conversan y, si cambian el diseño de forma no trivial, se actualiza el documento de diseño antes de implementar, no en paralelo con la implementación.

**No hay aprobación implícita.** Que un diseño esté bien escrito, o que nadie lo objete de inmediato, no es aprobación — hace falta una confirmación explícita del tipo "aprobado, implementá".

### 4. Implementación

**Objetivo:** escribir exactamente lo que el diseño aprobado describe, ni más ni menos. Si durante la implementación aparece la necesidad de algo que el diseño no contemplaba (un hallazgo nuevo, un caso de borde no previsto), se documenta y se decide si amerita volver a la etapa 2 (actualizar el diseño) o si es lo bastante menor como para resolverlo dentro del mismo alcance aprobado — la duda se resuelve preguntando, no decidiendo solo.

### 5. Build

**Objetivo:** confirmar que el código compila limpio antes de cualquier prueba manual. Build de backend y de frontend, ambos, siempre — nunca solo uno de los dos, incluso si el cambio "parece" ser de un solo lado (el ejemplo repetido en este proyecto: un cambio de backend que agrega un campo a una respuesta puede requerir el ajuste correspondiente en el frontend que lo consume).

### 6. Validación funcional

**Objetivo:** probar el cambio de verdad, no asumir que el build limpio es suficiente. En SDC esto significa: levantar los servidores, loguearse, ejercitar el flujo real en pantalla (no solo `curl`), y — cuando el cambio toca datos financieros — generar y leer los artefactos reales (PDF, Excel) en vez de confiar en que el código "debería" generarlos bien. Incluye probar explícitamente los casos de regresión de bloques anteriores que el cambio podría afectar, no solo el caso nuevo.

Si la validación requirió crear datos de prueba, se limpian (anular/revertir lo creado) antes de seguir — nunca se deja como residuo silencioso, y si algo no se puede limpiar por una regla de negocio (ej. una liquidación ya `PAGADA` no se puede anular), se documenta explícitamente como residuo conocido.

### 7. Commit

**Objetivo:** dejar un registro claro y acotado de qué cambió y por qué, en el estilo convencional del proyecto (ver `CONVENCIONES_DESARROLLO.md`). El commit se arma recién acá, después de que el build y la validación ya pasaron — nunca antes.

**El commit nunca es automático.** Se hace solo cuando se pide explícitamente, y se stagean únicamente los archivos que corresponden al alcance aprobado — nunca `git add -A`, nunca documentación de diseño/auditoría mezclada con el mismo commit que el código (ver "qué nunca debe hacerse" más abajo).

### 8. Push

**Objetivo:** publicar el commit a `origin/main`. Es la etapa con mayor radio de impacto de todo el flujo (afecta el estado compartido del repositorio) y por eso es la que más se separa en el tiempo de las demás — nunca se hace en el mismo paso que el commit, siempre con una autorización explícita y propia, aunque el commit ya haya sido aprobado.

### 9. Documento de cierre

**Objetivo:** dejar constancia de qué se hizo, qué se validó, y qué queda pendiente — para que la próxima persona (o la misma, en la próxima sesión) no tenga que reconstruir el contexto desde la memoria de una conversación. Un cierre de bloque incluye, como mínimo: qué se implementó, qué riesgos se cerraron, qué deuda técnica quedó (solo la real, no todo lo que se le ocurra al que escribe), y qué quedó explícitamente fuera de alcance.

Los cierres grandes (fin de un bloque completo, no de un sub-bloque) además actualizan el roadmap y el registro de deuda técnica — no se dejan como documentos aislados que hay que cruzar a mano.

---

## Qué cosas nunca deben hacerse

- **Implementar sin diseño aprobado.** Ni un fix "chiquito". Si algo parece demasiado trivial para ameritar un diseño, la señal correcta es preguntar si de verdad hace falta el paso completo — no saltearlo por decisión propia.
- **Mezclar bloques.** Un commit corresponde a un sub-bloque. Si mientras se trabaja un sub-bloque aparece la tentación de "aprovechar y arreglar" algo de otro bloque (tocado o no en el mismo archivo), eso se anota como hallazgo nuevo para su propio ciclo de auditoría/diseño — no se cuela en el commit en curso.
- **Tocar un bloque ya cerrado y pusheado sin instrucción explícita.** Un sub-bloque que ya se validó y se subió a `origin/main` no se vuelve a tocar "de paso" al trabajar en el siguiente, aunque el código esté ahí mismo.
- **Hacer push sin validación funcional completa.** Build limpio no es sinónimo de "funciona". El push nunca es el primer lugar donde se descubre que algo no anda.
- **Generar una migración sin haberla descrito primero en un documento de diseño.** El nombre, el tipo de cambio (aditivo vs. destructivo) y el plan de rollback se deciden en la etapa 2, no se improvisan al correr `prisma migrate dev`.
- **Asumir aprobación por silencio o por ambigüedad.** Ante una instrucción que se puede leer de dos formas, se pregunta — no se elige la interpretación que permite avanzar más rápido.
- **Dejar datos de prueba sin limpiar ni documentar como residuo conocido.**
- **`git add -A` o cualquier variante que stagee archivos sin revisar cada uno.**
- **Commitear documentación de proceso (auditorías, diseños, cierres) junto con el código que implementan**, salvo que se pida explícitamente lo contrario.

---

## Criterios para dividir un bloque en sub-bloques

Un bloque se divide cuando se cumple alguno de estos criterios (no hace falta que se cumplan todos):

1. **El alcance combinado no cabe en una sola sesión de auditoría+diseño+implementación+validación sin perder rigor.** La experiencia de este proyecto es que un sub-bloque bien acotado se valida a fondo; uno demasiado grande empieza a validarse "por arriba".
2. **Hay una dependencia técnica real entre dos partes del trabajo** (ej. la extensión de `activo` a `Chofer`/`Vehiculo` en 5.2.a tenía que existir antes de que 5.2.b pudiera validar contra esos catálogos) — cada parte se convierte en su propio sub-bloque con su propio commit, en el orden que la dependencia exige.
3. **Una parte del trabajo requiere una decisión de negocio y la otra no.** No tiene sentido bloquear la parte que ya está lista para implementar esperando una respuesta que solo afecta a otra parte — se separan.
4. **El trabajo mezcla capas de riesgo distintas** (ej. seguridad de control de acceso vs. integridad de datos referenciados, como en 5.1 vs. 5.2) — separarlas permite aprobar y pushear la de menor riesgo sin esperar a que la más compleja esté lista.
5. **Aparece alcance nuevo durante la conversación que no estaba en la auditoría original** (el caso de 5.3.2, que nació de una revisión visual de 5.3.1) — eso siempre se convierte en su propio sub-bloque con su propio diseño, nunca se absorbe silenciosamente dentro del que ya estaba en curso.

## Cuándo corresponde detenerse y consultar antes de seguir

- **Cuando la instrucción del usuario, durante la implementación, contradice o corrige algo que ya estaba en curso o ya aprobado.** La respuesta correcta, probada en este proyecto (corrección del toggle por-fila a toggle único durante 5.3.2), es: dejar de escribir código de inmediato, actualizar el documento de diseño con el ajuste, y esperar la re-aprobación antes de tocar código de nuevo — no "seguir y ya lo corrijo después".
- **Cuando aparece un hallazgo nuevo que no estaba en la auditoría ni en el diseño**, sobre todo si toca datos financieros o `schema.prisma`. Se documenta y se pregunta si se resuelve ahora (como sub-bloque propio) o se deja para más adelante — nunca se decide unilateralmente.
- **Cuando resolver algo requeriría una consulta costosa, romper un patrón arquitectónico ya establecido, o tocar una tabla/módulo que "no es dueño" de esos datos.** El precedente de este proyecto (la pregunta sobre el número de factura en la planilla de liquidación, en 5.3.2) es explicar el impacto primero y esperar confirmación, no implementarlo y descubrir el costo después.
- **Cuando el build o la validación fallan de una forma que sugiere un problema más profundo que el alcance del sub-bloque actual** (ej. el bug de `LiquidacionViaje.viajeId` único, encontrado como hallazgo colateral durante otro diseño) — se señala como hallazgo aparte, con su propio ciclo, en vez de intentar resolverlo de paso dentro del sub-bloque en curso.
- **Cuando no está claro si algo es una decisión técnica o una decisión de negocio.** Los ejemplos ya vividos en SDC (¿AFIP reemplaza o complementa la Factura interna? ¿hay requisito de accesibilidad? ¿hay uso mobile real?) se dejan explícitamente como preguntas abiertas en el documento correspondiente, no se asume una respuesta para poder seguir avanzando.
- **Antes de cualquier push.** Siempre, sin excepción, incluso si el commit ya fue aprobado — el push es su propia autorización.

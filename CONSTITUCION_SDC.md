# Constitución de SDC

Fecha: 2026-07-12. No es una constitución legal ni societaria — es **la constitución del proyecto**: el documento que reúne, sin repetirlas, las reglas de gobierno que quedaron dispersas en meses de trabajo, para que dejen de depender de que alguien las recuerde de memoria o las busque documento por documento.

No reemplaza ningún documento existente. **Es el índice y la ley de jerarquía entre ellos** — dice qué gobierna qué, resuelve la única tensión real que quedó sin resolver entre dos formas de trabajar, y fija un puñado de reglas de gobierno que no vivían formalmente en ningún lado. Todo lo demás se referencia, no se repite.

---

## Artículo 1 — Jerarquía de las leyes del proyecto

Cada documento gobierna un dominio distinto. Ante cualquier duda, se consulta la fuente correspondiente — no se reinterpreta de memoria:

| Dominio | Ley que lo gobierna |
|---|---|
| **Proceso de trabajo** — cómo se audita, diseña, aprueba, implementa, valida, commitea, pushea y cierra cualquier unidad de trabajo | `METODOLOGIA_SDC.md` |
| **Identidad y filosofía del producto** — por qué existe SDC, qué principios nunca se negocian, qué jamás va a hacer | `FASEII_MANIFIESTO_SDC.md` |
| **Reglas técnicas del Motor de Inteligencia** — las 8 reglas obligatorias para cualquier cálculo analítico nuevo | `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md` |
| **Criterio de aceptación de funcionalidad nueva** — el filtro de siete preguntas antes de diseñar cualquier cosa | `FASEIII_PRODUCTIZACION_SDC.md`, sección 9 |
| **Estrategia comercial y de crecimiento** — mercado, modelo de ingresos, plan de ejecución a cinco años | `FASEII_MERCADO_Y_POSICIONAMIENTO.md`, `FASEII_MODELO_DE_NEGOCIO.md`, `FASEIII_PLAN_MAESTRO_2026_2030.md` |
| **Estado real del sistema en un momento dado** | `ESTADO_ACTUAL_POST_BLOQUE7.md` y las Actas de Cierre de cada bloque |
| **Deuda técnica pendiente, priorizada** | `DEUDA_TECNICA.md` |

Esta constitución no vuelve a explicar el contenido de ninguno de estos documentos. Los cita porque hace falta un lugar único donde alguien nuevo (una persona, o una sesión de trabajo sin memoria de las anteriores) pueda encontrar, en cinco minutos, cuál de todos estos documentos leer para resolver una duda concreta.

---

## Artículo 2 — El ciclo de trabajo y sus dos modalidades

`METODOLOGIA_SDC.md` define un flujo de 9 etapas (Auditoría → Diseño → Aprobación → Implementación → Build → Validación → Commit → Push → Cierre), escrito en julio de 2026 sobre la base de los Bloques 3 a 5. Desde el Bloque 7.3.4, el proyecto empezó a operar además con una **modalidad directa** (implementar → compilar → validar → commit → push, sin auditoría ni diseño escritos previos) para trabajo que extiende arquitectura ya aprobada. Estas dos formas de trabajar **no son contradictorias** — son dos velocidades de ejecución del mismo flujo, y esta constitución fija, formalmente, cuándo corresponde cada una:

**Corresponde el flujo completo de 9 etapas cuando:**
- Se abre territorio genuinamente nuevo (un dominio, un módulo o un concepto que el sistema nunca modeló antes).
- El usuario no autorizó explícitamente la modalidad directa para ese trabajo específico.
- Hay una decisión de negocio de fondo sin resolver.

**Corresponde la modalidad directa cuando:**
- El trabajo extiende una arquitectura ya aprobada y validada (el caso repetido de Bloque 7.3.4 en adelante: cada sub-bloque nuevo reutilizaba patrones ya cerrados).
- El usuario autorizó explícitamente esa modalidad para ese ciclo de trabajo.

**Lo que nunca cambia entre una modalidad y la otra — la regla que las reconcilia:**
- **Ninguna línea de código se escribe sin autorización.** En el flujo completo, la autorización es la etapa 3 (Aprobación) sobre un diseño escrito. En la modalidad directa, la autorización es el permiso explícito que el usuario ya dio para ese ciclo de trabajo — pero sigue siendo una autorización explícita, nunca asumida.
- **Ante un conflicto arquitectónico real, la modalidad directa se detiene y, en los hechos, vuelve a las primeras tres etapas del flujo completo** — aunque sea en miniatura (una pregunta acotada en vez de un documento de 100 líneas). Los dos precedentes ya ocurridos (7.3.4: Prisma directo vs. precedente ya aprobado; 7.3.5: cereal/ruta/comisión sin hogar en el Motor) confirman que esto funciona: se preguntó antes de decidir, no se decidió y después se informó.
- **Todo lo que `METODOLOGIA_SDC.md` marca como "qué nunca debe hacerse"** (implementar sin autorización, mezclar bloques, tocar un bloque cerrado sin instrucción, asumir aprobación por silencio, `git add -A`, generar una migración sin haberla descrito antes) **rige igual en ambas modalidades, sin excepción.**

---

## Artículo 3 — Cómo se toman las decisiones

Regla única, ya probada en la práctica varias veces a lo largo del proyecto: **se decide sin preguntar cuando la decisión se resuelve aplicando un principio ya definido en algún documento de esta jerarquía. Se pregunta cuando no.**

Ejemplos ya ocurridos de cada caso:

- **Se decidió sin preguntar:** cómo nombrar una variable, en qué archivo ubicar una función nueva, qué mensaje de error mostrar — decisiones de implementación cubiertas por convenciones ya escritas.
- **Se preguntó antes de decidir:** si el Dashboard Ejecutivo podía consultar Prisma directamente (contradecía un principio del Motor), si convenía extender `RentabilidadService` para cereal/ruta o dejarlo fuera de alcance (afectaba una arquitectura ya cerrada), qué usuario de producción usar para validar (una decisión que no le correspondía resolver a quien implementa).

El detalle completo de cuándo corresponde detenerse está en `METODOLOGIA_SDC.md`, sección "Cuándo corresponde detenerse y consultar antes de seguir" — no se repite acá. La regla de esta constitución es el criterio de una sola frase que resume esa sección: **un principio ya escrito decide por sí solo; una situación nueva no la decide quien implementa.**

---

## Artículo 4 — Qué significa "terminado"

Un sub-bloque, un bloque, o cualquier unidad de trabajo **no está terminada por estar construida** — está terminada cuando se cumplen, en este orden, las condiciones que `METODOLOGIA_SDC.md` fija para su etapa 6 (Validación) y su etapa 9 (Cierre):

1. **Compila limpio**, backend y frontend, siempre los dos.
2. **Se validó de verdad**, no se asumió — con datos reales cuando el cambio toca información financiera, ejercitando el flujo en pantalla, no solo por API.
3. **No dejó residuo sin documentar** — ningún dato de prueba, ningún archivo temporal, ningún cambio a medio terminar.
4. **Quedó registrada en un documento de cierre** que dice qué se hizo, qué se validó, qué deuda real quedó, y qué se dejó explícitamente afuera — no una lista de todo lo que se le podría haber ocurrido a quien lo escribe.
5. **El usuario lo declaró cerrado, explícitamente.** Ninguna sesión de trabajo se declara a sí misma terminada — el cierre es una afirmación del dueño del producto, no una conclusión que el agente saca solo.

La quinta condición es la que más se repitió en la práctica del proyecto (cada Acta de Cierre, de Bloque 6 a Bloque 7, existe porque el usuario la pidió y la aprobó, no porque el trabajo "pareciera" terminado) y es, de las cinco, la única que no admite excepción bajo ninguna modalidad de trabajo.

---

## Artículo 5 — Cuándo se rechaza una funcionalidad

El criterio completo — siete preguntas obligatorias, en orden, antes de que cualquier funcionalidad nueva pase a diseño — vive en `FASEIII_PRODUCTIZACION_SDC.md`, sección 9, y no se repite acá.

Esta constitución fija el principio que subyace a esas siete preguntas, porque es el que debe sobrevivir aunque el filtro específico cambie de forma con el tiempo: **el beneficio de construir algo nuevo se demuestra antes de construirlo, no después.** Si nadie puede justificar con claridad a cuántos clientes sirve, qué fricción real elimina, o quién la va a poder sostener cuando el proyecto crezca, la respuesta por default es no construirla — no es una falta de ambición, es la misma disciplina que ya se aplicó, con éxito verificado, al descartar explícitamente cuatro candidatos de mejora durante la consolidación del Motor de Inteligencia (7.3.4.1).

---

## Artículo 6 — Cómo se aprueba un cambio (disciplina de control de versiones)

`METODOLOGIA_SDC.md` ya fija las reglas centrales (nunca `git add -A`, nunca commitear sin build y validación previos, nunca pushear sin autorización propia y separada del commit). Esta constitución agrega la regla que se probó en la práctica y que no estaba escrita en ningún lado hasta ahora:

**Cuando dos unidades de trabajo distintas terminan tocando el mismo archivo, se separan con cuidado en el historial — nunca se mezclan en un mismo commit solo porque sería más rápido.** El precedente exacto: durante el cierre de Bloque 7.3, la consolidación del Motor (7.3.4.1) y la implementación de Benchmarking (7.3.5) modificaron el mismo archivo (`rentabilidad.service.ts`). En vez de commitear todo junto, se reconstruyó el estado intermedio del archivo, se separó el staging en dos pasos, y se generaron dos commits distintos — cada uno auditable por separado, cada uno revertible por separado. Esa es la práctica esperada cada vez que la situación se repita, no una solución puntual de esa vez.

**Aprobar un commit no aprueba el push, y aprobar un push una vez no aprueba el siguiente.** Cada autorización de escritura contra el repositorio (stage, commit, push) es específica de ese momento y de ese alcance — nunca se generaliza hacia adelante ni hacia otro conjunto de archivos, aunque el pedido se parezca al anterior.

---

## Artículo 7 — Principios que nunca se negocian

Lista corta, deliberadamente — el detalle completo de cada uno vive en su documento fuente, citado entre paréntesis. Esta lista existe para que, ante una decisión bajo presión (comercial, de tiempo, o de un cliente insistiendo), haya un lugar único y corto para verificar si esa decisión está permitida:

1. **Ninguna línea de código se escribe sin autorización explícita** — nunca asumida por silencio, nunca inferida por ambigüedad. (`METODOLOGIA_SDC.md`)
2. **La verdad está en los datos, no en quien los interpreta** — ningún número se muestra distinto de lo que realmente pasó. (`FASEII_MANIFIESTO_SDC.md`, principio 1)
3. **Un hecho se registra una sola vez** — si dos cálculos necesitan la misma regla, se extrae antes de duplicarse una segunda vez, no después. (`FASEII_MANIFIESTO_SDC.md`, principio 2; `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`, regla 8)
4. **Ninguna cifra se muestra sin poder explicar de dónde salió.** (`FASEII_MANIFIESTO_SDC.md`, principio 3)
5. **El sistema informa, la persona decide** — nunca al revés. (`FASEII_MANIFIESTO_SDC.md`, principio 4)
6. **No se esconde la realidad incómoda** — una alerta crítica o un margen negativo se muestran con la misma claridad que una buena noticia. (`FASEII_MANIFIESTO_SDC.md`, principio 7)
7. **Toda excepción a una regla de negocio queda trazada** — nada se pierde en silencio. (`FASEII_MANIFIESTO_SDC.md`, principio 11)
8. **No se construye por moda, ni para un solo cliente disfrazado de funcionalidad general**, sin pasar antes por el filtro del Artículo 5.
9. **No se sacrifica la confianza ya ganada por una función que todavía no demostró la suya.** (`FASEII_MANIFIESTO_SDC.md`, principio 13)
10. **Nunca se pushea sin build y validación funcional previos, completos y reales — no asumidos.** (`METODOLOGIA_SDC.md`, etapas 5-6)

Ningún principio de esta lista se relaja "por esta vez" — si una situación nueva parece justificar una excepción, la situación se documenta y se pregunta (Artículo 3); el principio no se toca.

---

## Artículo 8 — Cómo se modifica esta constitución

Esta constitución describe lo que ya se probó en la práctica — igual que `METODOLOGIA_SDC.md` describió, al escribirse, un flujo que ya venía funcionando desde los Bloques 3 a 5. Por lo tanto, se actualiza con el mismo criterio con el que se actualizó ese documento: **cuando la práctica real del proyecto cambia de forma sostenida (no una vez, un patrón que se repite), la constitución se actualiza para reflejarlo — no se actualiza por anticipado, especulando cómo se querría trabajar en el futuro.**

Ninguna sección de esta constitución se modifica dentro de una sesión de trabajo que además está ejecutando otro tipo de tarea — un cambio a esta constitución es, en sí mismo, su propia unidad de trabajo, con su propia revisión explícita antes de darse por incorporado.

---

**Fin de la constitución. No se implementó nada, no se modificó ningún otro documento, no se hizo commit ni push — queda a la espera de revisión.**

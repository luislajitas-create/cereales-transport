# Fase III — Etapa 2: Plan Director de Productización de SDC

## Del sistema exitoso al producto escalable

Fecha: 2026-07-12. Documento estratégico puro — no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit ni push, no se abrió ningún bloque funcional. Construye sobre los cinco documentos de Fase II/III ya aprobados — no repite su contenido.

**La pregunta que responde este documento, y solo esta:** ¿qué tiene que cambiar en SDC para que deje de ser un software exitoso para un cliente y pueda convertirse en un producto implementable en cualquier empresa del mismo rubro?

**Este documento está pensado para convertirse en el criterio rector de todo futuro Bloque 8** — no lo abre, no lo diseña, pero establece la vara contra la que cualquier trabajo de ese bloque debería medirse.

---

## 1. Diagnóstico

**Ya es, genuinamente, un producto** — no fue construido para las idiosincrasias de un cliente en particular, sino para el negocio en abstracto:

- El núcleo de reglas de negocio: qué hace que un viaje esté completo, cómo se calcula un margen, qué es una factura vencida, qué dispara cada tipo de alerta. Ninguna de estas definiciones fue diseñada pensando en un cliente específico — son la descripción genérica de cómo funciona cualquier negocio de intermediación de transporte.
- El conjunto de roles y lo que cada uno puede ver y hacer.
- El Centro de Inteligencia completo — rentabilidad, cartera, alertas, comparación entre períodos — es una capacidad aplicable a cualquier operación del mismo tipo, no un reporte hecho a medida.
- La estructura de datos maestros (clientes, transportistas, choferes, vehículos, cereales, ubicaciones) — es el vocabulario genérico del rubro, no una lista fija de nombres propios de un cliente.

**Sigue siendo, hoy, una solución específica para un cliente:**

- **Todo lo que hoy requiere intervención técnica directa para operar** — dar de alta un usuario nuevo, por ejemplo, es hoy literalmente un script temporal corrido a mano contra la base de datos. No es una hipótesis: ocurrió durante esta misma serie de conversaciones. Es la evidencia más concreta y más reciente de que, en este punto, SDC sigue siendo "software operado a mano para un cliente en particular".
- **La infraestructura de la instalación** — hoy existe una sola instancia, para un solo cliente, sin ninguna separación entre "el producto" y "esta instalación específica".
- **Los valores de calibración** (umbrales de alertas) — están fijados con criterio técnico único, no ajustados ni ajustables según la realidad particular de cada negocio.
- **El proceso de incorporación de un cliente nuevo** — no existe como proceso: existe como conocimiento en la cabeza de quien construyó el sistema (desarrollado en la sección 2).
- **La relación comercial en sí** — no hay todavía un contrato, una tarifa, un proceso de facturación al cliente por el uso del sistema. El modelo de ingresos está diseñado (`FASEII_MODELO_DE_NEGOCIO.md`), pero no ejecutado.

---

## 2. Dependencias del conocimiento

**Qué sigue dependiendo del fundador, sin estar todavía en el producto:**

- Cómo instalar y poner en marcha una instalación nueva para un cliente distinto.
- Cómo dar de alta al primer usuario administrador de una instalación nueva — hoy ni siquiera existe un mecanismo estándar para esto en la instalación ya existente.
- Cómo ajustar los catálogos iniciales (cereales, ubicaciones, tipos de gasto) al negocio específico de un cliente nuevo.
- Qué preguntas hacerle a un cliente nuevo para entender su negocio antes de configurar nada — ese conocimiento de "cómo entrevistar a un cliente para levantar sus propias reglas" no está escrito en ningún lado, vive en la experiencia de haberlo hecho una vez.
- Cómo diagnosticar un problema cuando algo no funciona como se espera — hoy es, enteramente, experiencia acumulada de quien construyó el sistema, no un procedimiento documentado.
- Qué significa, en términos de negocio, cada umbral de alerta, y cómo debería ajustarse para una operación distinta a la actual.

**Qué ya vive dentro del producto, sin depender de que el fundador esté presente:**

- Las reglas de cálculo (margen, aging, severidad) — corren solas, no necesitan que nadie las explique cada vez que se usan.
- La separación de qué ve cada rol dentro del sistema.
- La lógica de qué hace que un viaje esté completo o incompleto.

**Qué falta transformar en conocimiento del sistema — la brecha real, no una lista de deseos:**

- Un proceso de alta de cliente nuevo, documentado y repetible — hoy no existe ni siquiera como documento interno.
- Un mecanismo real de gestión de usuarios, que no dependa de tocar la base de datos directamente.
- Una forma de configurar el catálogo inicial de un cliente nuevo sin intervención técnica.
- Guías que expliquen qué significa cada alerta y cuándo tiene sentido ajustar su umbral, escritas para quien usa el sistema — no para quien lo programó.

---

## 3. Onboarding

Sin hablar de pantallas — hablando del proceso completo que debería existir para implementar SDC desde cero en una empresa que hoy no lo usa:

**Descubrimiento.** Entender el negocio del cliente nuevo antes de tocar nada del sistema: cuántos transportistas maneja habitualmente, cómo calcula hoy sus comisiones, con qué frecuencia factura, qué tan formal es su proceso actual. Hoy esto no tiene ningún cuestionario ni checklist estandarizado — se resolvió la primera vez por conocimiento directo del fundador sobre ese negocio en particular.

**Configuración inicial.** Cargar los catálogos base propios de ese cliente — sus clientes, sus transportistas, los cereales y ubicaciones que efectivamente usa. Hoy es posible hacerlo desde la interfaz ya existente, pero sin ningún asistente ni plantilla que acelere migrar datos que el cliente ya tiene en otro lado (típicamente, su propia planilla).

**Alta de usuarios y roles.** Definir quién, dentro de la empresa del cliente, va a usar el sistema y con qué rol. Hoy, como ya quedó demostrado en esta misma conversación, esto no tiene mecanismo propio — depende de intervención técnica directa.

**Convivencia validada.** Un período corto donde el cliente usa SDC en paralelo con su proceso actual, comparando resultados antes de apagar lo anterior — reduce el riesgo de una transición abrupta y de perder confianza por un número que no coincide sin explicación. Hoy no existe ningún protocolo definido para este paso.

**Puesta en marcha real.** El cliente empieza a operar completamente en SDC, y se retira el acompañamiento directo y constante.

**Seguimiento posterior.** A las semanas de la puesta en marcha, confirmar si el cliente efectivamente adoptó el sistema como se esperaba — no si tiene acceso, si lo usa de verdad. Es la función que se desarrolla en la sección 7, y hoy tampoco existe como proceso.

---

## 4. Configuración

**Qué debería poder configurarse sin programar:**

- Los catálogos maestros propios de cada cliente — en gran parte ya es así hoy vía la interfaz; la brecha real está en la carga inicial masiva, no en la edición del día a día.
- Los usuarios y roles de cada cliente — hoy no es así; es la brecha más urgente identificada en la sección 2.
- Los umbrales de alerta y severidad — hoy están fijados a nivel de código, deberían poder ajustarse por cliente sin intervención técnica, porque lo que cuenta como "una deuda preocupante" varía de un negocio a otro.
- Qué categorías de alerta le interesan a cada rol dentro de la empresa de cada cliente.

**Qué jamás debería configurarse — y por qué:**

- **Las fórmulas de cálculo en sí** (cómo se calcula un margen, qué hace que una factura esté vencida). Es, literalmente, el conocimiento de negocio que constituye la ventaja competitiva central identificada en `FASEII_MERCADO_Y_POSICIONAMIENTO.md`. Si se vuelve configurable libremente por cliente, se pierde la garantía de que un número de SDC siempre significa lo mismo — que es, textualmente, uno de los principios del Manifiesto.
- **Los principios de integridad financiera** (que un viaje ya facturado no se pueda editar, que una cobranza no pueda superar el saldo de una factura). Son garantías estructurales del producto, no preferencias de configuración — permitir que un cliente las desactive rompería la razón de ser de SDC, no la personalizaría.
- **Los roles base y su semántica.** Qué es un `ADMINISTRADOR`, qué ve `GERENCIA`, son parte del lenguaje común del producto. Si cada cliente define sus propios roles desde cero, se pierde la posibilidad de un manual, una capacitación o un soporte estandarizado — cada cliente volvería a ser, en la práctica, una instalación distinta.

---

## 5. Estandarización

**Obligatoriamente igual para todos los clientes:**

- La definición de cada concepto de negocio central (viaje completo, factura vencida, margen, severidad de una alerta).
- El catálogo de roles disponibles y qué puede hacer cada uno, en términos generales.
- El ciclo de vida de un viaje y las guardas que lo protegen.

**Puede variar entre clientes:**

- Los datos concretos de cada catálogo (qué cereales, qué ubicaciones, qué clientes y transportistas propios).
- Los valores numéricos de calibración (umbrales de alerta).
- Qué reportes o exportaciones usa más un cliente que otro.
- El volumen y la cadencia de uso.

**El límite entre parametrización y personalización, explicado:** parametrizar es ajustar un número o una lista de valores dentro de una regla que sigue siendo la misma para todos los clientes. Personalizar es cambiar la regla en sí para un cliente en particular. La primera escala — la segunda no.

**Recomendación explícita:** cualquier pedido de un cliente que empiece con "en mi caso, esto debería funcionar distinto" tiene que pasar, sin excepción, por el filtro de la sección 9 antes de aceptarse. Ese tipo de pedido es, casi siempre, el punto exacto donde un producto empieza a volver a convertirse en un proyecto a medida — que es, precisamente, el estado del que este documento busca salir.

---

## 6. Implementación

**Desde la primera reunión hasta la puesta en marcha, con la información, los riesgos y las validaciones de cada etapa:**

**Primera reunión.** Información necesaria: volumen mensual de viajes, cantidad de transportistas/choferes propios o tercerizados, cómo calcula hoy sus comisiones, qué tan formalizada está su facturación actual. **Riesgo:** subestimar cuánto del proceso actual del cliente es informal o no está siquiera escrito en ningún lado — si el cliente no puede explicar sus propias reglas con claridad, la implementación va a tardar más de lo previsto, porque antes de configurar el sistema hay que ayudarlo a formalizar su propio negocio.

**Configuración inicial.** Cargar catálogos, dar de alta usuarios, calibrar umbrales según el tamaño y el perfil del cliente. **Riesgo:** migrar datos incompletos o mal traducidos desde el proceso anterior del cliente. **Validación necesaria:** revisar la carga inicial contra una muestra real de la operación del cliente antes de dar por cerrada esta etapa.

**Convivencia validada.** Usar SDC en paralelo con el proceso anterior, durante un período corto y acotado. **Validación necesaria:** que los números que da SDC coincidan, o se puedan explicar claramente si no coinciden, contra lo que el cliente ya sabía de su propio negocio — la misma disciplina de validación que ya se aplicó puertas adentro en cada bloque de este proyecto, ahora aplicada hacia un cliente externo.

**Puesta en marcha real.** El cliente apaga su proceso anterior y opera completamente en SDC. **Riesgo:** hacer este corte antes de que el cliente confíe genuinamente en los números que ve — un corte prematuro genera desconfianza, no adopción, y es más difícil de revertir después que de posponer un poco.

**Seguimiento posterior.** Confirmar, en las primeras semanas, que el cliente usa el sistema como se pensó — no solo que tiene una cuenta activa.

---

## 7. Customer Success

**Indicadores de adopción real** (más allá de "tiene una cuenta"):

- Frecuencia real de uso de cada módulo por los roles que deberían usarlo — ¿Gerencia entra a mirar el Dashboard Ejecutivo con regularidad, o nunca volvió a abrirlo después del onboarding?
- Si el cliente dejó de usar su proceso anterior — mientras la planilla vieja siga viva "por las dudas", la adopción no está completa, sin importar lo que digan las cifras de acceso.
- **La señal más fuerte de todas:** si el cliente empieza a tomar decisiones citando explícitamente un dato de SDC — por ejemplo, dejar de trabajar con un transportista porque el margen mostrado da negativo. Ahí el sistema pasó de ser una obligación a ser una fuente de verdad.
- Si las personas que deberían usarlo lo usan sin que alguien se los tenga que recordar.

**Indicadores de riesgo de abandono:**

- Caída sostenida en la frecuencia de uso después del entusiasmo inicial del onboarding.
- Preguntas de soporte que se repiten sobre lo mismo — señal de que el onboarding no llegó bien, no de que el cliente sea difícil.
- Un cliente que vuelve a pedir un reporte "aparte" en una planilla — señal de que todavía no confía en lo que ve dentro del sistema.
- Roles que nunca volvieron a entrar al sistema después del alta inicial.
- Una renovación que se demora o se negocia con fricción — la señal comercial más tardía y más cara de todas, porque para cuando aparece, ya se perdió el tiempo en el que se podía corregir el problema de fondo.

---

## 8. Escalabilidad operativa

**A 10 clientes.** El fundador todavía puede sostener personalmente el onboarding y el soporte de cada uno — pero ya hace falta, como mínimo, un documento de proceso de implementación escrito, aunque sea de uso interno, para no reinventar el orden de los pasos con cada cliente nuevo.

**A 50 clientes.** Ya no alcanza con la memoria ni con un documento interno de uso propio. Hace falta material de capacitación que el cliente pueda usar sin depender de una explicación personalizada cada vez, un canal de soporte con algún tipo de registro (no todo resuelto de forma informal), y, con alta probabilidad, una primera persona dedicada a implementación y soporte, separada de quien construye el producto.

**A 200 clientes.** Hace falta una función de Customer Success formal, no informal — alguien cuyo trabajo específico sea monitorear los indicadores de la sección 7 y actuar antes de que un cliente en riesgo llegue al punto de no renovar. También hace falta que el proceso de implementación esté, en su mayor parte, autoservido por el propio cliente (con acompañamiento, no con dependencia total) — de lo contrario, cada cliente nuevo sigue consumiendo tiempo humano en proporción directa a su cantidad, y el negocio deja de escalar aunque la cifra de clientes siga creciendo.

---

## 9. Criterios para aceptar nuevas funcionalidades

Un filtro de decisión real — siete preguntas, en orden, obligatorias antes de que cualquier funcionalidad nueva pase siquiera a diseño:

1. **¿A cuántos clientes sirve, no a cuántos les gustaría?** Si la respuesta es "a uno", por default no se construye — salvo que ese cliente sea, deliberadamente, el caso de validación de un patrón que se espera repetir en otros.
2. **¿Rompe alguno de los quince principios del Manifiesto?** Si la respuesta es sí, no se construye — sin excepción, sin importar cuánto valor comercial parezca tener en el momento.
3. **¿Cuánta complejidad nueva agrega, contra cuánta fricción real elimina?** Si agrega más de la que elimina, se rechaza por default.
4. **¿Genera una ventaja difícil de copiar, o es una función fácil de igualar?** No descalifica por sí sola — hay funciones necesarias aunque sean fáciles de copiar — pero cambia su prioridad relativa frente a otras candidatas.
5. **¿Se puede mantener y explicar dentro de cinco años, o responde a una moda de este momento?**
6. **¿Puede resolverse como parametrización dentro de una regla ya existente, o exige una regla nueva y distinta por cliente?** Si exige lo segundo, es personalización disfrazada de funcionalidad — vuelve directamente a la sección 5.
7. **¿Quién la va a soportar, y con qué costo, cuando haya 50 o 200 clientes usándola?** Una función que nadie puede sostener a esa escala no es una función — es una promesa que se va a terminar rompiendo.

Solo una funcionalidad que atraviesa las siete preguntas sin una respuesta descalificante debería avanzar a diseño técnico.

---

## 10. Conclusión

**¿Cuándo podremos decir que SDC dejó de ser un sistema desarrollado para un cliente y se convirtió, definitivamente, en un producto?**

Cuando un cliente nuevo, elegido dentro del perfil ideal ya definido en `FASEII_MODELO_DE_NEGOCIO.md`, pueda implementarse, adoptar el sistema y renovar su suscripción **sin que el fundador haya tenido que estar personalmente involucrado en ningún paso crítico del proceso** — ni la instalación, ni el alta de usuarios, ni la resolución de sus primeras dudas.

No antes. La prueba no es técnica ni es una fecha en un calendario: es, literalmente, que el negocio deje de necesitar a una persona específica para poder repetirse. Todo lo que este documento describe — el onboarding, la configuración, la estandarización, el filtro de nuevas funcionalidades — no es una lista de mejoras deseables. Es, en conjunto, la definición operativa de esa única condición.

---

**Fin del análisis. No se implementó nada, no se abrió ningún bloque nuevo — queda a la espera de revisión.**

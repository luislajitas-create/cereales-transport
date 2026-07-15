# Decisiones del Product Owner — Grupo Económico

Fecha: 2026-07-15. Registra exclusivamente las 5 decisiones de negocio tomadas sobre la sección 13 de `AUDITORIA_FUNCIONAL_GRUPO_ECONOMICO_RONDA2.md`, aprobadas por el dueño del producto. **No contiene diseño técnico** — ningún modelo, tabla, endpoint ni migración. Es la base sobre la que se apoyará el diseño técnico de una futura etapa, todavía no iniciada.

---

## Decisión 1 — Qué recursos se comparten dentro del grupo

**Pregunta:** de todo lo que hoy vive encerrado dentro de cada empresa, ¿qué debería reconocerse como la misma identidad real entre las empresas del grupo?

**Decisión:** se comparte únicamente la identidad de **Choferes** (y, si el mismo caso real les aplica, Transportistas y Vehículos). Clientes, Productores, Cereales, Ubicaciones y Tipos de gasto siguen exactamente como hoy — cada empresa los carga y administra por separado.

**Alcance:** imprescindible para esta primera versión.

**Riesgo aceptado:** si en el futuro aparece la necesidad de compartir Clientes, catálogos u otro recurso, va a hacer falta una ronda de trabajo aparte — no queda resuelto de antemano.

**Evolución postergada:** compartir Clientes/Productores; compartir Cereales/Ubicaciones/Tipos de gasto.

---

## Decisión 2 — Compensación de saldos entre empresas

**Pregunta:** cuando un chofer le quedó debiendo a una empresa del grupo (porque le anticiparon más de lo que le correspondía) y otra empresa del grupo le debe plata a ese mismo chofer, ¿puede el sistema descontar automáticamente lo uno de lo otro en un pago consolidado?

**Decisión:** **nunca en forma automática.** Si en algún momento hace falta compensar un saldo así, tiene que decidirse explícitamente y esa decisión queda registrada — el sistema nunca mueve, por sí solo, la plata de una empresa para tapar el saldo de otra.

**Alcance:** imprescindible para esta primera versión.

**Riesgo aceptado:** si el caso de "sobró anticipo en una empresa" resulta frecuente en la operación real, va a generar trabajo manual repetido hasta que se decida avanzar a una compensación asistida.

**Evolución postergada:** compensación automática con registro explícito de deuda entre empresas del grupo.

---

## Decisión 3 — Quién opera más de una empresa del grupo

**Pregunta:** ¿quién, específicamente, necesita ver u operar sobre más de una empresa del grupo al mismo tiempo?

**Decisión:** **todo el equipo administrativo de ambas empresas** puede ver y operar sobre el grupo completo — no se acota a una o dos personas puntuales.

**Alcance:** más amplio que el mínimo estrictamente necesario para resolver el caso real (el pago consolidado).

**Riesgo aceptado:** mayor superficie de acceso — más personas del equipo administrativo con visibilidad completa de ambas empresas de la que el caso real, por sí solo, exigiría. Es una decisión tomada con conocimiento de ese costo, no una omisión.

**Evolución postergada:** ninguna — se optó directamente por el alcance más amplio entre las alternativas planteadas.

---

## Decisión 4 — Operaciones comerciales entre empresas del grupo

**Pregunta:** ¿una empresa del grupo le vende, le factura o le presta algo a la otra, hoy o en un futuro previsible?

**Decisión:** **hoy no ocurre, pero podría ocurrir en el futuro** (por ejemplo, un préstamo puntual entre las empresas). Queda documentado como un supuesto conocido del negocio, no como una garantía permanente.

**Alcance:** se documenta el supuesto; no se toma ninguna acción adicional en esta primera versión.

**Riesgo aceptado:** si esta situación llegara a ocurrir sin que se revise a tiempo, cualquier vista futura que sume los números de ambas empresas como si fueran una sola podría mostrar un total inflado, sin que nadie lo note.

**Evolución postergada:** el mecanismo que ajuste o elimine esas operaciones internas antes de sumar los números del grupo, si el supuesto llegara a dejar de cumplirse.

---

## Decisión 5 — Comprobante entregado al chofer

**Pregunta:** cuando a un chofer se le paga con una única transferencia que cubre lo que le deben varias empresas del grupo, ¿qué documento recibe como constancia?

**Decisión:** **un único comprobante consolidado**, con el desglose de lo que corresponde a cada empresa incluido adentro — no un comprobante por empresa, ni los comprobantes actuales sin ningún documento adicional.

**Alcance:** conveniente, puede esperar — no es necesario para que el pago consolidado en sí empiece a funcionar; puede construirse en una etapa posterior sin bloquear el resto.

**Riesgo aceptado:** ninguno relevante — el único costo es que el comprobante final tarde un poco más en estar disponible que la capacidad de pago consolidado en sí.

**Evolución postergada:** la construcción del comprobante consolidado en sí, una vez que el pago consolidado ya esté funcionando y validado.

---

## Resumen para la próxima etapa

Las cinco decisiones de arriba quedan aprobadas como base para el futuro diseño técnico de Grupo Económico. Ninguna de ellas define todavía cómo se construye — solo qué debe cumplir el diseño cuando llegue esa etapa, que **no comenzó todavía**.

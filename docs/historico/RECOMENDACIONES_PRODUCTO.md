# Recomendaciones de producto — mirada de Product Manager Senior

Fecha: 2026-07-09. Conclusiones basadas en las auditorías de producto/UX/negocio realizadas durante los Bloques 3-5 (`BLOQUE5_AUDITORIA_PRODUCTO.md`, `BLOQUE5.3_AUDITORIA_UX.md`, `QA_INFORME_FINAL.md`), no en ideas nuevas. No se habla de código.

---

## ¿Qué tan cerca está SDC de una versión profesional?

Más cerca de lo que el estado del backlog sugiere a primera vista, y más lejos de lo que la pantalla de Liquidaciones sugiere hoy.

El sistema ya resuelve el problema de negocio central — llevar viajes, anticipos, liquidaciones y facturación de punta a punta, con los números cuadrando — y eso es la parte difícil. Lo que falta para que se sienta "profesional" de punta a punta no es una funcionalidad nueva: es que el nivel de terminación que ya existe en un módulo (Liquidaciones, después de 5.3.1/5.3.2) se replique en el resto. Hoy SDC tiene un módulo de nivel profesional y siete que están un escalón por debajo. Esa asimetría es, en sí misma, el hallazgo de producto más importante de este cierre.

## ¿Qué cosas hoy generan mayor confianza?

- **La planilla de Liquidación (5.3.2).** Es el único punto del sistema donde un usuario no técnico entiende el resultado de una operación financiera en menos de 10 segundos, con trazabilidad hasta el número de factura. Es el estándar contra el que debería medirse el resto.
- **Las confirmaciones y el feedback de éxito/error en Liquidaciones/Facturas/Anticipos (5.3.1).** Antes de esto, anular una liquidación pagada era un clic sin vuelta atrás. Hoy ese mismo clic pide confirmación explícita, y el usuario sabe si su acción funcionó o no sin adivinar.
- **Que el sistema ya haya encontrado y corregido bugs financieros reales antes de que un cliente los viviera** (contaminación cruzada de anticipos, viajes editables tras facturar, cobranzas sin tope). Eso es exactamente el tipo de confianza que un cliente que va a poner dinero real en el sistema necesita ver documentado, no solo prometido.

## ¿Qué cosas todavía hacen que el sistema se sienta "en desarrollo"?

- **Inconsistencia entre pantallas que hacen lo mismo.** `BLOQUE5.3_AUDITORIA_UX.md` lo dice de forma precisa: no es falta de diseño, es falta de aplicación pareja de un diseño que ya existe. Confirmar una factura no tiene el mismo cuidado que confirmar una liquidación. Eso es lo primero que nota cualquiera que use más de una pantalla en la misma sesión.
- **Funcionalidad que el backend ya tiene y la interfaz no expone.** Editar un viaje con un dato mal cargado, anular una cobranza puntual, editar un cliente — todo esto ya funciona "por atrás" y no tiene ningún botón. Desde afuera, eso no se lee como "todavía no lo hicimos": se lee como "el sistema no lo puede hacer", que es una impresión peor de la que la realidad justifica.
- **Cero feedback de carga en la mitad de las pantallas.** Cuando una tabla tarda o falla en cargar, hoy se ve exactamente igual que si no hubiera datos. Es el tipo de detalle que un usuario nuevo interpreta como "el sistema no anduvo", incluso cuando el problema fue transitorio.
- **Nada de esto es un problema de arquitectura ni de alcance de producto** — es literalmente el mismo patrón que ya se resolvió en Liquidaciones, sin replicar todavía en el resto.

## Las próximas tres mejoras que más valor le darían al usuario

1. **Llevar el patrón de 5.3.1 (confirmación + doble-submit + feedback) a Facturas y Anticipos con el mismo nivel de cuidado que Liquidaciones ya tiene.** Es el gap más visible hoy porque son módulos hermanos que un mismo usuario (Facturación, Gerencia) ve en la misma sesión de trabajo — la diferencia de pulido entre ellos es más notoria que en cualquier otra combinación de pantallas.
2. **Exponer la edición de viajes y catálogos que el backend ya soporta.** Es la relación de esfuerzo/valor más favorable de todo el backlog: cero riesgo (no hay lógica nueva que construir, solo un formulario), y hoy cada corrección de un dato mal cargado depende de pedirle a alguien con acceso a la base que lo arregle a mano — eso es una fricción operativa real y visible todos los días, no una mejora cosmética.
3. **Estados de carga y feedback de error consistentes en toda la aplicación.** Es barato (el patrón correcto ya existe en varias pantallas), y es transversal — mejora la percepción de calidad de cada pantalla del sistema al mismo tiempo, no solo una.

Ninguna de las tres requiere una decisión de negocio previa ni una migración de datos — son, en ese sentido, las de menor fricción para arrancar mañana mismo.

## Si mañana tuvieras que mostrar SDC a un cliente importante, ¿qué mejorarías antes?

Le mostraría Liquidaciones primero — es la parte del sistema que ya está lista para esa conversación. El riesgo real está en lo que pase después de esa primera pantalla: si el cliente pide ver Facturas o Anticipos con la misma atención, la diferencia de terminación se nota de inmediato, y esa clase de inconsistencia dentro de la misma demo genera más dudas que si todo el sistema estuviera parejo en un nivel más simple.

Antes de esa demo, en orden de lo que más cambiaría la primera impresión:

1. **Parejar Facturas y Anticipos al nivel de Liquidaciones** (confirmaciones, feedback, sin doble-submit) — es lo primero que un cliente exploraría después de ver Liquidaciones, y es exactamente donde hoy se nota el salto de calidad hacia abajo.
2. **Eliminar los "callejones sin salida" visibles** — un botón de edición ausente, o una pantalla que se queda en blanco sin explicación ante un error, son el tipo de cosa que un cliente encuentra por accidente en cinco minutos de explorar por su cuenta, no algo que se pueda evitar dirigiendo la demo con cuidado.
3. **No mostraría el sistema desde un teléfono o tablet.** Hoy no está pensado para eso, y no hace falta que lo esté para esta conversación — pero vale la pena decirlo explícitamente antes de que sea el cliente quien lo descubra abriendo el link desde su celular en la reunión.

Ninguna de estas tres es una sorpresa nueva: son, en el mismo orden, las tres primeras recomendaciones de la sección anterior. Es la misma deuda vista desde dos ángulos distintos — mejora incremental de producto y riesgo de una demo puntual — y eso es, en sí mismo, la señal de que es donde conviene invertir primero.

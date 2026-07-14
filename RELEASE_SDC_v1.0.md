# SDC v1.0 — Documento de Producto

**¿Qué es exactamente SDC v1.0 y qué puede esperar un cliente que adquiera esta versión?**

Este documento responde esa única pregunta. No es una auditoría técnica ni un documento de diseño — es la certificación de producto de la primera versión de SDC (Sistema Dador de Carga de Cereales), escrita para poder mostrarse a un cliente, un socio comercial o cualquier persona que necesite entender qué es SDC hoy, sin necesidad de leer código ni documentación técnica.

---

## 1. Objetivo de la versión

SDC v1.0 certifica el cierre de la etapa de productización iniciada tras completar el núcleo transaccional y el motor analítico del sistema: convertir un sistema que ya operaba de forma correcta para un cliente en un producto que puede operar, de forma segura y aislada, para más de una organización sobre la misma infraestructura — con la administración básica de cada organización resuelta desde la propia aplicación, no desde intervención técnica manual.

En una frase: SDC v1.0 es la primera versión de SDC en la que, una vez dado de alta el primer administrador de una organización nueva, esa organización puede administrarse por completo —usuarios, datos institucionales, operación diaria— sin que el equipo que la construyó vuelva a tocar la base de datos.

---

## 2. Estado del producto

SDC v1.0 es un sistema en producción, en uso real, con:
- Un núcleo transaccional completo (gestión de viajes de transporte de cereales, catálogos, facturación, cobranzas, liquidaciones y anticipos), operado activamente por al menos un cliente real.
- Un motor de inteligencia analítica propio (rentabilidad, cobranzas, alertas, comparativas), separado del núcleo transaccional y sin conocimiento propio de qué organización es cada dato.
- Una arquitectura de datos multiempresa real y verificada, no aspiracional: dos organizaciones distintas conviven hoy sobre la misma base de datos sin compartir, mezclar ni filtrar información entre sí, bajo ninguna condición probada.
- Un conjunto de funciones administrativas (perfil propio, datos de la organización, alta y gestión de usuarios, recuperación de acceso, invitaciones, auditoría) accesibles íntegramente desde la interfaz web, sin necesidad de scripts ni acceso a la base.

SDC v1.0 **no es** todavía un producto de autoservicio completo: dar de alta una organización nueva sigue siendo una tarea que realiza el equipo de SDC, no el propio cliente. Esa distinción se detalla en la sección 3.

---

## 3. Capacidades incluidas

**Operación de transporte:**
- Registro y seguimiento de viajes, con ciclo completo de estados (desde pendiente hasta descargado, incluyendo cancelación).
- Catálogos propios de cada organización: clientes, transportistas, choferes, vehículos, cereales, ubicaciones y tipos de gasto.
- Anticipos de gastos a choferes/transportistas, con seguimiento de lo liquidado y lo pendiente.
- Liquidaciones a transportistas y choferes, con cálculo de comisiones y planilla de resultado.
- Facturación a clientes, con conciliación y registro de cobranzas (totales y parciales).
- Exportación a Excel y PDF de los documentos que operativamente lo requieren (facturas, liquidaciones, anticipos).

**Centro de Inteligencia:**
- Dashboard operativo y Dashboard Ejecutivo, con indicadores de la operación del mes.
- Rentabilidad por viaje, cliente y transportista.
- Aging de cobranzas (antigüedad de saldos pendientes).
- Centro de Alertas (vencimientos, concentración de riesgo, viajes estancados).
- Benchmarking y tendencias entre períodos.

**Multiempresa:**
- Cada organización opera sobre sus propios datos, sin ninguna posibilidad verificada de ver, editar, relacionar o agregar datos de otra organización — incluso cuando dos organizaciones tienen valores de negocio idénticos (mismo CUIT, mismo número de factura, mismo nombre de cliente).
- El Centro de Inteligencia respeta el mismo aislamiento sin tener que saberlo: nunca agrega datos entre organizaciones.

**Administración (autoservicio dentro de cada organización):**
- Cada usuario administra su propio perfil (nombre, contraseña) sin depender de un administrador.
- Cada `ADMINISTRADOR` administra los datos institucionales de su propia organización (razón social, CUIT, domicilio, contacto, zona horaria, moneda).
- Cada `ADMINISTRADOR` puede dar de alta usuarios de dos formas (alta directa con enlace de activación, o invitación para que la persona defina su propia contraseña al aceptar), editarlos, activarlos, desactivarlos y restablecerles el acceso — todo desde la interfaz. La entrega automática de ese enlace por email depende de la dependencia externa descrita en la sección 14.
- Recuperación de contraseña autoservicio (sin intervención de un administrador ni del equipo técnico).
- Consulta de auditoría administrativa: qué usuario hizo qué acción, sobre qué usuario u organización, y cuándo — con filtros y paginación, restringida al `ADMINISTRADOR`.
- Protección automática contra dejar una organización sin ningún administrador activo.

---

## 4. Capacidades deliberadamente fuera del alcance

- **Alta de una organización nueva por autoservicio.** No existe todavía ningún flujo dentro del producto para que una organización nueva se registre por su cuenta — la incorporación de un cliente nuevo la realiza hoy el equipo de SDC.
- **Entrega automática de email.** El sistema genera correctamente los enlaces de recuperación de contraseña e invitación, pero no existe todavía un proveedor de email configurado que los entregue de forma automática — hoy se comparten manualmente.
- **Roles y permisos configurables por organización.** Los seis roles del sistema (Administrador, Gerencia, Facturación, Liquidaciones, Operaciones, Lectura) son fijos y comunes a todas las organizaciones; ninguna organización puede definir sus propios roles o permisos.
- **Localización y branding por organización.** Moneda, idioma, formato y la identidad visual de la aplicación son hoy comunes a todas las organizaciones, no configurables por cliente.
- **Facturación del propio servicio SaaS.** SDC v1.0 no incluye ningún mecanismo para cobrarle a sus clientes por el uso del sistema — solo administra la facturación que cada cliente le emite a los suyos.
- **Integración con Carta de Porte Electrónica / AFIP-SISA.** No incluida en esta versión.
- **API pública, aplicación mobile, capacidades de inteligencia artificial, integraciones con terceros.** Ninguna de estas capacidades forma parte de SDC v1.0.
- **Onboarding guiado y documentación de usuario estructurada.** La incorporación de un cliente nuevo sigue siendo, hoy, un proceso acompañado directamente por el equipo de SDC.

Ninguna de estas ausencias es un olvido — todas fueron evaluadas y quedaron fuera de esta versión de forma explícita.

---

## 5. Arquitectura alcanzada

SDC v1.0 corre sobre una arquitectura multiempresa real: una única aplicación y una única base de datos sirven a todas las organizaciones simultáneamente, con un mecanismo central que garantiza que cada operación quede automáticamente acotada a la organización de quien la ejecuta — este mecanismo es transversal a todo el sistema, no algo que cada función tenga que implementar por separado. Esto significa que agregar nuevas funciones al producto hereda el aislamiento automáticamente, sin volver a resolverlo cada vez.

---

## 6. Multiempresa

Verificado, no asumido: dos organizaciones reales conviven hoy sobre la misma instancia de SDC, cada una con su propio catálogo completo (clientes, transportistas, viajes, facturas, liquidaciones, usuarios), y fueron sometidas deliberadamente a datos de negocio idénticos entre sí (mismo CUIT, mismo número de factura, mismo nombre) para confirmar que ninguna coincidencia de valores produce una mezcla de datos. En ningún caso probado una organización pudo leer, editar, relacionar o agregar en un cálculo los datos de la otra.

---

## 7. Seguridad

- Autenticación basada en sesiones sin estado (el sistema no necesita consultar la base en cada request para validar que una sesión sigue activa), con expiración automática de cada sesión a las 12 horas.
- Contraseñas nunca almacenadas en texto plano, siempre con hash seguro.
- Ningún token de recuperación, activación o invitación se almacena en texto plano — solo su huella criptográfica; cada uno es de un solo uso y expira automáticamente.
- Todo intento de cambiar el rol o el estado de un usuario está protegido para que una organización nunca pueda quedar sin ningún administrador activo.
- Configuración crítica del sistema (claves de sesión, orígenes autorizados) no tiene ningún valor por defecto inseguro: el sistema rechaza arrancar si no está configurada correctamente.

---

## 8. Administración

Ver el detalle completo en la sección 3. En síntesis: todo lo que antes requería que el equipo técnico interviniera manualmente sobre la base de datos para administrar usuarios, el perfil propio o los datos de la organización, hoy se resuelve desde la propia interfaz, por las personas correctas (cada usuario sobre lo suyo, cada administrador sobre su organización), con el registro de auditoría correspondiente.

---

## 9. Centro de Inteligencia

Módulo analítico maduro y estable, en producción desde antes de esta versión, re-confirmado en esta certificación como compatible con el modelo multiempresa sin haber requerido ningún cambio propio: calcula exclusivamente sobre los datos que ya le llegan aislados por organización, nunca decide por sí mismo a qué organización pertenece un dato.

---

## 10. Frontend incluido

Toda capacidad administrativa de esta versión (perfil propio, organización propia, recuperación de contraseña, aceptación de invitaciones, administración de usuarios, auditoría) tiene una pantalla real dentro de la aplicación web — ninguna de estas funciones requiere herramientas técnicas ni acceso directo al sistema para ser utilizada. La interfaz de estas funciones nuevas mantiene el mismo estilo visual y los mismos patrones de uso que el resto de la aplicación, sin introducir una experiencia distinta o inconsistente.

---

## 11. Validaciones ejecutadas

Cada capacidad de esta versión fue probada de punta a punta, usando la aplicación real (nunca solo verificaciones internas de código): inicio de sesión real, navegación real, formularios reales. Se probó explícitamente, entre otros casos: qué pasa cuando dos organizaciones usan los mismos datos de negocio; qué pasa cuando un usuario sin permisos intenta acceder a una función restringida, tanto por el menú como escribiendo la dirección directamente; qué pasa cuando una invitación o un enlace de recuperación es usado dos veces, o después de vencido, o alterado; qué pasa cuando se intenta dejar una organización sin ningún administrador. En todos los casos verificados, el sistema se comportó de forma correcta y segura.

---

## 12. Evidencia de producción

Todas las capacidades de esta versión están, hoy, desplegadas y funcionando en el entorno de producción real de SDC — no solo en un entorno de prueba. Cada incorporación a esta versión fue verificada en producción antes de darse por completada: el sistema responde correctamente, sin errores, y sin exponer ningún dato sensible en sus registros de funcionamiento.

---

## 13. Riesgos conocidos aceptados

- **Una sesión iniciada no se cierra automáticamente si el usuario cambia su contraseña.** El riesgo queda acotado a un máximo de 12 horas (la duración de cualquier sesión) y fue una decisión consciente para mantener el sistema simple y rápido, no un descuido.
- **Un usuario sin permisos de administrador puede, mediante herramientas técnicas (no desde la aplicación), consultar el listado de usuarios o el historial de auditoría de su propia organización** — nunca de otra organización, y nunca puede modificar nada. La interfaz de uso normal ya impide este acceso; el riesgo remanente es acotado y no involucra fuga de datos entre organizaciones.
- **No existe todavía una protección contra intentos repetidos de inicio de sesión con contraseña incorrecta.** El sistema de contraseñas en sí es seguro; lo que falta es una política de bloqueo ante fuerza bruta.
- **La lista de usuarios de una organización no pagina.** Correcto para el volumen actual de usuarios por organización; sería una limitación si una organización creciera a un número muy grande de usuarios.

Ninguno de estos riesgos compromete el aislamiento entre organizaciones ni la integridad de los datos financieros del sistema.

---

## 14. Dependencias externas pendientes

**Proveedor real de envío de email.** SDC v1.0 genera correctamente los enlaces de recuperación de contraseña y de invitación de usuarios, pero su entrega automática por correo electrónico depende de contratar y configurar un proveedor de email — una decisión de negocio (costo, proveedor, configuración) que no fue tomada en esta versión y no depende de ningún trabajo técnico adicional una vez decidida. Hasta que exista, un administrador puede igualmente incorporar usuarios nuevos compartiendo el enlace de acceso manualmente.

---

## 15. Definición formal de instalación estándar SDC v1.0

Una instalación estándar de SDC v1.0 consiste en:
- Una única aplicación, con una única base de datos, capaz de servir a múltiples organizaciones de forma simultánea y aislada.
- Un administrador inicial dado de alta por el equipo de SDC para cada organización nueva (no hay autoservicio de alta todavía).
- A partir de ese primer administrador, la organización completa —usuarios, datos institucionales, catálogos, operación diaria— se administra desde la propia aplicación, sin intervención técnica adicional.
- Sin necesidad de instalación local ni infraestructura propia por parte del cliente: SDC se entrega como servicio alojado centralmente.

---

## 16. Criterios para considerar la versión lista para comercialización

SDC v1.0 puede ofrecerse hoy a un segundo cliente real bajo el siguiente criterio: **un cliente nuevo puede operar el sistema completo día a día sin ninguna intervención técnica del equipo de SDC, salvo el alta inicial de su organización y su primer usuario administrador, y salvo que necesite recibir por email —en lugar de manualmente— sus enlaces de recuperación de contraseña o invitación.**

Ese criterio está cumplido y verificado con evidencia real, no supuesta, en las secciones 6, 11 y 12 de este documento. La única condición que falta resolver para que la incorporación de un cliente nuevo no dependa en ningún punto del equipo técnico es la del alta de organización por autoservicio, ya identificada como tal en la sección 4 — no es una condición de esta versión, es la que define el límite entre esta versión y la siguiente.

---

**SDC v1.0 queda documentado y en condiciones de certificarse como la primera versión comercial del producto**, sujeto a la revisión y aprobación formal de quien lo declara — ninguna versión de SDC se da por lanzada por decisión del proceso que la construye.

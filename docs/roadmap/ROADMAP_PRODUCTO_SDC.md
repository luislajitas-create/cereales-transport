# Roadmap de Producto — SDC

Fecha: 2026-07-13. Guía oficial de evolución del producto a partir del cierre de Bloque 8. No repite el contenido de `FASEII_AUDITORIA_ESTRATEGICA_SDC.md`, `FASEII_MANIFIESTO_SDC.md`, `FASEII_MERCADO_Y_POSICIONAMIENTO.md`, `FASEII_MODELO_DE_NEGOCIO.md`, `FASEIII_PLAN_MAESTRO_2026_2030.md`, `FASEIII_PRODUCTIZACION_SDC.md`, `BLOQUE8_AUDITORIA_PRODUCTIZACION.md` ni `ACTA_CIERRE_BLOQUE8.md` — los da por leídos y por vigentes, y convierte lo que ya definieron en una secuencia de ejecución concreta.

**Pregunta que responde este documento:** ¿cuál es el orden óptimo para transformar el SDC actual en un producto SaaS comercial, repetible y escalable?

---

## 1. Estado actual del producto (breve)

SDC es, hoy, un sistema transaccional completo y en producción real para una empresa de intermediación de transporte de cereales, con un motor analítico propio (Centro de Inteligencia) y, desde el cierre de Bloque 8, una arquitectura de datos multiempresa real, verificada de punta a punta con una segunda organización de prueba a través del sistema completo (`ACTA_CIERRE_BLOQUE8.md`). Es, en términos de `FASEIII_PRODUCTIZACION_SDC.md`, un sistema técnicamente preparado para ser multiempresa, pero **todavía operado, no todavía autoservicio**: cada organización nueva se da de alta hoy por acceso directo a la base, no por ningún flujo del producto — el mismo hecho que la propia Fase F tuvo que sortear para poder ejecutarse.

---

## 2. Capacidades completamente terminadas

- **Núcleo transaccional completo**: catálogos (clientes, transportistas, choferes, vehículos, cereales, ubicaciones, tipos de gasto), viajes con ciclo de estados completo, facturación, cobranzas, anticipos, liquidaciones — con transacciones atómicas donde corresponde.
- **Centro de Inteligencia**: Rentabilidad, Aging, Alertas, Benchmarking, Dashboard Ejecutivo — desacoplado del modelo transaccional, sin conocimiento de organización, validado con datos reales de dos organizaciones simultáneas.
- **Aislamiento multiempresa**: modelo de datos (`Organizacion`, 20 tablas con `organizacionId` obligatorio), autenticación con contexto de organización en el JWT, mecanismo centralizado de aislamiento (AsyncLocalStorage + Prisma Client Extensions), endurecimiento completo (NOT NULL, FKs compuestas, unicidades por organización) — cerrado y validado end-to-end.
- **Seguridad base**: fail-fast de configuración crítica (`JWT_SECRET`, `CORS_ORIGIN`), autenticación y autorización por rol, roles acotados a la propia organización.
- **Exportación de documentos**: Excel/PDF en los módulos que ya lo requerían operativamente.

---

## 3. Capacidades que todavía faltan

Ninguna de estas es una sorpresa — todas están ya nombradas, con distinto nivel de detalle, en `BLOQUE8_AUDITORIA_PRODUCTIZACION.md` y en `FASEIII_PRODUCTIZACION_SDC.md`. Lo que este roadmap agrega es su clasificación y su orden de ejecución (secciones 4 a 7).

- Alta de organización (autoservicio u operada) — hoy no existe ningún endpoint ni pantalla.
- CRUD completo de usuarios — `UsuariosController` solo tiene lectura; confirmado, de nuevo, en la propia Fase F (tuvo que crearse el usuario administrador de la Organización B por acceso directo a la base, por segunda vez en el proyecto).
- Panel de administración de la propia organización (usuarios, roles, datos de la empresa).
- Facturación SaaS — cobrar a los clientes de SDC, no a los clientes de los clientes de SDC.
- Onboarding guiado (primer uso, carga inicial de catálogos).
- Localización real — moneda, formato, idioma; hoy ARS/es-AR está hardcodeado en ~24 archivos del frontend (`BLOQUE8_AUDITORIA_PRODUCTIZACION.md`).
- Branding configurable por organización — hoy "Dador de Carga" está hardcodeado en `Login.tsx`/`Layout.tsx`.
- Integración con Carta de Porte Electrónica / AFIP-SISA — obligatoria por regulación desde 2021, SDC no la integra (`FASEII_MERCADO_Y_POSICIONAMIENTO.md`).
- API pública para integraciones de terceros.
- Aplicación mobile o vista mobile-first.
- Capacidades de IA aplicada sobre los datos ya existentes en el Centro de Inteligencia.
- Documentación de usuario y soporte estructurado.
- Permisos configurables por organización (hoy los 6 roles son fijos y globales al código, no configurables por cliente).
- Ecosistema de integradores/partners.
- Corrección de la deuda técnica de seguridad ya documentada: 3 endpoints que devuelven `200` vacío en vez de `404` ante acceso cruzado (`ACTA_CIERRE_BLOQUE8.md`), protección de `$queryRaw*` solo a nivel de tipos, lista manual de modelos organizacionales, guardia de escritura anidada incompleto, secuencias globales (`numeroViaje`, `numero`) no aisladas por organización.

---

## 4. Clasificación por áreas

| Área | Capacidades |
|---|---|
| **Productización** | Alta de organización, plantillas de configuración inicial, proceso de implementación repetible, catálogo de planes/tiers |
| **Administración** | CRUD de usuarios, gestión de roles y permisos por organización, panel de administración de la propia empresa, auditoría visible (hoy `AuditLog` existe en base pero sin ninguna pantalla) |
| **Configuración** | Localización (moneda/idioma/formato), branding por organización, parámetros comerciales configurables (hoy varios están fijos en código) |
| **Operación** | Todo lo ya cerrado en la sección 2 — es el área más madura del producto |
| **Comercial** | Facturación SaaS, planes y precios, alta comercial de clientes, métricas de uso por cliente para pricing |
| **Seguridad** | Cierre de la deuda técnica de la sección 3, permisos granulares, políticas de contraseña/sesión, auditoría completa y visible |
| **Integraciones** | Carta de Porte Electrónica/AFIP, medios de pago para cobranzas, posibles integraciones contables |
| **Inteligencia** | Ya madura (sección 2) — extensiones futuras: proyecciones, comparativas entre organizaciones anonimizadas (benchmark de mercado) |
| **Automatización** | Alertas proactivas por canal externo (email/WhatsApp), recordatorios automáticos de vencimientos, generación automática de documentos |
| **API** | API pública documentada, autenticación de API por organización (API keys), rate limiting |
| **Mobile** | Vista mobile-first o app nativa para choferes/operaciones de campo |
| **IA** | Asistencia sobre el Centro de Inteligencia (ya con el contrato definido en `BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md`: la IA futura consume del Motor, nunca accede directo a Viaje/Factura/Liquidación) |
| **Ecosistema** | Marketplace de integradores, partners de implementación, comunidad de usuarios |
| **Soporte y Adopción** *(área adicional, no listada por el usuario pero necesaria)* | Documentación de usuario, onboarding guiado, canal de soporte, Customer Success |
| **Legal y Compliance** *(área adicional)* | Términos de servicio, política de datos, contratos por organización — relevante recién cuando exista facturación SaaS real |

---

## 5. Dependencias entre capacidades

**Qué habilita qué:**
- Alta de organización habilita: onboarding, panel de administración, facturación SaaS (no se puede cobrar a algo que no se puede dar de alta).
- CRUD de usuarios habilita: panel de administración, permisos configurables, auditoría con atribución real de acciones.
- Panel de administración habilita: que un cliente real se autogestione, condición para reducir el costo operativo de cada cliente nuevo (`FASEIII_PRODUCTIZACION_SDC.md`).
- API pública habilita: integraciones, ecosistema, mobile de terceros.
- Facturación SaaS habilita: que el crecimiento comercial sea sostenible sin intervención manual por cliente.

**Qué puede desarrollarse en paralelo:**
- Localización/branding (Configuración) puede avanzar en paralelo con CRUD de usuarios (Administración) — no dependen entre sí.
- Corrección de la deuda técnica de seguridad (sección 3) puede avanzar en paralelo con cualquier otro bloque — es acotada, no depende de nada nuevo.
- Documentación de usuario/soporte puede empezar en paralelo con Administración, apenas exista algo estable que documentar.

**Qué nunca debería adelantarse:**
- **Mobile** antes de que exista Administración básica — no tiene sentido una app para usuarios que hoy no se pueden dar de alta sin acceso a la base.
- **IA** antes de tener datos reales de más de una organización operando de forma sostenida — sin eso, cualquier capacidad de IA se entrena o se valida contra un solo caso, exactamente el mismo error de diseño que Bloque 8 existió para corregir a nivel de datos.
- **Ecosistema/Marketplace** antes de que la API pública esté estable — no hay nada que un integrador pueda integrar todavía.
- **Integración con AFIP/Carta de Porte** antes de confirmar que es un requisito de compra real y no solo un hallazgo de investigación de mercado (`FASEII_MERCADO_Y_POSICIONAMIENTO.md` ya lo marca como observación a validar, no como hecho confirmado con clientes reales) — es una integración costosa y no debe construirse especulativamente.
- **Facturación SaaS** antes de Alta de organización — no hay a quién facturarle todavía.

---

## 6. Priorización

### Imprescindible
- **CRUD de usuarios.** Confirmado dos veces en la práctica (Bloque 8 y esta misma Fase F) que su ausencia obliga a intervención manual directa sobre la base para cualquier cosa relacionada con usuarios — es el bloqueo más concreto y ya demostrado que existe hoy.
- **Alta de organización.** Sin esto, cada cliente nuevo requiere el mismo procedimiento manual que se usó para crear la Organización de prueba de la Fase F — no es repetible, y la repetibilidad es la condición que separa un producto de un sistema hecho para un solo cliente (`FASEIII_PRODUCTIZACION_SDC.md`).
- **Panel de administración mínimo** (gestión de los propios usuarios y datos de la organización). Consecuencia directa de los dos puntos anteriores — sin esto, dar de alta usuarios/organización seguiría dependiendo de alguien con acceso técnico.
- **Cierre de la deuda técnica de seguridad de la sección 3.** Es acotada, ya identificada con evidencia concreta, y deja una superficie de riesgo abierta e innecesaria si se posterga sin motivo.

### Muy importante
- **Facturación SaaS.** No bloquea tener el producto operativo, pero sí bloquea que crecer sea sostenible sin trabajo manual por cliente.
- **Localización y branding configurable.** Necesario para vender fuera del caso de uso actual (otra empresa, potencialmente otro país) sin tocar código por cliente.
- **Onboarding guiado.** Reduce el costo de implementación por cliente nuevo — impacto directo en el modelo de negocio ya definido en `FASEII_MODELO_DE_NEGOCIO.md`.
- **Documentación de usuario y soporte estructurado.** Necesario en cuanto exista más de un cliente real usando el sistema sin supervisión directa del equipo.

### Conveniente
- **API pública.** Valiosa, pero ningún cliente la pidió todavía — construirla antes de tener presión real de integración es especular.
- **Permisos configurables por organización.** Los 6 roles actuales ya cubren el caso de uso real; hacerlos configurables es una mejora, no un bloqueo.
- **Integraciones de medios de pago para cobranzas.** Mejora la operación, no bloquea la venta.

### Futuro
- **Integración con Carta de Porte Electrónica/AFIP.** Alto costo, requisito no confirmado con clientes reales todavía — corresponde validar antes de construir (Artículo 5, `CONSTITUCION_SDC.md`).
- **Mobile.**
- **IA aplicada.**
- **Ecosistema/Marketplace.**

---

## 7. Próximos bloques propuestos (solo definición, no apertura)

### Bloque 9 — Administración de Organización y Usuarios
- **Objetivo:** eliminar la dependencia de acceso directo a la base para dar de alta una organización o un usuario.
- **Alcance:** CRUD completo de `Usuario` (hoy solo lectura); flujo de alta de `Organizacion` con su primer usuario administrador; asignación/edición de roles dentro de la propia organización.
- **Dependencia:** ninguna — se apoya directamente en la arquitectura ya cerrada en Bloque 8.
- **Impacto esperado:** condición habilitante para todo lo demás de esta sección — es, con evidencia ya demostrada dos veces en este proyecto, el bloqueo más concreto que existe hoy para operar como producto.

### Bloque 10 — Endurecimiento de seguridad remanente
- **Objetivo:** cerrar la deuda técnica de seguridad identificada en `ACTA_CIERRE_BLOQUE8.md` y en la auditoría previa.
- **Alcance:** corrección de los 3 endpoints con código de estado incorrecto ante acceso cruzado; cierre del acceso runtime a `$queryRaw*`/`$executeRaw*` en el cliente de nivel superior; completar la lista de claves de escritura anidada detectadas (`create`/`createMany`); evaluar una red de seguridad automática para `ORGANIZACIONAL_MODELS`.
- **Dependencia:** ninguna — es independiente y puede avanzar en paralelo con cualquier otro bloque.
- **Impacto esperado:** cierra formalmente la superficie de riesgo conocida de la arquitectura multiempresa, sin dejar deuda técnica de seguridad documentada y no resuelta.

### Bloque 11 — Panel de Administración de Organización
- **Objetivo:** primera superficie de autoservicio real para un cliente.
- **Alcance:** pantallas para gestionar usuarios propios, roles, datos básicos de la organización (nombre, branding mínimo).
- **Dependencia:** Bloque 9 completo.
- **Impacto esperado:** reduce a cero la intervención del equipo de SDC para tareas administrativas rutinarias de un cliente ya implementado.

### Bloque 12 — Configuración y Localización
- **Objetivo:** que SDC deje de asumir una sola moneda, un solo idioma y una sola marca.
- **Alcance:** extracción de los ~24 puntos de ARS/es-AR hardcodeado a configuración por organización; branding configurable (logo, nombre visible).
- **Dependencia:** puede avanzar en paralelo con Bloque 9/10/11 — no depende de ninguno.
- **Impacto esperado:** condición para vender el producto fuera del caso de uso y la geografía actuales sin tocar código por cliente.

### Bloque 13 — Onboarding Guiado
- **Objetivo:** que un cliente nuevo pueda cargar su catálogo inicial sin acompañamiento manual completo del equipo.
- **Alcance:** flujo guiado de carga inicial (clientes, transportistas, choferes, vehículos, catálogos); checklist de implementación repetible.
- **Dependencia:** Bloque 9 y Bloque 11 completos.
- **Impacto esperado:** reduce el costo marginal de cada cliente nuevo — impacto directo sobre el modelo de escalabilidad ya definido en `FASEIII_PRODUCTIZACION_SDC.md`.

### Bloque 14 — Facturación SaaS
- **Objetivo:** que SDC pueda cobrar a sus propios clientes de forma sostenible.
- **Alcance:** planes/tiers, medición de uso por organización, ciclo de facturación, medio de cobro.
- **Dependencia:** Bloque 9 (alta de organización) completo.
- **Impacto esperado:** condición de sostenibilidad comercial del negocio, no solo del producto.

### Bloque 15 — Documentación y Soporte
- **Objetivo:** que un cliente pueda resolver dudas operativas sin depender de una conversación directa con el equipo técnico.
- **Alcance:** documentación de usuario, canal de soporte estructurado, base de conocimiento mínima.
- **Dependencia:** puede iniciarse en paralelo con Bloque 11 en adelante, apenas exista una superficie estable que documentar.
- **Impacto esperado:** reduce el costo de soporte por cliente a medida que la base de clientes crece.

### Bloque 16 — API Pública
- **Objetivo:** exponer el sistema a integraciones externas.
- **Alcance:** API documentada, autenticación por API key por organización, límites de uso.
- **Dependencia:** Bloque 9 y Bloque 14 completos (una API pública sin facturación SaaS y sin alta de organización real no tiene con quién validarse).
- **Impacto esperado:** habilita el Bloque 17 (Integraciones) y, más adelante, el Ecosistema.

### Bloque 17 — Integraciones (evaluación primero, construcción después)
- **Objetivo:** validar con clientes reales si Carta de Porte Electrónica/AFIP es un requisito de compra, y recién ahí construir.
- **Alcance:** primero una instancia acotada de validación comercial (no de código); si se confirma, diseño e implementación de la integración.
- **Dependencia:** Bloque 16 completo; validación comercial explícita antes de cualquier línea de código, según el Artículo 5 de `CONSTITUCION_SDC.md`.
- **Impacto esperado:** cierra un riesgo regulatorio real si se confirma como bloqueante de venta; si no se confirma, evita construir algo que nadie pidió.

### Bloques futuros (sin definición detallada todavía — corresponde a la etapa "Futuro" de la sección 6)
Mobile, IA aplicada sobre el Centro de Inteligencia, Ecosistema/Marketplace de integradores. Se definen con el mismo nivel de detalle que los anteriores recién cuando su turno se acerque en la hoja de ruta — definirlos en profundidad hoy sería especular sobre un contexto comercial que todavía no existe.

---

## 8. Riesgos de crecimiento (reales, no hipotéticos)

- **Comercial:** el mercado ya investigado (`FASEII_MERCADO_Y_POSICIONAMIENTO.md`) es un nicho específico (intermediación de transporte de cereales con facturación propia) sin un competidor directo identificado, pero también sin evidencia todavía de demanda validada más allá del cliente actual — vender sin haber confirmado esa demanda es el riesgo comercial central.
- **Operativo:** hoy, dar de alta un cliente nuevo requiere intervención manual directa sobre la base de datos (confirmado dos veces, Bloque 8 y Fase F) — ese costo operativo no escala más allá de un puñado de clientes sin el Bloque 9.
- **Soporte:** no existe ningún canal ni documentación de usuario — cada cliente nuevo depende hoy de comunicación directa con quien conoce el sistema técnicamente.
- **Implementación:** sin onboarding guiado, cada implementación nueva es, en la práctica, un proyecto a medida — exactamente el patrón que `FASEIII_PRODUCTIZACION_SDC.md` identificó como el riesgo central a resolver para ser un producto.
- **Escalabilidad:** las secuencias globales (`numeroViaje`, `Liquidacion.numero`) y la lista manual de modelos organizacionales (`ORGANIZACIONAL_MODELS`) son deuda técnica real, ya documentada con evidencia de código, que se vuelve más costosa de corregir cuanto más tarde se aborde.
- **Adopción:** un sistema especializado compite, en la práctica, contra la opción "seguir usando planillas de cálculo" tanto como contra otro software — la curva de adopción depende de qué tan bajo sea el costo de empezar a usarlo, que es exactamente lo que Onboarding (Bloque 13) existe para resolver.
- **Mantenimiento:** cada nueva funcionalidad que no respete la regla permanente de `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md` (nacer compatible con multiempresa desde el origen) reabre exactamente el mismo problema que Bloque 8 resolvió una vez — el riesgo de mantenimiento más alto de todos es organizativo, no técnico: que esa disciplina no se sostenga.

---

## 9. Hoja de ruta de alto nivel

- **Corto plazo (resto de 2026):** Bloques 9 y 10 — cerrar la dependencia de acceso manual a la base y la deuda técnica de seguridad conocida. Es la condición mínima para que exista un segundo cliente real, no solo uno de prueba.
- **2026 – inicios de 2027:** Bloques 11, 12 y 13 — panel de administración, configuración/localización, onboarding guiado. Al cierre de esta etapa, SDC puede implementarse en un cliente nuevo sin que el equipo técnico intervenga en cada paso.
- **2027:** Bloque 14 (Facturación SaaS) y Bloque 15 (Documentación y Soporte) — el producto pasa a ser comercialmente sostenible, no solo técnicamente repetible.
- **2027 – 2028:** Bloque 16 (API pública) y evaluación comercial del Bloque 17 (Integraciones) — expansión hacia el ecosistema, condicionada a demanda real confirmada, no anticipada.
- **2028 en adelante:** Mobile, IA aplicada, Ecosistema — coherente con el horizonte de 3 a 5 años ya fijado en `FASEIII_PLAN_MAESTRO_2026_2030.md`, a definir en detalle cuando la etapa anterior esté cerrada.

---

## 10. Recomendación concreta

**El próximo bloque del proyecto debe ser el Bloque 9 — Administración de Organización y Usuarios.**

No es una elección entre varias opciones igualmente válidas — es la única capacidad de esta lista que ya demostró ser un bloqueo real, dos veces, con evidencia concreta y reciente: en la auditoría de productización de Bloque 8, y de nuevo en la ejecución misma de la Fase F, donde crear la segunda organización de prueba exigió exactamente el mismo procedimiento manual de acceso directo a la base que un cliente real necesitaría hoy. Toda la arquitectura de aislamiento que Bloque 8 construyó y validó queda, sin el Bloque 9, inaccesible para cualquiera que no sea el propio equipo técnico con acceso a la base de datos — la infraestructura multiempresa existe, pero todavía no hay ninguna puerta de entrada para usarla como producto.

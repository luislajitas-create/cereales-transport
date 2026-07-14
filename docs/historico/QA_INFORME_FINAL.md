# Informe Final de Auditoría Funcional — SDC v1.0

Fecha: 2026-07-05. Cierra la auditoría funcional y técnica módulo por módulo realizada sobre el ambiente de producción de Railway (Login, Dashboard, Catálogos, Viajes, Anticipos, Liquidaciones, Facturación, Cobranzas, Dashboard de cierre). El detalle completo de cada hallazgo, con archivo y línea exacta, está en `QA_FINDINGS.md`. Este documento consolida esos hallazgos por causa raíz, los prioriza, y da una recomendación explícita sobre un piloto con clientes reales.

Metodología: revisión de código (frontend + backend + `schema.prisma`) más pruebas de login/health contra el ambiente de Railway. Ningún hallazgo fue corregido; no se hicieron commits ni push como parte de esta auditoría.

---

# 1. Resumen Ejecutivo

## Estado general del proyecto

El sistema tiene los 7 módulos de negocio funcionando de punta a punta (Auth, Catálogos, Viajes, Anticipos, Liquidaciones, Facturas, Dashboard), desplegado y accesible en Railway, con login validado. La arquitectura de cada módulo es razonable y en varios casos (Facturación, control de roles en Liquidaciones) el diseño es correcto y defensivo. Sin embargo, la auditoría encontró **un patrón recurrente de brechas de integridad contable y de validación server-side** que hoy hacen que el sistema **no sea seguro para operar con dinero real de clientes sin antes cerrar un grupo acotado de problemas críticos**.

## Fortalezas

- **Diseño correcto en Facturación:** doble facturación del mismo viaje está protegida a nivel de base de datos (`FacturaViaje.viajeId @unique`); las facturas emitidas son inmutables (sin `PATCH`); las anulaciones exigen cero cobranzas antes de proceder.
- **Control de roles consistente en Liquidaciones y Facturas:** los 4 endpoints de escritura de Liquidaciones y los 3 de Facturas tienen exactamente el mismo `@Roles(...)` aplicado de forma pareja.
- **Revalidación server-side independiente del payload del frontend** en Liquidaciones y Facturas: la selección de viajes/anticipos candidatos se vuelve a verificar en el servidor, no se confía en lo que mandó el cliente.
- **Reversión de estado de viajes correctamente resuelta** al anular una liquidación o una factura (usa la relación única `viajeId`, sin riesgo de contaminar otro registro).
- **Bug real ya corregido y documentado:** el caso más grave de contaminación cruzada en `LiquidacionesController.anular()` (liquidaciones sin movimientos) fue detectado y corregido el 2026-07-03 (commit `acd156c`) — evidencia de que el equipo ya sabe identificar y resolver este tipo de problema.
- **Frontend funcional y usable** en los flujos principales: Dashboard, filtros de Viajes, flujo completo de creación de Liquidaciones/Facturas con selección de candidatos.

## Debilidades

- **Falta de validación server-side transversal:** casi todos los controllers reciben `@Body() body: any` sin DTOs; el `ValidationPipe` global no tiene ningún efecto real. La única barrera hoy es el frontend, evitable con cualquier cliente HTTP.
- **El mismo defecto estructural aparece tres veces:** falta el campo `anticipoGastoId` en `LiquidacionMovimiento`, lo que permite que anular una liquidación contamine anticipos de otra, y que dos liquidaciones concurrentes descuenten el mismo anticipo dos veces.
- **Los viajes se pueden editar y cancelar sin ninguna guarda después de estar facturados o liquidados**, generando divergencia silenciosa entre lo que dice el viaje y lo que ya se facturó/liquidó — confirmado que afecta al Dashboard, a la Conciliación y a los totales de Liquidaciones.
- **Las cobranzas no tienen tope de sobrepago, pueden duplicarse por un doble clic, y no se pueden anular ni corregir nunca** una vez registradas.
- **Brecha de control de acceso real:** `POST`/`PATCH /anticipos` no tienen restricción de rol — cualquier usuario autenticado, sin importar su rol, puede crear o editar movimientos financieros vía API directa.
- **Errores técnicos crudos expuestos al usuario final** ante violaciones de datos únicos (CUIT/CUIL/patente/CTG/número de factura duplicados), en vez de mensajes de negocio claros.

## Riesgos para producción

| Riesgo | Severidad | Con datos/clientes reales... |
|---|---|---|
| Doble descuento o pérdida de anticipos entre liquidaciones | Crítica | Un chofer/transportista podría cobrar de más o de menos sin que nadie lo note fácilmente. |
| Viajes editables/cancelables tras facturar o liquidar | Crítica | La factura o liquidación ya entregada al cliente/transportista puede divergir silenciosamente de lo que el sistema muestra internamente. |
| Cobranzas sin tope y sin reversión | Crítica | Un error de tipeo o un doble clic en un pago queda grabado para siempre, sin forma de corregirlo. |
| Falta de rol en creación/edición de Anticipos | Crítica (seguridad) | Cualquier usuario logueado (incluso de solo lectura) puede insertar/alterar movimientos financieros. |
| Validación server-side prácticamente ausente | Alta | Datos corruptos (negativos, `NaN`, duplicados) pueden entrar por fuera del frontend sin que el sistema lo impida. |

## ¿Está listo para un piloto?

**Sí, con condiciones.** No es un "no" rotundo — el sistema funciona y la arquitectura de base es sólida — pero tampoco es un "sí" sin reservas: hay 4 grupos de hallazgos **P0** (ver sección 3) con impacto financiero y de seguridad directos que deberían resolverse **antes** de operar con dinero real de clientes o transportistas sin supervisión. Con esos 4 grupos resueltos, un piloto acotado es razonable. Ver justificación completa en la sección 5.

---

# 2. Hallazgos consolidados por causa raíz

(No agrupados por módulo — ver `QA_FINDINGS.md` para el detalle módulo por módulo con archivo y línea exacta.)

### A. Integridad contable / financiera
- Falta `anticipoGastoId` en `LiquidacionMovimiento` → reversión de anticipos por `viajeId` contamina liquidaciones ajenas; sin protección de concurrencia para doble-liquidación del mismo anticipo.
- Viajes editables/cancelables sin guarda tras facturar/liquidar → divergencia silenciosa entre el viaje y los documentos ya emitidos (factura, liquidación, conciliación, Dashboard).
- Cobranzas sin tope de sobrepago, sin protección de duplicado, sin reversión posible.
- `Chofer.comisionPct` (dato maestro ya modelado) no se usa al liquidar — el porcentaje se tipea a mano cada vez.
- `TipoGasto.afectaLiquidacion` existe pero nunca se lee — regla de negocio muerta.

### B. Reglas implementadas solo en frontend (bypasseables por API directa)
- Bloqueo de cobranza sobre factura ya `COBRADO_TOTAL` — solo en `Facturas.tsx`, el backend no lo replica.
- Filtrado de chofer/vehículo por transportista y por tipo (camión/acoplado) en el alta de un viaje — solo en los `<select>` del frontend, sin revalidación en `ViajesController.create()`.

### C. Concurrencia
- Anticipos sin constraint única equivalente a la de viajes (`LiquidacionViaje.viajeId @unique`) → ventana de carrera para doble-liquidación del mismo anticipo.
- `pagar()` (Liquidaciones) y `registrarCobranza()` (Facturas) sin lock explícito — ventana de carrera estrecha en el recálculo de estado.

### D. DTOs + ValidationPipe
- El `ValidationPipe` global está configurado pero es inefectivo: casi todos los controllers usan `@Body() body: any` sin una clase decorada con `class-validator` para validar.

### E. Validaciones de negocio ausentes en el backend
- Rangos numéricos sin validar (toneladas/tarifa negativos o `NaN`, importes de anticipo/cobranza negativos o cero).
- `origenId === destinoId` permitido en un viaje.
- `vencimiento < fecha` permitido en una factura.
- `Vehiculo.capacidadKg`: valor no numérico se convierte silenciosamente a `null` en el frontend, sin avisar.

### F. Manejo de errores
- Ninguna violación de constraint única de Prisma (`P2002`: CUIT, CUIL, patente, CTG, número de factura duplicados) se traduce a un mensaje de negocio — todas devuelven un 500 genérico ("Internal server error").
- El Dashboard muestra el mismo mensaje genérico ante cualquier tipo de falla, sin distinguir causa.

### G. Seguridad / control de acceso
- `POST`/`PATCH /anticipos` sin `@Roles(...)` — cualquier usuario autenticado puede crear/editar anticipos, a diferencia de todos los demás módulos financieros (Viajes, Liquidaciones, Facturas), que sí lo restringen correctamente.

### H. Performance
- Ningún listado (Catálogos, Viajes, Liquidaciones, Facturas, Anticipos) tiene paginación — siempre se trae la tabla completa.
- El Dashboard (la pantalla de mayor tráfico, se carga en cada login) trae el objeto `cliente` completo y todas las cobranzas de cada factura vencida sin límite; y calcula `viajesMes` trayendo todas las filas del mes en vez de agregarlas en la base de datos.

### I. UX
- Botones de acción ("Confirmar"/"Pagar"/"Anular" en Liquidaciones, "Registrar cobranza"/"Anular" en Facturas) visibles para roles que el backend después rechaza con 403 (ej. `GERENCIA`).
- Catálogos simples (Cereales, Ubicaciones, Productores, Choferes, Vehículos) sin edición ni eliminación en la interfaz, aunque parte del backend ya lo soporta.
- Typo puntual: `Liquidaciones.tsx:232` (`detalle.numerl` en vez de `detalle.numero`).

### J. Modelado de datos / deuda de esquema
- Constraints únicas faltantes: `Ubicacion.nombre`, `Productor.cuit`, `Chofer.dni`.
- Enums duplicados `EstadoFacturaEnum`/`EstadoFacturacionEnum` (sin divergencia activa hoy, riesgo de mantenimiento a futuro).
- Clasificación de anticipos como "adelanto" vs. "descuento" por coincidencia de texto sobre el nombre del tipo de gasto, en vez de un campo explícito.

### K. Gaps funcionales conscientes (no son bugs)
- Sin gestión de usuarios vía API/UI — decisión ya tomada y documentada, fuera de alcance de v1.0.
- Sin conciliación bancaria real — la pantalla "Conciliación" concilia viajes realizados vs. facturados, no cobranzas contra extractos bancarios.
- Sin edición parcial de una liquidación ya creada (solo anular + recrear) — diseño intencional razonable, no una omisión.

---

# 3. Backlog priorizado

## P0 — Bloqueantes (antes de operar con dinero real sin supervisión)

**P0.1 — Falta `anticipoGastoId` en `LiquidacionMovimiento`**
- Causa raíz: A (integridad contable) + C (concurrencia)
- Módulos afectados: Anticipos, Liquidaciones, Dashboard
- Solución recomendada: agregar columna `anticipoGastoId` (con constraint única) a `LiquidacionMovimiento`; reescribir `anular()` para revertir por ese id exacto en vez de por `viajeId`; usar la misma constraint para bloquear la inclusión concurrente del mismo anticipo en dos liquidaciones.
- Esfuerzo estimado: **M** (1 migración de schema + backfill de datos existentes + reescritura de `create()`/`anular()` + pruebas de regresión del flujo completo de liquidación).
- Riesgo de regresión: Medio — toca el corazón del flujo de Liquidaciones; requiere probar a fondo crear/confirmar/pagar/anular con anticipos compartidos entre viajes.

**P0.2 — Viajes editables/cancelables sin guarda tras facturar o liquidar**
- Causa raíz: A (integridad contable)
- Módulos afectados: Viajes, Facturación (conciliación), Liquidaciones, Dashboard
- Solución recomendada: en `ViajesController.update()`, `cambiarEstado()` y `cancelar()`, bloquear cambios cuando `estadoFacturacion != PENDIENTE_DE_FACTURAR` o `estadoLiquidacion != PENDIENTE`, salvo un flujo explícito de reversión (que hoy no existe y no es parte de este fix).
- Esfuerzo estimado: **S/M**.
- Riesgo de regresión: Bajo/Medio — es una restricción nueva, no cambia el comportamiento del caso normal (viaje aún no facturado/liquidado).

**P0.3 — Cobranzas sin tope, sin protección de duplicado, sin reversión**
- Causa raíz: A (integridad contable) + B (regla solo frontend)
- Módulos afectados: Facturación, Cobranzas, Dashboard
- Solución recomendada: (a) deshabilitar el botón "Registrar cobranza" mientras la request está en curso; (b) validar en el backend `totalCobrado <= factura.importe`; (c) bloquear en el backend registrar una cobranza si `factura.estado === "COBRADO_TOTAL"`; (d) agregar un endpoint de anulación de cobranza individual que recalcule el estado de la factura.
- Esfuerzo estimado: **M**.
- Riesgo de regresión: Bajo — son validaciones y un endpoint nuevo, no modifican lógica existente que ya funcione.

**P0.4 — Sin control de rol en `POST`/`PATCH /anticipos`**
- Causa raíz: G (seguridad / control de acceso)
- Módulos afectados: Anticipos
- Solución recomendada: agregar `@Roles("ADMINISTRADOR","LIQUIDACIONES","OPERACIONES")` a `create()` y `update()`, igual que en los demás controllers financieros.
- Esfuerzo estimado: **XS**.
- Riesgo de regresión: Bajo — pero conviene confirmar primero qué roles deben poder seguir usando la funcionalidad, para no bloquear a nadie que la use legítimamente hoy.

## P1 — Alta prioridad

**P1.1 — DTOs + `class-validator` ausentes en casi todos los controllers**
- Causa raíz: D (DTO + ValidationPipe)
- Módulos afectados: Catálogos, Viajes, Anticipos, Facturas (transversal)
- Solución recomendada: crear un DTO por entidad con decoradores de `class-validator`, tipar todos los `@Body()`.
- Esfuerzo estimado: **L** (~15-20 endpoints).
- Riesgo de regresión: Medio — puede rechazar payloads que hoy pasan sin validar; requiere probar cada formulario del frontend contra los DTOs nuevos.

**P1.2 — Validaciones de negocio cruzadas ausentes**
- Causa raíz: E (validaciones de negocio)
- Módulos afectados: Viajes, Facturas, Anticipos, Catálogos
- Solución recomendada: agregar validaciones puntuales (`origenId !== destinoId`, chofer/vehículo pertenece al transportista indicado, tipo camión/acoplado correcto, `vencimiento >= fecha`, rangos numéricos positivos) — puede implementarse junto con P1.1 reutilizando los mismos DTOs con validadores custom.
- Esfuerzo estimado: **M**.
- Riesgo de regresión: Bajo.

**P1.3 — Errores de Prisma no traducidos (500 crudo)**
- Causa raíz: F (manejo de errores)
- Módulos afectados: todos
- Solución recomendada: `ExceptionFilter` global para `PrismaClientKnownRequestError`, traduciendo `P2002` a 409 con mensaje de negocio.
- Esfuerzo estimado: **S**.
- Riesgo de regresión: Bajo — es aditivo, no cambia el comportamiento de las requests exitosas.

**P1.4 — `Chofer.comisionPct` no utilizado al liquidar**
- Causa raíz: A (integridad contable)
- Módulos afectados: Liquidaciones, Choferes
- Solución recomendada: pre-completar `comisionPct` desde el dato maestro del chofer al armar la liquidación, permitiendo override manual explícito si corresponde.
- Esfuerzo estimado: **S**.
- Riesgo de regresión: Bajo.

## P2 — Mejoras importantes

**P2.1 — Performance de listados y del Dashboard**
- Causa raíz: H (performance)
- Módulos afectados: Dashboard + todos los listados
- Solución recomendada: paginación (`take`/`skip`) en listados; reemplazar `findMany`+reduce por `.aggregate()` en `viajesMes`; limitar `facturasVencidas` a un top razonable.
- Esfuerzo estimado: **M**.
- Riesgo de regresión: Bajo/Medio — si se agrega paginación real, cambia el contrato de la API y requiere ajustar el frontend.

**P2.2 — Botones de acción visibles sin ocultar por rol**
- Causa raíz: I (UX)
- Módulos afectados: Liquidaciones, Facturas
- Solución recomendada: ocultar/deshabilitar según `usuario.rol`, igual que ya se hace en el menú lateral.
- Esfuerzo estimado: **XS**.
- Riesgo de regresión: Ninguno.

**P2.3 — Constraints únicas faltantes + enums duplicados + reglas de clasificación frágiles**
- Causa raíz: J (modelado de datos)
- Módulos afectados: Catálogos, Liquidaciones
- Solución recomendada: agregar `@unique` a `Ubicacion.nombre`/`Productor.cuit`/`Chofer.dni` (auditar duplicados existentes antes de migrar); decidir el destino de `TipoGasto.afectaLiquidacion` (implementarlo o eliminarlo); reemplazar la clasificación por texto por un campo explícito.
- Esfuerzo estimado: **M**.
- Riesgo de regresión: Medio — una migración de constraint única puede fallar si ya existen duplicados en los datos actuales; requiere auditoría previa de datos.

**P2.4 — Concurrencia en pagos y cobranzas**
- Causa raíz: C (concurrencia)
- Módulos afectados: Liquidaciones, Facturación
- Solución recomendada: optimistic locking (incluir el estado esperado como condición del `update`) en `pagar()` y `registrarCobranza()`.
- Esfuerzo estimado: **S**.
- Riesgo de regresión: Bajo.

**P2.5 — Catálogos sin edición/eliminación completa en la UI**
- Causa raíz: I (UX) + parcialmente D
- Módulos afectados: Catálogos (Cereales, Ubicaciones, Productores, Choferes, Vehículos)
- Solución recomendada: completar UI de edición donde el backend ya lo permite (Productores, Choferes, Vehículos); agregar `PATCH`/`DELETE` donde falte (Cereales, Ubicaciones).
- Esfuerzo estimado: **M**.
- Riesgo de regresión: Bajo.

**P2.6 — `Vehiculo.capacidadKg` se convierte silenciosamente a `null`**
- Causa raíz: E (validaciones de negocio)
- Módulos afectados: Transportistas (Vehículos)
- Solución recomendada: validar el valor antes de enviar el formulario, mostrar error si no es numérico.
- Esfuerzo estimado: **XS**.
- Riesgo de regresión: Ninguno.

## P3 — Mejoras futuras

**P3.1 — Gestión de usuarios vía API/UI** — ya fuera de alcance de v1.0 a propósito. Esfuerzo: M. Riesgo: Bajo (funcionalidad aislada, aditiva).

**P3.2 — Conciliación bancaria real** — funcionalidad nueva, hoy no existe. Esfuerzo: L. Riesgo: Bajo (aditiva).

**P3.3 — Typo `Liquidaciones.tsx:232` (`detalle.numerl`)** — Esfuerzo: XS. Riesgo: Ninguno. (Se puede resolver en cualquier momento, incluso antes que todo lo demás, por su trivialidad.)

**P3.4 — Caché en el Dashboard** — Esfuerzo: S. Riesgo: Bajo. Solo si el volumen de datos lo llega a justificar.

**P3.5 — Definir alcance real de una pantalla "Configuración"** (hoy no existe ni como ruta) — Esfuerzo: depende del alcance que se defina. Riesgo: N/A hasta no definirlo.

---

# 4. Roadmap de corrección (por bloques de arquitectura)

No se ordena por módulo de negocio — se ordena por la capa de arquitectura que cada bloque toca, para minimizar retrabajo y ventanas de migración.

### Bloque 1 — Control de acceso (rápido, sin dependencias)
- P0.4 (rol faltante en Anticipos).
- Es el fix más rápido y aislado de todo el backlog — no depende de nada más y cierra una brecha de seguridad activa. Debería ser lo primero en resolverse, incluso antes de planificar el resto.

### Bloque 2 — Capa de validación y manejo de errores (fundacional)
- P1.1 (DTOs + `class-validator`), P1.3 (`ExceptionFilter` para Prisma).
- Se agrupan porque tocan la misma capa transversal (pipes/filters globales de Nest) y porque los bloques siguientes (validaciones de negocio, integridad contable) se apoyan en esta capa para implementarse de forma consistente en vez de ad-hoc.

### Bloque 3 — Integridad de datos y migraciones de schema (una sola ventana coordinada)
- P0.1 (`anticipoGastoId`), P2.3 (constraints únicas + enums + clasificación), P1.4 (`comisionPct`).
- Se agrupan porque todos requieren tocar `schema.prisma` y correr migraciones — conviene planificarlos y ejecutarlos en una sola ventana de mantenimiento en vez de varias migraciones sueltas, incluyendo la auditoría de datos existentes que P2.3 requiere antes de aplicar constraints únicas.

### Bloque 4 — Reglas de negocio y guardas de estado
- P0.2 (viaje editable/cancelable post-facturación/liquidación), P0.3 (cobranzas sin tope/duplicado/reversión), P1.2 (validaciones cruzadas), P2.6 (`capacidadKg`).
- Se apoyan en los Bloques 2 y 3 ya resueltos (DTOs para expresar las validaciones de forma consistente, y el schema ya estabilizado). Es el bloque de mayor impacto de negocio directo.

### Bloque 5 — Concurrencia
- P2.4 (locks en `pagar()`/`registrarCobranza()`).
- Tiene sentido después del Bloque 3, ya que la protección de concurrencia de anticipos (P0.1) ya quedó resuelta ahí — este bloque cierra los dos casos restantes (pagos y cobranzas) con la misma técnica (optimistic locking).

### Bloque 6 — Performance y escalabilidad
- P2.1 (paginación, agregados en el Dashboard).
- Se deja después de las correcciones funcionales porque cambia contratos de API (paginación) y conviene hacerlo una vez que la lógica de negocio ya esté estable, para no tener que retocar los mismos endpoints dos veces.

### Bloque 7 — UX y completitud de catálogos
- P2.2 (botones por rol), P2.5 (edición/eliminación en catálogos), P3.3 (typo).
- Bajo riesgo, sin dependencias técnicas de los bloques anteriores — puede intercalarse en paralelo por otra persona del equipo sin bloquear el resto del roadmap.

### Bloque 8 — Deuda diferida y funcionalidades futuras
- P3.1 (usuarios vía API), P3.2 (conciliación bancaria), P3.4 (caché), P3.5 (Configuración).
- Explícitamente fuera del camino crítico — son decisiones de producto más que correcciones, y no deberían competir por prioridad con los bloques 1-7.

---

# 5. Recomendación final

**¿Autorizarías comenzar un piloto con clientes reales? Sí, con condiciones — no antes de resolver los 4 hallazgos P0.**

**Justificación técnica:**

Los 4 hallazgos P0 comparten una característica: **todos representan una forma en la que el sistema puede manejar dinero real de forma incorrecta sin que nadie se entere en el momento**, no fallas visibles que un usuario reportaría de inmediato:

- Un chofer/transportista puede quedar debiendo o cobrando de más sin que la liquidación lo refleje (P0.1).
- Una factura o liquidación ya entregada puede divergir en silencio del viaje que la originó, si ese viaje se edita o cancela después (P0.2).
- Un pago puede duplicarse por un simple doble clic, sin ningún tope que lo detenga, y sin ninguna forma de revertirlo después (P0.3).
- Cualquier persona con una cuenta activa en el sistema — incluso un rol pensado solo para lectura — puede hoy crear o modificar movimientos financieros llamando directamente a la API, sin que el rol que el negocio le asignó se lo impida (P0.4).

Ninguno de estos cuatro requiere un atacante malicioso ni un escenario extremo — pueden ocurrir en el uso normal y bien intencionado del sistema (un doble clic, un viaje que se corrige después de facturado, dos liquidaciones armadas casi al mismo tiempo). Eso es lo que los hace bloqueantes: no son mejoras de calidad, son condiciones para que los números que el sistema muestra sean confiables.

Los hallazgos P1-P3, en cambio, son reales pero no bloqueantes en el mismo sentido — degradan la robustez, la performance a futuro, o la experiencia de uso, sin comprometer directamente la exactitud del dinero que el sistema ya maneja hoy. Pueden resolverse en paralelo a un piloto ya iniciado, una vez resuelto P0.

**Alternativa si el negocio necesita empezar antes:** un piloto muy acotado (un solo cliente/transportista, con supervisión manual diaria de liquidaciones y cobranzas por parte de una persona del equipo, sin delegar esas revisiones al sistema) podría considerarse aceptable incluso antes de cerrar P0 — pero en ese caso la supervisión manual está haciendo el trabajo que el sistema todavía no garantiza, y no debería extenderse más allá de las primeras semanas.

---

*Este informe no incluyó ninguna corrección de código, commit ni push. Queda a la espera de aprobación explícita antes de iniciar cualquier etapa de corrección — se recomienda empezar por el Bloque 1 (control de acceso) del roadmap de la sección 4.*

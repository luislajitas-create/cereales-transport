# Bloque 5 — Auditoría Funcional Completa de Producto: SDC

Fecha: 2026-07-07. Documento de auditoría pura — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se hizo commit. Continúa después del cierre y push del Bloque 4 (`fa1a31f`, `cb42b66`, `f0e68a0`, ya en `origin/main`).

**Objetivo:** dejar de buscar bugs puntuales de negocio (ya cerrado en Bloques 1-4) y mapear qué hace falta para que SDC sea un producto de nivel profesional — UX, ingeniería de backend, modelo de datos, procesos de negocio y operación en producción.

**Metodología:** dos agentes de exploración en paralelo (frontend completo, backend con foco en performance/seguridad/mantenibilidad) más auditoría directa de `schema.prisma`, Dockerfiles, `railway.json`, `docker-compose.yml`, `README.md` y configuración de arranque. Todos los hallazgos están respaldados por referencias `archivo:línea` verificables.

**Cómo leer este documento:** cada hallazgo tiene Prioridad (P0 = urgente/crítico, P1 = alto valor a corto plazo, P2 = importante pero no urgente, P3 = mejora menor/cosmética), Impacto, Complejidad de resolución, Riesgo de no resolverlo, y Beneficio esperado. La numeración (F=Frontend, B=Backend, D=Datos, N=Negocio, P=Producción) se usa como referencia cruzada en `ROADMAP_BLOQUE5.md`.

---

## Resumen ejecutivo

| Prioridad | Cantidad de hallazgos | Concentración principal |
|---|---|---|
| P0 | 3 | Producción (posible despliegue de código desactualizado, entrypoint roto) + Seguridad (catálogos sin control de rol) |
| P1 | 24 | Backend (seguridad/observabilidad/mantenibilidad), Frontend (UX financiera), Negocio (cumplimiento), Producción (CI/CD, backups) |
| P2 | 24 | Frontend (accesibilidad/consistencia), Backend (duplicación/performance), Modelo de datos |
| P3 | 12 | Cosmético, deuda de limpieza de bajo riesgo |

**El hallazgo más importante de todo el documento es P-1** (sección Producción): hay evidencia concreta de que el `README.md` describe un despliegue basado en una estructura de carpetas (`app/backend`, `app/frontend`) que ya no es la actual, combinado con un entrypoint de arranque (`dist/main.js`) que no existe en el build real. Ninguno de los dos se puede descartar sin verificar manualmente el dashboard de Railway — se recomienda hacerlo antes de cualquier otra priorización.

---

## 1. Frontend (React 18 + Vite + TypeScript)

Alcance recorrido: `frontend/src/App.tsx`, `components/Layout.tsx`, `context/AuthContext.tsx`, `api/client.ts`, `styles.css`, y las 12 páginas de `frontend/src/pages/*.tsx`, cruzadas contra los controllers/DTOs del backend.

### F1. Falta sistemática de estado de carga / protección contra doble-submit

**Descripción:** fuera de 5 casos correctos ya identificados (`Login.tsx`, `ViajeForm.tsx`, `ViajeDetalle.tsx`, `Conciliacion.tsx`, y las descargas Excel/PDF de `Liquidaciones.tsx`), **ningún otro botón que dispara una escritura deshabilita su propio control mientras la request está en curso.** Inventario: "Crear liquidación", "Confirmar"/"Pagar"/"Anular" liquidación (`Liquidaciones.tsx:216,285-287`), "Crear factura" y "Anular factura" (`Facturas.tsx:134,197`), "Registrar" y "Anular" anticipo (`Anticipos.tsx:98,117`), altas de transportista/chofer/vehículo (`Transportistas.tsx:84,153,174`), alta de cliente (`Clientes.tsx:59`), alta en Catálogos (`Catalogos.tsx:91`, reutilizado por las 4 tabs).
**Evidencia:** ver detalle completo en el informe del agente (14 puntos con archivo:línea).
**Prioridad:** P1 — **Impacto:** Alto en Liquidaciones/Facturas (duplicación de documentos financieros ante doble clic o red lenta), Medio en datos maestros. **Complejidad:** Baja (patrón `useState` + `disabled` ya existe y probado en 5 páginas, es replicar). **Riesgo de no resolver:** liquidaciones/facturas/anticipos duplicados por doble clic, ya posible hoy sin ningún backend guard que lo prevenga (el backend no tiene idempotencia de request). **Beneficio esperado:** alto, cierre de un riesgo operativo real con esfuerzo bajo.

### F2. Errores de carga inicial sin manejar en 6 de 12 páginas

**Descripción:** `Facturas.tsx:20`, `Liquidaciones.tsx:24`, `Anticipos.tsx:19`, `Clientes.tsx:16`, `Transportistas.tsx:14`, `Catalogos.tsx:41`, y varias cargas de datos de referencia (`Viajes.tsx:28`, `Facturas.tsx:24`, `Anticipos.tsx:24-25`, `ViajeForm.tsx:36-48`) no tienen `.catch()`. Si la API falla o tarda, la tabla queda vacía indefinidamente sin ningún mensaje ni botón de reintento — indistinguible de "no hay datos".
**Prioridad:** P1 — **Impacto:** Alto (es el hallazgo más sistemático de todo el frontend; ante cualquier caída/lentitud de backend, la mitad de las páginas del sistema parecen vacías sin explicación). **Complejidad:** Baja (el patrón correcto ya existe en `Dashboard.tsx`/`Viajes.tsx`/`ViajeDetalle.tsx`, es replicar). **Riesgo:** confusión operativa y reintentos manuales de los usuarios sin saber si el sistema está caído. **Beneficio esperado:** alto, esfuerzo bajo.

### F3. `PATCH /viajes/:id` sin ningún consumidor en el frontend

**Descripción:** el endpoint de edición de viajes, con todas las reglas de bloqueo por facturación/liquidación ya construidas en el Bloque 4.1, **no tiene ningún formulario que lo invoque.** `ViajeDetalle.tsx` solo muestra los campos como texto y ofrece "Avanzar estado"/"Cancelar viaje".
**Prioridad:** P1 — **Impacto:** Alto (trabajo de backend ya hecho, invisible para el usuario final; corregir un dato mal cargado en un viaje hoy requiere acceso directo a la API o a la base). **Complejidad:** Media (requiere un formulario de edición nuevo, reusando la lógica de `ViajeForm.tsx` con los selects dependientes ya resueltos). **Riesgo de no resolver:** operadores sin forma de corregir errores de carga, presión para pedir accesos directos a la base de datos. **Beneficio esperado:** alto.

### F4. Datos de cumplimiento (vencimiento de RTO, seguro, licencia de conducir) no capturables desde ningún formulario

**Descripción:** el modelo soporta `Vehiculo.vencimientoRto`, `vencimientoSeguro`, `Chofer.licenciaVencimiento`, pero ni el alta de vehículo (`Transportistas.tsx:165-175`) ni la de chofer (`Transportistas.tsx:148-152`) los incluyen, y no hay edición de ninguno de los dos.
**Prioridad:** P1 — **Impacto:** Alto (riesgo de cumplimiento normativo real para una empresa de transporte: no hay forma de saber, desde el sistema, si un vehículo/chofer asignado a un viaje tiene documentación vencida). **Complejidad:** Baja (agregar 2-3 campos de fecha a formularios ya existentes). **Riesgo:** viajes asignados con documentación vencida sin ninguna alerta. **Beneficio esperado:** alto, esfuerzo bajo — también ver N2 (Negocio).

### F5. Anulación individual de cobranza sin UI (endpoint del Bloque 4.3 huérfano)

**Descripción:** `POST /facturas/:id/cobranzas/:cobranzaId/anular` no tiene ningún botón — la tabla de cobranzas en `Facturas.tsx:178-185` es de solo lectura.
**Prioridad:** P2 — **Impacto:** Medio (una cobranza mal cargada no se puede corregir desde la UI, aunque el backend ya lo soporta). **Complejidad:** Baja. **Beneficio esperado:** medio-alto, cierra el ciclo de una funcionalidad ya construida.

### F6. Endpoints de edición/baja de catálogos maestros sin ninguna UI

**Descripción:** `PATCH`/`DELETE` de clientes, transportistas, choferes (más allá de `comisionPct`), vehículos y productores no tienen consumidor. No se puede editar CUIT, razón social, contactos de cliente, ni dar de baja un cliente/transportista desde la interfaz.
**Prioridad:** P2 — **Impacto:** Medio-alto (un error de tipeo en un CUIT queda fijo salvo acceso directo a la base). **Complejidad:** Media (varios formularios de edición pequeños). **Beneficio esperado:** medio-alto.

### F7. Exportación Excel/PDF inconsistente entre módulos

**Descripción:** existe en el backend para Facturas, Anticipos, Clientes, Transportistas, Choferes, pero **solo Liquidaciones tiene botón en el frontend.**
**Prioridad:** P2 — **Impacto:** Medio (funcionalidad ya construida e invisible). **Complejidad:** Baja (agregar botones, el patrón ya existe en Liquidaciones). **Beneficio esperado:** medio.

### F8. Filtros construidos en el backend pero no expuestos en el frontend

**Descripción:** el caso más flagrante es Anticipos — el backend soporta `choferId`, `transportistaId`, `desde`, `hasta`, `liquidado`, `anulado` como filtros (`anticipos.controller.ts:33-56`) y el frontend no usa ninguno, trayendo siempre el historial completo. Viajes no expone `transportistaId`/`cerealId` pese a ser columnas visibles en la tabla. Liquidaciones y Facturas no tienen ningún filtro en su listado principal pese a que el backend los soporta (`transportistaId`, `choferId`, `estado`, `tipo` / `clienteId`, `estado`, `desde`, `hasta`).
**Prioridad:** P2 — **Impacto:** Medio-alto en Anticipos (a medida que crece el historial, no poder filtrar por chofer/fecha es una limitación operativa real). **Complejidad:** Baja-media (los patrones de filtro ya existen en `Viajes.tsx`, es replicar). **Beneficio esperado:** alto para Anticipos en particular.

### F9. Confirmación de acciones destructivas inconsistente

**Descripción:** "Cancelar viaje" y "Anular anticipo" piden un motivo vía `window.prompt`; **"Anular factura" (`Facturas.tsx:197`) y "Anular"/"Confirmar"/"Pagar" liquidación (`Liquidaciones.tsx:285-287`) no tienen ningún paso de confirmación** — el clic ejecuta la anulación inmediatamente.
**Prioridad:** P1 — **Impacto:** Alto (un clic accidental anula un documento financiero sin ningún paso intermedio). **Complejidad:** Baja (replicar el patrón de `window.prompt` ya usado en otras páginas, o mejor, un modal de confirmación simple). **Beneficio esperado:** alto, esfuerzo bajo.

### F10. Sin sistema de notificaciones de éxito

**Descripción:** la clase `.success-banner` (`styles.css:98`) está definida pero **nunca se usa.** Ninguna acción de creación/edición/confirmación en toda la app muestra un mensaje de éxito explícito — todas vacían el formulario y refrescan la lista en silencio.
**Prioridad:** P2 — **Impacto:** Medio (en listas largas sin paginación, un usuario puede no notar si su alta fue exitosa). **Complejidad:** Baja. **Beneficio esperado:** medio.

### F11. Validación client-side ausente o inconsistente

**Descripción:** cero atributos `min`/`maxLength`/`pattern` en toda la aplicación. CUIT no se valida en formato en ningún punto (ni frontend ni backend). El formulario de "Nueva factura" es el único de alta sin `required` en ningún campo.
**Prioridad:** P2 — **Impacto:** Medio (feedback tardío — el usuario solo se entera de un dato inválido tras el rechazo del backend). **Complejidad:** Baja. **Beneficio esperado:** medio.

### F12. Accesibilidad: sin asociación label-input, sin `aria-*`, contraste insuficiente

**Descripción:** cero `htmlFor`/`id` asociando labels con inputs en las 12 páginas. Cero atributos `aria-*` en toda la aplicación. Tres badges de estado (`EN_CARGA`, `PENDIENTE_DE_FACTURAR`, `COBRADO_PARCIAL`) con contraste ≈3.25:1, por debajo del mínimo WCAG AA (4.5:1). Dos estados de viaje (`ASIGNADO`, `EN_TRANSITO`) comparten el mismo color de badge.
**Prioridad:** P2 — **Impacto:** Medio (uso interno, pero afecta legibilidad y cumplimiento de accesibilidad si el sistema crece o se audita formalmente). **Complejidad:** Baja-media. **Beneficio esperado:** medio.

### F13. Navegación: sin breadcrumbs, sin ruta 404, roles ocultos en sidebar sin aplicación real

**Descripción:** `Layout.tsx` oculta links según rol, pero **`App.tsx` no aplica ningún guard de ruta por rol** — cualquier usuario autenticado puede navegar manualmente a `/catalogos` y operarlo igual (esto además coincide con el hallazgo de seguridad B8: el backend tampoco protege esos endpoints por rol). Sin ruta 404, sin `document.title` dinámico por página.
**Prioridad:** P2 (UX) — ligado a B8 (P0, seguridad real). **Impacto:** Medio como problema de UX aislado, pero es la superficie visible de un problema de seguridad más serio. **Complejidad:** Baja (agregar guard de rutas). **Beneficio esperado:** medio-alto, sobre todo una vez cerrado B8.

### F14. Bug funcional puntual: typo `detalle.numerl` en Liquidaciones

**Descripción:** el título del detalle de liquidación usa `detalle.numerl` (`Liquidaciones.tsx:245`), probablemente un typo de `detalle.numero` (que sí se usa correctamente para el nombre del archivo descargado, líneas 279/282) — el encabezado del detalle mostraría `undefined` en vez del número real de liquidación.
**Prioridad:** P2 — **Impacto:** Medio (visible al usuario, pero cosmético, no afecta datos). **Complejidad:** Trivial (una palabra). **Beneficio esperado:** alto relativo al esfuerzo (arreglo de un carácter).

### F15. Estados de carga inconsistentes / mensajes "sin resultados" engañosos durante la carga

**Descripción:** `Viajes.tsx:100-102` y `Conciliacion.tsx:93` muestran "No hay resultados" también mientras la petición inicial todavía está en curso, generando un falso negativo visible por 1-2 segundos en cada carga. Cambio de tab en `Catalogos.tsx` no limpia los datos previos antes de la nueva carga (se ven filas del tab anterior con las columnas del tab nuevo, brevemente).
**Prioridad:** P3 — **Impacto:** Bajo-medio, transitorio. **Complejidad:** Baja. **Beneficio esperado:** bajo-medio.

### F16. Consistencia visual: estilos inline puntuales, reutilización semántica incorrecta de clases

**Descripción:** formularios de alta de chofer/vehículo reutilizan la clase `.filters` (pensada para bloques de búsqueda). Varios `style={{...}}` inline hardcodeados en vez de clases del sistema (`Liquidaciones.tsx:165`, `Transportistas.tsx:89,114,152`, `Facturas.tsx:188`).
**Prioridad:** P3 — **Impacto:** Bajo. **Complejidad:** Baja. **Beneficio esperado:** bajo, mejora de mantenibilidad del CSS.

### F17. Dashboard sin drill-down

**Descripción:** los KPIs del Dashboard (facturas vencidas, pendientes de facturar, etc.) no son clicables hacia la vista filtrada correspondiente.
**Prioridad:** P2 — **Impacto:** Medio (oportunidad de navegación perdida en la pantalla de entrada más usada). **Complejidad:** Baja-media. **Beneficio esperado:** medio — ver también N7 (Negocio).

### F18. Sin buscador de texto libre ni paginación en tablas grandes

**Descripción:** ningún listado (Viajes, Facturas, Liquidaciones, Anticipos) tiene buscador por número/CTG/carta de porte, y ninguno pagina (consistente con el backend, ver B1). Los filtros tampoco persisten entre navegaciones (sin `useSearchParams` en todo el proyecto).
**Prioridad:** P2/P3 — **Impacto:** Bajo hoy (volumen de datos chico), alto a 6-12 meses de uso productivo. **Complejidad:** Media (requiere backend + frontend coordinados, ver B1). **Beneficio esperado:** alto a mediano plazo, bajo impacto inmediato — priorizar cuando el volumen real lo justifique.

---

## 2. Backend (NestJS + Prisma)

Alcance recorrido: los 9 módulos activos de `backend/src`, más confirmación de que `_combustibles.disabled` (953 líneas) y `app/backend/` (copia vieja, último commit 2026-06-27, muy anterior al Bloque 4) siguen sin afectar nada activo.

### B1. Ningún endpoint de listado pagina — 17 confirmados

**Descripción:** `GET /viajes`, `/viajes/pendientes-facturar`, `/facturas`, `/facturas/conciliacion`, `/anticipos`, `/liquidaciones`, `/liquidaciones/candidatos`, `/clientes`, `/clientes/:id/cuenta-corriente`, `/choferes`, `/transportistas`, `/vehiculos`, `/cereales`, `/ubicaciones`, `/tipos-gasto`, `/productores`, `/usuarios` — ninguno usa `skip`/`take`. Los 6 exports Excel/PDF tampoco tienen tope superior.
**Datos de dimensionamiento real (seed):** hoy 5 viajes, 4 anticipos, 1 factura, 1 cobranza, 0 liquidaciones, 2 clientes, 2 transportistas.
**Prioridad:** P2 (hoy el riesgo es bajo/nulo dado el volumen; escala a P1 según crezca el uso real). **Impacto:** bajo hoy, alto a 6-12 meses de operación diaria (10-50 viajes/día). **Complejidad:** Media (requiere coordinar backend + frontend, más decisión de UX sobre cómo paginar). **Riesgo:** degradación de performance progresiva, sin un evento único que lo dispare — el tipo de deuda que se nota tarde. **Beneficio esperado:** alto a mediano plazo.

### B2. Loops secuenciales de escritura dentro de transacciones, reemplazables por `updateMany`/`createMany`

**Descripción:** `facturas.controller.ts:292-305` (`create()`), `:320-322` (`anular()`), `liquidaciones.controller.ts:399-423` (`create()`, viajes), `:425-447` (`create()`, anticipos), `:484-486` (`pagar()`), `:504-506` (`anular()`) — todos iteran con `await` secuencial dentro de un loop en vez de una sola operación por lote. Con una factura/liquidación de decenas de viajes, son decenas de round-trips secuenciales a la base dentro de una misma transacción.
**Prioridad:** P2 — **Impacto:** Medio (hoy los lotes son chicos; una facturación mensual consolidada por cliente puede agrupar fácilmente decenas de viajes). **Complejidad:** Media (requiere adaptar la verificación de concurrencia por-fila, que hoy depende de comparar `count` contra la cantidad esperada por cada `updateMany` individual, a un solo `updateMany` masivo con la misma verificación). **Beneficio esperado:** medio-alto, mejora directa de latencia percibida al facturar/liquidar en lote.

### B3. Agregaciones en memoria en vez de `aggregate`/`groupBy` de Prisma

**Descripción:** `dashboard.controller.ts:26` trae todas las filas de `viajesMes` con `select` y suma en JavaScript en vez de usar `aggregate`.
**Prioridad:** P3 — **Impacto:** bajo hoy, medio a futuro (el Dashboard se llama en cada carga de pantalla). **Complejidad:** Baja. **Beneficio esperado:** bajo-medio.

### B4. `cuentaCorriente()` sin límite de fecha ni paginación

**Descripción:** `clientes.controller.ts:142-163` trae todas las facturas + cobranzas históricas de un cliente sin ningún filtro de fecha, calculando el libro mayor completo en memoria en cada request.
**Prioridad:** P2 — **Impacto:** medio (crecerá sin cota con la antigüedad del cliente). **Complejidad:** Baja (agregar filtro de período opcional). **Beneficio esperado:** medio.

### B5. Lógica duplicada entre controllers — 4 patrones, conteo exacto

**Descripción:** función `fmtMoney` copiada idéntica 4 veces (`facturas`, `liquidaciones`, `anticipos`, `clientes` controllers); construcción de filtro de rango de fechas repetida 10 veces; bloque completo de export Excel repetido en 6 controllers; bloque completo de export PDF con tabla manual repetido en 5 controllers (mismo código, solo cambian nombres de columna/anchos).
**Prioridad:** P2 — **Impacto:** Medio (mantenibilidad — un cambio de formato de exportación hoy requiere tocar 5-6 archivos). **Complejidad:** Media (extraer a `common/`: helpers de fecha, `fmtMoney`, y una función genérica `renderExcelSheet`/`renderPdfTable`). **Beneficio esperado:** alto en mantenibilidad futura, especialmente si se agregan más módulos.

### B6. Doble validación redundante DTO + controller

**Descripción:** 6+ puntos donde el controller repite manualmente una validación que el DTO ya garantiza vía `class-validator` (`facturas.controller.ts:259-264,330-332`; `liquidaciones.controller.ts:325-330`; `anticipos.controller.ts:207-209,251`).
**Prioridad:** P3 — **Impacto:** Bajo en runtime, riesgo de mantenibilidad si DTO y controller divergen. **Complejidad:** Baja (eliminar la validación redundante). **Beneficio esperado:** bajo, limpieza menor.

### B7. Código muerto y contratos de API engañosos

**Descripción:** `fmtMoney` sin uso en `clientes.controller.ts:10-12` (el export de clientes no formatea importes). **`UpdateClienteDto.contactos` se valida pero se descarta silenciosamente** en el controller (`clientes.controller.ts:39-42`) — un `PATCH` que envía `contactos` pasa la validación pero no tiene ningún efecto, sin ningún error que lo indique. `@nestjs/config` instalado pero nunca importado.
**Prioridad:** P2 (por el caso de `contactos`, que es un contrato de API engañoso) — **Impacto:** Medio (puede confundir a un futuro desarrollador o integración que asuma que el campo funciona). **Complejidad:** Baja. **Beneficio esperado:** medio, cierra una fuente de confusión futura.

### B8. SEGURIDAD — Todo el módulo `catalogos` sin `RolesGuard` (15 endpoints mutantes)

**Descripción:** `clientes`, `vehiculos`, `choferes`, `transportistas` y `simples` (cereales/ubicaciones/tipos-gasto/productores) controllers solo aplican `JwtAuthGuard` (autenticación), **sin `RolesGuard` ni `@Roles(...)` en ningún método** — a diferencia de `viajes`, `anticipos`, `facturas` y `liquidaciones`, que sí lo aplican consistentemente. Esto significa que **cualquier usuario autenticado, incluido el rol `LECTURA`** (pensado explícitamente como solo-consulta), puede crear/editar/dar de baja clientes, transportistas, choferes, vehículos y catálogos maestros vía API directa. 15 endpoints afectados con archivo:línea exacto en el informe del agente.
**Prioridad:** **P0** — **Impacto:** Alto (control de acceso roto en un módulo completo, con datos maestros que alimentan facturación/liquidación). **Complejidad:** Baja (agregar `@Roles(...)` siguiendo el patrón ya usado en los otros 4 controllers — es mecánico, no requiere diseño). **Riesgo de no resolver:** cualquier cuenta comprometida o mal configurada (incluso de solo-lectura) puede alterar datos maestros sin dejar rastro de que no debería poder hacerlo. **Beneficio esperado:** muy alto relativo al esfuerzo — el fix más barato de todo el documento con el mayor impacto de seguridad.

### B9. `JWT_SECRET` con fallback hardcodeado

**Descripción:** `auth.module.ts:12` y `jwt.strategy.ts:11` usan `process.env.JWT_SECRET || "dev-secret-change-me"` — si la variable de entorno falta en el entorno real, la app arranca silenciosamente con un secreto público y conocido en vez de fallar rápido.
**Prioridad:** P1 — **Impacto:** Alto si ocurre (tokens JWT falsificables), pero depende de un error de configuración externo al código. **Complejidad:** Baja (falla explícita al arrancar si falta la variable, en vez de fallback). **Beneficio esperado:** alto, cierra una clase entera de riesgo de configuración.

### B10. CORS wildcard + `credentials:true` como fallback

**Descripción:** `main.ts:9` — `origin: process.env.CORS_ORIGIN || "*"` combinado con `credentials: true`. Combinación inválida según la spec CORS que en la práctica algunos clientes no-browser podrían no respetar.
**Prioridad:** P2 — **Impacto:** Medio (mitigado en la práctica por comportamiento de navegadores modernos, pero es una configuración frágil). **Complejidad:** Baja (mismo tratamiento fail-fast que B9). **Beneficio esperado:** medio.

### B11. Sin rate-limiting — login vulnerable a fuerza bruta

**Descripción:** `POST /auth/login` no tiene ningún límite de intentos. No hay `@nestjs/throttler` ni ninguna librería equivalente en el proyecto.
**Prioridad:** P1 — **Impacto:** Alto si el sistema queda expuesto públicamente (que es el caso, según el README, con dominio público de Railway). **Complejidad:** Baja (`@nestjs/throttler` es una integración estándar de pocas líneas). **Beneficio esperado:** alto, esfuerzo bajo.

### B12. Configuración débil de TypeScript

**Descripción:** `tsconfig.json` con `strictNullChecks: false`, `noImplicitAny: false` (default del scaffold de Nest, nunca endurecido). 32 usos de `: any` en código activo.
**Prioridad:** P3 — **Impacto:** Bajo-medio (reduce garantías de tipo, pero no es un bug activo). **Complejidad:** Alta si se quiere endurecer retroactivamente (requeriría revisar los 32 puntos y probablemente más que emerjan al activar `strictNullChecks`). **Beneficio esperado:** medio a largo plazo, mejor abordarlo gradualmente o en código nuevo, no como proyecto único.

### B13. Observabilidad: sin logging estructurado, sin catch-all de excepciones, health check no verifica la DB

**Descripción:** solo 2 líneas de `console.*` en todo el backend activo. `PrismaExceptionFilter` solo captura errores de Prisma — cualquier excepción no prevista (`TypeError`, error de `ExcelJS`/`PDFKit`, etc.) cae en el manejador default de Nest sin logging centralizado. `GET /health` devuelve un objeto estático sin verificar conectividad real a PostgreSQL. Sin métricas, sin integración con ningún servicio de observabilidad.
**Prioridad:** P1 — **Impacto:** Alto (hoy, un error 500 en producción es invisible salvo que alguien esté mirando los logs crudos de Railway en tiempo real). **Complejidad:** Media (agregar un logger estructurado + un `AllExceptionsFilter` + un health check real con `@nestjs/terminus` son cambios acotados, pero varios). **Beneficio esperado:** alto — es la diferencia entre notar un problema en producción en minutos vs. no notarlo hasta que un usuario se queja.

### B14. `AuditLog` desigual — solo 2 de las mutaciones relevantes dejan rastro

**Descripción:** solo la anulación de cobranza (Bloque 4.3) y el override de `comisionPct` (Bloque 3.2) escriben en `AuditLog`. Anulación de anticipos, confirmación/pago/anulación de liquidaciones, anulación de facturas, y toda edición de catálogos no dejan ningún rastro. Además, `Cliente` no tiene `updatedAt`, y `Chofer`/`Vehiculo` no tienen ni `createdAt` ni `updatedAt` en el schema.
**Prioridad:** P2 — **Impacto:** Medio-alto para una auditoría contable/legal futura (quién cambió qué y cuándo en datos maestros o en transiciones financieras es hoy irreconstruible fuera de los 2 casos cubiertos). **Complejidad:** Media (extender el patrón ya usado a los puntos faltantes, más 2 columnas de timestamp en el schema). **Beneficio esperado:** alto para trazabilidad, esfuerzo moderado.

### B15. Acoplamiento por escritura cruzada sin capa de servicio — confirmado, sin mejora desde `BACKEND_REVIEW.md`

**Descripción:** `LiquidacionesController` y `FacturasController` siguen escribiendo directo sobre `Viaje`/`AnticipoGasto`. Ningún módulo de negocio tiene una capa `*.service.ts` (solo `AuthModule` la tiene). `liquidaciones.controller.ts` es el archivo más grande del backend (558 líneas), mezclando CRUD, exports, orquestación de transacciones, cálculo de comisiones y lógica de compatibilidad legacy en una sola clase — esto **empeoró en términos absolutos** desde la última revisión arquitectónica, porque se le siguió agregando lógica sin extraer nada.
**Prioridad:** P2 — **Impacto:** Medio a corto plazo (funciona), alto a mediano plazo si el equipo de desarrollo crece o el sistema gana más reglas de negocio (cada característica nueva se apila sobre la misma clase). **Complejidad:** Alta (introducir una capa de servicio es un refactor transversal, no un fix puntual). **Beneficio esperado:** alto a mediano plazo, pero es el tipo de trabajo que conviene planificar como iniciativa propia, no intercalarlo con features.

### B16. Inconsistencia de manejo "no encontrado" entre módulos

**Descripción:** `viajes`, `facturas`, `liquidaciones`, `anticipos` lanzan `NotFoundException` explícito. `clientes`, `choferes`, `transportistas` (`findOne`) devuelven `200 OK` con body `null` si el id no existe.
**Prioridad:** P3 — **Impacto:** Bajo-medio (inconsistencia de contrato de API, puede confundir a un consumidor). **Complejidad:** Baja. **Beneficio esperado:** medio, mejora de consistencia de API.

### B17. CRUD asimétrico en catálogos simples

**Descripción:** `vehiculos` no tiene `GET /:id`; `simples.controller.ts` (cereales, ubicaciones, tipos-gasto) no tiene `GET/PATCH/DELETE /:id` para ninguno de los tres (solo `productores` tiene `PATCH`).
**Prioridad:** P3 — **Impacto:** Bajo. **Complejidad:** Baja-media. **Beneficio esperado:** bajo-medio, mejora de completitud de API.

### B18. Soft-delete incompleto — `findAll` no filtra `activo:true`

**Descripción:** `clientes.controller.ts:19-22` y `transportistas.controller.ts:15-21` no filtran por `activo:true` por defecto — un registro "dado de baja" (`DELETE` → `activo:false`) sigue apareciendo en todos los listados y exports, y sigue siendo seleccionable para crear nuevos viajes/facturas. **Este ítem ya estaba marcado como "Crítico antes de producción" en `ROADMAP_SDC_V1.md` y nunca se implementó.**
**Prioridad:** P1 (reincidencia de un ítem ya marcado crítico) — **Impacto:** Alto (un cliente/transportista dado de baja sigue operable en la práctica). **Complejidad:** Baja (agregar `where: {activo: true}` por defecto, con opción de incluir inactivos vía query param). **Beneficio esperado:** alto, esfuerzo bajo — debería priorizarse esta vez dado que ya se pospuso una vez.

### B19. Cero tests automatizados en todo el backend

**Descripción:** ningún `*.spec.ts`/`*.e2e-spec.ts`, ningún `jest.config`, sin script `"test"` en `package.json`, pese a tener `@nestjs/testing` instalado sin usar.
**Prioridad:** P1 — **Impacto:** Alto (cualquier regresión se detecta solo manualmente o por un usuario real; los Bloques 3-4 se validaron 100% a mano). **Complejidad:** Alta (empezar de cero requiere decidir alcance: ¿e2e por módulo, unit de las reglas de negocio más críticas, o ambos?). **Beneficio esperado:** muy alto a mediano plazo, pero es una inversión, no un fix — conviene arrancar acotado (los flujos financieros críticos primero: liquidaciones, facturas, cobranzas) en vez de intentar cobertura total de una vez.

---

## 3. Modelo de datos (`schema.prisma`)

### D1. Índices faltantes en los campos más consultados del sistema

**Descripción:** `Viaje.estadoFacturacion` y `Viaje.estadoLiquidacion` — los campos de filtro central de `candidatos()`, `create()` de liquidaciones, `create()`/`conciliacion()` de facturas, `pendientes-facturar` — **no tienen ningún índice**, ni siquiera compuesto con `estado` (que sí está indexado solo). Estas consultas (`estado:"DESCARGADO", estadoFacturacion:"PENDIENTE_DE_FACTURAR"` / `estadoLiquidacion:"PENDIENTE"`) son los query paths más frecuentes de todo el sistema.
**Prioridad:** P1 — **Impacto:** Bajo hoy (poco volumen), alto a mediano plazo (es exactamente el tipo de índice que se nota cuando ya es doloroso agregarlo, porque para entonces la tabla ya es grande). **Complejidad:** Baja (agregar `@@index([estado, estadoFacturacion])` y `@@index([estado, estadoLiquidacion])` es una migración trivial, sin backfill). **Beneficio esperado:** alto, esfuerzo mínimo — es la mejora de performance más barata de todo el documento.

### D2. Índice faltante en `AnticipoGasto.viajeId`

**Descripción:** solo existen índices compuestos `[choferId, fecha]` y `[transportistaId, fecha]` — el lookup por `viajeId` (usado en `ViajesController.findOne()` para traer los anticipos de un viaje) no tiene índice propio.
**Prioridad:** P3 — **Impacto:** Bajo hoy. **Complejidad:** Baja. **Beneficio esperado:** bajo-medio a futuro.

### D3. Enums duplicados: `EstadoFacturacionEnum` (Viaje) vs. `EstadoFacturaEnum` (Factura)

**Descripción:** dos enums que representan el mismo concepto de negocio (estado de facturación) sobre dos entidades distintas, sin ninguna garantía de sincronía a nivel de base — ya señalado en `BACKEND_REVIEW.md` y `ROADMAP_SDC_V1.md` v1.1, nunca resuelto. Cada bloque de trabajo de este proyecto (incluidos 4.1-4.3) tuvo que manejar cuidadosamente la diferencia entre ambos.
**Prioridad:** P1 — **Impacto:** Alto (fuente de confusión recurrente y de bugs sutiles si algún día un desarrollador asume que son intercambiables). **Complejidad:** Media-alta (unificarlos requiere decidir un único enum superset y migrar ambas columnas, revisando cada punto del código que los usa). **Beneficio esperado:** alto, simplifica el modelo mental de todo el sistema de facturación.

### D4. Clasificación de anticipos por coincidencia de texto libre, no por campo explícito

**Descripción:** `esAdelanto()`/`categorizarAnticipo()` en `liquidaciones.controller.ts` clasifican gastos buscando substrings (`"segur"`, `"efectivo"`, `"combustible"`, etc.) sobre `TipoGasto.nombre` — un campo de catálogo de texto libre. Ya señalado como deuda explícita en `BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` §0 ("fuera de alcance"), nunca resuelto.
**Prioridad:** P1/P2 — **Impacto:** Alto si alguien renombra un `TipoGasto` de forma que ya no matchee ningún patrón (la liquidación lo categorizaría mal silenciosamente, sin error). **Complejidad:** Media (agregar un campo explícito, ej. `TipoGasto.categoria` enum, y migrar los datos existentes según el matching actual como backfill único). **Beneficio esperado:** alto, elimina una fuente de fragilidad silenciosa en cálculos financieros.

### D5. `Cobranza.medioPago` como texto libre — inconsistencia ya observada en datos reales

**Descripción:** durante las pruebas manuales de este mismo proyecto se observaron valores como `"Transferencia"`, `"Transferencia bancaria"` y `"Efectivo"` coexistiendo como strings distintos para el mismo concepto — confirma en la práctica el riesgo de que cualquier reporte futuro agrupado por medio de pago quede fragmentado.
**Prioridad:** P2 — **Impacto:** Medio (afecta reportería futura, no la operación actual). **Complejidad:** Baja-media (convertir a enum + backfill de los valores existentes, mapeo manual dado que son pocos valores distintos hoy). **Beneficio esperado:** medio, mejora la confiabilidad de reportes por medio de pago.

### D6. `Ubicacion` sin constraint de duplicados — diseñado en Bloque 3, nunca implementado

**Descripción:** el diseño de `BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` §2 propuso un índice único por expresión (`COALESCE(localidad,'')`) para `Ubicacion.nombre` — nunca se implementó (a diferencia de `Productor.cuit` y `Chofer.dni`, que sí quedaron únicos).
**Prioridad:** P2 — **Impacto:** Medio (mismo lugar cargado dos veces con distinto ID, fragmentando reportes de origen/destino). **Complejidad:** Media (requiere el mismo SQL manual por expresión ya diseñado, o la alternativa más simple de hacer `localidad` obligatoria). **Beneficio esperado:** medio.

### D7. Sin `CHECK` constraints a nivel de base de datos

**Descripción:** ningún valor numérico (`toneladas`, `importe`, etc.) tiene una restricción de positividad a nivel de Postgres — depende 100% de `@IsPositive()` en los DTOs, que no protege contra escrituras que no pasen por esa capa (scripts, futuras integraciones).
**Prioridad:** P3 — **Impacto:** Bajo hoy (todo el tráfico pasa por los DTOs). **Complejidad:** Baja-media (constraints simples, no requieren SQL exótico). **Beneficio esperado:** bajo-medio, defensa en profundidad.

### D8. Montos financieros en `Float`, no `Decimal`

**Descripción:** todos los campos monetarios (`Viaje.importeTotal`, `Factura.importe`, `Cobranza.importe`, etc.) son `Float`. Ya mitigado parcialmente con una tolerancia de redondeo en las validaciones de cobranzas (Bloque 4.3), pero sigue siendo una decisión de modelado estructural con riesgo de precisión en agregaciones a gran escala o auditorías contables estrictas.
**Prioridad:** P1 — **Impacto:** Alto en potencial (es dinero), pero mitigado en la práctica hoy. **Complejidad:** Alta (cambiar el tipo de columna es una migración invasiva que toca todos los módulos financieros y requiere revisar cada cálculo). **Beneficio esperado:** alto a largo plazo, pero de los cambios más costosos del documento — mejor evaluarlo como iniciativa propia si el volumen/escrutinio contable lo justifica, no como parte de otro bloque.

### D9. `Ubicacion.localidad` como texto libre, sin catálogo geográfico

**Descripción:** sin relación a una tabla de provincias/localidades — impide reportería consistente por zona/provincia (relevante para una gerencia de logística de granos) y es susceptible a typos que fragmentan el dato (ej. "Pergamino" vs. "pergamino").
**Prioridad:** P2/P3 — **Impacto:** Medio para valor de negocio (reportería gerencial), bajo urgencia operativa. **Complejidad:** Media (requiere un catálogo nuevo + migración de datos existentes). **Beneficio esperado:** medio, ligado a N7 (Dashboard gerencial).

### D10. `Cliente.condicionesComerciales` como texto libre sin estructura

**Descripción:** ya señalado en `ROADMAP_SDC_V1.md` v1.2 como ítem futuro — sigue sin resolver, sin cambios desde entonces.
**Prioridad:** P3 — **Impacto:** Bajo. **Complejidad:** Media. **Beneficio esperado:** bajo-medio.

### D11. `Liquidacion.transportistaId`/`choferId` — polimorfismo informal sin garantía a nivel de schema

**Descripción:** ambos campos nullable, la regla "exactamente uno debe estar presente según `tipo`" solo se aplica en código de aplicación, no en el schema. Ya señalado en `ROADMAP_SDC_V1.md` v1.2 ("polimorfismo de Liquidacion"), sin cambios.
**Prioridad:** P3 — **Impacto:** Bajo (el código de aplicación ya lo respeta consistentemente). **Complejidad:** Alta si se quisiera modelar formalmente (requeriría repensar la relación). **Beneficio esperado:** bajo, no urgente.

---

## 4. Negocio

### N1. Numeración de Factura manual, no autogenerada — inconsistente con Viaje/Liquidación

**Descripción:** `Factura.numero` es un campo de texto tipeado a mano en el formulario de alta (`Facturas.tsx`, sin siquiera `required`), mientras que `Viaje.numeroViaje` y `Liquidacion.numero` se autogeneran (`@default(autoincrement())`). Un error de tipeo o dos personas cargando el mismo número casi simultáneamente son escenarios reales hoy.
**Prioridad:** P1 — **Impacto:** Alto (riesgo de colisión/error en un dato que además puede necesitar alinearse con la numeración fiscal real, ver N4). **Complejidad:** Depende de la respuesta a N4 — si el número debe reflejar una numeración fiscal externa (AFIP), autogenerar ciegamente no sirve; si es solo un identificador interno, es un cambio simple. **Beneficio esperado:** alto, pero requiere primero resolver la pregunta abierta de N4.

### N2. Vencimientos de documentación sin ningún proceso de alerta

**Descripción:** aun si se resolviera F4 (capturar los vencimientos desde la UI), hoy no existiría ningún mecanismo que avise antes de que venzan — ni en el Dashboard, ni por email, ni como bloqueo al asignar un vehículo/chofer vencido a un viaje nuevo.
**Prioridad:** P1 — **Impacto:** Alto (riesgo legal/operativo real para una empresa de transporte de cargas). **Complejidad:** Media (requiere F4 resuelto primero, más una consulta periódica o un chequeo al crear el viaje). **Beneficio esperado:** alto, es un control de cumplimiento hoy completamente ausente.

### N3. Sin gestión de usuarios vía UI/API

**Descripción:** ya señalado como fuera de alcance de v1.0 en `ROADMAP_SDC_V1.md`, sigue pendiente — altas de usuario siguen siendo manuales en la base de datos.
**Prioridad:** P2 — **Impacto:** Medio (limita la autonomía operativa para incorporar nuevos usuarios sin intervención técnica directa). **Complejidad:** Media. **Beneficio esperado:** medio.

### N4. Pregunta abierta: ¿el módulo "Factura" reemplaza o complementa la facturación fiscal real (AFIP)?

**Descripción:** el sistema no integra CAE ni tipos de comprobante fiscal — `Factura` es hoy un registro de seguimiento interno. Si la empresa ya emite comprobantes fiscales por otro medio (facturador externo, AFIP directo) y este módulo es solo tracking interno de cobranza, no hace falta nada más. Si se espera que este sistema sea la fuente de verdad de la facturación real, es una brecha de alcance importante que condiciona varias otras decisiones (numeración, formato de exportación, integración con AFIP).
**Prioridad:** P2 — no se puede priorizar sin una respuesta de negocio. **Impacto:** Potencialmente muy alto según la respuesta. **Complejidad:** Depende enteramente del alcance real. **Recomendación:** aclarar esto antes de invertir en N1 o en reportes de facturación más sofisticados.

### N5. Reportes pasivos en vez de alertas proactivas

**Descripción:** conciliación y facturas vencidas existen como reportes que hay que ir a consultar, no como notificaciones activas.
**Prioridad:** P2 — **Impacto:** Medio (valor agregado, no urgencia). **Complejidad:** Media (requiere definir canal de notificación — email, badge en Dashboard, etc.). **Beneficio esperado:** medio-alto, mejora la proactividad operativa.

### N6. Sin importación masiva de datos

**Descripción:** toda la carga de viajes/anticipos es manual, fila por fila, sin opción de importar desde CSV/Excel.
**Prioridad:** P3 — **Impacto:** Bajo-medio (depende del volumen real de operación diaria). **Complejidad:** Media-alta. **Beneficio esperado:** medio, condicionado al volumen real de la operación.

### N7. Dashboard sin herramientas gerenciales reales

**Descripción:** 6 KPIs estáticos, sin tendencias, sin comparación mes a mes, sin ranking de clientes/transportistas, sin gráficos — pese a existir un rol `GERENCIA` dedicado.
**Prioridad:** P2 — **Impacto:** Medio-alto para el rol Gerencia específicamente (es su única vista dedicada y hoy ofrece poco más que lo que ya ven Operaciones/Facturación). **Complejidad:** Media-alta (requiere definir qué métricas realmente le importan a Gerencia, no solo agregar gráficos por agregar). **Beneficio esperado:** alto si se define bien el alcance con el usuario Gerencia real.

### N8. Sin portal de autoservicio para transportistas/clientes

**Descripción:** hoy todo pasa por el personal interno — un transportista no puede ver sus propias liquidaciones, un cliente no puede ver sus propias facturas, sin pedirlo por teléfono/email.
**Prioridad:** P3 — **Impacto:** Medio a largo plazo (reduce carga operativa de consultas repetitivas), bajo/nulo a corto plazo. **Complejidad:** Alta (requiere un modelo de acceso externo completo, autenticación de terceros, etc.). **Beneficio esperado:** medio-alto a largo plazo, pero es una iniciativa de producto propia, no un ajuste incremental.

### N9. Riesgo operador: doble clic en operaciones financieras (cruza con F1)

Ver F1. Clasificado también acá porque es, ante todo, un riesgo de negocio (documentos financieros duplicados), no solo un detalle de UX.

### N10. Riesgo operador: anulaciones sin confirmación (cruza con F9)

Ver F9. Mismo razonamiento — el costo de un error humano acá es directamente financiero.

### N11. CUIT sin validación de formato en ningún punto del sistema

**Descripción:** ni el backend ni el frontend validan que un CUIT tenga el formato/dígito verificador correcto — se puede guardar cualquier texto.
**Prioridad:** P2 — **Impacto:** Medio (datos maestros fiscales potencialmente corruptos, relevante si algún día se integra con AFIP — ver N4). **Complejidad:** Baja (validación de formato + dígito verificador es un algoritmo conocido y acotado). **Beneficio esperado:** medio-alto, esfuerzo bajo.

---

## 5. Producción

### P1. ⚠️ Posible discrepancia entre el código desplegado en Railway y el repositorio actual — verificación urgente requerida

**Descripción:** `README.md` (líneas 7-14, 29-136) documenta un despliegue basado en `cd app` y Root Directory `app/backend`/`app/frontend` en Railway — esa estructura de carpetas **ya no es la actual**: el código activo de los Bloques 1-4 vive en `backend/`/`frontend/` en la raíz del repositorio desde la reincorporación descrita en `ROADMAP_SDC_V1.md`. El directorio `app/` que sí existe hoy es una copia vieja y parcial (confirmado por el agente de backend: solo contiene un archivo, con último commit del 2026-06-27, muy anterior a cualquier trabajo de los Bloques 3-4). **Si la configuración de Railway (Root Directory de cada servicio) no fue actualizada manualmente después de esa reestructuración, es posible que el entorno de producción esté sirviendo el código viejo de `app/` en vez del código real y ya validado de los Bloques 1-4.** Esto no se puede confirmar ni descartar sin acceso al dashboard de Railway.
**Prioridad:** **P0** — **Impacto:** Potencialmente crítico (todo el trabajo de meses podría no estar reflejado en producción). **Complejidad:** Mínima — es una verificación manual de 5 minutos en el dashboard de Railway (mirar el "Root Directory" configurado en cada servicio), seguida de una corrección de configuración si hace falta (no de código). **Riesgo de no verificar:** cualquier decisión posterior de priorización es irrelevante si el problema real es que producción no corre el código que se está evaluando. **Beneficio esperado:** el mayor de todo el documento relativo al esfuerzo — es la primera acción recomendada, antes de cualquier otra del roadmap.

### P2. Entrypoint de arranque roto: `dist/main.js` no existe en el build real

**Descripción:** `backend/package.json` (`"start": "node dist/main.js"`) y **ambos** Dockerfiles (raíz y `backend/Dockerfile`, `CMD ["node", "dist/main.js"]`) apuntan a una ruta que no existe. El build real de `nest build` (sin `nest-cli.json` presente, con `tsconfig.json` sin `rootDir` explícito) genera el entrypoint en `dist/src/main.js`. **Esto se confirmó empíricamente en este mismo proyecto**: en todas las sesiones de prueba manual de los Bloques 4.1-4.3 fue necesario ejecutar `node dist/src/main.js` en lugar de `node dist/main.js`, que falla con `MODULE_NOT_FOUND`. Si Railway efectivamente ejecuta el `CMD` del Dockerfile tal cual está en el repo (que es lo que indica `railway.json`, `builder: "dockerfile"`, sin ningún `startCommand` de override), **el contenedor de producción no arrancaría**.
**Prioridad:** **P0** — **Impacto:** Crítico si se confirma que es lo que corre hoy (o lo que correría en el próximo deploy). **Complejidad:** Baja (una vez confirmado el causante — ajustar `outDir`/`rootDir` en `tsconfig.json`, o corregir el `CMD`/script a la ruta real, o agregar un `nest-cli.json` explícito). **Beneficio esperado:** crítico — sin esto, ningún otro punto del roadmap importa si el servicio no puede reiniciarse.

### P3. Dos Dockerfiles divergentes — ya señalado como crítico, nunca unificado

**Descripción:** `Dockerfile` (raíz) y `backend/Dockerfile` tienen contenido distinto (uno instala OpenSSL explícitamente, el otro no; estructura de `COPY` distinta). Ya marcado "crítico antes de producción" en `ROADMAP_SDC_V1.md`, sin resolver.
**Prioridad:** P1 — **Impacto:** Alto (no está claro cuál de los dos es realmente el usado, riesgo de mantener el equivocado). **Complejidad:** Baja (elegir uno, borrar el otro, una vez resuelto P1/P2 de esta sección). **Beneficio esperado:** alto, esfuerzo bajo.

### P4. Sin estrategia de backup documentada ni verificada

**Descripción:** no hay evidencia en el repositorio de ninguna política de backup de la base de datos (ni scripts, ni documentación, ni mención de configuración de backups administrados de Railway).
**Prioridad:** P0/P1 — **Impacto:** Crítico si ocurre un incidente (el sistema ya maneja facturación y cobranzas reales). **Complejidad:** Baja-media (verificar si el plan de Railway usado incluye backups automáticos de Postgres, documentarlo, y si no, configurar uno). **Beneficio esperado:** crítico — es la póliza de seguro más barata de todo el documento comparada con el costo de perder datos financieros.

### P5. Sin CI/CD

**Descripción:** no existe `.github/` ni ningún pipeline — no hay build/lint/test automático antes de mergear a `main`. Todo el trabajo de este proyecto, incluidos los Bloques 3-4, se validó y mergeó directamente a `main` sin ningún gate automatizado.
**Prioridad:** P1 — **Impacto:** Alto (sin red de seguridad ante un error humano en un push directo). **Complejidad:** Media (un workflow básico de "build + typecheck" es rápido de armar; agregar tests reales depende de B19). **Beneficio esperado:** alto, sobre todo si el equipo de desarrollo crece más allá de una persona.

### P6. Sin logging estructurado / observabilidad en producción (cruza con B13)

Ver B13. Clasificado también acá porque es, en la práctica, un problema de operación de producción: hoy nadie se entera de un error 500 real salvo que esté mirando la consola de Railway en tiempo real.

### P7. Variables de entorno críticas sin validación de arranque (fail-fast)

**Descripción:** `JWT_SECRET` y `CORS_ORIGIN` tienen fallbacks silenciosos (ver B9, B10) en vez de que la app rechace arrancar si faltan en un entorno que se declare de producción.
**Prioridad:** P2 — **Impacto:** Medio-alto (depende de que ya se haya configurado bien manualmente, pero no hay ninguna protección si algún día se pierde esa configuración). **Complejidad:** Baja. **Beneficio esperado:** medio-alto.

### P8. Sin `.env.example`

**Descripción:** no existe ningún archivo de referencia de las variables de entorno requeridas (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT`, `VITE_API_URL`) — el `README.md` menciona `cp .env.example .env` en sus instrucciones, **pero ese archivo no existe en el repositorio**, lo cual es en sí mismo otra señal de que el README está desactualizado (ver P1).
**Prioridad:** P2 — **Impacto:** Medio (fricción de onboarding, y evidencia adicional del problema de P1). **Complejidad:** Trivial. **Beneficio esperado:** medio, esfuerzo mínimo.

### P9. Sin `HEALTHCHECK` en Dockerfile, sin usuario no-root

**Descripción:** ya señalado como ítem futuro en `ROADMAP_SDC_V1.md` v1.2, sigue pendiente.
**Prioridad:** P2 — **Impacto:** Medio (Railway puede no detectar un contenedor colgado tan rápido sin un healthcheck propio; ejecutar como root es una práctica de seguridad de contenedores subóptima). **Complejidad:** Baja. **Beneficio esperado:** medio.

### P10. 5 archivos `schema*.prisma` sueltos en la raíz del repositorio — señalado dos veces antes, nunca limpiado

**Descripción:** `schema.prisma`, `schema-corrected.prisma`, `schema-correcto.prisma`, `schema-prisma-CORRECTO.prisma`, `schema-prisma-FINAL-CORRECTO.prisma` en la raíz (todos distintos entre sí y del real en `backend/prisma/schema.prisma`, y todos versionados en git). Señalado como deuda en `BLOQUE3.2_DISENO_COMISION_PCT.md` y `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md`, nunca resuelto — **la reincidencia sugiere que necesita más prioridad que "P3/limpieza eventual".**
**Prioridad:** P2 (elevado desde P3 justamente por la reincidencia) — **Impacto:** Medio (riesgo real de que alguien edite el archivo equivocado pensando que es la fuente de verdad, dado que los nombres — "CORRECTO", "FINAL-CORRECTO" — sugieren justamente lo contrario de lo que son). **Complejidad:** Trivial (`git rm`). **Beneficio esperado:** alto relativo al esfuerzo casi nulo.

### P11. Directorio `app/` duplicado y desactualizado

**Descripción:** confirmado por el agente de backend — copia parcial y vieja (un solo archivo, commit de 2026-06-27), no referenciada por ningún build activo. Ver también P1 (esta copia es justamente la que el README describe como la estructura "real").
**Prioridad:** P2 (elevado por su relación directa con P1) — **Impacto:** Medio como deuda de limpieza aislada, alto en combinación con P1 (es la fuente de la confusión). **Complejidad:** Trivial. **Beneficio esperado:** alto en combinación con resolver P1.

### P12. Migraciones no automatizadas en el pipeline de deploy

**Descripción:** `prisma migrate deploy` se ejecuta manualmente contra producción, según el propio README y `ROADMAP_SDC_V1.md`.
**Prioridad:** P1 — **Impacto:** Alto (riesgo de olvidar aplicar una migración, o de aplicarla en el momento equivocado). **Complejidad:** Media (requiere resolver P5 — CI/CD — primero, o al menos definir el paso de deploy). **Beneficio esperado:** alto.

### P13. Sin `engines.node` declarado

**Descripción:** ni `backend/package.json` ni `frontend/package.json` declaran una versión de Node requerida, pese a que ambos Dockerfiles usan `node:20-alpine` explícitamente.
**Prioridad:** P3 — **Impacto:** Bajo. **Complejidad:** Trivial. **Beneficio esperado:** bajo, mejora de reproducibilidad.

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

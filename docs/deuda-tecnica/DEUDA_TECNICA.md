# Registro consolidado de deuda técnica — SDC

Fecha: 2026-07-09, actualizado 2026-07-11 (cierre de Bloque 7). Consolida toda la deuda técnica documentada en los Bloques 3, 4 y 5 (incluye `BACKEND_REVIEW.md`, `ROADMAP_SDC_V1.md`, `QA_INFORME_FINAL.md` y las auditorías/diseños de cada sub-bloque) en un único documento. Reemplaza la necesidad de recordar en qué documento apareció cada ítem. Estado verificado contra el código real al momento de escribir este documento, no solo contra lo que decían las auditorías originales.

**Actualización 2026-07-11:** la fila de `prisma migrate deploy` en la sección B se marca ✅ resuelta (Bloque 6.3). Se agrega una nueva sección G con la deuda propia del Motor de Inteligencia (Bloque 7.3) — ver `ESTADO_ACTUAL_POST_BLOQUE7.md` para el resumen ejecutivo de cierre de Bloque 7.

**Columnas:** Prioridad (P0=bloqueante para producción con dinero real / P1=alto valor a corto plazo / P2=importante no urgente / P3=menor), Impacto, Esfuerzo (XS/S/M/L/XL), ¿Bloquea producción?, Bloque de origen.

---

## A. Seguridad

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| `JWT_SECRET` con fallback hardcodeado (`"dev-secret-change-me"`) en `auth.module.ts`/`jwt.strategy.ts` — no falla rápido si falta en el entorno real. Confirmado aún presente en el código. | **P1** | Alto si ocurre (tokens falsificables), depende de error de configuración externo | S | **Sí**, si no está configurado explícitamente en el entorno real | `BACKEND_REVIEW.md` §4, `BLOQUE5_AUDITORIA_PRODUCTO.md` B9. Roadmap original lo agrupaba en 5.1, no se implementó. |
| CORS wildcard (`origin: "*"`) + `credentials:true` como fallback en `main.ts`. Confirmado aún presente. | P2 | Medio, mitigado por comportamiento de navegadores modernos | S | No | B10. No implementado (agrupado en 5.1 original). |
| Sin rate-limiting en `POST /auth/login` — vulnerable a fuerza bruta. Confirmado: sin `@nestjs/throttler` ni librería equivalente instalada. | **P1** | Alto si el sistema queda expuesto públicamente (es el caso, dominio público de Railway) | S | Recomendado antes de exposición pública sostenida | B11. No implementado (agrupado en 5.1 original). |
| `ClientesController.cuentaCorriente()` no excluye `Factura.estado === "ANULADO"` del cálculo de saldo — infla el saldo aparente de un cliente. | **P1** | Alto — dato financiero visible a Facturación/Gerencia | S | Recomendado antes de uso real | Señalado explícitamente como "candidato a P0 aparte" en `BLOQUE4.3_DISENO_COBRANZAS.md` §0/§4, nunca resuelto. |

## B. Producción / infraestructura de despliegue

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| Verificación de producción nunca ejecutada: posible discrepancia entre Root Directory configurado en Railway y la estructura real (`backend/`/`frontend/` vs. `app/backend`/`app/frontend`, este último una copia vieja sin relación con el código de los Bloques 3-5). | **P0/P1** | Potencialmente crítico si se confirma | XS (verificación manual, sin código) | **Sí**, hasta confirmar | `BLOQUE5_AUDITORIA_PRODUCTO.md` P1. Sub-bloque 5.0 del roadmap, propuesto y nunca ejecutado. |
| Entrypoint `dist/main.js` (usado en `package.json` y ambos Dockerfiles) posiblemente no coincide con el entrypoint real del build (`dist/src/main.js`, confirmado empíricamente durante pruebas manuales de los Bloques 4.1-4.3). Confirmado aún así en el código hoy. | **P0/P1** | Crítico si se confirma que el contenedor no arranca | S, una vez identificada la causa | **Sí**, hasta confirmar | P2 de `BLOQUE5_AUDITORIA_PRODUCTO.md`. Contradice la validación exitosa de producción documentada en `PROJECT_STATUS.md` (2026-07-03) — la contradicción entre ambos documentos nunca se resolvió. |
| Dos `Dockerfile` divergentes (raíz vs. `backend/Dockerfile`) — contenido distinto, no está confirmado cuál usa Railway realmente. Confirmado aún presentes ambos. | P1 | Alto — riesgo de mantener el equivocado / imágenes distintas en local vs. producción | S | No, pero recomendado antes de cualquier cambio de infra | Marcado "crítico antes de producción" en `ROADMAP_SDC_V1.md`, reconfirmado en `BACKEND_REVIEW.md` §4 y `BLOQUE5_AUDITORIA_PRODUCTO.md` P3. Nunca resuelto pese a 2 menciones previas. |
| ~~`prisma migrate deploy` no automatizado en el pipeline~~ — **✅ Resuelto (Bloque 6.3, commit `1161bb0`)**: `railway.json` con `deploy.preDeployCommand: "npx prisma migrate deploy"` + `deploy.healthcheckPath`, validado en un deploy real (migración aplicada antes de cortar tráfico a la versión nueva). No elimina el riesgo estructural de rollback de schema (migraciones forward-only), pero sí la causa raíz del incidente de Bloque 6.1 (5 migraciones que quedaron sin aplicar porque nada las ejecutaba). | ~~P1~~ | — | — | — | `ROADMAP_SDC_V1.md`, `BACKEND_REVIEW.md` §4, P12. Ver `ACTA_CIERRE_INCIDENTE.md` y `BLOQUE6.3_DISENO_DEPLOY.md`. |
| Sin estrategia de backup de base de datos documentada ni verificada. | **P1** | Crítico si ocurre un incidente (el sistema ya maneja facturación/cobranzas reales) | S/M | Recomendado antes de datos reales | P4. |
| Sin CI/CD (`.github/` no existe) — nada de build/lint/test automático antes de mergear a `main`. | P1 | Alto — sin red de seguridad ante error humano en push directo | M | No | P5. |
| Sin logging estructurado, sin catch-all de excepciones no-Prisma, `GET /health` no verifica conectividad real a Postgres. | P1 | Alto — un error 500 real es invisible salvo mirar logs crudos en tiempo real | M | No | B13/P6. |
| `AuditLog` desigual — solo anulación de cobranza y override de `comisionPct` dejan rastro; anulación de anticipos/liquidaciones/facturas y ediciones de catálogos no. `Cliente` sin `updatedAt`; `Chofer`/`Vehiculo` sin `createdAt`/`updatedAt`. | P2 | Medio-alto para auditoría contable/legal futura | M | No | B14. |
| Sin `HEALTHCHECK` en Dockerfile, sin usuario no-root. | P2 | Medio | S | No | P9, ya señalado en `ROADMAP_SDC_V1.md` v1.2. |
| Sin `.env.example` — el propio `README.md` lo menciona (`cp .env.example .env`) pero el archivo no existe. | P2 | Medio (fricción de onboarding) | XS | No | P8. |
| 5 archivos `schema*.prisma` sueltos en la raíz (`schema-corrected`, `schema-correcto`, `schema-prisma-CORRECTO`, `schema-prisma-FINAL-CORRECTO`, todos versionados en git) + directorio `app/` duplicado y desactualizado (último commit muy anterior a Bloque 3). **Confirmado que ambos siguen presentes en el repo hoy.** | P2 (elevado por reincidencia) | Medio — riesgo real de editar el archivo equivocado, los nombres sugieren justo lo contrario de lo que son | XS (`git rm`) | No | Señalado en `BLOQUE3.2_DISENO_COMISION_PCT.md`, `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md`, y de nuevo en `BLOQUE5_AUDITORIA_PRODUCTO.md` P10/P11 — tercera vez que se documenta sin limpiarse. |
| Secreto placeholder en `docker-compose.yml` (`JWT_SECRET: "cambiar-este-secreto-en-produccion"`) — riesgo de copiarse sin querer a un entorno real. | P2 | Medio | XS | No | `BACKEND_REVIEW.md` §4. |
| Sin `engines.node` declarado en ningún `package.json`. | P3 | Bajo | XS | No | P13. |

## C. Modelo de datos

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| `EstadoFacturacionEnum` (`Viaje`) y `EstadoFacturaEnum` (`Factura`) duplicados — mismo concepto de negocio en dos enums, sincronizados a mano en 3 puntos del código. | **P1** | Alto — fuente de confusión y bugs sutiles recurrente | M/L | No, pero cada bloque nuevo tiene que manejarlo con cuidado | `BACKEND_REVIEW.md` §1, `ROADMAP_SDC_V1.md` v1.1, `BLOQUE5_AUDITORIA_PRODUCTO.md` D3. Señalado en 4+ documentos desde el Bloque 3, sin cambios. |
| Clasificación de anticipos (`esAdelanto()`/`categorizarAnticipo()`) por coincidencia de texto libre sobre `TipoGasto.nombre`, con **dos esquemas de clasificación inconsistentes entre sí** sobre el mismo campo (confirmado y documentado explícitamente durante 5.3.2). | P1/P2 | Alto si se renombra un `TipoGasto` de forma que deje de matchear — categorización silenciosamente incorrecta en cálculos financieros | M | No, mitigado por ser un caso de borde | Señalado como fuera de alcance desde `BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` §0, reconfirmado en `BLOQUE5_AUDITORIA_PRODUCTO.md` D4 y en `BLOQUE5.3.2_DISENO_PLANILLA_LIQUIDACION.md` (documentado, no corregido, por decisión explícita). |
| Montos financieros en `Float` en toda la aplicación, no `Decimal`. Mitigado parcialmente con tolerancia de redondeo en validaciones de cobranza (Bloque 4.3). | P1 (potencial) | Alto en teoría, mitigado en la práctica hoy | L/XL | No, mientras el volumen/escrutinio contable actual se mantenga | `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` (explícitamente "preexistente, no corregida acá"), `BLOQUE5_AUDITORIA_PRODUCTO.md` D8. |
| `Cobranza.medioPago` como texto libre — inconsistencia ya observada en datos reales (`"Transferencia"` / `"Transferencia bancaria"` / `"Efectivo"` como strings distintos para el mismo concepto). | P2 | Medio, afecta reportería futura por medio de pago | S/M | No | D5. |
| `Ubicacion.nombre` sin constraint de duplicados — diseñado en Bloque 3 (`BLOQUE3_DISENO_INTEGRIDAD_DATOS.md` §2, índice por expresión `COALESCE(localidad,'')`), nunca implementado. | P2 | Medio — mismo lugar cargado dos veces con distinto ID | M | No | D6. |
| Concurrencia en `pagar()` (Liquidaciones) y `registrarCobranza()` (Facturas) resuelta con tolerancia de aplicación, no con lock a nivel de base (`SELECT...FOR UPDATE`). La decisión quedó explícitamente abierta al cierre del diseño de Bloque 4.3, nunca zanjada. | P2 | Medio — ventana de carrera estrecha, no eliminada | S | No | `BLOQUE4.3_DISENO_COBRANZAS.md` (punto de decisión sin cerrar), `QA_INFORME_FINAL.md` P2.4. |
| Sin `CHECK` constraints a nivel de Postgres para positividad de montos — depende 100% de `@IsPositive()` en DTOs. | P3 | Bajo hoy (todo el tráfico pasa por DTOs) | S/M | No | D7. |
| `Liquidacion.transportistaId`/`choferId` — polimorfismo informal sin restricción de schema, solo validado en código de aplicación. | P3 | Bajo (el código ya lo respeta consistentemente) | L (si se quiere modelar formalmente) | No | `ROADMAP_SDC_V1.md` v1.2, `BLOQUE5_AUDITORIA_PRODUCTO.md` D11. |
| Sin validación de tipo Camión/Acoplado al asignar `Viaje.camionId`/`acopladoId`. | P2 | Medio | S | No | `BACKEND_REVIEW.md` §1. |
| Sin catálogo geográfico para `Ubicacion.localidad` (texto libre, susceptible a typos que fragmentan reportería). | P2/P3 | Medio para valor de negocio (reportería gerencial) | M | No | D9. |
| `Cliente.condicionesComerciales` como texto libre sin estructura. | P3 | Bajo | M | No | `ROADMAP_SDC_V1.md` v1.2, D10. |

## D. Arquitectura y mantenibilidad de backend

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| Sin capa de servicio — lógica de negocio directamente en controllers ("fat controllers"); `LiquidacionesController`/`FacturasController` escriben directo sobre `Viaje`/`AnticipoGasto`, modelos que no "son suyos". **Ya causó un bug real** (corregido, commit `acd156c`). | P2 | Medio hoy (funciona), alto a mediano plazo si el equipo/reglas de negocio crecen | L/XL | No | `BACKEND_REVIEW.md` §2, `BLOQUE5_AUDITORIA_PRODUCTO.md` B15 (empeoró en términos absolutos desde la última revisión — se le siguió agregando lógica sin extraer nada). |
| Cero tests automatizados en todo el backend (ningún `*.spec.ts`, sin `jest.config`, sin script `"test"`). | **P1** | Alto — cualquier regresión se detecta solo manualmente; toda la validación de los Bloques 3-5 fue 100% manual | L (para arrancar) → XL (cobertura amplia) | No, pero es la mayor brecha de confianza a mediano plazo | B19. |
| Sin paginación en ningún endpoint de listado (17 confirmados: viajes, facturas, liquidaciones, anticipos, catálogos, exports). | P2 hoy → P1 con volumen | Bajo hoy (poco volumen real), alto a 6-12 meses de uso | M | No | B1, F8, F18, reconfirmado en `BLOQUE5.3_AUDITORIA_UX.md` UX-28. |
| Loops secuenciales de escritura dentro de transacciones (`facturas.controller.ts`, `liquidaciones.controller.ts`) reemplazables por `updateMany`/`createMany`. | P2 | Medio — decenas de round-trips secuenciales en facturación/liquidación por lote | M | No | B2. |
| Lógica duplicada entre controllers: `fmtMoney` copiado 4 veces, construcción de rango de fechas repetida 10 veces, bloque de export Excel repetido en 6 controllers, export PDF repetido en 5. | P2 | Medio — mantenibilidad, un cambio de formato requiere tocar 5-6 archivos | M | No | B5. |
| `Idempotency-Key` real a nivel de API para `registrarCobranza` — deprioritizado explícitamente como "Bloque 4.4, opcional", nunca implementado. Mitigado parcialmente a nivel de UI en 5.3.1 (botón deshabilitado durante el request), pero sin protección real contra reintentos de red del lado del servidor. | P2 | Medio, riesgo residual bajo (mitigado por la capa de UI) | S/M | No | `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` §4 (4.4). |
| Sin capa de DTOs de respuesta ni tipos compartidos backend/frontend — el frontend tipa todo como `any`. | P2 | Medio — cambios de `include` en el backend no los detecta ningún compilador del frontend | M/L | No | `BACKEND_REVIEW.md` §3. |
| Sin Swagger/OpenAPI. | P3 | Bajo-medio | M | No | `BACKEND_REVIEW.md` §3. |
| Doble validación redundante DTO + controller en 6+ puntos. | P3 | Bajo en runtime | S | No | B6. |
| Código muerto y contrato engañoso: `UpdateClienteDto.contactos` se valida pero se descarta silenciosamente en el controller; `@nestjs/config` instalado sin usar. | P2 | Medio — puede confundir a un futuro desarrollador | S | No | B7. |
| Inconsistencia de manejo "no encontrado": algunos módulos lanzan `NotFoundException`, otros (`clientes`, `choferes`, `transportistas`) devuelven `200` con `null`. | P3 | Bajo-medio | S | No | B16. |
| CRUD asimétrico en catálogos simples: `vehiculos` sin `GET /:id`; `cereales`/`ubicaciones`/`tipos-gasto` sin `GET/PATCH/DELETE /:id`. | P3 | Bajo | S/M | No | B17. |
| `strictNullChecks`/`noImplicitAny` desactivados en `tsconfig.json`; 32 usos de `: any` en código activo. | P3 | Bajo-medio | XL si se endurece retroactivamente | No | B12. |
| Agregaciones en memoria (`dashboard.controller.ts`) en vez de `aggregate`/`groupBy` de Prisma. | P3 | Bajo hoy, medio a futuro (se llama en cada carga de pantalla) | S | No | B3. |
| `cuentaCorriente()` sin límite de fecha ni paginación (además de no excluir anulados, ver sección A). | P2 | Medio, crece con la antigüedad del cliente | S | No | B4. |

## E. Frontend / UX

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| Loading states y manejo de error en carga inicial ausentes en 8 de 12 pantallas (Clientes, Transportistas, Catálogos, listado de Viajes, y parcialmente Conciliación) — 5.3.1 solo cubrió Liquidaciones/Facturas/Anticipos/ViajeDetalle. | **P1** | Alto — sistemático, ante cualquier caída/lentitud de backend media aplicación parece vacía sin explicación | S (patrón ya existe, replicar) | No | F1/F2, `BLOQUE5.3_AUDITORIA_UX.md` UX-01/UX-02 (parcialmente resuelto). |
| Sidebar y formularios no reflejan los permisos reales por rol — backend protegido desde 5.1, pero `Layout.tsx` sigue mostrando "Nuevo cliente"/"Nuevo transportista" a todos los roles (`roles: null`), y ninguna ruta tiene guard por rol en `App.tsx`. | **P1** | Medio-alto — confusión de usuario (descubre que no tiene permiso recién al enviar), no vulnerabilidad | S | No | F13, `BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md` §5 (explícitamente diferido), `BLOQUE5.3_AUDITORIA_UX.md` UX-16. |
| `PATCH`/`DELETE` de viajes y catálogos maestros (clientes, transportistas, choferes, vehículos, productores) sin ningún formulario de edición en la UI, pese a que el backend ya lo soporta desde varios bloques atrás. | **P1** | Alto — trabajo de backend ya hecho e invisible; corregir un dato hoy requiere acceso directo a la base | M | No | F3, F6, `BLOQUE5.3_AUDITORIA_UX.md` UX-08. |
| Vencimientos de documentación (RTO, seguro, licencia) no capturables desde ningún formulario, y sin ningún proceso de alerta aunque se cargaran. | **P1** | Alto — riesgo de cumplimiento normativo real para una empresa de transporte | S (captura) / M (alertas) | No, pero es riesgo operativo/legal | F4, N2. |
| Anulación individual de cobranza sin botón en UI — el backend la soporta desde Bloque 4.3. | P2 | Medio — una cobranza mal cargada no se puede corregir desde la interfaz | S | No | F5, UX-09. |
| Exports Excel/PDF solo tienen botón en Liquidaciones, aunque el backend los soporta también en Facturas, Anticipos, Clientes, Transportistas, Choferes. | P2 | Medio | S | No | F7. |
| Filtros construidos en el backend no expuestos en el frontend — caso más flagrante: Anticipos, que soporta `choferId`/`transportistaId`/`desde`/`hasta`/`liquidado`/`anulado` y el frontend no usa ninguno. | P2 | Medio-alto en Anticipos específicamente | S/M | No | F8. |
| CUIT sin validación de formato/dígito verificador en ningún punto (ni frontend ni backend). | P2 | Medio — datos maestros fiscales potencialmente corruptos | S | No | N11. |
| Cero atributos de accesibilidad semántica (`aria-*`, `role=`) en toda la aplicación; `<label>` nunca asociado a `<input>` vía `htmlFor`/`id`; 3 badges de estado bajo el mínimo de contraste WCAG AA. | P2 | Medio — depende de si hay requisito de accesibilidad del negocio (pregunta abierta, no respondida) | S (label/input) / M (resto) | No | F12, UX-23/24/25. |
| Cero `@media queries` en toda la hoja de estilos — la aplicación no es usable en tablet/mobile. | P2 | Alto si hay uso mobile real, nulo si no (pregunta de negocio abierta, no respondida) | L (toca layout global) | No | UX-26. |
| Catálogos inactivos (desde Bloque 5.2) sin ninguna marca visual en vistas históricas — `ViajeDetalle.tsx` muestra un chofer/cliente dado de baja idéntico a uno activo. | P2 | Medio — confusión operativa, consecuencia directa y no resuelta del propio Bloque 5.2 | S | No | UX-27. |
| Numeración de `Factura.numero` manual (texto libre, sin `required`), a diferencia de `Viaje.numeroViaje`/`Liquidacion.numero` que se autogeneran. | **P1** | Alto — riesgo de colisión/error de tipeo; depende de responder N4 antes de resolverlo (ver sección F) | Depende de N4 | No | N1. |
| Sin sistema de notificaciones de éxito fuera de las pantallas ya cubiertas por 5.3.1 — `.success-banner` definida en CSS pero sin uso en el resto de la app. | P2 | Medio | S | No | F10 (parcialmente resuelto por 5.3.1). |
| Validación client-side ausente o inconsistente — cero `min`/`maxLength`/`pattern` en toda la app; "Nueva factura" es el único formulario de alta sin `required` en ningún campo. | P2 | Medio — feedback tardío, solo tras rechazo del backend | S | No | F11. |
| Patrones de "ver detalle"/expandir inconsistentes entre páginas hermanas (Transportistas, Clientes, Liquidaciones/Facturas usan 3 variantes distintas del mismo concepto). | P3 | Bajo-medio | M | No | UX-15. |
| Arquitectura de información inconsistente para "crear": 7 de 8 flujos usan formulario embebido, solo Viajes usa ruta dedicada, sin criterio documentado. | P3 | Bajo-medio, decisión de fondo no un bug | L si se decide unificar | No | UX-14. |
| Sin Error Boundary de React ni ruta 404. | P2 | Medio — pantalla en blanco sin recuperación ante error inesperado | S | No | UX-06. |
| Botones de riesgo opuesto sin separación visual/jerárquica (ej. "Avanzar estado" y "Cancelar viaje" con el mismo tamaño/prominencia). | P2 | Medio | S | No | UX-18. |
| Sin navegación de "volver" desde vistas de detalle (`ViajeDetalle.tsx`). | P3 | Bajo | XS | No | UX-17. |
| Selects dependientes deshabilitados sin texto de ayuda que explique la dependencia (excepto en Liquidaciones, que ya tiene el patrón correcto). | P3 | Bajo | XS | No | UX-20. |
| `placeholder` como único indicador de campo (sin `<label>`) en los mini-formularios de alta rápida de chofer/vehículo. | P3 | Bajo | XS | No | UX-21. |
| Registro de cobranza sin mostrar el saldo pendiente antes de enviar (el backend valida el tope, pero la UI no da referencia visual previa). | P1 | Medio — previene un error de usuario en un flujo financiero | S | No | UX-22. |
| Colores de badge reutilizados entre dominios distintos (viaje/liquidación comparten paleta) — el color deja de ser una señal confiable. | P2 | Medio | S | No | UX-11. |
| Consistencia visual menor: clase `.filters` reutilizada fuera de su propósito, varios `style={{}}` inline en vez de clases del sistema. | P3 | Bajo | S | No | F16, UX-12. |
| Estados de carga inconsistentes — "No hay resultados" se muestra brevemente también mientras la petición inicial todavía está en curso. | P3 | Bajo-medio, transitorio | S | No | F15. |
| Dashboard sin drill-down — los KPIs no son clicables hacia la vista filtrada correspondiente. | P2 | Medio — oportunidad de navegación perdida en la pantalla más usada | S/M | No | F17. |

## F. Negocio (decisiones pendientes, no bugs)

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| **N4 — ¿el módulo "Factura" reemplaza o complementa la facturación fiscal real (AFIP)?** Pregunta de negocio sin responder, condiciona N1 (numeración) y cualquier mejora de reportería fiscal. | P2, no priorizable sin respuesta | Potencialmente muy alto según la respuesta | — | No, pero condiciona otras decisiones | N4. |
| Sin gestión de usuarios vía API/UI — decisión ya tomada como fuera de alcance de v1.0, sigue vigente. | P2 | Medio — limita autonomía operativa | M | No | `ROADMAP_SDC_V1.md`, N3. |
| Reportes pasivos (conciliación, facturas vencidas) en vez de alertas proactivas. | P2 | Medio | M | No | N5. |
| Sin importación masiva de datos (CSV/Excel) — toda la carga es manual fila por fila. | P3 | Bajo-medio, depende del volumen real de operación | M/L | No | N6. |
| Dashboard sin herramientas gerenciales reales (sin tendencias, sin comparación mes a mes, sin ranking) pese a existir un rol `GERENCIA` dedicado. | P2 | Medio-alto para el rol Gerencia específicamente | M/L | No | N7. |
| Sin portal de autoservicio para transportistas/clientes. | P3 | Medio a largo plazo, bajo/nulo hoy | L/XL | No | N8. |

## G. Motor de Inteligencia (Bloque 7.3, nueva desde 2026-07-11)

Ninguno de estos ítems es un bug — son decisiones o capacidades conscientemente diferidas durante el desarrollo de Bloque 7.3, señaladas por sus propios documentos de diseño. Detalle completo en `ESTADO_ACTUAL_POST_BLOQUE7.md`, sección "Deuda residual específica del Motor de Inteligencia".

| Ítem | Prioridad | Impacto | Esfuerzo | ¿Bloquea prod.? | Origen |
|---|---|---|---|---|---|
| Evolución de comisión no expuesta en Benchmarking — `comisionPct`/`comisionMonto` existen en `Liquidacion`/`LiquidacionViaje` pero el Motor nunca los lee; el margen se calcula sobre `totalViaje`, que ya neteó la comisión. | P2 | Medio — solo relevante si Gerencia pide explícitamente seguir la comisión en el tiempo | M (extender `RentabilidadService` de forma aditiva, mismo patrón que cereal/ruta) | No | Decisión explícita en `BLOQUE7.3.5_DISENO_BENCHMARKING.md` — descopeada, no un olvido. |
| Alertas documentales (vencimiento de licencia/RTO/seguro) sin implementar — el modelo no captura esos vencimientos (`Transportistas.tsx` confirmado sin ese campo). | **P1** | Alto — riesgo de cumplimiento normativo real para una empresa de transporte, mismo hallazgo que F4/N2 (sección E) desde antes de Bloque 7 | S (captura) + M (alertas), condicionado a que la captura exista primero | No, pero riesgo operativo/legal | `BLOQUE7.3_ALCANCE.md` (Frontera 2) — condicionada desde el origen del sub-bloque, nunca abierta (7.3.3.b). |
| Dashboard operativo (`dashboard.controller.ts`) sigue con su propia lógica de vigencia/fecha, sin usar `shared/vigencia.ts`/`shared/fecha.ts` del Motor — dos definiciones de "vencida" conviven en el código (la oficial del Motor, la previa del Dashboard). | P2 | Medio — sin evidencia hoy de que difieran en resultado, pero es exactamente el tipo de duplicación de semántica que el principio 4 de `BLOQUE7.2.d` marca como a resolver | M/L (migrar el Dashboard operativo a consumir el Motor, análogo a cómo Dashboard Ejecutivo ya lo hace) | No | Señalado explícitamente como decisión consciente (no tocar) en `BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md`, Parte 8 punto 4. |
| Umbrales del Motor sin calibrar contra uso real — los 20 valores de `shared/umbrales.ts` (alertas) y el ±2% de `benchmarking.calc.ts` (tendencias) son valores iniciales de criterio técnico, nunca revisados por el negocio. | P2 | Medio — una alerta calibrada mal puede ser ruido (demasiadas) o silencio (ninguna) | S (son constantes nombradas, cambiarlas no requiere tocar lógica) | No | Documentado explícitamente en el propio código (`shared/umbrales.ts:1-4`) como "valores de partida, no definiciones permanentes". Recomendado calibrar después de un período de uso real, no antes. |
| Sin exportación (Excel/PDF) en ninguna de las 5 pantallas del Centro de Inteligencia. | P2 | Medio — Gerencia no puede llevar un ranking o comparación a una reunión sin captura de pantalla | S/M (el patrón de export ya existe en Liquidaciones, replicar) | No | Misma brecha que F7 (sección E), ahora también aplicable al Centro de Inteligencia. |

---

## Resumen de bloqueantes reales antes de operar con dinero real sin supervisión

De todo lo anterior, los ítems que este documento marca como "Sí" o "recomendado" en la columna de bloqueo de producción:

1. ~~Verificar Root Directory de Railway y el entrypoint real del build (secc. B)~~ — **✅ Completado (Bloque 6.1/6.2)**, con un resultado más grave de lo esperado: no era una duda de configuración, era un incidente real de 5 migraciones sin aplicar en producción, ya resuelto (`ACTA_CIERRE_INCIDENTE.md`).
2. `JWT_SECRET`/CORS fail-fast + rate-limiting en login (secc. A). **Sigue pendiente.**
3. `cuentaCorriente()` excluyendo facturas anuladas (secc. A). **Sigue pendiente.**
4. Backup de base de datos documentado/verificado (secc. B). **Sigue pendiente.**
5. Unificar Dockerfiles (secc. B) — **sigue pendiente** — y automatizar `prisma migrate deploy` — **✅ Completado (Bloque 6.3)**, ver la fila correspondiente en la sección B.

El resto de la deuda (secciones C-F, y el resto de B/D/E) es real y está priorizada, pero según la propia conclusión de `QA_INFORME_FINAL.md` (ya validada al cierre del Bloque 4: los 4 P0 de ese informe fueron resueltos), no compromete directamente la exactitud de los números que el sistema ya maneja hoy — son mejoras de robustez, performance futura y experiencia de uso, no bloqueantes en el mismo sentido. La nueva sección G (Motor de Inteligencia) tampoco compromete esa exactitud — Bloque 7.3 solo lee datos ya validados por los Bloques 3-4, nunca los recalcula ni los modifica.

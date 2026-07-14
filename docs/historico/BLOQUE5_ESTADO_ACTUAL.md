# Estado actual del proyecto — Cierre de Bloque 5 (sub-bloques 5.1 a 5.3.2)

Fecha: 2026-07-09. Documento de cierre técnico y de producto — no se modificó código, no se generaron migraciones, no se hizo commit. Escrito para que cualquier persona del equipo entienda en 10 minutos dónde está el proyecto SDC hoy.

---

## Resumen ejecutivo

SDC tiene sus 7 módulos de negocio (Auth, Catálogos, Viajes, Anticipos, Liquidaciones, Facturas, Dashboard) funcionando de punta a punta, desplegado en Railway, con los flujos financieros críticos (liquidar → confirmar → pagar → anular; facturar → cobrar → anular → refacturar) validados manualmente varias veces y sin bugs conocidos abiertos en esos flujos.

El trabajo de los Bloques 3 y 4 cerró la deuda de **integridad contable** (contaminación cruzada de anticipos, viajes editables tras facturar/liquidar, cobranzas sin tope). El Bloque 5, hasta acá, cerró la deuda de **seguridad de catálogos** (control de acceso por rol, soft-delete real) y una parte importante de la **deuda de UX financiera** (confirmaciones, doble-submit, y una planilla de liquidación con nivel de presentación profesional).

Lo que **no** se cerró todavía, y es importante no perder de vista: seguridad de infraestructura (`JWT_SECRET`, CORS, rate-limiting), automatización de despliegue (Dockerfiles divergentes, migraciones manuales), observabilidad, tests automatizados (siguen en cero), y la mayor parte del backlog de UX no financiera (F3/F6/F7/F8, accesibilidad, responsive). Nada de esto es sorpresa — está documentado desde `BLOQUE5_AUDITORIA_PRODUCTO.md` y se detalla completo en `DEUDA_TECNICA.md`.

**En una frase:** el sistema es hoy confiable en los números que muestra (la parte que un piloto con dinero real necesita), pero todavía no es production-grade en infraestructura, observabilidad ni cobertura de pruebas automatizadas.

---

## Qué objetivos del Bloque 5 quedaron completados

De los 15 sub-bloques propuestos en `ROADMAP_BLOQUE5.md` (5.0 a 5.14), se ejecutaron **5.1, 5.2 (dos entregas) y 5.3 (dos entregas)** — con alcance ajustado respecto a la propuesta original en más de un caso (ver `ROADMAP_ACTUALIZADO.md` para el detalle de qué cambió y por qué).

| Sub-bloque ejecutado | Corresponde a la propuesta original | Alcance real vs. propuesto |
|---|---|---|
| 5.1 | 5.1 (seguridad crítica) | **Más acotado**: solo `RolesGuard` en catálogos (B8). `JWT_SECRET`/CORS fail-fast y rate-limiting (B9/B10/B11), que la propuesta original agrupaba en el mismo sub-bloque, **no se implementaron** — siguen pendientes. |
| 5.2.a + 5.2.b | Parte de 5.4 (quick wins) | Coincide con el ítem de soft-delete de la propuesta, pero se ejecutó como sub-bloque propio (no junto a los otros 3 quick wins de 5.4: typo `numerl` sí se resolvió en 5.3.1; validación de CUIT e índices siguen pendientes). |
| 5.3.1 | 5.5 (UX financiera crítica) | Coincide en esencia (confirmaciones + doble-submit), acotado a Liquidaciones/Facturas/Anticipos/ViajeDetalle — no a las 12 pantallas. |
| 5.3.2 | **No estaba en la propuesta original** | Surgió durante la revisión visual de 5.3.1 — rediseño de la planilla de liquidación (banda de KPIs, jerarquía visual, trazabilidad de factura). Es valor de producto real, pero no cierra ningún hallazgo P0/P1 de la auditoría original. |

### Commits por sub-bloque

| Sub-bloque | Commit(s) | Qué resolvió |
|---|---|---|
| 5.1 | `258e8a4` | `RolesGuard`/`@Roles` en los 15 endpoints mutantes de `CatalogosModule` (clientes, transportistas, choferes, vehículos, cereales, ubicaciones, tipos-gasto, productores) |
| 5.2.a | `8173bd5` | Soft-delete (`activo`) extendido a `Chofer`/`Vehiculo`; `findAll()` filtra `activo:true` por defecto en los 4 catálogos que lo soportan (con `?incluirInactivos=true` opcional) |
| 5.2.b | `ccf4673` | Los 4 `create()` (Viajes, Anticipos, Liquidaciones, Facturas) rechazan con `400` referenciar un Cliente/Transportista/Chofer/Vehículo inactivo |
| 5.3.1 | `971f09c` | `ConfirmDialog` (con nivel de severidad y confirmación tipeada para "Marcar como pagada") + `useAsyncAction` (guard de doble-submit + mensajes de éxito/error) aplicado a Liquidaciones, Facturas, Anticipos, ViajeDetalle; corrección del typo `detalle.numerl` |
| 5.3.2 | `f2c9505` | Unificación de la estructura de datos entre pantalla/PDF/Excel de Liquidaciones (`construirPlanilla()`); banda de resumen (KPIs); jerarquía visual (10 columnas primarias + detalle técnico opcional); trazabilidad de N° de factura por viaje |

---

## Qué problemas resolvió cada sub-bloque

- **5.1** — cualquier usuario autenticado, incluido el rol de solo-lectura, podía crear/editar/dar de baja clientes, transportistas, choferes y vehículos vía API directa o desde la propia interfaz (el botón "Nuevo cliente" era funcional para cualquier rol). Incluía la edición de `comisionPct` de un chofer, un dato directamente financiero.
- **5.2.a/b** — el soft-delete de Cliente/Transportista existía en el schema pero no tenía ningún efecto real: un registro "dado de baja" seguía apareciendo en todos los listados/selects y seguía siendo 100% operable para crear viajes, facturas, liquidaciones y anticipos nuevos.
- **5.3.1** — 4 de 7 acciones destructivas/irreversibles del sistema (Anular liquidación, Confirmar liquidación, Anular factura, Marcar como pagada) no tenían ningún paso de confirmación; ningún botón de escritura en Liquidaciones/Facturas/Anticipos se deshabilitaba durante la request, con riesgo real de duplicar un documento financiero por doble clic.
- **5.3.2** — la pantalla de detalle de Liquidación era una tabla técnica de 4 columnas sin jerarquía visual, sin resumen, sin trazabilidad a la factura del viaje; el dato mostrado en pantalla, PDF y Excel se calculaba con tres implementaciones divergentes.

## Qué riesgos fueron eliminados

- Alteración no autorizada de datos maestros que alimentan facturación/liquidación (5.1).
- Operar sobre un cliente/transportista dado de baja sin ninguna advertencia del sistema (5.2).
- Duplicación de liquidaciones/facturas por doble clic o reintento de red en las 4 pantallas financieras principales (5.3.1).
- Anulación irreversible de una liquidación pagada sin ningún paso de confirmación deliberada (5.3.1).
- Tres fuentes de verdad divergentes para el mismo cálculo de liquidación entre pantalla, PDF y Excel (5.3.2).

## Qué deuda técnica queda pendiente (solo la real)

Ver `DEUDA_TECNICA.md` para el listado completo con prioridad/esfuerzo/referencia. Los puntos de mayor peso relativo a este cierre:

- `JWT_SECRET` y `CORS_ORIGIN` con fallback silencioso en el código; sin rate-limiting en login — la propuesta original de 5.1 los incluía, no se implementaron.
- Verificación de producción (sub-bloque 5.0 propuesto) **nunca se ejecutó** — sigue sin confirmarse si Railway usa el `Dockerfile`/entrypoint correcto, pese a que ambos siguen apuntando a `dist/main.js` (posible discrepancia con el build real, ya señalada en la auditoría).
- `ClientesController.cuentaCorriente()` no excluye facturas `ANULADO` del cálculo de saldo — señalado como "candidato a P0 aparte" desde el propio diseño de Bloque 4.3, nunca resuelto.
- Cero tests automatizados en todo el proyecto; toda la validación de los Bloques 3-5 fue manual.
- Enums duplicados de estado de facturación, clasificación de anticipos por texto libre, montos en `Float` — deuda de modelo de datos señalada desde el Bloque 3, sin cambios.
- 5 archivos `schema*.prisma` sueltos y un directorio `app/` duplicado en la raíz del repo — señalados 3 veces en distintos bloques, confirmado que siguen presentes hoy.

## Qué hallazgos quedaron explícitamente fuera de alcance

- **De 5.1:** extender `activo` a `Cereal`/`Ubicacion`/`TipoGasto` (bajo turnover real); gestión de usuarios vía API; si `LECTURA` debe ver `cuenta-corriente` de un cliente (pregunta de negocio abierta).
- **De 5.2:** gating de rol en el frontend (el backend ya protege; ocultar el formulario en la UI es mejora de UX, no de seguridad — quedó para el sub-bloque 5.13 original); UI de edición/baja de catálogos.
- **De 5.3.1/5.3.2:** las 24 mejoras P1/P2/P3 restantes de `BLOQUE5.3_AUDITORIA_UX.md` (loading states sistemáticos en 8 de 12 pantallas, accesibilidad, responsive, edición de catálogos/viajes, exports faltantes, filtros no expuestos) — el alcance se acotó deliberadamente a los 3 hallazgos P0 más la mejora de producto de la planilla.
- **De Bloque 3/4 (heredado, reconfirmado sin cambios):** unificación de `EstadoFacturacionEnum`/`EstadoFacturaEnum`; capa de servicio para eliminar la escritura cruzada entre controllers; `Idempotency-Key` real a nivel de API para cobranzas (Bloque 4.4, quedó "opcional" y nunca se implementó).

---

## Estado general del sistema

**Backend.** 7 módulos de negocio activos, DTOs con `class-validator` en todos los endpoints de escritura, `PrismaExceptionFilter` global traduce violaciones de constraint única a mensajes de negocio. Sigue sin capa de servicio (los controllers escriben lógica de negocio y cruzan escritura entre módulos), sin paginación en ningún listado, y sin ningún test automatizado.

**Frontend.** React 18 + Vite, sin librerías de UI externas (decisión deliberada, mantenida en todos los bloques). Los flujos financieros principales (Liquidaciones, Facturas, Anticipos) tienen confirmación, doble-submit y feedback de éxito/error consistentes desde 5.3.1. El resto de las pantallas (Clientes, Transportistas, Catálogos, listado de Viajes) todavía no tiene ese mismo nivel de tratamiento. Sin tipos compartidos con el backend (`any` en las respuestas de API).

**Base de datos.** 20 modelos, 9 enums, migraciones al día y reconstruidas de forma limpia. Deuda de modelado real pero no urgente: enums duplicados de facturación, `Float` para montos, clasificación de anticipos por texto libre.

**UX.** La experiencia de las pantallas financieras (Liquidaciones en particular, tras 5.3.2) está al nivel de una planilla profesional. El resto de la aplicación mantiene el nivel funcional pero no pulido de los Bloques 1-4: sin loading states sistemáticos, sin accesibilidad, sin diseño responsive, con funcionalidad de backend ya lista (edición de viajes/catálogos, exports) sin ningún botón que la exponga.

**Seguridad.** Control de acceso por rol correcto y consistente en los 5 módulos financieros/catálogos desde 5.1. Sigue abierta la superficie de configuración de infraestructura: secreto JWT y CORS con fallback inseguro si no se configuran explícitamente en el entorno real, y sin ningún límite de intentos de login.

**Producción.** Desplegado y validado manualmente en Railway al 2026-07-03 (login, JWT, endpoint protegido). Esa validación es anterior a la auditoría que señaló una posible discrepancia entre el entrypoint real del build (`dist/src/main.js`) y el configurado en Dockerfiles/`package.json` (`dist/main.js`) — la contradicción entre ambos documentos nunca se resolvió explícitamente porque la verificación propuesta (sub-bloque 5.0) no se llegó a ejecutar. Sin backup de base de datos documentado, sin CI/CD, dos Dockerfiles divergentes sin unificar.

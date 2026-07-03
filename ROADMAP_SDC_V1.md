# Roadmap Técnico — SDC v1.0 (Sistema Dador de Carga de Cereales)

Fecha: 2026-07-03. Cierra la etapa de recuperación y estabilización del backend (ver `PROJECT_STATUS.md` y `BACKEND_REVIEW.md`, ambos documentos de referencia). Este roadmap define el camino hacia producción y el orden de trabajo de acá en adelante — no se ejecuta nada de lo listado en este documento todavía.

---

## 1. Estado actual del proyecto

- **Backend**: NestJS + Prisma + PostgreSQL. 7 módulos de negocio activos y verificados uno por uno (build + arranque + endpoints + datos vs. seed + auth/roles): `AuthModule`, `CatalogosModule`, `ViajesModule`, `AnticiposModule`, `LiquidacionesModule`, `FacturasModule`, `DashboardModule`.
- **Schema Prisma**: válido, 20 modelos, 9 enums, migraciones reconstruidas y sincronizadas (`20260702165247_init`, `20260702171557_add_comision_pct_to_chofer`).
- **Un bug funcional real encontrado y corregido**: `LiquidacionesController.anular()` podía des-liquidar anticipos de otras liquidaciones (commit `acd156c`). La causa estructural de fondo (`anticipoGastoId` faltante en `LiquidacionMovimiento`) quedó diagnosticada y **diferida a propósito** a una próxima versión.
- **Módulo de combustibles**: código completo pero deshabilitado (`src/_combustibles.disabled/`), le faltan 7 modelos + 4 enums en el schema. **Fuera del alcance de v1.0** (ver sección 2).
- **Auditoría arquitectónica completa realizada** (`BACKEND_REVIEW.md`): 16 hallazgos priorizados en 4 dimensiones (modelado de dominio/schema, acoplamiento entre módulos, contrato de API, preparación para producción).
- **Frontend**: React 18, páginas para todos los módulos activos, pero sin tipos compartidos con el backend (tipado `any` en las respuestas de API) — todavía no se hizo una integración/verificación end-to-end completa contra el backend ya reincorporado.
- **Todo commiteado y pusheado a `origin/main`** hasta el fix de `anular()` inclusive. `BACKEND_REVIEW.md` y este roadmap son los primeros documentos de esta nueva etapa, pendientes de commit.

## 2. Qué funcionalidades forman parte de SDC v1.0

**Incluido en v1.0** (los 7 módulos ya reincorporados y validados):
- Autenticación y roles (`AuthModule`) — login JWT, 6 roles (`ADMINISTRADOR`, `GERENCIA`, `OPERACIONES`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`).
- Catálogos maestros (`CatalogosModule`) — clientes, transportistas, choferes, vehículos, cereales, ubicaciones, tipos de gasto, productores, usuarios (solo lectura, ver sección 4).
- Gestión de viajes (`ViajesModule`) — ciclo de vida completo (`PENDIENTE` → `DESCARGADO`/`CANCELADO`), asignación de recursos.
- Anticipos y gastos (`AnticiposModule`) — carga, edición, anulación, exports.
- Liquidaciones a transportistas y choferes (`LiquidacionesModule`) — cálculo de comisión, confirmación, pago, anulación.
- Facturación a clientes (`FacturasModule`) — emisión, cobranzas, conciliación, anulación.
- Dashboard operativo (`DashboardModule`) — resumen agregado de viajes, facturación, liquidaciones y anticipos.

**Explícitamente fuera de v1.0**:
- Módulo de combustibles/estaciones de servicio (`_combustibles.disabled`) — requiere trabajo de schema propio, se trata como iniciativa separada, no como parte de esta v1.0.
- Gestión de usuarios vía API (alta/edición) — hoy solo `GET /usuarios` existe; altas de usuario siguen siendo manuales (DB/seed) para v1.0.

## 3. Checklist para salida a producción

Estos ítems deben resolverse (o decidirse conscientemente) antes del primer deploy real a Railway con datos de negocio reales. Ninguno implica cambios de lógica de negocio — son de infraestructura, configuración y seguridad de despliegue.

- [ ] Unificar los dos `Dockerfile` divergentes (raíz vs. `backend/`) en uno solo, confirmando cuál usa realmente Railway.
- [ ] Automatizar `prisma migrate deploy` como parte del pipeline de deploy (no a mano).
- [ ] Configurar `JWT_SECRET` real (fuerte, no el fallback `"dev-secret-change-me"`) como variable de entorno en Railway.
- [ ] Configurar `CORS_ORIGIN` apuntando al dominio real del frontend en producción (no `"*"`).
- [ ] Confirmar `DATABASE_URL` de producción apuntando a la instancia Postgres real de Railway (separada de la de desarrollo local).
- [ ] Agregar `.gitignore` (`node_modules/`, `dist/`, `.env`) antes de seguir commiteando.
- [ ] Smoke test manual de los 7 módulos activos contra el ambiente de staging/producción (repetir el mismo tipo de prueba que se hizo módulo por módulo en esta sesión, pero contra la infraestructura real).
- [ ] Confirmar que el frontend consume correctamente los 7 módulos ya reincorporados (integración pendiente, ver sección 7).
- [ ] Decidir y comunicar explícitamente que combustibles queda fuera de v1.0 (evitar expectativas desalineadas con negocio).

## 4. Backlog priorizado

### Crítico (antes de producción)
1. Unificación de Dockerfiles y automatización de `prisma migrate deploy` — riesgo directo de fallo de despliegue.
2. Configuración de secretos y CORS reales en el entorno de Railway (`JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL`).
3. `.gitignore` — previene fuga de secretos/binarios en cualquier commit futuro.
4. Integración y verificación completa del frontend contra los 7 módulos activos (próxima fase acordada).
5. Filtrar soft-delete (`activo: true`) en listados de `Cliente`/`Transportista` — hoy un registro "eliminado" sigue operable desde la API.

### Versión 1.1
1. Corrección de la deuda estructural `anticipoGastoId` en `LiquidacionMovimiento` (ya diagnosticada y planificada).
2. Introducir capa de servicio por módulo para eliminar la escritura cruzada entre controllers (ej. `LiquidacionesController` escribiendo directamente sobre `AnticipoGasto`/`Viaje`).
3. Paginación en los endpoints de listado (`viajes`, `liquidaciones`, `facturas`, `anticipos`).
4. Tests automatizados mínimos (e2e por módulo) — hoy no existe ninguna cobertura.
5. Unificar `EstadoFacturacionEnum` y `EstadoFacturaEnum` (o documentar por qué deben ser independientes).
6. Gestión de usuarios vía API (`POST`/`PATCH /usuarios`).
7. Validación de tipo Camión/Acoplado en `ViajesController`.
8. Swagger/OpenAPI para documentar el contrato de la API.

### Versión 1.2
1. Tipos compartidos entre backend y frontend.
2. CRUD simétrico completo en catálogos simples (`Cereales`, `Ubicaciones`, `TiposGasto` — hoy solo alta/listado).
3. Decisión definitiva sobre el módulo de combustibles: completar su schema y reactivarlo, o eliminarlo del repo.
4. Limpieza de archivos sueltos de la raíz del repo (esquemas viejos, notas de depuración).
5. Restricciones adicionales de schema (polimorfismo de `Liquidacion`, `condicionesComerciales` estructurado en `Cliente`).
6. `HEALTHCHECK` y usuario no-root en el Dockerfile unificado.

## 5. Riesgos conocidos

| Riesgo | Origen | Severidad |
|---|---|---|
| Dockerfiles divergentes entre entorno local y Railway | `BACKEND_REVIEW.md` §4 | Alta |
| Migraciones no automatizadas en el deploy | `BACKEND_REVIEW.md` §4 | Alta |
| Acoplamiento por escritura cruzada entre módulos (ya causó un bug real) | `BACKEND_REVIEW.md` §2 | Alta |
| Enums duplicados de estado de facturación sin garantía de sincronía | `BACKEND_REVIEW.md` §1 | Alta |
| Soft-delete que no filtra en listados | `BACKEND_REVIEW.md` §1 | Alta |
| Sin paginación en endpoints de listado | `BACKEND_REVIEW.md` §3 | Alta (crece con el volumen de datos) |
| Sin tests automatizados — cualquier regresión se detecta manualmente o por un usuario real | `PROJECT_STATUS.md` | Alta |
| `JWT_SECRET` con fallback hardcodeado en el código | `PROJECT_STATUS.md` | Alta si no se configura en el entorno real |
| Sin tipos compartidos backend/frontend | `BACKEND_REVIEW.md` §3 | Media |
| Deuda estructural `anticipoGastoId` (mitigada parcialmente, no resuelta) | Diagnóstico 2026-07-03 | Media (ya no es explotable en el caso más grave) |
| `package-lock.json` no versionado | `PROJECT_STATUS.md` | Media |
| Sin gestión de usuarios vía API | Auditoría de endpoints | Media |

## 6. Dependencias técnicas

- **Cuenta/proyecto Railway** con al menos: instancia PostgreSQL de producción (distinta de la de desarrollo local `cereal_db`), variables de entorno configuradas (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT`).
- **Dominio/URL del frontend en producción** — necesario para configurar `CORS_ORIGIN` correctamente; depende de dónde se decida desplegar el frontend (no confirmado todavía en este roadmap).
- **Node 20** — versión usada en ambos Dockerfiles (`node:20-alpine`), debe mantenerse consistente si se unifican.
- **Prisma 5.22.0** — hay una versión mayor disponible (7.8.0); no se recomienda actualizar como parte de la salida a producción de v1.0 (cambio de versión mayor, riesgo propio, mejor evaluarlo como iniciativa separada más adelante).
- **Postgres 16** (según `docker-compose.yml`) — confirmar que la instancia de Railway use una versión compatible.
- El deploy del frontend depende de que la integración completa (fase acordada como siguiente paso) esté terminada y verificada contra el backend ya reincorporado.

## 7. Recomendación de orden de implementación

1. **`.gitignore`** — primero, es de bajo riesgo, alto valor, y no depende de nada más.
2. **Unificar los Dockerfiles** — antes de tocar Railway, para no automatizar un deploy sobre una configuración que sabemos que está duplicada/divergente.
3. **Automatizar `prisma migrate deploy`** en el mismo paso que se ajusta el Dockerfile/pipeline de deploy.
4. **Configurar variables de entorno reales en Railway** (`JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL` de producción).
5. **Preparación del deploy a Railway** (fase ya acordada como siguiente paso de esta conversación) — con los puntos 1-4 ya resueltos, este paso queda mucho más seguro.
6. **Integración completa del frontend** (fase ya acordada como siguiente paso después del deploy) — verificar que las páginas React consuman correctamente los 7 módulos reincorporados, contra el backend ya desplegado.
7. **Filtrar soft-delete en listados** — de bajo esfuerzo, se puede resolver en paralelo a los pasos 5-6 sin bloquearlos.
8. Recién después de 1-7, considerar el backlog de v1.1 (capa de servicio, `anticipoGastoId`, paginación, tests) — no antes, para no mezclar estabilización de deploy con refactors de arquitectura.

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

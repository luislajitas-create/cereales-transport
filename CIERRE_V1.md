# Cierre técnico — SDC v1.2.0

**Nota sobre el número de versión:** este cierre fue solicitado inicialmente como "preparación final de SDC v1.0.0", pero la auditoría de control inicial (sección 0) encontró que **v1.0.0 y v1.1.0 ya existen como tags anotados, publicados en `origin` y declarados inmutables por decisión explícita previa del Product Owner**. El estado que este documento cierra está 63 commits por delante de `v1.1.0`. Confirmado con el Product Owner: el número correcto para este cierre es **v1.2.0** (bump menor per semver — todo el trabajo desde `v1.1.0` es aditivo/correctivo, sin cambios de API que rompan compatibilidad). Los campos `version` de `package.json` (raíz/backend) **no se actualizan** — se mantiene el patrón ya establecido desde `v1.1.0`, donde la versión vive únicamente en el tag de git.

- **Versión:** v1.2.0
- **Fecha de cierre:** 2026-08-08
- **Última base funcional previa al cierre:** `dabf23d36a62dbceebb5a1766c4facfbb3c3003b` (rama `main`, igual a `origin/main` — último commit funcional, UX-FIN-1). Este commit **no es** el commit de cierre: es el estado sobre el que se construye este documento.
- **Commit de cierre:** el commit que introduce este mismo documento (`CIERRE_V1.md`) sobre la base anterior. Su hash no puede figurar dentro de este archivo, porque el hash de un commit depende del contenido exacto de los archivos que incluye — ver el hash real en el reporte de entrega de esta tarea.
- **Tag:** `v1.2.0` (anotado) apuntará exactamente a ese commit de cierre, no a `dabf23d`.
- **Tags previos del proyecto:** `v1.0.0` → commit `9d1e29d` (2026-07-14) · `v1.1.0` → estabilización de Grupo Económico (2026-07-17)

---

## 0. Control inicial

- `main` = `origin/main` = `dabf23d36a62dbceebb5a1766c4facfbb3c3003b`. Staging vacío al iniciar esta tarea.
- `frontend/railway.json` y el resto de archivos ajenos a este cierre (documentos sueltos de bloques anteriores en la raíz, `offsite-backup/`, `restore-test/`) identificados y preservados sin tocar — ver lista exacta en el reporte de entrega.
- No se accedió a Railway ni a producción durante la preparación de este documento (solo se consultó, vía `railway status`/lectura de documentación existente, el estado ya confirmado por A-01 sobre PITR/Backups — sin ninguna llamada nueva a la API de Railway en esta tarea).

---

## 1. Alcance funcional entregado

Sistema de gestión integral para un dador de carga de cereales: viajes, facturación, cobranzas, liquidaciones a transportistas/choferes, catálogos maestros, y un Centro de Inteligencia de negocio — multi-organización desde su base, con soporte para grupos económicos (múltiples organizaciones relacionadas bajo un mismo grupo, con cambio de organización activa y pagos consolidados entre ellas).

| Módulo | Estado | Notas |
|---|---|---|
| Autenticación, roles, recuperación de contraseña | Completo | 6 roles (`ADMINISTRADOR, GERENCIA, OPERACIONES, LIQUIDACIONES, FACTURACION, LECTURA`), JWT, rate-limiting en login |
| Alta de organización (self-service) e invitaciones de usuario | Completo | Flujo público de registro + invitaciones administradas |
| Administración de Organización (datos, zona horaria) | Completo | |
| Grupo Económico (multi-organización) | Completo | Acceso multiempresa, cambio de organización activa, identidad de chofer compartida, pago consolidado entre organizaciones |
| Viajes | Completo | Ciclo de vida completo, paginación, búsqueda, filtros, acciones rápidas, documento operativo imprimible |
| Anticipos y gastos | Completo | |
| Liquidaciones | Completo | Cálculo automático de comisión, planilla imprimible/exportable, CTG como dato principal |
| Facturas y cobranzas | Completo | Anulación de cobranza, conciliación (`GET /facturas/conciliacion`), medio de pago obligatorio |
| Catálogos maestros | Completo | Clientes, Transportistas, Choferes, Vehículos, Cereales, Ubicaciones, Productores, Tipos de gasto — con importación CSV masiva para Clientes/Transportistas/Choferes/Vehículos |
| Dashboard operativo + Asistente de puesta en marcha | Completo | |
| Centro de Inteligencia (Dashboard Ejecutivo, Rentabilidad, Benchmarking, Aging de Cobranzas, Alertas) | Completo | Semántica de fechas compartida (`shared/fecha.ts`, `shared/vigencia.ts`) |
| Auditoría Administrativa | Completo | Trazabilidad de acciones sensibles, filtro por rango de fecha consciente de zona horaria |
| Notificaciones por email | Completo (como servicio) | Sin pantalla propia — invitaciones, recuperación de contraseña |
| Combustibles | **Deshabilitado, fuera del alcance** | Carpeta con sufijo `.disabled`, no registrada en `app.module.ts`, inalcanzable |

---

## 2. Arquitectura resumida

- **Backend:** NestJS + Prisma + PostgreSQL, API REST bajo prefijo global `/api/v1`.
- **Frontend:** React + Vite, SPA servida como estático.
- **Multi-tenancy:** aislamiento por organización implementado como Prisma Client Extension (`backend/src/prisma/organizacion-prisma.client.ts`) que intercepta los 14 métodos de nivel superior del cliente Prisma e inyecta/filtra `organizacionId` automáticamente para todo modelo marcado como "organizacional" (`organizacional-models.ts`, 21 modelos). Bloquea explícitamente escrituras anidadas (`connect`/`disconnect`) y el uso de `$queryRaw`/`$executeRaw` a nivel superior, con hardening adicional contra bypass vía `__proto__`/`constructor` (Bloque 11). Dos modelos que necesitan cruzar organizaciones del mismo grupo económico (`AccesoGrupoEconomico`, `PagoConsolidadoLiquidacion`) están explícitamente excluidos y aislados a mano, documentados como tal.
- **Red de seguridad automática:** `organizacional-models.spec.ts` usa el DMMF real de Prisma para verificar en cada corrida de CI que todo modelo con `organizacionId` en el schema está clasificado en una de las dos listas — evita que un modelo nuevo quede sin aislamiento por descuido.
- **Roles:** `RolesGuard` + decorador `@Roles()` en el backend (única autoridad real); el frontend oculta acciones no autorizadas por rol como mejora de UX, no como control de seguridad.

---

## 3. Controles de seguridad y aislamiento

- Aislamiento multi-organización con red de seguridad automática (ver arriba).
- `JWT_SECRET`/CORS con fail-fast si faltan (Bloque 8.1.a).
- Rate-limiting en login (`@nestjs/throttler`, Bloque 11 H-07) — bypass conocido documentado y pendiente de confirmación con soporte de Railway (ver deuda, sección 9).
- Sanitización de campos sensibles (`password`, `token`, `apiKey`, etc.) antes de escribir en `AuditLog` (`common/auditoria.ts`).
- `cuentaCorriente()` excluye facturas anuladas del cálculo (Bloque 11 H-08).
- Escaneo de secretos realizado sobre el repositorio como parte de este cierre: sin archivos `.env` versionados (solo `.env.example`, `.gitignore` los cubre explícitamente), sin credenciales ni tokens reales hardcodeados en código de producción o specs (solo contraseñas de prueba obvias tipo `Password123!` en fixtures de test), `backend/scripts/create-production-users.ts` lee credenciales exclusivamente de variables de entorno, nunca las hardcodea. Sin scripts temporales de bloques CAT/AUD/UX-FIN-1 remanentes en el repositorio.

---

## 4. Estrategia de backup y PITR

- Railway Pro (workspace actualizado desde Trial en el cierre de A-00, evidencia solo en documentación local, no versionada en este repositorio — ver nota al pie de esta sección).
- **PITR habilitado y operativo:** bucket `Postgres-PITR` confirmado con datos reales acumulados.
- **Volume Backups nativos:** habilitados (plan Pro).
- **Backup propio fuera de Railway (offsite):** implementado — mecanismo de exportación a almacenamiento externo (R2), directorio `offsite-backup/` en el entorno local (no versionado en git por diseño — no debe estarlo).
- **Drill de recuperación real ejecutado** (A-01 Tarea 7, 2026-07-27, `IMPLEMENTACION_A01_TAREA7.md` — sí versionado, commit `e5c42d6`): restauración completa de punta a punta contra un entorno aislado (`restore-test/`), resultado verificado — esquema completo (29 tablas) y datos reales recuperados, sobrevivió a una interrupción real del entorno. Se detectaron y corrigieron dos hallazgos reales de infraestructura no anticipados en el diseño original (ruta de volumen de PostgreSQL 18, fragilidad de Docker Desktop ante suspensión prolongada del host).

*Nota: parte de la evidencia de A-01 (auditoría inicial, acta de cierre de A-00, revalidación post-Pro, runbook detallado de restauración) existe como documentación local pero nunca fue commiteada a este repositorio — solo `IMPLEMENTACION_A01_TAREA7.md` (el drill en sí) está versionado. Esta sección resume esa evidencia sin poder referenciarla como parte del historial de git.*
- **Pendiente, no bloqueante** (ver sección 9): calendario formal de verificación periódica, confirmación formal de RPO/RTO por el Product Owner, checklist extendido de validación posterior a la restauración (integridad referencial, secuencias, verificación puntual de contenido, medición de RTO de punta a punta), cierre administrativo formal de A-01.

---

## 5. CI/CD

Workflow único (`.github/workflows/ci.yml`), dispara en `push`/`pull_request` a `main`, dos jobs paralelos:

- **`backend`** (con servicio `postgres:18-alpine` real, no mockeado): `npm install` → **DEV-1** (`npm run test:dev1`, entorno local seguro) → `prisma generate` → `prisma migrate deploy` → `prisma db seed` → `npm run build` → `npm run test` (Jest completo).
- **`frontend`**: `npm install` → `npm run build` (`tsc -b && vite build`, typecheck + build combinados).

Despliegue a Railway automático post-CI verde, confirmado en el push de UX-FIN-1 (commit `dabf23d`): ambos servicios (`cereales-transport` = backend, `perceptive-tranquility` = frontend) desplegados con el `commitHash` exacto, 1 réplica cada uno, healthcheck `/api/v1/health` exitoso, sin migraciones pendientes, sin errores 5xx ni crash-loop.

---

## 6. Matriz final de pruebas automatizadas

| Suite | Resultado |
|---|---|
| DEV-1 (arranque seguro del entorno local) | 14/14 ✅ |
| Jest backend (suite completa, sin caché) | 56 suites / 751 tests ✅ |
| Test nativo (`organizacion-payload.test.mjs`) | 13/13 ✅ |
| Backend build (`nest build`) | Limpio |
| Frontend build (`tsc -b` + `vite build`) | Limpio |
| `prisma validate` | Schema válido |
| `prisma migrate status` | 24 migraciones, base de datos al día, sin drift |
| `git diff --check` | Sin errores |

Cobertura por área: aislamiento multi-organización (test dedicado contra el DMMF real), roles/permisos backend (specs `.roles.spec.ts` en Organización/Anticipos/Clientes/Catálogos/Transportistas/Facturas), auditoría (specs de fecha/zona horaria), normalización de identificadores, importación CSV, dominios de fecha (negocio pura vs. timestamp real, incluyendo casos DST explícitos). **Deuda de cobertura, no bloqueante:** el frontend no tiene suite de tests automatizados para el gating de UI por rol — es puramente cosmético y depende exclusivamente de `RolesGuard` en el backend, que sí está cubierto.

---

## 7. Migraciones existentes

24 migraciones en `backend/prisma/migrations/`, desde `20260702165247_init` hasta `20260806185149_normalizacion_cuit_organizacion_productor_cat6`. Todas con `migration.sql` presente, `migration_lock.toml` en `postgresql`. Schema y migraciones reconciliados (`prisma migrate status`: "Database schema is up to date"). Este cierre **no agrega ninguna migración nueva** — el trabajo posterior a `v1.1.0` que sí tocó schema (normalización de identificadores, CAT-3/CAT-6) ya está incluido en las 24 migraciones existentes.

---

## 8. Procedimiento básico de operación y recuperación

**Operación normal:** push a `main` → CI (DEV-1, migrate deploy, build, test backend; build frontend) → si todo verde, Railway despliega automáticamente ambos servicios. Verificación post-deploy de solo lectura: `GET /api/v1/health` (backend, espera `{"status":"ok","database":"connected"}`), `GET /` (frontend, espera 200), `railway status` para confirmar `commitHash`/réplicas/estado.

**Recuperación ante incidente de base de datos:** procedimiento tipo ("Procedimiento B": descarga desde R2 → verificación de checksum → descifrado → `pg_restore`) documentado en un runbook local no versionado en este repositorio, validado con una ejecución real completa contra un entorno aislado (`IMPLEMENTACION_A01_TAREA7.md`, sí versionado). PITR de Railway disponible como alternativa/complemento nativo del proveedor.

**Nunca:** ejecutar `railway variables list` (imprime secretos reales en claro), ejecutar migraciones o seeds manualmente contra producción, hacer restart/redeploy manual sin necesidad — el pipeline automático es la única vía normal de despliegue.

---

## 9. Deudas conocidas no bloqueantes

Ninguna de las siguientes impide operar el sistema con dinero real hoy — están priorizadas y documentadas en `docs/deuda-tecnica/DEUDA_TECNICA.md`, que las clasifica explícitamente como no bloqueantes tras el cierre de los 5 bloqueantes originales del proyecto (4 completamente cerrados, 1 mitigado):

- **A-01, Tareas 8-10 pendientes:** calendario de verificación periódica del backup, confirmación formal de RPO/RTO por el Product Owner, cierre administrativo formal de A-01. El mecanismo en sí está implementado y probado (sección 4); lo pendiente es la formalización operativa continua.
- **Rate-limiting de login:** mitigado (Bloque 11, H-07), con un bypass conocido pendiente de confirmación con soporte de Railway.
- **Frontend sin tests automatizados de gating de rol** (ver sección 6) — cosmético, la autoridad real está en el backend.
- **`AuditoriaAdministrativa.tsx` → `formatearValorDetalle()`:** puede mostrar mal una fecha de "negocio pura" (ej. `Viaje.fecha`) si aparece anidada dentro de un payload JSON de auditoría — hallazgo de UX-FIN-1, documentado, no corregido (superficie distinta de Liquidaciones, que sí se corrigió).
- **`Facturas.tsx`/`FilaFactura.tsx`:** mismo patrón de visualización de fecha sin corregir fuera de Liquidaciones — hallazgo de UX-FIN-1, documentado, no corregido.
- **`normalizarFecha()`/`hoyNormalizado()`** (`inteligencia/shared/fecha.ts`) dependen de la TZ efectiva del proceso Node fuera de Benchmarking (Aging, Alertas, Vigencia, Dashboard Ejecutivo) — riesgo preexistente documentado en UX-FIN-1, no introducido ni resuelto ahí.
- **CUIT sin validación de dígito verificador** en Cliente/Transportista/Chofer (sí se valida en alta de Organización) — decisión de alcance documentada explícitamente desde CAT-2/CAT-3.
- **Prisma 5.22.0 → 7.9.1 disponible** (actualización mayor, no aplicada — fuera de alcance de cualquier bloque cerrado hasta ahora).
- **Documentación de proceso:** la reorganización a `docs/` (v1.0.0) no se sostuvo para los bloques posteriores (Grupo Económico 10.x, Bloque 11) — hay un volumen considerable de documentos de auditoría/diseño/decisión en la raíz del repositorio en vez de `docs/`. No afecta funcionalidad, es deuda de higiene documental.
- Resto de deuda de UX/accesibilidad/responsive/exportaciones incompletas — ver `docs/deuda-tecnica/DEUDA_TECNICA.md`, secciones C-G, todas explícitamente clasificadas como no bloqueantes de producción.

---

## 10. Exclusiones explícitas de esta versión

- Módulo de Combustibles (deshabilitado, no forma parte del alcance activo).
- Gestión de usuarios vía API/UI dedicada (fuera de alcance desde v1.0, sigue vigente).
- Portal de autoservicio para transportistas/clientes.
- Integración con facturación fiscal real (AFIP) — el módulo "Factura" es un registro interno, no reemplaza ni se integra con el régimen fiscal argentino.
- Alertas proactivas más allá de las ya existentes en el Centro de Inteligencia (documentales de vencimiento de licencia/seguro de choferes/vehículos, backup roto silencioso, etc.).
- Soporte mobile/responsive y accesibilidad WCAG AA — la aplicación es de uso exclusivo de escritorio hoy.
- Backup propio fuera de Railway con verificación periódica automatizada (el mecanismo existe y fue probado una vez; la verificación periódica formal queda pendiente, sección 9).

---

## 11. Próximo proyecto futuro — FUEL-APP

Fuera del alcance de este cierre y de SDC en sí: una aplicación separada y acotada, **FUEL-APP**, para enviar órdenes de combustible a estaciones de servicio. No se diseña ni se implementa como parte de este documento ni de este cierre — se deja registrada acá únicamente como el próximo proyecto identificado, a definir y planificar en una etapa futura independiente.

---

## 12. Estado de Git al momento de redactar este documento

- `main` = `origin/main` = `dabf23d36a62dbceebb5a1766c4facfbb3c3003b` (última base funcional, ver encabezado).
- Este documento (`CIERRE_V1.md`) es, en sí mismo, el único archivo del commit de cierre — no describe su propio hash porque no puede conocerse hasta después de escribirse. El hash real del commit de cierre y del tag `v1.2.0` que lo referencia quedan registrados fuera de este archivo (reporte de entrega de la tarea que lo generó).

# Estado del proyecto — Sistema Dador de Carga de Cereales

Última actualización: 2026-07-02 (post-commit `a2d4ca7`, pusheado a `origin/main`).

## Arquitectura actual

- **Backend**: NestJS 10 + TypeScript, Prisma ORM 5.22 sobre PostgreSQL. Entry point `backend/src/main.ts`, prefijo global de rutas `api/v1`. CORS habilitado vía `CORS_ORIGIN` (env), `ValidationPipe` global (`whitelist`, `transform`).
- **Auth**: JWT (`@nestjs/jwt` + `@nestjs/passport`), `JwtAuthGuard` + `RolesGuard` (roles: `ADMINISTRADOR`, `GERENCIA`, `OPERACIONES`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`). Implementado en `src/auth/`, pero el módulo no está montado en la app (ver "Módulos deshabilitados").
- **Frontend**: React 18 + React Router 6 + Axios, sin framework de UI adicional. Páginas en `frontend/src/pages/`: `Login`, `Dashboard`, `Viajes`, `ViajeForm`, `ViajeDetalle`, `Clientes`, `Transportistas`, `Catalogos`, `Anticipos`, `Liquidaciones`, `Facturas`, `Conciliacion`.
- **Deploy**: Dockerfile multi-stage (build con `npx prisma generate` + `nest build`, runtime solo con `dist/` y `node_modules/.prisma`), pensado para Railway (`railway.json` en la raíz).
- **Base de datos de desarrollo**: PostgreSQL local (`cereal_db` en `localhost:5432`), sin datos reales — solo datos de demo vía `prisma/seed.js`.

## Módulos activos

Hoy, `src/app.module.ts` **solo registra**:
```ts
imports: [PrismaModule]
controllers: [AppController]
```
Es decir, en tiempo de ejecución la única funcionalidad activa es `AppController` (endpoints de estado, ver abajo). Es un remanente deliberado del commit `c1c0574 "Disable all problematic modules"`, hecho para poder desplegar en Railway mientras el schema estaba roto. **No se revirtió todavía** aunque el schema y el build ya están sanos.

## Módulos deshabilitados

**a) No importados en `app.module.ts` (código completo, compila, pero no expone rutas en runtime):**
- `AuthModule` (`src/auth/`) — login JWT
- `CatalogosModule` (`src/catalogos/`) — agrupa `ClientesController`, `TransportistasController`, `ChoferesController`, `VehiculosController`, `CerealesController`, `UbicacionesController`, `TiposGastoController`, `ProductoresController`, `UsuariosController`
- `ViajesModule` (`src/viajes/`)
- `LiquidacionesModule` (`src/liquidaciones/`)
- `FacturasModule` (`src/facturas/`)
- `AnticiposModule` (`src/anticipos/`)
- `DashboardModule` (`src/dashboard/`)

**b) Excluido físicamente del build (renombrado, no compila):**
- `src/_combustibles.disabled/` (ex `src/combustibles/`) — módulo de gestión de combustible/estaciones de servicio. Excluido vía `tsconfig.json` (`"exclude": ["src/_*.disabled"]`). Referencia 7 modelos y 4 enums de Prisma que no existen en `schema.prisma` (`EstacionServicio`, `SolicitudCombustible`, `CuentaCorrienteEstacion`, `MovimientoCuentaCorriente`, `PagoEstacion`, `ReconciliacionCombustible`, `ConsumoCombustibleEstadistica`, y los enums `EstadoSolicitudCombustible`, `EstadoCuentaCorriente`, `TipoMovimientoCuenta`, `TipoMetodoPago`). Verificado que está 100% aislado del resto del backend (sin imports cruzados).

## Estado de Prisma

- `backend/prisma/schema.prisma`: **válido** (`npx prisma validate` OK).
- 20 modelos, 9 enums. Modelos: `Usuario`, `Cliente`, `Contacto`, `Productor`, `Transportista`, `Chofer` (con `comisionPct Float @default(0)`, restaurado), `Vehiculo`, `Cereal`, `Ubicacion`, `TipoGasto`, `Viaje`, `HistorialEstadoViaje`, `AnticipoGasto`, `Liquidacion`, `LiquidacionViaje`, `LiquidacionMovimiento`, `Factura`, `FacturaViaje`, `Cobranza`, `AuditLog`.
- Prisma Client generado y sincronizado con el schema actual.
- `prisma/seed.js` corre sin errores contra el schema actual y carga datos de demo (6 usuarios, clientes, transportistas, choferes, vehículos, viajes, anticipos, facturas).

## Estado de migraciones

- Historial reconstruido desde cero el 2026-07-02 (el historial previo estaba roto — ver "Problemas conocidos" para el detalle histórico).
- Migraciones actuales en `backend/prisma/migrations/`:
  1. `20260702165247_init` — crea las 20 tablas del schema completo.
  2. `20260702171557_add_comision_pct_to_chofer` — agrega `comisionPct` a `Chofer`.
- `npx prisma migrate status` → "Database schema is up to date" contra la base de desarrollo local.
- Migraciones viejas del módulo de combustibles y de un intento anterior de `comisionPct` fueron eliminadas del directorio activo; quedan copias de referencia sin trackear en `../backup-migrations/` y `../migrations-old/` (fuera de `backend/`), no se tocaron.

## Endpoints existentes

**Activos en runtime hoy** (único módulo montado):
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1` | Info/estado de la app |
| GET | `/api/v1/health` | Health check |

**Existen en código, compilan, pero NO están montados** (requieren registrar su módulo en `app.module.ts` para responder):

| Controller | Ruta base | Endpoints |
|---|---|---|
| `AuthController` | `/auth` | `POST /login` |
| `ChoferesController` | `/choferes` | `GET`, `GET /:id`, `POST`, `PATCH /:id`, `GET /export/excel`, `GET /export/pdf` |
| `ClientesController` | `/clientes` | `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `GET /export/excel`, `GET /export/pdf`, `GET /:id/cuenta-corriente` |
| `TransportistasController` | `/transportistas` | `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `GET /export/excel`, `GET /export/pdf` |
| `VehiculosController` | `/vehiculos` | `GET`, `POST`, `PATCH /:id` |
| `CerealesController` / `UbicacionesController` / `TiposGastoController` / `ProductoresController` / `UsuariosController` | `/cereales`, `/ubicaciones`, `/tipos-gasto`, `/productores`, `/usuarios` | CRUD simple (`GET`/`POST`, `Productores` con `PATCH`) |
| `ViajesController` | `/viajes` | `GET`, `GET /pendientes-facturar`, `GET /:id`, `POST`, `PATCH /:id`, `POST /:id/estado`, `POST /:id/cancelar` |
| `LiquidacionesController` | `/liquidaciones` | `GET`, `GET /candidatos`, `GET /:id`, `GET /:id/excel`, `GET /:id/pdf`, `POST`, `POST /:id/confirmar`, `POST /:id/pagar`, `POST /:id/anular` |
| `FacturasController` | `/facturas` | `GET`, `GET /export/excel`, `GET /export/pdf`, `GET /conciliacion`, `GET /:id`, `POST`, `POST /:id/anular`, `POST /:id/cobranzas` |
| `AnticiposController` | `/anticipos` | `GET`, `GET /export/excel`, `GET /:id`, `POST`, `PATCH /:id` |
| `DashboardController` | `/dashboard` | `GET /resumen` |

**No existen**: Swagger/OpenAPI (no configurado), `GET /` y `GET /api` (no hay rutas fuera del prefijo `/api/v1`).

## Problemas conocidos

1. **Módulos de negocio no montados** (el más importante): toda la lógica real (auth, choferes, clientes, transportistas, vehículos, viajes, liquidaciones, facturas, anticipos, dashboard) existe, compila y pasó validación de build, pero **no responde en runtime** porque `app.module.ts` no la importa. Hoy el backend desplegado solo sirve como health-check.
2. **Módulo de combustibles incompleto**: 7 modelos + 4 enums de Prisma que el controller necesita no existen en el schema. Deshabilitado (renombrado a `_combustibles.disabled`), no se perdió código, pero requeriría trabajo de schema + migración nueva para reactivarse.
3. **Sin `.gitignore`**: no existe en ningún nivel del repo. `node_modules/`, `dist/`, `backend/.env` y `package-lock.json` aparecen como "sin trackear" en cada `git status` — riesgo de commitear secretos o binarios por accidente.
4. **Archivos sueltos de depuraciones anteriores en la raíz del repo**, sin relación con el estado actual del schema: `schema.prisma`, `schema-corrected.prisma`, `schema-correcto.prisma`, `schema-prisma-CORRECTO.prisma`, `schema-prisma-FINAL-CORRECTO.prisma`, `fix-prisma-schema.patch`, `DIAGNOSTICO_Y_SOLUCION.md`, `IMPLEMENTATION_STATUS.md`, `QUICK_SUMMARY.txt`, `REDEPLOY.txt`, `TRIGGER_BUILD2.txt`, y un backup `backend/prisma/schema.prisma.backup-reducido`. Ninguno se tocó; son candidatos a limpieza.
5. **Sin tests**: no se encontró ningún `*.spec.ts` ni `*.e2e-spec.ts` en el proyecto.
6. **`JWT_SECRET` con fallback inseguro en código**: `src/auth/auth.module.ts` usa `process.env.JWT_SECRET || "dev-secret-change-me"` — aceptable en desarrollo, a revisar antes de un despliegue real si `.env` no está seteado en el entorno de producción.
7. **`package-lock.json` no versionado**: al no estar en git, los installs no están garantizados byte-a-byte reproducibles entre entornos.
8. **Bug en `LiquidacionesModule` — `anular()` puede des-liquidar anticipos de otras liquidaciones (detectado 2026-07-02, prioridad Alta antes de producción)**:
   - **Bug**: en `src/liquidaciones/liquidaciones.controller.ts`, el método `anular()` de `LiquidacionesController` ejecuta un `anticipoGasto.updateMany` para revertir `liquidado: false` en los anticipos de la liquidación anulada. Cuando la liquidación anulada **no tiene movimientos** (`anticipoViajeIds.length === 0`), el filtro condicional por `viajeId` no se agrega, y el `where` queda reducido a `{ liquidado: true }` sin ninguna restricción — un `updateMany` global sobre toda la tabla.
   - **Impacto**: anular una liquidación sin anticipos asociados marca como `liquidado: false` **todos** los anticipos actualmente liquidados en la base, sin importar a qué liquidación pertenezcan — incluyendo anticipos de liquidaciones ya `PAGADA`s y no relacionadas con la que se está anulando.
   - **Evidencia**: detectado el 2026-07-02 al probar `GET /dashboard/resumen` (paso de registro de `DashboardModule`). El campo `anticiposNoLiquidados` reportó $153.000/4 anticipos en vez de los $85.000/2 esperados según el historial de pruebas de la sesión. Se confirmó vía API que los 2 anticipos de Miguel Sosa, liquidados por una liquidación ya `PAGADA`, habían vuelto a `liquidado: false` tras anular una liquidación distinta (tipo `TRANSPORTISTA`, con `movimientos: 0`).
   - **Estado**: Corregido el 2026-07-03. Fix aplicado en `LiquidacionesController.anular()`: si la liquidación no tiene movimientos, no se ejecuta `updateMany` sobre `AnticipoGasto`.
   - **Prioridad**: Alta — debe resolverse antes de exponer este módulo con datos reales, ya que corrompe silenciosamente el estado de liquidación de anticipos ajenos a la operación realizada.
   - **Deuda estructural pendiente (no resuelta por este fix)**: la relación entre `LiquidacionMovimiento` y `AnticipoGasto` debería ser por `anticipoGastoId`, no por `viajeId`. Hoy `LiquidacionMovimiento` no guarda el id del anticipo original, así que `anular()` solo puede reconstruir la relación de forma indirecta vía `viajeId` — impreciso si un mismo viaje tiene más de un anticipo asociado (revertiría todos, no solo el de esta liquidación). Requiere agregar el campo `anticipoGastoId` a `LiquidacionMovimiento` y una migración; queda pendiente para una próxima iteración.

## Próximos pasos recomendados

1. **Registrar los módulos existentes en `app.module.ts`** (`AuthModule`, `CatalogosModule`, `ViajesModule`, `LiquidacionesModule`, `FacturasModule`, `AnticiposModule`, `DashboardModule`) y volver a correr build + smoke test de cada endpoint antes de desplegar — es la brecha más grande entre "lo que existe" y "lo que funciona hoy".
2. **Agregar un `.gitignore`** que cubra `node_modules/`, `dist/`, `.env`, y decidir conscientemente si `package-lock.json` se versiona.
3. **Decidir el destino del módulo de combustibles**: completar su schema y reactivarlo, o eliminarlo definitivamente si no es prioridad de negocio.
4. **Limpiar los archivos sueltos de la raíz** listados en "Problemas conocidos" punto 4, una vez confirmado que no hay nada rescatable en ellos.
5. **Agregar tests** (al menos e2e básicos por módulo) antes de habilitar los módulos de negocio en producción, dado que no hay ninguna cobertura automatizada hoy.
6. **Configurar Swagger/OpenAPI** si se necesita documentación de API para consumo externo o por el frontend.
7. **Revisar `JWT_SECRET`** en el entorno de despliegue real (Railway) para asegurar que no dependa del fallback hardcodeado.

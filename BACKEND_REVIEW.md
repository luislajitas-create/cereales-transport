# Revisión arquitectónica del backend — Sistema Dador de Carga de Cereales

Fecha: 2026-07-03. Alcance: `backend/` (NestJS + Prisma + PostgreSQL). Revisión puramente de diagnóstico — no se modificó código, schema ni se generaron migraciones como parte de este documento.

Esta revisión se hizo en 4 dimensiones, en el orden en que se ejecutó: (1) modelado de dominio y schema, (2) límites y acoplamiento entre módulos, (3) diseño de API / contrato con el frontend, (4) preparación para producción.

---

## 1. Modelado de dominio y schema Prisma

### Fortalezas
- 20 modelos con relaciones explícitas y bien nombradas; nomenclatura en español consistente con el dominio del negocio.
- Uso correcto de `onDelete: Cascade` donde tiene sentido (`Contacto→Cliente`, `HistorialEstadoViaje→Viaje`, `LiquidacionViaje/LiquidacionMovimiento→Liquidacion`, `FacturaViaje/Cobranza→Factura`).
- Índices en las columnas que efectivamente se filtran en las queries activas (`Viaje.fecha/clienteId/transportistaId/estado`, `AnticipoGasto.choferId+fecha`, etc.).

### Debilidades
- **Enums duplicados/solapados**: `EstadoFacturacionEnum` (`Viaje.estadoFacturacion`) y `EstadoFacturaEnum` (`Factura.estado`) comparten 4 de 5 valores — representan el mismo concepto de "estado de facturación" en dos tablas, sincronizadas a mano por código de aplicación en 3 puntos distintos (`FacturasController.create/anular/registrarCobranza`).
- **Sin validación de tipo Camión/Acoplado**: nada impide asignar un `Vehiculo` de `tipo: ACOPLADO` al campo `Viaje.camionId` (o viceversa) — no hay chequeo ni en el schema ni en `ViajesController.create()`.
- **Soft-delete (`activo`) incompleto**: `Cliente`/`Transportista` soportan soft-delete (`DELETE` → `activo: false`, verificado en código), pero `GET /clientes` y `GET /transportistas` no filtran por `activo: true` — un registro "eliminado" sigue apareciendo en listados y sigue siendo operable. Además, el campcampo `activo` solo existe en 2 de 9 modelos de catálogo.
- **Relación indirecta `LiquidacionMovimiento` ↔ `AnticipoGasto`**: ya diagnosticada en detalle (2026-07-03), causó un bug real en `anular()` (corregido), la causa estructural queda documentada como mejora planificada para la próxima versión.
- **Asociación polimórfica sin restricción de schema**: `Liquidacion.transportistaId`/`choferId` (ambos nullable + discriminador `tipo`) dependen enteramente de la validación en `create()` para no quedar ambos nulos o ambos seteados.

### Riesgos
- Los enums duplicados son la misma clase de riesgo que el bug de `LiquidacionesModule.anular()` ya corregido: dos fuentes de verdad para un mismo estado, sin garantía de sincronía a nivel de base.
- El soft-delete incompleto puede generar confusión operativa real (un cliente "borrado" que sigue recibiendo viajes/facturas).

### Prioridad: **Alta** (los enums duplicados y el soft-delete incompleto), **Media** (validación de tipo de vehículo, polimorfismo sin restricción).

### Recomendaciones
1. Evaluar unificar `EstadoFacturacionEnum` y `EstadoFacturaEnum` en un solo enum compartido, o documentar explícitamente por qué deben ser independientes si hay una razón de negocio real.
2. Agregar `where: { activo: true }` por defecto en los listados de `Cliente`/`Transportista` (con un query param opcional para incluir inactivos si hace falta).
3. Agregar una validación mínima en `ViajesController.create()`/`update()` que verifique `vehiculo.tipo` antes de asignar `camionId`/`acopladoId`.

---

## 2. Límites y acoplamiento entre módulos

### Fortalezas
- Los 7 módulos de negocio (`Auth`, `Catalogos`, `Viajes`, `Anticipos`, `Liquidaciones`, `Facturas`, `Dashboard`) mapean razonablemente bien a conceptos del dominio.
- Ningún `*.module.ts` importa otro módulo de negocio — cero dependencias circulares o de import entre módulos.
- El módulo de combustibles (deshabilitado) demuestra que el proyecto sí puede aislar un módulo completo de forma limpia cuando hace falta — está 100% desacoplado del resto (verificado, sin imports cruzados).
- `PrismaModule` correctamente `@Global()` — una sola fuente de acceso a datos, sin duplicar conexiones.

### Debilidades
- **Sin capa de servicio/dominio**: toda la lógica de negocio vive directamente en los controllers (`@Controller`), incluyendo orquestación de transacciones (`$transaction`), generación de reportes (Excel/PDF) y validación. Son "fat controllers" que mezclan HTTP, lógica de negocio y presentación en una sola clase.
- **Acoplamiento por base de datos compartida sin dueño claro**: confirmé que `LiquidacionesController` escribe directamente sobre `Viaje` (`estadoLiquidacion`) y `AnticipoGasto` (`liquidado`) — modelos que "pertenecen" conceptualmente a `ViajesModule` y `AnticiposModule`. De la misma forma, `FacturasController` escribe directamente sobre `Viaje.estadoFacturacion`. Ningún módulo es dueño exclusivo de sus propios datos; cualquier controller puede mutar cualquier tabla.
- **Dependencia oculta e invisible para el compilador**: cualquier controller con `@UseGuards(JwtAuthGuard)` depende en tiempo de ejecución de que `AuthModule` esté cargado en algún punto de `app.module.ts` (para que se registre la estrategia Passport `"jwt"`) — ya documentado, mitigado al registrar los módulos en el orden correcto, pero sigue siendo un patrón frágil.
- **Helpers duplicados**: la función `fmtMoney`/`formatMoney` está copiada de forma casi idéntica en 5 controllers distintos (`choferes`, `transportistas`, `anticipos`, `liquidaciones`, `facturas`) en vez de vivir en un módulo compartido.

### Riesgos
- El acoplamiento por base de datos compartida **ya causó un incidente real**: el bug de `LiquidacionesController.anular()` pudo dañar silenciosamente datos de `AnticipoGasto` precisamente porque `LiquidacionesModule` tiene acceso de escritura irrestricto a una tabla que no es "suya". Si mañana aparece un bug similar en otro controller que también escribe sobre `Viaje` o `AnticipoGasto`, no hay ninguna barrera arquitectónica que lo contenga.
- A medida que se agreguen más módulos (o se reactive combustibles), el patrón de "cualquiera escribe cualquier tabla" escala mal — cada nuevo controller es una superficie más para el mismo tipo de bug.

### Prioridad: **Alta** (el acoplamiento por escritura cruzada, dado que ya causó un bug real), **Media** (falta de capa de servicio, helpers duplicados).

### Recomendaciones
1. Introducir servicios delgados por módulo que encapsulen las escrituras sobre "sus" modelos (ej. `AnticiposService.marcarLiquidados(ids)` / `.revertirLiquidados(ids)`), y que `LiquidacionesController` los use en vez de llamar `tx.anticipoGasto.*` directamente. Esto no elimina el acoplamiento funcional (Liquidaciones necesita afectar Anticipos), pero lo hace explícito y auditable en un solo punto por modelo.
2. Extraer `fmtMoney`/formatters compartidos a un módulo común (`src/common/format.ts` o similar).
3. Documentar la dependencia Passport/`AuthModule` con un comentario en `jwt-auth.guard.ts`, no solo en `PROJECT_STATUS.md`.

---

## 3. Diseño de API / contrato con el frontend

### Fortalezas
- Convención de rutas consistente en todo el backend: sustantivos en plural para recursos (`/clientes`, `/viajes`), kebab-case para rutas compuestas (`/pendientes-facturar`, `/tipos-gasto`), y `POST /:id/<accion>` consistentemente para transiciones de estado (`estado`, `confirmar`, `pagar`, `anular`, `cancelar`) en vez de mezclar verbos HTTP de forma ambigua.
- Formato de error consistente en toda la API (`{statusCode, message, error}`) gracias al exception filter por defecto de NestJS — no hay controllers que reformen el shape de error a mano.
- Auth y autorización con un único patrón (`JwtAuthGuard` + `RolesGuard` + `@Roles(...)`) aplicado de forma uniforme.
- `ValidationPipe` global con `whitelist: true` — rechaza silenciosamente campos no declarados en los DTOs (donde existen DTOs).

### Debilidades
- **Sin paginación en ningún endpoint activo**: confirmé que ningún `findMany` de los controllers activos usa `skip`/`take` — todos los listados (`/viajes`, `/liquidaciones`, `/facturas`, `/anticipos`, todos los catálogos) devuelven el dataset completo sin límite. Irónicamente, el módulo de combustibles **deshabilitado** sí tenía paginación (`skip`/`take` como query params) — los módulos activos son, en este aspecto puntual, menos maduros que el código que está apagado.
- **Sin capa de DTOs de respuesta**: los controllers devuelven directamente el resultado de Prisma (con sus `include`s) — el "contrato" de la API es, literalmente, lo que Prisma decida devolver según el `include` de cada query. Un cambio en un `include` cambia el contrato sin ningún aviso ni control de versión.
- **Sin tipos compartidos con el frontend**: confirmé que el frontend (`Liquidaciones.tsx`, `Viajes.tsx`, etc.) tipa las respuestas de la API como `any[]`/`any` — no hay ningún tipo TypeScript compartido entre backend y frontend. Un cambio de forma en la respuesta del backend no lo detecta el compilador del frontend, solo se nota en runtime.
- **Sin Swagger/OpenAPI**: ya señalado en la auditoría general — sigue sin existir documentación formal de la API.
- **CORS abierto por defecto**: `main.ts` usa `CORS_ORIGIN || "*"` — si la variable de entorno no está seteada en el deploy, la API acepta requests de cualquier origen.

### Riesgos
- La falta de paginación es un riesgo de performance concreto en cuanto haya volumen real de datos (`GET /viajes` o `GET /liquidaciones` sin límite, con miles de registros, cargando todas las relaciones `include`).
- La falta de tipos compartidos es un riesgo de mantenibilidad: cualquier refactor de un `include` en el backend puede romper el frontend sin que ningún test o compilador lo detecte, hasta que un usuario lo reporta.

### Prioridad: **Alta** (paginación, dado que es un problema de performance con el tiempo, no solo de estilo), **Media** (tipos compartidos, Swagger), **Baja** (CORS, ya que depende de que se configure bien `CORS_ORIGIN` en el deploy real, lo cual ya está señalado en `PROJECT_STATUS.md`).

### Recomendaciones
1. Agregar paginación (`skip`/`take` o cursor-based) a los endpoints de listado más grandes (`viajes`, `liquidaciones`, `facturas`, `anticipos`) — el propio módulo de combustibles deshabilitado ya tiene el patrón a copiar.
2. Evaluar generar/compartir tipos TypeScript entre backend y frontend (ej. un paquete compartido, o al menos interfaces manuales sincronizadas a mano si un monorepo con tipos compartidos es demasiado por ahora).
3. Configurar Swagger/OpenAPI si el frontend (u otros consumidores) necesitan un contrato formal.
4. Confirmar que `CORS_ORIGIN` esté seteado explícitamente en cualquier entorno que no sea desarrollo local.

---

## 4. Preparación para producción (infraestructura y deploy)

### Fortalezas
- `docker-compose.yml` completo para desarrollo local: levanta Postgres con healthcheck, backend y frontend con sus variables de entorno — buena experiencia de desarrollo.
- Build multi-stage en ambos Dockerfiles (build separado del runtime).
- `railway.json` mínimo y correcto en su forma (`builder: dockerfile`).

### Debilidades
- **Dos Dockerfiles distintos y divergentes**: encontré `Dockerfile` (raíz del repo) y `backend/Dockerfile`, con contenido diferente:
  - El de la raíz asume que el contexto de build es la raíz del repo (`COPY backend/package*.json`, etc.) y en el stage de runtime copia `node_modules` completo (incluye dependencias de desarrollo como `typescript`, `@nestjs/cli`).
  - El de `backend/` asume que el contexto de build es `backend/` (`COPY package*.json ./`), y sí optimiza el runtime (`npm install --only=prod`, copia solo `node_modules/.prisma`).
  - `docker-compose.yml` (`build: context: ./backend`) usa el de `backend/Dockerfile`. `railway.json` está en la raíz, con `builder: dockerfile` — normalmente Railway resuelve esto contra el `Dockerfile` de la raíz del repo. **Es decir: el entorno local (docker-compose) y el de producción (Railway) probablemente construyen la imagen de formas distintas**, con el de producción siendo la versión menos optimizada (imagen más pesada, con devDependencies incluidas).
- **Ningún Dockerfile ejecuta `prisma migrate deploy`**: el `CMD` en ambos es simplemente `node dist/main.js` — no hay ningún paso, ni en el Dockerfile ni en `railway.json`, que aplique migraciones pendientes contra la base de producción antes de arrancar. Esto significa que cualquier migración nueva requiere un paso manual fuera del pipeline de deploy, algo fácil de olvidar.
- **Secreto de ejemplo hardcodeado en `docker-compose.yml`**: `JWT_SECRET: "cambiar-este-secreto-en-produccion"` — es un placeholder explícito para desarrollo local, pero es exactamente el tipo de valor que puede copiarse sin querer a un entorno real si alguien reutiliza el archivo como base.
- Ningún `HEALTHCHECK` de Docker definido (a pesar de que la app expone `GET /api/v1/health`), y ningún usuario no-root definido en los Dockerfiles (corren como root).
- Ya señalado en la auditoría general y no repetido en detalle acá: sin `.gitignore`, sin tests automatizados, `JWT_SECRET` con fallback hardcodeado en el código de la app.

### Riesgos
- **El más importante**: si Railway efectivamente usa el `Dockerfile` de la raíz (no optimizado) mientras el equipo prueba localmente con `backend/Dockerfile` (optimizado), cualquier diferencia de comportamiento entre ambos (tamaño de imagen, dependencias presentes) puede pasar desapercibida hasta que falle en producción y no en local.
- Sin `prisma migrate deploy` automatizado, hay riesgo real de desplegar código nuevo contra un schema de base de datos desactualizado — el mismo tipo de desincronización que motivó gran parte del trabajo de esta sesión.

### Prioridad: **Alta** (los dos Dockerfiles divergentes y la falta de `migrate deploy` automatizado — ambos pueden causar fallos de despliegue silenciosos), **Media** (secreto placeholder, healthcheck/usuario no-root).

### Recomendaciones
1. Decidir un único Dockerfile como fuente de verdad (recomendado: quedarse con la versión optimizada de `backend/Dockerfile` y ajustar el contexto de build en Railway para que apunte ahí, o mover su contenido a la raíz), y eliminar el otro para que no puedan divergir más.
2. Agregar un paso de `prisma migrate deploy` al pipeline de deploy (como parte del `startCommand` de Railway, o como un paso de "release" separado si la plataforma lo soporta) — nunca a mano.
3. Reemplazar el placeholder de `JWT_SECRET` en `docker-compose.yml` por una instrucción clara (ej. `JWT_SECRET: "${JWT_SECRET:?debes setear JWT_SECRET}"` o un comentario explícito) para que no pueda copiarse por error.
4. Agregar `HEALTHCHECK` en el Dockerfile apuntando a `/api/v1/health`, y considerar correr como usuario no-root.

---

## Tabla consolidada de prioridades

| # | Hallazgo | Dimensión | Prioridad |
|---|---|---|---|
| 1 | Dos Dockerfiles divergentes (local vs. producción probablemente distintos) | Producción/deploy | **Alta** |
| 2 | Sin `prisma migrate deploy` automatizado en el pipeline | Producción/deploy | **Alta** |
| 3 | Acoplamiento por escritura cruzada entre módulos (ya causó el bug de `anular()`) | Módulos | **Alta** |
| 4 | Enums duplicados `EstadoFacturacionEnum`/`EstadoFacturaEnum` | Schema | **Alta** |
| 5 | Soft-delete (`activo`) no filtra en listados | Schema | **Alta** |
| 6 | Sin paginación en ningún endpoint de listado | API/contrato | **Alta** |
| 7 | `anticipoGastoId` faltante en `LiquidacionMovimiento` | Schema | Alta (ya diferido a próxima versión) |
| 8 | Sin capa de servicio (fat controllers) | Módulos | Media |
| 9 | Sin tipos compartidos backend/frontend | API/contrato | Media |
| 10 | Sin validación de tipo Camión/Acoplado en Viaje | Schema | Media |
| 11 | Sin Swagger/OpenAPI | API/contrato | Media |
| 12 | Secreto placeholder en `docker-compose.yml` | Producción/deploy | Media |
| 13 | Helpers de formato duplicados (`fmtMoney`) | Módulos | Media |
| 14 | Sin `HEALTHCHECK` / usuario no-root en Docker | Producción/deploy | Media |
| 15 | Polimorfismo `Liquidacion` sin restricción de schema | Schema | Baja |
| 16 | CORS abierto por defecto si falta `CORS_ORIGIN` | API/contrato | Baja |

## Relación con hallazgos previos de esta sesión

Esta revisión se apoya y no repite el trabajo ya documentado en `PROJECT_STATUS.md` (estado de módulos, migraciones, endpoints existentes, y el bug ya corregido de `LiquidacionesController.anular()`). Los hallazgos 3 y 7 de la tabla de arriba son, de hecho, la raíz estructural que explica por qué ese bug fue posible — quedan conectados a propósito.

## Próximos pasos sugeridos (sin ejecutar nada todavía)

1. Resolver el punto 1 y 2 (Dockerfiles divergentes + migraciones automatizadas) antes de cualquier despliegue real — son los de mayor riesgo de causar un incidente en producción.
2. Abordar el punto 3 (acoplamiento entre módulos) de forma incremental, empezando por el camino que ya mostró ser frágil (Liquidaciones ↔ Anticipos), en conjunto con la corrección de `anticipoGastoId` ya planificada.
3. Evaluar los puntos 4-7 (schema) en un solo esfuerzo coordinado, dado que todos requieren tocar `schema.prisma` y generar migraciones — más eficiente resolverlos juntos que uno por uno.
4. Paginación (punto 6) puede resolverse de forma aislada y de bajo riesgo en cualquier momento, sin depender de los demás.

No se modificó ningún archivo de código, schema ni se generaron migraciones para producir este documento.

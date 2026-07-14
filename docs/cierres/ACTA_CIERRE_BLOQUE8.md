# Acta de Cierre — Bloque 8 (Multiempresa)

Fecha: 2026-07-13. Documento de cierre de `METODOLOGIA_SDC.md`, etapa 9. Registra la ejecución de la Fase F de `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md` — el único requisito pendiente identificado por la auditoría final previa a este documento. Ejecutada íntegramente en **desarrollo**; producción no fue tocada en ningún momento de esta validación.

---

## 1. Qué se ejecutó

Fase F tal como la define el plan (sección 1, líneas 19-21; sección 6): una segunda organización de prueba **persistente** (no efímera, no creada-y-borrada dentro de un mismo script), con su propio catálogo completo, validada mediante el flujo real del sistema — HTTP → JWT → Interceptor → AsyncLocalStorage → Prisma Extension → base de datos — no mediante llamadas directas a Prisma.

**Única excepción, explícita y acotada**: la creación de la Organización B y su primer usuario administrador se hizo por acceso directo a la base. No existe hoy ningún endpoint HTTP para crear una organización o un usuario nuevo (`UsuariosController` solo tiene `GET` — hallazgo ya documentado en la auditoría de productización de Bloque 8, no es una funcionalidad nueva que se haya construido para este cierre). Esta es la misma razón por la que la Organización original se creó por Backfill y no por API. A partir de ese único punto de partida, **todo el resto de la Fase F —construcción del catálogo, viajes, facturación, cobranzas, liquidaciones, y la totalidad de la validación— se ejecutó exclusivamente vía HTTP con tokens JWT reales.**

## 2. Organización B — dataset construido vía HTTP real

Con el usuario `admin@orgb-fasef.test` autenticado (login real, JWT real), se crearon vía `POST` real:

- 1 Cliente, 1 Transportista, 1 Chofer, 1 Vehículo, 1 Cereal, 2 Ubicaciones, 1 Tipo de Gasto.
- 1 Viaje, llevado por HTTP (`POST /viajes/:id/estado`) a través de los 6 estados hasta `DESCARGADO`.
- 1 Factura (`POST /facturas`, ejercitando `$transaction`: Factura + FacturaViaje + actualización de Viaje en una sola operación).
- 1 Cobranza parcial sobre esa factura (`POST /facturas/:id/cobranzas`).
- 1 Anticipo de gasto (`POST /anticipos`).
- 1 Liquidación por chofer (`POST /liquidaciones`, ejercitando `$transaction`: Liquidacion + LiquidacionViaje + LiquidacionMovimiento + actualización de Viaje/Anticipo).

**Valores deliberadamente idénticos a la Organización A** (mismo CUIT, misma razón social, mismo DNI/CUIL, misma patente, mismo CTG, mismo número de factura):

| Campo | Organización A | Organización B |
|---|---|---|
| Cliente — razón social / CUIT | Aceitera del Litoral S.A. / 30-12345678-9 | Aceitera del Litoral S.A. / 30-12345678-9 |
| Transportista — razón social / CUIT | Logística del Norte S.R.L. / 30-77788899-0 | Logística del Norte S.R.L. / 30-77788899-0 |
| Chofer — nombre / DNI / CUIL | Carlos Gómez / 30111222 / 20-30111222-3 | Carlos Gómez / 30111222 / 20-30111222-3 |
| Vehículo — patente | AD789GH | AD789GH |
| Viaje — CTG | CTG-TEST-0003 | CTG-TEST-0003 |
| Factura — número | REG-1783475965740 | REG-1783475965740 |

Las 6 unicidades por organización (`schema.prisma`) permitieron esta coincidencia total sin ningún error — confirmando en runtime, vía API real, lo que Bloque 8.1.b.4.2 ya había verificado a nivel de base.

## 3. Pruebas de aceptación — resultado

**Login de ambas organizaciones**: PASS. Dos `POST /auth/login` reales, dos JWT válidos, cada uno con el `organizacionId` correcto.

**CRUD completo, transacciones, escritura, actualización, eliminación, búsquedas, relaciones** — 42 endpoints verificados (21 por organización): **42/42 PASS** (`200`). Adicionalmente:
- Creación de Viaje/Factura/Liquidación reales vía `POST`, las dos últimas ejercitando `$transaction`.
- Actualización de un registro propio (`PATCH /clientes/:id`): PASS.
- Eliminación real (`DELETE /clientes/:id` — el sistema implementa baja lógica, `activo: false`, no borrado físico; comportamiento preexistente, no de Bloque 8): PASS — el registro desaparece del listado por defecto y reaparece con `?incluirInactivos=true`, ambos casos correctamente acotados a la organización del token usado.
- Filtro/listado (`?incluirInactivos=true`): PASS, correctamente acotado por organización.

**Dashboard, Rentabilidad, Aging, Alertas, Benchmarking, Dashboard Ejecutivo** — verificados con números reales, no solo presencia/ausencia:

| Módulo | Organización A | Organización B |
|---|---|---|
| Dashboard — viajes del mes | 9 | 1 |
| Rentabilidad — viajes completos / ingreso | 3 / $706.850 | 1 / $30.000 |
| Aging — total pendiente / facturas pendientes | $329.350 / 3 | $15.000 / 1 |
| Alertas — total | 7 | 0 |
| Dashboard Ejecutivo — total pendiente | $329.350 | $15.000 (coincide con Aging) |
| Benchmarking — ranking de clientes | (vacío en el período por defecto) | 1 cliente, id `80ff932f...` |

Los totales de la Organización A **no cambiaron** al agregar los datos de B — confirmación directa de que ningún cálculo del Centro de Inteligencia agrega entre organizaciones.

## 4. Prueba de fuga cruzada definitiva

Con ambas organizaciones simultáneamente activas y datos deliberadamente idénticos (sección 2):

- **Lecturas nunca mezcladas**: `GET /clientes` con CUIT `30-12345678-9` devuelve exactamente 1 resultado desde cada organización — nunca 2, nunca el de la otra.
- **Nunca editables entre sí**: `PATCH`/`DELETE` de B contra el `id` del cliente de A → rechazado con `404` (`"El registro solicitado no existe o ya fue eliminado"`), verificado que el dato de A permaneció intacto.
- **Nunca relacionables**: intento real vía `POST /viajes` de B referenciando el `id` de un Cereal de A → rechazado con `400` (`"Uno de los datos referenciados no existe"`), por la foreign key compuesta, a través del flujo HTTP completo (no solo a nivel de base, como se había probado en 8.1.b.4.4).
- **Nunca agregadas en un cálculo**: `porCliente` de Rentabilidad muestra "Aceitera del Litoral S.A." en el resultado de **ambas** organizaciones, pero con **id distinto** en cada una (`81c32080...` en A, `80ff932f...` en B) — nunca fusionadas en una sola fila pese al nombre idéntico.
- **Nunca aparecen mezclados en Dashboard/Rentabilidad/Aging/Alertas/Benchmarking**: confirmado con los números exactos de la tabla de la sección 3.

**13/13 aserciones de la prueba de fuga cruzada: PASS.**

## 5. Centro de Inteligencia

Confirmado, no asumido: `git status` sobre `backend/src/inteligencia/` no muestra ningún cambio desde antes de esta validación — **cero líneas tocadas**. El módulo no fue modificado, no conoce organizaciones (ninguna mención de `organizacionId`/`Organizacion` fuera de la línea de inyección de dependencia, ya verificado en la auditoría previa), y los números de la sección 3 confirman que funciona exclusivamente porque recibe datos ya aislados por la capa de Prisma Extension — nunca porque el propio Centro de Inteligencia sepa filtrar.

## 6. Hallazgo real encontrado durante esta validación

**`GET /clientes/:id`, `GET /transportistas/:id`, `GET /choferes/:id`** — al pedir, con el token de una organización, el `id` de un registro de la otra, devuelven `200` con cuerpo vacío (0 bytes) en lugar de `404`. **No hay fuga de datos** (confirmado: 0 bytes transferidos, ningún campo del registro ajeno llega a la respuesta) — es una inconsistencia de código de estado HTTP, no una fuga de aislamiento. Causa: estos 3 controllers (a diferencia de `viajes`, `facturas`, `liquidaciones`, `anticipos`, que sí lo hacen) no verifican explícitamente `if (!resultado) throw new NotFoundException(...)` tras el `findUnique` — devuelven el resultado de Prisma tal cual, y NestJS serializa `null` como `200` vacío por defecto. Es código preexistente a Bloque 8 (nunca modificado por ningún commit de este bloque) que se vuelve visible recién ahora porque, con el aislamiento activo, un `findUnique` cruzado empezó a devolver `null` en un caso donde antes siempre había datos (una sola organización). No se corrigió — está fuera del alcance autorizado para este cierre ("no escribir código adicional").

Sin este hallazgo, la validación habría sido 100% limpia. Con él, sigue siendo una validación exitosa en todo lo que Bloque 8 existe para garantizar (aislamiento de datos), con un defecto menor y acotado, sin impacto de seguridad, documentado con precisión.

## 7. Producción

No se ejecutó ningún comando `railway` ni se abrió ninguna conexión a la base de producción durante esta validación. Todo — creación de la Organización B, construcción del dataset, las 42 pruebas de aceptación, la prueba de fuga cruzada — se ejecutó contra el backend local (`localhost:3000`) y la base de desarrollo. La Organización B queda persistente en desarrollo como evidencia reproducible, no se eliminó al finalizar.

---

## Conclusión

**¿Puede considerarse definitivamente cerrado el Bloque 8?**

**Sí.**

La Fase F se ejecutó exactamente como la definió `BLOQUE8.1_PLAN_IMPLEMENTACION_MULTIEMPRESA.md` — organización persistente, no efímera; catálogo real completo; validación exclusivamente por el camino HTTP → JWT → Interceptor → AsyncLocalStorage → Prisma Extension → base de datos; las 7 pruebas de la sección 6 del plan, incluida la Prueba de fuga cruzada con valores deliberadamente idénticos, ejecutadas y aprobadas con evidencia numérica verificable, no asumida.

Todo lo que Bloque 8 existe para garantizar —que dos organizaciones nunca compartan, mezclen, relacionen ni agreguen datos entre sí, bajo ninguna circunstancia, ni siquiera con coincidencia total de valores de negocio— quedó demostrado con evidencia real, de punta a punta, a través del sistema completo. El único hallazgo real de esta validación (sección 6) es un defecto de código de estado HTTP en 3 endpoints puntuales, sin ninguna exposición de datos, preexistente a Bloque 8, y queda registrado como deuda técnica conocida y acotada — no como una condición de aislamiento incumplida.

Bloque 8 (Multiempresa) queda cerrado.

# Bloque 5.2.b — Diseño Técnico: Validación de Integridad en `create()`

Fecha: 2026-07-08. Documento de diseño puro — no se modificó ningún archivo, no se generó ninguna migración, no se hizo commit. Es la segunda entrega de `BLOQUE5.2_DISENO_INTEGRIDAD_CATALOGOS.md` (sección 5), ahora con el detalle exacto necesario para implementar sin ambigüedad. Depende de 5.2.a, ya implementado y commiteado (`8173bd5`): `Chofer.activo`/`Vehiculo.activo` ya existen en el schema.

**No incluye** (confirmado en la aprobación anterior): validación de `activo` en `update()` de Viajes/Anticipos/Liquidaciones/Facturas, ni ningún cambio a `UpdateClienteDto` (deuda documentada, fuera de alcance). Tampoco toca frontend, catálogos, ni el filtrado de listados (ya cerrado en 5.2.a).

---

## 1. Qué entidades debe validar cada `create()`

| Controller | Entidades a validar | Campo del body |
|---|---|---|
| `ViajesController.create()` (`viajes.controller.ts:135-164`) | `Cliente`, `Transportista`, `Chofer`, `Vehiculo` (camión), `Vehiculo` (acoplado, solo si viene informado) | `body.clienteId`, `body.transportistaId`, `body.choferId`, `body.camionId`, `body.acopladoId` |
| `AnticiposController.create()` (`anticipos.controller.ts:205-224`) | `Chofer`, `Transportista` | `body.choferId`, `body.transportistaId` |
| `LiquidacionesController.create()` (`liquidaciones.controller.ts:313-...`) | `Chofer` (solo si `tipo==="CHOFER"`) **o** `Transportista` (solo si `tipo==="TRANSPORTISTA"`) — mutuamente excluyentes, nunca ambos | `body.choferId` / `body.transportistaId` según `body.tipo` |
| `FacturasController.create()` (`facturas.controller.ts:256-308`) | `Cliente` | `body.clienteId` |

`Productor` (`body.productorId`, opcional en `ViajesController.create()`) **no se valida** — decisión ya tomada en 5.2 (sección 0): `Productor` no recibió `activo` y sigue fuera de alcance.

---

## 2. Qué campos deben exigir `activo:true`

Regla única para las 4 entidades de la tabla anterior: si el registro **existe**, debe tener `activo === true` para que el `create()` proceda. Si el registro **no existe**, es un error de existencia (distinto del error de estado), ver sección 3.

Orden de verificación (fail-fast: se detiene en la primera entidad que falle, existente-inactiva o inexistente, y devuelve un único error específico — mismo patrón secuencial ya usado en las validaciones existentes de estos 3 controllers, ej. `anticipos.controller.ts:207-209`, `liquidaciones.controller.ts:316-330`):

- **Viajes:** Cliente → Transportista → Chofer → Vehículo(camión) → Vehículo(acoplado, si `acopladoId` viene informado).
- **Anticipos:** Chofer → Transportista (mismo orden en que ya se validan como obligatorios hoy, línea 207).
- **Liquidaciones:** según `tipo`, un solo lookup (Chofer o Transportista, nunca los dos).
- **Facturas:** Cliente (único lookup nuevo).

No se valida `activo` de ningún catálogo en operaciones de solo lectura ni en los `include` de detalle — eso ya quedó resuelto y sin cambios desde 5.2.a.

---

## 3. Qué mensajes de error devolver

Dos clases de error, consistentes con el resto del código (`liquidaciones.controller.ts:335` ya usa `NotFoundException("Chofer no encontrado")` como precedente):

- **Entidad inexistente → `404 NotFoundException`**, mensaje `"<Entidad> no encontrado."` / `"no encontrada."` según género.
- **Entidad existente pero inactiva → `400 BadRequestException`**, mensaje explícito orientado a la resolución (mismo criterio de mensajes accionables usado en los Bloques 4.1-4.3), con el patrón: `"El/La <entidad> seleccionado/a está dado/a de baja. Reactívelo/la antes de crear el/la <operación>."`

| Controller | Entidad | 404 (no existe) | 400 (inactivo) |
|---|---|---|---|
| Viajes | Cliente | `Cliente no encontrado.` | `El cliente seleccionado está dado de baja. Reactívelo antes de crear el viaje.` |
| Viajes | Transportista | `Transportista no encontrado.` | `El transportista seleccionado está dado de baja. Reactívelo antes de crear el viaje.` |
| Viajes | Chofer | `Chofer no encontrado.` | `El chofer seleccionado está dado de baja. Reactívelo antes de crear el viaje.` |
| Viajes | Vehículo (camión) | `Vehículo (camión) no encontrado.` | `El camión seleccionado está dado de baja. Reactívelo antes de crear el viaje.` |
| Viajes | Vehículo (acoplado) | `Vehículo (acoplado) no encontrado.` | `El acoplado seleccionado está dado de baja. Reactívelo antes de crear el viaje.` |
| Anticipos | Chofer | `Chofer no encontrado.` | `El chofer seleccionado está dado de baja. Reactívelo antes de crear el anticipo/gasto.` |
| Anticipos | Transportista | `Transportista no encontrado.` | `El transportista seleccionado está dado de baja. Reactívelo antes de crear el anticipo/gasto.` |
| Liquidaciones | Chofer (tipo CHOFER) | `Chofer no encontrado.` (ya existe hoy, sin cambio de texto) | `El chofer seleccionado está dado de baja. Reactívelo antes de crear la liquidación.` |
| Liquidaciones | Transportista (tipo TRANSPORTISTA) | `Transportista no encontrado.` (nuevo, no existía ningún check) | `El transportista seleccionado está dado de baja. Reactívelo antes de crear la liquidación.` |
| Facturas | Cliente | `Cliente no encontrado.` (nuevo, no existía ningún check) | `El cliente seleccionado está dado de baja. Reactívelo antes de crear la factura.` |

**Punto de implementación explícito:** en `LiquidacionesController.create()`, el check de `Chofer` ya existe (`liquidaciones.controller.ts:334-336`) — solo se le agrega la línea de `activo` inmediatamente después, sin duplicar la consulta. El check de `Transportista` es enteramente nuevo (hoy no hay ningún `findUnique` de `Transportista` en ese método).

---

## 4. Qué históricos quedan permitidos

Sin cambios respecto a lo ya definido en `BLOQUE5.2_DISENO_INTEGRIDAD_CATALOGOS.md` sección 6, reconfirmado para esta entrega puntual:

1. Ninguna operación (`Viaje`/`Factura`/`Liquidacion`/`AnticipoGasto`) ya creada se ve afectada — las validaciones de esta entrega viven exclusivamente en `create()`, nunca se ejecutan sobre registros existentes.
2. `update()` de las 4 operaciones **no se toca** (confirmado en la aprobación: "no extender todavía a `update()`") — se puede seguir editando un viaje/anticipo/liquidación/factura editable aunque el catálogo que referencia haya sido dado de baja después de creado.
3. Reasignar un catálogo inactivo a una operación existente vía `PATCH` (ej. cambiar `choferId` de un viaje editable a un chofer inactivo) sigue sin bloquearse — mismo punto de decisión ya señalado y diferido en 5.2, no se reabre acá.
4. Los `include`/`findOne` de detalle de cualquier operación histórica siguen mostrando los catálogos tal como estaban, activos o no — no se toca ningún endpoint de lectura en esta entrega.

---

## 5. Pruebas manuales que voy a correr

Contra el servidor local (`npm run start:dev`), con los 5 usuarios demo, dando de baja y reactivando registros de prueba vía los endpoints ya existentes de 5.2.a, dejando los datos limpios al final (mismo procedimiento que en la entrega anterior):

**Viajes:**
1. Cliente inactivo → `POST /viajes` → `400`, mensaje de Cliente. Reactivar → `201`.
2. Transportista inactivo → `POST /viajes` → `400`, mensaje de Transportista.
3. Chofer inactivo → `POST /viajes` → `400`, mensaje de Chofer.
4. Vehículo inactivo como `camionId` → `POST /viajes` → `400`, mensaje de camión.
5. Vehículo inactivo como `acopladoId` (con `camionId` activo) → `POST /viajes` → `400`, mensaje de acoplado.
6. `acopladoId` omitido (caso normal, es opcional) con todo lo demás activo → `201`, sin ningún intento de validar un acoplado inexistente.
7. `clienteId`/`transportistaId`/`choferId`/`camionId` con un UUID inexistente (no solo inactivo) → `404`, no `400`.

**Anticipos:**
8. Chofer inactivo → `POST /anticipos` → `400`, mensaje de Chofer.
9. Transportista inactivo → `POST /anticipos` → `400`, mensaje de Transportista.
10. Ambos activos → `201` (regresión).

**Liquidaciones:**
11. `tipo="CHOFER"` con chofer inactivo → `400`, mensaje de Chofer.
12. `tipo="TRANSPORTISTA"` con transportista inactivo → `400`, mensaje de Transportista.
13. `tipo="TRANSPORTISTA"` con `transportistaId` inexistente → `404` (cierra el hallazgo de que hoy no se valida existencia en absoluto).
14. `tipo="CHOFER"`/`tipo="TRANSPORTISTA"` con el catálogo activo y viajes/anticipos elegibles válidos → `201` (regresión).

**Facturas:**
15. `clienteId` inactivo → `POST /facturas` → `400`, mensaje de Cliente.
16. `clienteId` inexistente → `404` (cierra el hallazgo de que hoy no se valida existencia en absoluto).
17. `clienteId` activo con viajes elegibles → `201` (regresión).

**Regresión transversal:**
18. Con todos los catálogos activos, repetir un ciclo completo Viaje→Liquidación→Factura→Cobranza de punta a punta — debe comportarse exactamente igual que antes de este bloque (ninguna validación nueva debe dispararse en el camino feliz).
19. Build (`nest build`) sin errores de tipos.

Reactivo cada registro de prueba dado de baja al finalizar cada bloque de pruebas, igual que en 5.2.a.

---

## 6. Rollback

- Ningún cambio de schema en esta entrega — no hay migración que revertir.
- Revertir el código deja el comportamiento actual exacto (sin ninguna de estas validaciones), sin ningún efecto sobre datos ya creados.
- Ningún rollback de este bloque implica pérdida de datos de negocio.

---

## 7. Criterios de aceptación

1. Ningún `Viaje`/`Anticipo`/`Liquidacion`/`Factura` nuevo puede crearse referenciando un `Cliente`/`Transportista`/`Chofer`/`Vehiculo` inactivo — `400` con el mensaje específico de la tabla de la sección 3 en cada caso.
2. Referenciar un catálogo inexistente (UUID que no existe) en cualquiera de los 4 `create()` devuelve `404`, no `400` ni un error genérico de constraint de base de datos.
3. `LiquidacionesController.create()` con `tipo="TRANSPORTISTA"` valida existencia + `activo` del transportista (cierra el hallazgo de que hoy no hace ningún `findUnique`).
4. `FacturasController.create()` valida existencia + `activo` del cliente (cierra el hallazgo de que hoy no hace ningún `findUnique`).
5. `update()` de las 4 operaciones permanece sin cambios — se puede seguir editando una operación existente aunque referencie un catálogo hoy inactivo.
6. Ninguna operación histórica cambia de comportamiento retroactivamente; los endpoints de lectura/detalle no se tocan.
7. El camino feliz (todos los catálogos activos) no cambia: mismos códigos de respuesta y mismo comportamiento que antes de esta entrega.
8. Build y typecheck limpios; las 19 pruebas de la sección 5 pasan contra la base local.

---

No se implementó nada de este diseño — queda a la espera de tu aprobación antes de tocar código.

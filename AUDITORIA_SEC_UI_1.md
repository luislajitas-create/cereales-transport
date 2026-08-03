# SEC-UI-1 — Gating de UI por rol en pantallas con matriz no uniforme

Bloque de seguridad transversal (no de nueva funcionalidad): cierra la brecha detectada durante el cierre de CRM-2 — pantallas donde el backend ya rechaza correctamente las operaciones de escritura para roles no autorizados (`RolesGuard` + `@Roles()`), pero la UI no reflejaba esa matriz y ofrecía formularios/botones que solo terminaban en un 403.

**Alcance:** Clientes (gating aplicado en el bloque previo a SEC-UI-1, conservado sin cambios), Anticipos, Facturas, Catálogos (Cereales/Ubicaciones/Tipos de gasto/Productores). Transportistas ya había quedado cerrado en CRM-2. No se modificó ningún DTO, controller, `@Roles()` ni el schema Prisma — el frontend solo refleja la matriz de permisos ya existente en el backend.

---

## Matriz página → acción → roles backend → gating de UI

| Página | Acción | Roles backend (`@Roles`) | Flag de UI | Ruta envuelta en `ProtectedRoute` |
|---|---|---|---|---|
| Clientes | alta / edición / baja-reactivación / importar CSV (CAT-1) | OPERACIONES, FACTURACION, ADMINISTRADOR | `puedeGestionarClientes` | No |
| Anticipos | alta / editar / anular | LIQUIDACIONES, OPERACIONES, ADMINISTRADOR | `puedeGestionarAnticipos` | No |
| Facturas | crear factura / registrar cobranza / anular factura / anular cobranza | FACTURACION, ADMINISTRADOR | `puedeGestionarFacturas` | No |
| Catálogos — Cereales, Ubicaciones, Productores | alta (+ edición en Productores) | OPERACIONES, ADMINISTRADOR | `puedeGestionarCatalogosBase` | No |
| Catálogos — Tipos de gasto | alta | OPERACIONES, **LIQUIDACIONES**, ADMINISTRADOR | `puedeGestionarTiposGasto` (asimetría real respecto de las otras tres pestañas, no unificada en un solo flag) | No |

**Por qué ninguna de estas pantallas se envuelve en `ProtectedRoute`:** en las cuatro, la consulta (`GET` — `findAll`/`findOne`/`conciliacion`) no exige rol específico y está abierta a cualquier autenticado, incluido LECTURA. Solo la escritura está restringida. La matriz no es uniforme para toda la pantalla (condición que sí exige la ruta a nivel `ProtectedRoute`, usada en `/administracion/*` donde ni siquiera la lectura es libre). Envolver la ruta entera habría bloqueado también la lectura legítima de LECTURA, contradiciendo el backend. El gating a nivel de componente (`puedeGestionarX`) cubre igualmente la navegación directa por URL, porque el chequeo de rol corre en cada render sin importar cómo se llegó a la página.

---

## Verificación explícita de superficie completa en Facturas

A pedido expreso, se verificó que el gating cubre **toda** la superficie de escritura de la pantalla, no solo el formulario principal:

- **`FilaFactura.tsx`** (fila del listado paginado): revisado el componente completo — contiene únicamente el botón "Ver" (`onVerDetalle`, navegación de lectura hacia el detalle). No expone ninguna acción de escritura. No requiere gating.
- **Anulación de cobranza** (`POST /facturas/:id/cobranzas/:cobranzaId/anular`, `@Roles("FACTURACION","ADMINISTRADOR")`): revisado `Facturas.tsx` completo — **no existe ningún botón ni control en la UI que dispare esta acción**. La tabla de "Cobranzas" en el detalle de factura es de solo lectura (fecha/importe/medio de pago); el único control de escritura asociado a cobranzas es "Registrar cobranza" (ya gateado por `puedeGestionarFacturas`). Se documenta como hallazgo funcional preexistente (endpoint sin consumidor en el frontend), no como brecha de seguridad — no hay nada que ocultar porque no hay ningún control expuesto. Queda fuera de alcance de SEC-UI-1 (bloque de seguridad de UI, no de nueva funcionalidad); candidato a un futuro bloque si se decide exponer la anulación de cobranzas individuales en la UI.
- "Nueva factura" (formulario + "Buscar viajes pendientes de facturar" + selección + "Crear factura"), "Registrar cobranza" y "Anular factura": los tres gateados por `puedeGestionarFacturas`.

---

## Pruebas incorporadas (RolesGuard sobre endpoints reales, vía `Reflector`)

Mismo criterio que `transportistas.roles.spec.ts` (CRM-2): cada spec instancia `RolesGuard` real y lee los decoradores `@Roles()` reales del controller correspondiente — el mismo mecanismo que usa producción, no metadata simulada.

| Archivo | Tests | Cubre |
|---|---|---|
| `backend/src/anticipos/anticipos.roles.spec.ts` | 20 | create/update/anular rechazan LECTURA, sin usuario y FACTURACION; permiten LIQUIDACIONES/OPERACIONES/ADMINISTRADOR; findAll/findOne abiertos a LECTURA |
| `backend/src/facturas/facturas.roles.spec.ts` | 23 | create/anular/registrarCobranza/anularCobranza rechazan LECTURA, sin usuario, OPERACIONES y LIQUIDACIONES; permiten FACTURACION/ADMINISTRADOR; findAll/findOne/conciliacion abiertos a LECTURA |
| `backend/src/catalogos/simples.roles.spec.ts` | 28 | Cereal/Ubicacion/Productor.create(+update) rechazan LECTURA, sin usuario y LIQUIDACIONES; permiten OPERACIONES/ADMINISTRADOR. TipoGasto.create permite además LIQUIDACIONES (asimetría real, verificada explícitamente). Los 4 findAll abiertos a LECTURA |

`backend/src/catalogos/clientes.roles.spec.ts` (27 tests) se había agregado en el paso previo a SEC-UI-1 (gating de Clientes) y se conserva sin cambios.

---

## Resultado de pruebas — reconciliación exacta con CRM-2

Ejecución sin caché (`npx jest --no-cache`): **23 suites, 255 tests, todos pasando.**

CRM-2 cerró con **157 tests** (incluye `transportistas.roles.spec.ts`, 32 tests, ya parte de ese cierre). El total de 255 no es "157 + los tests de este bloque" en un único paso: hubo un paso intermedio (gating de Clientes) entre el cierre de CRM-2 y SEC-UI-1 propiamente dicho.

| Paso | Archivo agregado | Tests del archivo (medido con `--verbose`) | Total acumulado |
|---|---|---|---|
| Cierre CRM-2 | (incluye `transportistas.roles.spec.ts`, 32) | — | **157** |
| Gating de Clientes (previo a SEC-UI-1) | `clientes.roles.spec.ts` | 27 | 157 + 27 = **184** |
| SEC-UI-1 | `anticipos.roles.spec.ts` | 20 | 184 + 20 = 204 |
| SEC-UI-1 | `facturas.roles.spec.ts` | 23 | 204 + 23 = 227 |
| SEC-UI-1 | `simples.roles.spec.ts` | 28 | 227 + 28 = **255** |

Diferencia total desde el cierre de CRM-2: **+98 tests** (27 + 20 + 23 + 28), no +71. El +71 corresponde únicamente a los tres archivos nuevos de SEC-UI-1 propiamente dicho (20+23+28), medido desde el checkpoint intermedio de 184, no desde el cierre de CRM-2 en 157. El reporte anterior de este bloque mezcló ambos puntos de referencia y además tenía los conteos por archivo mal atribuidos (32/12/16/11 en vez de los valores reales 27/20/23/28); este documento reemplaza esa cifra.

---

## Validación

- Backend build: OK.
- Backend tests: 23/23 suites, 255/255 tests (sin caché).
- Frontend typecheck: OK.
- Frontend build: OK.
- Vite dev (instancia única, sin procesos zombis, verificada por PID): confirmado sirviendo el código actualizado de las tres páginas vía HMR antes de la validación manual.

## Deuda remanente (backlog)

- Anulación de cobranza individual: endpoint backend existente (`POST /facturas/:id/cobranzas/:cobranzaId/anular`) sin ningún consumidor en el frontend — no es una brecha de seguridad (nada que ocultar), pero es una funcionalidad de negocio pendiente si se decide exponerla.

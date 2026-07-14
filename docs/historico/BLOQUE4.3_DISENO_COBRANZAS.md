# Diseño Técnico — Bloque 4.3: Cobranzas

Fecha: 2026-07-07. Documento de diseño puro — no se modificó ningún archivo de código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Cierra el sub-bloque 4.3 de `BLOQUE4_DISENO_REGLAS_NEGOCIO.md` (§2.4-2.6), después de 4.1 (commit local `fa1a31f`) y 4.2 (commit local `cb42b66`), ninguno de los dos pusheado todavía.

---

## 0. Auditoría completa del estado actual

### Modelo `Cobranza` (`schema.prisma:381-392`)

```
model Cobranza {
  id          String   @id @default(uuid())
  facturaId   String
  fecha       DateTime
  importe     Float
  medioPago   String?
  observacion String?

  factura Factura @relation(fields: [facturaId], references: [id], onDelete: Cascade)

  @@index([facturaId])
}
```

Tabla puramente aditiva — sin campo de estado propio (`anulada`, `deletedAt`, ningún tipo), sin ninguna forma de distinguir un cobro válido de uno cargado por error. Mismo patrón de carencia que tenían `LiquidacionViaje`/`FacturaViaje` antes de 3.3/4.2, pero acá el objeto en juego es dinero efectivamente cobrado, no un detalle de snapshot.

### Modelo `Factura` (`schema.prisma:351-367`) y `EstadoFacturaEnum` (`schema.prisma:69-74`)

`estado: EstadoFacturaEnum @default(FACTURADO)`, valores `FACTURADO | COBRADO_PARCIAL | COBRADO_TOTAL | ANULADO`. Es un campo derivado — se recalcula cada vez que cambia el conjunto de cobranzas, nunca se edita directamente por el usuario.

### `FacturasController.registrarCobranza()` (`facturas.controller.ts:317-343`)

- Guard existente: `factura.estado === "ANULADO"` → rechazo (`:322`). Es el único guard de negocio hoy.
- `RegistrarCobranzaDto` (`dto/registrar-cobranza.dto.ts`): `importe` con `@IsPositive()` — ya impide cobranzas en `0` o negativas desde la API pública. `fecha` obligatoria (`@IsDateString()`), `medioPago`/`observacion` opcionales.
- Dentro de la transacción (`:327-342`): crea la `Cobranza` (`:328-336`), después hace `tx.cobranza.findMany({where:{facturaId:id}})` (`:337`) y suma **todas** las filas (`:338`, sin ningún filtro) para decidir `nuevoEstado` (`:339`) y persistirlo (`:340`).
- **No hay ningún tope contra `factura.importe`** — `totalCobrado` puede superar `factura.importe` sin que nada lo impida; el único efecto es que `nuevoEstado` queda en `COBRADO_TOTAL` sin ninguna señal de que hubo sobrepago. Confirmado, coincide con el hallazgo P0.3 de `QA_INFORME_FINAL.md`.
- **No hay ningún guard de duplicado** — dos `POST` con los mismos datos (`fecha`/`importe`/`medioPago`) crean dos filas independientes, ambas cuentan.
- La lectura para calcular `totalCobrado` (`:337`) ocurre **dentro** de la misma transacción que el `create` (`:328-336`), pero eso no la protege de una carrera con otra transacción concurrente que también esté insertando una `Cobranza` para la misma factura — ver sección 7.

### `FacturasController.anular()` (`facturas.controller.ts:300-315`)

Guard: `if (factura.cobranzas.length > 0) throw ...` (`:305-307`) — bloquea la anulación si existe **cualquier** cobranza, sin distinguir válidas de erróneas. Es el callejón sin salida ya documentado: una única cobranza mal cargada deja la factura imposible de anular para siempre por la vía normal.

### `FacturasController.conciliacion()` (`facturas.controller.ts:176-236`, ya tocada en Bloque 4.2)

**No lee `Cobranza` en ningún punto** — solo compara viajes `DESCARGADO` contra `estadoFacturacion` (ver Bloque 4.2). Conclusión directa: **este bloque no tiene ningún impacto sobre `conciliacion()`**, no requiere ningún cambio ahí.

### `DashboardController.resumen()` (`dashboard.controller.ts:32-35, 51-63`)

`facturasVencidas` trae facturas vencidas con `include: { cliente: true, cobranzas: true }` (`:32-35`) y calcula `cobrado = f.cobranzas.reduce((acc,c) => acc+c.importe, 0)` (`:53`, **sin filtro**) para derivar `saldoPendiente = f.importe - cobrado` (`:60`). Si se introduce un flag de anulación en `Cobranza` sin tocar este punto, una cobranza anulada seguiría contando como cobro real acá — el dashboard mostraría un saldo pendiente **menor** al real, ocultando deuda vencida. Impacto directo, en alcance de este bloque.

### `ClientesController.cuentaCorriente()` (`clientes.controller.ts:142-163`)

Trae **todas** las facturas del cliente (`:144-148`, sin filtrar por `estado`) con sus cobranzas, arma un libro mayor simple (`debe` = importe de cada factura, `haber` = importe de cada cobranza) y acumula `saldo` (`:149-161`). Dos hallazgos:

1. **En alcance de este bloque:** la suma de `haber` por cobranza (`:152-153`) no filtra por vigencia — mismo problema que en Dashboard, mismo fix necesario.
2. **Hallazgo colateral, fuera de alcance de este bloque:** la consulta no excluye `Factura.estado === "ANULADO"` (`:144-148`) — una factura anulada sigue apareciendo como `debe` en la cuenta corriente del cliente, inflando el saldo aparente con una deuda que en los hechos fue anulada. No es un problema causado por Cobranzas ni se resuelve tocando `Cobranza` — es un bug propio de `cuentaCorriente()` que existía antes de este bloque y seguiría existiendo después. Lo señalo porque el pedido de auditoría incluye explícitamente "impacto en cuenta corriente del cliente", pero **no lo incluyo en el alcance de implementación de 4.3** — es un hallazgo nuevo, candidato a un P0 aparte, a decidir por separado.

### Exports (`facturas.controller.ts`, `exportarExcel`/`exportarPdf`, líneas 47-172)

No muestran el detalle de cobranzas por factura, solo `f.estado` (agregado) y la lista de viajes. **Sin impacto** de este bloque — el único dato que exponen (`estado`) ya sale correctamente recalculado por `registrarCobranza()`/el futuro endpoint de anulación de cobranza, sin cambios propios en el export.

### Frontend (`Facturas.tsx`)

- `registrarCobranza()` (líneas 58-69): **no tiene ningún estado `busy`/`saving`** — el botón "Registrar cobranza" (línea 192) nunca se deshabilita mientras la request está en curso, a diferencia de otros formularios de la app (`ViajeForm.tsx` sí usa `disabled={saving}`). Confirmado, gap de UI todavía vigente.
- El formulario de carga se oculta cuando `detalle.estado === "ANULADO" || detalle.estado === "COBRADO_TOTAL"` (línea 187) — mitiga parcialmente el sobrepago desde la UI normal (una vez que el estado pasa a `COBRADO_TOTAL`, no se puede seguir cargando), pero no impide sobrepagar en la **misma** carga que cruza el 100% (nada valida el importe tipeado contra el saldo restante antes de enviar).
- El botón "Anular factura" solo se muestra si `cobranzas.length === 0` (línea 196) — coherente con el guard actual del backend.
- **No existe ningún control por fila para anular una cobranza individual** — ni endpoint que llamar, ni botón.

---

## 1. Cómo evitar sobrepagos

**Regla:** antes de crear la `Cobranza`, calcular `totalCobradoVigente` (suma de cobranzas **no anuladas** de esa factura) y rechazar con `400` si `totalCobradoVigente + Number(body.importe) > factura.importe` — con una tolerancia mínima por precisión de punto flotante (`Cobranza.importe`/`Factura.importe` son `Float`, no `Decimal`; una comparación estricta podría rechazar un pago legítimo por un error de redondeo de centavos). Tolerancia sugerida: aceptar si el exceso es menor a `0.01` (un centavo), rechazar si es mayor.

**Mensaje de error propuesto:** `"El importe supera el saldo pendiente de la factura: saldo actual {saldo}, intentado {importe}."` — informativo, con los dos números, para que el usuario pueda corregir sin adivinar.

**Decisión que NO se toma en este bloque:** no se agrega ningún concepto de "saldo a favor"/nota de crédito para sobrepagos intencionales — hoy el schema no tiene ningún lugar donde guardar ese excedente aplicable a una factura futura. Si el negocio necesita eso, es una funcionalidad nueva a diseñar aparte, no un ajuste de este bloque.

---

## 2. Cómo evitar doble cobranza por reintentos o doble clic

Dos capas complementarias, ninguna sustituye a la otra:

**Backend (dentro de este bloque):** rechazar con `409` si ya existe una `Cobranza` vigente (no anulada) para la misma `facturaId` con el mismo `(fecha, importe, medioPago)` — heurística barata que cubre el caso típico de un doble clic o un reintento automático de red con el mismo payload. No bloquea dos cuotas legítimas de igual importe en fechas distintas (el campo `fecha` normalmente las distingue). Si en algún momento aparece un caso real de dos cobros idénticos el mismo día por el mismo medio (raro pero posible), se puede resolver con un parámetro de override explícito (`forzar: true`) a decidir en la implementación — no es necesario diseñarlo ahora, se puede agregar sin romper compatibilidad.

**Frontend (fuera del código de este backend, pero parte de la misma corrección de negocio):** agregar un estado `saving`/`busy` en `Facturas.tsx` y deshabilitar el botón "Registrar cobranza" mientras la request está en curso — cierra el caso más común (doble clic) antes de que llegue al backend. Ya señalado como gap vigente en la sección 0; lo dejo documentado acá para que no se pierda de vista, aunque la implementación de frontend no es parte del alcance que definiste para este bloque.

---

## 3. Cómo permitir anular una cobranza individual sin perder historial

**Recomendación: soft-delete (marcar, nunca borrar), consistente con el patrón ya usado en este mismo codebase para `AnticipoGasto.anulado`/`anuladoMotivo`.**

- `Cobranza` gana tres columnas: `anulada Boolean @default(false)`, `anuladaMotivo String?`, `anuladaFecha DateTime?`.
- Nuevo endpoint `POST /facturas/:id/cobranzas/:cobranzaId/anular` (mismos roles que el resto del controller: `FACTURACION`, `ADMINISTRADOR`) — marca `anulada: true` con motivo y fecha, dentro de una transacción que además recalcula `Factura.estado` usando la misma fórmula que `registrarCobranza()`, filtrando por `anulada: false`.
- Ninguna fila de `Cobranza` se borra jamás — un auditor puede reconstruir el historial completo de intentos de cobro, incluidos los corregidos, y distinguir "nunca se intentó" de "se intentó y se corrigió".
- Complementario: además de las columnas inline, registrar también una entrada en `AuditLog` (`entidad: "Cobranza"`, `accion: "anular"`, `datosAnteriores`/`datosNuevos`, `usuarioId`) — mismo patrón ya usado para el override de `comisionPct` en el Bloque 3.2. No es redundante: las columnas inline sirven para que cualquier usuario vea directamente en la lista de cobranzas de una factura cuáles están anuladas y por qué (sin necesitar consultar otra tabla); `AuditLog` sirve para una auditoría transversal ("todas las cobranzas anuladas este mes, de cualquier factura, con quién lo hizo").

### Alternativa evaluada y no recomendada: asiento compensatorio (contra-entrada)

En vez de marcar la fila original, insertar una segunda `Cobranza` con importe negativo (o un campo `tipo: "COBRO"|"REVERSION"`) que cancela a la original en la suma. Ventaja real: cada consumidor que hoy hace `cobranzas.reduce((acc,c)=>acc+c.importe,0)` (hay tres: `registrarCobranza()`, `DashboardController.resumen()`, `ClientesController.cuentaCorriente()`) seguiría funcionando **sin ningún cambio de código**, porque la contra-entrada se cancela sola en la suma — elimina por construcción el riesgo de "me olvidé de filtrar `anulada:false` en alguno de los tres lugares", que es exactamente la clase de bug que este proyecto ya sufrió dos veces (contaminación de anticipos, bloqueo de `LiquidacionViaje`/`FacturaViaje`).

**Por qué no la recomiendo igual:** el modelo `Cobranza` de este sistema no es un libro contable formal (no hay módulo de "asientos", no hay doble entrada en ningún otro lado del schema) — introducir semántica de contra-entrada acá sería agregar un concepto nuevo (importes negativos, un campo `tipo` o `revierteACobranzaId`) a una tabla que hoy es un registro plano de cobros. Además complica la UI: la lista de cobranzas de una factura pasaría a mostrar pares "cobro / reversión" en vez de un estado claro por fila. El riesgo de "olvidarse de filtrar" que motiva la alternativa es real pero acotado y enumerable (los tres puntos de lectura están identificados arriba, son parte del alcance de este mismo bloque, y se pueden probar exhaustivamente — no es un caso disperso entre módulos distintos como fue el bug de `anticipoGastoId`). Con Prisma, además, el filtro se aplica en el propio `include` (`cobranzas: { where: { anulada: false } }`), no como lógica JS dispersa — reduce el riesgo de olvido a algo mecánico y fácil de auditar por grep.

Queda documentada como alternativa por si en algún momento se decide construir un módulo contable formal — no es la recomendación para este bloque.

---

## 4. Impacto

### Total cobrado

La variable `totalCobrado` (hoy calculada en `registrarCobranza()`, línea 338, sin persistirse como columna) pasa de sumar **todas** las cobranzas de la factura a sumar solo las **vigentes** (`anulada: false`). Mismo cambio de fórmula, en el mismo lugar — no se agrega una columna `totalCobrado` a `Factura` (seguiría siendo derivado, no un campo propio, consistente con cómo está modelado hoy).

### `EstadoFactura`

Sin cambios en el enum ni en las transiciones existentes (`FACTURADO → COBRADO_PARCIAL → COBRADO_TOTAL`, y viceversa si se anula una cobranza). El único cambio es la fuente de datos de la fórmula (vigentes en vez de todas). El nuevo endpoint de anulación de cobranza reutiliza exactamente la misma fórmula que `registrarCobranza()` para recalcular `Factura.estado` hacia abajo cuando corresponda (ej. de `COBRADO_TOTAL` a `COBRADO_PARCIAL` si se anula una cobranza que empujaba el total).

### Conciliación

**Ninguno** — `conciliacion()` no lee `Cobranza`, confirmado en la sección 0. No requiere cambios.

### Dashboard

`DashboardController.resumen()` línea 53 (`f.cobranzas.reduce(...)`) debe filtrar por `anulada: false` antes de sumar — si no se ajusta, `saldoPendiente` de facturas vencidas quedaría subestimado (una cobranza anulada seguiría "pagando" la factura a ojos del dashboard). Cambio mínimo: `f.cobranzas.filter(c => !c.anulada).reduce(...)`, o mejor, empujar el filtro al propio `include` (`cobranzas: { where: { anulada: false } }` en la línea 34) para que la variable ya venga limpia sin necesitar el `.filter` adicional en el cálculo.

### Cuenta corriente del cliente

`ClientesController.cuentaCorriente()` línea 152 necesita el mismo ajuste que Dashboard (filtrar cobranzas vigentes al construir los movimientos de `haber`) — en alcance de este bloque. El hallazgo colateral de que la consulta tampoco excluye facturas `ANULADO` (línea 144) **no** se corrige en este bloque (ver sección 0) — quedaría como un P0 nuevo a decidir aparte, ya que corregirlo cambiaría saldos históricos mostrados hoy y no fue parte de lo pedido.

---

## 5. Migraciones necesarias

Una sola migración, puramente aditiva:

- `Cobranza.anulada Boolean @default(false)` — no nullable, con default, no requiere backfill (todas las filas existentes son válidas hoy, `false` es el valor correcto para todas ellas).
- `Cobranza.anuladaMotivo String?` — nullable, sin default, no requiere backfill.
- `Cobranza.anuladaFecha DateTime?` — nullable, sin default, no requiere backfill.

100% expresable en el DSL de Prisma (tres columnas nuevas con `@default`/nullable) — sin SQL manual, mismo perfil de bajo riesgo que las migraciones de 3.1/3.3/4.2. No toca `Factura` ni ninguna otra tabla. `prisma migrate dev --name add_anulacion_cobranza` (o nombre equivalente) generaría un único `ALTER TABLE "Cobranza" ADD COLUMN ...` por columna, sin `DROP`, sin riesgo de pérdida de datos.

---

## 6. ¿Soft-delete, reversión o asiento compensatorio?

Respondido en la sección 3: **soft-delete con reversión** (columnas inline `anulada`/`anuladaMotivo`/`anuladaFecha` + entrada complementaria en `AuditLog`), no asiento compensatorio. Es la opción consistente con el patrón ya validado en este codebase (`AnticipoGasto.anulado`) y con la decisión ya tomada en `BLOQUE3.2_DISENO_COMISION_PCT.md` de usar `AuditLog` para trazabilidad de correcciones financieras sin inventar mecanismos nuevos.

---

## 7. Riesgos de concurrencia

**Importante: hoy no existe ningún tope de sobrepago, por lo tanto no existe todavía una "condición de carrera del tope" — es un riesgo que se introduce recién al implementar el punto 1, no una regresión de algo que ya funcionaba.** Por eso este bloque debe diseñar la protección de concurrencia como parte de la funcionalidad nueva, no como un parche posterior.

### Naturaleza del problema

El patrón de concurrencia ya resuelto en 3.1/3.3/4.2 (`updateMany` condicionado sobre un campo de estado de una única fila) **no aplica directamente acá**. Ese patrón funciona porque Postgres serializa el acceso a *una fila puntual* bajo un `WHERE` dentro del `UPDATE`. El tope de sobrepago, en cambio, depende de la **suma de varias filas** (`Cobranza`) antes de decidir si insertar una más — no hay una sola fila cuyo `WHERE` pueda expresar "la suma de mis hermanas más yo no supera tal valor". Es la misma clase de problema que un "control de stock" clásico: dos lecturas concurrentes del mismo saldo, ambas ven margen disponible, ambas insertan, y juntas superan el límite aunque cada una individualmente parecía válida.

### Dos caminos posibles (punto de decisión)

**Opción 1 — Bloqueo pesimista de la fila `Factura` (recomendada si se quiere cerrar la carrera por completo).** Dentro de la transacción, antes de leer las cobranzas y calcular el tope, tomar un lock explícito sobre la fila de `Factura` (`SELECT ... FOR UPDATE`, vía `tx.$queryRaw` de Prisma) — esto obliga a que una segunda transacción concurrente que intente lo mismo sobre la misma factura espere hasta que la primera termine (commit o rollback), cerrando la ventana de raíz. Requiere una línea de SQL crudo **en tiempo de consulta** (no en una migración) — distinto del "SQL manual" que se evitó en 4.2 (que se refería a `migration.sql` escrito a mano, no a queries de aplicación). Prisma no tiene una API de alto nivel para `SELECT FOR UPDATE`, así que esto sería la primera vez que el código usa `$queryRaw` con ese propósito específico en este proyecto — vale la pena señalarlo como una técnica nueva, aunque acotada a una sola línea.

**Opción 2 — Aceptar el riesgo residual, igual que se hizo en 4.1/4.2 para otras carreras teóricas.** Dado que registrar una cobranza es una operación humana, de baja frecuencia, y que dos usuarios de Facturación cobrando la misma factura en el mismo instante exacto es un escenario de probabilidad muy baja en la operación real de este sistema (confirmado por el volumen bajo que ya señalaban `ROADMAP_SDC_V1.md`/`BLOQUE3_DISENO_INTEGRIDAD_DATOS.md`), se podría dejar documentado como riesgo teórico de baja severidad, sin lock, consistente con el nivel de rigor ya aplicado a otras carreras de este mismo bloque de trabajo (ej. el TOCTOU entre el guard de `ViajesController.update()` y el `update` final, aceptado en 4.1).

**Mi recomendación:** Opción 1, porque acá la consecuencia de perder la carrera es dinero mal registrado (un sobrepago real que el sistema debía impedir), no una inconsistencia de metadatos — es una categoría de riesgo distinta a las aceptadas antes en 4.1/4.2 (que en el peor caso producían un dato de negocio desactualizado, no una pérdida de control sobre un tope financiero explícitamente pedido). Pero dejo la decisión final para vos, ya que introduce una técnica (`$queryRaw` con `FOR UPDATE`) que no se usó hasta ahora en este proyecto y vale la pena que la apruebes explícitamente antes de implementarla.

### Doble cobranza (heurística de duplicado, sección 2)

Si se adopta la Opción 1 de arriba, el mismo lock sobre `Factura` cierra también la carrera del guard de duplicado (dos inserts idénticos concurrentes) como efecto colateral, sin trabajo adicional.

---

## 8. Plan de pruebas

1. Registrar una cobranza por el importe exacto de la factura → `estado = COBRADO_TOTAL`.
2. Registrar una cobranza que exceda el saldo pendiente → `400`, sin persistir la fila, con el mensaje de saldo actual/intentado.
3. Registrar dos cobranzas parciales que sumen exactamente el importe → ambas se aceptan, `COBRADO_TOTAL` en la segunda.
4. Registrar una cobranza y repetir inmediatamente la misma request (mismo `fecha`/`importe`/`medioPago`) → `409` en el segundo intento.
5. Registrar dos cobranzas del mismo importe pero fechas distintas → ambas se aceptan (no debe ser un falso positivo del guard de duplicado).
6. Anular una cobranza individual → `Factura.estado` se recalcula correctamente considerando solo las vigentes (ej. de `COBRADO_TOTAL` vuelve a `COBRADO_PARCIAL` o `FACTURADO` según corresponda); la fila anulada sigue apareciendo en el historial con `anulada:true`, `anuladaMotivo`, `anuladaFecha`, y queda una entrada en `AuditLog`.
7. Con una factura que tiene una única cobranza y esa cobranza se anula → `anular()` de la factura ahora debe permitirse (antes estaba bloqueada).
8. Intentar anular una factura con al menos una cobranza vigente (no anulada) → sigue bloqueado, igual que hoy.
9. Después de anular una cobranza, volver a registrar una cobranza por el saldo liberado → debe aceptarse (el saldo vuelve a estar disponible).
10. `DashboardController.resumen()`: una factura vencida con una cobranza anulada debe seguir contando el saldo completo como pendiente (no descontar el importe de la cobranza anulada).
11. `ClientesController.cuentaCorriente()`: mismo caso — la cobranza anulada no debe aparecer como `haber` en el saldo acumulado.
12. `conciliacion()`: sin cambios de comportamiento (regresión, confirmar que sigue sin leer `Cobranza`).
13. Exports de facturas (Excel/PDF): sin cambios de comportamiento (regresión).
14. Regresión Bloque 4.1/4.2: cancelar un viaje facturado sigue bloqueado; re-facturar un viaje tras anular su factura sigue funcionando (sin relación directa con Cobranzas, pero confirma que no se rompió nada de los bloques previos).
15. *(Si se adopta la Opción 1 de concurrencia, sección 7)*: dos `POST /cobranzas` simultáneos sobre la misma factura, cuya suma combinada superaría el importe → uno tiene éxito, el otro recibe `400` de sobrepago (nunca los dos éxitos). Si se adopta la Opción 2, documentar explícitamente que este caso queda como riesgo teórico aceptado, sin prueba automatizable de forma determinística.

**Pruebas de migración:**
16. Aplicar la migración sobre una copia local y confirmar que corre sin error (aditiva, columnas nullable/con default).
17. Confirmar que las cobranzas ya existentes quedan con `anulada: false` automáticamente (por el `@default(false)`), sin necesitar backfill manual.

---

## 9. Plan de rollback

100% código + una migración aditiva — mismo perfil de bajo riesgo que 4.2.

- **Schema:** revertir es trivial y no destructivo — `DROP COLUMN` de las tres columnas nuevas. Único dato que se pierde: qué cobranzas fueron anuladas y por qué durante la ventana en que la funcionalidad estuvo activa (exportar/loguear esos registros antes de revertir si se quiere conservar la información; las entradas ya escritas en `AuditLog` sobreviven al rollback de columnas, porque `AuditLog` es una tabla aparte).
- **Código:** revertir `registrarCobranza()` (tope de sobrepago, guard de duplicado), `anular()` (guard de cobranzas vigentes), el nuevo endpoint de anulación de cobranza, y los ajustes de `DashboardController`/`ClientesController` deja el comportamiento exactamente como está hoy — sin pérdida de las cobranzas ya registradas (son aditivas, nunca se borran).
- **Orden si hay que revertir todo:** primero código, después schema — mismo criterio que en bloques anteriores.
- Ningún rollback de este bloque implica pérdida de cobranzas ni de facturas — en el peor caso se pierde el rastro de anulaciones parciales ocurridas durante la ventana activa.

---

## 10. Criterios de aceptación

1. Ninguna cobranza puede registrarse por un importe que, sumado a las vigentes, supere `factura.importe` (con tolerancia de redondeo de un centavo).
2. Un intento de registrar una cobranza idéntica (mismo `facturaId`/`fecha`/`importe`/`medioPago`) a una ya vigente es rechazado con `409`.
3. Una cobranza individual puede anularse sin borrar la fila, dejando `anuladaMotivo`/`anuladaFecha` y una entrada en `AuditLog`.
4. `Factura.estado` se recalcula correctamente (hacia arriba y hacia abajo) usando solo cobranzas vigentes, tanto al registrar como al anular una cobranza.
5. Una factura cuyas cobranzas fueron todas anuladas puede anularse igual que si nunca hubiera tenido cobranzas.
6. `DashboardController.resumen()` y `ClientesController.cuentaCorriente()` excluyen cobranzas anuladas de sus cálculos de saldo/cobrado.
7. `conciliacion()` y los exports de facturas no cambian de comportamiento (no leen `Cobranza`, confirmado sin impacto).
8. Ninguna liquidación, factura o cobranza histórica cambia de valor retroactivamente — todas las correcciones son hacia adelante.
9. Migración puramente aditiva (tres columnas nullable/con default en `Cobranza`), sin SQL manual, sin backfill, sin pérdida de datos.
10. Build y typecheck limpios; el plan de pruebas de la sección 8 pasa contra la base local.
11. Decisión explícita tomada sobre la sección 7 (bloqueo pesimista vs. riesgo aceptado) antes de implementar — no se asume una por defecto.

---

## Punto de decisión pendiente para tu aprobación

Uno solo, real: **sección 7 — ¿bloqueo pesimista (`SELECT ... FOR UPDATE` vía `$queryRaw`, cierra la carrera de sobrepago concurrente por completo) o riesgo residual aceptado (consistente con el nivel de rigor ya aplicado en 4.1/4.2)?** Mi recomendación es el bloqueo pesimista, dado que acá la consecuencia de perder la carrera es un sobrepago real, no una inconsistencia de metadatos — pero es una técnica nueva en este proyecto (primer uso de SQL crudo en tiempo de consulta, no en una migración) y prefiero que la confirmes antes de escribir código.

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

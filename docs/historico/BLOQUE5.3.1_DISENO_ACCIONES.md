# Bloque 5.3.1 — Diseño Técnico: Bug `numerl` + Confirmaciones + Doble-Submit + Mensajes

Fecha: 2026-07-08. Documento de diseño puro — no se modificó ningún archivo, no se escribió código, no se generó migración, no se hizo commit. Detalla, a nivel de acción concreta por pantalla, el sub-bloque 5.3.1 ya delimitado en `BLOQUE5.3_DISENO_UX.md` §9. Auditoría realizada sobre el código actual de `Liquidaciones.tsx`, `Facturas.tsx`, `Anticipos.tsx`, `ViajeDetalle.tsx`, y verificación cruzada de los controladores backend correspondientes (`liquidaciones.controller.ts`, `facturas.controller.ts`, `anticipos.controller.ts`, `viajes.controller.ts`) para confirmar qué guardas de estado ya existen del lado servidor.

---

## 0. Confirmación del bug (UX-10)

`Liquidaciones.tsx:245` — `<h1>Liquidación N° {detalle.numerl}</h1>`. El campo real devuelto por el backend (`liquidaciones.controller.ts`, todos los `include`/`return`) es `numero`, usado correctamente en el resto del mismo archivo (línea 229 en la tabla, línea 99 en `descargar()`). Es un typo aislado — busqué `numerl` en todo el repo y el único punto de código real es este; el resto de las coincidencias son los documentos de auditoría que ya lo señalan (UX-10). Fix: `detalle.numerl` → `detalle.numero`. Una línea, sin efectos secundarios.

---

## 1. Qué ya protege el backend (para no duplicar trabajo en el frontend)

Verificación concreta, porque cambia qué tan crítico es cada `busy`/confirm:

| Acción | Guarda de estado en backend | Efecto de un doble-submit hoy |
|---|---|---|
| `POST /liquidaciones` (crear borrador) | `updateMany` condicionado a `estadoLiquidacion: PENDIENTE`, cuenta afectada = 0 → `BadRequestException` | 2do request falla limpio, no duplica |
| `POST /liquidaciones/:id/confirmar` | Requiere `estado === BORRADOR` | 2do request falla limpio |
| `POST /liquidaciones/:id/pagar` | Requiere `estado === CONFIRMADA` | 2do request falla limpio |
| `POST /liquidaciones/:id/anular` | Rechaza si `estado === PAGADA` | 2do request falla limpio (ya anulada no vuelve a re-anular porque el 1ro ya cambió el estado) |
| `POST /facturas` (crear) | `updateMany` condicionado a `estadoFacturacion: PENDIENTE_DE_FACTURAR` | 2do request falla limpio |
| `POST /facturas/:id/cobranzas` | Detecta duplicado **exacto** (misma fecha+importe+medioPago) → `ConflictException`; además usa `SELECT ... FOR UPDATE` para serializar concurrencia real | 2do request con los mismos valores falla limpio; con valores distintos, **no hay guarda** — quedarían 2 cobranzas válidas |
| `POST /facturas/:id/anular` | Rechaza si hay cobranzas vigentes | 2do request falla limpio |
| `POST /anticipos` (crear) | **Ninguna** | 2do request crea **dos registros idénticos** — riesgo real, no cosmético |
| `POST /anticipos/:id/anular` | Rechaza si `liquidado === true`; si no, reescribe `anulado`/`anuladoMotivo` sin chequear si ya estaba anulado | 2do request "funciona" de nuevo (pisa el motivo), no rompe datos pero es ruido |
| `POST /viajes/:id/cancelar` | (no releída en detalle en esta pasada, pero `ViajeDetalle.tsx` ya tiene `busy` cubriendo el botón) | Ya mitigado en frontend hoy |

**Conclusión:** ningún endpoint requiere cambios para este sub-bloque — el backend ya es seguro ante duplicados en 8 de 9 casos (el 9no, crear anticipo, es la única acción con riesgo real de duplicación silenciosa). Aun así, se diseña `busy`/`disabled` en las 9 para UX consistente y para no depender de que el usuario interprete un error de "ya fue liquidado" como si fuera normal.

---

## 2. Diseño por pantalla y acción

Convención de severidad de confirmación (ya fijada en `BLOQUE5.3_DISENO_UX.md` §2.1):
- **Sin confirmación**: acción aditiva/reversible por otra acción visible en la misma pantalla.
- **MEDIUM**: modal con contexto (qué entidad, importe, efecto) + botón Cancelar/Confirmar.
- **HIGH**: MEDIUM + campo de confirmación tipeada (solo la única acción sin ningún camino de reversión).

### 2.1 `Liquidaciones.tsx`

| Acción (línea actual) | Confirmación | Busy/disabled | Mensaje de éxito | Mensaje de error (reemplaza el genérico actual) |
|---|---|---|---|---|
| `crearLiquidacion()` (216) | Ninguna — crea un BORRADOR, reversible con "Anular" en el mismo detalle | Sí — deshabilitar "Crear liquidación" durante el POST | "Liquidación N° {numero} creada en borrador." | "No se pudo crear la liquidación." (ya existe, se mantiene) |
| `accion(id,"confirmar")` (285) | **MEDIUM**: "¿Confirmar la liquidación N° {numero}? Podrá marcarse como pagada una vez confirmada." | Sí, compartido (ver 2.1.1) | "Liquidación N° {numero} confirmada." | "No se pudo confirmar la liquidación." |
| `accion(id,"pagar")` (286) | **HIGH**: modal con neto a pagar y contraparte + campo de confirmación tipeada (ej. escribir el número de liquidación) — es la única acción de las 9 sin ningún camino de reversión (`anular` está explícitamente bloqueado si `estado === PAGADA`) | Sí, compartido | "Liquidación N° {numero} pagada — {fmtMoney(netoPagar)}." | "No se pudo marcar la liquidación como pagada." |
| `accion(id,"anular")` (287) | **MEDIUM**: "¿Anular la liquidación N° {numero}? Se revertirán {N} viaje(s) a pendiente de liquidar y {M} anticipo(s)/gasto(s) a no liquidado." (N y M calculables de `detalle.viajes.length` y `detalle.movimientos.length`, ya disponibles en el detalle cargado) | Sí, compartido | "Liquidación N° {numero} anulada." | "No se pudo anular la liquidación." |
| `descargar()` (279-284) | Sin cambios — no destructiva, ya tiene su propio `descargando` busy por tipo | — | — | Sin cambios |

**2.1.1 Busy compartido entre confirmar/pagar/anular:** hoy los tres comparten la misma función `accion()` pero sin ningún flag de `busy`. Como los tres botones pueden estar visibles simultáneamente en el mismo estado (`BORRADOR` muestra Confirmar **y** Anular a la vez; `CONFIRMADA` muestra Pagar **y** Anular a la vez), un solo flag `accionEnCurso: string | null` (guardando qué acción está en vuelo, o el id) debe deshabilitar los tres botones mientras cualquiera esté pendiente — no alcanza con deshabilitar solo el botón clickeado, porque el usuario podría alcanzar a clickear el otro antes de que vuelva la respuesta.

### 2.2 `Facturas.tsx`

| Acción (línea actual) | Confirmación | Busy/disabled | Mensaje de éxito | Mensaje de error |
|---|---|---|---|---|
| `crearFactura()` (134) | Ninguna — reversible vía "Anular factura" mientras no tenga cobranzas | Sí | "Factura {numero} creada por {fmtMoney(importe)}." | "No se pudo crear la factura." (ya existe) |
| `registrarCobranza()` (192) | Ver nota de decisión 2.2.1 — **recomendación: MEDIUM**, mostrando importe y medio de pago antes de confirmar | Sí, compartido con "Anular factura" (2.2.2) | "Cobranza registrada por {fmtMoney(importe)}." | "No se pudo registrar la cobranza." (ya existe) — más específico: si el backend devuelve el mensaje de saldo superado o de duplicado exacto, mostrar ese mensaje tal cual (ya lo hace vía `err?.response?.data?.message`, no cambia) |
| `anularFactura()` (197) | **MEDIUM**: "¿Anular la factura {numero} por {fmtMoney(importe)}? Se revertirán {N} viaje(s) a pendiente de facturar." — hoy **no tiene ninguna confirmación**, es el hallazgo más directo de este sub-bloque | Sí, compartido | "Factura {numero} anulada." | "No se pudo anular la factura." (ya existe) |

**2.2.1 Punto de decisión — ¿confirmar `registrarCobranza`?** No es "irreversible" en el backend (existe `POST /facturas/:id/cobranzas/:cobranzaId/anular`), pero esa función **no tiene UI** en `Facturas.tsx` todavía (es UX-09, diferido a 5.3.4 según `BLOQUE5.3_DISENO_UX.md` §2.5/§9). Mientras esa UI no exista, un error de tipeo en importe/medio de pago no tiene forma de corregirse desde la pantalla — es irreversible *en la práctica*, aunque no en el backend. Recomiendo agregar confirmación MEDIUM ahora y quitarla en 5.3.4 si se considera redundante una vez que exista el botón de anular cobranza. Si preferís no confirmar esta acción (es la más frecuente de las 9, y agregar fricción a un flujo de uso diario tiene costo), la alternativa es dejarla sin confirm y priorizar 5.3.4 antes — lo señalo para que la decisión sea explícita, no implícita.

**2.2.2 Busy compartido:** "Registrar cobranza" y "Anular factura" pueden estar visibles a la vez (anular se muestra si `cobranzas.length === 0`, que es exactamente cuando el formulario de cobranza también está visible). Mismo criterio que 2.1.1: un flag compartido por detalle de factura.

### 2.3 `Anticipos.tsx`

| Acción (línea actual) | Confirmación | Busy/disabled | Mensaje de éxito | Mensaje de error |
|---|---|---|---|---|
| `crear()` (98) | Ninguna — reversible vía "Anular" en la misma tabla | Sí — es la única de las 9 acciones sin ninguna guarda de duplicados en el backend, es la de mayor prioridad real | "Anticipo/gasto registrado por {fmtMoney(importe)}." | "No se pudo registrar el anticipo/gasto." (ya existe) |
| `anular()` (117) | **MEDIUM**, reemplaza el `window.prompt` actual por el modal con textarea obligatorio para el motivo (mismo requisito de negocio que ya impone el backend vía `AnularAnticipoDto`, mejor integración visual, contexto visible: fecha/tipo/importe del anticipo antes de pedir el motivo) | Sí — hoy `anular()` no tiene ningún busy, un doble clic dispara dos requests y podría abrir dos prompts nativos superpuestos | "Anticipo/gasto anulado." | "No se pudo anular el anticipo/gasto." (ya existe) |

### 2.4 `ViajeDetalle.tsx`

| Acción (línea actual) | Confirmación | Busy/disabled | Mensaje de éxito | Mensaje de error |
|---|---|---|---|---|
| `avanzarEstado()` (92) | **Ninguna — excluida del alcance**, ver nota 2.4.1 | Ya existe (`busy`, línea 92) | No se agrega en 5.3.1 (banner de éxito generalizado es 5.3.2) | Ya existe, sin cambios |
| `cancelarViaje()` (96) | **MEDIUM**, reemplaza el `window.prompt` actual por el mismo modal con textarea obligatorio (misma razón que 2.3) | Ya existe (`busy`, líneas 43/51) — se mantiene, solo cambia el origen del `motivo` (del modal en vez del prompt) | "Viaje N° {numeroViaje} cancelado." | Ya existe, sin cambios |

**2.4.1 Por qué `avanzarEstado` no lleva confirmación:** es una acción operativa que ocurre varias veces por día por viaje (6 transiciones posibles), no es financiera, y ya tiene `busy` previniendo doble-submit. Agregarle un modal de confirmación sería fricción de producto sin beneficio de seguridad — coincide con el criterio ya usado en `BLOQUE5.3_DISENO_UX.md` §2.1 (que tampoco la incluye en las 7 acciones con `ConfirmDialog`).

---

## 3. Qué es 100% frontend

Todo lo de este documento. Ningún hallazgo requiere:
- Cambios a `schema.prisma` ni migraciones.
- Endpoints nuevos ni cambios de contrato — `POST /facturas/:id/cobranzas/:cobranzaId/anular` ya existe pero **no se consume** en este sub-bloque (ver §4).
- Cambios en `AnularAnticipoDto`/`CancelarViajeDto` — el campo `motivo` obligatorio ya existe en el backend, solo cambia el widget que lo captura (textarea de modal en vez de `window.prompt`).

Los dos componentes compartidos a construir (`useConfirm()`+`<ConfirmDialogHost />`, `useAsyncAction()`) son React + CSS plano, sin librería nueva, consistente con `BLOQUE5.3_DISENO_UX.md` §2.1/§2.2 y con la decisión previa de no agregar dependencias de UI.

---

## 4. Qué NO entra en este sub-bloque

- **Banner de éxito generalizado a las ~20 acciones de escritura** (Catalogos, Transportistas, Clientes, comisión de chofer) — solo se agrega mensaje de éxito a las 9 acciones de las 4 pantallas de este documento. El resto es 5.3.2.
- **Estado de carga/skeleton** (UX-01) — 5.3.2.
- **UI de anulación de cobranza** (UX-09) — 5.3.4. El endpoint ya existe pero construir el botón/tabla de estado de cobranza es un flujo nuevo, no una confirmación sobre uno existente.
- **RBAC-UX** (ocultar formularios por rol, UX-16) — 5.3.3.
- **Edición/baja de Cliente/Transportista** (UX-08) — 5.3.4.
- **Cualquier cambio visual no ligado a una acción de esta lista** (badges por dominio, responsive, accesibilidad, `ErrorBoundary`/404) — 5.3.5/5.3.6.
- **Tocar `avanzarEstado()`** — decisión explícita, ver 2.4.1.

---

## 5. Plan de pruebas

Manual (no hay test runner de frontend, confirmado en la auditoría de 5.3). Con al menos rol `LIQUIDACIONES`/`FACTURACION`/`ADMINISTRADOR` sobre el build local:

**Bug:**
1. Abrir el detalle de cualquier liquidación → el título muestra el número real, nunca "undefined".

**Confirmaciones (una repetición por cada una de las 7 acciones: confirmar/pagar/anular liquidación, anular factura, registrar cobranza [si se adopta 2.2.1], anular anticipo, cancelar viaje):**
2. Click en la acción → aparece el modal con el contexto correcto (número/importe/efecto descrito coincide con los datos reales de esa entidad).
3. Click en "Cancelar" del modal → no se dispara ningún request (verificar en Network tab que no hay POST).
4. Click en "Confirmar" → se dispara el POST correspondiente y solo ese.
5. Para "Marcar como pagada" (HIGH): el botón de confirmar permanece deshabilitado hasta escribir el valor correcto; escribir un valor incorrecto no habilita el botón.
6. Para "Anular anticipo"/"Cancelar viaje": el modal no permite confirmar con el campo de motivo vacío (mismo requisito que hoy impone `window.prompt` al devolver `null`/cadena vacía).

**Doble-submit (una repetición por cada una de las 9 acciones):**
7. Doble clic rápido (o clic + Enter) sobre el botón de confirmar de cada acción → solo se observa un POST en el Network tab; el botón queda visualmente `disabled` durante el primer request.
8. En `Liquidaciones.tsx` con estado BORRADOR: clickear "Confirmar" y, sin esperar la respuesta, intentar clickear "Anular" → el segundo botón está deshabilitado (busy compartido, 2.1.1).
9. En `Facturas.tsx` con 0 cobranzas: mismo caso cruzado entre "Registrar cobranza" y "Anular factura" (2.2.2).
10. Caso específico de mayor riesgo real: doble clic en "Registrar" de `Anticipos.tsx` con conexión lenta (throttling en devtools) → confirmar que solo existe un registro nuevo en la tabla tras refrescar (no dos filas idénticas), dado que el backend no lo bloquea (tabla §1).

**Mensajes:**
11. Cada una de las 9 acciones, en éxito, muestra el mensaje específico de la tabla de §2 (no un genérico "Operación exitosa").
12. Cada una de las 9 acciones, forzando un error de backend (ej. intentar "Marcar como pagada" dos veces seguidas dejando que la primera complete, para que la segunda choque con la guarda de estado), muestra el mensaje específico de error de la tabla de §2, no el genérico previo ("No se pudo completar la acción").

**Regresión:**
13. `avanzarEstado()` en `ViajeDetalle.tsx` sigue funcionando sin modal, con su `busy` ya existente intacto.
14. Los botones "Descargar Excel/PDF" de `Liquidaciones.tsx` no fueron tocados por el busy compartido de confirmar/pagar/anular (son independientes).

---

## 6. Plan de rollback

- Despliegue de frontend como build estático (`railway.json`) — revertir es redeploy del commit anterior, sin efecto sobre datos ni sobre el backend, igual que el resto de Bloque 5.3.
- Ningún cambio de este sub-bloque toca el backend ni la base de datos — un rollback del frontend deja al backend funcionando idéntico (las guardas de estado de §1 siguen activas independientemente de qué frontend esté desplegado).
- Si el `ConfirmDialog`/`useAsyncAction` compartido introduce una regresión inesperada en alguna de las 4 pantallas, cada pantalla es revertible de forma independiente (son archivos separados, sin dependencias cruzadas entre sí más allá de los dos hooks compartidos).

---

## 7. Criterios de aceptación

1. `Liquidaciones.tsx` muestra el número real de liquidación en el detalle — nunca "undefined" (cierra UX-10).
2. Las 7 acciones irreversibles/destructivas identificadas (confirmar, pagar y anular liquidación; anular factura; anular anticipo; cancelar viaje; y registrar cobranza si se adopta la recomendación de 2.2.1) no se ejecutan sin un paso de confirmación explícito con el contexto real de la entidad visible en el modal.
3. "Marcar como pagada" —la única acción sin ningún camino de reversión— exige una confirmación tipeada, no solo un botón de "Aceptar".
4. Ninguna de las 9 acciones de escritura de estas 4 pantallas permite que un doble clic dispare dos requests exitosos; en particular, un doble clic en "Registrar" de `Anticipos.tsx` (la única acción sin guarda de backend) nunca crea dos registros.
5. Los botones de acciones mutuamente relacionadas sobre la misma entidad (confirmar/pagar/anular de una liquidación; registrar cobranza/anular de una factura) comparten el estado `busy`, no solo el botón individual clickeado.
6. Cada una de las 9 acciones muestra, en éxito, un mensaje específico con el dato relevante (número, importe) en vez de refrescar la tabla en silencio.
7. Cada una de las 9 acciones muestra, en error, un mensaje específico de esa acción (ya no el genérico compartido `accion()` de `Liquidaciones.tsx`).
8. `window.prompt` desaparece de `Anticipos.tsx` y `ViajeDetalle.tsx`, reemplazado por el modal con textarea obligatorio de motivo.
9. Build y typecheck (`tsc -b`) limpios; el plan de pruebas manual de §5 pasa en el entorno local.
10. Ningún cambio de este documento requirió tocar `schema.prisma`, una migración, o el contrato de un endpoint existente.

---

No se implementó nada de este diseño — queda a la espera de tu revisión antes de tocar código. El punto de decisión de negocio pendiente es §2.2.1 (confirmación o no en "Registrar cobranza").

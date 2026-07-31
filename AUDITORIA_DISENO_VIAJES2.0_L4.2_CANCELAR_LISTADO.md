# VIAJES 2.0 — LISTADO OPERATIVO
## Sub-bloque L4.2: Cancelar viaje desde el listado — Auditoría y diseño

**Tipo:** Auditoría + propuesta técnica/UX + decisión funcional a aprobar. Sin implementación, sin commits, sin push.

**Base:** continúa `AUDITORIA_DISENO_VIAJES2.0_L4_ACCIONES_RAPIDAS.md` (roadmap L4.2) y el criterio de permisos ya validado en L4.1 (`puedeGestionarViajes`).

**Alcance:** exclusivamente `Viajes.tsx`, `ViajeDetalle.tsx` (esta vez como parte directa del análisis, no solo referencia — su condición de visibilidad de "Cancelar" es objeto de la decisión funcional de este bloque), el endpoint `POST /viajes/:id/cancelar` ya existente, las reglas de estado ya vigentes, permisos, y feedback. No se analizan Editar, Avanzar estado, acciones masivas, endpoints nuevos, paginación, ni los módulos de Liquidaciones/Facturas/Anticipos como tales — sí se examinan, puntualmente, los dos filtros ya existentes en `viajes.controller.ts`/`liquidaciones.controller.ts` que determinan cuándo un Viaje se vuelve elegible para facturación/liquidación, porque la decisión funcional pedida en este bloque depende directamente de ese hecho.

---

## 1. Auditoría del flujo actual de cancelación

**Endpoint:** `POST /viajes/:id/cancelar` (`viajes.controller.ts:334-340`), `@Roles("OPERACIONES", "ADMINISTRADOR")`, body `{ motivo?: string }` (`CancelarViajeDto`, `motivo` es `@IsOptional()`).

**Validación de negocio** (`assertCancelacionPermitida`, `viajes.controller.ts:344-362`): rechaza si `estado === "CANCELADO"`, o si `estaFacturado(viaje)`, o si `estaLiquidado(viaje)`. **No** rechaza por `estado === "DESCARGADO"` en sí mismo — esa condición extra existe únicamente del lado del frontend.

**Frontend actual** (`ViajeDetalle.tsx:122`): el botón "Cancelar viaje" solo se renderiza si `viaje.estado !== "CANCELADO" && viaje.estado !== "DESCARGADO"` — la segunda condición es más restrictiva que el backend, y es exactamente la brecha que este bloque debe resolver (§2).

**Flujo de confirmación ya existente** (`ViajeDetalle.tsx:53-74`, reutilizado tal cual en este diseño):
```
const ok = await confirm({
  title: "Cancelar viaje",
  message: `¿Cancelar el viaje N° ${viaje.numeroViaje}?`,
  requireMotivo: true,
  confirmLabel: "Cancelar viaje",
});
if (!ok.confirmed) return;
...
await api.post(`/viajes/${id}/cancelar`, { motivo: ok.motivo });
```
`ConfirmDialog.tsx:47` (`motivoOk = !pending?.requireMotivo || motivo.trim().length > 0`) deshabilita el botón "Confirmar" hasta que haya texto — motivo obligatorio a nivel de UI (el backend lo acepta vacío, inconsistencia ya documentada como hallazgo R-7 en `AUDITORIA_VIAJES2.0_NUCLEO.md`; no se resuelve en este bloque, se hereda tal cual el mismo mecanismo).

**Feedback actual:** de página completa (`success`/`error` a nivel de todo `ViajeDetalle.tsx`) — natural ahí porque solo hay un Viaje en pantalla. En el listado, este bloque debe adaptarlo a **por fila**, mismo criterio ya validado en L4.1.

---

## 2. Decisión funcional: ¿cancelar un Viaje `DESCARGADO`?

**Recomendación: A) permitir cancelar `DESCARGADO`** (mientras no esté facturado ni liquidado) — **alinear el frontend al backend ya existente, sin ningún cambio en el backend.**

**Evidencia que sostiene esta recomendación** (revisando, puntualmente, cuándo un Viaje se vuelve elegible para facturación/liquidación):

- `ViajesController.pendientesFacturar()` (`viajes.controller.ts:155-166`) exige `estado: "DESCARGADO"` como condición obligatoria para que un Viaje sea elegible para facturación.
- `LiquidacionesController.create()` (`liquidaciones.controller.ts:557-564`) exige, de forma exactamente simétrica, `estado: "DESCARGADO"` como condición obligatoria para que un Viaje sea elegible para una Liquidación.
- **Consecuencia matemática directa:** para los cinco estados anteriores a `DESCARGADO` (`PENDIENTE`, `ASIGNADO`, `EN_CARGA`, `CARGADO`, `EN_TRANSITO`), `estadoFacturacion` **siempre** vale `PENDIENTE_DE_FACTURAR` y `estadoLiquidacion` **siempre** vale `PENDIENTE` — ningún Viaje puede llegar a estar facturado o liquidado antes de pasar por `DESCARGADO`. Es decir: `estaFacturado()`/`estaLiquidado()` son estructuralmente `false` para esos cinco estados. **El único estado donde esas dos condiciones de `assertCancelacionPermitida` pueden alguna vez bloquear de verdad es `DESCARGADO`.**
- Esto demuestra que el backend fue diseñado a propósito para permitir cancelar un Viaje `DESCARGADO` mientras no haya arrancado ningún proceso financiero real — los mensajes de error específicos y distintos ("Anule la factura asociada primero" / "Anule la liquidación asociada primero", `viajes.controller.ts:295,301`) son evidencia de una regla pensada, no un descuido ni un caso no contemplado.
- El propio sistema ya permite **editar** libremente un Viaje `DESCARGADO` mientras no esté facturado/liquidado (`update()`, mismo criterio `estaFacturado`/`estaLiquidado`) — la misma filosofía ("antes de que haya dinero real involucrado, se puede corregir") debería aplicar a Cancelar, que es la forma más extrema de corrección, no una categoría aparte con una regla más estricta sin ninguna justificación documentada en el código ni en auditorías previas.
- **Caso operativo real que la regla actual deja sin resolver:** un Viaje se marca `DESCARGADO` por error (o la carga es rechazada en destino después de la descarga) antes de facturar o liquidar. Hoy, el operador no tiene ninguna vía dentro de la aplicación para cancelarlo y corregir la situación — la única alternativa dentro de la UI es dejarlo indefinidamente como "pendiente de facturar" sin nunca facturarlo, ensuciando el flujo de Facturación. Alguien con acceso directo a la API, en cambio, sí podría cancelarlo hoy mismo — una inconsistencia real entre lo que la aplicación permite y lo que el sistema permite.

**Qué implica adoptar A:** ningún cambio de backend. Únicamente ajustar `ViajeDetalle.tsx:122` para que la condición sea solo `viaje.estado !== "CANCELADO"` (quitando `&& viaje.estado !== "DESCARGADO"`), y usar el mismo criterio simétrico en la nueva acción del listado (§4).

---

## 3. Matriz estado / acción visible / resultado

Con la Decisión A aplicada, y solo para `OPERACIONES`/`ADMINISTRADOR` (para el resto de los roles, "Cancelar" nunca es visible, en ningún estado — mismo criterio de permisos de §5):

| Estado | ¿"Cancelar" visible en el listado? | Resultado al confirmar |
|---|---|---|
| `PENDIENTE` | Sí | Cancela correctamente |
| `ASIGNADO` | Sí | Cancela correctamente |
| `EN_CARGA` | Sí | Cancela correctamente |
| `CARGADO` | Sí | Cancela correctamente |
| `EN_TRANSITO` | Sí | Cancela correctamente |
| `DESCARGADO` | **Sí** (cambio respecto a hoy) | Cancela si no está facturado ni liquidado; si lo está, mensaje explicativo del backend, sin ejecutar nada |
| `CANCELADO` | No (ya cancelado) | — |

---

## 4. Propuesta UX

Continúa la recomendación ya aprobada en el diseño original de L4: **menú de tres puntos (⋮) por fila**, con "Cancelar" como única opción (Editar queda fuera, para un sub-bloque futuro si se prioriza).

**Texto exacto del modal — idéntico al ya existente en `ViajeDetalle.tsx`, reutilizado sin ninguna variación:**
- Título: `Cancelar viaje`
- Mensaje: `¿Cancelar el viaje N° {numeroViaje}?`
- Motivo: obligatorio (`requireMotivo: true`)
- Botón de confirmación: `Cancelar viaje`

**Secuencia de pasos, cumpliendo "la cancelación nunca debe ejecutarse directamente":**
1. Clic en el menú de tres puntos de la fila → se abre el menú, no se ejecuta nada.
2. Clic en "Cancelar" dentro del menú → se abre el modal (`useConfirm`), no se ejecuta nada todavía.
3. El modal exige motivo no vacío para habilitar "Cancelar viaje" (`ConfirmDialog.tsx:47`, sin cambios).
4. Confirmar → recién ahí se dispara `POST /viajes/:id/cancelar`.

Tres pasos deliberados antes de cualquier escritura — ningún atajo de un solo clic para esta acción, a diferencia de "Avanzar estado".

**Estado busy / doble clic:** cada fila necesita una segunda instancia de `useAsyncAction()` independiente de la ya usada para "Avanzar estado" en L4.1 — dos acciones distintas en la misma fila no deben compartir un único `busy`/`error`, para que cancelar no bloquee ni contamine el feedback de avanzar (y viceversa). Mismo guard por `ref` ya validado.

**Feedback:** por fila, no global — mismo criterio que L4.1. Al confirmar con éxito, se actualiza el badge de esa fila a `CANCELADO` reutilizando el mismo callback `onEstadoActualizado` ya implementado (para el frontend, "cancelar" es solo otro caso de "el estado de esta fila cambió" — no requiere ningún mecanismo nuevo). El error, si lo hay, se muestra en la celda de esa fila, igual que ya se hace para "Avanzar estado".

**Menú vacío tras cancelar:** una vez el Viaje queda `CANCELADO`, el menú de tres puntos deja de tener ninguna opción disponible en este sub-bloque (ni Cancelar ni Editar, que sigue fuera de alcance). Decisión de detalle de implementación, no bloqueante: ocultar el ⋮ por completo en ese caso, o dejarlo visible pero sin opciones.

---

## 5. Permisos

Mismo criterio ya validado y desplegado en L4.1, sin cambios: `puedeGestionarViajes = usuario?.rol === "OPERACIONES" || usuario?.rol === "ADMINISTRADOR"` (vía `useAuth()`), aplicado también al menú de tres puntos y a la opción "Cancelar" — si el rol no califica, el menú ni siquiera aparece en esa fila. El backend sigue siendo la única autoridad real (`@Roles` en `POST /viajes/:id/cancelar`); esto es únicamente UX, igual que se documentó y validó para "Avanzar estado".

---

## Riesgos

- **Reutilizar mal el modal** (crear una versión simplificada sin motivo obligatorio, por comodidad de integrarlo en una fila de tabla) — mitigado por la instrucción explícita de reutilizar `ConfirmDialog`/`useConfirm` tal cual, sin variaciones.
- **Estado `busy` compartido entre dos acciones de la misma fila** si no se le da a "Cancelar" su propia instancia de `useAsyncAction()` — cancelar bloquearía el botón de avanzar de esa fila (y viceversa) sin necesidad.
- **El listado (`selectViajeListado` de L1) no incluye `estadoFacturacion` ni `estadoLiquidacion`** — el frontend no puede saber de antemano, sin abrir el Detalle, si un `DESCARGADO` puntual ya está facturado/liquidado antes de intentar cancelarlo. No es un problema funcional (el backend igual valida y devuelve el mensaje correcto sin ejecutar nada), pero sí implica que el botón "Cancelar" puede estar visible y aun así fallar con una explicación — mismo patrón ya aceptado y validado para "Avanzar estado" en L4.1 ante datos desactualizados.
- **Cambiar la condición de visibilidad en `ViajeDetalle.tsx`** (quitar `&& !== DESCARGADO`) es un cambio de comportamiento visible también fuera del listado — se documenta acá explícitamente como parte de la decisión, no como efecto colateral silencioso.
- **Motivo sin límite de longitud** (`CancelarViajeDto.motivo` sin `@MaxLength`) — riesgo ya documentado (R-2 del núcleo audit), no se resuelve en este bloque, se hereda igual que ya existe hoy en `ViajeDetalle.tsx`.

---

## Plan de implementación (pequeño, en dos pasos)

| Paso | Contenido | Depende de |
|---|---|---|
| **Paso 1** | En `ViajeDetalle.tsx`, quitar la condición `&& viaje.estado !== "DESCARGADO"` de la visibilidad de "Cancelar viaje" (queda solo `viaje.estado !== "CANCELADO"`). Un cambio de una línea, sin tocar backend ni el modal. | Aprobación explícita de la Decisión A (§2) |
| **Paso 2** | En `Viajes.tsx`, agregar el menú de tres puntos (⋮) por fila con la opción "Cancelar", reutilizando `ConfirmDialog`/`useConfirm` tal cual, una segunda instancia de `useAsyncAction()` por fila (independiente de la de "Avanzar estado"), el mismo `puedeGestionarViajes` de L4.1, y actualización local de la fila al confirmar. | Paso 1 (para que el criterio sea consistente entre Detalle y listado) |

Si en cambio se decidiera **B** (bloquear también en backend), el Paso 1 no se haría (se mantiene la restricción actual en `ViajeDetalle.tsx` tal cual) y el Paso 2 simplemente replicaría esa misma restricción en el listado — pero **B** requeriría, además, tocar el backend (`assertCancelacionPermitida`) para agregar una condición que hoy no existe, lo cual sí sería una ampliación real de las reglas de negocio actuales, no una alineación entre capas.

---

**Fin del diseño del Sub-bloque L4.2. Sin cambios de código. Sin commits. Sin push. Queda a la espera de tu aprobación — en particular, de la Decisión Funcional (A o B) — antes de implementar cualquiera de los dos pasos.**

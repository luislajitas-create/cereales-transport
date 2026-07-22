# Validación Funcional — Bloque 10.6 (Frontend de Pago Consolidado)

**Fecha:** 2026-07-20/21
**Alcance:** `frontend/src/pages/PagosConsolidados.tsx`, `PagoConsolidadoNuevo.tsx`, `PagoConsolidadoDetalle.tsx`, rutas en `App.tsx`, entrada de navegación en `Layout.tsx`.
**Método:** validación manual end-to-end contra backend real (NestJS, puerto 3000) + Postgres local, navegador real controlado (Chrome vía automatización), sin mocks. **No se modificó código de la aplicación durante esta validación** — únicamente se sembraron datos de prueba (liquidaciones `CONFIRMADA` adicionales y su reversión puntual a `ANULADA`/`CONFIRMADA` para forzar escenarios `PARCIAL`/`FALLIDO`) directamente en la base de datos de desarrollo, mediante scripts descartables fuera del árbol de la aplicación.
**Resultado:** **sin bugs encontrados**. Todo el comportamiento observado coincide con `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`. Un hallazgo inicial (ver nota al final de la sección 2) resultó ser diseño intencional de Bloque 10.5, verificado contra el código antes de continuar.

Las referencias a capturas dentro de cada sección usan el nombre de archivo corto (`screenshot-....jpg`); la ruta completa de cada una está en la tabla de la sección 13 (`docs/validaciones/bloque10.6_screenshots/`).

## Datos de prueba usados

Ya existían en la base de desarrollo, preparados de antemano para esta validación (nombres de usuario/organización con el sufijo `validacion106-...` lo confirman):
- Grupo Económico Demo (`Organización Principal` + `Organización B - Grupo Económico`), con `admin@demo.com` (ADMINISTRADOR, acceso a ambas organizaciones) e identidad compartida "Carlos Gómez" (un chofer por organización).
- `Organizacion Validacion Sin Grupo` con `validacion106-singrupo@demo.com` (ADMINISTRADOR, sin grupo económico).
- `validacion106-noadmin@demo.com` (OPERACIONES, en `Organización Principal`) para el caso "sin permisos".

Se sembraron 6 pares adicionales de liquidaciones `CHOFER`/`CONFIRMADA` (una por organización, mismo beneficiario) para poder recorrer el ciclo de vida completo varias veces en paralelo sin agotar el único par preexistente.

---

## 1. Listado

| Caso | Resultado |
|---|---|
| Grupo existente | OK — header "Grupo: Grupo Económico Demo" visible en todo momento. |
| Sin grupo | OK — `validacion106-singrupo@demo.com` ve "Tu organización no pertenece a ningún grupo económico." (mismo mensaje en `/nuevo`). |
| Sin permisos | OK — `validacion106-noadmin@demo.com` (OPERACIONES) ve "No tenés permiso para ver esta sección." en listado, `/nuevo` y `/:id`; el link "Pago Consolidado" del menú lateral está oculto para este rol. |
| Lista vacía | OK — antes de crear el primer pago: "No hay pagos consolidados todavía." |
| Lista con datos | OK — tabla final con 6 pagos (BORRADOR, PREPARADO ×2, CONFIRMADO ×2, CANCELADO), badges por estado, orden descendente por fecha de creación. |

Evidencia: `screenshot-1784595292898-0.jpg` (vacía), `screenshot-1784603255771-16.jpg` (con datos), `screenshot-1784604672846-18.jpg` (sin permisos), `screenshot-1784604729955-19.jpg` (sin grupo).

## 2. Creación

| Caso | Resultado |
|---|---|
| Beneficiario | OK — select "Identidad de chofer" carga "Carlos Gómez" desde `/grupo-economico/choferes/identidades`. |
| Carga de candidatos | OK — al elegir beneficiario dispara un único `GET .../pagos-consolidados/candidatos`, tabla con N°, organización, período, neto — datos de ambas organizaciones mezclados correctamente. |
| Selección | OK — checkboxes por fila, subtotal por organización y total general recalculados en vivo. |
| Crear BORRADOR | OK — `POST .../pagos-consolidados` navega de inmediato al detalle del pago recién creado en estado BORRADOR. |
| Error de red | OK — con el backend caído (proceso detenido deliberadamente), el submit muestra "No se pudo crear el pago consolidado." y **preserva íntegros** beneficiario, selección y referencia (verificado con captura inmediatamente posterior al error). |
| Error de backend | OK — con dos pestañas: pestaña A preparó un pago con un par de liquidaciones (bloqueándolas); pestaña B, que había cargado esas mismas candidatas *antes* del bloqueo, al enviar recibió el mensaje real del backend: "Una de las liquidaciones ya está incluida en otro pago consolidado." — distinto del mensaje genérico de error de red, confirmando que el banner muestra el mensaje real cuando el backend lo provee. |
| Reintento | OK — tras el error de red, con el backend restaurado, un segundo click en "Crear" con la misma selección tipeada de nuevo completó la creación exitosamente (la pestaña se había suspendido por inactividad del navegador durante la espera y perdió el estado de React — no relacionado con el código de la app; la evidencia del punto anterior ya cubre la persistencia del formulario inmediatamente después del error). |

**Hallazgo verificado como NO-bug:** justo después de crear un pago BORRADOR, sus liquidaciones siguen apareciendo en la lista de candidatos de una nueva creación (no quedan bloqueadas hasta `preparar()`). Se verificó contra el código (`pago-consolidado.service.ts`, comentario junto a `pagoConsolidadoLiquidacionId`) y coincide con la Decisión Técnica 3 de Bloque 10.5: el bloqueo se adquiere recién en `preparar()`, nunca en `crear()`. No es un defecto de 10.6.

Evidencia: `screenshot-1784599876383-1.jpg` (selección con subtotales), `screenshot-1784601101490-4.jpg` (error de red, formulario preservado), `screenshot-1784603105346-15.jpg` (error de backend real, distinto mensaje).

## 3. Detalle — todos los estados

| Estado | Resultado |
|---|---|
| BORRADOR | OK — KPIs (total, referencia, creado), desglose PENDIENTE por organización, botones Preparar/Cancelar. |
| PREPARADO | OK — banner de éxito "Pago preparado — liquidaciones bloqueadas.", botones Confirmar/Cancelar. |
| PARCIAL | OK — badge PARCIAL, banner ámbar "no es un error del sistema...", una fila APLICADA y otra FALLIDA, botón Reintentar (sin Cancelar — correcto, PARCIAL no está en la lista de estados cancelables). |
| FALLIDO | OK — badge FALLIDO, banner "Ninguna organización se aplicó todavía...", ambas filas FALLIDA, botones Reintentar y Cancelar. |
| CONFIRMADO | OK — badge verde, banner de éxito, ambas filas APLICADA, sin ninguna acción disponible (estado terminal). |
| CANCELADO | OK — badge rojo, KPI adicional "Motivo de cancelación" con el texto tipeado, filas conservan su último `estadoAplicacion` (FALLIDA en este caso), sin acciones disponibles. |

Evidencia: `screenshot-1784600641833-3.jpg` (BORRADOR), `screenshot-1784602546037-6.jpg` (PREPARADO), `screenshot-1784602646059-8.jpg` (CONFIRMADO), `screenshot-1784602741943-9.jpg` (PARCIAL), `screenshot-1784602857116-12.jpg` (FALLIDO), `screenshot-1784602881788-14.jpg` (CANCELADO).

## 4. Confirmar

| Resultado esperado | Verificado |
|---|---|
| CONFIRMADO (éxito total) | OK — ambas organizaciones APLICADA, banner verde "aplicado por completo en todas las organizaciones". |
| PARCIAL | OK — provocado revirtiendo una liquidación a `ANULADA` entre `preparar()` y `confirmar()` (simulando el caso real de una liquidación anulada mientras el pago está bloqueado); una organización aplicó, la otra quedó FALLIDA; banner ámbar. |
| FALLIDO | OK — ambas liquidaciones revertidas a `ANULADA`; ninguna organización aplicó; banner ámbar "Ninguna organización se aplicó todavía. Podés reintentar o cancelar." |

El diálogo de confirmación (severidad alta, texto tipeado obligatorio "Carlos Gómez") se probó explícitamente: botón deshabilitado con el campo vacío o parcialmente escrito ("Carlos"), habilitado solo con el valor exacto.

Evidencia: `screenshot-1784602614272-7.jpg` (diálogo con campo vacío).

## 5. Reintento

OK — sobre el pago PARCIAL: se restauró la liquidación fallida a `CONFIRMADA` y se usó el botón "Reintentar". El diálogo mostró título y copy distintos ("Reintentar confirmación" en vez de "Confirmar pago consolidado"). El resultado reprocesó **únicamente** la fila FALLIDA (la ya APLICADA no se tocó de nuevo) y el pago pasó a CONFIRMADO — confirma la idempotencia documentada en el código (`confirmar()` solo procesa filas `PENDIENTE`/`FALLIDA`).

Evidencia: `screenshot-1784602765386-10.jpg` (diálogo reintentar), `screenshot-1784602781464-11.jpg` (resultado CONFIRMADO tras reintento).

## 6. Cancelar

OK — probado desde estado FALLIDO. El diálogo exige motivo obligatorio (textarea, botón deshabilitado hasta escribir algo). Tras confirmar con motivo, el pago pasa a CANCELADO, el motivo queda visible en un KPI dedicado, y el banner de éxito "Pago consolidado cancelado." aparece. `puedeCancelar` se comportó exactamente según la tabla de transiciones (visible en BORRADOR/PREPARADO/FALLIDO, ausente en PARCIAL/CONFIRMADO/CANCELADO/PROCESANDO).

Evidencia: `screenshot-1784602869537-13.jpg` (diálogo motivo vacío), `screenshot-1784602881788-14.jpg` (resultado CANCELADO).

## 7. Cambio de organización activa

OK — con `admin@demo.com` sobre la pantalla de listado, se cambió la organización activa de "Organización Principal" a "Organización B - Grupo Económico" mediante el selector del layout (con su propio diálogo de confirmación). Tras el cambio:
- El header **"Grupo: Grupo Económico Demo"** siguió mostrándose — confirma que la pantalla es de nivel de grupo, no de organización activa.
- El listado de pagos pasó a mostrar **"No tenés acceso vigente a una de las organizaciones involucradas."** en lugar de los datos — porque el admin de Organización B no tenía `AccesoGrupoEconomico` vigente hacia Organización Principal (backend, `verificarAccesoATodas`). Esto es el comportamiento correcto documentado en el propio código de `PagosConsolidados.tsx` (sección 13 del diseño): ante un 403 de acceso, se muestra el error específico del backend, **sin ningún parche del lado del cliente para sortearlo**.
- Al revertir a "Organización Principal" el listado volvió a mostrar los 6 pagos normalmente.

Evidencia: `screenshot-1784604028298-17.jpg`.

## 8. Navegación

OK — "Ver" desde el listado navega al detalle correcto; el botón "atrás" del navegador vuelve al listado y re-consulta los datos (no usa una caché stale); "Nuevo pago consolidado" navega al formulario; el link del menú lateral y la navegación por click interno (React Router) funcionan sin recarga completa de página.

## 9. `useUnsavedChangesGuard`

OK, y con evidencia orgánica no planeada: durante la prueba de "Error de backend" quedó una selección activa (`seleccion.size > 0`) en la pantalla `/nuevo` de una pestaña de prueba. Un intento posterior de navegación de página completa (`navigate()` a otra URL) fue **bloqueado por el diálogo nativo `beforeunload`** del navegador — confirmando que el guard se dispara correctamente ante un intento real de salir de la página con selección pendiente. Se verificó además que la navegación **interna** de React Router (click en un link del menú) **no** dispara el guard — coincide con el comentario del propio hook: solo escucha el evento nativo `beforeunload`, que jamás se emite en un cambio de ruta puramente client-side.

## 10. Responsive básico

**Limitación de entorno, no del código:** se intentó redimensionar la ventana del navegador automatizado (390×844 y 480×900) mediante la herramienta de resize disponible en esta sesión; `window.innerWidth`/`innerHeight` confirmaron que el viewport permaneció fijo en 1366×543 pese a múltiples intentos y una recarga de página — la sesión de automatización de este entorno no permite variar el viewport real. No se pudo, por lo tanto, capturar una prueba visual de reflow en mobile/tablet.

Como verificación estructural sustituta: se confirmó por lectura de código que las tres pantallas nuevas **no introducen CSS propio** — reutilizan íntegramente las clases compartidas ya existentes en `styles.css` (`.page-header`, `.card`, `table`, `.form-grid`, `.actions-row`, `.kpi-grid`), cuyo único mecanismo de adaptación en toda la aplicación es `overflow-x: auto` en `.main-content` (no hay `@media` queries en ningún punto de `styles.css`). Es decir, Bloque 10.6 se comporta exactamente igual que el resto de las pantallas administrativas ya certificadas ante ventanas angostas — ni mejor ni peor. Esto queda documentado como pendiente de verificación visual manual por parte del usuario si lo considera necesario.

## 11. Consola del navegador sin errores

OK — se revisó la consola en cada tab a lo largo de toda la sesión (`onlyErrors: true`). El único mensaje repetido es:

```
Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
```

Este mensaje aparece en **todas** las páginas de la aplicación (no solo Pago Consolidado) en cada navegación, con origen `:0:0` (sin archivo ni línea) — es un artefacto conocido de extensiones de Chrome del navegador del usuario, no del código de la aplicación. No se observó ningún error con stack trace de la app (React, axios, TypeScript) en ningún momento, incluyendo durante el error de red simulado (el catch de `useAsyncAction` maneja el fallo sin loguearlo a consola).

## 12. Build limpio

OK — `npm run build` (`tsc -b && vite build`) en `frontend/` terminó sin errores ni warnings:

```
✓ 118 modules transformed.
dist/index.html                  0.43 kB
dist/assets/index-CNJsmIQ5.css   6.38 kB
dist/assets/index-DsnrZMfh.js  369.27 kB
✓ built in 1.42s
```

## 13. Screenshots — resumen de evidencia

Todas las capturas están en `docs/validaciones/bloque10.6_screenshots/` (sin commitear, a la espera de autorización):

| Escenario | Archivo |
|---|---|
| Lista vacía | `docs/validaciones/bloque10.6_screenshots/screenshot-1784595292898-0.jpg` |
| Selección con subtotales (creación) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784599876383-1.jpg` |
| Detalle BORRADOR | `docs/validaciones/bloque10.6_screenshots/screenshot-1784600641833-3.jpg` |
| Error de red (formulario preservado) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784601101490-4.jpg` |
| Diálogo "Preparar" | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602535674-5.jpg` |
| Detalle PREPARADO | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602546037-6.jpg` |
| Diálogo confirmar (texto tipeado vacío) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602614272-7.jpg` |
| Detalle CONFIRMADO | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602646059-8.jpg` |
| Detalle PARCIAL | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602741943-9.jpg` |
| Diálogo "Reintentar confirmación" | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602765386-10.jpg` |
| Reintento exitoso → CONFIRMADO | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602781464-11.jpg` |
| Detalle FALLIDO | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602857116-12.jpg` |
| Diálogo cancelar (motivo vacío) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602869537-13.jpg` |
| Detalle CANCELADO con motivo | `docs/validaciones/bloque10.6_screenshots/screenshot-1784602881788-14.jpg` |
| Error de backend real (mensaje distinto al de red) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784603105346-15.jpg` |
| Lista con datos (múltiples estados) | `docs/validaciones/bloque10.6_screenshots/screenshot-1784603255771-16.jpg` |
| Cambio de organización — info transversal + error de acceso | `docs/validaciones/bloque10.6_screenshots/screenshot-1784604028298-17.jpg` |
| Sin permisos | `docs/validaciones/bloque10.6_screenshots/screenshot-1784604672846-18.jpg` |
| Sin grupo | `docs/validaciones/bloque10.6_screenshots/screenshot-1784604729955-19.jpg` |

---

## 14. Adenda — reverificación posterior a la auditoría adversarial (2026-07-22)

Esta validación (sección 1-13) cubrió los 14 escenarios previstos en `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, sección 18, y no encontró bugs **dentro de ese alcance**. La auditoría adversarial posterior (`AUDITORIA_ADVERSARIAL_BLOQUE10.6.md`), centrada en lectura de código en vez de ejecución, encontró 7 hallazgos reales que esta validación manual no podía detectar porque dependían de ventanas de tiempo, fallos de red simulados y lectura de contratos de API no cubiertos por los 14 escenarios originales (en particular, el fallo del endpoint que resuelve el nombre del beneficiario nunca se probó, porque ese endpoint ni siquiera estaba identificado como parte del contrato de esta pantalla).

Tras la corrección mínima de esos hallazgos (Product Owner, 2026-07-22), se repitieron en navegador real —contra el mismo backend NestJS + Postgres local, sin mocks de aplicación— exclusivamente las pruebas afectadas por las correcciones:

1. **Fallo del endpoint de identidad** — banner claro visible, "Confirmar"/"Reintentar" deshabilitado (`disabled === true`, verificado programáticamente).
2. **Recuperación vía "Actualizar"** tras destrabar el fallo — banner desaparece, nombre del beneficiario resuelto, botón habilitado (`disabled === false`). *(Esta prueba detectó, en su primera ejecución, que la corrección inicial no reintentaba la identidad — ver adenda de `AUDITORIA_ADVERSARIAL_BLOQUE10.6.md` y `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md` §22.3 — corregido antes de repetir la prueba con éxito.)*
3. **Cambio rápido de beneficiario** (A→B, con la respuesta de A resolviendo después de B) — la tabla de candidatos mostró únicamente los de B; la respuesta tardía de A no la pisó.
4. **Múltiples clics rápidos en "Actualizar"** — una sola solicitud real quedó activa, el botón permaneció deshabilitado durante la operación, el estado final mostrado correspondió a esa única respuesta.
5. **Banners tras Preparar → Cancelar reales** sobre un pago de prueba (`QA-10.6-PAGO1`) — el banner de éxito de "Preparar" desapareció por completo al mostrarse el resultado de "Cancelar", sin mensajes contradictorios ni residuales.
6. **Diferenciación visual de `CONFIRMADO`/`PARCIAL`/`FALLIDO`** — confirmada por inspección de código (la corrección no tocó esa lógica) y por verificación visual de un pago `CONFIRMADO` real ya existente en los datos de prueba.

Durante esta reverificación se detectó además, y se corrigió antes de continuar, un segundo bug no relacionado con la identidad: la eliminación de una rama de código que la auditoría adversarial había calificado como "código muerto" (Hallazgo 4) rompía la pantalla con un error real, por una condición de carrera genuina entre dos `useEffect` del componente — ver detalle completo en `AUDITORIA_ADVERSARIAL_BLOQUE10.6.md` y `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md` §22.3.

`npm run build` limpio en cada etapa de la corrección. Consola del navegador sin errores nuevos tras las correcciones finales. **Sin cambios de backend** en ningún momento de la corrección ni de esta reverificación.

**Efecto colateral en datos de desarrollo:** `QA-10.6-PAGO1` quedó en estado `CANCELADO` (era `BORRADOR` al momento de la validación original de la sección 1-13) como consecuencia de ejercitar Preparar→Cancelar reales para la prueba 5 de esta adenda.

---

## Conclusión

Los tres componentes de Bloque 10.6 (`PagosConsolidados`, `PagoConsolidadoNuevo`, `PagoConsolidadoDetalle`) se comportan exactamente según lo especificado en `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, en los 13 puntos solicitados **dentro del alcance de esta validación** (sección 1-13). No se encontró ningún bug dentro de ese alcance — el único hallazgo inicial (candidatos no bloqueados hasta `preparar()`) se verificó como diseño intencional heredado de Bloque 10.5, no como defecto de esta capa. La única limitación fue de entorno (no se pudo variar el viewport real para la prueba responsive), compensada con verificación estructural del CSS.

Esta conclusión queda **complementada, no contradicha**, por la sección 14: una auditoría adversarial posterior, con un método distinto (lectura de código en vez de ejecución guiada por escenarios), sí encontró hallazgos reales fuera del alcance de los 14 escenarios originales — todos corregidos y reverificados, según el detalle de la sección 14.

No se realizó ningún commit ni push como parte de esta validación ni de su adenda, según instrucción explícita.

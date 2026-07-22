# Auditoría Adversarial — Bloque 10.6 (Frontend de Pago Consolidado)

Fecha: 2026-07-22. Alcance: `frontend/src/pages/PagosConsolidados.tsx`, `PagoConsolidadoNuevo.tsx`, `PagoConsolidadoDetalle.tsx`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/styles.css`, contrastados contra `DISEÑO_BLOQUE10.6_PAGO_CONSOLIDADO.md`, `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, `VALIDACION_FUNCIONAL_BLOQUE10.6.md` y el backend real (`pago-consolidado.controller.ts`/`.service.ts`, `grupo-economico.controller.ts`, `identidad-chofer.controller.ts`). Método: lectura adversarial línea por línea del código real, sin ejecutar la aplicación (la Validación Funcional ya cubrió el comportamiento manual contra el servidor — esta auditoría busca específicamente lo que esa validación, al ejecutarse sobre el "camino feliz" y escenarios previstos, no podía detectar).

**No se modificó ningún archivo de código durante esta auditoría.**

---

## Resumen ejecutivo

Se encontraron **7 hallazgos reales**, ninguno de severidad crítica (no hay pérdida de dinero, ni bypass de autorización, ni corrupción de datos financieros — el backend sigue siendo la autoridad final en todos los casos). El más severo (Hallazgo 1) es una llamada a un endpoint no documentado en ninguno de los dos documentos aprobados, cuyo modo de fallo silencioso puede dejar inoperante, sin ningún aviso, el botón de la acción financiera más importante de todo el bloque (Confirmar/Reintentar). El resto son inconsistencias de documentación, una condición de carrera de bajo impacto (mitigada por revalidación del backend) y código muerto.

| # | Hallazgo | Severidad | Estado tras corrección y reverificación (2026-07-22) |
|---|---|---|---|
| 1 | Endpoint no documentado (`identidades/:id`) con fallo silencioso que puede inutilizar "Confirmar"/"Reintentar" | **Alta** | **Corregido y reverificado.** Ver nota de reverificación al final del documento — la primera versión de la corrección tenía un bug propio (Actualizar no reintentaba la identidad), también corregido. |
| 2 | Condición de carrera al cambiar de beneficiario rápidamente en la creación | Media | **Corregido y reverificado** con la carrera real forzada en navegador. |
| 3 | Banners de distintas acciones no se limpian entre sí — pueden persistir en un estado terminal | Media | **Corregido y reverificado** con Preparar→Cancelar reales. |
| 4 | Código muerto: rama "Pago consolidado no encontrado" inalcanzable | Baja | **Hallazgo incorrecto — revertido.** La reverificación demostró que la rama SÍ es alcanzable (condición de carrera real entre los dos primeros `useEffect`); eliminarla rompía la pantalla. Ver nota de reverificación. |
| 5 | Endpoint de identidades (plural) consumido en el listado sin estar explicitado para esa pantalla en Decisiones Técnicas §6 | Baja | Documentado (sin cambio de código) — `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, adenda §22. |
| 6 | `styles.css` modificado (6º archivo) con 8 clases nuevas — contradice explícitamente "ninguna clase nueva" | Baja / informativa | Documentado (sin cambio de código) — reconocido como sexto archivo legítimamente modificado, `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, adenda §22. |
| 7 | Botón "Actualizar" del detalle sin guardia propia de superposición | Baja | **Corregido y reverificado** con múltiples clics rápidos. |

---

## Hallazgo 1 — Endpoint no documentado y fallo silencioso del botón Confirmar/Reintentar

**Severidad:** Alta.

**Evidencia:**
- `frontend/src/pages/PagoConsolidadoDetalle.tsx:110-125` agrega un tercer `useEffect`, no presente en ningún otro documento, que llama a `GET /grupo-economico/choferes/identidades/${pago.identidadChoferGrupoId}` para resolver el nombre del beneficiario.
- Ese endpoint (`identidad-chofer.controller.ts:79-91`, método `detalle()`) **no aparece en ningún lugar** de `DISEÑO_BLOQUE10.6_PAGO_CONSOLIDADO.md` §12 ("Endpoints propios... los 7 reales, ninguno más" + 2 prerrequisitos = 9 contratos totales), ni en `DECISIONES_TECNICAS_BLOQUE10.6...md` §6, que enumera explícitamente para esta pantalla solo dos llamadas en paralelo: `GET /grupo-economico` y `GET .../pagos-consolidados/:pagoId`.
- Esto viola literalmente el criterio de aceptación técnico #4 de la sección 19: *"Ningún endpoint de backend es creado, modificado ni consumido más allá de los nueve contratos reales listados..."* — este es un décimo contrato, no aprobado.
- El `catch` de esa llamada (línea 118-120) hace `setIdentidad(null)` sin ningún estado de error, sin reintento, sin ningún banner.
- `confirmarOReintentar()` (línea 154-155) empieza con `if (!grupo || !pago || !identidad) return;` — **antes** de abrir el diálogo de confirmación. Si `identidad` es `null` (por fallo de red, por timing, o porque el fetch todavía no resolvió), el clic en "Confirmar"/"Reintentar" no produce absolutamente ningún efecto observable: no abre diálogo, no muestra error, no cambia ningún estado visual.
- Crucialmente, el botón "Confirmar"/"Reintentar" (línea 330-334) se muestra y se habilita exclusivamente en función de `puedeConfirmar` (que depende solo de `pago.estado`, línea 253) — **nunca** se deshabilita ni oculta mientras `identidad` sigue en `null`. Además, `cargando` (el spinner de pantalla completa) solo cubre los efectos 1 y 2 (grupo + pago) — el detalle completo, con sus botones de acción, se renderiza **antes** de que el tercer fetch de identidad necesariamente haya resuelto.

**Impacto:** en todo pago que llegue a un estado confirmable (`PREPARADO`, `PARCIAL`, `FALLIDO`), existe una ventana real y determinística — en cada carga de la pantalla — durante la cual el botón más crítico del flujo (la acción financiera irreversible) está visible, habilitado, y no hace nada al presionarlo. Si la llamada llega a fallar del todo (caída transitoria de red, backend reiniciado a mitad de sesión), el botón queda muerto de forma **permanente** hasta que el usuario recargue la página completa — sin ningún mensaje que lo explique. Para un administrador, esto es indistinguible de una aplicación rota.

**Riesgo:** funcional/UX, no financiero directo (el backend nunca llega a ejecutarse, así que no hay riesgo de dinero mal aplicado) — pero es un riesgo operativo serio: un pago `PARCIAL` o `FALLIDO` que requiere reintento puede quedar bloqueado en la interfaz sin que el administrador entienda por qué, justo en el escenario que el propio Diseño (§13) identificó como el más delicado ("el administrador ve exactamente qué organización(es) quedaron pendientes... y puede reintentar").

**Propuesta de corrección (no aplicada — pendiente de autorización):** eliminar esta llamada y resolver el nombre del beneficiario contra la lista ya cargada por `GET /grupo-economico/choferes/identidades` (el mismo endpoint plural ya usado en `PagosConsolidados.tsx` y `PagoConsolidadoNuevo.tsx`, y ya aprobado como prerrequisito en el Diseño §12) en lugar de introducir un endpoint singular no contemplado; alternativamente, si se decide mantenerlo, requeriría una Decisión Técnica adicional explícita y que `puedeConfirmar` (o el propio botón) contemple el estado de carga/error de `identidad`.

---

## Hallazgo 2 — Condición de carrera al cambiar de beneficiario en la creación

**Severidad:** Media.

**Evidencia:** `PagoConsolidadoNuevo.tsx:78-94`, función `elegirBeneficiario()`. A diferencia de los tres `useEffect` de carga de las tres pantallas (que sí usan la bandera `cancelado` documentada en Decisiones Técnicas §6: *"cada useEffect de carga usa una bandera de cancelación local... para que una respuesta que llega después... no pise el estado visible"*), esta función es un manejador de evento (`onChange` del `<select>`), no un `useEffect`, y **no tiene ningún guard de orden de respuesta**:

```
api.get(`/grupo-economico/${grupo.id}/pagos-consolidados/candidatos`, { params: { identidadChoferGrupoId: id } })
  .then((res) => setCandidatos(res.data))
  ...
```

**Escenario reproducible:** el usuario elige el beneficiario A (dispara el `GET` para A, con latencia). Antes de que responda, cambia a beneficiario B (esto reinicia `candidatos`/`seleccion` correctamente y dispara el `GET` para B). Si la respuesta de B llega primero y luego llega la de A (orden de red no garantizado, o A tarda más por estar recorriendo más organizaciones), el `.then` de A ejecuta `setCandidatos(res.data)` **sobrescribiendo silenciosamente** los candidatos de B con los de A — mientras el `<select>` sigue mostrando a B como elegido.

**Impacto:** la tabla mostrada puede pertenecer a un beneficiario distinto del que aparece seleccionado — un "estado imposible" visible en pantalla. Si el usuario selecciona filas en ese momento y confirma la creación, el `identidadChoferGrupoId` enviado (B) no coincide con las liquidaciones realmente enviadas (de A), y el backend (`pago-consolidado.service.ts`, `revalidarItem()`, línea 101-103) rechaza con *"Una de las liquidaciones no corresponde al beneficiario declarado."* — un mensaje real pero confuso para un usuario que, desde su perspectiva, seleccionó filas que la pantalla le mostraba como válidas para B.

**Riesgo:** no hay riesgo financiero (el backend revalida y rechaza correctamente) — el riesgo es de confusión operativa y de confianza en la pantalla, exactamente la categoría de "estados imposibles" y "condiciones de carrera" pedida en esta auditoría.

**Propuesta de corrección (no aplicada):** aplicar el mismo patrón de bandera de cancelación (o comparar el `id` de la respuesta contra el `identidadChoferGrupoId` vigente en el momento de resolver la promesa) ya usado en los tres `useEffect`, extendido a este manejador de evento.

---

## Hallazgo 3 — Banners de distintas acciones no se limpian entre sí

**Severidad:** Media.

**Evidencia:** `PagoConsolidadoDetalle.tsx` usa **tres instancias independientes** de `useAsyncAction` (`prepararAccion`, `confirmarAccion`, `cancelarAccion`, líneas 61-63), cada una con su propio `error`/`success`, y las renderiza todas simultáneamente sin condición de exclusión mutua (líneas 269-273):

```
{prepararAccion.error && <div className="error-banner">{prepararAccion.error}</div>}
{prepararAccion.success && <div className="success-banner">{prepararAccion.success}</div>}
{confirmarAccion.error && <div className="error-banner">{confirmarAccion.error}</div>}
{cancelarAccion.error && <div className="error-banner">{cancelarAccion.error}</div>}
{cancelarAccion.success && <div className="success-banner">{cancelarAccion.success}</div>}
```

Cada `run()` de `useAsyncAction` limpia únicamente su **propio** `error`/`success` al iniciar (`useAsyncAction.ts:23-24`) — nunca los de otra instancia. `setResultadoBanner(null)` (el único reseteo cruzado que existe en el archivo) solo cubre el banner específico de resultado de `confirmar()`, no los banners genéricos de las otras dos acciones.

**Escenario reproducible:** el administrador intenta "Preparar" y falla (por ejemplo, colisión de bloqueo) → aparece el banner rojo de `prepararAccion.error`. Sin recargar la página, decide "Cancelar" en su lugar, y esta vez funciona → aparece el banner verde de `cancelarAccion.success` ("Pago consolidado cancelado."). **El banner rojo de la falla de Preparar sigue visible al mismo tiempo**, ahora ya sin ningún sentido, porque el pago pasó a `CANCELADO` (estado terminal, sin más acciones) — y como el componente no se desmonta, ese banner obsoleto puede quedar visible indefinidamente en la pantalla final del pago.

**Impacto:** confusión de UX — dos mensajes contradictorios o desactualizados visibles a la vez, potencialmente en la vista final de un pago ya cerrado. No hay impacto financiero ni de seguridad.

**Riesgo:** bajo, puramente de claridad de interfaz — pero contradice el espíritu de Diseño §10 ("todo mensaje... corresponde al mensaje real... nunca un texto genérico que oculte la causa"), ya que el problema acá es el opuesto: un mensaje real pero **obsoleto** que no se retira.

**Propuesta de corrección (no aplicada):** al iniciar cualquiera de las tres acciones, limpiar explícitamente `error`/`success` de las otras dos (o consolidar en un único banner de "última acción" en lugar de tres independientes).

---

## Hallazgo 4 — Código muerto: rama "Pago consolidado no encontrado" inalcanzable

**Severidad:** Baja.

**Evidencia:** `PagoConsolidadoDetalle.tsx:242-249`:
```
if (!pago) {
  return (... <p className="muted">Pago consolidado no encontrado.</p> ...);
}
```
Esta rama solo podría alcanzarse si `cargando === false`, `errorCarga === ""`, `grupo` existe, y `pago` sigue siendo `null`. Pero el único lugar donde `pago` se fija es `cargarPago()` (línea 69-72), cuyo `.then` siempre llama `setPago(res.data)` con una respuesta 200 real (el servicio `consultar()` del backend nunca devuelve un cuerpo vacío en éxito — lanza `NotFoundException` si no existe, lo cual cae en el `.catch` de la línea 98-100 y setea `errorCarga`, no deja `pago` en `null` silenciosamente). Es decir: todo camino de fallo ya queda cubierto antes por el bloque `if (errorCarga)` (línea 224-231), que se evalúa primero en el render. No existe ningún camino de ejecución real que llegue a renderizar esta rama.

**Impacto:** ninguno funcional — es una rama de defensa que nunca se ejecuta.

**Riesgo:** ninguno; es una cuestión de mantenibilidad (código que sugiere un caso que en realidad ya está cubierto por otro camino, lo que puede confundir a quien mantenga el archivo después).

**Propuesta de corrección (no aplicada):** eliminar la rama, o documentar por qué se conserva como defensa adicional si se prefiere mantenerla.

---

## Hallazgo 5 — Endpoint de identidades (plural) no explicitado para `PagosConsolidados.tsx` en Decisiones Técnicas §6

**Severidad:** Baja.

**Evidencia:** `PagosConsolidados.tsx:49-69` carga, en paralelo con `GET /grupo-economico`, también `GET /grupo-economico/choferes/identidades` (para resolver `nombreBeneficiario` en la tabla). Decisiones Técnicas §6 describe la carga inicial de esta pantalla puntual como: *"`GET /grupo-economico` → (si hay grupo) `GET .../pagos-consolidados`. Secuencial, no en paralelo"* — sin mencionar el endpoint de identidades para esta pantalla en particular (sí lo hace, correctamente, para `PagoConsolidadoNuevo.tsx`).

**Impacto:** ninguno funcional — el endpoint sí está entre los 9 contratos aprobados en general (Diseño §12, prerrequisito), y su fallo se trata con el mismo `error-banner` genérico de carga (`errorGrupo`), sin ningún efecto colateral silencioso como en el Hallazgo 1.

**Riesgo:** ninguno funcional; es una omisión de la documentación de Decisiones Técnicas respecto del código real, distinta en naturaleza al Hallazgo 1 (acá el endpoint sí estaba aprobado a nivel de Diseño, solo faltó anotarlo por pantalla).

**Propuesta de corrección (no aplicada):** actualizar Decisiones Técnicas §6 para reflejar la carga real de `PagosConsolidados.tsx`.

---

## Hallazgo 6 — `styles.css` modificado (6º archivo) con 8 clases CSS nuevas

**Severidad:** Baja / informativa.

**Evidencia:** `git diff` confirma que `frontend/src/styles.css` fue modificado, agregando `.badge.PREPARADO`, `.badge.PROCESANDO`, `.badge.CONFIRMADO`, `.badge.PARCIAL`, `.badge.FALLIDO`, `.badge.APLICADA`, `.badge.FALLIDA` y `.warning-banner` (8 clases nuevas). Esto contradice dos afirmaciones explícitas de Decisiones Técnicas:
- §3, punto 3: *"las clases CSS ya existentes... ninguna clase nueva."*
- §19, criterio de aceptación #3: *"Ningún archivo fuera de los cinco listados en la sección 3 es creado o modificado."* — `styles.css` no es uno de los cinco (las 3 páginas nuevas + `App.tsx` + `Layout.tsx`).

**Impacto:** ninguno negativo — sin estas clases, los badges de los 7 estados nuevos y el banner de resultado parcial/fallido no tendrían color diferenciado (caerían al estilo base de `.badge`, sin distinguir visualmente `PARCIAL` de `CONFIRMADO`, por ejemplo), lo cual sí habría sido un defecto visual real. El cambio es necesario y benigno.

**Riesgo:** ninguno funcional; es una desviación real y verificable entre lo documentado como decidido y lo efectivamente implementado (categoría 20 pedida explícitamente en esta auditoría).

**Propuesta de corrección (no aplicada):** ninguna corrección de código — actualizar Decisiones Técnicas para reconocer `styles.css` como sexto archivo modificado, con justificación (los 7 estados nuevos exigían distinción visual que las clases existentes no cubrían).

---

## Hallazgo 7 — Botón "Actualizar" del detalle sin guardia propia de superposición

**Severidad:** Baja.

**Evidencia:** `PagoConsolidadoDetalle.tsx:324`, botón "Actualizar" → `onClick={recargarPago}`, deshabilitado solo por `busy` (la unión de `prepararAccion.busy || confirmarAccion.busy || cancelarAccion.busy`, línea 251) — no por ningún estado propio. `recargarPago()` (línea 131-133) llama a `cargarPago()` directamente, sin pasar por `useAsyncAction`, sin bandera de "en curso" propia, y sin ningún guard de orden de respuesta.

**Impacto:** si el usuario hace clic varias veces seguidas sobre "Actualizar" (sin ninguna otra acción en curso), pueden quedar múltiples `GET` superpuestos cuyo orden de resolución no está garantizado — una respuesta más vieja podría llegar después de una más nueva y pisarla momentáneamente con datos desactualizados.

**Riesgo:** bajo — es autocorrectivo (el siguiente clic, o cualquier acción de ciclo de vida, vuelve a traer el estado real), y no hay ninguna decisión ni escritura basada en ese estado momentáneamente viejo, salvo que el usuario alcance a hacer clic en una acción de ciclo de vida exactamente en esa ventana — algo ya cubierto de todos modos por la revalidación exhaustiva del backend.

**Propuesta de corrección (no aplicada):** envolver `recargarPago` con su propia instancia de `useAsyncAction` (o un flag `refrescando`) para deshabilitar el botón mientras está en curso, mismo patrón ya usado en el resto de la pantalla.

---

## Recorrido por las 20 dimensiones solicitadas

1. **Consistencia con el backend** — Hallazgo 1 (endpoint no documentado), Hallazgo 5. El resto (tabla de transiciones, DTOs, mensajes de error, permisos) coincide exactamente con `pago-consolidado.controller.ts`/`.service.ts` — verificado campo por campo.
2. **Consistencia con el Diseño aprobado** — sin hallazgos adicionales; las 3 pantallas, las 3 rutas, el criterio de "nivel de grupo" y el patrón de resultado parcial/fallido coinciden con `DISEÑO_BLOQUE10.6...md`.
3. **Consistencia con las Decisiones Técnicas** — Hallazgos 1, 5 y 6 (los tres son desviaciones verificadas entre lo decidido y lo implementado).
4. **Estados imposibles** — Hallazgo 2 (candidatos de un beneficiario distinto al seleccionado).
5. **Errores de UX** — Hallazgo 3 (banners cruzados que no se limpian).
6. **Doble envío** — sin hallazgos: las tres acciones de escritura del detalle y la creación usan `useAsyncAction` con guard por `ref` (cubre incluso dos clics en el mismo tick), verificado en `useAsyncAction.ts:14,19-20`.
7. **Condiciones de carrera** — Hallazgo 2 (principal), Hallazgo 7 (menor).
8. **Manejo de errores** — Hallazgo 1 (el más grave: ausencia total de manejo de error para el fetch de identidad), Hallazgo 3.
9. **Reintentos** — sin hallazgos: no existe ningún mecanismo de reintento automático en ninguna de las tres pantallas (confirmado por lectura completa del código), consistente con lo decidido explícitamente en Diseño §13 y Decisiones Técnicas §11.
10. **Permisos** — sin hallazgos: las tres pantallas repiten el mismo gate `usuario?.rol !== "ADMINISTRADOR"` como primera rama de render, y los 7 endpoints del backend exigen `@Roles("ADMINISTRADOR")` + revalidación de `AccesoGrupoEconomico` en cada llamada — verificado en el controller y el service.
11. **Seguridad del cliente** — sin hallazgos: ningún dato se renderiza sin escapar (no hay `dangerouslySetInnerHTML`), ninguna decisión de autorización se toma del lado del cliente (los botones ocultos son ayuda de navegación, nunca el mecanismo real, tal como exige Decisiones Técnicas §17), y no se filtra ningún dato adicional de organizaciones sin acceso.
12. **Navegación** — sin hallazgos: las tres rutas están correctamente registradas dentro del mismo `<Route element={<Layout />}>`, la navegación tras crear y el botón "Ver" del listado funcionan según lo documentado.
13. **Sincronización de datos** — Hallazgo 1 y Hallazgo 2 son, en esencia, problemas de sincronización de datos entre fetches asíncronos no coordinados.
14. **Regresiones sobre Grupo Económico y Liquidaciones** — sin hallazgos: `git diff` confirma que `App.tsx` y `Layout.tsx` solo agregan líneas (ninguna eliminación ni modificación de rutas o entradas existentes), y ni `GrupoEconomico.tsx` ni `Liquidaciones.tsx` fueron tocados por este bloque.
15. **Código muerto** — Hallazgo 4.
16. **Código duplicado** — sin hallazgos nuevos: la duplicación de `fmtMoney`/`nombreOrganizacion` entre los tres archivos es exactamente la aceptada y justificada en Decisiones Técnicas §3.2 — no hay duplicación adicional no contemplada.
17. **Mantenibilidad** — Hallazgo 4 (código muerto) y Hallazgo 3 (tres fuentes de verdad de banner en el mismo componente) son los dos puntos de fricción encontrados; el resto del código sigue el mismo estilo ya establecido en `Liquidaciones.tsx`/`GrupoEconomico.tsx`.
18. **Accesibilidad** — sin hallazgos: todos los controles son elementos nativos (`button`, `select`, `input`, `checkbox`, `textarea`), sin ningún widget custom sin soporte de teclado — consistente con lo ya validado en el resto de la aplicación.
19. **Casos borde no cubiertos** — de los 12 casos borde listados en Diseño §13, 11 están correctamente contemplados en el código y fueron validados manualmente; el caso "la lista de candidatos queda desactualizada" está cubierto **solo parcialmente**: el diseño lo contempla como un rechazo tardío del backend al crear/preparar (que sí funciona, validado), pero no contempla el escenario más específico del Hallazgo 2 (desactualización client-side por cambio de beneficiario, antes incluso de llegar al backend).
20. **Diferencia entre comportamiento real y comportamiento documentado** — Hallazgos 1, 5 y 6 son, cada uno, una diferencia verificada y concreta entre lo documentado y lo implementado.

---

## Corrección mínima y reverificación (2026-07-22)

Autorizada por el Product Owner una corrección mínima de los hallazgos 1, 2, 3, 4 y 7 (alcance exacto: `PagoConsolidadoDetalle.tsx` y `PagoConsolidadoNuevo.tsx`, sin tocar rutas, DTOs, contratos, permisos ni backend). Los hallazgos 5 y 6 se resolvieron por la vía documental (sin cambio de código), incorporada en `DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md`, adenda §22.

**Corrección aplicada por hallazgo:**
- **Hallazgo 1:** estado explícito `cargandoIdentidad`/`errorIdentidad`; banner claro cuando la identidad no puede obtenerse; "Confirmar"/"Reintentar" deshabilitado mientras la identidad no esté resuelta (`disabled={busy || cargandoIdentidad || !identidad}`); el guard existente (`if (!grupo || !pago || !identidad) return;`) ya impedía abrir el diálogo sin el nombre del beneficiario.
- **Hallazgo 2:** `beneficiarioEnCursoRef` (ref) en `PagoConsolidadoNuevo.tsx` — descarta cualquier respuesta de `candidatos` cuyo beneficiario ya no coincida con el actualmente seleccionado.
- **Hallazgo 3:** función `limpiarBanners()` en `PagoConsolidadoDetalle.tsx`, invocada al comenzar cada una de las tres acciones de ciclo de vida, que limpia `error`/`success` de las tres instancias de `useAsyncAction` más `resultadoBanner`.
- **Hallazgo 4:** ver más abajo — la corrección original (eliminar la rama) fue revertida tras la reverificación.
- **Hallazgo 7:** estado `actualizando` + guard `if (actualizando) return;` en `recargarPago()`, más un `requestId` (`pagoRequestIdRef`) que descarta respuestas de `GET .../pagos-consolidados/:pagoId` fuera de orden.

### Dos bugs encontrados durante la reverificación (no parte de los 7 hallazgos originales)

La reverificación en navegador real (backend NestJS + Postgres local, sin mocks de aplicación) detectó dos bugs propios de la primera versión de la corrección, ninguno de los cuales había sido anticipado por la sola lectura de código:

1. **El Hallazgo 4 no era código muerto.** Al eliminar la rama `if (!pago) return ...;` (calificada como inalcanzable en la sección "Hallazgo 4" de arriba), la pantalla se rompió con un `TypeError: Cannot read properties of null (reading 'estado')` real, reproducido y capturado en la consola del navegador. Causa real: una condición de carrera entre los dos primeros `useEffect` del componente — el primero hace `setGrupo()` + `setCargando(false)` en el mismo ciclo, produciendo un render intermedio con `cargando=false`, `grupo` presente y `pago` todavía `null`, antes de que el segundo `useEffect` (dependiente de `grupo`) alcance a volver a poner `cargando=true`. **Se revirtió la eliminación** y se restauró la guarda (con el texto "Cargando...", más preciso que el original "Pago consolidado no encontrado.", dado que se confirmó que el caso real es una carga transitoria, no un 404). El Hallazgo 4 de esta auditoría queda, en consecuencia, **retractado como error de análisis estático** — el análisis por lectura de código no detectó esta condición de carrera, que solo se hizo evidente al ejecutar el cambio contra un navegador real.
2. **"Actualizar" no reintentaba la identidad.** La primera versión de la corrección del Hallazgo 1 dejaba la carga de la identidad exclusivamente en un `useEffect` con dependencia `[grupo, pago?.identidadChoferGrupoId]` — valor que no cambia entre recargas del mismo pago, así que "Actualizar" refrescaba el pago pero nunca reintentaba la identidad, dejando el banner de error y el botón deshabilitado indefinidamente aunque la causa original ya se hubiera resuelto. **Corregido** extrayendo `cargarIdentidad(pagoActual: Pago)` como función reutilizable, invocada tanto por el `useEffect` como por `recargarPago()`, cada una con su propio guard de solicitud fuera de orden (`identidadRequestIdRef`).

### Resultado de la reverificación

Repetidas, contra backend real y navegador real, las seis pruebas afectadas: (1) fallo del endpoint de identidad → banner visible, `Confirmar.disabled === true` (verificado programáticamente); (2) recuperación vía "Actualizar" tras destrabar el fallo → banner desaparece, nombre resuelto, `disabled === false`; (3) cambio rápido de beneficiario A→B con la respuesta de A resolviendo después → la tabla muestra únicamente los candidatos de B; (4) cuatro clics rápidos sobre "Actualizar" → una sola solicitud real despachada (`requestLog.length === 1`), botón deshabilitado durante la operación, estado final correcto; (5) Preparar→Cancelar reales sobre un pago de prueba → el banner de Preparar desaparece por completo al mostrarse el resultado de Cancelar, sin mensajes contradictorios; (6) diferenciación visual de CONFIRMADO/PARCIAL/FALLIDO → verificada por inspección de código (la corrección no tocó esa lógica) y por verificación visual de un pago ya `CONFIRMADO` existente. `npm run build` limpio en cada etapa. Sin errores nuevos en consola del navegador tras las correcciones finales.

**Sin cambios de backend en ningún momento** de la corrección ni de la reverificación — confirmado por `git diff`.

---

## Conclusión

La implementación es, en su enorme mayoría, fiel al Diseño y a las Decisiones Técnicas aprobadas, y la Validación Funcional documentó correctamente el comportamiento observable en el camino feliz y en los escenarios que se ejecutaron manualmente. Esta auditoría adversarial, centrada en lectura de código en vez de ejecución, encontró un hallazgo de severidad real (Hallazgo 1) que la validación manual no podía detectar porque depende de una ventana de tiempo y de un fallo de red que no se dieron durante las pruebas — y una condición de carrera (Hallazgo 2) del mismo tipo. Los hallazgos 3, 5, 6 y 7 fueron de severidad baja o informativa. El Hallazgo 4 (código muerto), sin embargo, resultó ser **un falso positivo de este mismo análisis adversarial**: la lectura estática de código concluyó que una rama era inalcanzable, y solo la reverificación en navegador real reveló una condición de carrera genuina que la hacía necesaria — su eliminación rompía la pantalla. Este episodio, junto con el segundo bug encontrado en la reverificación ("Actualizar" no reintentaba la identidad), confirma el valor del ciclo auditoría→corrección→reverificación empírica por sobre el análisis de código en solitario: ambos bugs fueron introducidos por la propia corrección de esta auditoría, y ambos fueron detectados y corregidos antes de cualquier commit. Tras la corrección y la reverificación, no queda ningún hallazgo crítico ni medio pendiente; los hallazgos 5 y 6 quedan resueltos por la vía documental, sin requerir cambio de código.

**Cierre técnico completado — ver `ACTA_CIERRE_BLOQUE10.6.md`. Pendiente de integración (commit y push) — a la espera de aprobación final.**

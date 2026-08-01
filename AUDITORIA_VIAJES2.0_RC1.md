# VIAJES 2.0 — RELEASE CANDIDATE 1
## Auditoría integral del módulo

**Tipo:** Auditoría de cierre. Sin implementación, sin commits, sin push.

**Alcance:** el módulo Viajes completo después de los bloques ya publicados y desplegados: Núcleo (hardening, historial, edición), L1 (listado optimizado), L2 (búsqueda), L3 (persistencia del contexto), L4.1 (avanzar estado desde el listado), L4.2 (cancelar desde el listado, Decisión A sobre `DESCARGADO`). No se analiza L4.3 (Editar desde el listado, no iniciado) ni Liquidaciones/Facturas/Anticipos como módulos propios — se los cita puntualmente solo donde intersectan con reglas ya vigentes de Viaje (igual que en bloques anteriores).

**Método:** relectura completa y fresca de todos los archivos del módulo (`viajes.controller.ts` y sus 4 DTOs, `Viajes.tsx`, `ViajeDetalle.tsx`, `ViajeForm.tsx`, rutas y guards involucrados), contrastada con builds/tests corridos de nuevo en este bloque, más un intento empírico real de reproducir el hallazgo de concurrencia más relevante (detallado en §6).

---

## Resumen ejecutivo

Viajes 2.0 está **funcionalmente completo y estable** en todo lo que se auditó: los 6 bloques publicados (Núcleo, L1-L3, L4.1-L4.2) están consistentes entre sí, el backend es la autoridad real de seguridad en el 100% de los casos probados, y no se encontró ningún defecto que corrompa datos, bloquee un flujo de trabajo o exponga una brecha de seguridad real. Los hallazgos de esta auditoría son de tres tipos: (a) un defecto de visualización de fechas ya sospechado y ahora diagnosticado con causa raíz exacta, (b) una brecha estructural de concurrencia en el backend que **no se logró reproducir empíricamente** pese a un intento real, y (c) deuda de UX/código acumulada por la velocidad de los últimos 6 bloques, ninguna de gravedad alta. **Recomendación: A — cerrar como RC1**, con una lista corta de bloques de mejora recomendados (no bloqueantes) para después del cierre.

---

## 1. Consistencia funcional de punta a punta

Recorrido completo verificado por lectura de código (crear → listar → buscar/filtrar → Detalle → editar → avanzar → cancelar → volver → historial):

- **Crear** (`ViajeForm.tsx`, modo creación) → `POST /viajes` → transaccional (`create()` + primera fila de `HistorialEstadoViaje` en el mismo `$transaction`, Núcleo Tarea 1). Sin inconsistencias.
- **Listar** (`Viajes.tsx.cargar()`) → `GET /viajes` con `selectViajeListado` (L1). Los 5 filtros de la UI (`q`, `desde`, `hasta`, `clienteId`, `estado`) coinciden exactamente con lo que `findAll()` acepta y usa.
- **Buscar/filtrar** — sin cambios desde L2, `q` sigue combinándose con `AND` respecto a los demás filtros, sin N+1 (ver §7).
- **Detalle** (`GET /viajes/:id` → `findOne()`) — sigue usando `includeViaje` completo + `historial`/`anticipos`/`liquidacionesViaje`/`facturasViaje`, sin cambios.
- **Editar** (`PATCH /viajes/:id` → `update()`) — reglas de bloqueo por `CANCELADO`/facturado/liquidado intactas.
- **Avanzar estado** — mismo endpoint (`POST /viajes/:id/estado`) invocado desde dos lugares (`ViajeDetalle.tsx` y `Viajes.tsx.FilaViaje`), mismo texto de botón (`Avanzar a {estado}`), mismo cálculo de "siguiente" (`ORDEN_ESTADOS`, con el mismo guard `idx >= 0` en ambos archivos desde el bug corregido en L4.1).
- **Cancelar** — mismo endpoint, **mismo modal reutilizado byte a byte** (título, mensaje, `requireMotivo`, texto de confirmación idénticos en `ViajeDetalle.tsx` y `Viajes.tsx`), condición de visibilidad ahora idéntica en ambos (`estado !== "CANCELADO"`, tras el Paso 1 de L4.2).
- **Volver al listado** — ya validado end-to-end en L3, incluyendo el ciclo Detalle→Editar→Guardar→Detalle→Volver.
- **Historial** — solo se escribe en `create()` y `aplicarCambioEstado()`; solo se lee/muestra en `ViajeDetalle.tsx`. Sin contradicciones.

**Hallazgo real de consistencia (no bloqueante):** `ViajeDetalle.tsx.avanzarEstado()`/`cancelarViaje()` usan un guard manual `useState(busy)` + `try/catch/finally`, **no** `useAsyncAction` — el único lugar del módulo que todavía usa el patrón anterior al Hardening. `ViajeForm.tsx` y `Viajes.tsx` (L4.1/L4.2) sí usan `useAsyncAction` con su guard por `ref`. Ver desarrollo completo en §6 (tiene una implicancia real de concurrencia, no es solo un tema de estilo).

---

## 2. Matriz definitiva: estado / acciones / roles

`OPERACIONES`/`ADMINISTRADOR` son los únicos roles que el backend permite ejecutar escrituras (`@Roles` idéntico en `create`/`update`/`cambiarEstado`/`cancelar`). Cualquier otro rol autenticado (`GERENCIA`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`) solo puede leer, en cualquier estado.

| Estado | Avanzar (backend) | Avanzar (visible listado/Detalle) | Cancelar (backend) | Cancelar (visible listado/Detalle) | Editar (backend) | Editar (visible) |
|---|---|---|---|---|---|---|
| `PENDIENTE` | Sí → `ASIGNADO` | Sí / Sí | Sí (con motivo) | Sí / Sí | Todos los campos | Sí / Sí |
| `ASIGNADO` | Sí → `EN_CARGA` | Sí / Sí | Sí | Sí / Sí | Todos los campos | Sí / Sí |
| `EN_CARGA` | Sí → `CARGADO` | Sí / Sí | Sí | Sí / Sí | Todos los campos | Sí / Sí |
| `CARGADO` | Sí → `EN_TRANSITO` | Sí / Sí | Sí | Sí / Sí | Todos los campos | Sí / Sí |
| `EN_TRANSITO` | Sí → `DESCARGADO` | Sí / Sí | Sí | Sí / Sí | Todos los campos | Sí / Sí |
| `DESCARGADO` | No (terminal) | No / No (correcto, sin siguiente) | Sí, si no facturado ni liquidado | **Sí / Sí** (visible siempre; el backend decide al confirmar — ver nota) | Todos, salvo bloqueo por facturación/liquidación | Sí / Sí |
| `CANCELADO` | No | No / No | No (ya cancelado) | No / No | Solo `observaciones`/`productorId` | Sí / Sí (campos limitados) |

**Nota sobre `DESCARGADO` + Cancelar:** ni el listado ni el Detalle conocen de antemano si un `DESCARGADO` puntual ya está facturado/liquidado (`selectViajeListado` de L1 no trae esos dos campos; `ViajeDetalle.tsx` sí los tiene cargados y los muestra, pero no los usa para ocultar el botón). En ambos casos, el botón/menú se muestra siempre y el backend responde con el mensaje explicativo correspondiente si corresponde bloquear — comportamiento **idéntico** entre listado y Detalle (ya no hay contradicción entre ambos; antes de L4.2 sí la había, ver Núcleo R- y L4.2).

**Contradicciones detectadas entre listado / Detalle / backend:** ninguna. La única que existía (Cancelar oculto en `DESCARGADO` solo en el frontend) fue cerrada por la Decisión A de L4.2.

---

## 3. Permisos

**Backend — consistente al 100%:** `@Roles("OPERACIONES", "ADMINISTRADOR")` idéntico en los cuatro métodos de escritura; lectura (`findAll`/`findOne`/`pendientesFacturar`) sin `@Roles`, abierta a cualquier rol autenticado. Confirmado sin cambios en los 6 bloques.

**Frontend — ahora parcialmente gateado, lo cual es una brecha nueva de consistencia (no de seguridad):**

| Punto de entrada | Gateado por rol en frontend? |
|---|---|
| Botón "Avanzar a X" (listado) | **Sí** (`puedeGestionarViajes`, L4.1) |
| Menú "Cancelar" (listado) | **Sí** (`puedeGestionarViajes`, L4.2) |
| Botón "Avanzar a X" (Detalle) | No |
| Botón "Cancelar viaje" (Detalle) | No |
| Link "Editar viaje" (Detalle) | No |
| Link "+ Nuevo viaje" (listado) | No |
| Rutas `/viajes`, `/viajes/nuevo`, `/viajes/:id`, `/viajes/:id/editar` | No (`roles: null` en `Layout.tsx`, sin `ProtectedRoute`) |

**Distinción explícita pedida:** esto es **brecha únicamente de UX, no de seguridad** — en los 5 puntos sin gating, un rol no autorizado (p. ej. `LECTURA`) puede llegar hasta el clic final o el submit del formulario y recién ahí el backend lo rechaza (`403 Forbidden resource`, confirmado empíricamente en L4.1/L4.2 con un usuario `LECTURA` real). El backend nunca fue, en ningún caso, la parte débil.

**Matiz nuevo que vale la pena nombrar:** antes de L4.1, la falta de gating era uniforme (nada estaba oculto en ningún lado — inconsistente pero *parejo*). Ahora hay dos botones gateados (Avanzar/Cancelar del listado) y cinco puntos que no lo están — un usuario sin permiso podría notar la inconsistencia ("¿por qué desaparece Avanzar en el listado pero Editar sigue ahí?"). No es un problema de seguridad; es una razón concreta para completar el mismo criterio en L4.3 (Editar) y en los puntos de entrada restantes, si se prioriza.

---

## 4. Consistencia visual y UX

- **Textos de botones:** consistentes (`Avanzar a {estado}`, `Cancelar viaje`, `Editar viaje`) entre listado y Detalle.
- **Modal de cancelación:** una única instancia reutilizada, sin duplicación ni variantes de texto.
- **Badges:** misma clase `badge {estado}` en ambas pantallas, mismo CSS.
- **Estados busy — inconsistencia real y menor:** el listado cambia el texto del botón (`"Avanzando..."`, `"Cancelando..."`) mientras la acción está en curso; `ViajeDetalle.tsx` solo deshabilita el botón (`disabled={busy}`, sin cambio de texto) — el usuario en Detalle solo ve el atenuado por CSS (`.btn:disabled { opacity: 0.5 }`), sin confirmación textual de "se está procesando". No afecta la corrección (el guard funciona igual), es puramente de claridad.
- **Feedback de éxito al cancelar:** `ViajeDetalle.tsx` muestra un `success-banner` explícito ("Viaje N° X cancelado."); el listado no muestra ningún mensaje de éxito, solo el cambio de badge. Esto fue una decisión de diseño deliberada de L4.1/L4.2 (evitar ruido en una tabla densa), no un descuido — se documenta acá para que quede como decisión consciente, no como hallazgo nuevo.
- **Columnas y "sin resultados":** 11 columnas de cabecera, `colSpan={11}` en la fila de "sin resultados" — coinciden exactamente, sin desfase.
- **Navegación y regreso:** sin hallazgos nuevos, ya validado extensamente en L3.
- **Acciones duplicadas:** ninguna detectada.
- **CSS del error por fila:** el `error-banner` del listado usa overrides inline (`style={{marginTop, fontSize, padding}}`) sobre la misma clase que se usa a tamaño completo en el resto de la app — funciona, pero es una señal de que falta una variante propia de la clase (`.error-banner.compact` o similar) en vez de overrides inline repetidos. Ver §8.

---

## 5. Fechas y formatos — causa raíz y solución propuesta (sin implementar)

**Diagnóstico confirmado con evidencia ya reunida en L3** (`Viaje.fecha` real: `"2026-07-30T00:00:00.000Z"`, huso local de prueba `UTC-3`):

| Lugar | Código | Resultado para el ejemplo |
|---|---|---|
| `ViajeDetalle.tsx` | `new Date(viaje.fecha).toLocaleDateString()` | `29/7/2026` (**un día antes**) |
| `Viajes.tsx` (listado) | `new Date(v.fecha).toLocaleDateString()` | `29/7/2026` (**un día antes**, mismo problema) |
| `ViajeForm.tsx` (edición) | `data.fecha.slice(0, 10)` | `2026-07-30` (correcto) |

**Causa raíz exacta:** `Viaje.fecha` se almacena como un `DateTime` de Postgres en UTC-medianoche (`new Date("2026-07-30")` interpreta el string como UTC), pero **semánticamente es una fecha pura** (el día en que ocurrió el viaje), no un instante con hora real. `.toLocaleDateString()` es una conversión **consciente del huso horario** — correcta para timestamps reales (como `HistorialEstadoViaje.fecha`, que sí representa un instante real y por eso su uso de `.toLocaleString()` en la tabla de historial está bien como está), pero **incorrecta** para un valor que es, en la práctica, solo una fecha: para cualquier usuario en un huso detrás de UTC (como Argentina), la medianoche UTC se convierte al día anterior en hora local, y `toLocaleDateString()` extrae la fecha ya desplazada. `.slice(0, 10)` no hace ninguna conversión de huso — por eso, casualmente, es el único de los tres que muestra la fecha correcta.

**Conclusión:** `ViajeDetalle.tsx` y `Viajes.tsx` son los que muestran la fecha **incorrecta** (un día antes de lo real); `ViajeForm.tsx` ya la muestra bien.

**Solución propuesta (presentación pura, sin tocar persistencia ni reglas de negocio):** reemplazar `new Date(viaje.fecha).toLocaleDateString()` por una función local, sin conversión de huso, del mismo estilo que ya usa `fmtMoney`:

```ts
function fmtFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
```

A aplicar en `ViajeDetalle.tsx` y `Viajes.tsx` únicamente donde se muestra `viaje.fecha` (no tocar `historial.fecha` ni `anticipos[].fecha` de la tabla de historial/anticipos, que sí son timestamps reales y están bien como están). **No implementado en este bloque**, según lo pedido.

**Observación fuera de alcance, sin acción:** `AnticipoGasto.fecha` probablemente tiene la misma naturaleza semántica ("fecha del gasto", no un instante) y podría tener el mismo problema — se deja anotado para cuando se audite el módulo de Anticipos, no es un hallazgo de Viajes propiamente.

---

## 6. Integridad y concurrencia

**Doble submit (crear/editar):** guard por `ref` de `useAsyncAction` en `ViajeForm.tsx` — confirmado sin cambios, funcionando (validado originalmente en Hardening).

**Transacciones:** `create()` y `aplicarCambioEstado()` (usado tanto por avanzar como por cancelar) son transaccionales — confirmado, sin regresión en ningún bloque posterior.

**Historial:** solo se escribe junto con su transacción correspondiente — íntegro en el camino feliz.

**Doble clic (listado):** revalidado en L4.1/L4.2 con evidencia de red — una sola request por acción, en ambos casos.

**Datos desactualizados:** revalidado en L4.1/L4.2 — el backend siempre re-lee el estado real antes de validar, nunca confía en lo que el frontend cree; el frontend muestra el mensaje real sin caerse.

**Errores de red y reintentos:** revalidado en L4.1/L4.2 — mensaje de fallback, reintento exitoso tras recuperar el backend.

### Hallazgo nuevo, más profundo: falta de guardia condicional en `aplicarCambioEstado()`

`aplicarCambioEstado()` (`viajes.controller.ts`) hace:
```ts
const actualizado = await tx.viaje.update({ where: { id: viaje.id }, data: { estado: nuevo } });
```
Sin condicionar el `where` al estado esperado (p. ej. `where: { id: viaje.id, estado: viaje.estado }`). Esto es **distinto** del patrón que el propio proyecto ya usa correctamente en otros lugares (`facturas.controller.ts`/`liquidaciones.controller.ts` usan `updateMany` con un `where` que incluye el estado esperado, y verifican `count === 0` para detectar que "alguien más ya lo cambió"). Acá no se replicó ese patrón.

**Riesgo teórico:** si dos requests concurrentes leen el mismo `viaje.estado` antes de que ninguna termine, ambas pueden pasar la validación y ambas ejecutar `aplicarCambioEstado()` — el estado final converge (última escritura gana, con el mismo valor), pero **podrían quedar dos filas de historial** para una sola transición lógica.

**Intento empírico de reproducirlo (este bloque):** se creó un Viaje descartable localmente y se dispararon dos `POST /viajes/:id/estado` casi simultáneas (mismo instante, dos procesos `curl` en paralelo) contra el mismo Viaje. **Resultado real:** la primera petición completó su transacción antes de que la segunda leyera el estado; la segunda fue rechazada correctamente con `400` ("No se puede pasar de ASIGNADO a ASIGNADO directamente"). Historial final: exactamente 2 filas (creación + 1 avance), sin duplicados. **El intento no logró reproducir el problema** — la ventana de carrera es más angosta de lo que dos `curl` lanzados desde `bash` pueden forzar de forma confiable.

**Conclusión honesta:** el hallazgo es real a nivel de código (la guardia condicional falta, y el patrón correcto ya existe en el propio proyecto para copiarlo), pero **no se confirmó como un bug reproducible en la práctica** con un intento real — dato relevante para no sobrestimar la urgencia. Clasificado como **Importante, no bloqueante** (§10).

**Hallazgo relacionado:** `ViajeDetalle.tsx` no usa `useAsyncAction` para sus dos acciones mutantes (ver §1) — su guard es por `useState`, no por `ref`, lo que en teoría deja una ventana de doble-clic más amplia que en el listado (aunque, igual que arriba, no se intentó forzar específicamente este caso por UI en este bloque).

**Riesgos aceptados, explícitos:**
- Ausencia de idempotencia completa (sin idempotency-keys) frente a reintentos de red ambiguos (timeout donde el servidor sí procesó) — riesgo genérico de toda la API, no específico de Viajes, ya aceptado implícitamente en todo el proyecto.
- La guardia condicional faltante en `aplicarCambioEstado()` — riesgo real pero de baja probabilidad empírica, aceptado para RC1.

---

## 7. Performance

- **L1 (select reducido):** confirmado sin cambios — `selectViajeListado` sigue siendo lo único que usa `findAll()`.
- **Sobre-fetching:** no reapareció en el listado en sí. **Hallazgo nuevo y menor:** cada clic de "Avanzar"/"Cancelar" en el listado recibe de vuelta la respuesta completa de `aplicarCambioEstado()` (`include: includeViaje`, 9 relaciones) aunque el frontend solo lee `data.estado` (`onEstadoActualizado(viaje.id, data.estado)`) y descarta el resto. Es sobre-fetching real, pero de bajo impacto (una respuesta por clic, no por carga de página) — clasificado como deuda aceptable, no urgente.
- **Búsqueda/filtros:** `q` se sigue resolviendo dentro de la misma consulta (`OR` en el mismo `where`), sin N+1, sin cambios desde L2.
- **Paginación:** riesgo estructural sin cambios (documentado desde L1) — no implementado en este bloque, según lo pedido.
- **Hallazgo adicional de performance en el listado:** `FilaViaje` no está envuelto en `React.memo` — cada vez que se actualiza el estado de una fila (`actualizarEstadoFila`), `Viajes.tsx` re-renderiza el array completo y **todas** las filas vuelven a ejecutar su función de render, aunque solo una haya cambiado. Imperceptible al volumen de datos actual; deuda a considerar si el listado crece mucho antes de resolver paginación.

---

## 8. Código y mantenibilidad

- **`ORDEN_ESTADOS` duplicado — ahora en 3 lugares** (`viajes.controller.ts`, `ViajeDetalle.tsx`, `Viajes.tsx`), más una 4ª lista parcialmente distinta (el filtro de Estado en `Viajes.tsx`, que sí incluye `CANCELADO`). Ya era un hallazgo del núcleo (R-6); L4.1 lo replicó una vez más en vez de reducirlo.
- **`fmtMoney` duplicado** en `Viajes.tsx`/`ViajeDetalle.tsx` (idéntico, no nuevo de este ciclo).
- **`FilaViaje` como candidato claro de extracción:** vive embebido dentro de `Viajes.tsx` (que ya suma 273 líneas) y ya tiene complejidad real propia (dos acciones async, menú contextual, lógica de permisos, un efecto de click-afuera) — está en el punto justo para pasar a su propio archivo.
- **Menú de tres puntos con estilos inline:** sin clase CSS reutilizable en `styles.css` — si se agrega Editar al mismo menú (L4.3), es candidato a copiarse de nuevo. No urgente con un solo consumidor.
- **`error-banner` con overrides inline** para el contexto de fila (ver §4) — mismo criterio, candidato a una variante CSS propia si se repite en más lugares.
- **`ViajeDetalle.tsx` usando el patrón manual pre-Hardening** (ver §1/§6) en vez de `useAsyncAction` — es tanto una inconsistencia de mantenibilidad (dos formas de hacer lo mismo en el mismo módulo) como un gap funcional real.
- **Comentarios:** se revisaron todos los bloques de comentario del módulo — ninguno resultó obsoleto o contradictorio con el código actual; la disciplina de documentar el "por qué" se mantuvo consistente a lo largo de los 6 bloques.

---

## 9. Validación funcional local — qué se confirmó y qué no

**Confirmado en este bloque, de nuevo, con evidencia fresca:**
- `npm run build` (backend) y `npm run test` → 11/11 suites, 82/82 tests, verde.
- `npm run build` (frontend) → verde, sin errores de TypeScript.
- Intento real de condición de carrera sobre `POST /viajes/:id/estado` (ver §6) — ejecutado localmente contra un Viaje descartable, creado y cancelado dentro del mismo bloque, sin tocar producción.

**Confirmado por evidencia ya reunida en los bloques inmediatamente anteriores de esta misma sesión** (L1 a L4.2, todos con validación real en navegador contra el entorno local, org "Estado Operativo Test SA", nunca producción, y desplegados con éxito confirmado en cada caso): creación, listado, búsqueda, filtros, persistencia de contexto, edición completa, avanzar estado (transición válida/inválida/datos desactualizados/doble clic/error de red), cancelar (los mismos casos, más `DESCARGADO` facturado/liquidado probados contra los endpoints reales de Facturas/Liquidaciones), permisos (`LECTURA` real, con sesión inyectada, contra UI y API). No se repitió esta batería completa en este bloque por ser auditoría, no implementación, y porque el código no cambió desde la última corrida — se cita como evidencia vigente, no como algo nuevo.

**No se pudo comprobar en este bloque:**
- Una condición de carrera real y reproducible sobre `aplicarCambioEstado()` — el intento no la forzó (ver §6, reportado como resultado real, no omitido).
- El defecto de fechas no se volvió a capturar visualmente en este bloque (ya estaba confirmado con evidencia concreta desde L3, ver §5) — no se reprodujo de nuevo porque hacerlo no aportaría información nueva sobre una causa raíz ya establecida con datos reales.

**Bug reproducible encontrado en este bloque:** ninguno nuevo. Los dos hallazgos más relevantes (fechas, concurrencia) ya estaban identificados o fueron analizados con evidencia de código; ninguno constituye una falla de funcionamiento nueva descubierta ahora.

---

## 10. Hallazgos priorizados

| # | Hallazgo | Evidencia | Clasificación |
|---|---|---|---|
| H-1 | `ViajeDetalle.tsx`/`Viajes.tsx` muestran `viaje.fecha` con un día de desfase por conversión de huso horario innecesaria | §5, datos reales capturados en L3 | **Importante, no bloqueante** |
| H-2 | `aplicarCambioEstado()` sin guardia condicional (`where` sin `estado` esperado) — riesgo de historial duplicado bajo concurrencia real | §6, análisis de código + intento empírico sin reproducir | **Importante, no bloqueante** |
| H-3 | `ViajeDetalle.tsx` usa guard manual (`useState`) en vez de `useAsyncAction` para Avanzar/Cancelar | §1/§6 | **Importante, no bloqueante** |
| H-4 | Gating de permisos parcial en frontend: solo Avanzar/Cancelar del listado están ocultos por rol; Editar, Nuevo viaje, y las mismas acciones en Detalle no lo están | §3 | **Importante, no bloqueante** (brecha de UX, no de seguridad) |
| H-5 | `ViajeForm.tsx` (edición) no anticipa qué campos bloqueará el backend por facturación/liquidación — el usuario se entera recién al enviar todo el formulario | §1 | **Importante, no bloqueante** |
| H-6 | `ORDEN_ESTADOS` duplicado en 3-4 lugares, sin fuente única de verdad | §8 | **Deuda aceptable** |
| H-7 | Sobre-fetching menor: cada Avanzar/Cancelar del listado recibe el Viaje completo (9 relaciones) para leer un solo campo | §7 | **Deuda aceptable** |
| H-8 | `FilaViaje` embebido en `Viajes.tsx`, listo para extraerse a su propio archivo | §8 | **Mejora futura** |
| H-9 | `FilaViaje` sin `React.memo` — re-render de todas las filas ante cualquier cambio de una sola | §7 | **Mejora futura** |
| H-10 | Estilos inline repetidos (menú ⋮, error-banner compacto) sin clase CSS reutilizable | §4/§8 | **Mejora futura** |
| H-11 | Falta de paginación en `GET /viajes` (riesgo estructural ya conocido, sin cambios) | §7 | **Deuda aceptable** (fuera de alcance de este cierre) |

**Ningún hallazgo se clasificó como Bloqueante.**

---

## 11. Recomendación final

### Decisión: **A) Viajes 2.0 está listo para cerrar como RC1.**

Justificación: los 6 bloques publicados son consistentes entre sí y con el backend; no hay ninguna falla que corrompa datos, bloquee un flujo operativo real, o exponga una brecha de seguridad (el backend fue, en cada caso probado, la barrera real y correcta). Los 11 hallazgos son reales pero acotados — UX, robustez de concurrencia de baja probabilidad empírica, y deuda de código — ninguno impide operar el módulo con confianza hoy.

### Siguiente bloque recomendado (no bloqueante para el cierre, orden de prioridad):

1. **Corrección de fechas (H-1)** — el más simple de los tres (una función de formateo, sin tocar backend ni persistencia), con el mayor impacto de percepción para el usuario final (una fecha mal mostrada es fácil de notar y genera desconfianza).
2. **Guardia condicional en `aplicarCambioEstado()` + migrar `ViajeDetalle.tsx` a `useAsyncAction`** (H-2 + H-3) — cierran juntos el mismo eje de robustez (concurrencia/doble-clic), reutilizando exactamente el patrón `updateMany` + `count === 0` que el propio proyecto ya usa en Facturas/Liquidaciones.
3. **L4.3 — Editar desde el listado + completar el gating de permisos** (H-4 + el trabajo ya diseñado y pendiente de L4.3) — cierra la inconsistencia de UX de permisos de una sola vez, extendiendo `puedeGestionarViajes` a los puntos que todavía no lo usan.

**Fin de la auditoría RC1. Sin cambios de código. Sin commits. Sin push. Quedo a la espera de tu aprobación antes de iniciar cualquier bloque correctivo o L4.3.**

---

## 12. Cierre RC1 y bloque correctivo RC1.1 (adenda)

**RC1 queda formalmente cerrado** con la Decisión A de §11: Viajes 2.0 (Núcleo, L1-L3, L4.1, L4.2) se considera funcionalmente completo y estable para uso en producción.

**RC1.1 — Normalización de fechas (H-1): implementado y cerrado.** Se creó `frontend/src/utils/fecha.ts` con `fmtFechaCalendario(iso)` — misma lógica ya propuesta en §5 (`slice(0, 10)` + split, sin conversión de huso horario) — y se aplicó en `ViajeDetalle.tsx` y `Viajes.tsx` en el único punto de cada archivo donde se muestra `viaje.fecha`. `historial.fecha` (`ViajeDetalle.tsx`, timestamp real) y `anticipos[].fecha` (ídem) quedaron sin tocar, según lo acotado en §5. Validado con fechas de hoy, cambio de mes y cambio de año, en Listado/Detalle/Edición/creación/edición-sin-cambiar-fecha/refresh, sin desfase de un día en ningún caso. Builds y suite de tests backend (11/11 suites, 82/82 tests) y build frontend, verdes.

**Deuda remanente sin cambios, para bloques futuros según el orden de prioridad de §11:** H-2 (guardia condicional en `aplicarCambioEstado()`), H-3 (`ViajeDetalle.tsx` sin migrar a `useAsyncAction`), H-4 (gating de permisos parcial), H-5 a H-11 (deuda aceptable / mejora futura, sin cambios respecto a lo descripto en §10).

---

## 13. RC1.2 — Hardening de concurrencia y migración a useAsyncAction (adenda)

**H-2 (guardia condicional en `aplicarCambioEstado()`): cerrado.** El `where` de la escritura de `tx.viaje.update()` no condicionaba contra el estado esperado; se reemplazó por `tx.viaje.updateMany({ where: { id, estado: viaje.estado }, ... })` + `count === 0` — mismo patrón ya usado en `facturas.controller.ts`/`liquidaciones.controller.ts`. Si el estado real ya cambió por otra operación concurrente, la escritura no matchea ninguna fila, se aborta con un mensaje explícito ("El viaje fue modificado por otra operación en curso...") y la transacción se revierte completa — no queda historial huérfano.

**Validación empírica de la carrera:** con requests concurrentes reales (`curl --parallel` y bursts de hasta 8 requests en paralelo vía bash) sobre la misma transición, la carrera **no fue reproducible** de forma natural — el mismo resultado que ya se había documentado en §6 (Postgres/Node serializan lo suficientemente rápido en el entorno local como para que la segunda lectura ya vea el estado actualizado). Para probar el guard mismo bajo una ventana de carrera real, se introdujo una demora artificial temporal y local (nunca commiteada, revertida antes del build/test final) entre la lectura del estado y la escritura en `cambiarEstado()`. Con la ventana ampliada, 4 requests simultáneas contra el mismo Viaje (`PENDIENTE → ASIGNADO`) dieron: 1 éxito (201) y 3 rechazos con el mensaje nuevo del guard — confirmado también en un segundo caso, con `EN_CARGA → CARGADO` racing con `curl --parallel`: 1 éxito, 3 hits del guard. En ambos casos, el historial del Viaje quedó con exactamente las filas correctas (sin duplicados) tras la carrera. **Conclusión: la carrera teórica de H-2 existía, no era reproducible con dos requests sueltas en el entorno local, y queda mitigada por el guard** — validado directamente contra el mecanismo, no solo por inspección de código.

**H-3 (`ViajeDetalle.tsx` sin `useAsyncAction`): cerrado.** Se reemplazaron los `useState(busy)`/`useState(error)`/`useState(success)` manuales por dos instancias independientes de `useAsyncAction` (`accionAvanzar`, `accionCancelar`) — mismo patrón ya usado en `FilaViaje` (`Viajes.tsx`, L4.1/L4.2). Para preservar exactamente el comportamiento previo (un único `busy` cubría ambos botones; cada acción limpiaba el error de la otra al iniciar), se combinan ambos `busy`/`error` en el render y cada handler limpia explícitamente el `error` de la acción hermana al arrancar. El mensaje de "Viaje creado" (llega por `location.state`) se siembra en `accionCancelar.success` en un efecto de montaje, heredando gratis la misma semántica de limpieza que tenía antes. Ningún mensaje, texto de botón, ni flujo visible cambió.

**Validación funcional de ViajeDetalle tras la migración:** avanzar estado (transición exitosa, historial actualizado); cancelar con motivo obligatorio (modal, éxito, mensaje "Viaje N° X cancelado.", historial con motivo); declinar el modal de cancelación (ningún request se dispara, estado intacto); doble/triple clic rápido sobre "Avanzar" (confirmado por log de red: exactamente 1 `POST /estado` pese a 3 clics — el guard por `ref` de `useAsyncAction` es estrictamente más fuerte que el `useState` anterior); refresh tras cancelar (estado `CANCELADO` persiste, banner de éxito correctamente no reaparece); navegación a "Editar viaje" (formulario carga precargado, sin cambios — `ViajeForm.tsx` no fue tocado en este bloque).

**Regresión de L1-L4.2/RC1.1:** ninguno de esos archivos fue modificado en RC1.2 (`Viajes.tsx` no cambió). Verificado por lectura del listado real contra el backend actualizado: fechas, estados, montos y acciones (`Avanzar`/`⋮`/`Cancelar`) se muestran correctamente para los Viajes de prueba, coincidiendo con el estado real devuelto por la API — incluida una fila `CANCELADO` que correctamente no muestra ninguna acción. El endpoint `POST /viajes/:id/estado` que usa el listado es el mismo que ya se validó extensivamente en esta sesión (ViajeDetalle + `curl` directo), por lo que no se repitió la batería completa de clics en el listado.

**Builds y tests:** backend 11/11 suites, 82/82 tests verde (sin cambios en la cantidad respecto a RC1/RC1.1); frontend build verde, 120 módulos.

**Deuda remanente sin cambios:** H-4 (gating de permisos parcial), H-5 a H-11 (deuda aceptable / mejora futura).

---

## 14. RC1.3 — Alinear ViajeForm con las reglas de facturación y liquidación (adenda)

**H-5 (`ViajeForm.tsx` no anticipa bloqueos del backend): cerrado.**

**Auditoría previa (sin encontrar inconsistencias en el backend):** `update()` en `viajes.controller.ts` usa tres listas — `CAMPOS_SIEMPRE_EDITABLES` (`observaciones`, `productorId`, nunca bloqueados), `CAMPOS_BLOQUEADOS_FACTURACION` y `CAMPOS_BLOQUEADOS_LIQUIDACION` — asimétricas a propósito: un Viaje facturado-pero-no-liquidado permite seguir cambiando `choferId`/`camionId`/`acopladoId` (la factura es un documento comercial, no le importa quién manejó); uno liquidado-pero-no-facturado permite seguir cambiando `cartaPorte`/`ctg`/`clienteId`. `CANCELADO` bloquea todo excepto `observaciones`/`productorId`, evaluado antes e independientemente de facturación/liquidación. El bloqueo aplica solo sobre campos efectivamente modificados (mismo valor no dispara error). Reglas confirmadas correctas y consistentes — **no se tocó el backend**.

**Solución aplicada:** se replican en `ViajeForm.tsx` las mismas tres listas (mismo criterio ya aceptado en el proyecto para `ORDEN_ESTADOS`, H-6) y se calcula un `Set` de campos bloqueados a partir de `estado`/`estadoFacturacion`/`estadoLiquidacion` del Viaje (ya venían en la respuesta de `GET /viajes/:id`, antes descartados). Cada campo bloqueado se deshabilita (`disabled`, no se oculta — el usuario sigue viendo el valor) y se agrega una explicación en lenguaje de dominio (mismo vocabulario que ya usa `ViajeDetalle.tsx`: "facturado"/"liquidado"/"cancelado"), reutilizando `.warning-banner` (clase ya existente, usada en `PagoConsolidadoDetalle.tsx` — sin sistema de alertas nuevo). En modo creación (`/viajes/nuevo`) no aplica ninguna restricción.

**Validación funcional real, con datos locales creados para cada combinación:**
- **Caso 1 (totalmente editable):** Viaje nuevo, `PENDIENTE`, sin facturar/liquidar — los 13 campos habilitados, sin banner.
- **Caso 2 (parcialmente bloqueado, facturado no liquidado):** confirmado el detalle asimétrico exacto — `fecha/cartaPorte/ctg/cerealId/clienteId/transportistaId/origenId/destinoId/toneladas/tarifaTonelada` deshabilitados, **`choferId`/`camionId`/`acopladoId` siguen habilitados**, banner "ya fue facturado... anulá la factura asociada".
- **Caso 3 (totalmente bloqueado):** validado en dos variantes — `CANCELADO` (todo bloqueado salvo Productor/Observaciones, banner específico) y facturado+liquidado (mismo resultado, banner combinado citando ambos).
- **Caso 4 (guardar un viaje permitido):** editar Observaciones de un Viaje sin restricciones y guardar — confirmado por lectura directa de la API que el cambio se persistió.
- **Caso 5 (forzar un campo bloqueado):** UI confirma `disabled=true` en todos los casos anteriores; forzado directo vía API (`PATCH` cambiando `fecha` en un Viaje facturado) confirma que el backend sigue rechazando con `400` y el mismo mensaje explicativo — la UI es una mejora de UX, el backend sigue siendo la única barrera real.

**Regresión:** `Viajes.tsx`/`ViajeDetalle.tsx`/backend sin cambios en este bloque; listado verificado mostrando fechas/estados/acciones correctos; modo creación (`/viajes/nuevo`) sin ninguna restricción nueva.

**Builds y tests:** backend sin cambios, 11/11 suites, 82/82 tests verde. Frontend build verde, 120 módulos.

**Deuda remanente sin cambios:** H-4 (gating de permisos parcial — L4.3), H-6 a H-11 (deuda aceptable / mejora futura).

---

## 15. L4.3 — Gating de permisos completo (adenda)

**H-4 (gating de permisos parcial): cerrado.** Se extendió `puedeGestionarViajes` (mismo criterio ya usado en `FilaViaje` desde L4.1: `usuario?.rol === "OPERACIONES" || usuario?.rol === "ADMINISTRADOR"`) a los cuatro puntos que faltaban: "Editar viaje"/"Avanzar a X"/"Cancelar viaje" en `ViajeDetalle.tsx`, y "+ Nuevo viaje" en `Viajes.tsx`. Además, se protegieron las rutas puramente de escritura `/viajes/nuevo` y `/viajes/:id/editar` con el `ProtectedRoute` ya existente en el proyecto (usado en 6 pantallas administrativas) — `/viajes` y `/viajes/:id` quedan deliberadamente sin proteger por ser rutas de lectura válida para cualquier rol. El backend no se modificó: sigue siendo la única autoridad real (`@Roles("OPERACIONES", "ADMINISTRADOR")` sin cambios en los 4 endpoints de escritura).

**Validación con sesiones reales:** `ADMINISTRADOR` ve y puede usar todos los controles, y accede sin bloqueo a ambas rutas de escritura. `LECTURA` (usuario de prueba real, login con contraseña real) no ve ningún control de escritura en listado ni Detalle, y al navegar directo por URL a `/viajes/nuevo` o `/viajes/:id/editar` recibe "Acceso restringido" — pero sigue accediendo sin problema a `/viajes` y `/viajes/:id`. Confirmado además a nivel de API: `POST /viajes` con token `LECTURA` → `403 Forbidden`; `GET /viajes` con el mismo token → `200`.

**Builds y tests:** backend sin cambios, 11/11 suites, 82/82 tests verde. Frontend build verde, 120 módulos.

**Deuda remanente sin cambios:** H-6 a H-11 (deuda aceptable / mejora futura, sin bloqueantes).

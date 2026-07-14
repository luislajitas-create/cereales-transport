# Bloque 7 — Auditoría Funcional y de Producto (SDC v2)

Fecha: 2026-07-10. Documento de auditoría pura — **no se modificó código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit, no se hizo push.** Abre el ciclo de evolución funcional del proyecto (Bloque 7), posterior al cierre técnico del Bloque 6 (`878ec41`).

**Método:** el análisis se hace desde el uso diario del sistema, no desde el código — como lo haría un Product Manager Senior, un Director Operativo de una cerealera, un Responsable Administrativo, y el usuario que liquida viajes todos los días. Se apoya en lo ya documentado y validado en `METODOLOGIA_SDC.md`, `CONVENCIONES_DESARROLLO.md`, `ROADMAP_ACTUALIZADO.md`, `DEUDA_TECNICA.md`, `RECOMENDACIONES_PRODUCTO.md`, `PLAN_VERSION_1_0.md` y `BLOQUE5_ESTADO_ACTUAL.md` — no repite esos hallazgos como si fueran nuevos, los referencia y construye sobre ellos. Donde este documento aporta una lectura nueva (una función que falta, un dato sin aprovechar, un indicador ausente) se marca explícitamente como **hallazgo nuevo de Bloque 7**.

**Alcance real verificado de cada "módulo" pedido**, para no auditar algo que no existe tal como está nombrado:

| Módulo pedido | Existe hoy como... |
|---|---|
| Dashboard | 1 pantalla (`Dashboard.tsx`), 1 endpoint (`GET /dashboard/resumen`) |
| Viajes | 3 pantallas (`Viajes.tsx`, `ViajeForm.tsx`, `ViajeDetalle.tsx`) |
| Liquidaciones | 1 pantalla (`Liquidaciones.tsx`), la más madura del sistema (post 5.3.1/5.3.2) |
| Facturas | 1 pantalla (`Facturas.tsx`), incluye registro/anulación de cobranzas |
| Anticipos | 1 pantalla (`Anticipos.tsx`) |
| Catálogos | 3 pantallas (`Catalogos.tsx` para Cereal/Ubicación/TipoGasto/Productor, `Clientes.tsx`, `Transportistas.tsx`) — Choferes/Vehículos viven dentro de Transportistas, sin pantalla propia |
| Usuarios | **No existe como pantalla.** Solo `GET /usuarios` en el backend, sin alta/edición/baja — confirmado, decisión ya tomada como fuera de alcance de v1.0 (`DEUDA_TECNICA.md` N3) |
| Reportes | **No existe como módulo unificado.** Lo más cercano es `Conciliacion.tsx` (viajes realizados vs. facturados) + exports Excel/PDF con botón visible solo en Liquidaciones (el backend los soporta también en Facturas/Anticipos/Clientes/Transportistas/Choferes) |

Los últimos dos puntos ya son, en sí mismos, un hallazgo de esta auditoría — se desarrollan en sus propias secciones (7 y 8) en vez de forzarlos a encajar en un molde que no tienen.

---

## 1. Dashboard

**1. Qué problema resuelve hoy:** da una foto operativa diaria sin tener que entrar a 4 módulos distintos — viajes en curso, viajes del mes (cantidad/toneladas/importe), pendientes de facturar, facturas vencidas (con detalle y saldo pendiente ya calculado), liquidaciones confirmadas pendientes de pago, anticipos no liquidados.

**2. Qué hace muy bien:** consolida 6 métricas financieras/operativas reales en una sola carga de pantalla, con el cálculo de saldo pendiente de las facturas vencidas ya resuelto en el backend (no le pide al usuario que reste a mano).

**3. Qué información falta:** comparación contra el mes anterior o tendencia histórica; ranking de clientes/transportistas (por volumen, por mora); indicador de rentabilidad (margen entre lo facturado y lo liquidado por los mismos viajes); alertas de vencimiento de documentación de choferes/vehículos pese a que esos campos ya existen en el modelo; vista diferenciada para el rol `GERENCIA` (hoy ve exactamente lo mismo que `OPERACIONES`).

**4. Qué operaciones requieren demasiados clics:** ninguna operación se hace desde acá — es 100% lectura, y ningún indicador es clicable hacia su detalle (confirmado, `DEUDA_TECNICA.md` F17) — ver "facturas vencidas: 3" obliga a ir a Facturas y volver a filtrar a mano.

**5. Qué funciones un usuario esperaría encontrar:** drill-down (clic en un KPI → lista filtrada correspondiente); gráfico de evolución mensual; alertas accionables, no solo informativas.

**6. Qué procesos siguen siendo manuales:** sumar mentalmente "cuánto tengo para cobrar en total" (el dashboard solo muestra vencidas, no el total a cobrar incluyendo lo no vencido); lo mismo para "cuánto tengo que pagar a transportistas" en total, no solo lo confirmado.

**7. Qué podría automatizarse:** alertas proactivas (no solo pasivas en pantalla) de vencimientos de documentación y de facturas próximas a vencer — hoy hay que entrar a mirar, nada avisa.

**8. Qué indicadores ayudarían a tomar mejores decisiones:** rentabilidad por viaje/cliente/transportista **(hallazgo nuevo de Bloque 7 — ver sección 8)**; DSO (días promedio de cobro); aging de cartera (30/60/90 días); toneladas por cereal/cliente/mes; ranking de choferes por viajes/toneladas.

**9. Qué información hoy está en la base pero no se aprovecha:** `HistorialEstadoViaje` (con usuario y fecha de cada cambio de estado) — permitiría medir tiempos operativos reales por etapa, hoy invisible **(hallazgo nuevo)**; `AuditLog` existe pero no se expone en ninguna pantalla.

**10. Qué mejoras generarían mayor impacto operativo:** alertas de vencimiento documental, un indicador de "total a cobrar" y "total a pagar" (no solo lo vencido/confirmado), y drill-down clicable.

---

## 2. Viajes

**1. Qué problema resuelve hoy:** registra el ciclo de vida completo de cada viaje —de la asignación a la descarga— vinculando cliente, productor, transportista, chofer, camión, acoplado, cereal y origen/destino, con cálculo automático de importe y bloqueo de edición una vez facturado o liquidado.

**2. Qué hace muy bien:** la máquina de estados (`PENDIENTE → ASIGNADO → EN_CARGA → CARGADO → EN_TRANSITO → DESCARGADO`, con `CANCELADO` aparte) es clara, ordenada y con historial completo (`HistorialEstadoViaje`) — y el bloqueo de campos críticos una vez que el viaje ya fue facturado o liquidado es, en sí mismo, una protección de integridad contable que evita que alguien cambie un dato después de que ya se cobró/pagó por él.

**3. Qué información falta:** sin geolocalización/tracking en tránsito; sin captura del peso real de báscula/romaneo (solo toneladas declaradas al crear el viaje — no hay diferencia registrada entre lo pactado y lo efectivamente cargado o descargado); sin documento adjunto (carta de porte/CTG escaneado, remito de descarga); sin registro de incidencias (demoras, rechazo de carga, mermas).

**4. Qué operaciones requieren demasiados clics:** crear un viaje obliga a elegir cliente, productor, transportista, chofer, camión, acoplado, cereal, origen y destino uno por uno sin ningún valor por defecto ni plantilla — un transportista que siempre trae el mismo chofer/camión repite la misma selección viaje tras viaje; cambiar de estado es de a un viaje por vez, sin acción en lote para varios viajes del mismo día/transportista.

**5. Qué funciones un usuario esperaría encontrar:** duplicar un viaje como plantilla para el siguiente; cambio de estado en lote; alerta de viajes "estancados" en un mismo estado por demasiado tiempo; carga masiva vía planilla para volúmenes altos de viajes por día.

**6. Qué procesos siguen siendo manuales:** pasar la información del chofer (típicamente por teléfono/WhatsApp, fuera del sistema) a la carga en pantalla; conciliar toneladas declaradas contra el romaneo real, que hoy vive completamente fuera de SDC.

**7. Qué podría automatizarse:** aviso automático a Facturación/Liquidaciones apenas un viaje llega a `DESCARGADO` (hoy nadie se entera salvo que entre a mirar); recordatorio de viajes sin avanzar de estado por más de N días.

**8. Qué indicadores ayudarían a tomar mejores decisiones:** tiempo promedio por etapa del ciclo de vida del viaje **(hallazgo nuevo — el dato ya existe en `HistorialEstadoViaje`, nunca se calculó)**; tasa de cancelación por cliente/transportista; ranking de choferes por viajes/toneladas; distribución de viajes por cereal y estacionalidad.

**9. Qué información hoy está en la base pero no se aprovecha:** el propio `HistorialEstadoViaje` (tiempos reales por etapa, ya mencionado); el campo `observaciones` de texto libre no alimenta ningún reporte ni resumen.

**10. Qué mejoras generarían mayor impacto operativo:** reducir la carga repetitiva con plantillas/valores recordados, alertas de viajes estancados, e indicador de tiempos por etapa para detectar cuellos de botella operativos reales (¿dónde se traba un viaje: en carga, en tránsito?).

---

## 3. Liquidaciones

**1. Qué problema resuelve hoy:** calcula cuánto pagarle a un chofer o transportista por sus viajes de un período, descontando anticipos/gastos y aplicando la comisión pactada, con trazabilidad completa hasta el número de factura de cada viaje incluido.

**2. Qué hace muy bien:** es, sin comparación, el módulo más maduro del sistema — la planilla (Bloque 5.3.2) es el único punto donde un usuario no técnico entiende el resultado financiero en segundos, con categorización automática de adelantos y exports PDF/Excel que muestran exactamente lo mismo que la pantalla.

**3. Qué información falta:** sin comparación contra el período anterior liquidado al mismo chofer/transportista; sin registro del método de pago real más allá de la fecha de pago; sin visibilidad, desde la propia pantalla de liquidación, de si la comisión aplicada tuvo un override respecto de la comisión estándar del chofer (el dato queda en `AuditLog`, pero no se muestra ahí donde importaría verlo).

**4. Qué operaciones requieren demasiados clics:** seleccionar viajes y anticipos uno por uno con checkbox — para un chofer con muchos viajes en el período no hay "seleccionar todos los del rango" con revisión posterior antes de confirmar; **una liquidación es siempre de un solo chofer/transportista** — liquidar a 10 choferes a fin de mes son 10 operaciones completas, sin ningún atajo de lote.

**5. Qué funciones un usuario esperaría encontrar:** liquidación recurrente/plantilla (mismo chofer, período tipo, cada 15 días) donde solo haga falta revisar y confirmar; selección masiva de viajes+anticipos del período con la posibilidad de destildar excepciones, en vez de tildar uno por uno.

**6. Qué procesos siguen siendo manuales:** decidir qué anticipos entran en cada liquidación (el sistema ya filtra los disponibles — no liquidados, no anulados — pero la selección final es 100% manual, viaje por viaje).

**7. Qué podría automatizarse:** sugerencia de período (última liquidación de ese chofer/transportista + 1 día, hasta hoy); pre-selección de todos los viajes `DESCARGADO` pendientes del chofer/transportista en el rango elegido (el endpoint `candidatos` ya casi resuelve esto del lado del backend).

**8. Qué indicadores ayudarían a tomar mejores decisiones:** costo total de comisiones pagadas por mes; ranking de choferes/transportistas por monto liquidado; evolución del neto a pagar por transportista mes a mes.

**9. Qué información hoy está en la base pero no se aprovecha:** el `AuditLog` de `comisionPct_override` — nunca se muestra en ninguna pantalla, y sería exactamente el dato que un Responsable Administrativo necesitaría para detectar comisiones negociadas fuera de la norma **(hallazgo nuevo)**.

**10. Qué mejoras generarían mayor impacto operativo:** liquidación recurrente/plantilla y selección masiva con revisión — es el módulo que un usuario toca todos los días de cierre de período, y hoy escala mal con la cantidad de choferes/viajes.

---

## 4. Facturas

**1. Qué problema resuelve hoy:** agrupa los viajes de un cliente en una factura interna, hace seguimiento del cobro (parcial/total, recalculado automáticamente según cobranzas vigentes) y permite anular/refacturar sin perder trazabilidad histórica.

**2. Qué hace muy bien:** el estado de la factura se recalcula solo, con tolerancia de redondeo y bloqueo estricto de sobrepago — es matemáticamente sólido y no depende de que nadie lo actualice a mano.

**3. Qué información falta:** el número de factura es texto libre tipeado a mano (riesgo real de duplicado o error de tipeo, ya señalado como N1 en `DEUDA_TECNICA.md`); sin vínculo con el comprobante fiscal real (AFIP), pregunta de negocio todavía abierta (N4); la condición comercial del cliente (`Cliente.condicionesComerciales`) es texto libre y no se usa para sugerir una fecha de vencimiento al facturar.

**4. Qué operaciones requieren demasiados clics:** Facturas todavía no tiene el mismo nivel de confirmación/doble-submit/feedback que Liquidaciones ya tiene (gap ya documentado, `RECOMENDACIONES_PRODUCTO.md` lo marca como la mejora de mayor valor visible hoy); tipear el número de factura a mano en cada alta, en vez de que el sistema lo proponga.

**5. Qué funciones un usuario esperaría encontrar:** numeración automática, como ya tienen `Viaje.numeroViaje` y `Liquidacion.numero`; vencimiento sugerido según la condición comercial del cliente; alerta antes de que la factura venza, no solo después.

**6. Qué procesos siguen siendo manuales:** calcular a mano la fecha de vencimiento según lo acordado con el cliente; perseguir cobros vencidos (el dashboard lista, pero no avisa activamente).

**7. Qué podría automatizarse:** la numeración correlativa; un aviso previo al vencimiento (hoy la única señal es ver la factura ya vencida en el dashboard).

**8. Qué indicadores ayudarían a tomar mejores decisiones:** DSO por cliente; aging de cartera (30/60/90 días) **(hallazgo nuevo — el dato de fecha de vencimiento y cobranzas ya existe, nunca se agregó en bandas de antigüedad)**; ranking de clientes morosos; facturación mensual por cereal/cliente.

**9. Qué información hoy está en la base pero no se aprovecha:** `Cliente.condicionesComerciales`, cargado pero sin ninguna regla que lo use; el historial completo de `Factura.vencimiento` podría alimentar un aging report real, hoy solo se usa para la pregunta binaria "¿está vencida sí/no?".

**10. Qué mejoras generarían mayor impacto operativo:** numeración automática (elimina un riesgo real con esfuerzo mínimo), aging de cartera, y parejar la UX con Liquidaciones.

---

## 5. Anticipos

**1. Qué problema resuelve hoy:** registra adelantos y gastos (combustible, seguros, efectivo, etc.) de choferes/transportistas para descontarlos después en la liquidación correspondiente.

**2. Qué hace muy bien:** el filtro de `liquidado`/`anulado` en el backend impide reutilizar por error un anticipo ya consumido; la categorización automática por tipo de gasto alimenta directamente la planilla de liquidación sin que nadie tenga que reclasificar nada a mano.

**3. Qué información falta:** sin comprobante real adjunto (existe el campo `comprobanteUrl`, pero no hay ninguna forma de subir un archivo, solo pegar una URL manualmente); sin tope/límite de anticipo por chofer (nada impide sobregirar a un chofer en anticipos); sin vista consolidada de "cuánto le debo en anticipos no liquidados a este chofer hoy", salvo en el momento puntual de armar una liquidación.

**4. Qué operaciones requieren demasiados clics:** este es **el caso más flagrante de todo el sistema** — el backend ya soporta filtrar por chofer, transportista, rango de fecha, liquidado y anulado, y el frontend no expone ninguno de esos filtros (`DEUDA_TECNICA.md` F8). Con un volumen medio de anticipos, encontrar uno puntual es scroll manual sobre toda la lista.

**5. Qué funciones un usuario esperaría encontrar:** los filtros que el backend ya tiene listos; carga real de comprobante (imagen/PDF, no una URL pegada a mano); alerta cuando un chofer acumula anticipos sin liquidar por encima de un monto o de un tiempo razonable.

**6. Qué procesos siguen siendo manuales:** revisar a ojo toda la lista para encontrar los anticipos de un chofer puntual, exactamente por la ausencia de filtros del punto 4.

**7. Qué podría automatizarse:** alerta de "chofer con anticipos acumulados sin liquidar" por monto o por antigüedad.

**8. Qué indicadores ayudarían a tomar mejores decisiones:** total de anticipos no liquidados por chofer/transportista (ranking de exposición); gasto por categoría (combustible vs. efectivo) por mes; choferes con mayor gasto recurrente en una categoría puntual.

**9. Qué información hoy está en la base pero no se aprovecha:** la propia categorización por `tipoGasto` — nunca se resume en un reporte propio fuera del momento puntual de una liquidación; la fecha de cada gasto podría mostrar estacionalidad de combustible, hoy invisible **(hallazgo nuevo)**.

**10. Qué mejoras generarían mayor impacto operativo:** exponer los filtros que el backend ya soporta — es, junto con la edición de catálogos, la mejora de mayor relación esfuerzo/valor de todo el sistema (cero lógica nueva, un problema de uso diario real).

---

## 6. Catálogos (Clientes, Transportistas, Choferes, Vehículos, Cereales, Ubicaciones, Tipos de Gasto, Productores)

**1. Qué problema resuelve hoy:** mantiene los datos maestros que alimentan todo el resto del sistema — sin un cliente, transportista, chofer o vehículo cargado y activo, no se puede operar ningún viaje.

**2. Qué hace muy bien:** el soft-delete real (Bloque 5.2) evita operar contra un dato dado de baja, con la misma guarda aplicada de forma consistente en los 4 puntos de creación (viaje, anticipo, liquidación, factura) — un error de "usé un chofer que ya no trabaja acá" hoy es literalmente imposible.

**3. Qué información falta:** vencimientos de documentación (RTO, seguro, licencia de conducir) no son capturables desde ningún formulario, pese a que `Vehiculo`/`Chofer` ya tienen esos campos en el modelo — es un catálogo maestro que hoy no cumple su función de control de cumplimiento normativo; CUIT sin validación de formato ni dígito verificador en ningún punto del sistema.

**4. Qué operaciones requieren demasiados clics:** **la edición no existe en la interfaz.** El backend soporta `PATCH` en todos los catálogos maestros desde hace varios bloques, pero no hay ningún formulario de edición visible — corregir un dato mal cargado hoy requiere pedirle a alguien con acceso directo a la base de datos que lo arregle a mano.

**5. Qué funciones un usuario esperaría encontrar:** editar cualquier catálogo desde su propia pantalla; dar de baja/reactivar con un botón (el backend ya lo soporta); alerta de vencimiento próximo de RTO/seguro/licencia.

**6. Qué procesos siguen siendo manuales:** pedir a alguien con acceso técnico que corrija un CUIT mal tipeado, un teléfono desactualizado, o cualquier dato maestro con un error de carga.

**7. Qué podría automatizarse:** alertas de vencimiento documental (30/15/7 días antes), apenas se pueda capturar el dato desde algún formulario.

**8. Qué indicadores ayudarían a tomar mejores decisiones:** choferes/vehículos con documentación por vencer en los próximos 30 días; clientes/transportistas inactivos hace más de N meses (candidatos a revisar si siguen vigentes como contraparte comercial).

**9. Qué información hoy está en la base pero no se aprovecha:** los campos de vencimiento de RTO, seguro y licencia existen en el modelo de datos y hoy no se leen desde ningún lado del frontend ni generan ninguna alerta — son, en la práctica, datos muertos.

**10. Qué mejoras generarían mayor impacto operativo:** exponer la edición en la interfaz (el backend ya está listo — es trabajo ya hecho e invisible) y capturar/alertar vencimientos documentales, que es tanto una mejora de producto como una reducción de riesgo legal real para una empresa de transporte.

---

## 7. Usuarios

**1. Qué problema resuelve hoy:** apenas autenticación (login) y autorización por rol — determina qué puede hacer cada persona que entra al sistema, con 6 roles definidos en el modelo de datos: `ADMINISTRADOR`, `GERENCIA`, `OPERACIONES`, `LIQUIDACIONES`, `FACTURACION`, `LECTURA`.

**2. Qué hace muy bien:** la separación de roles ya está aplicada de forma consistente en los endpoints de escritura de catálogos y en los flujos financieros críticos (Bloque 5.1) — un usuario de `LIQUIDACIONES` no puede tocar `Facturas` y viceversa, sin excepciones encontradas.

**3. Qué información falta:** no hay ninguna pantalla para ver quién está usando el sistema, cuándo fue el último acceso de cada usuario, ni un historial de acciones por persona más allá del `AuditLog` parcial ya señalado en `DEUDA_TECNICA.md`.

**4. Qué operaciones requieren demasiados clics:** **no existen operaciones — no hay ninguna pantalla de gestión de usuarios.** `UsuariosController` solo tiene `GET` (listar), sin alta, edición ni baja — confirmado contra el backend real, no una suposición.

**5. Qué funciones un usuario esperaría encontrar:** alta de un usuario nuevo con su rol asignado desde el momento cero; reseteo de contraseña sin intervención directa en la base de datos; desactivar a alguien que deja la empresa (el modelo ya tiene `Usuario.activo`, usado hoy solo internamente para bloquear el login, sin ninguna pantalla que lo gestione).

**6. Qué procesos siguen siendo manuales:** **todo.** Cada usuario nuevo, cada cambio de rol, cada baja de alguien que se va de la empresa, se hace hoy directamente en la base de datos — fuera de cualquier registro de auditoría de la propia aplicación.

**7. Qué podría automatizarse:** nada tiene sentido automatizar todavía si la gestión básica ni siquiera existe como funcionalidad manual accesible — es el prerrequisito de cualquier automatización futura sobre usuarios (por ejemplo, expiración de contraseñas, notificación de acceso desde un dispositivo nuevo).

**8. Qué indicadores ayudarían a tomar mejores decisiones:** cantidad de usuarios activos por rol; último acceso por usuario (para detectar cuentas abandonadas de gente que ya no trabaja en la empresa, que hoy podrían seguir activas sin que nadie lo note).

**9. Qué información hoy está en la base pero no se aprovecha:** `Usuario.activo`, `Usuario.rol` y las marcas de tiempo de creación — el modelo de datos está listo, la interfaz de gestión directamente no existe.

**10. Qué mejoras generarían mayor impacto operativo:** un CRUD de usuarios desde la interfaz. Es, junto con la edición de catálogos, el gap que más limita la autonomía operativa del cliente — hoy depende al 100% de que alguien con acceso técnico a la base intervenga para cualquier cambio de personal.

---

## 8. Reportes

**1. Qué problema resuelve hoy:** no existe como módulo propio (ver tabla de alcance al inicio de este documento). Lo más cercano es la Conciliación (viajes `DESCARGADO` vs. facturados, por cliente, con diferencia de toneladas e importe) y exports Excel/PDF puntuales, con botón visible solo en Liquidaciones.

**2. Qué hace muy bien:** la Conciliación resuelve exactamente lo que promete — compara lo realizado contra lo facturado, por cliente, con la diferencia ya calculada. Es información gerencial real, correcta, y lista para usar.

**3. Qué información falta:** ningún reporte de rentabilidad (margen entre lo facturado al cliente y lo pagado a transportistas/choferes por los mismos viajes) **(hallazgo nuevo de Bloque 7 — ver punto 9)**; ningún reporte consolidado por cereal, por período o por productor; ningún reporte fiscal/impositivo, dependiente de la pregunta de negocio abierta sobre AFIP (N4 en `DEUDA_TECNICA.md`).

**4. Qué operaciones requieren demasiados clics:** los exports que el backend ya construye (Facturas, Anticipos, Choferes, Transportistas) no tienen ningún botón en la interfaz — conseguir ese Excel hoy no es posible desde la aplicación, pese a que el trabajo de backend ya está hecho.

**5. Qué funciones un usuario esperaría encontrar:** un módulo de "Reportes" centralizado (no disperso módulo por módulo), con filtros comunes de fecha/cliente/transportista/cereal, y exportación uniforme desde un mismo lugar.

**6. Qué procesos siguen siendo manuales:** armar cualquier reporte que no sea exactamente la Conciliación o el resumen del Dashboard requiere exportar datos crudos (cuando el botón existe) y procesarlos por fuera del sistema en una planilla aparte.

**7. Qué podría automatizarse:** envío periódico (semanal/mensual) de los reportes más usados por correo, en vez de depender de que alguien entre a generarlos cada vez.

**8. Qué indicadores ayudarían a tomar mejores decisiones:** rentabilidad por viaje/cliente/transportista — el dato ya existe (`Viaje.importeTotal` vs. lo que ese mismo viaje representó dentro de su `LiquidacionViaje`), pero nunca se cruza en un mismo reporte.

**9. Qué información hoy está en la base pero no se aprovecha:** es, junto con Dashboard, el punto donde más queda "dinero arriba de la mesa" en términos de datos ya capturados y nunca cruzados entre sí — `Viaje`, `LiquidacionViaje` y `FacturaViaje` son tres entidades ya relacionadas en el modelo de datos, pero ningún reporte las muestra juntas para calcular el margen real de un viaje o de un cliente **(hallazgo nuevo de Bloque 7 — es, en criterio de esta auditoría, la mejora de mayor impacto de negocio identificada en todo este documento)**.

**10. Qué mejoras generarían mayor impacto operativo:** el reporte de rentabilidad por viaje/cliente/transportista, exponer en la interfaz los exports que el backend ya construye, y un aging de cartera dentro de este mismo módulo.

---

## Síntesis — lo que se repite en los 8 módulos

Tres patrones cruzan todos los módulos analizados, no son hallazgos aislados de uno solo:

1. **Trabajo de backend ya hecho, invisible en la interfaz.** Edición de catálogos, filtros de Anticipos, exports fuera de Liquidaciones — en los tres casos la lógica ya existe y funciona, falta solo el botón. Es, en cada caso, la mejora de menor esfuerzo y mayor impacto relativo de su propio módulo.
2. **Datos ya capturados, nunca cruzados ni resumidos.** Vencimientos documentales, `HistorialEstadoViaje`, `AuditLog` de overrides de comisión, y sobre todo el cruce Viaje-Liquidación-Factura para calcular rentabilidad — el sistema ya sabe estas cosas, solo no las dice todavía.
3. **Todo lo reactivo, nada proactivo.** El dashboard muestra facturas ya vencidas, no avisa antes; muestra anticipos no liquidados, no alerta cuando se acumulan; no hay ninguna notificación push/email en todo el sistema. Es el mismo patrón en Dashboard, Facturas, Anticipos y Catálogos (vencimientos).

Estos tres patrones, no una lista larga de funciones sueltas, son el resumen ejecutivo real de esta auditoría — se retoman en `BLOQUE7_ROADMAP_FUNCIONAL.md` para priorizar.

---

**No se modificó código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit ni push para producir este documento.**

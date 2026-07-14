# Roadmap — Bloque 5: de auditoría a plan de trabajo

Fecha: 2026-07-07. Propuesta de sub-bloques para decidir juntos qué implementar primero, basada en `BLOQUE5_AUDITORIA_PRODUCTO.md`. Ningún ítem de este roadmap está implementado todavía — es una propuesta de orden y alcance, a aprobar/ajustar antes de escribir código.

**Convención de esfuerzo:** Bajo = horas a medio día. Medio = 1-3 días. Alto = 3-7 días. Muy alto = más de una semana / requiere planificación propia (no debería intercalarse con otro trabajo).

**Convención de dependencia:** algunos sub-bloques deben resolverse antes que otros (marcado explícitamente). El resto son independientes entre sí y se pueden reordenar según preferencia.

---

## 5.0 — Verificación urgente de producción (sin código)

**Resuelve:** P1 (posible discrepancia Railway/repo), P2 (entrypoint roto).
**Esfuerzo: Bajo** (horas). **No requiere escribir código** — es verificación manual del dashboard de Railway, y a lo sumo una corrección de configuración o de una línea (`tsconfig.json`/Dockerfile/`package.json`).
**Por qué va primero:** si el problema P1 es real, todo el resto de la priorización es secundario — no tiene sentido decidir qué construir a continuación si no sabemos con certeza qué está corriendo hoy en producción. Es, además, la relación beneficio/esfuerzo más alta de todo el documento.
**Contenido:**
1. Verificar en el dashboard de Railway el "Root Directory" configurado para los servicios backend y frontend — confirmar que apunten a `backend/`/`frontend/` (raíz del repo) y no a `app/backend/`/`app/frontend/`.
2. Verificar el "Start Command"/CMD efectivo del servicio backend contra la ruta real del build (`dist/src/main.js` vs. `dist/main.js`) — si Railway está sirviendo el código viejo o el contenedor no arranca, corregir la configuración o el `tsconfig.json`/Dockerfile según corresponda.
3. Confirmar si el plan de Railway usado incluye backups automáticos de PostgreSQL (P4) — documentarlo.

---

## 5.1 — Seguridad crítica (bajo esfuerzo, alto impacto)

**Resuelve:** B8 (catálogos sin `RolesGuard`), B9 (`JWT_SECRET` fail-fast), B11 (rate-limiting en login), B10 (CORS fail-fast).
**Esfuerzo: Bajo-Medio** (1 día aprox.).
**Dependencias:** ninguna, puede ir en paralelo con 5.0.
**Por qué acá:** es el fix de seguridad más barato y de mayor impacto del documento — agregar `@Roles(...)` a 15 endpoints siguiendo un patrón ya usado en 4 controllers de este mismo proyecto no requiere diseño, solo aplicarlo consistentemente. Rate-limiting en login es una integración estándar de una librería (`@nestjs/throttler`).
**Contenido:**
1. `@Roles(...)` en los 15 endpoints mutantes de `clientes`, `vehiculos`, `choferes`, `transportistas`, `simples` controllers.
2. Fail-fast al arrancar si `JWT_SECRET`/`CORS_ORIGIN` no están seteadas (en vez de fallback silencioso).
3. Rate-limiting básico en `POST /auth/login`.

---

## 5.2 — Infraestructura de despliegue

**Resuelve:** P3 (unificar Dockerfiles), P8 (`.env.example`), P9 (HEALTHCHECK/usuario no-root), P4 (backup, si 5.0 confirma que falta).
**Esfuerzo: Medio** (1-2 días).
**Dependencias:** debe ir después de 5.0 (no tiene sentido unificar Dockerfiles hasta confirmar cuál es el real usado hoy).
**Contenido:**
1. Unificar los dos Dockerfile en uno solo, confirmado contra lo que Railway realmente usa.
2. Agregar `HEALTHCHECK` y usuario no-root al Dockerfile unificado.
3. Crear `.env.example` para backend y frontend.
4. Documentar (o configurar si falta) la estrategia de backup de PostgreSQL.
5. Actualizar `README.md` para reflejar la estructura real del repo (`backend/`/`frontend/` en la raíz, no `app/`).

---

## 5.3 — Observabilidad

**Resuelve:** B13/P6 (logging estructurado, catch-all de excepciones, health check real), B14 (AuditLog ampliado).
**Esfuerzo: Medio** (2-3 días).
**Dependencias:** ninguna, pero tiene más sentido después de 5.0-5.2 (no vale la pena invertir en observabilidad de un despliegue que quizás no sea el correcto).
**Contenido:**
1. Logger estructurado (nivel mínimo: `Logger` de Nest bien configurado con niveles; evaluar Pino/Winston solo si se justifica).
2. `AllExceptionsFilter` catch-all además del `PrismaExceptionFilter` ya existente.
3. Health check real con verificación de conectividad a PostgreSQL (`@nestjs/terminus`).
4. Extender `AuditLog` a: anulación de anticipos, confirmación/pago/anulación de liquidaciones, anulación de facturas, ediciones de catálogos maestros. Agregar `createdAt`/`updatedAt` a `Chofer`/`Vehiculo`, `updatedAt` a `Cliente`.

---

## 5.4 — Correcciones de negocio de bajo esfuerzo y alto valor

**Resuelve:** B18 (soft-delete real en catálogos), F14 (typo `numerl`), N11 (validación de CUIT), D1 (índices en `estadoFacturacion`/`estadoLiquidacion`).
**Esfuerzo: Bajo-Medio** (1-2 días).
**Dependencias:** ninguna, se puede hacer en paralelo con cualquier otro sub-bloque.
**Por qué agruparlos:** son 4 fixes independientes entre sí, todos de esfuerzo bajo y beneficio alto — tiene sentido resolverlos juntos como "quick wins" antes de encarar los sub-bloques más grandes.
**Contenido:**
1. Filtrar `activo:true` por defecto en `GET /clientes` y `GET /transportistas` (con opción de incluir inactivos vía query param).
2. Corregir `detalle.numerl` → `detalle.numero` en `Liquidaciones.tsx`.
3. Validación de formato/dígito verificador de CUIT (backend, y opcionalmente frontend).
4. Migración aditiva: `@@index([estado, estadoFacturacion])` y `@@index([estado, estadoLiquidacion])` en `Viaje`.

---

## 5.5 — UX financiera crítica (frontend)

**Resuelve:** F1 (estados de carga/doble-submit), F2 (manejo de errores de carga), F9 (confirmación en anulaciones).
**Esfuerzo: Medio** (2-3 días).
**Dependencias:** ninguna.
**Por qué es prioritario:** son los hallazgos de frontend con mayor riesgo financiero real (duplicación de facturas/liquidaciones/cobranzas por doble clic, anulaciones accidentales sin confirmación) y el patrón correcto ya existe en el propio código (`ViajeForm.tsx`, `ViajeDetalle.tsx`) — es replicar, no diseñar desde cero.
**Contenido:**
1. Estado `busy`/`saving` + `disabled` en los ~14 botones de escritura identificados, priorizando Liquidaciones y Facturas primero.
2. `.catch()` con mensaje de error en las 6 páginas que hoy fallan silenciosamente en la carga inicial.
3. Confirmación (modal o `window.prompt` con motivo, consistente con el patrón ya usado en Cancelar viaje/Anular anticipo) antes de "Anular factura" y las acciones de Liquidaciones (Confirmar/Pagar/Anular).

---

## 5.6 — Cerrar funcionalidad ya construida pero inaccesible

**Resuelve:** F3 (edición de viajes), F5 (anulación de cobranza individual), F6 (edición de catálogos), F7 (exports faltantes en frontend).
**Esfuerzo: Alto** (3-5 días, varios formularios distintos).
**Dependencias:** ninguna, pero conviene hacerlo después de 5.5 (mismo tipo de trabajo, se puede compartir contexto/patrones de formulario).
**Por qué importa:** es trabajo de backend ya hecho y validado (Bloques 3-4) que hoy nadie puede usar desde la interfaz — es la relación de "terminar lo empezado" más directa de todo el roadmap.
**Contenido:**
1. Formulario de edición de viaje (reusa la lógica de selects dependientes de `ViajeForm.tsx`).
2. Botón de anulación individual de cobranza en `Facturas.tsx`.
3. Formularios de edición para clientes, transportistas, choferes (campos más allá de comisión), vehículos.
4. Botones de exportación Excel/PDF en Facturas, Anticipos, Clientes, Transportistas, Choferes (el patrón ya existe en Liquidaciones).

---

## 5.7 — Cumplimiento normativo: vencimientos de documentación

**Resuelve:** F4 (captura de vencimientos), N2 (alertas de vencimiento).
**Esfuerzo: Medio** (2-3 días).
**Dependencias:** depende de 5.6 punto 3 (formularios de edición de choferes/vehículos) para poder cargar/corregir los vencimientos ya existentes, no solo al alta.
**Contenido:**
1. Agregar `vencimientoRto`, `vencimientoSeguro`, `licenciaVencimiento` a los formularios de alta y edición de vehículo/chofer.
2. Alerta en el Dashboard (o al crear un viaje) cuando el vehículo/chofer asignado tiene documentación vencida o próxima a vencer.

---

## 5.8 — Modelo de datos: deuda estructural conocida

**Resuelve:** D3 (unificar enums de facturación), D4 (categorización explícita de gastos), D5 (enum de `medioPago`), D6 (constraint de `Ubicacion`).
**Esfuerzo: Alto** (requiere migraciones + revisar cada punto del código que usa los campos afectados).
**Dependencias:** ninguna técnica, pero es más seguro hacerlo con tests de regresión mínimos ya en marcha (ver 5.10) dado que toca lógica financiera central (liquidaciones/facturación).
**Recomendación:** no intentar los 4 juntos — son independientes entre sí, se puede secuenciar por separado empezando por el de menor riesgo (D5, enum de medio de pago) antes de encarar D3 (unificación de enums, el más invasivo).

---

## 5.9 — Paginación y filtros (backend + frontend coordinados)

**Resuelve:** B1 (paginación backend), F8 (filtros no expuestos), F18 (buscador de texto libre, persistencia de filtros).
**Esfuerzo: Alto** (requiere backend y frontend en conjunto, y decisión de UX sobre el patrón de paginación).
**Dependencias:** ninguna urgente — el propio documento de auditoría nota que el riesgo es bajo hoy (volumen de datos chico) y crece con el tiempo. **Candidato a priorizar según el volumen real de uso, no por defecto.**
**Contenido:**
1. Definir el patrón de paginación (offset/limit vs. cursor) una sola vez y aplicarlo consistentemente.
2. Exponer los filtros de Anticipos (el caso más flagrante), Liquidaciones, Facturas y `transportistaId`/`cerealId` en Viajes.
3. Buscador de texto libre en Viajes y Facturas.
4. Persistencia de filtros vía `useSearchParams`.

---

## 5.10 — Tests automatizados (arranque acotado)

**Resuelve:** B19.
**Esfuerzo: Alto** (para arrancar) → **Muy alto** (para cobertura amplia).
**Dependencias:** ninguna técnica, pero es la base que hace más seguro encarar 5.8 (deuda de modelo de datos) y cualquier refactor futuro.
**Recomendación de alcance inicial (no todo de una vez):** empezar por e2e de los flujos financieros más críticos ya validados manualmente en los Bloques 3-4 (liquidar→anular→re-liquidar, facturar→anular→re-facturar, cobranza con sobrepago/duplicado/anulación) — son los que ya tienen un plan de pruebas manual documentado en `BLOQUE3.3_DISENO_LIQUIDACION_VIAJE.md`/`BLOQUE4.2_DISENO_FACTURAVIAJE.md`/`BLOQUE4.3_DISENO_COBRANZAS.md`, listo para traducir a tests automatizados.

---

## 5.11 — CI/CD básico

**Resuelve:** P5, P12 (migraciones automatizadas).
**Esfuerzo: Medio** (1-2 días para un pipeline básico de build+typecheck; más si se integra con 5.10).
**Dependencias:** se beneficia de tener al menos algo de 5.10 (tests) para que el pipeline aporte más que un build check, pero no es estrictamente necesario esperarlo.
**Contenido:**
1. Workflow de GitHub Actions: build + typecheck en cada PR.
2. Automatizar `prisma migrate deploy` como parte del pipeline de deploy (no a mano).

---

## 5.12 — Mantenibilidad de backend (refactor de fondo)

**Resuelve:** B2 (loops secuenciales → batch), B5 (deduplicar exports/fecha/fmtMoney), B7 (código muerto y contrato engañoso de `contactos`), B15 (capa de servicio).
**Esfuerzo: Alto → Muy alto** (B15 en particular es un refactor transversal, no un fix puntual).
**Dependencias:** conviene hacerlo con 5.10 (tests) ya en marcha para reducir el riesgo de regresión.
**Recomendación:** separar B2/B5/B7 (acotados, se pueden hacer con esfuerzo medio cada uno) de B15 (capa de servicio, que es una iniciativa propia y no debería mezclarse con otro trabajo funcional).

---

## 5.13 — Accesibilidad y consistencia visual

**Resuelve:** F12 (accesibilidad), F16 (consistencia CSS), F13 (guard de rutas por rol en frontend, ligado a 5.1).
**Esfuerzo: Medio** (2-3 días).
**Dependencias:** el guard de rutas por rol tiene más sentido una vez cerrado 5.1 (ya no sería solo cosmético).
**Contenido:**
1. Asociar `label`/`input` con `htmlFor`/`id` en los formularios principales.
2. Corregir contraste de badges de estado que fallan WCAG AA; diferenciar el color de `ASIGNADO`/`EN_TRANSITO`.
3. Guard de rutas por rol en `App.tsx`, consistente con lo que ya oculta `Layout.tsx`.

---

## 5.14 — Valor agregado (a discutir alcance con el negocio antes de estimar)

**Resuelve:** N4 (pregunta abierta sobre AFIP/facturación fiscal), N5 (alertas proactivas), N7 (Dashboard gerencial), N8 (portal de autoservicio), N6 (importación masiva).
**Esfuerzo: Muy alto**, y variable según las respuestas de negocio.
**Dependencias:** N4 debe responderse antes de invertir en N1 (numeración de factura) o en cualquier mejora de reportería fiscal.
**Recomendación:** no estimar en detalle todavía — son iniciativas de producto, no bugs ni deuda técnica, y su alcance depende de decisiones de negocio (¿este sistema reemplaza la facturación fiscal real? ¿cuánto valor tiene un portal externo para transportistas/clientes hoy?) que conviene resolver en una conversación aparte antes de dimensionar esfuerzo.

---

## Orden recomendado (resumen)

1. **5.0** — Verificación de producción (día 1, antes que nada más)
2. **5.1** — Seguridad crítica
3. **5.4** — Quick wins de negocio/datos
4. **5.2** — Infraestructura de despliegue
5. **5.5** — UX financiera crítica
6. **5.3** — Observabilidad
7. **5.6** — Cerrar funcionalidad ya construida
8. **5.7** — Cumplimiento normativo (vencimientos)
9. **5.11** — CI/CD básico
10. **5.10** — Tests automatizados (arranque acotado)
11. **5.13** — Accesibilidad y consistencia visual
12. **5.9** — Paginación y filtros
13. **5.8** — Deuda estructural de modelo de datos
14. **5.12** — Mantenibilidad de backend (refactor de fondo)
15. **5.14** — Valor agregado (conversación de alcance aparte)

Los primeros 6 sub-bloques (5.0 a 5.5, salvo 5.4 en el medio) concentran la mayoría de los hallazgos P0/P1 con el menor esfuerzo relativo — es donde recomiendo arrancar la conversación de qué implementar primero.

---

No se implementó nada de este roadmap. Queda a la espera de tu decisión sobre qué sub-bloque(s) encarar primero.

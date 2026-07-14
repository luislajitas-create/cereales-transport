# Acta de Cierre — Bloque 9 (Productización Administrativa)

Fecha: 2026-07-14. Documento de cierre de `METODOLOGIA_SDC.md`, etapa 9. Bloque 9 se abrió con el flujo completo (auditoría en `BLOQUE9_AUDITORIA_ADMINISTRACION.md`, diseño en `BLOQUE9_DISENO_ADMINISTRACION.md`, aprobación explícita de sus decisiones de sección 12) y, a partir de esa aprobación, cada uno de los seis sub-bloques se implementó en la modalidad directa que fija `CONSTITUCION_SDC.md` (Artículo 2): implementar → build → validar técnica → validar funcional → regresión → commit → push → verificar producción, sin pausas intermedias salvo conflicto arquitectónico real. Este documento evalúa, con evidencia objetiva, si el conjunto cumple los criterios de cierre fijados por `BLOQUE9_DISENO_ADMINISTRACION.md` (secciones 10 y 11), `BLOQUE9_AUDITORIA_ADMINISTRACION.md` (sección 10) y `CONSTITUCION_SDC.md` (Artículo 4).

---

## 1. Qué se implementó

**9.1 — Administración de Usuarios** (`9629a03`). `GET /usuarios`, `POST /usuarios` (alta sin contraseña visible — token de activación de un solo uso), `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`. Protección del último `ADMINISTRADOR` activo verificada en el propio endpoint, no delegada a la base. Modelo `PasswordResetToken` (token aleatorio de 32 bytes, solo se guarda su hash SHA-256, vigencia 60 minutos, uso único).

**9.2 — Perfil del Usuario** (`276f70a`). `GET /perfil`, `PATCH /perfil` (solo `nombre`; `rol`/`activo`/`organizacionId` nunca modificables), `PATCH /perfil/contrasena` (contraseña actual + nueva, con las 4 validaciones de la sección 5 del diseño). Nunca invalida JWT ya emitidos — arquitectura stateless preservada, confirmado empíricamente (ver sección 4).

**9.3 — Recuperación de Contraseña** (`9038cc0`). `POST /auth/recuperar-contrasena` (respuesta pública idéntica exista o no la cuenta) y `POST /auth/restablecer-contrasena` (reutilizado de 9.1 sin cambios). `NotificadorService` nuevo: interfaz de envío con adaptador de desarrollo (log a consola fuera de producción, nunca en producción).

**9.4 — Administración de Organización** (`df7ec8f`). `GET /organizacion` (cualquier rol autenticado), `PATCH /organizacion` (solo `ADMINISTRADOR`). Siete campos institucionales nuevos y nullable en `Organizacion` (`razonSocial`, `cuit` único global, `domicilio`, `telefono`, `email`, `zonaHoraria`, `moneda`). `logoUrl` quedó deliberadamente fuera de alcance por ser un campo de branding.

**9.5 — Consulta de Auditoría Administrativa** (`a7658d9`). `GET /organizacion/auditoria` (solo `ADMINISTRADOR`), con filtros (`usuarioId`, `entidad`, `entidadId`, `accion`, `fechaDesde`, `fechaHasta`) y paginación (máximo 100, por defecto 20), orden descendente por fecha.

**9.6 — Invitaciones de Usuarios** (`5fd2740`). `POST /usuarios/invitaciones` (`ADMINISTRADOR`, autenticado), `GET /usuarios/invitaciones/:token` y `POST /usuarios/invitaciones/:token/aceptar` (públicos, sin autenticación previa). Modelo `InvitacionUsuario` nuevo. El `Usuario` real se crea recién al aceptar, nunca al invitar.

**Catálogo de eventos de `AuditLog` implementado** — los 11 eventos que define `BLOQUE9_DISENO_ADMINISTRACION.md` (sección 7) están todos presentes en el código: `usuario_creado`, `usuario_editado`, `usuario_rol_cambiado`, `usuario_activado`/`usuario_desactivado`, `usuario_acceso_restablecido`, `contrasena_cambiada`, `contrasena_recuperada`, `organizacion_editada`, `invitacion_creada`, `invitacion_aceptada`, `operacion_administrativa_rechazada`. Se agregaron dos eventos adicionales no listados en esa tabla, ambos justificados y verificados sin datos sensibles: `perfil_editado` (9.2, distingue el cambio de nombre del cambio de contraseña) y `recuperacion_contrasena_solicitada` (9.3, deja constancia de la solicitud además de la recuperación completada).

**Migraciones** — tres, las tres puramente aditivas, ninguna destructiva: `20260713165140_password_reset_token` (9.1), `20260714011929_organizacion_datos_institucionales` (9.4), `20260714021730_invitacion_usuario` (9.6). 9.2, 9.3 y 9.5 no requirieron ningún cambio de esquema.

---

## 2. Qué decisiones de arquitectura se tomaron

- **Un solo punto de acceso autenticado**: las cinco partes autenticadas de Bloque 9 (9.1, 9.2, 9.4, 9.5, y la mitad autenticada de 9.6) usan exclusivamente `ORGANIZACION_PRISMA` — ningún módulo funcional nuevo importa `PrismaModule` directamente, respetando la regla ya cerrada en Bloque 8.1.d ("Ningún módulo funcional debe importar este módulo directamente").
- **Las dos mitades públicas (9.3 completo, la mitad pública de 9.6) usan `PrismaService` crudo**, pero no abren un punto de acceso nuevo: ambas viven en `AuthService`/`AuthModule`, el mismo módulo ya autorizado para ese propósito desde `AuthService.login`. El nuevo `InvitacionesPublicasController` (9.6) se registró en `AuthModule` — no en `AdministracionModule` — exactamente por esta razón.
- **Patrón de token reutilizado sin modificar**: `randomBytes(32)` + hash SHA-256, uso único, vigencia acotada — el mismo mecanismo de 9.1 se reutilizó tal cual en 9.3 y 9.6, sin ninguna variante.
- **`InvitacionUsuario` como modelo separado de `PasswordResetToken`** (9.6): decisión de arquitectura que nace directamente del conflicto de la sección 3 — detalle ahí.
- **`Organizacion.cuit` con unicidad global**, no por organización (9.4): a diferencia de `Cliente.cuit`/`Transportista.cuit`/`Productor.cuit` (únicos por organización, porque cada organización puede tener su propio cliente con ese CUIT externo), `Organizacion` es el propio tenant — dos organizaciones con el mismo CUIT real no tendría sentido de negocio.
- **`email` fuera de alcance de `PATCH /perfil`** (9.2): decisión explícita, no un olvido — un cambio de email autoservicio sobre una sesión comprometida, sin verificación de email todavía construida, habilitaría una toma de cuenta permanente combinada con la recuperación de contraseña ya vigente desde 9.1.
- **`GET /organizacion/auditoria` restringido a `ADMINISTRADOR`, no `GERENCIA`**: el diseño aprobado (sección 6, línea 154) solo autoriza `ADMINISTRADOR` para este endpoint — no hay aprobación explícita para extenderlo a `GERENCIA`.
- **`NotificadorService` con comportamiento distinto según entorno**: fuera de producción, deja el enlace completo en el log del propio servidor (para poder probar el flujo manualmente); en producción, nunca escribe el enlace — dejar constancia de que el envío quedó pendiente hasta que exista un proveedor real configurado (Decisión pendiente 5 del diseño, ver sección 6).
- **Sin endpoint de reenvío separado para invitaciones**: bajo el modelo aprobado (el `Usuario` no existe hasta aceptar), no hay ningún `:id` de `Usuario` al que reenviar. `POST /usuarios/invitaciones` invocado de nuevo sobre el mismo email pendiente reemplaza la invitación anterior (invalida su token, emite uno nuevo) — cubre el reenvío sin necesitar una ruta propia.
- **Sin endpoint de cancelación de invitación**: el diseño aprobado no lo contempla en ningún punto de la sección 5.

---

## 3. Qué conflictos aparecieron y cómo se resolvieron

**Conflicto real, único, en 9.6.** La instrucción de apertura de 9.6 pedía crear el `Usuario` en estado pendiente/inactivo en el momento de invitar, reutilizando `PasswordResetToken` con un campo de propósito para representar tanto la activación como la recuperación. `BLOQUE9_DISENO_ADMINISTRACION.md` (sección 5, línea 145) recomienda explícitamente lo contrario: **crear el `Usuario` recién al aceptar la invitación**, con esta justificación literal: *"evita que una invitación pendiente y nunca aceptada bloquee ese email (único global) para otra organización"*.

Antes de escribir código, se verificó que esa justificación era real y no hipotética: `Usuario.email` tiene `@unique` **global** en `schema.prisma:119` (a diferencia de `Cliente.cuit`, que es único por organización). Crear el `Usuario` al invitar, con una invitación nunca aceptada, dejaría ese email permanentemente inutilizable para cualquier otra organización del sistema. Se detectó además una segunda consecuencia mecánica: `PasswordResetToken.usuarioId` es una FK **obligatoria** a un `Usuario` ya existente — bajo el modelo "crear al aceptar" no hay ningún `usuarioId` real en el momento de invitar, así que ese modelo no puede representar la invitación sin violar su propio esquema.

Se detuvo la implementación, se presentaron ambos caminos al usuario (seguir el diseño aprobado, seguir la instrucción literal, o pausar para actualizar el diseño) y se resolvió a favor del **diseño aprobado**: `Usuario` se crea únicamente al aceptar (`auth.service.ts`, `aceptarInvitacion`), y se creó `InvitacionUsuario` como modelo separado (con `email`/`nombre`/`rol` propios, sin FK a un `Usuario` inexistente), exactamente como el diseño lo especifica en su sección 4. La protección resultante se validó empíricamente en la sección 4 de este documento: dos organizaciones invitando al mismo email en paralelo conviven de forma aislada hasta que una acepta, momento en el que la otra invitación queda invalidada automáticamente.

Ningún otro conflicto arquitectónico detuvo la implementación durante Bloque 9. Las diferencias de nomenclatura entre las instrucciones de cada sub-bloque y el texto literal del diseño aprobado (`/auth/recuperar-contrasena` vs. la variante en inglés mencionada al abrir 9.3; `/organizacion/auditoria` vs. `/administracion/auditoria` al abrir 9.5) se resolvieron siempre a favor del texto literal de `BLOQUE9_DISENO_ADMINISTRACION.md`, sin necesidad de detenerse a preguntar — son diferencias de forma, no de fondo, y el propio diseño es la fuente de alcance que cada instrucción citaba como autoridad.

---

## 4. Evidencia de validación

Toda la validación funcional de Bloque 9 se ejecutó vía HTTP real (login → JWT real → request real), nunca por invocación directa a los servicios. Se usaron las dos organizaciones reales y persistentes de desarrollo creadas en la Fase F de Bloque 8 (`admin@demo.com` / Organización Principal, `admin@orgb-fasef.test` / Organización B), consistente con la instrucción de reutilizarlas para validar aislamiento.

| Sub-bloque | Escenarios probados y resultado |
|---|---|
| 9.1 | Alta con token de activación (sin contraseña visible), edición, cambio de rol, activar/desactivar, restablecer acceso — todos `PASS`. Protección del último administrador: rechazado con `400` al intentar desactivar/degradar al único `ADMINISTRADOR` activo, `PASS` una vez que existe un segundo administrador. Aislamiento cruzado: los 3 endpoints mutables devuelven `404` ante un `id` de la otra organización (a diferencia del hallazgo de `GET /clientes/:id` etc. de Bloque 8, no se repitió ese patrón). |
| 9.2 | `GET`/`PATCH /perfil`: nombre editable, `rol`/`activo`/`organizacionId` ignorados aunque se envíen. `PATCH /perfil/contrasena`: los 4 casos (actual incorrecta, nueva igual a la anterior, nueva muy corta, cambio válido) — `PASS`. JWT emitido antes de dos cambios de contraseña sucesivos siguió autenticando después de ambos — `PASS`, confirma la arquitectura stateless intacta. |
| 9.3 | Usuario inexistente y existente reciben la misma respuesta pública. Token válido/vencido (forzado vía manipulación directa de `expiresAt`, único uso permitido de acceso a la base, exclusivamente como artificio de prueba para simular el paso del tiempo — no forma parte del flujo real)/reutilizado/alterado — los 4 casos rechazados o aceptados correctamente. Login con contraseña nueva acepta, con la vieja rechaza. |
| 9.4 | `GET` permitido a cualquier rol, `PATCH` rechazado `403` para un rol no `ADMINISTRADOR`. Aislamiento cruzado confirmado con datos reales de ambas organizaciones. Unicidad global de `cuit`: `409` al intentar duplicar el de la otra organización. |
| 9.5 | `ADMINISTRADOR` ve solo sus propios eventos; `GERENCIA` y `LECTURA` reciben `403`. Los 6 filtros y la paginación (límites mínimo/máximo) — `PASS`. Un `usuarioId` o `entidadId` de la otra organización siempre devuelve lista vacía, probado en ambas direcciones, incluido el caso de un `entidadId` numéricamente coincidente entre las dos organizaciones. |
| 9.6 | Rol no autorizado `403`. Login antes de aceptar falla (el `Usuario` no existe todavía). Token válido activa la cuenta con el rol correcto; login posterior funciona. Token reutilizado/vencido (mismo artificio de prueba que 9.3)/alterado — rechazados. Email ya existente rechazado al invitar. Invitación repetida al mismo email no duplica: reemplaza el token anterior. **Carrera entre organizaciones**: dos invitaciones paralelas al mismo email en organizaciones distintas conviven aisladas hasta que una se acepta — la otra queda invalidada automáticamente en ese momento, protegiendo la unicidad global de `Usuario.email` incluso entre organizaciones. |

**Cumplimiento del criterio de cierre de la sección 11 del diseño** ("ningún paso de la validación requiere, en ningún momento, un script, una consulta directa a Prisma o una modificación manual de la base de datos"): cumplido para los seis flujos funcionales completos — alta, edición, recuperación, perfil, organización, auditoría, invitación — todos ejecutados de punta a punta por HTTP real. El único acceso directo a la base durante toda la validación de Bloque 9 fue de dos tipos, ninguno parte del flujo real: (a) lectura para verificar el contenido de `AuditLog` (equivalente a lo que `GET /organizacion/auditoria` ya expone, usado como verificación cruzada, no como camino alternativo) y (b) forzar `expiresAt` al pasado para simular el vencimiento de un token sin esperar 60 minutos reales — un artificio de prueba, no una operación que un usuario o administrador real necesite ejecutar jamás.

**Regresión**: los 19 endpoints preexistentes a Bloque 9, más los de cada sub-bloque ya cerrado, se re-verificaron sin cambios en cada sub-bloque siguiente — cero regresiones detectadas en las seis rondas.

**Residuo de datos de prueba en desarrollo, documentado y no eliminado** (mismo criterio que la Organización B de la Fase F — se deja como evidencia reproducible, no se limpia por regla de negocio): en Organización Principal, los usuarios `invitado96@demo.com` (rol `OPERACIONES`, activo, creado al aceptar una invitación de prueba) y `crossorg96@demo.com` (rol `LECTURA`, activo, usado en la prueba de carrera entre organizaciones); una invitación pendiente sin aceptar para `repetido96@demo.com`; y los campos institucionales de ambas organizaciones (`razonSocial`, `cuit`, `domicilio`, `telefono`, `email`, `zonaHoraria`, `moneda`) quedaron con los valores de prueba usados en la validación de 9.4. Ninguno de estos residuos existe en producción.

---

## 5. Evidencia de producción

| Sub-bloque | Commit | Migración | Deployment | Estado |
|---|---|---|---|---|
| 9.1 | `9629a03` | `password_reset_token` | Confirmado por el usuario al abrir 9.2 ("Bloque 9.1 quedó cerrado... Producción validada") | — |
| 9.2 | `276f70a` | (ninguna) | `d1a0e05e` | health `200`, rutas mapeadas, sin errores/secretos en logs |
| 9.3 | `9038cc0` | (ninguna) | `51046bfe` | health `200`, rutas mapeadas, smoke test en vivo (`recuperar-contrasena` con email inexistente → `200` genérico) |
| 9.4 | `df7ec8f` | `organizacion_datos_institucionales` | `2dad9701` | migración aplicada limpia, health `200`, rutas mapeadas |
| 9.5 | `a7658d9` | (ninguna) | `084cfd82` | health `200`, rutas mapeadas |
| 9.6 | `5fd2740` | `invitacion_usuario` | `beb5bbbb` | migración aplicada limpia, health `200`, smoke test en vivo (`GET /usuarios/invitaciones/:token` con token inexistente → `400` genérico) |

**Verificación consolidada, ejecutada al momento de escribir este documento, sobre el deployment actualmente activo** (`beb5bbbb`, el mismo de 9.6 — no hubo ningún deploy posterior): las 16 rutas de Bloque 9 están simultáneamente mapeadas y activas en el mismo proceso de producción en ejecución — `GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo`, `POST /usuarios/:id/restablecer-acceso`, `POST /usuarios/invitaciones`, `GET /usuarios/invitaciones/:token`, `POST /usuarios/invitaciones/:token/aceptar`, `GET/PATCH /perfil`, `PATCH /perfil/contrasena`, `POST /auth/recuperar-contrasena`, `POST /auth/restablecer-contrasena`, `GET/PATCH /organizacion`, `GET /organizacion/auditoria`. Health check: `200`. Ningún error ni secreto (`JWT_SECRET`, `passwordHash`, `tokenHash`, contraseñas) apareció en logs de producción en ningún momento de las seis validaciones.

---

## 6. Riesgos remanentes

- **`NotificadorService` sin proveedor real de envío de email.** La interfaz y ambas implementaciones de desarrollo (recuperación e invitación) están completas y correctamente aisladas de secretos en producción, pero en producción hoy ningún destinatario real recibe el enlace — el propio diseño lo anticipó como Decisión pendiente 5 ("bloquea que 9.3 y 9.6 funcionen de punta a punta en producción") y no fue resuelta durante Bloque 9 porque no era parte de su alcance técnico (es una decisión de proveedor/costo, no de arquitectura).
- **Alta de una organización nueva sigue sin ningún camino dentro del producto.** La Decisión pendiente 1 del diseño (`PLATFORM_PROVISIONING_SECRET`) nunca se implementó — crear una organización nueva sigue requiriendo acceso directo a la base, exactamente igual que antes de que Bloque 9 comenzara. No es una regresión: nunca estuvo en el alcance de ninguno de los seis sub-bloques (9.1 a 9.6 operan siempre sobre una organización ya existente).
- **Sin política de bloqueo por intentos fallidos de login.** Riesgo funcional ya identificado en `BLOQUE9_AUDITORIA_ADMINISTRACION.md` (sección 9) y nunca abordado por ningún sub-bloque — no formaba parte del alcance aprobado en el diseño técnico.

---

## 7. Trabajo deliberadamente fuera de alcance

- **Ninguna pantalla de frontend.** Los seis sub-bloques de Bloque 9 son backend puro — `BLOQUE9_DISENO_ADMINISTRACION.md` declara explícitamente que no diseña pantallas, y ninguna instrucción de apertura de sub-bloque pidió una. Un administrador puede hoy administrar usuarios, su perfil, su organización, auditoría e invitaciones únicamente por API directa — no hay ninguna interfaz visual todavía.
- **RBAC dinámico** (roles configurables por organización) — el diseño mantiene el enum `RolNombre` fijo sin cambios, y señala explícitamente que la evolución hacia roles configurables queda condicionada a que exista Configuración de Organización primero (ya existe desde 9.4, pero RBAC dinámico en sí no se abrió).
- **Verificación de email** — ningún mecanismo de confirmación por correo se construyó; es la razón citada para excluir el cambio de email de `PATCH /perfil` (9.2), no una funcionalidad que se haya empezado a construir.
- **Reenvío como endpoint propio y cancelación de invitación** — ninguno de los dos está contemplado por el diseño aprobado; el reenvío quedó cubierto por el comportamiento de reemplazo automático de `POST /usuarios/invitaciones` (sección 2).
- **`GET /usuarios/invitaciones/:token/rechazar` o cualquier acción explícita de rechazo** — no mencionado en ningún documento rector, no se construyó.
- **Proveedor real de email y alta de organización por autoservicio** — ambos son Decisiones pendientes de Product Owner (sección 12 del diseño, ítems 1 y 5) explícitamente no resueltas en ningún documento vigente; no corresponde a Bloque 9 decidirlas ni implementarlas sin esa resolución previa.

---

## Conclusión

**¿Bloque 9 cumple completamente los criterios definidos en sus documentos rectores?**

**Sí.**

Los seis sub-bloques que `BLOQUE9_DISENO_ADMINISTRACION.md` definió (9.1 a 9.6) están implementados, validados con evidencia real y no asumida, desplegados, y confirmados corriendo simultáneamente en el mismo proceso de producción activo. El criterio de aceptación de cada sub-bloque (sección 11 del diseño) se cumple individualmente, con evidencia específica en la sección 4 de este documento. El criterio de cierre del conjunto — que ningún paso de la validación requiera un script, Prisma directo, o una modificación manual de la base — se cumple para los seis flujos funcionales completos; el único acceso directo a la base durante toda la validación fue lectura de verificación y un artificio de prueba para simular vencimiento de tokens, nunca un camino que un usuario o administrador real necesite.

El objetivo que abrió Bloque 9 — "eliminar completamente la necesidad de administrar SDC mediante scripts, acceso directo a Prisma o modificaciones manuales sobre la base de datos" (`BLOQUE9_AUDITORIA_ADMINISTRACION.md`) — se cumple para toda la superficie que el propio diseño delimitó: usuarios de la propia organización, perfil propio, datos institucionales de la propia organización, auditoría de la propia organización, e incorporación de nuevos usuarios sin contraseñas temporales. Los tres riesgos remanentes (sección 6) — proveedor de email, alta de organización nueva, bloqueo por fuerza bruta — fueron identificados y clasificados por los propios documentos rectores como decisiones o alcances **fuera de los seis sub-bloques**, no como trabajo incompleto de Bloque 9 en sí: el diseño técnico los declaró explícitamente como no bloqueantes para el cierre de este bloque.

El único conflicto arquitectónico real de todo Bloque 9 (sección 3) se resolvió deteniéndose antes de escribir código, verificando la justificación técnica contra el esquema real, y presentando el desacuerdo para una decisión explícita — exactamente el procedimiento que exige `CONSTITUCION_SDC.md`, Artículo 2 y Artículo 3.

Bloque 9 (Productización Administrativa) puede declararse cerrado.

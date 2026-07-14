# Acta de Cierre — Frontend Administrativo de Bloque 9

Fecha: 2026-07-14. Documento de cierre de `METODOLOGIA_SDC.md`, etapa 9, para la extensión de frontend que convierte las 16 rutas de backend ya cerradas en `ACTA_CIERRE_BLOQUE9.md` en capacidades utilizables desde la interfaz. Se apoya en `BLOQUE9_FRONTEND_AUDITORIA.md` (diagnóstico del frontend existente) y `BLOQUE9_FRONTEND_DISENO.md` (plan técnico), ambos ya aprobados — este documento no repite su contenido, solo evalúa si el resultado construido cumple lo que definieron.

---

## 1. Objetivo del Frontend Administrativo

Responder, con evidencia y no por diseño en el papel, la pregunta que abrió esta extensión: que todas las capacidades administrativas de Bloque 9 (perfil propio, organización propia, recuperación de contraseña, invitaciones, administración de usuarios, auditoría) puedan usarse completamente desde la interfaz, sin depender de `curl`, Postman, ni acceso directo a la base — reutilizando al máximo el frontend ya existente, sin introducir librerías nuevas ni un sistema de diseño distinto al que ya tenía el resto de la aplicación.

---

## 2. Pantallas y flujos implementados

| Pantalla / flujo | Archivo | Commit |
|---|---|---|
| Mi Perfil | `frontend/src/pages/Perfil.tsx` | `d99eaac` |
| Mi Organización | `frontend/src/pages/Organizacion.tsx` | `d99eaac` |
| Recuperar contraseña | `frontend/src/pages/RecuperarContrasena.tsx` | `8057dff` |
| Restablecer contraseña | `frontend/src/pages/RestablecerContrasena.tsx` | `8057dff` |
| Aceptar invitación | `frontend/src/pages/AceptarInvitacion.tsx` | `1751f7d` |
| Administración de Usuarios | `frontend/src/pages/Usuarios.tsx` | `65b1f4f` |
| Auditoría Administrativa | `frontend/src/pages/AuditoriaAdministrativa.tsx` | `0541e30` |

Siete archivos nuevos, cinco commits, cada uno validado y desplegado antes de empezar el siguiente — ningún grupo se implementó sobre un grupo anterior sin verificar primero que ese anterior funcionaba en producción.

---

## 3. Rutas públicas y autenticadas

**Públicas** (fuera de `Layout`, sin sesión, `App.tsx`):
- `/recuperar-contrasena`
- `/restablecer-contrasena`
- `/aceptar-invitacion`

**Autenticadas** (dentro de `<Route element={<Layout />}>`):
- `/perfil` — cualquier rol
- `/organizacion` — cualquier rol (edición condicionada, sección 4)
- `/administracion/usuarios` — `ADMINISTRADOR`
- `/administracion/auditoria` — `ADMINISTRADOR`

Ninguna ruta pública redirige a `/login` ni exige token; ninguna ruta autenticada aparece en el menú si el rol no corresponde (`Layout.tsx`, `NAV_ITEMS`).

---

## 4. Roles y permisos

- **Cualquier rol autenticado**: `GET /perfil`, `PATCH /perfil`, `PATCH /perfil/contrasena`, `GET /organizacion`.
- **Solo `ADMINISTRADOR`**: `PATCH /organizacion` (formulario oculto para el resto, no solo deshabilitado), las 5 mutaciones de `/administracion/usuarios`, y toda la pantalla `/administracion/auditoria`.
- **Sin sesión**: los 3 flujos públicos (recuperar/restablecer contraseña, aceptar invitación).

El frontend nunca reemplaza al backend como autoridad de permisos — donde el backend ya rechaza con `403` (las mutaciones de usuarios y organización), el frontend solo oculta el control y traduce el mensaje. Donde el backend **no** distingue por rol a nivel de lectura (`GET /usuarios`, `GET /organizacion/auditoria` — decisión ya cerrada de Bloque 9, sección 9), el frontend agrega un chequeo propio para no exponer datos por acceso directo — detallado en la sección 9.

---

## 5. Reutilización de componentes y patrones existentes

Confirmado por inspección de cada archivo, sin excepciones:
- **`Layout`** — las 4 rutas autenticadas heredan sidebar, sesión y guard sin ningún cambio a su lógica interna (solo se agregaron entradas a `NAV_ITEMS`).
- **`api` (`api/client.ts`)** — sin cambios, usado tal cual en los 7 archivos nuevos.
- **`useAsyncAction`** — usado en las 7 pantallas para estados `busy`/`error`/`success`.
- **`ConfirmProvider`/`useConfirm`** — usado en `Usuarios.tsx` para desactivar/activar/restablecer acceso, con `severity: "high"` en las acciones sensibles.
- **Patrón visual de `Login.tsx`** (`.login-page`/`.login-card`) — reutilizado tal cual en las 3 rutas públicas, sin extraer un componente ni crear un layout público nuevo.
- **Patrón config-driven de `Catalogos.tsx`** — inspiró los 3 formularios de `Usuarios.tsx` (campos como datos, no JSX repetido).
- **Patrón `.filters` de `Viajes.tsx`** — reutilizado en `AuditoriaAdministrativa.tsx`.
- **Clases CSS existentes** (`.card`, `.form-grid`, `.filters`, `.error-banner`, `.success-banner`, `.btn`/variantes, `table`, `.muted`) — únicas usadas; las únicas dos reglas CSS nuevas de todo el trabajo son las del enlace "Mi perfil" dentro de `.user-info` (`styles.css`, agregadas en `d99eaac`), consistentes con los colores ya usados en el sidebar.

**Cero librerías nuevas** — confirmado en los 5 `package.json` sin diferencias (`react`, `react-dom`, `react-router-dom`, `axios`, sin agregados). Ningún componente existente fue refactorizado; los únicos archivos preexistentes modificados fueron `App.tsx`, `Layout.tsx` y `Login.tsx` (un enlace agregado), siempre de forma aditiva.

---

## 6. Validaciones realizadas

Cada uno de los 5 grupos se validó en navegador real (no solo `curl`), con la misma disciplina: build de frontend y backend limpios antes de cada commit, servidores locales levantados, flujo ejercitado con capturas de pantalla, consola revisada, y solo entonces commit → push → verificación de despliegue. En conjunto:

- **Build**: 5/5 builds de frontend limpios (`tsc -b && vite build`), 5/5 builds de backend limpios (sin cambios, verificados igual por disciplina).
- **Consola**: sin errores de aplicación en ninguno de los 5 grupos — el único ruido detectado y confirmado como no-relacionado fue el de la propia extensión de automatización del navegador usada para probar, nunca del código de la aplicación.
- **Regresión**: verificada en cada grupo sobre las pantallas ya existentes (las 16 previas al Bloque 9, más cada grupo ya cerrado de este mismo trabajo) — cero regresiones detectadas.
- **Casos de negocio cubiertos**: formatos inválidos bloqueados sin llegar al backend (email, longitud mínima de contraseña, coincidencia de contraseñas — validación nativa del navegador, sin duplicar esa lógica en JavaScript); mensajes genéricos de recuperación/invitación que nunca revelan si una cuenta existe; token de un solo uso nunca persistido fuera del estado local del componente ni impreso en consola; protección visual y real del último administrador (sección 7); alta directa vs. invitación mantenidas como dos acciones explícitamente distintas, nunca mezcladas.

---

## 7. Evidencia de aislamiento multiempresa

Probado con las dos organizaciones reales y persistentes de desarrollo (Fase F de Bloque 8), en los grupos donde aplica:

- **Mi Organización** (grupo 1): Organización A y Organización B editadas de forma independiente; ninguna operación sobre una alteró la otra.
- **Aceptar Invitación** (grupo 3): invitación de Organización A creó el usuario en A; invitación de Organización B creó el usuario en B — probado además con una **sesión de Organización A activa** en el navegador al momento de aceptar la invitación de B, confirmando que el origen de los datos es siempre el token, nunca la sesión del navegador.
- **Administración de Usuarios** (grupo 4): Organización B mostró únicamente sus 2 propios usuarios, sin ningún rastro de los ~13 de Organización A.
- **Auditoría Administrativa** (grupo 5): Organización A mostró 59 eventos propios, Organización B mostró 6 eventos propios — cero eventos cruzados, confirmado además con un `entidadId` numéricamente repetido entre ambas organizaciones sin mezclar resultados.

Ninguna pantalla nueva agrega su propio mecanismo de aislamiento — las 7 heredan el ya cerrado en Bloque 8 (AsyncLocalStorage + Prisma Extension) a través de los endpoints que consumen, sin excepción.

---

## 8. Evidencia de producción

Los 5 commits fueron desplegados y verificados en el mismo entorno de producción (`cereales-transport` backend, `perceptive-tranquility` frontend, ambos en Railway):

| Grupo | Commit | Ruta verificada | Health backend | Logs |
|---|---|---|---|---|
| 1 | `d99eaac` | `/perfil`, `/organizacion` → `200` | `200` | sin errores ni secretos |
| 2 | `8057dff` | `/recuperar-contrasena`, `/restablecer-contrasena` → `200`; `POST /auth/recuperar-contrasena` probado en vivo | `200` | sin errores ni secretos |
| 3 | `1751f7d` | `/aceptar-invitacion` → `200`; token inexistente probado en vivo (`400` genérico) | `200` | sin errores ni secretos |
| 4 | `65b1f4f` | `/administracion/usuarios` → `200` | `200` | sin errores ni secretos |
| 5 | `0541e30` | `/administracion/auditoria` → `200` | `200` | sin errores ni secretos |

En ningún momento se creó, editó ni desactivó un usuario real de producción, ni se consultaron auditorías reales más allá de una comprobación mínima de disponibilidad — toda la validación funcional profunda se hizo exclusivamente contra el entorno de desarrollo.

---

## 9. Conflictos encontrados durante la implementación y cómo se resolvieron

**Conflicto arquitectónico real (grupo 4, Administración de Usuarios).** `GET /usuarios` no está restringido por rol en el backend — es una decisión ya cerrada de 9.1, cualquier rol autenticado puede leerlo. La instrucción de ese grupo exigía que un rol no autorizado, por acceso directo a la URL, nunca viera datos. Se verificó el conflicto de forma empírica (acceso directo con `GERENCIA` mostró el listado completo antes del ajuste) y se resolvió replicando el patrón ya usado en `Organizacion.tsx`: un chequeo de `usuario.rol` dentro del propio componente que ni siquiera llama a `GET /usuarios` para un rol no autorizado — sin tocar el backend, sin inventar un guard de ruta genérico nuevo. El mismo patrón se aplicó preventivamente en `AuditoriaAdministrativa.tsx` (grupo 5), donde `GET /organizacion/auditoria` tiene la misma característica.

**Hallazgo técnico — enlace del token de activación (grupo 4).** El token que devuelven `POST /usuarios` y `POST /usuarios/:id/restablecer-acceso` es un `PasswordResetToken` (mismo mecanismo de 9.1/9.3), que se canjea en `/restablecer-contrasena` — no en `/aceptar-invitacion`, que es exclusiva de las invitaciones de 9.6 (`InvitacionUsuario`). Se verificó el contrato real del backend antes de construir el enlace, evitando enviar a un administrador un enlace que hubiera fallado al canjearse.

**Hallazgo funcional — mensaje de éxito de "Invitar usuario" (grupo 4).** La primera versión cerraba el panel de invitación inmediatamente después de un envío exitoso, antes de que el mensaje de confirmación llegara a mostrarse (la limpieza del estado se ejecutaba en la misma función que fijaba el mensaje). Detectado durante la validación en navegador, corregido antes del commit: el panel permanece abierto tras invitar, con los campos limpios, listo para una invitación nueva.

Ningún conflicto requirió modificar el backend, agregar una librería, ni abrir un nuevo ciclo de diseño.

---

## 10. Dependencias externas pendientes

**Proveedor real de email (`NotificadorService`).** Ya identificado como riesgo no bloqueante en `ACTA_CIERRE_BLOQUE9.md` y anticipado en `BLOQUE9_FRONTEND_DISENO.md`, sección 10. Las pantallas de Recuperar Contraseña y Aceptar Invitación quedan completamente construidas y funcionales de punta a punta contra el backend real — pero en producción, mientras no exista un proveedor configurado, ningún destinatario recibe el enlace por ningún canal automático. La única vía hoy para que un `ADMINISTRADOR` entregue acceso en producción es el flujo de alta directa (`Usuarios.tsx`), que devuelve el enlace en la propia respuesta para compartir manualmente. Esta dependencia es de negocio (elegir y configurar un proveedor), no de este trabajo de frontend.

---

## 11. Riesgos remanentes no bloqueantes

- **Sin proveedor de email** — ya detallado en la sección 10.
- **`GET /usuarios` y `GET /organizacion/auditoria` sin restricción de rol a nivel de API** — mitigado en el frontend (sección 9), pero sigue siendo cierto que una llamada directa a la API (no a través del navegador) con un token de un rol no `ADMINISTRADOR` puede leer esos dos endpoints. No es una regresión de este trabajo — es el mismo contrato ya cerrado en Bloque 9 backend — pero queda como una asimetría conocida entre lo que el frontend protege y lo que la API expone.
- **Sin listado de invitaciones pendientes** — ya señalado en `BLOQUE9_FRONTEND_DISENO.md`, sección 10: el backend no expone ninguna forma de listar invitaciones no aceptadas, así que la pantalla de Usuarios tampoco puede mostrarlas.
- **`GET /usuarios` sin paginación ni búsqueda** — la tabla de Administración de Usuarios carga el listado completo; correcto para los volúmenes actuales, sería una dependencia de backend si crece de forma significativa.

Ninguno de estos cuatro riesgos es nuevo respecto de lo ya documentado en los cierres previos de Bloque 9 — se listan acá para que este cierre quede autocontenido, no porque este trabajo los haya introducido.

---

## 12. Confirmación de cobertura de las 16 rutas administrativas

| Ruta backend | Pantalla que la consume |
|---|---|
| `GET /perfil` | Mi Perfil |
| `PATCH /perfil` | Mi Perfil |
| `PATCH /perfil/contrasena` | Mi Perfil |
| `GET /organizacion` | Mi Organización |
| `PATCH /organizacion` | Mi Organización |
| `POST /auth/recuperar-contrasena` | Recuperar contraseña |
| `POST /auth/restablecer-contrasena` | Restablecer contraseña |
| `GET /usuarios/invitaciones/:token` | Aceptar invitación |
| `POST /usuarios/invitaciones/:token/aceptar` | Aceptar invitación |
| `GET /usuarios` | Administración de Usuarios |
| `POST /usuarios` | Administración de Usuarios |
| `PATCH /usuarios/:id` | Administración de Usuarios |
| `PATCH /usuarios/:id/activo` | Administración de Usuarios |
| `POST /usuarios/:id/restablecer-acceso` | Administración de Usuarios |
| `POST /usuarios/invitaciones` | Administración de Usuarios |
| `GET /organizacion/auditoria` | Auditoría Administrativa |

**16 de 16 rutas tienen contraparte utilizable desde la interfaz.** Ninguna quedó sin pantalla, ninguna pantalla consume un endpoint que no esté en esta lista.

---

## Conclusión

**¿Puede considerarse cerrado el Frontend Administrativo de Bloque 9?**

**Sí.**

Las 16 rutas administrativas cerradas en `ACTA_CIERRE_BLOQUE9.md` tienen hoy una pantalla real, validada en navegador, aislada correctamente entre organizaciones, y desplegada en producción. El único conflicto arquitectónico real que apareció durante la implementación se resolvió sin tocar el backend ni inventar arquitectura nueva, reutilizando un patrón ya establecido en el propio frontend. Los dos hallazgos técnicos (enlace del token, mensaje de invitación) se corrigieron antes de cada commit correspondiente, no quedaron como deuda. El trabajo se completó sin agregar una sola librería y sin refactorizar ningún componente preexistente, tal como exigía el alcance aprobado.

La única dependencia que impide que el sistema funcione de punta a punta para un cliente real hoy —el proveedor de email— es una decisión de negocio ya identificada y explícitamente fuera del alcance de este trabajo, tanto en el backend (`ACTA_CIERRE_BLOQUE9.md`) como en el frontend (`BLOQUE9_FRONTEND_DISENO.md`).

El Frontend Administrativo de Bloque 9 queda cerrado.

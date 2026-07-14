# Bloque 9 — Auditoría Funcional de Administración

Fecha: 2026-07-13. Documento de análisis funcional, no de diseño técnico — no se escribió código, no se modificó ningún archivo, no se generaron migraciones. Cita `archivo:línea` real en cada afirmación, según la disciplina ya establecida en `METODOLOGIA_SDC.md`.

**Pregunta que responde:** ¿qué necesita SDC para administrarse completamente desde el propio sistema, sin depender del desarrollador?

---

## 1. Administración de Organizaciones

**Estado real del modelo** (`schema.prisma:80-104`): `Organizacion` tiene exactamente 3 campos — `id`, `nombre`, `createdAt`. Nada más. Es, literalmente, el mínimo que Bloque 8.1.b Etapa 1 definió a propósito ("sin configuración comercial, moneda, branding, planes, límites todavía — fuera de alcance de esta etapa").

**Ciclo de vida completo, analizado punto por punto:**

- **Alta**: no existe ningún endpoint. La única forma de crear una `Organizacion` hoy es acceso directo a la base — usado dos veces en este proyecto (Backfill de Bloque 8.1.b, y la Organización de prueba de la Fase F). Es, con evidencia ya demostrada dos veces, el hueco más crítico de todo el bloque.
- **Edición**: no existe ningún endpoint. Ni siquiera se puede cambiar el `nombre` de una organización sin acceso directo a la base.
- **Activación/Desactivación**: no existe el concepto. `Organizacion` no tiene un campo `activo` (a diferencia de `Usuario`, `Cliente`, `Transportista`, `Chofer`, `Vehiculo`, que sí lo tienen). Hoy no hay forma de suspender una organización — ni por falta de pago, ni por decisión comercial, ni por cierre de cuenta — sin borrar filas.
- **Datos fiscales**: no existen. No hay CUIT, razón social fiscal, domicilio fiscal, condición ante IVA — nada de lo que ya existe, por ejemplo, en `Cliente` (`schema.prisma:129-146`, que sí tiene `cuit`).
- **Configuración general**: no existe ningún campo de configuración — se detalla en la sección 5.
- **Restricciones**: no hay ningún límite modelado (cantidad de usuarios, de viajes, de almacenamiento) — no hay campo donde guardarlo, ni lógica que lo verifique.
- **Validaciones**: al no existir ningún endpoint de escritura, no hay ninguna validación de negocio sobre `Organizacion` hoy — el único control existente es el `@@unique` implícito de `id` y las FKs compuestas que dependen de ella (Bloque 8.1.b.4.3), que protegen la integridad de los datos que cuelgan de una organización, no la organización en sí.

**Relación con `Usuario`, ya confirmada por el propio modelo**: un `Usuario` pertenece a exactamente una `Organizacion` (`organizacionId String`, no nullable, `schema.prisma:109`) — decisión ya aprobada en Bloque 8.1 (Decisión 1 del diseño), no vuelve a discutirse acá.

---

## 2. Administración de Usuarios

**Estado real** (`UsuariosController`, `backend/src/catalogos/simples.controller.ts:55-60`): el controller completo tiene **un único método**:

```
@Get() findAll() {
  return this.prisma.usuario.findMany({ select: { id, nombre, email, rol, activo } });
}
```

No hay `POST`, no hay `PATCH`, no hay `DELETE`. Ningún endpoint de creación, edición, cambio de contraseña, activación, desactivación o bloqueo.

**Ciclo completo, analizado contra el modelo real** (`schema.prisma:107-126`, campos disponibles: `id`, `organizacionId`, `nombre`, `email` único global, `passwordHash`, `rol`, `activo`, `createdAt`):

- **Alta**: no existe ningún endpoint. Confirmado como bloqueante dos veces en la práctica (Bloque 8, Fase F) — el usuario administrador de cada organización nueva se creó por script directo, con `bcrypt.hash` manual.
- **Baja lógica**: el campo `activo` ya existe en el modelo, y `AuthService.login` (`auth.service.ts:12`) ya lo verifica (`if (!usuario || !usuario.activo) throw new UnauthorizedException(...)`) — el comportamiento de negocio de "usuario desactivado no puede loguear" **ya está implementado**, lo que falta es únicamente el endpoint para cambiar ese campo.
- **Edición**: no existe. No se puede cambiar el nombre, el email o el rol de un usuario existente sin acceso directo a la base.
- **Cambio de contraseña**: no existe ningún endpoint, ni siquiera para que el propio usuario cambie su contraseña actual conociéndola.
- **Recuperación**: no existe el concepto — no hay campo de token de recuperación, no hay endpoint, no hay ningún flujo de "olvidé mi contraseña". Se detalla en la sección 7.
- **Activación/Desactivación**: el campo existe (`activo`), el comportamiento de negocio en login ya existe — falta únicamente la superficie para modificarlo.
- **Bloqueo/Desbloqueo**: no existe el concepto. No hay campo que distinga "desactivado por un administrador" de "bloqueado automáticamente por intentos fallidos" — es un concepto nuevo, no una superficie faltante sobre algo que ya existe (a diferencia de activo/inactivo).
- **Roles**: el campo `rol` existe (`RolNombre`, enum fijo de 6 valores — ver sección 3), pero no hay ningún endpoint para asignarlo o cambiarlo después del alta.

**Relación Usuario↔Organización, tal como está implementada hoy** (no vuelve a discutirse el diseño, solo se deja registrada la implicancia funcional): un usuario nunca puede moverse de organización ni pertenecer a más de una — cualquier flujo de "invitar a un usuario existente a otra organización" queda, por diseño ya aprobado, fuera de alcance; la única operación posible es dar de alta un usuario nuevo dentro de la organización de destino.

---

## 3. Roles y permisos

**Qué funciona**: el sistema de roles actual (`roles.decorator.ts`, `roles.guard.ts`) es simple y ya probado en producción — un decorador `@Roles(...)` por endpoint, un guard que deja pasar a `ADMINISTRADOR` sin condición (`roles.guard.ts:17`) y verifica membresía en la lista para el resto. Con la arquitectura de aislamiento de Bloque 8, `ADMINISTRADOR` ya está correctamente acotado a los datos de su propia organización (verificado en la auditoría de cierre de Bloque 8) — el sistema de roles hoy **no tiene ningún hueco de seguridad conocido**, solo huecos de flexibilidad.

**Qué falta:**
- Los 6 roles (`RolNombre`, `schema.prisma:11-18`) son un **enum nativo de Postgres**, no una tabla — son fijos a nivel de motor de base de datos, idénticos para las 20 (y futuras) organizaciones. No existe, ni puede existir sin una migración de schema, un rol distinto por organización.
- No hay ningún endpoint para consultar qué puede hacer cada rol — los permisos están repartidos, endpoint por endpoint, en decoradores `@Roles(...)` dentro del código (confirmado en la auditoría de cierre de Bloque 8: docenas de líneas `@Roles(...)` distintas en los controllers). No hay una fuente única consultable.
- No hay permisos a nivel de acción dentro de un mismo endpoint (por ejemplo, un rol que pueda ver una liquidación pero no anularla) — hoy el control es por endpoint completo, no por acción.

**Qué debe mantenerse**: el mecanismo de verificación en sí (`RolesGuard`) y el principio de que `ADMINISTRADOR` es global dentro de su organización — ninguno de los dos tiene un problema identificado, cambiarlos sin motivo sería reabrir una decisión ya cerrada.

**Qué debería evolucionar** (sin diseñar la solución, solo señalar la necesidad): la rigidez de "6 roles fijos, iguales para todos" es el único punto real de fricción para un producto que se vende a distintas organizaciones con estructuras de equipo distintas — no es un defecto de seguridad, es una limitación de flexibilidad comercial.

---

## 4. Perfil del usuario

No existe ninguna pantalla ni endpoint de "mi perfil" hoy — confirmado, cero resultados al buscar en todo el frontend. Análisis de qué debería separarse cuando exista:

**Datos propios (el usuario debería poder ver/modificar sobre sí mismo):**
- Su propio nombre.
- Su propia contraseña (conociendo la actual).
- Preferencias personales de visualización, si en algún momento existieran (no existen hoy).

**Datos administrables únicamente por un administrador (nunca por el propio usuario):**
- Su propio rol — un usuario nunca debería poder auto-asignarse más permisos.
- Su propio estado `activo`/inactivo — un usuario no puede autodesactivarse ni reactivarse.
- Su propio `email`, dado que hoy es la clave de login y es único a nivel global de todo el sistema (`schema.prisma:111`, `@unique`, no por organización — decisión ya aprobada en Bloque 8.1.c) — permitir que el propio usuario lo cambie sin control introduce un riesgo de secuestro de cuenta si no hay verificación de por medio; corresponde tratarlo como una operación sensible, no como edición de perfil libre.
- Su propia organización — nunca modificable por nadie, ni siquiera un administrador, según el diseño ya aprobado (un usuario pertenece a una sola organización, de forma permanente).

---

## 5. Configuración de Organización

Contra el modelo real de 3 campos (sección 1), todo lo siguiente hoy **no tiene dónde guardarse**:

- Razón social, CUIT, domicilio, teléfono, email de contacto — datos fiscales/administrativos básicos, hoy inexistentes en `Organizacion`.
- Logo / branding — hoy hardcodeado en el código del frontend, no por organización (`Layout.tsx:32`, `Login.tsx:30`, texto fijo "Dador de Carga").
- Moneda — hoy no hay ningún campo de moneda en ningún modelo; el formateo (`Intl.NumberFormat("es-AR", { currency: "ARS", ... })`, visto por ejemplo en `clientes.controller.ts`) está hardcodeado en el código, no en datos.
- Zona horaria — no existe el concepto en ningún lugar del sistema hoy.
- Formatos (fecha, número) — hardcodeados vía `Intl` con configuración regional fija (`es-AR`), no parametrizables.
- Numeraciones — ligado a un hallazgo ya documentado en `ACTA_CIERRE_BLOQUE8.md`: `Viaje.numeroViaje` y `Liquidacion.numero` son secuencias **globales** de Postgres (`@default(autoincrement())`), no reiniciables ni configurables por organización. Cualquier necesidad futura de "que cada organización vea su numeración empezando desde 1" no es hoy un problema de falta de configuración — es una limitación estructural del modelo de datos, ya señalada como deuda técnica conocida.
- Parámetros comerciales — no hay ningún campo de configuración comercial (por ejemplo, comisión por defecto, condiciones de pago por defecto) a nivel de organización; hoy cada entidad (`Cliente.condicionesComerciales`, `Chofer.comisionPct`) guarda su propio valor, sin un default configurable a nivel de organización que se pueda aplicar al dar de alta una nueva.

No se agota en esta lista, tal como pidió el alcance — pero es la lista concreta y verificada contra el código real, no una lista genérica.

---

## 6. Auditoría administrativa

**Estado real de `AuditLog`** (`schema.prisma:533-549`): el modelo existe, con `organizacionId`, `usuarioId`, `entidad`, `entidadId`, `accion`, `datosAnteriores`, `datosNuevos`, `fecha` — ya protegido por el aislamiento de Bloque 8. Pero su uso real, confirmado por búsqueda en todo el backend, se limita a **exactamente 2 puntos**: anulación de cobranza (`facturas.controller.ts:411`) y override manual del porcentaje de comisión en una liquidación (`liquidaciones.controller.ts:603`). Nada más escribe en `AuditLog` hoy — ninguna alta, edición o baja de ningún catálogo, ningún viaje, ninguna factura, ningún usuario (porque no existen esos endpoints todavía) queda registrada.

**Adicionalmente**: no existe ningún endpoint ni pantalla para **leer** `AuditLog` — confirmado, cero resultados al buscar un controller o una consulta de lectura sobre ese modelo. Es, hoy, una tabla de solo escritura que nadie puede consultar desde el producto.

**Qué eventos deberían registrarse** (análisis, no diseño de implementación): cualquier operación que este mismo bloque habilite sobre entidades sensibles — alta/baja/edición de `Usuario`, alta/edición/activación de `Organizacion`, cambios de rol, cambios de contraseña (el evento, nunca la contraseña en sí), intentos de login fallidos si se decide registrarlos (sección 7). El criterio ya existe en el propio modelo (`entidad`/`entidadId`/`accion`/`datosAnteriores`/`datosNuevos`) — lo que falta es extender su uso, no rediseñarlo.

**Qué información debería quedar auditada**: quién hizo el cambio (`usuarioId`, ya existe), cuándo (`fecha`, ya existe), qué cambió (`datosAnteriores`/`datosNuevos`, ya existe) y sobre qué organización (`organizacionId`, ya existe y ya aislado). El modelo de datos no tiene ningún hueco para esto — el hueco es exclusivamente de cobertura de uso y de superficie de lectura.

---

## 7. Seguridad

Analizado contra el estado real del módulo de autenticación (`backend/src/auth/`, confirmado por búsqueda exhaustiva: el módulo completo son 8 archivos, y ninguno contiene lógica más allá de login + validación de JWT):

- **Recuperación segura de contraseña**: no existe el concepto. No hay tabla ni campo de token de recuperación, no hay endpoint, no hay flujo de email. Es una superficie completamente nueva, no una extensión de algo existente.
- **Invitaciones**: no existe el concepto. Hoy no hay forma de que un usuario reciba una invitación para unirse a una organización — la única vía de alta, cuando exista (Bloque 9), presumiblemente será un administrador creando la cuenta directamente, no un flujo de invitación por email. Corresponde decidir esto en la etapa de diseño, no en esta auditoría.
- **Expiración**: existe parcialmente — el JWT expira a las 12 horas (`auth.module.ts:17`, `signOptions: { expiresIn: "12h" }`), pero no hay ningún mecanismo de renovación (refresh token) ni de expiración de sesión por inactividad.
- **Sesiones**: no existen como concepto propio — el sistema es completamente stateless (JWT sin persistencia de sesión en base), lo que significa que hoy **no hay forma de cerrar la sesión de un usuario de forma remota** (por ejemplo, si se sospecha que su cuenta fue comprometida) — el token sigue siendo válido hasta que expira por tiempo, sin importar qué pase con la cuenta mientras tanto.
- **Bloqueo**: no existe el concepto (ver sección 2).
- **Intentos fallidos**: no se registran ni se cuentan en ningún lado — `AuthService.login` (`auth.service.ts:10-15`) lanza `UnauthorizedException` en cada intento fallido, pero no persiste ni cuenta nada.
- **Políticas de contraseña**: no existe ninguna validación de complejidad, longitud mínima explícita, ni de reutilización — `bcrypt.hash` se aplica sobre cualquier valor que llegue (confirmado en el patrón ya usado en Backfill/Fase F), sin ninguna regla de negocio previa.

Ningún punto de esta sección tiene una solución propuesta acá — es, exactamente como pidió el alcance, el inventario del problema.

---

## 8. Dependencias

**Qué depende de qué:**
- CRUD de `Usuario` depende de que exista, como mínimo, una forma de indicar a qué `Organizacion` pertenece el usuario nuevo — es decir, depende de que Administración de Organizaciones (sección 1) tenga, como mínimo, su alta resuelta, aunque sea de forma mínima.
- Perfil del usuario (sección 4) depende de que exista Administración de Usuarios (sección 2) — no tiene sentido antes.
- Auditoría administrativa (sección 6) depende de que existan los eventos que audita — no se puede auditar el alta de un usuario antes de que el alta de usuarios exista.
- Seguridad de recuperación de contraseña (sección 7) depende de que exista, como mínimo, el modelo de usuario con un canal de contacto confiable (hoy `email` ya cumple ese rol) — no depende de nada nuevo de las otras secciones, es independiente en ese sentido.
- Roles y permisos (sección 3), en su forma evolucionada (roles configurables por organización), depende de que Configuración de Organización (sección 5) exista como concepto, porque "roles configurables por organización" es, en sí, una configuración de organización.

**Qué debería implementarse primero**: alta mínima de `Organizacion` + alta mínima de `Usuario` — es la dependencia raíz de todo lo demás, y es, además, el hallazgo ya confirmado dos veces como bloqueante real (`ROADMAP_PRODUCTO_SDC.md`, sección 10).

**Qué puede hacerse en paralelo:**
- Configuración de Organización (sección 5) puede avanzar en paralelo con CRUD de Usuarios (sección 2) — no dependen entre sí.
- Auditoría administrativa (sección 6), en la medida en que se va extendiendo evento por evento a cada nueva superficie que este bloque habilite, puede hacerse en paralelo con cada una de esas superficies, no como una etapa aparte al final.
- Seguridad (sección 7) puede avanzar en paralelo con el resto — es la sección más independiente de todas.

**Qué nunca debería adelantarse**: evolucionar Roles y permisos hacia algo configurable por organización (sección 3) antes de que exista Configuración de Organización (sección 5) — no hay dónde guardar esa configuración todavía.

---

## 9. Riesgos funcionales

(No riesgos técnicos — ya cubiertos por la arquitectura cerrada en Bloque 8.)

- **Un administrador puede quedar sin forma de recuperar su propia cuenta.** Sin recuperación de contraseña (sección 7), si el único usuario `ADMINISTRADOR` de una organización olvida su contraseña, hoy no hay ningún camino dentro del producto para resolverlo — solo acceso directo a la base.
- **Una organización puede quedar sin ningún administrador activo.** Nada impide hoy, ni impedirá automáticamente cuando exista CRUD de usuarios si no se diseña explícitamente, que se desactive al último `ADMINISTRADOR` de una organización, dejándola sin nadie que pueda administrar usuarios dentro de ella.
- **Ambigüedad de a quién pertenece un email ya usado.** `Usuario.email` es único a nivel global (no por organización) — si una persona necesita pertenecer, en algún momento, a dos organizaciones distintas con el mismo email, el sistema hoy no lo permite, y no hay ningún mensaje de error específico que explique por qué (queda como un `P2002` genérico si no se maneja explícitamente en el endpoint que todavía no existe).
- **Falta de auditoría visible genera un riesgo de confianza, no solo de seguridad.** Si un cliente pregunta "quién cambió esto", hoy no hay ninguna respuesta posible desde el producto, incluso para los pocos eventos que sí se registran en `AuditLog` — porque no hay ninguna pantalla que lo muestre.
- **Falta de bloqueo por intentos fallidos deja la puerta de login sin ninguna fricción ante fuerza bruta.** No es un hallazgo técnico nuevo (el JWT y el hash de contraseña ya son correctos) — es un riesgo funcional de que no exista ninguna política de reacción ante múltiples intentos fallidos.

---

## 10. Conclusión

**¿Está correctamente delimitado el alcance del Bloque 9?**

Sí, con una precisión: el alcance tal como lo definió el objetivo del bloque ("eliminar completamente la necesidad de administrar SDC mediante scripts... toda la administración del sistema deberá poder realizarse desde el propio SDC") es amplio por diseño, y esta auditoría confirma que es un alcance real, no sobredimensionado — cada punto analizado (secciones 1 a 7) tiene un hueco funcional concreto y verificado contra el código, ninguno es especulativo.

**¿Falta algún componente imprescindible antes de comenzar la implementación?**

Uno: una decisión explícita, todavía no tomada en ningún documento vigente, sobre **el flujo de alta de la primera cuenta de una organización nueva** — específicamente, si el alta de una organización nueva la hace un administrador de SDC (una suerte de "superadmin" operativo, no un rol nuevo del sistema, sino quien opera la plataforma) y esa persona crea también el primer usuario `ADMINISTRADOR` de esa organización, o si existe algún grado de autoservicio (alguien se registra y su organización se crea junto con su cuenta). Esta decisión no es de diseño técnico — es de negocio, y condiciona directamente el diseño de las secciones 1 y 2. Corresponde preguntarla antes de la etapa de diseño técnico, no asumirla.

**¿Hay alguna dependencia crítica no contemplada en `ROADMAP_PRODUCTO_SDC.md`?**

Sí, una: el Roadmap definió el Bloque 9 como "Administración de Organización y Usuarios" sin distinguir explícitamente que **la ausencia total de un flujo de recuperación de contraseña (sección 7) es, en sí misma, una dependencia crítica del CRUD de usuarios**, no una mejora de seguridad aparte — el mismo Roadmap clasificó "políticas de contraseña/sesión" dentro del área Seguridad, de forma separada de Administración, pero esta auditoría encuentra evidencia de que, sin al menos la recuperación de contraseña, el propio CRUD de usuarios que el Bloque 9 se propone construir puede dejar a una organización real sin forma de recuperar el acceso a su propia cuenta — un riesgo funcional directo, no una mejora postergable. Corresponde que la etapa de diseño técnico del Bloque 9 decida si la recuperación de contraseña se incluye dentro del propio Bloque 9 o si se abre como sub-bloque inmediato siguiente, pero no debería quedar indefinidamente en la categoría "Muy importante" separada de "Imprescindible" sin esa relectura.

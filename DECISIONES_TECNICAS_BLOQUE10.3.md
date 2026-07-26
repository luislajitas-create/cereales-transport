# Decisiones Técnicas — Bloque 10.3: Acceso de usuarios y cambio de organización activa

Fecha: 2026-07-16. Registra exclusivamente las 5 decisiones técnicas resueltas mediante interacción guiada con el Product Owner, sobre la base de `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md` (aprobado como base técnica general, sección 16). **No repite el diseño completo, no escribe implementación, no define migraciones.** Es la base final antes de iniciar la Etapa 10.3.a, todavía no autorizada por este documento.

---

## Decisión Técnica 1 — Rol único para todas las Organizaciones

**Pregunta:** ¿el rol funcional del usuario es único para todas las Organizaciones a las que tenga acceso, o puede variar por Organización?

**Decisión:** **rol único.** `Usuario.rol` se aplica igual, sin excepción, en cualquier Organización a la que el usuario tenga acceso — no existe rol por Organización.

**Consecuencia arquitectónica inmediata:** `AccesoGrupoEconomico` (Etapa 10.3.a) no incorpora ningún campo de rol — define exclusivamente a qué Organizaciones puede ingresar el usuario, nunca qué puede hacer ahí. `RolesGuard` (Etapa 10.3.b) no se modifica: sigue leyendo `user.rol` del JWT exactamente igual que hoy, sin ninguna lógica nueva relacionada con la Organización activa. El Administrador que otorga un acceso (Decisión Técnica 2 de Grupo Económico, ya aprobada) asume, al hacerlo, que la persona operará su Organización con el rol que ya tiene en la suya — sin posibilidad de acotarlo desde este mecanismo.

---

## Decisión Técnica 2 — Tratamiento de "Organización activa" sin campo `activo`

**Pregunta:** ¿cómo se valida la condición "Organización destino activa" si `Organizacion` no tiene, hoy, ningún campo de estado?

**Decisión:** el cambio de organización valida **únicamente que la Organización exista**. No se agrega `Organizacion.activo` ni ninguna funcionalidad de suspensión o desactivación. Queda documentado explícitamente que la noción de "organización activa" está postergada para una evolución futura, sin decisión de negocio pendiente que la exija hoy.

**Consecuencia arquitectónica inmediata:** el `schema.prisma` de `Organizacion` no recibe ningún campo nuevo en este bloque — la única adición al modelo de datos de todo Bloque 10.3 es la tabla `AccesoGrupoEconomico` (Etapa 10.3.a). El endpoint de cambio de organización (Etapa 10.3.b) resuelve esta condición con un simple `findUnique` de existencia, sin ninguna lógica adicional de estado.

---

## Decisión Técnica 3 — Vigencia del JWT nuevo al cambiar de Organización

**Pregunta:** ¿el token emitido al cambiar de Organización reinicia las 12 horas, conserva la expiración original, u otra alternativa?

**Decisión:** **conserva la expiración original.** El token nuevo vence exactamente en el mismo instante que el token que reemplaza — el cambio de Organización nunca reinicia ni extiende la sesión. Ningún encadenamiento de cambios (A→B→A) puede superar las 12 horas contadas desde el login inicial.

**Consecuencia arquitectónica inmediata:** el endpoint de cambio de organización (Etapa 10.3.b) calcula el `exp` del token nuevo a partir del `exp` del token vigente en el momento del cambio, no desde un nuevo `expiresIn: "12h"` fijo. Preserva, sin excepción y sin necesidad de tocar `JwtStrategy` ni `auth.module.ts`, el límite ya certificado en `RELEASE_SDC_v1.0.md`, sección 13.

---

## Decisión Técnica 4 — Tokens ya emitidos ante una revocación de acceso

**Pregunta:** ¿qué ocurre con un token ya emitido para una Organización cuando el acceso a esa Organización se revoca mientras el token todavía no expiró?

**Decisión:** **sigue válido hasta su expiración original**, acotado siempre por la Decisión Técnica 3 (nunca más de lo que restaba desde el login inicial). La revocación impide de inmediato emitir tokens nuevos o volver a cambiar hacia esa Organización, pero no corta una sesión ya en curso. No se incorpora en Bloque 10.3 ningún mecanismo de versión ni de revocación instantánea de sesiones.

**Consecuencia arquitectónica inmediata:** `JwtStrategy` no se modifica — sigue sin consultar la base en cada request. `Usuario` no recibe ningún campo de versión de sesión. La única revalidación contra la base ocurre en el propio momento de invocar el cambio de organización (Etapa 10.3.b), que ya consulta `AccesoGrupoEconomico` en cada uso, no solo al otorgarlo. El riesgo aceptado es del mismo tipo y magnitud que el ya certificado en `RELEASE_SDC_v1.0.md` para desactivación de usuarios y cambios de rol.

---

## Decisión Técnica 5 — Tratamiento del frontend al cambiar de Organización

**Pregunta:** ¿cómo se garantiza que ningún dato de la Organización anterior permanezca en memoria del frontend tras un cambio de Organización activa?

**Decisión:** **recarga completa de la aplicación**, reutilizando el mismo mecanismo ya existente y probado en `api/client.ts` para el manejo de reinicio de la aplicación (el que hoy usa el interceptor de `401`). No se incorpora ninguna librería nueva de manejo de estado o cache. No se implementa limpieza manual pantalla por pantalla.

**Consecuencia arquitectónica inmediata:** ninguna sobre el backend de 10.3 — el endpoint de cambio de organización no necesita devolver nada adicional a `{ accessToken, usuario }`, la misma forma que ya usa `login`. Esta decisión es, en rigor, de alcance de Bloque 10.4 (frontend); se resolvió acá únicamente para confirmar que no impone ningún requisito adicional sobre el contrato del backend que 10.3 debe construir.

---

## Resumen para la implementación

Las cinco decisiones quedan incorporadas como restricciones obligatorias de las Etapas 10.3.a y 10.3.b (`DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 15):

- **Etapa 10.3.a** (modelo `AccesoGrupoEconomico` y administración de accesos): sin campo de rol (Decisión 1); sin campo de estado en `Organizacion` (Decisión 2).
- **Etapa 10.3.b** (guard de grupo y endpoint de cambio de organización activa): cálculo de `exp` heredado del token vigente, nunca reiniciado (Decisión 3); sin mecanismo de revocación instantánea ni versión de sesión (Decisión 4); respuesta con la misma forma que `login`, sin campos adicionales para el frontend (Decisión 5).

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md` o `DECISIONES_TECNICAS_GRUPO_ECONOMICO.md`. Con este documento queda cerrada la etapa de diseño de Bloque 10.3. La implementación de la Etapa 10.3.a queda pendiente de una instrucción explícita posterior.

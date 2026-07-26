# Decisiones Técnicas — Bloque 10.3.b: Cambio de Organización Activa

Fecha: 2026-07-16. Registra exclusivamente las 6 decisiones técnicas resueltas mediante interacción guiada con el Product Owner, sobre la base de `DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` (aprobado como base técnica general, sección 11) y sin reabrir ninguna decisión ya fijada en `DECISIONES_TECNICAS_BLOQUE10.3.md`. **No repite el diseño completo, no escribe implementación, no define migraciones.** Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.3.b (Auditoría → Diseño → Decisiones). La implementación queda pendiente de una instrucción explícita posterior.

---

## Decisión Técnica 1 — Ubicación del endpoint

**Pregunta:** ¿en qué controller vive el endpoint de cambio de organización activa?

**Decisión:** **`AuthController`**, con su lógica en `AuthService`. No se crea un `SesionController` separado.

**Consecuencia arquitectónica inmediata:** el nuevo método se agrega a `auth.controller.ts`/`auth.service.ts`, archivos ya existentes — sin módulo nuevo. `AccesoGrupoController` (10.3.a) sigue limitado a otorgar/listar/revocar `AccesoGrupoEconomico`; el módulo `grupo-economico` nunca emite JWT. Ubicación conceptual: `AccesoGrupoEconomico` define si el usuario puede entrar a una organización; `AuthService` valida ese acceso y emite el token nuevo; `AuthController` expone el cambio de contexto autenticado.

---

## Decisión Técnica 2 — Mecanismo de vigencia heredada

**Pregunta:** ¿con qué mecanismo técnico exacto se conserva la expiración original del token nuevo?

**Decisión:** el backend **lee el `exp` del JWT actualmente válido** y firma el token nuevo para que venza exactamente en ese mismo instante. No se agrega ningún campo nuevo al payload del JWT; no se persiste ningún dato adicional de sesión.

**Consecuencia arquitectónica inmediata:** la forma del JWT permanece exactamente igual a la ya certificada en SDC v1.0 (`sub`, `email`, `rol`, `nombre`, `organizacionId`, más `iat`/`exp` automáticos). Se acepta explícitamente que el `iat` del token nuevo será más reciente que el del token reemplazado, y que la diferencia entre `iat` y `exp` podrá ser menor a 12 horas — comportamiento correcto y esperado, no un defecto. El tiempo máximo de sesión sigue siendo, sin excepción, el del login original.

---

## Decisión Técnica 3 — Qué devuelve el endpoint

**Pregunta:** ¿qué datos exactos devuelve el endpoint de cambio de organización?

**Decisión:** exclusivamente **`{ accessToken, usuario }`**, forma equivalente a la respuesta actual de `login()`. `usuario` incluye el nuevo `organizacionId` activo. No se agrega `organizacionesAccesibles`, ni un objeto `organizacionActiva`, ni ninguna información destinada al futuro selector.

**Consecuencia arquitectónica inmediata:** cualquier dato adicional que Bloque 10.4 necesite (listado de organizaciones accesibles, detalle de la organización activa) se resuelve con endpoints separados y específicos — nunca empaquetado dentro de esta respuesta. Coherente con la exclusión de alcance ya aplicada en 10.3.a para `GET /grupo-economico/organizaciones-accesibles`.

---

## Decisión Técnica 4 — Auditoría de cambios exitosos

**Pregunta:** ¿en qué organización queda visible el evento de un cambio exitoso — origen, destino, o ambas?

**Decisión:** **dos entradas atómicas**, una bajo la organización de origen (identificando el destino) y otra bajo la organización de destino (identificando el origen), correspondientes al mismo cambio de contexto. Cada evento queda visible únicamente desde la auditoría de su propia organización — sin entrada transversal fuera del aislamiento normal.

**Consecuencia arquitectónica inmediata:** las dos escrituras a `AuditLog` deben ejecutarse dentro de la misma transacción que emite el token — si no pueden registrarse ambas, el cambio no se considera completado. No se modifica el contrato actual de `GET /organizacion/auditoria`.

---

## Decisión Técnica 5 — Auditoría de intentos denegados

**Pregunta:** ¿se auditan los intentos denegados de cambio de organización, y cómo se evita ruido o exposición?

**Decisión:** todo intento autenticado y denegado genera exactamente un evento, **`intento_cambio_organizacion_denegado`, registrado únicamente bajo la organización de origen** — nunca en la organización destino, y sin distinguir públicamente el motivo del rechazo.

**Consecuencia arquitectónica inmediata:** la respuesta HTTP se mantiene genérica en todos los casos de rechazo, sin revelar si la organización destino existe, pertenece a otro grupo, no tiene acceso otorgado, o fue indicada con un id inválido. La auditoría puede conservar internamente una categoría genérica de motivo únicamente si no expone datos de la organización destino ni facilita enumeración — nunca nombre, CUIT, ni datos institucionales de esa organización. El registro de un intento fallido no emite token ni modifica ningún estado, y debe ejecutarse de forma segura incluso en la rama de error, sin que una falla al auditar se convierta en una autorización accidental.

---

## Decisión Técnica 6 — Propagación multi-pestaña

**Pregunta:** ¿cómo se resuelve la sincronización del cambio de organización entre pestañas del mismo navegador, y qué debe devolver 10.3.b para soportarlo?

**Decisión:** la propagación se realiza mediante el **evento nativo `storage`**, ratificada formalmente ahora. Su implementación corresponde exclusivamente a Bloque 10.4 — 10.3.b no incorpora ningún código de frontend ni mecanismo entre pestañas. El contrato ya aprobado en la Decisión Técnica 3 (`{ accessToken, usuario }`) es suficiente, sin lista de organizaciones, marca de versión, evento especial, ni campo adicional.

**Consecuencia arquitectónica inmediata:** ninguna sobre el backend de 10.3.b. Cuando 10.4 lo implemente: la pestaña que origina el cambio recarga por su propio flujo; las demás detectan el cambio en `localStorage` vía `storage` y también recargan — sin `BroadcastChannel` ni ninguna librería nueva. Se acepta como regla de experiencia de usuario que todas las pestañas del mismo navegador converjan a la organización activa más reciente guardada en `localStorage`.

---

## Resumen para la implementación

Las seis decisiones quedan incorporadas como restricciones obligatorias de la única etapa de implementación de Bloque 10.3.b (`DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md`, sección 10):

- **Endpoint y servicio** (Decisión 1): `AuthController`/`AuthService`, sin módulo nuevo.
- **Emisión del token** (Decisión 2): `exp` heredado del token vigente, sin cambios a la forma del JWT.
- **Contrato de respuesta** (Decisión 3): `{ accessToken, usuario }`, nada más.
- **Auditoría** (Decisiones 4 y 5): dos entradas atómicas por cambio exitoso; un evento genérico por intento denegado, bajo origen únicamente, sin exponer datos de la organización destino.
- **Frontend/multi-pestaña** (Decisión 6): fuera de alcance de 10.3.b en su totalidad — ratificado para que Bloque 10.4 lo construya sin requerir ningún cambio adicional al backend.

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en `DECISIONES_TECNICAS_BLOQUE10.3.md`, `DECISIONES_TECNICAS_GRUPO_ECONOMICO.md`, o `DECISIONES_PRODUCT_OWNER_GRUPO_ECONOMICO.md`. Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.3.b. La implementación queda pendiente de una instrucción explícita posterior.

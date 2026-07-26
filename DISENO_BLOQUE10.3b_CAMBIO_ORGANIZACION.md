# Diseño Técnico — Bloque 10.3.b: Cambio de Organización Activa

Fecha: 2026-07-16. Diseño técnico — **no se escribió código, no se modificó `schema.prisma`, no se generaron migraciones, no se hizo commit ni push, no se implementó nada de frontend ni de backend.** Se apoya en `AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md` (aprobada como base) y respeta, sin reabrirlas, las 5 Decisiones Técnicas de `DECISIONES_TECNICAS_BLOQUE10.3.md` y el diseño ya aprobado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`. No se auto-aprueba — queda a la espera de aprobación explícita (`METODOLOGIA_SDC.md`, etapa 3).

**La pregunta que responde este documento, y solo esta:** ¿cómo se construye, exactamente, el mecanismo por el cual un usuario ya autenticado con `AccesoGrupoEconomico` vigente (Bloque 10.3.a, ya cerrado) cambia su Organización activa sin volver a autenticarse, sin romper ninguna garantía de aislamiento, y sin dejar el comportamiento entre pestañas del navegador sin definir?

No se diseña acá el selector visual (Bloque 10.4), Pago Consolidado (10.5), comprobantes, reglas de negocio nuevas, ni ningún cambio a `RolesGuard`, `ORGANIZACION_PRISMA`, o la forma del JWT más allá de lo ya decidido.

---

## 1. Endpoint de cambio de organización — contrato completo

**Ruta orientativa:** `POST /auth/cambiar-organizacion`, dentro de `AuthController` — reutiliza el mismo controller que ya expone `login`, sin crear un módulo nuevo (decisión de implementación menor, sin impacto arquitectónico; ver sección 12, punto 1).

**Request:** `{ organizacionId: string }` — la organización destino, elegida explícitamente por quien ya está autenticado.

**Validaciones server-side, en este orden** (cada una ya identificada en la auditoría o en el diseño previo, ninguna nueva):
1. `JwtAuthGuard` — el token actual debe ser válido (firma + no expirado), exactamente igual que cualquier otro endpoint protegido.
2. El `Usuario` del token sigue existiendo y `activo === true` — revalidado ahora, contra la base, no solo confiado del payload (a diferencia de cualquier otro endpoint, que nunca revalida `activo` — esta es la única excepción, justificada porque es, precisamente, el único momento en que el sistema vuelve a tocar la base para una decisión de autorización de sesión).
3. La organización destino existe (`Organizacion.findUnique`) — sin validar ningún campo de estado, porque no existe (`AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, hallazgo ya aceptado; `DECISIONES_TECNICAS_BLOQUE10.3.md`, Decisión 2).
4. La organización destino es la propia organización de pertenencia del usuario (`usuario.organizacionId === organizacionId`, para "volver"), **o** existe un `AccesoGrupoEconomico` vigente para el par `(usuario.id, organizacionId)` — tabla ya construida y cerrada en 10.3.a.
5. La organización de pertenencia del usuario y la organización destino pertenecen, **en este momento**, al mismo `GrupoEconomico` — revalidado en cada uso, no asumido desde el momento en que se otorgó el acceso (mismo criterio ya fijado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 1, para el caso de que una organización salga del grupo).

**Respuesta exitosa:** `{ accessToken, usuario }` — misma forma exacta que `login()` (`auth.service.ts:30-39`), sin campos adicionales (Decisión Técnica 5: "no impone ningún requisito adicional sobre el contrato del backend").

**Errores:** `403` genérico ("No tenés autorización para operar esa organización.") para cualquier fallo de las validaciones 2-5 — nunca `404`, para no revelar si una organización o un acceso existen (mismo criterio de falla segura ya usado en 10.1/10.2/10.3.a). Ningún token se emite ni se toca el token actual si cualquier validación falla.

**Sin capacidad nueva:** este endpoint no crea, otorga, ni modifica ningún `AccesoGrupoEconomico` — solo los consulta. Otorgar/revocar sigue siendo, exclusivamente, responsabilidad de `AccesoGrupoController` (10.3.a).

---

## 2. Guard nuevo de Grupo Económico

**Nombre orientativo:** `GrupoEconomicoAccesoGuard` (o equivalente — detalle de implementación, sección 12).

**Qué valida:** exclusivamente los puntos 2-5 de la sección 1 — nunca un rol (Decisión Técnica 1: el acceso de grupo es independiente del rol funcional).

**Dónde vive:** aplicado únicamente al endpoint `POST /auth/cambiar-organizacion` — no se aplica a ningún otro endpoint, ni a los ya existentes de `AccesoGrupoController` (10.3.a), que siguen usando `RolesGuard` con `@Roles("ADMINISTRADOR")` sin ningún cambio.

**Orden respecto de `JwtAuthGuard`:** `JwtAuthGuard` primero (autentica el token actual) → `GrupoEconomicoAccesoGuard` después (autoriza el cambio hacia el destino). `RolesGuard` **no interviene** en este endpoint — cambiar de organización no depende de un rol funcional, cualquier usuario autenticado con el acceso correspondiente puede intentarlo (`DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 7, ya lo estableció así).

---

## 3. Emisión del JWT

**Payload:** idéntico en forma al de `login()` — `{ sub, email, rol, nombre, organizacionId }`, con `organizacionId` apuntando a la organización destino y `rol`/`nombre`/`email` tomados del mismo `Usuario` ya releído en la validación 2 de la sección 1 (nunca del token viejo, para no propagar datos potencialmente obsoletos si algo cambió).

**Vigencia — Decisión Técnica 3, ya aprobada, aplicada exactamente:** el token nuevo **hereda el `exp` del token vigente en el momento del cambio**, nunca `expiresIn: "12h"` fijo. Esto exige leer el `exp` del token actual (disponible en el objeto ya decodificado por `JwtAuthGuard`/`JwtStrategy`, en `request.user` o en el token crudo del header — detalle de implementación) y pasarlo como `expiresIn` (en segundos restantes) o como claim `exp` explícito al firmar el nuevo token. Ningún cambio a `JwtStrategy.validate()` — sigue aceptando cualquier token bien formado, sin importar cómo se calculó su `exp`.

**Sin cambio de mecanismo de firma:** mismo `JwtService`, mismo `JWT_SECRET`, ya inyectados en `AuthModule` — sin ningún módulo nuevo de JWT.

---

## 4. Revalidaciones en cada uso — por qué acá y no en otro lado

Este es el único punto de todo el sistema donde `usuario.activo` y la pertenencia al mismo `GrupoEconomico` se revalidan contra la base en tiempo de request — deliberado, no un patrón a extender a otros endpoints. Ya justificado en la auditoría (pregunta 5: `JwtStrategy` nunca consulta la base) y en `DECISIONES_TECNICAS_BLOQUE10.3.md` (Decisión 4: "la única revalidación contra la base ocurre en el propio momento de invocar el cambio de organización"). Un token ya emitido, para cualquier organización, sigue siendo válido hasta expirar sin importar qué cambie después — ese riesgo ya fue evaluado y aceptado (Decisión Técnica 4).

---

## 5. Auditoría

**Reutiliza `AuditLog` sin ningún cambio de estructura**, tal como ya lo estableció `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 8 — dos eventos nuevos, aplicados ahora:

- **`organizacion_activa_cambiada`** — dos entradas, una bajo la organización de origen y otra bajo la de destino (mismo criterio ya usado para eventos que involucran más de una organización, `GRUPO_ECONOMICO_DISENO_TECNICO.md`, sección 10).
- **`intento_cambio_organizacion_denegado`** — una entrada, bajo la organización de **origen** (la única con contexto activo en el momento del intento fallido).

Ninguna decisión nueva acá — se confirma que ambos eventos, ya diseñados en 10.3, se implementan tal como estaban especificados.

---

## 6. Multi-pestaña del navegador — análisis explícito pedido

### ¿La arquitectura elegida mantiene un único contexto global de organización?

**Depende de la capa, y hay que distinguirlas — no es una respuesta única:**

- **Backend: sí, sin ninguna ambigüedad.** El contexto de organización (`organizacion-context.ts`, `AsyncLocalStorage`) es **por request**, no por usuario ni por sesión — cada request HTTP, sin importar de qué pestaña salió, trae su propio token en el header `Authorization`, y el interceptor siembra el contexto exclusivamente a partir de ese token puntual. El backend no tiene ningún concepto de "pestaña" ni de "sesión persistente" — es completamente stateless (`RELEASE_SDC_v1.0.md`, sección 7). Dos pestañas con tokens distintos generan, simplemente, dos secuencias independientes de requests, cada una perfectamente aislada — el backend nunca necesita saber que existen dos pestañas.
- **Frontend: no, y esto es lo que hay que diseñar.** `localStorage` **sí** es un recurso compartido entre todas las pestañas del mismo origen — pero el estado en memoria de cada pestaña (`AuthContext`, el `useState` de cualquier componente) es **independiente por pestaña**, porque cada una corre su propio proceso de JavaScript. Que exista un único `localStorage` compartido no implica que exista un único contexto de organización activo en memoria — hoy, sin ningún cambio, dos pestañas ya pueden divergir (por ejemplo, si una hace `logout()` y la otra sigue con su propio estado React vivo hasta el próximo request que dispare el interceptor de `401`).

**Conclusión:** no existe hoy, ni existirá después de este bloque, un único contexto global de organización a nivel de navegador — existe un único valor compartido en `localStorage` (la fuente de verdad) y potencialmente varios estados en memoria desincronizados temporalmente (una realidad por pestaña, hasta que cada una vuelva a leer esa fuente).

### ¿Debe propagarse automáticamente el cambio a las demás pestañas mediante el evento `storage`, o corresponde otro mecanismo?

**Recomendación: sí, propagar vía el evento nativo `storage`** — exactamente como ya lo planteó `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 10, pero ahora fijado como parte formal de este diseño, no solo como una sugerencia sin ratificar.

**Justificación, comparando contra las alternativas reales:**

| Alternativa | Evaluación |
|---|---|
| **A. Evento `storage` (recomendada)** | Mecanismo nativo del navegador, sin ninguna librería nueva — se dispara automáticamente en las **demás** pestañas (nunca en la que originó el cambio) apenas `localStorage` cambia. Es el único mecanismo que no requiere que las pestañas se comuniquen explícitamente entre sí (no hay `BroadcastChannel`, no hay polling). Consistente con la Decisión Técnica 5 ya aprobada (recarga completa, reutilizando `api/client.ts`) — el listener simplemente dispara la misma recarga ya elegida, en la pestaña pasiva. |
| **B. No hacer nada (dejar que cada pestaña se entere recién en su próximo request)** | Ya es, de hecho, lo que pasa hoy sin ningún cambio — una pestaña pasiva sigue operando con su token viejo hasta que ese token deje de ser válido para lo que intenta hacer, o hasta que el usuario la recargue manualmente. No es una fuga de datos (cada pestaña sigue aislada correctamente, sección "riesgos" abajo), pero es la peor experiencia de las tres — la persona podría seguir viendo y operando la organización anterior en una pestaña sin ningún aviso. |
| **C. `BroadcastChannel` u otro mecanismo de mensajería entre pestañas** | Técnicamente más flexible que `storage`, pero es una API adicional, sin ningún precedente de uso en este proyecto, para resolver exactamente el mismo problema que `storage` ya resuelve de forma más simple. Se descarta por no ser la opción de menor cambio. |

**Riesgos que quedan, incluso con la Alternativa A:**
- **Ventana de milisegundos entre el cambio y la recarga de la pestaña pasiva:** el evento `storage` es asíncrono — existe una ventana breve en la que la pestaña pasiva todavía tiene, en memoria, el estado de la organización anterior. No es una fuga real (ningún dato nuevo de la organización destino llega a esa pestaña hasta que recarga), pero sí podría, en teoría, permitir que un request ya en curso desde esa pestaña se complete contra la organización vieja después de que la otra pestaña ya cambió — mismo riesgo ya señalado en la auditoría (pregunta 13) para requests en vuelo, no uno nuevo.
- **Pestañas en navegadores o modos que no disparan `storage` de forma confiable** (por ejemplo, algunas configuraciones de navegación privada aíslan `localStorage` por pestaña) — el peor caso resultante es el mismo que la Alternativa B (la pestaña simplemente no se entera hasta su próximo ciclo natural), no una fuga de datos.
- **Si dos pestañas intentan cambiar de organización casi simultáneamente**, cada una dispara su propio request al endpoint de la sección 1 — el backend procesa cada uno de forma completamente independiente (sin ningún estado compartido entre requests más allá de la base de datos), así que no hay ninguna condición de carrera nueva a nivel de backend; el resultado final en `localStorage` es, simplemente, el de la última escritura en ganar — comportamiento estándar del navegador, no un caso a diseñar especialmente.

### Alcance de implementación de este punto

**El backend de 10.3.b no necesita ningún cambio para soportar esto** — el endpoint de la sección 1 no sabe ni le importa cuántas pestañas existen; devuelve `{ accessToken, usuario }` igual que siempre. La propagación entre pestañas es, en su totalidad, un comportamiento de `AuthContext.tsx`/`api/client.ts` — **implementación de frontend, fuera del alcance de este sub-bloque** (10.3.b es explícitamente backend). Lo que este diseño fija ahora es la **decisión** (Alternativa A, con sus riesgos ya evaluados) para que, cuando 10.4 la implemente, no haga falta rediseñar nada ni volver a evaluar alternativas — mismo criterio ya usado para las secciones 9-11 de `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`.

---

## 7. Backend — módulos y archivos

- **`AuthController`**: un método nuevo, `cambiarOrganizacion`, mapeado a `POST /auth/cambiar-organizacion`.
- **`AuthService`**: un método nuevo, análogo a `login()` pero sin `bcrypt`, que ejecuta las validaciones 2-5 de la sección 1 y emite el token con vigencia heredada (sección 3).
- **Guard nuevo** (sección 2): un archivo nuevo, mismo directorio que `roles.guard.ts`/`jwt-auth.guard.ts`.
- **Sin cambios** en `JwtStrategy`, `RolesGuard`, `organizacion-prisma.client.ts`, `organizacion-context.ts`, `organizacion-context.interceptor.ts`, `ORGANIZACIONAL_MODELS`, ni en `AccesoGrupoController`/`GrupoEconomicoController`/`IdentidadChoferGrupoController` (10.1/10.2/10.3.a intactos).
- **Sin cambios a `schema.prisma`** — reutiliza `AccesoGrupoEconomico`, `GrupoEconomico`, `Organizacion`, `Usuario`, `AuditLog`, todos ya existentes.

---

## 8. Seguridad y prueba de fuga

Mismo listado ya fijado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 13 — sin ninguna adición nueva detectada en este diseño más allá de lo ya previsto:

- Usuario sin `AccesoGrupoEconomico` intenta cambiar → `403`, sin token nuevo.
- Usuario intenta cambiar a una organización de otro Grupo Económico → `403`.
- Acceso revocado, token viejo reutilizado dentro de su ventana → sigue funcionando (comportamiento esperado, Decisión Técnica 4), pero un nuevo intento de cambio hacia esa organización falla.
- Usuario inactivo → `403`.
- Cambio repetido A→B→A → cada uno auditado por separado; vigencia total nunca supera las 12h del login original.
- Manipulación directa del body (sin pasar por la interfaz) → mismo resultado `403` que a través de cualquier cliente — la protección es siempre server-side.
- **La prueba más importante, heredada sin cambios:** después de A→B, ningún dato de A debe quedar accesible en B, ni por este endpoint ni por ningún endpoint operativo existente.

---

## 9. Regresión obligatoria

Login; `JwtStrategy` (sin cambios, pero revalidar que sigue aceptando tokens de `login()` sin ningún efecto de este bloque); `RolesGuard` (sin cambios, para cualquier rol, en cualquier organización activa); `AccesoGrupoController` completo (10.3.a: otorgar/listar/revocar, incluida la protección de concurrencia ya verificada); `GrupoEconomicoController`/`IdentidadChoferGrupoController` (10.1/10.2); Viajes; Facturas; Liquidaciones; Catálogos; Centro de Inteligencia. Ninguno debería mostrar ninguna diferencia de comportamiento.

---

## 10. Secuencia de implementación

Una sola etapa — a diferencia de 10.3.a (que sí ameritó dividirse en 10.3.a/10.3.b por depender de un modelo nuevo), acá no hay ningún modelo nuevo que crear ni ninguna migración: todo lo que este sub-bloque necesita (`AccesoGrupoEconomico`) ya existe y está desplegado. El endpoint, el guard, y la lógica de emisión de token son, en los hechos, una sola unidad cohesiva sin un punto de corte intermedio significativo.

**Objetivo:** que un usuario con `AccesoGrupoEconomico` vigente cambie su organización activa y opere el destino con un token válido.

**Archivos:** los de la sección 7. Sin migración.

**Riesgos:** el más sensible de seguridad de todo Bloque 10.3 (ya señalado en el plan original) — mitigado por construirse sobre 10.3.a ya cerrado y auditado, por el guard separado (sección 2), y por la batería de pruebas de la sección 8 antes de cerrar.

**Criterio de cierre:** los escenarios de la sección 8 pasan; la auditoría queda registrada bajo ambas organizaciones (sección 5); regresión completa (sección 9) sin cambios.

**Rollback:** deshabilitar/revertir el commit — ningún token ya emitido queda incompatible (el JWT no cambia de forma), los `AccesoGrupoEconomico` de 10.3.a siguen intactos para cuando se reintente.

---

## 11. Decisiones técnicas pendientes

Ninguna reabre una decisión ya aprobada. Quedan para confirmar antes o durante la implementación:

1. **Nombre exacto y ubicación del endpoint y del guard** (secciones 1 y 2) — orientativos, sin impacto de diseño.
2. **Cómo se calcula exactamente el `exp` heredado** (sección 3) — leer el `exp` del token actual desde `request.user`/el header crudo y pasarlo como `expiresIn` en segundos, o setear `exp` directamente en el payload antes de firmar — dos formas técnicamente equivalentes, sin impacto de diseño, se resuelve en implementación.
3. **Si el endpoint debe devolver, además de `{ accessToken, usuario }`, algo que facilite a 10.4 mostrar "a qué organizaciones puedo volver a cambiar"** — ya señalado como pendiente en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 16, punto 4; no se resuelve acá, no bloquea 10.3.b.
4. **La propagación multi-pestaña vía `storage` (sección 6) queda decidida como diseño, pero su implementación real es de Bloque 10.4** — confirmar que esta secuenciación (decidir ahora, construir después) es la esperada, no una omisión.

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo commit ni push, no se abrió implementación, no se alteró SDC v1.0.0 ni su tag. Este es el único documento generado. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier implementación.

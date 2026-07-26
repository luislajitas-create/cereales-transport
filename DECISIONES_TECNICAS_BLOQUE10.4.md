# Decisiones Técnicas — Bloque 10.4: Frontend de Grupo Económico

Fecha: 2026-07-16. Registra exclusivamente las 10 decisiones técnicas resueltas mediante interacción guiada con el Product Owner, sobre la base de `DISENO_BLOQUE10.4_FRONTEND.md` (aprobado como base técnica general, sección 16). **No repite el diseño completo, no escribe implementación, no define migraciones.** Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.4 (Auditoría → Diseño → Decisiones). La implementación queda pendiente de una instrucción explícita posterior.

---

## Decisión Técnica 1 — Endpoint de Organizaciones accesibles

**Pregunta:** ¿se agrega `GET /grupo-economico/organizaciones-accesibles`, con qué contrato, y quién puede consultarlo?

**Decisión:** se agrega. Accesible a **cualquier usuario autenticado** (sin `RolesGuard`). El backend determina todo a partir del usuario autenticado y de `AccesoGrupoEconomico` — nunca recibe `grupoId` ni `organizacionId` del cliente. Devuelve únicamente `{ id, nombre, esActual }`: siempre incluye la organización de pertenencia del usuario, únicamente organizaciones adicionales con acceso vigente, nunca organizaciones del mismo grupo sin acceso. La organización actual aparece primero; el resto, alfabético por nombre. Sin CUIT ni datos institucionales.

**Consecuencia arquitectónica inmediata:** primer endpoint de `grupo-economico/` sin `RolesGuard` — excepción deliberada, coherente con la independencia de rol ya aprobada en `DECISIONES_TECNICAS_BLOQUE10.3.md`. No requiere `PrismaService` crudo (`AccesoGrupoEconomico` y `Organizacion` no son modelos organizacionales). Se implementa en 10.4.a.

---

## Decisión Técnica 2 — Selección de Usuario destinatario

**Pregunta:** ¿cómo selecciona el Administrador al usuario destinatario de un acceso, sin UUID manual ni búsqueda abierta?

**Decisión:** un único endpoint de resolución **exacta** (email o id, nunca parcial/"contiene"/autocompletado/listado abierto). Exige `ADMINISTRADOR` y que el actor pertenezca a una organización asociada a un Grupo Económico. Solo puede devolver un usuario existente, activo, de **otra** organización del mismo grupo — nunca de otro grupo, nunca de la propia organización del actor. Cualquier no-coincidencia (email inexistente, usuario inactivo, de otro grupo, o de la propia organización) devuelve la misma respuesta genérica. Contrato: `{ id, nombre, email, organizacionId, nombreOrganizacion }`, más `rol` solo si aporta valor — nunca `passwordHash` ni tokens. El modo por id revalida pertenencia al mismo grupo antes de responder (usado también para enriquecer el listado de accesos ya otorgados).

**Consecuencia arquitectónica inmediata:** nuevo método estrecho en `UsuarioGrupoLookupService`, sin ampliar el allow-list de `PrismaService` crudo. Resolver un usuario no crea ni garantiza ningún acceso — `otorgar()` sigue siendo la única autoridad real. Se implementa en 10.4.a.

---

## Decisión Técnica 3 — Selector de Organización

**Pregunta:** ¿el selector se muestra siempre o solo con más de una opción, y dónde vive exactamente?

**Decisión:** el **nombre** de la organización activa se muestra siempre, para cualquier usuario autenticado, en el bloque `.user-info` de `Layout.tsx`. El **control interactivo** para cambiar aparece únicamente si existe más de una organización accesible. Sin CUIT, razón social ni datos institucionales adicionales. Sin rediseñar `Layout`. El nombre visible debe actualizarse correctamente tras el cambio y la recarga completa.

**Consecuencia arquitectónica inmediata:** ningún usuario puede confundirse sobre qué organización está operando, use o no acceso multiempresa. Se implementa en 10.4.b, consumiendo el contrato de la Decisión 1.

---

## Decisión Técnica 4 — Confirmación antes de cambiar

**Pregunta:** ¿la confirmación aparece siempre o solo si hay datos sin guardar?

**Decisión:** **siempre**, con un mensaje único y simple, independiente de si existen datos sin guardar. Valida exclusivamente la intención de cambiar de organización. La detección y protección de datos sin guardar queda completamente separada (Decisión 5) — ambas lógicas no se mezclan en el mismo flujo.

**Consecuencia arquitectónica inmediata:** el diálogo de confirmación no necesita conocer el estado interno de ningún formulario. Se implementa en 10.4.b.

---

## Decisión Técnica 5 — Protección de datos no guardados

**Pregunta:** ¿cómo se evita perder datos sin guardar ante la recarga completa?

**Decisión:** protección acotada **exclusivamente a `ViajeForm.tsx`**, vía un hook mínimo y reutilizable dedicado a `beforeunload`. Ninguna otra pantalla queda obligada a adoptarlo en este bloque. Sin registro global de "formularios sucios". Sin modificar la arquitectura general del frontend para un único riesgo ya comprobado.

**Consecuencia arquitectónica inmediata:** el hook protege por igual un cambio iniciado en la propia pestaña y uno recibido de otra pestaña (mismo evento nativo, sin distinción de código). Reutilizable después por otras pantallas sin cambiar su contrato. Se implementa en 10.4.b.

---

## Decisión Técnica 6 — Orden seguro de persistencia

**Pregunta:** ¿en qué orden se escriben `accessToken` y `usuario` en `localStorage`?

**Decisión:** se escribe **`"usuario"` primero**, y una vez persistido correctamente, **`"token"` al final**. No se unifican ambas piezas en una única clave — se mantiene el mismo esquema de almacenamiento ya usado por SDC v1.0. El evento `storage` se considera válido únicamente cuando el token ya fue persistido, evitando que otra pestaña opere con un token nuevo y un usuario viejo.

**Consecuencia arquitectónica inmediata:** no se modifica `login()`, `logout()` ni el interceptor de `401` (`api/client.ts`) — siguen usando el mismo formato de dos claves. El orden de escritura forma parte del contrato de implementación de 10.4.b y debe respetarse siempre.

---

## Decisión Técnica 7 — Evento `storage`

**Pregunta:** ¿cómo está diseñado el listener — qué clave observa, cuándo recarga, cómo evita duplicados?

**Decisión:** el listener escucha **exclusivamente** la clave `"token"`. Sin temporizadores, sin polling, sin mecanismos de sincronización adicionales, sin duplicar sobre otras claves. Actúa solo ante un cambio real del token. La pestaña que originó el cambio continúa su flujo normal; las demás reaccionan al evento nativo `storage` iniciando la recarga completa.

**Consecuencia arquitectónica inmediata:** único disparador de sincronización, simple y determinístico — sin condiciones de carrera por múltiples eventos. Hereda automáticamente la protección de la Decisión 5 sin código adicional. Se implementa en 10.4.b.

---

## Decisión Técnica 8 — Requests en curso

**Pregunta:** ¿hace falta algo para que una respuesta tardía no vuelva a pintar datos viejos tras iniciado el cambio?

**Decisión:** **no se incorpora ningún mecanismo adicional.** La recarga completa se considera suficiente para garantizar la convergencia al nuevo contexto. Cualquier request iniciado antes del cambio que responda durante la transición deja de tener relevancia porque la aplicación se destruye y reconstruye de inmediato. Sin `AbortController`, sin `requestId`, sin versionado de contexto.

**Consecuencia arquitectónica inmediata:** `api/client.ts` no se modifica. Coherente con el mismo riesgo, ya aceptado, de `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 10.

---

## Decisión Técnica 9 — Administración visual de accesos

**Pregunta:** ¿cómo se organizan, en rutas y menú, otorgar/listar/revocar accesos?

**Decisión:** una **única ruta y pantalla**, con dos secciones diferenciadas: otorgar acceso, y accesos vigentes (con posibilidad de revocar). Otorgar usa confirmación `"medium"`; revocar usa `"high"`, por ser una acción potencialmente disruptiva. No se crean rutas ni pantallas separadas. Se reutilizan los componentes de confirmación ya existentes. La interfaz siempre deja claro qué organización actúa y sobre qué usuario.

**Consecuencia arquitectónica inmediata:** consume los contratos de las Decisiones 1 y 2. Se implementa en 10.4.c.

---

## Decisión Técnica 10 — Alcance de Bloque 10.4

**Pregunta:** ¿la topología del Grupo Económico y la identidad compartida de Chofer entran en 10.4? ¿se confirma la división en tres sub-bloques?

**Decisión:**
- La administración de la topología del Grupo Económico (crear, asociar, desasociar organizaciones) **queda fuera** de 10.4 — 10.4 solo consume esa información, nunca la administra.
- La administración de `IdentidadChoferGrupo` **queda fuera** de 10.4 — ninguna pantalla para vincular/desvincular/administrar identidades de chofer en este bloque.
- Se mantiene la división en **tres sub-bloques**:
  - **10.4.a** — Backend mínimo de soporte (Decisiones 1 y 2, únicamente).
  - **10.4.b** — Selector de Organización, cambio de contexto, sincronización entre pestañas y comportamiento asociado (Decisiones 3 a 8).
  - **10.4.c** — Administración visual de accesos de Grupo Económico (Decisión 9).

**Consecuencia arquitectónica inmediata:** el frontend de 10.4 se limita a acceso multiempresa y cambio de organización, coherente con el Artículo 5 de `CONSTITUCION_SDC.md`. Cada sub-bloque queda pequeño, verificable e independiente, con puntos de control intermedios — mismo criterio ya aplicado en Bloques 8, 9 y 10.

---

## Resumen para la implementación

Las diez decisiones quedan incorporadas como restricciones obligatorias de los tres sub-bloques de Bloque 10.4:

- **10.4.a:** Decisiones 1 y 2 — los dos endpoints mínimos de backend, sin `RolesGuard` en el primero, sin ampliar el allow-list de Prisma crudo en ninguno.
- **10.4.b:** Decisiones 3 a 8 — selector, confirmación siempre, `beforeunload` solo en `ViajeForm.tsx`, orden `usuario`→`token`, listener atado a `"token"`, sin mecanismo adicional para requests en curso.
- **10.4.c:** Decisión 9 — pantalla única con dos secciones, severidades `medium`/`high` diferenciadas.
- **Alcance general:** Decisión 10 — topología del grupo e identidad de chofer excluidas de este bloque.

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en Bloques 10.1, 10.2, 10.3.a o 10.3.b. Con este documento queda cerrada formalmente la etapa de Diseño de Bloque 10.4. La implementación queda pendiente de una instrucción explícita posterior.

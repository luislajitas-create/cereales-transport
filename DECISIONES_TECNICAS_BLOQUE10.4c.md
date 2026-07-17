# Decisiones Técnicas — Bloque 10.4.c: Administración Visual de Accesos de Grupo Económico

Fecha: 2026-07-17. Registra exclusivamente las 4 decisiones técnicas resueltas sobre la base de `DISENO_BLOQUE10.4c.md` (aprobado como base técnica, sección 16 — "Preguntas que requieren decisión del Product Owner"). **No repite el diseño completo, no escribe implementación, no define migraciones.** Con este documento queda cerrada formalmente la etapa Auditoría → Diseño → Decisiones de Bloque 10.4.c. La implementación queda pendiente de una instrucción explícita posterior.

---

## Decisión Técnica 1 — Línea de contexto del grupo (resolución de la Tensión 1)

**Pregunta:** ¿se aprueba `"Grupo: {nombre}"` como línea secundaria de contexto, o se prefiere omitir por completo cualquier mención al grupo en pantalla?

**Decisión:** aprobado mostrar `"Grupo: {nombre}"` como línea secundaria de contexto, junto al título de la pantalla. **No constituye una tercera sección funcional** — sigue sin tarjeta propia, sin datos adicionales del grupo (`organizaciones` miembro no se muestran), sin ningún control interactivo asociado.

**Consecuencia arquitectónica inmediata:** confirma la resolución de la Tensión 1 tal como la propuso `DISENO_BLOQUE10.4c.md`, sección 3 — `GET /grupo-economico` sigue siendo exclusivamente un paso técnico de bootstrap para obtener el `:id` que las demás rutas necesitan; su único resultado visible es esa línea, con tratamiento tipográfico `.muted`, sin jerarquía de sección. La pantalla mantiene exactamente las dos secciones funcionales de la Decisión Técnica 9 de `DECISIONES_TECNICAS_BLOQUE10.4.md`: "Otorgar acceso" y "Accesos vigentes".

---

## Decisión Técnica 2 — Representación de `otorgadoPorId` (resolución de la Tensión 2)

**Pregunta:** ¿se aprueban las etiquetas `"Vos"` / `"Otro administrador de tu organización"` para representar `otorgadoPorId`, dado que `usuarios/resolver` no puede resolverlo (rechaza explícitamente usuarios de la propia organización del actor)?

**Decisión:** aprobadas ambas etiquetas, exactamente como las propuso `DISENO_BLOQUE10.4c.md`, sección 4. **No se muestra ningún UUID crudo. No se intenta resolver el nombre real mediante ningún contrato inexistente ni ampliación de backend.**

**Consecuencia arquitectónica inmediata:** la columna "Otorgado por" se resuelve con una comparación local, sin red — `otorgadoPorId === usuario.id` (de `useAuth()`) → `"Vos"`; en cualquier otro caso → `"Otro administrador de tu organización"`. Ambas etiquetas son verdaderas por construcción (el otorgante siempre pertenece a la organización del actor, confirmado en `AUDITORIA_BLOQUE10.4c.md`, sección 6). **Limitación que queda documentada, dependiente de una futura evolución del backend:** si en algún momento se necesita mostrar el nombre real de cualquier administrador que otorgó un acceso (no solo distinguir "vos" de "otro"), hace falta un contrato nuevo — no existe hoy, y 10.4.c no lo requiere.

---

## Decisión Técnica 3 — Placeholder ante un destinatario no resoluble

**Pregunta:** ¿se aprueba `"Usuario no disponible"` como placeholder cuando un `usuarioId` del listado no puede resolverse vía `usuarios/resolver` (ej. usuario desactivado después de otorgado el acceso), o se prefiere mostrar el UUID crudo como alternativa?

**Decisión:** aprobado `"Usuario no disponible"`. **No se muestra el UUID crudo como alternativa, en ningún caso.**

**Consecuencia arquitectónica inmediata:** el mapa de enriquecimiento (`enriquecidos: Record<string, Candidato | null>`, `DISENO_BLOQUE10.4c.md` sección 12) usa `null` como marca explícita de "no resoluble" — cualquier fila en ese estado renderiza el placeholder aprobado en la celda de destinatario, sin bloquear el resto de la tabla y sin exponer ningún identificador técnico en la interfaz. La fila sigue siendo revocable (el botón "Revocar" no depende de que el enriquecimiento haya tenido éxito) — la confirmación de revocación usa un texto genérico ("este acceso") cuando el nombre no está disponible, tal como ya preveía el diseño.

---

## Decisión Técnica 4 — Único campo de búsqueda por email

**Pregunta:** ¿se mantiene el formulario de otorgar con un único campo de búsqueda por email exacto, o se agrega también un campo alternativo de UUID (que el backend sí admite en `usuarios/resolver`)?

**Decisión:** aprobado mantener la búsqueda únicamente por email exacto. **No se agrega ningún campo ni modo alternativo de búsqueda por UUID en la interfaz.**

**Consecuencia arquitectónica inmediata:** el formulario de "Otorgar acceso" (`DISENO_BLOQUE10.4c.md`, sección 6) queda con un único campo de texto (email) y un único botón ("Buscar"), sin ningún selector de modo ni campo adicional. La capacidad del backend de resolver también por `usuarioId` (`GET .../usuarios/resolver?usuarioId=...`) sigue existiendo y se sigue usando internamente para el enriquecimiento del listado (Decisión 3) — simplemente no se expone como una segunda vía de búsqueda manual en este formulario.

---

## Resumen para la implementación

Las cuatro decisiones quedan incorporadas como restricciones obligatorias de 10.4.c:

- **Decisión 1:** `"Grupo: {nombre}"` como línea secundaria `.muted`, nunca como sección propia.
- **Decisión 2:** columna "Otorgado por" resuelta localmente (`"Vos"` / `"Otro administrador de tu organización"`), sin red, sin UUID, sin backend nuevo.
- **Decisión 3:** `"Usuario no disponible"` como único placeholder ante un destinatario no resoluble; sin UUID crudo en ningún caso.
- **Decisión 4:** formulario de otorgar con único campo de email; sin campo ni modo alternativo de UUID.

Ninguna decisión aquí registrada reabre ninguna decisión funcional o técnica ya aprobada en Bloques 10.1, 10.2, 10.3.a, 10.3.b, 10.4.a o 10.4.b. Con este documento queda cerrada formalmente la etapa Auditoría → Diseño → Decisiones de Bloque 10.4.c. La implementación queda pendiente de una instrucción explícita posterior.

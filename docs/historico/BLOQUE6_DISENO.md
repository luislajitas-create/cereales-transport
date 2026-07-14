# Bloque 6 — Diseño Técnico: Verificación y Blindaje de Producción

Fecha: 2026-07-09. Documento de diseño puro — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se tocó la base de datos, no se hizo commit. Responde a `BLOQUE6_AUDITORIA.md`, con el mismo nivel de rigor que los diseños de los Bloques 3-5.

---

## 0. Alcance

**En alcance**, los 5 hallazgos de la auditoría, agrupados en 3 entregas independientes entre sí (ver sección 8, criterios de sub-bloque de `METODOLOGIA_SDC.md`, punto 4: "el trabajo mezcla capas de riesgo distintas"):

- **6.1 — Verificación de producción** (auditoría §1): confirmar Root Directory/entrypoint real en Railway. Sin código propio; puede derivar en un ajuste de una línea en `package.json`/Dockerfile una vez conocido el resultado.
- **6.2 — Seguridad de infraestructura** (auditoría §2-3): fail-fast de `JWT_SECRET`/`CORS_ORIGIN`, rate-limiting en login.
- **6.3 — Integridad financiera de `cuentaCorriente()`** (auditoría §4): excluir facturas anuladas del cálculo de saldo.
- **6.4 — Infraestructura de despliegue** (auditoría §5): unificar Dockerfiles (depende del resultado de 6.1), automatizar `prisma migrate deploy`, verificar/documentar backup de Postgres.

**Fuera de alcance de este documento** (señalado en la auditoría §7, a resolver aparte si se decide):
- `HEALTHCHECK`/usuario no-root en Docker, `.env.example`, actualización de `README.md` a la estructura real del repo.
- Limpieza de los `schema*.prisma` sueltos y del directorio `app/` duplicado.
- Cualquier otro ítem de `DEUDA_TECNICA.md` no listado en la auditoría de este bloque.

---

## 1. Restricción de entrada de este bloque: acceso al dashboard de Railway

**Esto no es un detalle técnico menor, es una condición previa de todo el bloque.** 6.1 (verificación de producción) y una parte de 6.4 (confirmar si el plan de Railway incluye backups automáticos, y si la plataforma soporta un "release command" separado del `CMD` del contenedor) requieren entrar al dashboard de la cuenta de Railway del proyecto — un acceso que no está disponible para ejecutar este diseño de forma autónoma. **Es, en sí mismo, el primer punto de decisión pendiente** (ver sección 10): quién hace esa verificación y comunica el resultado antes de que 6.1 y la parte correspondiente de 6.4 puedan cerrarse.

6.2, 6.3 y el resto de 6.4 (unificación de Dockerfiles una vez decidido cuál, automatización de `migrate deploy` dentro del propio Dockerfile) no dependen de ese acceso y se pueden implementar y validar localmente sin él.

---

## 2. Diseño 6.1 — Verificación de producción

### 2.1 Procedimiento (sin código)

1. En el dashboard de Railway, para el servicio de **backend**: revisar la configuración "Root Directory" (o "Source" según la versión de la interfaz) — confirmar si apunta a `backend/` (correcto, estructura real del repo) o a `app/backend` (estructura vieja, descripta por el `README.md` desactualizado).
2. Mismo chequeo para el servicio de **frontend**: `frontend/` vs. `app/frontend`.
3. Revisar si hay un **"Start Command" configurado manualmente** que sobreescriba el `CMD` del Dockerfile — si existe y ya apunta a `dist/src/main.js`, explica por qué la validación del 07-03 funcionó pese a la discrepancia versionada en el repo.
4. Documentar el resultado exacto de los 3 puntos anteriores.

### 2.2 Qué hacer según el resultado (alternativas evaluadas)

| Resultado de la verificación | Acción |
|---|---|
| Root Directory correcto (`backend`/`frontend`) y Start Command ya corrige el entrypoint manualmente | El sistema funciona hoy por una configuración manual no versionada — **de todas formas se recomienda corregir `package.json` y ambos Dockerfiles** (ver 2.3) para que el repositorio deje de depender de un ajuste invisible fuera de control de versiones, que cualquier redeploy desde cero (o cualquier persona nueva reproduciendo el entorno) no replicaría. |
| Root Directory correcto pero sin Start Command manual (es decir, corre el `CMD` del Dockerfile tal cual) | El contenedor de producción está fallando o corriendo una versión anterior sin el build actual — **es el escenario crítico**, requiere corregir el entrypoint (2.3) como acción inmediata, no diferible. |
| Root Directory apunta a `app/backend`/`app/frontend` | Producción corre código viejo, sin relación con el trabajo de los Bloques 3-5 — el hallazgo P1 original de `BLOQUE5_AUDITORIA_PRODUCTO.md` se confirma en el peor escenario posible. Corregir el Root Directory a `backend/`/`frontend/` es la acción inmediata; después, igual, corregir el entrypoint (2.3). |

### 2.3 Corrección del entrypoint (código, condicional al resultado de 2.2)

**Alternativa A — Corregir la ruta en `package.json`/Dockerfiles a `dist/src/main.js` (recomendada).** Cambiar `"start": "node dist/main.js"` → `"start": "node dist/src/main.js"`, y el `CMD` de ambos Dockerfiles de la misma forma. Es el cambio de menor riesgo: no toca cómo `nest build` genera su salida, solo corrige la ruta que ya se usa hoy en la práctica (confirmado, es la ruta que se usó manualmente durante las pruebas de los Bloques 4.1-4.3).

**Alternativa B — Ajustar `tsconfig.json`/agregar `nest-cli.json` para que el build genere `dist/main.js` directamente.** Descartada como opción principal: cambia el comportamiento de compilación de todo el proyecto, con más superficie de riesgo que corregir 3 rutas ya conocidas, para un beneficio equivalente.

**Recomendación: Alternativa A.**

---

## 3. Diseño 6.2 — Seguridad de infraestructura

### 3.1 `JWT_SECRET`/`CORS_ORIGIN` fail-fast

**Regla:** al arrancar la aplicación (`main.ts`, antes de `app.listen()`), verificar que `process.env.JWT_SECRET` y `process.env.CORS_ORIGIN` existan y no estén vacíos. Si falta alguna, la aplicación termina el proceso inmediatamente con un mensaje explícito (`"JWT_SECRET no está definida — configurar la variable de entorno antes de arrancar"`), en vez de arrancar con el fallback hardcodeado.

**Alcance de la validación:** `AuthModule` deja de leer `process.env.JWT_SECRET || "dev-secret-change-me"` — pasa a asumir que la variable ya fue validada al arrancar (falla antes de llegar a construir el módulo si no lo está). Mismo criterio para `main.ts` y `CORS_ORIGIN`.

**Alternativa A — Fail-fast incondicional, en cualquier entorno.** Más simple, coherente con el principio ya usado en el proyecto de "validar en el borde, fallar explícito" (mismo criterio que las guardas de negocio de los Bloques 4.1-4.3). Impacto: quien levante el backend localmente sin exportar `JWT_SECRET`/`CORS_ORIGIN` (hoy posible, gracias al fallback) tendrá que hacerlo explícitamente — `docker-compose.yml` ya setea ambas variables (aunque `JWT_SECRET` sea un placeholder débil), así que el flujo de desarrollo con `docker-compose up` no se ve afectado; sí afecta a quien corra `npm run start:dev` directamente sin ese archivo de por medio.

**Alternativa B — Fail-fast solo si `NODE_ENV === "production"`.** Descartada: el proyecto no usa `NODE_ENV` de forma consistente en ningún otro punto del código (confirmado, no hay ninguna rama condicional por entorno hoy), introducirla solo para este caso agrega una distinción nueva sin ningún otro punto de apoyo, y el propio hallazgo de origen (`BACKEND_REVIEW.md`) es sobre el riesgo de que la variable falte "en el entorno real" — condicionar el fail-fast a que el entorno se autodeclare correctamente como productivo reintroduce el mismo problema de fondo (depender de una configuración que puede faltar) un nivel más arriba.

**Recomendación: Alternativa A**, con la advertencia explícita en este diseño de que el flujo de desarrollo local sin `docker-compose` requiere exportar ambas variables a partir de este cambio.

### 3.2 Rate-limiting en login

**Regla:** agregar `@nestjs/throttler` como dependencia nueva del backend, aplicado específicamente a `POST /auth/login` (no de forma global a toda la API, para no afectar el resto de los endpoints sin necesidad). Límite propuesto: 5 intentos por minuto por IP — valor estándar de referencia para endpoints de login, ajustable sin impacto de diseño si se prefiere otro número.

**Alternativa A — Rate-limiting global en toda la API.** Descartada: no es el hallazgo que motivó este bloque (B11 es específicamente sobre fuerza bruta en login), y aplicarlo globalmente podría interferir con flujos legítimos de uso intensivo (ej. la descarga de varios exports seguidos desde Liquidaciones) sin ningún beneficio de seguridad adicional relevante.

**Alternativa B — Rate-limiting solo en `POST /auth/login` (recomendada).** Acotado al endpoint donde el riesgo real fue identificado.

**Recomendación: Alternativa B.**

---

## 4. Diseño 6.3 — `cuentaCorriente()` excluye facturas anuladas

**Regla:** agregar `estado: { not: "ANULADO" }` al `where` de `factura.findMany` en `clientes.controller.ts:153-157`, junto al `clienteId` ya existente — mismo criterio que ya se aplica correctamente al `include` de `cobranzas` dos líneas más abajo (`where: { anulada: false }`).

**Alternativa A — Excluir completamente las facturas anuladas del resultado (recomendada).** Consistente con cómo ya se tratan las cobranzas anuladas en el mismo método — no aparecen en el cálculo de saldo.

**Alternativa B — Incluir las facturas anuladas en la respuesta, pero marcadas y sin afectar `saldo`.** Daría más trazabilidad visual (un usuario vería que hubo una factura anulada en el historial), pero requiere cambiar la forma de la respuesta (`raw.push(...)` pasaría a necesitar un campo adicional) y el frontend que la consume tendría que aprender a mostrarlo distinto — es una mejora de UX, no la corrección del bug de integridad que motivó este hallazgo. Se descarta para este bloque, queda anotada como posible mejora de UX futura, no como parte de este diseño.

**Recomendación: Alternativa A.** Corrige el hallazgo con el cambio mínimo necesario, sin tocar el contrato de la respuesta que el frontend ya consume.

---

## 5. Diseño 6.4 — Infraestructura de despliegue

### 5.1 Unificación de Dockerfiles

**Depende del resultado de 6.1.** Una vez confirmado cuál Dockerfile usa Railway realmente (o decidido cuál se prefiere si ambos son viables):

**Alternativa A — Conservar `backend/Dockerfile` (ya optimizado: `npm install --only=prod`, copia selectiva de `node_modules/.prisma`) y ajustar `railway.json`/el contexto de build para que apunte ahí, eliminando el `Dockerfile` de la raíz.** Es la recomendación ya hecha en `BACKEND_REVIEW.md` §4.

**Alternativa B — Mover el contenido de `backend/Dockerfile` a la raíz, eliminando `backend/Dockerfile`.** Funcionalmente equivalente a A, pero requeriría ajustar `docker-compose.yml` (que ya usa `context: ./backend`) — más superficie de cambio sin beneficio adicional.

**Recomendación: Alternativa A**, aplicando también la corrección de entrypoint de la sección 2.3 al Dockerfile que se conserve.

### 5.2 Automatizar `prisma migrate deploy`

**Alternativa A — Agregar el paso al `CMD` del Dockerfile** (ej. `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]`). No depende de ninguna funcionalidad específica de Railway, funciona igual en cualquier plataforma que ejecute el contenedor tal cual.

**Alternativa B — Usar un "release command" separado, si Railway lo soporta** (ejecutado una vez antes de cada deploy, no en cada arranque del contenedor). Más prolijo conceptualmente (separa migración de arranque), pero requiere confirmar en el dashboard de Railway si esa función existe en el plan actual — depende del mismo acceso señalado en la sección 1.

**Recomendación preliminar: Alternativa A**, por no depender de una funcionalidad de plataforma sin confirmar — revisable si la verificación de 6.1 confirma que Railway sí soporta un release command separado, en cuyo caso B es conceptualmente mejor (evita correr `migrate deploy` en cada restart del contenedor, no solo en cada deploy nuevo).

### 5.3 Backup de base de datos

**No es una tarea de código.** Verificar en el dashboard de Railway si el plan contratado incluye backups automáticos de PostgreSQL. Si los incluye, documentarlo (dónde se configuran, con qué frecuencia, cómo se restaura). Si no los incluye, evaluar activarlos o documentar explícitamente la decisión de no tenerlos como riesgo aceptado — pero no debería quedar en un estado desconocido, que es el estado actual.

---

## 6. Migraciones necesarias

**Ninguna.** Los 5 componentes de este bloque son cambios de código de aplicación (validación al arrancar, un filtro en un `where`, una dependencia nueva) y de configuración de infraestructura (Dockerfiles, variables de entorno, dashboard de Railway) — ninguno toca `schema.prisma` ni requiere una migración de Prisma.

---

## 7. Impacto en frontend

**Ninguno.** Los 5 componentes son 100% backend/infraestructura. `cuentaCorriente()` (6.3) cambia el resultado numérico que ya consume el frontend (`saldoActual` correcto en vez de inflado), pero no cambia la forma de la respuesta ni requiere ningún ajuste de código en el cliente.

---

## 8. Por qué se agrupan estos 5 hallazgos en un solo bloque, con 4 entregas internas

Según el criterio de `METODOLOGIA_SDC.md` (sección "criterios para dividir un bloque en sub-bloques"): los 5 hallazgos comparten el mismo origen (compromisos ya identificados en rondas anteriores, agrupados como "Prioridad 1" en `ROADMAP_ACTUALIZADO.md`) y el mismo criterio de urgencia (bloqueantes de producción según `DEUDA_TECNICA.md`), lo que justifica tratarlos como un bloque temático único (Bloque 6). Al mismo tiempo, mezclan capas de riesgo técnicamente distintas (verificación de infraestructura sin código, seguridad de aplicación, un bug de cálculo financiero, y configuración de despliegue) — el mismo criterio que separó 5.1 de 5.2 en su momento — por lo que se dividen en 4 entregas (6.1-6.4) con commits independientes, en vez de un solo commit gigante. 6.1 va primero porque 5.1 de 6.4 depende de su resultado; 6.2 y 6.3 no tienen dependencias entre sí ni con 6.1 y pueden implementarse en cualquier orden o en paralelo.

---

## 9. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | La verificación de Railway (6.1) revela que producción corre código desactualizado o el contenedor no arranca. | Alta si se confirma | Es exactamente el escenario que este bloque busca detectar — la mitigación es el propio bloque: corregir el entrypoint (2.3) y, si aplica, el Root Directory, de inmediato. |
| 2 | El fail-fast de `JWT_SECRET`/`CORS_ORIGIN` (6.2) rompe el arranque local de quien no tenga esas variables seteadas fuera de `docker-compose`. | Media | Documentado explícitamente en 3.1 — quien desarrolle localmente sin `docker-compose` deberá exportar ambas variables; no es una regresión oculta, es el comportamiento esperado del cambio. |
| 3 | El rate-limiting (6.2) bloquea accidentalmente a un usuario legítimo con varios intentos fallidos seguidos (contraseña incorrecta tipeada rápido). | Baja | El límite propuesto (5 intentos/minuto) es lo bastante permisivo para un error humano normal; se libera automáticamente pasado el minuto, sin intervención manual. |
| 4 | El fix de `cuentaCorriente()` (6.3) cambia un saldo que algún cliente ya venía mirando con el valor inflado, generando una pregunta de por qué "bajó". | Baja | Es una corrección de un bug, no un cambio de criterio — el valor nuevo es el correcto; si hace falta, se puede comunicar el cambio como parte del changelog de la versión que cierre este bloque. |
| 5 | Unificar Dockerfiles (6.4) antes de confirmar 6.1 podría consolidar el Dockerfile equivocado. | Media | Por diseño, 6.4/5.1 no se ejecuta hasta tener el resultado de 6.1 — ver sección 8, es la dependencia explícita del bloque. |

---

## 10. Puntos de decisión pendientes para tu aprobación

1. **Acceso al dashboard de Railway (sección 1):** ¿lo hacés vos directamente, o compartís las credenciales/acceso necesario para que la verificación de 6.1 se pueda ejecutar como parte de este bloque? Sin esto, 6.1 y la parte de backup de 6.4 no se pueden cerrar.
2. **Alcance del fail-fast (3.1):** ¿aprobás la Alternativa A (incondicional, en cualquier entorno) tal como se recomienda, asumiendo el impacto documentado en desarrollo local sin `docker-compose`?
3. **Límite de rate-limiting (3.2):** ¿5 intentos por minuto por IP te parece razonable, o preferís otro valor?
4. **Dockerfile a conservar (5.1):** ¿confirmás la Alternativa A (`backend/Dockerfile`, ya optimizado) una vez resuelto 6.1, o preferís evaluarlo con el resultado de la verificación en mano antes de decidir?
5. **Mecanismo de `migrate deploy` (5.2):** ¿arrancamos con la Alternativa A (dentro del `CMD`) mientras se confirma si Railway soporta un release command separado, o preferís esperar la confirmación antes de implementar cualquiera de las dos?

No se implementó nada de este diseño — queda a la espera de tu revisión y de tus respuestas a los 5 puntos anteriores antes de tocar código.

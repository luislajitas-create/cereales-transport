# Revisión de Implementación — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. Comprueba que el código implementado coincide exactamente con `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `DISEÑO_BLOQUE11_SEGURIDAD.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` y `PRE_IMPLEMENTACION_BLOQUE11.md`. **No corrige nada, no modifica código, no modifica documentación, no hace refactors, no hace `git add`/`commit`/`push`.** Todo lo que sigue es lectura del código real ya implementado (`git diff` contra el estado previo, lectura completa de archivos, búsquedas exhaustivas) — ningún hallazgo de esta revisión se corrigió en el momento de encontrarlo.

---

## 1. H-08 — Cuenta corriente

**Conformidad: total.** `git diff` de `clientes.controller.ts` confirma exactamente dos cambios en todo el archivo: el `import` de `encontrarOFallar` (H-01) y la condición `estado: { not: "ANULADO" }` agregada al `where` de `cuentaCorriente()` (H-08) — ningún otro método del controller (`create`, `update`, `remove`, exports) fue tocado. El filtro de cobranzas anuladas (`anulada: false`) y el orden cronológico quedan intactos.

**Confirmación pedida — ningún otro cálculo equivalente sin el filtro:** se buscó exhaustivamente en todo `backend/src` cualquier consulta agregada o de listado sobre `Factura` (`findMany`/`aggregate`/`groupBy`/`count`). Se encontraron 5 puntos adicionales, revisados uno por uno:

| Archivo | Qué calcula | ¿Excluye `ANULADO`? |
|---|---|---|
| `dashboard/dashboard.controller.ts:33` | Facturas vencidas del resumen ejecutivo | **Sí** — ya usaba `estado: { in: ["FACTURADO", "COBRADO_PARCIAL"] }` (lista de inclusión, exclusión implícita de `ANULADO` y `COBRADO_TOTAL`) |
| `inteligencia/aging.service.ts:53` | Cartera de Aging/Cobranzas (Centro de Inteligencia) | **Sí** — ya usaba exactamente `estado: { not: "ANULADO" }`, el mismo patrón literal que se acaba de aplicar en H-08 |
| `facturas/facturas.controller.ts:55, 74, 128` | `GET /facturas`, exports Excel/PDF — **listados**, no cálculos de saldo | No excluye, mismo criterio de negocio de siempre — es un listado general que debe poder mostrar también las facturas anuladas (con su columna `estado` visible), no un cálculo de deuda pendiente |

**Conclusión:** no existe ningún otro cálculo de tipo "saldo/deuda pendiente" con el mismo defecto que tenía `cuentaCorriente()` — el único caso real ya identificado en la auditoría. El hallazgo de `aging.service.ts` es, además, una confirmación indirecta de que la condición elegida para H-08 (`estado: { not: "ANULADO" }`) es la misma convención que el propio proyecto ya usaba en el módulo de Centro de Inteligencia, no una convención nueva inventada para este bloque.

**Desvíos respecto del diseño:** ninguno.

**Mejoras futuras posibles (no implementadas):** los 3 endpoints de `facturas.controller.ts` (listado y exports) no tienen un filtro explícito ni implícito por defecto sobre `ANULADO` — es correcto para su propósito actual (listado completo), pero si en el futuro se agregara algún tipo de total/subtotal a esas pantallas, debería revisarse con el mismo criterio que H-08.

---

## 2. H-07 — Rate limiting de login

**Conformidad: total.**

**Confirmación pedida — el rate limiting solo afecta login:** búsqueda exhaustiva de `ThrottlerGuard`/`APP_GUARD`/`ThrottlerModule` en todo `backend/src` — el guard (`LoginThrottlerGuard`) se declara una única vez (`auth.controller.ts`) y se aplica con `@UseGuards`/`@Throttle` una única vez, a nivel de método, exclusivamente sobre `login()`. No existe ningún provider `APP_GUARD` en ningún módulo — `ThrottlerModule.forRoot()` solo deja el mecanismo disponible para inyección dentro de `AuthModule`, sin aplicarlo por sí solo en ningún lado (comportamiento ya documentado y confirmado en Decisiones Técnicas, punto 2 de H-07). Los otros 3 endpoints del mismo controller (`cambiarOrganizacion`, `recuperarContrasena`, `restablecerContrasena`) y los 2 de `InvitacionesPublicasController` (mismo módulo) no tienen ningún decorador de throttling — confirmado por lectura completa de ambos archivos.

**Confirmación pedida — trust proxy no altera otros comportamientos:** búsqueda exhaustiva de `req.ip`, `req.protocol`, `req.secure`, `X-Forwarded-*` y `.ips` en todo `backend/src` — **cero resultados** fuera de lo que `@nestjs/throttler` ya usa internamente (no expuesto como código propio del proyecto). `app.enableCors(...)` (línea siguiente en `main.ts`) no depende de `trust proxy` — CORS se resuelve por el header `Origin`, no por la IP del cliente. No existe ningún otro punto del backend que lea la IP del request o el protocolo (`http`/`https`) percibido por Express. Confirmado: `trust proxy` no tiene ningún otro punto de interacción en este código más allá del propósito para el que se agregó.

**Desvíos respecto del diseño:** uno, ya reportado al finalizar la Implementación. `PRE_IMPLEMENTACION_BLOQUE11.md` (ajuste menor 3.2) citaba literalmente `app.set("trust proxy", 1)`; ese literal no compila contra el tipo `INestApplication` que devuelve `NestFactory.create()` (`.set()` no está en su tipo, es un método propio de la instancia de Express subyacente). Implementado como `app.getHttpAdapter().getInstance().set("trust proxy", 1)` — mismo efecto exacto, mismo punto de inserción en `main.ts`, sin cambiar el tipo de `app` en el resto del archivo. Es una corrección de sintaxis de TypeScript, no un cambio de comportamiento ni de la decisión aprobada.

**Mejoras futuras posibles (no implementadas):** ninguna identificada — el alcance ya es mínimo por diseño (solo login, solo IP, sin bloqueo de cuenta).

---

## 3. H-04 — Red de seguridad de modelos organizacionales

**Conformidad: total.** Se releyó el archivo de test completo (`organizacional-models.spec.ts`, 59 líneas) y `modelos-aislamiento-manual.ts` (21 líneas) contra lo aprobado.

**Revisión del test completo:** 6 `it()` — uno por cada una de las 5 validaciones pedidas en Decisiones Técnicas, con el primero cubriendo dos categorías a la vez (modelos faltantes y excepciones no documentadas, ya reconocido como la misma comprobación estructural desde el propio documento de Decisiones Técnicas) y dos `it()` separados para duplicados (uno por lista, en vez de uno combinado) — más explícito que lo mínimo, sin agregar complejidad real.

**Confirmación de independencia de base de datos:** el archivo solo importa `Prisma` de `@prisma/client` (acceso estático a `Prisma.dmmf`, sin instanciar `PrismaClient`/`PrismaService`) y las dos listas locales — ninguna requiere `DATABASE_URL` ni conexión de red. Confirmado además empíricamente durante la Implementación: `npm run test` corrió en verde sin que el backend ni Postgres estuvieran activos.

**Confirmación de calidad de mensajes:** los 6 `expect` usan `toEqual([])` o `toBe(...)`, sin mensaje personalizado — decisión ya justificada en Decisiones Técnicas (el diff que imprime Jest por defecto ya es autodescriptivo). Verificado empíricamente durante la Implementación (no en esta revisión, que no ejecuta nada): al remover temporalmente `"AccesoGrupoEconomico"` de la lista, el fallo mostró exactamente `+ Array ["AccesoGrupoEconomico"]` en el nombre del `it()` correspondiente — identifica el modelo exacto y la categoría exacta de violación sin ambigüedad.

**Revisión de `modelos-aislamiento-manual.ts`:** las 2 entradas (`AccesoGrupoEconomico`, `PagoConsolidadoLiquidacion`) coinciden exactamente con las aprobadas, cada una con su justificación citada inline, coherente con `schema.prisma`.

**Desvíos respecto del diseño:** ninguno.

**Mejoras futuras posibles (no implementadas):** integrar `npm run test` a un pipeline de CI si el proyecto llega a tener uno (ya señalado como fuera de alcance en Decisiones Técnicas); agregar un test análogo que verifique, además de `organizacionId`, otros campos de convención del proyecto si en el futuro surgiera un patrón equivalente (especulativo, no hay necesidad actual).

---

## 4. H-01 — Respuestas 404 reutilizables

**Conformidad: total.**

**Revisión de reutilización del helper:** búsqueda exhaustiva de `encontrarOFallar` en todo `backend/src` — aparece en exactamente 4 archivos: su propia definición (`common/encontrar-o-fallar.ts`) y los 3 controllers aprobados (`clientes`, `transportistas`, `choferes`). Ningún otro controller lo usa ni fue modificado — confirmado también por `git diff --stat`, que no muestra ningún archivo de controller fuera de esos 3 y `auth.controller.ts` (H-07). El patrón de uso es idéntico en los tres: `const x = await this.prisma.<modelo>.findUnique(...)` seguido de `return encontrarOFallar(x, "<Entidad> no encontrado.")` — mismo orden, mismo estilo, sin variaciones injustificadas entre los tres.

**Confirmación del contrato HTTP observable:** verificado empíricamente durante la Implementación contra los 6 casos posibles (id propio y ajeno/inexistente × 3 controllers) — el cuerpo de la respuesta `404` es exactamente `{"statusCode":404,"message":"<mensaje>","error":"Not Found"}` para cada uno, con el mensaje literal correspondiente (`"Cliente no encontrado."`, `"Transportista no encontrado."`, `"Chofer no encontrado."`), y `200` con los datos completos ante un id propio válido, sin ningún cambio de forma respecto del comportamiento previo. Coincide exactamente con lo definido en Decisiones Técnicas, punto 6.

**Desvíos respecto del diseño:** ninguno.

**Mejoras futuras posibles (no implementadas):** retrofit del mismo helper en los controllers que ya hacen el patrón inline correctamente (`viajes`, `facturas`, `liquidaciones`, `anticipos`) por consistencia de estilo — descartado deliberadamente desde el Diseño, no es una omisión de esta implementación.

---

## 5. H-02 — Bloqueo runtime de métodos raw de Prisma

**Conformidad: total.** Revisión exhaustiva del `Proxy` completo, no solo de los puntos ya verificados empíricamente durante Implementación.

**`git diff` de `organizacion-prisma.client.ts`:** 30 inserciones, 1 eliminación en todo el archivo — la única línea eliminada es `return prisma.$extends({` (reemplazada por `const clienteExtendido = prisma.$extends({`, para poder envolver el resultado antes de devolverlo). **Las 14 funciones de hook (`findMany`...`deleteMany`) y el guardia de escritura anidada (`asegurarSinEscrituraAnidada`/`contieneEscrituraAnidadaNoSoportada`) quedan sin ningún carácter modificado** — confirma directamente el punto pedido "no altera el cliente extendido".

**No rompe otros métodos:** el trap `get` solo intercepta (lanza error en) las 4 claves de `METODOS_RAW_BLOQUEADOS`; para cualquier otra clave, hace `target[prop]` y la devuelve tal cual (o atada, si es función) — comportamiento de paso transparente. Verificado empíricamente contra el código ya compilado (`dist/`) durante la Implementación: `organizacion.findMany` (lectura real contra Postgres) funcionó sin diferencias.

**Mantiene correctamente el binding:** la línea `return typeof valor === "function" ? valor.bind(target) : valor;` ata explícitamente cualquier método al objeto real (`target`, el cliente extendido), nunca al Proxy — la razón exacta, ya documentada en Decisiones Técnicas, es evitar que un método interno de Prisma que dependa de `this` (campos privados de clase u otro estado interno) reciba el Proxy en vez del objeto real. Los objetos delegados por modelo (`.cliente`, `.organizacion`, etc.) no son funciones — se devuelven sin atar, apuntando directamente al objeto real subyacente, fuera del alcance del Proxy a partir de ese punto (no hay wrapping recursivo, ni falta hace: los 4 métodos bloqueados son siempre de nivel raíz del cliente, nunca de un delegado de modelo).

**No afecta `$transaction()`:** confirmado dos veces con evidencia empírica real — una vez en Pre-Implementación (contra una copia local del mecanismo) y una segunda vez en Implementación (contra el código ya compilado, `dist/`), ambas invocando `$transaction()` **a través del objeto ya protegido**, y confirmando en las dos que `tx !== clienteExtendido` y `tx !== protegido`, y que `tx.$queryRaw` ejecuta SQL real sin ningún error.

**No altera el cliente extendido:** ya cubierto arriba por el `git diff` — el Proxy es un envoltorio nuevo que se construye a partir de `clienteExtendido` sin mutarlo; nada dentro del trap `get` escribe sobre `target`.

**Observaciones adicionales de esta revisión (no defectos, informativas):**
- El trap `has` (operador `in`) no está sobreescrito — `"$queryRaw" in clienteProtegido` devolvería `true` (delega al comportamiento por defecto sobre `target`), aunque el acceso real (`clienteProtegido.$queryRaw`) sí lanza el error. Sin impacto práctico: ningún punto del código usa `in` para verificar la existencia de estos métodos, y el bloqueo real (al acceder/invocar) sigue intacto.
- Los traps `ownKeys`/`getOwnPropertyDescriptor` tampoco están sobreescritos — `Object.keys(clienteProtegido)`, `JSON.stringify(clienteProtegido)` o un `for...in` reflejarían el objeto real sin filtrar. Sin impacto práctico: ningún controller ni servicio del proyecto enumera las propiedades del cliente inyectado, todos acceden por nombre explícito.
- La condición `typeof prop === "string"` en el trap excluye correctamente accesos por `Symbol` de la verificación de bloqueo (ninguno de los 4 métodos raw es un Symbol) sin afectar el paso transparente de props simbólicas — revisado explícitamente, no encontrado ningún caso donde esto genere un comportamiento distinto al esperado.

**Desvíos respecto del diseño:** ninguno.

**Mejoras futuras posibles (no implementadas):** si en algún momento se necesitara reflejar el bloqueo también en `in`/`Object.keys()` (por ejemplo, para una herramienta de introspección o depuración), agregar los traps `has`/`ownKeys` correspondientes — hoy no hay ningún caso de uso real que lo requiera, así que no se agregó (mismo criterio de "no introducir complejidad no necesaria" ya aplicado en el resto del bloque).

---

## Resumen de conformidad

| Hallazgo | Conformidad | Desvíos | Observaciones |
|---|---|---|---|
| H-08 | Total | Ninguno | Confirmado que `aging.service.ts` ya usaba la misma condición — sin otros cálculos equivalentes sin corregir |
| H-07 | Total | 1 (sintaxis de `trust proxy`, ya reportado, sin efecto de comportamiento) | Sin otro punto de interacción de `trust proxy` en el código |
| H-04 | Total | Ninguno | Independencia de base de datos y calidad de mensajes confirmadas |
| H-01 | Total | Ninguno | Reutilización limpia, contrato HTTP exacto |
| H-02 | Total | Ninguno | Revisión exhaustiva de traps de Proxy sin hallar ningún gap con impacto práctico |

**Ningún hallazgo requirió corrección durante esta revisión.** El único desvío detectado (H-07) ya estaba reportado desde el cierre de la Implementación, es puramente sintáctico, y no cambia ningún comportamiento aprobado.

---

## Conclusión

El código implementado coincide, punto por punto, con los cuatro documentos rectores del Bloque 11. Las verificaciones adicionales de esta revisión (búsqueda de cálculos financieros equivalentes para H-08, confirmación de que el rate-limiting y `trust proxy` no tienen ningún otro punto de interacción en el código, revisión exhaustiva de los traps del Proxy de H-02 más allá de lo ya verificado empíricamente) no encontraron ningún hallazgo que requiera corrección. Las mejoras futuras señaladas en cada sección son observaciones de bajo impacto, explícitamente no implementadas, para consideración en una etapa posterior si el Product Owner lo considera valioso.

Quedo a la espera de aprobación antes de comenzar la Validación Funcional formal.

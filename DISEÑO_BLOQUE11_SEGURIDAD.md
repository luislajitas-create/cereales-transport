# Diseño — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. Documento de diseño, sobre el alcance fijado por el Product Owner tras `AUDITORIA_BLOQUE11_SEGURIDAD.md`. **No implementa código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no actualiza el roadmap, no hace `git add`/`commit`/`push`.** Define la arquitectura de cada corrección al nivel necesario para pasar a Decisiones Técnicas — no fija todavía decisiones de implementación de grano fino (nombres exactos de variables, umbrales numéricos definitivos, mecanismo exacto de bajo nivel donde hay más de una opción razonable).

**Investigación adicional realizada para este diseño** (lectura de código, sin ejecutar ni modificar nada): se completó el relevamiento de los 24 modelos de `schema.prisma` con campo `organizacionId`, se confirmó por qué 2 de ellos están deliberadamente fuera de `ORGANIZACIONAL_MODELS` (relevante para H-04), y se confirmó que el frontend ya maneja de forma genérica cualquier error de login (relevante para H-07). Los hallazgos de esta investigación se documentan en las secciones correspondientes.

---

## 1. Objetivo

Diseñar la arquitectura de las cinco correcciones que el Product Owner aprobó para Bloque 11 (H-01, H-02, H-04, H-07, H-08), y documentar — sin implementarlo — el resultado de la revisión de modelos equivalentes a H-03 que el Product Owner pidió como único entregable de esa exclusión.

---

## 2. Alcance definitivo

Fijado por decisión del Product Owner (mensaje de aprobación de la auditoría), sin modificaciones de esta etapa de Diseño:

| Hallazgo | Decisión del Product Owner |
|---|---|
| H-01 (3 endpoints `200`/`404`) | Solución general reutilizable, no solo el parche puntual de los 3 endpoints |
| H-02 (`$queryRaw*` en runtime) | Eliminar el vector en runtime, preservando los usos legítimos dentro de `$transaction` |
| H-04 (red de seguridad `ORGANIZACIONAL_MODELS`) | Test automatizado |
| H-07 (rate-limiting login) | Solo rate-limiting; bloqueo de cuenta queda fuera |
| H-08 (`cuentaCorriente` sin excluir anulados) | Corrección de código en este bloque; la verificación contra datos reales de producción es una actividad previa al despliegue, no parte de la implementación |

---

## 3. Exclusiones

- **H-03** — excluido del alcance correctivo. Se mantiene la clasificación **MITIGADO POR SCHEMA** para el único caso real existente (`Contacto` vía `ClientesController.create()`), confirmada empíricamente en la etapa anterior. No se escribe ninguna corrección de código para H-03 en este bloque.
- **H-05, H-06** (`JWT_SECRET`, CORS) — ya resueltos desde Bloque 8.1.a, confirmado en la auditoría. No forman parte de este diseño.
- **Bloqueo de cuenta por intentos fallidos de login** — explícitamente fuera de H-07 por decisión del Product Owner. Sigue siendo el mismo riesgo remanente ya señalado al cierre de Bloque 9, sin resolver, pero no en este bloque.
- **Verificación contra datos reales de producción para H-08** — es una actividad de checklist previo al despliegue (sección 10, plan de ejecución), no parte de la implementación ni de las Decisiones Técnicas de este bloque.
- **Retrofit de los controllers ya correctos** (`viajes`, `facturas`, `liquidaciones`, `anticipos`) al nuevo helper de H-01 — no es parte del alcance mínimo (esos controllers ya cumplen el comportamiento correcto); se documenta como recomendación de consistencia a futuro, no como tarea de este bloque.
- **Extender el rate-limiting de H-07 a otros endpoints públicos** (`/auth/recuperar-contrasena`, `/auth/restablecer-contrasena`) — el hallazgo original (H-07) se limitó explícitamente a `POST /auth/login`; esta auditoría no recibió mandato para ampliarlo, y no lo hace por iniciativa propia.
- **Ningún cambio de frontend** — confirmado explícitamente para H-07 (ver sección 4.4): el frontend ya maneja cualquier error de login de forma genérica, no requiere ningún cambio para ser compatible con la corrección.

---

## 4. Arquitectura propuesta (por hallazgo)

### 4.1 H-01 — Helper reutilizable para `findOne` + `404`

**Arquitectura:** una única función de utilidad, ubicada junto al resto de las piezas compartidas de infraestructura del backend (`backend/src/common/`, donde ya vive `filters/prisma-exception.filter.ts`), que recibe el resultado (posiblemente `null`) de un `findUnique` y devuelve el valor si existe o lanza `NotFoundException` si no. Sigue el mismo patrón ya usado en los controllers que hoy lo hacen bien (`viajes.controller.ts`, `facturas.controller.ts`, etc.: `if (!x) throw new NotFoundException("mensaje")`), solo que extraído a una función reutilizable en vez de repetido inline.

**Componentes afectados:**
- Nuevo: `backend/src/common/` — un archivo de utilidad (ej. `encontrar-o-fallar.ts`), sin dependencias de NestJS más allá de `NotFoundException`.
- Modificados: `catalogos/clientes.controller.ts`, `catalogos/transportistas.controller.ts`, `catalogos/choferes.controller.ts` — el método `findOne` de cada uno pasa de `return this.prisma.X.findUnique(...)` a envolver ese resultado con el helper antes de devolverlo.

**Contratos afectados:** `GET /clientes/:id`, `GET /transportistas/:id`, `GET /choferes/:id`. Pasan de `200` con cuerpo vacío a `404` con un cuerpo de error estándar (`{ statusCode: 404, message: "...", error: "Not Found" }`, el mismo formato que ya usan los demás `404` del sistema) cuando el `id` no existe o pertenece a otra organización.

**Compatibilidad hacia atrás:** confirmada sin impacto en la auditoría — ningún archivo del frontend actual (`frontend/src`) llama a ninguno de los tres endpoints. No hay ningún consumidor real hoy cuyo comportamiento cambie.

### 4.2 H-02 — Eliminación en runtime de `$queryRaw*`/`$executeRaw*`

**Arquitectura:** el cliente Prisma de nivel superior que expone `ORGANIZACION_PRISMA` (construido en `crearClienteOrganizacional`, `backend/src/prisma/organizacion-prisma.client.ts`) debe dejar de exponer, **en el objeto real, no solo en el tipo**, los cuatro métodos `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`. La corrección se aplica **únicamente sobre ese objeto de nivel superior** — nunca sobre el cliente de transacción (`tx`) que recibe el callback de `$transaction()`, que Prisma construye como un objeto independiente en cada llamada y que ya expone `$queryRaw` de forma correcta y deliberada (comentario existente en el propio archivo, confirmado por esta investigación: los dos usos reales, `facturas.controller.ts:349` y `facturas.controller.ts:397`, ambos `tx.$queryRaw` con interpolación parametrizada para `SELECT ... FOR UPDATE`).

Dos mecanismos son técnicamente viables para lograrlo — la elección entre ellos queda para Decisiones Técnicas, no se fija acá:
1. **Interceptar el acceso** a esas cuatro propiedades en el objeto devuelto (p. ej. mediante un `Proxy` que lanza un error descriptivo si se intenta leer/invocar cualquiera de las cuatro).
2. **Eliminar/sobrescribir directamente** esas cuatro propiedades del objeto devuelto por `$extends()` antes de devolverlo desde `crearClienteOrganizacional`.

Ambos logran el mismo resultado observable (el objeto inyectado por `ORGANIZACION_PRISMA` ya no tiene esos cuatro métodos operativos); difieren en robustez ante formas indirectas de acceso (p. ej. `Object.getPrototypeOf`) y en la claridad del mensaje de error que recibiría un desarrollador que lo intente por error — la evaluación de ese detalle es explícitamente trabajo de Decisiones Técnicas.

**Componentes afectados:** únicamente `backend/src/prisma/organizacion-prisma.client.ts`. Ningún controller cambia — hoy ningún controller usa `$queryRaw*`/`$executeRaw*` sobre el cliente de nivel superior (confirmado en la auditoría), así que no hay ningún código legítimo que deba adaptarse.

**Contratos afectados:** ninguno público (HTTP). Es un endurecimiento interno — el contrato que cambia es el contrato *interno* entre `OrganizacionPrismaClient` y quien lo consume dentro del backend (hoy ya reflejado a nivel de tipos, pasa a estar reflejado también en runtime).

**Compatibilidad hacia atrás:** total para el uso legítimo (`tx.$queryRaw` no se toca). El único "usuario" que deja de poder hacer algo que antes podía es un `(this.prisma as any).$queryRawUnsafe(...)` puntual — que hoy no existe en ningún controller (confirmado por búsqueda exhaustiva en la auditoría) y que, por definición, nunca fue un uso soportado ni documentado.

### 4.3 H-03 — Revisión de modelos equivalentes (documentación, sin corrección)

Por instrucción del Product Owner, este punto no genera ninguna corrección de código — solo el resultado de la revisión.

**Relevamiento completo ejecutado:** de los 24 modelos de `schema.prisma` con un campo escalar `organizacionId`, 22 están en `ORGANIZACIONAL_MODELS` (aislamiento automático vía la extensión de Prisma) y **2 no lo están**: `AccesoGrupoEconomico` y `PagoConsolidadoLiquidacion`. Ambas exclusiones están **documentadas explícitamente y de forma deliberada en el propio `schema.prisma`**, no son un olvido:
- `AccesoGrupoEconomico` (línea 115-116 del schema): *"No es un modelo organizacional (no vive en ORGANIZACIONAL_MODELS) — mismo tratamiento que GrupoEconomico e IdentidadChoferGrupo, aislamiento manual, nunca por la extensión de Prisma"* — es, en sí mismo, el mecanismo de acceso cruzado entre organizaciones; auto-limitarlo a la organización del actor rompería su propio propósito.
- `PagoConsolidadoLiquidacion` (línea 439-441 del schema): *"No es organizacional (une organizaciones distintas, no podría serlo)"* — cada fila representa deliberadamente una liquidación de una organización distinta a la del actor que arma el pago consolidado.

Se verificó además, leyendo `acceso-grupo.controller.ts` y `pago-consolidado.service.ts`, que **ambos modelos ya se filtran manualmente por `organizacionId` en cada consulta relevante** (explícito en el `where` de cada `findMany`/`findFirst`/`create`, o mediante el cambio deliberado de contexto vía `organizacionContextStorage.run({ organizacionId }, ...)` para operar, a propósito, sobre la organización específica de cada fila de un pago consolidado). No se encontró ninguna consulta sin acotar sobre ninguno de los dos modelos.

**Conclusión de esta revisión, para registro:** no existe ningún modelo con `organizacionId` que esté fuera de `ORGANIZACIONAL_MODELS` de forma no documentada o accidental. Las únicas dos excepciones son arquitectónicamente necesarias, ya están documentadas en el propio schema, y ya se manejan correctamente en el código actual. **Esto no cierra la necesidad de H-04** — al contrario, la informa directamente: el test automatizado de H-04 no puede asumir ingenuamente que "todo modelo con `organizacionId` debe estar en `ORGANIZACIONAL_MODELS`" (eso marcaría estos dos casos legítimos como error); debe reconocer la existencia de excepciones deliberadas y documentadas. Ver sección 4.4.

### 4.4 H-04 — Red de seguridad automática (test automatizado)

**Arquitectura:** dado el hallazgo de la sección 4.3, la prueba no puede ser un simple "todo modelo con `organizacionId` debe estar en `ORGANIZACIONAL_MODELS`" — necesita reconocer también las exclusiones deliberadas. Arquitectura de dos piezas:

1. **Un nuevo registro paralelo**, análogo a `ORGANIZACIONAL_MODELS` pero para el caso opuesto — la lista, ya identificada en la sección 4.3, de los modelos que tienen `organizacionId` pero se aíslan manualmente a propósito (`AccesoGrupoEconomico`, `PagoConsolidadoLiquidacion`), cada uno con una razón documentada inline (mismo criterio que ya usa el propio `schema.prisma` hoy, consolidado en un único lugar del código en vez de disperso en comentarios de schema).
2. **Un test** que, usando la introspección de Prisma (`Prisma.dmmf.datamodel.models`, disponible en runtime desde `@prisma/client` sin necesitar conexión a una base de datos — el test no requiere Postgres para correr) obtiene la lista real de modelos del schema con un campo escalar `organizacionId`, y verifica que **cada uno de ellos aparezca en exactamente una** de las dos listas (`ORGANIZACIONAL_MODELS` o la nueva lista de aislamiento manual) — nunca en ninguna, nunca en ambas. Adicionalmente, verifica el sentido inverso: que cada entrada de ambas listas corresponda a un modelo que realmente existe en el schema actual (protege contra una entrada vieja que sobrevive a un modelo renombrado o eliminado).

**Componentes afectados:**
- Nuevo: `backend/src/prisma/modelos-aislamiento-manual.ts` (o nombre equivalente a definir en Decisiones Técnicas) — la lista paralela de la pieza 1.
- Nuevo: un archivo de test (p. ej. `backend/src/prisma/organizacional-models.spec.ts`).
- Nuevo (infraestructura, no solo un archivo): el proyecto **no tiene hoy ningún test automatizado** — confirmado en la auditoría (sin `jest.config`, sin script `"test"`, sin `jest`/`ts-jest`/`@types/jest` en `package.json`). Este hallazgo es, en los hechos, **el primer test automatizado de todo el backend**, no una adición incremental a una suite existente. Requiere agregar `jest`, `ts-jest` (o el preset que NestJS usa por convención) y `@types/jest` como `devDependencies`, más un archivo de configuración de Jest y un script `"test"` en `backend/package.json`.

**Contratos afectados:** ninguno — es una pieza de verificación en tiempo de build/CI, no código que se ejecuta en producción ni que afecta ningún endpoint.

**Compatibilidad hacia atrás:** total — no toca ningún archivo de producción existente salvo `package.json` (agregar dependencias de desarrollo y un script). Es puramente aditivo.

### 4.5 H-07 — Rate limiting en `POST /auth/login`

**Arquitectura:** incorporar `@nestjs/throttler` (la librería estándar del propio framework, ya usado en todo el backend — coherente con no introducir un patrón ajeno al stack existente), aplicado **específicamente al endpoint de login**, con clave de limitación por IP de origen (comportamiento por defecto de la librería, adecuado acá porque `POST /auth/login` no tiene ningún usuario autenticado todavía que permita limitar por otra clave). No se aplica de forma global a toda la API — el resto de los endpoints (autenticados, y los otros tres públicos: `cambiar-organizacion`, `recuperar-contrasena`, `restablecer-contrasena`) queda fuera de este mecanismo, según el alcance fijado por el Product Owner (sección 3).

**Componentes afectados:**
- `backend/package.json` — nueva dependencia de producción `@nestjs/throttler`.
- `backend/src/auth/auth.module.ts` — registro del módulo/guard de throttling.
- `backend/src/auth/auth.controller.ts` — aplicación del guard/decorador únicamente sobre el método `login()`.

**Contratos afectados:** `POST /auth/login` gana una respuesta nueva posible, `429 Too Many Requests`, tras superar el umbral de intentos en la ventana configurada (el valor exacto del umbral y la ventana son una decisión de configuración, no de arquitectura — se define en Decisiones Técnicas, no en este documento).

**Compatibilidad hacia atrás — verificada, no asumida:** se revisó `frontend/src/pages/Login.tsx` — el manejo de error ya es genérico (`err?.response?.data?.message || "No se pudo iniciar sesión"`), sin ninguna lógica que distinga por código de estado. Un `429` se muestra automáticamente como el mensaje de error que devuelva el backend, sin ningún cambio de frontend necesario — confirma que la restricción "no modificar frontend" es compatible con este hallazgo sin ninguna excepción.

### 4.6 H-08 — Excluir facturas `ANULADO` de `cuentaCorriente()`

**Arquitectura:** la corrección es un cambio acotado al filtro `where` de la consulta `this.prisma.factura.findMany(...)` dentro de `ClientesController.cuentaCorriente()` — agregar la condición que excluye `Factura.estado === "ANULADO"`, en el mismo lugar donde el código ya excluye `Cobranza.anulada === true` (mismo patrón, ya existente en la misma función, para el concepto análogo del lado de las cobranzas).

**Componentes afectados:** únicamente `backend/src/catalogos/clientes.controller.ts`, método `cuentaCorriente()`. Ningún otro archivo.

**Contratos afectados:** `GET /clientes/:id/cuenta-corriente` — el `saldoActual` y el arreglo `movimientos` de la respuesta cambian (bajan) para cualquier cliente con al menos una factura en estado `ANULADO`. Es un cambio de **valor devuelto**, no de forma del contrato (mismo shape de respuesta, mismos campos, mismos tipos).

**Compatibilidad hacia atrás:** el cambio de valor es, por definición, visible para cualquier usuario que ya haya visto el saldo incorrecto de un cliente con facturas anuladas — no es una regresión, es la corrección de un dato que ya estaba mal. Por decisión del Product Owner (sección 2), medir el tamaño real de ese impacto contra producción es una actividad separada, previa al despliegue (sección 10), no parte de esta implementación ni de este diseño.

---

## 5. Impacto por componente (resumen consolidado)

| Componente | H-01 | H-02 | H-04 | H-07 | H-08 |
|---|---|---|---|---|---|
| `backend/src/common/` (nuevo helper) | ✅ nuevo archivo | | | | |
| `catalogos/clientes.controller.ts` | ✅ modificado | | | | ✅ modificado |
| `catalogos/transportistas.controller.ts` | ✅ modificado | | | | |
| `catalogos/choferes.controller.ts` | ✅ modificado | | | | |
| `prisma/organizacion-prisma.client.ts` | | ✅ modificado | | | |
| `prisma/modelos-aislamiento-manual.ts` (nuevo) | | | ✅ nuevo archivo | | |
| `prisma/organizacional-models.spec.ts` (nuevo) | | | ✅ nuevo archivo | | |
| `backend/package.json` (dependencias/scripts) | | | ✅ devDependencies + script `test` | ✅ dependencia `@nestjs/throttler` | |
| `jest.config` (nuevo) | | | ✅ nuevo archivo | | |
| `auth/auth.module.ts` | | | | ✅ modificado | |
| `auth/auth.controller.ts` | | | | ✅ modificado | |
| Frontend (cualquier archivo) | — | — | — | — (verificado compatible sin cambios) | — |
| `schema.prisma` / migraciones | — | — | — | — | — |

**Ningún hallazgo de este bloque toca `schema.prisma` ni requiere una migración** — consistente con la restricción del Product Owner para esta etapa, y también válido como expectativa para la etapa de Implementación que seguirá después de Decisiones Técnicas.

---

## 6. Estrategia de implementación

Dado que el proyecto no tiene, hasta H-04, ningún test automatizado, la estrategia de validación de H-01, H-02, H-07 y H-08 es la misma que ya usó todo el proyecto hasta ahora (Bloques 8, 9, 10): **validación funcional manual, vía HTTP real, contra el ambiente de desarrollo local** (login real → JWT real → request real), no invocación directa a servicios ni mocks. H-04 es la única excepción — su propia naturaleza es ser un test automatizado, así que su validación es el test mismo pasando (y, como verificación adicional durante la implementación, confirmando que falla si se retira deliberadamente una entrada real de cualquiera de las dos listas).

Cada hallazgo se implementa, valida y — según la disciplina ya usada en bloques anteriores — se somete a commit y verificación de producción **de forma independiente**, no en un único commit conjunto: son cinco cambios sin dependencias técnicas entre sí (confirmado en la auditoría), así que agruparlos en un solo commit solo aumentaría el radio de un eventual rollback sin ningún beneficio real.

---

## 7. Estrategia de pruebas

| Hallazgo | Tipo de prueba | Casos mínimos |
|---|---|---|
| H-01 | Manual, HTTP real | Por cada uno de los 3 endpoints: `id` propio (200 con datos), `id` de otra organización (404), `id` inexistente (404) |
| H-02 | Manual, HTTP real + diagnóstico puntual (mismo método que la resolución empírica de H-03) | Confirmar que un intento deliberado de invocar `$queryRaw*`/`$executeRaw*` sobre el cliente de nivel superior falla de la forma esperada; regresión explícita de los 2 usos legítimos de `tx.$queryRaw` en `facturas.controller.ts` (registrar cobranza, con y sin concurrencia) |
| H-04 | Automatizado (Jest) — este es el propio entregable | El test pasa en el estado actual correcto del código; y, como verificación de que el test realmente prueba algo, falla deliberadamente si se retira una entrada real de cualquiera de las dos listas durante la implementación (y se revierte esa prueba negativa antes de cerrar) |
| H-07 | Manual, HTTP real | Login válido repetido hasta justo antes del umbral (siempre 200/401 según credenciales, nunca 429); intento número N+1 dentro de la ventana → 429; después de que expira la ventana, login vuelve a aceptarse normalmente |
| H-08 | Manual, HTTP real, contra datos de desarrollo | Cliente con una factura `ANULADO` conocida: `saldoActual` excluye su importe; cliente sin facturas anuladas: `saldoActual` idéntico al valor previo a la corrección (regresión) |

---

## 8. Criterios de aceptación

- **H-01:** los 3 endpoints devuelven `404` (no `200` vacío) ante un `id` inexistente o de otra organización, y siguen devolviendo `200` con los datos correctos ante un `id` propio válido. Cero regresión en los demás endpoints de los mismos 3 controllers (`findAll`, `create`, `update`, `remove`, exports).
- **H-02:** el objeto inyectado como `ORGANIZACION_PRISMA` no permite invocar `$queryRaw`, `$queryRawUnsafe`, `$executeRaw` ni `$executeRawUnsafe` en runtime. Los 2 usos legítimos de `tx.$queryRaw` dentro de `$transaction` en `facturas.controller.ts` siguen funcionando exactamente igual, verificado con los mismos casos que ya los ejercitan hoy (registro de cobranza con bloqueo de fila).
- **H-04:** el test nuevo pasa en el estado correcto del código; falla si se retira una entrada real de `ORGANIZACIONAL_MODELS` o de la nueva lista de aislamiento manual, o si se agrega un modelo nuevo con `organizacionId` sin registrarlo en ninguna de las dos. `npm run test` (o el script que se defina) corre sin necesitar una base de datos activa.
- **H-07:** `POST /auth/login` responde `429` al superar el umbral configurado de intentos en la ventana definida, y vuelve a aceptar solicitudes normalmente una vez que la ventana expira. Ningún otro endpoint (autenticado o público) queda afectado por el nuevo guard.
- **H-08:** `GET /clientes/:id/cuenta-corriente` excluye del cálculo de `debe`/`saldoActual` cualquier factura en estado `ANULADO`, para cualquier cliente que tenga al menos una. El resto del cálculo (cobranzas anuladas ya excluidas, orden cronológico, estructura de la respuesta) no cambia.

---

## 9. Riesgos de implementación

| Hallazgo | Riesgo | Mitigación propuesta |
|---|---|---|
| H-01 | Bajo — cambio acotado, sin consumidores reales hoy (confirmado) | Ninguna mitigación especial más allá de la prueba de regresión de los demás métodos del mismo controller |
| H-02 | Medio — el mecanismo elegido (Proxy vs. eliminación directa de propiedades) podría, si se implementa de forma descuidada, afectar accidentalmente al cliente de transacción si ambos terminan compartiendo el mismo objeto base de forma más profunda de lo que sugiere la lectura actual del código | Verificación explícita, antes de cerrar el hallazgo, de que `tx.$queryRaw` sigue funcionando — no asumir por lectura de código, confirmar empíricamente (mismo criterio que se usó para resolver H-03) |
| H-04 | Medio — es la pieza de mayor superficie nueva (primera infraestructura de testing del proyecto); un jest mal configurado podría interferir con el build o el watch mode ya existente (`nest start --watch`) si no se aísla correctamente | Configurar Jest como un proceso completamente separado del build de Nest (no debe correr como parte de `npm run start:dev` ni de `npm run build`), y confirmar explícitamente que ambos comandos existentes siguen funcionando sin cambios después de agregar la infraestructura de test |
| H-07 | Medio-alto — es el hallazgo con más posibilidad de fricción práctica: un umbral mal calibrado podría bloquear pruebas manuales legítimas (el propio patrón de validación de este proyecto, que repetidamente hace logins sucesivos con distintos usuarios/organizaciones durante una misma sesión de prueba) | Elegir un umbral y ventana conservadores en primera instancia (a definir en Decisiones Técnicas) que no interfieran con el patrón de validación manual ya establecido, y confirmar explícitamente ese caso (varios logins legítimos sucesivos, distintos usuarios) como parte de la prueba de aceptación, no solo el caso de ataque |
| H-08 | Bajo técnicamente, medio en percepción — el cambio es correcto y acotado, pero cambia un número financiero que alguien ya vio antes | Mitigado por la decisión ya tomada del Product Owner (verificación de impacto real en producción antes del despliegue, sección 10) — no es un riesgo que este diseño deba resolver, ya tiene un plan |

---

## 10. Plan de ejecución (orden óptimo)

La auditoría ya confirmó que los cinco hallazgos no tienen dependencias técnicas entre sí — el orden que sigue no responde a una necesidad de secuencia obligatoria, sino a minimizar el riesgo acumulado y maximizar el valor entregado más temprano:

1. **H-08** — el cambio más simple y acotado de los cinco (una condición en un `where`), corrige un dato financiero ya incorrecto en producción hoy, y tiene el menor riesgo de regresión de todo el bloque. Se prioriza primero por relación esfuerzo/valor.
2. **H-07** — el hallazgo de mayor riesgo de seguridad real y ya confirmado (sistema expuesto públicamente sin límite de intentos de login) — se prioriza en segundo lugar, apenas después del de menor esfuerzo, para cerrar la exposición real cuanto antes.
3. **H-04** — sin urgencia propia (es preventivo, no corrige nada que esté fallando hoy) pero de riesgo de implementación bajo-medio y sin ninguna dependencia; conviene tenerlo en pie antes de los dos hallazgos restantes para dejar sentada la infraestructura de testing del proyecto, aunque no la usen directamente.
4. **H-01** — bajo riesgo, sin consumidores reales, se implementa con tranquilidad después de los tres anteriores.
5. **H-02** — se deja último a propósito: es el que más beneficio obtiene de la disciplina de verificación empírica ya aplicada en este mismo bloque para H-03 (confirmar en desarrollo, no solo por lectura de código, que `tx.$queryRaw` sigue intacto) y el que, de los cinco, tiene la consecuencia más seria si se implementa mal (romper un mecanismo de bloqueo de fila ya en uso en producción, en el flujo de cobranzas).

Cada punto se implementa, valida (sección 7), y se cierra individualmente (commit, verificación de producción) antes de empezar el siguiente — mismo criterio metodológico ya usado en todos los bloques anteriores del proyecto.

---

## Conclusión

Las cinco correcciones aprobadas por el Product Owner tienen, cada una, una arquitectura definida a nivel de componente, contrato y compatibilidad — sin fijar todavía decisiones de implementación de grano fino (mecanismo exacto de H-02, umbral exacto de H-07, nombres definitivos de archivos nuevos), que corresponden a la etapa de Decisiones Técnicas. La revisión de H-03 pedida por el Product Owner se completó: los únicos dos modelos organizacionales fuera de `ORGANIZACIONAL_MODELS` (`AccesoGrupoEconomico`, `PagoConsolidadoLiquidacion`) están documentados de forma deliberada desde su creación y ya se manejan correctamente en el código — ese hallazgo, en lugar de generar una corrección propia, informa directamente la arquitectura de H-04.

Ningún hallazgo requiere cambios de schema, migraciones, ni cambios de frontend. Los cinco son independientes entre sí y pueden implementarse, validarse y cerrarse uno por uno, en el orden propuesto en la sección 10 o en cualquier otro, sin bloquearse mutuamente.

Quedo a la espera de aprobación antes de pasar a la etapa de Decisiones Técnicas.

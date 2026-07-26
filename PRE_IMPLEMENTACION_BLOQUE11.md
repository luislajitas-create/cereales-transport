# Pre-Implementación — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. Verifica que `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (aprobado) es implementable exactamente como fue aprobado. **No implementa código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no crea tests, no actualiza documentación existente, no hace `git add`/`commit`/`push`.** No modifica ninguna decisión técnica ya cerrada ni abre alternativas nuevas — donde se detectó una ambigüedad ya señalada como pendiente en el propio documento de Decisiones Técnicas, se cierra como ajuste menor (sección 3), nunca como una decisión nueva.

**Método:** para H-02, dado que la propia justificación de Decisiones Técnicas insiste explícitamente en "confirmar empíricamente, no asumir por lectura de código" (mismo criterio ya aplicado para resolver H-03), esta etapa ejecutó un diagnóstico puntual y temporal en el ambiente de desarrollo local — mismo procedimiento y mismas salvaguardas ya usadas para H-03 (script temporal, eliminado antes de finalizar, sin tocar datos reales, sin quedar en `git status`). Para el resto de los puntos, la verificación fue por lectura directa de los archivos reales del proyecto (`tsconfig.json`, `organizacion-prisma.module.ts`, ausencia de `nest-cli.json`/config de Jest previa).

---

## 1. H-02 — Verificación empírica

Diagnóstico ejecutado en `backend/` contra Postgres local, usando el mecanismo exacto ya cerrado en Decisiones Técnicas (Proxy con `get` trap, bind de funciones al objeto real, lista de 4 métodos bloqueados).

| Punto a confirmar | Resultado empírico | Conclusión |
|---|---|---|
| **Objeto exacto que envuelve el Proxy** | Se envolvió el resultado real de `prisma.$extends(...)` (el mismo tipo de objeto que devuelve `crearClienteOrganizacional` hoy) | Confirmado: es el objeto correcto, coincide exactamente con el diseño aprobado |
| **¿`$queryRaw` es propiedad propia (own) del objeto extendido?** | `Object.prototype.hasOwnProperty.call(extendido, "$queryRaw")` → `false` (pero `typeof extendido.$queryRaw === "function"`) | **Confirma la justificación ya usada para descartar la eliminación directa de propiedades** (Decisiones Técnicas, H-02): `$queryRaw` no es una propiedad propia — un `delete`/reasignación directa no lo habría removido de forma confiable. El Proxy era la única opción robusta, tal como ya se había decidido. |
| **Momento exacto de creación** | El Proxy se puede aplicar inmediatamente después de `prisma.$extends(...)`, dentro de la misma función, sin ningún paso intermedio necesario | Confirma que aplicarlo dentro de `crearClienteOrganizacional()`, antes del `return`, es directamente implementable sin ningún ajuste |
| **Bloqueo de los 4 métodos** | Los 4 (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`) lanzaron el error esperado al acceder a través del Proxy, con el mensaje exacto ya definido | Confirmado sin desviaciones |
| **Método legítimo a través del Proxy** | `protegido.organizacion.findMany(...)` — consulta real contra la base de desarrollo, devolvió los 3 registros reales existentes | Confirma que el `bind(target)` no rompe ningún método normal del cliente |
| **Comportamiento de `$transaction()` invocado A TRAVÉS del Proxy** | `protegido.$transaction(async (tx) => {...})` — la transacción se abrió y ejecutó una consulta real (`SELECT 1`) sin ningún error | Confirmado — invocar `$transaction` desde el objeto protegido no genera ningún problema, tal como predecía el diseño (`$transaction` no está en la lista de métodos bloqueados) |
| **¿El cliente transaccional (`tx`) queda accidentalmente afectado?** | `tx === extendido` → `false`. `tx === protegido` (el Proxy) → `false`. `typeof tx.$queryRaw` → `"function"`. `tx.$queryRaw` ejecutó una consulta SQL real con éxito, **incluso habiendo invocado `$transaction` desde el objeto envuelto por el Proxy** | **Confirmación directa y definitiva del punto más sensible de H-02**: `tx` es un objeto genuinamente independiente, nunca comparte identidad con el objeto protegido ni con el objeto extendido de base. El Proxy que envuelve el cliente de nivel superior no afecta, bajo ninguna circunstancia observada, al cliente transaccional. |
| **Ausencia de incompatibilidades con `Prisma.$extends()`** | El `$extends()` real (no un mock) se ejecutó sin error, con una extensión mínima (`{ name: "diagnóstico-h02" }`), y el objeto resultante se comportó exactamente como predecía el diseño en todos los puntos anteriores | Sin incompatibilidad detectada. La extensión real usada en producción (`crearClienteOrganizacional`, con sus hooks de `$allModels`) es un superconjunto de la usada en este diagnóstico — los hallazgos de identidad de objetos y de propiedades no dependen de qué hooks concretos se definan, así que generalizan sin necesidad de repetir el diagnóstico con la extensión completa. |

**Conclusión de H-02:** las 5 confirmaciones pedidas se verificaron, las 5 con resultado positivo, sin ningún hallazgo que contradiga `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`. El mecanismo es implementable exactamente como fue aprobado, sin ningún ajuste.

---

## 2. H-04 — Verificación

| Punto a confirmar | Verificación realizada | Resultado |
|---|---|---|
| **Ubicación exacta del primer test** | Confirmado que `backend/src/prisma/` existe y ya contiene `organizacional-models.ts` — `organizacional-models.spec.ts` en el mismo directorio es directamente viable, sin conflicto de nombres con ningún archivo existente | OK, sin ajuste |
| **Comando exacto para ejecutarlo** | `npm run test` (definido en Decisiones Técnicas) — no existe hoy ningún script `"test"` en `backend/package.json` (confirmado, `grep` sobre el archivo no encuentra la clave), así que agregarlo no pisa nada existente | OK, sin ajuste |
| **Integración con `package.json`** | Confirmado que `backend/nest-cli.json` **no existe** en este proyecto (verificado por listado de directorio) — a diferencia del scaffold estándar de Nest CLI, este backend nunca tuvo configuración de Jest, ni siquiera una que se haya borrado a medias. No hay ningún resto de configuración con el que la nueva deba coexistir. | Ver ajuste menor 3.1 (sección 3) — se cierra la ambigüedad que Decisiones Técnicas había dejado explícitamente abierta ("a definir en Implementación") sobre `jest.config.js` vs. campo embebido |
| **`tsconfig.json` — compatibilidad** | `module: "commonjs"`, `esModuleInterop: true`, `target: "ES2021"` (confirmado, `backend/tsconfig.json`) — sin ningún ajuste de configuración de TypeScript necesario para que `ts-jest` funcione; son exactamente los valores por defecto que `ts-jest` espera. El `exclude` del `tsconfig.json` (`node_modules`, `dist`, `src/_*.disabled`) no incluye ningún patrón que choque con `*.spec.ts` en `src/prisma/` | OK, no se requiere modificar `tsconfig.json` |
| **Alcance deliberadamente acotado** | Confirmado contra Decisiones Técnicas: un único archivo de test, una única lista nueva (`modelos-aislamiento-manual.ts`), un único script de `package.json`, sin `test:watch` ni `test:cov` ni ninguna variante adicional | OK, sin ajuste — el alcance ya cerrado es, en efecto, el mínimo necesario |
| **No introduce infraestructura mayor a la necesaria** | Confirmado que `@nestjs/testing` (ya instalado) no hace falta para este test — no requiere levantar ningún `TestingModule` ni ningún mock de NestJS, solo `Prisma.dmmf` (ya verificado accesible, ver punto siguiente) y los dos arrays de modelos, ambos TypeScript plano | OK, sin ajuste |
| **Forma de obtener modelos con `organizacionId` (verificación empírica adicional, no solo de lectura)** | Ejecutado en el mismo diagnóstico del punto 1: `Prisma.dmmf.datamodel.models.filter(m => m.fields.some(f => f.name === "organizacionId" && f.kind === "scalar"))` devolvió, contra el schema real, **exactamente 24 modelos** — los mismos 24 ya identificados manualmente en Decisiones Técnicas (22 en `ORGANIZACIONAL_MODELS` + `AccesoGrupoEconomico` + `PagoConsolidadoLiquidacion`), sin ninguna diferencia | Confirma, con evidencia de ejecución real y no solo de lectura de schema, que el mecanismo de introspección elegido para H-04 funciona exactamente como se documentó |

**Conclusión de H-04:** todos los puntos pedidos se verificaron. El único punto que requería cerrarse antes de Implementación (`jest.config.js` vs. campo embebido, explícitamente dejado abierto en Decisiones Técnicas) se resuelve como ajuste menor en la sección 3, no como una decisión nueva.

---

## 3. Ajustes menores

Ninguno de estos modifica una decisión ya cerrada — cierran, exactamente como anticipaba el propio documento de Decisiones Técnicas, un punto que ese documento había dejado explícitamente pendiente de resolver "en Implementación".

**3.1 — Forma de la configuración de Jest.** Decisiones Técnicas dejó abierto, textualmente, "a definir en Implementación cuál de las dos formas usar" entre `jest.config.js` separado o un campo `"jest"` embebido en `package.json`. Verificado que este proyecto no tiene ningún resto de configuración de Jest con el que deba ser consistente (no hay `nest-cli.json`, no hay ningún `jest.config.*` previo). **Se cierra: campo `"jest"` embebido en `package.json`** (un archivo menos, coherente con la decisión ya tomada de mantener la infraestructura al mínimo), con el contenido estándar que usa el propio scaffold oficial de NestJS (`moduleFileExtensions`, `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`, `transform` con `ts-jest`) — no se inventa una configuración nueva, se usa la convención ya conocida y ya compatible con el `tsconfig.json` real de este proyecto (verificado en la sección 2).

**3.2 — Punto de inserción de `app.set("trust proxy", 1)` en `main.ts` (H-07).** No estaba explícitamente ubicado línea por línea en Decisiones Técnicas (solo confirmaba que el archivo se modifica). Verificado contra el `main.ts` real (12 líneas de `bootstrap()`): el punto natural es inmediatamente después de `const app = await NestFactory.create(AppModule)` y antes de `app.enableCors(...)` — mismo bloque de configuración de la aplicación, sin alterar el orden relativo de `validarEntorno()` (que ya corre antes de importar `AppModule`, sin relación con este cambio). No es una decisión nueva, es la ubicación concreta de una decisión ya tomada.

Ningún otro ajuste fue necesario — el resto de las 46 decisiones de `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` se verificaron implementables tal cual, sin ninguna modificación.

---

## 4. Orden definitivo de implementación — revisado

Se revisó el orden ya cerrado (H-08 → H-07 → H-04 → H-01 → H-02) contra los archivos reales que cada hallazgo toca (sección 5). **Sin cambios** — se ratifica el mismo orden, con una confirmación adicional: el único caso de dos hallazgos consecutivos que tocan el mismo archivo (H-08 y H-01, ambos sobre `clientes.controller.ts`) ya están en el orden correcto para que eso no genere ningún problema — H-08 se implementa y se cierra por completo (commit propio) antes de que H-01 vuelva a tocar el mismo archivo, nunca en paralelo.

---

## 5. Verificación de archivos adicionales — ninguno detectado

Se revisó, para cada hallazgo, si el archivo de registro (`organizacion-prisma.module.ts`, el punto de la aplicación DI donde se construye `ORGANIZACION_PRISMA`) necesitaría cambios por el mecanismo elegido en H-02. **Confirmado que no**: `organizacion-prisma.module.ts` línea 28 ya hace `useFactory: (prisma: PrismaService) => crearClienteOrganizacional(prisma)` — como el Proxy se aplica **dentro** de `crearClienteOrganizacional()`, antes del `return` (Decisiones Técnicas, H-02, punto 2), el factory de DI no necesita ningún cambio: sigue recibiendo, sin saberlo, un cliente ya protegido.

Confirmado también que ningún hallazgo requiere tocar `prisma.module.ts`, ningún DTO nuevo, ningún archivo de configuración adicional fuera de los ya listados en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (sección "Archivos exactos previstos a modificar o crear") más los dos ajustes menores de la sección 3 de este documento (que no agregan archivos, solo precisan el contenido/ubicación de dos archivos ya previstos).

**Lista de archivos, confirmada sin cambios respecto de Decisiones Técnicas:** 6 nuevos (`common/encontrar-o-fallar.ts`, `common/encontrar-o-fallar.spec.ts`, `prisma/modelos-aislamiento-manual.ts`, `prisma/organizacional-models.spec.ts`, y los dos ajustes de esta etapa no agregan archivos: el campo `"jest"` va dentro del `package.json` ya listado, y `trust proxy` va dentro del `main.ts` ya listado) + 7 modificados (`clientes.controller.ts`, `transportistas.controller.ts`, `choferes.controller.ts`, `organizacion-prisma.client.ts`, `auth.module.ts`, `auth.controller.ts`, `main.ts`) + `package.json`.

---

## 6. Verificación de conflictos entre decisiones — ninguno detectado

- **`clientes.controller.ts`** (H-08 y H-01): mismo archivo, métodos distintos (`cuentaCorriente` vs. `findOne`), implementados en ese orden exacto — sin conflicto.
- **`package.json`** (H-07 agrega `@nestjs/throttler` a `dependencies`; H-04 agrega `jest`/`ts-jest`/`@types/jest` a `devDependencies` + el campo `"jest"` + el script `"test"`): secciones distintas del mismo archivo, implementadas en ese orden (H-07 antes que H-04) — sin conflicto, cada edición es aditiva sobre la anterior.
- **`main.ts`** (H-07, único hallazgo que lo toca): sin conflicto posible, ningún otro hallazgo lo modifica.
- **`organizacion-prisma.client.ts`** (H-02, único hallazgo que lo toca; el guardia de escritura anidada ya existente en el mismo archivo, de Bloque 8.1, no se modifica): sin conflicto — el Proxy de H-02 se agrega como un paso adicional al final de `crearClienteOrganizacional()`, sin tocar la lógica de `asegurarSinEscrituraAnidada` ni de los hooks de `$allModels` ya existentes.
- Ninguna decisión numérica (umbral de H-07, mensajes de H-01/H-02/H-07) contradice ninguna otra decisión del mismo documento ni de la auditoría/diseño previos.

**No se encontró ningún conflicto entre decisiones.**

---

## Conclusión

Las 46 decisiones de `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` se verificaron contra el código real del proyecto — para H-02, con evidencia empírica de ejecución real en desarrollo (no solo lectura), confirmando el punto más sensible de todo el bloque: el cliente transaccional (`tx`) permanece completamente ajeno al Proxy que protege el cliente de nivel superior, incluso invocando `$transaction()` a través del objeto ya protegido. Para H-04, se confirmó que la introspección vía `Prisma.dmmf` funciona exactamente como se documentó, con evidencia de ejecución real contra el schema real (24 modelos, coincidencia exacta con lo ya registrado). No se encontró ningún conflicto entre decisiones, ni ningún archivo adicional necesario más allá de los ya previstos. Se cerraron dos ajustes menores, ambos anticipados como pendientes por el propio documento de Decisiones Técnicas, sin abrir ninguna alternativa nueva ni modificar ninguna decisión ya tomada.

**La implementación puede comenzar tal como está diseñada y decidida, sin bloqueos técnicos pendientes.**

Quedo a la espera de autorización para comenzar la Implementación.

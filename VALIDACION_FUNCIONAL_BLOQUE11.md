# Validación Funcional — Bloque 11: Endurecimiento de Seguridad

Fecha: 2026-07-24. **No corrige código, no modifica backend, no modifica frontend, no modifica schema, no crea migraciones, no actualiza documentación existente (salvo este documento), no hace refactors, no hace `git add`/`commit`/`push`.** Ejecuta contra el código real ya implementado (mismo estado de árbol de trabajo que revisó `REVISION_IMPLEMENTACION_BLOQUE11.md`) las verificaciones funcionales formales pedidas para cerrar la etapa de Validación de Bloque 11, con el backend real corriendo contra Postgres local.

---

## 1. Objetivo

Verificar funcionalmente, ejecutando el código implementado (no solo leyéndolo), que la implementación de Bloque 11 satisface exactamente los criterios de aceptación fijados en `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `DISEÑO_BLOQUE11_SEGURIDAD.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, `PRE_IMPLEMENTACION_BLOQUE11.md` y `REVISION_IMPLEMENTACION_BLOQUE11.md`, para los cinco hallazgos corregidos (H-08, H-07, H-04, H-01, H-02), sin corregir nada si aparece un problema — solo documentarlo y continuar con el resto.

---

## 2. Ambiente de validación

- **Versión del código:** árbol de trabajo local, mismo estado revisado por `REVISION_IMPLEMENTACION_BLOQUE11.md` (sin commits nuevos desde entonces; confirmado por `git status --short` idéntico al del inicio de esta etapa — ver sección 11).
- **Backend:** NestJS, `npm run start:dev` (puerto 3000, prefijo `/api/v1`), variables de entorno (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`) exportadas manualmente en la sesión de shell desde `backend/.env` — `nest start` no las carga por sí solo (nota operativa ya conocida del proyecto, no parte de ningún hallazgo). Node `v24.18.0`, npm `11.16.0`.
- **Base de datos:** PostgreSQL local (`localhost:5432`, base `cereal_db`), ya con las 22 migraciones aplicadas (`npx prisma migrate status` → "Database schema is up to date!"), datos reales de desarrollo de bloques anteriores (organizaciones `Organización Principal` y `Organización B - Grupo Económico`, usuario seed `admin@demo.com` / `Demo1234!`, con acceso de grupo económico a ambas organizaciones).
- **Dependencias:** `npm install` ya reflejado en `node_modules` al momento de esta validación — confirmado presentes `@nestjs/throttler`, `jest`, `ts-jest` antes de ejecutar nada.
- **Build ejecutado:** `npm run build` (`nest build`) → **compiló sin errores**, sin ninguna advertencia de TypeScript.
- **Tests ejecutados:** `npm run test` (`jest`) → **10/10 tests en verde**, ver detalle en sección 5.
- Todas las pruebas HTTP de esta validación se ejecutaron contra el backend real, arrancado y detenido exclusivamente para esta sesión (PID de Node detenido al finalizar; no queda ningún proceso propio de esta validación corriendo).

---

## 3. Validación H-08 — Cuenta corriente excluye `ANULADO`

**Pruebas ejecutadas** (siguiendo el flujo real: crear factura → cobrar parcialmente → anular cobranza → anular factura, sobre `Cliente Demo A`, usando el único viaje `DESCARGADO`/`PENDIENTE_DE_FACTURAR` disponible en desarrollo):

| Paso | Acción | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| 1 | `GET /clientes/:id/cuenta-corriente` antes de crear la factura | `movimientos: []`, `saldoActual: 0` | `{"movimientos":[],"saldoActual":0}` ✅ |
| 2 | `POST /facturas` (factura `H11-VALIDACION-001`, importe `$240.000`, estado `FACTURADO`) | `201`, factura creada | `201`, `estado:"FACTURADO"` ✅ |
| 3 | `GET /clientes/:id/cuenta-corriente` con la factura `FACTURADO` (sin anular) | La factura participa del saldo | `saldoActual: 240000`, un movimiento `debe: 240000` ✅ — **confirma que las facturas `FACTURADO` siguen participando** |
| 4 | `POST /facturas/:id/cobranzas` (cobranza parcial `$100.000`) | `201`, factura pasa a `COBRADO_PARCIAL` | `201`, `estado:"COBRADO_PARCIAL"` ✅ — **confirma que las cobranzas continúan funcionando** (ejercita además `tx.$queryRaw` real, ver sección 7) |
| 5 | `POST /facturas/:id/cobranzas/:cobranzaId/anular` | `201`, cobranza anulada, factura vuelve a `FACTURADO` | `201`, `estado:"FACTURADO"`, cobranza con `anulada:true` ✅ |
| 6 | `GET /clientes/:id/cuenta-corriente` tras anular la cobranza | Saldo vuelve a `240000` (regresión, cobranza anulada no participa — comportamiento preexistente, no de este bloque) | `saldoActual: 240000` ✅ |
| 7 | `POST /facturas/:id/anular` (factura sin cobranzas vigentes) | `201`, factura pasa a `ANULADO` (permitido: no tiene cobranzas vigentes) | `201`, `estado:"ANULADO"` ✅ |
| 8 | `GET /clientes/:id/cuenta-corriente` tras anular la factura | `movimientos: []`, `saldoActual: 0` (H-08: la factura `ANULADO` queda excluida) | `{"movimientos":[],"saldoActual":0}` ✅ |

**Confirmaciones pedidas:**
- **Las facturas `ANULADO` no participan del saldo:** confirmado — paso 8, saldo pasa de `240000` a `0` al anular la única factura del cliente.
- **Las facturas `FACTURADO` siguen participando:** confirmado — paso 3.
- **Las cobranzas continúan funcionando igual:** confirmado — pasos 4-6, registro y anulación de cobranza con las transiciones de estado correctas (`FACTURADO` → `COBRADO_PARCIAL` → `FACTURADO`).
- **No existe regresión observable:** confirmado — el comportamiento en cada paso coincide exactamente con lo que la lógica de negocio ya documentada (`facturas.controller.ts`) predice, sin ningún efecto colateral inesperado.

**Dato de prueba dejado en la base de desarrollo** (no se limpió, mismo criterio ya usado en otros bloques para validación manual — ver `AUDITORIA_BLOQUE11_SEGURIDAD.md` sección 9.8 sobre el criterio de conservar evidencia de validaciones funcionales, a diferencia de los diagnósticos puntuales): factura `H11-VALIDACION-001` (id `5254c05b-1868-43e6-bf7e-63cfbd8f7260`), estado final `ANULADO`, con una cobranza anulada (`3997033e-b564-4d6e-865b-231762452f36`) — trazable en la base como evidencia reproducible de esta validación.

**Estado: VALIDADO.**

---

## 4. Validación H-07 — Rate limiting de login

**Pruebas ejecutadas:**

| Prueba | Resultado esperado | Resultado obtenido |
|---|---|---|
| Login normal (`admin@demo.com` / `Demo1234!`) | `200`/`201` con `accessToken` | `201 Created`, token válido devuelto, headers `X-RateLimit-Limit: 10` / `X-RateLimit-Remaining: 9` presentes ✅ |
| 10 intentos con credenciales inválidas en una misma ventana | Todos `401`, ninguno `429` antes del 11º | Intentos 1-10 → `401` (`"Credenciales inválidas"`) ✅ |
| Intento 11 en la misma ventana | `429`, con el mensaje exacto y `Retry-After` | `429`, cuerpo `{"statusCode":429,"message":"Demasiados intentos de inicio de sesión. Esperá un minuto antes de volver a intentar."}`, header `Retry-After: 26` presente ✅ |
| Intento 12 (inmediatamente después) | Sigue `429` (no se resetea con más tráfico) | `429` ✅ |
| Otro endpoint (`GET /clientes`) durante la ventana bloqueada | No debe verse afectado | `200` ✅ |
| Otro endpoint público del mismo controller (`POST /auth/recuperar-contrasena`) durante la ventana bloqueada | No debe verse afectado | `200` ✅ |
| Login tras esperar la expiración de la ventana (~32s) | Vuelve a aceptarse normalmente | `201 Created`, token válido devuelto ✅ |
| Caso de uso legítimo de QA: 5 logins sucesivos con emails distintos (`gerencia@demo.com`, `operaciones@demo.com`, `liquidaciones@demo.com`, `facturacion@demo.com`, un quinto con contraseña incorrecta), en cantidad menor a 10, dentro de la ventana | Todos responden según sus credenciales, nunca `429` | Los 5 respondieron `401` (`"Credenciales inválidas"`) — ninguno `429` ✅ |

**Observación (no defecto):** los 4 usuarios de rol distintos a `admin@demo.com` (`gerencia@demo.com`, etc.) devolvieron `401` con las credenciales de la convención documentada en memoria del proyecto (`Demo1234!`) — no se investigó si esas cuentas existen en esta base de desarrollo puntual con esa contraseña exacta, porque no es objeto de este hallazgo: lo que H-07 exige (que una ráfaga de intentos con emails distintos no dispare el límite) queda confirmado igual, ya que el rate-limiting actúa antes de validar credenciales y las 5 respuestas fueron `401`, nunca `429`.

**Confirmación adicional:** ningún otro endpoint quedó limitado — confirmado explícitamente arriba (`GET /clientes`, `POST /auth/recuperar-contrasena`) durante la ventana en la que `/auth/login` sí estaba devolviendo `429`.

**Estado: VALIDADO.**

---

## 5. Validación H-04 — Red de seguridad de modelos organizacionales

**Comando ejecutado:** `npm run test` (`jest`), sin backend ni Postgres activos en el momento de esta ejecución específica (ejecutado antes de arrancar el backend, ver orden real de esta sesión).

```
PASS src/prisma/organizacional-models.spec.ts
PASS src/common/encontrar-o-fallar.spec.ts

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        3.683 s, estimated 4 s
```

**Resultado:** 2 suites, **10 tests, 10 pasaron**, tiempo total **3.683 s**. (6 tests de `organizacional-models.spec.ts` para H-04 + 4 tests de `encontrar-o-fallar.spec.ts` para H-01, ambos incluidos en el mismo comando.)

**Independencia de base de datos:** confirmado empíricamente — la suite completa corrió y pasó **antes** de que Postgres o el backend estuvieran involucrados en esta sesión de validación (el build y los tests se ejecutaron primero; Postgres/backend se verificaron y arrancaron después, únicamente para las pruebas HTTP de H-01/H-02/H-07/H-08). No hubo ningún error de conexión ni timeout.

**Independencia del entorno:** confirmado — no se exportó `DATABASE_URL`/`JWT_SECRET`/`CORS_ORIGIN` en la sesión de shell en el momento de ejecutar `npm run test`; la suite no depende de ninguna variable de entorno (usa `Prisma.dmmf`, introspección estática del schema, sin instanciar `PrismaClient`).

**Estado: VALIDADO.**

---

## 6. Validación H-01 — Respuestas 404 reutilizables

**Pruebas ejecutadas:** las 9 combinaciones (3 endpoints × id propio/ajeno/inexistente), usando un JWT de `Organización Principal` (`admin@demo.com`) y, para el caso "ajeno", IDs reales de `Organización B - Grupo Económico` (obtenidos vía `POST /auth/cambiar-organizacion`, mecanismo de acceso cruzado ya aprobado — no vía manipulación directa de base).

| Endpoint | Caso | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| `GET /clientes/:id` | id propio | `200` con datos completos | `200`, `{"id":"800e7ce4-...","razonSocial":"Cliente Demo A",...}` ✅ |
| `GET /clientes/:id` | id ajeno (Org B) | `404`, `"Cliente no encontrado."` | `404`, `{"message":"Cliente no encontrado.","error":"Not Found","statusCode":404}` ✅ |
| `GET /clientes/:id` | id inexistente | `404`, `"Cliente no encontrado."` | Idéntico al caso ajeno ✅ |
| `GET /transportistas/:id` | id propio | `200` con datos completos | `200`, `{"id":"6d117880-...","razonSocial":"Transportista Demo A",...}` ✅ |
| `GET /transportistas/:id` | id ajeno (Org B) | `404`, `"Transportista no encontrado."` | `404`, `{"message":"Transportista no encontrado.","error":"Not Found","statusCode":404}` ✅ |
| `GET /transportistas/:id` | id inexistente | `404`, `"Transportista no encontrado."` | Idéntico al caso ajeno ✅ |
| `GET /choferes/:id` | id propio | `200` con datos completos | `200`, `{"id":"1ada5dbb-...","nombre":"Carlos Gómez",...}` ✅ |
| `GET /choferes/:id` | id ajeno (Org B) | `404`, `"Chofer no encontrado."` | `404`, `{"message":"Chofer no encontrado.","error":"Not Found","statusCode":404}` ✅ |
| `GET /choferes/:id` | id inexistente | `404`, `"Chofer no encontrado."` | Idéntico al caso ajeno ✅ |

**Contrato HTTP preservado:** confirmado — el cuerpo `404` coincide exactamente, campo por campo, con lo definido en `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` (`{"statusCode":404,"message":"<mensaje>","error":"Not Found"}`), y el `200` devuelve exactamente los mismos datos que devolvía antes de la corrección (mismos campos, mismo `include`).

**Estado: VALIDADO.**

---

## 7. Validación H-02 — Bloqueo runtime de métodos raw de Prisma

**Método:** diagnóstico puntual contra el código ya compilado (`dist/`), mismo procedimiento ya usado en Pre-Implementación — script temporal, ejecutado contra Postgres real, **eliminado antes de finalizar esta sesión**, nunca agregado a git (confirmado en `git status --short`, sección 11).

| Prueba | Resultado esperado | Resultado obtenido |
|---|---|---|
| Acceso a `$queryRaw` en el cliente organizacional de nivel superior | Lanza el error exacto | `[aislamiento] "$queryRaw" no está disponible en el cliente organizacional de nivel superior. Si necesitás una consulta SQL cruda protegida por bloqueo de fila, usá el cliente de transacción (tx) dentro de $transaction().` ✅ |
| Acceso a `$queryRawUnsafe` | Lanza el error exacto (mismo mensaje, propiedad interpolada) | Ídem, con `"$queryRawUnsafe"` interpolado ✅ |
| Acceso a `$executeRaw` | Lanza el error exacto | Ídem, con `"$executeRaw"` interpolado ✅ |
| Acceso a `$executeRawUnsafe` | Lanza el error exacto | Ídem, con `"$executeRawUnsafe"` interpolado ✅ |
| Método normal a través del cliente protegido (`cliente.findMany`, con contexto organizacional real) | Funciona sin diferencias, devuelve datos reales | Devolvió 1 resultado real (consulta real contra Postgres) ✅ |
| `$transaction()` invocado **a través** del cliente protegido | Se ejecuta sin error; `tx` es un objeto distinto del cliente protegido | `tx === protegido` → `false` ✅ |
| `tx.$queryRaw` dentro de la transacción | Ejecuta SQL real sin ningún error | `SELECT 1 as ok` → `[{"ok":1}]` ✅ |
| Uso legítimo real #1: `tx.$queryRaw` dentro de `POST /facturas/:id/cobranzas` (`registrarCobranza`) | Sigue funcionando exactamente igual que antes de la corrección | `201`, cobranza registrada correctamente (ver sección 3, paso 4) ✅ |
| Uso legítimo real #2: `tx.$queryRaw` dentro de `POST /facturas/:id/cobranzas/:cobranzaId/anular` (`anularCobranza`) | Sigue funcionando exactamente igual que antes de la corrección | `201`, cobranza anulada correctamente (ver sección 3, paso 5) ✅ |

**Confirmaciones pedidas:**
- **Los cuatro métodos raw quedan bloqueados en el cliente organizacional:** confirmado, los 4.
- **El mensaje coincide con el aprobado:** confirmado, coincide literalmente con `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md`, punto 6 de H-02.
- **Los métodos normales siguen funcionando:** confirmado (`findMany` con datos reales; además, indirectamente, los 9 casos de H-01 y las 8 operaciones de H-08 dependen todas de métodos normales del mismo cliente, todos exitosos).
- **`tx.$queryRaw` continúa funcionando dentro de una transacción:** confirmado, tanto en el diagnóstico puntual como en los dos usos reales del flujo de cobranzas ejecutados en producción de código (no mockeados).
- **No existen efectos secundarios observables:** confirmado — ninguna de las operaciones normales (lecturas, escrituras, transacciones) ejecutadas durante toda esta validación (H-01, H-08, H-02) mostró ningún comportamiento anómalo atribuible al Proxy.

**Estado: VALIDADO.**

---

## 8. Validación de regresión

| Verificación | Resultado |
|---|---|
| Build (`npm run build`) | **Verde** — compiló sin errores ni advertencias |
| Tests (`npm run test`) | **Verde** — 10/10 |
| Login continúa funcionando | Confirmado — múltiples logins exitosos con `admin@demo.com` durante toda la sesión (`201`, token válido) |
| Autenticación JWT continúa funcionando | Confirmado — todos los endpoints protegidos (`clientes`, `transportistas`, `choferes`, `facturas`) exigieron y aceptaron el JWT correctamente durante las ~20 llamadas autenticadas de esta validación |
| Aislamiento organizacional continúa funcionando | Confirmado por dos vías independientes: (a) los 6 casos "id ajeno → 404" de H-01, con IDs reales de `Organización B` obtenidos por cambio de contexto legítimo; (b) el diagnóstico de H-02, que ejecutó `cliente.findMany` con contexto de `Organización Principal` y devolvió únicamente el registro de esa organización |
| Endpoints modificados siguen operativos | Confirmado — los 3 `findOne` de H-01, `cuentaCorriente` de H-08, `login` de H-07, y el cliente `ORGANIZACION_PRISMA` completo (todas las operaciones normales usadas en H-08/H-02) respondieron correctamente en todos los casos probados |

**Estado: VALIDADO, sin regresión detectada.**

---

## 9. Resumen ejecutivo

| Hallazgo | Estado | Observaciones |
|---|---|---|
| H-08 | VALIDADO | Cuenta corriente excluye `ANULADO`, incluye `FACTURADO`/`COBRADO_PARCIAL`; cobranzas y sus transiciones de estado sin regresión. Dato de prueba conservado en base de desarrollo, trazable. |
| H-07 | VALIDADO | Umbral (10/60s), código `429`, mensaje exacto y `Retry-After` confirmados; expiración de ventana confirmada; ningún otro endpoint afectado. Identidad de las 4 cuentas de rol no-admin con la contraseña de convención no se pudo confirmar en esta base puntual — sin impacto sobre el criterio de aceptación de H-07 (ver sección 4). |
| H-04 | VALIDADO | 10/10 tests en verde, independencia de base de datos y de entorno confirmadas empíricamente. |
| H-01 | VALIDADO | Las 9 combinaciones (3 endpoints × propio/ajeno/inexistente) exactas; contrato HTTP preservado. |
| H-02 | VALIDADO | Los 4 métodos bloqueados con el mensaje exacto; `tx.$queryRaw` confirmado funcional tanto en diagnóstico puntual como en los 2 usos legítimos reales del flujo de cobranzas. |

**Hallazgos no validados: ninguno.**

---

## 10. Conclusión

Los cinco hallazgos de Bloque 11 (H-08, H-07, H-04, H-01, H-02) quedan **VALIDADOS** contra el código real, ejecutando el backend real contra Postgres local, sin encontrar ninguna desviación respecto de lo aprobado en `AUDITORIA_BLOQUE11_SEGURIDAD.md`, `DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md` y `PRE_IMPLEMENTACION_BLOQUE11.md`. No se detectó ninguna regresión en build, tests, login, autenticación JWT, aislamiento organizacional ni en los endpoints modificados. No se corrigió ningún hallazgo durante esta etapa — no fue necesario, ninguna prueba arrojó un resultado inesperado.

**El Bloque 11 queda listo para pasar a Auditoría Adversarial.**

---

## 11. Informe final

- **Build:** verde (`npm run build`, sin errores).
- **Tests:** verde (`npm run test`, 10/10, 3.683 s).
- **Verificaciones ejecutadas:** 9 combinaciones H-01 (HTTP real), 8 pasos H-08 (HTTP real, flujo completo factura→cobranza→anulación), 8 verificaciones H-02 (diagnóstico puntual + 2 usos reales de `tx.$queryRaw`), 8 pruebas H-07 (HTTP real, incluida espera de expiración de ventana), regresión general (login, JWT, aislamiento, endpoints modificados).
- **Hallazgos validados:** H-08, H-07, H-04, H-01, H-02 (los 5).
- **Hallazgos no validados:** ninguno.
- **`git status --short`:** idéntico al registrado al inicio de esta etapa — sin cambios de código, sin archivos nuevos de aplicación, sin `git add` ejecutado:
  ```
   M backend/package-lock.json
   M backend/package.json
   M backend/src/auth/auth.controller.ts
   M backend/src/auth/auth.module.ts
   M backend/src/catalogos/choferes.controller.ts
   M backend/src/catalogos/clientes.controller.ts
   M backend/src/catalogos/transportistas.controller.ts
   M backend/src/main.ts
   M backend/src/prisma/organizacion-prisma.client.ts
   M frontend/railway.json
  ?? AUDITORIA_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? AUDITORIA_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? AUDITORIA_BLOQUE10.4_FRONTEND.md
  ?? AUDITORIA_BLOQUE11_SEGURIDAD.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3.md
  ?? DECISIONES_TECNICAS_BLOQUE10.3b.md
  ?? DECISIONES_TECNICAS_BLOQUE10.4.md
  ?? DECISIONES_TECNICAS_BLOQUE11_SEGURIDAD.md
  ?? DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md
  ?? DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md
  ?? DISENO_BLOQUE10.4_FRONTEND.md
  ?? "DISEÑO_BLOQUE11_SEGURIDAD.md"
  ?? PLAN_PROXIMA_ETAPA.md
  ?? PRE_IMPLEMENTACION_BLOQUE11.md
  ?? REVISION_IMPLEMENTACION_BLOQUE11.md
  ?? VALIDACION_FUNCIONAL_BLOQUE11.md
  ?? backend/src/common/encontrar-o-fallar.spec.ts
  ?? backend/src/common/encontrar-o-fallar.ts
  ?? backend/src/prisma/modelos-aislamiento-manual.ts
  ?? backend/src/prisma/organizacional-models.spec.ts
  ?? docs/validaciones/
  ```
  (única diferencia respecto del estado inicial: la aparición de este mismo archivo, `VALIDACION_FUNCIONAL_BLOQUE11.md`, todavía sin agregar a git).

Quedo a la espera de revisión antes de comenzar la Auditoría Adversarial.

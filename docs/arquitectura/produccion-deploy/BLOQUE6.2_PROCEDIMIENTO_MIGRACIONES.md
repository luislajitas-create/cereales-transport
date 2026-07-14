# Bloque 6.2 — Procedimiento Operativo Final: Aplicar las 5 Migraciones Pendientes en Producción

> **Estado: CERRADO (2026-07-10).** Los 10 pasos de este procedimiento **se ejecutaron en su totalidad y exitosamente** contra producción. Ver "Resultado final de ejecución" al final de este documento antes de leer el resto como si aún estuviera pendiente.

Fecha: 2026-07-09. Documento de procedimiento — al momento de escribirlo, **no se había ejecutado nada de lo descrito abajo.** No se modificó código, no se tocó la base de datos de producción, no se hizo commit, no se hizo push. Era el checklist final, listo para ejecutar paso a paso una vez que se diera la aprobación explícita de arranque. Consolida y hace operativo lo diagnosticado en `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` (causa raíz) y `BLOQUE6.1_AUDITORIA_PRODUCCION.md` (evidencia en vivo).

**Regla de ejecución:** los pasos se corren en orden, uno a la vez. Si un paso no da el resultado esperado, se detiene ahí — no se sigue al siguiente paso "para no frenar". Cada paso con comando incluye qué se espera ver y qué hacer si no coincide.

---

## Paso 1 — Confirmación del commit actualmente desplegado

**Objetivo:** garantizar que el `schema.prisma` y las carpetas de `backend/prisma/migrations/` que se van a aplicar son exactamente las que generaron el código ya corriendo en producción — no una versión más nueva ni más vieja (evita drift, riesgo #2 de `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` §8.5).

```
git log -1 --format="%H %s"
```

**Esperado:** `f2c950556bfbd6422e12e4b2b6e3e52c170081cc feat(liquidaciones): redesign settlement planilla with KPI summary and invoice lookup` — confirmado como HEAD local en el momento de escribir este documento, y coincide con el commit auditado en vivo como último deploy exitoso en Railway (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §3, backend y frontend, ambos `f2c9505`).

**Además:**
```
git status --short
```
**Esperado:** sin cambios pendientes sobre archivos de `backend/` (el working tree puede tener documentación `.md` sin trackear — no afecta el schema ni las migraciones; no debe haber diffs en `backend/prisma/`, `backend/src/`, ni `backend/package.json`).

**Si no coincide:** detener. Antes de seguir, verificar en el dashboard de Railway (Deployments → último deploy exitoso del backend) cuál es el commit real desplegado y hacer `git checkout <ese-hash>` en una copia limpia antes de continuar con el Paso 3.

---

## Paso 2 — Backup previo de producción (por qué y qué cubre)

No existe ningún backup de la base de datos de producción hoy (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §9: pestaña "Backups" de Railway vacía, plan Trial). Este paso es la única red de seguridad real antes de tocar el schema — cubre el escenario donde algo no previsto en el diagnóstico de causa raíz resulta distinto en la práctica (por ejemplo, si alguna constraint `UNIQUE` a relajar escondiera una duda de datos no detectada por las consultas de verificación).

**No se salta este paso bajo ninguna circunstancia**, incluso si el volumen de datos es mínimo (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.4: tabla más grande, 5 filas).

---

## Paso 3 — Comando exacto para generar el backup

```
railway link
```
Seleccionar interactivamente: proyecto `cereales-transport`, ambiente `production`, servicio `Postgres`.

```
railway run --service Postgres pg_dump "$DATABASE_URL" -F c -f backup_prod_20260709.dump
```

**Notas:**
- `railway run` inyecta `DATABASE_URL` del servicio `Postgres` automáticamente — el valor real del secreto nunca se pega ni se escribe a mano, y no queda en el historial de la shell.
- `-F c` genera un dump en formato *custom* de `pg_dump` (comprimido, restaurable con `pg_restore`, más flexible que un `.sql` plano para una restauración parcial si hiciera falta).
- El nombre de archivo incluye la fecha para evitar sobrescribir un backup anterior por error.
- **Verificación del backup en sí:** confirmar que el archivo generado tiene tamaño mayor a 0 bytes (`ls -la backup_prod_20260709.dump` o equivalente) antes de seguir al Paso 4. Un backup de 0 bytes no es un backup — si eso ocurre, detener y diagnosticar antes de continuar.
- Guardar el archivo resultante en un lugar fuera de Railway (disco local, o subirlo a un storage propio) — no depender de que quede solo en la sesión de la terminal donde se generó.

---

## Paso 4 — Comando exacto para ejecutar `prisma migrate deploy`

Ejecutar desde `backend/`, en la misma copia local confirmada en el Paso 1 (commit `f2c9505`, sin diffs sobre `backend/`):

```
railway link
```
Esta vez seleccionar: proyecto `cereales-transport`, ambiente `production`, servicio `cereales-transport` (backend) — **no** el servicio `Postgres` (para que `railway run` inyecte también las demás variables del backend, aunque solo `DATABASE_URL` es estrictamente necesaria para este comando).

```
railway run npx prisma migrate deploy
```

**Esperado en la salida de la terminal:** un mensaje de Prisma listando las 5 migraciones aplicadas, en este orden (garantizado por el propio Prisma según el nombre cronológico de cada carpeta, no hace falta especificarlas manualmente):

1. `20260707022545_add_anticipo_gasto_id_and_unique_constraints`
2. `20260707051214_liquidacion_viaje_one_to_many`
3. `20260707161205_loosen_facturaviaje_viajeid_unique`
4. `20260707164246_add_soft_delete_to_cobranza`
5. `20260708011415_add_activo_chofer_vehiculo`

Y el mensaje final `All migrations have been successfully applied.` (o equivalente según la versión de Prisma, `5.22.0` según `backend/package.json`).

**Si el comando reporta error a mitad de camino:** detener inmediatamente. No reintentar el mismo comando sin antes leer el error completo — Prisma deja la migración fallida marcada en `_prisma_migrations` y bloquea las siguientes hasta resolverla explícitamente (ver Paso 8, rollback).

---

## Paso 5 — Verificación posterior de `_prisma_migrations`

Conectar a la base de producción (vía `railway connect Postgres`, o el panel de datos de Railway usado en la auditoría) y correr:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY finished_at;
```

**Esperado:** **7 filas** (no 2, como hoy), incluyendo las 5 nuevas listadas en el Paso 4, todas con `finished_at` poblado y `rolled_back_at` en `NULL`.

**Si aparecen menos de 7 filas, o alguna con `rolled_back_at` no nulo:** detener, no continuar al Paso 6. Documentar exactamente qué fila falta o qué fila quedó marcada como revertida antes de decidir el siguiente paso (Paso 8).

---

## Paso 6 — Verificación posterior de columnas/constraints críticas

Repetir, contra la base real, las mismas consultas que documentó `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.2 (esta vez esperando el resultado inverso al de esa auditoría):

```sql
\d "LiquidacionMovimiento"
```
**Esperado:** la columna `anticipoGastoId` **debe existir** ahora (antes, la auditoría confirmó que no existía).

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('Chofer','Vehiculo','Cobranza')
  AND column_name IN ('activo','anulada','anuladaMotivo','anuladaFecha');
```
**Esperado:** **4 filas** — `Chofer.activo`, `Vehiculo.activo`, `Cobranza.anulada`, `Cobranza.anuladaMotivo` (y `anuladaFecha` según corresponda al modelo real). Antes, esta consulta devolvía 0 filas.

```sql
\d "LiquidacionViaje"
```
**Esperado:** el índice `LiquidacionViaje_viajeId_key UNIQUE btree ("viajeId")` **ya no debe aparecer** (relajado por la migración `loosen_facturaviaje_viajeid_unique`/`liquidacion_viaje_one_to_many` según corresponda).

```sql
\d "FacturaViaje"
```
**Esperado:** el índice `FacturaViaje_viajeId_key UNIQUE btree ("viajeId")` **ya no debe aparecer**.

**Si alguna de estas 4 verificaciones no coincide con lo esperado:** detener, no avanzar al Paso 7 (no tiene sentido probar funcionalidad contra un schema parcialmente migrado).

---

## Paso 7 — Pruebas funcionales mínimas en producción

**Objetivo:** confirmar que el código ya desplegado (`f2c9505`), que asume estas 5 migraciones aplicadas, efectivamente funciona ahora contra el schema real — no solo que el schema cambió, sino que el flujo de negocio que estaba roto (`BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.3) ahora funciona.

Ejecutar contra la interfaz desplegada real (no local), con un usuario de prueba:

1. **Liquidaciones (Bloque 3):** crear una liquidación de prueba sobre un viaje existente, confirmarla, y anularla. Confirmar que la reversión de anticipos funciona sin error (antes fallaría por falta de `anticipoGastoId`).
2. **Re-liquidar (Bloque 3.3):** sobre el mismo viaje cuya liquidación se anuló en el paso anterior, generar una nueva liquidación. Confirmar que no aparece el error `P2002` de violación de unicidad que existía antes.
3. **Re-facturar (Bloque 4.2):** análogo al punto 2 pero sobre `FacturaViaje` — anular una factura de prueba y volver a facturar el mismo viaje.
4. **Anulación de cobranza (Bloque 4.3):** anular una cobranza de prueba y confirmar que el cálculo de saldo/sobrepago la excluye correctamente.
5. **Soft-delete de chofer/vehículo (Bloque 5.2.a/b):** dar de baja un chofer o vehículo de prueba, confirmar que queda filtrado del listado por defecto, y confirmar que el sistema bloquea crear un viaje nuevo contra ese chofer/vehículo inactivo.

**Cierre obligatorio:** limpiar todos los datos de prueba generados en estos 5 puntos al finalizar (viajes, liquidaciones, facturas, cobranzas, altas/bajas de chofer/vehículo de prueba) — mismo criterio que `CHECKLIST_PRE_PUSH.md` punto 4. Documentar cualquier residuo que no se pueda limpiar por regla de negocio.

**Si alguna de las 5 pruebas falla:** detener, documentar el error exacto (mensaje, endpoint, request) antes de decidir si se revierte (Paso 8) o si el problema es aislado y no relacionado con el schema.

---

## Paso 8 — Plan de rollback realista

**Naturaleza de las 5 migraciones:** todas son aditivas por diseño — agregan columnas (nuevas, nullable o con default) o relajan una constraint `UNIQUE`. **Ninguna hace `DROP COLUMN`, `DROP TABLE` ni borra datos existentes** (confirmado leyendo el contenido de las 5 carpetas de migración). Esto determina qué rollback es realista en cada escenario:

**Escenario A — Una migración falla a mitad de camino (Paso 4 reporta error):**
- Prisma marca esa migración como fallida en `_prisma_migrations` y bloquea las siguientes.
- No reintentar `migrate deploy` directamente sin antes diagnosticar la causa del error.
- Una vez identificada y corregida la causa (por ejemplo, a mano vía SQL si el error fue un conflicto puntual de nombre, análogo al `42710` que ya ocurrió con `init` en 07-03), resolver el estado de la migración con:
  ```
  npx prisma migrate resolve --rolled-back <nombre_de_la_migracion_fallida>
  ```
  (si se revirtió el cambio a mano) o
  ```
  npx prisma migrate resolve --applied <nombre_de_la_migracion_fallida>
  ```
  (si se confirma que sí quedó aplicada pese al error reportado), y recién entonces reintentar `migrate deploy` para las restantes.
- Si el diagnóstico no es claro o el error afectó datos existentes: restaurar desde el backup del Paso 3 con `pg_restore` contra la base de producción.

**Escenario B — Las 5 migraciones se aplican sin error, pero una prueba funcional del Paso 7 falla (bug de código, no de schema):**
- El schema ya migrado **no se revierte** — no hace falta, porque es aditivo y no rompe al código anterior (columnas de más no afectan queries que no las referencian).
- El rollback en este escenario es de **código**, no de base de datos: revertir el deploy de Railway al commit anterior a `f2c9505` (o al que corresponda) desde el historial de Deployments del dashboard. El schema migrado queda igual, sin efecto negativo sobre una versión anterior del backend.

**Escenario C — Todo funciona, pero aparece un problema no previsto días después:**
- Mismo criterio que el Escenario B si el problema es de código.
- Si el problema es de datos (por ejemplo, la relajación de una constraint permitió un duplicado no deseado), es un problema de regla de negocio a resolver con una migración correctiva nueva — no con un rollback de las migraciones ya aplicadas, que solo reintroduciría el bug original que estas migraciones vinieron a resolver.

**Lo que este plan explícitamente no cubre:** un rollback automático de schema con un solo comando — Prisma no lo ofrece de forma nativa para migraciones ya aplicadas exitosamente. Por eso el backup del Paso 3 es la mitigación real para cualquier escenario que los mecanismos de Prisma no resuelvan limpiamente.

---

## Paso 9 — Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | Alguna constraint `UNIQUE` relajada esconde una duda de datos duplicados preexistente no detectada. | Baja | Volumen real mínimo (máx. 5 filas, `BLOQUE6.1_AUDITORIA_PRODUCCION.md` §5.4); mismas migraciones ya probadas exitosamente en desarrollo. |
| 2 | Drift entre el schema local usado para ejecutar el comando y el que generó el código desplegado. | Baja-media | Paso 1 verifica el commit exacto antes de empezar. |
| 3 | Exposición de `DATABASE_URL` de producción al ejecutar comandos manualmente. | Baja | `railway run`/`railway link` inyectan la variable sin exponerla en texto plano en ningún paso de este procedimiento. |
| 4 | Sin ambiente de staging idéntico a producción para haber ensayado este `migrate deploy` exacto antes. | Baja-media (no eliminable, solo mitigable) | Compensado por bajo volumen de datos y por que las 5 migraciones ya corrieron sin incidentes en desarrollo. |
| 5 | El contenedor de producción sigue sin ejecutar `migrate deploy` automáticamente en su arranque — aplicar esto manualmente no queda "fijado" para la próxima migración nueva. | Media (recurrencia) | Este procedimiento resuelve el síntoma puntual, no la causa raíz — la automatización descrita en `BLOQUE6.1_CAUSA_RAIZ_MIGRACIONES.md` §6-7 sigue pendiente como trabajo aparte, fuera de alcance de este documento. |
| 6 | El backup (Paso 3) queda en la máquina de quien lo ejecuta, sin política de retención. | Media | Mitigación reconocida como temporal — guardar el archivo en un lugar durable fuera de la sesión de terminal; no reemplaza una solución de backups automatizados real. |
| 7 | Una prueba funcional del Paso 7 deja datos de prueba sin limpiar en producción. | Baja | Cierre obligatorio explícito al final del Paso 7. |

---

## Paso 10 — Criterio de éxito

El procedimiento se considera **completo y exitoso** solo si se cumplen **todas** las siguientes condiciones, en este orden:

1. ✅ Paso 1: commit confirmado, sin diffs pendientes sobre `backend/`.
2. ✅ Paso 3: backup generado, archivo con tamaño mayor a 0 bytes, guardado fuera de Railway.
3. ✅ Paso 4: `prisma migrate deploy` termina con `All migrations have been successfully applied.`, sin ningún error.
4. ✅ Paso 5: `_prisma_migrations` muestra exactamente 7 filas, todas con `finished_at` poblado y `rolled_back_at` nulo.
5. ✅ Paso 6: las 4 verificaciones de columnas/constraints coinciden exactamente con lo esperado (columnas nuevas presentes, constraints `UNIQUE` relajadas ausentes).
6. ✅ Paso 7: las 5 pruebas funcionales pasan sin error, y los datos de prueba quedan limpiados.
7. ✅ Ningún paso quedó en estado "detener y diagnosticar" sin resolución documentada.

**Si cualquiera de las 7 condiciones no se cumple, el procedimiento no se considera cerrado** — queda en el estado en que se detuvo, documentado, a la espera de una decisión explícita (reintento tras corrección, rollback según Paso 8, o escalamiento) antes de dar por aplicadas las migraciones pendientes.

---

**No se había ejecutado ningún paso de este documento al momento de escribirlo.** Era el procedimiento final, listo para correr en el orden descrito una vez que se aprobara explícitamente el inicio de la ejecución. **Esa aprobación se dio y los 10 pasos ya se ejecutaron exitosamente — ver "Resultado final de ejecución" a continuación.**

---

## Resultado final de ejecución

Fecha de cierre: 2026-07-10. Los 10 pasos de este procedimiento **se ejecutaron en su totalidad**, en tramos separados (Pasos 1-3, luego 4, luego 5-6, luego 7), cada uno con aprobación explícita previa, sin saltarse ningún paso ni condición de detención.

- **Paso 1 (commit):** confirmado `f2c9505`, sin diffs sobre `backend/`.
- **Paso 2-3 (backup):** generado correctamente. Nota respecto al plan original: el `pg_dump` local (16.14) resultó incompatible con la versión del servidor (18.4) y falló; se resolvió ejecutando `pg_dump` **dentro del propio contenedor del servicio Postgres de Railway** (vía `railway ssh`), con la versión 18.4 exacta — 59.642 bytes, verificado legible/listable con `pg_restore --list` (144 entradas de TOC). Detalle completo de esta desviación ya documentado en el momento de ejecución.
- **Paso 4 (`prisma migrate deploy`):** aplicado correctamente. Nota respecto al plan original: `railway run` local no pudo resolver el host interno `postgres.railway.internal`; se resolvió ejecutando el comando **dentro del contenedor del servicio backend** (vía `railway ssh`), que sí tiene acceso a la red privada. Las 5 migraciones se aplicaron sin errores.
- **Paso 5-6 (verificación estructural):** **PASS** — `_prisma_migrations` con 7 filas, las 9 verificaciones puntuales (columnas y constraints) coincidieron exactamente con lo esperado.
- **Paso 7 (pruebas funcionales):** **PASS** — los 7 casos de prueba, con datos prefijados `QA-MIGRACION`, se ejecutaron contra la API real de producción, con limpieza posterior de todo lo reversible.
- **Logs:** sin errores durante toda la ejecución (verificado con `railway logs --filter "@level:error"` y HTTP `>=400`, ambos en 0).
- **Residuos QA-MIGRACION no reversibles:** 1 `Viaje` cancelado, 2 `Liquidacion` anuladas, 2 `Factura` anuladas, 1 `Cobranza` anulada, 1 `AnticipoGasto` anulado, 1 `Chofer` inactivo — resultado esperado de que el sistema no soporta borrado físico; sin impacto en datos reales.
- **Criterio de éxito (Paso 10):** las 7 condiciones se cumplieron. Procedimiento cerrado como exitoso.
- **Riesgo pendiente:** automatizar `prisma migrate deploy` en el pipeline de deploy (para que no dependa de una ejecución manual como esta) sigue sin implementarse — queda como trabajo futuro fuera del alcance de este procedimiento.

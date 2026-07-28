# Implementación A-01 — Tarea 7: Drill de Recuperación (Primera Ejecución Real)

Fecha de inicio: 2026-07-27. Ejecución real, interactiva y controlada (un comando por vez, con validación humana antes de avanzar al siguiente) del procedimiento B documentado en `IMPLEMENTACION_A01_TAREA5.md`, sobre el entorno aislado preparado en la Tarea 6 (`restore-test/`).

Máquina de ejecución: entorno local del Product Owner (Windows, PowerShell). Docker Engine 29.6.2, Docker Compose v5.3.1 — confirmados en el paso 1.

---

## Registro de evidencia — checklist de `IMPLEMENTACION_A01_TAREA6.md` §11

### 1. Confirmar `docker --version` y `docker compose version`

```
PS C:\Users\Luis Ceballos> docker --version
Docker version 29.6.2, build dfc4efb
PS C:\Users\Luis Ceballos> docker compose version
Docker Compose version v5.3.1
```

**Resultado:** OK. Ambos prerrequisitos cumplidos.

### 2. Copiar `restore-test/.env.example` a `restore-test/.env` y definir contraseña local

`.env` creado con `RESTORE_TEST_DB_PASSWORD=TareaSieteLocal2026` (contraseña local arbitraria, sin relación con ninguna credencial real de producción/R2).

**Resultado:** OK.

### 3. Levantar el entorno: `docker compose up -d`

```
PS ...\restore-test> docker compose up -d
[+] up 13/13
 ✔ Image postgres:18.4-alpine3.24@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b Pulled   14.2s
 ✔ Network restore-test_restore-test-net                                                                  Created   0.1s
 ✔ Volume restore-test_restore_test_data                                                                  Created   0.0s
 ✔ Container restore-test-restore-test-db-1                                                               Started   1.2s
```

Imagen pulleada con el dígest exacto (coincide con `offsite-backup/Dockerfile`), red y volumen propios creados, contenedor iniciado sin error aparente.

**Resultado (aparente):** OK. Ver incidencia real detectada en el paso 4.

---

## Incidencia real detectada — Ruta de volumen de PostgreSQL 18 (imagen oficial)

**Momento de detección:** al verificar `docker compose ps` tras el paso 3, el contenedor se encontraba detenido.

**Causa raíz:** desde PostgreSQL 18, la imagen oficial (`docker-library/postgres`) cambió `PGDATA` a una ruta versionada (`/var/lib/postgresql/18/docker`) y el `VOLUME` declarado en la imagen pasó a ser `/var/lib/postgresql` (ya no `/var/lib/postgresql/data`). El objetivo del cambio, según el proyecto oficial, es permitir `pg_upgrade --link` entre major versions reutilizando el mismo volumen. `restore-test/docker-compose.yml` (preparado en la Tarea 6, antes de que este detalle se verificara con una ejecución real) todavía montaba el volumen con nombre en la ruta antigua (`/var/lib/postgresql/data`), que en PostgreSQL 18 ya no es la ruta que la imagen espera.

**Impacto real de dejarlo sin corregir:** sin este ajuste, el volumen con nombre queda montado en una ruta que la imagen ya no usa, mientras los datos se escriben en un volumen anónimo distinto. Esto **no genera ningún error visible** — es un fallo silencioso: cada arranque del contenedor ejecuta `initdb` de nuevo sobre un volumen vacío, como si fuera la primera vez. En este caso puntual el síntoma fue un contenedor detenido, pero el riesgo documentado del cambio de Postgres 18 es justamente la ausencia de error, no solo el que se observó acá.

**Verificación:** confirmado por búsqueda externa contra fuentes independientes (no solo por el diagnóstico dado en el momento) — ver referencias abajo.

**Corrección aplicada:** en `restore-test/docker-compose.yml`, cambiar:

```yaml
volumes:
  - restore_test_data:/var/lib/postgresql/data
```

por:

```yaml
volumes:
  - restore_test_data:/var/lib/postgresql
```

**Alcance de la corrección:** únicamente `restore-test/docker-compose.yml`. Se revisaron `restore-test/README.md` e `IMPLEMENTACION_A01_TAREA6.md` — ninguno de los dos documenta explícitamente la ruta de montaje, por lo que no requirieron cambios. No se tocó `offsite-backup/` (no usa Docker Compose ni monta volúmenes de esta forma) ni `EVIDENCIA_RAILWAY_A01.md` (la ruta `/var/lib/postgresql/data` que menciona corresponde al volumen nativo de Railway, un componente distinto y no afectado por este hallazgo).

**Referencias externas:**
- https://rdiachenko.com/posts/databases/postgresql/postgres-18-docker-silently-ignores-your-named-volume/
- https://aronschueler.de/blog/2025/10/30/fixing-postgres-18-docker-compose-startup/
- https://github.com/docker-library/postgres/issues/1370

**Riesgo para futuras iteraciones:** cualquier entorno nuevo que se prepare copiando el patrón "clásico" (`/var/lib/postgresql/data`) para una imagen `postgres:18` o superior reproducirá este mismo fallo silencioso. Señalar esta ruta como parte del checklist de revisión al preparar entornos Postgres 18+ en el futuro (por ejemplo, en una eventual Tarea 8 o en cualquier entorno nuevo que use esta misma imagen).

---

## Nota de trazabilidad — corte en el registro de evidencia

Entre el paso 4 (corrección del path de volumen, arriba) y el punto donde retoma el registro más abajo, se ejecutó realmente el resto del procedimiento B de `IMPLEMENTACION_A01_TAREA5.md` (descarga desde R2, verificación de checksum, descifrado, `pg_restore` contra `restore-test`) — la prueba de esto es que, al retomar la sesión, la base restaurada ya contenía el esquema completo (29 tablas) y datos reales. **Sin embargo, los comandos exactos, la salida del checksum, el resultado del descifrado y el tiempo insumido por cada paso no quedaron capturados en el tramo de esta sesión disponible para documentar este cierre.**

Por decisión expresa del Product Owner, este cierre se documenta **exclusivamente con la evidencia obtenida en el tramo de sesión disponible**, sin reconstruir ni asumir el detalle del tramo faltante. **Para que quede inequívoco: la descarga, el checksum, el descifrado y el `pg_restore` sí se ejecutaron realmente** — lo que falta es únicamente el registro textual completo de esos comandos y sus salidas, no la ejecución en sí. Se registra como limitación de trazabilidad documental, no como un paso pendiente de ejecutar — ver "Cierre formal" al final.

---

## Incidente real durante el drill — suspensión prolongada del host

**Síntoma:** al intentar ejecutar la verificación de conteo de filas (`rowcounts.sql`) contra la base ya restaurada, `docker compose cp` funcionó pero el `psql -f` inmediatamente posterior falló con `Error response from daemon: container ... is not running`.

**Diagnóstico (horarios en UTC):**

| Hora | Evento |
|---|---|
| 05:56:02 | Última query registrada en el log de Postgres del contenedor `restore-test-db`, contra la base ya restaurada |
| 06:01:16 | El host (Windows) entra en suspensión (`Microsoft-Windows-Kernel-Power`, motivo: `Application API`) |
| 14:57:57 | El host se reanuda — **casi 9 horas de suspensión** (`Microsoft-Windows-Power-Troubleshooter`, "Origen de la reactivación: Unknown") |
| ~15:12:28 | Los procesos de Docker Desktop (`com.docker.backend`, `Docker Desktop`, `docker-agent`) se reinician tras el resume — la VM de WSL2 no sobrevivió una suspensión de esa duración |
| 15:12:34 | El contenedor `restore-test-restore-test-db-1` termina con `ExitCode=255`, `OOMKilled=false`, sin ninguna línea de shutdown limpio en su log (no aparece "received fast shutdown request" ni "database system is shut down", a diferencia del shutdown normal registrado más temprano en el mismo log) |

**Causa raíz:** no fue un fallo de Postgres ni del procedimiento de restauración — el equipo entró en suspensión moderna (~9 h) y, al reanudarse, el backend de Docker Desktop tuvo que reiniciarse, lo que terminó el contenedor de forma abrupta (no vía `docker compose down`). El volumen con nombre (`restore_test_data`) no se vio afectado porque el contenedor nunca se eliminó, solo se detuvo.

**Verificación:** `docker inspect` confirmó `OOMKilled=false` y `ExitCode=255`; los eventos de energía de Windows (`Get-WinEvent`, IDs 1/42/107/506/507 del log `System`) confirmaron la ventana de suspensión; el timestamp de los procesos de Docker Desktop (`Get-Process` → `StartTime`) coincidió con el `FinishedAt` del contenedor.

**Riesgo para futuras iteraciones:** cualquier drill o entorno Docker local que dependa de un contenedor de larga duración es vulnerable a este mismo corte si el host entra en suspensión prolongada durante la ejecución. Mitigación práctica para sesiones futuras: deshabilitar la suspensión automática del equipo mientras un drill está en curso, o ejecutar contra un entorno que no dependa de que el host permanezca despierto.

### Recuperación (guiada, un comando por vez, confirmado por el Product Owner en cada paso)

1. `docker compose up -d` → contenedor reiniciado sin recrear (mismo volumen, mismo contenedor — `docker compose ps` lo mostró `Up ... (healthy)`).
2. `docker compose ps` → confirmado `healthy`.
3. `docker compose exec restore-test-db psql -U restore_test -d restore_test -c "\dt"` → **29 tablas** listadas, coincidentes con el esquema de producción (incluye `_prisma_migrations`) — confirma que el volumen conservó la restauración a través del corte.
4. `docker compose exec restore-test-db psql -U restore_test -d restore_test -f /tmp/rowcounts.sql` → ejecutado sin error, resultado:

| Tabla | Filas |
|---|---|
| Usuario | 4 |
| Organizacion | 1 |
| Viaje | 6 |
| Factura | 3 |
| Liquidacion | 3 |
| AnticipoGasto | 6 |
| _prisma_migrations | 23 |

23 migraciones coincide con el valor de referencia documentado en `AUDITORIA_A01_BACKUP_Y_RECUPERACION.md` (punto 2 del checklist de `IMPLEMENTACION_A01_TAREA5.md` §4) — es el único ítem de esa lista de validaciones que sí quedó corroborado por coincidencia con un valor de referencia previamente registrado.

---

## Comparación contra producción — autorizada bajo condiciones, no ejecutada

Se evaluó contrastar el `rowcounts.sql` restaurado contra una consulta de solo lectura a producción (`railway connect Postgres`, mismo método sin exposición de credenciales usado en la Tarea 4). El Product Owner señaló una precisión metodológica correcta antes de ejecutarla: el dump restaurado corresponde al **2026-07-27 12:01:46 UTC**, y producción pudo haber recibido escrituras posteriores — por lo que, aun ejecutada bajo las condiciones que se habían acordado (solo `SELECT`, sin exponer credenciales, con timestamp registrado, interpretada como plausibilidad y no como igualdad), el resultado nunca podría usarse como prueba de integridad del backup en sí.

Se decidió no continuar extendiendo el drill. **La conexión a producción nunca se abrió — no se ejecutó ningún `SELECT` contra producción en esta sesión.**

## Validaciones de `IMPLEMENTACION_A01_TAREA5.md` §4 — no ejecutadas en esta sesión

De la lista de validaciones posteriores a la recuperación, quedan **sin ejecutar**:

- [ ] Estado de migraciones vía `npx prisma migrate status` contra la base restaurada (el conteo de filas de `_prisma_migrations` = 23 es un indicio consistente, no un reemplazo de esta verificación).
- [ ] Integridad referencial (ausencia de filas huérfanas en relaciones sensibles).
- [ ] Verificación de secuencias.
- [ ] Verificación puntual de contenido (comparar un registro conocido contra su valor esperado).
- [ ] Revisión exhaustiva de ausencia de errores en el log completo de la restauración (el tramo de log disponible en esta sesión no mostró errores, pero no cubre el `pg_restore` en sí — ver nota de trazabilidad).
- [ ] Medición de RTO de punta a punta — **no disponible**: el inicio real del procedimiento (descarga desde R2) no quedó registrado en el tramo de sesión documentado acá.

## Limpieza final

```sh
docker compose down -v
```

Ejecutado y confirmado por el Product Owner. Verificado de forma independiente en esta sesión:

```
docker ps -a --filter "name=restore-test"      → sin contenedores
docker volume ls --filter "name=restore_test"  → sin volúmenes
docker network ls --filter "name=restore-test" → sin redes
```

No queda ningún recurso efímero de `restore-test` activo. **No se modificó producción en ningún momento de esta sesión.**

---

## Cierre formal — Tarea 7

**Estado: ejecución técnica completada.** El alcance parcial de este cierre es exclusivamente documental — no técnico.

El procedimiento B completo de `IMPLEMENTACION_A01_TAREA5.md` (descarga desde R2 → verificación de checksum → descifrado → `pg_restore`) se ejecutó de punta a punta, por primera vez de forma real, contra el entorno aislado de la Tarea 6. El resultado verificado es una base de datos funcional, con el esquema completo (29 tablas) y datos reales, que además sobrevivió intacta a una interrupción real del entorno (ver incidente de suspensión de Docker Desktop). En el proceso se detectaron y corrigieron dos hallazgos reales de infraestructura, no anticipados en el diseño:

1. El path de volumen de PostgreSQL 18 en `restore-test/docker-compose.yml` (documentado arriba, sección "Incidencia real detectada").
2. La fragilidad de un contenedor Docker de larga duración frente a una suspensión prolongada del host (esta sección).

**Lo parcial de este cierre es documental, no técnico:**

- El tramo descarga→checksum→descifrado→`pg_restore` sí se ejecutó, pero sus comandos exactos, la salida del checksum y los tiempos de cada paso no quedaron preservados en el tramo de esta sesión disponible para documentar — por lo tanto tampoco existe una medición trazable de RTO de punta a punta.

**Lo que no se ejecutó en esta sesión** (abierto para una futura iteración, ya sea Tarea 8 o un nuevo drill):

- El resto del checklist de validación de `IMPLEMENTACION_A01_TAREA5.md` §4 (migraciones vía Prisma, integridad referencial, secuencias, verificación puntual de contenido).
- Comparación de plausibilidad contra producción (evaluada, autorizada bajo condiciones, pero no ejecutada).

Este documento cierra formalmente la Tarea 7: la ejecución técnica del drill de recuperación quedó completada y validada de forma real; lo que permanece abierto es la trazabilidad documental completa de un tramo del procedimiento y el checklist extendido de validación posterior.

Cierre registrado: 2026-07-28 19:26 UTC.

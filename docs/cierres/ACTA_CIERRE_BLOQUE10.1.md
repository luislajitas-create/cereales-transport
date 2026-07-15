# Acta de Cierre — Bloque 10.1: Modelo base de Grupo Económico

**Estado: CERRADO**, sujeto a tu aprobación explícita (Artículo 4, punto 5, `CONSTITUCION_SDC.md`: ninguna sesión se declara a sí misma terminada). Fecha de apertura y cierre: 2026-07-15. Primer sub-bloque de la implementación de Grupo Económico para SDC v1.1, siguiendo `PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md`.

---

## 1. Migración

**`20260715192423_grupo_economico_base`** — puramente aditiva, revisada antes de aplicarse:

```sql
ALTER TABLE "Organizacion" ADD COLUMN     "grupoEconomicoId" TEXT;

CREATE TABLE "GrupoEconomico" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrupoEconomico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Organizacion_grupoEconomicoId_idx" ON "Organizacion"("grupoEconomicoId");

ALTER TABLE "Organizacion" ADD CONSTRAINT "Organizacion_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "GrupoEconomico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Sin `DROP`, sin `DELETE`, sin `UPDATE` destructivo, sin tocar ninguna restricción multiempresa existente. `Organizacion.grupoEconomicoId` nace `TEXT` nullable — confirmado antes de aplicarla. Aplicada limpiamente en desarrollo y, vía el `preDeployCommand` automático ya configurado desde Bloque 6.3, en producción (`19 migrations found... Applying migration 20260715192423_grupo_economico_base... All migrations have been successfully applied`, confirmado en los logs del deploy).

## 2. Modelos

- **`GrupoEconomico`** (nuevo): `id`, `nombre`, `createdAt`, relación uno-a-muchos con `Organizacion`. **No es un modelo organizacional** — no tiene `organizacionId`, no se agregó a `ORGANIZACIONAL_MODELS` (`backend/src/prisma/organizacional-models.ts`, sin modificar).
- **`Organizacion`** (modificada): campo `grupoEconomicoId` opcional, relación `grupoEconomico` opcional, índice `@@index([grupoEconomicoId])`. Ningún otro campo de `Organizacion` cambió.

## 3. Endpoints

Módulo nuevo `backend/src/grupo-economico/` (`GrupoEconomicoController`, `GrupoEconomicoModule`, registrado en `app.module.ts`), montado en `/api/v1/grupo-economico`:

| Endpoint | Rol | Qué hace |
|---|---|---|
| `GET /grupo-economico` | `ADMINISTRADOR` | Consulta el grupo de la organización activa del actor (o `null`) |
| `POST /grupo-economico` | `ADMINISTRADOR` | Crea un grupo y asocia, en la misma transacción, la organización del actor como fundadora |
| `POST /grupo-economico/:id/organizaciones` | `ADMINISTRADOR` | Asocia la organización del actor a un grupo existente |
| `POST /grupo-economico/:id/organizaciones/desasociar` | `ADMINISTRADOR` | Desasocia la organización del actor de ese grupo |

## 4. Autorizaciones

- **Sin `SUPERADMIN`**: no existe ningún rol ni endpoint con alcance sobre más de una organización sin pertenecer a ella — crear un grupo exige ya ser `ADMINISTRADOR` de una organización real, que queda asociada de inmediato como fundadora.
- **Una organización solo se incorpora por su propio Administrador**: en los cuatro endpoints, la organización sobre la que se actúa nunca sale del body ni de la URL — siempre es `actor.organizacionId`, derivado del JWT ya validado. Verificado explícitamente: un intento de enviar `organizacionId` en el body de `POST /grupo-economico` fue ignorado por completo; el endpoint actuó exclusivamente sobre la organización del token.
- **Ningún Administrador controla otra organización unilateralmente**: el Administrador de la Organización A nunca pudo asociar ni desasociar a la Organización B — cada una requirió su propio Administrador autenticado actuando sobre sí misma.
- **`RolesGuard` + `JwtAuthGuard`**, mismo mecanismo ya existente — sin ningún guard nuevo todavía (ese es Bloque 10.3).

## 5. Asociaciones realizadas

**En desarrollo:** se creó un grupo de prueba ("Grupo de Prueba Fase 10.1") y se asociaron las dos organizaciones reales de desarrollo ("Organización Principal" y "Organización B - Prueba Fase F"), quedando ambas asociadas al finalizar la validación.

**En producción:** **ninguna.** Tal como se indicó explícitamente, no se creó ningún Grupo Económico real ni se asoció ninguna organización real en producción — no están todavía confirmados los dos CUIT/organizaciones reales que deben integrarlo. Esa acción queda pendiente de una instrucción explícita posterior, con las identidades reales ya confirmadas.

## 6. Validaciones (los 15 puntos pedidos)

1. **Build backend**: limpio, sin errores.
2. **`prisma validate`**: `The schema... is valid`.
3. **Prisma Client generado**: confirmado (`Generated Prisma Client (v5.22.0)`).
4. **Migración aplicada limpiamente**: en desarrollo y en producción, sin errores.
5. **Crear un Grupo Económico**: `POST /grupo-economico` — verificado, devuelve el grupo con su organización fundadora.
6. **Asociar las dos organizaciones reales de desarrollo**: verificado — ambas terminaron asociadas al mismo grupo.
7. **Una organización no puede pertenecer a dos grupos**: verificado dos veces — creando un segundo grupo (`"Tu organización ya pertenece a un grupo económico"`, 400) y asociándose a un grupo distinto estando ya en uno.
8. **Consultar correctamente el grupo de cada organización asociada**: verificado — Admin A y Admin B, cada uno desde su propia sesión, vieron el mismo grupo con ambas organizaciones.
9. **Organización no asociada continúa funcionando**: verificado por regresión (`GET /organizacion`, `/viajes`, `/clientes`, `/liquidaciones`, todos `200`) durante los tramos en que una u otra organización todavía no estaba asociada; no se contó, en desarrollo, con una tercera organización real para un caso adicional — cubierto en su lugar por garantía estructural (el campo nace `null` y ningún código lo toca salvo estos cuatro endpoints).
10. **Asociación y desasociación auditadas**: verificado — `GET /organizacion/auditoria?entidad=GrupoEconomico` mostró, para cada organización, únicamente sus propios eventos (`grupo_economico_creado`, `grupo_economico_organizacion_asociada`, `grupo_economico_organizacion_desasociada`), nunca los de la otra.
11. **Regresión de SDC v1.0**: muestra representativa ejecutada (`GET /organizacion`, `/viajes`, `/clientes`, `/liquidaciones`, todos `200` sin cambios) — no se re-ejecutó el circuito financiero completo (liquidar→confirmar→pagar→anular) porque ningún archivo de esos módulos fue tocado por este sub-bloque; el diff de este commit no incluye ninguno de esos controllers.
12. **Aislamiento multiempresa original sin cambios**: confirmado por el mismo resultado del punto 10 — `AuditLog` (modelo organizacional, sin ningún cambio de código) siguió aislando correctamente entre las dos organizaciones.
13. **Ninguna consulta operativa cruza organizaciones**: por diseño (`GrupoEconomicoController` nunca opera sobre una organización distinta de `actor.organizacionId`) y confirmado en la práctica en los puntos 7 y 8.
14. **Sin secretos ni datos sensibles en logs**: verificado — búsqueda de `password`, `accessToken`, `JWT_SECRET`, encabezados `Bearer` en el log del backend local, sin coincidencias.
15. **Conteos de tablas operativas intactos**: verificado — `Usuario` (13) y `Viaje` (15) sin cambios; `Organizacion` sin cambio de cantidad de filas (2), solo la columna nueva poblada; `GrupoEconomico` en 1 (el creado en esta validación). Ningún otro modelo fue tocado por el código de este sub-bloque, así que no había ningún camino posible para alterar sus conteos.

## 7. Producción

- Deploy automático disparado por el push a `main`, migración aplicada por el `preDeployCommand` ya configurado (Bloque 6.3) — confirmado en logs: `All migrations have been successfully applied`.
- `GET /api/v1/health` → `200`.
- Las 4 rutas nuevas quedaron mapeadas (confirmado en logs de arranque) y exigen autenticación igual que cualquier otra (`401` sin token, verificado).
- Rutas ya existentes (`/viajes`, `/organizacion`) responden exactamente igual que antes (`401` sin token) — sin ninguna diferencia visible.
- Sin errores en los logs del deploy.
- No se creó ningún dato real de Grupo Económico en producción (sección 5).

## 8. Rollback

No fue necesario ejecutar ningún rollback — se documenta la estrategia, tal como exige el criterio de cierre:
- Desasociar una organización: revierte `grupoEconomicoId` a `null`, sin afectar ningún otro dato — ya probado en desarrollo (Admin B se desasoció y volvió a asociarse sin ningún efecto colateral).
- Eliminar el grupo de prueba, si hiciera falta: solo es posible cuando ninguna organización está asociada (`onDelete: Restrict`) — protección estructural contra un borrado accidental con organizaciones dependientes.
- Revertir la migración: aditiva y simétrica — quitar la columna y la tabla nuevas no afecta ninguna fila de ninguna tabla preexistente.

## 9. Confirmación de que ningún comportamiento de v1.0 cambió

Confirmado en los puntos 9, 11, 12 y 13 de la sección 6, y en la sección 7: ninguna pantalla, ningún endpoint, ningún flujo financiero, ningún mecanismo de aislamiento existente mostró ninguna diferencia de comportamiento. El único cambio observable es la existencia de 4 rutas nuevas, invisibles y sin efecto para cualquier organización que no haya sido asociada explícitamente a un grupo — que hoy es ninguna, en producción.

---

## Qué queda fuera de este sub-bloque (confirmado, no implementado)

Identidad compartida de Choferes; acceso multiempresa de usuarios; cambio de organización activa; selector de organización; pagos consolidados; cambios en `Liquidacion`; cambios en el JWT; cambios en `ORGANIZACION_PRISMA`; frontend; Centro de Inteligencia; Transportistas o Vehículos compartidos — todo según lo previsto para los Bloques 10.2 a 10.6.

---

**Commits de este sub-bloque:** `a963ba2` (código — schema, migración, módulo backend). Este documento, una vez aprobado, se commitea por separado.

No se abre Bloque 10.2. Detenido a la espera de tu aprobación de esta acta.

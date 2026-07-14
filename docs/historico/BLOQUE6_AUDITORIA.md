# Bloque 6 — Auditoría: Verificación y Blindaje de Producción

Fecha: 2026-07-09. Documento de auditoría pura — no se modificó ningún archivo, no se escribió código, no se generaron migraciones, no se hizo commit. Sigue el mismo formato que las auditorías de los Bloques 3-5. Elegido como siguiente sub-bloque por ser el único conjunto de hallazgos marcado "Imprescindible" en `PLAN_VERSION_1_0.md` — ver el análisis de candidatos que precede a este documento en la conversación.

**Alcance:** los 5 ítems que `DEUDA_TECNICA.md` (sección "Resumen de bloqueantes reales") y `ROADMAP_ACTUALIZADO.md` (Prioridad 1) ya identificaron como pendientes de rondas anteriores: verificación del entorno de producción, `JWT_SECRET`/`CORS_ORIGIN` sin fail-fast, ausencia de rate-limiting en login, `cuentaCorriente()` sin excluir facturas anuladas, y la unificación de Dockerfiles junto con la automatización de `prisma migrate deploy`. Todo lo citado abajo fue releído hoy contra el estado real del repositorio, no contra las auditorías originales — donde algo cambió desde entonces, se señala explícitamente (spoiler: nada cambió, los 5 hallazgos siguen exactamente como se documentaron).

---

## 1. Verificación de producción — Root Directory y entrypoint del build

### 1.1 Qué se sabe con certeza

`PROJECT_STATUS.md` (2026-07-03) documenta una validación exitosa de punta a punta contra Railway: login, emisión de JWT, y acceso autorizado a `GET /api/v1/dashboard/resumen`, todo funcionando. Esa validación es real y quedó registrada.

### 1.2 Qué contradice esa validación, sin resolverse

`BLOQUE5_AUDITORIA_PRODUCTO.md` (2026-07-07, cuatro días después) señaló dos hallazgos P0 que, de ser ciertos hoy, son incompatibles con que ese despliegue siga funcionando sin intervención manual no documentada:

- **`README.md:59,69,104,124`** sigue describiendo `cd app/backend`, `cd app/frontend`, y "Root Directory = `app/backend`"/`app/frontend`" como la configuración de Railway — confirmado releyendo el archivo hoy, sin cambios.
- **El directorio `app/`** sigue presente en la raíz del repositorio (`ls app/` devuelve `backend/`, `frontend/`), sin relación con el código activo de los Bloques 3-5 según ya se estableció en auditorías previas.
- **`backend/package.json:7`**: `"start": "node dist/main.js"`. **`Dockerfile:49`**: `CMD ["node", "dist/main.js"]`. **`backend/Dockerfile:18`**: `CMD ["node", "--enable-source-maps", "dist/main.js"]`. Los tres, sin excepción, apuntan a `dist/main.js`.
- **Confirmado empíricamente hoy, corriendo `npm run build` en `backend/`:** el build real de `nest build` genera el entrypoint en `dist/src/main.js`, no en `dist/main.js`. Si el contenedor de producción ejecuta el `CMD` tal cual está en cualquiera de los dos Dockerfiles, fallaría con `MODULE_NOT_FOUND`.

### 1.3 La contradicción sin resolver

Estos dos hechos —una validación exitosa documentada el 07-03, y una discrepancia de entrypoint confirmada en el código el 07-07 y otra vez hoy— **nunca se conciliaron**. Las explicaciones posibles, ninguna descartada:

- Railway usa un `startCommand` configurado manualmente en su dashboard que sobreescribe el `CMD` del Dockerfile (no versionado, invisible desde el repositorio).
- La validación del 07-03 se hizo contra una build o configuración que después cambió.
- El `Root Directory` de Railway apunta a `backend/`/`frontend/` (correcto) pero el `CMD` fue corregido manualmente en algún punto sin reflejarse en el Dockerfile versionado.
- Cualquier combinación de lo anterior.

**Ninguna de estas hipótesis se puede confirmar ni descartar sin entrar al dashboard de Railway.** Es, literalmente, la misma verificación que el sub-bloque 5.0 del roadmap original proponía hace dos bloques y que nunca se ejecutó.

### 1.4 Prioridad

**P0.** Toda priorización posterior de este mismo documento (y de cualquier otro) es secundaria si el problema es real — no se puede saber si el resto del sistema funciona en producción tal como se documentó si no está confirmado qué corre ahí. Esfuerzo de verificación: mínimo (revisión de dashboard, sin código).

---

## 2. `JWT_SECRET` y `CORS_ORIGIN` sin fail-fast

### 2.1 Evidencia

- **`backend/src/auth/auth.module.ts:12`**: `secret: process.env.JWT_SECRET || "dev-secret-change-me"`.
- **`backend/src/auth/jwt.strategy.ts:11`**: `secretOrKey: process.env.JWT_SECRET || "dev-secret-change-me"`.
- **`backend/src/main.ts:9`**: `app.enableCors({ origin: process.env.CORS_ORIGIN || "*", credentials: true })`.

Los tres, confirmados hoy sin cambios respecto a `BACKEND_REVIEW.md` (2026-07-03) y `BLOQUE5_AUDITORIA_PRODUCTO.md` (B9/B10, 2026-07-07).

### 2.2 El riesgo, en términos concretos

Si la variable de entorno `JWT_SECRET` no está seteada en el entorno real (Railway) por cualquier motivo —un despliegue nuevo, una reconfiguración, un typo en el nombre de la variable— la aplicación **arranca igual, sin ningún error, y empieza a firmar y verificar tokens JWT con el string literal `"dev-secret-change-me"`**, que está en el repositorio público del proyecto. Cualquiera que lea el código puede forjar un token válido para cualquier usuario, incluido `ADMINISTRADOR`. No hace falta ningún ataque sofisticado — es leer un archivo del propio repositorio.

`CORS_ORIGIN` sin setear tiene un efecto más acotado (la API acepta requests de cualquier origen), mitigado en la práctica por el comportamiento de navegadores modernos frente a `credentials:true`, pero sigue siendo una configuración frágil que depende enteramente de que nadie se olvide de setear la variable.

### 2.3 Por qué sigue abierto pese a Bloque 5.1

`BLOQUE5.1_DISENO_SEGURIDAD_CATALOGOS.md` (el diseño que sí se implementó, commit `258e8a4`) acotó su alcance explícitamente al `RolesGuard` de `CatalogosModule` — ni B9 ni B10 ni B11 (rate-limiting, sección 3) estaban en su alcance, pese a que el roadmap original (`ROADMAP_BLOQUE5.md`, sub-bloque 5.1) los agrupaba junto con el `RolesGuard`. `BLOQUE5_ESTADO_ACTUAL.md` ya documentó esta reducción de alcance como un hecho consumado, no como un olvido — pero el hallazgo original sigue sin resolverse.

### 2.4 Prioridad

**P1**, escalable a P0 si se confirma que el entorno real no tiene `JWT_SECRET` seteado (lo cual no está verificado — ver también sección 1, son hallazgos relacionados por la misma falta de visibilidad sobre la configuración real de Railway).

---

## 3. Sin rate-limiting en login

### 3.1 Evidencia

`grep -i throttl backend/package.json` no devuelve ningún resultado. No hay `@nestjs/throttler` ni ninguna librería equivalente instalada en el proyecto. `POST /auth/login` (`auth.controller.ts`) no tiene ningún guard ni middleware que limite intentos.

### 3.2 El riesgo

El sistema está desplegado en un dominio público de Railway (confirmado en `PROJECT_STATUS.md`). Sin límite de intentos, un ataque de fuerza bruta contra el login de cualquier usuario conocido (por ejemplo, un email de `ADMINISTRADOR` que se pueda inferir o que ya se haya filtrado) no tiene ninguna fricción del lado del servidor.

### 3.3 Prioridad

**P1**, mismo origen que la sección 2 (B11 de `BLOQUE5_AUDITORIA_PRODUCTO.md`, agrupado originalmente en el 5.1 propuesto y nunca implementado).

---

## 4. `cuentaCorriente()` no excluye facturas anuladas

### 4.1 Evidencia exacta

`backend/src/catalogos/clientes.controller.ts:151-172`:

```
@Get(":id/cuenta-corriente")
async cuentaCorriente(@Param("id") id: string) {
  const facturas = await this.prisma.factura.findMany({
    where: { clienteId: id },
    include: { cobranzas: { where: { anulada: false } } },
    orderBy: { fecha: "asc" },
  });
  ...
  for (const f of facturas) {
    raw.push({ fecha: f.fecha, concepto: `Factura ${f.numero}`, debe: f.importe, haber: 0 });
    ...
```

El `where` de `factura.findMany` (línea 154) filtra únicamente por `clienteId` — no excluye `estado: "ANULADO"`. El `include` de `cobranzas` (línea 155) sí filtra `anulada: false` correctamente. Es decir: **el propio método trata la anulación de una cobranza con cuidado, pero no la anulación de una factura**, una inconsistencia dentro del mismo bloque de código.

### 4.2 El efecto concreto

Toda `Factura` con `estado === "ANULADO"` de un cliente sigue apareciendo en su cuenta corriente, sumando `f.importe` completo al `debe` (línea 160), sin ninguna cobranza asociada que lo compense (las facturas anuladas típicamente no tienen cobranzas, por la propia regla de negocio del Bloque 4.3: solo se puede anular una factura sin cobranzas vigentes). El resultado es un `saldoActual` (línea 171) **inflado por el importe total de cada factura anulada de ese cliente**, visible en la pantalla de cuenta corriente que consume Facturación/Gerencia.

### 4.3 Por qué es distinto de un hallazgo nuevo

No lo es — `BLOQUE4.3_DISENO_COBRANZAS.md` lo señaló explícitamente como "candidato a un P0 aparte" en su propia sección de alcance, en el momento en que se diseñó el soft-delete de `Cobranza`, precisamente porque en ese momento se notó la asimetría con `Factura`. Quedó fuera del alcance de esa entrega por decisión consciente, no por descuido, pero nunca se retomó después.

### 4.4 Prioridad

**P1** — es deuda de integridad contable, la misma categoría de riesgo que ya motivó los P0 de los Bloques 3 y 4 (`anticipoGastoId`, viajes editables tras facturar/liquidar, cobranzas sin tope). Esfuerzo de resolución: mínimo, un filtro adicional en el `where` de la línea 154.

---

## 5. Dockerfiles divergentes y migraciones no automatizadas

### 5.1 Evidencia

- **`Dockerfile:49`** (raíz): `CMD ["node", "dist/main.js"]`.
- **`backend/Dockerfile:18`**: `CMD ["node", "--enable-source-maps", "dist/main.js"]`.
- Ambos comparten el problema de la sección 1 (entrypoint incorrecto), pero además tienen contenido de build distinto entre sí (ya documentado en `BACKEND_REVIEW.md` §4: el de la raíz copia `node_modules` completo con dependencias de desarrollo; `backend/Dockerfile` optimiza el runtime).
- Ningún `package.json` script ni ningún Dockerfile ejecuta `prisma migrate deploy` — confirmado en `backend/package.json`, el script existe (`"prisma:migrate": "prisma migrate deploy"`) pero no se invoca automáticamente en ningún punto del arranque ni del build.
- No hay evidencia en el repositorio de ninguna estrategia de backup de PostgreSQL documentada.

### 5.2 Por qué se incluye en este bloque y no se trata aparte

Marcado "crítico antes de producción" en `ROADMAP_SDC_V1.md` (2026-07-03), reconfirmado sin resolver en `BACKEND_REVIEW.md` y de nuevo en `BLOQUE5_AUDITORIA_PRODUCTO.md` (P3, P4, P12) — es la tercera vez que se documenta el mismo hallazgo. Se agrupa acá porque **no tiene sentido decidir cuál de los dos Dockerfiles unificar sin haber resuelto primero la sección 1** (si no se sabe cuál usa Railway realmente, unificar el equivocado no reduce ningún riesgo). El backup y la automatización de `migrate deploy` son, en cambio, independientes de esa duda y se pueden avanzar en paralelo.

### 5.3 Prioridad

**P1**, con dependencia interna: la unificación de Dockerfiles depende del resultado de la sección 1; el backup y la automatización de `migrate deploy` no dependen de nada.

---

## 6. Clasificación consolidada

| # | Hallazgo | Prioridad | Depende de | Esfuerzo | ¿Requiere código? |
|---|---|---|---|---|---|
| 1 | Verificación de Root Directory/entrypoint en Railway | **P0** | Ninguna | Mínimo (horas, sin código) | No — verificación manual, posible ajuste de configuración |
| 2 | `JWT_SECRET`/`CORS_ORIGIN` sin fail-fast | P1 (escalable a P0 según resultado de #1) | Ninguna | Bajo | Sí — validación al arrancar |
| 3 | Sin rate-limiting en login | P1 | Ninguna | Bajo | Sí — `@nestjs/throttler` |
| 4 | `cuentaCorriente()` no excluye facturas anuladas | P1 | Ninguna | Mínimo | Sí — un filtro en un `where` |
| 5a | Unificar Dockerfiles | P1 | **Depende del resultado de #1** | Bajo | Sí — elegir y ajustar uno, eliminar el otro |
| 5b | Automatizar `prisma migrate deploy` | P1 | Ninguna | Bajo-medio | Sí — ajuste de pipeline/Dockerfile |
| 5c | Backup de base de datos documentado/verificado | P1 | Ninguna | Bajo-medio | No necesariamente — puede ser verificación + documentación |

---

## 7. Qué queda explícitamente fuera de alcance de este documento

- El resto de "Prioridad 2" de `ROADMAP_ACTUALIZADO.md` que no está marcado como bloqueante en `DEUDA_TECNICA.md`: `HEALTHCHECK`/usuario no-root en Docker, `.env.example`, actualización del `README.md` a la estructura real del repo. Quedan para un sub-bloque de infraestructura posterior, no bloquean 1.0.
- Limpieza de los 5 archivos `schema*.prisma` sueltos y del directorio `app/` duplicado — señalada tres veces en auditorías previas, pero es deuda de limpieza (P2), no un bloqueante de producción; se resuelve mejor junto con la sección 1 una vez confirmado qué es seguro borrar, pero no forma parte del diseño de este bloque.
- Todo lo demás de `DEUDA_TECNICA.md` (observabilidad, tests automatizados, capa de servicio, UX no financiera) — ya clasificado como "Muy recomendable" o "Puede esperar para 1.1" en `PLAN_VERSION_1_0.md`, sin cambios en esta auditoría.

---

No se modificó código, `schema.prisma`, ni se generaron migraciones ni commits para producir este documento.

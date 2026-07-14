# Bloque 8 — Auditoría de Productización y Multiempresa

## Etapa 1 — Diagnóstico Integral

Fecha: 2026-07-12. Documento de auditoría pura — **no se escribió código, no se modificó ningún archivo del sistema, no se generaron migraciones, no se hizo commit ni push.** Construye sobre `CONSTITUCION_SDC.md`, `FASEIII_PRODUCTIZACION_SDC.md` y `FASEIII_PLAN_MAESTRO_2026_2030.md` — no repite su contenido conceptual, lo verifica contra el código real.

**La pregunta que responde esta auditoría, y solo esta:** ¿qué impide hoy que SDC pueda implementarse, de forma repetible, en una segunda empresa del mismo rubro?

**Método:** relectura directa del backend, el frontend, el modelo de datos y la configuración de despliegue — no se asumió nada de lo ya señalado en `DEUDA_TECNICA.md` o en las auditorías de bloques anteriores; donde este documento confirma un hallazgo previo, lo cita; donde encuentra algo nuevo (específico de la pregunta de multiempresa), lo marca como tal.

---

## 1. Dependencias específicas del cliente actual

- **Marca de producto hardcodeada en dos lugares del frontend:** `frontend/src/pages/Login.tsx:30` (`"Sistema de Gestión — Dador de Carga de Cereales"`) y `frontend/src/components/Layout.tsx:32` (`"Dador de Carga"`). No hay ninguna variable de configuración ni de entorno que separe "el nombre del producto" de "el nombre de la instalación de un cliente particular" — el texto está en el JSX.
- **Todo el catálogo de demostración de `backend/prisma/seed.js`** usa nombres reales y específicos (clientes: "Aceitera del Litoral S.A.", "Exportadora del Sur S.R.L."; ubicaciones: "Pergamino", "Rosario", "San Lorenzo"; transportistas y choferes con nombres propios) — no es, en sí, un problema de producción (es solo un script de siembra para desarrollo), pero es la evidencia de que **no existe ningún concepto de "instalación nueva con catálogo vacío"**: cada instalación hoy nace o copiando este mismo seed, o cargada a mano desde cero, sin ningún punto intermedio.
- **Un único usuario `ADMINISTRADOR` de producción, creado manualmente por fuera de cualquier proceso repetible.** Confirmado directamente en esta misma serie de conversaciones (Bloque 7, cierre): no existe ningún mecanismo de alta de usuario más allá de un script temporal corrido a mano contra la base de datos real.
- **`docker-compose.yml`** define una única base de datos, un único backend y un único frontend, con `JWT_SECRET`, `CORS_ORIGIN` y `DATABASE_URL` fijos en el propio archivo — no hay ninguna plantilla parametrizada pensada para levantar una segunda instalación independiente a partir de la primera.

---

## 2. Configuraciones fijas que deberían parametrizarse

- **Los 20 umbrales de alertas de `backend/src/inteligencia/shared/umbrales.ts`** (días de mora, montos de deuda, porcentajes de concentración) son un único conjunto de constantes global. No hay, hoy, ninguna forma de que dos empresas distintas tengan un criterio propio de "cuánta deuda vencida es preocupante" — cada una necesitaría, literalmente, sus propios valores.
- **El umbral de "variación estable" (±2%) de `backend/src/inteligencia/benchmarking/benchmarking.calc.ts`** — mismo problema: un solo valor de calibración para cualquier instalación.
- **`CORS_ORIGIN` es un único string** (`backend/src/main.ts:9`, `app.enableCors({ origin: process.env.CORS_ORIGIN || "*", credentials: true })`) — no soporta una lista de orígenes permitidos. En cualquier escenario donde más de un frontend (uno por cliente, por ejemplo) necesite hablarle al mismo backend, esta configuración tal como está force a usar el comodín `"*"` o a elegir un solo origen.
- **`VITE_API_URL` se hornea en el momento del build del frontend** (`frontend/src/api/client.ts:3`, `import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1"`) — no es una configuración en tiempo de ejecución. Cada cliente con su propio backend requeriría, hoy, su propio build de frontend distinto, no un simple cambio de variable de entorno sobre el mismo artefacto.
- **`JWT_SECRET`/`CORS_ORIGIN` con fallback inseguro compartido** (`backend/src/auth/auth.module.ts:12`, `backend/src/auth/jwt.strategy.ts:11` — `process.env.JWT_SECRET || "dev-secret-change-me"`). Ya señalado en `DEUDA_TECNICA.md`, sección A, como riesgo de seguridad; el ángulo nuevo para esta auditoría es que **cada instalación nueva repite el mismo riesgo desde cero** — no hay ninguna plantilla ni verificación que lo prevenga al desplegar un cliente adicional.

---

## 3. Catálogos que hoy no son reutilizables

- **No existe ningún concepto de catálogo "global" vs. "propio de cada empresa".** `Cereal`, `Ubicacion` y `TipoGasto` son tablas únicas — si dos empresas usaran la misma instalación, compartirían forzosamente el mismo catálogo de cereales y ubicaciones, sin ninguna forma de que cada una tenga el suyo propio ni de reutilizar una base común con extensiones propias.
- **`RolNombre` es un `enum` a nivel de base de datos** (`backend/prisma/schema.prisma:11-18`: `ADMINISTRADOR | GERENCIA | OPERACIONES | LIQUIDACIONES | FACTURACION | LECTURA`). Agregar, quitar o renombrar un rol para una empresa en particular requiere una migración de schema — no es un catálogo editable, es una restricción estructural de la base de datos.

---

## 4. Procesos de implementación manuales

- **Alta de usuarios: no existe.** `backend/src/catalogos/simples.controller.ts:52-59` — `UsuariosController` tiene un único método, `GET`, que lista usuarios. No hay `POST`, no hay `PATCH`, no hay `DELETE`. La única forma confirmada de crear o modificar un usuario es intervención directa en la base de datos — exactamente lo que debió hacerse en esta misma serie de conversaciones para recuperar acceso administrativo en producción.
- **Edición o baja de `Cereal`/`Ubicacion`/`TipoGasto`: no existe.** Mismo archivo, líneas 14-37 — los tres controllers (`CerealesController`, `UbicacionesController`, `TiposGastoController`) tienen únicamente `GET` (listar) y `POST` (crear). Ningún `PATCH`, ningún `DELETE`. Un error de carga en cualquiera de estos tres catálogos es, hoy, permanente salvo intervención directa en la base.
- **`ProductoresController` tiene `PATCH` pero no `DELETE`** (líneas 40-50) — punto intermedio entre los dos casos anteriores, igual de manual para el caso de baja.
- **Despliegue de una instalación nueva: sin plantilla.** `docker-compose.yml` y `railway.json` están armados con valores fijos para una única instalación — replicarlos para un cliente nuevo es, hoy, un ejercicio manual de copiar archivos y ajustar valores a mano, no un proceso documentado ni parametrizado.
- **Recuperación de acceso o reset de contraseña: sin mecanismo.** Confirmado exactamente en esta sesión — se resolvió con un script temporal ejecutado directamente contra la base de producción, fuera de cualquier flujo del propio sistema.

---

## 5. Supuestos de negocio embebidos en el código

- **Una sola moneda (ARS) y un solo locale (`es-AR`) hardcodeados**, sin ninguna capa de configuración regional — confirmado en al menos 11 archivos de backend (`anticipos.controller.ts`, `facturas.controller.ts`, `liquidaciones.controller.ts`, `clientes.controller.ts`, `choferes.controller.ts`, `transportistas.controller.ts`, `alertas.calc.ts`, entre otros) y 13 archivos de frontend (todas las páginas que muestran un monto). Cada `Intl.NumberFormat("es-AR", { currency: "ARS", ... })` es una instancia repetida del mismo supuesto, no una configuración centralizada.
- **`cuit`/`cuil` son campos de texto libre**, sin validación de formato en ningún DTO (`create-cliente.dto.ts:12`, `create-transportista.dto.ts:10`, `create-chofer.dto.ts:19`, entre otros — ya señalado como N11 en `DEUDA_TECNICA.md`), pero el **nombre mismo del campo** asume, en el modelo de datos, que todo cliente/transportista/productor/chofer tiene un identificador fiscal del régimen argentino. No es un problema de validación solamente — es un supuesto de negocio incorporado a la forma en que se modeló cada entidad.
- **El concepto de "empresa que opera SDC" no existe en ningún lugar del modelo de datos.** Se revisó `schema.prisma` completo buscando cualquier referencia a "empresa", "tenant", "organización" o una columna equivalente — no hay ninguna. `Cliente`, `Transportista`, `Usuario`, `Viaje`, `Factura`, `Liquidacion` y el resto de los modelos son tablas globales, sin ninguna columna que distinga "a qué instalación o a qué empresa pertenece este registro". Esto no es una configuración que falte ajustar — es la ausencia completa del concepto estructural central que cualquier escenario multiempresa necesitaría como punto de partida.

---

## 6. Riesgos para un escenario multiempresa

- **Sin aislamiento de datos entre organizaciones.** Si dos empresas distintas se alojaran hoy en la misma base de datos, cada una vería los datos de la otra — no hay, en ningún controller relevado, ninguna cláusula de filtrado por organización, porque no existe ninguna columna que lo permita (consecuencia directa del hallazgo de la sección 5).
- **El token de autenticación no lleva ningún dato de organización.** `backend/src/auth/auth.service.ts` construye el payload del JWT como `{ sub, email, rol, nombre }` — ni siquiera si se agregara aislamiento de datos a nivel de base, habría hoy una forma de que un token identifique a qué empresa pertenece el usuario que lo porta.
- **`RolesGuard` no tiene ningún concepto de alcance por organización** (`backend/src/auth/roles.guard.ts:17`: `if (user.rol === "ADMINISTRADOR") return true`) — un `ADMINISTRADOR` es, estructuralmente, global a toda la instalación, no a una empresa dentro de ella.
- **La única arquitectura de crecimiento disponible hoy es multi-instancia, no multi-tenant** — cada cliente nuevo implica, necesariamente, una base de datos, un backend y un frontend separados y desplegados de forma independiente (confirmado por la sección 1 y 4). Es una arquitectura válida para un número reducido de clientes, pero cada instalación nueva duplica el costo operativo completo (infraestructura, despliegue, backups, mantenimiento, y — según la sección 4 — cada corrección manual de catálogos o usuarios) en vez de compartirlo entre clientes.
- **La configuración de seguridad débil (`JWT_SECRET`/`CORS_ORIGIN` con fallback), ya señalada como deuda en `DEUDA_TECNICA.md` para una sola instalación, se multiplica exactamente por la cantidad de instalaciones nuevas** — no hay ningún mecanismo, hoy, que impida que una instalación nueva se despliegue sin haber configurado explícitamente esas variables.

---

## 7. Priorización de los hallazgos

| # | Hallazgo | Sección | Impacto | Esfuerzo relativo |
|---|---|---|---|---|
| 1 | Ausencia total del concepto de "empresa/organización" en el modelo de datos | 5, 6 | **Muy alto** — es el prerrequisito estructural de todo lo demás; sin esto, ningún otro hallazgo de esta lista se puede resolver de forma definitiva, solo parchearse | Alto |
| 2 | Sin alta/edición/baja de usuarios vía API | 4 | **Muy alto** — ya causó una intervención manual directa en producción real durante este mismo ciclo de trabajo | Medio |
| 3 | Sin edición/baja de catálogos simples (`Cereal`, `Ubicacion`, `TipoGasto`) | 4 | Alto — cualquier error de carga en la implementación de un cliente nuevo es permanente sin intervención técnica | Bajo/Medio |
| 4 | Umbrales de alertas y de tendencias como constantes globales, no por instalación | 2 | Alto — un valor calibrado para un cliente puede ser completamente inadecuado para otro con distinto volumen o criterio de negocio | Bajo/Medio |
| 5 | Sin proceso ni plantilla de despliegue para una instalación nueva | 1, 4 | Alto — cada cliente nuevo hoy es, en los hechos, un proyecto de infraestructura a medida, no una activación de producto | Medio |
| 6 | `JWT_SECRET`/`CORS_ORIGIN` con fallback inseguro, sin verificación al desplegar una instalación nueva | 2, 6 | Alto, y se multiplica por cada instalación nueva | Bajo (ya diseñado en `BLOQUE6_DISENO.md`, nunca implementado) |
| 7 | `CORS_ORIGIN` como origen único, sin soporte de lista | 2 | Medio — relevante recién si el modelo de despliegue elegido comparte un backend entre más de un frontend | Bajo |
| 8 | `VITE_API_URL` horneado en build, no configurable en runtime | 2 | Medio — obliga a un build de frontend distinto por cliente en vez de una configuración de despliegue | Bajo/Medio |
| 9 | Marca de producto hardcodeada en el frontend | 1 | Bajo/Medio — relevante solo si se decide ofrecer personalización de marca por cliente, no para la repetibilidad funcional en sí | Bajo |
| 10 | `RolNombre` como `enum` de base de datos, sin catálogo editable de roles | 3, 6 | Medio — limita la posibilidad de que una empresa cliente ajuste sus propios roles sin una migración | Medio/Alto |
| 11 | Supuesto de moneda/locale único (ARS/es-AR), repetido en ~24 archivos sin punto central | 5 | Medio hoy (todos los clientes potenciales identificados en `FASEII_MERCADO_Y_POSICIONAMIENTO.md` son del mismo mercado argentino) — sube si se considera expansión geográfica | Medio |
| 12 | `cuit`/`cuil` como supuesto de negocio incorporado al modelo, sin validación de formato | 5 | Bajo/Medio — ya señalado como deuda general (N11), el ángulo multiempresa no lo agrava significativamente mientras el mercado siga siendo argentino | Bajo |

**Lectura de conjunto:** los hallazgos 1 y 2 no son solo los de mayor impacto individual — son, además, **prerrequisitos de los demás**. Sin el concepto de organización (1), cualquier solución a los hallazgos 4, 6, 7, 10 y 11 corre el riesgo de resolverse dos veces (una vez como si fuera "global", después otra vez "por empresa"). Sin gestión de usuarios (2), ningún cliente nuevo puede operarse sin intervención técnica directa, sin importar cuánto se resuelva el resto.

---

**Fin de la auditoría. No se propuso ninguna solución técnica, no se diseñó nada, no se implementó nada, no se abrió ningún sub-bloque — queda a la espera de revisión.**

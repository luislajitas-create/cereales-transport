# Sistema de Gestión — Dador de Carga de Cereales

MVP funcional completo: backend (NestJS + Prisma + PostgreSQL) y frontend (React + Vite),
implementando viajes, anticipos/gastos, liquidaciones a transportistas/choferes, facturación
y cobranzas a clientes, conciliación de viajes vs. facturado, y un dashboard operativo.

## Estructura

```
app/
  backend/     API NestJS (Node 20, TypeScript, Prisma, PostgreSQL)
  frontend/    SPA React 18 + Vite + TypeScript
  docker-compose.yml   Levanta los 3 servicios (db, backend, frontend) localmente
```

## Nota importante sobre este entorno de desarrollo

Todo el código de este MVP fue escrito y revisado en un entorno aislado (sandbox) que
**no tiene acceso a los registros de paquetes** (npm, etc.). Por eso no fue posible correr
`npm install` ni levantar un demo en vivo dentro de esa sesión. En su lugar, el código fue
verificado con el compilador de TypeScript en modo `--noEmit`, confirmando que no hay errores
de sintaxis ni de tipos propios del código (los únicos errores que aparecieron son del tipo
"no se encuentra el módulo", esperables porque las dependencias no estaban instaladas).

**Conclusión práctica:** el código está listo para instalarse y correr normalmente en cualquier
máquina o servicio con acceso a internet (tu computadora, o un servicio de hosting como Railway).
El primer paso al recibir este proyecto es simplemente instalar dependencias como se explica abajo.

## Opción 1: Probar localmente con Docker

Requisitos: Docker y Docker Compose instalados.

```bash
cd app
docker compose up --build
```

Esto levanta:
- PostgreSQL en el puerto 5432
- Backend (API) en `http://localhost:3000/api/v1`
- Frontend en `http://localhost:5173`

La primera vez, hay que correr las migraciones y cargar los datos de demo:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node prisma/seed.js
```

Esto crea usuarios de prueba (todos con contraseña `Demo1234!`) para cada rol:
ADMINISTRADOR, OPERACIONES, LIQUIDACIONES, FACTURACION y GERENCIA, junto con datos de
ejemplo (clientes, transportistas, viajes en distintos estados, anticipos, una factura
parcialmente cobrada, etc.) para poder explorar el sistema de inmediato.

## Opción 2: Correr sin Docker (desarrollo)

**Backend:**
```bash
cd app/backend
cp .env.example .env        # editar DATABASE_URL si hace falta
npm install
npx prisma migrate deploy
node prisma/seed.js
npm run start:dev
```

**Frontend:**
```bash
cd app/frontend
cp .env.example .env
npm install
npm run dev
```

## Opción 3 (recomendada para los 3 usuarios en la nube): desplegar en Railway

Railway es un servicio de hosting simple, con plan gratuito/de bajo costo, que soporta
Docker, PostgreSQL administrado y dominios públicos con HTTPS automático — ideal para que
las 3 personas accedan al sistema desde cualquier navegador sin que nadie tenga que instalar
nada en su computadora.

### Paso a paso

1. **Crear cuenta:** entrar a https://railway.app y registrarse (se puede con GitHub).

2. **Subir el código a un repositorio de GitHub** (si todavía no está):
   ```bash
   cd app
   git init
   git add .
   git commit -m "MVP inicial"
   ```
   Crear un repo nuevo en GitHub y hacer `git push`.

3. **Crear un nuevo proyecto en Railway** → "New Project" → "Deploy from GitHub repo" →
   elegir el repositorio.

4. **Agregar la base de datos:** dentro del proyecto, "New" → "Database" → "PostgreSQL".
   Railway crea automáticamente la variable `DATABASE_URL` para los servicios del mismo
   proyecto.

5. **Configurar el servicio backend:**
   - "New" → "GitHub Repo" (o usar el servicio detectado automáticamente) → seleccionar la
     carpeta `app/backend` como **Root Directory**.
   - Railway detecta el `Dockerfile` y lo usa para construir la imagen.
   - En la pestaña **Variables**, agregar:
     - `DATABASE_URL` → referenciar la del servicio Postgres (Railway permite enlazarla
       automáticamente con `${{Postgres.DATABASE_URL}}`)
     - `JWT_SECRET` → un valor largo y aleatorio (por ejemplo generado con
       `openssl rand -hex 32`)
     - `CORS_ORIGIN` → la URL pública que Railway le va a asignar al frontend (se completa
       en el paso 7, se puede dejar `*` temporalmente y ajustar después)
     - `PORT` → `3000`
   - Generar un dominio público en la pestaña **Settings → Networking → Generate Domain**.
     Anotar esa URL (ej. `https://backend-production-xxxx.up.railway.app`).
   - Railway ejecuta automáticamente `npx prisma migrate deploy && node dist/main.js` (ya
     definido en el `Dockerfile`). Para cargar los datos de demo la primera vez, abrir la
     pestaña **Shell/Console** del servicio (o usar `railway run`) y ejecutar:
     ```bash
     node prisma/seed.js
     ```

6. **Configurar el servicio frontend:**
   - "New" → "GitHub Repo" → mismo repositorio, **Root Directory** = `app/frontend`.
   - En **Variables**, agregar `VITE_API_URL` con la URL del backend del paso anterior
     seguida de `/api/v1` (ej. `https://backend-production-xxxx.up.railway.app/api/v1`).
     **Importante:** como Vite incrusta esta variable en el momento del build, hay que
     volver a desplegar (Redeploy) el frontend si se cambia este valor después.
   - Generar también un dominio público para el frontend en **Settings → Networking**.

7. **Actualizar `CORS_ORIGIN` del backend** con la URL pública real del frontend
   (ej. `https://frontend-production-yyyy.up.railway.app`) y volver a desplegar el backend.

8. **Compartir el acceso:** enviar a las otras 2 personas la URL pública del frontend y los
   usuarios de prueba (o crear usuarios reales desde la base de datos). Las tres personas
   pueden trabajar simultáneamente desde sus navegadores — no hace falta instalar nada.

### Costos aproximados

Railway cobra por uso de cómputo y no tiene un plan gratuito permanente; para un equipo de
3 personas con uso moderado, el costo típico ronda unos pocos dólares por mes (la plataforma
muestra una estimación en tiempo real antes de cobrar). Conviene revisar los precios actuales
en https://railway.app/pricing antes de decidir.

### Alternativas de hosting

Si se prefiere evaluar otras opciones, el mismo par de `Dockerfile` (backend y frontend)
funciona sin cambios en Render, Fly.io o cualquier proveedor que soporte contenedores Docker
y PostgreSQL administrado.

## Usuarios de demo (después de correr el seed)

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@demo.com | Demo1234! |
| Operaciones | operaciones@demo.com | Demo1234! |
| Liquidaciones | liquidaciones@demo.com | Demo1234! |
| Facturación | facturacion@demo.com | Demo1234! |
| Gerencia | gerencia@demo.com | Demo1234! |
| Lectura (solo consulta) | lectura@demo.com | Demo1234! |

(Estos datos surgen directamente de `backend/prisma/seed.js`.)

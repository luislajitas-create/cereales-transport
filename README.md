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

## Opción 2: Correr sin Docker (desarrollo local nativo)

Esta es la forma en la que se desarrolla y valida el sistema día a día (Postgres corriendo
como servicio nativo, no en contenedor). DEV-1 agregó un comando único, con verificaciones
previas (preflight) que evitan el problema histórico de "el backend no arrancó y nadie se dio
cuenta hasta que el login falló de forma rara".

### Requisitos

- Node.js 20+ y npm.
- PostgreSQL corriendo localmente y accesible en el puerto que uses en `DATABASE_URL`
  (por defecto, `localhost:5432`). Puede ser un servicio instalado nativamente o cualquier
  Postgres al que puedas conectarte desde `localhost` — lo único que importa es que
  `DATABASE_URL` apunte a `localhost` o `127.0.0.1`, nunca a una base remota.

### Primer arranque

```bash
cd backend
cp .env.example .env        # editar DATABASE_URL/JWT_SECRET si hace falta
npm install
npm run prisma:generate
npm run prisma:migrate      # aplica las migraciones (protegido: aborta si DATABASE_URL no es local)
npm run prisma:seed         # carga datos de demo (mismo guard: aborta si no es local)

cd ../frontend
cp .env.example .env        # opcional — el default ya apunta a http://localhost:3000/api/v1
npm install

cd ..
npm run dev                 # instala una única vez node no necesita nada extra: usa Node puro
```

### Arranque diario

Desde la raíz del repo:

```bash
npm run dev
```

Este comando:
1. Corre un **preflight** (PostgreSQL accesible, puertos 3000/5173 libres, variables
   obligatorias presentes, `DATABASE_URL` local, `CORS_ORIGIN` correcto). Si algo falla, no
   levanta nada y te dice exactamente qué corregir.
2. Levanta **exactamente una** instancia de backend (puerto 3000) y **exactamente una** de
   frontend (puerto 5173), con la salida de ambos prefijada (`[backend]` / `[frontend]`).
3. Espera a que el backend responda su health check y el frontend esté escuchando antes de
   avisar "listo" — nunca asume que arrancó solo porque el proceso no cortó enseguida.

Si preferís levantar cada uno por separado (por ejemplo, para reiniciar solo el backend sin
tocar Vite), seguís teniendo los comandos individuales:

```bash
npm run dev:backend     # equivalente a: cd backend && npm run start:dev
npm run dev:frontend    # equivalente a: cd frontend && npm run dev
```

Y para consultar el preflight sin levantar nada:

```bash
npm run preflight
```

### URLs

- Backend (API): `http://localhost:3000/api/v1`
- Health check: `http://localhost:3000/api/v1/health`
- Frontend: `http://localhost:5173`

El frontend local apunta explícitamente a `http://localhost:3000/api/v1` (default hardcodeado
en `frontend/src/api/client.ts`, sin depender de que exista `frontend/.env`).

### Credenciales demo locales

Después de correr `npm run prisma:seed` (ver arriba), iniciá sesión con:

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@demo.com | Demo1234! |

El resto de los roles de demo está en la tabla completa más abajo ([Usuarios de
demo](#usuarios-de-demo-después-de-correr-el-seed)) — son los mismos usuarios, la misma
contraseña, tanto en local como en cualquier otro entorno donde se haya corrido este seed.

### Cómo detener

`Ctrl+C` en la terminal donde corre `npm run dev` — detiene **el árbol completo** de ambos
procesos (backend y frontend, incluidos los subprocesos que `nest --watch` y Vite arrancan por
su cuenta). No debería quedar ningún proceso Node residual escuchando en 3000 o 5173 después.

Para confirmar el estado en cualquier momento, sin modificar nada:

```bash
npm run estado
```

### Cómo diagnosticar puertos ocupados

`npm run preflight` identifica el PID y el nombre del proceso que ocupa el puerto 3000 o 5173
si alguno ya está en uso (por ejemplo, una instancia anterior que quedó corriendo). No mata
ningún proceso automáticamente — mostrás vos mismo el mensaje y decidís si cerrarlo
(`taskkill /PID <pid> /F` en Windows) o si es una instancia legítima que ya está usando ese
puerto.

`vite.config.ts` tiene `strictPort: true`: si el 5173 está ocupado, Vite **falla** en vez de
arrancar silenciosamente en 5174/5175/etc. — así nunca terminás con instancias dispersas en
puertos distintos sin darte cuenta.

### Diferencia entre local y producción

- **Local:** `backend/.env` se carga automáticamente al arrancar (`import "dotenv/config"` es
  la primera línea de `backend/src/main.ts`) — no hace falta exportar variables a mano. Un
  script de escritura (`npm run prisma:migrate`, `npm run prisma:seed`) se niega a correr si
  `DATABASE_URL` no apunta a `localhost`/`127.0.0.1`.
- **Producción (Railway):** no existe ningún archivo `.env` en el contenedor (`.env` está en
  `.gitignore`, nunca se commitea ni se copia en el `Dockerfile`) — las variables llegan
  exclusivamente desde las que Railway inyecta en el entorno del proceso. `dotenv.config()` no
  encuentra archivo, no hace nada, y no puede pisar ninguna variable real.
- Si una variable ya está definida en el proceso (siempre el caso en producción), `.env` nunca
  la sobrescribe — `dotenv` respeta lo que ya esté en `process.env`.

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

/* eslint-disable no-console */
// DEV-1 — protección mínima y reusable: ningún script de escritura local (seed, migrate) debe
// poder correr por error contra una base que no sea la de desarrollo. Se usa desde dos lugares:
//   1. prisma/seed.js lo llama directo al principio (cubre `node prisma/seed.js`,
//      `npm run prisma:seed` y `npx prisma db seed` — cualquier forma de invocar el seed).
//   2. `preprisma:migrate` en package.json lo corre antes de `npm run prisma:migrate`.
// Fuera de esos dos casos (por ejemplo, `npx prisma migrate deploy/reset` invocado directo, sin
// pasar por los scripts de npm) esta protección no se activa — no hay forma de interceptar el
// binario de Prisma sin envolverlo, y hacerlo está fuera del alcance mínimo de DEV-1. Para
// migraciones/seed locales, usar siempre los scripts de npm (`npm run prisma:migrate`,
// `npm run prisma:seed`), documentado en el README.
//
// Nunca imprime el valor completo de DATABASE_URL (podría contener usuario/contraseña) — solo
// el host, y solo para explicar por qué se abortó.
require("dotenv").config();

function extraerHost(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

function esHostLocal(host) {
  return host === "localhost" || host === "127.0.0.1";
}

function asegurarDatabaseUrlLocal() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "[asegurar-db-local] DATABASE_URL no está definida. Abortado — no se ejecuta ningún script de escritura sin saber contra qué base apunta.",
    );
    process.exit(1);
  }

  const host = extraerHost(databaseUrl);
  if (!esHostLocal(host)) {
    console.error(
      `[asegurar-db-local] DATABASE_URL apunta a un host no local ("${host ?? "no se pudo determinar"}"). ` +
        "Este script está pensado únicamente para desarrollo local — abortado para evitar escribir " +
        "accidentalmente sobre una base que podría ser de producción.",
    );
    process.exit(1);
  }

  console.log(`[asegurar-db-local] OK — DATABASE_URL apunta a "${host}" (local).`);
}

if (require.main === module) {
  asegurarDatabaseUrlLocal();
}

module.exports = { asegurarDatabaseUrlLocal, extraerHost, esHostLocal };

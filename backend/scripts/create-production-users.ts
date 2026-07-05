/* eslint-disable no-console */
import { PrismaClient, RolNombre } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

interface RoleConfig {
  rol: RolNombre;
  envPrefix: string;
}

// Por cada rol se busca PROD_<PREFIJO>_EMAIL / _PASSWORD / _NOMBRE en las variables
// de entorno. Si no están definidas, ese rol se omite (no todos los roles son
// obligatorios). Las contraseñas nunca se hardcodean ni se documentan en el repo.
const ROLES: RoleConfig[] = [
  { rol: "ADMINISTRADOR", envPrefix: "PROD_ADMIN" },
  { rol: "GERENCIA", envPrefix: "PROD_GERENCIA" },
  { rol: "OPERACIONES", envPrefix: "PROD_OPERACIONES" },
  { rol: "LIQUIDACIONES", envPrefix: "PROD_LIQUIDACIONES" },
  { rol: "FACTURACION", envPrefix: "PROD_FACTURACION" },
  { rol: "LECTURA", envPrefix: "PROD_LECTURA" },
];

async function main() {
  let creados = 0;
  let omitidosPorEnv = 0;
  let omitidosPorExistente = 0;

  for (const { rol, envPrefix } of ROLES) {
    const email = process.env[`${envPrefix}_EMAIL`];
    const password = process.env[`${envPrefix}_PASSWORD`];
    const nombre = process.env[`${envPrefix}_NOMBRE`] || rol;

    if (!email || !password) {
      console.log(`[${rol}] Faltan ${envPrefix}_EMAIL y/o ${envPrefix}_PASSWORD, se omite.`);
      omitidosPorEnv++;
      continue;
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      console.log(`[${rol}] El usuario ${email} ya existe (id ${existente.id}), no se modifica.`);
      omitidosPorExistente++;
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const creado = await prisma.usuario.create({
      data: { nombre, email, passwordHash, rol },
    });
    console.log(`[${rol}] Usuario creado: ${creado.email} (id ${creado.id}).`);
    creados++;
  }

  console.log(
    `Listo. Creados: ${creados}. Ya existentes (sin cambios): ${omitidosPorExistente}. Roles sin variables definidas: ${omitidosPorEnv}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

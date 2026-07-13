import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { esModeloOrganizacional } from "./organizacional-models";
import { obtenerOrganizacionIdActual } from "./organizacion-context";

// Mecanismo único de aislamiento por organización (Bloque 8.1.d). Base arquitectónica: spike
// técnico aprobado — Prisma Client Extensions cubre de forma segura y verificada las 14
// operaciones de primer nivel de abajo (findMany, findFirst, findUnique, findUniqueOrThrow,
// count, aggregate, groupBy, create, createMany, update, updateMany, upsert, delete,
// deleteMany). El spike confirmó que las Extensions NO interceptan escrituras anidadas
// (nested create, connect, connectOrCreate, disconnect, set) ni accesos $queryRaw*/$executeRaw*
// — por eso esta capa rechaza explícitamente cualquier escritura anidada sobre un modelo
// organizacional en vez de dejarla pasar sin protección (falla segura), y el cliente scopeado
// no expone $queryRaw/$queryRawUnsafe/$executeRaw/$executeRawUnsafe en su tipo público.
//
// Refinación arquitectónica (revisión aprobada): el cliente ya no recibe organizacionId por
// closure ni depende de un Provider request-scoped — es un singleton construido una sola vez
// al arrancar la app. Cada handler lee el contexto organizacional desde AsyncLocalStorage
// (organizacion-context.ts) en el momento exacto en que se ejecuta cada query, nunca antes.
//
// `args`/`query` se tipan `any` deliberadamente: $allModels es, por diseño de Prisma, una
// unión de los WhereInput/CreateInput/etc. de los 20 modelos — no hay forma de tipar esto de
// forma genérica y a la vez estricta por modelo. La seguridad de tipos para quien consume el
// cliente scopeado vive en `OrganizacionPrismaClient` al final del archivo, no acá adentro.

type ArgsExtension = { model: string; args: any; query: (args: any) => Promise<any> };

const CLAVES_ESCRITURA_ANIDADA = ["connect", "connectOrCreate", "disconnect", "set"] as const;

function contieneEscrituraAnidadaNoSoportada(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const valores = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
  return valores.some((valor) => {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
    return CLAVES_ESCRITURA_ANIDADA.some((clave) => clave in (valor as Record<string, unknown>));
  });
}

function asegurarSinEscrituraAnidada(data: unknown, operacion: string) {
  if (contieneEscrituraAnidadaNoSoportada(data)) {
    throw new Error(
      `[aislamiento] "${operacion}" intenta una escritura anidada (connect/connectOrCreate/` +
        `disconnect/set) sobre un modelo organizacional. El mecanismo de 8.1.d todavía no la ` +
        `protege (ver spike técnico) — usar IDs escalares directos hasta que exista el helper ` +
        `centralizado de escrituras anidadas.`,
    );
  }
}

export function crearClienteOrganizacional(prisma: PrismaService) {
  return prisma.$extends({
    name: "organizacion-scope",
    query: {
      $allModels: {
        async findMany({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async findFirst({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async count({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async aggregate({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async groupBy({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async findUnique({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          const argsConOrg = { ...args };
          let quitarOrganizacionId = false;
          if (argsConOrg.select && !argsConOrg.select.organizacionId) {
            argsConOrg.select = { ...argsConOrg.select, organizacionId: true };
            quitarOrganizacionId = true;
          }
          const resultado = await query(argsConOrg);
          if (!resultado) return resultado;
          if (resultado.organizacionId !== organizacionId) return null;
          if (quitarOrganizacionId) delete resultado.organizacionId;
          return resultado;
        },
        async findUniqueOrThrow({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          const argsConOrg = { ...args };
          let quitarOrganizacionId = false;
          if (argsConOrg.select && !argsConOrg.select.organizacionId) {
            argsConOrg.select = { ...argsConOrg.select, organizacionId: true };
            quitarOrganizacionId = true;
          }
          const resultado = await query(argsConOrg);
          if (resultado.organizacionId !== organizacionId) {
            throw new Prisma.PrismaClientKnownRequestError("No record found", {
              code: "P2025",
              clientVersion: Prisma.prismaVersion.client,
            });
          }
          if (quitarOrganizacionId) delete resultado.organizacionId;
          return resultado;
        },
        async create({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          asegurarSinEscrituraAnidada(args.data, `${model}.create`);
          args.data = { ...args.data, organizacionId };
          return query(args);
        },
        async createMany({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          if (Array.isArray(args.data)) {
            args.data.forEach((d: unknown) => asegurarSinEscrituraAnidada(d, `${model}.createMany`));
            args.data = args.data.map((d: any) => ({ ...d, organizacionId }));
          }
          return query(args);
        },
        async update({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          asegurarSinEscrituraAnidada(args.data, `${model}.update`);
          args.where = { ...args.where, organizacionId };
          return query(args);
        },
        async updateMany({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
        async upsert({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          asegurarSinEscrituraAnidada(args.create, `${model}.upsert (create)`);
          asegurarSinEscrituraAnidada(args.update, `${model}.upsert (update)`);
          args.where = { ...args.where, organizacionId };
          args.create = { ...args.create, organizacionId };
          return query(args);
        },
        async delete({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { ...args.where, organizacionId };
          return query(args);
        },
        async deleteMany({ model, args, query }: ArgsExtension) {
          if (!esModeloOrganizacional(model)) return query(args);
          const organizacionId = obtenerOrganizacionIdActual();
          args.where = { AND: [args.where ?? {}, { organizacionId }] };
          return query(args);
        },
      },
    },
  });
}

export type OrganizacionPrismaClient = Omit<
  ReturnType<typeof crearClienteOrganizacional>,
  "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe"
>;

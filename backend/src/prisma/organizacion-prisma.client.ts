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

type NombrePropiedadModeloOrganizacional =
  | "usuario" | "cliente" | "contacto" | "productor" | "transportista" | "chofer" | "vehiculo"
  | "cereal" | "ubicacion" | "tipoGasto" | "viaje" | "historialEstadoViaje" | "anticipoGasto"
  | "liquidacion" | "liquidacionViaje" | "liquidacionMovimiento" | "factura" | "facturaViaje"
  | "cobranza" | "auditLog" | "passwordResetToken";

type MetodosDeLecturaSinCambios<T> = Pick<
  T,
  Extract<keyof T, "findMany" | "findFirst" | "findUnique" | "findUniqueOrThrow" | "count" | "aggregate" | "groupBy">
>;

// Las escrituras (create/createMany/update/updateMany/upsert/delete/deleteMany) inyectan
// organizacionId automáticamente en runtime (ver arriba) — pero los tipos que genera Prisma
// para estos métodos no lo reflejan, porque las Query Extensions no alteran los tipos de
// argumentos ni de retorno (documentado por Prisma: "query extensions do not affect types").
// Tipar estos 7 métodos `any` es la única forma honesta de reflejar en TypeScript algo que ya
// es cierto en runtime, sin tocar ningún controller ni relajar la seguridad de tipos de las
// lecturas (que sí mantienen su tipado completo).
type MetodosDeEscrituraFlexibles = {
  create: (args: any) => Promise<any>;
  createMany: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  updateMany: (args: any) => Promise<any>;
  upsert: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
  deleteMany: (args: any) => Promise<any>;
};

type DelegadoOrganizacional<T> = MetodosDeLecturaSinCambios<T> & MetodosDeEscrituraFlexibles;

type ClienteExtendidoBase = ReturnType<typeof crearClienteOrganizacional>;

type BaseConLecturaYEscrituraFlexible = Omit<
  ClienteExtendidoBase,
  | "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe"
  | "$transaction"
  | NombrePropiedadModeloOrganizacional
> & {
  [K in NombrePropiedadModeloOrganizacional]: DelegadoOrganizacional<ClienteExtendidoBase[K]>;
};

// Cliente de transacción (tx): dos usos preexistentes en facturas.controller.ts (anteriores a
// Bloque 8) hacen `tx.$queryRaw\`SELECT id FROM "Factura" WHERE id = ... FOR UPDATE\`` para
// bloquear la fila durante la transacción — no se toca ese controller en este sub-bloque, así
// que $queryRaw (la forma parametrizada segura, no $queryRawUnsafe) se restaura únicamente acá,
// solo para tx. El cliente de nivel superior (OrganizacionPrismaClient, lo que reciben los
// controllers por DI) sigue sin exponer ningún acceso raw.
type ClienteTransaccion = BaseConLecturaYEscrituraFlexible & {
  $queryRaw: ClienteExtendidoBase["$queryRaw"];
};

// $transaction(async (tx) => {...}) — la forma interactiva, la única que usa el código real
// (confirmado: los 7 usos existentes en facturas.controller.ts/liquidaciones.controller.ts son
// todos callback, no la forma array). Prisma tipa `tx` de forma independiente a partir de su
// propia firma de $transaction, sin heredar el ajuste de arriba — por eso se redeclara acá.
// tx tiene exactamente las mismas garantías de aislamiento que el cliente de nivel superior
// (ver spike técnico: la extensión se propaga dentro de $transaction), más $queryRaw por el
// motivo de arriba.
export type OrganizacionPrismaClient = BaseConLecturaYEscrituraFlexible & {
  $transaction<R>(
    fn: (tx: ClienteTransaccion) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: unknown },
  ): Promise<R>;
};

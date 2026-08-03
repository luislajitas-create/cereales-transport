// Bloque 11, H-02 (V2 enmendada) — cobertura de bloquearMetodosRawDeNivelSuperior():
// bloqueo de los 4 métodos raw de nivel superior, protección de __proto__ (lectura, escritura
// directa, Object/Reflect.setPrototypeOf, y el setter heredado invocado vía .call), protección
// de "constructor" (Estrategia C: devuelve el Object global — ver
// REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md, VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md,
// ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md), y no-regresión de la funcionalidad legítima
// (queries, $transaction en sus dos formas, tx.$queryRaw/$executeRaw).
//
// Los vectores de "constructor" y "__proto__ =" reproducen contra PrismaService real
// (no PrismaClient directo) — es la única forma que reprodujo el bypass original
// (INVESTIGACION_DISCREPANCIA_CONSTRUCTOR_PROTOTYPE.md): PrismaClient directo se usa acá
// únicamente como control metodológico secundario, nunca como evidencia principal.
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { crearClienteOrganizacional } from "./organizacion-prisma.client";
import { organizacionContextStorage } from "./organizacion-context";

const METODOS_RAW = ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"] as const;

describe("Bloque 11, H-02 (V2 enmendada) — organizacion-prisma.client", () => {
  let prismaService: PrismaService;
  let clientePrismaService: ReturnType<typeof crearClienteOrganizacional>;
  let organizacionIdReal: string;

  beforeAll(async () => {
    prismaService = new PrismaService();
    await prismaService.$connect();
    clientePrismaService = crearClienteOrganizacional(prismaService);

    const usuarioExistente = await prismaService.usuario.findFirst({ select: { organizacionId: true } });
    if (!usuarioExistente) {
      throw new Error("Se requiere al menos un Usuario existente en la base local para esta suite (ver seed).");
    }
    organizacionIdReal = usuarioExistente.organizacionId;
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  function conContexto<T>(fn: () => Promise<T> | T): Promise<T> | T {
    return organizacionContextStorage.run({ organizacionId: organizacionIdReal }, fn);
  }

  // ── A. Métodos raw directos (instancia real: PrismaService) ──────────────────────────────
  describe("A. Métodos raw directos (PrismaService real)", () => {
    it.each(METODOS_RAW)('bloquea la lectura de "%s"', (metodo) => {
      expect(() => (clientePrismaService as any)[metodo]).toThrow(/no está disponible/);
    });
  });

  // ── B. Lectura de prototipo (PrismaService real) ──────────────────────────────────────────
  describe("B. Lectura de prototipo (PrismaService real)", () => {
    it("Object.getPrototypeOf(cliente) === Object.prototype", () => {
      expect(Object.getPrototypeOf(clientePrismaService)).toBe(Object.prototype);
    });

    it("Reflect.getPrototypeOf(cliente) === Object.prototype", () => {
      expect(Reflect.getPrototypeOf(clientePrismaService)).toBe(Object.prototype);
    });

    it("cliente.__proto__ === Object.prototype", () => {
      expect((clientePrismaService as any).__proto__).toBe(Object.prototype);
    });
  });

  // ── C. Escritura de prototipo (PrismaService real) ────────────────────────────────────────
  describe("C. Escritura de prototipo (PrismaService real)", () => {
    it("Object.setPrototypeOf(cliente, x) lanza", () => {
      expect(() => Object.setPrototypeOf(clientePrismaService, {})).toThrow(/no está permitido modificar el prototipo/);
    });

    it("Reflect.setPrototypeOf(cliente, x) lanza", () => {
      expect(() => Reflect.setPrototypeOf(clientePrismaService, {})).toThrow(/no está permitido modificar el prototipo/);
    });

    it("cliente.__proto__ = x lanza", () => {
      expect(() => {
        (clientePrismaService as any).__proto__ = {};
      }).toThrow(/no está permitido reasignar "__proto__"/);
    });

    it('Reflect.set(cliente, "__proto__", x) lanza', () => {
      expect(() => Reflect.set(clientePrismaService as object, "__proto__", {})).toThrow(
        /no está permitido reasignar "__proto__"/,
      );
    });

    it("el setter heredado de __proto__ invocado mediante .call(cliente, x) lanza", () => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__");
      expect(descriptor?.set).toBeDefined();
      expect(() => descriptor!.set!.call(clientePrismaService, {})).toThrow(/no está permitido modificar el prototipo/);
    });
  });

  // ── D. Constructor (PrismaService real) ───────────────────────────────────────────────────
  describe("D. Constructor (PrismaService real)", () => {
    it("cliente.constructor === Object", () => {
      expect((clientePrismaService as any).constructor).toBe(Object);
    });

    it('Reflect.get(cliente, "constructor") === Object', () => {
      expect(Reflect.get(clientePrismaService as object, "constructor")).toBe(Object);
    });

    it("identidad estable entre lecturas sucesivas", () => {
      expect((clientePrismaService as any).constructor).toBe((clientePrismaService as any).constructor);
    });

    it("cliente.constructor !== PrismaService", () => {
      expect((clientePrismaService as any).constructor).not.toBe(PrismaService);
    });

    it("cliente.constructor !== PrismaClient", () => {
      expect((clientePrismaService as any).constructor).not.toBe(PrismaClient);
    });

    it("cliente.constructor.prototype === Object.prototype", () => {
      expect((clientePrismaService as any).constructor.prototype).toBe(Object.prototype);
    });

    it.each(METODOS_RAW)('cliente.constructor.prototype.%s no existe', (metodo) => {
      expect((clientePrismaService as any).constructor.prototype[metodo]).toBeUndefined();
    });

    it("Object.getPrototypeOf(cliente.constructor) === Function.prototype", () => {
      expect(Object.getPrototypeOf((clientePrismaService as any).constructor)).toBe(Function.prototype);
    });

    it("cliente.constructor.__proto__ === Function.prototype", () => {
      expect((clientePrismaService as any).constructor.__proto__).toBe(Function.prototype);
    });

    it("cliente.constructor.constructor === Function (fuera de alcance de H-02, documentado)", () => {
      expect((clientePrismaService as any).constructor.constructor).toBe(Function);
    });

    it("no se puede reconstruir PrismaClient.prototype por ningún camino derivado de cliente.constructor", () => {
      const ctor = (clientePrismaService as any).constructor;
      expect(ctor).not.toBe(PrismaService);
      expect(ctor).not.toBe(PrismaClient);
      expect(ctor.prototype).not.toBe(PrismaService.prototype);
      expect(ctor.prototype).not.toBe(PrismaClient.prototype);
      expect(Object.getPrototypeOf(ctor)).not.toBe(PrismaClient);
      expect(ctor.__proto__).not.toBe(PrismaClient);
    });
  });

  // ── D-control. Mismos vectores contra PrismaClient directo (control metodológico) ─────────
  // No se usa como evidencia principal de seguridad — únicamente para dejar constancia de
  // que, incluso sin la subclase PrismaService, la defensa funciona igual (consecuencia
  // esperada: el retorno de "constructor" es un valor fijo, no depende de qué clase envuelve).
  describe("D-control. Constructor (PrismaClient directo — control metodológico, no evidencia principal)", () => {
    let prismaClienteDirecto: PrismaClient;
    let clienteDirecto: ReturnType<typeof crearClienteOrganizacional>;

    beforeAll(() => {
      prismaClienteDirecto = new PrismaClient();
      clienteDirecto = crearClienteOrganizacional(prismaClienteDirecto as unknown as PrismaService);
    });

    afterAll(async () => {
      await prismaClienteDirecto.$disconnect();
    });

    it("cliente.constructor === Object (instanciando PrismaClient directo)", () => {
      expect((clienteDirecto as any).constructor).toBe(Object);
    });
  });

  // ── E. Funcionalidad legítima (PrismaService real, DB local) ──────────────────────────────
  describe("E. Funcionalidad legítima (PrismaService real)", () => {
    it("un método normal de Prisma sigue funcionando (findMany)", async () => {
      await conContexto(async () => {
        const usuarios = await clientePrismaService.usuario.findMany({ take: 1 });
        expect(Array.isArray(usuarios)).toBe(true);
      });
    });

    it("una query legítima respeta el scope organizacional (count)", async () => {
      await conContexto(async () => {
        const cantidad = await clientePrismaService.usuario.count();
        expect(typeof cantidad).toBe("number");
      });
    });

    it("$transaction(callback) sigue funcionando", async () => {
      await conContexto(async () => {
        const resultado = await clientePrismaService.$transaction(async (tx) => {
          return tx.usuario.count();
        });
        expect(typeof resultado).toBe("number");
      });
    });

    it("$transaction(array) sigue funcionando", async () => {
      await conContexto(async () => {
        const [cantidad] = await clientePrismaService.$transaction([clientePrismaService.usuario.count()]);
        expect(typeof cantidad).toBe("number");
      });
    });

    it("tx.$queryRaw está permitido dentro de $transaction", async () => {
      await conContexto(async () => {
        const resultado = await clientePrismaService.$transaction(async (tx: any) => {
          return tx.$queryRaw`SELECT 1 AS uno`;
        });
        expect(resultado).toEqual([{ uno: 1 }]);
      });
    });

    it("tx.$executeRaw está permitido dentro de $transaction", async () => {
      await conContexto(async () => {
        const resultado = await clientePrismaService.$transaction(async (tx: any) => {
          return tx.$executeRaw`SELECT 1`;
        });
        expect(typeof resultado).toBe("number");
      });
    });
  });

  // ── F. Integridad (después de haber ejecutado todos los vectores adversariales A-D) ───────
  describe("F. Integridad de target, prototipos reales y globales", () => {
    it("PrismaService.prototype sigue teniendo los métodos raw reales (no fue modificado)", () => {
      expect(typeof PrismaService.prototype.$queryRaw).toBe("function");
      expect(typeof PrismaService.prototype.$executeRaw).toBe("function");
    });

    it("PrismaClient.prototype sigue teniendo los métodos raw reales (no fue modificado)", () => {
      expect(typeof PrismaClient.prototype.$queryRaw).toBe("function");
      expect(typeof PrismaClient.prototype.$executeRaw).toBe("function");
    });

    it("el prototipo real de la instancia prismaService sigue intacto", () => {
      expect(typeof Object.getPrototypeOf(prismaService).$queryRaw).toBe("function");
    });

    it("el objeto real (target) sigue siendo funcionalmente idéntico (sin propiedades inyectadas)", () => {
      expect((prismaService as any).__constructorHijackTest).toBeUndefined();
      expect((prismaService as any).__protoHijackTest).toBeUndefined();
    });

    it("Object global sigue intacto", () => {
      expect(typeof Object.keys).toBe("function");
      expect(typeof Object.assign).toBe("function");
    });

    it("Object.prototype sigue intacto, sin propiedades ajenas inyectadas", () => {
      expect(typeof Object.prototype.hasOwnProperty).toBe("function");
      expect(typeof Object.prototype.toString).toBe("function");
      expect(("$queryRaw" in Object.prototype)).toBe(false);
    });

    it("Function.prototype sigue intacto", () => {
      expect(typeof Function.prototype.call).toBe("function");
      expect(typeof Function.prototype.apply).toBe("function");
      expect(typeof Function.prototype.bind).toBe("function");
    });
  });

  // ── G. Aislamiento cruzado de organización — auditLog.groupBy (FAC-4) ─────────────────────
  // A diferencia de las secciones anteriores (que prueban que la extensión sigue funcionando),
  // esto prueba específicamente que groupBy() AÍSLA datos reales entre dos organizaciones
  // distintas — necesario para el nuevo GET /organizacion/auditoria/opciones (FAC-4), que arma
  // sus listas de Entidad/Acción sin agregar ningún where manual, confiando por completo en esta
  // extensión. Usa DB local real (mismo criterio que el resto del archivo); crea sus propias
  // Organizacion/AuditLog temporales y las borra en afterAll — no toca datos preexistentes.
  describe("G. Aislamiento cruzado de organización — auditLog.groupBy (FAC-4)", () => {
    let orgA: { id: string };
    let orgB: { id: string };

    beforeAll(async () => {
      orgA = await prismaService.organizacion.create({ data: { nombre: "FAC-4 test aislamiento — org A (temporal)" } });
      orgB = await prismaService.organizacion.create({ data: { nombre: "FAC-4 test aislamiento — org B (temporal)" } });
      await prismaService.auditLog.create({
        data: { organizacionId: orgA.id, entidad: "FAC4EntidadSoloDeA", entidadId: orgA.id, accion: "fac4_accion_solo_de_a" },
      });
      await prismaService.auditLog.create({
        data: { organizacionId: orgB.id, entidad: "FAC4EntidadSoloDeB", entidadId: orgB.id, accion: "fac4_accion_solo_de_b" },
      });
    });

    afterAll(async () => {
      await prismaService.auditLog.deleteMany({ where: { organizacionId: { in: [orgA.id, orgB.id] } } });
      await prismaService.organizacion.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    });

    it("groupBy por entidad, en el contexto de orgA, no incluye la entidad exclusiva de orgB", async () => {
      // El callback de organizacionContextStorage.run() debe ser async y AWAITEAR la query
      // adentro (mismo criterio que conContexto() más arriba en este archivo) — Prisma devuelve
      // una PrismaPromise diferida; si el callback la retorna sin awaitear, el then() real (y
      // con él, la lectura de obtenerOrganizacionIdActual() dentro de la extensión) se ejecuta
      // después de que run() ya cerró el contexto, y falla con "Sin contexto de organización".
      const resultado = await organizacionContextStorage.run({ organizacionId: orgA.id }, async () => {
        return await clientePrismaService.auditLog.groupBy({ by: ["entidad"] });
      });
      const entidades = resultado.map((r: any) => r.entidad);
      expect(entidades).toContain("FAC4EntidadSoloDeA");
      expect(entidades).not.toContain("FAC4EntidadSoloDeB");
    });

    it("groupBy por accion, en el contexto de orgB, no incluye la acción exclusiva de orgA", async () => {
      const resultado = await organizacionContextStorage.run({ organizacionId: orgB.id }, async () => {
        return await clientePrismaService.auditLog.groupBy({ by: ["accion"] });
      });
      const acciones = resultado.map((r: any) => r.accion);
      expect(acciones).toContain("fac4_accion_solo_de_b");
      expect(acciones).not.toContain("fac4_accion_solo_de_a");
    });
  });
});

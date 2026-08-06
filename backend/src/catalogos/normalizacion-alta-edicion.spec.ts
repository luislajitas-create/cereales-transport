import { Prisma } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { ClientesController } from "./clientes.controller";
import { TransportistasController } from "./transportistas.controller";
import { ChoferesController } from "./choferes.controller";
import { VehiculosController } from "./vehiculos.controller";
import { CreateClienteDto } from "./dto/create-cliente.dto";
import { UpdateClienteDto } from "./dto/update-cliente.dto";
import { CreateTransportistaDto } from "./dto/create-transportista.dto";
import { UpdateTransportistaDto } from "./dto/update-transportista.dto";
import { CreateChoferDto } from "./dto/create-chofer.dto";
import { UpdateChoferDto } from "./dto/update-chofer.dto";
import { CreateVehiculoDto } from "./dto/create-vehiculo.dto";
import { UpdateVehiculoDto } from "./dto/update-vehiculo.dto";

// CAT-3: cubre el alta y la edición individual (create()/update() de los cuatro controllers) —
// a diferencia de CAT-2 (Choferes/Vehículos), estos endpoints no tienen ninguna lógica propia de
// duplicados: pasan el DTO ya normalizado directamente a Prisma y dejan que la restricción real
// de la base (@@unique([organizacionId, campo])) decida, con el mismo criterio en los cuatro
// (P2002 -> PrismaExceptionFilter, ya probado por separado y reutilizado en mensajeErrorImportacion
// — no se reimplementa acá). Por eso esta suite tiene dos partes:
//   1. DTO: prueba que @Transform(siPresente(normalizarX)) deja el valor canónico ANTES de validar.
//   2. Controller + Prisma fake: simula la restricción única real (incluida la semántica de
//      Postgres de que un UPDATE nunca colisiona con su propio valor anterior) para probar que
//      "guarda normalizado / rechaza duplicado con formato distinto / no colisiona consigo misma
//      en edición / sí rechaza colisión con otro registro / aísla por organización" son ciertos
//      de punta a punta, sin necesitar una base real.
//
// CAT-4: create()/update() ahora corren dentro de $transaction(async (tx) => {...}) (mutación +
// AuditLog atómicos) — el fake de abajo expone un `tx` con findUnique/create/update/auditLog.create
// y un $transaction que simplemente invoca el callback con ese `tx`, mismo criterio que
// facturas.controller.registrar-cobranza.spec.ts (FAC-4).

const ACTOR = { id: "user-1" };

describe("CAT-3 — DTO: normalización antes de validar y persistir", () => {
  it("CreateClienteDto normaliza cuit con guiones y valida OK", async () => {
    const dto = plainToInstance(CreateClienteDto, { razonSocial: "Cliente X", cuit: "30-11111111-1" });
    expect(dto.cuit).toBe("30111111111");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("UpdateClienteDto: un PATCH que no envía cuit lo deja undefined (Prisma no lo toca)", () => {
    const dto = plainToInstance(UpdateClienteDto, { condicionesComerciales: "Nuevo" });
    expect(dto.cuit).toBeUndefined();
  });

  it("CreateTransportistaDto normaliza cuit con puntos y espacios", async () => {
    const dto = plainToInstance(CreateTransportistaDto, { razonSocial: "Transp X", cuit: " 30.111.111.11 1 " });
    expect(dto.cuit).toBe("30111111111");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("CreateChoferDto normaliza cuil y dni, y un dni vacío normaliza a undefined (nunca cadena vacía)", async () => {
    const dto = plainToInstance(CreateChoferDto, {
      transportistaId: "t1",
      nombre: "Juan",
      cuil: "20-30123456-4",
      dni: "",
    });
    expect(dto.cuil).toBe("20301234564");
    expect(dto.dni).toBeUndefined();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("UpdateChoferDto: un PATCH que no envía dni ni cuil los deja undefined (Prisma no los toca)", () => {
    const dto = plainToInstance(UpdateChoferDto, { comisionPct: 5 });
    expect(dto.dni).toBeUndefined();
    expect(dto.cuil).toBeUndefined();
  });

  // CAT-3: decisión explícita para la edición de DNI — "el campo no vino" (undefined) y "el campo
  // vino vacío" (intención de borrarlo) son dos cosas distintas, y Prisma las trata distinto
  // (undefined = no tocar, null = limpiar). Antes de esto, un dni vacío en un PATCH normalizaba a
  // undefined igual que "no vino", así que la API respondía 200 sin haber aplicado el borrado
  // pedido — ver normalizarDniEdicion() en common/normalizacion.ts.
  it("UpdateChoferDto: un PATCH con dni vacío (\"\") es una intención explícita de borrarlo -> normaliza a null, no a undefined", async () => {
    const dto = plainToInstance(UpdateChoferDto, { dni: "" });
    expect(dto.dni).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("UpdateChoferDto: un PATCH con dni compuesto solo por separadores también normaliza a null", async () => {
    const dto = plainToInstance(UpdateChoferDto, { dni: " . - " });
    expect(dto.dni).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("UpdateChoferDto: un PATCH con un dni real lo normaliza igual que en el resto de CAT-3", async () => {
    const dto = plainToInstance(UpdateChoferDto, { dni: "30.111.222" });
    expect(dto.dni).toBe("30111222");
  });

  it("CreateVehiculoDto normaliza patente en minúsculas y con guiones a mayúsculas sin separadores", async () => {
    const dto = plainToInstance(CreateVehiculoDto, { transportistaId: "t1", patente: "ab-123-cd", tipo: "CAMION" });
    expect(dto.patente).toBe("AB123CD");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("UpdateVehiculoDto: un PATCH que no envía patente la deja undefined (Prisma no la toca)", () => {
    const dto = plainToInstance(UpdateVehiculoDto, { capacidadKg: 1000 });
    expect(dto.patente).toBeUndefined();
  });
});

// Simula @@unique([organizacionId, campo]) tal como lo aplicaría Postgres: create()/update()
// rechazan con el mismo error P2002 que dispara la base real si, DESPUÉS del cambio, otra fila
// de la misma organización terminara con el mismo valor. update() excluye la propia fila de la
// comparación — un UPDATE que deja el campo en su propio valor actual nunca colisiona consigo
// mismo, exactamente como en SQL real. findUnique/auditLog.create se agregan para CAT-4 (el
// update() real hace un findUnique antes del update, para poder armar el "antes" del AuditLog).
function crearAlmacenConRestriccionUnica(campo: string) {
  const filas: Record<string, any>[] = [];
  let contador = 0;

  function lanzarSiColisiona(idPropio: string | null, organizacionId: string, valor: string) {
    const colision = filas.find((f) => f.id !== idPropio && f.organizacionId === organizacionId && f[campo] === valor);
    if (colision) {
      throw new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${campo}\`)`, {
        code: "P2002",
        clientVersion: "5.0.0",
        meta: { target: [campo] },
      });
    }
  }

  // async a propósito: si lanzarSiColisiona() tira el P2002, una función async lo convierte en
  // una Promise rechazada (mismo contrato que el cliente real de Prisma, que siempre devuelve
  // una Promise) — una función sync tiraría el error de forma síncrona, rompiendo `await
  // expect(...).rejects...` en los tests.
  const create = jest.fn(async ({ data }: { data: Record<string, any> }) => {
    lanzarSiColisiona(null, data.organizacionId, data[campo]);
    contador++;
    const nueva = { id: `id-${contador}`, activo: true, ...data };
    filas.push(nueva);
    return nueva;
  });

  const update = jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
    const existente = filas.find((f) => f.id === where.id);
    if (!existente) throw new Error("fila no encontrada (fixture de test)");
    const valorFinal = data[campo] !== undefined ? data[campo] : existente[campo];
    lanzarSiColisiona(existente.id, existente.organizacionId, valorFinal);
    Object.assign(existente, data);
    return { ...existente };
  });

  const findUnique = jest.fn(async ({ where }: { where: { id: string } }) => {
    const existente = filas.find((f) => f.id === where.id);
    return existente ? { ...existente } : null;
  });

  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };

  return { filas, create, update, findUnique, auditLog };
}

function crearPrismaConTx(almacen: ReturnType<typeof crearAlmacenConRestriccionUnica>, modelo: string) {
  const tx: Record<string, any> = {
    [modelo]: { create: almacen.create, update: almacen.update, findUnique: almacen.findUnique },
    auditLog: almacen.auditLog,
  };
  return { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
}

describe("CAT-3 — Cliente: alta/edición individual con normalización + restricción única real", () => {
  function crearControlador() {
    const almacen = crearAlmacenConRestriccionUnica("cuit");
    const prisma = crearPrismaConTx(almacen, "cliente");
    return { controller: new ClientesController(prisma), almacen };
  }

  it("guarda el CUIT normalizado", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(
      plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any),
      ACTOR,
    );
    expect(almacen.filas[0].cuit).toBe("30111111111");
  });

  it("rechaza un duplicado escrito con formato diferente al ya guardado", async () => {
    const { controller } = crearControlador();
    await controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "Y", cuit: "30.111.111.111" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("en edición, el propio registro no colisiona consigo mismo aunque se reenvíe en otro formato", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any), ACTOR);
    const id = almacen.filas[0].id;
    await expect(
      controller.update(id, plainToInstance(UpdateClienteDto, { cuit: "30.111.111.111" } as any), ACTOR),
    ).resolves.toBeDefined();
    expect(almacen.filas[0].cuit).toBe("30111111111");
  });

  it("en edición, sí rechaza colisión con otro registro de la misma organización", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "A", cuit: "30-11111111-1" } as any), ACTOR);
    await controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "B", cuit: "30-22222222-2" } as any), ACTOR);
    const idB = almacen.filas[1].id;
    await expect(
      controller.update(idB, plainToInstance(UpdateClienteDto, { cuit: "30-11111111-1" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("el mismo CUIT normalizado es válido en dos organizaciones distintas (aislamiento preservado)", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-1", razonSocial: "A", cuit: "30-11111111-1" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateClienteDto, { organizacionId: "org-2", razonSocial: "A en otra org", cuit: "30-11111111-1" } as any), ACTOR),
    ).resolves.toBeDefined();
    expect(almacen.filas).toHaveLength(2);
  });
});

describe("CAT-3 — Transportista: alta/edición individual con normalización + restricción única real", () => {
  function crearControlador() {
    const almacen = crearAlmacenConRestriccionUnica("cuit");
    const prisma = crearPrismaConTx(almacen, "transportista");
    return { controller: new TransportistasController(prisma), almacen };
  }

  it("guarda el CUIT normalizado", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any), ACTOR);
    expect(almacen.filas[0].cuit).toBe("30111111111");
  });

  it("rechaza un duplicado escrito con formato diferente al ya guardado", async () => {
    const { controller } = crearControlador();
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "Y", cuit: "30.111.111.111" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("en edición, el propio registro no colisiona consigo mismo aunque se reenvíe en otro formato", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "X", cuit: "30-11111111-1" } as any), ACTOR);
    const id = almacen.filas[0].id;
    await expect(
      controller.update(id, plainToInstance(UpdateTransportistaDto, { cuit: "30.111.111.111" } as any), ACTOR),
    ).resolves.toBeDefined();
  });

  it("en edición, sí rechaza colisión con otro registro de la misma organización", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "A", cuit: "30-11111111-1" } as any), ACTOR);
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "B", cuit: "30-22222222-2" } as any), ACTOR);
    const idB = almacen.filas[1].id;
    await expect(
      controller.update(idB, plainToInstance(UpdateTransportistaDto, { cuit: "30-11111111-1" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("el mismo CUIT normalizado es válido en dos organizaciones distintas (aislamiento preservado)", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-1", razonSocial: "A", cuit: "30-11111111-1" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateTransportistaDto, { organizacionId: "org-2", razonSocial: "A en otra org", cuit: "30-11111111-1" } as any), ACTOR),
    ).resolves.toBeDefined();
    expect(almacen.filas).toHaveLength(2);
  });
});

describe("CAT-3 — Chofer: alta/edición individual con normalización + restricción única real (CUIL)", () => {
  function crearControlador() {
    const almacen = crearAlmacenConRestriccionUnica("cuil");
    const prisma = crearPrismaConTx(almacen, "chofer");
    return { controller: new ChoferesController(prisma), almacen };
  }

  it("guarda el CUIL normalizado", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "Juan", cuil: "20-30123456-4" } as any),
      ACTOR,
    );
    expect(almacen.filas[0].cuil).toBe("20301234564");
  });

  it("rechaza un duplicado escrito con formato diferente al ya guardado", async () => {
    const { controller } = crearControlador();
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "Juan", cuil: "20-30123456-4" } as any),
      ACTOR,
    );
    await expect(
      controller.create(
        plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "Otro", cuil: "20.301.234.564" } as any),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("en edición, el propio registro no colisiona consigo mismo aunque se reenvíe en otro formato", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "Juan", cuil: "20-30123456-4" } as any),
      ACTOR,
    );
    const id = almacen.filas[0].id;
    await expect(controller.update(id, plainToInstance(UpdateChoferDto, { cuil: "20.301.234.564" } as any), ACTOR)).resolves.toBeDefined();
  });

  it("en edición, sí rechaza colisión con otro registro de la misma organización", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "A", cuil: "20-30123456-4" } as any),
      ACTOR,
    );
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "B", cuil: "20-40123456-4" } as any),
      ACTOR,
    );
    const idB = almacen.filas[1].id;
    await expect(
      controller.update(idB, plainToInstance(UpdateChoferDto, { cuil: "20-30123456-4" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("el mismo CUIL normalizado es válido en dos organizaciones distintas (aislamiento preservado)", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(
      plainToInstance(CreateChoferDto, { organizacionId: "org-1", transportistaId: "t1", nombre: "A", cuil: "20-30123456-4" } as any),
      ACTOR,
    );
    await expect(
      controller.create(
        plainToInstance(CreateChoferDto, { organizacionId: "org-2", transportistaId: "t2", nombre: "A en otra org", cuil: "20-30123456-4" } as any),
        ACTOR,
      ),
    ).resolves.toBeDefined();
    expect(almacen.filas).toHaveLength(2);
  });
});

// CAT-3: cierre puntual — un PATCH con dni: "" (o solo separadores) debe LIMPIAR el DNI (persistir
// null), nunca dejarlo silenciosamente sin cambios mientras el endpoint responde 200 como si
// hubiera aplicado el borrado. Se prueba a nivel controller (no solo DTO) porque lo que hay que
// confirmar es el `data` que efectivamente llega a Prisma.update(), no solo el valor del DTO.
describe("CAT-3 — Chofer: edición de DNI — borrar explícitamente vs. no tocar", () => {
  function crearControladorConMockSimple() {
    const registro = {
      id: "chofer-1",
      transportistaId: "t1",
      nombre: "Juan",
      dni: "30111222",
      cuil: "20301234564",
      comisionPct: 5,
      licenciaNumero: null,
      licenciaVencimiento: null,
      telefono: null,
      activo: true,
    };
    const findUnique = jest.fn().mockResolvedValue(registro);
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...registro, ...data }));
    const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    const tx = { chofer: { findUnique, update }, auditLog };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as unknown as OrganizacionPrismaClient;
    return { controller: new ChoferesController(prisma), update };
  }

  it("PATCH con dni: \"\" persiste null (borra el DNI), no deja el valor anterior sin cambios", async () => {
    const { controller, update } = crearControladorConMockSimple();
    await controller.update("chofer-1", plainToInstance(UpdateChoferDto, { dni: "" } as any), ACTOR);
    expect(update).toHaveBeenCalledWith({ where: { id: "chofer-1" }, data: expect.objectContaining({ dni: null }) });
  });

  it("PATCH con dni compuesto solo por separadores también persiste null", async () => {
    const { controller, update } = crearControladorConMockSimple();
    await controller.update("chofer-1", plainToInstance(UpdateChoferDto, { dni: " . - " } as any), ACTOR);
    expect(update).toHaveBeenCalledWith({ where: { id: "chofer-1" }, data: expect.objectContaining({ dni: null }) });
  });

  it("PATCH que no envía dni no lo incluye en absoluto en el data (Prisma no lo toca, valor previo preservado)", async () => {
    const { controller, update } = crearControladorConMockSimple();
    await controller.update("chofer-1", plainToInstance(UpdateChoferDto, { comisionPct: 8 } as any), ACTOR);
    const dataEnviada = update.mock.calls[0][0].data;
    expect("dni" in dataEnviada).toBe(false);
  });

  it("PATCH con un dni real lo persiste normalizado", async () => {
    const { controller, update } = crearControladorConMockSimple();
    await controller.update("chofer-1", plainToInstance(UpdateChoferDto, { dni: "30.111.222" } as any), ACTOR);
    expect(update).toHaveBeenCalledWith({ where: { id: "chofer-1" }, data: expect.objectContaining({ dni: "30111222" }) });
  });
});

describe("CAT-3 — Vehiculo: alta/edición individual con normalización + restricción única real (patente)", () => {
  function crearControlador() {
    const almacen = crearAlmacenConRestriccionUnica("patente");
    const prisma = crearPrismaConTx(almacen, "vehiculo");
    return { controller: new VehiculosController(prisma), almacen };
  }

  it("guarda la patente normalizada", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "ab-123-cd", tipo: "CAMION" } as any), ACTOR);
    expect(almacen.filas[0].patente).toBe("AB123CD");
  });

  it("rechaza un duplicado escrito con formato diferente al ya guardado", async () => {
    const { controller } = crearControlador();
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "AB123CD", tipo: "CAMION" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "ab 123 cd", tipo: "ACOPLADO" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("en edición, el propio registro no colisiona consigo mismo aunque se reenvíe en otro formato", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "AB123CD", tipo: "CAMION" } as any), ACTOR);
    const id = almacen.filas[0].id;
    await expect(controller.update(id, plainToInstance(UpdateVehiculoDto, { patente: "ab-123-cd" } as any), ACTOR)).resolves.toBeDefined();
  });

  it("en edición, sí rechaza colisión con otro registro de la misma organización", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "AB123CD", tipo: "CAMION" } as any), ACTOR);
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "XY987ZZ", tipo: "CAMION" } as any), ACTOR);
    const idB = almacen.filas[1].id;
    await expect(
      controller.update(idB, plainToInstance(UpdateVehiculoDto, { patente: "AB123CD" } as any), ACTOR),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("la misma patente normalizada es válida en dos organizaciones distintas (aislamiento preservado)", async () => {
    const { controller, almacen } = crearControlador();
    await controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-1", transportistaId: "t1", patente: "AB123CD", tipo: "CAMION" } as any), ACTOR);
    await expect(
      controller.create(plainToInstance(CreateVehiculoDto, { organizacionId: "org-2", transportistaId: "t2", patente: "AB123CD", tipo: "CAMION" } as any), ACTOR),
    ).resolves.toBeDefined();
    expect(almacen.filas).toHaveLength(2);
  });
});

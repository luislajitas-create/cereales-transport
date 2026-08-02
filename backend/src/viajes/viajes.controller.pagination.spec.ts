import { ViajesController } from "./viajes.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

function crearPrismaMock(total: number, datos: any[] = []) {
  return {
    viaje: {
      count: jest.fn().mockResolvedValue(total),
      findMany: jest.fn().mockResolvedValue(datos),
    },
  } as unknown as OrganizacionPrismaClient;
}

describe("ViajesController.findAll — paginación (H-11)", () => {
  it("sin page/limit, usa los valores por defecto (page=1, limit=20) y aplica skip/take correctos", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll();

    expect(prisma.viaje.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20, orderBy: { fecha: "desc" } }),
    );
  });

  it("calcula skip = (page - 1) * limit para una página distinta de 1", async () => {
    const prisma = crearPrismaMock(50);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, "3", "10");

    expect(prisma.viaje.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("clampea limit por encima del máximo (100)", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, "1", "9999");

    expect(prisma.viaje.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("page/limit no numéricos caen a los valores por defecto (page=1, limit=20)", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, "abc", "xyz");

    expect(prisma.viaje.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
  });

  it("limit negativo clampea al piso (1), mismo comportamiento ya existente en organizacion.controller.ts", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, "1", "-5");

    expect(prisma.viaje.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it("devuelve exactamente { datos, pagina, limite, total } — sin campos adicionales", async () => {
    const filas = [{ id: "v1" }, { id: "v2" }];
    const prisma = crearPrismaMock(2, filas);
    const controller = new ViajesController(prisma);

    const resultado = await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, "1", "20");

    expect(resultado).toEqual({ datos: filas, pagina: 1, limite: 20, total: 2 });
    expect(Object.keys(resultado)).toEqual(["datos", "pagina", "limite", "total"]);
  });

  it("aplica el mismo where (filtros) tanto en count como en findMany", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, "cliente-1", undefined, "CARGADO", undefined, undefined, "2", "5");

    const whereEsperado = { clienteId: "cliente-1", estado: "CARGADO" };
    expect(prisma.viaje.count).toHaveBeenCalledWith({ where: whereEsperado });
    expect(prisma.viaje.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: whereEsperado, skip: 5, take: 5 }),
    );
  });

  it("mantiene selectViajeListado y el filtro de búsqueda (q) sin cambios, combinados con la paginación", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new ViajesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, "CTG-XYZ", "1", "20");

    const llamada = (prisma.viaje.findMany as jest.Mock).mock.calls[0][0];
    expect(llamada.where.OR).toEqual([
      { ctg: { contains: "CTG-XYZ", mode: "insensitive" } },
      { cartaPorte: { contains: "CTG-XYZ", mode: "insensitive" } },
    ]);
    expect(llamada.select).toEqual(
      expect.objectContaining({ id: true, numeroViaje: true, estado: true }),
    );
  });
});

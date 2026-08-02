import { LiquidacionesController } from "./liquidaciones.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

function crearPrismaMock(total: number, datos: any[] = []) {
  return {
    liquidacion: {
      count: jest.fn().mockResolvedValue(total),
      findMany: jest.fn().mockResolvedValue(datos),
    },
  } as unknown as OrganizacionPrismaClient;
}

describe("LiquidacionesController.findAll — paginación (LIQ-1)", () => {
  it("sin page/limit, usa los valores por defecto (page=1, limit=20) y aplica skip/take correctos", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll();

    expect(prisma.liquidacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: "desc" } }),
    );
  });

  it("calcula skip = (page - 1) * limit para una página distinta de 1", async () => {
    const prisma = crearPrismaMock(50);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, "3", "10");

    expect(prisma.liquidacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("clampea limit por encima del máximo (100)", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, "1", "9999");

    expect(prisma.liquidacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("page/limit no numéricos caen a los valores por defecto (page=1, limit=20)", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll(undefined, undefined, undefined, undefined, "abc", "xyz");

    expect(prisma.liquidacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
  });

  it("devuelve exactamente { datos, pagina, limite, total } — sin campos adicionales", async () => {
    const filas = [{ id: "l1" }, { id: "l2" }];
    const prisma = crearPrismaMock(2, filas);
    const controller = new LiquidacionesController(prisma);

    const resultado = await controller.findAll(undefined, undefined, undefined, undefined, "1", "20");

    expect(resultado).toEqual({ datos: filas, pagina: 1, limite: 20, total: 2 });
    expect(Object.keys(resultado)).toEqual(["datos", "pagina", "limite", "total"]);
  });

  it("aplica el mismo where (filtros) tanto en count como en findMany", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll("transportista-1", undefined, "CONFIRMADA", "TRANSPORTISTA", "2", "5");

    const whereEsperado = { transportistaId: "transportista-1", estado: "CONFIRMADA", tipo: "TRANSPORTISTA" };
    expect(prisma.liquidacion.count).toHaveBeenCalledWith({ where: whereEsperado });
    expect(prisma.liquidacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: whereEsperado, skip: 5, take: 5 }),
    );
  });

  it("usa selectLiquidacionListado (select preciso, no el include completo de detalle)", async () => {
    const prisma = crearPrismaMock(0);
    const controller = new LiquidacionesController(prisma);

    await controller.findAll();

    const llamada = (prisma.liquidacion.findMany as jest.Mock).mock.calls[0][0];
    expect(llamada.select).toEqual({
      id: true,
      numero: true,
      tipo: true,
      periodoDesde: true,
      periodoHasta: true,
      netoPagar: true,
      estado: true,
      transportista: { select: { razonSocial: true } },
      chofer: { select: { nombre: true } },
    });
    expect(llamada.include).toBeUndefined();
  });
});

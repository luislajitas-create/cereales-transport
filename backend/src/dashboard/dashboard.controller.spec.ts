import { DashboardController } from "./dashboard.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

function crearPrismaMock(counts: {
  clientes: number;
  transportistas: number;
  choferes: number;
  vehiculosCamion: number;
  cereales: number;
  ubicaciones: number;
}) {
  return {
    cliente: { count: jest.fn().mockResolvedValue(counts.clientes) },
    transportista: { count: jest.fn().mockResolvedValue(counts.transportistas) },
    chofer: { count: jest.fn().mockResolvedValue(counts.choferes) },
    vehiculo: { count: jest.fn().mockResolvedValue(counts.vehiculosCamion) },
    cereal: { count: jest.fn().mockResolvedValue(counts.cereales) },
    ubicacion: { count: jest.fn().mockResolvedValue(counts.ubicaciones) },
  } as unknown as OrganizacionPrismaClient;
}

describe("DashboardController.estadoOperativo", () => {
  it("operativa:true cuando los 6 requisitos están cumplidos", async () => {
    const prisma = crearPrismaMock({ clientes: 3, transportistas: 1, choferes: 1, vehiculosCamion: 2, cereales: 5, ubicaciones: 2 });
    const controller = new DashboardController(prisma);

    const resultado = await controller.estadoOperativo();

    expect(resultado.operativa).toBe(true);
    expect(resultado.porcentaje).toBe(100);
    expect(resultado.siguientePaso).toBeNull();
    expect(resultado.faltantes).toEqual([]);
  });

  it("operativa:false y porcentaje 0 cuando no hay ningún requisito cumplido", async () => {
    const prisma = crearPrismaMock({ clientes: 0, transportistas: 0, choferes: 0, vehiculosCamion: 0, cereales: 0, ubicaciones: 0 });
    const controller = new DashboardController(prisma);

    const resultado = await controller.estadoOperativo();

    expect(resultado.operativa).toBe(false);
    expect(resultado.porcentaje).toBe(0);
    // Orden de prioridad: transportistas antes que choferes/vehiculosCamion (dependencia real de FK).
    expect(resultado.siguientePaso).toBe("transportistas");
    expect(resultado.faltantes[0]).toEqual({ codigo: "transportistas" });
    expect(resultado.faltantes).toHaveLength(6);
  });

  it("Ubicaciones con 1 registro no alcanza (hace falta 2) — caso límite", async () => {
    const prisma = crearPrismaMock({ clientes: 1, transportistas: 1, choferes: 1, vehiculosCamion: 1, cereales: 1, ubicaciones: 1 });
    const controller = new DashboardController(prisma);

    const resultado = await controller.estadoOperativo();

    expect(resultado.requisitos.ubicaciones).toEqual({ cumplido: false, actual: 1 });
    expect(resultado.operativa).toBe(false);
  });

  it("siguientePaso respeta la prioridad cuando faltan varios requisitos no contiguos", async () => {
    // Faltan choferes y ubicaciones — choferes tiene prioridad más alta en el orden aprobado.
    const prisma = crearPrismaMock({ clientes: 3, transportistas: 1, choferes: 0, vehiculosCamion: 2, cereales: 5, ubicaciones: 1 });
    const controller = new DashboardController(prisma);

    const resultado = await controller.estadoOperativo();

    expect(resultado.siguientePaso).toBe("choferes");
    expect(resultado.faltantes.map((f) => f.codigo)).toEqual(["choferes", "ubicaciones"]);
    expect(resultado.porcentaje).toBe(67); // 4 de 6 cumplidos, redondeado
  });

  it("filtra Vehiculo por tipo CAMION y activo:true, y Cliente/Transportista/Chofer por activo:true", async () => {
    const prisma = crearPrismaMock({ clientes: 1, transportistas: 1, choferes: 1, vehiculosCamion: 1, cereales: 1, ubicaciones: 2 });
    const controller = new DashboardController(prisma);

    await controller.estadoOperativo();

    expect(prisma.cliente.count).toHaveBeenCalledWith({ where: { activo: true } });
    expect(prisma.transportista.count).toHaveBeenCalledWith({ where: { activo: true } });
    expect(prisma.chofer.count).toHaveBeenCalledWith({ where: { activo: true } });
    expect(prisma.vehiculo.count).toHaveBeenCalledWith({ where: { activo: true, tipo: "CAMION" } });
    expect(prisma.cereal.count).toHaveBeenCalledWith();
    expect(prisma.ubicacion.count).toHaveBeenCalledWith();
  });
});

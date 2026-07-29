import { DatabaseHealthService } from "./database-health.service";
import { PrismaService } from "./prisma.service";

describe("DatabaseHealthService", () => {
  it("devuelve true cuando la consulta a la base responde", async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) } as unknown as PrismaService;
    const service = new DatabaseHealthService(prisma);

    await expect(service.estaConectada()).resolves.toBe(true);
  });

  it("devuelve false (sin lanzar) cuando la consulta a la base falla", async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) } as unknown as PrismaService;
    const service = new DatabaseHealthService(prisma);

    await expect(service.estaConectada()).resolves.toBe(false);
  });
});

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async estaConectada(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(
        `Healthcheck: fallo de conectividad a PostgreSQL — ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma.module";
import { DatabaseHealthService } from "./database-health.service";

// Cuarto consumidor autorizado del cliente crudo de Prisma (ver allow-list documentada en
// prisma.module.ts). Expone únicamente una verificación de conectividad de solo lectura
// (SELECT 1) para el healthcheck de A-04 — nunca PrismaService en sí. Mismo patrón ya usado
// por UsuarioGrupoLookupModule: importa PrismaModule, exporta solo un servicio angosto.
@Module({
  imports: [PrismaModule],
  providers: [DatabaseHealthService],
  exports: [DatabaseHealthService],
})
export class DatabaseHealthModule {}

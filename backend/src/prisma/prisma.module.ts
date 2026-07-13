import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// Ya no es @Global() (Bloque 8.1.d): el cliente crudo solo debe llegar a quien lo importe
// explícitamente (AuthService, necesita leer Usuario antes de que exista contexto de
// organización, y OrganizacionPrismaModule, que lo envuelve con el scoping). Ningún módulo
// funcional debe importar este módulo directamente.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

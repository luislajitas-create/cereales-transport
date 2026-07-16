import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma.module";
import { UsuarioGrupoLookupService } from "./usuario-grupo-lookup.service";

// Segundo consumidor autorizado del cliente crudo de Prisma, además de AuthModule (ver el
// allow-list en prisma.module.ts). Exporta únicamente UsuarioGrupoLookupService — nunca
// PrismaService en sí — para que ningún módulo que importe este módulo pueda terminar
// inyectando el cliente crudo por error. Mismo patrón ya usado por OrganizacionPrismaModule
// (importa PrismaModule, expone solo el cliente ya envuelto, nunca el crudo).
@Module({
  imports: [PrismaModule],
  providers: [UsuarioGrupoLookupService],
  exports: [UsuarioGrupoLookupService],
})
export class UsuarioGrupoLookupModule {}

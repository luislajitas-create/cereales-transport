import { Module } from "@nestjs/common";
import { UsuarioGrupoLookupModule } from "../prisma/usuario-grupo-lookup.module";
import { GrupoEconomicoController } from "./grupo-economico.controller";
import { IdentidadChoferGrupoController } from "./identidad-chofer.controller";
import { AccesoGrupoController } from "./acceso-grupo.controller";

@Module({
  imports: [UsuarioGrupoLookupModule],
  controllers: [GrupoEconomicoController, IdentidadChoferGrupoController, AccesoGrupoController],
})
export class GrupoEconomicoModule {}

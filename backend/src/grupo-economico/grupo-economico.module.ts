import { Module } from "@nestjs/common";
import { GrupoEconomicoController } from "./grupo-economico.controller";
import { IdentidadChoferGrupoController } from "./identidad-chofer.controller";

@Module({
  controllers: [GrupoEconomicoController, IdentidadChoferGrupoController],
})
export class GrupoEconomicoModule {}

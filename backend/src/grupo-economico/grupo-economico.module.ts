import { Module } from "@nestjs/common";
import { GrupoEconomicoController } from "./grupo-economico.controller";

@Module({
  controllers: [GrupoEconomicoController],
})
export class GrupoEconomicoModule {}

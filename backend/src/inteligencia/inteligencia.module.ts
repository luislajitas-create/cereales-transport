import { Module } from "@nestjs/common";
import { InteligenciaController } from "./inteligencia.controller";
import { AgingController } from "./aging.controller";

@Module({
  controllers: [InteligenciaController, AgingController],
})
export class InteligenciaModule {}

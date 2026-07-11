import { Module } from "@nestjs/common";
import { InteligenciaController } from "./inteligencia.controller";
import { AgingController } from "./aging.controller";
import { AlertasController } from "./alertas.controller";

@Module({
  controllers: [InteligenciaController, AgingController, AlertasController],
})
export class InteligenciaModule {}

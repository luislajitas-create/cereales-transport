import { Module } from "@nestjs/common";
import { InteligenciaController } from "./inteligencia.controller";

@Module({
  controllers: [InteligenciaController],
})
export class InteligenciaModule {}

import { Module } from "@nestjs/common";
import { LiquidacionesController } from "./liquidaciones.controller";

@Module({
  controllers: [LiquidacionesController],
})
export class LiquidacionesModule {}

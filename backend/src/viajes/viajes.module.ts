import { Module } from "@nestjs/common";
import { ViajesController } from "./viajes.controller";

@Module({
  controllers: [ViajesController],
})
export class ViajesModule {}

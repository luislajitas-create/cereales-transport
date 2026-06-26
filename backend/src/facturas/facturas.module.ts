import { Module } from "@nestjs/common";
import { FacturasController } from "./facturas.controller";

@Module({
  controllers: [FacturasController],
})
export class FacturasModule {}

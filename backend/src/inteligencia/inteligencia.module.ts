import { Module } from "@nestjs/common";
import { InteligenciaController } from "./inteligencia.controller";
import { AgingController } from "./aging.controller";
import { AlertasController } from "./alertas.controller";
import { DashboardEjecutivoController } from "./dashboard-ejecutivo.controller";
import { RentabilidadService } from "./rentabilidad.service";
import { AgingService } from "./aging.service";
import { AlertasService } from "./alertas.service";

@Module({
  controllers: [InteligenciaController, AgingController, AlertasController, DashboardEjecutivoController],
  providers: [RentabilidadService, AgingService, AlertasService],
})
export class InteligenciaModule {}

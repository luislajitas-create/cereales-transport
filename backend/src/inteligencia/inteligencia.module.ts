import { Module } from "@nestjs/common";
import { InteligenciaController } from "./inteligencia.controller";
import { AgingController } from "./aging.controller";
import { AlertasController } from "./alertas.controller";
import { DashboardEjecutivoController } from "./dashboard-ejecutivo.controller";
import { BenchmarkingController } from "./benchmarking.controller";
import { RentabilidadService } from "./rentabilidad.service";
import { AgingService } from "./aging.service";
import { AlertasService } from "./alertas.service";
import { BenchmarkingService } from "./benchmarking.service";

@Module({
  controllers: [InteligenciaController, AgingController, AlertasController, DashboardEjecutivoController, BenchmarkingController],
  providers: [RentabilidadService, AgingService, AlertasService, BenchmarkingService],
})
export class InteligenciaModule {}

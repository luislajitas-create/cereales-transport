import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseHealthService } from "./prisma/database-health.service";

@Controller()
export class AppController {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  @Get("/health")
  async health() {
    const baseDeDatosConectada = await this.databaseHealth.estaConectada();
    if (!baseDeDatosConectada) {
      throw new ServiceUnavailableException({
        status: "error",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      });
    }
    return { status: "ok", database: "connected", timestamp: new Date().toISOString() };
  }

  @Get()
  root() {
    return {
      title: "🌾 FIXED - Sistema Dador de Carga de Cereales v2",
      description: "Plataforma integral de gestión de transporte y comercialización de cereales",
      status: "online",
      version: "1.0",
      features: ["Gestión de Viajes", "Liquidaciones", "Facturas", "Combustibles"]
    };
  }
}
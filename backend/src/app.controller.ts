import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("/health")
  health() {
    return { status: "ok", message: "Backend is running", timestamp: new Date().toISOString() };
  }

  @Get()
  root() {
    return {
      title: "🌾 Sistema Dador de Carga de Cereales",
      description: "Plataforma integral de gestión de transporte y comercialización de cereales",
      status: "online",
      version: "1.0",
      features: ["Gestión de Viajes", "Liquidaciones", "Facturas", "Combustibles"]
    };
  }
}
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    // Módulos desactivados temporalmente - requieren esquema completo
    // AuthModule,
    // CatalogosModule,
    // ViajesModule,
    // AnticiposModule,
    // LiquidacionesModule,
    // FacturasModule,
    // DashboardModule,
    // CombustiblesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { OrganizacionPrismaModule } from "./prisma/organizacion-prisma.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { ViajesModule } from "./viajes/viajes.module";
import { AnticiposModule } from "./anticipos/anticipos.module";
import { LiquidacionesModule } from "./liquidaciones/liquidaciones.module";
import { FacturasModule } from "./facturas/facturas.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { InteligenciaModule } from "./inteligencia/inteligencia.module";

@Module({
  imports: [OrganizacionPrismaModule, AuthModule, CatalogosModule, ViajesModule, AnticiposModule, LiquidacionesModule, FacturasModule, DashboardModule, InteligenciaModule],
  controllers: [AppController],
})
export class AppModule {}
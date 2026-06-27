import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { ViajesModule } from "./viajes/viajes.module";
import { AnticiposModule } from "./anticipos/anticipos.module";
import { LiquidacionesModule } from "./liquidaciones/liquidaciones.module";
import { FacturasModule } from "./facturas/facturas.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CombustiblesModule } from "./combustibles/combustibles.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CatalogosModule,
    ViajesModule,
    AnticiposModule,
    LiquidacionesModule,
    FacturasModule,
    DashboardModule,
    CombustiblesModule,
  ],
})
export class AppModule {}

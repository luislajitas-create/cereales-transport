import { Module } from "@nestjs/common";
import { UsuarioGrupoLookupModule } from "../prisma/usuario-grupo-lookup.module";
import { GrupoEconomicoController } from "./grupo-economico.controller";
import { IdentidadChoferGrupoController } from "./identidad-chofer.controller";
import { AccesoGrupoController } from "./acceso-grupo.controller";
import { OrganizacionesAccesiblesController } from "./organizaciones-accesibles.controller";
import { PagoConsolidadoController } from "./pago-consolidado.controller";
import { PagoConsolidadoService } from "./pago-consolidado.service";

@Module({
  imports: [UsuarioGrupoLookupModule],
  controllers: [
    GrupoEconomicoController,
    IdentidadChoferGrupoController,
    AccesoGrupoController,
    OrganizacionesAccesiblesController,
    PagoConsolidadoController,
  ],
  providers: [PagoConsolidadoService],
})
export class GrupoEconomicoModule {}

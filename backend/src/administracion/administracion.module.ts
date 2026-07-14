import { Module } from "@nestjs/common";
import { UsuariosController } from "./usuarios.controller";
import { PerfilController } from "./perfil.controller";
import { OrganizacionController } from "./organizacion.controller";

@Module({
  controllers: [UsuariosController, PerfilController, OrganizacionController],
})
export class AdministracionModule {}

import { Module } from "@nestjs/common";
import { UsuariosController } from "./usuarios.controller";
import { PerfilController } from "./perfil.controller";

@Module({
  controllers: [UsuariosController, PerfilController],
})
export class AdministracionModule {}

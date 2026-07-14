import { Module } from "@nestjs/common";
import { NotificacionesModule } from "../notificaciones/notificaciones.module";
import { UsuariosController } from "./usuarios.controller";
import { PerfilController } from "./perfil.controller";
import { OrganizacionController } from "./organizacion.controller";

@Module({
  imports: [NotificacionesModule],
  controllers: [UsuariosController, PerfilController, OrganizacionController],
})
export class AdministracionModule {}

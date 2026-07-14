import { Module } from "@nestjs/common";
import { NotificadorService } from "./notificador.service";

@Module({
  providers: [NotificadorService],
  exports: [NotificadorService],
})
export class NotificacionesModule {}

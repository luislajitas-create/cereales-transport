import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AceptarInvitacionDto } from "./dto/aceptar-invitacion.dto";

// Bloque 9.6 (mitad pública) — sin autenticación previa, igual que 9.3
// (BLOQUE9_DISENO_ADMINISTRACION.md, sección 6). La ruta vive bajo /usuarios/invitaciones
// (nomenclatura del diseño aprobado, sección 5), pero el controller se registra en AuthModule:
// ahí ya está autorizado el acceso a PrismaService crudo (vía AuthService) — ningún módulo
// funcional nuevo importa prisma.module.ts directamente (regla de Bloque 8.1.d).
@Controller("usuarios/invitaciones")
export class InvitacionesPublicasController {
  constructor(private authService: AuthService) {}

  @Get(":token")
  obtener(@Param("token") token: string) {
    return this.authService.obtenerInvitacion(token);
  }

  @Post(":token/aceptar")
  async aceptar(@Param("token") token: string, @Body() body: AceptarInvitacionDto) {
    await this.authService.aceptarInvitacion(token, body.contrasena);
    return { message: "Cuenta activada correctamente. Ya podés iniciar sesión." };
  }
}

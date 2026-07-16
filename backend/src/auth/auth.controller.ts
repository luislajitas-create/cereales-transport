import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ExtractJwt } from "passport-jwt";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RecuperarContrasenaDto } from "./dto/recuperar-contrasena.dto";
import { RestablecerContrasenaDto } from "./dto/restablecer-contrasena.dto";
import { CambiarOrganizacionDto } from "./dto/cambiar-organizacion.dto";

const MENSAJE_RECUPERACION = "Si el email corresponde a una cuenta, vas a recibir un enlace para recuperar el acceso.";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // Bloque 10.3.b — único endpoint de este controller que exige autenticación (los otros tres
  // son, a propósito, públicos). No usa RolesGuard: cambiar de organización no depende de un rol
  // funcional (DECISIONES_TECNICAS_BLOQUE10.3.md, Decisión 1), la autorización real la da
  // AccesoGrupoEconomico, verificado dentro de AuthService.cambiarOrganizacion(). El token crudo
  // se extrae acá con el mismo extractor que ya usa JwtStrategy (ExtractJwt.
  // fromAuthHeaderAsBearerToken()) — sin duplicar lógica de parseo del header.
  @UseGuards(JwtAuthGuard)
  @Post("cambiar-organizacion")
  cambiarOrganizacion(@Body() dto: CambiarOrganizacionDto, @CurrentUser() actor: any, @Req() req: Request) {
    const tokenActual = ExtractJwt.fromAuthHeaderAsBearerToken()(req) as string;
    return this.authService.cambiarOrganizacion(actor, dto.organizacionId, tokenActual);
  }

  // Bloque 9.3 — respuesta pública idéntica exista o no la cuenta, para no permitir enumeración
  // de usuarios (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5).
  @HttpCode(200)
  @Post("recuperar-contrasena")
  async recuperarContrasena(@Body() dto: RecuperarContrasenaDto) {
    await this.authService.recuperarContrasena(dto.email);
    return { message: MENSAJE_RECUPERACION };
  }

  @HttpCode(200)
  @Post("restablecer-contrasena")
  async restablecerContrasena(@Body() dto: RestablecerContrasenaDto) {
    await this.authService.restablecerContrasena(dto.token, dto.nuevaContrasena);
    return { message: "Contraseña actualizada correctamente." };
  }
}

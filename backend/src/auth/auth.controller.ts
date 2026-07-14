import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RecuperarContrasenaDto } from "./dto/recuperar-contrasena.dto";
import { RestablecerContrasenaDto } from "./dto/restablecer-contrasena.dto";

const MENSAJE_RECUPERACION = "Si el email corresponde a una cuenta, vas a recibir un enlace para recuperar el acceso.";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
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

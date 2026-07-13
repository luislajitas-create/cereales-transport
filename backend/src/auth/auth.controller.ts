import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RestablecerContrasenaDto } from "./dto/restablecer-contrasena.dto";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @HttpCode(200)
  @Post("restablecer-contrasena")
  async restablecerContrasena(@Body() dto: RestablecerContrasenaDto) {
    await this.authService.restablecerContrasena(dto.token, dto.nuevaContrasena);
    return { message: "Contraseña actualizada correctamente." };
  }
}

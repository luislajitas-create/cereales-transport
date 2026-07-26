import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificacionesModule } from "../notificaciones/notificaciones.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { InvitacionesPublicasController } from "./invitaciones-publicas.controller";
import { JwtStrategy } from "./jwt.strategy";

// Bloque 11, H-07: registrado local a AuthModule, no en AppModule — deja el guard disponible
// para inyección, pero no lo aplica en ningún lado por sí solo (eso lo decide cada controller
// con @UseGuards). Solo AuthController.login() lo usa (ver LoginThrottlerGuard en
// auth.controller.ts) — el resto de la API queda sin cambios.
export const LOGIN_THROTTLE_TTL_MS = 60_000;
export const LOGIN_THROTTLE_LIMITE = 10;

@Module({
  imports: [
    PrismaModule,
    NotificacionesModule,
    PassportModule,
    ThrottlerModule.forRoot([
      { name: "default", ttl: LOGIN_THROTTLE_TTL_MS, limit: LOGIN_THROTTLE_LIMITE },
    ]),
    // JWT_SECRET ya fue validada en main.ts (validarEntorno(), antes de que este módulo se
    // importe) — nunca hay un valor por defecto acá.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "12h" },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController, InvitacionesPublicasController],
  exports: [AuthService],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    // JWT_SECRET ya fue validada en main.ts (validarEntorno(), antes de que este módulo se
    // importe) — nunca hay un valor por defecto acá.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "12h" },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

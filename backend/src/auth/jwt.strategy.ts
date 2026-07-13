import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // JWT_SECRET ya fue validada en main.ts (validarEntorno()) — nunca hay un valor por defecto acá.
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    if (typeof payload.organizacionId !== "string" || payload.organizacionId.length === 0) {
      throw new UnauthorizedException("Token sin contexto de organización");
    }
    return {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
      nombre: payload.nombre,
      organizacionId: payload.organizacionId,
    };
  }
}

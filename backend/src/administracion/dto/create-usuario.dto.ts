import { IsEmail, IsEnum, IsNotEmpty, IsString } from "class-validator";
import { RolNombre } from "@prisma/client";

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsEnum(RolNombre)
  rol: RolNombre;
}

import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { RolNombre } from "@prisma/client";

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(RolNombre)
  rol?: RolNombre;
}

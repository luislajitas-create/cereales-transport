import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { TipoUbicacion } from "@prisma/client";

export class CreateUbicacionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEnum(TipoUbicacion)
  tipo: TipoUbicacion;

  @IsOptional()
  @IsString()
  localidad?: string;
}

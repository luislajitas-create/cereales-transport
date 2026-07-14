import { IsString, MinLength } from "class-validator";

export class CambiarContrasenaPropiaDto {
  @IsString()
  contrasenaActual: string;

  @IsString()
  @MinLength(8)
  contrasenaNueva: string;
}

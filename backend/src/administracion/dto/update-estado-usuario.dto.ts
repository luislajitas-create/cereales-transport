import { IsBoolean } from "class-validator";

export class UpdateEstadoUsuarioDto {
  @IsBoolean()
  activo: boolean;
}

import { IsEnum } from "class-validator";
import { EstadoViajeEnum } from "@prisma/client";

export class CambiarEstadoDto {
  @IsEnum(EstadoViajeEnum)
  estado: EstadoViajeEnum;
}

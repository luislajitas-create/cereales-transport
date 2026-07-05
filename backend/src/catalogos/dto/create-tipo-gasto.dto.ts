import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTipoGastoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsBoolean()
  afectaLiquidacion?: boolean;
}

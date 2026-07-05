import { IsDateString, IsOptional } from "class-validator";

export class PagarLiquidacionDto {
  @IsOptional()
  @IsDateString()
  fechaPago?: string;
}

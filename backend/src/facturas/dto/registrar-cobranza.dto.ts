import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

export class RegistrarCobranzaDto {
  @IsDateString()
  fecha: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  importe: number;

  @IsOptional()
  @IsString()
  medioPago?: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}

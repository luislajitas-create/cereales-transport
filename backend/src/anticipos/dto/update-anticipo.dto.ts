import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

export class UpdateAnticipoDto {
  @IsOptional()
  @IsString()
  viajeId?: string;

  @IsOptional()
  @IsString()
  choferId?: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  tipoGastoId?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  importe?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  comprobanteUrl?: string;
}

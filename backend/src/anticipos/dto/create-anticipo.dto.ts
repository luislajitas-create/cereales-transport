import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

export class CreateAnticipoDto {
  @IsOptional()
  @IsString()
  viajeId?: string;

  @IsString()
  @IsNotEmpty()
  choferId: string;

  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsString()
  @IsNotEmpty()
  tipoGastoId: string;

  @IsDateString()
  fecha: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  importe: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  comprobanteUrl?: string;
}

import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";
import { TipoVehiculo } from "@prisma/client";

export class UpdateVehiculoDto {
  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  patente?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsEnum(TipoVehiculo)
  tipo?: TipoVehiculo;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  capacidadKg?: number;

  @IsOptional()
  @IsDateString()
  vencimientoRto?: string;

  @IsOptional()
  @IsDateString()
  vencimientoSeguro?: string;
}

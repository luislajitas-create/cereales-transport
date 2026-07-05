import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";
import { TipoVehiculo } from "@prisma/client";

export class CreateVehiculoDto {
  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsString()
  @IsNotEmpty()
  patente: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsEnum(TipoVehiculo)
  tipo: TipoVehiculo;

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

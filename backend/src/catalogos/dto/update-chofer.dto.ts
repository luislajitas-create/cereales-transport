import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class UpdateChoferDto {
  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
  @IsString()
  cuil?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  comisionPct?: number;

  @IsOptional()
  @IsString()
  licenciaNumero?: string;

  @IsOptional()
  @IsDateString()
  licenciaVencimiento?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

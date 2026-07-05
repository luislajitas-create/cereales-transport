import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class CreateChoferDto {
  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsString()
  @IsNotEmpty()
  cuil: string;

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
}

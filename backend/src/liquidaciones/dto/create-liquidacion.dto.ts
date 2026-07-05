import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";
import { TipoLiquidacion } from "@prisma/client";

export class CreateLiquidacionDto {
  @IsEnum(TipoLiquidacion)
  tipo: TipoLiquidacion;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  choferId?: string;

  @IsDateString()
  periodoDesde: string;

  @IsDateString()
  periodoHasta: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  comisionPct?: number;

  @IsArray()
  @ArrayNotEmpty({ message: "Debe incluir al menos un viaje" })
  @IsString({ each: true })
  viajeIds: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  anticipoIds?: string[];
}

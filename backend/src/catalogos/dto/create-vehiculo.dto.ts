import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Transform, Type } from "class-transformer";
import { TipoVehiculo } from "@prisma/client";
import { normalizarPatente, siPresente } from "../../common/normalizacion";

export class CreateVehiculoDto {
  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  // CAT-3: normalizado (mayúsculas, sin espacios/puntos/guiones) antes de validar y de persistir
  // — no se exige formato Mercosur ni se rechazan formatos históricos, ver
  // backend/src/common/normalizacion.ts.
  @Transform(siPresente(normalizarPatente))
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

import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { Transform, Type } from "class-transformer";
import { TipoVehiculo } from "@prisma/client";
import { normalizarPatente, siPresente } from "../../common/normalizacion";

export class UpdateVehiculoDto {
  @IsOptional()
  @IsString()
  transportistaId?: string;

  // CAT-3: normalizado (mayúsculas, sin espacios/puntos/guiones) antes de validar y de persistir.
  // siPresente() deja pasar undefined intacto — un PATCH que no toca "patente" no debe pisar el
  // valor ya guardado.
  @Transform(siPresente(normalizarPatente))
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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

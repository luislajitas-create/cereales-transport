import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Transform, Type } from "class-transformer";
import { normalizarCuil, normalizarDni, siPresente } from "../../common/normalizacion";

export class CreateChoferDto {
  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  // CAT-3: normalizado (solo dígitos) antes de validar y de persistir. Un DNI vacío o compuesto
  // solo por separadores normaliza a undefined, nunca "" — ver normalizarDni().
  @Transform(siPresente(normalizarDni))
  @IsOptional()
  @IsString()
  dni?: string;

  // CAT-3: normalizado (solo dígitos) antes de validar y de persistir.
  @Transform(siPresente(normalizarCuil))
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

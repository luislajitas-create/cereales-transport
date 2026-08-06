import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { normalizarCuitOpcional } from "../../common/normalizacion";

export class UpdateProductorDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  // CAT-6: ver create-productor.dto.ts — mismo criterio (normaliza, "" -> null, rechaza un valor
  // no vacío que normalice a cadena vacía en vez de convertirlo en null en silencio).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(normalizarCuitOpcional)
  cuit?: string | null;

  @IsOptional()
  @IsString()
  localidad?: string;
}

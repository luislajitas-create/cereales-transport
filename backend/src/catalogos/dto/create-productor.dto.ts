import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { normalizarCuitOpcional } from "../../common/normalizacion";

export class CreateProductorDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  // CAT-6: normalizado (solo dígitos) antes de validar y de persistir — mismo criterio que
  // UpdateOrganizacionDto.cuit (ver ahí el detalle): "" -> null, un valor no vacío que normaliza
  // a cadena vacía se rechaza en vez de guardarse como null en silencio.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(normalizarCuitOpcional)
  cuit?: string | null;

  @IsOptional()
  @IsString()
  localidad?: string;
}

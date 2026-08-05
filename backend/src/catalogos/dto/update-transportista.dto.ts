import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { normalizarCuit, siPresente } from "../../common/normalizacion";

export class UpdateTransportistaDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  // CAT-3: normalizado (solo dígitos) antes de validar y de persistir. siPresente() deja pasar
  // undefined intacto — un PATCH que no toca "cuit" no debe pisar el valor ya guardado.
  @Transform(siPresente(normalizarCuit))
  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  domicilio?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

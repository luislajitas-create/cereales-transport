import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { normalizarCuit, siPresente } from "../../common/normalizacion";

export class CreateTransportistaDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  // CAT-3: normalizado (solo dígitos) antes de validar y de persistir — ver
  // backend/src/common/normalizacion.ts.
  @Transform(siPresente(normalizarCuit))
  @IsString()
  @IsNotEmpty()
  cuit: string;

  @IsOptional()
  @IsString()
  domicilio?: string;
}

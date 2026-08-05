import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Transform, Type } from "class-transformer";
import { ContactoDto } from "./contacto.dto";
import { normalizarCuit, siPresente } from "../../common/normalizacion";

export class CreateClienteDto {
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
  condicionesComerciales?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos?: ContactoDto[];
}

import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ContactoDto } from "./contacto.dto";

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  condicionesComerciales?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos?: ContactoDto[];
}

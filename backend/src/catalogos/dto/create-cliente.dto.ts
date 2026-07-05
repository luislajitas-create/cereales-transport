import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ContactoDto } from "./contacto.dto";

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

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

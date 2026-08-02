import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";
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

  // CRM-1: sin este campo, remove() (DELETE /clientes/:id) podía desactivar un cliente pero no
  // existía ningún camino para reactivarlo — el ValidationPipe global (whitelist: true) descartaba
  // "activo" de cualquier PATCH antes de este cambio. Mismo patrón que UpdateTransportistaDto/
  // UpdateChoferDto/UpdateVehiculoDto, que ya lo declaraban.
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos?: ContactoDto[];
}

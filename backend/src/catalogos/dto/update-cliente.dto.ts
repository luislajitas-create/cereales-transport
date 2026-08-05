import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";
import { Transform, Type } from "class-transformer";
import { ContactoDto } from "./contacto.dto";
import { normalizarCuit, siPresente } from "../../common/normalizacion";

export class UpdateClienteDto {
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

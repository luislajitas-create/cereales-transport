import { Transform, Type } from "class-transformer";
import { IsDefined, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { EsCuitValido } from "../../common/es-cuit-valido.decorator";
import { normalizarCuit, siPresente } from "../../common/normalizacion";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class DatosOrganizacionAltaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(recortar)
  nombre: string;

  // Decisión del Product Owner: CUIT obligatorio en este flujo (a diferencia de
  // UpdateOrganizacionDto, donde sigue siendo opcional para organizaciones ya existentes).
  // CAT-6: se normaliza (solo dígitos, mismo criterio transversal de CAT-3) ANTES de validar —
  // un CUIT escrito con guiones/puntos/espacios ya no se rechaza, se acepta y se guarda
  // canónico. El regex de 11 dígitos y el dígito verificador (@EsCuitValido, exclusivo de este
  // flujo, sin cambios) siguen aplicando sobre el valor YA normalizado.
  @Transform(siPresente(normalizarCuit))
  @IsString()
  @Matches(/^\d{11}$/, { message: "El CUIT debe tener exactamente 11 dígitos numéricos." })
  @EsCuitValido()
  cuit: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(recortar)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(recortar)
  domicilio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(recortar)
  telefono?: string;
}

export class DatosAdministradorAltaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(recortar)
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class AltaOrganizacionDto {
  // @ValidateNested() por sí solo NO rechaza una propiedad completamente ausente (solo valida
  // su forma si está presente) — @IsDefined() es lo que la vuelve obligatoria. Sin esto, un
  // body vacío llega al servicio con organizacion/administrador en undefined y explota como
  // error 500 no controlado en vez de 400 (encontrado por prueba funcional real, no supuesto).
  @IsDefined()
  @ValidateNested()
  @Type(() => DatosOrganizacionAltaDto)
  organizacion: DatosOrganizacionAltaDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => DatosAdministradorAltaDto)
  administrador: DatosAdministradorAltaDto;

  // Honeypot (protección antiabuso, decisión del PO): campo invisible en el formulario real.
  // Un usuario humano nunca lo completa; un bot que autocompleta todos los campos del
  // formulario, sí. Opcional porque el caso legítimo es que nunca llegue.
  @IsOptional()
  @IsString()
  sitioWeb?: string;
}

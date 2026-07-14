import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// Bloque 9.4 — únicamente los campos institucionales previstos para esta etapa
// (BLOQUE9_DISENO_ADMINISTRACION.md, sección 4). logoUrl queda deliberadamente fuera de
// alcance: es un campo de branding, previsto para una etapa futura, no para 9.4.
export class UpdateOrganizacionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(recortar)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(recortar)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(recortar)
  cuit?: string;

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

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  @Transform(recortar)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(recortar)
  zonaHoraria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(recortar)
  moneda?: string;
}

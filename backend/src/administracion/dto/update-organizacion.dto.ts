import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { normalizarCuitOpcional } from "../../common/normalizacion";
import { EsCuitValido } from "../../common/es-cuit-valido.decorator";

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

  // CAT-6 (corrección tras revisión): mismo pipeline de validación que el alta de Organización
  // (alta-organizacion.dto.ts) — normalizar -> exigir 11 dígitos -> dígito verificador — pero
  // OPCIONAL, a diferencia del alta. "" (o solo espacios) es una intención explícita de borrar el
  // CUIT -> se guarda null (Organizacion.cuit es @unique global: null nunca colisiona entre sí,
  // a diferencia de dos organizaciones que antes de CAT-6 podían terminar ambas con cuit = "" y
  // chocar contra esa restricción). @IsOptional() solo deja pasar undefined/null — cualquier otro
  // valor (incluida "" residual de un input no vacío que normalizó a cadena vacía, ej. "---")
  // sigue cayendo en @Matches(), que ya rechaza cualquier cosa que no sean exactamente 11 dígitos
  // — no hace falta un @IsNotEmpty() aparte, @Matches ya cubre ese caso.
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: "El CUIT debe tener exactamente 11 dígitos numéricos." })
  @EsCuitValido()
  @Transform(normalizarCuitOpcional)
  cuit?: string | null;

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

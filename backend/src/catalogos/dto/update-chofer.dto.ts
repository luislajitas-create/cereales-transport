import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from "class-validator";
import { Transform, Type } from "class-transformer";
import { normalizarCuil, normalizarDniEdicion, siPresente } from "../../common/normalizacion";

export class UpdateChoferDto {
  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  // CAT-3: un PATCH que no envía "dni" lo deja intacto (Prisma no lo toca). Un PATCH que SÍ envía
  // "dni" vacío o compuesto solo por separadores (ej. " . - ") es una intención explícita de
  // "quitar el DNI": normaliza a `null` (Prisma lo persiste, limpiando el campo), no a `undefined`
  // — que habría dejado el DNI anterior sin cambios mientras el endpoint respondía 200 como si
  // hubiera aplicado el cambio pedido. Ver normalizarDniEdicion() en common/normalizacion.ts.
  @Transform(normalizarDniEdicion)
  @IsOptional()
  @IsString()
  dni?: string | null;

  // CAT-3: normalizado (solo dígitos) antes de validar y de persistir.
  @Transform(siPresente(normalizarCuil))
  @IsOptional()
  @IsString()
  cuil?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  comisionPct?: number;

  @IsOptional()
  @IsString()
  licenciaNumero?: string;

  @IsOptional()
  @IsDateString()
  licenciaVencimiento?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

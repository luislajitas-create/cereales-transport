import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

// Bloque 10.5 — un ítem por Liquidacion a incluir, con la organización dueña explícita
// (DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md, sección 4.2) — nunca se infiere de ningún otro dato.
export class ItemPagoConsolidadoDto {
  @IsUUID()
  organizacionId!: string;

  @IsUUID()
  liquidacionId!: string;
}

export class CrearPagoConsolidadoDto {
  @IsUUID()
  identidadChoferGrupoId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemPagoConsolidadoDto)
  items!: ItemPagoConsolidadoDto[];

  @IsOptional()
  @IsString()
  referenciaPago?: string;
}

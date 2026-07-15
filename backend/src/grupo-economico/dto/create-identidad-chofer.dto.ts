import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// Bloque 10.2 — crea la identidad y vincula, en la misma operación, el Chofer fundador de la
// organización del actor (mismo patrón que CreateGrupoEconomicoDto en 10.1: nunca existe una
// identidad "vacía" sin al menos un Chofer real que la originó). choferId siempre se valida
// server-side contra la organización del actor — nunca se confía en de qué organización dice
// venir (GrupoEconomicoDisenoTecnico, sección 8).
export class CreateIdentidadChoferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(recortar)
  nombreReferencia!: string;

  @IsUUID()
  choferId!: string;
}

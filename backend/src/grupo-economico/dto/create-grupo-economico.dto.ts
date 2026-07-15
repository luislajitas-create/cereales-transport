import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// Bloque 10.1 — único campo del grupo económico en esta primera versión
// (GRUPO_ECONOMICO_DISENO_TECNICO.md, sección 10: "identificador propio, nombre, fecha de
// creación"). La organización fundadora nunca viaja en el body: siempre es la del actor
// autenticado (GrupoEconomicoController.crear).
export class CreateGrupoEconomicoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(recortar)
  nombre!: string;
}

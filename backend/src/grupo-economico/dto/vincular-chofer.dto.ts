import { IsUUID } from "class-validator";

// Bloque 10.2 — usado tanto para vincular como para desvincular. El cliente selecciona un
// registro de Chofer existente por id (nunca por nombre libre); el servidor siempre revalida
// que ese Chofer pertenezca a la organización del actor antes de tocar cualquier dato.
export class VincularChoferDto {
  @IsUUID()
  choferId!: string;
}

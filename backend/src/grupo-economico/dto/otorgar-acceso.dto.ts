import { IsUUID } from "class-validator";

// Bloque 10.3.a — el usuario destinatario se selecciona por id (nunca por email/nombre libre);
// la organización que otorga el acceso nunca viaja en el body, siempre es actor.organizacionId
// (AccesoGrupoController.otorgar).
export class OtorgarAccesoDto {
  @IsUUID()
  usuarioId!: string;
}

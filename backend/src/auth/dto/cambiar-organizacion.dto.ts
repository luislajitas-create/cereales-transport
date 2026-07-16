import { IsUUID } from "class-validator";

// Bloque 10.3.b — la organización destino se identifica por id (nunca por nombre/CUIT libre);
// el servidor siempre revalida que sea la propia organización del actor o que exista un
// AccesoGrupoEconomico vigente antes de aceptarla (AuthService.cambiarOrganizacion). Un id con
// formato inválido es rechazado acá mismo (400), antes de llegar a ninguna lógica de
// autorización — no genera auditoría de intento denegado (DECISIONES_TECNICAS_BLOQUE10.3b.md,
// Decisión 5: el mensaje debe ser genérico, no revelar nada sobre la organización destino; un
// error de formato no revela nada, es idéntico al de cualquier otro endpoint con @IsUUID()).
export class CambiarOrganizacionDto {
  @IsUUID()
  organizacionId!: string;
}

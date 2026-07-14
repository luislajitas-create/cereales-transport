import { Injectable, Logger } from "@nestjs/common";

// Bloque 9.3 — abstracción de envío (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5). El proveedor
// real de email queda como decisión pendiente de Product Owner (sección 12 del diseño) y no
// bloquea el resto del flujo. Esta implementación de desarrollo no envía nada: fuera de
// producción deja constancia en el log del propio servidor para poder probar el flujo
// manualmente; en producción nunca escribe el enlace (contiene un token de un solo uso, es un
// secreto) — solo dejar sin entregar la recuperación hasta que se configure un proveedor real.
@Injectable()
export class NotificadorService {
  private readonly logger = new Logger(NotificadorService.name);

  async enviarRecuperacionContrasena(destinatario: string, enlace: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      this.logger.log(`Enlace de recuperación generado para ${destinatario} (proveedor de envío aún no configurado)`);
      return;
    }
    this.logger.log(`[dev] Enlace de recuperación de contraseña para ${destinatario}: ${enlace}`);
  }

  // Bloque 9.6 — mismo criterio que enviarRecuperacionContrasena: el enlace contiene un token de
  // un solo uso, nunca se escribe en logs de producción.
  async enviarInvitacionUsuario(destinatario: string, enlace: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      this.logger.log(`Invitación generada para ${destinatario} (proveedor de envío aún no configurado)`);
      return;
    }
    this.logger.log(`[dev] Enlace de invitación para ${destinatario}: ${enlace}`);
  }
}

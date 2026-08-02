import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

// NOTIF-1 — proveedor de envío real vía SMTP, configurado enteramente por variables de entorno
// (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM). Todas OPCIONALES, a diferencia de
// JWT_SECRET/CORS_ORIGIN (env-validation.ts): su ausencia nunca aborta el arranque — el sistema
// debe poder operar sin proveedor configurado exactamente como antes de este bloque (el
// fallback manual del Administrador en Usuarios.tsx — enlace + botón "Copiar" — sigue siendo la
// red de seguridad real, no se reemplaza).
function construirTransporter(): nodemailer.Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

type ResultadoEnvio = "enviado" | "no_configurado" | "fallo";

@Injectable()
export class NotificadorService {
  private readonly logger = new Logger(NotificadorService.name);
  private readonly transporter = construirTransporter();

  // Nunca lanza — auth.service.ts y usuarios.controller.ts llaman a los 3 métodos públicos con
  // `await` directo, sin try/catch propio; dependen de este contrato (documentado ya antes de
  // este bloque: "NotificadorService ya maneja por su cuenta... nunca lanza").
  private async enviarReal(destinatario: string, asunto: string, texto: string): Promise<ResultadoEnvio> {
    if (!this.transporter) return "no_configurado";
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destinatario,
        subject: asunto,
        text: texto,
      });
      return "enviado";
    } catch (error) {
      this.logger.error(`Fallo al enviar email a ${destinatario}: ${error instanceof Error ? error.message : String(error)}`);
      return "fallo";
    }
  }

  // El enlace contiene un token de un solo uso (secreto): en producción nunca se loguea, ni
  // aunque el envío real haya fallado o no haya proveedor configurado — mismo criterio que ya
  // regía antes de este bloque.
  private logFallbackConEnlace(mensajeProduccion: string, prefijoDev: string, enlace: string): void {
    if (process.env.NODE_ENV === "production") {
      this.logger.log(mensajeProduccion);
      return;
    }
    this.logger.log(`[dev] ${prefijoDev}: ${enlace}`);
  }

  async enviarRecuperacionContrasena(destinatario: string, enlace: string): Promise<void> {
    const asunto = "Recuperar tu contraseña — SDC";
    const texto = `Recibimos una solicitud para restablecer tu contraseña.\n\nIngresá al siguiente enlace para continuar (válido por tiempo limitado, un solo uso):\n${enlace}\n\nSi no solicitaste esto, podés ignorar este mensaje.`;
    const resultado = await this.enviarReal(destinatario, asunto, texto);
    if (resultado === "enviado") return;
    this.logFallbackConEnlace(
      `Enlace de recuperación generado para ${destinatario} (${resultado === "fallo" ? "el envío falló" : "proveedor de envío aún no configurado"})`,
      "Enlace de recuperación de contraseña para " + destinatario,
      enlace,
    );
  }

  async enviarInvitacionUsuario(destinatario: string, enlace: string): Promise<void> {
    const asunto = "Invitación a SDC";
    const texto = `Fuiste invitado a sumarte a SDC (Sistema Dador de Carga de Cereales).\n\nIngresá al siguiente enlace para activar tu cuenta y definir tu contraseña (un solo uso):\n${enlace}`;
    const resultado = await this.enviarReal(destinatario, asunto, texto);
    if (resultado === "enviado") return;
    this.logFallbackConEnlace(
      `Invitación generada para ${destinatario} (${resultado === "fallo" ? "el envío falló" : "proveedor de envío aún no configurado"})`,
      "Enlace de invitación para " + destinatario,
      enlace,
    );
  }

  // A diferencia de los dos métodos de arriba, no lleva ningún token (no hay nada que canjear,
  // la cuenta ya queda activa) — puramente informativo, por eso su caller (auth.service.ts) ya
  // envuelve la llamada en un .catch() propio además de este contrato interno de "nunca lanza".
  async enviarBienvenidaOrganizacion(destinatario: string, nombreOrganizacion: string): Promise<void> {
    const asunto = `Bienvenido a SDC — ${nombreOrganizacion}`;
    const texto = `La organización "${nombreOrganizacion}" fue creada correctamente en SDC. Ya podés iniciar sesión con tu email y la contraseña que elegiste al registrarte.`;
    const resultado = await this.enviarReal(destinatario, asunto, texto);
    if (resultado === "enviado") return;
    if (process.env.NODE_ENV === "production") {
      this.logger.log(
        `Bienvenida generada para ${destinatario} (organización "${nombreOrganizacion}", ${resultado === "fallo" ? "el envío falló" : "proveedor de envío aún no configurado"})`,
      );
      return;
    }
    this.logger.log(`[dev] Email de bienvenida para ${destinatario} — organización "${nombreOrganizacion}" creada correctamente.`);
  }
}

import { Body, Controller, ExecutionContext, Injectable, Post, UseGuards } from "@nestjs/common";
import { ThrottlerException, ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { AltaOrganizacionDto } from "./dto/alta-organizacion.dto";

// Alta de Organización self-service — sin autenticación previa, mismo criterio que
// InvitacionesPublicasController: controller propio registrado en AuthModule (ahí ya está
// autorizado el acceso a PrismaService crudo vía AuthService, sin agregar un consumidor nuevo
// al allow-list de prisma.module.ts).
//
// Constantes definidas ACÁ, no importadas de auth.module.ts: ese módulo importa este archivo
// para registrar el controller (`controllers: [...OrganizacionesPublicasController]`) — importar
// constantes en la dirección opuesta cierra un ciclo. Se comprobó con evidencia real (headers
// X-RateLimit-* del endpoint) que ese ciclo hace que @Throttle() reciba `undefined` en el
// momento exacto en que se evalúa el decorator, y la librería cae en silencio al perfil base
// registrado por ThrottlerModule.forRoot() en vez de aplicar el límite de esta ruta. Mismo
// patrón de import circular existe hoy entre auth.module.ts y auth.controller.ts (LOGIN_THROTTLE_*)
// — ahí queda enmascarado porque los valores de login coinciden con los del perfil base; ver nota
// de riesgo en el informe de esta tarea, no se corrige acá (fuera de alcance de este bloque).
const ALTA_ORGANIZACION_THROTTLE_TTL_MS = 15 * 60_000;
const ALTA_ORGANIZACION_THROTTLE_LIMITE = 5;

@Injectable()
class AltaOrganizacionThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(_context: ExecutionContext): Promise<void> {
    throw new ThrottlerException("Demasiados intentos de alta de organización. Esperá unos minutos antes de volver a intentar.");
  }
}

@Controller("organizaciones")
export class OrganizacionesPublicasController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: ALTA_ORGANIZACION_THROTTLE_LIMITE, ttl: ALTA_ORGANIZACION_THROTTLE_TTL_MS } })
  @UseGuards(AltaOrganizacionThrottlerGuard)
  @Post()
  altaOrganizacion(@Body() dto: AltaOrganizacionDto) {
    return this.authService.altaOrganizacion(dto);
  }
}

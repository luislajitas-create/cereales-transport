import "reflect-metadata";
import { validarEntorno } from "./config/env-validation";

// Se valida antes de importar AppModule a propósito: AuthModule lee JWT_SECRET en el
// momento en que su decorador @Module se evalúa (JwtModule.register), que ocurre al
// importar el módulo, no dentro de bootstrap() — validar después sería demasiado tarde.
validarEntorno();

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Bloque 11, H-07: producción corre detrás del proxy de Railway — sin esto, Express ve la
  // IP interna del proxy en vez de la del cliente real, y el rate-limiting por IP de
  // POST /auth/login (ver AuthModule/AuthController) terminaría agrupando a todos los
  // usuarios reales bajo una única IP aparente, inutilizando el límite. `INestApplication`
  // genérico no tipa `.set()` (es un método propio de Express) — se accede vía el adapter
  // HTTP subyacente, sin cambiar el tipo de `app` en ningún otro punto de este archivo.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Orden importa: Nest usa el primer filtro cuyo @Catch() matchee. PrismaExceptionFilter
  // (específico) va antes que AllExceptionsFilter (catch-all, A-04) para seguir resolviendo
  // los errores de Prisma con su propio mapeo de status/mensaje.
  app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());
  app.setGlobalPrefix("api/v1");
  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Backend escuchando en puerto ${port}`);
}
bootstrap();

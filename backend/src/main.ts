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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("api/v1");
  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Backend escuchando en puerto ${port}`);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { crearValidationPipe } from './common/validation-pipe.js';
import { construirConfigSwagger } from './common/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? false });
  app.useGlobalPipes(crearValidationPipe());

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, construirConfigSwagger()),
    { swaggerOptions: { persistAuthorization: true } },
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { crearValidationPipe } from './common/validation-pipe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? false });
  app.useGlobalPipes(crearValidationPipe());

  const documento = new DocumentBuilder()
    .setTitle('Aequo API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, documento));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Publica } from './auth/decoradores.js';

// Ruta de plantilla de NestJS: no forma parte de la API de Aequo, por eso se oculta de Swagger.
@Publica()
@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

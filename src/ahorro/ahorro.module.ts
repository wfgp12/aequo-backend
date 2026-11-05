import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { MetaAhorro, MetaAhorroSchema } from './meta-ahorro.schema.js';
import { MetasAhorroController } from './metas-ahorro.controller.js';
import { MetasAhorroService } from './metas-ahorro.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las metas del usuario.
@Module({
  imports: [IdempotenciaModule, MongooseModule.forFeature([{ name: MetaAhorro.name, schema: MetaAhorroSchema }])],
  controllers: [MetasAhorroController],
  providers: [MetasAhorroService],
})
export class AhorroModule {}

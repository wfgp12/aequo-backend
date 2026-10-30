import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriasModule } from '../categorias/categorias.module.js';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { Transaccion, TransaccionSchema } from './transaccion.schema.js';
import { TransaccionesController } from './transacciones.controller.js';
import { TransaccionesService } from './transacciones.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() lo descubra y lo borre.
@Module({
  imports: [MongooseModule.forFeature([{ name: Transaccion.name, schema: TransaccionSchema }]), CategoriasModule, IdempotenciaModule],
  controllers: [TransaccionesController],
  providers: [TransaccionesService],
  exports: [MongooseModule],
})
export class TransaccionesModule {}

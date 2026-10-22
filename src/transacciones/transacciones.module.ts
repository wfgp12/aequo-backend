import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaccion, TransaccionSchema } from './transaccion.schema.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() lo descubra y lo borre.
@Module({
  imports: [MongooseModule.forFeature([{ name: Transaccion.name, schema: TransaccionSchema }])],
  exports: [MongooseModule],
})
export class TransaccionesModule {}

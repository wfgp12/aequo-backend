import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Deuda, DeudaSchema } from './deuda.schema.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las deudas del usuario.
@Module({
  imports: [MongooseModule.forFeature([{ name: Deuda.name, schema: DeudaSchema }])],
})
export class DeudasModule {}

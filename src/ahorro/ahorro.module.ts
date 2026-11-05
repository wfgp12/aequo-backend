import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetaAhorro, MetaAhorroSchema } from './meta-ahorro.schema.js';

// Por ahora solo registra el modelo (así eliminarCuenta lo descubre); el CRUD llega en el paquete 4.1.2.
@Module({
  imports: [MongooseModule.forFeature([{ name: MetaAhorro.name, schema: MetaAhorroSchema }])],
})
export class AhorroModule {}

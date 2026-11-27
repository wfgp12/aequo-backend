import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { Deuda, DeudaSchema } from './deuda.schema.js';
import { DeudasController } from './deudas.controller.js';
import { DeudasService } from './deudas.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las deudas del usuario.
// Transaccion se lee y se escribe (cada préstamo es una) sin importar TransaccionesModule, como hace TarjetasModule.
@Module({
  imports: [
    IdempotenciaModule,
    MongooseModule.forFeature([
      { name: Deuda.name, schema: DeudaSchema },
      { name: Transaccion.name, schema: TransaccionSchema },
    ]),
  ],
  controllers: [DeudasController],
  providers: [DeudasService],
})
export class DeudasModule {}

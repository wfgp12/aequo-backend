import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { CargoRecurrente, CargoRecurrenteSchema } from './cargo-recurrente.schema.js';
import { CargosRecurrentesController } from './cargos-recurrentes.controller.js';
import { CompraCredito, CompraCreditoSchema } from './compra-credito.schema.js';
import { TarjetaCredito, TarjetaCreditoSchema } from './tarjeta-credito.schema.js';
import { TarjetasController } from './tarjetas.controller.js';
import { TarjetasService } from './tarjetas.service.js';

// Registrar los modelos aquí es lo que permite que AuthService.eliminarCuenta() borre las tarjetas, cargos y compras del usuario.
// Transaccion solo se lee (para saber si una tarjeta tiene pagos), como hace ReportesModule: sin importar TransaccionesModule.
@Module({
  imports: [
    IdempotenciaModule,
    MongooseModule.forFeature([
      { name: TarjetaCredito.name, schema: TarjetaCreditoSchema },
      { name: CargoRecurrente.name, schema: CargoRecurrenteSchema },
      { name: CompraCredito.name, schema: CompraCreditoSchema },
      { name: Transaccion.name, schema: TransaccionSchema },
    ]),
  ],
  controllers: [TarjetasController, CargosRecurrentesController],
  providers: [TarjetasService],
})
export class TarjetasModule {}

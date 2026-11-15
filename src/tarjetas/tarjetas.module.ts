import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriasModule } from '../categorias/categorias.module.js';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { CargoRecurrente, CargoRecurrenteSchema } from './cargo-recurrente.schema.js';
import { CargosRecurrentesController } from './cargos-recurrentes.controller.js';
import { CompraCredito, CompraCreditoSchema } from './compra-credito.schema.js';
import { ComprasController } from './compras.controller.js';
import { ComprasService } from './compras.service.js';
import { TarjetaCredito, TarjetaCreditoSchema } from './tarjeta-credito.schema.js';
import { TarjetasController } from './tarjetas.controller.js';
import { TarjetasService } from './tarjetas.service.js';

// Registrar los modelos aquí es lo que permite que AuthService.eliminarCuenta() borre las tarjetas, cargos y compras del usuario.
// Transaccion se lee (pagos de una tarjeta) y se escribe (la transacción de dinero recibido de un avance) sin importar
// TransaccionesModule, como hace ReportesModule. CategoriasModule da la validación de la categoría de una compra.
@Module({
  imports: [
    IdempotenciaModule,
    CategoriasModule,
    MongooseModule.forFeature([
      { name: TarjetaCredito.name, schema: TarjetaCreditoSchema },
      { name: CargoRecurrente.name, schema: CargoRecurrenteSchema },
      { name: CompraCredito.name, schema: CompraCreditoSchema },
      { name: Transaccion.name, schema: TransaccionSchema },
    ]),
  ],
  controllers: [TarjetasController, CargosRecurrentesController, ComprasController],
  providers: [TarjetasService, ComprasService],
})
export class TarjetasModule {}

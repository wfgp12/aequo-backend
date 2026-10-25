import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { Categoria, CategoriaSchema } from './categoria.schema.js';
import { CategoriasController } from './categorias.controller.js';
import { CategoriasService } from './categorias.service.js';
import { CategoriasSemilla } from './categorias-semilla.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las categorías personales.
// Se registra también el de Transaccion (el mismo esquema) para contar y reasignar movimientos sin que
// CategoriasModule dependa de TransaccionesModule, que a su vez depende de este.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Categoria.name, schema: CategoriaSchema },
      { name: Transaccion.name, schema: TransaccionSchema },
    ]),
  ],
  controllers: [CategoriasController],
  providers: [CategoriasService, CategoriasSemilla],
  exports: [MongooseModule, CategoriasService],
})
export class CategoriasModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Categoria, CategoriaSchema } from './categoria.schema.js';
import { CategoriasSemilla } from './categorias-semilla.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las categorías personales.
@Module({
  imports: [MongooseModule.forFeature([{ name: Categoria.name, schema: CategoriaSchema }])],
  providers: [CategoriasSemilla],
  exports: [MongooseModule],
})
export class CategoriasModule {}

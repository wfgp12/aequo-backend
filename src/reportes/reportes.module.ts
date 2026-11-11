import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriasModule } from '../categorias/categorias.module.js';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';

// Lee transacciones: registra su modelo (el mismo esquema) para no depender de TransaccionesModule. Los nombres de
// las categorías los pide a CategoriasService.
@Module({
  imports: [CategoriasModule, MongooseModule.forFeature([{ name: Transaccion.name, schema: TransaccionSchema }])],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaccion, TransaccionSchema } from '../transacciones/transaccion.schema.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';

// Solo lee transacciones: registra su modelo (el mismo esquema) para no depender de TransaccionesModule.
@Module({
  imports: [MongooseModule.forFeature([{ name: Transaccion.name, schema: TransaccionSchema }])],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}

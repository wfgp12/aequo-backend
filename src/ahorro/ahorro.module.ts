import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotenciaModule } from '../idempotencia/idempotencia.module.js';
import { ReportesModule } from '../reportes/reportes.module.js';
import { MetaAhorro, MetaAhorroSchema } from './meta-ahorro.schema.js';
import { MetasAhorroController } from './metas-ahorro.controller.js';
import { MetasAhorroService } from './metas-ahorro.service.js';
import { ProgresoAhorroController } from './progreso-ahorro.controller.js';
import { ProgresoAhorroService } from './progreso-ahorro.service.js';

// Registrar el modelo aquí es lo que permite que AuthService.eliminarCuenta() borre las metas del usuario.
// El progreso reutiliza ReportesService para no duplicar la regla de flujo de caja (ReportesModule no importa Ahorro).
@Module({
  imports: [
    IdempotenciaModule,
    ReportesModule,
    MongooseModule.forFeature([{ name: MetaAhorro.name, schema: MetaAhorroSchema }]),
  ],
  controllers: [MetasAhorroController, ProgresoAhorroController],
  providers: [MetasAhorroService, ProgresoAhorroService],
})
export class AhorroModule {}

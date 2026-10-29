import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotenciaInterceptor } from './idempotencia.interceptor.js';
import { Idempotencia, IdempotenciaSchema } from './idempotencia.schema.js';

// Los módulos con peticiones de creación lo importan para poder usar @Idempotente(). Registrar el modelo aquí también
// permite que AuthService.eliminarCuenta() borre las claves del usuario.
@Module({
  imports: [MongooseModule.forFeature([{ name: Idempotencia.name, schema: IdempotenciaSchema }])],
  providers: [IdempotenciaInterceptor],
  exports: [MongooseModule, IdempotenciaInterceptor],
})
export class IdempotenciaModule {}

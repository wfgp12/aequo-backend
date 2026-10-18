import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { AuthModule } from './auth.module.js';
import { DevAuthController } from './dev-auth.controller.js';

/** Doble llave: solo con NODE_ENV=development (nunca por defecto) y la bandera explícita. */
export const devSessionHabilitada = (env: NodeJS.ProcessEnv): boolean =>
  env.NODE_ENV === 'development' && env.DEV_SESSION_ENABLED === 'true';

// Se registra solo mediante ConditionalModule.registerWhen(DevSessionModule, devSessionHabilitada) en AppModule.
@Module({ imports: [AuthModule], controllers: [DevAuthController] })
export class DevSessionModule implements OnModuleInit {
  onModuleInit() {
    new Logger(DevSessionModule.name).warn(
      'Sesión de prueba HABILITADA (POST /auth/dev-login). Solo para desarrollo.',
    );
  }
}

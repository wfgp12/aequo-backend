import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { construirMongoUri } from './database/mongodb-uri.js';
import { TransaccionesModule } from './transacciones/transacciones.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import {
  DevSessionModule,
  devSessionHabilitada,
} from './auth/dev-session.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: construirMongoUri({
          usuario: config.getOrThrow<string>('MONGODB_USER'),
          clave: config.getOrThrow<string>('MONGODB_PASSWORD'),
          host: config.getOrThrow<string>('MONGODB_HOST'),
        }),
      }),
    }),
    AuthModule,
    UsuariosModule,
    TransaccionesModule,
    ConditionalModule.registerWhen(DevSessionModule, devSessionHabilitada),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

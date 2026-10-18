import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Usuario, UsuarioSchema } from '../usuarios/usuario.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService, SESION_SEGUNDOS } from './auth.service.js';
import { firebaseAuthProvider } from './firebase-auth.provider.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Usuario.name, schema: UsuarioSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESION_SEGUNDOS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, firebaseAuthProvider],
  exports: [AuthService],
})
export class AuthModule {}

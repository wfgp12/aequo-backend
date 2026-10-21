import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Usuario, UsuarioSchema } from '../usuarios/usuario.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService, SESION_SEGUNDOS } from './auth.service.js';
import { firebaseAuthProvider } from './firebase-auth.provider.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Usuario.name, schema: UsuarioSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: SESION_SEGUNDOS },
        // Solo HS256 al validar: evita tokens con otro algoritmo (por ejemplo "none").
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, firebaseAuthProvider],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

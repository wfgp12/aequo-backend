import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsuariosController } from './usuarios.controller.js';

@Module({ imports: [AuthModule], controllers: [UsuariosController] })
export class UsuariosModule {}

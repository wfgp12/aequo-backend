import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module.js';
import { FIREBASE_AUTH } from '../auth/firebase-auth.provider.js';
import { TokenService } from '../auth/token.service.js';
import { crearValidationPipe } from '../common/validation-pipe.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { UsuariosController } from '../usuarios/usuarios.controller.js';
import {
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
} from '../../test/comun/ayudas.js';
import { ColeccionEnMemoria } from '../../test/comun/coleccion-memoria.js';
import { DeudaSchema } from './deuda.schema.js';

// Paquete 6.1.1 (RF-34): las deudas se borran al eliminar la cuenta (RF-04).
describe('Deudas: eliminación de la cuenta (RF-04)', () => {
  let app: INestApplication;
  let deudas: ColeccionEnMemoria;
  let tokenA: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    deudas = new ColeccionEnMemoria(DeudaSchema, 'Deuda');
    // Lo que eliminarCuenta necesita de la conexión: los modelos registrados y su esquema (descubre solo los que declaran usuarioId).
    const usuarios = {
      schema: new mongoose.Schema({ firebaseUid: String }),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
      db: {
        modelNames: () => ['Usuario', 'Deuda'],
        model: (nombre: string) => (nombre === 'Usuario' ? usuarios : deudas),
      },
    };
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
      ],
      controllers: [UsuariosController],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue(usuarios)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    await app.init();
    tokenA = app.get(TokenService).generar(USUARIO_ID);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('CA-RF34-13 al eliminar la cuenta se borran sus deudas, activas y saldadas, y las de otro usuario quedan intactas', async () => {
    await deudas.create({ usuarioId: USUARIO_ID, acreedor: 'Juan Pérez' });
    await deudas.create({
      usuarioId: USUARIO_ID,
      acreedor: 'Ana Gómez',
      saldada: true,
    });
    await deudas.create({ usuarioId: OTRO_USUARIO_ID, acreedor: 'Juan Pérez' });

    const respuesta = await request(app.getHttpServer())
      .delete('/usuarios/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(respuesta.status).toBe(204);
    expect(deudas.docs.map((doc) => String(doc.usuarioId))).toEqual([
      OTRO_USUARIO_ID,
    ]);
  });
});

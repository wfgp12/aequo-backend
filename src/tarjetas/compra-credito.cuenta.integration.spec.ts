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
import { ComprasEnMemoria } from '../../test/tarjetas/colecciones-compras.js';

// Paquete 5.2.1 (RF-26, RF-28): las compras con tarjeta y los avances se borran al eliminar la cuenta (RF-04).
describe('Compras con tarjeta: eliminación de la cuenta (RF-04)', () => {
  let app: INestApplication;
  let compras: ComprasEnMemoria;
  let tokenA: string;

  const compra = (
    usuarioId: string,
    cambios: Record<string, unknown> = {},
  ) => ({
    usuarioId,
    tarjetaId: new mongoose.Types.ObjectId(),
    categoriaId: new mongoose.Types.ObjectId(),
    descripcion: 'Televisor',
    valor: 1254700,
    cuotas: 12,
    fecha: new Date('2026-11-10T15:00:00.000Z'),
    primerPago: new Date('2026-12-01T00:00:00.000Z'),
    tasaEAAplicada: 0.2921,
    cuotaUnicaSinInteres: false,
    ...cambios,
  });

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    compras = new ComprasEnMemoria();
    // Lo que eliminarCuenta necesita de la conexión: los modelos registrados y su esquema (descubre solo los que declaran usuarioId).
    const usuarios = {
      schema: new mongoose.Schema({ firebaseUid: String }),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
      db: {
        modelNames: () => ['Usuario', 'CompraCredito'],
        model: (nombre: string) => (nombre === 'Usuario' ? usuarios : compras),
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

  it('CA-RF26-31 al eliminar la cuenta se borran todas sus compras y avances y las de otro usuario quedan intactas', async () => {
    await compras.create(compra(USUARIO_ID));
    await compras.create(
      compra(USUARIO_ID, {
        tipo: 'AVANCE',
        descripcion: 'Avance en efectivo',
        valor: 500000,
        cuotas: 6,
      }),
    );
    await compras.create(compra(OTRO_USUARIO_ID));
    await compras.create(
      compra(OTRO_USUARIO_ID, { tipo: 'AVANCE', valor: 200000, cuotas: 3 }),
    );

    const respuesta = await request(app.getHttpServer())
      .delete('/usuarios/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(respuesta.status).toBe(204);
    expect(compras.docs.map((doc) => String(doc.usuarioId))).toEqual([
      OTRO_USUARIO_ID,
      OTRO_USUARIO_ID,
    ]);
    expect(
      compras.docs.map((doc) => doc.valor as number).sort((a, b) => a - b),
    ).toEqual([200000, 1254700]);
  });
});

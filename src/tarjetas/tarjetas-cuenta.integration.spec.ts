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
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../../test/comun/ayudas.js';
import { CargosEnMemoria, TarjetasEnMemoria } from '../../test/tarjetas/colecciones-tarjetas.js';

describe('Tarjetas y cargos fijos: eliminación de la cuenta (RF-04)', () => {
  let app: INestApplication;
  let tarjetas: TarjetasEnMemoria;
  let cargos: CargosEnMemoria;
  let tokenA: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    tarjetas = new TarjetasEnMemoria();
    cargos = new CargosEnMemoria();
    // Lo que eliminarCuenta necesita de la conexión: los modelos registrados y su esquema (descubre solo los que declaran usuarioId).
    const colecciones: Record<string, unknown> = { TarjetaCredito: tarjetas, CargoRecurrente: cargos };
    const usuarios = {
      schema: new mongoose.Schema({ firebaseUid: String }),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
      db: {
        modelNames: () => ['Usuario', 'TarjetaCredito', 'CargoRecurrente'],
        model: (nombre: string) => (nombre === 'Usuario' ? usuarios : colecciones[nombre]),
      },
    };
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule],
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

  const eliminarCuenta = () =>
    request(app.getHttpServer()).delete('/usuarios/me').set('Authorization', `Bearer ${tokenA}`);

  it('CA-RF24-38 al eliminar la cuenta se borran todas sus tarjetas y las de otro usuario quedan intactas', async () => {
    await tarjetas.create({ usuarioId: USUARIO_ID, nombre: 'Visa', tasaEA: 0.2921 });
    await tarjetas.create({ usuarioId: USUARIO_ID, nombre: 'Mastercard', tasaEA: 0.3 });
    await tarjetas.create({ usuarioId: OTRO_USUARIO_ID, nombre: 'Visa', tasaEA: 0.25 });

    const respuesta = await eliminarCuenta();

    expect(respuesta.status).toBe(204);
    expect(tarjetas.docs.map((doc) => String(doc.usuarioId))).toEqual([OTRO_USUARIO_ID]);
    expect(tarjetas.docs[0].tasaEA).toBe(0.25);
  });

  it('CA-RF29-38 al eliminar la cuenta se borran todos sus cargos, activos e inactivos, y los de otro usuario quedan intactos', async () => {
    const tarjetaA = new mongoose.Types.ObjectId();
    const tarjetaB = new mongoose.Types.ObjectId();
    await cargos.create({ usuarioId: USUARIO_ID, tarjetaId: tarjetaA, descripcion: 'Netflix', valor: 38900 });
    await cargos.create({
      usuarioId: USUARIO_ID,
      tarjetaId: tarjetaA,
      descripcion: 'Spotify',
      valor: 19900,
      activo: false,
    });
    await cargos.create({ usuarioId: OTRO_USUARIO_ID, tarjetaId: tarjetaB, descripcion: 'Netflix', valor: 38900 });

    const respuesta = await eliminarCuenta();

    expect(respuesta.status).toBe(204);
    expect(cargos.docs.map((doc) => String(doc.usuarioId))).toEqual([OTRO_USUARIO_ID]);
    expect(cargos.docs[0].valor).toBe(38900);
  });
});

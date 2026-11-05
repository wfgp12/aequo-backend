import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
  MetasEnMemoria,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  usarEntorno,
} from '../../test/ahorro/arnes-metas.js';

const ERROR_401 = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

describe('Metas de ahorro: sesión y datos del usuario (integración)', () => {
  describe('sin sesión válida', () => {
    const entorno = usarEntorno();

    const sesiones: Array<[string, () => string | null]> = [
      ['sin el header Authorization', () => null],
      ['con un token que no emitió este backend', () => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa'],
      [
        'con un token vencido',
        () =>
          new JwtService({ secret: SECRETO_JWT, signOptions: { algorithm: 'HS256' } }).sign(
            { sub: USUARIO_ID },
            { expiresIn: -10 },
          ),
      ],
    ];

    it.each(sesiones)('CA-RF21-63 las cinco rutas responden 401 %s y no cambian nada', async (_caso, obtenerToken) => {
      const id = await entorno.sembrar({ valorObjetivo: 20, periodo: '2026-11' });
      const token = obtenerToken();
      const nueva = { tipoMeta: 'PORCENTAJE', valorObjetivo: 30, periodo: '2026-12' };

      const respuestas = await Promise.all([
        entorno.crear(nueva, { token }),
        entorno.listar('', token),
        entorno.obtener(id, token),
        entorno.editar(id, { valorObjetivo: 25 }, token),
        entorno.eliminar(id, token),
      ]);

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(401);
        expect(respuesta.body).toEqual(ERROR_401);
      }
      expect(entorno.metas.docs).toHaveLength(1);
      expect(entorno.guardada(id)).toMatchObject({ valorObjetivo: 20 });
    });
  });

  describe('eliminación de la cuenta (RF-04)', () => {
    let app: INestApplication;
    let metas: MetasEnMemoria;
    let tokenA: string;

    beforeEach(async () => {
      vi.stubEnv('JWT_SECRET', SECRETO_JWT);
      metas = new MetasEnMemoria();
      // Lo que eliminarCuenta necesita de la conexión: los modelos registrados y su esquema (descubre solo los que declaran usuarioId).
      const usuarios = {
        schema: new mongoose.Schema({ firebaseUid: String }),
        deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
        db: {
          modelNames: () => ['Usuario', 'MetaAhorro'],
          model: (nombre: string) => (nombre === 'Usuario' ? usuarios : metas),
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
      const tokens = app.get(TokenService);
      tokenA = tokens.generar(USUARIO_ID);
    });

    afterEach(async () => {
      await app?.close();
      vi.unstubAllEnvs();
    });

    it('CA-RF21-64 al eliminar la cuenta se borran todas sus metas, también las que tienen ahorro registrado, y las de otro usuario quedan intactas', async () => {
      await metas.create({ usuarioId: USUARIO_ID, tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-10-01', ahorroReal: 0 });
      await metas.create({ usuarioId: USUARIO_ID, tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-11-01', ahorroReal: 150000 });
      await metas.create({ usuarioId: OTRO_USUARIO_ID, tipoMeta: 'PORCENTAJE', valorObjetivo: 15, periodo: '2026-11-01', ahorroReal: 5000 });

      const respuesta = await request(app.getHttpServer()).delete('/usuarios/me').set('Authorization', `Bearer ${tokenA}`);

      expect(respuesta.status).toBe(204);
      expect(metas.docs.map((doc) => String(doc.usuarioId))).toEqual([OTRO_USUARIO_ID]);
      expect(metas.docs[0].valorObjetivo).toBe(15);
    });
  });
});

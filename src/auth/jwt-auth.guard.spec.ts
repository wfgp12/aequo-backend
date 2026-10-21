import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Publica, UsuarioActual } from './decoradores.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokenService } from './token.service.js';

const SECRETO = 'secreto-solo-para-pruebas';
const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const ERROR_401 = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

@Controller('prueba')
class ControladorDePrueba {
  @Get('protegida')
  protegida(@UsuarioActual() usuarioId: string) {
    return { usuarioId };
  }

  @Publica()
  @Get('publica')
  publica() {
    return { ok: true };
  }
}

const opcionesJwt = {
  secret: SECRETO,
  signOptions: { algorithm: 'HS256' as const, expiresIn: 86400 },
  verifyOptions: { algorithms: ['HS256' as const] },
};

describe('JwtAuthGuard (guard global de sesión)', () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register(opcionesJwt)],
      controllers: [ControladorDePrueba],
      providers: [TokenService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(() => app.close());

  const protegida = (autorizacion?: string) => {
    const peticion = request(app.getHttpServer()).get('/prueba/protegida');
    return autorizacion === undefined ? peticion : peticion.set('Authorization', autorizacion);
  };

  describe('ruta protegida con sesión válida', () => {
    it('responde 200 y deja el id del usuario disponible con @UsuarioActual()', async () => {
      await protegida(`Bearer ${tokens.generar(USUARIO_ID)}`).expect(200, { usuarioId: USUARIO_ID });
    });

    it('acepta el esquema Bearer sin distinguir mayúsculas', async () => {
      await protegida(`bearer ${tokens.generar(USUARIO_ID)}`).expect(200);
    });
  });

  describe('ruta protegida sin sesión válida: siempre 401 con el mismo cuerpo', () => {
    const casos: Array<[string, () => string | undefined]> = [
      ['sin header Authorization', () => undefined],
      ['header vacío', () => ''],
      ['esquema distinto de Bearer', () => `Basic ${tokens.generar(USUARIO_ID)}`],
      ['Bearer sin token', () => 'Bearer'],
      ['Bearer con espacios y sin token', () => 'Bearer    '],
      ['token que no es un JWT', () => 'Bearer no-es-un-jwt'],
      ['token vencido', () => `Bearer ${new JwtService(opcionesJwt).sign({ sub: USUARIO_ID }, { expiresIn: -10 })}`],
      [
        'token manipulado',
        () => {
          const [cabecera, , firma] = tokens.generar(USUARIO_ID).split('.');
          const payload = Buffer.from(JSON.stringify({ sub: 'otro', exp: 9999999999 })).toString('base64url');
          return `Bearer ${[cabecera, payload, firma].join('.')}`;
        },
      ],
      [
        'token firmado con otro secreto',
        () => `Bearer ${new JwtService({ ...opcionesJwt, secret: 'otro' }).sign({ sub: USUARIO_ID })}`,
      ],
    ];

    it.each(casos)('%s', async (_nombre, autorizacion) => {
      const { status, body } = await protegida(autorizacion());

      expect(status).toBe(401);
      expect(body).toEqual(ERROR_401);
    });
  });

  it('deja pasar sin sesión a las rutas marcadas con @Publica()', async () => {
    await request(app.getHttpServer()).get('/prueba/publica').expect(200, { ok: true });
  });
});

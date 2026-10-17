import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('POST /auth/login', () => {
  let app: INestApplication;
  const login = vi.fn();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('responde 200 con el resultado del servicio', async () => {
    const respuesta = { accessToken: 'jwt', expiresIn: 86400, usuario: { id: '1' } };
    login.mockResolvedValue(respuesta);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'token' })
      .expect(200, respuesta);
    expect(login).toHaveBeenCalledWith('token');
  });

  it.each([{}, { idToken: '' }, { idToken: 123 }])(
    'responde 400 con message como arreglo si el body es inválido (%j)',
    async (body) => {
      const { body: error } = await request(app.getHttpServer())
        .post('/auth/login')
        .send(body)
        .expect(400);
      expect(error.statusCode).toBe(400);
      expect(Array.isArray(error.message)).toBe(true);
    },
  );
});

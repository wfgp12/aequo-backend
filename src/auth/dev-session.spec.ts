import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { DevSessionModule, devSessionHabilitada } from './dev-session.module.js';

describe('devSessionHabilitada', () => {
  it.each([
    [{ NODE_ENV: 'development', DEV_SESSION_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'production', DEV_SESSION_ENABLED: 'true' }, false],
    [{ NODE_ENV: 'test', DEV_SESSION_ENABLED: 'true' }, false],
    [{ DEV_SESSION_ENABLED: 'true' }, false],
    [{ NODE_ENV: 'development' }, false],
    [{ NODE_ENV: 'development', DEV_SESSION_ENABLED: 'false' }, false],
    [{}, false],
  ])('%j → %s', (env, esperado) => {
    expect(devSessionHabilitada(env as NodeJS.ProcessEnv)).toBe(esperado);
  });
});

describe('POST /auth/dev-login', () => {
  const respuesta = { accessToken: 'jwt', expiresIn: 86400, usuario: { id: '1' } };
  const loginDePrueba = vi.fn().mockResolvedValue(respuesta);

  // Sustituye AuthModule para no necesitar MongoDB ni Firebase; DevSessionModule y su controlador son los reales.
  @Module({
    providers: [{ provide: AuthService, useValue: { loginDePrueba } }],
    exports: [AuthService],
  })
  class AuthFalsoModule {}

  async function crearApp() {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        ConditionalModule.registerWhen(DevSessionModule, devSessionHabilitada, { debug: false }),
      ],
    })
      .overrideModule(AuthModule)
      .useModule(AuthFalsoModule)
      .compile();
    const app = modulo.createNestApplication();
    await app.init();
    return app;
  }

  afterEach(() => vi.unstubAllEnvs());

  it('en producción la ruta no existe (404), aunque la bandera esté activa', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_SESSION_ENABLED', 'true');
    const app = await crearApp();

    await request(app.getHttpServer()).post('/auth/dev-login').expect(404);
    expect(loginDePrueba).not.toHaveBeenCalled();
    await app.close();
  });

  it('en desarrollo con la bandera activa devuelve la sesión de prueba', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_SESSION_ENABLED', 'true');
    const app = await crearApp();

    await request(app.getHttpServer()).post('/auth/dev-login').expect(200, respuesta);
    await app.close();
  });
});

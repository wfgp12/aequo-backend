import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Usuario } from '../usuarios/usuario.schema.js';
import { AuthModule } from './auth.module.js';
import { FIREBASE_AUTH } from './firebase-auth.provider.js';

const compilarAuth = () =>
  Test.createTestingModule({
    imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule],
  })
    .overrideProvider(getModelToken(Usuario.name))
    .useValue({})
    .overrideProvider(FIREBASE_AUTH)
    .useValue({})
    .compile();

describe('Configuración de la sesión', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('con JWT_SECRET el módulo de auth arranca', async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');

    await expect(compilarAuth()).resolves.toBeDefined();
  });

  it('sin JWT_SECRET el módulo falla al arrancar: nunca se firma con un secreto por defecto', async () => {
    vi.stubEnv('JWT_SECRET', undefined);

    await expect(compilarAuth()).rejects.toThrow(/JWT_SECRET/);
  });
});

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { crearValidationPipe } from '../common/validation-pipe.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { AuthModule } from './auth.module.js';
import { UsuariosController } from '../usuarios/usuarios.controller.js';
import { UsuarioActual } from './decoradores.js';
import { FIREBASE_AUTH } from './firebase-auth.provider.js';

/** Colección en memoria con la semántica de upsert que usa AuthService ($setOnInsert por firebaseUid). */
class UsuariosEnMemoria {
  readonly docs = new Map<string, Record<string, unknown>>();

  async findById(id: string) {
    return [...this.docs.values()].find((doc) => doc.id === id) ?? null;
  }

  findOneAndUpdate(
    filtro: { firebaseUid: string },
    update: { $setOnInsert: Record<string, unknown> },
  ) {
    return {
      orFail: async () => {
        if (!this.docs.has(filtro.firebaseUid)) {
          const id = String(this.docs.size + 1).padStart(24, '0');
          this.docs.set(filtro.firebaseUid, {
            id,
            firebaseUid: filtro.firebaseUid,
            ...update.$setOnInsert,
          });
        }
        return this.docs.get(filtro.firebaseUid);
      },
    };
  }
}

const errorDeFirebase = (code: string) => Object.assign(new Error(code), { code });

// Ruta protegida de prueba: el guard global lo aporta AuthModule, no este controlador.
@Controller('prueba')
class ControladorProtegido {
  @Get('protegida')
  protegida(@UsuarioActual() usuarioId: string) {
    return { usuarioId };
  }
}

describe('Flujo de login (integración: AuthModule real, Firebase y MongoDB simulados)', () => {
  let app: INestApplication;
  let usuarios: UsuariosEnMemoria;
  const verifyIdToken = vi.fn();

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    verifyIdToken.mockReset();
    usuarios = new UsuariosEnMemoria();

    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule],
      controllers: [ControladorProtegido, UsuariosController],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue(usuarios)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({ verifyIdToken })
      .compile();

    app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const login = (body: unknown) =>
    request(app.getHttpServer()).post('/auth/login').send(body as object);

  describe('sesión de punta a punta: login y luego una ruta protegida', () => {
    it('el accessToken del login abre una ruta protegida con el id del mismo usuario', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'wilhen@gmail.com', name: 'Wilhen' });

      const { body } = await login({ idToken: 'token-valido' });
      const respuesta = await request(app.getHttpServer())
        .get('/prueba/protegida')
        .set('Authorization', `Bearer ${body.accessToken}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ usuarioId: body.usuario.id });
    });

    it('la ruta protegida responde 401 sin token y con un token que no emitió este backend', async () => {
      const sinToken = await request(app.getHttpServer()).get('/prueba/protegida');
      const ajeno = await request(app.getHttpServer())
        .get('/prueba/protegida')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa');

      for (const respuesta of [sinToken, ajeno]) {
        expect(respuesta.status).toBe(401);
        expect(respuesta.body.message).toBe('Sesión inválida o vencida');
      }
    });

    it('el ID Token de Firebase no sirve como sesión en una ruta protegida', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/prueba/protegida')
        .set('Authorization', 'Bearer token-de-firebase');

      expect(respuesta.status).toBe(401);
      expect(verifyIdToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /usuarios/me: perfil del usuario autenticado', () => {
    const perfil = (autorizacion?: string) => {
      const peticion = request(app.getHttpServer()).get('/usuarios/me');
      return autorizacion ? peticion.set('Authorization', autorizacion) : peticion;
    };

    it('con el accessToken del login devuelve el perfil de ese usuario y solo ese', async () => {
      verifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', email: 'ana@gmail.com', name: 'Ana', picture: 'https://foto/ana.png' });
      verifyIdToken.mockResolvedValueOnce({ uid: 'uid-2', email: 'luis@gmail.com', name: 'Luis' });
      const ana = (await login({ idToken: 'a' })).body;
      const luis = (await login({ idToken: 'b' })).body;

      const deAna = await perfil(`Bearer ${ana.accessToken}`);
      const deLuis = await perfil(`Bearer ${luis.accessToken}`);

      expect(deAna.status).toBe(200);
      expect(deAna.body).toEqual({ id: ana.usuario.id, nombre: 'Ana', email: 'ana@gmail.com', fotoUrl: 'https://foto/ana.png' });
      expect(deLuis.body).toEqual({ id: luis.usuario.id, nombre: 'Luis', email: 'luis@gmail.com', fotoUrl: null });
    });

    it('no expone el UID de Firebase ni campos internos', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-secreto', email: 'ana@gmail.com', name: 'Ana' });
      const { body } = await login({ idToken: 'a' });

      const respuesta = await perfil(`Bearer ${body.accessToken}`);

      expect(Object.keys(respuesta.body).sort()).toEqual(['email', 'fotoUrl', 'id', 'nombre']);
      expect(JSON.stringify(respuesta.body)).not.toContain('uid-secreto');
    });

    it.each([
      ['sin token', undefined],
      ['con un token que no emitió este backend', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa'],
    ])('responde 401 %s', async (_caso, autorizacion) => {
      const respuesta = await perfil(autorizacion);

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toEqual({ statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' });
    });

    it('responde 401 si el JWT es válido pero el usuario ya no existe', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'ana@gmail.com', name: 'Ana' });
      const { body } = await login({ idToken: 'a' });
      usuarios.docs.clear();

      const respuesta = await perfil(`Bearer ${body.accessToken}`);

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.message).toBe('Sesión inválida o vencida');
    });
  });

  describe('flujo exitoso', () => {
    it('crea al usuario en el primer login y devuelve un JWT propio válido por 24 h', async () => {
      verifyIdToken.mockResolvedValue({
        uid: 'uid-1',
        email: 'wilhen@gmail.com',
        name: 'Wilhen',
        picture: 'https://foto/1.png',
      });

      const { body, status } = await login({ idToken: 'token-valido' });

      expect(status).toBe(200);
      expect(verifyIdToken).toHaveBeenCalledWith('token-valido', true);
      expect(body.expiresIn).toBe(86400);
      expect(body.usuario).toEqual({
        id: body.usuario.id,
        nombre: 'Wilhen',
        email: 'wilhen@gmail.com',
        fotoUrl: 'https://foto/1.png',
      });
      expect(usuarios.docs.size).toBe(1);

      const jwt = app.get(JwtService);
      const payload = await jwt.verifyAsync(body.accessToken);
      expect(payload.sub).toBe(body.usuario.id);
      expect(payload.exp - payload.iat).toBe(86400);
    });

    it('en un segundo login con el mismo UID recupera al usuario y no lo duplica', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'wilhen@gmail.com', name: 'Wilhen' });

      const primero = await login({ idToken: 'a' });
      const segundo = await login({ idToken: 'b' });

      expect(segundo.status).toBe(200);
      expect(segundo.body.usuario.id).toBe(primero.body.usuario.id);
      expect(usuarios.docs.size).toBe(1);
    });

    it('identifica por UID, no por correo: otro UID con el mismo correo es otro usuario', async () => {
      verifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', email: 'mismo@gmail.com', name: 'A' });
      verifyIdToken.mockResolvedValueOnce({ uid: 'uid-2', email: 'mismo@gmail.com', name: 'B' });

      const a = await login({ idToken: 'a' });
      const b = await login({ idToken: 'b' });

      expect(b.body.usuario.id).not.toBe(a.body.usuario.id);
      expect(usuarios.docs.size).toBe(2);
    });

    it('usa la parte local del correo como nombre si Google no trae displayName', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-3', email: 'ana.perez@gmail.com' });

      const { body } = await login({ idToken: 'token' });

      expect(body.usuario.nombre).toBe('ana.perez');
      expect(body.usuario.fotoUrl).toBeNull();
    });
  });

  describe('escenarios de fallo', () => {
    it.each(['auth/argument-error', 'auth/id-token-expired', 'auth/id-token-revoked'])(
      'responde 401 y no crea usuario si Firebase rechaza el token (%s)',
      async (code) => {
        verifyIdToken.mockRejectedValue(errorDeFirebase(code));

        const { body, status } = await login({ idToken: 'malo' });

        expect(status).toBe(401);
        expect(body).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'ID Token inválido o vencido',
        });
        expect(usuarios.docs.size).toBe(0);
      },
    );

    it('responde 401 si el token no trae correo', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-4' });

      const { status } = await login({ idToken: 'sin-correo' });

      expect(status).toBe(401);
      expect(usuarios.docs.size).toBe(0);
    });

    it('responde 500 (no 401) si Firebase falla por algo que no es el token', async () => {
      verifyIdToken.mockRejectedValue(errorDeFirebase('app/network-error'));

      const { status } = await login({ idToken: 'token' });

      expect(status).toBe(500);
    });

    it.each([
      ['sin idToken', {}],
      ['idToken vacío', { idToken: '' }],
      ['idToken que no es texto', { idToken: 123 }],
      ['idToken con operador de MongoDB', { idToken: { $ne: null } }],
      ['campo desconocido', { idToken: 'token', admin: true }],
    ])('responde 400 sin llegar a Firebase: %s', async (_caso, body) => {
      const respuesta = await login(body);

      expect(respuesta.status).toBe(400);
      expect(Array.isArray(respuesta.body.message)).toBe(true);
      expect(verifyIdToken).not.toHaveBeenCalled();
      expect(usuarios.docs.size).toBe(0);
    });
  });
});

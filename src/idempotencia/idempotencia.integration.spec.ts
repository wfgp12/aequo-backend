import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module.js';
import { FIREBASE_AUTH } from '../auth/firebase-auth.provider.js';
import { TokenService } from '../auth/token.service.js';
import { Categoria } from '../categorias/categoria.schema.js';
import { crearValidationPipe } from '../common/validation-pipe.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../transacciones/transacciones.module.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { calcularHuella } from './huella.js';
import { Idempotencia } from './idempotencia.schema.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
const ObjectId = mongoose.Types.ObjectId;

type Doc = Record<string, any>;

/** Claves en memoria con la garantía que da el índice único de MongoDB: dos altas simultáneas de la misma clave no pasan. */
class IdempotenciasEnMemoria {
  docs: Doc[] = [];

  async create(datos: Doc) {
    await Promise.resolve();
    if (this.docs.some((d) => String(d.usuarioId) === String(datos.usuarioId) && d.clave === datos.clave)) {
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }
    const doc = { _id: new ObjectId(), respuesta: null, createdAt: new Date(), ...datos };
    this.docs.push(doc);
    return doc;
  }

  async findOne({ usuarioId, clave }: Doc) {
    return this.docs.find((d) => String(d.usuarioId) === String(usuarioId) && d.clave === clave) ?? null;
  }

  async updateOne({ _id }: Doc, cambios: Doc) {
    Object.assign(this.docs.find((d) => String(d._id) === String(_id)) ?? {}, cambios);
  }

  async deleteOne({ _id }: Doc) {
    this.docs = this.docs.filter((d) => String(d._id) !== String(_id));
  }
}

/** Transacciones en memoria; se puede hacer lenta (para simular una petición todavía en proceso) o fallar una vez. */
class TransaccionesEnMemoria {
  docs: Doc[] = [];
  retardoMs = 0;
  fallarLaProxima = false;

  // Para el listado: una consulta de Mongoose se puede `await`ear directamente, por eso este objeto es "thenable" a propósito.
  find() {
    const consulta = {
      sort: () => consulta,
      limit: () => consulta,
      // oxlint-disable-next-line unicorn/no-thenable
      then: (ok: (v: Doc[]) => unknown, fallo: (e: unknown) => unknown) => Promise.resolve([]).then(ok, fallo),
    };
    return consulta;
  }

  async create(datos: Doc) {
    if (this.retardoMs) await new Promise((resolver) => setTimeout(resolver, this.retardoMs));
    if (this.fallarLaProxima) {
      this.fallarLaProxima = false;
      throw new Error('MongoDB no disponible');
    }
    const doc = {
      ...datos,
      id: new ObjectId().toString(),
      tarjetaId: null,
      deudaId: null,
      createdAt: new Date('2026-10-20T15:30:00.000Z'),
    };
    this.docs.push(doc);
    return doc;
  }
}

const categoriaGeneral = (() => {
  const _id = new ObjectId();
  return { _id, id: _id.toString(), usuarioId: null, nombre: 'Alimentación', tipo: 'EGRESO', esPredeterminada: true };
})();

const cuerpo = (cambios: Doc = {}) => ({
  tipo: 'EGRESO',
  monto: 45000,
  fecha: '2026-10-20',
  categoriaId: categoriaGeneral.id,
  metodoPago: 'EFECTIVO',
  ...cambios,
});

describe('Deduplicación de peticiones con Idempotency-Key (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let claves: IdempotenciasEnMemoria;
  let transacciones: TransaccionesEnMemoria;
  let token: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    claves = new IdempotenciasEnMemoria();
    transacciones = new TransaccionesEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, TransaccionesModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue({
        findById: async (id: string) => (id === categoriaGeneral.id ? categoriaGeneral : null),
        countDocuments: async () => 1,
      })
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    await app.init();
    token = app.get(TokenService).generar(USUARIO_ID);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const crear = (datos: unknown, clave?: string, conToken: string = token, ruta = '/transacciones') => {
    const peticion = request(app.getHttpServer()).post(ruta).set('Authorization', `Bearer ${conToken}`);
    if (clave !== undefined) peticion.set('Idempotency-Key', clave);
    return peticion.send(datos as object);
  };

  describe('repetir la misma petición', () => {
    it('con la misma clave no crea una segunda transacción y devuelve la misma respuesta, marcada como repetida', async () => {
      const clave = randomUUID();

      const primera = await crear(cuerpo(), clave);
      const segunda = await crear(cuerpo(), clave);

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body).toEqual(primera.body);
      expect(transacciones.docs).toHaveLength(1);
      expect(primera.headers['idempotent-replayed']).toBeUndefined();
      expect(segunda.headers['idempotent-replayed']).toBe('true');
    });

    it('puede repetirse muchas veces: siempre la misma respuesta y una sola transacción', async () => {
      const clave = randomUUID();
      const primera = await crear(cuerpo(), clave);

      const repeticiones = await Promise.all([1, 2, 3].map(() => crear(cuerpo(), clave).then((r) => r.body.id)));
      // Tras la primera, ninguna repetición crea nada; si alguna coincidió con una en proceso, el resultado sigue siendo el mismo id.
      expect(repeticiones.every((id) => id === primera.body.id)).toBe(true);
      expect(transacciones.docs).toHaveLength(1);
    });

    it('el orden de los campos del cuerpo no importa', async () => {
      const clave = randomUUID();
      await crear(cuerpo(), clave);

      const reordenado = {
        metodoPago: 'EFECTIVO',
        categoriaId: categoriaGeneral.id,
        fecha: '2026-10-20',
        monto: 45000,
        tipo: 'EGRESO',
      };
      const segunda = await crear(reordenado, clave);

      expect(segunda.status).toBe(201);
      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(transacciones.docs).toHaveLength(1);
    });

    it('la cabecera se reconoce sin importar mayúsculas', async () => {
      const clave = randomUUID();
      await request(app.getHttpServer())
        .post('/transacciones')
        .set('Authorization', `Bearer ${token}`)
        .set('IDEMPOTENCY-KEY', clave)
        .send(cuerpo());

      const segunda = await crear(cuerpo(), clave);

      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(transacciones.docs).toHaveLength(1);
    });

    it('dos acciones distintas llevan claves distintas y crean dos transacciones, aunque el contenido sea idéntico', async () => {
      const a = await crear(cuerpo(), randomUUID());
      const b = await crear(cuerpo(), randomUUID());

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).not.toBe(b.body.id);
      expect(transacciones.docs).toHaveLength(2);
    });
  });

  describe('doble toque: dos peticiones simultáneas con la misma clave', () => {
    it('solo una se ejecuta: la otra recibe 409 mientras la primera está en proceso', async () => {
      transacciones.retardoMs = 60;
      const clave = randomUUID();

      const [a, b] = await Promise.all([crear(cuerpo(), clave), crear(cuerpo(), clave)]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(transacciones.docs).toHaveLength(1);
      const rechazada = a.status === 409 ? a : b;
      expect(rechazada.body).toEqual({
        statusCode: 409,
        message: 'La petición ya se está procesando: espera su resultado antes de reintentar',
        error: 'Conflict',
      });
    });

    it('al terminar la primera, un reintento con la misma clave recibe su respuesta, sin ejecutar nada', async () => {
      transacciones.retardoMs = 60;
      const clave = randomUUID();
      const [a, b] = await Promise.all([crear(cuerpo(), clave), crear(cuerpo(), clave)]);
      const ganadora = a.status === 201 ? a : b;

      const reintento = await crear(cuerpo(), clave);

      expect(reintento.status).toBe(201);
      expect(reintento.body).toEqual(ganadora.body);
      expect(reintento.headers['idempotent-replayed']).toBe('true');
      expect(transacciones.docs).toHaveLength(1);
    });

    it('una clave "en proceso" abandonada hace más de 2 minutos (el servidor se cayó) se puede reclamar de nuevo', async () => {
      const clave = randomUUID();
      claves.docs.push({
        _id: new ObjectId(),
        usuarioId: new ObjectId(USUARIO_ID),
        clave,
        huella: calcularHuella('POST', '/transacciones', cuerpo()),
        estado: 'EN_PROCESO',
        respuesta: null,
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      });

      const { status } = await crear(cuerpo(), clave);

      expect(status).toBe(201);
      expect(transacciones.docs).toHaveLength(1);
    });

    it('una clave "en proceso" reciente sigue bloqueando', async () => {
      const clave = randomUUID();
      claves.docs.push({
        _id: new ObjectId(),
        usuarioId: new ObjectId(USUARIO_ID),
        clave,
        huella: calcularHuella('POST', '/transacciones', cuerpo()),
        estado: 'EN_PROCESO',
        respuesta: null,
        createdAt: new Date(),
      });

      const { status } = await crear(cuerpo(), clave);

      expect(status).toBe(409);
      expect(transacciones.docs).toHaveLength(0);
    });
  });

  describe('la misma clave con otra petición: 422', () => {
    it.each([
      ['otro monto', () => cuerpo({ monto: 1 }), '/transacciones'],
      ['otro campo', () => cuerpo({ descripcion: 'otra cosa' }), '/transacciones'],
      ['otra ruta', () => ({ nombre: 'Mascotas', tipo: 'EGRESO' }), '/categorias'],
    ])('con %s: se rechaza y no se ejecuta nada', async (_caso, otroCuerpo, ruta) => {
      const clave = randomUUID();
      await crear(cuerpo(), clave);

      const { status, body } = await crear(otroCuerpo(), clave, token, ruta);

      expect(status).toBe(422);
      expect(body).toEqual({
        statusCode: 422,
        message: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
        error: 'Unprocessable Entity',
      });
      expect(transacciones.docs).toHaveLength(1);
    });
  });

  describe('si la primera petición falla, la clave se libera para poder reintentar', () => {
    it('tras un 400 de validación, la misma clave sirve para la petición corregida', async () => {
      const clave = randomUUID();

      const mala = await crear(cuerpo({ monto: 0 }), clave);
      const corregida = await crear(cuerpo({ monto: 45000 }), clave);

      expect(mala.status).toBe(400);
      expect(corregida.status).toBe(201);
      expect(corregida.headers['idempotent-replayed']).toBeUndefined();
      expect(transacciones.docs).toHaveLength(1);
    });

    it('tras un 500 inesperado, el reintento con la misma clave se ejecuta (y una sola vez)', async () => {
      const clave = randomUUID();
      transacciones.fallarLaProxima = true;

      const fallida = await crear(cuerpo(), clave);
      const reintento = await crear(cuerpo(), clave);
      const otraVez = await crear(cuerpo(), clave);

      expect(fallida.status).toBe(500);
      expect(reintento.status).toBe(201);
      expect(otraVez.headers['idempotent-replayed']).toBe('true');
      expect(transacciones.docs).toHaveLength(1);
    });

    it('una petición fallida no deja la clave guardada', async () => {
      await crear(cuerpo({ monto: -1 }), randomUUID());

      expect(claves.docs).toHaveLength(0);
    });
  });

  describe('la clave es por usuario', () => {
    it('otro usuario puede usar el mismo UUID sin chocar y sin recibir la respuesta ajena', async () => {
      const clave = randomUUID();
      const tokenOtro = app.get(TokenService).generar(OTRO_USUARIO_ID);

      const mia = await crear(cuerpo(), clave);
      const ajena = await crear(cuerpo(), clave, tokenOtro);

      expect(mia.status).toBe(201);
      expect(ajena.status).toBe(201);
      expect(ajena.body.id).not.toBe(mia.body.id);
      expect(ajena.headers['idempotent-replayed']).toBeUndefined();
      expect(transacciones.docs).toHaveLength(2);
    });
  });

  describe('sin el header Idempotency-Key', () => {
    it('modo opcional (por defecto): la petición se ejecuta normal y no se guarda ninguna clave', async () => {
      const a = await crear(cuerpo());
      const b = await crear(cuerpo());

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(transacciones.docs).toHaveLength(2);
      expect(claves.docs).toHaveLength(0);
    });

    it('modo obligatorio (IDEMPOTENCIA_OBLIGATORIA=true): responde 400 con un mensaje que empieza por Idempotency-Key', async () => {
      vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');

      const { status, body } = await crear(cuerpo());

      expect(status).toBe(400);
      expect(body.message).toEqual([
        'Idempotency-Key es obligatorio: envía un UUID distinto por cada acción del usuario',
      ]);
      expect(transacciones.docs).toHaveLength(0);
    });

    it('modo obligatorio: con el header la petición funciona', async () => {
      vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');

      const { status } = await crear(cuerpo(), randomUUID());

      expect(status).toBe(201);
    });
  });

  describe('header inválido', () => {
    it.each(['abc', '12345', '', 'no-es-un-uuid-valido-aaaa-bbbbbbbbbbbb', '0b9d3c1e-6a52-4f7e-9d8e-2c4f1a7b5e6'])(
      'responde 400 si Idempotency-Key no es un UUID (%j)',
      async (clave) => {
        const { status, body } = await crear(cuerpo(), clave);

        expect(status).toBe(400);
        expect(body.message).toEqual(['Idempotency-Key debe ser un UUID (por ejemplo, el de crypto.randomUUID())']);
        expect(transacciones.docs).toHaveLength(0);
      },
    );
  });

  it('el header no afecta a las peticiones que no crean datos', async () => {
    const { status } = await request(app.getHttpServer())
      .get('/transacciones')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cualquier-cosa');

    expect(status).toBe(200);
  });

  it('sin sesión válida responde 401 antes de mirar la clave, y no guarda nada', async () => {
    const { status } = await request(app.getHttpServer())
      .post('/transacciones')
      .set('Idempotency-Key', randomUUID())
      .send(cuerpo());

    expect(status).toBe(401);
    expect(claves.docs).toHaveLength(0);
  });
});

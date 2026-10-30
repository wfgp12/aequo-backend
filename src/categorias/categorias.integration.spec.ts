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
import { Idempotencia } from '../idempotencia/idempotencia.schema.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { Categoria } from './categoria.schema.js';
import { CategoriasModule } from './categorias.module.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
const ObjectId = mongoose.Types.ObjectId;

type Doc = Record<string, any>;

/** Evalúa los filtros simples que usa el servicio: igualdad y { $in } (que puede incluir null). */
const coincide = (doc: Doc, filtro: Doc) =>
  Object.entries(filtro).every(([campo, esperado]) => {
    const valor = doc[campo] === null || doc[campo] === undefined ? null : String(doc[campo]);
    if (esperado && typeof esperado === 'object' && '$in' in esperado) {
      return (esperado.$in as unknown[]).some((e) => (e === null ? valor === null : valor === String(e)));
    }
    return valor === (esperado === null ? null : String(esperado));
  });

/** Colección de categorías en memoria con lo que el servicio usa: find, findById, findOne, create, deleteOne y save. */
class CategoriasEnMemoria {
  docs: Doc[] = [];

  sembrar(nombre: string, tipo: string, usuarioId: string | null, extra: Doc = {}) {
    const _id = new ObjectId();
    const doc: Doc = {
      _id,
      id: _id.toString(),
      usuarioId: usuarioId ? new ObjectId(usuarioId) : null,
      nombre,
      tipo,
      esPredeterminada: usuarioId === null,
      esRespaldo: false,
      ...extra,
    };
    doc.save = async () => doc;
    this.docs.push(doc);
    return doc;
  }

  async find(filtro: Doc) {
    return this.docs.filter((doc) => coincide(doc, filtro));
  }

  async findOne(filtro: Doc) {
    return this.docs.find((doc) => coincide(doc, filtro)) ?? null;
  }

  async findById(id: string) {
    return this.docs.find((doc) => doc.id === id) ?? null;
  }

  async create(datos: Doc) {
    return this.sembrar(datos.nombre, datos.tipo, datos.usuarioId ? String(datos.usuarioId) : null, {
      esPredeterminada: datos.esPredeterminada,
      esRespaldo: datos.esRespaldo,
    });
  }

  async deleteOne({ _id }: Doc) {
    this.docs = this.docs.filter((doc) => String(doc._id) !== String(_id));
  }

  // La siembra del arranque consulta cuántas generales hay; con las de prueba, no siembra nada.
  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

/** Transacciones en memoria: lo que el servicio cuenta (aggregate) y reasigna (updateMany). */
class TransaccionesEnMemoria {
  docs: Array<{ usuarioId: string; categoriaId: string }> = [];

  async aggregate(pipeline: Doc[]) {
    const { usuarioId, categoriaId } = pipeline[0].$match;
    const ids = (categoriaId.$in as unknown[]).map(String);
    const cuentas = new Map<string, number>();
    for (const t of this.docs) {
      if (t.usuarioId === String(usuarioId) && ids.includes(t.categoriaId)) {
        cuentas.set(t.categoriaId, (cuentas.get(t.categoriaId) ?? 0) + 1);
      }
    }
    return [...cuentas].map(([_id, total]) => ({ _id, total }));
  }

  async updateMany(filtro: Doc, cambio: Doc) {
    for (const t of this.docs) {
      if (t.usuarioId === String(filtro.usuarioId) && t.categoriaId === String(filtro.categoriaId)) {
        t.categoriaId = String(cambio.categoriaId);
      }
    }
  }
}

describe('Categorías (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let categorias: CategoriasEnMemoria;
  let transacciones: TransaccionesEnMemoria;
  let token: string;
  let alimentacion: Doc;
  let otrosEgresos: Doc;
  let otrosIngresos: Doc;
  let sueldo: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    categorias = new CategoriasEnMemoria();
    transacciones = new TransaccionesEnMemoria();
    alimentacion = categorias.sembrar('Alimentación', 'EGRESO', null);
    otrosEgresos = categorias.sembrar('Otros egresos', 'EGRESO', null, { esRespaldo: true });
    otrosIngresos = categorias.sembrar('Otros ingresos', 'INGRESO', null, { esRespaldo: true });
    sueldo = categorias.sembrar('Sueldo', 'INGRESO', null);

    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, CategoriasModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      // El módulo de idempotencia registra su modelo; estas pruebas no envían Idempotency-Key, así que no se usa.
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue({})
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

  const llamar = (metodo: 'get' | 'post' | 'patch' | 'delete', ruta: string, cuerpo?: unknown, conToken = true) => {
    const peticion = request(app.getHttpServer())[metodo](ruta);
    if (conToken) peticion.set('Authorization', `Bearer ${token}`);
    return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
  };
  const ERROR_SESION = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

  describe('GET /categorias', () => {
    it('devuelve las generales y las del usuario, nunca las de otro, ordenadas por tipo, generales primero y por nombre', async () => {
      categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      categorias.sembrar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID);
      categorias.sembrar('Freelance', 'INGRESO', USUARIO_ID);

      const { status, body } = await llamar('get', '/categorias');

      expect(status).toBe(200);
      expect(body.items.map((c: Doc) => `${c.tipo}:${c.nombre}`)).toEqual([
        'EGRESO:Alimentación',
        'EGRESO:Otros egresos',
        'EGRESO:Mascotas',
        'INGRESO:Otros ingresos',
        'INGRESO:Sueldo',
        'INGRESO:Freelance',
      ]);
    });

    it('cada item trae id, nombre, tipo, esPredeterminada y movimientos, y nada interno', async () => {
      const { body } = await llamar('get', '/categorias?tipo=EGRESO');

      expect(Object.keys(body.items[0]).sort()).toEqual(['esPredeterminada', 'id', 'movimientos', 'nombre', 'tipo']);
      expect(body.items[0]).toEqual({
        id: alimentacion.id,
        nombre: 'Alimentación',
        tipo: 'EGRESO',
        esPredeterminada: true,
        movimientos: 0,
      });
    });

    it('el filtro tipo devuelve solo las de ese tipo', async () => {
      const egresos = (await llamar('get', '/categorias?tipo=EGRESO')).body.items;
      const ingresos = (await llamar('get', '/categorias?tipo=INGRESO')).body.items;

      expect(egresos.every((c: Doc) => c.tipo === 'EGRESO')).toBe(true);
      expect(ingresos.every((c: Doc) => c.tipo === 'INGRESO')).toBe(true);
      expect(egresos.length + ingresos.length).toBe(4);
    });

    it('movimientos cuenta solo las transacciones del propio usuario', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.docs.push(
        { usuarioId: USUARIO_ID, categoriaId: mascotas.id },
        { usuarioId: USUARIO_ID, categoriaId: mascotas.id },
        { usuarioId: USUARIO_ID, categoriaId: alimentacion.id },
        { usuarioId: OTRO_USUARIO_ID, categoriaId: alimentacion.id },
      );

      const { body } = await llamar('get', '/categorias');
      const porNombre = Object.fromEntries(body.items.map((c: Doc) => [c.nombre, c.movimientos]));

      expect(porNombre).toMatchObject({ Mascotas: 2, Alimentación: 1, Sueldo: 0 });
    });

    it('responde 400 si tipo no es INGRESO ni EGRESO', async () => {
      const { status, body } = await llamar('get', '/categorias?tipo=OTRO');

      expect(status).toBe(400);
      expect(body.message).toEqual(['tipo debe ser INGRESO o EGRESO']);
    });
  });

  describe('POST /categorias', () => {
    it('crea una categoría personalizada del usuario del JWT, con 0 movimientos (201)', async () => {
      const { status, body } = await llamar('post', '/categorias', { nombre: 'Mascotas', tipo: 'EGRESO' });

      expect(status).toBe(201);
      expect(body).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        nombre: 'Mascotas',
        tipo: 'EGRESO',
        esPredeterminada: false,
        movimientos: 0,
      });
      const creada = categorias.docs.at(-1) as Doc;
      expect(String(creada.usuarioId)).toBe(USUARIO_ID);
      expect(creada.esRespaldo).toBe(false);
    });

    it('recorta los espacios del nombre', async () => {
      const { body } = await llamar('post', '/categorias', { nombre: '  Mascotas  ', tipo: 'EGRESO' });

      expect(body.nombre).toBe('Mascotas');
    });

    it.each([
      ['una general del mismo tipo', 'alimentación'],
      ['la misma general sin tilde y en mayúsculas', 'ALIMENTACION'],
    ])('responde 409 si el nombre repite %s', async (_caso, nombre) => {
      const { status, body } = await llamar('post', '/categorias', { nombre, tipo: 'EGRESO' });

      expect(status).toBe(409);
      expect(body).toEqual({ statusCode: 409, message: 'Ya existe una categoría con ese nombre', error: 'Conflict' });
    });

    it('responde 409 si el nombre repite una categoría personalizada propia del mismo tipo', async () => {
      categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);

      const { status } = await llamar('post', '/categorias', { nombre: 'mascotas', tipo: 'EGRESO' });

      expect(status).toBe(409);
    });

    it('permite el mismo nombre en otro tipo, y el de una personalizada de otro usuario', async () => {
      categorias.sembrar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID);

      const ingreso = await llamar('post', '/categorias', { nombre: 'Alimentación', tipo: 'INGRESO' });
      const ajena = await llamar('post', '/categorias', { nombre: 'Gimnasio', tipo: 'EGRESO' });

      expect(ingreso.status).toBe(201);
      expect(ajena.status).toBe(201);
    });

    it.each([
      ['nombre vacío', 'nombre', { nombre: '', tipo: 'EGRESO' }],
      ['nombre solo de espacios', 'nombre', { nombre: '   ', tipo: 'EGRESO' }],
      ['nombre de más de 40 caracteres', 'nombre', { nombre: 'x'.repeat(41), tipo: 'EGRESO' }],
      ['nombre que no es texto', 'nombre', { nombre: 123, tipo: 'EGRESO' }],
      ['sin nombre', 'nombre', { tipo: 'EGRESO' }],
      ['tipo desconocido', 'tipo', { nombre: 'Mascotas', tipo: 'OTRO' }],
      ['sin tipo', 'tipo', { nombre: 'Mascotas' }],
      ['campo esPredeterminada', 'esPredeterminada', { nombre: 'Mascotas', tipo: 'EGRESO', esPredeterminada: true }],
      ['campo usuarioId', 'usuarioId', { nombre: 'Mascotas', tipo: 'EGRESO', usuarioId: OTRO_USUARIO_ID }],
    ])('responde 400 con un mensaje que empieza por el campo: %s', async (_caso, campo, cuerpo) => {
      const { status, body } = await llamar('post', '/categorias', cuerpo);

      expect(status).toBe(400);
      expect(body.message.some((m: string) => m.startsWith(campo) || m.includes(campo))).toBe(true);
      expect(categorias.docs).toHaveLength(4);
    });
  });

  describe('PATCH /categorias/:id', () => {
    it('renombra una categoría personalizada y devuelve su conteo de movimientos', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.docs.push({ usuarioId: USUARIO_ID, categoriaId: mascotas.id });

      const { status, body } = await llamar('patch', `/categorias/${mascotas.id}`, { nombre: '  Mascotas y veterinario ' });

      expect(status).toBe(200);
      expect(body).toEqual({
        id: mascotas.id,
        nombre: 'Mascotas y veterinario',
        tipo: 'EGRESO',
        esPredeterminada: false,
        movimientos: 1,
      });
    });

    it('permite cambiar solo mayúsculas o tildes del propio nombre', async () => {
      const mascotas = categorias.sembrar('mascotas', 'EGRESO', USUARIO_ID);

      const { status, body } = await llamar('patch', `/categorias/${mascotas.id}`, { nombre: 'Mascotas' });

      expect(status).toBe(200);
      expect(body.nombre).toBe('Mascotas');
    });

    it('responde 409 si el nuevo nombre choca con otra categoría del mismo tipo', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);

      const { status } = await llamar('patch', `/categorias/${mascotas.id}`, { nombre: 'Alimentacion' });

      expect(status).toBe(409);
    });

    it('responde 403 si es una categoría general', async () => {
      const { status, body } = await llamar('patch', `/categorias/${alimentacion.id}`, { nombre: 'Comida' });

      expect(status).toBe(403);
      expect(body).toEqual({
        statusCode: 403,
        message: 'Las categorías generales no se pueden modificar',
        error: 'Forbidden',
      });
      expect(alimentacion.nombre).toBe('Alimentación');
    });

    it.each([
      ['no existe', () => new ObjectId().toString()],
      ['es de otro usuario', () => categorias.sembrar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID).id],
    ])('responde 404 con el mismo mensaje si la categoría %s', async (_caso, obtenerId) => {
      const { status, body } = await llamar('patch', `/categorias/${obtenerId()}`, { nombre: 'Nuevo' });

      expect(status).toBe(404);
      expect(body).toEqual({ statusCode: 404, message: 'Categoría no encontrada', error: 'Not Found' });
    });

    it.each([
      ['id inválido', '/categorias/abc', { nombre: 'Nuevo' }, 'id'],
      ['nombre vacío', '__ID__', { nombre: '' }, 'nombre'],
      ['intento de cambiar el tipo', '__ID__', { nombre: 'Nuevo', tipo: 'INGRESO' }, 'tipo'],
    ])('responde 400: %s', async (_caso, ruta, cuerpo, campo) => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);

      const { status, body } = await llamar('patch', ruta.replace('__ID__', `/categorias/${mascotas.id}`), cuerpo);

      expect(status).toBe(400);
      expect(body.message.some((m: string) => m.includes(campo))).toBe(true);
    });
  });

  describe('DELETE /categorias/:id', () => {
    it('elimina la categoría y reasigna sus movimientos a "Otros egresos" del mismo tipo (204)', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.docs.push(
        { usuarioId: USUARIO_ID, categoriaId: mascotas.id },
        { usuarioId: USUARIO_ID, categoriaId: mascotas.id },
        { usuarioId: USUARIO_ID, categoriaId: alimentacion.id },
      );

      const { status, text } = await llamar('delete', `/categorias/${mascotas.id}`);

      expect(status).toBe(204);
      expect(text).toBe('');
      expect(categorias.docs.some((c) => c.id === mascotas.id)).toBe(false);
      expect(transacciones.docs.map((t) => t.categoriaId)).toEqual([otrosEgresos.id, otrosEgresos.id, alimentacion.id]);
    });

    it('una categoría de INGRESO reasigna a "Otros ingresos", no a la de egresos', async () => {
      const freelance = categorias.sembrar('Freelance', 'INGRESO', USUARIO_ID);
      transacciones.docs.push({ usuarioId: USUARIO_ID, categoriaId: freelance.id });

      await llamar('delete', `/categorias/${freelance.id}`).expect(204);

      expect(transacciones.docs[0].categoriaId).toBe(otrosIngresos.id);
    });

    it('no toca los movimientos de otros usuarios', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.docs.push({ usuarioId: OTRO_USUARIO_ID, categoriaId: mascotas.id });

      await llamar('delete', `/categorias/${mascotas.id}`).expect(204);

      expect(transacciones.docs[0].categoriaId).toBe(mascotas.id);
    });

    it('ninguna transacción queda sin categoría tras eliminar', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.docs.push({ usuarioId: USUARIO_ID, categoriaId: mascotas.id });

      await llamar('delete', `/categorias/${mascotas.id}`).expect(204);

      const idsExistentes = new Set(categorias.docs.map((c) => c.id));
      expect(transacciones.docs.every((t) => idsExistentes.has(t.categoriaId))).toBe(true);
    });

    it.each([
      ['una general de egreso', () => alimentacion.id],
      ['la de respaldo', () => otrosEgresos.id],
      ['una general de ingreso', () => sueldo.id],
    ])('responde 403 si es %s, y no se elimina', async (_caso, obtenerId) => {
      const id = obtenerId();

      const { status, body } = await llamar('delete', `/categorias/${id}`);

      expect(status).toBe(403);
      expect(body.message).toBe('Las categorías generales no se pueden eliminar');
      expect(categorias.docs.some((c) => c.id === id)).toBe(true);
    });

    it.each([
      ['no existe', () => new ObjectId().toString()],
      ['es de otro usuario', () => categorias.sembrar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID).id],
    ])('responde 404 si la categoría %s', async (_caso, obtenerId) => {
      const id = obtenerId();
      const antes = categorias.docs.length;

      const { status, body } = await llamar('delete', `/categorias/${id}`);

      expect(status).toBe(404);
      expect(body.message).toBe('Categoría no encontrada');
      expect(categorias.docs).toHaveLength(antes);
    });

    it('responde 400 si el id no es válido', async () => {
      const { status, body } = await llamar('delete', '/categorias/abc');

      expect(status).toBe(400);
      expect(body.message).toEqual(['id debe ser un id de categoría válido']);
    });

    it('si falla la reasignación no se elimina la categoría, para poder reintentar', async () => {
      const mascotas = categorias.sembrar('Mascotas', 'EGRESO', USUARIO_ID);
      transacciones.updateMany = async () => {
        throw new Error('MongoDB no disponible');
      };

      const { status } = await llamar('delete', `/categorias/${mascotas.id}`);

      expect(status).toBe(500);
      expect(categorias.docs.some((c) => c.id === mascotas.id)).toBe(true);
    });
  });

  describe('sin sesión válida', () => {
    it.each([
      ['GET', 'get', '/categorias', undefined],
      ['POST', 'post', '/categorias', { nombre: 'Mascotas', tipo: 'EGRESO' }],
      ['PATCH', 'patch', '/categorias/665f1c2e9b1d4a0012ab3400', { nombre: 'Nuevo' }],
      ['DELETE', 'delete', '/categorias/665f1c2e9b1d4a0012ab3400', undefined],
    ] as const)('%s responde 401 y no cambia nada', async (_nombre, metodo, ruta, cuerpo) => {
      const { status, body } = await llamar(metodo, ruta, cuerpo, false);

      expect(status).toBe(401);
      expect(body).toEqual(ERROR_SESION);
      expect(categorias.docs).toHaveLength(4);
    });
  });
});

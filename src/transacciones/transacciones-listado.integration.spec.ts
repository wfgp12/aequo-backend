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
import { Idempotencia } from '../idempotencia/idempotencia.schema.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { Transaccion } from './transaccion.schema.js';
import { TransaccionesModule } from './transacciones.module.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
const ObjectId = mongoose.Types.ObjectId;

type Doc = Record<string, any>;

const clave = (valor: unknown) => (valor instanceof Date ? valor.getTime() : String(valor));
const esValor = (v: unknown) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId;

/** Evalúa las condiciones que arma el servicio con la semántica de MongoDB: igualdad, $gte, $lte, $lt, $in, $and y $or. */
function cumple(doc: Doc, condicion: Doc): boolean {
  return Object.entries(condicion).every(([campo, esperado]) => {
    if (campo === '$and') return (esperado as Doc[]).every((c) => cumple(doc, c));
    if (campo === '$or') return (esperado as Doc[]).some((c) => cumple(doc, c));
    const valor = doc[campo];
    if (esValor(esperado)) return clave(valor) === clave(esperado);
    return Object.entries(esperado as Doc).every(([operador, referencia]) => {
      if (operador === '$in') return (referencia as unknown[]).some((r) => clave(r) === clave(valor));
      if (operador === '$gte') return clave(valor) >= clave(referencia);
      if (operador === '$lte') return clave(valor) <= clave(referencia);
      if (operador === '$lt') return clave(valor) < clave(referencia);
      throw new Error(`Operador no soportado por la prueba: ${operador}`);
    });
  });
}

/** Transacciones en memoria con find().sort().limit(), como las encadena Mongoose. */
class TransaccionesEnMemoria {
  docs: Doc[] = [];
  private contador = 0;

  agregar(usuarioId: string, cambios: Doc = {}) {
    const _id = new ObjectId((++this.contador).toString(16).padStart(24, '0'));
    const doc: Doc = {
      _id,
      id: _id.toString(),
      usuarioId: new ObjectId(usuarioId),
      tipo: 'EGRESO',
      monto: 1000,
      fecha: new Date('2026-10-20T00:00:00.000Z'),
      categoriaId: null,
      metodoPago: 'EFECTIVO',
      descripcion: '',
      clasificacionFlujo: 'ORDINARIO',
      createdAt: new Date('2026-10-20T15:30:00.000Z'),
      ...cambios,
    };
    this.docs.push(doc);
    return doc;
  }

  find(filtro: Doc) {
    let resultado = this.docs.filter((doc) => cumple(doc, filtro));
    const consulta = {
      sort: (orden: Record<string, 1 | -1>) => {
        resultado = [...resultado].sort((a, b) => {
          for (const [campo, sentido] of Object.entries(orden)) {
            const [x, y] = [clave(a[campo]), clave(b[campo])];
            if (x !== y) return (x < y ? -1 : 1) * sentido;
          }
          return 0;
        });
        return consulta;
      },
      limit: (n: number) => {
        resultado = resultado.slice(0, n);
        return consulta;
      },
      // Mongoose devuelve una consulta que se puede `await`ear directamente; por eso este objeto es "thenable" a propósito.
      // oxlint-disable-next-line unicorn/no-thenable
      then: (ok: (v: Doc[]) => unknown, fallo: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, fallo),
    };
    return consulta;
  }
}

class CategoriasEnMemoria {
  docs: Doc[] = [];

  agregar(nombre: string, tipo: string, usuarioId: string | null) {
    const _id = new ObjectId();
    const doc = {
      _id,
      id: _id.toString(),
      usuarioId: usuarioId ? new ObjectId(usuarioId) : null,
      nombre,
      tipo,
      esPredeterminada: usuarioId === null,
    };
    this.docs.push(doc);
    return doc;
  }

  async find(filtro: Doc) {
    return this.docs.filter((doc) => cumple(doc, filtro));
  }

  // La siembra del arranque consulta cuántas generales hay; con estas, no siembra nada.
  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

describe('GET /transacciones (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let transacciones: TransaccionesEnMemoria;
  let categorias: CategoriasEnMemoria;
  let token: string;
  let alimentacion: Doc;
  let sueldo: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    transacciones = new TransaccionesEnMemoria();
    categorias = new CategoriasEnMemoria();
    alimentacion = categorias.agregar('Alimentación', 'EGRESO', null);
    sueldo = categorias.agregar('Sueldo', 'INGRESO', null);

    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, TransaccionesModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
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

  const listar = (consulta = '', conToken = true) => {
    const peticion = request(app.getHttpServer()).get(`/transacciones${consulta}`);
    return conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };
  const ids = (items: Doc[]) => items.map((t) => t.id);

  describe('contenido y orden', () => {
    it('devuelve la forma acordada: items y siguienteCursor, con la categoría completa en cada item', async () => {
      const t = transacciones.agregar(USUARIO_ID, {
        monto: 45000,
        categoriaId: alimentacion._id,
        descripcion: 'Mercado',
        fecha: dia('2026-10-20'),
      });

      const { status, body } = await listar();

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['items', 'siguienteCursor']);
      expect(body.siguienteCursor).toBeNull();
      expect(body.items).toEqual([
        {
          id: t.id,
          tipo: 'EGRESO',
          monto: 45000,
          fecha: '2026-10-20',
          categoriaId: alimentacion.id,
          categoria: { id: alimentacion.id, nombre: 'Alimentación', tipo: 'EGRESO', esPredeterminada: true },
          metodoPago: 'EFECTIVO',
          descripcion: 'Mercado',
          clasificacionFlujo: 'ORDINARIO',
          creadaEn: '2026-10-20T15:30:00.000Z',
        },
      ]);
    });

    it('ordena por fecha descendente y, a igual fecha, la registrada más recientemente primero', async () => {
      const a = transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-10') });
      const b = transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-20') });
      const c = transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-20') });
      const d = transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-15') });

      const { body } = await listar();

      expect(ids(body.items)).toEqual([c.id, b.id, d.id, a.id]);
    });

    it('solo devuelve las transacciones del propio usuario', async () => {
      const mia = transacciones.agregar(USUARIO_ID);
      transacciones.agregar(OTRO_USUARIO_ID);

      const { body } = await listar();

      expect(ids(body.items)).toEqual([mia.id]);
    });

    it('una transacción sin categoría trae categoria null', async () => {
      transacciones.agregar(USUARIO_ID, { categoriaId: null });

      const { body } = await listar();

      expect(body.items[0].categoriaId).toBeNull();
      expect(body.items[0].categoria).toBeNull();
    });

    it('sin transacciones devuelve la lista vacía y sin cursor', async () => {
      const { status, body } = await listar();

      expect(status).toBe(200);
      expect(body).toEqual({ items: [], siguienteCursor: null });
    });
  });

  describe('filtros', () => {
    beforeEach(() => {
      transacciones.agregar(USUARIO_ID, { fecha: dia('2026-09-30'), descripcion: 'sep-30' });
      transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-01'), descripcion: 'oct-01' });
      transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-15'), descripcion: 'oct-15', tipo: 'INGRESO', categoriaId: sueldo._id, metodoPago: 'TRANSFERENCIA' });
      transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-31'), descripcion: 'oct-31', categoriaId: alimentacion._id, metodoPago: 'DEBITO' });
      transacciones.agregar(USUARIO_ID, { fecha: dia('2026-11-01'), descripcion: 'nov-01' });
    });
    const descripciones = async (consulta: string) => (await listar(consulta)).body.items.map((t: Doc) => t.descripcion);

    it('desde y hasta incluyen los dos extremos', async () => {
      expect(await descripciones('?desde=2026-10-01&hasta=2026-10-31')).toEqual(['oct-31', 'oct-15', 'oct-01']);
    });

    it('solo desde: sin límite superior', async () => {
      expect(await descripciones('?desde=2026-10-31')).toEqual(['nov-01', 'oct-31']);
    });

    it('solo hasta: sin límite inferior', async () => {
      expect(await descripciones('?hasta=2026-10-01')).toEqual(['oct-01', 'sep-30']);
    });

    it('desde igual a hasta trae un solo día', async () => {
      expect(await descripciones('?desde=2026-10-15&hasta=2026-10-15')).toEqual(['oct-15']);
    });

    it('filtra por tipo', async () => {
      expect(await descripciones('?tipo=INGRESO')).toEqual(['oct-15']);
    });

    it('filtra por categoría', async () => {
      expect(await descripciones(`?categoriaId=${alimentacion.id}`)).toEqual(['oct-31']);
    });

    it('filtra por método de pago', async () => {
      expect(await descripciones('?metodoPago=DEBITO')).toEqual(['oct-31']);
    });

    it('combina varios filtros', async () => {
      expect(await descripciones('?desde=2026-10-01&hasta=2026-10-31&tipo=EGRESO')).toEqual(['oct-31', 'oct-01']);
      expect(await descripciones('?desde=2026-11-01&tipo=INGRESO')).toEqual([]);
    });

    it('un filtro no deja ver transacciones de otro usuario', async () => {
      transacciones.agregar(OTRO_USUARIO_ID, { fecha: dia('2026-10-15'), descripcion: 'ajena' });

      expect(await descripciones('?desde=2026-10-15&hasta=2026-10-15')).toEqual(['oct-15']);
    });
  });

  describe('carga progresiva con cursor', () => {
    it('encadenar los cursores recorre todo una sola vez, en orden, y termina con siguienteCursor null', async () => {
      for (let i = 1; i <= 5; i++) transacciones.agregar(USUARIO_ID, { fecha: dia(`2026-10-${String(i).padStart(2, '0')}`) });
      const esperado = [...transacciones.docs].reverse().map((d) => d.id);

      const vistos: string[] = [];
      let cursor: string | null = null;
      let paginas = 0;
      do {
        const { body } = await listar(`?limite=2${cursor ? `&cursor=${cursor}` : ''}`);
        vistos.push(...ids(body.items));
        cursor = body.siguienteCursor;
        paginas++;
      } while (cursor && paginas < 10);

      expect(paginas).toBe(3);
      expect(vistos).toEqual(esperado);
    });

    it('si el total es múltiplo del límite, la última página ya viene con siguienteCursor null', async () => {
      for (let i = 1; i <= 4; i++) transacciones.agregar(USUARIO_ID, { fecha: dia(`2026-10-0${i}`) });

      const primera = (await listar('?limite=2')).body;
      const segunda = (await listar(`?limite=2&cursor=${primera.siguienteCursor}`)).body;

      expect(primera.siguienteCursor).not.toBeNull();
      expect(segunda.items).toHaveLength(2);
      expect(segunda.siguienteCursor).toBeNull();
    });

    it('registrar movimientos mientras se hace scroll no repite ni salta transacciones', async () => {
      for (let i = 1; i <= 4; i++) transacciones.agregar(USUARIO_ID, { fecha: dia(`2026-10-0${i}`) });
      const primera = (await listar('?limite=2')).body;

      // El usuario registra un movimiento nuevo (el más reciente) entre página y página.
      const nuevo = transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-30') });
      const segunda = (await listar(`?limite=2&cursor=${primera.siguienteCursor}`)).body;

      const todos = [...ids(primera.items), ...ids(segunda.items)];
      expect(new Set(todos).size).toBe(4);
      expect(todos).not.toContain(nuevo.id);
      expect(segunda.items.map((t: Doc) => t.fecha)).toEqual(['2026-10-02', '2026-10-01']);
    });

    it('los filtros se mantienen entre páginas', async () => {
      for (let i = 1; i <= 6; i++) {
        transacciones.agregar(USUARIO_ID, { fecha: dia(`2026-10-0${i}`), tipo: i % 2 ? 'INGRESO' : 'EGRESO', categoriaId: i % 2 ? sueldo._id : null });
      }

      const primera = (await listar('?tipo=INGRESO&limite=2')).body;
      const segunda = (await listar(`?tipo=INGRESO&limite=2&cursor=${primera.siguienteCursor}`)).body;

      expect([...primera.items, ...segunda.items].map((t: Doc) => t.fecha)).toEqual(['2026-10-05', '2026-10-03', '2026-10-01']);
      expect(segunda.siguienteCursor).toBeNull();
    });

    it('con el mismo día en varias transacciones tampoco repite ni salta al cambiar de página', async () => {
      for (let i = 0; i < 5; i++) transacciones.agregar(USUARIO_ID, { fecha: dia('2026-10-20') });
      const esperado = [...transacciones.docs].reverse().map((d) => d.id);

      const p1 = (await listar('?limite=2')).body;
      const p2 = (await listar(`?limite=2&cursor=${p1.siguienteCursor}`)).body;
      const p3 = (await listar(`?limite=2&cursor=${p2.siguienteCursor}`)).body;

      expect([...ids(p1.items), ...ids(p2.items), ...ids(p3.items)]).toEqual(esperado);
      expect(p3.siguienteCursor).toBeNull();
    });

    it('el límite por defecto es 20', async () => {
      for (let i = 0; i < 25; i++) transacciones.agregar(USUARIO_ID);

      const { body } = await listar();

      expect(body.items).toHaveLength(20);
      expect(body.siguienteCursor).not.toBeNull();
    });
  });

  describe('parámetros inválidos: 400 con un mensaje por problema que empieza por el campo', () => {
    it.each([
      ['desde con otro formato', '?desde=01-10-2026', 'desde'],
      ['desde que no existe en el calendario', '?desde=2026-02-30', 'desde'],
      ['hasta con hora', '?hasta=2026-10-31T10:00:00Z', 'hasta'],
      ['desde posterior a hasta', '?desde=2026-10-31&hasta=2026-10-01', 'desde'],
      ['tipo desconocido', '?tipo=OTRO', 'tipo'],
      ['categoriaId que no es un id', '?categoriaId=abc', 'categoriaId'],
      ['metodoPago TARJETA_CREDITO', '?metodoPago=TARJETA_CREDITO', 'metodoPago'],
      ['limite en 0', '?limite=0', 'limite'],
      ['limite sobre el máximo', '?limite=101', 'limite'],
      ['limite que no es número', '?limite=muchos', 'limite'],
      ['limite decimal', '?limite=2.5', 'limite'],
      ['cursor que no es de este endpoint', '?cursor=esto-no-es-un-cursor', 'cursor'],
      ['parámetro desconocido', '?usuarioId=665f1c2e9b1d4a0012ab34ff', 'usuarioId'],
    ])('%s', async (_caso, consulta, campo) => {
      const { status, body } = await listar(consulta);

      expect(status).toBe(400);
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message.some((m: string) => m.includes(campo))).toBe(true);
    });
  });

  it('sin sesión válida responde 401', async () => {
    const { status, body } = await listar('', false);

    expect(status).toBe(401);
    expect(body).toEqual({ statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' });
  });
});

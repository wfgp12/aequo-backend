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
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../transacciones/transacciones.module.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { ReportesModule } from './reportes.module.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const ObjectId = mongoose.Types.ObjectId;

type Doc = Record<string, any>;

/** Cómo se comparan dos valores: `find` castea los ids como Mongoose; `aggregate` no castea nada, como MongoDB. */
type Clave = (valor: unknown) => string;

const claveFlexible: Clave = (valor) => (valor instanceof Date ? String(valor.getTime()) : String(valor));
const claveEstricta: Clave = (valor) => {
  if (valor instanceof Date) return `fecha:${valor.getTime()}`;
  if (valor instanceof ObjectId) return `id:${valor.toString()}`;
  return `${typeof valor}:${String(valor)}`;
};
const esValor = (v: unknown) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId;

/** Evalúa las condiciones que arma el servicio con la semántica de MongoDB: igualdad, comparaciones, $in, $and y $or. */
function cumple(doc: Doc, condicion: Doc, clave: Clave): boolean {
  return Object.entries(condicion).every(([campo, esperado]) => {
    if (campo === '$and') return (esperado as Doc[]).every((c) => cumple(doc, c, clave));
    if (campo === '$or') return (esperado as Doc[]).some((c) => cumple(doc, c, clave));
    const valor = doc[campo];
    if (esValor(esperado)) return clave(valor) === clave(esperado);
    return Object.entries(esperado as Doc).every(([operador, referencia]) => {
      if (operador === '$in') return (referencia as unknown[]).some((r) => clave(r) === clave(valor));
      if (operador === '$nin') return !(referencia as unknown[]).some((r) => clave(r) === clave(valor));
      if (operador === '$eq') return clave(valor) === clave(referencia);
      if (operador === '$ne') return clave(valor) !== clave(referencia);
      if (operador === '$gt') return clave(valor) > clave(referencia);
      if (operador === '$gte') return clave(valor) >= clave(referencia);
      if (operador === '$lt') return clave(valor) < clave(referencia);
      if (operador === '$lte') return clave(valor) <= clave(referencia);
      throw new Error(`Operador no soportado por la prueba: ${operador}`);
    });
  });
}

/** Una consulta que se puede `await`ear directamente, como las de Mongoose, y también encadenar con lean/select/sort/exec. */
function consultaDe(resultado: Doc[]) {
  const consulta = {
    lean: () => consulta,
    select: () => consulta,
    sort: () => consulta,
    exec: async () => resultado,
    // Mongoose devuelve una consulta "thenable": por eso este objeto lo es a propósito.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (ok: (v: Doc[]) => unknown, fallo: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, fallo),
  };
  return consulta;
}

/**
 * Transacciones en memoria con las operaciones que usan los reportes. Pueden leer con `find` y sumar en código, o con
 * `aggregate` ($match, $group con $sum, $sort); en `aggregate` el $match NO castea strings a ObjectId (como MongoDB).
 */
class TransaccionesEnMemoria {
  docs: Doc[] = [];
  /** Cuántas veces se consultó la base: una petición rechazada por validación no debe consultarla. */
  consultas = 0;

  agregar(usuarioId: string, datos: Doc = {}) {
    const _id = new ObjectId();
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
      tarjetaId: null,
      deudaId: null,
      createdAt: new Date('2026-10-20T15:30:00.000Z'),
      ...datos,
    };
    this.docs.push(doc);
    return doc;
  }

  find(filtro: Doc) {
    this.consultas++;
    return consultaDe(this.docs.filter((doc) => cumple(doc, filtro, claveFlexible)));
  }

  aggregate(etapas: Doc[]) {
    this.consultas++;
    let filas: Doc[] = this.docs;
    for (const etapa of etapas) {
      if (etapa.$match) {
        const condicion = etapa.$match as Doc;
        filas = filas.filter((doc) => cumple(doc, condicion, claveEstricta));
      } else if (etapa.$group) {
        filas = this.agrupar(filas, etapa.$group as Doc);
      } else if (etapa.$sort) {
        filas = this.ordenar(filas, etapa.$sort as Record<string, 1 | -1>);
      } else {
        throw new Error(`Etapa no soportada por la prueba: ${Object.keys(etapa).join(', ')}`);
      }
    }
    return consultaDe(filas);
  }

  private agrupar(filas: Doc[], { _id: clave, ...acumuladores }: Doc): Doc[] {
    if (typeof clave !== 'string' || !clave.startsWith('$')) {
      throw new Error('La prueba solo soporta $group por un campo: { _id: "$campo", ... }');
    }
    const grupos = new Map<string, Doc>();
    for (const fila of filas) {
      const valor = fila[clave.slice(1)];
      const llave = claveEstricta(valor);
      const grupo = grupos.get(llave) ?? { _id: valor };
      for (const [nombre, definicion] of Object.entries(acumuladores)) {
        const suma = (definicion as Doc).$sum;
        if (suma === undefined) throw new Error(`Acumulador no soportado por la prueba: ${nombre}`);
        grupo[nombre] = (grupo[nombre] ?? 0) + (typeof suma === 'string' ? fila[suma.slice(1)] : suma);
      }
      grupos.set(llave, grupo);
    }
    return [...grupos.values()];
  }

  private ordenar(filas: Doc[], criterio: Record<string, 1 | -1>): Doc[] {
    return [...filas].sort((a, b) => {
      for (const [campo, sentido] of Object.entries(criterio)) {
        const comparacion = String(a[campo]).localeCompare(String(b[campo]), 'es', { numeric: true });
        if (comparacion !== 0) return comparacion * sentido;
      }
      return 0;
    });
  }
}

class CategoriasEnMemoria {
  docs: Doc[] = [];
  consultas = 0;

  agregar(nombre: string, tipo: string) {
    const _id = new ObjectId();
    const doc = { _id, id: _id.toString(), usuarioId: null, nombre, tipo, esPredeterminada: true };
    this.docs.push(doc);
    return doc;
  }

  async findById(id: string) {
    this.consultas++;
    return this.docs.find((doc) => doc.id === id) ?? null;
  }

  find(filtro: Doc) {
    this.consultas++;
    return consultaDe(this.docs.filter((doc) => cumple(doc, filtro, claveFlexible)));
  }

  // La siembra del arranque consulta cuántas generales hay; con estas, no siembra nada.
  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

/** Los dos endpoints que usan "hoy"; el periodo efectivo y el total se leen de cada respuesta a su manera. */
const ENDPOINTS = [
  ['periodo', (body: Doc) => body.egresos],
  ['categorias', (body: Doc) => body.total],
] as const;
type Ruta = (typeof ENDPOINTS)[number][0];

describe('Zona horaria del mes actual en los reportes (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let transacciones: TransaccionesEnMemoria;
  let categorias: CategoriasEnMemoria;
  let token: string;
  let hogar: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    transacciones = new TransaccionesEnMemoria();
    categorias = new CategoriasEnMemoria();
    hogar = categorias.agregar('Hogar', 'EGRESO');

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        TransaccionesModule,
        ReportesModule,
      ],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
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
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** Fija "hoy" y emite la sesión después, para que el token sea coherente con el reloj simulado. */
  const hoyEs = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    token = app.get(TokenService).generar(USUARIO_ID);
  };

  const consultar = (ruta: Ruta, consulta = '', zona?: string) => {
    const peticion = request(app.getHttpServer())
      .get(`/reportes/${ruta}${consulta}`)
      .set('Authorization', `Bearer ${token}`);
    return zona === undefined ? peticion : peticion.set('X-Zona-Horaria', zona);
  };

  const gasto = (fecha: string, monto: number) =>
    transacciones.agregar(USUARIO_ID, { tipo: 'EGRESO', monto, fecha: dia(fecha), categoriaId: hogar._id });

  /** Los gastos del 20 de octubre ($1.000) y del 5 de noviembre ($2.000) de 2026, para saber qué mes se usó. */
  const gastosDeOctubreYNoviembre = () => {
    gasto('2026-10-20', 1000);
    gasto('2026-11-05', 2000);
  };

  describe.each(ENDPOINTS)('GET /reportes/%s', (ruta, totalDe) => {
    it('CA-RF13-04 zona detrás de UTC: todavía es el mes anterior', async () => {
      hoyEs('2026-11-01T01:00:00.000Z');
      gastosDeOctubreYNoviembre();

      const { status, body } = await consultar(ruta, '', 'America/Bogota');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-10-01');
      expect(body.hasta).toBe('2026-10-31');
      expect(totalDe(body)).toBe(1000);
    });

    it('CA-RF13-05 la misma consulta sin zona usa UTC', async () => {
      hoyEs('2026-11-01T01:00:00.000Z');
      gastosDeOctubreYNoviembre();

      const { status, body } = await consultar(ruta);

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-11-01');
      expect(body.hasta).toBe('2026-11-30');
      expect(totalDe(body)).toBe(2000);
    });

    it('CA-RF13-06 zona adelantada respecto a UTC: ya es el mes siguiente', async () => {
      hoyEs('2026-10-31T12:00:00.000Z');
      gastosDeOctubreYNoviembre();

      const { status, body } = await consultar(ruta, '', 'Pacific/Auckland');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-11-01');
      expect(body.hasta).toBe('2026-11-30');
      expect(totalDe(body)).toBe(2000);
    });

    it('CA-RF13-07 el cambio de año también sigue la zona', async () => {
      hoyEs('2027-01-01T02:00:00.000Z');

      const { status, body } = await consultar(ruta, '', 'America/Bogota');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-12-01');
      expect(body.hasta).toBe('2026-12-31');
    });

    it('CA-RF13-08 con un mes o un rango, la zona no cambia nada', async () => {
      hoyEs('2026-11-01T01:00:00.000Z');
      gastosDeOctubreYNoviembre();
      const consultas = ['?mes=2026-11', '?desde=2026-11-01&hasta=2026-11-30'];

      for (const consulta of consultas) {
        for (const zona of ['America/Bogota', undefined]) {
          const { status, body } = await consultar(ruta, consulta, zona);

          expect(status, `${consulta} con zona ${zona}`).toBe(200);
          expect(body.desde).toBe('2026-11-01');
          expect(body.hasta).toBe('2026-11-30');
          expect(totalDe(body)).toBe(2000);
        }
      }
    });

    it.each(['Marte/Olympus', 'UTC+5', '12345'])(
      'CA-RF13-09 la zona inválida %j responde 400 y menciona X-Zona-Horaria',
      async (zona) => {
        const { status, body } = await consultar(ruta, '', zona);

        expect(status).toBe(400);
        expect(body.message.join(' ')).toContain('X-Zona-Horaria');
        expect(transacciones.consultas).toBe(0);
        expect(categorias.consultas).toBe(0);
      },
    );

    it.each(['?mes=2026-10', '?desde=2026-10-01&hasta=2026-10-31'])(
      'CA-RF13-10 la zona inválida también se rechaza si la petición trae %s',
      async (consulta) => {
        const sinParametros = await consultar(ruta, '', 'Marte/Olympus');
        transacciones.consultas = 0;
        categorias.consultas = 0;

        const { status, body } = await consultar(ruta, consulta, 'Marte/Olympus');

        expect(status).toBe(400);
        expect(body.message).toEqual(sinParametros.body.message);
        expect(transacciones.consultas).toBe(0);
        expect(categorias.consultas).toBe(0);
      },
    );

    it.each(['America/Bogota', 'UTC', 'Europe/Madrid', 'America/Argentina/Buenos_Aires'])(
      'CA-RF13-11 el nombre IANA válido %s se acepta',
      async (zona) => {
        const { status, body } = await consultar(ruta, '?mes=2026-10', zona);

        expect(status).toBe(200);
        expect(body.desde).toBe('2026-10-01');
        expect(body.hasta).toBe('2026-10-31');
      },
    );

    it('CA-RF13-12 la zona sigue el horario de verano', async () => {
      hoyEs('2026-04-01T03:30:00.000Z');

      const nuevaYork = await consultar(ruta, '', 'America/New_York');
      const madrid = await consultar(ruta, '', 'Europe/Madrid');

      expect([nuevaYork.body.desde, nuevaYork.body.hasta]).toEqual(['2026-03-01', '2026-03-31']);
      expect([madrid.body.desde, madrid.body.hasta]).toEqual(['2026-04-01', '2026-04-30']);
    });
  });
});

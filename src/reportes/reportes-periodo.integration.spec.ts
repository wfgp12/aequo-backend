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
import { ReportesModule } from './reportes.module.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
const ObjectId = mongoose.Types.ObjectId;

type Doc = Record<string, any>;

const clave = (valor: unknown) => (valor instanceof Date ? valor.getTime() : String(valor));
const esValor = (v: unknown) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId;

/** Evalúa las condiciones que arma el servicio con la semántica de MongoDB: igualdad, comparaciones, $in, $and y $or. */
function cumple(doc: Doc, condicion: Doc): boolean {
  return Object.entries(condicion).every(([campo, esperado]) => {
    if (campo === '$and') return (esperado as Doc[]).every((c) => cumple(doc, c));
    if (campo === '$or') return (esperado as Doc[]).some((c) => cumple(doc, c));
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

/**
 * Transacciones en memoria con las operaciones que usan el reporte y el CRUD: find (que se puede `await`ear, con
 * lean/select/sort/exec encadenables), create, findOne, deleteOne y documentos con save.
 * El reporte debe leer con `find` y sumar en código; no soporta `aggregate`.
 */
class TransaccionesEnMemoria {
  docs: Doc[] = [];
  /** Cuántas veces se consultó la base: una petición rechazada por validación no debe consultarla. */
  consultas = 0;

  private nuevo(datos: Doc) {
    const _id = new ObjectId();
    const doc: Doc = {
      _id,
      id: _id.toString(),
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
    doc.save = async () => doc;
    this.docs.push(doc);
    return doc;
  }

  agregar(usuarioId: string, cambios: Doc = {}) {
    return this.nuevo({ usuarioId: new ObjectId(usuarioId), ...cambios });
  }

  async create(datos: Doc) {
    return this.nuevo(datos);
  }

  find(filtro: Doc) {
    this.consultas++;
    const resultado = this.docs.filter((doc) => cumple(doc, filtro));
    const consulta = {
      lean: () => consulta,
      select: () => consulta,
      sort: () => consulta,
      exec: async () => resultado,
      // Mongoose devuelve una consulta que se puede `await`ear directamente; por eso este objeto es "thenable" a propósito.
      // oxlint-disable-next-line unicorn/no-thenable
      then: (ok: (v: Doc[]) => unknown, fallo: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, fallo),
    };
    return consulta;
  }

  async findOne(filtro: Doc) {
    return (
      this.docs.find(
        (doc) => String(doc._id) === String(filtro._id) && String(doc.usuarioId) === String(filtro.usuarioId),
      ) ?? null
    );
  }

  async deleteOne({ _id }: Doc) {
    this.docs = this.docs.filter((doc) => String(doc._id) !== String(_id));
  }
}

class CategoriasEnMemoria {
  docs: Doc[] = [];

  agregar(nombre: string, tipo: string) {
    const _id = new ObjectId();
    const doc = { _id, id: _id.toString(), usuarioId: null, nombre, tipo, esPredeterminada: true };
    this.docs.push(doc);
    return doc;
  }

  async findById(id: string) {
    return this.docs.find((doc) => doc.id === id) ?? null;
  }

  // La siembra del arranque consulta cuántas generales hay; con estas, no siembra nada.
  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const CEROS = { ingresos: 0, egresos: 0, pagosTarjeta: 0, abonosDeuda: 0, dineroRecibido: 0, balance: 0 };

describe('GET /reportes/periodo (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let transacciones: TransaccionesEnMemoria;
  let categorias: CategoriasEnMemoria;
  let token: string;
  let alimentacion: Doc;
  let transporte: Doc;
  let sueldo: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    transacciones = new TransaccionesEnMemoria();
    categorias = new CategoriasEnMemoria();
    alimentacion = categorias.agregar('Alimentación', 'EGRESO');
    transporte = categorias.agregar('Transporte', 'EGRESO');
    sueldo = categorias.agregar('Sueldo', 'INGRESO');

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

  const consultar = (consulta = '', conToken = true) => {
    const peticion = request(app.getHttpServer()).get(`/reportes/periodo${consulta}`);
    return conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };

  /** Fija "hoy" y emite la sesión después, para que el token sea coherente con el reloj simulado. */
  const hoyEs = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    token = app.get(TokenService).generar(USUARIO_ID);
  };

  const egreso = (fecha: string, monto = 1000, cambios: Doc = {}) =>
    transacciones.agregar(USUARIO_ID, { tipo: 'EGRESO', monto, fecha: dia(fecha), categoriaId: alimentacion._id, ...cambios });
  const ingreso = (fecha: string, monto = 1000, cambios: Doc = {}) =>
    transacciones.agregar(USUARIO_ID, { tipo: 'INGRESO', monto, fecha: dia(fecha), categoriaId: sueldo._id, ...cambios });
  const pagoTarjeta = (fecha: string, monto: number) =>
    transacciones.agregar(USUARIO_ID, {
      tipo: 'EGRESO',
      monto,
      fecha: dia(fecha),
      metodoPago: 'TRANSFERENCIA',
      clasificacionFlujo: 'PAGO_TARJETA',
      tarjetaId: new ObjectId(),
    });
  const abonoDeuda = (fecha: string, monto: number) =>
    transacciones.agregar(USUARIO_ID, {
      tipo: 'EGRESO',
      monto,
      fecha: dia(fecha),
      clasificacionFlujo: 'ABONO_DEUDA',
      deudaId: new ObjectId(),
    });
  const dineroRecibido = (fecha: string, monto: number) =>
    transacciones.agregar(USUARIO_ID, {
      tipo: 'INGRESO',
      monto,
      fecha: dia(fecha),
      clasificacionFlujo: 'DINERO_RECIBIDO',
      deudaId: new ObjectId(),
    });

  describe('RF-13: reporte del mes actual por defecto', () => {
    it('CA-RF13-01 sin parámetros se usa el mes actual', async () => {
      hoyEs('2026-10-15T12:00:00.000Z');
      egreso('2026-09-30', 1000);
      egreso('2026-10-01', 2000);
      egreso('2026-10-15', 3000);
      egreso('2026-10-31', 4000);
      egreso('2026-11-01', 5000);

      const { status, body } = await consultar();

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-10-01');
      expect(body.hasta).toBe('2026-10-31');
      expect(body.egresos).toBe(9000);
    });

    it('CA-RF13-02 el mes actual sin movimientos es un reporte en cero, no un error', async () => {
      hoyEs('2026-10-15T12:00:00.000Z');
      egreso('2026-09-10', 50000);
      ingreso('2026-08-05', 3000000);

      const { status, body } = await consultar();

      expect(status).toBe(200);
      expect(body).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', ...CEROS });
    });
  });

  describe('RF-14: seleccionar otro periodo', () => {
    it('CA-RF14-01 un mes concreto', async () => {
      egreso('2026-09-05', 1000);
      egreso('2026-09-20', 2000);
      egreso('2026-10-05', 4000);

      const { status, body } = await consultar('?mes=2026-09');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-09-01');
      expect(body.hasta).toBe('2026-09-30');
      expect(body.egresos).toBe(3000);
    });

    it('CA-RF14-02 los bordes del mes están incluidos y los vecinos no', async () => {
      egreso('2026-08-31', 1000);
      egreso('2026-09-01', 1000);
      egreso('2026-09-30', 1000);
      egreso('2026-10-01', 1000);

      const { body } = await consultar('?mes=2026-09');

      expect(body.egresos).toBe(2000);
    });

    it('CA-RF14-03 febrero de un año común termina el 28', async () => {
      egreso('2026-02-28', 1000);
      egreso('2026-03-01', 1000);

      const { body } = await consultar('?mes=2026-02');

      expect(body.hasta).toBe('2026-02-28');
      expect(body.egresos).toBe(1000);
    });

    it('CA-RF14-04 febrero de un año bisiesto termina el 29', async () => {
      egreso('2028-02-29', 1000);
      egreso('2028-03-01', 1000);

      const { body } = await consultar('?mes=2028-02');

      expect(body.hasta).toBe('2028-02-29');
      expect(body.egresos).toBe(1000);
    });

    it('CA-RF14-05 diciembre no se mezcla con enero del año siguiente', async () => {
      egreso('2026-12-01', 1000);
      egreso('2026-12-31', 1000);
      egreso('2027-01-01', 1000);

      const { body } = await consultar('?mes=2026-12');

      expect(body.desde).toBe('2026-12-01');
      expect(body.hasta).toBe('2026-12-31');
      expect(body.egresos).toBe(2000);
    });

    it('CA-RF14-06 un rango con desde y hasta, ambos incluidos', async () => {
      for (const fecha of ['2026-10-09', '2026-10-10', '2026-10-15', '2026-10-20', '2026-10-21']) egreso(fecha, 1000);

      const { body } = await consultar('?desde=2026-10-10&hasta=2026-10-20');

      expect(body.desde).toBe('2026-10-10');
      expect(body.hasta).toBe('2026-10-20');
      expect(body.egresos).toBe(3000);
    });

    it('CA-RF14-07 un rango de un solo día', async () => {
      for (const fecha of ['2026-10-14', '2026-10-15', '2026-10-16']) egreso(fecha, 1000);

      const { body } = await consultar('?desde=2026-10-15&hasta=2026-10-15');

      expect(body.desde).toBe('2026-10-15');
      expect(body.hasta).toBe('2026-10-15');
      expect(body.egresos).toBe(1000);
    });

    it('CA-RF14-08 un rango que cruza meses y años', async () => {
      egreso('2026-12-30', 1000);
      egreso('2027-01-02', 1000);
      egreso('2027-02-15', 1000);

      const { body } = await consultar('?desde=2026-12-15&hasta=2027-01-15');

      expect(body.egresos).toBe(2000);
    });

    it('CA-RF14-09 desde posterior a hasta responde 400', async () => {
      const { status, body } = await consultar('?desde=2026-10-20&hasta=2026-10-10');

      expect(status).toBe(400);
      expect(body.message).toContain('desde no puede ser posterior a hasta');
      expect(transacciones.consultas).toBe(0);
    });

    it.each(['2026-13', '2026-00', '2026-9', 'octubre', '2026-10-01'])(
      'CA-RF14-10 mes con formato inválido responde 400 con mensajes que empiezan por mes (%j)',
      async (mes) => {
        const { status, body } = await consultar(`?mes=${mes}`);

        expect(status).toBe(400);
        expect(body.message.length).toBeGreaterThan(0);
        for (const mensaje of body.message) expect(mensaje.startsWith('mes')).toBe(true);
        expect(transacciones.consultas).toBe(0);
      },
    );

    it.each([
      ['desde que no existe en el calendario', '?desde=2026-02-30&hasta=2026-03-01', 'desde debe ser una fecha real del calendario (YYYY-MM-DD)'],
      ['desde con otro formato', '?desde=20-10-2026&hasta=2026-10-31', 'desde debe tener el formato YYYY-MM-DD'],
      ['hasta que no existe en el calendario', '?desde=2026-02-01&hasta=2026-02-30', 'hasta debe ser una fecha real del calendario (YYYY-MM-DD)'],
      ['hasta con otro formato', '?desde=2026-10-01&hasta=31-10-2026', 'hasta debe tener el formato YYYY-MM-DD'],
    ])('CA-RF14-11 fechas del rango inválidas responden 400 con el mensaje del listado (%s)', async (_caso, consulta, mensaje) => {
      const { status, body } = await consultar(consulta);

      expect(status).toBe(400);
      expect(body.message).toContain(mensaje);
      expect(transacciones.consultas).toBe(0);
    });

    it.each(['?mes=2026-10&desde=2026-10-01', '?mes=2026-10&hasta=2026-10-31', '?mes=2026-10&desde=2026-10-01&hasta=2026-10-31'])(
      'CA-RF14-12 mes no se mezcla con desde o hasta: responde 400 (%s)',
      async (consulta) => {
        const { status, body } = await consultar(consulta);

        expect(status).toBe(400);
        const mensajes = body.message.join(' ');
        expect(mensajes).toMatch(/mes/);
        expect(mensajes).toMatch(/rango|desde|hasta/);
        expect(transacciones.consultas).toBe(0);
      },
    );

    it.each(['?desde=2026-10-01', '?hasta=2026-10-31'])(
      'CA-RF14-13 desde y hasta van juntos: con solo uno responde 400 (%s)',
      async (consulta) => {
        const { status, body } = await consultar(consulta);

        expect(status).toBe(400);
        const mensajes = body.message.join(' ');
        expect(mensajes).toMatch(/desde/);
        expect(mensajes).toMatch(/hasta/);
        expect(transacciones.consultas).toBe(0);
      },
    );

    it('CA-RF14-14 el reporte es solo del usuario de la sesión', async () => {
      egreso('2026-10-10', 1000);
      ingreso('2026-10-10', 5000);
      transacciones.agregar(OTRO_USUARIO_ID, { tipo: 'EGRESO', monto: 700000, fecha: dia('2026-10-10') });
      transacciones.agregar(OTRO_USUARIO_ID, { tipo: 'INGRESO', monto: 9000000, fecha: dia('2026-10-10') });

      const { body } = await consultar('?mes=2026-10');

      expect(body.egresos).toBe(1000);
      expect(body.ingresos).toBe(5000);
      expect(body.balance).toBe(4000);
    });

    it('CA-RF14-15 sin sesión válida responde 401', async () => {
      const sinSesion = await consultar('?mes=2026-10', false);
      const sesionInvalida = await request(app.getHttpServer())
        .get('/reportes/periodo?mes=2026-10')
        .set('Authorization', 'Bearer token-que-no-es-valido');

      expect(sinSesion.status).toBe(401);
      expect(sesionInvalida.status).toBe(401);
    });
  });

  describe('RF-20: resumen numérico del periodo (?mes=2026-10)', () => {
    it('CA-RF20-01 ingresos, egresos y balance', async () => {
      ingreso('2026-10-05', 2500000);
      ingreso('2026-10-20', 300000);
      egreso('2026-10-06', 45000);
      egreso('2026-10-12', 80000);
      egreso('2026-10-25', 1254700);

      const { status, body } = await consultar('?mes=2026-10');

      expect(status).toBe(200);
      expect(body).toEqual({
        desde: '2026-10-01',
        hasta: '2026-10-31',
        ingresos: 2800000,
        egresos: 1379700,
        pagosTarjeta: 0,
        abonosDeuda: 0,
        dineroRecibido: 0,
        balance: 1420300,
      });
    });

    it('CA-RF20-02 el balance negativo no se trunca a cero', async () => {
      ingreso('2026-10-05', 100000);
      egreso('2026-10-06', 350000);

      const { body } = await consultar('?mes=2026-10');

      expect(body.balance).toBe(-250000);
    });

    it.each([
      ['solo un ingreso', () => ingreso('2026-10-05', 500000), { ingresos: 500000, egresos: 0, balance: 500000 }],
      ['solo un egreso', () => egreso('2026-10-05', 80000), { ingresos: 0, egresos: 80000, balance: -80000 }],
    ])('CA-RF20-03 %s: el total que falta es 0', async (_caso, preparar, esperado) => {
      preparar();

      const { body } = await consultar('?mes=2026-10');

      expect(body).toMatchObject(esperado);
    });

    it('CA-RF20-04 un pago de tarjeta sale del balance y no es un egreso propio', async () => {
      ingreso('2026-10-05', 3000000);
      pagoTarjeta('2026-10-15', 119802.13);

      const { body } = await consultar('?mes=2026-10');

      expect(body.pagosTarjeta).toBeCloseTo(119802.13, 2);
      expect(body.egresos).toBe(0);
      expect(body.balance).toBeCloseTo(2880197.87, 2);
    });

    it('CA-RF20-05 un abono a una deuda sale del balance y no es un egreso propio', async () => {
      ingreso('2026-10-05', 3000000);
      abonoDeuda('2026-10-18', 200000);

      const { body } = await consultar('?mes=2026-10');

      expect(body.abonosDeuda).toBe(200000);
      expect(body.egresos).toBe(0);
      expect(body.balance).toBe(2800000);
    });

    it('CA-RF20-06 el dinero recibido no es ingreso propio ni suma al balance', async () => {
      ingreso('2026-10-05', 3000000);
      dineroRecibido('2026-10-10', 1000000);

      const { body } = await consultar('?mes=2026-10');

      expect(body.ingresos).toBe(3000000);
      expect(body.dineroRecibido).toBe(1000000);
      expect(body.balance).toBe(3000000);
    });

    it('CA-RF20-07 el pago de tarjeta cuenta en el mes en que se hace, no en el de la compra', async () => {
      pagoTarjeta('2026-11-05', 100000);

      const octubre = await consultar('?mes=2026-10');
      const noviembre = await consultar('?mes=2026-11');

      expect(octubre.body.pagosTarjeta).toBe(0);
      expect(noviembre.body.pagosTarjeta).toBe(100000);
    });

    it('CA-RF20-08 los totales no dependen de la categoría ni del método de pago', async () => {
      ingreso('2026-10-02', 1000000, { metodoPago: 'TRANSFERENCIA' });
      egreso('2026-10-03', 10000, { metodoPago: 'EFECTIVO', categoriaId: alimentacion._id });
      egreso('2026-10-04', 20000, { metodoPago: 'DEBITO', categoriaId: transporte._id });
      egreso('2026-10-05', 30000, { metodoPago: 'TRANSFERENCIA', categoriaId: null });
      pagoTarjeta('2026-10-06', 40000);
      abonoDeuda('2026-10-07', 50000);

      const { body } = await consultar('?mes=2026-10');

      expect(body).toMatchObject({
        ingresos: 1000000,
        egresos: 60000,
        pagosTarjeta: 40000,
        abonosDeuda: 50000,
        balance: 850000,
      });
    });

    it('CA-RF20-09 mantiene la precisión completa, sin redondear al peso', async () => {
      egreso('2026-10-05', 100.1);
      egreso('2026-10-06', 200.2);

      const { body } = await consultar('?mes=2026-10');

      expect(body.egresos).toBeCloseTo(300.3, 10);
      expect(body.balance).toBeCloseTo(-300.3, 10);
    });

    it.each([
      ['sin ningún movimiento', () => undefined],
      [
        'con movimientos solo en otros meses',
        () => {
          egreso('2026-09-30', 1000);
          ingreso('2026-11-01', 2000);
          pagoTarjeta('2026-08-15', 3000);
        },
      ],
    ])('CA-RF20-10 un periodo sin movimientos devuelve todos los totales en cero (%s)', async (_caso, preparar) => {
      preparar();

      const { status, body } = await consultar('?mes=2026-10');

      expect(status).toBe(200);
      expect(body).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', ...CEROS });
    });

    it('CA-RF20-11 los cambios se reflejan al consultar, sin datos guardados que se queden viejos', async () => {
      const primero = egreso('2026-10-20', 45000);
      const antes = await consultar('?mes=2026-10');

      const creado = await request(app.getHttpServer())
        .post('/transacciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: 'EGRESO',
          monto: 5000,
          fecha: '2026-10-21',
          categoriaId: alimentacion.id,
          metodoPago: 'EFECTIVO',
        });
      const trasCrear = await consultar('?mes=2026-10');

      await request(app.getHttpServer())
        .patch(`/transacciones/${primero.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 40000 });
      const trasEditar = await consultar('?mes=2026-10');

      await request(app.getHttpServer())
        .delete(`/transacciones/${creado.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      const trasEliminar = await consultar('?mes=2026-10');

      expect(creado.status).toBe(201);
      expect([antes, trasCrear, trasEditar, trasEliminar].map((r) => r.body.egresos)).toEqual([45000, 50000, 45000, 40000]);
    });

    it('CA-RF20-12 la respuesta tiene exactamente las propiedades acordadas, con sus tipos', async () => {
      ingreso('2026-10-05', 1000);

      const { status, body } = await consultar('?mes=2026-10');

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(
        ['abonosDeuda', 'balance', 'desde', 'dineroRecibido', 'egresos', 'hasta', 'ingresos', 'pagosTarjeta'],
      );
      expect(body.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const total of ['ingresos', 'egresos', 'pagosTarjeta', 'abonosDeuda', 'dineroRecibido', 'balance']) {
        expect(typeof body[total]).toBe('number');
      }
    });
  });
});

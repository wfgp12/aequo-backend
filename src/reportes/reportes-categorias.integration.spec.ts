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
const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
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
 * Transacciones en memoria con las operaciones que usan el reporte y el CRUD. El reporte puede leer con `find` y sumar
 * en código, o con `aggregate` ($match, $group con $sum, $sort); en `aggregate` el $match NO castea strings a ObjectId
 * (como MongoDB), así que un filtro por usuario con un string no encuentra nada, igual que en producción.
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
  consultas = 0;

  /** Sin dueño es una categoría general del sistema; con `usuarioId`, una personalizada de ese usuario. */
  agregar(nombre: string, tipo: string, usuarioId: string | null = null) {
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

describe('GET /reportes/categorias (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let transacciones: TransaccionesEnMemoria;
  let categorias: CategoriasEnMemoria;
  let token: string;
  let alimentacion: Doc;
  let transporte: Doc;
  let hogar: Doc;
  let salud: Doc;
  let mascotas: Doc;
  let sueldo: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    transacciones = new TransaccionesEnMemoria();
    categorias = new CategoriasEnMemoria();
    alimentacion = categorias.agregar('Alimentación', 'EGRESO');
    transporte = categorias.agregar('Transporte', 'EGRESO');
    hogar = categorias.agregar('Hogar', 'EGRESO');
    salud = categorias.agregar('Salud', 'EGRESO');
    sueldo = categorias.agregar('Sueldo', 'INGRESO');
    mascotas = categorias.agregar('Mascotas', 'EGRESO', USUARIO_ID);

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
      // 5.2.3: CategoriasModule registra también el modelo CompraCredito (reasigna sus compras al eliminar una categoría).
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue({})
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

  const consultar = (consulta = '', conToken = true, ruta = 'categorias') => {
    const peticion = request(app.getHttpServer()).get(`/reportes/${ruta}${consulta}`);
    return conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };
  const octubre = () => consultar('?mes=2026-10');
  const resumenOctubre = () => consultar('?mes=2026-10', true, 'periodo');

  /** Fija "hoy" y emite la sesión después, para que el token sea coherente con el reloj simulado. */
  const hoyEs = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    token = app.get(TokenService).generar(USUARIO_ID);
  };

  const gasto = (fecha: string, monto: number, categoria: Doc | null = hogar, cambios: Doc = {}) =>
    transacciones.agregar(USUARIO_ID, {
      tipo: 'EGRESO',
      monto,
      fecha: dia(fecha),
      categoriaId: categoria?._id ?? null,
      ...cambios,
    });
  const ingreso = (fecha: string, monto: number, cambios: Doc = {}) =>
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

  /** Las entradas sin el porcentaje: este se compara aparte con tolerancia, para no fijar el orden de las operaciones. */
  const sinPorcentaje = (entradas: Doc[]) => entradas.map(({ porcentaje: _porcentaje, ...resto }) => resto);
  const entrada = (categoria: Doc, total: number) => ({ categoriaId: categoria.id, nombre: categoria.nombre, total });

  describe('RF-13 y RF-14: periodo del reporte por categoría', () => {
    it('CA-RF13-03 sin parámetros se usa el mes actual', async () => {
      hoyEs('2026-10-15T12:00:00.000Z');
      gasto('2026-09-30', 1000);
      gasto('2026-10-01', 2000);
      gasto('2026-10-15', 3000);
      gasto('2026-10-31', 4000);
      gasto('2026-11-01', 5000);

      const { status, body } = await consultar();

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-10-01');
      expect(body.hasta).toBe('2026-10-31');
      expect(body.total).toBe(9000);
    });

    it('CA-RF14-16 un mes concreto: los bordes están incluidos y los vecinos no', async () => {
      for (const fecha of ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01']) gasto(fecha, 1000);

      const { status, body } = await consultar('?mes=2026-09');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-09-01');
      expect(body.hasta).toBe('2026-09-30');
      expect(body.total).toBe(2000);
      expect(sinPorcentaje(body.categorias)).toEqual([entrada(hogar, 2000)]);
    });

    it('CA-RF14-17 un rango con desde y hasta, ambos incluidos, y un rango de un solo día', async () => {
      for (const fecha of ['2026-10-09', '2026-10-10', '2026-10-15', '2026-10-20', '2026-10-21']) gasto(fecha, 1000);

      const rango = await consultar('?desde=2026-10-10&hasta=2026-10-20');
      const unDia = await consultar('?desde=2026-10-15&hasta=2026-10-15');

      expect(rango.body.desde).toBe('2026-10-10');
      expect(rango.body.hasta).toBe('2026-10-20');
      expect(rango.body.total).toBe(3000);
      expect(unDia.body.desde).toBe('2026-10-15');
      expect(unDia.body.hasta).toBe('2026-10-15');
      expect(unDia.body.total).toBe(1000);
    });

    it.each([
      ['desde posterior a hasta', '?desde=2026-10-20&hasta=2026-10-10'],
      ['mes con un mes que no existe', '?mes=2026-13'],
      ['mes con otro formato', '?mes=octubre'],
      ['desde con un día que no existe', '?desde=2026-02-30&hasta=2026-03-01'],
      ['hasta con otro formato', '?desde=2026-10-01&hasta=31-10-2026'],
      ['solo desde', '?desde=2026-10-01'],
      ['solo hasta', '?hasta=2026-10-31'],
      ['mes junto con desde', '?mes=2026-10&desde=2026-10-01'],
      ['mes junto con hasta', '?mes=2026-10&hasta=2026-10-31'],
    ])('CA-RF14-18 %s responde 400 con el mismo mensaje que el resumen del periodo', async (_caso, consulta) => {
      const resumen = await consultar(consulta, true, 'periodo');
      transacciones.consultas = 0;
      categorias.consultas = 0;

      const { status, body } = await consultar(consulta);

      expect(resumen.status).toBe(400);
      expect(status).toBe(400);
      expect(body.message.length).toBeGreaterThan(0);
      expect(body.message).toEqual(resumen.body.message);
      expect(transacciones.consultas).toBe(0);
      expect(categorias.consultas).toBe(0);
    });

    it('CA-RF14-19 sin sesión válida responde 401', async () => {
      const sinSesion = await consultar('?mes=2026-10', false);
      const sesionInvalida = await request(app.getHttpServer())
        .get('/reportes/categorias?mes=2026-10')
        .set('Authorization', 'Bearer token-que-no-es-valido');

      expect(sinSesion.status).toBe(401);
      expect(sesionInvalida.status).toBe(401);
    });
  });

  describe('RF-18: distribución de los gastos por categoría (?mes=2026-10)', () => {
    it('CA-RF18-01 total y porcentaje por categoría', async () => {
      gasto('2026-10-05', 100000, hogar);
      gasto('2026-10-06', 600000, alimentacion);
      gasto('2026-10-07', 300000, transporte);

      const { status, body } = await octubre();

      expect(status).toBe(200);
      expect(body.total).toBe(1000000);
      expect(sinPorcentaje(body.categorias)).toEqual([
        entrada(alimentacion, 600000),
        entrada(transporte, 300000),
        entrada(hogar, 100000),
      ]);
      expect(body.categorias.map((c: Doc) => c.porcentaje)).toEqual([
        expect.closeTo(60, 10),
        expect.closeTo(30, 10),
        expect.closeTo(10, 10),
      ]);
    });

    it('CA-RF18-02 varios gastos de la misma categoría se suman', async () => {
      gasto('2026-10-06', 45000, alimentacion);
      gasto('2026-10-12', 80000, alimentacion);
      gasto('2026-10-25', 1254700, alimentacion);
      gasto('2026-10-26', 20000, salud);

      const { body } = await octubre();

      expect(sinPorcentaje(body.categorias)).toEqual([entrada(alimentacion, 1379700), entrada(salud, 20000)]);
      expect(body.total).toBe(1399700);
    });

    it('CA-RF18-03 orden: de mayor a menor total y, en empate, por nombre de la A a la Z', async () => {
      gasto('2026-10-05', 100000, salud);
      gasto('2026-10-06', 100000, hogar);
      gasto('2026-10-07', 500000, transporte);
      gasto('2026-10-08', 100000, alimentacion);
      gasto('2026-10-09', 50000, mascotas);

      const { body } = await octubre();

      expect(body.categorias.map((c: Doc) => c.nombre)).toEqual([
        'Transporte',
        'Alimentación',
        'Hogar',
        'Salud',
        'Mascotas',
      ]);
    });

    it('CA-RF18-04 una sola categoría es el 100 %', async () => {
      gasto('2026-10-05', 80000, transporte);

      const { body } = await octubre();

      expect(sinPorcentaje(body.categorias)).toEqual([entrada(transporte, 80000)]);
      expect(body.categorias[0].porcentaje).toBeCloseTo(100, 10);
    });

    it('CA-RF18-05 las categorías sin gasto en el periodo no aparecen', async () => {
      gasto('2026-10-05', 40000, hogar);
      gasto('2026-09-20', 15000, mascotas);

      const { body } = await octubre();

      expect(sinPorcentaje(body.categorias)).toEqual([entrada(hogar, 40000)]);
    });

    it('CA-RF18-06 las categorías personalizadas y las generales cuentan igual', async () => {
      gasto('2026-10-05', 70000, alimentacion);
      gasto('2026-10-06', 30000, mascotas);

      const { body } = await octubre();

      expect(sinPorcentaje(body.categorias)).toEqual([entrada(alimentacion, 70000), entrada(mascotas, 30000)]);
    });

    it('CA-RF18-07 solo cuenta el gasto propio: ni ingresos, ni dinero recibido, ni pagos de tarjeta, ni abonos', async () => {
      gasto('2026-10-05', 50000, hogar);
      ingreso('2026-10-01', 3000000);
      dineroRecibido('2026-10-10', 1000000);
      pagoTarjeta('2026-10-15', 119802.13);
      abonoDeuda('2026-10-18', 200000);

      const { body } = await octubre();

      expect(body.total).toBe(50000);
      expect(sinPorcentaje(body.categorias)).toEqual([entrada(hogar, 50000)]);
    });

    it('CA-RF18-08 el total coincide con los egresos del resumen y con la suma de las entradas', async () => {
      gasto('2026-10-05', 45000, alimentacion);
      gasto('2026-10-06', 80000, alimentacion);
      gasto('2026-10-07', 120000.5, transporte);
      gasto('2026-10-08', 30000, mascotas);
      ingreso('2026-10-01', 3000000);
      dineroRecibido('2026-10-10', 1000000);
      pagoTarjeta('2026-10-15', 119802.13);
      abonoDeuda('2026-10-18', 200000);

      const porCategoria = await octubre();
      const resumen = await resumenOctubre();

      const suma = porCategoria.body.categorias.reduce((acumulado: number, c: Doc) => acumulado + c.total, 0);
      expect(porCategoria.body.total).toBeCloseTo(resumen.body.egresos, 10);
      expect(suma).toBeCloseTo(porCategoria.body.total, 10);
      expect(porCategoria.body.total).toBeCloseTo(275000.5, 10);
    });

    it('CA-RF18-09 mantiene la precisión completa, sin redondear: totales y porcentajes', async () => {
      gasto('2026-10-05', 100.1, alimentacion);
      gasto('2026-10-06', 200.2, alimentacion);

      const { body } = await octubre();

      expect(body.total).toBeCloseTo(300.3, 10);
      expect(body.categorias[0].total).toBeCloseTo(300.3, 10);
    });

    it('CA-RF18-09 tres categorías iguales: cada porcentaje es 33,333… sin redondear y suman 100', async () => {
      gasto('2026-10-05', 100000, alimentacion);
      gasto('2026-10-06', 100000, hogar);
      gasto('2026-10-07', 100000, salud);

      const { body } = await octubre();

      const porcentajes: number[] = body.categorias.map((c: Doc) => c.porcentaje);
      for (const porcentaje of porcentajes) {
        expect(porcentaje).toBeCloseTo(100 / 3, 10);
        expect(porcentaje).not.toBe(33.33);
        expect(porcentaje).not.toBe(33);
      }
      expect(porcentajes.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    });

    it('CA-RF18-10 el nombre es el actual de la categoría: renombrarla se refleja y conserva el id', async () => {
      gasto('2026-10-05', 25000, mascotas);
      const antes = await octubre();

      mascotas.nombre = 'Animales';
      const despues = await octubre();

      expect(antes.body.categorias[0]).toMatchObject({ categoriaId: mascotas.id, nombre: 'Mascotas' });
      expect(despues.body.categorias[0]).toMatchObject({ categoriaId: mascotas.id, nombre: 'Animales' });
    });

    it.each([
      ['no corresponde a ninguna categoría', () => new ObjectId()],
      ['es nulo', () => null],
    ])('CA-RF18-11 un gasto cuya categoría %s no se pierde: aparece como "Sin categoría"', async (_caso, categoriaId) => {
      transacciones.agregar(USUARIO_ID, {
        tipo: 'EGRESO',
        monto: 30000,
        fecha: dia('2026-10-05'),
        categoriaId: categoriaId(),
      });
      gasto('2026-10-06', 70000, hogar);

      const { body } = await octubre();

      expect(body.total).toBe(100000);
      expect(sinPorcentaje(body.categorias)).toEqual([
        entrada(hogar, 70000),
        { categoriaId: null, nombre: 'Sin categoría', total: 30000 },
      ]);
      expect(body.categorias[1].porcentaje).toBeCloseTo(30, 10);
    });

    it.each([
      ['sin ningún movimiento', () => undefined],
      [
        'con gastos solo en otros meses',
        () => {
          gasto('2026-09-30', 1000);
          gasto('2026-11-01', 2000);
        },
      ],
      [
        'con movimientos que no son gasto propio',
        () => {
          ingreso('2026-10-05', 3000000);
          pagoTarjeta('2026-10-15', 40000);
          abonoDeuda('2026-10-16', 50000);
        },
      ],
    ])('CA-RF18-12 un periodo sin gastos es un reporte vacío, no un error (%s)', async (_caso, preparar) => {
      preparar();

      const { status, body } = await octubre();

      expect(status).toBe(200);
      expect(body).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', total: 0, categorias: [] });
    });

    it('CA-RF18-13 solo cuenta lo del usuario de la sesión', async () => {
      gasto('2026-10-10', 1000, hogar);
      const gimnasio = categorias.agregar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID);
      transacciones.agregar(OTRO_USUARIO_ID, {
        tipo: 'EGRESO',
        monto: 700000,
        fecha: dia('2026-10-10'),
        categoriaId: gimnasio._id,
      });
      transacciones.agregar(OTRO_USUARIO_ID, {
        tipo: 'EGRESO',
        monto: 900000,
        fecha: dia('2026-10-11'),
        categoriaId: hogar._id,
      });

      const { body } = await octubre();

      expect(body.total).toBe(1000);
      expect(sinPorcentaje(body.categorias)).toEqual([entrada(hogar, 1000)]);
    });

    it('CA-RF18-14 los cambios se reflejan al consultar, sin datos guardados que se queden viejos', async () => {
      const primero = gasto('2026-10-20', 45000, hogar);
      const resumir = (r: { body: Doc }) => r.body.categorias.map((c: Doc) => [c.nombre, c.total]);
      const antes = await octubre();

      const creado = await request(app.getHttpServer())
        .post('/transacciones')
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo: 'EGRESO', monto: 5000, fecha: '2026-10-21', categoriaId: salud.id, metodoPago: 'EFECTIVO' });
      const trasCrear = await octubre();

      const editado = await request(app.getHttpServer())
        .patch(`/transacciones/${primero.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ categoriaId: transporte.id });
      const trasEditar = await octubre();

      await request(app.getHttpServer())
        .delete(`/transacciones/${creado.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      const trasEliminar = await octubre();

      expect(creado.status).toBe(201);
      expect(editado.status).toBe(200);
      expect(resumir(antes)).toEqual([['Hogar', 45000]]);
      expect(resumir(trasCrear)).toEqual([
        ['Hogar', 45000],
        ['Salud', 5000],
      ]);
      expect(resumir(trasEditar)).toEqual([
        ['Transporte', 45000],
        ['Salud', 5000],
      ]);
      expect(resumir(trasEliminar)).toEqual([['Transporte', 45000]]);
    });

    it('CA-RF18-15 la respuesta tiene exactamente las propiedades acordadas, con sus tipos', async () => {
      gasto('2026-10-05', 60000, hogar);
      gasto('2026-10-06', 40000, null);

      const { status, body } = await octubre();

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['categorias', 'desde', 'hasta', 'total']);
      expect(body.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof body.total).toBe('number');
      expect(body.categorias).toHaveLength(2);
      for (const item of body.categorias) {
        expect(Object.keys(item).sort()).toEqual(['categoriaId', 'nombre', 'porcentaje', 'total']);
        expect(typeof item.nombre).toBe('string');
        expect(typeof item.total).toBe('number');
        expect(typeof item.porcentaje).toBe('number');
      }
      expect(typeof body.categorias[0].categoriaId).toBe('string');
      expect(body.categorias[1].categoriaId).toBeNull();
    });
  });
});

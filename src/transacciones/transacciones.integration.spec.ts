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
import { Usuario } from '../usuarios/usuario.schema.js';
import { Transaccion } from './transaccion.schema.js';
import { TransaccionesModule } from './transacciones.module.js';

const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
const CATEGORIA_ID = '665f1c2e9b1d4a0012ab34ce';

/** Colección en memoria: guarda lo que el servicio le pide crear, con los campos que añade Mongoose. */
class TransaccionesEnMemoria {
  readonly docs: Array<Record<string, unknown>> = [];

  async create(datos: Record<string, unknown>) {
    const doc = {
      ...datos,
      id: new mongoose.Types.ObjectId().toString(),
      tarjetaId: null,
      deudaId: null,
      createdAt: new Date('2026-10-20T15:30:00.000Z'),
    };
    this.docs.push(doc);
    return doc;
  }
}

const valido = (cambios: Record<string, unknown> = {}) => ({
  tipo: 'EGRESO',
  monto: 45000,
  fecha: '2026-10-20',
  categoriaId: CATEGORIA_ID,
  metodoPago: 'EFECTIVO',
  ...cambios,
});

describe('POST /transacciones (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let guardadas: TransaccionesEnMemoria;
  let accessToken: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    guardadas = new TransaccionesEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, TransaccionesModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(guardadas)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();

    app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    await app.init();
    accessToken = app.get(TokenService).generar(USUARIO_ID);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const crear = (cuerpo: unknown, token: string | null = accessToken) => {
    const peticion = request(app.getHttpServer()).post('/transacciones').send(cuerpo as object);
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };

  describe('registro correcto', () => {
    it('registra un egreso y devuelve la transacción como quedó guardada (201)', async () => {
      const { status, body } = await crear(valido({ descripcion: 'Mercado de la semana' }));

      expect(status).toBe(201);
      expect(body).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        tipo: 'EGRESO',
        monto: 45000,
        fecha: '2026-10-20',
        categoriaId: CATEGORIA_ID,
        metodoPago: 'EFECTIVO',
        descripcion: 'Mercado de la semana',
        clasificacionFlujo: 'ORDINARIO',
        creadaEn: '2026-10-20T15:30:00.000Z',
      });
    });

    it('el mismo endpoint registra ingresos: el tipo lo fija el cliente', async () => {
      const { status, body } = await crear(valido({ tipo: 'INGRESO', metodoPago: 'TRANSFERENCIA' }));

      expect(status).toBe(201);
      expect(body.tipo).toBe('INGRESO');
      expect(body.metodoPago).toBe('TRANSFERENCIA');
    });

    it('la transacción queda a nombre del usuario del JWT, como ORDINARIA, con la fecha a medianoche UTC', async () => {
      await crear(valido());

      expect(guardadas.docs).toHaveLength(1);
      const guardada = guardadas.docs[0];
      expect(String(guardada.usuarioId)).toBe(USUARIO_ID);
      expect(guardada.clasificacionFlujo).toBe('ORDINARIO');
      expect((guardada.fecha as Date).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });

    it('sin descripción queda con descripción vacía', async () => {
      const { body } = await crear(valido());

      expect(body.descripcion).toBe('');
    });

    it.each([
      ['un entero', 45000],
      ['un decimal de 2 cifras', 1234.56],
      ['el monto mínimo', 0.01],
    ])('acepta %s como monto', async (_caso, monto) => {
      const { status, body } = await crear(valido({ monto }));

      expect(status).toBe(201);
      expect(body.monto).toBe(monto);
    });

    it.each([
      ['pasada', '2020-01-31'],
      ['futura', '2031-12-31'],
      ['bisiesta', '2028-02-29'],
    ])('acepta una fecha %s', async (_caso, fecha) => {
      const { status, body } = await crear(valido({ fecha }));

      expect(status).toBe(201);
      expect(body.fecha).toBe(fecha);
    });
  });

  describe('sin sesión válida', () => {
    it.each([
      ['sin token', null],
      ['con un token que no emitió este backend', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa'],
    ])('responde 401 %s y no guarda nada', async (_caso, token) => {
      const { status, body } = await crear(valido(), token);

      expect(status).toBe(401);
      expect(body).toEqual({ statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' });
      expect(guardadas.docs).toHaveLength(0);
    });
  });

  describe('datos inválidos: 400 con un mensaje en español por problema, que empieza por el campo', () => {
    const casos: Array<[string, string, Record<string, unknown>]> = [
      ['tipo desconocido', 'tipo', valido({ tipo: 'OTRO' })],
      ['monto en cero', 'monto', valido({ monto: 0 })],
      ['monto negativo', 'monto', valido({ monto: -5000 })],
      ['monto que no es número', 'monto', valido({ monto: 'mucho' })],
      ['monto con 3 decimales', 'monto', valido({ monto: 10.123 })],
      ['monto sobre el tope', 'monto', valido({ monto: 1_000_000_000_000 })],
      ['fecha con otro formato', 'fecha', valido({ fecha: '20-10-2026' })],
      ['fecha que no existe en el calendario', 'fecha', valido({ fecha: '2026-02-30' })],
      ['fecha con hora', 'fecha', valido({ fecha: '2026-10-20T10:00:00Z' })],
      ['fecha vacía', 'fecha', valido({ fecha: '' })],
      ['categoría que no es un id', 'categoriaId', valido({ categoriaId: 'abc' })],
      ['método de pago TARJETA_CREDITO', 'metodoPago', valido({ metodoPago: 'TARJETA_CREDITO' })],
      ['método de pago desconocido', 'metodoPago', valido({ metodoPago: 'CHEQUE' })],
      ['descripción de más de 200 caracteres', 'descripcion', valido({ descripcion: 'x'.repeat(201) })],
      ['descripción que no es texto', 'descripcion', valido({ descripcion: 123 })],
    ];

    it.each(casos)('%s', async (_caso, campo, cuerpo) => {
      const { status, body } = await crear(cuerpo);

      expect(status).toBe(400);
      expect(body.statusCode).toBe(400);
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message.some((mensaje: string) => mensaje.startsWith(campo))).toBe(true);
      expect(guardadas.docs).toHaveLength(0);
    });

    it.each(['tipo', 'monto', 'fecha', 'categoriaId', 'metodoPago'])('falta el campo obligatorio %s', async (campo) => {
      const cuerpo: Record<string, unknown> = valido();
      delete cuerpo[campo];

      const { status, body } = await crear(cuerpo);

      expect(status).toBe(400);
      expect(body.message.some((mensaje: string) => mensaje.startsWith(campo))).toBe(true);
      expect(guardadas.docs).toHaveLength(0);
    });

    it('el mensaje de TARJETA_CREDITO explica dónde se registra la compra con tarjeta', async () => {
      const { body } = await crear(valido({ metodoPago: 'TARJETA_CREDITO' }));

      expect(body.message).toContain(
        'metodoPago debe ser EFECTIVO, DEBITO o TRANSFERENCIA; las compras con tarjeta de crédito se registran en el módulo de tarjetas',
      );
    });

    it.each(['usuarioId', 'clasificacionFlujo', 'tarjetaId', 'deudaId', 'id', 'creadaEn'])(
      'rechaza el campo %s: el cliente no lo decide y se rechaza en vez de ignorarse',
      async (campo) => {
        const { status, body } = await crear(valido({ [campo]: CATEGORIA_ID }));

        expect(status).toBe(400);
        expect(body.message.some((mensaje: string) => mensaje.includes(campo))).toBe(true);
        expect(guardadas.docs).toHaveLength(0);
      },
    );

    it('informa varios problemas a la vez, uno por campo', async () => {
      const { body } = await crear({ tipo: 'OTRO', monto: -1, fecha: 'ayer', categoriaId: 'x', metodoPago: 'CHEQUE' });

      const campos = ['tipo', 'monto', 'fecha', 'categoriaId', 'metodoPago'];
      for (const campo of campos) {
        expect(body.message.some((mensaje: string) => mensaje.startsWith(campo))).toBe(true);
      }
    });
  });
});

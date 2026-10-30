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

/** Transacciones en memoria con findOne, deleteOne y documentos que se pueden guardar (save). */
class TransaccionesEnMemoria {
  docs: Doc[] = [];

  agregar(usuarioId: string, cambios: Doc = {}) {
    const _id = new ObjectId();
    const doc: Doc = {
      _id,
      id: _id.toString(),
      usuarioId: new ObjectId(usuarioId),
      tipo: 'EGRESO',
      monto: 45000,
      fecha: new Date('2026-10-20T00:00:00.000Z'),
      categoriaId: null,
      metodoPago: 'EFECTIVO',
      descripcion: 'Mercado',
      clasificacionFlujo: 'ORDINARIO',
      createdAt: new Date('2026-10-20T15:30:00.000Z'),
      ...cambios,
    };
    doc.save = async () => doc;
    this.docs.push(doc);
    return doc;
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

  async findById(id: string) {
    return this.docs.find((doc) => doc.id === id) ?? null;
  }

  // La siembra del arranque consulta cuántas generales hay; con estas, no siembra nada.
  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

describe('PATCH y DELETE /transacciones/:id (integración: guard de sesión real y MongoDB simulado)', () => {
  let app: INestApplication;
  let transacciones: TransaccionesEnMemoria;
  let token: string;
  let alimentacion: Doc;
  let transporte: Doc;
  let sueldo: Doc;
  let mascotas: Doc;
  let gimnasioAjeno: Doc;
  let mia: Doc;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'secreto-solo-para-pruebas');
    transacciones = new TransaccionesEnMemoria();
    const categorias = new CategoriasEnMemoria();
    alimentacion = categorias.agregar('Alimentación', 'EGRESO', null);
    transporte = categorias.agregar('Transporte', 'EGRESO', null);
    sueldo = categorias.agregar('Sueldo', 'INGRESO', null);
    mascotas = categorias.agregar('Mascotas', 'EGRESO', USUARIO_ID);
    gimnasioAjeno = categorias.agregar('Gimnasio', 'EGRESO', OTRO_USUARIO_ID);
    mia = transacciones.agregar(USUARIO_ID, { categoriaId: alimentacion._id });

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

  const editar = (id: string, cuerpo: unknown, conToken = true) => {
    const peticion = request(app.getHttpServer()).patch(`/transacciones/${id}`).send(cuerpo as object);
    return conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };
  const eliminar = (id: string, conToken = true) => {
    const peticion = request(app.getHttpServer()).delete(`/transacciones/${id}`);
    return conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };
  const hayMensajeCon = (body: Doc, campo: string) => body.message.some((m: string) => m.startsWith(campo));

  describe('PATCH: editar', () => {
    it('cambia solo lo que se envía y devuelve la transacción completa y actualizada, con su categoría', async () => {
      const { status, body } = await editar(mia.id, { monto: 52000 });

      expect(status).toBe(200);
      expect(body).toEqual({
        id: mia.id,
        tipo: 'EGRESO',
        monto: 52000,
        fecha: '2026-10-20',
        categoriaId: alimentacion.id,
        categoria: { id: alimentacion.id, nombre: 'Alimentación', tipo: 'EGRESO', esPredeterminada: true },
        metodoPago: 'EFECTIVO',
        descripcion: 'Mercado',
        clasificacionFlujo: 'ORDINARIO',
        creadaEn: '2026-10-20T15:30:00.000Z',
      });
      expect(mia.monto).toBe(52000);
    });

    it('edita todos los campos a la vez, como el formulario de edición con todos los campos visibles', async () => {
      const { status, body } = await editar(mia.id, {
        tipo: 'EGRESO',
        monto: 1234.56,
        fecha: '2026-11-02',
        categoriaId: mascotas.id,
        metodoPago: 'TRANSFERENCIA',
        descripcion: 'Veterinario',
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        monto: 1234.56,
        fecha: '2026-11-02',
        categoriaId: mascotas.id,
        categoria: { nombre: 'Mascotas', esPredeterminada: false },
        metodoPago: 'TRANSFERENCIA',
        descripcion: 'Veterinario',
      });
      expect((mia.fecha as Date).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('permite cambiar un egreso a ingreso (RF-08) si se envía una categoría de ingreso', async () => {
      const { status, body } = await editar(mia.id, { tipo: 'INGRESO', categoriaId: sueldo.id });

      expect(status).toBe(200);
      expect(body.tipo).toBe('INGRESO');
      expect(body.categoria.nombre).toBe('Sueldo');
      expect(mia.tipo).toBe('INGRESO');
    });

    it('cambia solo la categoría a otra del mismo tipo', async () => {
      const { body } = await editar(mia.id, { categoriaId: transporte.id });

      expect(body.categoria.nombre).toBe('Transporte');
    });

    it('permite dejar la descripción vacía', async () => {
      const { status, body } = await editar(mia.id, { descripcion: '' });

      expect(status).toBe(200);
      expect(body.descripcion).toBe('');
    });

    it('no toca las transacciones de nadie más', async () => {
      const otra = transacciones.agregar(USUARIO_ID, { categoriaId: alimentacion._id, monto: 999 });

      await editar(mia.id, { monto: 1 });

      expect(otra.monto).toBe(999);
    });

    describe('categoría coherente con el tipo', () => {
      it('al cambiar el tipo sin enviar categoría responde 400 con un mensaje que empieza por categoriaId, y no cambia nada', async () => {
        const { status, body } = await editar(mia.id, { tipo: 'INGRESO' });

        expect(status).toBe(400);
        expect(hayMensajeCon(body, 'categoriaId')).toBe(true);
        expect(mia.tipo).toBe('EGRESO');
      });

      it.each([
        ['de otro tipo que el movimiento', () => sueldo.id, {}],
        ['personalizada de otro usuario', () => gimnasioAjeno.id, {}],
        ['inexistente', () => new ObjectId().toString(), {}],
        ['de egreso al cambiar a ingreso', () => alimentacion.id, { tipo: 'INGRESO' }],
      ])('responde 400 si la categoría es %s', async (_caso, obtenerId, extra) => {
        const { status, body } = await editar(mia.id, { categoriaId: obtenerId(), ...extra });

        expect(status).toBe(400);
        expect(hayMensajeCon(body, 'categoriaId')).toBe(true);
        expect(mia.categoriaId).toBe(alimentacion._id);
      });
    });

    describe('datos inválidos', () => {
      it.each([
        ['monto en cero', 'monto', { monto: 0 }],
        ['monto con 3 decimales', 'monto', { monto: 1.234 }],
        ['fecha que no existe', 'fecha', { fecha: '2026-02-30' }],
        ['fecha con otro formato', 'fecha', { fecha: '20/10/2026' }],
        ['tipo desconocido', 'tipo', { tipo: 'OTRO' }],
        ['método de pago TARJETA_CREDITO', 'metodoPago', { metodoPago: 'TARJETA_CREDITO' }],
        ['descripción de más de 200 caracteres', 'descripcion', { descripcion: 'x'.repeat(201) }],
        ['categoría que no es un id', 'categoriaId', { categoriaId: 'abc' }],
      ])('%s responde 400 con un mensaje que empieza por el campo y no cambia nada', async (_caso, campo, cuerpo) => {
        const antes = { ...mia };

        const { status, body } = await editar(mia.id, cuerpo);

        expect(status).toBe(400);
        expect(hayMensajeCon(body, campo)).toBe(true);
        expect(mia.monto).toBe(antes.monto);
        expect(mia.fecha).toEqual(antes.fecha);
      });

      it('un cuerpo vacío responde 400: hay que enviar al menos un campo', async () => {
        const { status, body } = await editar(mia.id, {});

        expect(status).toBe(400);
        expect(body.message).toEqual(['Debes enviar al menos un campo para modificar']);
      });

      it.each(['usuarioId', 'clasificacionFlujo', 'tarjetaId', 'deudaId', 'id', 'creadaEn', 'categoria'])(
        'rechaza el campo %s: el cliente no lo decide',
        async (campo) => {
          const { status, body } = await editar(mia.id, { monto: 1, [campo]: alimentacion.id });

          expect(status).toBe(400);
          expect(body.message.some((m: string) => m.includes(campo))).toBe(true);
          expect(mia.monto).toBe(45000);
        },
      );

      it('un id que no es válido responde 400', async () => {
        const { status, body } = await editar('abc', { monto: 1 });

        expect(status).toBe(400);
        expect(body.message).toEqual(['id debe ser un id de transacción válido']);
      });
    });

    describe('solo el propietario', () => {
      it.each([
        ['no existe', () => new ObjectId().toString()],
        ['es de otro usuario', () => transacciones.agregar(OTRO_USUARIO_ID, { categoriaId: alimentacion._id }).id],
      ])('responde 404 con el mismo mensaje si la transacción %s', async (_caso, obtenerId) => {
        const id = obtenerId();

        const { status, body } = await editar(id, { monto: 1 });

        expect(status).toBe(404);
        expect(body).toEqual({ statusCode: 404, message: 'Transacción no encontrada', error: 'Not Found' });
      });

      it('la transacción de otro usuario queda intacta', async () => {
        const ajena = transacciones.agregar(OTRO_USUARIO_ID, { categoriaId: alimentacion._id, monto: 777 });

        await editar(ajena.id, { monto: 1 });

        expect(ajena.monto).toBe(777);
      });
    });

    it.each(['DINERO_RECIBIDO', 'ABONO_DEUDA', 'PAGO_TARJETA'])(
      'responde 409 si la transacción es %s: la gestiona otro módulo',
      async (clasificacionFlujo) => {
        const generada = transacciones.agregar(USUARIO_ID, { clasificacionFlujo, categoriaId: null, monto: 500 });

        const { status, body } = await editar(generada.id, { monto: 1 });

        expect(status).toBe(409);
        expect(body.message).toContain('no se puede modificar desde aquí');
        expect(generada.monto).toBe(500);
      },
    );

    it('sin sesión válida responde 401 y no cambia nada', async () => {
      const { status, body } = await editar(mia.id, { monto: 1 }, false);

      expect(status).toBe(401);
      expect(body).toEqual({ statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' });
      expect(mia.monto).toBe(45000);
    });
  });

  describe('DELETE: eliminar', () => {
    it('elimina la transacción (204, sin cuerpo) y no toca las demás', async () => {
      const otra = transacciones.agregar(USUARIO_ID, { categoriaId: alimentacion._id });

      const { status, text } = await eliminar(mia.id);

      expect(status).toBe(204);
      expect(text).toBe('');
      expect(transacciones.docs.map((d) => d.id)).toEqual([otra.id]);
    });

    it('repetir la petición con la transacción ya eliminada responde 404', async () => {
      await eliminar(mia.id).expect(204);

      const { status, body } = await eliminar(mia.id);

      expect(status).toBe(404);
      expect(body.message).toBe('Transacción no encontrada');
    });

    it.each([
      ['no existe', () => new ObjectId().toString()],
      ['es de otro usuario', () => transacciones.agregar(OTRO_USUARIO_ID, { categoriaId: alimentacion._id }).id],
    ])('responde 404 con el mismo mensaje si la transacción %s, y no elimina nada', async (_caso, obtenerId) => {
      const id = obtenerId();
      const antes = transacciones.docs.length;

      const { status, body } = await eliminar(id);

      expect(status).toBe(404);
      expect(body).toEqual({ statusCode: 404, message: 'Transacción no encontrada', error: 'Not Found' });
      expect(transacciones.docs).toHaveLength(antes);
    });

    it('un id que no es válido responde 400', async () => {
      const { status, body } = await eliminar('abc');

      expect(status).toBe(400);
      expect(body.message).toEqual(['id debe ser un id de transacción válido']);
    });

    it('responde 409 si la transacción la genera otro módulo, y no se elimina', async () => {
      const abono = transacciones.agregar(USUARIO_ID, { clasificacionFlujo: 'ABONO_DEUDA', categoriaId: null });

      const { status, body } = await eliminar(abono.id);

      expect(status).toBe(409);
      expect(body.message).toContain('no se puede eliminar desde aquí');
      expect(transacciones.docs.some((d) => d.id === abono.id)).toBe(true);
    });

    it('sin sesión válida responde 401 y no elimina nada', async () => {
      const { status, body } = await eliminar(mia.id, false);

      expect(status).toBe(401);
      expect(body).toEqual({ statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' });
      expect(transacciones.docs).toHaveLength(1);
    });
  });
});

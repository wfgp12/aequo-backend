import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AhorroModule } from '../../src/ahorro/ahorro.module.js';
import { MetaAhorro, MetaAhorroSchema } from '../../src/ahorro/meta-ahorro.schema.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { FIREBASE_AUTH } from '../../src/auth/firebase-auth.provider.js';
import { TokenService } from '../../src/auth/token.service.js';
import { Categoria } from '../../src/categorias/categoria.schema.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { DeudaSchema } from '../../src/deudas/deuda.schema.js';
import { DeudasModule } from '../../src/deudas/deudas.module.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { ReportesModule } from '../../src/reportes/reportes.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../../src/transacciones/transacciones.module.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../comun/ayudas.js';
import { ColeccionEnMemoria, type Doc, IdempotenciasEnMemoria } from '../comun/coleccion-memoria.js';
import {
  CategoriasRealesEnMemoria,
  ComprasEnMemoria,
  TransaccionesRealesEnMemoria,
} from '../tarjetas/colecciones-compras.js';

/**
 * Arnés de las pruebas de integración de los préstamos recibidos (paquete 6.1.2): la aplicación real de Nest con el
 * guard de sesión real, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB reemplazado por
 * colecciones en memoria sobre los esquemas reales. Monta `DeudasModule` y los módulos con los que se relaciona:
 * transacciones (el préstamo es una; no se gestiona desde `/transacciones`), reportes y ahorro (efecto en las cifras).
 * Las pruebas esperan que los modelos se puedan reemplazar por `getModelToken(...)` (el de la deuda con el texto
 * `'Deuda'`). No ofrece una conexión de MongoDB: la atomicidad entre la deuda y su transacción no puede apoyarse en una
 * sesión. Vive en test/ (no es producción).
 */

export { OTRO_USUARIO_ID, USUARIO_ID };
export { mensajeDeCampo, mensajeMencionaCampo } from '../comun/ayudas.js';
export { type Doc, errorDeClaveDuplicada } from '../comun/coleccion-memoria.js';

const ObjectId = mongoose.Types.ObjectId;

/**
 * Colección `deudas` sobre el esquema real, con su índice único parcial: una sola deuda activa por usuario y acreedor,
 * sin distinguir mayúsculas (sí tildes). Las consultas respetan `.collation()`.
 */
export class DeudasEnMemoria extends ColeccionEnMemoria {
  protected override readonly respetaIntercalacion = true;

  constructor() {
    super(DeudaSchema, 'Deuda', [
      {
        nombre: 'usuarioId_1_acreedor_1',
        clave: (registro: Doc) =>
          registro.saldada
            ? `saldada|${String(registro._id)}`
            : `${String(registro.usuarioId)}|${String(registro.acreedor).toLocaleLowerCase('es')}`,
      },
    ]);
  }
}

export const MENSAJES = {
  deudaNoEncontrada: 'Deuda no encontrada',
  prestamoNoEncontrado: 'Préstamo no encontrado',
  otroInteres: 'Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo',
  registroSimultaneo: 'Ya se está registrando un préstamo de esa persona: vuelve a intentarlo',
  unicoConAbonos: 'No puedes eliminar el único préstamo de una deuda con abonos',
};

export const error404 = (message: string) => ({ statusCode: 404, message, error: 'Not Found' });
export const error409 = (message: string) => ({ statusCode: 409, message, error: 'Conflict' });

export const CLAVES_DE_UNA_DEUDA = ['acreedor', 'creadaEn', 'id', 'saldada', 'tipoInteres', 'valorInteres'];
export const CLAVES_DE_UNA_DEUDA_LISTADA = [
  ...CLAVES_DE_UNA_DEUDA,
  'abonado',
  'intereses',
  'prestado',
  'prestamos',
  'saldo',
].sort();
export const CLAVES_DE_UN_PRESTAMO = ['creadaEn', 'descripcion', 'fecha', 'id', 'monto'];

/** Fecha de calendario `YYYY-MM-DD` como se guarda: medianoche UTC. */
export const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

export interface Opciones {
  /** `null` = sin sesión; `undefined` = el usuario A. */
  token?: string | null;
  /** Valor del header `Idempotency-Key`. */
  clave?: string;
}

export interface EntornoDeudas {
  app: INestApplication;
  deudas: DeudasEnMemoria;
  transacciones: TransaccionesRealesEnMemoria;
  claves: IdempotenciasEnMemoria;
  /** Token del usuario A (USUARIO_ID). */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** `{ acreedor: 'Juan Pérez', monto: 500000, fecha: '2026-11-10' }`; un valor `undefined` quita el campo. */
  prestamoBase(cambios?: Record<string, unknown>): Record<string, unknown>;
  /** `POST /deudas/prestamos`. */
  registrar(cuerpo: unknown, opciones?: Opciones): request.Test;
  /** `GET /deudas`. */
  listar(opciones?: Opciones): request.Test;
  /** `DELETE /deudas/:deudaId/prestamos/:prestamoId`. */
  eliminar(deudaId: string, prestamoId: string, opciones?: Opciones): request.Test;
  /** `GET /reportes/periodo?<consulta>`. */
  periodo(consulta: string): request.Test;
  /** `GET /reportes/categorias?<consulta>`. */
  categoriasReporte(consulta: string): request.Test;
  /** `GET /ahorro/progreso?<consulta>`. */
  progreso(consulta: string): request.Test;
  listarTransacciones(): request.Test;
  editarTransaccion(id: string, cuerpo: unknown): request.Test;
  eliminarTransaccion(id: string): request.Test;
  /** Inserta una deuda directo en la base y devuelve su id. Las fechas de creación van en orden de siembra. */
  sembrarDeuda(datos?: Doc, usuarioId?: string): Promise<string>;
  /** Inserta una transacción (por defecto un egreso ordinario de $1.000 del 2026-11-03) y devuelve su id. */
  sembrarTransaccion(datos?: Doc, usuarioId?: string): Promise<string>;
  /** Inserta un préstamo como lo guardaría el POST ($500.000 del 2026-11-10) y devuelve el id de su transacción. */
  sembrarPrestamo(deudaId: string, datos?: Doc, usuarioId?: string): Promise<string>;
  /** Inserta un abono de $100.000 a la deuda y devuelve su id. */
  sembrarAbono(deudaId: string, usuarioId?: string): Promise<string>;
  /** Inserta una meta de ahorro del usuario A. */
  sembrarMeta(datos: Doc): Promise<void>;
  /** Copia de deudas y transacciones sin marcas de tiempo, para comprobar que «no se guarda nada». */
  foto(): unknown;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntornoDeudas(): EntornoDeudas {
  const entorno = {} as EntornoDeudas;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const deudas = new DeudasEnMemoria();
    const transacciones = new TransaccionesRealesEnMemoria();
    const categorias = new CategoriasRealesEnMemoria();
    const metas = new ColeccionEnMemoria(MetaAhorroSchema, 'MetaAhorro');
    const claves = new IdempotenciasEnMemoria();
    // Con las generales ya sembradas, la siembra del arranque no agrega otras.
    for (const tipo of ['EGRESO', 'INGRESO']) {
      await categorias.create({
        usuarioId: null,
        nombre: tipo === 'EGRESO' ? 'Otros egresos' : 'Otros ingresos',
        tipo,
        esPredeterminada: true,
        esRespaldo: true,
      });
    }

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        DeudasModule,
        TransaccionesModule,
        ReportesModule,
        AhorroModule,
      ],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken('Deuda'))
      .useValue(deudas)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue(new ComprasEnMemoria())
      .overrideProvider(getModelToken(MetaAhorro.name))
      .useValue(metas)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre (ver arnes-tarjetas.ts).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const enviar = (
      metodo: 'get' | 'post' | 'patch' | 'delete',
      ruta: string,
      cuerpo?: unknown,
      { token: quien, clave }: Opciones = {},
    ) => {
      let peticion = request(app.getHttpServer())[metodo](ruta);
      if (quien !== null) peticion = peticion.set('Authorization', `Bearer ${quien ?? entorno.token}`);
      if (clave !== undefined) peticion = peticion.set('Idempotency-Key', clave);
      return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
    };

    // Fechas de creación crecientes (un segundo cada una) para que el orden de siembra sea determinista.
    let segundos = 0;
    const fechar = (coleccion: ColeccionEnMemoria, id: string) => {
      const registro = coleccion.docs.find((doc) => String(doc._id) === id) as Doc;
      registro.createdAt = registro.updatedAt = new Date(Date.UTC(2026, 10, 1, 10, 0, segundos++));
    };
    const sembrarTransaccion = async (datos: Doc = {}, usuarioId = USUARIO_ID) => {
      const { id } = await transacciones.create({
        usuarioId: new ObjectId(usuarioId),
        tipo: 'EGRESO',
        monto: 1000,
        fecha: dia('2026-11-03'),
        metodoPago: 'EFECTIVO',
        clasificacionFlujo: 'ORDINARIO',
        ...datos,
      });
      fechar(transacciones, id);
      return id;
    };
    const sinMarcas = ({ createdAt: _creada, updatedAt: _actualizada, ...resto }: Doc) =>
      JSON.parse(JSON.stringify(resto));

    Object.assign(entorno, {
      app,
      deudas,
      transacciones,
      claves,
      token: tokens.generar(USUARIO_ID),
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      prestamoBase: (cambios: Record<string, unknown> = {}) => ({
        acreedor: 'Juan Pérez',
        monto: 500000,
        fecha: '2026-11-10',
        ...cambios,
      }),
      registrar: (cuerpo: unknown, opciones?: Opciones) => enviar('post', '/deudas/prestamos', cuerpo, opciones),
      listar: (opciones?: Opciones) => enviar('get', '/deudas', undefined, opciones),
      eliminar: (deudaId: string, prestamoId: string, opciones?: Opciones) =>
        enviar('delete', `/deudas/${deudaId}/prestamos/${prestamoId}`, undefined, opciones),
      periodo: (consulta: string) => enviar('get', `/reportes/periodo?${consulta}`),
      categoriasReporte: (consulta: string) => enviar('get', `/reportes/categorias?${consulta}`),
      progreso: (consulta: string) => enviar('get', `/ahorro/progreso?${consulta}`),
      listarTransacciones: () => enviar('get', '/transacciones'),
      editarTransaccion: (id: string, cuerpo: unknown) => enviar('patch', `/transacciones/${id}`, cuerpo),
      eliminarTransaccion: (id: string) => enviar('delete', `/transacciones/${id}`),
      sembrarDeuda: async (datos: Doc = {}, usuarioId = USUARIO_ID) => {
        const { id } = await deudas.create({
          usuarioId: new ObjectId(usuarioId),
          acreedor: 'Juan Pérez',
          ...datos,
        });
        fechar(deudas, id);
        return id;
      },
      sembrarTransaccion,
      sembrarPrestamo: (deudaId: string, datos: Doc = {}, usuarioId = USUARIO_ID) =>
        sembrarTransaccion(
          {
            tipo: 'INGRESO',
            monto: 500000,
            fecha: dia('2026-11-10'),
            descripcion: 'Préstamo recibido',
            clasificacionFlujo: 'DINERO_RECIBIDO',
            deudaId: new ObjectId(deudaId),
            ...datos,
          },
          usuarioId,
        ),
      sembrarAbono: (deudaId: string, usuarioId = USUARIO_ID) =>
        sembrarTransaccion(
          { monto: 100000, clasificacionFlujo: 'ABONO_DEUDA', deudaId: new ObjectId(deudaId) },
          usuarioId,
        ),
      sembrarMeta: async (datos: Doc) => {
        await metas.create({ usuarioId: new ObjectId(USUARIO_ID), ...datos });
      },
      foto: () => ({ deudas: deudas.docs.map(sinMarcas), transacciones: transacciones.docs.map(sinMarcas) }),
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  return entorno;
}

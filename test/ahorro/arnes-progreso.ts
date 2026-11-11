import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AhorroModule } from '../../src/ahorro/ahorro.module.js';
import { MetaAhorro } from '../../src/ahorro/meta-ahorro.schema.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { FIREBASE_AUTH } from '../../src/auth/firebase-auth.provider.js';
import { TokenService } from '../../src/auth/token.service.js';
import { Categoria } from '../../src/categorias/categoria.schema.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { ReportesModule } from '../../src/reportes/reportes.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../../src/transacciones/transacciones.module.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import {
  IdempotenciasEnMemoria,
  MetasEnMemoria,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  type DatosDeMeta,
} from './arnes-metas.js';

/**
 * Arnés de las pruebas de integración del progreso hacia la meta y del ahorro acumulado (paquete 4.3.1): la aplicación
 * real de Nest con el guard de sesión real, el ValidationPipe estricto y MongoDB reemplazado por colecciones en memoria
 * (metas, transacciones, categorías y claves de idempotencia). Incluye los módulos de ahorro, transacciones y reportes
 * para poder comparar el progreso con `GET /reportes/periodo` y editar metas por la API.
 *
 * Las colecciones en memoria soportan `find`/`findOne` (con lean, select, sort y exec encadenables), `create`,
 * `countDocuments` y `aggregate` con las etapas `$match` (sin castear ids, como MongoDB), `$group` (por un campo o por
 * `null`, con `$sum`) y `$sort`; el servicio puede leer con cualquiera de ellas. Vive en test/ (no es producción).
 */

export { MENSAJES, OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from './arnes-metas.js';
export const TERCER_USUARIO_ID = '665f1c2e9b1d4a0012ab3500';

type Doc = Record<string, any>;
const ObjectId = mongoose.Types.ObjectId;

// ---------------------------------------------------------------------------------------------------------------------
// Evaluación de filtros y agregaciones con la semántica de MongoDB
// ---------------------------------------------------------------------------------------------------------------------

type Clave = (valor: unknown) => string;

/** `find` castea los ids como Mongoose: un string de id y un ObjectId iguales coinciden. */
const claveFlexible: Clave = (valor) => (valor instanceof Date ? String(valor.getTime()) : String(valor));
/** `aggregate` no castea nada, como MongoDB: un string no coincide con un ObjectId. */
const claveEstricta: Clave = (valor) => {
  if (valor instanceof Date) return `fecha:${valor.getTime()}`;
  if (valor instanceof ObjectId) return `id:${valor.toString()}`;
  return `${typeof valor}:${String(valor)}`;
};
const esValor = (v: unknown) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId;

function cumple(doc: Doc, condicion: Doc, clave: Clave): boolean {
  return Object.entries(condicion).every(([campo, esperado]) => {
    if (campo === '$and') return (esperado as Doc[]).every((c) => cumple(doc, c, clave));
    if (campo === '$or') return (esperado as Doc[]).some((c) => cumple(doc, c, clave));
    const valor = doc[campo];
    if (esValor(esperado)) return clave(valor) === clave(esperado);
    return Object.entries(esperado as Doc).every(([operador, referencia]) => {
      const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : v);
      const izquierda = comparable(valor) as any;
      const derecha = comparable(referencia) as any;
      if (operador === '$in') return (referencia as unknown[]).some((r) => clave(r) === clave(valor));
      if (operador === '$nin') return !(referencia as unknown[]).some((r) => clave(r) === clave(valor));
      if (operador === '$eq') return clave(valor) === clave(referencia);
      if (operador === '$ne') return clave(valor) !== clave(referencia);
      if (operador === '$gt') return izquierda > derecha;
      if (operador === '$gte') return izquierda >= derecha;
      if (operador === '$lt') return izquierda < derecha;
      if (operador === '$lte') return izquierda <= derecha;
      throw new Error(`Operador no soportado por la prueba: ${operador}`);
    });
  });
}

/** Una consulta que se puede `await`ear directamente, como las de Mongoose, y también encadenar con lean/select/sort/exec. */
function consultaDe(obtener: (orden: unknown) => Doc[]) {
  let orden: unknown;
  const consulta = {
    lean: () => consulta,
    select: () => consulta,
    session: () => consulta,
    sort: (criterio: unknown) => {
      orden = criterio;
      return consulta;
    },
    exec: async () => obtener(orden),
    // Mongoose devuelve una consulta "thenable": por eso este objeto lo es a propósito.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (ok: (v: Doc[]) => unknown, fallo: (e: unknown) => unknown) => Promise.resolve(obtener(orden)).then(ok, fallo),
  };
  return consulta;
}

function ordenar(filas: Doc[], criterio: unknown): Doc[] {
  if (!criterio || typeof criterio !== 'object') return filas;
  const pares = Object.entries(criterio as Record<string, number>);
  return [...filas].sort((a, b) => {
    for (const [campo, sentido] of pares) {
      const x = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
      const y = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
      if (x < y) return -sentido;
      if (x > y) return sentido;
    }
    return 0;
  });
}

function agrupar(filas: Doc[], { _id: clave, ...acumuladores }: Doc): Doc[] {
  const esNulo = clave === null;
  if (!esNulo && (typeof clave !== 'string' || !clave.startsWith('$'))) {
    throw new Error('La prueba solo soporta $group por un campo ({ _id: "$campo" }) o por null');
  }
  const grupos = new Map<string, Doc>();
  for (const fila of filas) {
    const valor = esNulo ? null : fila[(clave as string).slice(1)];
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

function agregacion(docs: Doc[], etapas: Doc[]) {
  return consultaDe(() => {
    let filas: Doc[] = docs;
    for (const etapa of etapas) {
      if (etapa.$match) filas = filas.filter((doc) => cumple(doc, etapa.$match as Doc, claveEstricta));
      else if (etapa.$group) filas = agrupar(filas, etapa.$group as Doc);
      else if (etapa.$sort) filas = ordenar(filas, etapa.$sort);
      else throw new Error(`Etapa no soportada por la prueba: ${Object.keys(etapa).join(', ')}`);
    }
    return filas;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Colecciones en memoria
// ---------------------------------------------------------------------------------------------------------------------

/** Las metas en memoria del arnés del CRUD, más `aggregate`. */
export class MetasConAgregacion extends MetasEnMemoria {
  aggregate(etapas: Doc[]) {
    return agregacion(this.registros, etapas);
  }
}

/** Transacciones en memoria con lo que usan el reporte, el progreso y el CRUD de transacciones. */
export class TransaccionesEnMemoria {
  docs: Doc[] = [];

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
    doc.save = async () => doc;
    this.docs.push(doc);
    return doc;
  }

  async create(datos: Doc) {
    return this.agregar(String(datos.usuarioId), datos);
  }

  find(filtro: Doc = {}) {
    return consultaDe((orden) =>
      ordenar(
        this.docs.filter((doc) => cumple(doc, filtro, claveFlexible)),
        orden,
      ),
    );
  }

  async findOne(filtro: Doc) {
    return this.docs.find((doc) => cumple(doc, filtro, claveFlexible)) ?? null;
  }

  aggregate(etapas: Doc[]) {
    return agregacion(this.docs, etapas);
  }

  async countDocuments(filtro: Doc = {}) {
    return this.docs.filter((doc) => cumple(doc, filtro, claveFlexible)).length;
  }

  async deleteOne({ _id }: Doc) {
    this.docs = this.docs.filter((doc) => String(doc._id) !== String(_id));
  }
}

/** Categorías generales en memoria: la siembra del arranque cuenta las predeterminadas y, con una, no siembra nada. */
class CategoriasEnMemoria {
  docs: Doc[] = [{ _id: new ObjectId(), usuarioId: null, nombre: 'Otros', tipo: 'EGRESO', esPredeterminada: true }];

  async findById(id: string) {
    return this.docs.find((doc) => String(doc._id) === id) ?? null;
  }

  find(filtro: Doc = {}) {
    return consultaDe(() => this.docs.filter((doc) => cumple(doc, filtro, claveFlexible)));
  }

  async countDocuments() {
    return this.docs.filter((doc) => doc.esPredeterminada).length;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación de prueba y atajos
// ---------------------------------------------------------------------------------------------------------------------

/** Fecha de calendario `YYYY-MM-DD` como se guarda: medianoche UTC. */
export const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

/** `toBeCloseTo` con 4 decimales por defecto: los montos conservan la precisión completa, pero el orden de las operaciones no importa. */
export const cerca = (actual: unknown, esperado: number, decimales = 4) => {
  expect(typeof actual).toBe('number');
  expect(actual as number).toBeCloseTo(esperado, decimales);
};

export interface OpcionesDePeticion {
  /** `null` = sin sesión; por defecto, la del usuario A. */
  token?: string | null;
  /** Valor del header `X-Zona-Horaria`. */
  zona?: string;
}

export interface EntornoProgreso {
  app: INestApplication;
  metas: MetasConAgregacion;
  transacciones: TransaccionesEnMemoria;
  /** Token del usuario A (USUARIO_ID). Se vuelve a emitir con `hoyEs`. */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** Emite un token para cualquier usuario. */
  tokenDe(usuarioId: string): string;
  /** `GET /ahorro/progreso` con la query opcional (`'mes=2026-11'`). */
  progreso(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `GET /ahorro/acumulado` con la query opcional (`'hasta=2026-09'`). */
  acumulado(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `GET /reportes/periodo` con la query opcional. */
  reporte(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `PATCH /ahorro/metas/:id`. */
  editarMeta(id: string, cuerpo: unknown, opciones?: OpcionesDePeticion): request.Test;
  /** `DELETE /ahorro/metas/:id`. */
  eliminarMeta(id: string, opciones?: OpcionesDePeticion): request.Test;
  /** Inserta una meta directo en la base y devuelve su id. */
  sembrarMeta(datos?: DatosDeMeta, usuarioId?: string): Promise<string>;
  /** El documento guardado de la meta con ese id. */
  metaGuardada(id: string): Doc | undefined;
  /** Fija "hoy" (solo `Date`) y vuelve a emitir las sesiones para que sean coherentes con el reloj simulado. */
  hoyEs(iso: string): void;
  ingreso(fecha: string, monto: number, usuarioId?: string): Doc;
  egreso(fecha: string, monto: number, usuarioId?: string): Doc;
  pagoTarjeta(fecha: string, monto: number, usuarioId?: string): Doc;
  abonoDeuda(fecha: string, monto: number, usuarioId?: string): Doc;
  dineroRecibido(fecha: string, monto: number, usuarioId?: string): Doc;
  /** Siembra el "mes base" de los criterios (2026-11): ingreso propio 3.000.000, egresos 2.700.000, ahorro del mes 300.000. */
  sembrarMesBase(usuarioId?: string): void;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntornoProgreso(): EntornoProgreso {
  const entorno = {} as EntornoProgreso;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const metas = new MetasConAgregacion();
    const transacciones = new TransaccionesEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        AhorroModule,
        TransaccionesModule,
        ReportesModule,
      ],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(MetaAhorro.name))
      .useValue(metas)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(new CategoriasEnMemoria())
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(new IdempotenciasEnMemoria())
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre. Si no, supertest levanta uno por petición y el primero que
    // termina lo cierra: con peticiones simultáneas, las demás se cortan (ECONNRESET en Linux; en Windows no se nota).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const conSesion = (peticion: request.Test, { token, zona }: OpcionesDePeticion = {}) => {
      if (token !== null) peticion.set('Authorization', `Bearer ${token ?? entorno.token}`);
      if (zona !== undefined) peticion.set('X-Zona-Horaria', zona);
      return peticion;
    };
    const ruta = (base: string, consulta: string) => `${base}${consulta ? `?${consulta}` : ''}`;
    const movimiento = (usuarioId: string, fecha: string, monto: number, cambios: Doc) =>
      transacciones.agregar(usuarioId, { monto, fecha: dia(fecha), ...cambios });

    Object.assign(entorno, {
      app,
      metas,
      transacciones,
      token: tokens.generar(USUARIO_ID),
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      tokenDe: (usuarioId: string) => tokens.generar(usuarioId),
      progreso: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/ahorro/progreso', consulta)), opciones),
      acumulado: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/ahorro/acumulado', consulta)), opciones),
      reporte: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/reportes/periodo', consulta)), opciones),
      editarMeta: (id: string, cuerpo: unknown, opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).patch(`/ahorro/metas/${id}`), opciones).send(cuerpo as object),
      eliminarMeta: (id: string, opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).delete(`/ahorro/metas/${id}`), opciones),
      sembrarMeta: async (datos: DatosDeMeta = {}, usuarioId = USUARIO_ID) => {
        const { tipoMeta = 'PORCENTAJE', valorObjetivo = 20, periodo = '2026-11', ahorroReal } = datos;
        const meta = await metas.create({
          usuarioId,
          tipoMeta,
          valorObjetivo,
          periodo: new Date(`${periodo}-01T00:00:00Z`),
          ...(ahorroReal === undefined ? {} : { ahorroReal }),
        });
        return meta.id;
      },
      metaGuardada: (id: string) => metas.docs.find((registro) => String(registro._id) === id),
      hoyEs: (iso: string) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(iso));
        entorno.token = tokens.generar(USUARIO_ID);
        entorno.tokenOtro = tokens.generar(OTRO_USUARIO_ID);
      },
      ingreso: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, { tipo: 'INGRESO' }),
      egreso: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, { tipo: 'EGRESO' }),
      pagoTarjeta: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'EGRESO',
          metodoPago: 'TRANSFERENCIA',
          clasificacionFlujo: 'PAGO_TARJETA',
          tarjetaId: new ObjectId(),
        }),
      abonoDeuda: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'EGRESO',
          clasificacionFlujo: 'ABONO_DEUDA',
          deudaId: new ObjectId(),
        }),
      dineroRecibido: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'INGRESO',
          clasificacionFlujo: 'DINERO_RECIBIDO',
          deudaId: new ObjectId(),
        }),
      sembrarMesBase: (usuarioId = USUARIO_ID) => {
        entorno.ingreso('2026-11-01', 2_800_000, usuarioId);
        entorno.ingreso('2026-11-15', 200_000, usuarioId);
        entorno.dineroRecibido('2026-11-08', 500_000, usuarioId);
        entorno.egreso('2026-11-03', 1_200_000, usuarioId);
        entorno.egreso('2026-11-10', 600_000, usuarioId);
        entorno.pagoTarjeta('2026-11-20', 700_000, usuarioId);
        entorno.abonoDeuda('2026-11-22', 200_000, usuarioId);
      },
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  return entorno;
}

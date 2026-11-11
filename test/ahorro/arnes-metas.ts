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
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';

/**
 * Arnés de las pruebas de integración del CRUD de metas de ahorro (paquete 4.1.2): la aplicación real de Nest con el
 * guard de sesión real, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB reemplazado por
 * colecciones en memoria. Vive en test/ (no es producción ni una prueba): lo comparten los archivos *.integration.spec.ts.
 */

export const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
export const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
export const SECRETO_JWT = 'secreto-solo-para-pruebas';

export const MENSAJES = {
  noEncontrada: 'Meta de ahorro no encontrada',
  duplicada: 'Ya existe una meta de ahorro para ese mes',
  conAhorro: 'No se puede eliminar una meta que ya tiene ahorro registrado',
};

export const CLAVES_DE_UNA_META = ['actualizadaEn', 'ahorroReal', 'creadaEn', 'id', 'periodo', 'tipoMeta', 'valorObjetivo'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Lo que devuelve la API por cada meta; `parcial` fija los campos que importan en cada prueba. */
export const metaEsperada = (parcial: Record<string, unknown> = {}) => ({
  id: expect.stringMatching(/^[0-9a-f]{24}$/),
  tipoMeta: expect.any(String),
  valorObjetivo: expect.any(Number),
  periodo: expect.stringMatching(/^\d{4}-\d{2}$/),
  ahorroReal: expect.any(Number),
  creadaEn: expect.stringMatching(FECHA_ISO),
  actualizadaEn: expect.stringMatching(FECHA_ISO),
  ...parcial,
});

/** `true` si algún texto de `message` (arreglo de problemas de validación) empieza por el campo. */
export const mensajeDeCampo = (body: { message?: unknown }, campo: string): boolean =>
  Array.isArray(body.message) && body.message.some((mensaje) => typeof mensaje === 'string' && mensaje.startsWith(campo));

/** `true` si algún texto de `message` menciona el campo (para los campos que el ValidationPipe rechaza por sobrantes). */
export const mensajeMencionaCampo = (body: { message?: unknown }, campo: string): boolean =>
  Array.isArray(body.message) && body.message.some((mensaje) => typeof mensaje === 'string' && mensaje.includes(campo));

// ---------------------------------------------------------------------------------------------------------------------
// Colección de metas en memoria
// ---------------------------------------------------------------------------------------------------------------------

type Doc = Record<string, any>;
const ObjectId = mongoose.Types.ObjectId;

// Un modelo real de Mongoose sobre el esquema real, sin conexión: da los mismos setters (periodo al día 1 UTC), valores
// por defecto y validadores que la base de verdad. Solo `create` y `save` validan, como en Mongoose; las actualizaciones
// (`findOneAndUpdate`, `updateOne`) castean pero no validan, así que el tope de 100 del porcentaje lo tiene que revisar el servicio.
const ModeloReal = mongoose.createConnection().model('MetaAhorroEnMemoria', MetaAhorroSchema);

const comparable = (valor: unknown): unknown =>
  valor instanceof Date ? valor.getTime() : valor instanceof ObjectId ? valor.toString() : valor;

const esOperador = (esperado: unknown): esperado is Doc =>
  typeof esperado === 'object' &&
  esperado !== null &&
  !(esperado instanceof Date) &&
  !(esperado instanceof ObjectId) &&
  Object.keys(esperado).some((clave) => clave.startsWith('$'));

function operar(operador: string, real: unknown, valor: unknown): boolean {
  const izquierda = comparable(real) as any;
  const derecha = comparable(valor) as any;
  switch (operador) {
    case '$eq':
      return izquierda === derecha;
    case '$ne':
      return izquierda !== derecha;
    case '$gt':
      return izquierda > derecha;
    case '$gte':
      return izquierda >= derecha;
    case '$lt':
      return izquierda < derecha;
    case '$lte':
      return izquierda <= derecha;
    case '$in':
      return (valor as unknown[]).map(comparable).includes(izquierda);
    case '$nin':
      return !(valor as unknown[]).map(comparable).includes(izquierda);
    default:
      throw new Error(`El arnés de pruebas no soporta el operador ${operador}`);
  }
}

function coincide(registro: Doc, filtro: Doc = {}): boolean {
  return Object.entries(filtro).every(([campo, esperado]) => {
    if (campo === '$and') return (esperado as Doc[]).every((sub) => coincide(registro, sub));
    if (campo === '$or') return (esperado as Doc[]).some((sub) => coincide(registro, sub));
    const real = registro[campo];
    if (esOperador(esperado)) {
      return Object.entries(esperado).every(([operador, valor]) => operar(operador, real, valor));
    }
    return comparable(real) === comparable(esperado);
  });
}

/** `{ periodo: -1 }`, `'-periodo'` o `[['periodo', -1]]` → comparador. */
function comparador(orden: unknown): (a: Doc, b: Doc) => number {
  const criterios: Array<[string, number]> = [];
  if (typeof orden === 'string') {
    for (const parte of orden.split(/\s+/).filter(Boolean)) {
      criterios.push(parte.startsWith('-') ? [parte.slice(1), -1] : [parte, 1]);
    }
  } else if (Array.isArray(orden)) {
    for (const [campo, sentido] of orden as Array<[string, number | string]>) {
      criterios.push([campo, sentido === -1 || sentido === 'desc' || sentido === 'descending' ? -1 : 1]);
    }
  } else if (orden && typeof orden === 'object') {
    for (const [campo, sentido] of Object.entries(orden as Record<string, number | string>)) {
      criterios.push([campo, sentido === -1 || sentido === 'desc' || sentido === 'descending' ? -1 : 1]);
    }
  }
  return (a, b) => {
    for (const [campo, sentido] of criterios) {
      const x = comparable(a[campo]) as any;
      const y = comparable(b[campo]) as any;
      if (x < y) return -sentido;
      if (x > y) return sentido;
    }
    return 0;
  };
}

/** Como una Query de Mongoose: encadenable y no ejecuta nada hasta que se la espera con `await`. */
class Consulta<T> {
  esLean = false;
  orden: unknown;
  tope: number | undefined;
  saltos = 0;

  constructor(private readonly ejecutar: (consulta: Consulta<T>) => Promise<T>) {}

  lean() {
    this.esLean = true;
    return this;
  }

  sort(orden: unknown) {
    this.orden = orden;
    return this;
  }

  limit(tope: number) {
    this.tope = tope;
    return this;
  }

  skip(saltos: number) {
    this.saltos = saltos;
    return this;
  }

  select() {
    return this;
  }

  session() {
    return this;
  }

  exec(): Promise<T> {
    return this.ejecutar(this);
  }

  // Una Query de Mongoose se puede `await`ear directamente; por eso este objeto es "thenable" a propósito.
  // oxlint-disable-next-line unicorn/no-thenable
  then<R1 = T, R2 = never>(ok?: (valor: T) => R1 | PromiseLike<R1>, fallo?: (error: unknown) => R2 | PromiseLike<R2>) {
    return this.exec().then(ok, fallo);
  }

  catch<R = never>(fallo: (error: unknown) => R | PromiseLike<R>) {
    return this.exec().catch(fallo);
  }
}

/** Documento hidratado: `id`, `toObject()`, `save()` y `deleteOne()` como el de Mongoose, sobre los datos guardados. */
class MetaDoc {
  [campo: string]: any;

  constructor(
    private readonly coleccion: MetasEnMemoria,
    registro: Doc,
  ) {
    Object.assign(this, registro);
  }

  get id(): string {
    return String(this._id);
  }

  toObject(): Doc {
    const { _id, usuarioId, tipoMeta, valorObjetivo, periodo, ahorroReal, createdAt, updatedAt } = this;
    return { _id, usuarioId, tipoMeta, valorObjetivo, periodo, ahorroReal, createdAt, updatedAt };
  }

  toJSON(): Doc {
    return this.toObject();
  }

  save(): Promise<MetaDoc> {
    return this.coleccion.guardar(this);
  }

  deleteOne() {
    return this.coleccion.deleteOne({ _id: this._id });
  }
}

const pausa = () => new Promise<void>((resolver) => setImmediate(resolver));
const claveUnica = (registro: Doc) => `${String(registro.usuarioId)}|${(registro.periodo as Date).getTime()}`;
const errorDeClaveDuplicada = () =>
  Object.assign(new Error('E11000 duplicate key error collection: metasahorro index: usuarioId_1_periodo_1'), {
    code: 11000,
  });

/**
 * Colección `metasahorro` en memoria. Cada operación cede el turno al resto de peticiones antes de ejecutarse
 * (como el viaje a la red), así dos peticiones simultáneas se entrelazan de verdad: ambas pueden leer "no existe" y
 * el índice único `{ usuarioId, periodo }` (error E11000, código 11000) es lo que frena a la segunda.
 */
export class MetasEnMemoria {
  readonly schema = MetaAhorroSchema;
  registros: Doc[] = [];

  /** Lo guardado, tal cual. Para comprobar el estado de la base en las pruebas. */
  get docs(): Doc[] {
    return this.registros;
  }

  private hidratar(registro: Doc): MetaDoc {
    return new MetaDoc(this, { ...registro });
  }

  private resultado(consulta: { esLean: boolean; orden: unknown; saltos: number; tope: number | undefined }, registros: Doc[]): any[] {
    const ordenados = consulta.orden ? [...registros].sort(comparador(consulta.orden)) : [...registros];
    const recortados = ordenados.slice(consulta.saltos, consulta.tope ? consulta.saltos + consulta.tope : undefined);
    return recortados.map((registro) => (consulta.esLean ? { ...registro } : this.hidratar(registro)));
  }

  private aplicar(registro: Doc, actualizacion: Doc): void {
    const cambios: Doc =
      actualizacion.$set ?? Object.fromEntries(Object.entries(actualizacion).filter(([clave]) => !clave.startsWith('$')));
    const nuevo = {
      ...new ModeloReal({ ...registro, ...cambios }).toObject(),
      createdAt: registro.createdAt,
      updatedAt: new Date(),
    };
    if (this.registros.some((otro) => otro !== registro && claveUnica(otro) === claveUnica(nuevo))) {
      throw errorDeClaveDuplicada();
    }
    Object.assign(registro, nuevo);
  }

  async create(datos: Doc): Promise<MetaDoc> {
    await pausa();
    const instancia = new ModeloReal(datos);
    await instancia.validate();
    const ahora = new Date();
    const registro = { ...instancia.toObject(), createdAt: ahora, updatedAt: ahora };
    if (this.registros.some((otro) => claveUnica(otro) === claveUnica(registro))) throw errorDeClaveDuplicada();
    this.registros.push(registro);
    return this.hidratar(registro);
  }

  async guardar(doc: MetaDoc): Promise<MetaDoc> {
    await pausa();
    const instancia = new ModeloReal(doc.toObject());
    await instancia.validate();
    const registro = this.registros.find((r) => String(r._id) === String(doc._id));
    if (!registro) throw new Error('El documento ya no existe');
    this.aplicar(registro, instancia.toObject());
    Object.assign(doc, registro);
    return doc;
  }

  find(filtro: Doc = {}) {
    return new Consulta<any[]>(async (consulta) => {
      await pausa();
      return this.resultado(
        consulta,
        this.registros.filter((r) => coincide(r, filtro)),
      );
    });
  }

  findOne(filtro: Doc = {}) {
    return new Consulta<any>(async (consulta) => {
      await pausa();
      const primero = this.registros.find((r) => coincide(r, filtro));
      return primero ? this.resultado(consulta, [primero])[0] : null;
    });
  }

  findById(id: unknown) {
    return this.findOne({ _id: id });
  }

  findOneAndUpdate(filtro: Doc, actualizacion: Doc, opciones: Doc = {}) {
    return new Consulta<any>(async (consulta) => {
      await pausa();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (!registro) return null;
      const antes = { ...registro };
      this.aplicar(registro, actualizacion);
      const devuelve = opciones.new === true || opciones.returnDocument === 'after' ? registro : antes;
      return this.resultado(consulta, [devuelve])[0];
    });
  }

  findByIdAndUpdate(id: unknown, actualizacion: Doc, opciones: Doc = {}) {
    return this.findOneAndUpdate({ _id: id }, actualizacion, opciones);
  }

  updateOne(filtro: Doc, actualizacion: Doc) {
    return new Consulta<Doc>(async () => {
      await pausa();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (!registro) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      this.aplicar(registro, actualizacion);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }

  findOneAndDelete(filtro: Doc) {
    return new Consulta<any>(async (consulta) => {
      await pausa();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (!registro) return null;
      this.registros = this.registros.filter((r) => r !== registro);
      return this.resultado(consulta, [registro])[0];
    });
  }

  findByIdAndDelete(id: unknown) {
    return this.findOneAndDelete({ _id: id });
  }

  deleteOne(filtro: Doc) {
    return new Consulta<Doc>(async () => {
      await pausa();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (registro) this.registros = this.registros.filter((r) => r !== registro);
      return { acknowledged: true, deletedCount: registro ? 1 : 0 };
    });
  }

  deleteMany(filtro: Doc = {}) {
    return new Consulta<Doc>(async () => {
      await pausa();
      const antes = this.registros.length;
      this.registros = this.registros.filter((r) => !coincide(r, filtro));
      return { acknowledged: true, deletedCount: antes - this.registros.length };
    });
  }

  countDocuments(filtro: Doc = {}) {
    return new Consulta<number>(async () => {
      await pausa();
      return this.registros.filter((r) => coincide(r, filtro)).length;
    });
  }

  exists(filtro: Doc) {
    return new Consulta<Doc | null>(async () => {
      await pausa();
      const registro = this.registros.find((r) => coincide(r, filtro));
      return registro ? { _id: registro._id } : null;
    });
  }
}

/** Claves de idempotencia en memoria, con la garantía del índice único: dos altas simultáneas de la misma clave no pasan. */
export class IdempotenciasEnMemoria {
  docs: Doc[] = [];

  async create(datos: Doc) {
    await Promise.resolve();
    if (this.docs.some((d) => String(d.usuarioId) === String(datos.usuarioId) && d.clave === datos.clave)) {
      throw errorDeClaveDuplicada();
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

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación de prueba y atajos HTTP
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosDeMeta {
  tipoMeta?: string;
  valorObjetivo?: number;
  /** `YYYY-MM`. */
  periodo?: string;
  ahorroReal?: number;
}

export interface Entorno {
  app: INestApplication;
  metas: MetasEnMemoria;
  claves: IdempotenciasEnMemoria;
  /** Token del usuario A (USUARIO_ID). */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** POST /ahorro/metas. `token: null` = sin sesión. */
  crear(cuerpo: unknown, opciones?: { token?: string | null; clave?: string }): request.Test;
  /** GET /ahorro/metas con una query opcional (`'desde=2026-09'`). */
  listar(consulta?: string, token?: string | null): request.Test;
  obtener(id: string, token?: string | null): request.Test;
  editar(id: string, cuerpo: unknown, token?: string | null): request.Test;
  eliminar(id: string, token?: string | null): request.Test;
  /** Inserta una meta directo en la base (sin pasar por la API) y devuelve su id. */
  sembrar(datos?: DatosDeMeta, usuarioId?: string): Promise<string>;
  /** El documento guardado con ese id, o `undefined` si no existe. */
  guardada(id: string): Doc | undefined;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntorno(): Entorno {
  const entorno = {} as Entorno;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const metas = new MetasEnMemoria();
    const claves = new IdempotenciasEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, AhorroModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(MetaAhorro.name))
      .useValue(metas)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre. Si no, supertest levanta uno por petición y el primero que
    // termina lo cierra: con peticiones simultáneas, las demás se cortan (ECONNRESET en Linux; en Windows no se nota).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const token = tokens.generar(USUARIO_ID);
    const conSesion = (peticion: request.Test, quien: string | null | undefined) =>
      quien === null ? peticion : peticion.set('Authorization', `Bearer ${quien ?? token}`);

    Object.assign(entorno, {
      app,
      metas,
      claves,
      token,
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      crear: (cuerpo: unknown, { token: quien, clave }: { token?: string | null; clave?: string } = {}) => {
        const peticion = conSesion(request(app.getHttpServer()).post('/ahorro/metas'), quien);
        if (clave !== undefined) peticion.set('Idempotency-Key', clave);
        return peticion.send(cuerpo as object);
      },
      listar: (consulta = '', quien?: string | null) =>
        conSesion(request(app.getHttpServer()).get(`/ahorro/metas${consulta ? `?${consulta}` : ''}`), quien),
      obtener: (id: string, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).get(`/ahorro/metas/${id}`), quien),
      editar: (id: string, cuerpo: unknown, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).patch(`/ahorro/metas/${id}`), quien).send(cuerpo as object),
      eliminar: (id: string, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).delete(`/ahorro/metas/${id}`), quien),
      sembrar: async (datos: DatosDeMeta = {}, usuarioId = USUARIO_ID) => {
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
      guardada: (id: string) => metas.docs.find((registro) => String(registro._id) === id),
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.unstubAllEnvs();
  });

  return entorno;
}

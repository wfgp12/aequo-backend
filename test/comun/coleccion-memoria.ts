import mongoose from 'mongoose';

/**
 * Colección de MongoDB en memoria, genérica, para los arneses de integración (metas de ahorro, tarjetas y cargos…).
 * Se construye con el esquema real del módulo: un modelo real de Mongoose sin conexión da los mismos setters (trim,
 * normalización de fechas), valores por defecto y validadores que la base de verdad. Solo `create` y `save` validan, como
 * en Mongoose; las actualizaciones (`findOneAndUpdate`, `updateOne`) castean pero no validan, así que las reglas que un
 * esquema no expresa en la actualización las tiene que revisar el servicio. Vive en test/ (no es producción).
 *
 * Cada operación cede el turno al resto de peticiones antes de ejecutarse (como el viaje a la red), así dos peticiones
 * simultáneas se entrelazan de verdad: ambas pueden leer "no existe" y el índice único (error E11000, código 11000) es lo
 * que frena a la segunda.
 */

export type Doc = Record<string, any>;
const ObjectId = mongoose.Types.ObjectId;

/** Un índice único del esquema: `clave` devuelve el texto que identifica al registro dentro del índice. */
export interface IndiceUnico {
  nombre: string;
  clave: (registro: Doc) => string;
}

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
  const sentidoDe = (sentido: number | string) =>
    sentido === -1 || sentido === 'desc' || sentido === 'descending' ? -1 : 1;
  if (typeof orden === 'string') {
    for (const parte of orden.split(/\s+/).filter(Boolean)) {
      criterios.push(parte.startsWith('-') ? [parte.slice(1), -1] : [parte, 1]);
    }
  } else if (Array.isArray(orden)) {
    for (const [campo, sentido] of orden as Array<[string, number | string]>)
      criterios.push([campo, sentidoDe(sentido)]);
  } else if (orden && typeof orden === 'object') {
    for (const [campo, sentido] of Object.entries(orden as Record<string, number | string>)) {
      criterios.push([campo, sentidoDe(sentido)]);
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

  collation() {
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
class DocumentoHidratado {
  [campo: string]: any;

  constructor(coleccion: ColeccionEnMemoria, registro: Doc) {
    // No enumerable: así no se copia con `{ ...doc }` ni aparece en `toObject()`.
    Object.defineProperty(this, 'coleccion', { value: coleccion, enumerable: false });
    Object.assign(this, registro);
  }

  get id(): string {
    return String(this._id);
  }

  toObject(): Doc {
    return Object.fromEntries(this.coleccion.campos.map((campo: string) => [campo, this[campo]]));
  }

  toJSON(): Doc {
    return this.toObject();
  }

  save(): Promise<DocumentoHidratado> {
    return this.coleccion.guardar(this);
  }

  deleteOne() {
    return this.coleccion.deleteOne({ _id: this._id });
  }
}

const pausa = () => new Promise<void>((resolver) => setImmediate(resolver));

export const errorDeClaveDuplicada = (detalle = 'indice') =>
  Object.assign(new Error(`E11000 duplicate key error ${detalle}`), { code: 11000 });

let contadorDeModelos = 0;

export class ColeccionEnMemoria {
  registros: Doc[] = [];
  /** Si es `true`, toda escritura (crear, guardar, actualizar, borrar) falla como si la base no respondiera. */
  fallaEscritura = false;
  /** Los campos que guarda el esquema (sin `__v`): lo que devuelve `toObject()`. */
  readonly campos: string[];
  private readonly modelo;

  constructor(
    readonly schema: mongoose.Schema,
    private readonly nombre: string,
    private readonly indicesUnicos: IndiceUnico[] = [],
  ) {
    // Un modelo real de Mongoose sobre el esquema real, sin conexión.
    this.modelo = mongoose.createConnection().model(`${nombre}EnMemoria${contadorDeModelos++}`, schema);
    this.campos = Object.keys(schema.paths).filter((campo) => campo !== '__v');
  }

  /** Lo guardado, tal cual. Para comprobar el estado de la base en las pruebas. */
  get docs(): Doc[] {
    return this.registros;
  }

  private hidratar(registro: Doc): DocumentoHidratado {
    return new DocumentoHidratado(this, { ...registro });
  }

  private resultado(
    consulta: { esLean: boolean; orden: unknown; saltos: number; tope: number | undefined },
    registros: Doc[],
  ): any[] {
    const ordenados = consulta.orden ? [...registros].sort(comparador(consulta.orden)) : [...registros];
    const recortados = ordenados.slice(consulta.saltos, consulta.tope ? consulta.saltos + consulta.tope : undefined);
    return recortados.map((registro) => (consulta.esLean ? { ...registro } : this.hidratar(registro)));
  }

  private verificarEscritura(): void {
    if (this.fallaEscritura) throw new Error('Fallo simulado de la base de datos');
  }

  /** Lanza el error de clave duplicada si otro registro ya ocupa la misma clave de algún índice único. */
  private verificarUnicidad(registro: Doc, ignorar?: Doc): void {
    for (const { nombre, clave } of this.indicesUnicos) {
      if (this.registros.some((otro) => otro !== ignorar && clave(otro) === clave(registro))) {
        throw errorDeClaveDuplicada(`collection: ${this.nombre} index: ${nombre}`);
      }
    }
  }

  private aplicar(registro: Doc, actualizacion: Doc): void {
    const cambios: Doc =
      actualizacion.$set ??
      Object.fromEntries(Object.entries(actualizacion).filter(([clave]) => !clave.startsWith('$')));
    const nuevo = {
      ...new this.modelo({ ...registro, ...cambios }).toObject(),
      createdAt: registro.createdAt,
      updatedAt: new Date(),
    };
    this.verificarUnicidad(nuevo, registro);
    Object.assign(registro, nuevo);
  }

  async create(datos: Doc): Promise<DocumentoHidratado> {
    await pausa();
    this.verificarEscritura();
    const instancia = new this.modelo(datos);
    await instancia.validate();
    const ahora = new Date();
    const registro = { ...instancia.toObject(), createdAt: ahora, updatedAt: ahora };
    this.verificarUnicidad(registro);
    this.registros.push(registro);
    return this.hidratar(registro);
  }

  async guardar(doc: DocumentoHidratado): Promise<DocumentoHidratado> {
    await pausa();
    this.verificarEscritura();
    const instancia = new this.modelo(doc.toObject());
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
      this.verificarEscritura();
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
      this.verificarEscritura();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (!registro) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      this.aplicar(registro, actualizacion);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }

  /** Actualiza todos los registros que cumplan el filtro (con `$set` o con los campos directos). */
  updateMany(filtro: Doc, actualizacion: Doc) {
    return new Consulta<Doc>(async () => {
      await pausa();
      this.verificarEscritura();
      const coincidencias = this.registros.filter((r) => coincide(r, filtro));
      for (const registro of coincidencias) this.aplicar(registro, actualizacion);
      return { acknowledged: true, matchedCount: coincidencias.length, modifiedCount: coincidencias.length };
    });
  }

  async insertMany(lista: Doc[]): Promise<DocumentoHidratado[]> {
    const creados: DocumentoHidratado[] = [];
    for (const datos of lista) creados.push(await this.create(datos));
    return creados;
  }

  findOneAndDelete(filtro: Doc) {
    return new Consulta<any>(async (consulta) => {
      await pausa();
      this.verificarEscritura();
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
      this.verificarEscritura();
      const registro = this.registros.find((r) => coincide(r, filtro));
      if (registro) this.registros = this.registros.filter((r) => r !== registro);
      return { acknowledged: true, deletedCount: registro ? 1 : 0 };
    });
  }

  deleteMany(filtro: Doc = {}) {
    return new Consulta<Doc>(async () => {
      await pausa();
      this.verificarEscritura();
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
      throw errorDeClaveDuplicada('collection: idempotencias index: usuarioId_1_clave_1');
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

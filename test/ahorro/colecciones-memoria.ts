import mongoose from 'mongoose';

/**
 * Colecciones en memoria de transacciones y categorías, compartidas por los arneses de las pruebas de integración del
 * módulo de ahorro (`arnes-metas.ts` y `arnes-progreso.ts`). El módulo de ahorro lee transacciones (para el progreso del
 * mes), así que cualquier arnés que lo monte debe sustituir también los modelos `Transaccion` y `Categoria` que registra
 * el módulo de reportes. Vive en test/ (no es producción).
 *
 * Soportan `find`/`findOne` (con lean, select, session y sort encadenables y `await`eables), `create`, `countDocuments`
 * y `aggregate` con `$match` (sin castear ids, como MongoDB), `$group` (por un campo o por `null`, con `$sum`) y `$sort`.
 */

export type Doc = Record<string, any>;
const ObjectId = mongoose.Types.ObjectId;

// ---------------------------------------------------------------------------------------------------------------------
// Evaluación de filtros y agregaciones con la semántica de MongoDB
// ---------------------------------------------------------------------------------------------------------------------

type Clave = (valor: unknown) => string;

/** `find` castea los ids como Mongoose: un string de id y un ObjectId iguales coinciden. */
export const claveFlexible: Clave = (valor) => (valor instanceof Date ? String(valor.getTime()) : String(valor));
/** `aggregate` no castea nada, como MongoDB: un string no coincide con un ObjectId. */
const claveEstricta: Clave = (valor) => {
  if (valor instanceof Date) return `fecha:${valor.getTime()}`;
  if (valor instanceof ObjectId) return `id:${valor.toString()}`;
  return `${typeof valor}:${String(valor)}`;
};
const esValor = (v: unknown) => v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId;

export function cumple(doc: Doc, condicion: Doc, clave: Clave): boolean {
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
export function consultaDe(obtener: (orden: unknown) => Doc[]) {
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

export function agregacion(docs: Doc[], etapas: Doc[]) {
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
export class CategoriasEnMemoria {
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


/** Fecha de calendario `YYYY-MM-DD` como se guarda: medianoche UTC. */
export const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

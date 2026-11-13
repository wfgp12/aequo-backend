import { CategoriaSchema } from '../../src/categorias/categoria.schema.js';
import { CompraCreditoSchema } from '../../src/tarjetas/compra-credito.schema.js';
import { TransaccionSchema } from '../../src/transacciones/transaccion.schema.js';
import { agregacion } from '../ahorro/colecciones-memoria.js';
import { ColeccionEnMemoria, type Doc } from '../comun/coleccion-memoria.js';

/**
 * Colección `comprascredito` en memoria, sobre el esquema real de 5.2.1: sin índices únicos (dos compras iguales son
 * legítimas). Está en test/ (no es producción).
 */
export class ComprasEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(CompraCreditoSchema, 'CompraCredito');
  }
}

/**
 * Colección `transacciones` en memoria, sobre el esquema real, con lo que usan el CRUD de transacciones, los reportes
 * (`aggregate` con `$match`, `$group` y `$sort`) y los módulos que escriben en ella (tarjetas: avances). Está en test/.
 */
export class TransaccionesRealesEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(TransaccionSchema, 'Transaccion');
  }

  aggregate(etapas: Doc[]) {
    return agregacion(this.docs, etapas);
  }
}

/** Colección `categorias` en memoria, sobre el esquema real: generales (`usuarioId` null) y personales. Está en test/. */
export class CategoriasRealesEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(CategoriaSchema, 'Categoria');
  }
}

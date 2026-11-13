import { CompraCreditoSchema } from '../../src/tarjetas/compra-credito.schema.js';
import { ColeccionEnMemoria } from '../comun/coleccion-memoria.js';

/**
 * Colección `comprascredito` en memoria, sobre el esquema real de 5.2.1: sin índices únicos (dos compras iguales son
 * legítimas). Está en test/ (no es producción).
 */
export class ComprasEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(CompraCreditoSchema, 'CompraCredito');
  }
}

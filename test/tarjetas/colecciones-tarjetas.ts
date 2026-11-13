import { CargoRecurrenteSchema } from '../../src/tarjetas/cargo-recurrente.schema.js';
import { TarjetaCreditoSchema } from '../../src/tarjetas/tarjeta-credito.schema.js';
import { ColeccionEnMemoria, type Doc } from '../comun/coleccion-memoria.js';

/**
 * Colecciones en memoria de tarjetas y cargos fijos, sobre los esquemas reales de 5.1.1. Viven aparte del arnés
 * (`arnes-tarjetas.ts`) para poder usarse sin importar el módulo de tarjetas. Están en test/ (no es producción).
 */

/**
 * Colección `tarjetas` con su índice único `{ usuarioId, nombre }` que no distingue mayúsculas (collation `strength` 2):
 * un segundo documento con el mismo usuario y el mismo nombre falla con E11000 (código 11000), que es lo que frena a la
 * segunda de dos peticiones simultáneas.
 */
export class TarjetasEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(TarjetaCreditoSchema, 'TarjetaCredito', [
      {
        nombre: 'usuarioId_1_nombre_1',
        clave: (registro: Doc) => `${String(registro.usuarioId)}|${String(registro.nombre).toLocaleLowerCase('es')}`,
      },
    ]);
  }
}

/** Colección `cargosrecurrentes`: sin índices únicos (dos cargos iguales en una tarjeta son legítimos). */
export class CargosEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(CargoRecurrenteSchema, 'CargoRecurrente');
  }
}

import { TipoTransaccion } from '../transacciones/transaccion.enums.js';

export interface CategoriaGeneralInicial {
  nombre: string;
  tipo: TipoTransaccion;
  /** La general a la que se reasignan los movimientos de una categoría eliminada (una por tipo). */
  esRespaldo?: boolean;
}

/**
 * Categorías generales con las que arranca una base vacía, según el mockup de la interfaz. Es solo el punto de
 * partida: el administrador de la plataforma las define y pueden cambiar, por eso viven en la base y no en el código.
 */
export const CATEGORIAS_GENERALES_INICIALES: CategoriaGeneralInicial[] = [
  { nombre: 'Alimentación', tipo: TipoTransaccion.EGRESO },
  { nombre: 'Transporte', tipo: TipoTransaccion.EGRESO },
  { nombre: 'Hogar', tipo: TipoTransaccion.EGRESO },
  { nombre: 'Salud', tipo: TipoTransaccion.EGRESO },
  { nombre: 'Otros egresos', tipo: TipoTransaccion.EGRESO, esRespaldo: true },
  { nombre: 'Otros ingresos', tipo: TipoTransaccion.INGRESO, esRespaldo: true },
];

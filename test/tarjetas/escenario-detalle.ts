import { COMPRAS, CUOTA, comoEntrada } from './escenario-proyeccion.js';
import type { CompraDePrueba } from './escenario-proyeccion.js';

/**
 * Datos y valores esperados del paquete 5.3.6 (detalle por compra en la proyección de la tarjeta), tal como están en
 * `criterios/05-tarjetas.md`. Sin importar nada de Nest ni de producción: los usan la prueba de la función pura y las de
 * HTTP. Vive en test/ (no es producción). Los valores salen de los de 5.3.1 (`escenario-proyeccion.ts`).
 */

/** Las seis claves de cada elemento del `detalle`, ordenadas (CA-RF31-17). */
export const CLAVES_DE_UN_ELEMENTO = [
  'compraId',
  'cuota',
  'descripcion',
  'numeroCuota',
  'tipo',
  'totalCuotas',
];

/** Lo que nunca debe salir en un elemento del detalle. */
export const CLAVES_PROHIBIDAS_DEL_ELEMENTO = [
  'id',
  '_id',
  'usuarioId',
  '__v',
  'categoriaId',
  'fecha',
  'valor',
  'tasaEAAplicada',
  'cuotaUnicaSinInteres',
  'mesUltimoPago',
  'primerPago',
  'cuotas',
  'tarjetaId',
];

/** Las diez claves del nivel superior de la proyección (CA-RF31-18), ordenadas. */
export const CLAVES_NIVEL_SUPERIOR_CON_DETALLE = [
  'cargosFijos',
  'cuotas',
  'detalle',
  'diferencia',
  'mes',
  'pagado',
  'proyeccion',
  'saldoPendiente',
  'tarjetaId',
  'total',
];

export interface ElementoDelDetalle {
  compraId: string;
  descripcion: string;
  tipo: 'COMPRA' | 'AVANCE';
  numeroCuota: number;
  totalCuotas: number;
  cuota: number;
}

export type NombreDeCompra = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Cuota de cada compra, con 8 o más decimales. */
export const CUOTA_DE: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', number> = {
  A: CUOTA.A,
  B: CUOTA.B,
  C: CUOTA.C,
  D: CUOTA.D,
  E: CUOTA.E,
  F: CUOTA.F,
};

/** Descripción con la que siembra el arnés cada tipo de compra (`escenario-proyeccion.ts`). */
export const DESCRIPCION_SEMBRADA = {
  COMPRA: 'Compra',
  AVANCE: 'Avance en efectivo',
} as const;

/** El elemento esperado de una compra del escenario (A, B, C, D, E, F), con su id y el número de cuota del mes. */
export const elementoDe = (
  nombre: 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
  compraId: string,
  numeroCuota: number,
): ElementoDelDetalle => ({
  compraId,
  descripcion: DESCRIPCION_SEMBRADA[COMPRAS[nombre].tipo],
  tipo: COMPRAS[nombre].tipo,
  numeroCuota,
  totalCuotas: COMPRAS[nombre].cuotas,
  cuota: CUOTA_DE[nombre],
});

/**
 * El detalle del escenario base (A, B y C creadas en ese orden y con la misma fecha: la creada después va primero),
 * mes a mes, de 2026-12 a 2027-11: `[compra, número de cuota]` (CA-RF31-22).
 */
export const DETALLE_BASE: Record<string, Array<['A' | 'B' | 'C', number]>> = {
  '2026-12': [['C', 1], ['B', 1], ['A', 1]],
  '2027-01': [['B', 2], ['A', 2]],
  '2027-02': [['B', 3], ['A', 3]],
  '2027-03': [['B', 4], ['A', 4]],
  '2027-04': [['B', 5], ['A', 5]],
  '2027-05': [['B', 6], ['A', 6]],
  '2027-06': [['A', 7]],
  '2027-07': [['A', 8]],
  '2027-08': [['A', 9]],
  '2027-09': [['A', 10]],
  '2027-10': [['A', 11]],
  '2027-11': [['A', 12]],
};

/** El detalle esperado del escenario base en un mes, con los ids de las compras sembradas. */
export const detalleBaseDe = (
  mes: string,
  ids: { A: string; B: string; C: string },
): ElementoDelDetalle[] =>
  DETALLE_BASE[mes].map(([nombre, numero]) => elementoDe(nombre, ids[nombre], numero));

/** El elemento sin la cuota: para comparar con `toEqual` lo que no es monto (la cuota se compara con `toBeCloseTo`). */
export const sinCuota = ({ cuota: _cuota, ...resto }: ElementoDelDetalle) => resto;

/**
 * Compara el detalle recibido con el esperado: mismos elementos en el mismo orden, con la cuota a 6 decimales
 * (`decimales`, o 2 para el valor de la hoja del promotor).
 */
export const afirmarDetalle = (
  actual: unknown,
  esperado: ElementoDelDetalle[],
  decimales = 6,
) => {
  expect(Array.isArray(actual)).toBe(true);
  const lista = actual as ElementoDelDetalle[];
  expect(lista.map(sinCuota)).toEqual(esperado.map(sinCuota));
  lista.forEach((elemento, indice) => {
    expect(typeof elemento.cuota).toBe('number');
    expect(Number.isFinite(elemento.cuota)).toBe(true);
    expect(elemento.cuota).toBeCloseTo(esperado[indice].cuota, decimales);
  });
};

/** La misma comparación sin importar el orden (se ordena por `compraId`). */
export const afirmarDetalleSinOrden = (
  actual: unknown,
  esperado: ElementoDelDetalle[],
  decimales = 6,
) => {
  const porId = (a: ElementoDelDetalle, b: ElementoDelDetalle) =>
    a.compraId.localeCompare(b.compraId);
  expect(Array.isArray(actual)).toBe(true);
  afirmarDetalle(
    [...(actual as ElementoDelDetalle[])].sort(porId),
    [...esperado].sort(porId),
    decimales,
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Entradas de la función pura
// ---------------------------------------------------------------------------------------------------------------------

/** Ids de las compras A a G en las pruebas de la función pura. */
export const IDS_FUNCION: Record<NombreDeCompra, string> = {
  A: '665f1c2a9b1e4a0012a3b4a1',
  B: '665f1c2a9b1e4a0012a3b4b2',
  C: '665f1c2a9b1e4a0012a3b4c3',
  D: '665f1c2a9b1e4a0012a3b4d4',
  E: '665f1c2a9b1e4a0012a3b4e5',
  F: '665f1c2a9b1e4a0012a3b4f6',
  G: '665f1c2a9b1e4a0012a3b4a7',
};

/**
 * Una compra como la recibe `calcularDetalleCuotas`: lo de `comoEntrada` (tipo, fecha, valor, cuotas, tasa, bandera y
 * primer pago) más `id`, `descripcion` y `createdAt` (el segundo `segundo` de la hora de siembra: crece con el orden de creación).
 */
export const entradaDeDetalle = (
  datos: CompraDePrueba,
  id: string,
  segundo: number,
  descripcion?: string,
) => ({
  ...comoEntrada(datos),
  id,
  descripcion: descripcion ?? DESCRIPCION_SEMBRADA[datos.tipo],
  createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, segundo)),
});

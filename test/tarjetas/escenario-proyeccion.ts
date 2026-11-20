import type { EntornoCompras } from './arnes-compras.js';

/**
 * Datos y valores de referencia del paquete 5.3.1 (total del mes y proyección por tarjeta), tal como están en
 * `criterios/05-tarjetas.md` («Datos de las pruebas»). Sin importar nada de Nest ni de producción: lo usan tanto la prueba
 * de la función pura como las de HTTP. Vive en test/ (no es producción).
 *
 * Los valores esperados se calcularon aparte del código del repo (aritmética decimal de 50 dígitos y una búsqueda binaria
 * de la cuota); aquí van con 8 decimales o más para que `toBeCloseTo(x, 6)` no quede al borde del redondeo.
 */

export interface CompraDePrueba {
  tipo: 'COMPRA' | 'AVANCE';
  valor: number;
  cuotas: number;
  /** Mes del primer pago, `YYYY-MM`. */
  primerPago: string;
  tasaEAAplicada: number;
  cuotaUnicaSinInteres: boolean;
  /** Día de la compra, `YYYY-MM-DD`. */
  fecha: string;
}

const compra = (
  valor: number,
  cuotas: number,
  primerPago: string,
  extra: Partial<CompraDePrueba> = {},
): CompraDePrueba => ({
  tipo: 'COMPRA',
  valor,
  cuotas,
  primerPago,
  tasaEAAplicada: 0.2921,
  cuotaUnicaSinInteres: false,
  fecha: '2026-11-10',
  ...extra,
});

/** Las compras A a G de «Datos de las pruebas». */
export const COMPRAS = {
  /** $1.254.700 a 12 cuotas, 2026-12 a 2027-11: el caso de la hoja del promotor. */
  A: compra(1254700, 12, '2026-12'),
  /** Avance de $500.000 a 6 cuotas, 2026-12 a 2027-05. */
  B: compra(500000, 6, '2026-12', { tipo: 'AVANCE' }),
  /** $80.000 a 1 cuota, solo 2026-12. */
  C: compra(80000, 1, '2026-12'),
  /** $240.000 a 3 cuotas, 2027-02 a 2027-04: futura respecto de 2026-12. */
  D: compra(240000, 3, '2027-02'),
  /** $100.000 a 2 cuotas, 2026-09 y 2026-10: terminada en 2026-12. */
  E: compra(100000, 2, '2026-09', { fecha: '2026-08-20' }),
  /** Como A pero con tasa 0,31. */
  F: compra(1254700, 12, '2026-12', { tasaEAAplicada: 0.31 }),
  /** $120.000 a 12 cuotas con tasa 0. */
  G: compra(120000, 12, '2026-12', { tasaEAAplicada: 0 }),
};

/** Cuotas de cada compra, con 8 o más decimales. */
export const CUOTA = {
  A: 119802.1331718775,
  B: 89741.08506207,
  C: 81726.83193074,
  D: 83478.2471679,
  E: 51624.66686647,
  F: 120662.17031426,
  /** $80.000 a 2 cuotas con 0,2921. */
  OCHENTA_A_2: 41299.73349318,
  /** $500.000 a 3 cuotas con 0,2921. */
  B_A_3: 173913.01493311,
};

export interface CargoDePrueba {
  descripcion: string;
  valor: number;
  activo: boolean;
}

/** Los cargos fijos de «Visa»: los activos suman $55.000. */
export const CARGOS = {
  netflix: { descripcion: 'Netflix', valor: 40000, activo: true },
  seguro: { descripcion: 'Seguro', valor: 15000, activo: true },
  gimnasio: { descripcion: 'Gimnasio', valor: 60000, activo: false },
};
export const CARGOS_ACTIVOS = 55000;

export interface FilaDeMes {
  mes: string;
  cuotas: number;
  total: number;
  saldoPendiente: number;
}

/** Escenario base (A, B y C con los tres cargos), mes a mes: de 2026-12 (referencia) a 2027-11. */
export const TABLA_BASE: FilaDeMes[] = [
  {
    mes: '2026-12',
    cuotas: 291270.05016469,
    total: 346270.05016469,
    saldoPendiente: 1766528.890201,
  },
  {
    mes: '2027-01',
    cuotas: 209543.21823395,
    total: 264543.21823395,
    saldoPendiente: 1556985.67196706,
  },
  {
    mes: '2027-02',
    cuotas: 209543.21823395,
    total: 264543.21823395,
    saldoPendiente: 1347442.45373311,
  },
  {
    mes: '2027-03',
    cuotas: 209543.21823395,
    total: 264543.21823395,
    saldoPendiente: 1137899.23549916,
  },
  {
    mes: '2027-04',
    cuotas: 209543.21823395,
    total: 264543.21823395,
    saldoPendiente: 928356.01726521,
  },
  {
    mes: '2027-05',
    cuotas: 209543.21823395,
    total: 264543.21823395,
    saldoPendiente: 718812.79903126,
  },
  {
    mes: '2027-06',
    cuotas: 119802.13317188,
    total: 174802.13317188,
    saldoPendiente: 599010.66585939,
  },
  {
    mes: '2027-07',
    cuotas: 119802.13317188,
    total: 174802.13317188,
    saldoPendiente: 479208.53268751,
  },
  {
    mes: '2027-08',
    cuotas: 119802.13317188,
    total: 174802.13317188,
    saldoPendiente: 359406.39951563,
  },
  {
    mes: '2027-09',
    cuotas: 119802.13317188,
    total: 174802.13317188,
    saldoPendiente: 239604.26634375,
  },
  {
    mes: '2027-10',
    cuotas: 119802.13317188,
    total: 174802.13317188,
    saldoPendiente: 119802.13317188,
  },
  { mes: '2027-11', cuotas: 119802.13317188, total: 174802.13317188, saldoPendiente: 0 },
];

/** Suma de todas las cuotas del escenario base (12·A + 6·B + 1·C). */
export const SUMA_CUOTAS_BASE = 2057798.94036569;

/** Los meses `YYYY-MM` de `desde` a `hasta`, ambos incluidos. */
export const mesesDe = (desde: string, hasta: string): string[] => {
  const [anioDesde, mesDesde] = desde.split('-').map(Number);
  const [anioHasta, mesHasta] = hasta.split('-').map(Number);
  const lista: string[] = [];
  for (
    let indice = anioDesde * 12 + mesDesde - 1;
    indice <= anioHasta * 12 + mesHasta - 1;
    indice++
  ) {
    const anio = Math.floor(indice / 12);
    lista.push(`${anio}-${String((indice % 12) + 1).padStart(2, '0')}`);
  }
  return lista;
};

// ---------------------------------------------------------------------------------------------------------------------
// Entradas de la función pura
// ---------------------------------------------------------------------------------------------------------------------

/** Una compra como la recibe `calcularProyeccion` (con sus propiedades de más, que la función debe ignorar). */
export const comoEntrada = (datos: CompraDePrueba) => ({
  tipo: datos.tipo,
  fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
  valor: datos.valor,
  cuotas: datos.cuotas,
  tasaEAAplicada: datos.tasaEAAplicada,
  cuotaUnicaSinInteres: datos.cuotaUnicaSinInteres,
  primerPago: new Date(`${datos.primerPago}-01T00:00:00.000Z`),
});

// ---------------------------------------------------------------------------------------------------------------------
// Siembra en las colecciones en memoria del arnés
// ---------------------------------------------------------------------------------------------------------------------

/** Inserta la compra directo en la base (como la guardaría el POST) y devuelve su id. */
export const sembrarCompraDe = (
  e: EntornoCompras,
  tarjetaId: string,
  datos: CompraDePrueba,
  usuarioId?: string,
): Promise<string> =>
  e.sembrarCompra(
    tarjetaId,
    {
      tipo: datos.tipo,
      descripcion: datos.tipo === 'AVANCE' ? 'Avance en efectivo' : 'Compra',
      categoriaId: datos.tipo === 'AVANCE' ? e.otrosEgresos._id : e.hogar._id,
      valor: datos.valor,
      cuotas: datos.cuotas,
      tasaEAAplicada: datos.tasaEAAplicada,
      cuotaUnicaSinInteres: datos.cuotaUnicaSinInteres,
      fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
      primerPago: new Date(`${datos.primerPago}-01T00:00:00.000Z`),
    },
    usuarioId,
  );

/** Inserta el cargo fijo directo en la base y devuelve su id. */
export const sembrarCargoDe = (
  e: EntornoCompras,
  tarjetaId: string,
  datos: CargoDePrueba,
  usuarioId?: string,
): Promise<string> => e.sembrarCargo(tarjetaId, usuarioId, { ...datos });

/** «Visa» (0,2921) con A, B y C y los tres cargos (Netflix y Seguro activos, Gimnasio inactivo). */
export const sembrarEscenarioBase = async (
  e: EntornoCompras,
  usuarioId?: string,
) => {
  const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 }, usuarioId);
  const compras = {
    A: await sembrarCompraDe(e, visa, COMPRAS.A, usuarioId),
    B: await sembrarCompraDe(e, visa, COMPRAS.B, usuarioId),
    C: await sembrarCompraDe(e, visa, COMPRAS.C, usuarioId),
  };
  const cargos = {
    netflix: await sembrarCargoDe(e, visa, CARGOS.netflix, usuarioId),
    seguro: await sembrarCargoDe(e, visa, CARGOS.seguro, usuarioId),
    gimnasio: await sembrarCargoDe(e, visa, CARGOS.gimnasio, usuarioId),
  };
  return { visa, compras, cargos };
};

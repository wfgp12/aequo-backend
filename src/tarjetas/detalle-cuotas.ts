import type { TipoCompra } from './compra-credito.enums.js';
import { calcularCuota, calcularMesUltimoPago, type DatosCuota } from './cuota-credito.js';
import { indiceDeFecha, indiceDeMes } from './proyeccion-tarjeta.js';

/** Una compra o avance con lo que necesita el detalle: sus datos de cuota, su identidad y el orden en que se registró. */
export interface CompraDetallable extends DatosCuota {
  id: string;
  descripcion: string;
  tipo: TipoCompra;
  fecha: Date;
  createdAt: Date;
  /** Mes del primer pago (día 1 UTC). */
  primerPago: Date;
}

/** La cuota que una compra o avance aporta al mes consultado. La cuota va sin redondear (RNF-11). */
export interface DetalleCuota {
  compraId: string;
  descripcion: string;
  tipo: TipoCompra;
  /** Cuota que corresponde al mes consultado, desde 1. */
  numeroCuota: number;
  totalCuotas: number;
  cuota: number;
}

/** Más reciente primero: fecha de la compra, luego creación y, si empatan, el id mayor (como texto). */
const masRecientePrimero = (a: CompraDetallable, b: CompraDetallable) =>
  b.fecha.getTime() - a.fecha.getTime() ||
  b.createdAt.getTime() - a.createdAt.getTime() ||
  (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Qué compras y avances componen las cuotas de un mes y cuánto aporta cada una (RF-31). Función pura: una compra es
 * vigente si `primerPago ≤ mes ≤ mesUltimoPago` (se comparan meses, no días) y no se modifica lo recibido. Los cargos
 * fijos no entran: no son compras. La suma de las cuotas es la de `calcularProyeccion` para el mismo mes.
 */
export function calcularDetalleCuotas({ mes, compras }: { mes: string; compras: CompraDetallable[] }): DetalleCuota[] {
  const referencia = indiceDeMes(mes);
  return compras
    .map((compra) => ({
      compra,
      cuota: calcularCuota(compra),
      desde: indiceDeFecha(compra.primerPago),
      hasta: indiceDeFecha(calcularMesUltimoPago(compra.primerPago, compra.cuotas)),
    }))
    .filter(({ desde, hasta }) => desde <= referencia && referencia <= hasta)
    .sort((a, b) => masRecientePrimero(a.compra, b.compra))
    .map(({ compra, cuota, desde }) => ({
      compraId: compra.id,
      descripcion: compra.descripcion,
      tipo: compra.tipo,
      numeroCuota: referencia - desde + 1,
      totalCuotas: compra.cuotas,
      cuota,
    }));
}

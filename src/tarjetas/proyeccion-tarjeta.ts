import { calcularCuota, calcularMesUltimoPago, type DatosCuota } from './cuota-credito.js';

/** Una compra o avance de la tarjeta: lo que intervienen en la cuota y el mes del primer pago (día 1 UTC). */
export interface CompraProyectable extends DatosCuota {
  primerPago: Date;
}

/** Un cargo fijo de la tarjeta; solo cuentan los activos. */
export interface CargoProyectable {
  valor: number;
  activo: boolean;
}

/** Las cifras de un mes. Todos los montos van sin redondear (RNF-11). */
export interface MesProyectado {
  /** `YYYY-MM`. */
  mes: string;
  /** Suma de las cuotas vigentes de compras y avances. */
  cuotas: number;
  /** Suma de los cargos fijos activos. */
  cargosFijos: number;
  /** `cuotas` + `cargosFijos`. */
  total: number;
  /** Suma de las cuotas de los meses posteriores (con intereses; sin cargos fijos ni pagos). */
  saldoPendiente: number;
}

export interface ProyeccionTarjeta extends MesProyectado {
  /** Los meses siguientes al de referencia, contiguos, hasta el último pago más lejano (`[]` si no hay más cuotas). */
  proyeccion: MesProyectado[];
}

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Posición absoluta del mes (años · 12 + mes), para recorrer meses sin pasar por fechas. */
const indiceDeFecha = (fecha: Date) => fecha.getUTCFullYear() * 12 + fecha.getUTCMonth();

const textoDeMes = (indice: number) =>
  `${String(Math.floor(indice / 12)).padStart(4, '0')}-${String((indice % 12) + 1).padStart(2, '0')}`;

function indiceDeMes(mes: unknown): number {
  const partes = typeof mes === 'string' ? MES.exec(mes) : null;
  if (!partes) throw new RangeError('mes debe tener el formato YYYY-MM con un mes de 01 a 12.');
  return Number(partes[1]) * 12 + Number(partes[2]) - 1;
}

/**
 * Total del mes, saldo pendiente y proyección de una tarjeta (RF-30, RF-31). Función pura: recibe las compras y los
 * cargos de **una** tarjeta. Cada compra aporta su cuota (con su tasa y su bandera) del mes de su primer pago al de su
 * último, ambos incluidos. Los cargos activos se repiten en cada mes sin alargar la proyección. El saldo pendiente de
 * un mes es la suma de las cuotas de los meses posteriores: incluye las compras que aún no empiezan y no descuenta pagos.
 */
export function calcularProyeccion({
  mes,
  compras,
  cargos,
}: {
  mes: string;
  compras: CompraProyectable[];
  cargos: CargoProyectable[];
}): ProyeccionTarjeta {
  const referencia = indiceDeMes(mes);
  const vigentes = compras.map((compra) => ({
    cuota: calcularCuota(compra),
    desde: indiceDeFecha(compra.primerPago),
    hasta: indiceDeFecha(calcularMesUltimoPago(compra.primerPago, compra.cuotas)),
  }));
  const cargosFijos = cargos.reduce((suma, cargo) => (cargo.activo ? suma + cargo.valor : suma), 0);
  const ultimo = Math.max(referencia, ...vigentes.map(({ hasta }) => hasta));

  const cuotasPorMes = Array.from({ length: ultimo - referencia + 1 }, (_, posicion) => {
    const indice = referencia + posicion;
    return vigentes.reduce((suma, v) => (v.desde <= indice && indice <= v.hasta ? suma + v.cuota : suma), 0);
  });

  // De atrás hacia adelante: el saldo de un mes es el del siguiente más la cuota del siguiente.
  let saldoPendiente = 0;
  const filas: MesProyectado[] = [];
  for (let posicion = cuotasPorMes.length - 1; posicion >= 0; posicion--) {
    const cuotas = cuotasPorMes[posicion];
    filas.unshift({
      mes: textoDeMes(referencia + posicion),
      cuotas,
      cargosFijos,
      total: cuotas + cargosFijos,
      saldoPendiente,
    });
    saldoPendiente += cuotas;
  }
  return { ...filas[0], proyeccion: filas.slice(1) };
}

import { TipoInteres } from './deuda.enums.js';

/** Un préstamo recibido o un abono. El día que cuenta es el de `fecha` en UTC. */
export interface MovimientoDeDeuda {
  monto: number;
  fecha: Date;
}

export interface DeudaPorCalcular {
  tipoInteres: `${TipoInteres}`;
  /** En `TASA`, la tasa mensual simple como fracción; en `MONTO_FIJO`, el interés total en pesos. */
  valorInteres: number;
  prestamos: MovimientoDeDeuda[];
  abonos: MovimientoDeDeuda[];
}

/** Cifras de una deuda, sin redondear (RNF-11). `saldo` negativo es dinero abonado de más. */
export interface SaldoDeuda {
  prestado: number;
  intereses: number;
  abonado: number;
  saldo: number;
}

/** Estado de una deuda con tasa mientras se recorre su historia día por día. */
interface Cuenta {
  /** Capital pendiente de cada préstamo recibido, del más antiguo al más reciente. */
  tramos: { capital: number }[];
  interesPorPagar: number;
  /** Abonado de más: reduce los préstamos que lleguen después. */
  aFavor: number;
  /** Todo el interés generado, esté pagado o no. */
  intereses: number;
}

/** Orden dentro de un mismo día: el interés del mes que se cumple se suma antes de aplicar el abono. */
enum Turno {
  PRESTAMO,
  INTERES,
  ABONO,
}

interface Suceso {
  /** `YYYY-MM-DD`. */
  dia: string;
  turno: Turno;
  aplicar: () => void;
}

const diaDe = (fecha: Date) => fecha.toISOString().slice(0, 10);

const sumar = (movimientos: MovimientoDeDeuda[]) => movimientos.reduce((total, { monto }) => total + monto, 0);

/**
 * Día en que se cumplen `meses` desde `fecha`: el mismo día del mes o, si ese mes no lo tiene, su último día.
 * Se cuenta siempre desde `fecha`, así un mes corto no corre el día de los siguientes.
 */
function diaEnQueCumple(fecha: Date, meses: number): string {
  const cumple = new Date(fecha);
  // El día 0 del mes siguiente es el último del mes buscado.
  cumple.setUTCMonth(fecha.getUTCMonth() + meses + 1, 0);
  cumple.setUTCDate(Math.min(fecha.getUTCDate(), cumple.getUTCDate()));
  return diaDe(cumple);
}

/** Paga primero los intereses, luego el capital más antiguo; lo que sobre queda a favor. */
function abonar(cuenta: Cuenta, monto: number): void {
  const aIntereses = Math.min(monto, cuenta.interesPorPagar);
  cuenta.interesPorPagar -= aIntereses;
  let sobrante = monto - aIntereses;
  for (const tramo of cuenta.tramos) {
    const aCapital = Math.min(sobrante, tramo.capital);
    tramo.capital -= aCapital;
    sobrante -= aCapital;
  }
  cuenta.aFavor += sobrante;
}

/** El préstamo llega (descontando lo que haya a favor) y genera interés cada mes que cumple hasta `hoy`. */
function sucesosDelPrestamo(cuenta: Cuenta, prestamo: MovimientoDeDeuda, tasa: number, hoy: string): Suceso[] {
  const tramo = { capital: 0 };
  const recibir = () => {
    const cubierto = Math.min(cuenta.aFavor, prestamo.monto);
    cuenta.aFavor -= cubierto;
    tramo.capital = prestamo.monto - cubierto;
    cuenta.tramos.push(tramo);
  };
  const cobrarMes = () => {
    const interes = tramo.capital * tasa;
    cuenta.interesPorPagar += interes;
    cuenta.intereses += interes;
  };

  const sucesos: Suceso[] = [{ dia: diaDe(prestamo.fecha), turno: Turno.PRESTAMO, aplicar: recibir }];
  for (let meses = 1; diaEnQueCumple(prestamo.fecha, meses) <= hoy; meses++) {
    sucesos.push({ dia: diaEnQueCumple(prestamo.fecha, meses), turno: Turno.INTERES, aplicar: cobrarMes });
  }
  return sucesos;
}

/**
 * Tasa mensual simple por meses cumplidos sobre el capital pendiente. Se recorren en orden de fecha los préstamos,
 * los meses cumplidos y los abonos; los de fecha futura también cuentan, pero no hay interés después de `hoy`.
 */
function interesesPorTasa({ valorInteres, prestamos, abonos }: DeudaPorCalcular, hoy: string): number {
  const cuenta: Cuenta = { tramos: [], interesPorPagar: 0, aFavor: 0, intereses: 0 };
  const sucesos = [
    ...prestamos.flatMap((prestamo) => sucesosDelPrestamo(cuenta, prestamo, valorInteres, hoy)),
    ...abonos.map(({ monto, fecha }) => ({
      dia: diaDe(fecha),
      turno: Turno.ABONO,
      aplicar: () => abonar(cuenta, monto),
    })),
  ];
  sucesos.sort((a, b) => a.dia.localeCompare(b.dia) || a.turno - b.turno);
  for (const suceso of sucesos) suceso.aplicar();
  return cuenta.intereses;
}

function calcularIntereses(deuda: DeudaPorCalcular, hoy: string): number {
  if (deuda.tipoInteres === TipoInteres.TASA) return interesesPorTasa(deuda, hoy);
  // El monto fijo se debe completo desde que existe la deuda.
  return deuda.tipoInteres === TipoInteres.MONTO_FIJO ? deuda.valorInteres : 0;
}

/**
 * Prestado, intereses, abonado y saldo de una deuda al día `hoy` (`YYYY-MM-DD`) (RF-36, RF-38). Función pura que sale
 * solo de los movimientos: no mira `saldada` y el orden en que llegan no importa.
 */
export function calcularSaldoDeuda(deuda: DeudaPorCalcular, hoy: string): SaldoDeuda {
  const prestado = sumar(deuda.prestamos);
  const abonado = sumar(deuda.abonos);
  const intereses = calcularIntereses(deuda, hoy);
  return { prestado, intereses, abonado, saldo: prestado + intereses - abonado };
}

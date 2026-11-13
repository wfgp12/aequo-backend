/** Datos de una compra que intervienen en la cuota (los nombres son los de `CompraCredito`). */
export interface DatosCuota {
  valor: number;
  cuotas: number;
  tasaEAAplicada: number;
  cuotaUnicaSinInteres: boolean;
}

const MAX_CUOTAS = 60;

function validarTasa(campo: string, tasa: unknown): void {
  if (typeof tasa !== 'number' || !(tasa >= 0 && tasa <= 1)) {
    throw new RangeError(`${campo} debe ser un número entre 0 y 1 (0,2921 equivale a 29,21 %).`);
  }
}

function validarCuotas(cuotas: unknown): void {
  if (typeof cuotas !== 'number' || !Number.isInteger(cuotas) || cuotas < 1 || cuotas > MAX_CUOTAS) {
    throw new RangeError(`cuotas debe ser un entero entre 1 y ${MAX_CUOTAS}.`);
  }
}

function validarCompra(compra: DatosCuota): void {
  const { valor, cuotas, tasaEAAplicada, cuotaUnicaSinInteres } = compra;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new RangeError('valor debe ser un número finito mayor que 0.');
  }
  validarCuotas(cuotas);
  validarTasa('tasaEAAplicada', tasaEAAplicada);
  if (typeof cuotaUnicaSinInteres !== 'boolean') {
    throw new RangeError('cuotaUnicaSinInteres debe ser verdadero o falso.');
  }
}

/** Tasa mensual equivalente a una tasa efectiva anual: `(1 + EA)^(1/12) − 1` (ADR-014). */
export function calcularTasaMensual(tasaEA: number): number {
  validarTasa('tasaEA', tasaEA);
  // expm1/log1p evitan perder precisión con tasas diminutas
  return Math.expm1(Math.log1p(tasaEA) / 12);
}

/**
 * Cuota mensual fija `V·i / (1 − (1 + i)^(−n))`, sin redondear (RNF-11). Es `V / n` si la tasa
 * es 0 o si es una sola cuota en una tarjeta con `cuotaUnicaSinInteres`.
 */
export function calcularCuota(compra: DatosCuota): number {
  validarCompra(compra);
  const { valor, cuotas, tasaEAAplicada, cuotaUnicaSinInteres } = compra;
  const sinInteres = cuotas === 1 && cuotaUnicaSinInteres;
  const i = calcularTasaMensual(tasaEAAplicada);
  if (i === 0 || sinInteres) return valor / cuotas;
  // (1 + i)^(−n) = exp(−n·log1p(i)), y log1p(i) = log1p(EA) / 12
  const denominador = -Math.expm1((-cuotas * Math.log1p(tasaEAAplicada)) / 12);
  return (valor * i) / denominador;
}

/** Día 1 a las 00:00 UTC del mes de la última cuota: el mes de `primerPago` más `cuotas − 1` meses. */
export function calcularMesUltimoPago(primerPago: Date, cuotas: number): Date {
  if (!(primerPago instanceof Date) || Number.isNaN(primerPago.getTime())) {
    throw new RangeError('primerPago debe ser una fecha válida.');
  }
  validarCuotas(cuotas);
  return new Date(Date.UTC(primerPago.getUTCFullYear(), primerPago.getUTCMonth() + cuotas - 1, 1));
}

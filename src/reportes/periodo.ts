import { BadRequestException } from '@nestjs/common';
import type { PeriodoQueryDto } from './dto/periodo-query.dto.js';

export interface Periodo {
  desde: string;
  hasta: string;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Primer y último día del mes; el día 0 del mes siguiente es el último de este (cubre febrero y bisiestos). */
function delMes(anio: number, mes: number): Periodo {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${dos(mes)}-01`, hasta: `${anio}-${dos(mes)}-${dos(ultimo)}` };
}

/**
 * El periodo que pide la consulta: un mes (`mes`), un rango (`desde` + `hasta`) o, sin parámetros, el mes de `hoy`.
 * "Hoy" se toma en UTC, como el servidor guarda las fechas.
 */
export function resolverPeriodo({ mes, desde, hasta }: PeriodoQueryDto, hoy: Date): Periodo {
  if (mes && (desde || hasta)) {
    throw new BadRequestException(['mes no se puede combinar con desde ni hasta: elige un mes o un rango']);
  }
  if (Boolean(desde) !== Boolean(hasta)) {
    throw new BadRequestException(['desde y hasta deben enviarse juntos']);
  }
  if (desde && hasta) {
    if (desde > hasta) throw new BadRequestException(['desde no puede ser posterior a hasta']);
    return { desde, hasta };
  }
  if (mes) {
    const [anio, numero] = mes.split('-').map(Number);
    return delMes(anio, numero);
  }
  return delMes(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1);
}

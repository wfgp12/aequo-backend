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

/** Año y mes calendario de `instante` en la zona horaria IANA dada (sigue el horario de verano). */
function mesEnZona(instante: Date, zona: string): { anio: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: 'numeric' }).formatToParts(
    instante,
  );
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return { anio: valor('year'), mes: valor('month') };
}

/**
 * El periodo que pide la consulta: un mes (`mes`), un rango (`desde` + `hasta`) o, sin parámetros, el mes de `hoy`
 * visto desde `zona` (UTC si no se indica); la zona solo influye en este último caso.
 */
export function resolverPeriodo({ mes, desde, hasta }: PeriodoQueryDto, hoy: Date, zona = 'UTC'): Periodo {
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
  const actual = mesEnZona(hoy, zona);
  return delMes(actual.anio, actual.mes);
}

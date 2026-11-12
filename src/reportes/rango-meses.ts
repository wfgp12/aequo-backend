import { BadRequestException } from '@nestjs/common';

/** Tope de meses de un rango: la evolución rellena un punto por mes, así que el rango no puede crecer sin límite. */
export const MAX_MESES = 120;

/** Posición absoluta del mes `YYYY-MM` (años * 12 + mes), para contar y recorrer meses sin pasar por fechas. */
const indiceDe = (mes: string) => {
  const [anio, numero] = mes.split('-').map(Number);
  return anio * 12 + numero - 1;
};

const mesDe = (indice: number) => `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;

/** Cantidad de meses del rango, ambos extremos incluidos. */
export const contarMeses = (desde: string, hasta: string) => indiceDe(hasta) - indiceDe(desde) + 1;

/** Cada mes `YYYY-MM` del rango, ambos extremos incluidos y en orden. */
export const mesesEntre = (desde: string, hasta: string): string[] =>
  Array.from({ length: contarMeses(desde, hasta) }, (_, i) => mesDe(indiceDe(desde) + i));

/** Rechaza un rango invertido o de más de `MAX_MESES` meses. Los meses `YYYY-MM` se comparan como texto. */
export function validarRangoDeMeses(desde: string, hasta: string): void {
  if (desde > hasta) throw new BadRequestException(['desde no puede ser posterior a hasta']);
  if (contarMeses(desde, hasta) > MAX_MESES) {
    throw new BadRequestException([`el rango no puede abarcar más de ${MAX_MESES} meses; envía desde para acotarlo`]);
  }
}

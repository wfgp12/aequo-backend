import { ApiProperty } from '@nestjs/swagger';
import { ValidateBy } from 'class-validator';
import { MesOFechaCalendario } from '../../common/validadores.js';
import { CUOTAS_MAXIMAS } from './crear-compra.dto.js';

/**
 * Una query siempre llega como texto (y un parámetro repetido, como arreglo): se acepta solo texto con la forma
 * `patron` cuyo valor numérico cumple `enRango`. Rechaza `1e3`, `0x10`, comas, signos, espacios y desbordes.
 */
const TextoNumerico = (patron: RegExp, enRango: (numero: number) => boolean, message: string) =>
  ValidateBy({
    name: 'textoNumerico',
    validator: {
      validate: (valor: unknown) => typeof valor === 'string' && patron.test(valor) && enRango(Number(valor)),
      defaultMessage: () => message,
    },
  });

/** Query de `GET /tarjetas/:tarjetaId/cuota`. Los números se convierten en el servicio, ya validados. */
export class VistaPreviaCuotaQueryDto {
  @ApiProperty({
    type: String,
    example: '1254700',
    pattern: '^\\d+(\\.\\d+)?$',
    description:
      'Valor total de la compra o del avance en pesos colombianos: número decimal con punto, mayor que cero y finito (`1254700`, `100.5`, `0.01`). No se aceptan comas, signos, espacios ni notación científica.',
  })
  @TextoNumerico(
    /^\d+(\.\d+)?$/,
    (numero) => Number.isFinite(numero) && numero > 0,
    'valor debe ser un número decimal con punto, mayor que cero (por ejemplo 1254700 o 100.5)',
  )
  valor: string;

  @ApiProperty({
    type: String,
    example: '12',
    pattern: '^\\d+$',
    description: `Número de cuotas: un entero de 1 a ${CUOTAS_MAXIMAS}, sin decimales ni signo.`,
  })
  @TextoNumerico(
    /^\d+$/,
    (numero) => numero >= 1 && numero <= CUOTAS_MAXIMAS,
    `cuotas debe ser un número entero de 1 a ${CUOTAS_MAXIMAS}`,
  )
  cuotas: string;

  @ApiProperty({
    type: String,
    example: '2026-12',
    description:
      'Mes del primer pago: YYYY-MM, o una fecha real YYYY-MM-DD sin hora (se toma solo el mes). Sin restricción respecto de la fecha actual. Con él se calcula el mes del último pago.',
  })
  @MesOFechaCalendario('primerPago')
  primerPago: string;
}

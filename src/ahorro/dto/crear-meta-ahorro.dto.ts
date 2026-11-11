import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive, ValidateIf } from 'class-validator';
import { MesOFechaCalendario } from '../../common/validadores.js';
import { TipoMeta } from '../meta-ahorro.enums.js';

export const PORCENTAJE_MAXIMO = 100;

export class CrearMetaAhorroDto {
  @ApiProperty({
    enum: Object.values(TipoMeta),
    example: 'PORCENTAJE',
    description:
      'Cómo se expresa la meta: PORCENTAJE (del ingreso propio del mes) o MONTO_FIJO (una cantidad en pesos).',
  })
  @IsEnum(TipoMeta, { message: 'tipoMeta debe ser PORCENTAJE o MONTO_FIJO' })
  tipoMeta: TipoMeta;

  @ApiProperty({
    type: Number,
    example: 20,
    description: `Valor de la meta, mayor que cero. Con PORCENTAJE va de 0 (sin incluir) a ${PORCENTAJE_MAXIMO} (20 significa 20 %); con MONTO_FIJO son pesos colombianos y no tiene tope. No se redondea.`,
  })
  @IsNumber({}, { message: 'valorObjetivo debe ser un número' })
  @IsPositive({ message: 'valorObjetivo debe ser mayor que cero' })
  valorObjetivo: number;

  @ApiProperty({
    type: String,
    example: '2026-11',
    description:
      'Mes de la meta: YYYY-MM, o una fecha real YYYY-MM-DD sin hora (se toma solo el mes). Solo puede haber una meta por usuario y mes.',
  })
  @MesOFechaCalendario('periodo')
  periodo: string;

  @ApiPropertyOptional({
    type: Number,
    example: 150000,
    description:
      'Ahorro efectivo del mes en pesos. Opcional: vale 0 si no se envía. Puede ser negativo (se gastó más de lo ingresado).',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsNumber({}, { message: 'ahorroReal debe ser un número' })
  ahorroReal?: number;
}

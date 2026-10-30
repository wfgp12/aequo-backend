import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { FechaCalendario } from '../../common/validadores.js';

export class PeriodoQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-10',
    description:
      'Mes completo a consultar, `YYYY-MM` (RF-14). No se combina con `desde` ni `hasta`: se elige un mes o un rango. Si no se envía ningún parámetro, se usa el mes actual (RF-13).',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'mes debe tener el formato YYYY-MM con un mes del 01 al 12' })
  mes?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-10-10',
    description:
      'Primer día del rango, `YYYY-MM-DD`, incluido. Va siempre junto con `hasta` y no puede ser posterior a él. No se combina con `mes`.',
  })
  @IsOptional()
  @FechaCalendario('desde')
  desde?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-10-20',
    description:
      'Último día del rango, `YYYY-MM-DD`, incluido. Va siempre junto con `desde`. No se combina con `mes`.',
  })
  @IsOptional()
  @FechaCalendario('hasta')
  hasta?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

export class EvolucionQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-07',
    description:
      'Primer mes de la serie, `YYYY-MM`, incluido. Sin él, la serie empieza en el primer mes con movimientos del usuario. No puede ser posterior a `hasta`.',
  })
  @IsOptional()
  @MesCalendario('desde')
  desde?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-10',
    description:
      'Último mes de la serie, `YYYY-MM`, incluido. Sin él, la serie termina en el último mes con movimientos del usuario.',
  })
  @IsOptional()
  @MesCalendario('hasta')
  hasta?: string;
}

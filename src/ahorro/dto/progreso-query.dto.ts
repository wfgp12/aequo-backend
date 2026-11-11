import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

export class ProgresoQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-11',
    description:
      'Mes a consultar, `YYYY-MM`. Sin él se usa el mes actual según el header `X-Zona-Horaria` (UTC si no se envía). No acepta rangos `desde`/`hasta`.',
  })
  @IsOptional()
  @MesCalendario('mes')
  mes?: string;
}

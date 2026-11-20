import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

/** Query de `GET /tarjetas/:tarjetaId/proyeccion`. */
export class ProyeccionQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-12',
    description:
      'Mes de referencia, `YYYY-MM` (pasado, actual o futuro, sin tope). Sin él se usa el mes actual según el header `X-Zona-Horaria` (UTC si no se envía). No se acepta repetido ni con otro formato (`2026-1`, `202612`, `2026-12-01`).',
  })
  @IsOptional()
  @MesCalendario('mes')
  mes?: string;
}

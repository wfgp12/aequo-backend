import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

export class AcumuladoQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-09',
    description:
      'Último mes que entra en el acumulado, `YYYY-MM`, incluido. Sin él se acumulan todas las metas del usuario.',
  })
  @IsOptional()
  @MesCalendario('hasta')
  hasta?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

export class ListarMetasAhorroQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-09',
    description:
      'Primer mes del rango, YYYY-MM, incluido. Sin él no hay límite inferior. No puede ser posterior a `hasta`.',
  })
  @IsOptional()
  @MesCalendario('desde')
  desde?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-11',
    description: 'Último mes del rango, YYYY-MM, incluido. Sin él no hay límite superior.',
  })
  @IsOptional()
  @MesCalendario('hasta')
  hasta?: string;
}

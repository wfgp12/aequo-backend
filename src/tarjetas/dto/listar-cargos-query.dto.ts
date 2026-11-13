import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListarCargosQueryDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['true', 'false'],
    example: 'true',
    description: 'Filtra por estado: `true` solo los cargos activos, `false` solo los inactivos. Sin él, todos.',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'activo debe ser true o false' })
  activo?: 'true' | 'false';
}

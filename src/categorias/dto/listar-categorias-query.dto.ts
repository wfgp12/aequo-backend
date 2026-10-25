import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TipoTransaccion } from '../../transacciones/transaccion.enums.js';

export class ListarCategoriasQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(TipoTransaccion),
    example: 'EGRESO',
    description: 'Devuelve solo las categorías de este tipo. Sin este filtro devuelve las de ingreso y las de egreso.',
  })
  @IsOptional()
  @IsEnum(TipoTransaccion, { message: 'tipo debe ser INGRESO o EGRESO' })
  tipo?: TipoTransaccion;
}

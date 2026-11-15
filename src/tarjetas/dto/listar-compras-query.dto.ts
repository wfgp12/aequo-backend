import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';
import { TipoCompra } from '../compra-credito.enums.js';

export class ListarComprasQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(TipoCompra),
    example: 'COMPRA',
    description: 'Filtra por tipo: `COMPRA` solo las compras, `AVANCE` solo los avances. Sin él, ambos.',
  })
  @IsOptional()
  @IsEnum(TipoCompra, { message: 'tipo debe ser COMPRA o AVANCE' })
  tipo?: TipoCompra;

  @ApiPropertyOptional({
    type: String,
    example: '2026-11',
    description:
      'Filtra por el mes (`YYYY-MM`) de la **fecha de la compra** (no el del primer pago), con ambos extremos del mes incluidos. Sin él, todos los meses.',
  })
  @IsOptional()
  @MesCalendario('mes')
  mes?: string;
}

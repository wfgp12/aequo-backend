import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { MesCalendario } from '../../common/validadores.js';

/** Query de `GET /tarjetas/:tarjetaId/pagos`. */
export class ListarPagosQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-12',
    description:
      'Filtra por el mes (`YYYY-MM`) de la **fecha del pago**, con ambos extremos del mes incluidos. Sin él, todos los pagos de la tarjeta. No se acepta repetido ni con otro formato.',
  })
  @IsOptional()
  @MesCalendario('mes')
  mes?: string;
}

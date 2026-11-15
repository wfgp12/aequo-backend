import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { ValidateIf } from 'class-validator';
import { CrearCompraDto, DESCRIPCION_COMPRA_MAXIMA, DescripcionCompra } from './crear-compra.dto.js';

export const DESCRIPCION_AVANCE = 'Avance en efectivo';

/** Un avance no lleva categoría (la fija el servidor) y su descripción es opcional. */
export class CrearAvanceDto extends OmitType(CrearCompraDto, ['categoriaId', 'descripcion'] as const) {
  @ApiPropertyOptional({
    type: String,
    maxLength: DESCRIPCION_COMPRA_MAXIMA,
    example: 'Avance para el arriendo',
    description: `Para qué es el avance, de 1 a ${DESCRIPCION_COMPRA_MAXIMA} caracteres (se recortan los espacios de los extremos). Opcional: sin ella es "${DESCRIPCION_AVANCE}".`,
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @DescripcionCompra()
  descripcion?: string;
}

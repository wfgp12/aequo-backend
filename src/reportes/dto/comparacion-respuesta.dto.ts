import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaGastoDto } from './categorias-respuesta.dto.js';
import { TipoComparacion } from './comparacion-query.dto.js';

/**
 * Un mes de la comparación. Las propiedades que trae dependen del `tipo` pedido: `balance` trae `balance`;
 * `ingresos-egresos` trae `ingresos` y `egresos`; `categoria` trae `total` y `categorias`.
 */
export class PeriodoComparacionDto {
  @ApiProperty({
    type: String,
    example: '2026-09',
    description: 'Mes comparado, `YYYY-MM`. Es el mes de la `fecha` de los movimientos (día calendario, UTC).',
  })
  periodo: string;

  @ApiPropertyOptional({
    type: Number,
    example: 1780197.87,
    description:
      'Solo con `tipo=balance`. Balance del mes con la regla de flujo de caja (ADR-014): ingresos − egresos − pagos de tarjeta − abonos a deudas; el dinero recibido no suma. Es igual al `balance` de `GET /reportes/periodo?mes=`. Puede ser negativo. Sin redondear.',
  })
  balance?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 3000000,
    description:
      'Solo con `tipo=ingresos-egresos`. Ingreso propio del mes: ingresos ordinarios, sin el dinero recibido. Es igual al `ingresos` de `GET /reportes/periodo?mes=`. Sin redondear.',
  })
  ingresos?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 900000,
    description:
      'Solo con `tipo=ingresos-egresos`. Gasto propio del mes: egresos ordinarios, sin pagos de tarjeta ni abonos a deudas. Es igual al `egresos` de `GET /reportes/periodo?mes=`. Sin redondear.',
  })
  egresos?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 900000,
    description:
      'Solo con `tipo=categoria`. Gasto propio del mes: suma de los `total` de `categorias`. Vale 0 en un mes con movimientos pero sin gastos. Es igual al `total` de `GET /reportes/categorias?mes=`.',
  })
  total?: number;

  @ApiPropertyOptional({
    type: [CategoriaGastoDto],
    description:
      'Solo con `tipo=categoria`. La distribución del gasto del mes con la misma forma, orden y entrada "Sin categoría" de `GET /reportes/categorias`: de mayor a menor `total` y, en empate, por `nombre` de la A a la Z. Vacío en un mes sin gastos.',
  })
  categorias?: CategoriaGastoDto[];
}

export class ComparacionRespuestaDto {
  @ApiProperty({
    enum: TipoComparacion,
    example: TipoComparacion.BALANCE,
    description: 'El tipo de comparación pedido.',
  })
  tipo: TipoComparacion;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07',
    description:
      'Primer mes del rango efectivo, `YYYY-MM`: el enviado o, si se omitió, el primer mes con movimientos. `null` si se omitió y no hay movimientos que lo definan.',
  })
  desde: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10',
    description:
      'Último mes del rango efectivo, `YYYY-MM`: el enviado o, si se omitió, el último mes con movimientos. `null` si se omitió y no hay movimientos que lo definan.',
  })
  hasta: string | null;

  @ApiProperty({
    type: [PeriodoComparacionDto],
    description:
      'Un elemento por cada mes del rango que tiene al menos un movimiento (de cualquier clase), de más antiguo a más reciente; los meses sin movimientos no aparecen. Es el mismo conjunto de meses para los tres tipos. Vacío si el rango no tiene movimientos.',
  })
  periodos: PeriodoComparacionDto[];
}

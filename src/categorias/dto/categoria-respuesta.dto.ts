import { ApiProperty } from '@nestjs/swagger';
import { TipoTransaccion } from '../../transacciones/transaccion.enums.js';

/** Lo mínimo de una categoría: lo que va dentro de cada transacción para mostrar su nombre sin otra petición. */
export class CategoriaResumenDto {
  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34ce',
    description: 'Identificador de la categoría (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: 'Alimentación',
    description: 'Nombre de la categoría, sin espacios en los extremos.',
  })
  nombre: string;

  @ApiProperty({
    enum: Object.values(TipoTransaccion),
    example: 'EGRESO',
    description: 'Tipo de movimiento al que aplica. Una categoría solo se usa en movimientos de su mismo tipo.',
  })
  tipo: TipoTransaccion;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'true = categoría general del sistema (la define el administrador): no se puede editar ni eliminar. false = personalizada del usuario.',
  })
  esPredeterminada: boolean;
}

export class CategoriaRespuestaDto extends CategoriaResumenDto {
  @ApiProperty({
    type: Number,
    example: 12,
    minimum: 0,
    description:
      'Cantidad de transacciones del usuario autenticado que usan esta categoría. En una categoría general cuenta solo las del propio usuario.',
  })
  movimientos: number;
}

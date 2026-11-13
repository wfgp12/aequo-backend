import { ApiProperty } from '@nestjs/swagger';
import { MarcasDeTiempoRespuestaDto } from './marcas-de-tiempo-respuesta.dto.js';

export class CargoRespuestaDto extends MarcasDeTiempoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34ce',
    description: 'Identificador del cargo fijo (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la tarjeta a la que pertenece el cargo. No se puede cambiar.',
  })
  tarjetaId: string;

  @ApiProperty({ type: String, example: 'Netflix', description: 'Qué se cobra cada mes, sin espacios sobrantes.' })
  descripcion: string;

  @ApiProperty({
    type: Number,
    example: 38900,
    description: 'Monto mensual en pesos colombianos, mayor que cero. Sin redondear.',
  })
  valor: number;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Si el cargo está activo. Un cargo inactivo se conserva pero no se suma al total del mes.',
  })
  activo: boolean;
}

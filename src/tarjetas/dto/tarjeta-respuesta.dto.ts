import { ApiProperty } from '@nestjs/swagger';
import { MarcasDeTiempoRespuestaDto } from './marcas-de-tiempo-respuesta.dto.js';

export class TarjetaRespuestaDto extends MarcasDeTiempoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Identificador de la tarjeta (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: 'Visa Bancolombia',
    description: 'Nombre de la tarjeta, sin espacios sobrantes.',
  })
  nombre: string;

  @ApiProperty({
    type: Number,
    example: 0.2921,
    description: 'Tasa efectiva anual vigente como fracción de 0 a 1 (0.2921 = 29,21 % E.A.). Sin redondear.',
  })
  tasaEA: number;

  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'Si es true, una compra a una sola cuota en esta tarjeta no paga interés.',
  })
  cuotaUnicaSinInteres: boolean;
}

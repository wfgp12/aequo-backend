import { ApiProperty } from '@nestjs/swagger';

export class TarjetaRespuestaDto {
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

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-02T15:30:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se creó la tarjeta.',
  })
  creadaEn: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-20T09:10:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) de la última modificación.',
  })
  actualizadaEn: string;
}

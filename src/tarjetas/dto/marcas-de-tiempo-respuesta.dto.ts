import { ApiProperty } from '@nestjs/swagger';

/** Las fechas que comparten las respuestas de tarjeta y de cargo fijo. */
export class MarcasDeTiempoRespuestaDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-02T15:30:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se creó el registro.',
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

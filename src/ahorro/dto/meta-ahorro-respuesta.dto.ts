import { ApiProperty } from '@nestjs/swagger';
import { TipoMeta } from '../meta-ahorro.enums.js';

export class MetaAhorroRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Identificador de la meta (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({
    enum: Object.values(TipoMeta),
    example: 'PORCENTAJE',
    description: 'Cómo se expresa la meta: porcentaje del ingreso propio o monto fijo.',
  })
  tipoMeta: TipoMeta;

  @ApiProperty({
    type: Number,
    example: 20,
    description:
      'Valor de la meta: porcentaje (0 a 100) con PORCENTAJE, o pesos colombianos con MONTO_FIJO. Sin redondear.',
  })
  valorObjetivo: number;

  @ApiProperty({ type: String, example: '2026-11', description: 'Mes de la meta, YYYY-MM.' })
  periodo: string;

  @ApiProperty({
    type: Number,
    example: 150000,
    description: 'Ahorro efectivo del mes en pesos. Vale 0 mientras no se registre; puede ser negativo.',
  })
  ahorroReal: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-02T15:30:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se creó la meta.',
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

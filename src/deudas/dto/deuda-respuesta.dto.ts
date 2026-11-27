import { ApiProperty } from '@nestjs/swagger';
import { TipoInteres } from '../deuda.enums.js';

export class DeudaRespuestaDto {
  @ApiProperty({ type: String, example: '66a0b3c4d5e6f70012ab3601', description: 'Id de la deuda.' })
  id: string;

  @ApiProperty({
    type: String,
    example: 'Juan Pérez',
    description: 'A quién se le debe, como se escribió la primera vez.',
  })
  acreedor: string;

  @ApiProperty({
    enum: Object.values(TipoInteres),
    example: 'TASA',
    description: 'Cómo genera intereses la deuda: `SIN_INTERES`, `TASA` o `MONTO_FIJO`.',
  })
  tipoInteres: TipoInteres;

  @ApiProperty({
    type: Number,
    example: 0.02,
    description:
      '0 sin interés; en `TASA`, la tasa mensual simple como fracción (`0.02` = 2 % al mes); en `MONTO_FIJO`, el interés total de la deuda en pesos (no por mes).',
  })
  valorInteres: number;

  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'Si la deuda ya está pagada. Una saldada no recibe préstamos nuevos.',
  })
  saldada: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-27T15:00:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se creó la deuda.',
  })
  creadaEn: string;
}

export class PrestamoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab3602',
    description: 'Id del préstamo: el de su transacción en GET /transacciones.',
  })
  id: string;

  @ApiProperty({ type: Number, example: 500000, description: 'Lo recibido, en pesos colombianos, sin intereses.' })
  monto: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-10', description: 'Día en que se recibió.' })
  fecha: string;

  @ApiProperty({ type: String, example: 'Préstamo recibido', description: 'Nota del préstamo.' })
  descripcion: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-27T15:00:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se registró.',
  })
  creadaEn: string;
}

export class PrestamoRegistradoRespuestaDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: '`true` si se creó la deuda; `false` si el monto se sumó a una que ya existía.',
  })
  deudaCreada: boolean;

  @ApiProperty({ type: DeudaRespuestaDto, description: 'La deuda que recibió el préstamo.' })
  deuda: DeudaRespuestaDto;

  @ApiProperty({ type: PrestamoRespuestaDto, description: 'El préstamo registrado.' })
  prestamo: PrestamoRespuestaDto;
}

export class DeudaListadaRespuestaDto extends DeudaRespuestaDto {
  @ApiProperty({
    type: [PrestamoRespuestaDto],
    description: 'Los préstamos de la deuda, del más reciente al más antiguo.',
  })
  prestamos: PrestamoRespuestaDto[];
}

import { ApiProperty } from '@nestjs/swagger';

export class PeriodoRespuestaDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-01',
    description: 'Primer día del periodo efectivo del reporte, `YYYY-MM-DD`.',
  })
  desde: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-31',
    description: 'Último día del periodo efectivo del reporte, `YYYY-MM-DD`, incluido.',
  })
  hasta: string;

  @ApiProperty({
    type: Number,
    example: 2800000,
    description:
      'Ingreso propio del periodo: suma de los ingresos ordinarios. Excluye el dinero recibido (préstamos y avances).',
  })
  ingresos: number;

  @ApiProperty({
    type: Number,
    example: 1379700,
    description:
      'Gasto propio del periodo: suma de los egresos ordinarios. No incluye pagos de tarjeta ni abonos a deudas.',
  })
  egresos: number;

  @ApiProperty({
    type: Number,
    example: 119802.13,
    description: 'Suma de los pagos de tarjeta hechos en el periodo, por la fecha del pago (no por la de la compra).',
  })
  pagosTarjeta: number;

  @ApiProperty({ type: Number, example: 200000, description: 'Suma de los abonos a deudas hechos en el periodo.' })
  abonosDeuda: number;

  @ApiProperty({
    type: Number,
    example: 1000000,
    description:
      'Dinero recibido en el periodo (préstamos y avances). Se informa aparte: no es ingreso propio y no suma al balance.',
  })
  dineroRecibido: number;

  @ApiProperty({
    type: Number,
    example: 1100497.87,
    description:
      'Dinero que entró o salió de verdad: `ingresos − egresos − pagosTarjeta − abonosDeuda`. Puede ser negativo. Tiene la precisión completa de la suma: el redondeo al peso lo hace el cliente.',
  })
  balance: number;
}

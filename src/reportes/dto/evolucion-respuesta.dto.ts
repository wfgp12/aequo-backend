import { ApiProperty } from '@nestjs/swagger';

export class PuntoEvolucionDto {
  @ApiProperty({
    type: String,
    example: '2026-09',
    description: 'Mes del punto, `YYYY-MM`.',
  })
  periodo: string;

  @ApiProperty({
    type: Number,
    example: 1780197.87,
    description:
      'Balance del mes con la regla de flujo de caja (ADR-014): ingresos − egresos − pagos de tarjeta − abonos a deudas; el dinero recibido no suma. Es igual al `balance` de `GET /reportes/periodo?mes=` de ese mes. Puede ser negativo y vale 0 en un mes sin movimientos. Sin redondear.',
  })
  balance: number;
}

export class EvolucionRespuestaDto {
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
    type: [PuntoEvolucionDto],
    description:
      'Un punto por cada mes del rango, de más antiguo a más reciente, con los meses sin movimientos en 0. Vacío si el rango no tiene movimientos.',
  })
  puntos: PuntoEvolucionDto[];
}

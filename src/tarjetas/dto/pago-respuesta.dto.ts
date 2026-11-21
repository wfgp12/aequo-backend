import { ApiProperty } from '@nestjs/swagger';
import { METODOS_DE_PAGO_DE_TRANSACCION, MetodoPago } from '../../transacciones/transaccion.enums.js';

/** Un pago de tarjeta tal como lo ve el cliente: sin usuario, `_id`, `__v`, tipo, monto ni clasificación. */
export class PagoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab3501',
    description: 'Id del pago (es el de su transacción). Sirve para eliminarlo con `DELETE …/pagos/:id`.',
  })
  id: string;

  @ApiProperty({ type: String, example: '66a0b3c4d5e6f70012ab34cd', description: 'Id de la tarjeta que se pagó.' })
  tarjetaId: string;

  @ApiProperty({
    type: Number,
    example: 300000,
    description: 'Lo que se pagó, en pesos colombianos, tal como se guardó (sin redondear).',
  })
  valor: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-05',
    description: 'Día del pago, `YYYY-MM-DD`. El pago cuenta en el balance de este mes.',
  })
  fecha: string;

  @ApiProperty({
    enum: METODOS_DE_PAGO_DE_TRANSACCION,
    example: 'TRANSFERENCIA',
    description: 'Con qué se pagó: `EFECTIVO`, `DEBITO` o `TRANSFERENCIA`.',
  })
  metodoPago: MetodoPago;

  @ApiProperty({ type: String, example: 'Pago de diciembre', description: 'Nota del pago.' })
  descripcion: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-12-15T12:00:00.000Z',
    description: 'Cuándo se registró el pago, en ISO 8601 UTC.',
  })
  creadaEn: string;
}

/** Lo pagado en un mes frente al total estimado de la tarjeta para ese mes. Todos los montos van sin redondear. */
export class ComparacionPagoDto {
  @ApiProperty({
    type: String,
    example: '2026-12',
    description: 'Mes comparado, `YYYY-MM`: el de la `fecha` del pago (no el mes actual).',
  })
  mes: string;

  @ApiProperty({
    type: Number,
    example: 346270.05016469,
    description:
      'Total estimado a pagar ese mes: cuotas vigentes más cargos fijos activos (el `total` de `GET …/proyeccion` para ese mes).',
  })
  estimado: number;

  @ApiProperty({
    type: Number,
    example: 300000,
    description:
      'Suma de todos los pagos de esta tarjeta cuya fecha cae en ese mes, incluido el que se acaba de registrar. No cuentan avances, compras, abonos ni pagos de otras tarjetas.',
  })
  pagado: number;

  @ApiProperty({
    type: Number,
    example: -46270.05016469,
    description:
      '`pagado − estimado`. Negativa: falta por pagar. Positiva: se pagó de más. Cero: pago exacto. No se redondea: pagar el estimado redondeado al peso deja una diferencia mínima, no cero.',
  })
  diferencia: number;
}

/** Respuesta de `POST /tarjetas/:tarjetaId/pagos`: el pago y su comparación con el total estimado del mes. */
export class PagoRegistradoRespuestaDto extends PagoRespuestaDto {
  @ApiProperty({
    type: () => ComparacionPagoDto,
    description: 'Comparación del mes del pago con el total estimado, ya con este pago incluido.',
    example: { mes: '2026-12', estimado: 346270.05016469, pagado: 300000, diferencia: -46270.05016469 },
  })
  comparacion: ComparacionPagoDto;
}

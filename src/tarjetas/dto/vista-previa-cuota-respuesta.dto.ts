import { ApiProperty } from '@nestjs/swagger';

/** La cuota estimada de una compra o avance que todavía no se guarda. No lleva id: no hay nada guardado. */
export class VistaPreviaCuotaRespuestaDto {
  @ApiProperty({
    type: Number,
    example: 119802.1331718775,
    description:
      'Cuota mensual fija en pesos con la tasa y la bandera actuales de la tarjeta, **sin redondear** (el cliente redondea al mostrarla).',
  })
  cuota: number;

  @ApiProperty({
    type: String,
    example: '2027-11',
    description: 'Mes del último pago (YYYY-MM): el del primer pago más `cuotas − 1` meses.',
  })
  mesUltimoPago: string;

  @ApiProperty({
    type: Number,
    example: 0.2921,
    description:
      'Tasa efectiva anual (fracción: 0,2921 = 29,21 %) que tiene la tarjeta hoy y que copiaría la compra o el avance al guardarse.',
  })
  tasaEAAplicada: number;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Si la tarjeta tiene hoy `cuotaUnicaSinInteres`: con `true`, una sola cuota no paga interés. La copiaría la compra o el avance al guardarse.',
  })
  cuotaUnicaSinInteres: boolean;
}

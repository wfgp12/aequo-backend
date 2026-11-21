import { ApiProperty } from '@nestjs/swagger';

/** Las cifras de un mes de la tarjeta. Todos los montos son pesos sin redondear (el cliente redondea al mostrar). */
export class MesProyeccionDto {
  @ApiProperty({ type: String, example: '2026-12', description: 'Mes de estas cifras, `YYYY-MM`.' })
  mes: string;

  @ApiProperty({
    type: Number,
    example: 291270.05016469,
    description:
      'Suma de las cuotas vigentes del mes de todas las compras y avances (cada una con su propia tasa): las que cumplen `primerPago ≤ mes ≤ mesUltimoPago`. 0 si ninguna está vigente.',
  })
  cuotas: number;

  @ApiProperty({
    type: Number,
    example: 55000,
    description:
      'Suma de los cargos fijos activos de la tarjeta. Se repite igual en cada mes: el cargo no guarda fechas de inicio ni de fin.',
  })
  cargosFijos: number;

  @ApiProperty({
    type: Number,
    example: 346270.05016469,
    description: 'Total estimado a pagar en el mes: `cuotas` + `cargosFijos`.',
  })
  total: number;

  @ApiProperty({
    type: Number,
    example: 1766528.890201,
    description:
      'Saldo pendiente después del pago de este mes: suma de las cuotas (con sus intereses) de todos los meses posteriores. No incluye cargos fijos, no descuenta pagos hechos y cuenta completas las compras cuyo primer pago aún no llega. No es el capital adeudado.',
  })
  saldoPendiente: number;
}

/** Total del mes de referencia, su saldo pendiente y la proyección de los meses siguientes de una tarjeta. */
export class ProyeccionRespuestaDto extends MesProyeccionDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la tarjeta consultada.',
  })
  tarjetaId: string;

  @ApiProperty({
    type: Number,
    example: 300000,
    description:
      'Suma de los pagos de la tarjeta (`POST …/pagos`) cuya fecha cae en el mes de referencia. 0 si no hay ninguno. Solo se informa en el mes de referencia; las filas de `proyeccion` no lo traen.',
  })
  pagado: number;

  @ApiProperty({
    type: Number,
    example: -46270.05016469,
    description:
      '`pagado − total` del mes de referencia. Negativa: falta por pagar; positiva: se pagó de más; cero: pago exacto. Sin pagos es `-total`. Los pagos no cambian `cuotas`, `cargosFijos`, `total` ni `saldoPendiente`.',
  })
  diferencia: number;

  @ApiProperty({
    type: () => [MesProyeccionDto],
    description:
      'Los meses siguientes al de referencia, uno por mes y sin saltos, hasta el último mes con cuotas (el `mesUltimoPago` más lejano de las compras). Un mes sin cuotas aparece con solo los cargos fijos. `[]` si no queda ninguna cuota posterior; los cargos no la alargan.',
    example: [
      {
        mes: '2027-01',
        cuotas: 209543.21823395,
        cargosFijos: 55000,
        total: 264543.21823395,
        saldoPendiente: 1556985.671967,
      },
    ],
  })
  proyeccion: MesProyeccionDto[];
}

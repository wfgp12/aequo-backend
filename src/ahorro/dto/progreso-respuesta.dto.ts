import { ApiProperty } from '@nestjs/swagger';
import { TipoMeta } from '../meta-ahorro.enums.js';

export class MetaProgresoDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Identificador de la meta del mes (ObjectId de MongoDB).',
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
    description: 'Valor guardado de la meta: porcentaje (0 a 100) con PORCENTAJE, o pesos con MONTO_FIJO.',
  })
  valorObjetivo: number;

  @ApiProperty({
    type: Number,
    example: 600000,
    description:
      'Meta del mes en pesos: `valorObjetivo` con MONTO_FIJO, o `ingresoPropio × valorObjetivo / 100` con PORCENTAJE. Sin redondear.',
  })
  montoMeta: number;
}

export class ProgresoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '2026-11',
    description: 'Mes calculado, `YYYY-MM`.',
  })
  periodo: string;

  @ApiProperty({
    type: Number,
    example: 3000000,
    description: 'Ingreso propio del mes: ingresos ordinarios, sin el dinero recibido (préstamos y avances).',
  })
  ingresoPropio: number;

  @ApiProperty({
    type: Number,
    example: 2700000,
    description:
      'Dinero que salió en el mes: egresos ordinarios, pagos de tarjeta y abonos a deudas (regla de flujo de caja, ADR-014).',
  })
  egresos: number;

  @ApiProperty({
    type: Number,
    example: 300000,
    description:
      'Ahorro del mes según los movimientos: `ingresoPropio − egresos`. Coincide con el `balance` de `GET /reportes/periodo`. Puede ser negativo.',
  })
  ahorroDelMes: number;

  @ApiProperty({
    type: () => MetaProgresoDto,
    nullable: true,
    description: 'La meta del mes con su monto en pesos, o `null` si el mes no tiene meta.',
  })
  meta: MetaProgresoDto | null;

  @ApiProperty({
    type: Number,
    example: -300000,
    description:
      'Lo que se puede gastar sin faltar a la meta: `ingresoPropio − egresos − montoMeta`. Sin meta, `montoMeta` cuenta como 0. Negativo si ya se pasó.',
  })
  disponible: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 50,
    description:
      'Avance hacia la meta: `ahorroDelMes / montoMeta × 100`, sin tope (150 es una meta superada en 50 %) y sin redondear. `null` si no hay meta o su `montoMeta` es 0.',
  })
  porcentajeAvance: number | null;
}

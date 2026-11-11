import { ApiProperty } from '@nestjs/swagger';

export class AcumuladoMesDto {
  @ApiProperty({
    type: String,
    example: '2026-09',
    description: 'Mes de la meta, `YYYY-MM`.',
  })
  periodo: string;

  @ApiProperty({
    type: Number,
    example: -80000,
    description: 'Ahorro real guardado en la meta de ese mes, en pesos. Puede ser negativo.',
  })
  ahorroReal: number;

  @ApiProperty({
    type: Number,
    example: 170000,
    description: 'Suma de los `ahorroReal` de todos los meses hasta este, incluido.',
  })
  acumulado: number;
}

export class AcumuladoRespuestaDto {
  @ApiProperty({
    type: Number,
    example: 320000,
    description: 'Ahorro real acumulado: el `acumulado` del último mes. Vale 0 si no hay metas.',
  })
  total: number;

  @ApiProperty({
    type: () => [AcumuladoMesDto],
    description:
      'Un elemento por cada meta del usuario, de la más antigua a la más reciente. Los meses sin meta no aparecen.',
  })
  meses: AcumuladoMesDto[];
}

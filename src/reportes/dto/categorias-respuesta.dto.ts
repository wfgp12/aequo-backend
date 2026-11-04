import { ApiProperty } from '@nestjs/swagger';

export class CategoriaGastoDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '665f1c2e9b1d4a0012ab3a01',
    description:
      'Id de la categoría. `null` solo en la entrada "Sin categoría": gasto cuya categoría ya no se encuentra o que no tiene.',
  })
  categoriaId: string | null;

  @ApiProperty({
    type: String,
    example: 'Alimentación',
    description: 'Nombre actual de la categoría (si se renombra, el reporte muestra el nombre nuevo).',
  })
  nombre: string;

  @ApiProperty({
    type: Number,
    example: 600000,
    description: 'Suma de los gastos propios de esa categoría en el periodo.',
  })
  total: number;

  @ApiProperty({
    type: Number,
    example: 60,
    description:
      'Parte del gasto total que representa la categoría: `total` de la categoría ÷ `total` del reporte × 100. Sin redondear: el redondeo lo hace el cliente.',
  })
  porcentaje: number;
}

export class CategoriasRespuestaDto {
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
    example: 1000000,
    description:
      'Gasto propio del periodo: suma de los egresos ordinarios. Es igual a `egresos` de `GET /reportes/periodo` y a la suma de los `total` de `categorias`. Vale 0 si no hubo gastos.',
  })
  total: number;

  @ApiProperty({
    type: [CategoriaGastoDto],
    description:
      'Una entrada por cada categoría con gasto en el periodo, de mayor a menor `total` y, en empate, por `nombre` de la A a la Z. Vacío si no hubo gastos.',
  })
  categorias: CategoriaGastoDto[];
}

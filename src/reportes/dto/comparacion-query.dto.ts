import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { EvolucionQueryDto } from './evolucion-query.dto.js';

/** Qué se compara entre los meses (RF-16). Cerrada: un tipo no soportado se rechaza con 400. */
export enum TipoComparacion {
  BALANCE = 'balance',
  INGRESOS_EGRESOS = 'ingresos-egresos',
  CATEGORIA = 'categoria',
}

export class ComparacionQueryDto extends EvolucionQueryDto {
  @ApiProperty({
    enum: TipoComparacion,
    example: TipoComparacion.BALANCE,
    description:
      'Qué se compara en cada mes. `balance`: el balance del mes; `ingresos-egresos`: el ingreso y el gasto propios; `categoria`: el gasto total y su distribución por categoría. Obligatorio.',
  })
  @IsIn(Object.values(TipoComparacion), {
    message: `tipo debe ser uno de: ${Object.values(TipoComparacion).join(', ')}`,
  })
  tipo: TipoComparacion;
}

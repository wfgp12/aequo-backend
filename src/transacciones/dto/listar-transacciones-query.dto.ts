import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { FechaCalendario } from '../../common/validadores.js';
import { METODOS_DE_PAGO_DE_TRANSACCION, TipoTransaccion } from '../transaccion.enums.js';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;

export class ListarTransaccionesQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-10-01',
    description:
      'Fecha inicial del filtro Desde/Hasta, YYYY-MM-DD, incluida. Sin ella no hay límite inferior. No puede ser posterior a `hasta`.',
  })
  @IsOptional()
  @FechaCalendario('desde')
  desde?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-10-31',
    description: 'Fecha final del filtro Desde/Hasta, YYYY-MM-DD, incluida. Sin ella no hay límite superior.',
  })
  @IsOptional()
  @FechaCalendario('hasta')
  hasta?: string;

  @ApiPropertyOptional({
    enum: Object.values(TipoTransaccion),
    example: 'EGRESO',
    description: 'Devuelve solo ingresos o solo egresos.',
  })
  @IsOptional()
  @IsEnum(TipoTransaccion, { message: 'tipo debe ser INGRESO o EGRESO' })
  tipo?: TipoTransaccion;

  @ApiPropertyOptional({
    type: String,
    example: '665f1c2e9b1d4a0012ab34ce',
    description: 'Devuelve solo las transacciones de esta categoría.',
  })
  @IsOptional()
  @IsMongoId({ message: 'categoriaId debe ser un id de categoría válido' })
  categoriaId?: string;

  @ApiPropertyOptional({
    enum: METODOS_DE_PAGO_DE_TRANSACCION,
    example: 'EFECTIVO',
    description: 'Devuelve solo las transacciones pagadas con este método.',
  })
  @IsOptional()
  @IsIn(METODOS_DE_PAGO_DE_TRANSACCION, { message: 'metodoPago debe ser EFECTIVO, DEBITO o TRANSFERENCIA' })
  metodoPago?: (typeof METODOS_DE_PAGO_DE_TRANSACCION)[number];

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: LIMITE_MAXIMO,
    default: LIMITE_POR_DEFECTO,
    example: 20,
    description: `Cuántas transacciones devolver por página, de 1 a ${LIMITE_MAXIMO}. Por defecto ${LIMITE_POR_DEFECTO}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}` })
  @Min(1, { message: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}` })
  @Max(LIMITE_MAXIMO, { message: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}` })
  limite?: number;

  @ApiPropertyOptional({
    type: String,
    example: 'MTc2MTM0NDQwMDAwMF82NmEwYjNjNGQ1ZTZmNzAwMTJhYjM0Y2Q',
    description:
      'Para la carga progresiva: el `siguienteCursor` de la página anterior, tal cual. Es opaco: no lo interpretes ni lo armes. Sin él se pide la primera página.',
  })
  @IsOptional()
  @IsString({ message: 'cursor debe ser texto' })
  cursor?: string;
}

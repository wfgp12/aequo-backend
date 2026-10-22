import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { METODOS_DE_PAGO_DE_TRANSACCION, TipoTransaccion } from '../transaccion.enums.js';

export const MONTO_MAXIMO = 999_999_999_999;
export const DESCRIPCION_MAXIMA = 200;

export class CrearTransaccionDto {
  @ApiProperty({
    enum: Object.values(TipoTransaccion),
    example: 'EGRESO',
    description:
      'Tipo del movimiento. Lo fija el botón con el que el usuario inicia el registro: "Registrar ingreso" envía INGRESO y "Registrar egreso" envía EGRESO.',
  })
  @IsEnum(TipoTransaccion, { message: 'tipo debe ser INGRESO o EGRESO' })
  tipo: TipoTransaccion;

  @ApiProperty({
    type: Number,
    example: 45000,
    minimum: 0.01,
    maximum: MONTO_MAXIMO,
    description:
      'Valor del movimiento en pesos colombianos. Debe ser mayor que cero, con máximo 2 decimales. El signo lo da el tipo: nunca se envía negativo.',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe ser un número con máximo 2 decimales' })
  @IsPositive({ message: 'monto debe ser mayor que cero' })
  @Max(MONTO_MAXIMO, { message: `monto no puede superar ${MONTO_MAXIMO}` })
  monto: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-20',
    description:
      'Fecha del movimiento en formato YYYY-MM-DD, sin hora ni zona horaria (así no hay desfases entre cliente y servidor). Puede ser pasada o futura. Debe ser una fecha real del calendario.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'fecha debe ser una fecha real del calendario (YYYY-MM-DD)' })
  fecha: string;

  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34cd',
    description:
      'Id de la categoría del movimiento. Por ahora solo se valida que tenga formato de id; la comprobación de que la categoría exista y sea del usuario se agrega con el módulo de categorías.',
  })
  @IsMongoId({ message: 'categoriaId debe ser un id de categoría válido' })
  categoriaId: string;

  @ApiProperty({
    enum: METODOS_DE_PAGO_DE_TRANSACCION,
    example: 'EFECTIVO',
    description:
      'Método de pago. TARJETA_CREDITO no se acepta aquí: una compra con tarjeta de crédito se registra en el módulo de tarjetas, no como transacción.',
  })
  @IsIn(METODOS_DE_PAGO_DE_TRANSACCION, {
    message:
      'metodoPago debe ser EFECTIVO, DEBITO o TRANSFERENCIA; las compras con tarjeta de crédito se registran en el módulo de tarjetas',
  })
  metodoPago: (typeof METODOS_DE_PAGO_DE_TRANSACCION)[number];

  @ApiPropertyOptional({
    type: String,
    maxLength: DESCRIPCION_MAXIMA,
    example: 'Mercado de la semana',
    description: `Texto libre opcional, máximo ${DESCRIPCION_MAXIMA} caracteres. Se recortan los espacios de los extremos. Si no se envía, la transacción queda con descripción vacía.`,
  })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto' })
  @MaxLength(DESCRIPCION_MAXIMA, { message: `descripcion no puede superar ${DESCRIPCION_MAXIMA} caracteres` })
  descripcion?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  isNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateBy,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';
import { recortar } from '../../categorias/dto/crear-categoria.dto.js';
import { FechaCalendario } from '../../common/validadores.js';
import { DESCRIPCION_COMPRA_MAXIMA, DescripcionCompra } from '../../tarjetas/dto/crear-compra.dto.js';
import { MONTO_MAXIMO } from '../../transacciones/dto/crear-transaccion.dto.js';
import { TipoInteres } from '../deuda.enums.js';
import { ACREEDOR_MAXIMO, VALOR_VALIDO } from '../deuda.schema.js';

export const DESCRIPCION_PRESTAMO = 'Préstamo recibido';

/**
 * El valor del interés según el tipo, con lo omitido como `SIN_INTERES` y 0. Se valida aquí (y no solo en el esquema)
 * para que sea 400 también al sumar a una deuda existente; el monto fijo, además, es dinero: 2 decimales y con tope.
 */
function interesValido(valor: unknown, argumentos?: ValidationArguments): boolean {
  const { tipoInteres = TipoInteres.SIN_INTERES } = argumentos!.object as RegistrarPrestamoDto;
  const numero = valor === undefined ? 0 : valor;
  if (!isNumber(numero) || !VALOR_VALIDO[tipoInteres]?.(numero)) return false;
  return (
    tipoInteres !== TipoInteres.MONTO_FIJO || (isNumber(numero, { maxDecimalPlaces: 2 }) && numero <= MONTO_MAXIMO)
  );
}

/** Cuerpo de `POST /deudas/prestamos`. El tipo de movimiento, la clasificación y el método de pago los fija el servidor. */
export class RegistrarPrestamoDto {
  @ApiProperty({
    type: String,
    maxLength: ACREEDOR_MAXIMO,
    example: 'Juan Pérez',
    description: `A quién se le debe, de 1 a ${ACREEDOR_MAXIMO} caracteres (se recortan los espacios de los extremos). Si ya hay una deuda activa con ese nombre (sin distinguir mayúsculas, sí tildes), el monto se suma a ella.`,
  })
  @Transform(recortar)
  @IsString({ message: 'acreedor debe ser texto' })
  @IsNotEmpty({ message: 'acreedor no puede estar vacío' })
  @MaxLength(ACREEDOR_MAXIMO, { message: `acreedor no puede superar ${ACREEDOR_MAXIMO} caracteres` })
  acreedor: string;

  @ApiProperty({
    type: Number,
    minimum: 0.01,
    maximum: MONTO_MAXIMO,
    example: 500000,
    description: `Lo que se recibió prestado, en pesos colombianos y sin intereses: mayor que cero, con máximo 2 decimales y como mucho ${MONTO_MAXIMO}.`,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe ser un número con máximo 2 decimales' })
  @IsPositive({ message: 'monto debe ser mayor que cero' })
  @Max(MONTO_MAXIMO, { message: `monto no puede superar ${MONTO_MAXIMO}` })
  monto: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-10',
    description:
      'Día en que se recibió el préstamo, `YYYY-MM-DD` real, sin hora ni zona horaria; pasado o futuro. El dinero cuenta como disponible en el mes de esta fecha.',
  })
  @FechaCalendario('fecha')
  fecha: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: DESCRIPCION_COMPRA_MAXIMA,
    example: 'Para el arriendo',
    description: `Nota del préstamo, de 1 a ${DESCRIPCION_COMPRA_MAXIMA} caracteres (se recortan los espacios de los extremos). Opcional: sin ella es "${DESCRIPCION_PRESTAMO}".`,
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @DescripcionCompra()
  descripcion?: string;

  @ApiPropertyOptional({
    enum: Object.values(TipoInteres),
    example: 'TASA',
    description:
      'Cómo genera intereses la deuda: `SIN_INTERES`, `TASA` (mensual simple) o `MONTO_FIJO` (interés total). Opcional: en una deuda nueva es `SIN_INTERES`; al sumar a una existente, sin `tipoInteres` ni `valorInteres` se conserva el suyo.',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsEnum(TipoInteres, { message: 'tipoInteres debe ser SIN_INTERES, TASA o MONTO_FIJO' })
  tipoInteres?: TipoInteres;

  @ApiPropertyOptional({
    type: Number,
    example: 0.02,
    description: `Depende de \`tipoInteres\`. \`SIN_INTERES\`: 0 u omitido. \`TASA\`: tasa MENSUAL SIMPLE como fracción, mayor que 0 y hasta 1 (\`0.02\` = 2 % al mes). \`MONTO_FIJO\`: interés TOTAL de la deuda en pesos (no por mes), mayor que 0, máximo 2 decimales y hasta ${MONTO_MAXIMO}.`,
  })
  // Corre siempre, también sin el campo: `TASA` o `MONTO_FIJO` sin valor es un error.
  @ValidateBy({
    name: 'valorInteres',
    validator: {
      validate: interesValido,
      defaultMessage: () =>
        'valorInteres no corresponde al tipo de interés: 0 sin interés, una fracción mayor que 0 y hasta 1 en TASA, o pesos mayores que 0 con máximo 2 decimales en MONTO_FIJO',
    },
  })
  valorInteres?: number;
}

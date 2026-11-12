import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';
import { recortar } from '../../categorias/dto/crear-categoria.dto.js';

export const DESCRIPCION_CARGO_MAXIMA = 100;

export class CrearCargoDto {
  @ApiProperty({
    type: String,
    maxLength: DESCRIPCION_CARGO_MAXIMA,
    example: 'Netflix',
    description: `Qué se cobra cada mes, de 1 a ${DESCRIPCION_CARGO_MAXIMA} caracteres (se recortan los espacios de los extremos). Se pueden repetir descripciones en una misma tarjeta.`,
  })
  @Transform(recortar)
  @IsString({ message: 'descripcion debe ser texto' })
  @IsNotEmpty({ message: 'descripcion no puede estar vacía' })
  @MaxLength(DESCRIPCION_CARGO_MAXIMA, {
    message: `descripcion no puede superar ${DESCRIPCION_CARGO_MAXIMA} caracteres`,
  })
  descripcion: string;

  @ApiProperty({
    type: Number,
    example: 38900,
    description:
      'Monto mensual en pesos colombianos, mayor que cero y sin tope. No se redondea. Para dejar de cobrarlo se desactiva el cargo (`activo`), no se pone en cero.',
  })
  @IsNumber({}, { message: 'valor debe ser un número' })
  @IsPositive({ message: 'valor debe ser mayor que cero' })
  valor: number;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    example: true,
    description:
      'Si el cargo está activo. Un cargo inactivo se conserva pero deja de sumarse al total del mes de la tarjeta. Opcional: vale true si no se envía.',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsBoolean({ message: 'activo debe ser verdadero o falso' })
  activo?: boolean;
}

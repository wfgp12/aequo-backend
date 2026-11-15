import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { recortar } from '../../categorias/dto/crear-categoria.dto.js';
import { FechaCalendario, MesOFechaCalendario } from '../../common/validadores.js';

export const DESCRIPCION_COMPRA_MAXIMA = 200;
export const CUOTAS_MAXIMAS = 60;

/** Reglas de `descripcion` de una compra o un avance: texto de 1 a 200 caracteres, sin los espacios de los extremos. */
export const DescripcionCompra = () =>
  applyDecorators(
    Transform(recortar),
    IsString({ message: 'descripcion debe ser texto' }),
    IsNotEmpty({ message: 'descripcion no puede estar vacía' }),
    MaxLength(DESCRIPCION_COMPRA_MAXIMA, {
      message: `descripcion no puede superar ${DESCRIPCION_COMPRA_MAXIMA} caracteres`,
    }),
  );

export class CrearCompraDto {
  @ApiProperty({
    type: String,
    maxLength: DESCRIPCION_COMPRA_MAXIMA,
    example: 'Televisor',
    description: `Qué se compró, de 1 a ${DESCRIPCION_COMPRA_MAXIMA} caracteres (se recortan los espacios de los extremos).`,
  })
  @DescripcionCompra()
  descripcion: string;

  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34ce',
    description:
      'Id de la categoría de gasto, tal como lo devuelve GET /categorias. Debe existir y ser general o del propio usuario (si no, responde 404) y ser de egresos (una categoría de ingresos responde 400).',
  })
  @IsMongoId({ message: 'categoriaId debe ser un id de categoría válido' })
  categoriaId: string;

  @ApiProperty({
    type: Number,
    example: 1254700,
    description:
      'Valor total de la compra en pesos colombianos, mayor que cero y con decimales permitidos. Se guarda sin redondear.',
  })
  @IsNumber({}, { message: 'valor debe ser un número' })
  @IsPositive({ message: 'valor debe ser mayor que cero' })
  valor: number;

  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: CUOTAS_MAXIMAS,
    example: 12,
    description: `Número de cuotas: un entero de 1 a ${CUOTAS_MAXIMAS}.`,
  })
  @IsInt({ message: 'cuotas debe ser un número entero' })
  @Min(1, { message: 'cuotas debe ser al menos 1' })
  @Max(CUOTAS_MAXIMAS, { message: `cuotas no puede superar ${CUOTAS_MAXIMAS}` })
  cuotas: number;

  @ApiProperty({
    type: String,
    example: '2026-12',
    description:
      'Mes del primer pago: YYYY-MM, o una fecha real YYYY-MM-DD sin hora (se toma solo el mes). Puede ser anterior, igual o posterior al mes de la compra. Siempre se devuelve como YYYY-MM.',
  })
  @MesOFechaCalendario('primerPago')
  primerPago: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-11-10',
    description:
      'Día de la compra en formato YYYY-MM-DD, sin hora ni zona horaria. Opcional: sin ella es hoy en la zona del header `X-Zona-Horaria` (UTC sin el header). La compra cuenta en el mes de esta fecha.',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @FechaCalendario('fecha')
  fecha?: string;
}

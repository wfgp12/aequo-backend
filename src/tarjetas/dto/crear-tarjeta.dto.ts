import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { recortar } from '../../categorias/dto/crear-categoria.dto.js';

export const NOMBRE_TARJETA_MAXIMO = 50;

export class CrearTarjetaDto {
  @ApiProperty({
    type: String,
    maxLength: NOMBRE_TARJETA_MAXIMO,
    example: 'Visa Bancolombia',
    description: `Nombre de la tarjeta, de 1 a ${NOMBRE_TARJETA_MAXIMO} caracteres (se recortan los espacios de los extremos). Único por usuario sin distinguir mayúsculas: "Visa" y "visa" son la misma tarjeta. Las tildes cuentan como letras distintas.`,
  })
  @Transform(recortar)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  @MaxLength(NOMBRE_TARJETA_MAXIMO, { message: `nombre no puede superar ${NOMBRE_TARJETA_MAXIMO} caracteres` })
  nombre: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 1,
    example: 0.2921,
    description:
      'Tasa efectiva anual como FRACCIÓN, no como porcentaje: 29,21 % E.A. se envía como 0.2921. Va de 0 a 1 (0 = tarjeta sin interés; 29.21 se rechaza). Se guarda sin redondear. Es la tasa vigente: cada compra copia la suya al registrarse.',
  })
  @IsNumber({}, { message: 'tasaEA debe ser un número' })
  @Min(0, { message: 'tasaEA no puede ser negativa' })
  @Max(1, { message: 'tasaEA debe ser una fracción entre 0 y 1 (29,21 % se envía como 0.2921)' })
  tasaEA: number;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    example: false,
    description:
      'Si es true, una compra a una sola cuota en esta tarjeta no paga interés (la cuota es el valor de la compra). Opcional: vale false si no se envía.',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsBoolean({ message: 'cuotaUnicaSinInteres debe ser verdadero o falso' })
  cuotaUnicaSinInteres?: boolean;
}

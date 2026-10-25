import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TipoTransaccion } from '../../transacciones/transaccion.enums.js';
import { NOMBRE_CATEGORIA_MAXIMO } from '../categoria.schema.js';

/** Se valida el nombre ya sin los espacios de los extremos: "   " cuenta como vacío. */
export const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearCategoriaDto {
  @ApiProperty({
    type: String,
    maxLength: NOMBRE_CATEGORIA_MAXIMO,
    example: 'Mascotas',
    description: `Nombre de la categoría, de 1 a ${NOMBRE_CATEGORIA_MAXIMO} caracteres (se recortan los espacios de los extremos). No puede repetir el de otra categoría del mismo tipo que el usuario ya tenga o que sea general, sin distinguir mayúsculas ni tildes.`,
  })
  @Transform(recortar)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  @MaxLength(NOMBRE_CATEGORIA_MAXIMO, { message: `nombre no puede superar ${NOMBRE_CATEGORIA_MAXIMO} caracteres` })
  nombre: string;

  @ApiProperty({
    enum: Object.values(TipoTransaccion),
    example: 'EGRESO',
    description: 'Tipo de movimiento al que aplica la categoría. No se puede cambiar después.',
  })
  @IsEnum(TipoTransaccion, { message: 'tipo debe ser INGRESO o EGRESO' })
  tipo: TipoTransaccion;
}

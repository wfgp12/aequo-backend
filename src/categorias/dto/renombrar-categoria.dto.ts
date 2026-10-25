import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NOMBRE_CATEGORIA_MAXIMO } from '../categoria.schema.js';
import { recortar } from './crear-categoria.dto.js';

export class RenombrarCategoriaDto {
  @ApiProperty({
    type: String,
    maxLength: NOMBRE_CATEGORIA_MAXIMO,
    example: 'Mascotas y veterinario',
    description: `Nuevo nombre, de 1 a ${NOMBRE_CATEGORIA_MAXIMO} caracteres (se recortan los espacios de los extremos). Solo se puede cambiar el nombre: el tipo es fijo. No puede coincidir con otra categoría del mismo tipo, sin distinguir mayúsculas ni tildes.`,
  })
  @Transform(recortar)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  @MaxLength(NOMBRE_CATEGORIA_MAXIMO, { message: `nombre no puede superar ${NOMBRE_CATEGORIA_MAXIMO} caracteres` })
  nombre: string;
}

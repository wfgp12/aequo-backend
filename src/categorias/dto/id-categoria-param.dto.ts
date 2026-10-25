import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class IdCategoriaParamDto {
  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34ce',
    description: 'Id de la categoría, tal como lo devuelve GET /categorias.',
  })
  @IsMongoId({ message: 'id debe ser un id de categoría válido' })
  id: string;
}

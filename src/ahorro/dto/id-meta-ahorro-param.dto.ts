import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class IdMetaAhorroParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la meta de ahorro, tal como lo devuelven POST y GET /ahorro/metas.',
  })
  @IsMongoId({ message: 'id debe ser un id de meta de ahorro válido' })
  id: string;
}

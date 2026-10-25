import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class IdTransaccionParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la transacción, tal como lo devuelven POST y GET /transacciones.',
  })
  @IsMongoId({ message: 'id debe ser un id de transacción válido' })
  id: string;
}

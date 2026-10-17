import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    type: String,
    description: 'ID Token de Firebase obtenido en el cliente con user.getIdToken()',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

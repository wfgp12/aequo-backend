import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    type: String,
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjFlOWdkazcifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vYWVxdW8tZmluYW5jZSJ9.firma',
    description:
      'ID Token de Firebase del usuario que acaba de iniciar sesión con Google, obtenido en el cliente con `user.getIdToken()`. Es un JWT firmado por Google que dura 1 hora. Debe ser un texto no vacío.',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

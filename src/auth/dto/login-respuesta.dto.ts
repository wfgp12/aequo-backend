import { ApiProperty } from '@nestjs/swagger';

export class UsuarioRespuestaDto {
  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34cd',
    description: 'Identificador del usuario en Aequo (ObjectId de MongoDB). Es el mismo valor que lleva el JWT en el campo `sub`.',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: 'Wilhen Gutierrez',
    description: 'Nombre del usuario. Nunca viene vacío: si la cuenta de Google no tiene nombre, se usa la parte del correo antes de la `@`.',
  })
  nombre: string;

  @ApiProperty({
    type: String,
    example: 'wilhen@gmail.com',
    description: 'Correo de la cuenta de Google. Es solo informativo: el usuario se identifica por su UID de Firebase, no por el correo.',
  })
  email: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://lh3.googleusercontent.com/a/ejemplo=s96-c',
    description: 'URL de la foto de perfil de Google, o `null` si la cuenta no tiene foto.',
  })
  fotoUrl: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-17T18:08:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que el usuario creó su cuenta. Sirve para mostrar "Miembro desde" en el perfil.',
  })
  miembroDesde: string;
}

export class LoginRespuestaDto {
  @ApiProperty({
    type: String,
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjVmMWMyZTliMWQ0YTAwMTJhYjM0Y2QiLCJpYXQiOjE3NjA3MDAwMDAsImV4cCI6MTc2MDc4NjQwMH0.firma',
    description:
      'JWT propio de la app. Se envía en las demás peticiones como `Authorization: Bearer <accessToken>`. Su payload lleva `sub` (id del usuario), `iat` y `exp`.',
  })
  accessToken: string;

  @ApiProperty({
    type: Number,
    example: 86400,
    description: 'Vigencia del `accessToken` en segundos: 24 horas (RNF-01). Al vencer hay que repetir el login.',
  })
  expiresIn: number;

  @ApiProperty({
    type: UsuarioRespuestaDto,
    description: 'Datos básicos del usuario autenticado, para pintar la interfaz sin otra petición.',
  })
  usuario: UsuarioRespuestaDto;
}

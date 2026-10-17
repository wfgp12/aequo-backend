import { ApiProperty } from '@nestjs/swagger';

export class UsuarioRespuestaDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String, description: 'Nunca vacío: si Google no trae nombre, se usa la parte local del correo' })
  nombre: string;

  @ApiProperty({ type: String })
  email: string;

  @ApiProperty({ type: String, nullable: true })
  fotoUrl: string | null;
}

export class LoginRespuestaDto {
  @ApiProperty({ type: String, description: 'JWT propio de la app; enviar como Authorization: Bearer <accessToken>' })
  accessToken: string;

  @ApiProperty({ type: Number, example: 86400, description: 'Vigencia en segundos (24 h, RNF-01)' })
  expiresIn: number;

  @ApiProperty({ type: UsuarioRespuestaDto })
  usuario: UsuarioRespuestaDto;
}

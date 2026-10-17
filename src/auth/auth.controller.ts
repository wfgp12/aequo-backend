import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginRespuestaDto } from './dto/login-respuesta.dto.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicio de sesión con Google',
    description:
      'Verifica el ID Token de Firebase, crea o recupera al usuario por su UID y devuelve un JWT propio de 24 h.',
  })
  @ApiOkResponse({ type: LoginRespuestaDto })
  @ApiBadRequestResponse({ description: 'Body inválido (idToken ausente o vacío)' })
  @ApiUnauthorizedResponse({ description: 'ID Token inválido o vencido' })
  login(@Body() dto: LoginDto): Promise<LoginRespuestaDto> {
    return this.auth.login(dto.idToken);
  }
}

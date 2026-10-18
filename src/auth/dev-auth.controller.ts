import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginRespuestaDto } from './dto/login-respuesta.dto.js';

@ApiTags('auth')
@Controller('auth')
export class DevAuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('dev-login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sesión de prueba (solo desarrollo)',
    description:
      'Devuelve la misma respuesta que /auth/login para un usuario de prueba fijo. Solo existe con NODE_ENV=development y DEV_SESSION_ENABLED=true.',
  })
  @ApiOkResponse({ type: LoginRespuestaDto })
  loginDePrueba(): Promise<LoginRespuestaDto> {
    return this.auth.loginDePrueba();
  }
}

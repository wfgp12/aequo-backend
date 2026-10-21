import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorInternoDto, ErrorNoEncontradoDto } from '../common/dto/error-respuesta.dto.js';
import { AuthService } from './auth.service.js';
import { Publica } from './decoradores.js';
import { LoginRespuestaDto } from './dto/login-respuesta.dto.js';

@Publica()
@ApiTags('desarrollo')
@Controller('auth')
export class DevAuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('dev-login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sesión de prueba (solo desarrollo)',
    description: `
**Solo existe en desarrollo.** Permite revisar en Expo Go las pantallas que requieren sesión, donde el inicio de sesión con Google no funciona (ADR-011).

- La ruta únicamente se registra si el backend corre con \`NODE_ENV=development\` **y** \`DEV_SESSION_ENABLED=true\`. En cualquier otro caso (por ejemplo producción) no existe y responde \`404\`, aunque la bandera esté activa.
- No recibe body ni header y no verifica ningún token de Firebase.
- Abre sesión de un usuario de prueba fijo (\`prueba@aequo.local\`, UID \`dev-session-user\`), que se crea en la base la primera vez, y devuelve la misma respuesta que \`POST /auth/login\`.
- El usuario de prueba vive en la colección \`usuarios\` de la base a la que apunte el entorno de desarrollo.
`.trim(),
  })
  @ApiOkResponse({
    type: LoginRespuestaDto,
    description: 'Sesión de prueba iniciada. Misma forma que la respuesta de `POST /auth/login`.',
  })
  @ApiNotFoundResponse({
    type: ErrorNoEncontradoDto,
    description: 'La sesión de prueba no está habilitada en este entorno (la ruta no existe). Es lo esperado en producción.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible.',
  })
  loginDePrueba(): Promise<LoginRespuestaDto> {
    return this.auth.loginDePrueba();
  }
}

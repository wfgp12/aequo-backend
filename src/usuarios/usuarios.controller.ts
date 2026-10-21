import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service.js';
import { UsuarioActual } from '../auth/decoradores.js';
import { UsuarioRespuestaDto } from '../auth/dto/login-respuesta.dto.js';
import { ErrorInternoDto, ErrorSesionInvalidaDto } from '../common/dto/error-respuesta.dto.js';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consultar el perfil del usuario autenticado',
    description: `
Devuelve los datos básicos del usuario dueño de la sesión. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- El usuario se toma **siempre del JWT** (campo \`sub\`). El endpoint no recibe ningún id ni parámetro, así que nadie puede consultar el perfil de otro usuario.
- La respuesta tiene los mismos campos que \`usuario\` en \`POST /auth/login\`: \`id\`, \`nombre\`, \`email\` y \`fotoUrl\`. Nunca incluye el UID de Firebase ni campos internos.
- Si el JWT es válido pero el usuario ya no existe (por ejemplo, porque eliminó su cuenta), responde \`401\`: esa sesión ya no es válida y el cliente debe cerrarla y volver al login.
`.trim(),
  })
  @ApiOkResponse({
    type: UsuarioRespuestaDto,
    description: 'Perfil del usuario autenticado.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description:
      'Falta el token, es inválido, está vencido o manipulado, o el usuario ya no existe. El cliente debe cerrar la sesión local y volver al login.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
  })
  perfil(@UsuarioActual() usuarioId: string): Promise<UsuarioRespuestaDto> {
    return this.auth.obtenerPerfil(usuarioId);
  }
}

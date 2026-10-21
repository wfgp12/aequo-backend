import { Controller, Delete, Get, HttpCode, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
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

  @Delete('me')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar la cuenta del usuario autenticado',
    description: `
Elimina de forma **permanente e irreversible** la cuenta del usuario dueño de la sesión y **toda su información financiera**. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. La confirmación al usuario ("¿seguro que quieres eliminar tu cuenta?") es responsabilidad del cliente: este endpoint borra en cuanto se llama.

**Qué se borra**
- Los documentos de **todas las colecciones** que referencian al usuario con \`usuarioId\` (transacciones, categorías personales, metas de ahorro, tarjetas, deudas, presupuesto, etc.) y, al final, el propio usuario. No queda ningún documento asociado.
- Las categorías generales del sistema no se tocan: no pertenecen a ningún usuario.

**Reglas a tener en cuenta**
- El usuario se toma **siempre del JWT**: solo se puede eliminar la cuenta propia.
- Los datos se borran antes que el usuario. Si ocurre un fallo a mitad (\`500\`), la cuenta sigue existiendo y se puede **reintentar** la misma petición.
- Es **idempotente**: repetirla cuando la cuenta ya no existe también responde \`204\`.
- Al terminar, el JWT del usuario deja de ser una sesión válida (\`GET /usuarios/me\` responde \`401\`): el cliente debe cerrar la sesión local y volver al login.
- La cuenta de Google/Firebase no se elimina: si el usuario vuelve a iniciar sesión, se crea una cuenta nueva y vacía.
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Cuenta y datos eliminados. Sin cuerpo. El cliente debe cerrar la sesión local.' })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado. No se elimina nada.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description:
      'Fallo inesperado a mitad del borrado, por ejemplo MongoDB no disponible. La cuenta sigue existiendo: reintentar la misma petición.',
  })
  eliminarCuenta(@UsuarioActual() usuarioId: string): Promise<void> {
    return this.auth.eliminarCuenta(usuarioId);
  }
}

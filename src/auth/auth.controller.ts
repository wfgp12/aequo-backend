import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ErrorInternoDto,
  ErrorNoAutorizadoDto,
  ErrorValidacionDto,
} from '../common/dto/error-respuesta.dto.js';
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
    summary: 'Iniciar sesión con Google',
    description: `
Intercambia el **ID Token de Firebase** por un **JWT propio** de la app. No requiere autenticación previa.

**Flujo completo**
1. La app cliente inicia sesión con Google mediante el SDK de Firebase y obtiene el ID Token con \`user.getIdToken()\`.
2. Lo envía en el body de esta petición.
3. El backend lo verifica **una sola vez** con \`firebase-admin\` (firma, vigencia y revocación).
4. Busca al usuario por su **UID de Firebase** (no por correo). Si no existe, lo crea con el nombre, correo y foto de Google.
5. Responde con un JWT propio válido **24 horas** (\`expiresIn\` = 86400 s). Desde aquí el ID Token no se vuelve a usar: la sesión es el JWT, que se envía como \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- El body debe ser exactamente \`{ "idToken": "..." }\`. Un campo extra o un \`idToken\` que no sea texto responde \`400\` sin llegar a Firebase.
- El primer login **crea** al usuario; los siguientes lo **recuperan** y no sobrescriben sus datos. Repetir el login devuelve el mismo \`usuario.id\` (el JWT sí cambia).
- \`usuario.nombre\` nunca viene vacío: si la cuenta de Google no tiene nombre, se usa la parte del correo antes de la \`@\`.
- Un ID Token sin correo se rechaza con \`401\`.
- \`401\` significa que Firebase rechazó el token (malformado, vencido o revocado). Un fallo de red u otro problema ajeno al token responde \`500\`, no \`401\`.
`.trim(),
  })
  @ApiOkResponse({
    type: LoginRespuestaDto,
    description: 'Sesión iniciada. Guardar `accessToken` y enviarlo en el header Authorization de las demás peticiones.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'Body inválido: `idToken` ausente, vacío o que no es texto (incluye objetos con operadores como `{ "$ne": null }`), o algún campo desconocido. `message` es un arreglo.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorNoAutorizadoDto,
    description: 'Firebase rechazó el ID Token (inválido, vencido o revocado) o el token no trae correo. El cliente debe pedir un token nuevo.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado que no es del token: por ejemplo MongoDB o Firebase no disponibles. Reintentar más tarde.',
  })
  login(@Body() dto: LoginDto): Promise<LoginRespuestaDto> {
    return this.auth.login(dto.idToken);
  }
}

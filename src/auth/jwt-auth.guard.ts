import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICA, type SolicitudAutenticada } from './decoradores.js';
import { MENSAJE_SESION_INVALIDA, TokenService } from './token.service.js';

/**
 * Guard global de sesión. Exige `Authorization: Bearer <accessToken>` en toda ruta que no sea @Publica().
 * Cualquier fallo (sin header, esquema distinto, token vencido o manipulado) es un 401 con el mismo mensaje.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean | undefined>(ES_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublica) {
      return true;
    }

    const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
    const token = solicitud.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }

    solicitud.usuarioId = (await this.tokens.validar(token)).usuarioId;
    return true;
  }
}

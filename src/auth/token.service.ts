import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Mismo mensaje para token ausente, vencido o manipulado: no se da pistas sobre el motivo. */
export const MENSAJE_SESION_INVALIDA = 'Sesión inválida o vencida';

/** Emite y valida el JWT propio de la sesión (ADR-0007). El payload solo lleva `sub` (id del usuario). */
@Injectable()
export class TokenService {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  generar(usuarioId: string): string {
    return this.jwt.sign({ sub: usuarioId });
  }

  /** Verifica firma, algoritmo y vigencia. Cualquier fallo es un 401 con el mismo mensaje. */
  async validar(token: string): Promise<{ usuarioId: string }> {
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      if (typeof sub === 'string' && sub) {
        return { usuarioId: sub };
      }
    } catch {
      // Firma incorrecta, token vencido o malformado: se trata igual que un payload sin `sub`.
    }
    throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
  }
}

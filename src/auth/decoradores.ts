import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const ES_PUBLICA = 'esPublica';

/** La petición, una vez que el guard validó la sesión. */
export interface SolicitudAutenticada extends Request {
  usuarioId?: string;
}

/**
 * Las rutas son protegidas por defecto (JwtAuthGuard es global). Esta marca deja pasar sin sesión
 * solo a las rutas que no pueden exigirla: login, sesión de prueba y la ruta de plantilla.
 */
export const Publica = () => SetMetadata(ES_PUBLICA, true);

/** Id del usuario dueño de la sesión (el `sub` del JWT). Solo disponible en rutas protegidas. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext) =>
  contexto.switchToHttp().getRequest<SolicitudAutenticada>().usuarioId,
);

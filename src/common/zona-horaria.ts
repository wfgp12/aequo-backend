import { applyDecorators, BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';

export const ENCABEZADO_ZONA_HORARIA = 'X-Zona-Horaria';
export const ZONA_POR_DEFECTO = 'UTC';

/** Una zona IANA es válida si `Intl` la conoce; así no hace falta una lista propia ni dependencias. */
function esZonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zona horaria del cliente (header `X-Zona-Horaria`, nombre IANA) para decidir qué día y mes es "hoy". Sin el header
 * se usa UTC. Una zona inválida responde 400 siempre, también si la petición trae `mes` o un rango.
 */
export const ZonaHoraria = createParamDecorator((_dato: unknown, contexto: ExecutionContext): string => {
  const zona = contexto.switchToHttp().getRequest<Request>().header(ENCABEZADO_ZONA_HORARIA);
  if (zona === undefined) return ZONA_POR_DEFECTO;
  if (!esZonaValida(zona)) {
    throw new BadRequestException([
      `${ENCABEZADO_ZONA_HORARIA} debe ser un nombre de zona horaria IANA válido, por ejemplo America/Bogota`,
    ]);
  }
  return zona;
});

/** Documenta el header en Swagger; se aplica a los endpoints que usan `@ZonaHoraria()`. */
export const ApiZonaHoraria = () =>
  applyDecorators(
    ApiHeader({
      name: ENCABEZADO_ZONA_HORARIA,
      required: false,
      example: 'America/Bogota',
      description:
        'Zona horaria del cliente (nombre IANA). Solo decide qué mes es el "mes actual" cuando no se envía `mes` ni `desde`/`hasta`; en los demás casos no cambia nada. Sin el header se usa UTC. Un nombre inválido responde `400`, también si se envía `mes` o un rango.',
    }),
  );

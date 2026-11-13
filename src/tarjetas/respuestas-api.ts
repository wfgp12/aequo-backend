import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorInternoDto, ErrorSesionInvalidaDto, ErrorValidacionDto } from '../common/dto/error-respuesta.dto.js';

/** Las respuestas 401 y 500, iguales en todas las rutas de tarjetas y cargos. */
export const RespuestasComunes = () =>
  applyDecorators(
    ApiUnauthorizedResponse({
      type: ErrorSesionInvalidaDto,
      description: 'Falta el token, es inválido, está vencido o manipulado. No se cambia nada.',
    }),
    ApiInternalServerErrorResponse({
      type: ErrorInternoDto,
      description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
    }),
  );

/** Un 400 de validación; `message` es siempre un arreglo. */
export const RespuestaInvalida = (description: string) =>
  ApiBadRequestResponse({ type: ErrorValidacionDto, description });

/** Respuesta 200 de un listado: `{ items: [...] }` con el DTO indicado, sin paginación. */
export const RespuestaLista = (dto: Type, description: string) =>
  ApiOkResponse({
    description,
    schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { $ref: `#/components/schemas/${dto.name}` } } },
      required: ['items'],
    },
  });

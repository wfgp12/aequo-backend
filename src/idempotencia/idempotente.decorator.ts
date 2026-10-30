import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { ApiConflictResponse, ApiHeader, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { ErrorConflictoDto, ErrorNoProcesableDto } from '../common/dto/error-respuesta.dto.js';
import { IdempotenciaInterceptor } from './idempotencia.interceptor.js';

/**
 * Marca una petición que CREA datos para que no se ejecute dos veces por error. Todo POST que cree datos la lleva
 * (la prueba de documentación Swagger lo exige). Documenta el header y las respuestas 409 y 422 en Swagger.
 */
export const Idempotente = () =>
  applyDecorators(
    UseInterceptors(IdempotenciaInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'UUID que identifica la acción del usuario (por ejemplo `crypto.randomUUID()`), generado UNA vez cuando empieza la acción y reutilizado en cualquier reintento de esa misma acción; una acción nueva lleva una clave nueva. Con la misma clave y la misma petición, el servidor no vuelve a ejecutarla: devuelve la respuesta de la primera vez con el header `Idempotent-Replayed: true`. Mientras no esté activada la exigencia (variable `IDEMPOTENCIA_OBLIGATORIA`) es opcional; con ella activa, sin el header responde `400`. Las claves caducan a las 24 horas y son por usuario.',
      schema: { type: 'string', format: 'uuid', example: '0b9d3c1e-6a52-4f7e-9d8e-2c4f1a7b5e60' },
    }),
    ApiConflictResponse({
      type: ErrorConflictoDto,
      description:
        'Otra petición con la misma `Idempotency-Key` todavía se está ejecutando. No reenvíes con otra clave: espera y consulta el resultado.',
    }),
    ApiUnprocessableEntityResponse({
      type: ErrorNoProcesableDto,
      description:
        'La `Idempotency-Key` ya se usó con otra petición (otro cuerpo o ruta). Es un error del cliente: una acción nueva necesita una clave nueva.',
    }),
  );

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Forma estándar de error de NestJS: { statusCode, message, error }.
// Una clase por caso porque `message` cambia de tipo (arreglo en las validaciones, texto en el resto).

export class ErrorValidacionDto {
  @ApiProperty({ type: Number, example: 400, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: [String],
    example: ['idToken should not be empty', 'idToken must be a string'],
    description:
      'Lista con un mensaje por cada regla de validación incumplida (los genera class-validator, en inglés). Es siempre un arreglo, aunque tenga un solo elemento.',
  })
  message: string[];

  @ApiProperty({ type: String, example: 'Bad Request', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorNoAutorizadoDto {
  @ApiProperty({ type: Number, example: 401, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'ID Token inválido o vencido',
    description: 'Motivo del rechazo, en texto. No distingue entre token malformado, vencido o revocado a propósito.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Unauthorized', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorSesionInvalidaDto {
  @ApiProperty({ type: Number, example: 401, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Sesión inválida o vencida',
    description:
      'Mismo mensaje para token ausente, vencido, manipulado o de un usuario que ya no existe: no se da pistas sobre el motivo.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Unauthorized', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorNoEncontradoDto {
  @ApiProperty({ type: Number, example: 404, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Cannot POST /auth/dev-login',
    description: 'Mensaje que genera NestJS cuando la ruta no está registrada.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Not Found', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorInternoDto {
  @ApiProperty({ type: Number, example: 500, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Internal server error',
    description: 'Mensaje genérico: el detalle del fallo no se expone al cliente, solo queda en el log del servidor.',
  })
  message: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Internal Server Error',
    description: 'Nombre del estado HTTP. NestJS no siempre lo incluye en los errores 500.',
  })
  error?: string;
}

export class ErrorNoProcesableDto {
  @ApiProperty({ type: Number, example: 422, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
    description: 'La petición está bien formada, pero no se puede procesar tal como llegó.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Unprocessable Entity', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorProhibidoDto {
  @ApiProperty({ type: Number, example: 403, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Las categorías generales no se pueden modificar',
    description: 'Motivo por el que la operación no está permitida, en texto.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Forbidden', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorConflictoDto {
  @ApiProperty({ type: Number, example: 409, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Ya existe una categoría con ese nombre',
    description: 'Motivo del conflicto con datos que ya existen, en texto.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Conflict', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorTransaccionNoEncontradaDto {
  @ApiProperty({ type: Number, example: 404, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Transacción no encontrada',
    description:
      'La transacción no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Not Found', description: 'Nombre del estado HTTP.' })
  error: string;
}

export class ErrorRecursoNoEncontradoDto {
  @ApiProperty({ type: Number, example: 404, description: 'Código HTTP de la respuesta.' })
  statusCode: number;

  @ApiProperty({
    type: String,
    example: 'Categoría no encontrada',
    description:
      'El recurso no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;

  @ApiProperty({ type: String, example: 'Not Found', description: 'Nombre del estado HTTP.' })
  error: string;
}

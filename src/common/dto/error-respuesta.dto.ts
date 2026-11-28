import { STATUS_CODES } from 'node:http';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCIONES, type CodigoError } from '../errores.catalogo.js';

// Forma estándar de error: { statusCode, error, message, code, action? } (la arma `ErroresModule`).
// Una clase por caso porque cambian los ejemplos y el tipo de `message` (arreglo en las validaciones, texto en el resto).

/** Todo menos `message`, con los ejemplos del estado y del código más representativo de cada clase. */
function errorBase(estado: number, codigo: CodigoError) {
  abstract class ErrorBaseDto {
    @ApiProperty({ type: Number, example: estado, description: 'Código HTTP de la respuesta.' })
    statusCode: number;

    @ApiProperty({ type: String, example: STATUS_CODES[estado], description: 'Nombre del estado HTTP.' })
    error: string;

    @ApiProperty({
      type: String,
      example: codigo,
      description:
        'Identificador estable del error, siempre presente: el cliente decide por este campo, no por el texto. El catálogo está en la descripción general.',
    })
    code: string;

    @ApiPropertyOptional({
      type: String,
      // Swagger exige un ejemplo también en los códigos sin `action`.
      example: ACCIONES[codigo] ?? ACCIONES.VALIDACION,
      description:
        'Qué puede hacer el usuario, en español. Solo algunos códigos la tienen: en los demás la propiedad no aparece.',
    })
    action?: string;
  }
  return ErrorBaseDto;
}

export class ErrorValidacionDto extends errorBase(400, 'VALIDACION') {
  @ApiProperty({
    type: [String],
    example: ['idToken should not be empty', 'idToken must be a string'],
    description:
      'Lista con un mensaje por cada regla de validación incumplida (en español y empezando por el nombre del campo o de la cabecera, salvo algunas reglas; los de `idToken` y «property X should not exist», de un campo no declarado, salen en inglés). Es siempre un arreglo, aunque tenga un solo elemento.',
  })
  message: string[];
}

export class ErrorNoAutorizadoDto extends errorBase(401, 'TOKEN_GOOGLE_INVALIDO') {
  @ApiProperty({
    type: String,
    example: 'ID Token inválido o vencido',
    description: 'Motivo del rechazo, en texto. No distingue entre token malformado, vencido o revocado a propósito.',
  })
  message: string;
}

export class ErrorSesionInvalidaDto extends errorBase(401, 'SESION_INVALIDA') {
  @ApiProperty({
    type: String,
    example: 'Sesión inválida o vencida',
    description:
      'Mismo mensaje para token ausente, vencido, manipulado o de un usuario que ya no existe: no se da pistas sobre el motivo.',
  })
  message: string;
}

export class ErrorNoEncontradoDto extends errorBase(404, 'RUTA_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Cannot POST /auth/dev-login',
    description: 'Mensaje que genera NestJS cuando la ruta no está registrada.',
  })
  message: string;
}

export class ErrorInternoDto extends errorBase(500, 'ERROR_INTERNO') {
  @ApiProperty({
    type: String,
    example: 'Internal server error',
    description: 'Mensaje genérico: el detalle del fallo no se expone al cliente, solo queda en el log del servidor.',
  })
  message: string;
}

export class ErrorNoProcesableDto extends errorBase(422, 'IDEMPOTENCIA_CLAVE_REUTILIZADA') {
  @ApiProperty({
    type: String,
    example: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
    description: 'La petición está bien formada, pero no se puede procesar tal como llegó.',
  })
  message: string;
}

export class ErrorProhibidoDto extends errorBase(403, 'CATEGORIA_PREDETERMINADA') {
  @ApiProperty({
    type: String,
    example: 'Las categorías generales no se pueden modificar',
    description: 'Motivo por el que la operación no está permitida, en texto.',
  })
  message: string;
}

export class ErrorConflictoDto extends errorBase(409, 'CATEGORIA_DUPLICADA') {
  @ApiProperty({
    type: String,
    example: 'Ya existe una categoría con ese nombre',
    description: 'Motivo del conflicto con datos que ya existen, en texto.',
  })
  message: string;
}

export class ErrorTransaccionNoEncontradaDto extends errorBase(404, 'TRANSACCION_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Transacción no encontrada',
    description:
      'La transacción no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;
}

export class ErrorMetaNoEncontradaDto extends errorBase(404, 'META_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Meta de ahorro no encontrada',
    description:
      'La meta no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;
}

export class ErrorTarjetaNoEncontradaDto extends errorBase(404, 'TARJETA_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Tarjeta no encontrada',
    description:
      'La tarjeta no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;
}

export class ErrorCargoNoEncontradoDto extends errorBase(404, 'CARGO_NO_ENCONTRADO') {
  @ApiProperty({
    type: String,
    example: 'Cargo fijo no encontrado',
    description:
      'El cargo no existe, es de otro usuario o es de otra tarjeta que la de la ruta; si la tarjeta de la ruta no es propia, el mensaje es el de tarjeta no encontrada.',
  })
  message: string;
}

export class ErrorPagoNoEncontradoDto extends errorBase(404, 'PAGO_NO_ENCONTRADO') {
  @ApiProperty({
    type: String,
    example: 'Pago no encontrado',
    description:
      'El pago no existe, es de otro usuario, es de otra tarjeta que la de la ruta o la transacción no es un pago de tarjeta; si la tarjeta de la ruta no es propia, el mensaje es `Tarjeta no encontrada`.',
  })
  message: string;
}

export class ErrorCompraNoEncontradaDto extends errorBase(404, 'COMPRA_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Compra no encontrada',
    description:
      'La compra no existe, es de otro usuario o es de otra tarjeta que la de la ruta. Si la tarjeta de la ruta no es propia, el mensaje es `Tarjeta no encontrada`; si la categoría enviada no existe o es de otro usuario, `Categoría no encontrada`.',
  })
  message: string;
}

export class ErrorPrestamoNoEncontradoDto extends errorBase(404, 'PRESTAMO_NO_ENCONTRADO') {
  @ApiProperty({
    type: String,
    example: 'Préstamo no encontrado',
    description:
      'La transacción no existe, es de otro usuario, es de otra deuda o no es un préstamo (un abono, un avance, un egreso). Si la deuda de la ruta no existe o es de otro usuario, el mensaje es `Deuda no encontrada`.',
  })
  message: string;
}

export class ErrorRecursoNoEncontradoDto extends errorBase(404, 'CATEGORIA_NO_ENCONTRADA') {
  @ApiProperty({
    type: String,
    example: 'Categoría no encontrada',
    description:
      'El recurso no existe o es de otro usuario: no se distingue a propósito, para no revelar qué ids existen.',
  })
  message: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsPositive, Max, ValidateIf } from 'class-validator';
import { FechaCalendario } from '../../common/validadores.js';
import { METODOS_DE_PAGO_DE_TRANSACCION, MetodoPago } from '../../transacciones/transaccion.enums.js';
import { MONTO_MAXIMO } from '../../transacciones/dto/crear-transaccion.dto.js';
import { DESCRIPCION_COMPRA_MAXIMA, DescripcionCompra } from './crear-compra.dto.js';

export const DESCRIPCION_PAGO = 'Pago de tarjeta';
export const METODO_PAGO_POR_DEFECTO = MetodoPago.TRANSFERENCIA;

/** Cuerpo de `POST /tarjetas/:tarjetaId/pagos`. El tipo, la clasificación y la tarjeta los fija el servidor. */
export class CrearPagoDto {
  @ApiProperty({
    type: Number,
    minimum: 0.01,
    maximum: MONTO_MAXIMO,
    example: 300000,
    description: `Lo que el usuario pagó, en pesos colombianos: mayor que cero, con máximo 2 decimales (es dinero que salió de verdad) y como mucho ${MONTO_MAXIMO}. Puede ser menor o mayor que el total estimado del mes. El cliente suele proponer el estimado redondeado y el usuario lo confirma o lo ajusta; el servidor no ajusta el valor al estimado.`,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'valor debe ser un número con máximo 2 decimales' })
  @IsPositive({ message: 'valor debe ser mayor que cero' })
  @Max(MONTO_MAXIMO, { message: `valor no puede superar ${MONTO_MAXIMO}` })
  valor: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-12-05',
    description:
      'Día del pago en formato YYYY-MM-DD, sin hora ni zona horaria; pasado o futuro. Opcional: sin ella es hoy en la zona del header `X-Zona-Horaria` (UTC sin el header). El pago afecta el balance del mes de esta fecha y se compara con el total estimado de ese mismo mes.',
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @FechaCalendario('fecha')
  fecha?: string;

  @ApiPropertyOptional({
    enum: METODOS_DE_PAGO_DE_TRANSACCION,
    default: METODO_PAGO_POR_DEFECTO,
    example: 'TRANSFERENCIA',
    description: `Con qué se pagó la tarjeta: \`EFECTIVO\`, \`DEBITO\` o \`TRANSFERENCIA\`. Opcional: sin él es \`${METODO_PAGO_POR_DEFECTO}\`. \`TARJETA_CREDITO\` no se acepta: no se paga una tarjeta con otra tarjeta de crédito.`,
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsIn(METODOS_DE_PAGO_DE_TRANSACCION, {
    message: 'metodoPago debe ser EFECTIVO, DEBITO o TRANSFERENCIA',
  })
  metodoPago?: MetodoPago;

  @ApiPropertyOptional({
    type: String,
    maxLength: DESCRIPCION_COMPRA_MAXIMA,
    example: 'Pago de diciembre',
    description: `Nota del pago, de 1 a ${DESCRIPCION_COMPRA_MAXIMA} caracteres (se recortan los espacios de los extremos). Opcional: sin ella es "${DESCRIPCION_PAGO}".`,
  })
  @ValidateIf((_dto, valor) => valor !== undefined)
  @DescripcionCompra()
  descripcion?: string;
}

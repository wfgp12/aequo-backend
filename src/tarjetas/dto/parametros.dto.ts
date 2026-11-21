import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

/** Ruta `/tarjetas/:id`. */
export class IdTarjetaParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la tarjeta, tal como lo devuelven POST y GET /tarjetas.',
  })
  @IsMongoId({ message: 'id debe ser un id de tarjeta válido' })
  id: string;
}

/** Rutas `/tarjetas/:tarjetaId/cargos`, `…/compras`, `…/avances` y `…/pagos`. */
export class TarjetaIdParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la tarjeta dueña de los cargos, compras, avances o pagos, tal como lo devuelven POST y GET /tarjetas.',
  })
  @IsMongoId({ message: 'tarjetaId debe ser un id de tarjeta válido' })
  tarjetaId: string;
}

/** Ruta `/tarjetas/:tarjetaId/cargos/:id`. */
export class IdCargoParamDto extends TarjetaIdParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34ce',
    description: 'Id del cargo fijo, tal como lo devuelven POST y GET /tarjetas/:tarjetaId/cargos.',
  })
  @IsMongoId({ message: 'id debe ser un id de cargo fijo válido' })
  id: string;
}

/** Ruta `/tarjetas/:tarjetaId/compras/:id`. */
export class IdCompraParamDto extends TarjetaIdParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cf',
    description: 'Id de la compra o del avance, tal como lo devuelven POST y GET /tarjetas/:tarjetaId/compras.',
  })
  @IsMongoId({ message: 'id debe ser un id de compra válido' })
  id: string;
}

/** Ruta `/tarjetas/:tarjetaId/pagos/:id`. */
export class IdPagoParamDto extends TarjetaIdParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab3501',
    description: 'Id del pago, tal como lo devuelven POST y GET /tarjetas/:tarjetaId/pagos.',
  })
  @IsMongoId({ message: 'id debe ser un id de pago válido' })
  id: string;
}

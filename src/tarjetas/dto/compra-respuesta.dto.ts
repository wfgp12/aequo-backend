import { ApiProperty } from '@nestjs/swagger';
import { TipoCompra } from '../compra-credito.enums.js';
import { MarcasDeTiempoRespuestaDto } from './marcas-de-tiempo-respuesta.dto.js';

/** Una compra a cuotas o un avance en efectivo, con su cuota y su mes del último pago calculados al responder. */
export class CompraRespuestaDto extends MarcasDeTiempoRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cf',
    description: 'Identificador de la compra o del avance (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Id de la tarjeta a la que pertenece. No se puede cambiar.',
  })
  tarjetaId: string;

  @ApiProperty({
    type: String,
    example: '665f1c2e9b1d4a0012ab34ce',
    description:
      'Id de la categoría de gasto. En un avance es siempre la categoría general de respaldo de egresos ("Otros egresos") y no se edita.',
  })
  categoriaId: string;

  @ApiProperty({
    enum: Object.values(TipoCompra),
    example: 'COMPRA',
    description: '`COMPRA` (compra a cuotas) o `AVANCE` (avance en efectivo diferido a cuotas). No se puede cambiar.',
  })
  tipo: TipoCompra;

  @ApiProperty({ type: String, example: 'Televisor', description: 'Qué se compró, sin espacios sobrantes.' })
  descripcion: string;

  @ApiProperty({
    type: Number,
    example: 1254700,
    description: 'Valor total en pesos colombianos, sin redondear.',
  })
  valor: number;

  @ApiProperty({ type: Number, example: 12, description: 'Número de cuotas (1 a 60).' })
  cuotas: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-10',
    description: 'Día de la compra (YYYY-MM-DD). La compra cuenta en el mes de esta fecha.',
  })
  fecha: string;

  @ApiProperty({ type: String, example: '2026-12', description: 'Mes del primer pago (YYYY-MM).' })
  primerPago: string;

  @ApiProperty({
    type: String,
    example: '2027-11',
    description:
      'Mes del último pago (YYYY-MM): el del primer pago más `cuotas − 1` meses. Se calcula al responder, no se guarda.',
  })
  mesUltimoPago: string;

  @ApiProperty({
    type: Number,
    example: 0.2921,
    description:
      'Tasa efectiva anual (fracción: 0,2921 = 29,21 %) que tenía la tarjeta al registrar la compra. Cambiar después la tasa de la tarjeta no la modifica.',
  })
  tasaEAAplicada: number;

  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Si la tarjeta tenía `cuotaUnicaSinInteres` al registrar la compra: con `true`, una sola cuota no paga interés. Cambiar después la tarjeta no la modifica.',
  })
  cuotaUnicaSinInteres: boolean;

  @ApiProperty({
    type: Number,
    example: 119802.1331718775,
    description:
      'Cuota mensual fija en pesos con la tasa de la compra, **sin redondear** (el cliente redondea al mostrarla). Se calcula al responder, no se guarda.',
  })
  cuota: number;
}

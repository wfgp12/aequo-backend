import { ApiProperty } from '@nestjs/swagger';
import { CategoriaResumenDto } from '../../categorias/dto/categoria-respuesta.dto.js';
import { ClasificacionFlujo, METODOS_DE_PAGO_DE_TRANSACCION, TipoTransaccion } from '../transaccion.enums.js';

export class TransaccionRespuestaDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab34cd',
    description: 'Identificador de la transacción (ObjectId de MongoDB).',
  })
  id: string;

  @ApiProperty({ enum: Object.values(TipoTransaccion), example: 'EGRESO', description: 'Ingreso o egreso.' })
  tipo: TipoTransaccion;

  @ApiProperty({
    type: Number,
    example: 45000,
    description: 'Valor en pesos colombianos. Siempre positivo: el signo lo da el tipo.',
  })
  monto: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-20',
    description: 'Fecha del movimiento, YYYY-MM-DD, sin hora ni zona horaria.',
  })
  fecha: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '665f1c2e9b1d4a0012ab34cd',
    description:
      'Id de la categoría. Es null en las transacciones que no cuentan por categoría (pagos de tarjeta y abonos a deudas), que crean otros módulos.',
  })
  categoriaId: string | null;

  @ApiProperty({
    type: CategoriaResumenDto,
    nullable: true,
    description:
      'La categoría completa (id, nombre, tipo y si es general), para mostrar su nombre sin otra petición. Es null en las transacciones sin categoría.',
  })
  categoria: CategoriaResumenDto | null;

  @ApiProperty({
    enum: METODOS_DE_PAGO_DE_TRANSACCION,
    example: 'EFECTIVO',
    description: 'Método con que se movió el dinero.',
  })
  metodoPago: string;

  @ApiProperty({
    type: String,
    example: 'Mercado de la semana',
    description: 'Descripción del usuario; cadena vacía si no escribió ninguna.',
  })
  descripcion: string;

  @ApiProperty({
    enum: Object.values(ClasificacionFlujo),
    example: 'ORDINARIO',
    description:
      'Cómo cuenta en el balance y los reportes (ADR-014). Las que se crean con POST /transacciones son siempre ORDINARIO.',
  })
  clasificacionFlujo: ClasificacionFlujo;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-20T15:30:00.000Z',
    description: 'Fecha y hora (ISO 8601, UTC) en que se registró la transacción.',
  })
  creadaEn: string;
}

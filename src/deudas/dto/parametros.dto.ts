import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

/** Ruta `/deudas/:deudaId/prestamos/:prestamoId`. */
export class IdPrestamoParamDto {
  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab3601',
    description: 'Id de la deuda, tal como lo devuelven POST /deudas/prestamos y GET /deudas.',
  })
  @IsMongoId({ message: 'deudaId debe ser un id de deuda válido' })
  deudaId: string;

  @ApiProperty({
    type: String,
    example: '66a0b3c4d5e6f70012ab3602',
    description: 'Id del préstamo de esa deuda, tal como lo devuelven POST /deudas/prestamos y GET /deudas.',
  })
  @IsMongoId({ message: 'prestamoId debe ser un id de préstamo válido' })
  prestamoId: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { TransaccionRespuestaDto } from './transaccion-respuesta.dto.js';

export class PaginaTransaccionesRespuestaDto {
  @ApiProperty({
    type: [TransaccionRespuestaDto],
    description:
      'Las transacciones de esta página, de la más reciente a la más antigua por fecha y, a igual fecha, la registrada más recientemente primero. Vacío si no hay ninguna que cumpla los filtros.',
  })
  items: TransaccionRespuestaDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'MTc2MTM0NDQwMDAwMF82NmEwYjNjNGQ1ZTZmNzAwMTJhYjM0Y2Q',
    description:
      'Cursor opaco para pedir la página siguiente (enviarlo como `cursor` con los mismos filtros). `null` significa que ya no hay más páginas.',
  })
  siguienteCursor: string | null;
}

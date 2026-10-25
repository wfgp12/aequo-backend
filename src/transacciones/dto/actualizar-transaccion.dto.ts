import { PartialType } from '@nestjs/swagger';
import { CrearTransaccionDto } from './crear-transaccion.dto.js';

/**
 * Los mismos campos y reglas que al crear, todos opcionales (RF-08: se puede editar cualquier campo, incluido el
 * tipo). Que llegue al menos uno lo comprueba el servicio.
 */
export class ActualizarTransaccionDto extends PartialType(CrearTransaccionDto) {}

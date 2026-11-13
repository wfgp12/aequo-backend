import { PartialType } from '@nestjs/swagger';
import { CrearCargoDto } from './crear-cargo.dto.js';

/**
 * Los mismos campos y reglas que al crear, todos opcionales. Que llegue al menos uno y que ninguno sea null lo
 * comprueba el servicio. `tarjetaId` no es editable: un cargo no se mueve de tarjeta.
 */
export class ActualizarCargoDto extends PartialType(CrearCargoDto) {}

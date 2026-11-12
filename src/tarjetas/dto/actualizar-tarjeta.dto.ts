import { PartialType } from '@nestjs/swagger';
import { CrearTarjetaDto } from './crear-tarjeta.dto.js';

/**
 * Los mismos campos y reglas que al crear, todos opcionales. Que llegue al menos uno y que ninguno sea null lo
 * comprueba el servicio.
 */
export class ActualizarTarjetaDto extends PartialType(CrearTarjetaDto) {}

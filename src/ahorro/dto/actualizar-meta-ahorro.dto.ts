import { PartialType } from '@nestjs/swagger';
import { CrearMetaAhorroDto } from './crear-meta-ahorro.dto.js';

/**
 * Los mismos campos y reglas que al crear, todos opcionales. Que llegue al menos uno, que ninguno sea null y que un
 * cambio de tipo traiga su valor lo comprueba el servicio.
 */
export class ActualizarMetaAhorroDto extends PartialType(CrearMetaAhorroDto) {}

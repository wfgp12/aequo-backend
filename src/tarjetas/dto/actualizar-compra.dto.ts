import { PartialType } from '@nestjs/swagger';
import { CrearCompraDto } from './crear-compra.dto.js';

/**
 * Los mismos campos y reglas que al crear una compra, todos opcionales. Que llegue al menos uno y que ninguno sea null
 * lo comprueba el servicio, igual que que `categoriaId` solo se edite en compras. `tarjetaId`, `tipo`, la tasa y la
 * bandera no son editables.
 */
export class ActualizarCompraDto extends PartialType(CrearCompraDto) {}

import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import { ErrorPagoNoEncontradoDto, ErrorTarjetaNoEncontradaDto } from '../common/dto/error-respuesta.dto.js';
import { ApiZonaHoraria, ZonaHoraria } from '../common/zona-horaria.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { CrearPagoDto } from './dto/crear-pago.dto.js';
import { ListarPagosQueryDto } from './dto/listar-pagos-query.dto.js';
import { PagoRegistradoRespuestaDto, PagoRespuestaDto } from './dto/pago-respuesta.dto.js';
import { IdPagoParamDto, TarjetaIdParamDto } from './dto/parametros.dto.js';
import { PagosService } from './pagos.service.js';
import { RespuestaInvalida, RespuestaLista, RespuestasComunes } from './respuestas-api.js';

const TARJETA_NO_ENCONTRADA = {
  type: ErrorTarjetaNoEncontradaDto,
  description: 'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`).',
};

@ApiTags('tarjetas')
@ApiBearerAuth()
@Controller('tarjetas/:tarjetaId/pagos')
export class PagosController {
  constructor(@Inject(PagosService) private readonly pagos: PagosService) {}

  @Post()
  @Idempotente()
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Registrar el pago de una tarjeta y compararlo con el total estimado del mes',
    description: `
Registra un pago de una tarjeta propia (RF-32, CU-18) y devuelve cuánto falta o sobra frente al total estimado del mes. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Qué se guarda**
- Un pago **es un egreso**: se guarda como una transacción del usuario de \`tipo\` \`EGRESO\`, \`clasificacionFlujo\` \`PAGO_TARJETA\`, el \`tarjetaId\` de la ruta y **sin categoría** (\`categoriaId\` \`null\`). El \`id\` de la respuesta es el de esa transacción. No hay colección aparte y la tarjeta, sus compras y sus cargos no cambian.
- **Efecto en los reportes (ADR-014):** el pago afecta el **balance del mes de su \`fecha\`** (\`pagosTarjeta\` en \`GET /reportes/periodo\`) y **no** aparece en el gasto por categoría, para no contar dos veces la compra. Una **compra con tarjeta no es un pago** ni mueve el balance el día de la compra: lo mueve este pago. Se ve en \`GET /transacciones\`, pero solo se gestiona desde la tarjeta (en \`/transacciones\` responde \`409\`).

**Body:** \`valor\` obligatorio; \`fecha\`, \`metodoPago\` y \`descripcion\` opcionales. El tipo, la clasificación y la tarjeta los fija el servidor: enviarlos (o \`usuarioId\`, \`categoriaId\`, \`comparacion\`…) responde \`400\`, y \`null\` en un campo opcional también.
- \`valor\`: pesos colombianos, mayor que cero, **con máximo 2 decimales** (es dinero que salió de verdad) y a lo sumo \`999999999999\`.
- \`fecha\`: \`YYYY-MM-DD\` real, pasada o futura. Sin ella es **hoy** en la zona del header opcional \`X-Zona-Horaria\` (UTC sin el header; un nombre inválido responde \`400\` siempre). Se guarda a las 00:00 UTC.
- \`metodoPago\`: \`EFECTIVO\`, \`DEBITO\` o \`TRANSFERENCIA\`; sin él es \`TRANSFERENCIA\`. \`TARJETA_CREDITO\` no se acepta: no se paga una tarjeta con otra tarjeta de crédito.
- \`descripcion\`: de 1 a 200 caracteres (se recortan los espacios); sin ella es \`Pago de tarjeta\`.

**La \`comparacion\` de la respuesta**
- \`mes\`: el mes de la **\`fecha\` del pago** (no el mes actual).
- \`estimado\`: el total estimado de la tarjeta para ese mes (cuotas vigentes más cargos fijos activos): el mismo \`total\` de \`GET /tarjetas/:tarjetaId/proyeccion\`.
- \`pagado\`: la suma de **todos** los pagos de **esta** tarjeta cuya fecha cae en ese mes, con el nuevo incluido. No cuentan los avances, las compras, los abonos ni los pagos de otras tarjetas.
- \`diferencia\` = \`pagado − estimado\`: **negativa** falta por pagar, **positiva** se pagó de más, \`0\` es exacto. Los montos llegan **sin redondear** (RNF-11): pagar el estimado redondeado al peso deja una diferencia mínima, no cero.

**Reglas a tener en cuenta**
- Se puede pagar menos o más que el estimado, en partes (varios pagos en el mes se suman), en un mes sin estimado (tarjeta vacía) o con fecha pasada o futura. El pago **no descuenta el \`saldoPendiente\`** ni se asigna a una cuota concreta.
- Un pago equivocado no se edita: se elimina con \`DELETE /tarjetas/:tarjetaId/pagos/:id\` y se registra de nuevo.
- **Orden de las comprobaciones:** sesión (\`401\`), formato de \`tarjetaId\`, del body y de \`X-Zona-Horaria\` (\`400\`) y, por último, la tarjeta (\`404\`, igual para una ajena o inexistente, nunca \`403\`): un body inválido no revela si la tarjeta existe.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; con la misma clave se devuelve la respuesta de la primera vez con \`Idempotent-Replayed: true\` y no se crea otra transacción. Dos pagos iguales con claves distintas son legítimos (dos pagos parciales del mismo valor).
- La escritura es una sola: si falla, responde \`500\`, no queda nada y la misma clave se puede reintentar.
`.trim(),
  })
  @ApiCreatedResponse({
    type: PagoRegistradoRespuestaDto,
    description: 'Pago registrado, con la comparación del mes de su fecha ya incluyéndolo.',
  })
  @RespuestaInvalida(
    '`tarjetaId` no es válido, falta `valor` o no es un número mayor que cero con máximo 2 decimales y a lo sumo 999999999999, `fecha` no es `YYYY-MM-DD` real, `metodoPago` no es `EFECTIVO`, `DEBITO` ni `TRANSFERENCIA`, `descripcion` está vacía o pasa de 200 caracteres, algún campo opcional es `null`, `X-Zona-Horaria` no es una zona IANA válida o se envió un campo desconocido. `message` es un arreglo y no se guarda nada.',
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(TARJETA_NO_ENCONTRADA)
  registrar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Body() dto: CrearPagoDto,
    @ZonaHoraria() zona: string,
  ): Promise<PagoRegistradoRespuestaDto> {
    return this.pagos.registrar(usuarioId, tarjetaId, dto, zona);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar los pagos de una tarjeta',
    description: `
Devuelve los pagos registrados de una tarjeta propia (RF-32). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Sirve para que el cliente conozca los ids de los pagos y pueda eliminar uno equivocado.

**Reglas a tener en cuenta**
- Solo trae los pagos de **esta** tarjeta (transacciones \`PAGO_TARJETA\` con su \`tarjetaId\`): no incluye avances, compras, egresos ordinarios, abonos ni pagos de otras tarjetas.
- Orden: por \`fecha\` descendente y, a igual fecha, el registrado más recientemente primero.
- Filtro opcional \`mes\` (\`YYYY-MM\`, el mes de la **fecha del pago**). Un \`mes\` inválido o repetido, o cualquier otro parámetro, responde \`400\`.
- Cada pago es el mismo objeto que devuelve el registro, **sin** \`comparacion\`: el estimado depende de datos que cambian. Para ver lo pagado frente al total de un mes usa \`GET /tarjetas/:tarjetaId/proyeccion\`.
- No hay paginación. Sin pagos responde \`{ "items": [] }\`, no \`404\`; una tarjeta ajena o inexistente responde \`404\`.
- Es una lectura sin efectos: no guarda nada y no lleva \`Idempotency-Key\`.
`.trim(),
  })
  @RespuestaLista(PagoRespuestaDto, 'Objeto con la lista de pagos en `items`, el más reciente primero.')
  @RespuestaInvalida(
    '`tarjetaId` no es válido, `mes` no es `YYYY-MM` o está repetido, o se envió un parámetro desconocido. `message` es un arreglo.',
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(TARJETA_NO_ENCONTRADA)
  async listar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Query() consulta: ListarPagosQueryDto,
  ): Promise<{ items: PagoRespuestaDto[] }> {
    return { items: await this.pagos.listar(usuarioId, tarjetaId, consulta) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un pago de una tarjeta',
    description: `
Elimina un pago propio de una tarjeta (RF-32). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. El borrado es inmediato y permanente: así se corrige un pago equivocado (se elimina y se registra de nuevo; los pagos no se editan).

**Reglas a tener en cuenta**
- Se borra la transacción del pago y solo esa: el balance del mes vuelve a su valor anterior y \`pagado\` baja en la proyección. Las compras, avances y cargos de la tarjeta no se tocan.
- Si la tarjeta no existe o es de otro usuario, responde \`404\` \`Tarjeta no encontrada\`. Si el pago no existe, es de otro usuario, es de otra tarjeta o el id es de una transacción que no es un pago de esta tarjeta (un avance, un egreso ordinario), responde \`404\` \`Pago no encontrado\` y no se toca nada. Repetir la petición cuando ya se eliminó responde \`404\`.
- Con pagos registrados una tarjeta no se puede eliminar (\`409\` en \`DELETE /tarjetas/:id\`): primero se eliminan sus pagos con esta ruta.
- Los pagos no se pueden eliminar desde \`/transacciones\` (responde \`409\`).
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Pago eliminado. Sin cuerpo.' })
  @RespuestaInvalida('`tarjetaId` o `id` no son ids válidos. `message` es un arreglo.')
  @RespuestasComunes()
  @ApiNotFoundResponse({
    type: ErrorPagoNoEncontradoDto,
    description:
      'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`), o el pago no existe, es de otro usuario, es de otra tarjeta o no es un pago de tarjeta (`Pago no encontrado`).',
  })
  eliminar(@UsuarioActual() usuarioId: string, @Param() { tarjetaId, id }: IdPagoParamDto): Promise<void> {
    return this.pagos.eliminar(usuarioId, tarjetaId, id);
  }
}

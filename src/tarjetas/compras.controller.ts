import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import { ErrorCompraNoEncontradaDto, ErrorTarjetaNoEncontradaDto } from '../common/dto/error-respuesta.dto.js';
import { ApiZonaHoraria, ZonaHoraria } from '../common/zona-horaria.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { ComprasService } from './compras.service.js';
import { ActualizarCompraDto } from './dto/actualizar-compra.dto.js';
import { CompraRespuestaDto } from './dto/compra-respuesta.dto.js';
import { CrearAvanceDto } from './dto/crear-avance.dto.js';
import { CrearCompraDto } from './dto/crear-compra.dto.js';
import { ListarComprasQueryDto } from './dto/listar-compras-query.dto.js';
import { IdCompraParamDto, TarjetaIdParamDto } from './dto/parametros.dto.js';
import { VistaPreviaCuotaQueryDto } from './dto/vista-previa-cuota-query.dto.js';
import { VistaPreviaCuotaRespuestaDto } from './dto/vista-previa-cuota-respuesta.dto.js';
import { RespuestaInvalida, RespuestaLista, RespuestasComunes } from './respuestas-api.js';

const NO_ENCONTRADA = {
  type: ErrorCompraNoEncontradaDto,
  description:
    'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`); la compra no existe, es de otro usuario o es de otra tarjeta (`Compra no encontrada`); o la categoría enviada no existe o es de otro usuario (`Categoría no encontrada`).',
};
const NO_ENCONTRADA_SIN_CATEGORIA = {
  ...NO_ENCONTRADA,
  description:
    'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`), o la compra no existe, es de otro usuario o es de otra tarjeta (`Compra no encontrada`).',
};
const IDS_INVALIDOS = '`tarjetaId` o `id` no son ids válidos. `message` es un arreglo.';
const CAMPOS_DE_LA_COMPRA =
  '`descripcion` vacía o de más de 200 caracteres, `valor` que no es un número mayor que cero, `cuotas` que no es un entero de 1 a 60, `primerPago` que no es `YYYY-MM` ni una fecha real, `fecha` que no es `YYYY-MM-DD` real';

@ApiTags('tarjetas')
@ApiBearerAuth()
@Controller('tarjetas/:tarjetaId')
export class ComprasController {
  constructor(@Inject(ComprasService) private readonly compras: ComprasService) {}

  @Post('compras')
  @Idempotente()
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Registrar una compra a cuotas con la tarjeta',
    description: `
Registra una compra a cuotas en una tarjeta propia (RF-26). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- **Una compra con tarjeta no es una transacción** (ADR-014): no cambia el balance ni los reportes de ingresos y egresos el día de la compra; lo afecta el pago de la tarjeta.
- Body: \`descripcion\`, \`categoriaId\`, \`valor\`, \`cuotas\` y \`primerPago\` obligatorios, y \`fecha\` opcional. La tarjeta sale de la ruta y el dueño del JWT; \`usuarioId\`, \`tarjetaId\`, \`tipo\`, \`tasaEAAplicada\`, \`cuotaUnicaSinInteres\` o cualquier otro campo responde \`400\`.
- \`valor\` son pesos colombianos, mayor que cero, con decimales y sin redondear. \`cuotas\` es un entero de 1 a 60. \`primerPago\` es \`YYYY-MM\` o una fecha real \`YYYY-MM-DD\` de la que se toma el mes (se guarda el día 1); puede ser anterior, igual o posterior al mes de la compra.
- \`fecha\` es un día \`YYYY-MM-DD\`, pasado o futuro. Sin ella la compra es de **hoy** en la zona del header opcional \`X-Zona-Horaria\` (UTC sin el header; un nombre inválido responde \`400\`). La compra cuenta en el gasto por categoría del mes de su \`fecha\`.
- **La compra copia la tasa y la bandera de la tarjeta** (\`tasaEAAplicada\`, \`cuotaUnicaSinInteres\`) al registrarse; cambiar después la tarjeta no recalcula las compras anteriores (RF-25).
- **\`cuota\` y \`mesUltimoPago\` se calculan al responder y no se guardan** (RF-27): \`cuota = V·i / (1 − (1 + i)^(−n))\` con \`i = (1 + EA)^(1/12) − 1\`, o \`V / n\` si la tasa es 0 o si es una sola cuota en una tarjeta con \`cuotaUnicaSinInteres\`. Llegan sin redondear.
- **Categoría:** debe existir y ser general o del usuario (si no, \`404\` \`Categoría no encontrada\`) y ser de egresos (si es de ingresos, \`400\` con un mensaje que empieza por \`categoriaId\`).
- Una tarjeta ajena o inexistente responde \`404\` y no se guarda nada. Se validan primero los datos (\`400\`), luego la tarjeta y luego la categoría.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; con la misma clave se devuelve la respuesta de la primera vez con \`Idempotent-Replayed: true\`. Dos compras iguales con claves distintas son legítimas.
`.trim(),
  })
  @ApiCreatedResponse({
    type: CompraRespuestaDto,
    description: 'Compra registrada, con su cuota y su mes del último pago.',
  })
  @RespuestaInvalida(
    `\`tarjetaId\` no es válido, falta un campo obligatorio, ${CAMPOS_DE_LA_COMPRA}, \`categoriaId\` no es un id válido o es una categoría de ingresos, \`X-Zona-Horaria\` no es una zona IANA válida o se envió un campo desconocido. \`message\` es un arreglo y no se guarda nada.`,
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA)
  registrarCompra(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Body() dto: CrearCompraDto,
    @ZonaHoraria() zona: string,
  ): Promise<CompraRespuestaDto> {
    return this.compras.registrarCompra(usuarioId, tarjetaId, dto, zona);
  }

  @Post('avances')
  @Idempotente()
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Registrar un avance en efectivo con la tarjeta',
    description: `
Registra un avance en efectivo en una tarjeta propia (RF-28, CU-15). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Crea dos cosas a la vez: la **compra diferida a cuotas** (\`tipo\` \`AVANCE\`) y una **transacción de dinero recibido**.

**Reglas a tener en cuenta**
- Body: \`valor\`, \`cuotas\` y \`primerPago\` obligatorios; \`fecha\` y \`descripcion\` opcionales. Con las mismas reglas que en una compra (\`valor\` mayor que cero, \`cuotas\` de 1 a 60, \`primerPago\` \`YYYY-MM\` o fecha real, \`fecha\` \`YYYY-MM-DD\` o, sin ella, hoy en la zona de \`X-Zona-Horaria\`).
- \`descripcion\` opcional: sin ella es \`Avance en efectivo\`. **No lleva \`categoriaId\`**: la categoría es siempre la general de respaldo de egresos y enviar \`categoriaId\` (o \`tipo\`, \`tarjetaId\`, \`tasaEAAplicada\`…) responde \`400\`.
- **La transacción** es del usuario, de \`tipo\` \`INGRESO\`, con \`monto\` = \`valor\`, la misma \`fecha\` y \`descripcion\`, \`metodoPago\` \`EFECTIVO\`, \`clasificacionFlujo\` \`DINERO_RECIBIDO\` y el \`tarjetaId\` de la tarjeta. Es **dinero recibido, no ingreso propio**: aparece en \`dineroRecibido\` de \`GET /reportes/periodo\` y no suma a \`ingresos\` ni al balance (ADR-014). Se ve en \`GET /transacciones\`, pero solo se edita o elimina desde la tarjeta (en \`/transacciones\` responde \`409\`).
- Las cuotas del avance cuentan igual que las de una compra: copia la tasa y la bandera de la tarjeta, y \`cuota\` y \`mesUltimoPago\` se calculan al responder.
- **Todo o nada:** si falla el guardado de una de las dos partes no queda ninguna, responde \`500\` y la misma \`Idempotency-Key\` se puede reintentar.
- Una tarjeta ajena o inexistente responde \`404\` y no se guarda nada.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; con la misma clave se devuelve la respuesta de la primera vez con \`Idempotent-Replayed: true\` y no se crea una segunda transacción.
`.trim(),
  })
  @ApiCreatedResponse({
    type: CompraRespuestaDto,
    description: 'Avance registrado: la compra de `tipo` `AVANCE`, con su cuota y su mes del último pago.',
  })
  @RespuestaInvalida(
    `\`tarjetaId\` no es válido, falta un campo obligatorio, ${CAMPOS_DE_LA_COMPRA}, \`X-Zona-Horaria\` no es una zona IANA válida o se envió un campo desconocido (como \`categoriaId\`). \`message\` es un arreglo y no se guarda nada.`,
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA_SIN_CATEGORIA)
  registrarAvance(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Body() dto: CrearAvanceDto,
    @ZonaHoraria() zona: string,
  ): Promise<CompraRespuestaDto> {
    return this.compras.registrarAvance(usuarioId, tarjetaId, dto, zona);
  }

  @Get('compras')
  @ApiOperation({
    summary: 'Listar las compras y avances de una tarjeta',
    description: `
Devuelve las compras a cuotas y los avances de una tarjeta propia, con su cuota y su mes del último pago. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- Orden: por \`fecha\` descendente y, a igual fecha, la registrada más recientemente primero.
- Filtros opcionales: \`tipo\` (\`COMPRA\` o \`AVANCE\`) y \`mes\` (\`YYYY-MM\`, el mes de la **fecha de la compra**, no el del primer pago). Un valor inválido o un parámetro desconocido responde \`400\`.
- Cada compra trae la \`cuota\` calculada con **su propia** tasa (\`tasaEAAplicada\`), sin redondear.
- No hay paginación. Una tarjeta sin compras responde \`{ "items": [] }\`; una tarjeta ajena o inexistente responde \`404\`.
`.trim(),
  })
  @RespuestaLista(CompraRespuestaDto, 'Objeto con la lista de compras y avances en `items`, la más reciente primero.')
  @RespuestaInvalida(
    '`tarjetaId` no es válido, `tipo` no es `COMPRA` ni `AVANCE`, `mes` no es `YYYY-MM` o se envió un parámetro desconocido. `message` es un arreglo.',
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA_SIN_CATEGORIA)
  async listar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Query() consulta: ListarComprasQueryDto,
  ): Promise<{ items: CompraRespuestaDto[] }> {
    return { items: await this.compras.listar(usuarioId, tarjetaId, consulta) };
  }

  @Get('cuota')
  @ApiOperation({
    summary: 'Vista previa de la cuota de una compra o avance antes de guardar',
    description: `
Calcula la cuota estimada y el mes del último pago de una compra o un avance que el usuario **todavía no guardó** (RF-27, CU-14 y CU-15), para mostrarlos en el resumen previo. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- **Es una vista previa sin efectos:** no guarda compra, avance ni transacción, no cambia nada en la base y se puede repetir con cada cambio del formulario. No lleva \`Idempotency-Key\` ni \`X-Zona-Horaria\`; si llegan, se ignoran.
- **Usa la tasa y la bandera actuales de la tarjeta**, las mismas que copiarán \`POST …/compras\` y \`POST …/avances\` al guardar (la respuesta las devuelve en \`tasaEAAplicada\` y \`cuotaUnicaSinInteres\`). El cliente no elige la tasa: \`tasaEA\`, \`tasaEAAplicada\` o \`cuotaUnicaSinInteres\` en la query responden \`400\`. Cambiar la tasa de la tarjeta después no recalcula las compras ya guardadas.
- **Fórmula:** \`i = (1 + EA)^(1/12) − 1\` y \`cuota = V·i / (1 − (1 + i)^(−n))\`; es \`V / n\` si la tasa es 0 o si es una sola cuota en una tarjeta con \`cuotaUnicaSinInteres\`. La \`cuota\` llega **sin redondear** (RNF-11) y \`mesUltimoPago\` es \`YYYY-MM\`: el mes de \`primerPago\` más \`cuotas − 1\` meses.
- **Query, los tres obligatorios:** \`valor\` es un decimal con punto (\`1254700\`, \`100.5\`), finito y mayor que cero; \`cuotas\` es un entero de 1 a 60; \`primerPago\` es \`YYYY-MM\` o una fecha real \`YYYY-MM-DD\` (solo se toma el mes, sin restricción respecto de hoy). No se aceptan comas, signos, notación científica ni parámetros repetidos, y cualquier otro parámetro responde \`400\`.
- **Orden de las comprobaciones:** sesión (\`401\`), formato del id y de la query (\`400\`) y, por último, la tarjeta (\`404\`): una consulta inválida no revela si la tarjeta existe.
- Una tarjeta ajena o inexistente responde \`404\` con el mismo mensaje, nunca \`403\`.
`.trim(),
  })
  @ApiOkResponse({
    type: VistaPreviaCuotaRespuestaDto,
    description: 'La cuota estimada, el mes del último pago y la tasa y la bandera actuales de la tarjeta.',
  })
  @RespuestaInvalida(
    '`tarjetaId` no es válido, falta `valor`, `cuotas` o `primerPago`, alguno es inválido o está repetido, o se envió un parámetro desconocido. `message` es un arreglo con un texto por problema que empieza por el nombre del parámetro.',
  )
  @RespuestasComunes()
  @ApiNotFoundResponse({
    type: ErrorTarjetaNoEncontradaDto,
    description: 'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`).',
  })
  vistaPrevia(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Query() consulta: VistaPreviaCuotaQueryDto,
  ): Promise<VistaPreviaCuotaRespuestaDto> {
    return this.compras.vistaPrevia(usuarioId, tarjetaId, consulta);
  }

  @Get('compras/:id')
  @ApiOperation({
    summary: 'Consultar una compra o un avance',
    description: `
Devuelve una compra o un avance de una tarjeta propia, con su cuota y su mes del último pago. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Si no existe, es de otro usuario o es de otra tarjeta que la de la ruta, responde \`404\` con el mismo mensaje.
`.trim(),
  })
  @ApiOkResponse({ type: CompraRespuestaDto, description: 'La compra o el avance pedido.' })
  @RespuestaInvalida(IDS_INVALIDOS)
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA_SIN_CATEGORIA)
  obtener(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId, id }: IdCompraParamDto,
  ): Promise<CompraRespuestaDto> {
    return this.compras.obtener(usuarioId, tarjetaId, id);
  }

  @Patch('compras/:id')
  @ApiOperation({
    summary: 'Editar una compra o un avance',
    description: `
Modifica una compra o un avance propio (RF-33). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- Campos opcionales \`descripcion\`, \`categoriaId\`, \`valor\`, \`cuotas\`, \`primerPago\` y \`fecha\`, con las mismas reglas que al registrar; **al menos uno**, ninguno puede ser \`null\` y uno desconocido (\`tarjetaId\`, \`tipo\`, \`tasaEAAplicada\`, \`cuotaUnicaSinInteres\`, \`cuota\`, \`mesUltimoPago\`…) responde \`400\`. Para mover una compra de tarjeta se elimina y se registra otra.
- **Editar nunca vuelve a copiar la tasa ni la bandera de la tarjeta** (ADR-014): la \`cuota\` y el \`mesUltimoPago\` se recalculan con los datos nuevos y la tasa que la compra ya tenía.
- **Avances:** \`categoriaId\` no se edita (\`400\`). Cambiar \`descripcion\`, \`valor\` o \`fecha\` actualiza también su transacción de dinero recibido (\`monto\`, \`fecha\` y \`descripcion\`); cambiar solo \`cuotas\` o \`primerPago\` no la toca. Si falla el guardado de una de las dos partes no cambia ninguna y responde \`500\`.
- \`categoriaId\` en una compra: debe existir y ser general o del usuario (\`404\` \`Categoría no encontrada\`) y de egresos (\`400\`).
- Si la tarjeta o la compra no existen, son de otro usuario o la compra es de otra tarjeta, responde \`404\`.
- Repetir la misma edición es inofensivo.
`.trim(),
  })
  @ApiOkResponse({ type: CompraRespuestaDto, description: 'La compra o el avance completo, ya actualizado.' })
  @RespuestaInvalida(
    `Un id no es válido, no se envió ningún campo, algún campo es inválido o es null (${CAMPOS_DE_LA_COMPRA}), \`categoriaId\` no es un id válido, es una categoría de ingresos o se envió en un avance, o se envió un campo desconocido. \`message\` es un arreglo y no se cambia nada.`,
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA)
  actualizar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId, id }: IdCompraParamDto,
    @Body() dto: ActualizarCompraDto,
  ): Promise<CompraRespuestaDto> {
    return this.compras.actualizar(usuarioId, tarjetaId, id, dto);
  }

  @Delete('compras/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una compra o un avance',
    description: `
Elimina una compra o un avance propio (RF-33). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. El borrado es inmediato y permanente.

**Reglas a tener en cuenta**
- Eliminar un **avance** elimina también su transacción de dinero recibido, y solo esa. Si falla una de las dos partes no se borra ninguna y responde \`500\`.
- Si la tarjeta o la compra no existen, son de otro usuario o la compra es de otra tarjeta, responde \`404\` (también al repetir la petición cuando ya se eliminó).
- Una tarjeta con compras o avances no se puede eliminar (\`409\` en \`DELETE /tarjetas/:id\`): primero se eliminan sus compras.
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Compra o avance eliminado. Sin cuerpo.' })
  @RespuestaInvalida(IDS_INVALIDOS)
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA_SIN_CATEGORIA)
  eliminar(@UsuarioActual() usuarioId: string, @Param() { tarjetaId, id }: IdCompraParamDto): Promise<void> {
    return this.compras.eliminar(usuarioId, tarjetaId, id);
  }
}

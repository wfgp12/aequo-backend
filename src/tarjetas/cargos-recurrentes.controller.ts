import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import { ErrorCargoNoEncontradoDto, ErrorValidacionDto } from '../common/dto/error-respuesta.dto.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { ActualizarCargoDto } from './dto/actualizar-cargo.dto.js';
import { CargoRespuestaDto } from './dto/cargo-respuesta.dto.js';
import { CrearCargoDto } from './dto/crear-cargo.dto.js';
import { ListarCargosQueryDto } from './dto/listar-cargos-query.dto.js';
import { IdCargoParamDto, TarjetaIdParamDto } from './dto/parametros.dto.js';
import { INTERNO, SESION } from './tarjetas.controller.js';
import { TarjetasService } from './tarjetas.service.js';

const NO_ENCONTRADO = {
  type: ErrorCargoNoEncontradoDto,
  description:
    'La tarjeta de la ruta no existe o es de otro usuario (`Tarjeta no encontrada`), o el cargo no existe, es de otro usuario o es de otra tarjeta (`Cargo fijo no encontrado`).',
};
const IDS_INVALIDOS = {
  type: ErrorValidacionDto,
  description: '`tarjetaId` o `id` no son ids válidos. `message` es un arreglo.',
};

@ApiTags('tarjetas')
@ApiBearerAuth()
@Controller('tarjetas/:tarjetaId/cargos')
export class CargosRecurrentesController {
  constructor(@Inject(TarjetasService) private readonly tarjetas: TarjetasService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar los cargos fijos de una tarjeta',
    description: `
Devuelve los cargos fijos mensuales (suscripciones, seguros, cuota de manejo) de una tarjeta propia, en el orden en que se fueron agregando. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- Filtro opcional \`activo=true|false\`; sin él, todos. Un \`activo\` distinto de esos dos valores o un parámetro desconocido responde \`400\`.
- No hay paginación. Una tarjeta sin cargos responde \`{ "items": [] }\`; una tarjeta ajena o inexistente responde \`404\`, no una lista vacía.
`.trim(),
  })
  @ApiOkResponse({
    description: 'Objeto con la lista de cargos en `items`, del más antiguo al más reciente.',
    schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { $ref: '#/components/schemas/CargoRespuestaDto' } } },
      required: ['items'],
    },
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description: '`tarjetaId` no es válido, `activo` no es `true` ni `false` o se envió un parámetro desconocido.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiInternalServerErrorResponse(INTERNO)
  async listar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Query() consulta: ListarCargosQueryDto,
  ): Promise<{ items: CargoRespuestaDto[] }> {
    return { items: await this.tarjetas.listarCargos(usuarioId, tarjetaId, consulta) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar un cargo fijo',
    description: `
Devuelve un cargo fijo de una tarjeta propia. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Si el cargo no existe, es de otro usuario o es de otra tarjeta que la de la ruta, responde \`404\` con el mismo mensaje.
`.trim(),
  })
  @ApiOkResponse({ type: CargoRespuestaDto, description: 'El cargo fijo pedido.' })
  @ApiBadRequestResponse(IDS_INVALIDOS)
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiInternalServerErrorResponse(INTERNO)
  obtener(@UsuarioActual() usuarioId: string, @Param() { tarjetaId, id }: IdCargoParamDto): Promise<CargoRespuestaDto> {
    return this.tarjetas.obtenerCargo(usuarioId, tarjetaId, id);
  }

  @Post()
  @Idempotente()
  @ApiOperation({
    summary: 'Registrar un cargo fijo en una tarjeta',
    description: `
Crea un cargo fijo mensual en una tarjeta propia. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- La tarjeta sale de la ruta y el dueño del JWT: el body lleva solo \`descripcion\`, \`valor\` y \`activo\`; \`tarjetaId\`, \`usuarioId\` o cualquier otro campo responde \`400\`.
- \`valor\` son pesos colombianos, mayor que cero y sin tope, sin redondear. \`activo\` es opcional y vale \`true\`.
- Se pueden repetir cargos iguales en una tarjeta (no se deduplica por contenido).
- Una tarjeta ajena o inexistente responde \`404\` y no se crea nada.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; con la misma clave se devuelve la respuesta de la primera vez con \`Idempotent-Replayed: true\`.
`.trim(),
  })
  @ApiCreatedResponse({ type: CargoRespuestaDto, description: 'Cargo fijo creado, tal como quedó guardado.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`tarjetaId` no es válido, falta un campo obligatorio, `descripcion` está vacía o pasa de 100 caracteres, `valor` no es un número positivo, `activo` no es lógico o se envió un campo desconocido. `message` es un arreglo y no se guarda nada.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiInternalServerErrorResponse(INTERNO)
  crear(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId }: TarjetaIdParamDto,
    @Body() dto: CrearCargoDto,
  ): Promise<CargoRespuestaDto> {
    return this.tarjetas.crearCargo(usuarioId, tarjetaId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar, activar o desactivar un cargo fijo',
    description: `
Modifica un cargo fijo propio: su descripción, su valor o su estado. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. **Activar o desactivar es enviar \`activo\`** (\`true\`/\`false\`); no hay rutas aparte ni hace falta enviar otros campos.

**Reglas a tener en cuenta**
- Campos opcionales \`descripcion\`, \`valor\` y \`activo\`, con las mismas reglas que al crear; **al menos uno**, ninguno puede ser \`null\` y uno desconocido responde \`400\`. \`tarjetaId\` no se puede cambiar: un cargo no se mueve de tarjeta (se elimina y se crea otro).
- Un cargo inactivo se conserva y aparece en la lista, pero deja de sumarse al total del mes de la tarjeta.
- Si el cargo no existe, es de otro usuario o de otra tarjeta que la de la ruta, responde \`404\`.
- Repetir la misma edición es inofensivo.
`.trim(),
  })
  @ApiOkResponse({ type: CargoRespuestaDto, description: 'El cargo completo, ya actualizado.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'Un id no es válido, no se envió ningún campo, algún campo es inválido o es null, o se envió un campo desconocido (como `tarjetaId`). `message` es un arreglo y no se cambia nada.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiInternalServerErrorResponse(INTERNO)
  actualizar(
    @UsuarioActual() usuarioId: string,
    @Param() { tarjetaId, id }: IdCargoParamDto,
    @Body() dto: ActualizarCargoDto,
  ): Promise<CargoRespuestaDto> {
    return this.tarjetas.actualizarCargo(usuarioId, tarjetaId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un cargo fijo',
    description: `
Elimina un cargo fijo propio, activo o inactivo. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. El borrado es inmediato y permanente; para dejar de cobrarlo sin perderlo se desactiva con \`PATCH\`.

Si el cargo no existe, es de otro usuario o de otra tarjeta que la de la ruta, responde \`404\` (también al repetir la petición cuando ya se eliminó).
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Cargo eliminado. Sin cuerpo.' })
  @ApiBadRequestResponse(IDS_INVALIDOS)
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiInternalServerErrorResponse(INTERNO)
  eliminar(@UsuarioActual() usuarioId: string, @Param() { tarjetaId, id }: IdCargoParamDto): Promise<void> {
    return this.tarjetas.eliminarCargo(usuarioId, tarjetaId, id);
  }
}

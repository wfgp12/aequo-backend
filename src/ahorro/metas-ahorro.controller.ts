import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import {
  ErrorConflictoDto,
  ErrorInternoDto,
  ErrorMetaNoEncontradaDto,
  ErrorSesionInvalidaDto,
  ErrorValidacionDto,
} from '../common/dto/error-respuesta.dto.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { ActualizarMetaAhorroDto } from './dto/actualizar-meta-ahorro.dto.js';
import { CrearMetaAhorroDto } from './dto/crear-meta-ahorro.dto.js';
import { IdMetaAhorroParamDto } from './dto/id-meta-ahorro-param.dto.js';
import { ListarMetasAhorroQueryDto } from './dto/listar-metas-ahorro-query.dto.js';
import { MetaAhorroRespuestaDto } from './dto/meta-ahorro-respuesta.dto.js';
import { MetasAhorroService } from './metas-ahorro.service.js';

const SESION = {
  type: ErrorSesionInvalidaDto,
  description: 'Falta el token, es inválido, está vencido o manipulado. No se cambia nada.',
};
const INTERNO = {
  type: ErrorInternoDto,
  description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
};
const NO_ENCONTRADA = { type: ErrorMetaNoEncontradaDto, description: 'La meta no existe o es de otro usuario.' };

@ApiTags('ahorro')
@ApiBearerAuth()
@Controller('ahorro/metas')
export class MetasAhorroController {
  constructor(@Inject(MetasAhorroService) private readonly metas: MetasAhorroService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar las metas de ahorro',
    description: `
Devuelve las metas de ahorro mensuales del usuario dueño de la sesión, de la más reciente a la más antigua. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo se ven las metas propias.

**Reglas a tener en cuenta**
- Cada mes tiene su propia meta (una por usuario y mes); el resultado es un historial de metas, no una meta única.
- Filtros opcionales \`desde\` y \`hasta\` (\`YYYY-MM\`, ambos **incluidos**). \`desde\` no puede ser posterior a \`hasta\`. Un parámetro desconocido responde \`400\`.
- No hay paginación: un usuario tiene como mucho una meta por mes. Sin metas la respuesta es \`{ "items": [] }\`, no \`404\`.
`.trim(),
  })
  @ApiOkResponse({
    description: 'Objeto con la lista de metas en `items`, ordenadas por periodo descendente.',
    schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { $ref: '#/components/schemas/MetaAhorroRespuestaDto' } } },
      required: ['items'],
    },
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`desde` o `hasta` no tienen el formato YYYY-MM, `desde` es posterior a `hasta` o se envió un parámetro desconocido. `message` es un arreglo.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiInternalServerErrorResponse(INTERNO)
  async listar(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: ListarMetasAhorroQueryDto,
  ): Promise<{ items: MetaAhorroRespuestaDto[] }> {
    return { items: await this.metas.listar(usuarioId, consulta) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar una meta de ahorro',
    description: `
Devuelve una meta de ahorro propia por su id. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje, para no revelar qué ids existen.
`.trim(),
  })
  @ApiOkResponse({ type: MetaAhorroRespuestaDto, description: 'La meta de ahorro pedida.' })
  @ApiBadRequestResponse({ type: ErrorValidacionDto, description: 'El id no es un id válido. `message` es un arreglo.' })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADA)
  @ApiInternalServerErrorResponse(INTERNO)
  obtener(@UsuarioActual() usuarioId: string, @Param() { id }: IdMetaAhorroParamDto): Promise<MetaAhorroRespuestaDto> {
    return this.metas.obtener(usuarioId, id);
  }

  @Post()
  @Idempotente()
  @ApiOperation({
    summary: 'Definir la meta de ahorro de un mes',
    description: `
Crea la meta de ahorro de un mes para el usuario dueño de la sesión. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- La meta queda a nombre del usuario del JWT. El body no lleva ningún id de usuario y debe contener solo los campos documentados; uno de más responde \`400\`.
- \`tipoMeta\` es \`PORCENTAJE\` (del ingreso propio del mes; \`valorObjetivo\` mayor que 0 y hasta 100) o \`MONTO_FIJO\` (pesos colombianos, sin tope). El valor no se redondea.
- \`periodo\` es el mes: \`YYYY-MM\`, o una fecha real \`YYYY-MM-DD\` sin hora de la que se toma solo el mes. Siempre se devuelve como \`YYYY-MM\`.
- **Una meta por usuario y mes:** si ya existe una para ese mes responde \`409\`, incluso con dos peticiones simultáneas. Para cambiarla se usa \`PATCH\`.
- \`ahorroReal\` es opcional: el ahorro efectivo del mes en pesos (puede ser negativo). Vale 0 si no se envía.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; si la petición se repite con la misma clave se devuelve la misma respuesta de la primera vez con \`Idempotent-Replayed: true\`.
`.trim(),
  })
  @ApiCreatedResponse({ type: MetaAhorroRespuestaDto, description: 'Meta creada, tal como quedó guardada.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'Falta un campo obligatorio, `tipoMeta` no es válido, `valorObjetivo` no es positivo o pasa de 100 en un porcentaje, `periodo` está mal escrito o se envió un campo desconocido. `message` es un arreglo con un texto por problema y no se guarda nada.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'Ya existe una meta de ahorro para ese mes.' })
  @ApiInternalServerErrorResponse(INTERNO)
  crear(@UsuarioActual() usuarioId: string, @Body() dto: CrearMetaAhorroDto): Promise<MetaAhorroRespuestaDto> {
    return this.metas.crear(usuarioId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una meta de ahorro',
    description: `
Modifica una meta de ahorro propia: ajustar su valor o tipo, registrar el ahorro real del mes o moverla a otro mes. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. También se pueden editar las metas de meses pasados.

**Reglas a tener en cuenta**
- Campos opcionales \`tipoMeta\`, \`valorObjetivo\`, \`periodo\` y \`ahorroReal\`, con las mismas reglas que al crear; **al menos uno**, ninguno puede ser \`null\` y uno desconocido responde \`400\`. Solo cambia lo que se envía.
- **Al cambiar \`tipoMeta\` hay que enviar también \`valorObjetivo\`**: el valor se valida contra el tipo nuevo (un porcentaje no pasa de 100). Si solo se envía el valor, se valida contra el tipo guardado. Si falta, \`400\` con un mensaje que empieza por \`valorObjetivo\`.
- **Mover de mes:** \`periodo\` puede cambiar la meta a otro mes. Si ese mes ya tiene meta responde \`409\` y no se cambia nada; moverla a su propio mes no es conflicto.
- \`ahorroReal\` se puede dejar en positivo, negativo o 0.
- Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje.
- Repetir la misma edición es inofensivo.
`.trim(),
  })
  @ApiOkResponse({ type: MetaAhorroRespuestaDto, description: 'La meta completa, ya actualizada.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'El id no es válido, no se envió ningún campo, algún campo es inválido o es null, se cambió el tipo sin enviar el valor, el porcentaje pasa de 100 o se envió un campo desconocido. `message` es un arreglo y no se cambia nada.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADA)
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'El mes al que se quiere mover la meta ya tiene otra.' })
  @ApiInternalServerErrorResponse(INTERNO)
  actualizar(
    @UsuarioActual() usuarioId: string,
    @Param() { id }: IdMetaAhorroParamDto,
    @Body() dto: ActualizarMetaAhorroDto,
  ): Promise<MetaAhorroRespuestaDto> {
    return this.metas.actualizar(usuarioId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una meta de ahorro',
    description: `
Elimina una meta de ahorro propia, también de un mes pasado. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. La confirmación al usuario es responsabilidad del cliente: el borrado es inmediato y permanente.

**Reglas a tener en cuenta**
- Una meta con ahorro registrado (\`ahorroReal\` distinto de 0, positivo o negativo) no se elimina: responde \`409\`. Para eliminarla primero hay que dejar su \`ahorroReal\` en 0 con \`PATCH\`.
- Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje (nunca \`409\`). Repetir la petición cuando ya se eliminó responde \`404\`.
- Tras eliminarla, el usuario puede volver a definir la meta de ese mes.
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Meta eliminada. Sin cuerpo.' })
  @ApiBadRequestResponse({ type: ErrorValidacionDto, description: 'El id no es un id válido. `message` es un arreglo.' })
  @ApiUnauthorizedResponse(SESION)
  @ApiNotFoundResponse(NO_ENCONTRADA)
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'La meta tiene ahorro registrado: no se puede eliminar.' })
  @ApiInternalServerErrorResponse(INTERNO)
  eliminar(@UsuarioActual() usuarioId: string, @Param() { id }: IdMetaAhorroParamDto): Promise<void> {
    return this.metas.eliminar(usuarioId, id);
  }
}

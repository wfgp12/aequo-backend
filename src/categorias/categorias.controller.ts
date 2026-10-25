import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
  ErrorProhibidoDto,
  ErrorRecursoNoEncontradoDto,
  ErrorSesionInvalidaDto,
  ErrorValidacionDto,
} from '../common/dto/error-respuesta.dto.js';
import { CategoriasService } from './categorias.service.js';
import { CategoriaRespuestaDto } from './dto/categoria-respuesta.dto.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import { IdCategoriaParamDto } from './dto/id-categoria-param.dto.js';
import { ListarCategoriasQueryDto } from './dto/listar-categorias-query.dto.js';
import { RenombrarCategoriaDto } from './dto/renombrar-categoria.dto.js';

const SESION = {
  type: ErrorSesionInvalidaDto,
  description: 'Falta el token, es inválido, está vencido o manipulado. No se cambia nada.',
};
const INTERNO = {
  type: ErrorInternoDto,
  description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
};

@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(@Inject(CategoriasService) private readonly categorias: CategoriasService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar las categorías disponibles',
    description: `
Devuelve las categorías que el usuario puede usar al registrar un movimiento: las **generales del sistema** y las **personalizadas** suyas. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- Las generales (\`esPredeterminada: true\`) las define el administrador de la plataforma: no tienen dueño y no se pueden editar ni eliminar. Las personalizadas son solo del usuario; nunca se ven las de otros.
- Cada item trae \`movimientos\`: cuántas transacciones **del usuario** usan esa categoría. En las generales cuenta solo las del propio usuario.
- Orden: primero por tipo (\`EGRESO\` antes que \`INGRESO\`), dentro de cada tipo las generales antes que las personalizadas y luego por nombre, sin distinguir mayúsculas ni tildes.
- El filtro opcional \`tipo\` devuelve solo las de un tipo, por ejemplo para el paso de categoría de "Registrar egreso".
- No hay paginación: un usuario tiene pocas categorías.
`.trim(),
  })
  @ApiOkResponse({
    description: 'Objeto con la lista de categorías en `items`.',
    schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/CategoriaRespuestaDto' } } }, required: ['items'] },
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description: '`tipo` tiene un valor que no es INGRESO ni EGRESO. `message` es un arreglo.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiInternalServerErrorResponse(INTERNO)
  async listar(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: ListarCategoriasQueryDto,
  ): Promise<{ items: CategoriaRespuestaDto[] }> {
    return { items: await this.categorias.listar(usuarioId, consulta.tipo) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una categoría personalizada',
    description: `
Crea una categoría personalizada del usuario, indicando su nombre y su tipo (ingreso o egreso). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- La categoría queda a nombre del usuario del JWT, nunca como general del sistema.
- El nombre va de 1 a 40 caracteres (se recortan los espacios de los extremos) y no puede repetir el de otra categoría **del mismo tipo** que el usuario ya tenga o que sea general, sin distinguir mayúsculas ni tildes: si lo repite responde \`409\`. Un ingreso y un egreso sí pueden llamarse igual.
- El tipo no se puede cambiar después.
- El cuerpo debe contener solo \`nombre\` y \`tipo\`; un campo de más responde \`400\`.
`.trim(),
  })
  @ApiCreatedResponse({ type: CategoriaRespuestaDto, description: 'Categoría creada, con `movimientos` en 0.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description: 'Falta `nombre` o `tipo`, el nombre está vacío o pasa de 40 caracteres, el tipo no es válido o hay un campo desconocido.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'Ya existe una categoría del mismo tipo con ese nombre.' })
  @ApiInternalServerErrorResponse(INTERNO)
  crear(@UsuarioActual() usuarioId: string, @Body() dto: CrearCategoriaDto): Promise<CategoriaRespuestaDto> {
    return this.categorias.crear(usuarioId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renombrar una categoría personalizada',
    description: `
Cambia el nombre de una categoría personalizada del usuario. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- Solo se puede cambiar el \`nombre\`; el tipo es fijo y un campo de más responde \`400\`.
- Las categorías generales no se pueden modificar (\`403\`). Una categoría que no existe o es de **otro usuario** responde \`404\` con el mismo mensaje, para no revelar qué ids existen.
- El nuevo nombre sigue la misma regla que al crear: no puede coincidir con otra categoría del mismo tipo (\`409\`). Cambiar solo mayúsculas o tildes del propio nombre está permitido.
- Los movimientos de la categoría no cambian: siguen apuntando a ella con su nombre nuevo.
`.trim(),
  })
  @ApiOkResponse({ type: CategoriaRespuestaDto, description: 'Categoría con su nombre ya actualizado.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description: 'El id no es válido, el nombre está vacío o pasa de 40 caracteres, o hay un campo desconocido.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiForbiddenResponse({ type: ErrorProhibidoDto, description: 'Es una categoría general del sistema: no se puede modificar.' })
  @ApiNotFoundResponse({ type: ErrorRecursoNoEncontradoDto, description: 'La categoría no existe o es de otro usuario.' })
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'Ya existe otra categoría del mismo tipo con ese nombre.' })
  @ApiInternalServerErrorResponse(INTERNO)
  renombrar(
    @UsuarioActual() usuarioId: string,
    @Param() { id }: IdCategoriaParamDto,
    @Body() dto: RenombrarCategoriaDto,
  ): Promise<CategoriaRespuestaDto> {
    return this.categorias.renombrar(usuarioId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una categoría personalizada',
    description: `
Elimina una categoría personalizada del usuario. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. La confirmación al usuario es responsabilidad del cliente: el borrado es inmediato y permanente.

**Qué pasa con sus movimientos**
Los movimientos del usuario que usaban la categoría **pasan automáticamente a la categoría general de respaldo del mismo tipo** ("Otros egresos" u "Otros ingresos", RF-12), en la misma operación. El cliente no tiene que hacer nada y ningún movimiento queda sin categoría. Esto es un efecto esperado, no un error.

**Reglas a tener en cuenta**
- Las categorías generales no se pueden eliminar (\`403\`). Una categoría que no existe o es de **otro usuario** responde \`404\` con el mismo mensaje.
- Los movimientos se reasignan antes de borrar la categoría. Si ocurre un fallo a mitad (\`500\`), la categoría sigue existiendo y se puede **reintentar** la misma petición.
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Categoría eliminada y sus movimientos reasignados a la general de respaldo. Sin cuerpo.' })
  @ApiBadRequestResponse({ type: ErrorValidacionDto, description: 'El id no es un id válido. `message` es un arreglo.' })
  @ApiUnauthorizedResponse(SESION)
  @ApiForbiddenResponse({ type: ErrorProhibidoDto, description: 'Es una categoría general del sistema: no se puede eliminar.' })
  @ApiNotFoundResponse({ type: ErrorRecursoNoEncontradoDto, description: 'La categoría no existe o es de otro usuario.' })
  @ApiInternalServerErrorResponse(INTERNO)
  eliminar(@UsuarioActual() usuarioId: string, @Param() { id }: IdCategoriaParamDto): Promise<void> {
    return this.categorias.eliminar(usuarioId, id);
  }
}

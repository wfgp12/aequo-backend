import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import { ErrorConflictoDto, ErrorTarjetaNoEncontradaDto } from '../common/dto/error-respuesta.dto.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { ActualizarTarjetaDto } from './dto/actualizar-tarjeta.dto.js';
import { CrearTarjetaDto } from './dto/crear-tarjeta.dto.js';
import { ListarTarjetasQueryDto } from './dto/listar-tarjetas-query.dto.js';
import { IdTarjetaParamDto } from './dto/parametros.dto.js';
import { TarjetaRespuestaDto } from './dto/tarjeta-respuesta.dto.js';
import { RespuestaInvalida, RespuestaLista, RespuestasComunes } from './respuestas-api.js';
import { TarjetasService } from './tarjetas.service.js';

const NO_ENCONTRADA = { type: ErrorTarjetaNoEncontradaDto, description: 'La tarjeta no existe o es de otro usuario.' };
const NOMBRE_REPETIDO = {
  type: ErrorConflictoDto,
  description:
    'Ya existe otra tarjeta del usuario con ese nombre (sin distinguir mayúsculas). También responde `409` si otra petición con la misma `Idempotency-Key` sigue en proceso.',
};

@ApiTags('tarjetas')
@ApiBearerAuth()
@Controller('tarjetas')
export class TarjetasController {
  constructor(@Inject(TarjetasService) private readonly tarjetas: TarjetasService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar las tarjetas de crédito',
    description: `
Devuelve las tarjetas de crédito del usuario dueño de la sesión, ordenadas por nombre sin distinguir mayúsculas. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo se ven las tarjetas propias.

**Reglas a tener en cuenta**
- No hay paginación ni filtros: un usuario tiene unas pocas tarjetas. Cualquier parámetro de query responde \`400\`.
- Sin tarjetas la respuesta es \`{ "items": [] }\`, no \`404\`.
- Este endpoint solo devuelve lo guardado; no calcula cuotas, proyecciones ni totales del mes.
`.trim(),
  })
  @RespuestaLista(TarjetaRespuestaDto, 'Objeto con la lista de tarjetas en `items`, ordenadas por nombre.')
  @RespuestaInvalida('Se envió un parámetro de query: esta ruta no admite ninguno. `message` es un arreglo.')
  @RespuestasComunes()
  async listar(
    @UsuarioActual() usuarioId: string,
    @Query() _consulta: ListarTarjetasQueryDto,
  ): Promise<{ items: TarjetaRespuestaDto[] }> {
    return { items: await this.tarjetas.listar(usuarioId) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar una tarjeta de crédito',
    description: `
Devuelve una tarjeta propia por su id. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje, para no revelar qué ids existen.
`.trim(),
  })
  @ApiOkResponse({ type: TarjetaRespuestaDto, description: 'La tarjeta pedida.' })
  @RespuestaInvalida('El id no es un id válido. `message` es un arreglo.')
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA)
  obtener(@UsuarioActual() usuarioId: string, @Param() { id }: IdTarjetaParamDto): Promise<TarjetaRespuestaDto> {
    return this.tarjetas.obtener(usuarioId, id);
  }

  @Post()
  @Idempotente()
  @ApiOperation({
    summary: 'Registrar una tarjeta de crédito',
    description: `
Crea una tarjeta de crédito para el usuario dueño de la sesión. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Reglas a tener en cuenta**
- La tarjeta queda a nombre del usuario del JWT. El body no lleva ningún id de usuario y debe contener solo los campos documentados; uno de más responde \`400\`.
- \`tasaEA\` es la tasa efectiva anual como **fracción** de 0 a 1: 29,21 % se envía como \`0.2921\`; \`29.21\` responde \`400\`. 0 es válido (sin interés). Se guarda sin redondear. Es la tasa vigente: cada compra copiará la suya al registrarse.
- \`cuotaUnicaSinInteres\` es opcional (vale \`false\`): si es \`true\`, una compra a una sola cuota no paga interés.
- **Nombre único por usuario**, sin distinguir mayúsculas ni espacios de los extremos: "Visa", "visa" y " VISA " son la misma tarjeta y responden \`409\`, incluso con dos peticiones simultáneas. Las tildes cuentan como letras distintas. No hay tope de tarjetas por usuario.
- **No se duplica por error:** envía un header \`Idempotency-Key\` (UUID) por acción del usuario; si la petición se repite con la misma clave se devuelve la misma respuesta de la primera vez con \`Idempotent-Replayed: true\`.
`.trim(),
  })
  @ApiCreatedResponse({ type: TarjetaRespuestaDto, description: 'Tarjeta creada, tal como quedó guardada.' })
  @RespuestaInvalida(
    'Falta un campo obligatorio, `nombre` está vacío o pasa de 50 caracteres, `tasaEA` no es un número entre 0 y 1, `cuotaUnicaSinInteres` no es lógico o se envió un campo desconocido. `message` es un arreglo con un texto por problema y no se guarda nada.',
  )
  @RespuestasComunes()
  @ApiConflictResponse(NOMBRE_REPETIDO)
  crear(@UsuarioActual() usuarioId: string, @Body() dto: CrearTarjetaDto): Promise<TarjetaRespuestaDto> {
    return this.tarjetas.crear(usuarioId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una tarjeta de crédito (incluida su tasa)',
    description: `
Modifica una tarjeta propia: renombrarla, **actualizar su tasa efectiva anual (RF-25)** o cambiar \`cuotaUnicaSinInteres\`. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. No hay una ruta aparte para la tasa.

**Reglas a tener en cuenta**
- Campos opcionales \`nombre\`, \`tasaEA\` y \`cuotaUnicaSinInteres\`, con las mismas reglas que al crear; **al menos uno**, ninguno puede ser \`null\` y uno desconocido (\`usuarioId\`, \`id\`, fechas…) responde \`400\`. Solo cambia lo que se envía, y todo o nada.
- **La nueva tasa aplica solo a compras posteriores:** cada compra copia la tasa que tenía la tarjeta al registrarse, así que cambiarla no recalcula las compras anteriores ni toca cargos, pagos ni otras tarjetas. Lo mismo vale para \`cuotaUnicaSinInteres\`.
- Renombrar a un nombre que ya usa otra tarjeta del usuario responde \`409\` y no cambia nada (ni la tasa que viniera junto). Cambiar solo las mayúsculas del propio nombre no es conflicto.
- Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje.
- Repetir la misma edición es inofensivo.
`.trim(),
  })
  @ApiOkResponse({ type: TarjetaRespuestaDto, description: 'La tarjeta completa, ya actualizada.' })
  @RespuestaInvalida(
    'El id no es válido, no se envió ningún campo, algún campo es inválido o es null, `tasaEA` no es una fracción entre 0 y 1 o se envió un campo desconocido. `message` es un arreglo y no se cambia nada.',
  )
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA)
  @ApiConflictResponse({ type: ErrorConflictoDto, description: 'Ya existe otra tarjeta del usuario con ese nombre.' })
  actualizar(
    @UsuarioActual() usuarioId: string,
    @Param() { id }: IdTarjetaParamDto,
    @Body() dto: ActualizarTarjetaDto,
  ): Promise<TarjetaRespuestaDto> {
    return this.tarjetas.actualizar(usuarioId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar una tarjeta de crédito',
    description: `
Elimina una tarjeta propia. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. La confirmación al usuario es responsabilidad del cliente: el borrado es inmediato y permanente.

**Reglas a tener en cuenta**
- **Borrado en cascada:** sus cargos fijos (activos e inactivos) se eliminan con ella; los de otras tarjetas no se tocan.
- Una tarjeta con **pagos registrados** (transacciones con su \`tarjetaId\`) no se elimina: responde \`409\` y no se borra nada, ni los cargos. Para eliminarla primero hay que eliminar esos pagos. Cuando existan las compras con tarjeta, una tarjeta con compras tampoco se podrá eliminar.
- Si el id no existe o es de otro usuario responde \`404\` con el mismo mensaje (nunca \`409\`). Repetir la petición cuando ya se eliminó responde \`404\`.
- Tras eliminarla, el usuario puede volver a usar su nombre.
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Tarjeta y cargos eliminados. Sin cuerpo.' })
  @RespuestaInvalida('El id no es un id válido. `message` es un arreglo.')
  @RespuestasComunes()
  @ApiNotFoundResponse(NO_ENCONTRADA)
  @ApiConflictResponse({
    type: ErrorConflictoDto,
    description: 'La tarjeta tiene pagos registrados: no se puede eliminar y no se borra nada.',
  })
  eliminar(@UsuarioActual() usuarioId: string, @Param() { id }: IdTarjetaParamDto): Promise<void> {
    return this.tarjetas.eliminar(usuarioId, id);
  }
}

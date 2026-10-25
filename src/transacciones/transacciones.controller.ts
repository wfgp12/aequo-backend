import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import {
  ErrorInternoDto,
  ErrorSesionInvalidaDto,
  ErrorValidacionDto,
} from '../common/dto/error-respuesta.dto.js';
import { CrearTransaccionDto } from './dto/crear-transaccion.dto.js';
import { ListarTransaccionesQueryDto } from './dto/listar-transacciones-query.dto.js';
import { PaginaTransaccionesRespuestaDto } from './dto/pagina-transacciones-respuesta.dto.js';
import { TransaccionRespuestaDto } from './dto/transaccion-respuesta.dto.js';
import { TransaccionesService } from './transacciones.service.js';

@ApiTags('transacciones')
@ApiBearerAuth()
@Controller('transacciones')
export class TransaccionesController {
  constructor(@Inject(TransaccionesService) private readonly transacciones: TransaccionesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar y filtrar las transacciones',
    description: `
Devuelve las transacciones del usuario dueño de la sesión, de la más reciente a la más antigua, en páginas. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo se ven las transacciones propias.

**Filtros (todos opcionales y combinables)**
- \`desde\` y \`hasta\` (\`YYYY-MM-DD\`, ambos **incluidos**): el filtro Desde/Hasta de la lista de movimientos. \`desde\` no puede ser posterior a \`hasta\`.
- \`tipo\` (\`INGRESO\` o \`EGRESO\`), \`categoriaId\` y \`metodoPago\`.

**Orden y carga progresiva**
- Orden fijo: por fecha descendente y, a igual fecha, la registrada más recientemente primero.
- Se devuelven \`limite\` transacciones por página (1 a 100, por defecto 20) y un \`siguienteCursor\`. Para la página siguiente se repite la **misma consulta** enviando \`cursor=<siguienteCursor>\`; cuando \`siguienteCursor\` es \`null\` ya no hay más.
- El cursor es **opaco**: no se interpreta ni se arma. Es estable: si el usuario registra movimientos nuevos mientras hace scroll, no se repiten ni se saltan transacciones.
- Cada item trae la categoría completa en \`categoria\` (para mostrar su nombre sin otra petición). Una categoría eliminada ya no aparece porque sus movimientos pasaron a la general de respaldo.
- No hay conteo total de resultados.
`.trim(),
  })
  @ApiOkResponse({ type: PaginaTransaccionesRespuestaDto, description: 'Una página de transacciones y el cursor de la siguiente.' })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'Algún parámetro es inválido: fecha que no es YYYY-MM-DD o no existe, `desde` posterior a `hasta`, `limite` fuera de 1 a 100, `cursor` que no es uno devuelto por este endpoint, un filtro con un valor no permitido o un parámetro desconocido. `message` es un arreglo con un texto por problema.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
  })
  listar(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: ListarTransaccionesQueryDto,
  ): Promise<PaginaTransaccionesRespuestaDto> {
    return this.transacciones.listar(usuarioId, consulta);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un ingreso o un egreso',
    description: `
Registra una transacción **ordinaria** del usuario dueño de la sesión. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**Un solo endpoint para ingresos y egresos.** La interfaz tiene dos botones ("Registrar ingreso" y "Registrar egreso"), pero ambos llaman a esta misma ruta: el cliente fija el campo \`tipo\` (\`INGRESO\` o \`EGRESO\`) según el botón. No existen rutas separadas.

**Reglas a tener en cuenta**
- La transacción siempre queda a nombre del usuario del JWT. El body no lleva ningún id de usuario.
- El body debe contener solo los campos documentados; uno de más (por ejemplo \`clasificacionFlujo\`, \`tarjetaId\` o \`deudaId\`) responde \`400\`. Este endpoint crea solo transacciones ordinarias: los pagos de tarjeta, abonos a deudas y préstamos o avances los generan los módulos de tarjetas y deudas.
- **Tarjeta de crédito:** \`metodoPago\` no admite \`TARJETA_CREDITO\`. Una compra con tarjeta no es una transacción: se registra en el módulo de tarjetas (\`comprascredito\`) y afecta el balance cuando se paga la tarjeta (regla de flujo de caja, ADR-014).
- \`fecha\` es un día del calendario (\`YYYY-MM-DD\`), pasada o futura, sin hora ni zona horaria.
- El balance del periodo no se guarda: se calcula al consultarlo, así que crear la transacción ya lo refleja.
- **Categoría:** \`categoriaId\` debe existir, ser una categoría general o del propio usuario y ser del mismo tipo que el movimiento; si no, responde \`400\` con un mensaje que empieza por \`categoriaId\`. La respuesta incluye la categoría completa en \`categoria\`, para mostrar su nombre sin otra petición.
`.trim(),
  })
  @ApiCreatedResponse({
    type: TransaccionRespuestaDto,
    description: 'Transacción registrada. Devuelve la transacción tal como quedó guardada.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      'Datos inválidos: falta un campo obligatorio, el monto no es positivo, la fecha no es YYYY-MM-DD, el método de pago no está permitido, la descripción es muy larga o se envió un campo desconocido. `message` es un arreglo con un texto por cada problema y no se guarda nada.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado. No se guarda nada.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. No se guardó la transacción: reintentar.',
  })
  crear(
    @UsuarioActual() usuarioId: string,
    @Body() dto: CrearTransaccionDto,
  ): Promise<TransaccionRespuestaDto> {
    return this.transacciones.crear(usuarioId, dto);
  }
}

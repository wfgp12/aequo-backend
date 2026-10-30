import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decoradores.js';
import { ErrorInternoDto, ErrorSesionInvalidaDto, ErrorValidacionDto } from '../common/dto/error-respuesta.dto.js';
import { PeriodoQueryDto } from './dto/periodo-query.dto.js';
import { PeriodoRespuestaDto } from './dto/periodo-respuesta.dto.js';
import { ReportesService } from './reportes.service.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(@Inject(ReportesService) private readonly reportes: ReportesService) {}

  @Get('periodo')
  @ApiOperation({
    summary: 'Resumen numérico de un periodo',
    description: `
Devuelve los totales de dinero del usuario dueño de la sesión en un periodo (CU-07, RF-13, RF-14, RF-20). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios.

**Qué periodo consulta (todos los parámetros son opcionales)**
- Sin parámetros: el **mes actual** (el día de hoy se toma en UTC).
- \`mes=YYYY-MM\`: ese mes completo, de su día 1 al último (febrero y años bisiestos incluidos).
- \`desde=YYYY-MM-DD&hasta=YYYY-MM-DD\`: un rango con ambos extremos **incluidos**; puede cruzar meses y años y puede ser de un solo día. Se envían siempre los dos y \`desde\` no puede ser posterior a \`hasta\`.
- \`mes\` no se combina con \`desde\` ni \`hasta\`: se elige un mes o un rango.
- La respuesta devuelve \`desde\` y \`hasta\`, el periodo efectivo que se usó.

**Cómo se calculan los totales (regla de flujo de caja, ADR-014)**
- \`ingresos\`: ingresos ordinarios. Es el *ingreso propio*: no incluye el dinero recibido.
- \`egresos\`: egresos ordinarios (gasto propio). No incluye pagos de tarjeta ni abonos a deudas, para no contar dos veces lo que ya se gastó.
- \`pagosTarjeta\`: pagos de tarjeta, por la fecha del **pago**, no por la de la compra. Una compra con tarjeta no afecta el balance el día que se hace; lo afecta el pago.
- \`abonosDeuda\`: abonos a deudas.
- \`dineroRecibido\`: préstamos y avances recibidos. Se informa aparte y **no** suma al balance.
- \`balance\` = \`ingresos − egresos − pagosTarjeta − abonosDeuda\`: el dinero que entró o salió de verdad. Puede ser negativo.

**Otras reglas**
- Los totales se calculan al consultar: registrar, editar o eliminar un movimiento se refleja de inmediato.
- Un periodo sin movimientos responde \`200\` con todos los totales en \`0\`, no un error.
- Los montos conservan la precisión completa de la suma; el redondeo al peso lo hace el cliente.
- No incluye las compras con tarjeta de crédito (módulo de tarjetas): cuentan en el gasto por categoría, no en este resumen.
`.trim(),
  })
  @ApiOkResponse({
    type: PeriodoRespuestaDto,
    description: 'El periodo efectivo y sus totales. Con un periodo sin movimientos, todos los totales valen 0.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`mes` con un formato distinto de YYYY-MM o con un mes fuera de 01 a 12; `desde` o `hasta` que no son YYYY-MM-DD o no existen en el calendario; `desde` posterior a `hasta`; solo uno de los dos extremos; `mes` junto con `desde` o `hasta`; o un parámetro desconocido. `message` es un arreglo con un texto por problema.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
  })
  obtenerPorPeriodo(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: PeriodoQueryDto,
  ): Promise<PeriodoRespuestaDto> {
    return this.reportes.obtenerPorPeriodo(usuarioId, consulta);
  }
}

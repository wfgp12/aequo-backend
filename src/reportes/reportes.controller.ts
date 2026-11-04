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
import { CategoriasRespuestaDto } from './dto/categorias-respuesta.dto.js';
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

  @Get('categorias')
  @ApiOperation({
    summary: 'Distribución de los gastos por categoría',
    description: `
Devuelve en qué categorías se fue el gasto del usuario dueño de la sesión en un periodo, con el total y el porcentaje de cada una; sirve para la gráfica circular (CU-07, RF-18). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios.

**Qué periodo consulta:** los mismos parámetros, reglas y mensajes de error que \`GET /reportes/periodo\`. Sin parámetros, el **mes actual** (el día de hoy se toma en UTC); \`mes=YYYY-MM\` para un mes; o \`desde\` + \`hasta\` (\`YYYY-MM-DD\`, ambos incluidos y siempre juntos) para un rango. \`mes\` no se combina con \`desde\` ni \`hasta\`. La respuesta devuelve \`desde\` y \`hasta\`, el periodo efectivo.

**Qué cuenta (regla de flujo de caja, ADR-014)**
- Solo el gasto propio: los egresos \`ORDINARIO\`. No cuentan los ingresos de ninguna clase, el dinero recibido, los pagos de tarjeta ni los abonos a deudas, para no contar dos veces lo que ya se gastó. Por eso \`total\` es igual a \`egresos\` de \`GET /reportes/periodo\`.
- Por ahora solo suma transacciones. Las compras con tarjeta de crédito (que también cuentan por su categoría en el mes de la compra) se incorporarán con el módulo de tarjetas, y entonces \`total\` las incluirá.

**Cómo se arma la respuesta**
- \`total\`: el gasto propio del periodo; es la suma de los \`total\` de \`categorias\`.
- \`categorias\`: una entrada por cada categoría con gasto en el periodo (las que no tienen gasto no aparecen), de mayor a menor \`total\` y, en empate, por \`nombre\` de la A a la Z. Las categorías generales y las personales del usuario cuentan igual.
- \`porcentaje\` = \`total\` de la categoría ÷ \`total\` × 100, sin redondear (el redondeo lo hace el cliente); con la precisión completa los porcentajes suman 100.
- \`nombre\` es siempre el nombre actual de la categoría: si se renombra, el reporte muestra el nombre nuevo con el mismo \`categoriaId\`.
- Un gasto cuya categoría ya no se encuentra (no debería ocurrir: al eliminar una categoría sus movimientos pasan a "Otros") o que no tiene categoría no se pierde: se suma en una entrada con \`categoriaId\` \`null\` y \`nombre\` \`Sin categoría\`.
- Un periodo sin gastos responde \`200\` con \`total\` 0 y \`categorias\` \`[]\`, no un error.
- Se calcula al consultar: registrar, editar o eliminar un movimiento se refleja de inmediato.
`.trim(),
  })
  @ApiOkResponse({
    type: CategoriasRespuestaDto,
    description:
      'El periodo efectivo, el gasto total y la distribución por categoría. Con un periodo sin gastos, `total` vale 0 y `categorias` es `[]`.',
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
  obtenerPorCategoria(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: PeriodoQueryDto,
  ): Promise<CategoriasRespuestaDto> {
    return this.reportes.obtenerPorCategoria(usuarioId, consulta);
  }
}

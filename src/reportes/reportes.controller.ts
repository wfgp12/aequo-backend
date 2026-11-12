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
import { ApiZonaHoraria, ZonaHoraria } from '../common/zona-horaria.js';
import { CategoriasRespuestaDto } from './dto/categorias-respuesta.dto.js';
import { ComparacionQueryDto } from './dto/comparacion-query.dto.js';
import { ComparacionRespuestaDto } from './dto/comparacion-respuesta.dto.js';
import { EvolucionQueryDto } from './dto/evolucion-query.dto.js';
import { EvolucionRespuestaDto } from './dto/evolucion-respuesta.dto.js';
import { PeriodoQueryDto } from './dto/periodo-query.dto.js';
import { PeriodoRespuestaDto } from './dto/periodo-respuesta.dto.js';
import { ReportesService } from './reportes.service.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(@Inject(ReportesService) private readonly reportes: ReportesService) {}

  @Get('periodo')
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Resumen numérico de un periodo',
    description: `
Devuelve los totales de dinero del usuario dueño de la sesión en un periodo (CU-07, RF-13, RF-14, RF-20). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios.

**Qué periodo consulta (todos los parámetros son opcionales)**
- Sin parámetros: el **mes actual**. El día de hoy se toma en la zona del header opcional \`X-Zona-Horaria\` (nombre IANA, por ejemplo \`America/Bogota\`); sin el header, en UTC. Esa zona no cambia nada si se envía \`mes\` o un rango, pero un nombre inválido responde \`400\` en todos los casos.
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
      '`mes` con un formato distinto de YYYY-MM o con un mes fuera de 01 a 12; `desde` o `hasta` que no son YYYY-MM-DD o no existen en el calendario; `desde` posterior a `hasta`; solo uno de los dos extremos; `mes` junto con `desde` o `hasta`; un parámetro desconocido; o un `X-Zona-Horaria` que no es un nombre de zona IANA válido. `message` es un arreglo con un texto por problema.',
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
    @ZonaHoraria() zona: string,
  ): Promise<PeriodoRespuestaDto> {
    return this.reportes.obtenerPorPeriodo(usuarioId, consulta, zona);
  }

  @Get('categorias')
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Distribución de los gastos por categoría',
    description: `
Devuelve en qué categorías se fue el gasto del usuario dueño de la sesión en un periodo, con el total y el porcentaje de cada una; sirve para la gráfica circular (CU-07, RF-18). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios.

**Qué periodo consulta:** los mismos parámetros, reglas y mensajes de error que \`GET /reportes/periodo\`. Sin parámetros, el **mes actual** (el día de hoy se toma en la zona del header opcional \`X-Zona-Horaria\`, nombre IANA; sin el header, en UTC; un nombre inválido responde \`400\` aunque se envíe \`mes\` o un rango); \`mes=YYYY-MM\` para un mes; o \`desde\` + \`hasta\` (\`YYYY-MM-DD\`, ambos incluidos y siempre juntos) para un rango. \`mes\` no se combina con \`desde\` ni \`hasta\`. La respuesta devuelve \`desde\` y \`hasta\`, el periodo efectivo.

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
      '`mes` con un formato distinto de YYYY-MM o con un mes fuera de 01 a 12; `desde` o `hasta` que no son YYYY-MM-DD o no existen en el calendario; `desde` posterior a `hasta`; solo uno de los dos extremos; `mes` junto con `desde` o `hasta`; un parámetro desconocido; o un `X-Zona-Horaria` que no es un nombre de zona IANA válido. `message` es un arreglo con un texto por problema.',
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
    @ZonaHoraria() zona: string,
  ): Promise<CategoriasRespuestaDto> {
    return this.reportes.obtenerPorCategoria(usuarioId, consulta, zona);
  }

  @Get('evolucion')
  @ApiOperation({
    summary: 'Evolución del balance mes a mes',
    description: `
Devuelve el balance de cada mes del usuario dueño de la sesión, en orden cronológico, para la gráfica de evolución (CU-07, RF-19). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios. Es de solo lectura.

**Qué rango consulta (ambos parámetros son opcionales e independientes)**
- \`desde=YYYY-MM\` y \`hasta=YYYY-MM\`: primer y último mes de la serie, ambos incluidos; la serie puede cruzar años. \`desde\` no puede ser posterior a \`hasta\`.
- Sin \`desde\`, la serie empieza en el **primer mes con movimientos** del usuario; sin \`hasta\`, termina en el **último mes con movimientos**. No se agrega el mes actual ni se usa \`X-Zona-Horaria\`.
- El rango no puede abarcar más de **120 meses** (10 años), también cuando se calcula con los extremos abiertos; en ese caso se envía \`desde\` para acotarlo.
- Cualquier otro parámetro (por ejemplo \`mes\`) se rechaza con \`400\`.

**Cómo se arma la respuesta**
- \`desde\` y \`hasta\`: el rango efectivo (lo enviado o, si se omitió, el primer o el último mes con movimientos).
- \`puntos\`: un punto \`{ periodo, balance }\` por **cada mes del rango**, de más antiguo a más reciente; los meses sin movimientos aparecen con \`balance\` 0.
- \`balance\` sigue la regla de flujo de caja (ADR-014): ingresos ordinarios − egresos ordinarios − pagos de tarjeta − abonos a deudas; el dinero recibido (préstamos y avances) no suma. Coincide con el \`balance\` de \`GET /reportes/periodo?mes=\` de ese mes. Puede ser negativo.
- El mes de un movimiento es el de su \`fecha\` (día calendario, en UTC).
- Los montos conservan la precisión completa; el redondeo lo hace el cliente.

**Otras reglas**
- Un rango sin movimientos, o un usuario sin movimientos, responde \`200\` con \`puntos\` \`[]\` (y \`desde\`/\`hasta\` con lo enviado, \`null\` en lo omitido), no un error.
- Se calcula al consultar: registrar, editar o eliminar un movimiento se refleja de inmediato.
`.trim(),
  })
  @ApiOkResponse({
    type: EvolucionRespuestaDto,
    description:
      'El rango efectivo y un punto de balance por cada mes. Con un rango o un usuario sin movimientos, `puntos` es `[]`.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`desde` o `hasta` que no son YYYY-MM (mes de 01 a 12); `desde` posterior a `hasta`; un rango de más de 120 meses (también con extremos abiertos); o un parámetro desconocido. `message` es un arreglo con un texto por problema.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
  })
  obtenerEvolucion(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: EvolucionQueryDto,
  ): Promise<EvolucionRespuestaDto> {
    return this.reportes.obtenerEvolucion(usuarioId, consulta);
  }

  @Get('comparacion')
  @ApiOperation({
    summary: 'Comparación entre periodos',
    description: `
Devuelve, mes a mes, las cifras del usuario dueño de la sesión para comparar sus periodos en una gráfica de barras o de líneas (CU-07, RF-15, RF-16). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo cuenta los movimientos propios. Es de solo lectura.

**Qué se compara (\`tipo\`, obligatorio)**
- \`balance\`: cada elemento de \`periodos\` trae \`{ periodo, balance }\`.
- \`ingresos-egresos\`: trae \`{ periodo, ingresos, egresos }\`.
- \`categoria\`: trae \`{ periodo, total, categorias }\`, donde \`categorias\` es una lista de \`{ categoriaId, nombre, total, porcentaje }\`.
- Cualquier otro valor (por ejemplo \`BALANCE\`, \`gastos\` o \`metodo-pago\`), o ninguno, responde \`400\` con el mensaje \`tipo debe ser uno de: balance, ingresos-egresos, categoria\`.

**Qué rango consulta (\`desde\` y \`hasta\` son opcionales e independientes)**
- \`desde=YYYY-MM\` y \`hasta=YYYY-MM\`: primer y último mes del rango, ambos incluidos; puede cruzar años. \`desde\` no puede ser posterior a \`hasta\`.
- Sin \`desde\`, el rango empieza en el **primer mes con movimientos** del usuario; sin \`hasta\`, termina en el **último mes con movimientos**. No se agrega el mes actual ni se usa \`X-Zona-Horaria\`.
- El rango no puede abarcar más de **120 meses** (10 años), también cuando se calcula con los extremos abiertos; en ese caso se envía \`desde\` para acotarlo.
- Cualquier otro parámetro (por ejemplo \`mes\`) se rechaza con \`400\`.

**Qué meses aparecen**
- Solo los meses del rango que tienen **al menos un movimiento de cualquier clase** (también uno solo de dinero recibido o de pago de tarjeta), de más antiguo a más reciente. **Los meses sin movimientos no aparecen** (a diferencia de \`GET /reportes/evolucion\`, que los rellena con 0).
- El conjunto de meses es el mismo para los tres tipos. Un mes con movimientos pero sin gastos aparece en \`categoria\` con \`total\` 0 y \`categorias\` \`[]\`.
- \`desde\` y \`hasta\` de la respuesta son el rango efectivo: lo enviado o, si se omitió, el primer o el último mes con movimientos.

**Cómo se calculan las cifras (regla de flujo de caja, ADR-014)**
- Cada cifra de un mes es igual a la del mismo mes en \`GET /reportes/periodo?mes=\` (\`balance\`, \`ingresos\`, \`egresos\`) y en \`GET /reportes/categorias?mes=\` (\`total\`, \`categorias\`, con el mismo orden, los mismos porcentajes y la misma entrada \`Sin categoría\`).
- \`balance\` = ingresos ordinarios − egresos ordinarios − pagos de tarjeta − abonos a deudas; el dinero recibido no suma. Puede ser negativo.
- \`ingresos\` es el ingreso propio (sin dinero recibido) y \`egresos\` el gasto propio (sin pagos de tarjeta ni abonos). Por categoría solo cuentan los egresos ordinarios.
- El mes de un movimiento es el de su \`fecha\` (día calendario, en UTC).
- Los montos conservan la precisión completa; el redondeo lo hace el cliente.

**Otras reglas**
- Un rango sin movimientos, o un usuario sin movimientos, responde \`200\` con \`periodos\` \`[]\` (y \`desde\`/\`hasta\` con lo enviado, \`null\` en lo omitido), no un error.
- Se calcula al consultar: registrar, editar o eliminar un movimiento se refleja de inmediato.
`.trim(),
  })
  @ApiOkResponse({
    type: ComparacionRespuestaDto,
    description:
      'El tipo, el rango efectivo y una fila por cada mes con movimientos. Con un rango o un usuario sin movimientos, `periodos` es `[]`.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`tipo` faltante o distinto de balance, ingresos-egresos y categoria; `desde` o `hasta` que no son YYYY-MM (mes de 01 a 12); `desde` posterior a `hasta`; un rango de más de 120 meses (también con extremos abiertos); o un parámetro desconocido. `message` es un arreglo con un texto por problema.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorSesionInvalidaDto,
    description: 'Falta el token, es inválido, está vencido o manipulado.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorInternoDto,
    description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
  })
  compararPeriodos(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: ComparacionQueryDto,
  ): Promise<ComparacionRespuestaDto> {
    return this.reportes.compararPeriodos(usuarioId, consulta);
  }
}

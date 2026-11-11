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
import { AcumuladoQueryDto } from './dto/acumulado-query.dto.js';
import { AcumuladoRespuestaDto } from './dto/acumulado-respuesta.dto.js';
import { ProgresoQueryDto } from './dto/progreso-query.dto.js';
import { ProgresoRespuestaDto } from './dto/progreso-respuesta.dto.js';
import { ProgresoAhorroService } from './progreso-ahorro.service.js';

const SESION = {
  type: ErrorSesionInvalidaDto,
  description: 'Falta el token, es inválido, está vencido o manipulado.',
};
const INTERNO = {
  type: ErrorInternoDto,
  description: 'Fallo inesperado, por ejemplo MongoDB no disponible. Reintentar más tarde.',
};

@ApiTags('ahorro')
@ApiBearerAuth()
@Controller('ahorro')
export class ProgresoAhorroController {
  constructor(
    @Inject(ProgresoAhorroService)
    private readonly progreso: ProgresoAhorroService,
  ) {}

  @Get('progreso')
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Progreso del mes hacia la meta de ahorro',
    description: `
Calcula cuánto lleva ahorrado el usuario dueño de la sesión en un mes, cuánto puede gastar todavía sin faltar a la meta y qué tan cerca está de cumplirla (CU-08, RF-22). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo lee: no modifica metas ni transacciones.

**Qué mes calcula**
- \`mes=YYYY-MM\`: ese mes. Sin parámetros, el **mes actual**; el día de hoy se toma en la zona del header opcional \`X-Zona-Horaria\` (nombre IANA, por ejemplo \`America/Bogota\`; sin el header, UTC). Un nombre de zona inválido responde \`400\` aunque se envíe \`mes\`. No acepta rangos \`desde\`/\`hasta\` ni parámetros desconocidos (\`400\`).

**Cómo se calcula (regla de flujo de caja, ADR-014; las cifras coinciden con \`GET /reportes/periodo\`)**
- \`ingresoPropio\`: ingresos ordinarios del mes, sin el dinero recibido (préstamos y avances).
- \`egresos\`: egresos ordinarios + pagos de tarjeta + abonos a deudas del mes: el dinero que salió de verdad.
- \`ahorroDelMes\` = \`ingresoPropio − egresos\` (igual al \`balance\` del reporte). Puede ser negativo.
- \`meta\`: la meta del mes, con su \`montoMeta\` en pesos (\`valorObjetivo\` si es \`MONTO_FIJO\`; \`ingresoPropio × valorObjetivo / 100\` si es \`PORCENTAJE\`), o \`null\` si el mes no tiene meta. La meta de otro mes nunca se usa.
- \`disponible\` = \`ingresoPropio − egresos − montoMeta\`: lo que aún se puede gastar sin faltar a la meta; negativo si ya se pasó. Sin meta, \`montoMeta\` cuenta como 0.
- \`porcentajeAvance\` = \`ahorroDelMes / montoMeta × 100\`, **sin tope** (150 es una meta superada en 50 %; puede ser negativo). Es \`null\` si no hay meta o su \`montoMeta\` es 0 (por ejemplo, meta de porcentaje en un mes sin ingresos).
- Los montos conservan la precisión completa; el redondeo lo hace el cliente. Se calcula al consultar, así que cualquier cambio en movimientos o en la meta se refleja de inmediato.
`.trim(),
  })
  @ApiOkResponse({
    type: ProgresoRespuestaDto,
    description:
      'El progreso del mes. Un mes sin movimientos ni meta devuelve ceros, `meta` y `porcentajeAvance` en `null`.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description:
      '`mes` no tiene el formato YYYY-MM, se envió `desde`, `hasta` u otro parámetro desconocido, o `X-Zona-Horaria` no es una zona IANA válida. `message` es un arreglo.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiInternalServerErrorResponse(INTERNO)
  obtenerProgreso(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: ProgresoQueryDto,
    @ZonaHoraria() zona: string,
  ): Promise<ProgresoRespuestaDto> {
    return this.progreso.obtenerProgreso(usuarioId, consulta, zona);
  }

  @Get('acumulado')
  @ApiOperation({
    summary: 'Ahorro real acumulado mes a mes',
    description: `
Devuelve el ahorro acumulado del usuario dueño de la sesión, sumando mes a mes lo guardado en sus metas (CU-08, RF-23). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Solo lee.

**Reglas a tener en cuenta**
- Suma el \`ahorroReal\` **guardado** en cada meta mensual (el que se registra con \`PATCH /ahorro/metas/:id\`); no lo recalcula desde las transacciones.
- \`meses\` va de la meta más antigua a la más reciente, con el \`ahorroReal\` de cada mes y el \`acumulado\` hasta ese mes. \`total\` es el último acumulado. Un ahorro negativo resta.
- Los meses sin meta no aparecen ni aportan. Sin metas responde \`{ "total": 0, "meses": [] }\`.
- \`hasta=YYYY-MM\` (opcional) corta la serie en ese mes, incluido. Un parámetro desconocido o un \`hasta\` mal escrito responde \`400\`.
- Los montos no se redondean; eso lo hace el cliente.
`.trim(),
  })
  @ApiOkResponse({
    type: AcumuladoRespuestaDto,
    description: 'El total y la serie mensual del ahorro acumulado.',
  })
  @ApiBadRequestResponse({
    type: ErrorValidacionDto,
    description: '`hasta` no tiene el formato YYYY-MM o se envió un parámetro desconocido. `message` es un arreglo.',
  })
  @ApiUnauthorizedResponse(SESION)
  @ApiInternalServerErrorResponse(INTERNO)
  obtenerAcumulado(
    @UsuarioActual() usuarioId: string,
    @Query() consulta: AcumuladoQueryDto,
  ): Promise<AcumuladoRespuestaDto> {
    return this.progreso.obtenerAcumulado(usuarioId, consulta);
  }
}

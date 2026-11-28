import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
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
import { ErrorConflictoDto, ErrorPrestamoNoEncontradoDto } from '../common/dto/error-respuesta.dto.js';
import { ApiZonaHoraria, ZonaHoraria } from '../common/zona-horaria.js';
import { Idempotente } from '../idempotencia/idempotente.decorator.js';
import { RespuestaInvalida, RespuestasComunes } from '../tarjetas/respuestas-api.js';
import { DeudasService } from './deudas.service.js';
import { ListaDeudasRespuestaDto, PrestamoRegistradoRespuestaDto } from './dto/deuda-respuesta.dto.js';
import { IdPrestamoParamDto } from './dto/parametros.dto.js';
import { RegistrarPrestamoDto } from './dto/registrar-prestamo.dto.js';

@ApiTags('deudas')
@ApiBearerAuth()
@Controller('deudas')
export class DeudasController {
  constructor(@Inject(DeudasService) private readonly deudas: DeudasService) {}

  @Post('prestamos')
  // Swagger une esta descripción con la del 409 de @Idempotente().
  @ApiConflictResponse({
    type: ErrorConflictoDto,
    description:
      'La deuda activa con esa persona tiene otro interés (`Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo`) u otra petición la está creando a la vez (`Ya se está registrando un préstamo de esa persona: vuelve a intentarlo`).',
  })
  @Idempotente()
  @ApiOperation({
    summary: 'Registrar un préstamo recibido',
    description: `
Registra dinero que le prestaron al usuario (RF-34, RF-35, RF-36, CU-19). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`.

**A qué deuda va**
- Si el usuario tiene una deuda **activa** con ese \`acreedor\` (sin distinguir mayúsculas; las tildes sí cuentan) el monto se **suma** a ella y \`deudaCreada\` es \`false\`; la deuda conserva el nombre como se escribió la primera vez.
- Si no, se **crea** la deuda y \`deudaCreada\` es \`true\`. Una deuda saldada no recibe montos: se crea otra y la saldada queda como historial.

**Interés (uno por deuda)**
- \`SIN_INTERES\` (por defecto): \`valorInteres\` 0 u omitido.
- \`TASA\`: tasa **mensual simple** como fracción (\`0.02\` = 2 % al mes).
- \`MONTO_FIJO\`: el interés **total** de la deuda en pesos, no por mes.
- Al sumar: sin \`tipoInteres\` ni \`valorInteres\` se conserva el de la deuda. Enviar cualquiera de los dos cuenta como indicar el interés (tipo omitido = \`SIN_INTERES\`, valor omitido = 0); si no coincide responde \`409\` y no se guarda nada.
- El \`monto\` del préstamo nunca incluye intereses.

**Qué se guarda y qué efectos tiene**
- El préstamo es una transacción \`INGRESO\`, \`clasificacionFlujo\` \`DINERO_RECIBIDO\`, \`metodoPago\` \`EFECTIVO\`, sin categoría y con el \`deudaId\`. \`prestamo.id\` es el id de esa transacción.
- Aumenta \`dineroRecibido\` y \`dineroDisponible\` en \`GET /reportes/periodo\` del mes de su \`fecha\`, **sin** contar como ingreso propio, balance, gasto por categoría ni ahorro.
- Se ve en \`GET /transacciones\`, pero allí no se edita ni se elimina (\`409\`).

**Otras reglas**
- Los campos que fija el servidor (\`tipo\`, \`clasificacionFlujo\`, \`metodoPago\`, \`categoriaId\`, \`deudaId\`, \`usuarioId\`, \`saldada\`) o cualquier otro desconocido responden \`400\`.
- **No se duplica por error:** envía \`Idempotency-Key\`; con la misma clave se devuelve la respuesta de la primera vez con \`Idempotent-Replayed: true\`.
- Si falla el guardado responde \`500\` y no queda una deuda a medias.
`.trim(),
  })
  @ApiCreatedResponse({
    type: PrestamoRegistradoRespuestaDto,
    description: 'Préstamo registrado, con la deuda creada o la que recibió el monto.',
  })
  @RespuestaInvalida(
    '`acreedor`, `monto`, `fecha`, `descripcion`, `tipoInteres` o `valorInteres` inválidos (cada mensaje empieza por el nombre del campo), o un campo desconocido. `message` es un arreglo y no se guarda nada.',
  )
  @RespuestasComunes()
  registrar(
    @UsuarioActual() usuarioId: string,
    @Body() dto: RegistrarPrestamoDto,
  ): Promise<PrestamoRegistradoRespuestaDto> {
    return this.deudas.registrarPrestamo(usuarioId, dto);
  }

  @Get()
  @ApiZonaHoraria()
  @ApiOperation({
    summary: 'Listar las deudas con sus préstamos, intereses y saldo',
    description: `
Devuelve todas las deudas del usuario, activas y saldadas, cada una con sus préstamos y sus cifras, y el total adeudado (RF-34, RF-36, RF-38, CU-19, CU-21). **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. Sirve para saber cuánto se debe, para elegir a qué deuda sumar (enviando su \`acreedor\`) y para conocer los ids que se pueden eliminar.

**Cifras de cada deuda** (se calculan al consultar, no se guardan, y llegan sin redondear)
- \`prestado\`: suma de sus préstamos. \`abonado\`: suma de sus abonos. \`saldo\` = \`prestado + intereses − abonado\`.
- \`intereses\` en \`SIN_INTERES\`: 0. En \`MONTO_FIJO\`: el monto pactado, una sola vez y completo desde que existe la deuda.
- \`intereses\` en \`TASA\`: tasa mensual simple por **meses cumplidos** hasta hoy sobre el **capital pendiente**, desde la fecha de cada préstamo. El mes se cumple el mismo día del mes siguiente o, si no existe, el último día de ese mes. Los intereses sin pagar no generan más intereses.
- Cada abono paga primero los intereses acumulados y luego el capital del préstamo más antiguo. Si cae el día en que se cumple un mes, ese interés se suma antes.
- Si se abonó de más, \`saldo\` es **negativo** (a favor del usuario), no genera interés y reduce un préstamo posterior de la misma deuda.
- Cuentan todos los movimientos registrados, aunque su fecha sea futura; solo el interés se detiene en hoy. \`saldada\` no cambia el cálculo.
- \`totalAdeudado\`: suma de los saldos **positivos**; un saldo a favor no resta.
- **Hoy** es el día en la zona del header opcional \`X-Zona-Horaria\` (nombre IANA; sin él, UTC; un nombre inválido responde \`400\`).

**Reglas a tener en cuenta**
- Orden de las deudas: por \`acreedor\` sin distinguir mayúsculas y, a igual nombre, la creada más recientemente primero. Los préstamos, del más reciente al más antiguo.
- \`prestamos\` solo trae los préstamos de esa deuda: ni abonos ni avances en efectivo.
- \`valorInteres\`: en \`TASA\` es la tasa mensual simple (\`0.02\` = 2 % al mes); en \`MONTO_FIJO\`, el interés total de la deuda.
- Sin paginación. Sin deudas responde \`{ "totalAdeudado": 0, "items": [] }\`. Es una lectura sin efectos.
`.trim(),
  })
  @ApiOkResponse({
    type: ListaDeudasRespuestaDto,
    description: 'El total adeudado y las deudas en `items`, ordenadas por acreedor.',
  })
  @RespuestaInvalida('`X-Zona-Horaria` no es un nombre de zona IANA válido. `message` es un arreglo.')
  @RespuestasComunes()
  listar(@UsuarioActual() usuarioId: string, @ZonaHoraria() zona: string): Promise<ListaDeudasRespuestaDto> {
    return this.deudas.listar(usuarioId, zona);
  }

  @Delete(':deudaId/prestamos/:prestamoId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un préstamo mal registrado',
    description: `
Elimina un préstamo propio de una deuda propia. **Requiere sesión:** header \`Authorization: Bearer <accessToken>\`. El borrado es inmediato y permanente: así se corrige un préstamo mal digitado (se elimina y se registra de nuevo; no hay edición).

**Reglas a tener en cuenta**
- Se borra la transacción del préstamo: \`dineroRecibido\` y \`dineroDisponible\` del mes bajan.
- Si era el **único** préstamo de la deuda, se elimina también la deuda (así se corrigen el nombre y el interés).
- Si es el único y la deuda tiene abonos, responde \`409\` y no se borra nada.
- Deuda ajena o inexistente: \`404\` \`Deuda no encontrada\`. Lo que no es un préstamo de esa deuda (ajeno, de otra deuda, un abono, un egreso, ya eliminado): \`404\` \`Préstamo no encontrado\`.
- Los préstamos no se pueden eliminar desde \`/transacciones\` (\`409\`).
`.trim(),
  })
  @ApiNoContentResponse({ description: 'Préstamo eliminado. Sin cuerpo.' })
  @RespuestaInvalida('`deudaId` o `prestamoId` no son ids válidos. `message` es un arreglo.')
  @RespuestasComunes()
  @ApiNotFoundResponse({
    type: ErrorPrestamoNoEncontradoDto,
    description:
      'La deuda no existe o es de otro usuario (`Deuda no encontrada`), o el id no es un préstamo de esa deuda (`Préstamo no encontrado`).',
  })
  @ApiConflictResponse({
    type: ErrorConflictoDto,
    description:
      'Es el único préstamo de una deuda con abonos (`No puedes eliminar el único préstamo de una deuda con abonos`).',
  })
  eliminar(@UsuarioActual() usuarioId: string, @Param() { deudaId, prestamoId }: IdPrestamoParamDto): Promise<void> {
    return this.deudas.eliminarPrestamo(usuarioId, deudaId, prestamoId);
  }
}

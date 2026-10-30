import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { ClasificacionFlujo, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import type { PeriodoQueryDto } from './dto/periodo-query.dto.js';
import type { PeriodoRespuestaDto } from './dto/periodo-respuesta.dto.js';
import { resolverPeriodo } from './periodo.js';

/** Las fechas se guardan a medianoche UTC del día indicado, así que un día YYYY-MM-DD se compara tal cual. */
const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

@Injectable()
export class ReportesService {
  constructor(@InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>) {}

  /**
   * Resumen numérico del periodo (RF-13, RF-14, RF-20) con la regla de flujo de caja de ADR-014. Se calcula al
   * consultar, no se guarda, así que crear, editar o eliminar un movimiento se refleja de inmediato. Las peticiones
   * inválidas se rechazan antes de consultar la base. Los totales conservan la precisión completa (RNF-11).
   */
  async obtenerPorPeriodo(usuarioId: string, consulta: PeriodoQueryDto): Promise<PeriodoRespuestaDto> {
    const periodo = resolverPeriodo(consulta, new Date());
    const movimientos = await this.transacciones
      .find({
        usuarioId: new Types.ObjectId(usuarioId),
        fecha: { $gte: aFecha(periodo.desde), $lte: aFecha(periodo.hasta) },
      })
      .select('tipo monto clasificacionFlujo')
      .lean();

    const totales = { ingresos: 0, egresos: 0, pagosTarjeta: 0, abonosDeuda: 0, dineroRecibido: 0 };
    for (const { tipo, monto, clasificacionFlujo } of movimientos) {
      if (clasificacionFlujo === ClasificacionFlujo.PAGO_TARJETA) totales.pagosTarjeta += monto;
      else if (clasificacionFlujo === ClasificacionFlujo.ABONO_DEUDA) totales.abonosDeuda += monto;
      else if (clasificacionFlujo === ClasificacionFlujo.DINERO_RECIBIDO) totales.dineroRecibido += monto;
      else if (tipo === TipoTransaccion.INGRESO) totales.ingresos += monto;
      else totales.egresos += monto;
    }
    const balance = totales.ingresos - totales.egresos - totales.pagosTarjeta - totales.abonosDeuda;
    return { ...periodo, ...totales, balance };
  }
}

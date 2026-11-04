import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { CategoriasService } from '../categorias/categorias.service.js';
import { ClasificacionFlujo, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import type { CategoriaGastoDto, CategoriasRespuestaDto } from './dto/categorias-respuesta.dto.js';
import type { PeriodoQueryDto } from './dto/periodo-query.dto.js';
import type { PeriodoRespuestaDto } from './dto/periodo-respuesta.dto.js';
import { type Periodo, resolverPeriodo } from './periodo.js';

/** Las fechas se guardan a medianoche UTC del día indicado, así que un día YYYY-MM-DD se compara tal cual. */
const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

const SIN_CATEGORIA = 'Sin categoría';

const porTotalYNombre = (a: CategoriaGastoDto, b: CategoriaGastoDto) =>
  b.total - a.total || a.nombre.localeCompare(b.nombre, 'es');

@Injectable()
export class ReportesService {
  constructor(
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
    @Inject(CategoriasService) private readonly categorias: CategoriasService,
  ) {}

  /**
   * Resumen numérico del periodo (RF-13, RF-14, RF-20) con la regla de flujo de caja de ADR-014. Se calcula al
   * consultar, no se guarda, así que crear, editar o eliminar un movimiento se refleja de inmediato. Las peticiones
   * inválidas se rechazan antes de consultar la base. Los totales conservan la precisión completa (RNF-11).
   */
  async obtenerPorPeriodo(usuarioId: string, consulta: PeriodoQueryDto, zona?: string): Promise<PeriodoRespuestaDto> {
    const periodo = resolverPeriodo(consulta, new Date(), zona);
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

  /**
   * Distribución del gasto propio del periodo por categoría (RF-18). Solo cuenta egresos ordinarios (ADR-014: los
   * pagos de tarjeta y los abonos se excluyen para no contar dos veces). El gasto cuya categoría ya no se encuentra,
   * o que no tiene, se reúne en una entrada "Sin categoría" para que las entradas siempre sumen el total.
   */
  async obtenerPorCategoria(
    usuarioId: string,
    consulta: PeriodoQueryDto,
    zona?: string,
  ): Promise<CategoriasRespuestaDto> {
    const periodo = resolverPeriodo(consulta, new Date(), zona);
    const grupos = await this.sumarGastoPorCategoria(usuarioId, periodo);
    const nombres = await this.categorias.obtenerPorIds(grupos.flatMap(({ _id }) => (_id ? [String(_id)] : [])));

    const total = grupos.reduce((suma, { total: gastado }) => suma + gastado, 0);
    const entradas: CategoriaGastoDto[] = [];
    let sinCategoria = 0;
    for (const { _id, total: gastado } of grupos) {
      const categoria = _id ? nombres.get(String(_id)) : undefined;
      if (categoria) {
        entradas.push({ categoriaId: String(categoria._id), nombre: categoria.nombre, total: gastado, porcentaje: 0 });
      } else {
        sinCategoria += gastado;
      }
    }
    if (sinCategoria > 0) {
      entradas.push({ categoriaId: null, nombre: SIN_CATEGORIA, total: sinCategoria, porcentaje: 0 });
    }

    const categorias = entradas
      .map((entrada) => ({ ...entrada, porcentaje: (entrada.total / total) * 100 }))
      .sort(porTotalYNombre);
    return { ...periodo, total, categorias };
  }

  private sumarGastoPorCategoria(usuarioId: string, { desde, hasta }: Periodo) {
    return this.transacciones.aggregate<{ _id: Types.ObjectId | null; total: number }>([
      {
        $match: {
          usuarioId: new Types.ObjectId(usuarioId),
          tipo: TipoTransaccion.EGRESO,
          clasificacionFlujo: ClasificacionFlujo.ORDINARIO,
          fecha: { $gte: aFecha(desde), $lte: aFecha(hasta) },
        },
      },
      { $group: { _id: '$categoriaId', total: { $sum: '$monto' } } },
    ]);
  }
}

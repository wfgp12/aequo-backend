import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { CategoriasService } from '../categorias/categorias.service.js';
import { ClasificacionFlujo, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import type { CategoriaGastoDto, CategoriasRespuestaDto } from './dto/categorias-respuesta.dto.js';
import { type ComparacionQueryDto, TipoComparacion } from './dto/comparacion-query.dto.js';
import type { ComparacionRespuestaDto, PeriodoComparacionDto } from './dto/comparacion-respuesta.dto.js';
import type { EvolucionQueryDto } from './dto/evolucion-query.dto.js';
import type { EvolucionRespuestaDto } from './dto/evolucion-respuesta.dto.js';
import type { PeriodoQueryDto } from './dto/periodo-query.dto.js';
import type { PeriodoRespuestaDto } from './dto/periodo-respuesta.dto.js';
import { type Periodo, resolverPeriodo } from './periodo.js';
import { mesesEntre, validarRangoDeMeses } from './rango-meses.js';

/** Las fechas se guardan a medianoche UTC del día indicado, así que un día YYYY-MM-DD se compara tal cual. */
const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

const SIN_CATEGORIA = 'Sin categoría';

interface Totales {
  ingresos: number;
  egresos: number;
  pagosTarjeta: number;
  abonosDeuda: number;
  dineroRecibido: number;
}

const totalesVacios = (): Totales => ({ ingresos: 0, egresos: 0, pagosTarjeta: 0, abonosDeuda: 0, dineroRecibido: 0 });

/** Regla de flujo de caja (ADR-014): suma un movimiento en el total que le corresponde. Compartida por el resumen y la evolución. */
function sumarMovimiento(
  totales: Totales,
  { tipo, monto, clasificacionFlujo }: Pick<Transaccion, 'tipo' | 'monto' | 'clasificacionFlujo'>,
): void {
  if (clasificacionFlujo === ClasificacionFlujo.PAGO_TARJETA) totales.pagosTarjeta += monto;
  else if (clasificacionFlujo === ClasificacionFlujo.ABONO_DEUDA) totales.abonosDeuda += monto;
  else if (clasificacionFlujo === ClasificacionFlujo.DINERO_RECIBIDO) totales.dineroRecibido += monto;
  else if (tipo === TipoTransaccion.INGRESO) totales.ingresos += monto;
  else totales.egresos += monto;
}

/** El dinero que entró o salió de verdad: el dinero recibido no suma. */
const balanceDe = (t: Totales) => t.ingresos - t.egresos - t.pagosTarjeta - t.abonosDeuda;

const porTotalYNombre = (a: CategoriaGastoDto, b: CategoriaGastoDto) =>
  b.total - a.total || a.nombre.localeCompare(b.nombre, 'es');

/**
 * Rango efectivo de una serie por meses: los extremos que no se envían son el primer y el último mes con movimientos.
 * Devuelve también los meses con movimientos dentro del rango (en orden), o `null` si no hay ninguno.
 */
function rangoEfectivo(mesesConMovimientos: string[], desde?: string, hasta?: string) {
  const meses = [...mesesConMovimientos].sort((a, b) => a.localeCompare(b));
  const inicio = desde ?? meses[0];
  const fin = hasta ?? meses.at(-1);
  if (!inicio || !fin || inicio > fin) return null;
  validarRangoDeMeses(inicio, fin);

  const dentro = meses.filter((mes) => mes >= inicio && mes <= fin);
  return dentro.length > 0 ? { desde: inicio, hasta: fin, meses: dentro } : null;
}

/** Las cifras de un mes para la comparación de balance o de ingresos y egresos. */
const resumenDelMes = (tipo: TipoComparacion, periodo: string, totales: Totales): PeriodoComparacionDto =>
  tipo === TipoComparacion.BALANCE
    ? { periodo, balance: balanceDe(totales) }
    : { periodo, ingresos: totales.ingresos, egresos: totales.egresos };

/**
 * Reparte el gasto por categoría: total, porcentaje de cada una y entrada "Sin categoría" para el gasto cuya categoría
 * no se encuentra. Compartida por el reporte por categoría y la comparación, para que sus cifras coincidan.
 */
function distribuirGasto(
  grupos: { _id: Types.ObjectId | null; total: number }[],
  nombres: Map<string, { _id: unknown; nombre: string }>,
): { total: number; categorias: CategoriaGastoDto[] } {
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
  return { total, categorias };
}

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

    const totales = totalesVacios();
    for (const movimiento of movimientos) sumarMovimiento(totales, movimiento);
    return { ...periodo, ...totales, balance: balanceDe(totales) };
  }

  /**
   * Evolución del balance mes a mes (RF-19): un punto por cada mes del rango, con los meses vacíos en 0. Usa la misma
   * regla de flujo de caja que `obtenerPorPeriodo` (ADR-014), así que cada punto coincide con el resumen de su mes. Sin
   * `desde` o `hasta`, el extremo es el primer o el último mes con movimientos del usuario; el mes actual no se agrega.
   * Un rango sin movimientos no es un error: responde la serie vacía con los extremos que se enviaron.
   */
  async obtenerEvolucion(usuarioId: string, { desde, hasta }: EvolucionQueryDto): Promise<EvolucionRespuestaDto> {
    if (desde && hasta) validarRangoDeMeses(desde, hasta);
    const totales = await this.totalesPorMes(usuarioId);
    const rango = rangoEfectivo([...totales.keys()], desde, hasta);
    if (!rango) return { desde: desde ?? null, hasta: hasta ?? null, puntos: [] };

    const puntos = mesesEntre(rango.desde, rango.hasta).map((periodo) => {
      const delMes = totales.get(periodo);
      return { periodo, balance: delMes ? balanceDe(delMes) : 0 };
    });
    return { desde: rango.desde, hasta: rango.hasta, puntos };
  }

  /**
   * Comparación entre meses (RF-15, RF-16): una fila por cada mes del rango con al menos un movimiento de cualquier
   * clase, del más antiguo al más reciente, con las cifras del `tipo` pedido. Las reglas del rango son las de la
   * evolución, y las cifras de cada mes las mismas de `obtenerPorPeriodo` y `obtenerPorCategoria` (ADR-014).
   */
  async compararPeriodos(
    usuarioId: string,
    { tipo, desde, hasta }: ComparacionQueryDto,
  ): Promise<ComparacionRespuestaDto> {
    if (desde && hasta) validarRangoDeMeses(desde, hasta);
    const totales = await this.totalesPorMes(usuarioId);
    const rango = rangoEfectivo([...totales.keys()], desde, hasta);
    if (!rango) return { tipo, desde: desde ?? null, hasta: hasta ?? null, periodos: [] };

    const periodos =
      tipo === TipoComparacion.CATEGORIA
        ? await this.categoriasPorMes(usuarioId, rango.meses)
        : rango.meses.map((periodo) => resumenDelMes(tipo, periodo, totales.get(periodo) ?? totalesVacios()));
    return { tipo, desde: rango.desde, hasta: rango.hasta, periodos };
  }

  /** Totales por clase de cada mes (`YYYY-MM`, en UTC) con movimientos del usuario; MongoDB suma por mes, tipo y flujo. */
  private async totalesPorMes(usuarioId: string): Promise<Map<string, Totales>> {
    const grupos = await this.transacciones.aggregate<{
      _id: { mes: string; tipo: TipoTransaccion; clasificacionFlujo: ClasificacionFlujo };
      monto: number;
    }>([
      { $match: { usuarioId: new Types.ObjectId(usuarioId) } },
      {
        $group: {
          _id: {
            mes: { $dateToString: { format: '%Y-%m', date: '$fecha' } },
            tipo: '$tipo',
            clasificacionFlujo: '$clasificacionFlujo',
          },
          monto: { $sum: '$monto' },
        },
      },
    ]);

    const totalesPorMes = new Map<string, Totales>();
    for (const { _id, monto } of grupos) {
      const totales = totalesPorMes.get(_id.mes) ?? totalesVacios();
      sumarMovimiento(totales, { ..._id, monto });
      totalesPorMes.set(_id.mes, totales);
    }
    return totalesPorMes;
  }

  /** Gasto propio de cada mes dado, repartido por categoría con la misma lógica de `obtenerPorCategoria`. */
  private async categoriasPorMes(usuarioId: string, meses: string[]): Promise<PeriodoComparacionDto[]> {
    const grupos = (
      await this.transacciones.aggregate<{ _id: { mes: string; categoriaId: Types.ObjectId | null }; total: number }>([
        {
          $match: {
            usuarioId: new Types.ObjectId(usuarioId),
            tipo: TipoTransaccion.EGRESO,
            clasificacionFlujo: ClasificacionFlujo.ORDINARIO,
          },
        },
        {
          $group: {
            _id: { mes: { $dateToString: { format: '%Y-%m', date: '$fecha' } }, categoriaId: '$categoriaId' },
            total: { $sum: '$monto' },
          },
        },
      ])
    ).filter(({ _id }) => meses.includes(_id.mes));
    const ids = new Set(grupos.flatMap(({ _id }) => (_id.categoriaId ? [String(_id.categoriaId)] : [])));
    const nombres = await this.categorias.obtenerPorIds([...ids]);

    return meses.map((periodo) => {
      const delMes = grupos
        .filter(({ _id }) => _id.mes === periodo)
        .map(({ _id, total }) => ({ _id: _id.categoriaId, total }));
      return { periodo, ...distribuirGasto(delMes, nombres) };
    });
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

    return { ...periodo, ...distribuirGasto(grupos, nombres) };
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

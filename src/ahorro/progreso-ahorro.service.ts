import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { ReportesService } from '../reportes/reportes.service.js';
import type { AcumuladoQueryDto } from './dto/acumulado-query.dto.js';
import type { AcumuladoRespuestaDto } from './dto/acumulado-respuesta.dto.js';
import type { ProgresoQueryDto } from './dto/progreso-query.dto.js';
import type { MetaProgresoDto, ProgresoRespuestaDto } from './dto/progreso-respuesta.dto.js';
import { TipoMeta } from './meta-ahorro.enums.js';
import { MetaAhorro } from './meta-ahorro.schema.js';

/** El periodo de una meta es el día 1 de su mes a medianoche UTC. */
const aPeriodo = (mes: string) => new Date(`${mes}-01T00:00:00.000Z`);

/** Monto de la meta en pesos: el valor fijo, o el porcentaje del ingreso propio. Sin redondear (RNF-11). */
const montoDeMeta = ({ tipoMeta, valorObjetivo }: MetaAhorro, ingresoPropio: number) =>
  tipoMeta === TipoMeta.PORCENTAJE ? (ingresoPropio * valorObjetivo) / 100 : valorObjetivo;

@Injectable()
export class ProgresoAhorroService {
  constructor(
    @InjectModel(MetaAhorro.name) private readonly metas: Model<MetaAhorro>,
    @Inject(ReportesService) private readonly reportes: ReportesService,
  ) {}

  /**
   * Progreso del mes hacia la meta (RF-22). Solo lee: las cifras salen del reporte del periodo, así se aplica una
   * sola vez la regla de flujo de caja (ADR-014), y la meta del mes se compara con el ahorro resultante.
   */
  async obtenerProgreso(usuarioId: string, { mes }: ProgresoQueryDto, zona?: string): Promise<ProgresoRespuestaDto> {
    const reporte = await this.reportes.obtenerPorPeriodo(usuarioId, { mes }, zona);
    const periodo = reporte.desde.slice(0, 7);
    const ingresoPropio = reporte.ingresos;
    const egresos = reporte.egresos + reporte.pagosTarjeta + reporte.abonosDeuda;
    const ahorroDelMes = reporte.balance;

    const guardada = await this.metas.findOne({
      usuarioId: new Types.ObjectId(usuarioId),
      periodo: aPeriodo(periodo),
    });
    const montoMeta = guardada ? montoDeMeta(guardada, ingresoPropio) : 0;
    const meta: MetaProgresoDto | null = guardada
      ? {
          id: guardada.id,
          tipoMeta: guardada.tipoMeta,
          valorObjetivo: guardada.valorObjetivo,
          montoMeta,
        }
      : null;

    return {
      periodo,
      ingresoPropio,
      egresos,
      ahorroDelMes,
      meta,
      disponible: ingresoPropio - egresos - montoMeta,
      porcentajeAvance: montoMeta === 0 ? null : (ahorroDelMes / montoMeta) * 100,
    };
  }

  /**
   * Ahorro real acumulado (RF-23): suma el `ahorroReal` guardado en cada meta del usuario, de la más antigua a la más
   * reciente y, si llega `hasta`, hasta ese mes inclusive. Los meses sin meta no aparecen ni aportan.
   */
  async obtenerAcumulado(usuarioId: string, { hasta }: AcumuladoQueryDto): Promise<AcumuladoRespuestaDto> {
    const metas = await this.metas
      .find({
        usuarioId: new Types.ObjectId(usuarioId),
        ...(hasta ? { periodo: { $lte: aPeriodo(hasta) } } : {}),
      })
      .sort({ periodo: 1 });

    let acumulado = 0;
    const meses = metas.map(({ periodo, ahorroReal }) => {
      acumulado += ahorroReal;
      return {
        periodo: periodo.toISOString().slice(0, 7),
        ahorroReal,
        acumulado,
      };
    });
    return { total: acumulado, meses };
  }
}

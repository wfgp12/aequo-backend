import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { CategoriaDocument } from '../categorias/categoria.schema.js';
import { aCategoriaResumen, CategoriasService } from '../categorias/categorias.service.js';
import { codificarCursor, decodificarCursor } from './cursor.js';
import type { CrearTransaccionDto } from './dto/crear-transaccion.dto.js';
import { LIMITE_POR_DEFECTO, type ListarTransaccionesQueryDto } from './dto/listar-transacciones-query.dto.js';
import type { PaginaTransaccionesRespuestaDto } from './dto/pagina-transacciones-respuesta.dto.js';
import type { TransaccionRespuestaDto } from './dto/transaccion-respuesta.dto.js';
import { ClasificacionFlujo } from './transaccion.enums.js';
import { Transaccion, type TransaccionDocument } from './transaccion.schema.js';

/** Las fechas se guardan a medianoche UTC del día indicado, así que un día YYYY-MM-DD se compara tal cual. */
const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/**
 * Lo que el cliente puede ver de una transacción, con su categoría (para mostrar el nombre sin otra petición).
 * La fecha sale como YYYY-MM-DD, sin hora ni zona.
 */
export function aTransaccionRespuesta(
  transaccion: TransaccionDocument,
  categoria: CategoriaDocument | null,
): TransaccionRespuestaDto {
  return {
    id: transaccion.id,
    tipo: transaccion.tipo,
    monto: transaccion.monto,
    fecha: transaccion.fecha.toISOString().slice(0, 10),
    categoriaId: transaccion.categoriaId?.toString() ?? null,
    categoria: categoria ? aCategoriaResumen(categoria) : null,
    metodoPago: transaccion.metodoPago,
    descripcion: transaccion.descripcion,
    clasificacionFlujo: transaccion.clasificacionFlujo,
    creadaEn: transaccion.createdAt.toISOString(),
  };
}

@Injectable()
export class TransaccionesService {
  constructor(
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
    @Inject(CategoriasService) private readonly categorias: CategoriasService,
  ) {}

  /**
   * Registra una transacción ordinaria del usuario. La categoría debe existir, ser general o del usuario y ser del
   * mismo tipo que el movimiento. El balance del periodo no se guarda: se calcula al consultarlo, así que crear la
   * transacción ya lo refleja. La fecha se guarda a medianoche UTC del día indicado.
   */
  async crear(usuarioId: string, dto: CrearTransaccionDto): Promise<TransaccionRespuestaDto> {
    const categoria = await this.categorias.obtenerDisponible(usuarioId, dto.categoriaId);
    if (!categoria || categoria.tipo !== dto.tipo) {
      throw new BadRequestException([
        'categoriaId debe ser una categoría general o tuya del mismo tipo que el movimiento',
      ]);
    }
    const transaccion = await this.transacciones.create({
      usuarioId: new Types.ObjectId(usuarioId),
      tipo: dto.tipo,
      monto: dto.monto,
      fecha: aFecha(dto.fecha),
      categoriaId: categoria._id,
      metodoPago: dto.metodoPago,
      descripcion: dto.descripcion ?? '',
      clasificacionFlujo: ClasificacionFlujo.ORDINARIO,
    });
    return aTransaccionRespuesta(transaccion, categoria);
  }

  /**
   * Una página de las transacciones del usuario, de la más reciente a la más antigua. La paginación es por cursor
   * (la posición de la última entregada) para que sea estable aunque se registren movimientos mientras se hace scroll.
   * Se pide una más del límite para saber si hay otra página sin hacer un conteo.
   */
  async listar(usuarioId: string, consulta: ListarTransaccionesQueryDto): Promise<PaginaTransaccionesRespuestaDto> {
    const { desde, hasta, tipo, categoriaId, metodoPago, cursor } = consulta;
    const limite = consulta.limite ?? LIMITE_POR_DEFECTO;
    if (desde && hasta && desde > hasta) {
      throw new BadRequestException(['desde no puede ser posterior a hasta']);
    }
    const posicion = cursor ? decodificarCursor(cursor) : null;
    if (cursor && !posicion) {
      throw new BadRequestException(['cursor no es válido: usa el siguienteCursor de la página anterior']);
    }

    const condiciones: Array<Record<string, unknown>> = [{ usuarioId: new Types.ObjectId(usuarioId) }];
    if (tipo) condiciones.push({ tipo });
    if (categoriaId) condiciones.push({ categoriaId: new Types.ObjectId(categoriaId) });
    if (metodoPago) condiciones.push({ metodoPago });
    if (desde) condiciones.push({ fecha: { $gte: aFecha(desde) } });
    if (hasta) condiciones.push({ fecha: { $lte: aFecha(hasta) } });
    if (posicion) {
      condiciones.push({
        $or: [
          { fecha: { $lt: posicion.fecha } },
          { fecha: posicion.fecha, _id: { $lt: new Types.ObjectId(posicion.id) } },
        ],
      });
    }

    const encontradas = await this.transacciones
      .find({ $and: condiciones })
      .sort({ fecha: -1, _id: -1 })
      .limit(limite + 1);
    const pagina = encontradas.slice(0, limite);

    const ids = [...new Set(pagina.flatMap((t) => (t.categoriaId ? [String(t.categoriaId)] : [])))];
    const categorias = await this.categorias.obtenerPorIds(ids);
    const ultima = pagina.at(-1);
    return {
      items: pagina.map((t) => aTransaccionRespuesta(t, t.categoriaId ? (categorias.get(String(t.categoriaId)) ?? null) : null)),
      siguienteCursor: encontradas.length > limite && ultima ? codificarCursor(ultima.fecha, ultima.id) : null,
    };
  }
}

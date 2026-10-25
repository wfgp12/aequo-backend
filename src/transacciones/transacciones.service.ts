import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { CategoriaDocument } from '../categorias/categoria.schema.js';
import { aCategoriaResumen, CategoriasService } from '../categorias/categorias.service.js';
import type { CrearTransaccionDto } from './dto/crear-transaccion.dto.js';
import type { TransaccionRespuestaDto } from './dto/transaccion-respuesta.dto.js';
import { ClasificacionFlujo } from './transaccion.enums.js';
import { Transaccion, type TransaccionDocument } from './transaccion.schema.js';

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
      fecha: new Date(`${dto.fecha}T00:00:00.000Z`),
      categoriaId: categoria._id,
      metodoPago: dto.metodoPago,
      descripcion: dto.descripcion ?? '',
      clasificacionFlujo: ClasificacionFlujo.ORDINARIO,
    });
    return aTransaccionRespuesta(transaccion, categoria);
  }
}

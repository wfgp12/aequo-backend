import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { CrearTransaccionDto } from './dto/crear-transaccion.dto.js';
import type { TransaccionRespuestaDto } from './dto/transaccion-respuesta.dto.js';
import { ClasificacionFlujo } from './transaccion.enums.js';
import { Transaccion, type TransaccionDocument } from './transaccion.schema.js';

/** Lo que el cliente puede ver de una transacción. La fecha sale como YYYY-MM-DD, sin hora ni zona. */
export function aTransaccionRespuesta(transaccion: TransaccionDocument): TransaccionRespuestaDto {
  return {
    id: transaccion.id,
    tipo: transaccion.tipo,
    monto: transaccion.monto,
    fecha: transaccion.fecha.toISOString().slice(0, 10),
    categoriaId: transaccion.categoriaId?.toString() ?? null,
    metodoPago: transaccion.metodoPago,
    descripcion: transaccion.descripcion,
    clasificacionFlujo: transaccion.clasificacionFlujo,
    creadaEn: transaccion.createdAt.toISOString(),
  };
}

@Injectable()
export class TransaccionesService {
  constructor(@InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>) {}

  /**
   * Registra una transacción ordinaria del usuario. El balance del periodo no se guarda: se calcula al
   * consultarlo, así que crear la transacción ya lo refleja. La fecha se guarda a medianoche UTC del día indicado.
   */
  async crear(usuarioId: string, dto: CrearTransaccionDto): Promise<TransaccionRespuestaDto> {
    const transaccion = await this.transacciones.create({
      usuarioId: new Types.ObjectId(usuarioId),
      tipo: dto.tipo,
      monto: dto.monto,
      fecha: new Date(`${dto.fecha}T00:00:00.000Z`),
      categoriaId: new Types.ObjectId(dto.categoriaId),
      metodoPago: dto.metodoPago,
      descripcion: dto.descripcion ?? '',
      clasificacionFlujo: ClasificacionFlujo.ORDINARIO,
    });
    return aTransaccionRespuesta(transaccion);
  }
}

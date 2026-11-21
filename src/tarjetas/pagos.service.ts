import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { diaEnZona } from '../common/zona-horaria.js';
import { ClasificacionFlujo, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion, type TransaccionDocument } from '../transacciones/transaccion.schema.js';
import { type CrearPagoDto, DESCRIPCION_PAGO, METODO_PAGO_POR_DEFECTO } from './dto/crear-pago.dto.js';
import type { ListarPagosQueryDto } from './dto/listar-pagos-query.dto.js';
import type { PagoRegistradoRespuestaDto, PagoRespuestaDto } from './dto/pago-respuesta.dto.js';
import { aFecha } from './fechas.js';
import { TarjetasService } from './tarjetas.service.js';

const MENSAJES = { pagoNoEncontrado: 'Pago no encontrado' };

/** Lo que el cliente puede ver de un pago: sin usuario, `_id`, `__v`, tipo, monto ni clasificación. */
export function aPagoRespuesta(pago: TransaccionDocument): PagoRespuestaDto {
  return {
    id: pago.id,
    tarjetaId: String(pago.tarjetaId),
    valor: pago.monto,
    fecha: pago.fecha.toISOString().slice(0, 10),
    metodoPago: pago.metodoPago,
    descripcion: pago.descripcion,
    creadaEn: pago.createdAt.toISOString(),
  };
}

/**
 * Pagos de una tarjeta (RF-32). Un pago **es** una transacción de egreso `PAGO_TARJETA` con el `tarjetaId` y sin
 * categoría (ADR-014): afecta el balance del mes de su fecha y no el gasto por categoría. No hay colección propia.
 * La escritura es una sola, así que no hay nada que compensar si falla.
 */
@Injectable()
export class PagosService {
  constructor(
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
    @Inject(TarjetasService) private readonly tarjetas: TarjetasService,
  ) {}

  /**
   * Registra un pago en una tarjeta propia y lo compara con el total estimado del mes de su fecha. La comparación
   * reutiliza la proyección (no se calcula otra vez) y ya incluye el pago nuevo.
   */
  async registrar(
    usuarioId: string,
    tarjetaId: string,
    dto: CrearPagoDto,
    zona: string,
  ): Promise<PagoRegistradoRespuestaDto> {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    // Sin categoría ni deuda (valores por defecto null): el pago no cuenta por categoría.
    const pago = await this.transacciones.create({
      usuarioId: tarjeta.usuarioId,
      tipo: TipoTransaccion.EGRESO,
      monto: dto.valor,
      fecha: aFecha(dto.fecha ?? diaEnZona(new Date(), zona)),
      metodoPago: dto.metodoPago ?? METODO_PAGO_POR_DEFECTO,
      descripcion: dto.descripcion ?? DESCRIPCION_PAGO,
      clasificacionFlujo: ClasificacionFlujo.PAGO_TARJETA,
      tarjetaId: tarjeta._id,
    });
    const mes = pago.fecha.toISOString().slice(0, 7);
    const {
      total: estimado,
      pagado,
      diferencia,
    } = await this.tarjetas.proyectarPagos(usuarioId, tarjetaId, { mes }, zona);
    return { ...aPagoRespuesta(pago), comparacion: { mes, estimado, pagado, diferencia } };
  }

  /** Los pagos de una tarjeta propia, el más reciente primero, con filtro opcional por el mes de su fecha. */
  async listar(usuarioId: string, tarjetaId: string, { mes }: ListarPagosQueryDto): Promise<PagoRespuestaDto[]> {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    return (await this.tarjetas.pagosDe(tarjeta, mes)).map(aPagoRespuesta);
  }

  /** Elimina un pago propio de esa tarjeta; una transacción que no es un pago suyo da 404 y no se toca. */
  async eliminar(usuarioId: string, tarjetaId: string, id: string): Promise<void> {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const eliminado = await this.transacciones.findOneAndDelete({
      _id: new Types.ObjectId(id),
      usuarioId: tarjeta.usuarioId,
      tarjetaId: tarjeta._id,
      clasificacionFlujo: ClasificacionFlujo.PAGO_TARJETA,
    });
    if (!eliminado) throw new NotFoundException(MENSAJES.pagoNoEncontrado);
  }
}

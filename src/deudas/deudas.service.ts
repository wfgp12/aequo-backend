import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { aFecha } from '../tarjetas/fechas.js';
import { ClasificacionFlujo, MetodoPago, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion, type TransaccionDocument } from '../transacciones/transaccion.schema.js';
import { TipoInteres } from './deuda.enums.js';
import { Deuda, type DeudaDocument, INTERCALACION_ACREEDOR } from './deuda.schema.js';
import type {
  DeudaListadaRespuestaDto,
  DeudaRespuestaDto,
  PrestamoRegistradoRespuestaDto,
  PrestamoRespuestaDto,
} from './dto/deuda-respuesta.dto.js';
import { DESCRIPCION_PRESTAMO, type RegistrarPrestamoDto } from './dto/registrar-prestamo.dto.js';

const MENSAJES = {
  deudaNoEncontrada: 'Deuda no encontrada',
  prestamoNoEncontrado: 'Préstamo no encontrado',
  otroInteres: 'Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo',
  registroSimultaneo: 'Ya se está registrando un préstamo de esa persona: vuelve a intentarlo',
  unicoConAbonos: 'No puedes eliminar el único préstamo de una deuda con abonos',
};

function aDeudaRespuesta(deuda: DeudaDocument): DeudaRespuestaDto {
  return {
    id: deuda.id,
    acreedor: deuda.acreedor,
    tipoInteres: deuda.tipoInteres,
    valorInteres: deuda.valorInteres,
    saldada: deuda.saldada,
    creadaEn: deuda.createdAt.toISOString(),
  };
}

function aPrestamoRespuesta(prestamo: TransaccionDocument): PrestamoRespuestaDto {
  return {
    id: prestamo.id,
    monto: prestamo.monto,
    fecha: prestamo.fecha.toISOString().slice(0, 10),
    descripcion: prestamo.descripcion,
    creadaEn: prestamo.createdAt.toISOString(),
  };
}

/** Una deuda tiene un solo interés: si el préstamo indica alguno, debe ser el mismo (lo omitido es sin interés y 0). */
function exigirMismoInteres(deuda: DeudaDocument, { tipoInteres, valorInteres }: RegistrarPrestamoDto): void {
  if (tipoInteres === undefined && valorInteres === undefined) return;
  const mismo =
    deuda.tipoInteres === (tipoInteres ?? TipoInteres.SIN_INTERES) && deuda.valorInteres === (valorInteres ?? 0);
  if (!mismo) throw new ConflictException(MENSAJES.otroInteres);
}

/**
 * Deudas y préstamos recibidos (RF-34 a RF-36). Un préstamo **es** una transacción de ingreso `DINERO_RECIBIDO` con
 * `deudaId` (ADR-014): no es ingreso propio y la deuda no guarda montos. La atomicidad entre la deuda y su transacción
 * es por compensación, como en los avances: si falla la segunda escritura se deshace la primera.
 * ponytail: un corte del proceso entre las dos, o dos peticiones simultáneas sobre la misma deuda (borrar y sumar),
 * puede dejar una deuda sin préstamos o un préstamo sin deuda; cerrarlo pide transacciones de MongoDB.
 */
@Injectable()
export class DeudasService {
  constructor(
    @InjectModel(Deuda.name) private readonly deudas: Model<Deuda>,
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
  ) {}

  /** Suma el préstamo a la deuda activa de ese acreedor o, si no hay, la crea (una saldada no recibe montos). */
  async registrarPrestamo(usuarioId: string, dto: RegistrarPrestamoDto): Promise<PrestamoRegistradoRespuestaDto> {
    const usuario = new Types.ObjectId(usuarioId);
    const existente = await this.deudas
      .findOne({ usuarioId: usuario, acreedor: dto.acreedor, saldada: false })
      .collation(INTERCALACION_ACREEDOR);
    if (existente) exigirMismoInteres(existente, dto);
    const deuda = existente ?? (await this.crearDeuda(usuario, dto));
    try {
      const prestamo = await this.transacciones.create({
        usuarioId: usuario,
        tipo: TipoTransaccion.INGRESO,
        monto: dto.monto,
        fecha: aFecha(dto.fecha),
        metodoPago: MetodoPago.EFECTIVO,
        descripcion: dto.descripcion ?? DESCRIPCION_PRESTAMO,
        clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO,
        deudaId: deuda._id,
      });
      return { deudaCreada: !existente, deuda: aDeudaRespuesta(deuda), prestamo: aPrestamoRespuesta(prestamo) };
    } catch (error) {
      if (!existente) await this.deudas.deleteOne({ _id: deuda._id });
      throw error;
    }
  }

  /** Todas las deudas del usuario (por acreedor; a igual nombre, la más nueva primero) con sus préstamos. */
  async listar(usuarioId: string): Promise<DeudaListadaRespuestaDto[]> {
    const usuario = new Types.ObjectId(usuarioId);
    const deudas = await this.deudas
      .find({ usuarioId: usuario })
      .sort({ acreedor: 1, createdAt: -1, _id: -1 })
      .collation(INTERCALACION_ACREEDOR);
    const prestamos = await this.transacciones
      .find({
        usuarioId: usuario,
        deudaId: { $in: deudas.map((deuda) => deuda._id) },
        clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO,
      })
      .sort({ fecha: -1, createdAt: -1, _id: -1 });
    return deudas.map((deuda) => ({
      ...aDeudaRespuesta(deuda),
      prestamos: prestamos.filter((p) => String(p.deudaId) === deuda.id).map(aPrestamoRespuesta),
    }));
  }

  /** Deshace un préstamo mal registrado. Si era el único, se va también la deuda, salvo que ya tenga abonos (409). */
  async eliminarPrestamo(usuarioId: string, deudaId: string, prestamoId: string): Promise<void> {
    const usuario = new Types.ObjectId(usuarioId);
    const deuda = await this.deudas.findOne({ _id: new Types.ObjectId(deudaId), usuarioId: usuario });
    if (!deuda) throw new NotFoundException(MENSAJES.deudaNoEncontrada);

    const deLaDeuda = { usuarioId: usuario, deudaId: deuda._id };
    const prestamos = { ...deLaDeuda, clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO };
    const prestamo = await this.transacciones.findOne({ _id: new Types.ObjectId(prestamoId), ...prestamos });
    if (!prestamo) throw new NotFoundException(MENSAJES.prestamoNoEncontrado);

    const esElUnico = (await this.transacciones.countDocuments(prestamos)) === 1;
    if (esElUnico) await this.exigirSinAbonos(deLaDeuda);

    await this.transacciones.deleteOne({ _id: prestamo._id });
    if (!esElUnico) return;
    try {
      await this.deudas.deleteOne({ _id: deuda._id });
    } catch (error) {
      // Se recrea con el mismo _id: la deuda no puede quedar sin su préstamo.
      await this.transacciones.create(prestamo.toObject());
      throw error;
    }
  }

  private async exigirSinAbonos(deLaDeuda: { usuarioId: Types.ObjectId; deudaId: Types.ObjectId }): Promise<void> {
    const abono = await this.transacciones.exists({ ...deLaDeuda, clasificacionFlujo: ClasificacionFlujo.ABONO_DEUDA });
    if (abono) throw new ConflictException(MENSAJES.unicoConAbonos);
  }

  /** El índice único de la deuda activa frena las carreras: su error de clave duplicada (11000) es un 409. */
  private async crearDeuda(usuarioId: Types.ObjectId, { acreedor, tipoInteres, valorInteres }: RegistrarPrestamoDto) {
    try {
      return await this.deudas.create({ usuarioId, acreedor, tipoInteres, valorInteres });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) throw new ConflictException(MENSAJES.registroSimultaneo);
      throw error;
    }
  }
}

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
import { conCodigo } from '../common/errores.catalogo.js';

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
  if (!mismo) throw conCodigo('DEUDA_INTERES_DISTINTO', new ConflictException(MENSAJES.otroInteres));
}

/**
 * Deudas y préstamos recibidos (RF-34 a RF-36). Un préstamo **es** una transacción de ingreso `DINERO_RECIBIDO` con
 * `deudaId` (ADR-014): no es ingreso propio y la deuda no guarda montos. La atomicidad entre la deuda y su transacción
 * es por compensación, como en los avances: si falla la segunda escritura se deshace la primera.
 * ponytail: las escrituras sobre una misma deuda van en una fila en memoria, que solo protege con un único proceso; un
 * corte entre las dos escrituras o varias instancias piden transacciones de MongoDB. Los abonos (6.2.1) deben pasar por
 * la misma fila.
 */
@Injectable()
export class DeudasService {
  /** Última tarea en la fila de cada deuda (por id). */
  private readonly filas = new Map<string, Promise<unknown>>();

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
    // La deuda nueva no hace fila: dos creaciones simultáneas las frena el índice único (409).
    if (!existente) return this.guardarPrestamo(await this.crearDeuda(usuario, dto), dto, true);
    exigirMismoInteres(existente, dto);
    const registrado = await this.enFila(existente.id, async () =>
      (await this.deudas.exists({ _id: existente._id })) ? this.guardarPrestamo(existente, dto, false) : null,
    );
    // Si la eliminaron mientras esperaba el turno, se empieza de nuevo (fuera de la fila).
    return registrado ?? this.registrarPrestamo(usuarioId, dto);
  }

  /** Guarda la transacción del préstamo; si falla y la deuda se acababa de crear, la deshace. */
  private async guardarPrestamo(
    deuda: DeudaDocument,
    dto: RegistrarPrestamoDto,
    deudaCreada: boolean,
  ): Promise<PrestamoRegistradoRespuestaDto> {
    try {
      const prestamo = await this.transacciones.create({
        usuarioId: deuda.usuarioId,
        tipo: TipoTransaccion.INGRESO,
        monto: dto.monto,
        fecha: aFecha(dto.fecha),
        metodoPago: MetodoPago.EFECTIVO,
        descripcion: dto.descripcion ?? DESCRIPCION_PRESTAMO,
        clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO,
        deudaId: deuda._id,
      });
      return { deudaCreada, deuda: aDeudaRespuesta(deuda), prestamo: aPrestamoRespuesta(prestamo) };
    } catch (error) {
      if (deudaCreada) await this.deudas.deleteOne({ _id: deuda._id });
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
  eliminarPrestamo(usuarioId: string, deudaId: string, prestamoId: string): Promise<void> {
    // La ruta admite el id en mayúsculas: la clave de la fila es la forma canónica.
    return this.enFila(new Types.ObjectId(deudaId).toString(), () =>
      this.eliminarEnTurno(usuarioId, deudaId, prestamoId),
    );
  }

  private async eliminarEnTurno(usuarioId: string, deudaId: string, prestamoId: string): Promise<void> {
    const usuario = new Types.ObjectId(usuarioId);
    const deuda = await this.deudas.findOne({ _id: new Types.ObjectId(deudaId), usuarioId: usuario });
    if (!deuda) throw conCodigo('DEUDA_NO_ENCONTRADA', new NotFoundException(MENSAJES.deudaNoEncontrada));

    const deLaDeuda = { usuarioId: usuario, deudaId: deuda._id };
    const prestamos = { ...deLaDeuda, clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO };
    const prestamo = await this.transacciones.findOne({ _id: new Types.ObjectId(prestamoId), ...prestamos });
    if (!prestamo) throw conCodigo('PRESTAMO_NO_ENCONTRADO', new NotFoundException(MENSAJES.prestamoNoEncontrado));

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

  /** Ejecuta la tarea cuando terminen las anteriores de esa deuda (fallen o no) y libera la fila al vaciarse. */
  private enFila<T>(deudaId: string, tarea: () => Promise<T>): Promise<T> {
    const turno = (this.filas.get(deudaId) ?? Promise.resolve()).then(tarea);
    const fin: Promise<void> = turno
      .catch(() => undefined)
      .then(() => {
        if (this.filas.get(deudaId) === fin) this.filas.delete(deudaId);
      });
    this.filas.set(deudaId, fin);
    return turno;
  }

  private async exigirSinAbonos(deLaDeuda: { usuarioId: Types.ObjectId; deudaId: Types.ObjectId }): Promise<void> {
    const abono = await this.transacciones.exists({ ...deLaDeuda, clasificacionFlujo: ClasificacionFlujo.ABONO_DEUDA });
    if (abono) throw conCodigo('DEUDA_CON_ABONOS', new ConflictException(MENSAJES.unicoConAbonos));
  }

  /** El índice único de la deuda activa frena las carreras: su error de clave duplicada (11000) es un 409. */
  private async crearDeuda(usuarioId: Types.ObjectId, { acreedor, tipoInteres, valorInteres }: RegistrarPrestamoDto) {
    try {
      return await this.deudas.create({ usuarioId, acreedor, tipoInteres, valorInteres });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000)
        throw conCodigo('DEUDA_REGISTRO_SIMULTANEO', new ConflictException(MENSAJES.registroSimultaneo));
      throw error;
    }
  }
}

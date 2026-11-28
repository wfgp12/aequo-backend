import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { diaEnZona } from '../common/zona-horaria.js';
import { ClasificacionFlujo } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import type { ActualizarCargoDto } from './dto/actualizar-cargo.dto.js';
import type { ActualizarTarjetaDto } from './dto/actualizar-tarjeta.dto.js';
import type { CargoRespuestaDto } from './dto/cargo-respuesta.dto.js';
import type { CrearCargoDto } from './dto/crear-cargo.dto.js';
import type { CrearTarjetaDto } from './dto/crear-tarjeta.dto.js';
import type { ListarCargosQueryDto } from './dto/listar-cargos-query.dto.js';
import type { ProyeccionQueryDto } from './dto/proyeccion-query.dto.js';
import type { ProyeccionRespuestaDto } from './dto/proyeccion-respuesta.dto.js';
import type { TarjetaRespuestaDto } from './dto/tarjeta-respuesta.dto.js';
import { CargoRecurrente, type CargoRecurrenteDocument } from './cargo-recurrente.schema.js';
import { CompraCredito } from './compra-credito.schema.js';
import { calcularDetalleCuotas } from './detalle-cuotas.js';
import { rangoDelMes } from './fechas.js';
import { calcularProyeccion } from './proyeccion-tarjeta.js';
import { TarjetaCredito, type TarjetaCreditoDocument } from './tarjeta-credito.schema.js';
import { validarCuerpo } from './validar-cuerpo.js';
import { conCodigo } from '../common/errores.catalogo.js';

const MENSAJES = {
  tarjetaNoEncontrada: 'Tarjeta no encontrada',
  cargoNoEncontrado: 'Cargo fijo no encontrado',
  nombreDuplicado: 'Ya existe una tarjeta con ese nombre',
  conPagos: 'No se puede eliminar una tarjeta que ya tiene pagos registrados',
  conCompras: 'No se puede eliminar una tarjeta que ya tiene compras registradas',
};

/** Lo que el cliente puede ver de una tarjeta: sin usuario, `_id` ni `__v`. */
export function aTarjetaRespuesta(tarjeta: TarjetaCreditoDocument): TarjetaRespuestaDto {
  return {
    id: tarjeta.id,
    nombre: tarjeta.nombre,
    tasaEA: tarjeta.tasaEA,
    cuotaUnicaSinInteres: tarjeta.cuotaUnicaSinInteres,
    creadaEn: tarjeta.createdAt.toISOString(),
    actualizadaEn: tarjeta.updatedAt.toISOString(),
  };
}

/** Lo que el cliente puede ver de un cargo fijo: sin usuario, `_id` ni `__v`. */
export function aCargoRespuesta(cargo: CargoRecurrenteDocument): CargoRespuestaDto {
  return {
    id: cargo.id,
    tarjetaId: String(cargo.tarjetaId),
    descripcion: cargo.descripcion,
    valor: cargo.valor,
    activo: cargo.activo,
    creadaEn: cargo.createdAt.toISOString(),
    actualizadaEn: cargo.updatedAt.toISOString(),
  };
}

/** El índice único `{ usuarioId, nombre }` frena las carreras: su error de clave duplicada (11000) es un 409. */
function comoConflicto(error: unknown): never {
  if ((error as { code?: number })?.code === 11000)
    throw conCodigo('TARJETA_DUPLICADA', new ConflictException(MENSAJES.nombreDuplicado));
  throw error;
}

@Injectable()
export class TarjetasService {
  constructor(
    @InjectModel(TarjetaCredito.name) private readonly tarjetas: Model<TarjetaCredito>,
    @InjectModel(CargoRecurrente.name) private readonly cargos: Model<CargoRecurrente>,
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
    @InjectModel(CompraCredito.name) private readonly compras: Model<CompraCredito>,
  ) {}

  // ------------------------------------------------------------------------------------------------ tarjetas

  /** Crea una tarjeta. El nombre es único por usuario sin distinguir mayúsculas: repetido (incluso simultáneo) es 409. */
  async crear(usuarioId: string, dto: CrearTarjetaDto): Promise<TarjetaRespuestaDto> {
    try {
      const tarjeta = await this.tarjetas.create({ usuarioId: new Types.ObjectId(usuarioId), ...dto });
      return aTarjetaRespuesta(tarjeta);
    } catch (error) {
      return comoConflicto(error);
    }
  }

  /** Las tarjetas del usuario por nombre, sin distinguir mayúsculas (la intercalación hace el orden en la base). */
  async listar(usuarioId: string): Promise<TarjetaRespuestaDto[]> {
    const tarjetas = await this.tarjetas
      .find({ usuarioId: new Types.ObjectId(usuarioId) })
      .collation({ locale: 'es', strength: 2 })
      .sort({ nombre: 1 });
    return tarjetas.map(aTarjetaRespuesta);
  }

  async obtener(usuarioId: string, id: string): Promise<TarjetaRespuestaDto> {
    return aTarjetaRespuesta(await this.obtenerPropia(usuarioId, id));
  }

  /**
   * Edita una tarjeta propia; solo cambia lo que llega. Aquí se cambia también la tasa (RF-25): no toca nada más, las
   * compras ya registradas llevan copiada la suya. Un nombre repetido, también por carrera, es 409 y no cambia nada.
   */
  async actualizar(usuarioId: string, id: string, dto: ActualizarTarjetaDto): Promise<TarjetaRespuestaDto> {
    const cambios = validarCuerpo(dto);
    const tarjeta = await this.obtenerPropia(usuarioId, id);
    Object.assign(tarjeta, cambios);
    try {
      await tarjeta.save();
    } catch (error) {
      return comoConflicto(error);
    }
    return aTarjetaRespuesta(tarjeta);
  }

  /**
   * Elimina una tarjeta propia y, en cascada, sus cargos fijos. Con compras o avances no se elimina nada (se
   * comprueba antes que los pagos: un avance tiene una transacción con su `tarjetaId` y pasaría por «pago»). Con
   * pagos registrados (transacciones con su `tarjetaId`) tampoco: borrarla dejaría pagos que cuentan en el balance
   * apuntando a una tarjeta inexistente.
   */
  async eliminar(usuarioId: string, id: string): Promise<void> {
    const tarjeta = await this.obtenerPropia(usuarioId, id);
    if (await this.compras.exists({ tarjetaId: tarjeta._id }))
      throw conCodigo('TARJETA_CON_COMPRAS', new ConflictException(MENSAJES.conCompras));
    const conPagos = await this.transacciones.exists({
      usuarioId: new Types.ObjectId(usuarioId),
      tarjetaId: tarjeta._id,
    });
    if (conPagos) throw conCodigo('TARJETA_CON_PAGOS', new ConflictException(MENSAJES.conPagos));
    await this.tarjetas.deleteOne({ _id: tarjeta._id });
    await this.cargos.deleteMany({ tarjetaId: tarjeta._id });
  }

  // ------------------------------------------------------------------------------------------- proyección

  /**
   * Total del mes, saldo pendiente y proyección de una tarjeta propia (RF-30, RF-31), más lo pagado en el mes de
   * referencia y su diferencia con el total (RF-32). El cálculo es de `calcularProyeccion`; los pagos no lo alteran.
   * `detalle` desglosa por compra las cuotas del mes de referencia con esas mismas compras (`calcularDetalleCuotas`).
   * Sin `mes`, el de referencia es el actual en la zona del cliente.
   */
  async proyectarPagos(
    usuarioId: string,
    tarjetaId: string,
    { mes }: ProyeccionQueryDto,
    zona: string,
  ): Promise<ProyeccionRespuestaDto> {
    const tarjeta = await this.obtenerPropia(usuarioId, tarjetaId);
    const filtro = { usuarioId: tarjeta.usuarioId, tarjetaId: tarjeta._id };
    const referencia = mes ?? diaEnZona(new Date(), zona).slice(0, 7);
    const [compras, cargos, pagos] = await Promise.all([
      this.compras.find(filtro),
      this.cargos.find(filtro),
      this.pagosDe(tarjeta, referencia),
    ]);
    const proyeccion = calcularProyeccion({ mes: referencia, compras, cargos });
    const pagado = pagos.reduce((suma, pago) => suma + pago.monto, 0);
    const detalle = calcularDetalleCuotas({ mes: referencia, compras });
    return { tarjetaId: String(tarjeta._id), ...proyeccion, detalle, pagado, diferencia: pagado - proyeccion.total };
  }

  /** Los pagos de una tarjeta (transacciones `PAGO_TARJETA`), el más reciente primero; con `mes`, solo los de ese mes. */
  pagosDe(tarjeta: TarjetaCreditoDocument, mes?: string) {
    return this.transacciones
      .find({
        usuarioId: tarjeta.usuarioId,
        tarjetaId: tarjeta._id,
        clasificacionFlujo: ClasificacionFlujo.PAGO_TARJETA,
        ...(mes ? { fecha: rangoDelMes(mes) } : {}),
      })
      .sort({ fecha: -1, createdAt: -1, _id: -1 });
  }

  // -------------------------------------------------------------------------------------------- cargos fijos

  /** Crea un cargo fijo en una tarjeta propia. El dueño sale del JWT y la tarjeta de la ruta. */
  async crearCargo(usuarioId: string, tarjetaId: string, dto: CrearCargoDto): Promise<CargoRespuestaDto> {
    const tarjeta = await this.obtenerPropia(usuarioId, tarjetaId);
    const cargo = await this.cargos.create({ usuarioId: tarjeta.usuarioId, tarjetaId: tarjeta._id, ...dto });
    return aCargoRespuesta(cargo);
  }

  /** Los cargos de una tarjeta propia en el orden en que se agregaron, con filtro opcional por `activo`. */
  async listarCargos(usuarioId: string, tarjetaId: string, { activo }: ListarCargosQueryDto) {
    const tarjeta = await this.obtenerPropia(usuarioId, tarjetaId);
    const cargos = await this.cargos
      .find({ usuarioId: tarjeta.usuarioId, tarjetaId: tarjeta._id, ...(activo ? { activo: activo === 'true' } : {}) })
      .sort({ createdAt: 1 });
    return cargos.map(aCargoRespuesta);
  }

  async obtenerCargo(usuarioId: string, tarjetaId: string, id: string): Promise<CargoRespuestaDto> {
    return aCargoRespuesta(await this.obtenerCargoPropio(usuarioId, tarjetaId, id));
  }

  /** Edita un cargo propio; solo cambia lo que llega. Activar o desactivar es editar `activo`. */
  async actualizarCargo(
    usuarioId: string,
    tarjetaId: string,
    id: string,
    dto: ActualizarCargoDto,
  ): Promise<CargoRespuestaDto> {
    const cambios = validarCuerpo(dto);
    const cargo = await this.obtenerCargoPropio(usuarioId, tarjetaId, id);
    Object.assign(cargo, cambios);
    await cargo.save();
    return aCargoRespuesta(cargo);
  }

  async eliminarCargo(usuarioId: string, tarjetaId: string, id: string): Promise<void> {
    const cargo = await this.obtenerCargoPropio(usuarioId, tarjetaId, id);
    await this.cargos.deleteOne({ _id: cargo._id });
  }

  /** La tarjeta solo si es del usuario: una inexistente y una ajena dan el mismo 404, para no revelar qué ids existen. */
  async obtenerPropia(usuarioId: string, id: string) {
    const tarjeta = await this.tarjetas.findOne({
      _id: new Types.ObjectId(id),
      usuarioId: new Types.ObjectId(usuarioId),
    });
    if (!tarjeta) throw conCodigo('TARJETA_NO_ENCONTRADA', new NotFoundException(MENSAJES.tarjetaNoEncontrada));
    return tarjeta;
  }

  /** El cargo solo si es del usuario y de la tarjeta de la ruta; si no, 404 (de la tarjeta primero, luego del cargo). */
  private async obtenerCargoPropio(usuarioId: string, tarjetaId: string, id: string) {
    const tarjeta = await this.obtenerPropia(usuarioId, tarjetaId);
    const cargo = await this.cargos.findOne({
      _id: new Types.ObjectId(id),
      tarjetaId: tarjeta._id,
      usuarioId: tarjeta.usuarioId,
    });
    if (!cargo) throw conCodigo('CARGO_NO_ENCONTRADO', new NotFoundException(MENSAJES.cargoNoEncontrado));
    return cargo;
  }
}

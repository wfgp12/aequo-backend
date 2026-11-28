import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { CategoriasService } from '../categorias/categorias.service.js';
import { diaEnZona } from '../common/zona-horaria.js';
import { ClasificacionFlujo, MetodoPago, TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { TipoCompra } from './compra-credito.enums.js';
import { CompraCredito, type CompraCreditoDocument } from './compra-credito.schema.js';
import { calcularCuota, calcularMesUltimoPago } from './cuota-credito.js';
import type { ActualizarCompraDto } from './dto/actualizar-compra.dto.js';
import type { CompraRespuestaDto } from './dto/compra-respuesta.dto.js';
import { type CrearAvanceDto, DESCRIPCION_AVANCE } from './dto/crear-avance.dto.js';
import type { CrearCompraDto } from './dto/crear-compra.dto.js';
import type { ListarComprasQueryDto } from './dto/listar-compras-query.dto.js';
import type { VistaPreviaCuotaQueryDto } from './dto/vista-previa-cuota-query.dto.js';
import type { VistaPreviaCuotaRespuestaDto } from './dto/vista-previa-cuota-respuesta.dto.js';
import { aFecha, rangoDelMes } from './fechas.js';
import type { TarjetaCreditoDocument } from './tarjeta-credito.schema.js';
import { TarjetasService } from './tarjetas.service.js';
import { validarCuerpo } from './validar-cuerpo.js';
import { conCodigo } from '../common/errores.catalogo.js';

const MENSAJES = {
  compraNoEncontrada: 'Compra no encontrada',
  categoriaNoEncontrada: 'Categoría no encontrada',
};

/**
 * Lo que el cliente puede ver de una compra o un avance: sin usuario, `_id` ni `__v`, y con la cuota y el mes del
 * último pago calculados aquí, con precisión completa (RNF-11), porque no se guardan.
 */
export function aCompraRespuesta(compra: CompraCreditoDocument): CompraRespuestaDto {
  return {
    id: compra.id,
    tarjetaId: String(compra.tarjetaId),
    categoriaId: String(compra.categoriaId),
    tipo: compra.tipo,
    descripcion: compra.descripcion,
    valor: compra.valor,
    cuotas: compra.cuotas,
    fecha: compra.fecha.toISOString().slice(0, 10),
    primerPago: compra.primerPago.toISOString().slice(0, 7),
    mesUltimoPago: calcularMesUltimoPago(compra.primerPago, compra.cuotas).toISOString().slice(0, 7),
    tasaEAAplicada: compra.tasaEAAplicada,
    cuotaUnicaSinInteres: compra.cuotaUnicaSinInteres,
    cuota: calcularCuota(compra),
    creadaEn: compra.createdAt.toISOString(),
    actualizadaEn: compra.updatedAt.toISOString(),
  };
}

/** Lo que de una edición de avance cambia también en su transacción de dinero recibido. */
function cambiosDeLaTransaccion(avance: CompraCreditoDocument, enviados: ActualizarCompraDto) {
  return {
    ...(enviados.descripcion === undefined ? {} : { descripcion: avance.descripcion }),
    ...(enviados.valor === undefined ? {} : { monto: avance.valor }),
    ...(enviados.fecha === undefined ? {} : { fecha: avance.fecha }),
  };
}

/**
 * Los datos que comparten compras y avances. La tasa y la bandera salen de la tarjeta, nunca del cliente; sin
 * `fecha` es hoy en la zona del cliente. `primerPago` llega como mes o fecha: el esquema lo lleva al día 1 del mes.
 */
function datosDeLaCompra(tarjeta: TarjetaCreditoDocument, dto: CrearAvanceDto, zona: string) {
  return {
    usuarioId: tarjeta.usuarioId,
    tarjetaId: tarjeta._id,
    valor: dto.valor,
    cuotas: dto.cuotas,
    fecha: aFecha(dto.fecha ?? diaEnZona(new Date(), zona)),
    primerPago: new Date(dto.primerPago),
    tasaEAAplicada: tarjeta.tasaEA,
    cuotaUnicaSinInteres: tarjeta.cuotaUnicaSinInteres,
  };
}

/**
 * Compras a cuotas y avances en efectivo de una tarjeta. La compra no es una transacción (ADR-014); el avance sí
 * genera una de dinero recibido. La atomicidad entre ambas es por compensación: si falla la segunda escritura se
 * deshace la primera y el error sube (un corte del proceso entre las dos no queda cubierto; haría falta una
 * transacción de MongoDB, que pide un conjunto de réplicas).
 */
@Injectable()
export class ComprasService {
  constructor(
    @InjectModel(CompraCredito.name) private readonly compras: Model<CompraCredito>,
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
    @Inject(TarjetasService) private readonly tarjetas: TarjetasService,
    @Inject(CategoriasService) private readonly categorias: CategoriasService,
  ) {}

  /** Registra una compra en una tarjeta propia. Copia la tasa y la bandera de la tarjeta: cambiarlas después no la recalcula. */
  async registrarCompra(usuarioId: string, tarjetaId: string, dto: CrearCompraDto, zona: string) {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const categoria = await this.categoriaDeEgreso(usuarioId, dto.categoriaId);
    const compra = await this.compras.create({
      ...datosDeLaCompra(tarjeta, dto, zona),
      tipo: TipoCompra.COMPRA,
      descripcion: dto.descripcion,
      categoriaId: categoria._id,
    });
    return aCompraRespuesta(compra);
  }

  /**
   * Registra un avance: la compra diferida (en la categoría general de respaldo de egresos) y su transacción de
   * dinero recibido (ADR-014). La transacción va primero para guardar su id en el avance; si falla el avance, se borra.
   */
  async registrarAvance(usuarioId: string, tarjetaId: string, dto: CrearAvanceDto, zona: string) {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const respaldo = await this.categorias.obtenerRespaldo(TipoTransaccion.EGRESO);
    const datos = datosDeLaCompra(tarjeta, dto, zona);
    const descripcion = dto.descripcion ?? DESCRIPCION_AVANCE;
    // Sin categoría ni deuda (valores por defecto null): no es ingreso propio ni cuenta por categoría.
    const transaccion = await this.transacciones.create({
      usuarioId: tarjeta.usuarioId,
      tipo: TipoTransaccion.INGRESO,
      monto: dto.valor,
      fecha: datos.fecha,
      metodoPago: MetodoPago.EFECTIVO,
      descripcion,
      clasificacionFlujo: ClasificacionFlujo.DINERO_RECIBIDO,
      tarjetaId: tarjeta._id,
    });
    try {
      const avance = await this.compras.create({
        ...datos,
        tipo: TipoCompra.AVANCE,
        descripcion,
        categoriaId: respaldo._id,
        transaccionId: transaccion._id,
      });
      return aCompraRespuesta(avance);
    } catch (error) {
      await this.transacciones.deleteOne({ _id: transaccion._id });
      throw error;
    }
  }

  /** Las compras y avances de una tarjeta propia, lo más reciente primero, con filtros opcionales por tipo y mes. */
  async listar(usuarioId: string, tarjetaId: string, { tipo, mes }: ListarComprasQueryDto) {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const compras = await this.compras
      .find({
        usuarioId: tarjeta.usuarioId,
        tarjetaId: tarjeta._id,
        ...(tipo ? { tipo } : {}),
        ...(mes ? { fecha: rangoDelMes(mes) } : {}),
      })
      .sort({ fecha: -1, createdAt: -1, _id: -1 });
    return compras.map(aCompraRespuesta);
  }

  /**
   * La cuota y el mes del último pago de una compra o avance que aún no se guarda, con la tasa y la bandera actuales
   * de la tarjeta (las que copiaría al guardarse). Solo lee la tarjeta: no escribe ni guarda nada en caché.
   */
  async vistaPrevia(
    usuarioId: string,
    tarjetaId: string,
    { valor, cuotas, primerPago }: VistaPreviaCuotaQueryDto,
  ): Promise<VistaPreviaCuotaRespuestaDto> {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const compra = { valor: Number(valor), cuotas: Number(cuotas) };
    const { tasaEA: tasaEAAplicada, cuotaUnicaSinInteres } = tarjeta;
    return {
      cuota: calcularCuota({ ...compra, tasaEAAplicada, cuotaUnicaSinInteres }),
      mesUltimoPago: calcularMesUltimoPago(new Date(primerPago), compra.cuotas).toISOString().slice(0, 7),
      tasaEAAplicada,
      cuotaUnicaSinInteres,
    };
  }

  async obtener(usuarioId: string, tarjetaId: string, id: string) {
    return aCompraRespuesta(await this.obtenerPropia(usuarioId, tarjetaId, id));
  }

  /**
   * Edita una compra o un avance propio; solo cambia lo que llega. Nunca vuelve a copiar la tasa ni la bandera de la
   * tarjeta (la cuota se recalcula con las de la compra). En un avance, `descripcion`, `valor` y `fecha` se
   * reflejan también en su transacción; la categoría de un avance no se edita.
   */
  async actualizar(usuarioId: string, tarjetaId: string, id: string, dto: ActualizarCompraDto) {
    const enviados = validarCuerpo(dto) as ActualizarCompraDto;
    const compra = await this.obtenerPropia(usuarioId, tarjetaId, id);
    const { categoriaId, fecha, primerPago, ...directos } = enviados;
    if (categoriaId !== undefined) {
      if (compra.tipo === TipoCompra.AVANCE) {
        throw new BadRequestException(['categoriaId no se puede editar en un avance: la fija el servidor']);
      }
      compra.categoriaId = (await this.categoriaDeEgreso(usuarioId, categoriaId))._id;
    }
    Object.assign(compra, directos);
    if (fecha !== undefined) compra.fecha = aFecha(fecha);
    if (primerPago !== undefined) compra.primerPago = new Date(primerPago);
    await this.guardar(compra, enviados);
    return aCompraRespuesta(compra);
  }

  /** Elimina una compra o un avance propio; el avance se lleva su transacción de dinero recibido (y solo esa). */
  async eliminar(usuarioId: string, tarjetaId: string, id: string): Promise<void> {
    const compra = await this.obtenerPropia(usuarioId, tarjetaId, id);
    if (!compra.transaccionId) {
      await this.compras.deleteOne({ _id: compra._id });
      return;
    }
    const transaccion = await this.transacciones.findOneAndDelete({
      _id: compra.transaccionId,
      usuarioId: compra.usuarioId,
    });
    try {
      await this.compras.deleteOne({ _id: compra._id });
    } catch (error) {
      // Se recrea con el mismo _id para que el avance siga apuntando a ella.
      if (transaccion) await this.transacciones.create(transaccion.toObject());
      throw error;
    }
  }

  /** Guarda la compra; si es un avance con cambios en su transacción, la actualiza antes y la restaura si falla el guardado. */
  private async guardar(compra: CompraCreditoDocument, enviados: ActualizarCompraDto): Promise<void> {
    const cambios = compra.transaccionId ? cambiosDeLaTransaccion(compra, enviados) : {};
    if (Object.keys(cambios).length === 0) {
      await compra.save();
      return;
    }
    const antes = await this.transacciones.findOneAndUpdate(
      { _id: compra.transaccionId, usuarioId: compra.usuarioId },
      cambios,
    );
    try {
      await compra.save();
    } catch (error) {
      if (antes) {
        await this.transacciones.updateOne(
          { _id: antes._id },
          { descripcion: antes.descripcion, monto: antes.monto, fecha: antes.fecha },
        );
      }
      throw error;
    }
  }

  /** La categoría de la compra: general o del usuario (404 si no) y de egresos (400 si es de ingresos). */
  private async categoriaDeEgreso(usuarioId: string, id: string) {
    const categoria = await this.categorias.obtenerDisponible(usuarioId, id);
    if (!categoria) throw conCodigo('CATEGORIA_NO_ENCONTRADA', new NotFoundException(MENSAJES.categoriaNoEncontrada));
    if (categoria.tipo !== TipoTransaccion.EGRESO) {
      throw new BadRequestException(['categoriaId debe ser una categoría de egresos: una compra es un gasto']);
    }
    return categoria;
  }

  /** La compra solo si es del usuario y de la tarjeta de la ruta; si no, 404 (de la tarjeta primero, luego de la compra). */
  private async obtenerPropia(usuarioId: string, tarjetaId: string, id: string) {
    const tarjeta = await this.tarjetas.obtenerPropia(usuarioId, tarjetaId);
    const compra = await this.compras.findOne({
      _id: new Types.ObjectId(id),
      tarjetaId: tarjeta._id,
      usuarioId: tarjeta.usuarioId,
    });
    if (!compra) throw conCodigo('COMPRA_NO_ENCONTRADA', new NotFoundException(MENSAJES.compraNoEncontrada));
    return compra;
  }
}

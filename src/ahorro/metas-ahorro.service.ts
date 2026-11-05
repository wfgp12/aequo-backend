import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { ActualizarMetaAhorroDto } from './dto/actualizar-meta-ahorro.dto.js';
import { type CrearMetaAhorroDto, PORCENTAJE_MAXIMO } from './dto/crear-meta-ahorro.dto.js';
import type { ListarMetasAhorroQueryDto } from './dto/listar-metas-ahorro-query.dto.js';
import type { MetaAhorroRespuestaDto } from './dto/meta-ahorro-respuesta.dto.js';
import { TipoMeta } from './meta-ahorro.enums.js';
import { MetaAhorro, type MetaAhorroDocument } from './meta-ahorro.schema.js';

const MENSAJES = {
  noEncontrada: 'Meta de ahorro no encontrada',
  duplicada: 'Ya existe una meta de ahorro para ese mes',
  conAhorro: 'No se puede eliminar una meta que ya tiene ahorro registrado',
};

/** El periodo se guarda siempre como el día 1 del mes a medianoche UTC; acepta `YYYY-MM` o `YYYY-MM-DD`. */
const aPeriodo = (texto: string) => new Date(`${texto.slice(0, 7)}-01T00:00:00.000Z`);

/** Lo que el cliente puede ver de una meta: el periodo sale como YYYY-MM y no se expone el usuario. */
export function aMetaAhorroRespuesta(meta: MetaAhorroDocument): MetaAhorroRespuestaDto {
  return {
    id: meta.id,
    tipoMeta: meta.tipoMeta,
    valorObjetivo: meta.valorObjetivo,
    periodo: meta.periodo.toISOString().slice(0, 7),
    ahorroReal: meta.ahorroReal,
    creadaEn: meta.createdAt.toISOString(),
    actualizadaEn: meta.updatedAt.toISOString(),
  };
}

/** Un porcentaje de ahorro no puede pasar de 100; el monto fijo no tiene tope. */
function validarTope(tipoMeta: TipoMeta, valorObjetivo: number): void {
  if (tipoMeta === TipoMeta.PORCENTAJE && valorObjetivo > PORCENTAJE_MAXIMO) {
    throw new BadRequestException([
      `valorObjetivo no puede pasar de ${PORCENTAJE_MAXIMO} cuando la meta es un porcentaje`,
    ]);
  }
}

/** El índice único `{ usuarioId, periodo }` frena las carreras: su error de clave duplicada (11000) es un 409. */
function comoConflicto(error: unknown): never {
  if ((error as { code?: number })?.code === 11000) throw new ConflictException(MENSAJES.duplicada);
  throw error;
}

/** Al editar: al menos un campo, ninguno en null (a una meta no se le quita un dato) y un cambio de tipo trae su valor. */
function validarCuerpo(dto: ActualizarMetaAhorroDto): void {
  const enviados = Object.entries(dto).filter(([, valor]) => valor !== undefined);
  const nulos = enviados.filter(([, valor]) => valor === null).map(([campo]) => `${campo} no puede ser null`);
  if (nulos.length > 0) throw new BadRequestException(nulos);
  if (enviados.length === 0) throw new BadRequestException(['Debes enviar al menos un campo para modificar']);
  if (dto.tipoMeta !== undefined && dto.valorObjetivo === undefined) {
    throw new BadRequestException([
      'valorObjetivo es obligatorio al cambiar tipoMeta: el valor se valida contra el tipo nuevo',
    ]);
  }
}

@Injectable()
export class MetasAhorroService {
  constructor(@InjectModel(MetaAhorro.name) private readonly metas: Model<MetaAhorro>) {}

  /** Crea la meta de un mes. Una sola por usuario y mes: si ya existe (incluso por una petición simultánea) es 409. */
  async crear(usuarioId: string, dto: CrearMetaAhorroDto): Promise<MetaAhorroRespuestaDto> {
    validarTope(dto.tipoMeta, dto.valorObjetivo);
    try {
      const meta = await this.metas.create({
        usuarioId: new Types.ObjectId(usuarioId),
        tipoMeta: dto.tipoMeta,
        valorObjetivo: dto.valorObjetivo,
        periodo: aPeriodo(dto.periodo),
        ...(dto.ahorroReal === undefined ? {} : { ahorroReal: dto.ahorroReal }),
      });
      return aMetaAhorroRespuesta(meta);
    } catch (error) {
      return comoConflicto(error);
    }
  }

  /** Las metas del usuario de la más reciente a la más antigua, con los extremos del rango (`YYYY-MM`) incluidos. */
  async listar(usuarioId: string, { desde, hasta }: ListarMetasAhorroQueryDto): Promise<MetaAhorroRespuestaDto[]> {
    if (desde && hasta && desde > hasta) throw new BadRequestException(['desde no puede ser posterior a hasta']);
    const rango: Record<string, Date> = {};
    if (desde) rango.$gte = aPeriodo(desde);
    if (hasta) rango.$lte = aPeriodo(hasta);
    const metas = await this.metas
      .find({ usuarioId: new Types.ObjectId(usuarioId), ...(desde || hasta ? { periodo: rango } : {}) })
      .sort({ periodo: -1 });
    return metas.map(aMetaAhorroRespuesta);
  }

  async obtener(usuarioId: string, id: string): Promise<MetaAhorroRespuestaDto> {
    return aMetaAhorroRespuesta(await this.obtenerPropia(usuarioId, id));
  }

  /**
   * Edita una meta propia; solo cambia lo que llega. El valor se revalida aquí contra el tipo final, porque el tope
   * de 100 del esquema depende del tipo y no cubre toda ruta de actualización. Mover el periodo a un mes ocupado es
   * 409, también cuando la colisión ocurre entre la lectura y el guardado.
   */
  async actualizar(usuarioId: string, id: string, dto: ActualizarMetaAhorroDto): Promise<MetaAhorroRespuestaDto> {
    validarCuerpo(dto);
    const meta = await this.obtenerPropia(usuarioId, id);
    validarTope(dto.tipoMeta ?? meta.tipoMeta, dto.valorObjetivo ?? meta.valorObjetivo);

    if (dto.tipoMeta !== undefined) meta.tipoMeta = dto.tipoMeta;
    if (dto.valorObjetivo !== undefined) meta.valorObjetivo = dto.valorObjetivo;
    if (dto.periodo !== undefined) meta.periodo = aPeriodo(dto.periodo);
    if (dto.ahorroReal !== undefined) meta.ahorroReal = dto.ahorroReal;
    try {
      await meta.save();
    } catch (error) {
      return comoConflicto(error);
    }
    return aMetaAhorroRespuesta(meta);
  }

  /** Elimina una meta propia sin ahorro registrado (ni positivo ni negativo): con ahorro hay que dejarlo en 0 antes. */
  async eliminar(usuarioId: string, id: string): Promise<void> {
    const meta = await this.obtenerPropia(usuarioId, id);
    if (meta.ahorroReal !== 0) throw new ConflictException(MENSAJES.conAhorro);
    await this.metas.deleteOne({ _id: meta._id });
  }

  /** La meta solo si es del usuario: una inexistente y una ajena dan el mismo 404, para no revelar qué ids existen. */
  private async obtenerPropia(usuarioId: string, id: string) {
    const meta = await this.metas.findOne({ _id: new Types.ObjectId(id), usuarioId: new Types.ObjectId(usuarioId) });
    if (!meta) throw new NotFoundException(MENSAJES.noEncontrada);
    return meta;
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { Categoria, type CategoriaDocument } from './categoria.schema.js';
import type { CategoriaResumenDto, CategoriaRespuestaDto } from './dto/categoria-respuesta.dto.js';
import type { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import type { RenombrarCategoriaDto } from './dto/renombrar-categoria.dto.js';

/** Para comparar nombres sin distinguir mayúsculas ni tildes: "Alimentación" y "alimentacion" son el mismo. */
const normalizar = (texto: string) =>
  texto
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');

export function aCategoriaResumen(categoria: CategoriaDocument): CategoriaResumenDto {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    tipo: categoria.tipo,
    esPredeterminada: categoria.esPredeterminada,
  };
}

@Injectable()
export class CategoriasService {
  constructor(
    @InjectModel(Categoria.name) private readonly categorias: Model<Categoria>,
    @InjectModel(Transaccion.name) private readonly transacciones: Model<Transaccion>,
  ) {}

  /** Las categorías que el usuario puede usar: las generales del sistema y las suyas. */
  async listar(usuarioId: string, tipo?: TipoTransaccion): Promise<CategoriaRespuestaDto[]> {
    const categorias = await this.categorias.find({
      usuarioId: { $in: [null, new Types.ObjectId(usuarioId)] },
      ...(tipo ? { tipo } : {}),
    });
    const conteos = await this.contarMovimientos(
      usuarioId,
      categorias.map((categoria) => categoria._id),
    );
    return [...categorias]
      .sort(
        (a, b) =>
          a.tipo.localeCompare(b.tipo) ||
          Number(b.esPredeterminada) - Number(a.esPredeterminada) ||
          a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
      )
      .map((categoria) => ({ ...aCategoriaResumen(categoria), movimientos: conteos.get(String(categoria._id)) ?? 0 }));
  }

  async crear(usuarioId: string, dto: CrearCategoriaDto): Promise<CategoriaRespuestaDto> {
    await this.validarNombreLibre(usuarioId, dto.tipo, dto.nombre);
    // ponytail: dos altas simultáneas con el mismo nombre podrían colarse; con un índice único por nombre normalizado se cerraría.
    const categoria = await this.categorias.create({
      usuarioId: new Types.ObjectId(usuarioId),
      nombre: dto.nombre,
      tipo: dto.tipo,
      esPredeterminada: false,
      esRespaldo: false,
    });
    return { ...aCategoriaResumen(categoria), movimientos: 0 };
  }

  async renombrar(usuarioId: string, id: string, dto: RenombrarCategoriaDto): Promise<CategoriaRespuestaDto> {
    const categoria = await this.obtenerPropia(usuarioId, id, 'modificar');
    await this.validarNombreLibre(usuarioId, categoria.tipo, dto.nombre, id);
    categoria.nombre = dto.nombre;
    await categoria.save();
    const conteos = await this.contarMovimientos(usuarioId, [categoria._id]);
    return { ...aCategoriaResumen(categoria), movimientos: conteos.get(String(categoria._id)) ?? 0 };
  }

  /**
   * Elimina una categoría personalizada. Sus movimientos pasan solos a la categoría general de respaldo del mismo
   * tipo (RF-12), así que ningún movimiento queda sin categoría. Los movimientos se reasignan antes de borrar la
   * categoría: si algo falla a mitad, la categoría sigue existiendo y la petición se puede repetir.
   */
  async eliminar(usuarioId: string, id: string): Promise<void> {
    const categoria = await this.obtenerPropia(usuarioId, id, 'eliminar');
    await this.reasignarAOtros(usuarioId, categoria);
    await this.categorias.deleteOne({ _id: categoria._id });
  }

  /** La categoría solo si el usuario puede usarla (general o suya); null en cualquier otro caso. */
  async obtenerDisponible(usuarioId: string, id: string): Promise<CategoriaDocument | null> {
    const categoria = await this.categorias.findById(id);
    if (!categoria || (categoria.usuarioId && String(categoria.usuarioId) !== usuarioId)) {
      return null;
    }
    return categoria;
  }

  /** Varias categorías por id, indexadas por id, para completar el listado de transacciones con su nombre. */
  async obtenerPorIds(ids: string[]): Promise<Map<string, CategoriaDocument>> {
    if (ids.length === 0) {
      return new Map();
    }
    const categorias = await this.categorias.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } });
    return new Map(categorias.map((categoria) => [String(categoria._id), categoria]));
  }

  /** Para editar o eliminar: debe ser del usuario (404 si no existe o es de otro) y no general (403). */
  private async obtenerPropia(usuarioId: string, id: string, accion: 'modificar' | 'eliminar') {
    const categoria = await this.obtenerDisponible(usuarioId, id);
    if (!categoria) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (categoria.esPredeterminada) {
      throw new ForbiddenException(`Las categorías generales no se pueden ${accion}`);
    }
    return categoria;
  }

  private async reasignarAOtros(usuarioId: string, categoria: CategoriaDocument): Promise<void> {
    const respaldo = await this.categorias.findOne({ esRespaldo: true, tipo: categoria.tipo });
    if (!respaldo) {
      // Un error de datos, no del cliente: la siembra debe haber creado una de respaldo por tipo.
      throw new InternalServerErrorException(`No existe la categoría general de respaldo de ${categoria.tipo}`);
    }
    await this.transacciones.updateMany(
      { usuarioId: new Types.ObjectId(usuarioId), categoriaId: categoria._id },
      { categoriaId: respaldo._id },
    );
  }

  private async validarNombreLibre(usuarioId: string, tipo: TipoTransaccion, nombre: string, ignorarId?: string) {
    const existentes = await this.categorias.find({
      usuarioId: { $in: [null, new Types.ObjectId(usuarioId)] },
      tipo,
    });
    const clave = normalizar(nombre);
    if (existentes.some((existente) => String(existente._id) !== ignorarId && normalizar(existente.nombre) === clave)) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
  }

  private async contarMovimientos(usuarioId: string, categoriaIds: Types.ObjectId[]): Promise<Map<string, number>> {
    const filas = await this.transacciones.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { usuarioId: new Types.ObjectId(usuarioId), categoriaId: { $in: categoriaIds } } },
      { $group: { _id: '$categoriaId', total: { $sum: 1 } } },
    ]);
    return new Map(filas.map((fila) => [String(fila._id), fila.total]));
  }
}

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { CATEGORIAS_GENERALES_INICIALES } from './categorias-generales.js';
import { Categoria } from './categoria.schema.js';

/**
 * Siembra las categorías generales al arrancar, solo si todavía no existe ninguna. Así una base vacía queda
 * lista, repetir el arranque no duplica nada y, si el administrador cambia o renombra las generales, el
 * arranque no las vuelve a crear.
 */
@Injectable()
export class CategoriasSemilla implements OnApplicationBootstrap {
  private readonly logger = new Logger(CategoriasSemilla.name);

  constructor(@InjectModel(Categoria.name) private readonly categorias: Model<Categoria>) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.categorias.countDocuments({ esPredeterminada: true })) > 0) {
      return;
    }
    await this.categorias.insertMany(
      CATEGORIAS_GENERALES_INICIALES.map((categoria) => ({
        usuarioId: null,
        esPredeterminada: true,
        esRespaldo: false,
        ...categoria,
      })),
    );
    this.logger.log(`Categorías generales sembradas: ${CATEGORIAS_GENERALES_INICIALES.length}`);
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';
import { TipoTransaccion } from '../transacciones/transaccion.enums.js';

const ObjectId = MongooseSchema.Types.ObjectId;

export const NOMBRE_CATEGORIA_MAXIMO = 40;

/**
 * Entidad anémica: solo datos. Hay dos clases de categoría (ADR-002):
 * - **Generales del sistema**: `usuarioId` null y `esPredeterminada` true. Las define el administrador de la
 *   plataforma, pueden cambiar con el tiempo y ningún usuario las edita ni las elimina.
 * - **Personalizadas**: `usuarioId` del dueño y `esPredeterminada` false.
 * Las reglas entre campos las mantiene el servicio; el esquema solo valida cada campo.
 */
@Schema({ collection: 'categorias', timestamps: true })
export class Categoria {
  // Opcional (ADR-002). NO inferir "es del sistema" por ser null: usar `esPredeterminada`.
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() borra las categorías personales (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', default: null })
  usuarioId: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: NOMBRE_CATEGORIA_MAXIMO })
  nombre: string;

  /** Una categoría solo se puede usar en movimientos de su mismo tipo. */
  @Prop({ type: String, enum: Object.values(TipoTransaccion), required: true })
  tipo: TipoTransaccion;

  /** true = categoría general del sistema: nunca se puede editar ni eliminar. */
  @Prop({ type: Boolean, default: false })
  esPredeterminada: boolean;

  /**
   * true = la general a la que se reasignan los movimientos cuando se elimina una categoría personalizada
   * (RF-12). Hay una por tipo. Se marca con un campo y no por el nombre porque el administrador puede renombrarla.
   */
  @Prop({ type: Boolean, default: false })
  esRespaldo: boolean;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type CategoriaDocument = HydratedDocument<Categoria>;
export const CategoriaSchema = SchemaFactory.createForClass(Categoria);

// Consulta principal: las categorías de un usuario (y las generales, usuarioId null) por tipo.
CategoriaSchema.index({ usuarioId: 1, tipo: 1 });

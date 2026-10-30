import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';

const ObjectId = MongooseSchema.Types.ObjectId;

/** Las claves se olvidan solas pasado este tiempo: cubre reintentos razonables sin crecer para siempre. */
export const VIGENCIA_CLAVE_SEGUNDOS = 24 * 60 * 60;

export const EstadoIdempotencia = {
  /** La primera petición con esta clave todavía se está ejecutando. */
  EN_PROCESO: 'EN_PROCESO',
  /** Terminó bien: se guardó su respuesta para reenviarla si la petición se repite. */
  COMPLETADA: 'COMPLETADA',
} as const;
export type EstadoIdempotencia = (typeof EstadoIdempotencia)[keyof typeof EstadoIdempotencia];

/**
 * Entidad anémica: solo datos. Registra una petición de creación identificada por la clave `Idempotency-Key` que
 * envía el cliente, para que repetirla no ejecute dos veces lo mismo (doble toque, reintento de red).
 */
@Schema({ collection: 'idempotencias', timestamps: true })
export class Idempotencia {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la borra y la clave es por usuario (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  /** El UUID del header Idempotency-Key. */
  @Prop({ type: String, required: true })
  clave: string;

  /** Huella de método, ruta y cuerpo de la primera petición: distingue un reintento de una petición distinta. */
  @Prop({ type: String, required: true })
  huella: string;

  @Prop({ type: String, enum: Object.values(EstadoIdempotencia), required: true })
  estado: EstadoIdempotencia;

  /** Cuerpo de la respuesta de la primera petición, ya completada. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  respuesta: unknown;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type IdempotenciaDocument = HydratedDocument<Idempotencia>;
export const IdempotenciaSchema = SchemaFactory.createForClass(Idempotencia);

// Una clave por usuario: este índice único es lo que impide que dos peticiones simultáneas con la misma clave la reclamen ambas.
IdempotenciaSchema.index({ usuarioId: 1, clave: 1 }, { unique: true });
// Caducidad automática de las claves.
IdempotenciaSchema.index({ createdAt: 1 }, { expireAfterSeconds: VIGENCIA_CLAVE_SEGUNDOS });

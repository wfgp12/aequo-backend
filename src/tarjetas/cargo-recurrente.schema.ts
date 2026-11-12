import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';

const ObjectId = MongooseSchema.Types.ObjectId;

/**
 * Entidad anémica: cargo fijo mensual asociado a una tarjeta (suscripciones, seguros, cuota de manejo).
 * Se pueden repetir descripciones en la misma tarjeta, por eso no hay índice único. Relaciones por referencia (ADR-001).
 */
@Schema({ collection: 'cargosrecurrentes', timestamps: true })
export class CargoRecurrente {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: ObjectId, ref: 'TarjetaCredito', required: true, index: true })
  tarjetaId: Types.ObjectId;

  @Prop({ type: String, required: [true, 'La descripción del cargo es obligatoria'], trim: true, maxlength: 100 })
  descripcion: string;

  /** Monto mensual en pesos colombianos: mayor que cero, sin tope. */
  @Prop({
    type: Number,
    required: true,
    validate: { validator: (valor: number) => valor > 0, message: 'El valor del cargo debe ser mayor que cero' },
  })
  valor: number;

  /** Un cargo inactivo se conserva pero deja de sumarse a la proyección de pagos. */
  @Prop({ type: Boolean, default: true })
  activo: boolean;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type CargoRecurrenteDocument = HydratedDocument<CargoRecurrente>;
export const CargoRecurrenteSchema = SchemaFactory.createForClass(CargoRecurrente);

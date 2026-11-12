import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';

const ObjectId = MongooseSchema.Types.ObjectId;

/**
 * Entidad anémica: solo datos. La tarjeta guarda la tasa vigente; cada compra copia la que se le aplicó
 * (`comprascredito.tasaEAAplicada`), así que cambiarla aquí no recalcula compras anteriores (ADR-014).
 */
@Schema({ collection: 'tarjetas', timestamps: true })
export class TarjetaCredito {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: String, required: [true, 'El nombre de la tarjeta es obligatorio'], trim: true, maxlength: 50 })
  nombre: string;

  /** Tasa efectiva anual como fracción (0,2921 = 29,21 %). 0 es válido: tarjeta sin interés. */
  @Prop({ type: Number, required: true, min: 0, max: 1 })
  tasaEA: number;

  /** Si es true, una compra a una sola cuota no paga interés (cuota = valor). */
  @Prop({ type: Boolean, default: false })
  cuotaUnicaSinInteres: boolean;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type TarjetaCreditoDocument = HydratedDocument<TarjetaCredito>;
export const TarjetaCreditoSchema = SchemaFactory.createForClass(TarjetaCredito);

// Un nombre por usuario, sin distinguir mayúsculas (collation strength 2).
TarjetaCreditoSchema.index({ usuarioId: 1, nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

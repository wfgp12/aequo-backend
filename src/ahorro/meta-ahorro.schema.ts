import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';
import { primerDiaDelMes } from '../common/primer-dia-del-mes.js';
import { TipoMeta } from './meta-ahorro.enums.js';

const ObjectId = MongooseSchema.Types.ObjectId;

/**
 * Entidad anémica: solo datos. Es una instancia mensual (una por usuario y periodo), no una meta única:
 * el acumulado histórico se calcula sumando `ahorroReal`, no se guarda. Relaciones por referencia (ADR-001).
 * Los montos están en pesos colombianos; el tope de 100 para PORCENTAJE depende de `tipoMeta`.
 */
@Schema({ collection: 'metasahorro', timestamps: true })
export class MetaAhorro {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TipoMeta), required: true })
  tipoMeta: TipoMeta;

  /** Porcentaje (0 < valor <= 100) o monto fijo en pesos (> 0, sin tope), según `tipoMeta`. */
  @Prop({
    type: Number,
    required: true,
    validate: [
      { validator: (valor: number) => valor > 0, message: 'El valor de la meta debe ser mayor que cero' },
      {
        validator(this: { tipoMeta?: TipoMeta }, valor: number) {
          return this.tipoMeta !== TipoMeta.PORCENTAJE || valor <= 100;
        },
        message: 'Un porcentaje de ahorro no puede pasar de 100',
      },
    ],
  })
  valorObjetivo: number;

  /** Mes de la meta: siempre el día 1 a las 00:00 UTC. */
  @Prop({ type: Date, required: true, set: primerDiaDelMes })
  periodo: Date;

  /** Ahorro efectivo del periodo; puede ser negativo si se gastó más de lo ingresado. */
  @Prop({ type: Number, default: 0 })
  ahorroReal: number;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type MetaAhorroDocument = HydratedDocument<MetaAhorro>;
export const MetaAhorroSchema = SchemaFactory.createForClass(MetaAhorro);

// Una sola meta por usuario y mes.
MetaAhorroSchema.index({ usuarioId: 1, periodo: 1 }, { unique: true });

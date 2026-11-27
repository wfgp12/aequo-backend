import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';
import { TipoInteres } from './deuda.enums.js';

const ObjectId = MongooseSchema.Types.ObjectId;

export const ACREEDOR_MAXIMO = 50;

/** Comparar acreedores sin distinguir mayúsculas (sí tildes): la usan el índice y las consultas. */
export const INTERCALACION_ACREEDOR = { locale: 'es', strength: 2 };

/** Qué valor de interés admite cada tipo: nada, una fracción (0,02 = 2 %) o un monto en pesos. */
export const VALOR_VALIDO: Record<TipoInteres, (valor: number) => boolean> = {
  [TipoInteres.SIN_INTERES]: (valor) => valor === 0,
  [TipoInteres.TASA]: (valor) => valor > 0 && valor <= 1,
  [TipoInteres.MONTO_FIJO]: (valor) => valor > 0 && Number.isFinite(valor),
};

/**
 * Entidad anémica: solo datos. No guarda lo prestado ni lo abonado: se calculan a partir de las transacciones
 * con `deudaId` (ADR-014).
 */
@Schema({ collection: 'deudas', timestamps: true })
export class Deuda {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({
    type: String,
    required: [true, 'El nombre del acreedor es obligatorio'],
    trim: true,
    maxlength: ACREEDOR_MAXIMO,
  })
  acreedor: string;

  @Prop({ type: String, enum: Object.values(TipoInteres), required: true, default: TipoInteres.SIN_INTERES })
  tipoInteres: TipoInteres;

  // La regla depende de `tipoInteres` y lee el documento: vale con `save()`/`validate()`, no con actualizaciones
  // por consulta (`updateOne` y similares), donde `this` no es la deuda.
  @Prop({
    type: Number,
    required: true,
    default: 0,
    validate: {
      validator(this: Deuda, valor: number) {
        return VALOR_VALIDO[this.tipoInteres]?.(valor) ?? false;
      },
      message: 'El valor del interés no corresponde al tipo de interés',
    },
  })
  valorInteres: number;

  @Prop({ type: Boolean, required: true, default: false })
  saldada: boolean;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type DeudaDocument = HydratedDocument<Deuda>;
export const DeudaSchema = SchemaFactory.createForClass(Deuda);

// Una sola deuda activa por usuario y acreedor, sin distinguir mayúsculas (RF-35); las saldadas no estorban.
DeudaSchema.index(
  { usuarioId: 1, acreedor: 1 },
  { unique: true, partialFilterExpression: { saldada: false }, collation: INTERCALACION_ACREEDOR },
);

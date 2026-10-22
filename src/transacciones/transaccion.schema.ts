import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';
import {
  ClasificacionFlujo,
  METODOS_DE_PAGO_DE_TRANSACCION,
  type MetodoPago,
  TipoTransaccion,
} from './transaccion.enums.js';

const ObjectId = MongooseSchema.Types.ObjectId;

/**
 * Entidad anémica: solo datos. Las reglas entre campos (por ejemplo, PAGO_TARJETA exige `tarjetaId` y
 * ABONO_DEUDA exige `deudaId`) las valida el servicio al crear o editar (paquete 2.2.1), no el esquema.
 * Relaciones por referencia (ADR-001). Los montos están en pesos colombianos.
 */
@Schema({ collection: 'transacciones', timestamps: true })
export class Transaccion {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TipoTransaccion), required: true })
  tipo: TipoTransaccion;

  @Prop({
    type: Number,
    required: true,
    validate: { validator: (monto: number) => monto > 0, message: 'El monto debe ser mayor que cero' },
  })
  monto: number;

  @Prop({ type: Date, required: true })
  fecha: Date;

  /** Obligatoria en las ordinarias (la valida el servicio); los pagos de tarjeta y abonos no cuentan por categoría. */
  @Prop({ type: ObjectId, ref: 'Categoria', default: null })
  categoriaId: Types.ObjectId | null;

  @Prop({ type: String, enum: METODOS_DE_PAGO_DE_TRANSACCION, required: true })
  metodoPago: MetodoPago;

  @Prop({ type: String, trim: true, default: '' })
  descripcion: string;

  @Prop({
    type: String,
    enum: Object.values(ClasificacionFlujo),
    default: ClasificacionFlujo.ORDINARIO,
    required: true,
  })
  clasificacionFlujo: ClasificacionFlujo;

  /** Tarjeta asociada: pagos de tarjeta y avances en efectivo. */
  @Prop({ type: ObjectId, ref: 'TarjetaCredito', default: null })
  tarjetaId: Types.ObjectId | null;

  /** Deuda asociada: préstamos recibidos y abonos. */
  @Prop({ type: ObjectId, ref: 'Deuda', default: null })
  deudaId: Types.ObjectId | null;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type TransaccionDocument = HydratedDocument<Transaccion>;
export const TransaccionSchema = SchemaFactory.createForClass(Transaccion);

// Consulta principal: las transacciones de un usuario por periodo (listado, balance y reportes).
TransaccionSchema.index({ usuarioId: 1, fecha: -1 });

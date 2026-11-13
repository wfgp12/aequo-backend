import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, type Types } from 'mongoose';
import { primerDiaDelMes } from '../common/primer-dia-del-mes.js';
import { TipoCompra } from './compra-credito.enums.js';

const ObjectId = MongooseSchema.Types.ObjectId;

/**
 * Entidad anémica: solo datos. Guarda la compra a cuotas y el avance en efectivo (`tipo`). Todo lo derivado
 * (cuota, interés, saldo, mes del último pago) se calcula, no se guarda (RNF-11). La compra copia la tasa y la
 * bandera de la tarjeta al registrarse, así que editar la tarjeta no recalcula compras anteriores (ADR-014).
 * Relaciones por referencia (ADR-001); que la tarjeta y la categoría existan y sean del usuario lo verifica el servicio.
 */
@Schema({ collection: 'comprascredito', timestamps: true })
export class CompraCredito {
  // Se llama exactamente `usuarioId`: así AuthService.eliminarCuenta() la encuentra y la borra sola (RF-04).
  @Prop({ type: ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: ObjectId, ref: 'TarjetaCredito', required: true })
  tarjetaId: Types.ObjectId;

  @Prop({ type: ObjectId, ref: 'Categoria', required: true })
  categoriaId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TipoCompra), required: true, default: TipoCompra.COMPRA })
  tipo: TipoCompra;

  @Prop({ type: String, required: [true, 'La descripción de la compra es obligatoria'], trim: true, maxlength: 200 })
  descripcion: string;

  /** Valor total en pesos, sin redondear. */
  @Prop({
    type: Number,
    required: true,
    validate: { validator: (valor: number) => valor > 0, message: 'El valor de la compra debe ser mayor que cero' },
  })
  valor: number;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 60,
    validate: { validator: Number.isInteger, message: 'El número de cuotas debe ser un entero' },
  })
  cuotas: number;

  /** Fecha de la compra, tal cual llega: la compra cuenta en el mes de esta fecha (ADR-014). */
  @Prop({ type: Date, required: true })
  fecha: Date;

  /** Mes del primer pago: siempre el día 1 a las 00:00 UTC. */
  @Prop({ type: Date, required: true, set: primerDiaDelMes })
  primerPago: Date;

  /** Tasa efectiva anual copiada de la tarjeta, como fracción (0,2921 = 29,21 %). 0 es válido. */
  @Prop({ type: Number, required: true, min: 0, max: 1 })
  tasaEAAplicada: number;

  /** Bandera copiada de la tarjeta. Sin valor por defecto: si el servicio olvida copiarla, no se guarda. */
  @Prop({ type: Boolean, required: true })
  cuotaUnicaSinInteres: boolean;

  // Los agrega Mongoose por `timestamps: true`; no son @Prop.
  createdAt: Date;
  updatedAt: Date;
}

export type CompraCreditoDocument = HydratedDocument<CompraCredito>;
export const CompraCreditoSchema = SchemaFactory.createForClass(CompraCredito);

// Gasto por categoría del mes (usuario y fecha) y compras de una tarjeta (proyección, total del mes). No únicos.
CompraCreditoSchema.index({ usuarioId: 1, fecha: -1 });
CompraCreditoSchema.index({ tarjetaId: 1 });

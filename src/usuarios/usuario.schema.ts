import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

// Entidad anémica: solo datos. El usuario se identifica por el UID de Firebase, no por el correo (ADR-012).
@Schema({ collection: 'usuarios', timestamps: true })
export class Usuario {
  @Prop({ type: String, required: true, unique: true })
  firebaseUid: string;

  @Prop({ type: String, required: true })
  nombre: string;

  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, default: null })
  fotoUrl: string | null;

  // Lo agrega Mongoose por `timestamps: true`; no es un @Prop.
  createdAt: Date;
}

export type UsuarioDocument = HydratedDocument<Usuario>;
export const UsuarioSchema = SchemaFactory.createForClass(Usuario);

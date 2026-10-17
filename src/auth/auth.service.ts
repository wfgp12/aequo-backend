import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Model } from 'mongoose';
import { Usuario, type UsuarioDocument } from '../usuarios/usuario.schema.js';
import type { LoginRespuestaDto } from './dto/login-respuesta.dto.js';
import { FIREBASE_AUTH } from './firebase-auth.provider.js';

export const SESION_SEGUNDOS = 24 * 60 * 60; // RNF-01

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: Auth,
  ) {}

  /** Verifica el ID Token de Firebase una sola vez; la sesión posterior es el JWT propio. */
  async verificarIdToken(
    idToken: string,
  ): Promise<DecodedIdToken & { email: string }> {
    let decoded: DecodedIdToken;
    try {
      decoded = await this.firebaseAuth.verifyIdToken(idToken, true);
    } catch (error) {
      // Solo los errores de token son 401; los de red u otros se propagan como 500.
      if ((error as { code?: string }).code?.startsWith('auth/')) {
        throw new UnauthorizedException('ID Token inválido o vencido');
      }
      throw error;
    }
    if (!decoded.email) {
      throw new UnauthorizedException('ID Token inválido o vencido');
    }
    return { ...decoded, email: decoded.email };
  }

  generarJWT(usuario: UsuarioDocument): string {
    return this.jwt.sign({ sub: usuario.id });
  }

  /** Crea el usuario la primera vez y lo recupera después, siempre por UID de Firebase. */
  async login(idToken: string): Promise<LoginRespuestaDto> {
    const { uid, email, name, picture } = await this.verificarIdToken(idToken);
    const usuario = await this.usuarios
      .findOneAndUpdate(
        { firebaseUid: uid },
        {
          $setOnInsert: {
            nombre: name || email.split('@')[0],
            email,
            fotoUrl: picture ?? null,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .orFail();

    return {
      accessToken: this.generarJWT(usuario),
      expiresIn: SESION_SEGUNDOS,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        fotoUrl: usuario.fotoUrl,
      },
    };
  }
}

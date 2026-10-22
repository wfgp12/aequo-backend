import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Model } from 'mongoose';
import { Usuario, type UsuarioDocument } from '../usuarios/usuario.schema.js';
import type { LoginRespuestaDto, UsuarioRespuestaDto } from './dto/login-respuesta.dto.js';
import { FIREBASE_AUTH } from './firebase-auth.provider.js';
import { MENSAJE_SESION_INVALIDA, TokenService } from './token.service.js';

export const SESION_SEGUNDOS = 24 * 60 * 60; // RNF-01

interface Identidad {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

// Usuario fijo de la sesión de prueba (paquete 1.1.4). Solo se usa si DevSessionModule está activo.
export const IDENTIDAD_DE_PRUEBA: Identidad = {
  uid: 'dev-session-user',
  email: 'prueba@aequo.local',
  name: 'Usuario de prueba',
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @Inject(TokenService) private readonly tokens: TokenService,
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
    return this.tokens.generar(usuario.id);
  }

  /** Crea el usuario la primera vez y lo recupera después, siempre por UID de Firebase. */
  async login(idToken: string): Promise<LoginRespuestaDto> {
    return this.abrirSesion(await this.verificarIdToken(idToken));
  }

  /** Sesión del usuario de prueba, sin verificar ningún token. La ruta que la expone solo existe en desarrollo. */
  loginDePrueba(): Promise<LoginRespuestaDto> {
    return this.abrirSesion(IDENTIDAD_DE_PRUEBA);
  }

  /**
   * Perfil del usuario dueño de la sesión. Si el usuario ya no existe (por ejemplo, cuenta eliminada),
   * su JWT deja de ser una sesión válida.
   */
  async obtenerPerfil(usuarioId: string): Promise<UsuarioRespuestaDto> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario) {
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }
    return this.aPerfil(usuario);
  }

  /**
   * Elimina la cuenta y toda la información del usuario. Borra los documentos de TODA colección que lo
   * referencie con `usuarioId` (se descubren solas, así que las colecciones futuras quedan cubiertas) y al
   * final el propio usuario: si algo falla a medias, el usuario sigue existiendo y se puede reintentar.
   * Es idempotente: eliminar una cuenta que ya no existe no es un error.
   */
  async eliminarCuenta(usuarioId: string): Promise<void> {
    const { db } = this.usuarios;
    for (const nombre of db.modelNames()) {
      const modelo = db.model(nombre);
      if (modelo !== this.usuarios && modelo.schema.path('usuarioId')) {
        await modelo.deleteMany({ usuarioId });
      }
    }
    await this.usuarios.deleteOne({ _id: usuarioId });
  }

  // Solo los datos que el cliente puede ver: nunca el UID de Firebase ni campos internos.
  private aPerfil(usuario: UsuarioDocument): UsuarioRespuestaDto {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      fotoUrl: usuario.fotoUrl,
      miembroDesde: usuario.createdAt.toISOString(),
    };
  }

  private async abrirSesion({
    uid,
    email,
    name,
    picture,
  }: Identidad): Promise<LoginRespuestaDto> {
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
      usuario: this.aPerfil(usuario),
    };
  }
}

import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Response } from 'express';
import { type Model, Types } from 'mongoose';
import { catchError, from, map, mergeMap, type Observable, of, throwError } from 'rxjs';
import type { SolicitudAutenticada } from '../auth/decoradores.js';
import { calcularHuella } from './huella.js';
import { EstadoIdempotencia, Idempotencia } from './idempotencia.schema.js';

export const CABECERA_IDEMPOTENCIA = 'idempotency-key';
export const CABECERA_REPETIDA = 'Idempotent-Replayed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Una clave "en proceso" más vieja que esto se da por abandonada (el servidor se cayó a mitad) y se puede reclamar de nuevo. */
const ESPERA_MAXIMA_EN_PROCESO_MS = 2 * 60 * 1000;
const ERROR_CLAVE_DUPLICADA = 11000;

/**
 * Evita que una misma petición de creación se ejecute dos veces (doble toque, reintento de red). El cliente envía un
 * `Idempotency-Key` (UUID) por acción del usuario y el servidor reclama esa clave ANTES de ejecutar:
 * - clave nueva → se ejecuta, y si termina bien se guarda su respuesta;
 * - misma clave y misma petición ya terminada → se reenvía la respuesta guardada sin ejecutar nada (Idempotent-Replayed: true);
 * - misma clave mientras la primera sigue en proceso → 409;
 * - misma clave con otro método, ruta o cuerpo → 422;
 * - si la primera falla (400, 500…) la clave se libera para poder reintentar.
 * Se aplica con @Idempotente(). Debe correr tras el guard de sesión: la clave es por usuario.
 */
@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotenciaInterceptor.name);

  constructor(
    @InjectModel(Idempotencia.name) private readonly claves: Model<Idempotencia>,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async intercept(contexto: ExecutionContext, siguiente: CallHandler): Promise<Observable<unknown>> {
    const http = contexto.switchToHttp();
    const solicitud = http.getRequest<SolicitudAutenticada>();
    const clave = solicitud.headers[CABECERA_IDEMPOTENCIA];

    if (clave === undefined) {
      if (this.config.get<string>('IDEMPOTENCIA_OBLIGATORIA') === 'true') {
        throw new BadRequestException([
          'Idempotency-Key es obligatorio: envía un UUID distinto por cada acción del usuario',
        ]);
      }
      return siguiente.handle();
    }
    if (typeof clave !== 'string' || !UUID.test(clave)) {
      throw new BadRequestException(['Idempotency-Key debe ser un UUID (por ejemplo, el de crypto.randomUUID())']);
    }

    const huella = calcularHuella(solicitud.method, solicitud.path, solicitud.body);
    const reclamo = await this.reclamar(new Types.ObjectId(solicitud.usuarioId), clave, huella);
    if (reclamo.repetida) {
      http.getResponse<Response>().setHeader(CABECERA_REPETIDA, 'true');
      return of(reclamo.respuesta);
    }

    return siguiente.handle().pipe(
      catchError((error) => from(this.liberar(reclamo.id)).pipe(mergeMap(() => throwError(() => error)))),
      mergeMap((cuerpo) => from(this.completar(reclamo.id, cuerpo)).pipe(map(() => cuerpo))),
    );
  }

  /** Reclama la clave de forma atómica (el índice único decide) o resuelve qué hacer con una que ya existe. */
  private async reclamar(
    usuarioId: Types.ObjectId,
    clave: string,
    huella: string,
  ): Promise<{ repetida: false; id: Types.ObjectId } | { repetida: true; respuesta: unknown }> {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const nueva = await this.claves.create({ usuarioId, clave, huella, estado: EstadoIdempotencia.EN_PROCESO });
        return { repetida: false, id: nueva._id };
      } catch (error) {
        if ((error as { code?: number }).code !== ERROR_CLAVE_DUPLICADA) {
          throw error;
        }
      }
      const existente = await this.claves.findOne({ usuarioId, clave });
      if (!existente) {
        continue; // se liberó entre medias: se vuelve a intentar reclamarla
      }
      if (existente.huella !== huella) {
        throw new UnprocessableEntityException(
          'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
        );
      }
      if (existente.estado === EstadoIdempotencia.COMPLETADA) {
        return { repetida: true, respuesta: existente.respuesta };
      }
      if (Date.now() - existente.createdAt.getTime() > ESPERA_MAXIMA_EN_PROCESO_MS) {
        await this.claves.deleteOne({ _id: existente._id });
        continue;
      }
      break;
    }
    throw new ConflictException('La petición ya se está procesando: espera su resultado antes de reintentar');
  }

  /**
   * Guarda la respuesta. Si no se pudiera guardar, no se falla la petición (ya se ejecutó): la clave queda "en proceso"
   * y bloquea reintentos con ese mismo UUID hasta que se dé por abandonada.
   */
  private async completar(id: Types.ObjectId, respuesta: unknown): Promise<void> {
    try {
      await this.claves.updateOne({ _id: id }, { estado: EstadoIdempotencia.COMPLETADA, respuesta: respuesta ?? null });
    } catch (error) {
      this.logger.error(`No se pudo guardar la respuesta de la clave ${String(id)}`, error as Error);
    }
  }

  private async liberar(id: Types.ObjectId): Promise<void> {
    try {
      await this.claves.deleteOne({ _id: id });
    } catch (error) {
      this.logger.error(`No se pudo liberar la clave ${String(id)}`, error as Error);
    }
  }
}

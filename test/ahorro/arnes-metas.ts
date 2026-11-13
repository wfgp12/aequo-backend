import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AhorroModule } from '../../src/ahorro/ahorro.module.js';
import { MetaAhorro, MetaAhorroSchema } from '../../src/ahorro/meta-ahorro.schema.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { FIREBASE_AUTH } from '../../src/auth/firebase-auth.provider.js';
import { TokenService } from '../../src/auth/token.service.js';
import { Categoria } from '../../src/categorias/categoria.schema.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../comun/ayudas.js';
import { ColeccionEnMemoria, type Doc, IdempotenciasEnMemoria } from '../comun/coleccion-memoria.js';
import { CategoriasEnMemoria, TransaccionesEnMemoria } from './colecciones-memoria.js';

/**
 * Arnés de las pruebas de integración del CRUD de metas de ahorro (paquete 4.1.2): la aplicación real de Nest con el
 * guard de sesión real, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB reemplazado por
 * colecciones en memoria. Vive en test/ (no es producción ni una prueba): lo comparten los archivos *.integration.spec.ts.
 */

export { IdempotenciasEnMemoria, OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID };
export { mensajeDeCampo, mensajeMencionaCampo } from '../comun/ayudas.js';

export const MENSAJES = {
  noEncontrada: 'Meta de ahorro no encontrada',
  duplicada: 'Ya existe una meta de ahorro para ese mes',
  conAhorro: 'No se puede eliminar una meta que ya tiene ahorro registrado',
};

export const CLAVES_DE_UNA_META = ['actualizadaEn', 'ahorroReal', 'creadaEn', 'id', 'periodo', 'tipoMeta', 'valorObjetivo'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Lo que devuelve la API por cada meta; `parcial` fija los campos que importan en cada prueba. */
export const metaEsperada = (parcial: Record<string, unknown> = {}) => ({
  id: expect.stringMatching(/^[0-9a-f]{24}$/),
  tipoMeta: expect.any(String),
  valorObjetivo: expect.any(Number),
  periodo: expect.stringMatching(/^\d{4}-\d{2}$/),
  ahorroReal: expect.any(Number),
  creadaEn: expect.stringMatching(FECHA_ISO),
  actualizadaEn: expect.stringMatching(FECHA_ISO),
  ...parcial,
});

// ---------------------------------------------------------------------------------------------------------------------
// Colección de metas en memoria
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Colección `metasahorro` en memoria (ver `../comun/coleccion-memoria.ts`), con su índice único `{ usuarioId, periodo }`
 * (error E11000, código 11000), que es lo que frena a la segunda de dos peticiones simultáneas.
 */
export class MetasEnMemoria extends ColeccionEnMemoria {
  constructor() {
    super(MetaAhorroSchema, 'MetaAhorro', [
      {
        nombre: 'usuarioId_1_periodo_1',
        clave: (registro: Doc) => `${String(registro.usuarioId)}|${(registro.periodo as Date).getTime()}`,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación de prueba y atajos HTTP
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosDeMeta {
  tipoMeta?: string;
  valorObjetivo?: number;
  /** `YYYY-MM`. */
  periodo?: string;
  ahorroReal?: number;
}

export interface Entorno {
  app: INestApplication;
  metas: MetasEnMemoria;
  claves: IdempotenciasEnMemoria;
  /** Token del usuario A (USUARIO_ID). */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** POST /ahorro/metas. `token: null` = sin sesión. */
  crear(cuerpo: unknown, opciones?: { token?: string | null; clave?: string }): request.Test;
  /** GET /ahorro/metas con una query opcional (`'desde=2026-09'`). */
  listar(consulta?: string, token?: string | null): request.Test;
  obtener(id: string, token?: string | null): request.Test;
  editar(id: string, cuerpo: unknown, token?: string | null): request.Test;
  eliminar(id: string, token?: string | null): request.Test;
  /** Inserta una meta directo en la base (sin pasar por la API) y devuelve su id. */
  sembrar(datos?: DatosDeMeta, usuarioId?: string): Promise<string>;
  /** El documento guardado con ese id, o `undefined` si no existe. */
  guardada(id: string): Doc | undefined;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntorno(): Entorno {
  const entorno = {} as Entorno;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const metas = new MetasEnMemoria();
    const claves = new IdempotenciasEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, AhorroModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(MetaAhorro.name))
      .useValue(metas)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      // El progreso (4.3.1) lee transacciones: el módulo de ahorro importa el de reportes, que registra estos dos modelos.
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(new TransaccionesEnMemoria())
      // 5.2.3: CategoriasModule registra también el modelo CompraCredito (reasigna sus compras al eliminar una categoría).
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue({})
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(new CategoriasEnMemoria())
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre. Si no, supertest levanta uno por petición y el primero que
    // termina lo cierra: con peticiones simultáneas, las demás se cortan (ECONNRESET en Linux; en Windows no se nota).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const token = tokens.generar(USUARIO_ID);
    const conSesion = (peticion: request.Test, quien: string | null | undefined) =>
      quien === null ? peticion : peticion.set('Authorization', `Bearer ${quien ?? token}`);

    Object.assign(entorno, {
      app,
      metas,
      claves,
      token,
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      crear: (cuerpo: unknown, { token: quien, clave }: { token?: string | null; clave?: string } = {}) => {
        const peticion = conSesion(request(app.getHttpServer()).post('/ahorro/metas'), quien);
        if (clave !== undefined) peticion.set('Idempotency-Key', clave);
        return peticion.send(cuerpo as object);
      },
      listar: (consulta = '', quien?: string | null) =>
        conSesion(request(app.getHttpServer()).get(`/ahorro/metas${consulta ? `?${consulta}` : ''}`), quien),
      obtener: (id: string, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).get(`/ahorro/metas/${id}`), quien),
      editar: (id: string, cuerpo: unknown, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).patch(`/ahorro/metas/${id}`), quien).send(cuerpo as object),
      eliminar: (id: string, quien?: string | null) =>
        conSesion(request(app.getHttpServer()).delete(`/ahorro/metas/${id}`), quien),
      sembrar: async (datos: DatosDeMeta = {}, usuarioId = USUARIO_ID) => {
        const { tipoMeta = 'PORCENTAJE', valorObjetivo = 20, periodo = '2026-11', ahorroReal } = datos;
        const meta = await metas.create({
          usuarioId,
          tipoMeta,
          valorObjetivo,
          periodo: new Date(`${periodo}-01T00:00:00Z`),
          ...(ahorroReal === undefined ? {} : { ahorroReal }),
        });
        return meta.id;
      },
      guardada: (id: string) => metas.docs.find((registro) => String(registro._id) === id),
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.unstubAllEnvs();
  });

  return entorno;
}

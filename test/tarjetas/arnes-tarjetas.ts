import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module.js';
import { FIREBASE_AUTH } from '../../src/auth/firebase-auth.provider.js';
import { TokenService } from '../../src/auth/token.service.js';
import { Categoria } from '../../src/categorias/categoria.schema.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { CargoRecurrente } from '../../src/tarjetas/cargo-recurrente.schema.js';
import { TarjetaCredito } from '../../src/tarjetas/tarjeta-credito.schema.js';
import { TarjetasModule } from '../../src/tarjetas/tarjetas.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { CategoriasEnMemoria, TransaccionesEnMemoria } from '../ahorro/colecciones-memoria.js';
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../comun/ayudas.js';
import { type ColeccionEnMemoria, type Doc, IdempotenciasEnMemoria } from '../comun/coleccion-memoria.js';
import { CargosEnMemoria, TarjetasEnMemoria } from './colecciones-tarjetas.js';

/**
 * Arnés de las pruebas de integración del CRUD de tarjetas y cargos fijos (paquete 5.1.2): la aplicación real de Nest
 * con el guard de sesión real, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB reemplazado por
 * colecciones en memoria (`../comun/coleccion-memoria.ts`). Las pruebas esperan `TarjetasModule` en
 * `src/tarjetas/tarjetas.module.ts`, con los modelos `TarjetaCredito`, `CargoRecurrente`, `Transaccion` e `Idempotencia`
 * resolubles por `getModelToken(<Clase>.name)`. Vive en test/ (no es producción ni una prueba).
 */

export { IdempotenciasEnMemoria, OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID };
export { CargosEnMemoria, TarjetasEnMemoria } from './colecciones-tarjetas.js';
export { mensajeDeCampo, mensajeMencionaCampo } from '../comun/ayudas.js';

const ObjectId = mongoose.Types.ObjectId;

export const MENSAJES = {
  tarjetaNoEncontrada: 'Tarjeta no encontrada',
  cargoNoEncontrado: 'Cargo fijo no encontrado',
  nombreDuplicado: 'Ya existe una tarjeta con ese nombre',
  conPagos: 'No se puede eliminar una tarjeta que ya tiene pagos registrados',
};

export const CLAVES_DE_UNA_TARJETA = ['actualizadaEn', 'creadaEn', 'cuotaUnicaSinInteres', 'id', 'nombre', 'tasaEA'];
export const CLAVES_DE_UN_CARGO = ['activo', 'actualizadaEn', 'creadaEn', 'descripcion', 'id', 'tarjetaId', 'valor'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ID = /^[0-9a-f]{24}$/;

/** Lo que devuelve la API por cada tarjeta; `parcial` fija los campos que importan en cada prueba. */
export const tarjetaEsperada = (parcial: Record<string, unknown> = {}) => ({
  id: expect.stringMatching(ID),
  nombre: expect.any(String),
  tasaEA: expect.any(Number),
  cuotaUnicaSinInteres: expect.any(Boolean),
  creadaEn: expect.stringMatching(FECHA_ISO),
  actualizadaEn: expect.stringMatching(FECHA_ISO),
  ...parcial,
});

/** Lo que devuelve la API por cada cargo fijo. */
export const cargoEsperado = (parcial: Record<string, unknown> = {}) => ({
  id: expect.stringMatching(ID),
  tarjetaId: expect.stringMatching(ID),
  descripcion: expect.any(String),
  valor: expect.any(Number),
  activo: expect.any(Boolean),
  creadaEn: expect.stringMatching(FECHA_ISO),
  actualizadaEn: expect.stringMatching(FECHA_ISO),
  ...parcial,
});

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación de prueba y atajos HTTP
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosDeTarjeta {
  nombre?: string;
  tasaEA?: number;
  cuotaUnicaSinInteres?: boolean;
}

export interface DatosDeCargo {
  descripcion?: string;
  valor?: number;
  activo?: boolean;
}

type Opciones = { token?: string | null; clave?: string };

export interface Entorno {
  app: INestApplication;
  tarjetas: TarjetasEnMemoria;
  cargos: CargosEnMemoria;
  transacciones: TransaccionesEnMemoria;
  claves: IdempotenciasEnMemoria;
  /** Token del usuario A (USUARIO_ID). */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** Todas las peticiones: `token: null` = sin sesión; `undefined` = el usuario A. */
  crearTarjeta(cuerpo: unknown, opciones?: Opciones): request.Test;
  listarTarjetas(consulta?: string, token?: string | null): request.Test;
  obtenerTarjeta(id: string, token?: string | null): request.Test;
  editarTarjeta(id: string, cuerpo: unknown, token?: string | null): request.Test;
  eliminarTarjeta(id: string, token?: string | null): request.Test;
  crearCargo(tarjetaId: string, cuerpo: unknown, opciones?: Opciones): request.Test;
  listarCargos(tarjetaId: string, consulta?: string, token?: string | null): request.Test;
  obtenerCargo(tarjetaId: string, id: string, token?: string | null): request.Test;
  editarCargo(tarjetaId: string, id: string, cuerpo: unknown, token?: string | null): request.Test;
  eliminarCargo(tarjetaId: string, id: string, token?: string | null): request.Test;
  /** Inserta una tarjeta directo en la base (sin pasar por la API) y devuelve su id. Las fechas de creación van en orden. */
  sembrarTarjeta(datos?: DatosDeTarjeta, usuarioId?: string): Promise<string>;
  /** Inserta un cargo directo en la base y devuelve su id. Las fechas de creación van en orden de siembra. */
  sembrarCargo(tarjetaId: string, datos?: DatosDeCargo, usuarioId?: string): Promise<string>;
  /** Inserta un pago de tarjeta (transacción `PAGO_TARJETA` con `tarjetaId`) y devuelve su id. */
  sembrarPago(tarjetaId: string, usuarioId?: string): string;
  /** El documento guardado con ese id, o `undefined` si no existe. */
  tarjetaGuardada(id: string): Doc | undefined;
  cargoGuardado(id: string): Doc | undefined;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntorno(): Entorno {
  const entorno = {} as Entorno;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const tarjetas = new TarjetasEnMemoria();
    const cargos = new CargosEnMemoria();
    const transacciones = new TransaccionesEnMemoria();
    const claves = new IdempotenciasEnMemoria();
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), AuthModule, TarjetasModule],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(TarjetaCredito.name))
      .useValue(tarjetas)
      .overrideProvider(getModelToken(CargoRecurrente.name))
      .useValue(cargos)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      // Por si el módulo de tarjetas importa el de transacciones, que registra también las categorías.
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
    const http = () => request(app.getHttpServer());
    const conSesion = (peticion: request.Test, quien: string | null | undefined) =>
      quien === null ? peticion : peticion.set('Authorization', `Bearer ${quien ?? token}`);
    const publicar = (ruta: string, cuerpo: unknown, { token: quien, clave }: Opciones = {}) => {
      const peticion = conSesion(http().post(ruta), quien);
      if (clave !== undefined) peticion.set('Idempotency-Key', clave);
      return peticion.send(cuerpo as object);
    };
    const consulta = (texto: string) => (texto ? `?${texto}` : '');

    // Fechas de creación crecientes (un segundo cada una) para que el orden "del más antiguo al más reciente" sea determinista.
    let segundos = 0;
    const fechar = (coleccion: ColeccionEnMemoria, id: string) => {
      const registro = coleccion.docs.find((doc) => String(doc._id) === id) as Doc;
      registro.createdAt = registro.updatedAt = new Date(Date.UTC(2026, 10, 1, 10, 0, segundos++));
    };

    Object.assign(entorno, {
      app,
      tarjetas,
      cargos,
      transacciones,
      claves,
      token,
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      crearTarjeta: (cuerpo: unknown, opciones?: Opciones) => publicar('/tarjetas', cuerpo, opciones),
      listarTarjetas: (texto = '', quien?: string | null) =>
        conSesion(http().get(`/tarjetas${consulta(texto)}`), quien),
      obtenerTarjeta: (id: string, quien?: string | null) => conSesion(http().get(`/tarjetas/${id}`), quien),
      editarTarjeta: (id: string, cuerpo: unknown, quien?: string | null) =>
        conSesion(http().patch(`/tarjetas/${id}`), quien).send(cuerpo as object),
      eliminarTarjeta: (id: string, quien?: string | null) => conSesion(http().delete(`/tarjetas/${id}`), quien),
      crearCargo: (tarjetaId: string, cuerpo: unknown, opciones?: Opciones) =>
        publicar(`/tarjetas/${tarjetaId}/cargos`, cuerpo, opciones),
      listarCargos: (tarjetaId: string, texto = '', quien?: string | null) =>
        conSesion(http().get(`/tarjetas/${tarjetaId}/cargos${consulta(texto)}`), quien),
      obtenerCargo: (tarjetaId: string, id: string, quien?: string | null) =>
        conSesion(http().get(`/tarjetas/${tarjetaId}/cargos/${id}`), quien),
      editarCargo: (tarjetaId: string, id: string, cuerpo: unknown, quien?: string | null) =>
        conSesion(http().patch(`/tarjetas/${tarjetaId}/cargos/${id}`), quien).send(cuerpo as object),
      eliminarCargo: (tarjetaId: string, id: string, quien?: string | null) =>
        conSesion(http().delete(`/tarjetas/${tarjetaId}/cargos/${id}`), quien),
      sembrarTarjeta: async (datos: DatosDeTarjeta = {}, usuarioId = USUARIO_ID) => {
        const { nombre = 'Visa', tasaEA = 0.2921, cuotaUnicaSinInteres } = datos;
        const tarjeta = await tarjetas.create({
          usuarioId,
          nombre,
          tasaEA,
          ...(cuotaUnicaSinInteres === undefined ? {} : { cuotaUnicaSinInteres }),
        });
        fechar(tarjetas, tarjeta.id);
        return tarjeta.id;
      },
      sembrarCargo: async (tarjetaId: string, datos: DatosDeCargo = {}, usuarioId = USUARIO_ID) => {
        const { descripcion = 'Netflix', valor = 38900, activo } = datos;
        const cargo = await cargos.create({
          usuarioId,
          tarjetaId,
          descripcion,
          valor,
          ...(activo === undefined ? {} : { activo }),
        });
        fechar(cargos, cargo.id);
        return cargo.id;
      },
      sembrarPago: (tarjetaId: string, usuarioId = USUARIO_ID) =>
        String(
          transacciones.agregar(usuarioId, {
            tipo: 'EGRESO',
            monto: 500000,
            clasificacionFlujo: 'PAGO_TARJETA',
            tarjetaId: new ObjectId(tarjetaId),
          })._id,
        ),
      tarjetaGuardada: (id: string) => tarjetas.docs.find((registro) => String(registro._id) === id),
      cargoGuardado: (id: string) => cargos.docs.find((registro) => String(registro._id) === id),
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.unstubAllEnvs();
  });

  return entorno;
}

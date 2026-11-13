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
import { CategoriasModule } from '../../src/categorias/categorias.module.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { ReportesModule } from '../../src/reportes/reportes.module.js';
import { CargoRecurrente } from '../../src/tarjetas/cargo-recurrente.schema.js';
import { TarjetaCredito } from '../../src/tarjetas/tarjeta-credito.schema.js';
import { TarjetasModule } from '../../src/tarjetas/tarjetas.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../../src/transacciones/transacciones.module.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { UsuariosController } from '../../src/usuarios/usuarios.controller.js';
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../comun/ayudas.js';
import {
  type ColeccionEnMemoria,
  type Doc,
  IdempotenciasEnMemoria,
} from '../comun/coleccion-memoria.js';
import {
  CategoriasRealesEnMemoria,
  ComprasEnMemoria,
  TransaccionesRealesEnMemoria,
} from './colecciones-compras.js';
import { CargosEnMemoria, TarjetasEnMemoria } from './colecciones-tarjetas.js';

/**
 * Arnés de las pruebas de integración de las compras y avances con tarjeta (paquete 5.2.3): la aplicación real de Nest
 * con el guard de sesión real, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB reemplazado por
 * colecciones en memoria sobre los esquemas reales (`../comun/coleccion-memoria.ts`). Monta, además de `TarjetasModule`,
 * los módulos con los que se relaciona el paquete: categorías (validar la categoría y reasignarla al eliminarla),
 * transacciones (el avance genera una; no se gestiona desde `/transacciones`), reportes (el avance es dinero recibido) y
 * el controlador de usuarios (eliminar la cuenta). Las pruebas esperan que los modelos `TarjetaCredito`,
 * `CargoRecurrente`, `CompraCredito`, `Transaccion`, `Categoria` e `Idempotencia` se puedan reemplazar por
 * `getModelToken(<Clase>.name)` (el de `CompraCredito` con el texto `'CompraCredito'`, también en `CategoriasModule`).
 * No ofrece una conexión de MongoDB: la atomicidad entre la compra y la transacción del avance no puede apoyarse en
 * una sesión de MongoDB. Vive en test/ (no es producción).
 */

export { IdempotenciasEnMemoria, OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID };
export { mensajeDeCampo, mensajeMencionaCampo } from '../comun/ayudas.js';

const ObjectId = mongoose.Types.ObjectId;

export const MENSAJES = {
  tarjetaNoEncontrada: 'Tarjeta no encontrada',
  compraNoEncontrada: 'Compra no encontrada',
  categoriaNoEncontrada: 'Categoría no encontrada',
  conPagos: 'No se puede eliminar una tarjeta que ya tiene pagos registrados',
  conCompras:
    'No se puede eliminar una tarjeta que ya tiene compras registradas',
};

export const error404 = (message: string) => ({
  statusCode: 404,
  message,
  error: 'Not Found',
});
export const error409 = (message: string) => ({
  statusCode: 409,
  message,
  error: 'Conflict',
});

/** Los campos que devuelve la API por cada compra o avance (sin `usuarioId`, `_id` ni `__v`). */
export const CLAVES_DE_UNA_COMPRA = [
  'actualizadaEn',
  'categoriaId',
  'creadaEn',
  'cuota',
  'cuotaUnicaSinInteres',
  'cuotas',
  'descripcion',
  'fecha',
  'id',
  'mesUltimoPago',
  'primerPago',
  'tarjetaId',
  'tasaEAAplicada',
  'tipo',
  'valor',
];

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ID = /^[0-9a-f]{24}$/;

/** Lo que devuelve la API por cada compra; `parcial` fija los campos que importan en cada prueba. */
export const compraEsperada = (parcial: Record<string, unknown> = {}) => ({
  id: expect.stringMatching(ID),
  tarjetaId: expect.stringMatching(ID),
  categoriaId: expect.stringMatching(ID),
  tipo: expect.any(String),
  descripcion: expect.any(String),
  valor: expect.any(Number),
  cuotas: expect.any(Number),
  fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  primerPago: expect.stringMatching(/^\d{4}-\d{2}$/),
  mesUltimoPago: expect.stringMatching(/^\d{4}-\d{2}$/),
  tasaEAAplicada: expect.any(Number),
  cuotaUnicaSinInteres: expect.any(Boolean),
  cuota: expect.any(Number),
  creadaEn: expect.stringMatching(FECHA_ISO),
  actualizadaEn: expect.stringMatching(FECHA_ISO),
  ...parcial,
});

/** Cuota de la compra de referencia de la hoja del promotor ($1.254.700, 12 cuotas, 29,21 % E.A.). */
export const CUOTA_REFERENCIA = 119802.1331718775;

/** `toBeCloseTo` con los decimales dados, comprobando antes que sea un número. */
export const cerca = (actual: unknown, esperado: number, decimales = 4) => {
  expect(typeof actual).toBe('number');
  expect(actual as number).toBeCloseTo(esperado, decimales);
};

/** Fecha de calendario `YYYY-MM-DD` como se guarda: medianoche UTC. */
export const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

/** El documento sin las marcas de tiempo: para comparar «como estaba» aunque se haya reescrito. */
export const sinMarcas = (doc: Doc) => {
  const { createdAt: _creada, updatedAt: _actualizada, ...resto } = doc;
  return JSON.parse(JSON.stringify(resto));
};

/** Una copia profunda de la colección, sin marcas de tiempo, para comparar antes y después. */
export const instantanea = (coleccion: ColeccionEnMemoria) =>
  coleccion.docs.map(sinMarcas);

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación de prueba y atajos HTTP
// ---------------------------------------------------------------------------------------------------------------------

export interface Opciones {
  /** `null` = sin sesión; `undefined` = el usuario A. */
  token?: string | null;
  /** Valor del header `Idempotency-Key`. */
  clave?: string;
  /** Valor del header `X-Zona-Horaria`. */
  zona?: string;
}

export interface DatosDeTarjeta {
  nombre?: string;
  tasaEA?: number;
  cuotaUnicaSinInteres?: boolean;
}

export interface EntornoCompras {
  app: INestApplication;
  tarjetas: TarjetasEnMemoria;
  cargos: CargosEnMemoria;
  compras: ComprasEnMemoria;
  transacciones: TransaccionesRealesEnMemoria;
  categorias: CategoriasRealesEnMemoria;
  claves: IdempotenciasEnMemoria;
  /** Token del usuario A (USUARIO_ID). Se vuelve a emitir con `hoyEs`. */
  token: string;
  /** Token del usuario B (OTRO_USUARIO_ID). */
  tokenOtro: string;
  /** Categorías generales de egresos («Hogar», «Alimentación» y la de respaldo «Otros egresos») y de ingresos. */
  hogar: Doc;
  alimentacion: Doc;
  otrosEgresos: Doc;
  salario: Doc;
  otrosIngresos: Doc;
  /** `{ descripcion: 'Televisor', categoriaId: <Hogar>, valor: 1254700, cuotas: 12, primerPago: '2026-12', fecha: '2026-11-10' }`. */
  compraBase(cambios?: Record<string, unknown>): Record<string, unknown>;
  /** `{ valor: 500000, cuotas: 6, primerPago: '2026-12', fecha: '2026-11-10' }`. */
  avanceBase(cambios?: Record<string, unknown>): Record<string, unknown>;
  crearCompra(
    tarjetaId: string,
    cuerpo: unknown,
    opciones?: Opciones,
  ): request.Test;
  crearAvance(
    tarjetaId: string,
    cuerpo: unknown,
    opciones?: Opciones,
  ): request.Test;
  listarCompras(
    tarjetaId: string,
    consulta?: string,
    opciones?: Opciones,
  ): request.Test;
  obtenerCompra(
    tarjetaId: string,
    id: string,
    opciones?: Opciones,
  ): request.Test;
  editarCompra(
    tarjetaId: string,
    id: string,
    cuerpo: unknown,
    opciones?: Opciones,
  ): request.Test;
  eliminarCompra(
    tarjetaId: string,
    id: string,
    opciones?: Opciones,
  ): request.Test;
  editarTarjeta(id: string, cuerpo: unknown, opciones?: Opciones): request.Test;
  eliminarTarjeta(id: string, opciones?: Opciones): request.Test;
  listarTransacciones(opciones?: Opciones): request.Test;
  editarTransaccion(
    id: string,
    cuerpo: unknown,
    opciones?: Opciones,
  ): request.Test;
  eliminarTransaccion(id: string, opciones?: Opciones): request.Test;
  eliminarCategoria(id: string, opciones?: Opciones): request.Test;
  /** `GET /reportes/periodo` con la query opcional (`'mes=2026-11'`). */
  periodo(consulta?: string, opciones?: Opciones): request.Test;
  /** `DELETE /usuarios/me`. */
  eliminarCuenta(opciones?: Opciones): request.Test;
  /** Fija «hoy» (solo `Date`) y vuelve a emitir las sesiones para que sean coherentes con el reloj simulado. */
  hoyEs(iso: string): void;
  /** Inserta una tarjeta directo en la base y devuelve su id. Las fechas de creación van en orden de siembra. */
  sembrarTarjeta(datos?: DatosDeTarjeta, usuarioId?: string): Promise<string>;
  /** Inserta un cargo fijo directo en la base y devuelve su id. */
  sembrarCargo(tarjetaId: string, usuarioId?: string): Promise<string>;
  /** Inserta una categoría (general si `usuarioId` es `null`) y la devuelve. */
  sembrarCategoria(
    nombre: string,
    tipo: 'EGRESO' | 'INGRESO',
    usuarioId: string | null,
  ): Promise<Doc>;
  /**
   * Inserta una compra directo en la base y devuelve su id. Por defecto es la compra base del usuario A en «Hogar»,
   * con la tasa 0,2921. Las fechas de creación van en orden de siembra.
   */
  sembrarCompra(
    tarjetaId: string,
    datos?: Doc,
    usuarioId?: string,
  ): Promise<string>;
  /** Inserta un pago de tarjeta (transacción `PAGO_TARJETA` con `tarjetaId`) y devuelve su id. */
  sembrarPago(tarjetaId: string, usuarioId?: string): Promise<string>;
  /** Inserta una transacción ordinaria (un egreso en «Hogar» de $1.000) y devuelve su id. */
  sembrarTransaccion(datos?: Doc, usuarioId?: string): Promise<string>;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntornoCompras(): EntornoCompras {
  const entorno = {} as EntornoCompras;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const tarjetas = new TarjetasEnMemoria();
    const cargos = new CargosEnMemoria();
    const compras = new ComprasEnMemoria();
    const transacciones = new TransaccionesRealesEnMemoria();
    const categorias = new CategoriasRealesEnMemoria();
    const claves = new IdempotenciasEnMemoria();
    // Las generales se siembran antes de arrancar la app: así la siembra del arranque (CategoriasSemilla) no agrega otras.
    const sembrarCategoria = (
      nombre: string,
      tipo: 'EGRESO' | 'INGRESO',
      usuarioId: string | null,
      extra: Doc = {},
    ) =>
      categorias.create({
        usuarioId: usuarioId ? new ObjectId(usuarioId) : null,
        nombre,
        tipo,
        esPredeterminada: usuarioId === null,
        esRespaldo: false,
        ...extra,
      });
    const hogar = await sembrarCategoria('Hogar', 'EGRESO', null);
    const alimentacion = await sembrarCategoria('Alimentación', 'EGRESO', null);
    const otrosEgresos = await sembrarCategoria(
      'Otros egresos',
      'EGRESO',
      null,
      {
        esRespaldo: true,
      },
    );
    const salario = await sembrarCategoria('Salario', 'INGRESO', null);
    const otrosIngresos = await sembrarCategoria(
      'Otros ingresos',
      'INGRESO',
      null,
      {
        esRespaldo: true,
      },
    );

    // Lo que eliminarCuenta necesita de la conexión: los modelos registrados y su esquema (descubre solo los que declaran usuarioId).
    const modelos: Record<string, unknown> = {
      TarjetaCredito: tarjetas,
      CargoRecurrente: cargos,
      CompraCredito: compras,
      Transaccion: transacciones,
      Categoria: categorias,
    };
    const usuarios = {
      schema: new mongoose.Schema({ firebaseUid: String }),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
      db: {
        modelNames: () => ['Usuario', ...Object.keys(modelos)],
        model: (nombre: string) =>
          nombre === 'Usuario' ? usuarios : modelos[nombre],
      },
    };

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        TarjetasModule,
        CategoriasModule,
        TransaccionesModule,
        ReportesModule,
      ],
      controllers: [UsuariosController],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue(usuarios)
      .overrideProvider(getModelToken(TarjetaCredito.name))
      .useValue(tarjetas)
      .overrideProvider(getModelToken(CargoRecurrente.name))
      .useValue(cargos)
      // El token usa el nombre de la clase como texto: es el que registran TarjetasModule y CategoriasModule.
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue(compras)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre (ver arnes-tarjetas.ts).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const http = () => request(app.getHttpServer());
    const enviar = (
      metodo: 'get' | 'post' | 'patch' | 'delete',
      ruta: string,
      cuerpo?: unknown,
      { token: quien, clave, zona }: Opciones = {},
    ) => {
      let peticion = http()[metodo](ruta);
      if (quien !== null) {
        peticion = peticion.set(
          'Authorization',
          `Bearer ${quien ?? entorno.token}`,
        );
      }
      if (clave !== undefined)
        peticion = peticion.set('Idempotency-Key', clave);
      if (zona !== undefined) peticion = peticion.set('X-Zona-Horaria', zona);
      return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
    };
    const consulta = (texto: string) => (texto ? `?${texto}` : '');

    // Fechas de creación crecientes (un segundo cada una) para que el orden de siembra sea determinista.
    let segundos = 0;
    const fechar = (coleccion: ColeccionEnMemoria, id: string) => {
      const registro = coleccion.docs.find(
        (doc) => String(doc._id) === id,
      ) as Doc;
      registro.createdAt = registro.updatedAt = new Date(
        Date.UTC(2026, 10, 1, 10, 0, segundos++),
      );
    };

    Object.assign(entorno, {
      app,
      tarjetas,
      cargos,
      compras,
      transacciones,
      categorias,
      claves,
      token: tokens.generar(USUARIO_ID),
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      hogar,
      alimentacion,
      otrosEgresos,
      salario,
      otrosIngresos,
      compraBase: (cambios: Record<string, unknown> = {}) => ({
        descripcion: 'Televisor',
        categoriaId: hogar.id,
        valor: 1254700,
        cuotas: 12,
        primerPago: '2026-12',
        fecha: '2026-11-10',
        ...cambios,
      }),
      avanceBase: (cambios: Record<string, unknown> = {}) => ({
        valor: 500000,
        cuotas: 6,
        primerPago: '2026-12',
        fecha: '2026-11-10',
        ...cambios,
      }),
      crearCompra: (tarjetaId: string, cuerpo: unknown, opciones?: Opciones) =>
        enviar('post', `/tarjetas/${tarjetaId}/compras`, cuerpo, opciones),
      crearAvance: (tarjetaId: string, cuerpo: unknown, opciones?: Opciones) =>
        enviar('post', `/tarjetas/${tarjetaId}/avances`, cuerpo, opciones),
      listarCompras: (tarjetaId: string, texto = '', opciones?: Opciones) =>
        enviar(
          'get',
          `/tarjetas/${tarjetaId}/compras${consulta(texto)}`,
          undefined,
          opciones,
        ),
      obtenerCompra: (tarjetaId: string, id: string, opciones?: Opciones) =>
        enviar(
          'get',
          `/tarjetas/${tarjetaId}/compras/${id}`,
          undefined,
          opciones,
        ),
      editarCompra: (
        tarjetaId: string,
        id: string,
        cuerpo: unknown,
        opciones?: Opciones,
      ) =>
        enviar(
          'patch',
          `/tarjetas/${tarjetaId}/compras/${id}`,
          cuerpo,
          opciones,
        ),
      eliminarCompra: (tarjetaId: string, id: string, opciones?: Opciones) =>
        enviar(
          'delete',
          `/tarjetas/${tarjetaId}/compras/${id}`,
          undefined,
          opciones,
        ),
      editarTarjeta: (id: string, cuerpo: unknown, opciones?: Opciones) =>
        enviar('patch', `/tarjetas/${id}`, cuerpo, opciones),
      eliminarTarjeta: (id: string, opciones?: Opciones) =>
        enviar('delete', `/tarjetas/${id}`, undefined, opciones),
      listarTransacciones: (opciones?: Opciones) =>
        enviar('get', '/transacciones', undefined, opciones),
      editarTransaccion: (id: string, cuerpo: unknown, opciones?: Opciones) =>
        enviar('patch', `/transacciones/${id}`, cuerpo, opciones),
      eliminarTransaccion: (id: string, opciones?: Opciones) =>
        enviar('delete', `/transacciones/${id}`, undefined, opciones),
      eliminarCategoria: (id: string, opciones?: Opciones) =>
        enviar('delete', `/categorias/${id}`, undefined, opciones),
      periodo: (texto = '', opciones?: Opciones) =>
        enviar(
          'get',
          `/reportes/periodo${consulta(texto)}`,
          undefined,
          opciones,
        ),
      eliminarCuenta: (opciones?: Opciones) =>
        enviar('delete', '/usuarios/me', undefined, opciones),
      hoyEs: (iso: string) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(iso));
        entorno.token = tokens.generar(USUARIO_ID);
        entorno.tokenOtro = tokens.generar(OTRO_USUARIO_ID);
      },
      sembrarTarjeta: async (
        datos: DatosDeTarjeta = {},
        usuarioId = USUARIO_ID,
      ) => {
        const {
          nombre = 'Visa',
          tasaEA = 0.2921,
          cuotaUnicaSinInteres,
        } = datos;
        const tarjeta = await tarjetas.create({
          usuarioId,
          nombre,
          tasaEA,
          ...(cuotaUnicaSinInteres === undefined
            ? {}
            : { cuotaUnicaSinInteres }),
        });
        fechar(tarjetas, tarjeta.id);
        return tarjeta.id;
      },
      sembrarCargo: async (tarjetaId: string, usuarioId = USUARIO_ID) => {
        const cargo = await cargos.create({
          usuarioId,
          tarjetaId,
          descripcion: 'Netflix',
          valor: 38900,
        });
        fechar(cargos, cargo.id);
        return cargo.id;
      },
      sembrarCategoria,
      sembrarCompra: async (
        tarjetaId: string,
        datos: Doc = {},
        usuarioId = USUARIO_ID,
      ) => {
        const compra = await compras.create({
          usuarioId,
          tarjetaId,
          categoriaId: hogar._id,
          tipo: 'COMPRA',
          descripcion: 'Televisor',
          valor: 1254700,
          cuotas: 12,
          fecha: dia('2026-11-10'),
          primerPago: dia('2026-12-01'),
          tasaEAAplicada: 0.2921,
          cuotaUnicaSinInteres: false,
          ...datos,
        });
        fechar(compras, compra.id);
        return compra.id;
      },
      sembrarPago: async (tarjetaId: string, usuarioId = USUARIO_ID) =>
        (
          await transacciones.create({
            usuarioId,
            tipo: 'EGRESO',
            monto: 500000,
            fecha: dia('2026-11-05'),
            metodoPago: 'TRANSFERENCIA',
            clasificacionFlujo: 'PAGO_TARJETA',
            tarjetaId,
          })
        ).id,
      sembrarTransaccion: async (datos: Doc = {}, usuarioId = USUARIO_ID) =>
        (
          await transacciones.create({
            usuarioId,
            tipo: 'EGRESO',
            monto: 1000,
            fecha: dia('2026-11-03'),
            categoriaId: hogar._id,
            metodoPago: 'EFECTIVO',
            descripcion: 'Mercado',
            clasificacionFlujo: 'ORDINARIO',
            ...datos,
          })
        ).id,
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  return entorno;
}

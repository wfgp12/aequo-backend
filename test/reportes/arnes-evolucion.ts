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
import { ReportesModule } from '../../src/reportes/reportes.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../../src/transacciones/transacciones.module.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { CategoriasEnMemoria, dia, type Doc, TransaccionesEnMemoria } from '../ahorro/colecciones-memoria.js';

/**
 * Arnés de las pruebas de integración de los reportes por meses (evolución y, después, comparación): la aplicación
 * real de Nest con el guard de sesión real, el ValidationPipe estricto y MongoDB reemplazado por colecciones en memoria
 * (transacciones y categorías de `../ahorro/colecciones-memoria.ts`, que soportan `find` y `aggregate` con `$match`,
 * `$group` —por un campo, por el mes con `$dateToString` `%Y-%m` o por un objeto compuesto— con `$sum`/`$min`/`$max`, y
 * `$sort`). Vive en test/ (no es producción).
 */

export const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
export const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
const SECRETO_JWT = 'secreto-solo-para-pruebas';
const ObjectId = mongoose.Types.ObjectId;

export { dia, type Doc };

/** `toBeCloseTo` con 4 decimales: los montos conservan la precisión completa, pero el orden de las sumas no importa. */
export const cerca = (actual: unknown, esperado: number, decimales = 4) => {
  expect(typeof actual).toBe('number');
  expect(actual as number).toBeCloseTo(esperado, decimales);
};

export interface OpcionesDePeticion {
  /** `null` = sin sesión; por defecto, la del usuario A. */
  token?: string | null;
  /** Valor del header `X-Zona-Horaria`. */
  zona?: string;
}

export interface EntornoEvolucion {
  app: INestApplication;
  transacciones: TransaccionesEnMemoria;
  categorias: CategoriasEnMemoria;
  /** Categoría general de egresos y de ingresos, para crear movimientos por la API. */
  categoriaEgreso: Doc;
  categoriaIngreso: Doc;
  /** Categorías generales de egresos que usan los «datos base». */
  hogar: Doc;
  alimentacion: Doc;
  transporte: Doc;
  /** Agrega una categoría (general si no se da `usuarioId`) y la devuelve. */
  categoria(nombre: string, tipo?: string, usuarioId?: string | null): Doc;
  /** Token del usuario A. Se vuelve a emitir con `hoyEs`. */
  token: string;
  /** Token del usuario B. */
  tokenOtro: string;
  /** `GET /reportes/evolucion` con la query opcional (`'desde=2026-09&hasta=2026-10'`). */
  evolucion(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `GET /reportes/periodo` con la query opcional. */
  periodo(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `GET /reportes/comparacion` con la query opcional (`'tipo=balance&desde=2026-09'`). */
  comparacion(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `GET /reportes/categorias` con la query opcional (`'mes=2026-09'`). */
  reporteCategorias(consulta?: string, opciones?: OpcionesDePeticion): request.Test;
  /** `POST /transacciones` (sin Idempotency-Key). */
  crearPorApi(cuerpo: unknown): request.Test;
  /** `PATCH /transacciones/:id`. */
  editarPorApi(id: string, cuerpo: unknown): request.Test;
  /** `DELETE /transacciones/:id`. */
  eliminarPorApi(id: string): request.Test;
  /** Fija "hoy" (solo `Date`) y vuelve a emitir las sesiones para que sean coherentes con el reloj simulado. */
  hoyEs(iso: string): void;
  ingreso(fecha: string, monto: number, usuarioId?: string): Doc;
  egreso(fecha: string, monto: number, usuarioId?: string, categoria?: Doc): Doc;
  pagoTarjeta(fecha: string, monto: number, usuarioId?: string): Doc;
  abonoDeuda(fecha: string, monto: number, usuarioId?: string): Doc;
  dineroRecibido(fecha: string, monto: number, usuarioId?: string): Doc;
  /**
   * Siembra los «datos base» de los criterios para el usuario A: julio (ingreso 3.000.000, egreso 1.000.000), agosto sin
   * movimientos, septiembre (ingresos 2.800.000 y 200.000, egresos 600.000 y 300.000, pago de tarjeta 119.802,13, abono
   * 200.000, préstamo 500.000) y octubre (ingreso 2.500.000, egreso 1.254.700) de 2026. Los egresos van a Hogar (julio),
   * Alimentación y Transporte (septiembre) y Alimentación (octubre).
   */
  sembrarDatosBase(usuarioId?: string): void;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntornoEvolucion(): EntornoEvolucion {
  const entorno = {} as EntornoEvolucion;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const transacciones = new TransaccionesEnMemoria();
    const categorias = new CategoriasEnMemoria();
    const categoriaEgreso = categorias.docs[0];
    const categoriaIngreso = { _id: new ObjectId(), usuarioId: null, nombre: 'Salario', tipo: 'INGRESO', esPredeterminada: true };
    categorias.docs.push(categoriaIngreso);
    const categoria = (nombre: string, tipo = 'EGRESO', usuarioId: string | null = null): Doc => {
      const doc = {
        _id: new ObjectId(),
        usuarioId: usuarioId ? new ObjectId(usuarioId) : null,
        nombre,
        tipo,
        esPredeterminada: usuarioId === null,
      };
      categorias.docs.push(doc);
      return doc;
    };
    const hogar = categoria('Hogar');
    const alimentacion = categoria('Alimentación');
    const transporte = categoria('Transporte');

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        TransaccionesModule,
        ReportesModule,
      ],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      // 5.2.3: CategoriasModule registra también el modelo CompraCredito (reasigna sus compras al eliminar una categoría).
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue({})
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue({})
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre. Si no, supertest levanta uno por petición y el primero que
    // termina lo cierra: con peticiones simultáneas, las demás se cortan (ECONNRESET en Linux; en Windows no se nota).
    await app.listen(0);

    const tokens = app.get(TokenService);
    const conSesion = (peticion: request.Test, { token, zona }: OpcionesDePeticion = {}) => {
      if (token !== null) peticion.set('Authorization', `Bearer ${token ?? entorno.token}`);
      if (zona !== undefined) peticion.set('X-Zona-Horaria', zona);
      return peticion;
    };
    const ruta = (base: string, consulta: string) => `${base}${consulta ? `?${consulta}` : ''}`;
    const movimiento = (usuarioId: string, fecha: string, monto: number, cambios: Doc) =>
      transacciones.agregar(usuarioId, { monto, fecha: dia(fecha), ...cambios });

    Object.assign(entorno, {
      app,
      transacciones,
      categorias,
      categoriaEgreso,
      categoriaIngreso,
      hogar,
      alimentacion,
      transporte,
      categoria,
      token: tokens.generar(USUARIO_ID),
      tokenOtro: tokens.generar(OTRO_USUARIO_ID),
      evolucion: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/reportes/evolucion', consulta)), opciones),
      periodo: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/reportes/periodo', consulta)), opciones),
      comparacion: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/reportes/comparacion', consulta)), opciones),
      reporteCategorias: (consulta = '', opciones?: OpcionesDePeticion) =>
        conSesion(request(app.getHttpServer()).get(ruta('/reportes/categorias', consulta)), opciones),
      crearPorApi: (cuerpo: unknown) =>
        conSesion(request(app.getHttpServer()).post('/transacciones')).send(cuerpo as object),
      editarPorApi: (id: string, cuerpo: unknown) =>
        conSesion(request(app.getHttpServer()).patch(`/transacciones/${id}`)).send(cuerpo as object),
      eliminarPorApi: (id: string) =>
        conSesion(request(app.getHttpServer()).delete(`/transacciones/${id}`)),
      hoyEs: (iso: string) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(iso));
        entorno.token = tokens.generar(USUARIO_ID);
        entorno.tokenOtro = tokens.generar(OTRO_USUARIO_ID);
      },
      ingreso: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, { tipo: 'INGRESO', categoriaId: categoriaIngreso._id }),
      egreso: (fecha: string, monto: number, usuarioId = USUARIO_ID, categoriaDelGasto: Doc = categoriaEgreso) =>
        movimiento(usuarioId, fecha, monto, { tipo: 'EGRESO', categoriaId: categoriaDelGasto._id }),
      pagoTarjeta: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'EGRESO',
          metodoPago: 'TRANSFERENCIA',
          clasificacionFlujo: 'PAGO_TARJETA',
          tarjetaId: new ObjectId(),
        }),
      abonoDeuda: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'EGRESO',
          clasificacionFlujo: 'ABONO_DEUDA',
          deudaId: new ObjectId(),
        }),
      dineroRecibido: (fecha: string, monto: number, usuarioId = USUARIO_ID) =>
        movimiento(usuarioId, fecha, monto, {
          tipo: 'INGRESO',
          clasificacionFlujo: 'DINERO_RECIBIDO',
          deudaId: new ObjectId(),
        }),
      sembrarDatosBase: (usuarioId = USUARIO_ID) => {
        entorno.ingreso('2026-07-05', 3_000_000, usuarioId);
        entorno.egreso('2026-07-12', 1_000_000, usuarioId, hogar);
        entorno.ingreso('2026-09-01', 2_800_000, usuarioId);
        entorno.ingreso('2026-09-15', 200_000, usuarioId);
        entorno.egreso('2026-09-03', 600_000, usuarioId, alimentacion);
        entorno.egreso('2026-09-10', 300_000, usuarioId, transporte);
        entorno.pagoTarjeta('2026-09-20', 119_802.13, usuarioId);
        entorno.abonoDeuda('2026-09-22', 200_000, usuarioId);
        entorno.dineroRecibido('2026-09-08', 500_000, usuarioId);
        entorno.ingreso('2026-10-01', 2_500_000, usuarioId);
        entorno.egreso('2026-10-18', 1_254_700, usuarioId, alimentacion);
      },
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  return entorno;
}

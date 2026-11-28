import { STATUS_CODES } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import request from 'supertest';
import { AhorroModule } from '../../src/ahorro/ahorro.module.js';
import { MetaAhorro } from '../../src/ahorro/meta-ahorro.schema.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { FIREBASE_AUTH } from '../../src/auth/firebase-auth.provider.js';
import { TokenService } from '../../src/auth/token.service.js';
import { Categoria } from '../../src/categorias/categoria.schema.js';
import { CategoriasModule } from '../../src/categorias/categorias.module.js';
import { ErroresModule } from '../../src/common/errores.module.js';
import { crearValidationPipe } from '../../src/common/validation-pipe.js';
import { DeudasModule } from '../../src/deudas/deudas.module.js';
import { Idempotencia } from '../../src/idempotencia/idempotencia.schema.js';
import { ReportesModule } from '../../src/reportes/reportes.module.js';
import { CargoRecurrente } from '../../src/tarjetas/cargo-recurrente.schema.js';
import { TarjetaCredito } from '../../src/tarjetas/tarjeta-credito.schema.js';
import { TarjetasModule } from '../../src/tarjetas/tarjetas.module.js';
import { Transaccion } from '../../src/transacciones/transaccion.schema.js';
import { TransaccionesModule } from '../../src/transacciones/transacciones.module.js';
import { Usuario } from '../../src/usuarios/usuario.schema.js';
import { UsuariosController } from '../../src/usuarios/usuarios.controller.js';
import { MetasEnMemoria } from '../ahorro/arnes-metas.js';
import { OTRO_USUARIO_ID, SECRETO_JWT, USUARIO_ID } from '../comun/ayudas.js';
import { type ColeccionEnMemoria, type Doc, IdempotenciasEnMemoria } from '../comun/coleccion-memoria.js';
import { DeudasEnMemoria } from '../deudas/arnes-deudas.js';
import {
  CategoriasRealesEnMemoria,
  ComprasEnMemoria,
  TransaccionesRealesEnMemoria,
} from '../tarjetas/colecciones-compras.js';
import { CargosEnMemoria, TarjetasEnMemoria } from '../tarjetas/colecciones-tarjetas.js';

/**
 * Arnés de las pruebas del formato de errores (paquete 8.3.8): la aplicación real de Nest con todos los módulos de la
 * API, `ErroresModule`, el guard de sesión, el ValidationPipe estricto y el interceptor de idempotencia, y MongoDB y
 * Firebase reemplazados. Los arneses de cada módulo siguen sin `ErroresModule` (decisión D7). Vive en test/.
 */

export { OTRO_USUARIO_ID, USUARIO_ID };
export { type Doc, errorDeClaveDuplicada } from '../comun/coleccion-memoria.js';

const ObjectId = mongoose.Types.ObjectId;

/** El cuerpo completo que debe tener un error: sin `action`, la propiedad no aparece. */
export const cuerpoDeError = (statusCode: number, message: unknown, code: string, action?: string) => ({
  statusCode,
  error: STATUS_CODES[statusCode],
  message,
  code,
  ...(action === undefined ? {} : { action }),
});

export const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

export type Metodo = 'get' | 'post' | 'patch' | 'delete';

export interface Opciones {
  /** `null` = sin sesión; `undefined` = el usuario A. */
  token?: string | null;
  cabeceras?: Record<string, string>;
}

export interface EntornoErrores {
  app: INestApplication;
  categorias: CategoriasRealesEnMemoria;
  transacciones: TransaccionesRealesEnMemoria;
  compras: ComprasEnMemoria;
  tarjetas: TarjetasEnMemoria;
  cargos: CargosEnMemoria;
  metas: MetasEnMemoria;
  deudas: DeudasEnMemoria;
  claves: IdempotenciasEnMemoria;
  verifyIdToken: ReturnType<typeof vi.fn>;
  /** Categoría general «Hogar» (egresos). */
  hogar: Doc;
  token: string;
  /** Un token del usuario A que ya venció. */
  tokenVencido(): string;
  /** Una petición HTTP; `cuerpo` como texto se envía tal cual (con el `Content-Type` que pongan las cabeceras). */
  enviar(metodo: Metodo, ruta: string, cuerpo?: unknown, opciones?: Opciones): request.Test;
  /** Inserta un documento directo en la base (del usuario A salvo que `datos.usuarioId` diga otra cosa). */
  sembrar(coleccion: ColeccionEnMemoria, datos: Doc): Promise<string>;
  sembrarTarjeta(datos?: Doc): Promise<string>;
  sembrarCategoria(nombre: string, datos?: Doc): Promise<string>;
  sembrarTransaccion(datos?: Doc): Promise<string>;
  sembrarCompra(tarjetaId: string, datos?: Doc): Promise<string>;
  sembrarDeuda(datos?: Doc): Promise<string>;
  /** Un préstamo ($500.000) de la deuda, como lo guarda el POST. */
  sembrarPrestamo(deudaId: string, datos?: Doc): Promise<string>;
  /** Copia de todas las colecciones sin marcas de tiempo, para comprobar que los datos no cambian. */
  foto(): unknown;
}

/** Monta una aplicación nueva antes de cada prueba y la cierra después. Devuelve el entorno (se rellena en `beforeEach`). */
export function usarEntornoErrores(): EntornoErrores {
  const entorno = {} as EntornoErrores;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
    const categorias = new CategoriasRealesEnMemoria();
    const transacciones = new TransaccionesRealesEnMemoria();
    const compras = new ComprasEnMemoria();
    const tarjetas = new TarjetasEnMemoria();
    const cargos = new CargosEnMemoria();
    const metas = new MetasEnMemoria();
    const deudas = new DeudasEnMemoria();
    const claves = new IdempotenciasEnMemoria();
    const verifyIdToken = vi.fn();

    const sembrar = async (coleccion: ColeccionEnMemoria, datos: Doc) =>
      (await coleccion.create({ usuarioId: new ObjectId(USUARIO_ID), ...datos })).id;
    const sembrarCategoria = (nombre: string, datos: Doc = {}) =>
      sembrar(categorias, { nombre, tipo: 'EGRESO', esPredeterminada: false, esRespaldo: false, ...datos });
    const general = { usuarioId: null, esPredeterminada: true };
    // Con las generales ya sembradas, la siembra del arranque no agrega otras.
    const hogarId = await sembrarCategoria('Hogar', general);
    await sembrarCategoria('Otros egresos', { ...general, esRespaldo: true });
    await sembrarCategoria('Otros ingresos', { ...general, tipo: 'INGRESO', esRespaldo: true });
    const hogar: Doc = { _id: new ObjectId(hogarId), id: hogarId };

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        ErroresModule,
        AuthModule,
        CategoriasModule,
        TransaccionesModule,
        ReportesModule,
        AhorroModule,
        TarjetasModule,
        DeudasModule,
      ],
      controllers: [UsuariosController],
    })
      // Ningún usuario guardado: `GET /usuarios/me` es el de un usuario que ya no existe.
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({ findById: async () => null })
      .overrideProvider(getModelToken(Categoria.name))
      .useValue(categorias)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue(transacciones)
      .overrideProvider(getModelToken('CompraCredito'))
      .useValue(compras)
      .overrideProvider(getModelToken(TarjetaCredito.name))
      .useValue(tarjetas)
      .overrideProvider(getModelToken(CargoRecurrente.name))
      .useValue(cargos)
      .overrideProvider(getModelToken(MetaAhorro.name))
      .useValue(metas)
      .overrideProvider(getModelToken('Deuda'))
      .useValue(deudas)
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue(claves)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({ verifyIdToken })
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(crearValidationPipe());
    // El servidor escucha una sola vez, en un puerto libre (ver arnes-tarjetas.ts).
    await app.listen(0);

    const token = app.get(TokenService).generar(USUARIO_ID);
    const sembrarTransaccion = (datos: Doc = {}) =>
      sembrar(transacciones, {
        tipo: 'EGRESO',
        monto: 1000,
        fecha: dia('2026-11-03'),
        categoriaId: hogar._id,
        metodoPago: 'EFECTIVO',
        clasificacionFlujo: 'ORDINARIO',
        ...datos,
      });
    const sinMarcas = ({ createdAt: _creada, updatedAt: _actualizada, ...resto }: Doc) => resto;

    Object.assign(entorno, {
      app,
      categorias,
      transacciones,
      compras,
      tarjetas,
      cargos,
      metas,
      deudas,
      claves,
      verifyIdToken,
      hogar,
      token,
      tokenVencido: () => app.get(JwtService).sign({ sub: USUARIO_ID }, { expiresIn: -60 }),
      enviar: (metodo: Metodo, ruta: string, cuerpo?: unknown, { token: quien, cabeceras }: Opciones = {}) => {
        let peticion = request(app.getHttpServer())[metodo](ruta);
        if (quien !== null) peticion = peticion.set('Authorization', `Bearer ${quien ?? token}`);
        if (cabeceras) peticion = peticion.set(cabeceras);
        return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
      },
      sembrar,
      sembrarCategoria,
      sembrarTarjeta: (datos: Doc = {}) => sembrar(tarjetas, { nombre: 'Visa', tasaEA: 0.2921, ...datos }),
      sembrarTransaccion,
      sembrarCompra: (tarjetaId: string, datos: Doc = {}) =>
        sembrar(compras, {
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
        }),
      sembrarDeuda: (datos: Doc = {}) => sembrar(deudas, { acreedor: 'Juan Pérez', ...datos }),
      sembrarPrestamo: (deudaId: string, datos: Doc = {}) =>
        sembrarTransaccion({
          tipo: 'INGRESO',
          monto: 500000,
          categoriaId: null,
          clasificacionFlujo: 'DINERO_RECIBIDO',
          deudaId: new ObjectId(deudaId),
          ...datos,
        }),
      foto: () =>
        JSON.parse(
          JSON.stringify(
            [categorias, transacciones, compras, tarjetas, cargos, metas, deudas].map((coleccion) =>
              coleccion.docs.map(sinMarcas),
            ),
          ),
        ),
    });
  });

  afterEach(async () => {
    await entorno.app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  return entorno;
}

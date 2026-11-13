import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module.js';
import { FIREBASE_AUTH } from '../auth/firebase-auth.provider.js';
import { Categoria } from '../categorias/categoria.schema.js';
import { Idempotencia } from '../idempotencia/idempotencia.schema.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { Usuario } from '../usuarios/usuario.schema.js';
import { SECRETO_JWT } from '../../test/comun/ayudas.js';
import { CargoRecurrente } from './cargo-recurrente.schema.js';
import { TarjetaCredito } from './tarjeta-credito.schema.js';
import { TarjetasModule } from './tarjetas.module.js';

// Paquete 5.2.1 (RF-26, RF-28): el módulo de tarjetas registra el modelo de las compras.
describe('TarjetasModule: registro del modelo CompraCredito', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', SECRETO_JWT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CA-RF26-30 TarjetasModule registra el modelo CompraCredito con el nombre de su clase', async () => {
    const comprasEnMemoria = { marca: 'compras-en-memoria' };
    // El token se arma con el texto, no con la clase, para no depender del archivo del esquema. Si el módulo no registra
    // el modelo, reemplazar un proveedor inexistente no hace nada y `get` falla porque no lo encuentra.
    const tokenCompras = getModelToken('CompraCredito');
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        AuthModule,
        TarjetasModule,
      ],
    })
      .overrideProvider(getModelToken(Usuario.name))
      .useValue({})
      .overrideProvider(getModelToken(TarjetaCredito.name))
      .useValue({})
      .overrideProvider(getModelToken(CargoRecurrente.name))
      .useValue({})
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue({})
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue({})
      .overrideProvider(getModelToken(Categoria.name))
      .useValue({})
      .overrideProvider(tokenCompras)
      .useValue(comprasEnMemoria)
      .overrideProvider(FIREBASE_AUTH)
      .useValue({})
      .compile();

    expect(() => modulo.get(tokenCompras, { strict: false })).not.toThrow();
    expect(modulo.get(tokenCompras, { strict: false })).toBe(comprasEnMemoria);

    await modulo.close();
  });
});
